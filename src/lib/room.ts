import { answers, earnJokers, mergeWritten, newRound, packSecret, pick, spendJokers, uniqueName, wordHint, type Round, type Secret, type Text } from "./game.ts";
import { CATEGORIES, DEFAULT_CATS, LANGS, type Lang } from "./i18n.ts";
import type { Store } from "./store.ts";
import { cachedExplanation, cachedReview, explainWord, reviewWords } from "./ai.ts";
import { aiEnabled, allowAi } from "./rateLimit.ts";
import { count, later } from "./metrics.ts";
import type { Draft, Review } from "./game.ts";
import type { RoundLog } from "./stats.ts";
import { tally } from "./vote.ts";

const TTL = 60 * 60 * 24; // rooms vanish a day after the last write
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I lookalikes
export const CODE_LENGTH = 5; // 32^5 ≈ 33 million codes; with the join limit, guessing a live room is hopeless
export const MAX_PLAYERS = 20;

export type Settings = {
  imposterCount: number; mode: "packs" | "custom"; cats: string[]; perPlayer: number; hint: boolean; joker: boolean; ai: boolean;
  lang: Lang; rounds: number; guess: boolean; earlyVote: boolean;
};
export type RoomPhase = "lobby" | "write" | "reveal" | "discuss" | "vote" | "tie" | "guess" | "result";
type Member = { id: string; name: string; token: string; at: number };
type Room = {
  code: string;
  hostId: string;
  settings: Settings;
  phase: RoomPhase;
  ids: string[]; // player order, frozen when the game starts; indices below refer to it
  round: Round | null;
  pool: Secret[];
  used: string[];
  accused: number | null;
  writeNo: number;
  voteNo: number;
  roundNo: number;
  spoken?: number; // discuss: players who said their word in this word round
  wordRound?: number;
  guess?: { text: string; correct: boolean } | null; // caught imposter's guess (guess option)
  history?: RoundLog[]; // finished rounds, for the stats screen (optional: rooms created before stats)
  jokers?: string[]; // member ids holding a joker
  aiUser?: string; // host's account: AI calls in this room count against it
};

export class RoomError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "started" | "full" | "bad_request" | "rate_limited",
    public status = code === "not_found" ? 404 : code === "forbidden" ? 403 : code === "bad_request" ? 400 : code === "rate_limited" ? 429 : 409,
  ) {
    super(code);
  }
}

const k = (code: string) => ({ room: `room:${code}`, members: `room:${code}:members` });
const cleanName = (n: unknown) => (typeof n === "string" ? n.trim().slice(0, 24) : "");

function cleanSettings(s: Partial<Settings>): Settings {
  const cats = (s.cats ?? []).filter((id) => CATEGORIES.some((c) => c.id === id));
  return {
    imposterCount: Math.max(1, Math.min(10, Math.round(Number(s.imposterCount) || 1))),
    mode: s.mode === "custom" ? "custom" : "packs",
    cats: cats.length ? cats : DEFAULT_CATS,
    perPlayer: Math.max(1, Math.min(10, Math.round(Number(s.perPlayer) || 2))),
    hint: s.hint !== false,
    joker: s.joker === true && s.hint === false, // jokers only when imposters get no clue
    ai: s.ai !== false, // the host's "AI help" setting: AI checks for written words
    lang: LANGS.some((l) => l.id === s.lang) ? s.lang! : "en", // one language for the whole room
    rounds: Math.max(1, Math.min(30, Math.round(Number(s.rounds) || 5))),
    guess: s.guess === true, // a caught imposter may still win by guessing the word
    earlyVote: s.earlyVote === true, // pick (and change) a suspect during the talk; the result shows how opinions moved
  };
}

async function load(db: Store, code: string) {
  const room = await db.get<Room>(k(code).room);
  if (!room) throw new RoomError("not_found");
  // host first, then join order; same-millisecond joins broken by id so every read agrees
  const first = (m: Member) => (m.id === room.hostId ? 0 : 1);
  const members = Object.values(await db.hgetall<Member>(k(code).members)).sort(
    (a, b) => first(a) - first(b) || a.at - b.at || a.id.localeCompare(b.id),
  );
  return { room, members };
}

const save = (db: Store, room: Room) => db.set(k(room.code).room, room, { ex: TTL });

async function addMember(db: Store, code: string, name: string) {
  const m: Member = { id: crypto.randomUUID(), name, token: crypto.randomUUID(), at: Date.now() };
  await db.hset(k(code).members, m.id, m, TTL);
  return m;
}

export async function createRoom(db: Store, hostName: unknown, settings: Partial<Settings>, aiUser?: string) {
  const name = cleanName(hostName);
  if (!name) throw new RoomError("bad_request");
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[pick(CODE_CHARS.length)]).join("");
    const room: Room = {
      code, hostId: "", settings: cleanSettings(settings), phase: "lobby", ids: [], round: null,
      pool: [], used: [], accused: null, writeNo: 0, voteNo: 0, roundNo: 0, aiUser,
    };
    if (!(await db.set(k(code).room, room, { ex: TTL, nx: true }))) continue; // code taken, roll again
    const host = await addMember(db, code, name);
    room.hostId = host.id;
    await save(db, room);
    return { code, pid: host.id, token: host.token };
  }
  throw new Error("no free room code");
}

export async function joinRoom(db: Store, code: string, name: unknown) {
  const n = cleanName(name);
  if (!n) throw new RoomError("bad_request");
  const { room, members } = await load(db, code);
  if (room.phase !== "lobby") throw new RoomError("started");
  if (members.length >= MAX_PLAYERS) throw new RoomError("full");
  const m = await addMember(db, code, uniqueName(n, members.map((x) => x.name)));
  return { code, pid: m.id, token: m.token };
}

function auth(members: Member[], pid: unknown, token: unknown) {
  const me = members.find((m) => m.id === pid);
  if (!me || me.token !== token) throw new RoomError("forbidden");
  return me;
}

// starts the next round: a pack word, the next written word, or the write phase when words ran out
function nextRound(room: Room, members: Member[]) {
  if (room.phase === "lobby") room.ids = members.map((m) => m.id);
  const n = room.ids.length;
  const imposters = Math.min(room.settings.imposterCount, Math.max(1, Math.floor(n / 2)));
  room.accused = null;
  room.guess = null;
  room.spoken = 0;
  room.wordRound = 1;
  room.roundNo++;
  if (room.settings.mode === "packs") {
    const s = packSecret(room.settings.cats, new Set(room.used));
    room.used = room.used.includes(s.key) ? [s.key] : [...room.used, s.key];
    room.round = newRound(n, imposters, s);
    room.phase = "reveal";
  } else if (room.pool.length) {
    const i = pick(room.pool.length);
    room.round = newRound(n, imposters, room.pool[i]);
    room.pool = room.pool.filter((_, j) => j !== i);
    room.phase = "reveal";
  } else {
    room.writeNo++;
    room.round = null;
    room.phase = "write";
  }
  if (room.round && room.settings.joker) {
    const spent = spendJokers(room.round.imposters, room.ids, room.jokers ?? []);
    room.round.jokered = spent.jokered;
    room.jokers = spent.holders;
  }
}

export type Action =
  | { type: "start" | "newGame" | "discuss" | "startVote" | "skipVote" | "ready" | "spoke" | "moreWords" | "force" }
  | { type: "guess"; text: string }
  | { type: "explain"; lang?: string }
  | { type: "words" | "precheck"; words: Draft[]; lang?: string; confirm?: boolean }
  | { type: "vote" | "lean"; target: number };

// early voting: every pick during the talk and every final vote, in order (seq), for the result's timeline
export type VoteEvent = { at: number; voter: number; target: number; final?: boolean };
const leansKey = (code: string, roundNo: number) => `room:${code}:leans:${roundNo}`;
async function logVote(db: Store, code: string, roundNo: number, e: VoteEvent) {
  const key = leansKey(code, roundNo);
  const seq = Object.keys(await db.hgetall(key)).length; // ponytail: two players at the same instant share a seq; the voter in the field keeps both
  await db.hset(key, `${String(seq).padStart(5, "0")}:${e.voter}`, e, TTL);
}
async function voteLog(db: Store, code: string, roundNo: number) {
  const all = await db.hgetall<VoteEvent>(leansKey(code, roundNo));
  return Object.keys(all).sort().map((k) => all[k]);
}

export async function act(db: Store, code: string, pid: unknown, token: unknown, a: Action) {
  const { room, members } = await load(db, code);
  const me = auth(members, pid, token);
  const host = me.id === room.hostId;
  const idx = room.ids.indexOf(me.id);
  // round over: jokers for imposters who got away (or guessed the word), history for the stats
  let roundDone = false; // counted for the admin stats once the room is saved
  const finish = (votes: number[] | null, guessed = false) => {
    const names = room.ids.map((id) => members.find((m) => m.id === id)?.name ?? "?");
    const r = room.round!;
    if (room.settings.joker && room.accused !== null) room.jokers = earnJokers(r.imposters, guessed ? -1 : room.accused, room.ids, room.jokers ?? []);
    room.history = [...(room.history ?? []), { names, imposters: r.imposters, accused: room.accused, votes, word: r.word, guessed }];
    room.phase = "result";
    roundDone = true;
  };
  const gameOver = (room.history?.length ?? 0) >= room.settings.rounds;
  const need = (ok: boolean) => {
    if (!ok) throw new RoomError("forbidden");
  };
  // all ballots in (or the host closes the vote): tie → talk again, caught imposter may guess, else result
  const closeVote = (all: Record<string, number>) => {
    // ponytail: two last voters racing both compute the same tally from the same votes, so the double write is harmless
    const { accused } = tally(Object.values(all).map(Number), room.ids.length);
    if (accused === null) room.phase = "tie";
    else {
      room.accused = accused;
      if (room.settings.guess && room.round!.imposters.includes(accused)) room.phase = "guess";
      else finish(room.ids.map((_, i) => Number(all[i])));
    }
  };

  switch (a.type) {
    case "start":
      need(host && (room.phase === "lobby" || (room.phase === "result" && !gameOver)) && (room.ids.length || members.length) >= 3);
      nextRound(room, members);
      break;
    case "newGame":
      need(host && room.phase === "result");
      room.history = [];
      room.jokers = [];
      nextRound(room, members);
      break;
    case "ready": {
      // everyone confirms they've seen their card; the last one starts the discussion
      need(room.phase === "reveal" && idx >= 0);
      const key = `room:${code}:ready:${room.roundNo}`;
      await db.hset(key, String(idx), true, TTL);
      if (Object.keys(await db.hgetall(key)).length < room.ids.length) return;
      room.phase = "discuss";
      break;
    }
    case "spoke": {
      // the current speaker (or the host, for someone without a phone at hand) hands over to the next
      const speaker = (room.round!.starter + (room.spoken ?? 0)) % room.ids.length;
      need(room.phase === "discuss" && (room.spoken ?? 0) < room.ids.length && (idx === speaker || host));
      room.spoken = (room.spoken ?? 0) + 1;
      break;
    }
    case "moreWords":
      need(host && room.phase === "discuss");
      room.spoken = 0;
      room.wordRound = (room.wordRound ?? 1) + 1;
      break;
    case "guess": {
      need(room.phase === "guess" && idx === room.accused);
      const text = String(a.text ?? "").trim().slice(0, 40);
      const taken = answers(room.round!.word);
      const useAi = !!text && room.settings.ai && (await allowAi(`user:${room.aiUser ?? `room:${code}`}`));
      const correct = !!text && (await reviewWords([{ word: text, clue: "" }], taken, room.settings.lang, useAi, room.aiUser))[0]?.problem === "taken";
      room.guess = text ? { text, correct } : null;
      const votes = await db.hgetall<number>(`room:${code}:votes:${room.voteNo}`);
      finish(room.ids.map((_, i) => Number(votes[i])), correct);
      break;
    }
    case "discuss":
      need(host && (room.phase === "reveal" || room.phase === "tie"));
      room.phase = "discuss";
      break;
    case "startVote":
      need(host && room.phase === "discuss");
      room.voteNo++;
      room.phase = "vote";
      break;
    case "skipVote":
      need(host && room.phase === "discuss");
      room.voteNo++; // fresh, empty ballot so no stale counts show on the result
      room.accused = null;
      finish(null);
      break;
    case "words":
    case "precheck": {
      // precheck: the same review, started while the player is still typing and cached; "words" then finds it ready
      need(room.phase === "write" && idx >= 0);
      const key = `room:${code}:words:${room.writeNo}`;
      const all = await db.hgetall<Draft[]>(key); // "<seat>" → accepted words, "lost:<seat>" → true after a clash
      const mine = all[idx] ?? [];
      const missing = room.settings.perPlayer - mine.length; // < perPlayer after someone clashed with one of mine
      const words = Array.isArray(a.words) ? a.words.slice(0, missing) : [];
      const clean = words.map((w) => ({ word: String(w?.word ?? "").slice(0, 40), clue: String(w?.clue ?? "").slice(0, 40) }));
      // in joker mode the writer's hint is the joker's reward, so it's required
      if (!missing || clean.length !== missing || clean.some((w) => !w.word.trim() || (room.settings.joker && !w.clue.trim())))
        throw new RoomError("bad_request");

      // autocorrect / too hard / duplicates against everyone's words so far
      const written = room.ids.flatMap((_, p) => (all[p] ?? []).map((w) => ({ p, w })));
      const taken = written.map((x) => x.w.word);
      const lang = String(a.lang ?? "en");
      const useAi = room.settings.ai && !a.confirm;
      const [hit, on] = useAi ? await Promise.all([cachedReview(clean, taken, lang), aiEnabled()]) : [null, false];
      if (a.type === "precheck") {
        if (useAi && !hit && (await allowAi(`user:${room.aiUser ?? `room:${code}`}`))) await reviewWords(clean, taken, lang, true, room.aiUser);
        return {};
      }
      const reviews: Review[] = (hit && on ? hit : await reviewWords(clean, taken, lang, useAi && (await allowAi(`user:${room.aiUser ?? `room:${code}`}`)), room.aiUser)).map((r) =>
        r.problem === "taken" && written[r.taken].p === idx ? { ...r, problem: "twice" } : r,
      );
      const changed = reviews.some((r, i) => r.problem || r.word !== clean[i].word.trim() || r.clue !== clean[i].clue.trim());
      if (changed) {
        // a clash with another player's word: this player now knows it, so that word is cancelled and its writer writes a new one
        // ponytail: read-modify-write of the other player's list; if they submit at the same moment their new word can be
        // dropped by this write, and they're simply asked for it again (lost flag). Per-word hash fields would avoid it.
        const hit = new Set(reviews.filter((r) => r.problem === "taken").map((r) => written[r.taken]));
        const owners = [...new Set([...hit].map((x) => x.p))];
        await Promise.all([
          ...owners.map((p) => db.hset(key, String(p), all[p].filter((w) => !written.some((x) => x.p === p && x.w === w && hit.has(x))), TTL)),
          ...owners.map((p) => db.hset(key, `lost:${p}`, true, TTL)), // tells them why they must write again
        ]);
        return { reviews }; // not stored: the player checks the corrections / writes new words and sends again
      }
      await Promise.all([
        db.hset(key, String(idx), [...mine, ...clean.map((w) => ({ word: w.word.trim(), clue: w.clue.trim() }))], TTL),
        db.hset(key, `lost:${idx}`, false, TTL),
      ]);
      const now = await db.hgetall<Draft[]>(key);
      if (room.ids.some((_, i) => (now[i]?.length ?? 0) < room.settings.perPlayer)) return; // others still writing
      room.pool = room.ids.reduce<Secret[]>((p, _, i) => mergeWritten(p, now[i] ?? [], i), []);
      nextRound(room, members);
      break;
    }
    case "lean": {
      const target = Number(a.target);
      need(room.settings.earlyVote && (room.phase === "discuss" || room.phase === "tie") && idx >= 0 && Number.isInteger(target) && target >= 0 && target < room.ids.length && target !== idx);
      await logVote(db, code, room.roundNo, { at: Date.now(), voter: idx, target });
      return {}; // nothing else changes: no save
    }
    case "vote": {
      const target = Number(a.target);
      need(room.phase === "vote" && idx >= 0 && Number.isInteger(target) && target >= 0 && target < room.ids.length && target !== idx);
      const key = `room:${code}:votes:${room.voteNo}`;
      await db.hset(key, String(idx), target, TTL);
      if (room.settings.earlyVote) await logVote(db, code, room.roundNo, { at: Date.now(), voter: idx, target, final: true });
      const all = await db.hgetall<number>(key);
      if (Object.keys(all).length < room.ids.length) return;
      closeVote(all);
      break;
    }
    case "explain": {
      // "Explain with AI" for every crew member of a room whose host is signed in (runs on the host's account).
      // The word comes from the room, never from the client, so imposters and other rounds can't be asked about.
      const r = room.round;
      need(!!r && room.settings.ai && idx >= 0 && !r.imposters.includes(idx) && !["lobby", "write", "result"].includes(room.phase));
      const lang = LANGS.find((l) => l.id === a.lang)?.id ?? room.settings.lang; // explain in the player's app language
      const w = r!.word;
      const word = typeof w === "string" ? w : w[room.settings.lang];
      const [hit, on] = await Promise.all([cachedExplanation(word, lang), aiEnabled()]);
      if (hit && on) return { text: hit }; // cached: instant, no AI call
      if (!(await allowAi(`user:${room.aiUser ?? `room:${code}`}`))) throw new RoomError("rate_limited");
      return { text: await explainWord(word, lang, room.aiUser) };
    }
    case "force": {
      // a phone dropped out: the host carries on without the missing players instead of waiting forever
      need(host);
      if (room.phase === "vote") {
        const all = await db.hgetall<number>(`room:${code}:votes:${room.voteNo}`);
        need(Object.keys(all).length > 0);
        closeVote(all);
      } else if (room.phase === "guess") {
        room.guess = null; // no guess counts as a wrong one
        const votes = await db.hgetall<number>(`room:${code}:votes:${room.voteNo}`);
        finish(room.ids.map((_, i) => Number(votes[i])));
      } else if (room.phase === "write") {
        const now = await db.hgetall<Draft[]>(`room:${code}:words:${room.writeNo}`);
        room.pool = room.ids.reduce<Secret[]>((p, _, i) => mergeWritten(p, now[i] ?? [], i), []);
        need(room.pool.length > 0);
        nextRound(room, members);
      } else need(false);
      break;
    }
    default:
      throw new RoomError("bad_request");
  }
  await save(db, room);
  if (roundDone) later(() => count({ roomRounds: 1 })); // after the response; Vercel keeps the function alive for it
}

export type View = {
  code: string;
  phase: RoomPhase;
  settings: Settings;
  players: string[];
  me: number; // index in players, -1 when not joined
  hostIndex: number;
  isHost: boolean;
  card: null | { imposter: true; clue: Text | null; jokerHint: Text | null } | { imposter: false; word: Text; clue: Text };
  starter: number | null;
  done: number; // players who wrote/voted this phase
  iDone: boolean;
  missing: number; // write phase: how many words I still owe (more than 0 again after a clash)
  lostWord: boolean; // write phase: someone wrote the same word as me, so mine was cancelled
  counts: number[] | null; // vote counts, only after voting ends
  result: null | { imposters: number[]; word: Text; accused: number | null };
  poolLeft: number;
  roundNo: number; // changes every round, even when the phase name stays the same
  history: RoundLog[]; // only finished rounds, so nothing secret
  spoken: number;
  wordRound: number;
  ready: number; // reveal: players who confirmed they've seen their card
  iReady: boolean;
  accused: number | null; // guess phase: who is guessing
  guess: { text: string; correct: boolean } | null;
  gameOver: boolean;
  myLean: number | null; // early voting: my current suspect during the talk
  voteLog: VoteEvent[] | null; // early voting: every pick and final vote, only once the result is out
};

/** What one player may see: their own card only, never someone else's role. */
export async function view(db: Store, code: string, pid: unknown, token: unknown): Promise<View> {
  const { room, members } = await load(db, code);
  const me = members.find((m) => m.id === pid && m.token === token);
  const order = room.ids.length ? room.ids : members.map((m) => m.id);
  const names = order.map((id) => members.find((m) => m.id === id)?.name ?? "?");
  const idx = me ? order.indexOf(me.id) : -1;
  const r = room.round;
  const inRound = r && idx >= 0 && room.phase !== "lobby" && room.phase !== "write";

  let done = 0;
  let iDone = false;
  let counts: number[] | null = null;
  const tracked =
    room.phase === "write" ? `words:${room.writeNo}` : ["vote", "tie", "result"].includes(room.phase) ? `votes:${room.voteNo}` : null;
  const readyInfo = async () => {
    if (room.phase !== "reveal") return { ready: 0, iReady: false };
    const h = await db.hgetall(`room:${code}:ready:${room.roundNo}`);
    return { ready: Object.keys(h).length, iReady: idx >= 0 && String(idx) in h };
  };
  let missing = 0;
  let lostWord = false;
  if (tracked) {
    const h = await db.hgetall<unknown>(`room:${code}:${tracked}`);
    done = Object.keys(h).length;
    iDone = idx >= 0 && String(idx) in h;
    if (room.phase === "write") {
      const count = (i: number) => ((h[i] as Draft[] | undefined) ?? []).length;
      done = order.filter((_, i) => count(i) >= room.settings.perPlayer).length;
      missing = idx >= 0 ? room.settings.perPlayer - count(idx) : 0;
      iDone = idx >= 0 && missing === 0;
      lostWord = idx >= 0 && h[`lost:${idx}`] === true;
    }
    if (room.phase !== "write" && room.phase !== "vote" && done) counts = tally(Object.values(h).map(Number), order.length).counts;
  }

  return {
    code,
    phase: room.phase,
    settings: room.settings,
    players: names,
    me: idx,
    hostIndex: order.indexOf(room.hostId),
    isHost: !!me && me.id === room.hostId,
    card: !inRound
      ? null
      : r.imposters.includes(idx)
        ? {
            imposter: true,
            clue: room.settings.hint && r.clue ? r.clue : null,
            jokerHint: r.jokered?.includes(idx) ? wordHint(r) : null,
          }
        : { imposter: false, word: r.word, clue: r.clue },
    starter: inRound ? r.starter : null,
    done,
    iDone,
    counts,
    result: room.phase === "result" && r ? { imposters: r.imposters, word: r.word, accused: room.accused } : null,
    poolLeft: room.pool.length,
    roundNo: room.roundNo,
    history: room.history ?? [],
    spoken: room.spoken ?? 0,
    wordRound: room.wordRound ?? 1,
    ...(await readyInfo()),
    accused: room.phase === "guess" || room.phase === "result" ? room.accused : null,
    guess: room.phase === "result" ? (room.guess ?? null) : null,
    gameOver: room.phase === "result" && (room.history?.length ?? 0) >= room.settings.rounds,
    missing,
    lostWord,
    ...(await leanInfo()),
  };

  // early voting: my own current pick while talking; everyone's picks only once the result is out
  async function leanInfo() {
    const talking = room.phase === "discuss" || room.phase === "tie";
    if (!room.settings.earlyVote || idx < 0 || !(talking || room.phase === "result")) return { myLean: null, voteLog: null };
    const log = await voteLog(db, code, room.roundNo);
    if (room.phase === "result") return { myLean: null, voteLog: log };
    return { myLean: log.filter((e) => e.voter === idx && !e.final).at(-1)?.target ?? null, voteLog: null };
  }
}
