import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createRoom, joinRoom, RoomError, view } from "./room.ts";
import { db as envStore, memoryStore, persistent } from "./store.ts";

// in-memory by default; set UPSTASH_REDIS_REST_URL/TOKEN (e.g. scripts/upstash-local.mjs) to run against Redis
const store = () => (persistent ? envStore : memoryStore());

async function setup(mode: "packs" | "custom", joker = false) {
  const db = store();
  const host = await createRoom(db, "Lisa", { mode, perPlayer: 1, imposterCount: 1, joker, hint: !joker, rounds: 30 });
  const others = await Promise.all(["Nora", "Tim", "Beni"].map((n) => joinRoom(db, host.code, n)));
  // index i = the player's seat in the room (simultaneous joins may be ordered differently than listed)
  const seats = await Promise.all([host, ...others].map(async (p) => ({ p, me: (await view(db, host.code, p.pid, p.token)).me })));
  const all = seats.sort((a, b) => a.me - b.me).map((x) => x.p);
  const as = (i: number, a: Parameters<typeof act>[4]) => act(db, host.code, all[i].pid, all[i].token, a);
  const see = (i: number) => view(db, host.code, all[i].pid, all[i].token);
  return { db, host, all, as, see };
}

test("each phone sees only its own card; exactly one imposter", async () => {
  const { as, see } = await setup("packs");
  await assert.rejects(as(1, { type: "start" }), RoomError); // only the host starts
  await as(0, { type: "start" });
  const views = await Promise.all([0, 1, 2, 3].map(see));
  assert.equal(views.filter((v) => v.card?.imposter).length, 1);
  for (const v of views) {
    assert.equal(v.phase, "reveal");
    assert.equal(v.result, null); // nobody learns roles before the result
    if (v.card?.imposter) assert.ok(!("word" in v.card));
  }
});

test("vote: majority accuses, tie goes back to discussion", async () => {
  const { as, see } = await setup("packs");
  await as(0, { type: "start" });
  await as(0, { type: "discuss" });
  await as(0, { type: "startVote" });
  await assert.rejects(as(0, { type: "vote", target: 0 }), RoomError); // no self-vote
  for (const [voter, target] of [[0, 1], [1, 0], [2, 1], [3, 0]]) await as(voter, { type: "vote", target });
  const tie = await see(2);
  assert.equal(tie.phase, "tie");
  assert.deepEqual(tie.counts, [2, 2, 0, 0]);
  await as(0, { type: "discuss" });
  await as(0, { type: "startVote" });
  assert.equal((await see(0)).done, 0); // fresh ballot
  for (const [voter, target] of [[0, 2], [1, 2], [2, 1], [3, 2]]) await as(voter, { type: "vote", target });
  const r = await see(1);
  assert.equal(r.phase, "result");
  assert.equal(r.result?.accused, 2);
  assert.equal(r.result?.imposters.length, 1);
});

test("custom words: round starts only after everyone wrote; authors are never imposter", async () => {
  const { as, see, db, host } = await setup("custom");
  await as(0, { type: "start" });
  assert.equal((await see(0)).phase, "write");
  for (const i of [0, 1, 2]) await as(i, { type: "words", words: [{ word: `w${i}`, clue: "" }] });
  assert.equal((await see(3)).phase, "write");
  assert.equal((await see(3)).done, 3);
  await as(3, { type: "words", words: [{ word: "w3", clue: "c" }] });
  const views = await Promise.all([0, 1, 2, 3].map(see));
  assert.equal(views[0].phase, "reveal");
  const author = views.findIndex((v) => v.card && !v.card.imposter && v.card.word === `w${views.indexOf(v)}`);
  if (author >= 0) assert.equal(views[author].card?.imposter, false);
  assert.equal(views[0].poolLeft, 3);
  // late joiners are rejected once the game started
  await assert.rejects(joinRoom(db, host.code, "Domi"), RoomError);
});

test("wrong token is rejected", async () => {
  const { host, db } = await setup("packs");
  await assert.rejects(act(db, host.code, host.pid, "nope", { type: "start" }), RoomError);
  const v = await view(db, host.code, host.pid, "nope");
  assert.equal(v.me, -1);
  assert.equal(v.card, null);
});

test("joker: a surviving imposter earns a joker and gets the word hint next time", async () => {
  const { as, see } = await setup("packs", true);
  await as(0, { type: "start" });
  const cards = await Promise.all([0, 1, 2, 3].map(see));
  const imp = cards.findIndex((v) => v.card?.imposter);
  assert.equal(cards[imp].card?.imposter && cards[imp].card.jokerHint, null); // nobody has a joker yet
  // everyone accuses an innocent player, so the imposter survives
  const innocent = (imp + 1) % 4;
  await as(0, { type: "discuss" });
  await as(0, { type: "startVote" });
  for (const i of [0, 1, 2, 3]) await as(i, { type: "vote", target: i === innocent ? (innocent + 1) % 4 : innocent });
  assert.equal((await see(0)).result?.accused, innocent);

  // play (skipping votes, so no new jokers) until the joker holder is imposter again
  for (let round = 0; round < 28; round++) {
    await as(0, { type: "start" });
    const vs = await Promise.all([0, 1, 2, 3].map(see));
    const now = vs.findIndex((v) => v.card?.imposter);
    const card = vs[now].card as { jokerHint: unknown };
    if (now === imp) {
      assert.match(JSON.stringify(card.jokerHint), /_/); // "S _ _ _" style hint
      await as(0, { type: "discuss" });
      await as(0, { type: "skipVote" });
      await as(0, { type: "start" }); // joker was spent: next imposter round without a hint
      const after = (await Promise.all([0, 1, 2, 3].map(see))).find((v) => v.card?.imposter)!.card as { jokerHint: unknown };
      assert.equal(after.jokerHint, null);
      return;
    }
    assert.equal(card.jokerHint, null); // someone else is imposter: no hint for them
    await as(0, { type: "discuss" });
    await as(0, { type: "skipVote" });
  }
  assert.fail("joker holder never became imposter");
});

test("joker + own words: the hint is required", async () => {
  const { as } = await setup("custom", true);
  await as(0, { type: "start" });
  await assert.rejects(as(0, { type: "words", words: [{ word: "Pizza", clue: "" }] }), RoomError);
  await as(0, { type: "words", words: [{ word: "Pizza", clue: "food" }] });
});

test("joker needs the imposter clue off", async () => {
  const db = store();
  const { code, pid, token } = await createRoom(db, "Lisa", { joker: true, hint: true });
  assert.equal((await view(db, code, pid, token)).settings.joker, false);
});

test("ready check, guided turns, imposter guess, rounds and new game", async () => {
  const db = store();
  const host = await createRoom(db, "Lisa", { rounds: 1, guess: true, lang: "de", cats: ["food"] });
  const others = await Promise.all(["Nora", "Tim", "Beni"].map((n) => joinRoom(db, host.code, n)));
  const seats = await Promise.all([host, ...others].map(async (p) => ({ p, me: (await view(db, host.code, p.pid, p.token)).me })));
  const all = seats.sort((a, b) => a.me - b.me).map((x) => x.p);
  const as = (i: number, a: Parameters<typeof act>[4]) => act(db, host.code, all[i].pid, all[i].token, a);
  const see = (i: number) => view(db, host.code, all[i].pid, all[i].token);

  assert.equal((await see(1)).settings.lang, "de"); // one language for the whole room
  await as(0, { type: "start" });
  for (const i of [0, 1, 2]) await as(i, { type: "ready" });
  assert.equal((await see(0)).phase, "reveal"); // still waiting for Beni
  assert.equal((await see(0)).ready, 3);
  await as(3, { type: "ready" });
  const d = await see(0);
  assert.equal(d.phase, "discuss");

  // only the current speaker (or the host) can hand over
  const speaker = d.starter!;
  const other = [1, 2, 3].find((i) => i !== speaker)!;
  await assert.rejects(as(other, { type: "spoke" }), RoomError);
  await as(speaker, { type: "spoke" });
  assert.equal((await see(0)).spoken, 1);

  // everyone votes for the imposter → caught → guess phase; guessing the German word counts
  const views = await Promise.all([0, 1, 2, 3].map(see));
  const imp = views.findIndex((v) => v.card?.imposter);
  const word = (views.find((v) => v.card && !v.card.imposter)!.card as { word: Record<string, string> }).word;
  await as(0, { type: "startVote" });
  for (const i of [0, 1, 2, 3]) await as(i, { type: "vote", target: i === imp ? (imp + 1) % 4 : imp });
  assert.equal((await see(imp)).phase, "guess");
  await assert.rejects(as((imp + 1) % 4, { type: "guess", text: word.de }), RoomError); // only the accused guesses
  await as(imp, { type: "guess", text: ` ${word.de.toLowerCase()} ` });
  const r = await see(0);
  assert.equal(r.phase, "result");
  assert.deepEqual(r.guess, { text: word.de.toLowerCase(), correct: true });
  assert.equal(r.history.at(-1)?.guessed, true);

  // 1 round per game → game over: "start" is refused, "newGame" resets the stats
  assert.equal(r.gameOver, true);
  await assert.rejects(as(0, { type: "start" }), RoomError);
  await as(0, { type: "newGame" });
  const n = await see(0);
  assert.equal(n.phase, "reveal");
  assert.equal(n.history.length, 0);
});

test("room codes have 5 characters without lookalikes", async () => {
  const db = store();
  for (let i = 0; i < 20; i++) assert.match((await createRoom(db, "Lisa", {})).code, /^[A-HJ-NP-Z2-9]{5}$/);
});
