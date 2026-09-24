import { earnJokers, mergeWritten, newRound, packSecret, pick, spendJokers, wordHint, type Round, type Secret, type Text } from "./game.ts";
import { CATEGORIES } from "./i18n.ts";
import type { Store } from "./store.ts";
import { reviewWords } from "./ai.ts";
import type { Draft, Review } from "./game.ts";
import type { RoundLog } from "./stats.ts";
import { tally } from "./vote.ts";

const TTL = 60 * 60 * 24; // rooms vanish a day after the last write
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I lookalikes
export const MAX_PLAYERS = 20;

export type Settings = { imposterCount: number; mode: "packs" | "custom"; cats: string[]; perPlayer: number; hint: boolean; joker: boolean; ai: boolean };
export type RoomPhase = "lobby" | "write" | "reveal" | "discuss" | "vote" | "tie" | "result";
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
  history?: RoundLog[]; // finished rounds, for the stats screen (optional: rooms created before stats)
  jokers?: string[]; // member ids holding a joker
};

export class RoomError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "started" | "full" | "bad_request",
    public status = code === "not_found" ? 404 : code === "forbidden" ? 403 : code === "bad_request" ? 400 : 409,
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
    cats: cats.length ? cats : CATEGORIES.map((c) => c.id),
    perPlayer: Math.max(1, Math.min(5, Math.round(Number(s.perPlayer) || 2))),
    hint: s.hint !== false,
    joker: s.joker === true && s.hint === false, // jokers only when imposters get no clue
    ai: s.ai !== false, // the host's "AI help" setting: AI checks for written words
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

export async function createRoom(db: Store, hostName: unknown, settings: Partial<Settings>) {
  const name = cleanName(hostName);
  if (!name) throw new RoomError("bad_request");
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[pick(CODE_CHARS.length)]).join("");
    const room: Room = {
      code, hostId: "", settings: cleanSettings(settings), phase: "lobby", ids: [], round: null,
      pool: [], used: [], accused: null, writeNo: 0, voteNo: 0, roundNo: 0,
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
  const m = await addMember(db, code, n);
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
  | { type: "start" | "discuss" | "startVote" | "skipVote" }
  | { type: "words"; words: Draft[]; lang?: string; confirm?: boolean }
  | { type: "vote"; target: number };

export async function act(db: Store, code: string, pid: unknown, token: unknown, a: Action) {
  const { room, members } = await load(db, code);
  const me = auth(members, pid, token);
  const host = me.id === room.hostId;
  const idx = room.ids.indexOf(me.id);
  const log = (votes: number[] | null) => {
    const names = room.ids.map((id) => members.find((m) => m.id === id)?.name ?? "?");
    room.history = [...(room.history ?? []), { names, imposters: room.round!.imposters, accused: room.accused, votes, word: room.round!.word }];
  };
  const need = (ok: boolean) => {
    if (!ok) throw new RoomError("forbidden");
  };

  switch (a.type) {
    case "start":
      need(host && (room.phase === "lobby" || room.phase === "result") && (room.ids.length || members.length) >= 3);
      nextRound(room, members);
      break;
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
      room.phase = "result";
      log(null);
      break;
    case "words": {
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
      const reviews: Review[] = (await reviewWords(clean, written.map((x) => x.w.word), String(a.lang ?? "en"), room.settings.ai && !a.confirm)).map((r) =>
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
    case "vote": {
      const target = Number(a.target);
      need(room.phase === "vote" && idx >= 0 && Number.isInteger(target) && target >= 0 && target < room.ids.length && target !== idx);
      const key = `room:${code}:votes:${room.voteNo}`;
      await db.hset(key, String(idx), target, TTL);
      const all = await db.hgetall<number>(key);
      if (Object.keys(all).length < room.ids.length) return;
      // ponytail: two last voters racing both compute the same tally from the same votes, so the double write is harmless
      const { accused } = tally(Object.values(all).map(Number), room.ids.length);
      if (accused === null) room.phase = "tie";
      else {
        room.accused = accused;
        room.phase = "result";
        if (room.settings.joker) room.jokers = earnJokers(room.round!.imposters, accused, room.ids, room.jokers ?? []);
        log(Object.entries(all).sort(([a], [b]) => Number(a) - Number(b)).map(([, t]) => Number(t)));
      }
      break;
    }
    default:
      throw new RoomError("bad_request");
  }
  await save(db, room);
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
    missing,
    lostWord,
  };
}
