import { test } from "node:test";
import assert from "node:assert/strict";
import { stats, winners, type RoundLog } from "./stats.ts";
import { earnJokers, mergeWritten, newRound, packSecret, spendJokers, type Secret } from "./game.ts";
import { CATEGORIES } from "./i18n.ts";
import { act, createRoom, joinRoom, RoomError, view, type Settings } from "./room.ts";
import { db as envStore, memoryStore, persistent } from "./store.ts";

const names = ["Lisa", "Nora", "Tim", "Beni"];
const byName = (h: RoundLog[]) => Object.fromEntries(stats(h).players.map((p) => [p.name, p]));

// a worked 6-round game, scored by hand from the rules (crew +1 per vote on an imposter, imposter +2 when getting away)
const game: RoundLog[] = [
  { names, imposters: [0], accused: 0, votes: [1, 0, 0, 0], word: "a" }, // Lisa caught: Nora, Tim, Beni +1
  { names, imposters: [1], accused: 2, votes: [2, 2, 1, 2], word: "b" }, // Nora escapes +2; Tim voted Nora +1
  { names, imposters: [2], accused: null, votes: null, word: "c" }, // skipped: nothing
  { names, imposters: [3], accused: 3, votes: [3, 3, 3, 0], word: "d", guessed: true }, // Beni caught but guessed: +2; Lisa, Nora, Tim +1
  { names, imposters: [0, 1], accused: 2, votes: [2, 2, 0, 1], word: "e" }, // Lisa + Nora escape +2 each; Tim, Beni voted an imposter +1
  { names, imposters: [2], accused: 2, votes: [2, 2, 0, 2], word: "f" }, // Tim caught: Lisa, Nora, Beni +1
];

test("six rounds scored by hand: points, wins, counters", () => {
  const s = stats(game);
  assert.equal(s.rounds, 6);
  assert.equal(s.crewWins, 2); // rounds 1 and 6
  assert.equal(s.imposterWins, 3); // rounds 2, 4 (guessed), 5
  const p = byName(game);
  assert.deepEqual(names.map((n) => p[n].points), [4, 7, 4, 5]);
  assert.deepEqual(names.map((n) => p[n].imposter), [2, 2, 2, 1]); // the skipped round still counts as Tim's imposter round
  assert.deepEqual(names.map((n) => p[n].escaped), [1, 2, 0, 1]);
  assert.deepEqual(names.map((n) => p[n].correctVotes), [2, 3, 4, 3]);
  assert.deepEqual(names.map((n) => p[n].votesTaken), [6, 3, 8, 3]);
  assert.deepEqual(names.map((n) => p[n].rounds), [6, 6, 6, 6]);
  assert.deepEqual(winners(game), ["Nora"]);
  assert.deepEqual(names.map((n) => referee(game)[n].points), [4, 7, 4, 5]); // the referee below agrees with the hand count
});

test("six rounds: the timeline is cumulative, one entry per round, ending at the leaderboard", () => {
  const s = stats(game);
  assert.deepEqual(s.timeline, [
    { Lisa: 0, Nora: 1, Tim: 1, Beni: 1 },
    { Lisa: 0, Nora: 3, Tim: 2, Beni: 1 },
    { Lisa: 0, Nora: 3, Tim: 2, Beni: 1 }, // skipped round: flat
    { Lisa: 1, Nora: 4, Tim: 3, Beni: 3 },
    { Lisa: 3, Nora: 6, Tim: 4, Beni: 4 },
    { Lisa: 4, Nora: 7, Tim: 4, Beni: 5 },
  ]);
});

/** The rules, applied round by round from what the table saw; a missing ballot (phone dropped out) scores nothing. */
function referee(h: { names: string[]; imposters: number[]; accused: number | null; votes: (number | null)[] | null; guessed?: boolean }[]) {
  const out: Record<string, { points: number; imposter: number; escaped: number; correctVotes: number; votesTaken: number }> = {};
  for (const r of h) {
    r.names.forEach((name, i) => {
      const p = (out[name] ??= { points: 0, imposter: 0, escaped: 0, correctVotes: 0, votesTaken: 0 });
      const ballot = r.votes?.[i];
      if (r.imposters.includes(i)) {
        p.imposter++;
        if (r.accused !== null && (r.accused !== i || r.guessed)) {
          p.escaped++;
          p.points += 2;
        }
      } else if (r.accused !== null && ballot != null && r.imposters.includes(ballot)) {
        p.correctVotes++;
        p.points++;
      }
      p.votesTaken += (r.votes ?? []).filter((v) => v === i).length;
    });
  }
  return out;
}

// seeded so a failure can be replayed
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a random but legal round: distinct imposters, nobody votes for themselves, some votes skipped, some caught imposters guess
function randomRound(rand: () => number, who: string[], imposterCount: number): RoundLog {
  const n = who.length;
  const seats = [...who.keys()].sort(() => rand() - 0.5);
  const imposters = seats.slice(0, imposterCount);
  if (rand() < 0.15) return { names: who, imposters, accused: null, votes: null, word: "w" };
  const votes = who.map((_, i) => (i + 1 + Math.floor(rand() * (n - 1))) % n);
  const accused = Math.floor(rand() * n);
  const guessed = imposters.includes(accused) && rand() < 0.3;
  return { names: who, imposters, accused, votes, word: "w", guessed };
}

test("200 random rounds: every point is accounted for and the timeline only climbs", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rand = rng(seed);
    const who = ["Lisa", "Nora", "Tim", "Beni", "Domi", "Sara"].slice(0, 3 + (seed % 4));
    const h = Array.from({ length: 200 }, () => randomRound(rand, who, 1 + (seed % 2)));
    const s = stats(h);

    const gain = h.map((r) => referee([r]));
    const total = (name: string) => referee(h)[name].points;

    assert.equal(s.rounds, 200);
    assert.equal(s.timeline.length, 200);
    assert.equal(s.crewWins + s.imposterWins, h.filter((r) => r.accused !== null).length);
    assert.equal(s.players.length, who.length);
    for (const p of s.players) {
      assert.equal(p.points, total(p.name), `${p.name} seed ${seed}`);
      assert.equal(p.points, p.correctVotes + 2 * p.escaped);
      assert.equal(p.rounds, 200);
      assert.equal(s.timeline.at(-1)![p.name], p.points);
    }
    s.timeline.forEach((after, r) => {
      for (const n of who) assert.equal(after[n] - (r ? s.timeline[r - 1][n] : 0), gain[r][n].points, `round ${r + 1} ${n}`);
    });
    assert.equal(
      s.players.reduce((a, p) => a + p.votesTaken, 0),
      h.reduce((a, r) => a + (r.votes?.length ?? 0), 0),
    ); // every ballot lands on someone
    assert.equal(
      s.players.reduce((a, p) => a + p.imposter, 0),
      h.reduce((a, r) => a + r.imposters.length, 0),
    );
    // leaderboard sorted, winners = everyone on top
    for (let i = 1; i < s.players.length; i++) assert.ok(s.players[i - 1].points >= s.players[i].points);
    const w = winners(h);
    assert.ok(w.length >= 1);
    for (const p of s.players) assert.equal(w.includes(p.name), p.points === s.players[0].points);
  }
});

test("stats of a prefix match the timeline at that round (stats hold up while the game goes on)", () => {
  const rand = rng(42);
  const h = Array.from({ length: 30 }, () => randomRound(rand, names, 1));
  const full = stats(h).timeline;
  for (let r = 1; r <= h.length; r++) {
    const s = stats(h.slice(0, r));
    assert.equal(s.rounds, r);
    assert.deepEqual(s.timeline, full.slice(0, r));
    for (const p of s.players) assert.equal(p.points, full[r - 1][p.name]);
  }
});

test("500 draws: valid, distinct imposters who never wrote the word, and a starter at the table", () => {
  const pool = mergeWritten(mergeWritten([], [{ word: "Pizza", clue: "" }], 0), [{ word: "pizza", clue: "" }, { word: "Moon", clue: "" }], 3);
  const secrets: Secret[] = [...pool, packSecret(["food"], new Set())];
  for (let i = 0; i < 500; i++) {
    const players = 3 + (i % 8);
    const want = 1 + (i % 3);
    const secret = secrets[i % secrets.length];
    const r = newRound(players, want, secret);
    const eligible = players - secret.authors.filter((a) => a < players).length;
    assert.equal(r.imposters.length, Math.min(want, eligible));
    assert.equal(new Set(r.imposters).size, r.imposters.length);
    for (const x of r.imposters) {
      assert.ok(Number.isInteger(x) && x >= 0 && x < players);
      assert.ok(!secret.authors.includes(x), "an author knows the word, so can't be imposter");
    }
    assert.ok(r.starter >= 0 && r.starter < players);
    assert.ok(r.word, "every round has a word");
  }
});

test("a pack topic never repeats a word until all were played, across many rounds", () => {
  const cat = CATEGORIES.find((c) => c.id === "food")!;
  const used: string[] = [];
  const seen: string[] = [];
  for (let i = 0; i < cat.words.length * 3; i++) {
    const s = packSecret(["food"], new Set(used));
    if (used.includes(s.key)) used.splice(0, used.length, s.key);
    else used.push(s.key);
    seen.push(s.key);
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    const chunk = seen.slice(cycle * cat.words.length, (cycle + 1) * cat.words.length);
    assert.equal(new Set(chunk).size, cat.words.length, `cycle ${cycle}: every word exactly once`);
  }
});

test("jokers over 300 rounds: never negative, never doubled, spent only by holders who are imposter", () => {
  const rand = rng(7);
  const ids = ["Lisa", "Nora", "Tim", "Beni", "Domi"];
  let holders: string[] = [];
  let earned = 0;
  let spent = 0;
  for (let round = 0; round < 300; round++) {
    const r = newRound(ids.length, 1 + (round % 2), { word: "x", clue: "", authors: [], key: "x" });
    const before = holders;
    const s = spendJokers(r.imposters, ids, holders);
    // exactly the imposters holding a joker spend it; everyone else keeps theirs
    assert.deepEqual(s.jokered.map((i) => ids[i]).sort(), r.imposters.map((i) => ids[i]).filter((n) => before.includes(n)).sort());
    assert.deepEqual([...s.holders].sort(), before.filter((h) => !s.jokered.some((i) => ids[i] === h)).sort());
    spent += s.jokered.length;
    const accused = rand() < 0.2 ? null : Math.floor(rand() * ids.length);
    const after = earnJokers(r.imposters, accused, ids, s.holders);
    assert.equal(new Set(after).size, after.length, "a player never holds two jokers");
    for (const h of after) assert.ok(ids.includes(h));
    // survivors (imposters not accused) hold one now; a skipped vote earns nothing
    const survivors = accused === null ? [] : r.imposters.filter((i) => i !== accused).map((i) => ids[i]);
    for (const n of survivors) assert.ok(after.includes(n));
    for (const n of after) assert.ok(s.holders.includes(n) || survivors.includes(n));
    earned += after.length - s.holders.length;
    holders = after;
  }
  assert.equal(earned - spent, holders.length, "jokers held = earned − spent");
  assert.ok(spent > 0, "some jokers were used in 300 rounds");
});

// ---------- rooms: many rounds through act() / view(), every phone checked every round ----------

const store = () => (persistent ? envStore : memoryStore());
type Log = { names: string[]; imposters: number[]; accused: number | null; votes: (number | null)[] | null; guessed: boolean };

async function room(players: string[], settings: Partial<Settings>) {
  const db = store();
  const host = await createRoom(db, players[0], { ai: false, ...settings });
  const others = [];
  for (const n of players.slice(1)) others.push(await joinRoom(db, host.code, n));
  const seats = await Promise.all([host, ...others].map(async (p) => ({ p, me: (await view(db, host.code, p.pid, p.token)).me })));
  const all = seats.sort((a, b) => a.me - b.me).map((x) => x.p);
  const as = (i: number, a: Parameters<typeof act>[4]) => act(db, host.code, all[i].pid, all[i].token, a);
  const see = (i: number) => view(db, host.code, all[i].pid, all[i].token);
  const seeAll = () => Promise.all(all.map((_, i) => see(i)));
  const stranger = () => view(db, host.code, all[0].pid, "wrong-token");
  return { as, see, seeAll, stranger, n: players.length };
}
type Room = Awaited<ReturnType<typeof room>>;

type Plan = "vote" | "skip" | "force";
const hit = { tie: 0, guess: 0, rightGuess: 0, joker: 0, force: 0, skip: 0 }; // proves the random paths were really played
/**
 * Plays the round that was just started. Checks every phone's card, records what the table saw, and checks the
 * result and the stored history against it. `holders` = names holding a joker (joker mode), updated in place.
 */
async function playRound(r: Room, rand: () => number, plan: Plan, holders: string[] | null, before: Log[]) {
  const { as, see, seeAll, n } = r;
  const views = await seeAll();
  const players = views[0].players;
  const want = Math.min(views[0].settings.imposterCount, Math.max(1, Math.floor(n / 2)));
  for (const v of views) {
    assert.equal(v.phase, "reveal");
    assert.equal(v.result, null, "nobody learns roles before the result");
    assert.equal(v.history.length, before.length);
    assert.equal(v.spoken, 0);
    assert.equal(v.wordRound, 1);
    assert.equal(v.roundNo, views[0].roundNo);
  }
  assert.equal((await r.stranger()).card, null, "a wrong token sees no card");
  const imposters = views.flatMap((v, i) => (v.card?.imposter ? [i] : []));
  assert.equal(imposters.length, want);
  const crew = views.filter((v) => v.card && !v.card.imposter);
  const word = (crew[0].card as { word: unknown }).word;
  for (const v of crew) assert.deepEqual((v.card as { word: unknown }).word, word, "the whole crew has the same word");
  for (const i of imposters) {
    assert.ok(!("word" in views[i].card!));
    assert.ok(!JSON.stringify(views[i]).includes(JSON.stringify(word)), "the imposter's phone never gets the word");
  }
  if (holders) {
    for (const i of imposters) {
      const hint = (views[i].card as { jokerHint: unknown }).jokerHint;
      assert.equal(hint !== null, holders.includes(players[i]), `${players[i]} joker hint`);
      if (hint !== null) hit.joker++;
    }
    holders.splice(0, holders.length, ...holders.filter((h) => !imposters.some((i) => players[i] === h)));
  }

  for (let i = 0; i < n; i++) await as(i, { type: "ready" });
  assert.equal((await see(0)).phase, "discuss");

  let votes: (number | null)[] | null = null;
  let accused: number | null = null;
  let guessed = false;
  if (plan === "skip") {
    await as(0, { type: "skipVote" });
    hit.skip++;
  } else {
    await as(0, { type: "startVote" });
    const target = Math.floor(rand() * n);
    if (plan === "force") {
      // one phone (never the host, never the target) drops out; the host counts the rest
      const missing = [...Array(n).keys()].find((i) => i !== 0 && i !== target)!;
      votes = [...Array(n).keys()].map((i) => (i === missing ? null : i === target ? (target + 1) % n : target));
      for (let i = 0; i < n; i++) if (votes[i] !== null) await as(i, { type: "vote", target: votes[i]! });
      assert.equal((await see(0)).phase, "vote");
      await as(0, { type: "force" });
      hit.force++;
    } else {
      // first ballot is random (may tie); a tie goes back to discussion, then everyone agrees on one target
      const first = [...Array(n).keys()].map((i) => (i + 1 + Math.floor(rand() * (n - 1))) % n);
      for (let i = 0; i < n; i++) await as(i, { type: "vote", target: first[i] });
      const counts = Array(n).fill(0);
      for (const t of first) counts[t]++;
      const top = Math.max(...counts);
      if (counts.filter((c) => c === top).length === 1) votes = first;
      else {
        assert.equal((await see(1)).phase, "tie");
        hit.tie++;
        assert.deepEqual((await see(1)).counts, counts);
        await as(0, { type: "discuss" });
        await as(0, { type: "startVote" });
        votes = [...Array(n).keys()].map((i) => (i === target ? (target + 1) % n : target));
        for (let i = 0; i < n; i++) await as(i, { type: "vote", target: votes[i]! });
      }
    }
    const counts = Array(n).fill(0);
    for (const t of votes) if (t !== null) counts[t]++;
    accused = counts.indexOf(Math.max(...counts));
    const g = await see(0);
    if (g.phase === "guess") {
      assert.ok(views[0].settings.guess && imposters.includes(accused), "only a caught imposter guesses");
      guessed = rand() < 0.5;
      hit.guess++;
      if (guessed) hit.rightGuess++;
      const lang = views[0].settings.lang;
      await as(accused, { type: "guess", text: guessed ? (word as Record<string, string>)[lang] : "zzzz" });
    } else if (views[0].settings.guess) assert.ok(!imposters.includes(accused));
  }

  const log: Log = { names: players, imposters, accused, votes, guessed };
  const res = await seeAll();
  for (const v of res) {
    assert.equal(v.phase, "result");
    assert.deepEqual([...v.result!.imposters].sort(), imposters, "the result names exactly the players who saw the imposter card");
    assert.deepEqual(v.result!.word, word);
    assert.equal(v.result!.accused, accused);
    assert.equal(v.history.length, before.length + 1);
    assert.equal(v.gameOver, v.history.length >= v.settings.rounds);
  }
  const last = res[0].history.at(-1)!;
  assert.deepEqual(
    { names: last.names, imposters: [...last.imposters].sort(), accused: last.accused, guessed: !!last.guessed },
    { names: players, imposters, accused, guessed },
  );
  if (holders && accused !== null) {
    for (const i of imposters) if (i !== accused || guessed) if (!holders.includes(players[i])) holders.push(players[i]);
  }
  return log;
}

/** Plays `games` full games; after each: game over, "start" refused, stats agree with the referee, "newGame" resets. */
async function playGames(r: Room, rand: () => number, games: number, plans: (round: number) => Plan, joker: boolean) {
  const holders: string[] | null = joker ? [] : null;
  await r.as(0, { type: "start" });
  for (let g = 0; g < games; g++) {
    const log: Log[] = [];
    const rounds = (await r.see(0)).settings.rounds;
    for (let round = 0; round < rounds; round++) {
      if (round > 0) {
        assert.equal((await r.see(0)).gameOver, false);
        await assert.rejects(r.as(1, { type: "start" }), RoomError, "only the host starts the next round");
        await r.as(0, { type: "start" });
      }
      log.push(await playRound(r, rand, plans(g * rounds + round), holders, log));
    }
    const v = await r.see(1);
    assert.equal(v.gameOver, true);
    assert.equal(v.history.length, rounds);
    await assert.rejects(r.as(0, { type: "start" }), RoomError, "no round after the last one");

    const s = stats(v.history);
    const want = referee(log);
    assert.equal(s.rounds, rounds);
    assert.equal(s.timeline.length, rounds);
    for (const p of s.players) {
      const { points, imposter, escaped, correctVotes, votesTaken } = p;
      assert.deepEqual({ points, imposter, escaped, correctVotes, votesTaken }, want[p.name], `game ${g + 1}: ${p.name}`);
      assert.equal(s.timeline.at(-1)![p.name], points);
    }
    for (let i = 1; i < s.timeline.length; i++) for (const n of v.players) assert.ok(s.timeline[i][n] >= s.timeline[i - 1][n]);
    const top = Math.max(...Object.values(want).map((x) => x.points));
    assert.deepEqual([...winners(v.history)].sort(), Object.keys(want).filter((k) => want[k].points === top).sort());

    if (g + 1 < games) {
      await assert.rejects(r.as(2, { type: "newGame" }), RoomError, "only the host starts a new game");
      await r.as(0, { type: "newGame" });
      const fresh = await r.see(0);
      assert.equal(fresh.history.length, 0, "a new game starts with empty stats");
      assert.equal(fresh.gameOver, false);
      if (holders) holders.splice(0); // and without jokers
    }
  }
}

test("room: 3 games × 5 rounds (votes, ties, skips, dropped phones): cards, results, stats, game over, new game", async () => {
  const r = await room(["Lisa", "Nora", "Tim", "Beni", "Domi"], { rounds: 5, imposterCount: 1 });
  const plans: Plan[] = ["vote", "vote", "skip", "force", "vote"];
  await playGames(r, rng(11), 3, (i) => plans[i % plans.length], false);
});

test("room: two imposters, guess option, 3 games × 4 rounds", async () => {
  const r = await room(["Lisa", "Nora", "Tim", "Beni", "Domi", "Sara"], { rounds: 4, imposterCount: 2, guess: true });
  await playGames(r, rng(12), 3, (i) => (i % 5 === 4 ? "skip" : "vote"), false);
});

test("room: jokers over 3 games × 8 rounds are earned, shown, spent once and reset by a new game", async () => {
  const r = await room(["Lisa", "Nora", "Tim", "Beni"], { rounds: 8, joker: true, hint: false, guess: true });
  assert.equal((await r.see(0)).settings.joker, true);
  await playGames(r, rng(13), 3, (i) => (i % 6 === 5 ? "skip" : "vote"), true);
});

test("room: pack words don't repeat across rounds and games", async () => {
  const r = await room(["Lisa", "Nora", "Tim"], { rounds: 6, cats: ["food"] });
  const size = CATEGORIES.find((c) => c.id === "food")!.words.length;
  const words: string[] = [];
  await r.as(0, { type: "start" });
  for (let i = 0; i < Math.min(size, 18); i++) {
    const v = await r.seeAll();
    words.push(JSON.stringify((v.find((x) => x.card && !x.card.imposter)!.card as { word: unknown }).word));
    for (let s = 0; s < 3; s++) await r.as(s, { type: "ready" });
    await r.as(0, { type: "skipVote" });
    await r.as(0, { type: (await r.see(0)).gameOver ? "newGame" : "start" });
  }
  assert.equal(new Set(words).size, words.length);
});

test("room: own words over 9 rounds: pool drains, everyone writes again, authors are never imposter", async () => {
  const r = await room(["Lisa", "Nora", "Tim", "Beni"], { rounds: 9, mode: "custom", perPlayer: 1 });
  const rand = rng(14);
  await r.as(0, { type: "start" });
  const log: Log[] = [];
  for (let round = 0; round < 9; round++) {
    if (round > 0) await r.as(0, { type: "start" });
    if (round % 4 === 0) {
      assert.equal((await r.see(0)).phase, "write", `round ${round + 1}: words ran out, everyone writes`);
      for (let i = 0; i < 4; i++) await r.as(i, { type: "words", words: [{ word: `W${round}-${i}`, clue: "" }] });
    }
    const v = await r.seeAll();
    assert.equal(v[0].poolLeft, 3 - (round % 4));
    const word = (v.find((x) => x.card && !x.card.imposter)!.card as { word: string }).word;
    const author = Number(word.split("-")[1]);
    assert.match(word, new RegExp(`^W${round - (round % 4)}-`), "the word comes from this batch");
    assert.equal(v[author].card?.imposter, false, "the author knows the word, so never plays imposter");
    log.push(await playRound(r, rand, "vote", null, log));
  }
  assert.equal((await r.see(0)).gameOver, true);
});

test("the room games above really went through ties, skips, dropped phones, guesses and jokers", () => {
  for (const [k, v] of Object.entries(hit)) assert.ok(v > 0, `${k} never happened`);
});
