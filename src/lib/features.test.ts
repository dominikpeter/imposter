import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, LANGS, UI } from "./i18n.ts";
import { act, createRoom, joinRoom, MAX_PLAYERS, RoomError, view } from "./room.ts";
import { memoryStore } from "./store.ts";
import { exactReview } from "./game.ts";

// feature-list audit: gaps not covered by the other unit tests

test("word packs: 1,080 words in 27 topics (Nerd included), every word and topic name in EN/FR/DE", () => {
  assert.equal(CATEGORIES.length, 27); // README/MANUAL: 27 topics including Nerd
  assert.ok(CATEGORIES.some((c) => c.id === "nerd"));
  assert.equal(CATEGORIES.reduce((n, c) => n + c.words.length, 0), 1080);
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, CATEGORIES.length);
  for (const c of CATEGORIES) {
    for (const l of LANGS) assert.ok(c.name[l.id]?.trim(), `${c.id} name ${l.id}`);
    for (const w of c.words) for (const l of LANGS) assert.ok(w[l.id]?.trim(), `${c.id} ${JSON.stringify(w)} ${l.id}`);
  }
});

test("every UI string exists in EN, FR and DE and contains no emoji", () => {
  const emoji = /\p{Extended_Pictographic}/u;
  for (const [key, v] of Object.entries(UI)) {
    for (const l of LANGS) {
      const s = (v as Record<string, string>)[l.id];
      assert.ok(typeof s === "string" && s.trim(), `${key} ${l.id}`);
      assert.ok(!emoji.test(s), `${key} ${l.id} has an emoji`);
    }
  }
});

async function room(settings: Parameters<typeof createRoom>[2], n: number) {
  const db = memoryStore();
  const host = await createRoom(db, "Host", { ai: false, ...settings }); // exact checks only, no OpenAI
  const others = [];
  for (let i = 1; i < n; i++) others.push(await joinRoom(db, host.code, `P${i}`));
  // index i = seat in the room (same-millisecond joins are ordered by id)
  const seats = await Promise.all([host, ...others].map(async (p) => ({ p, me: (await view(db, host.code, p.pid, p.token)).me })));
  const all = seats.sort((a, b) => a.me - b.me).map((x) => x.p);
  const as = (i: number, a: Parameters<typeof act>[4]) => act(db, host.code, all[i].pid, all[i].token, a);
  const see = (i: number) => view(db, host.code, all[i].pid, all[i].token);
  return { db, host, all, as, see };
}

test("rooms: at most 20 players; the 21st is turned away as full", async () => {
  const { db, host, see } = await room({}, MAX_PLAYERS);
  assert.equal((await see(0)).players.length, 20);
  await assert.rejects(joinRoom(db, host.code, "Late"), (e: RoomError) => e.code === "full" && e.status === 409);
});

test("rooms: input is clipped and cleaned (name 24 chars, settings clamped)", async () => {
  const db = memoryStore();
  const r = await createRoom(db, `  ${"x".repeat(100)}  `, { imposterCount: 99, rounds: 999, perPlayer: 42, lang: "xx" as never, cats: ["nope"] });
  const v = await view(db, r.code, r.pid, r.token);
  assert.equal(v.players[0], "x".repeat(24));
  assert.equal(v.settings.imposterCount, 10);
  assert.equal(v.settings.rounds, 30);
  assert.equal(v.settings.perPlayer, 5);
  assert.equal(v.settings.lang, "en");
  assert.equal(v.settings.cats.length, CATEGORIES.length); // unknown topics → all topics
  await assert.rejects(createRoom(db, "   ", {}), RoomError); // blank name
});

test("rooms: 2 imposters with 5 players; imposters are capped at half the table", async () => {
  const five = await room({ imposterCount: 2 }, 5);
  await five.as(0, { type: "start" });
  const cards = await Promise.all([0, 1, 2, 3, 4].map(five.see));
  const imps = cards.filter((v) => v.card?.imposter);
  assert.equal(imps.length, 2);
  // imposters don't learn who the other imposter is
  for (const v of imps) assert.deepEqual(Object.keys(v.card!).sort(), ["clue", "imposter", "jokerHint"]);

  const three = await room({ imposterCount: 5 }, 3);
  await three.as(0, { type: "start" });
  assert.equal((await Promise.all([0, 1, 2].map(three.see))).filter((v) => v.card?.imposter).length, 1);
});

test("rooms: guided turns go round the table from the starter; host-only 'another round of words'", async () => {
  const { as, see } = await room({}, 3);
  await as(0, { type: "start" });
  await as(0, { type: "discuss" }); // host may skip the ready check
  const starter = (await see(0)).starter!;
  for (let k = 0; k < 3; k++) {
    const speaker = (starter + k) % 3;
    const bystander = [1, 2].find((i) => i !== speaker);
    if (bystander !== undefined) await assert.rejects(as(bystander, { type: "spoke" }), RoomError);
    await as(speaker, { type: "spoke" });
    assert.equal((await see(1)).spoken, k + 1);
  }
  await assert.rejects(as(0, { type: "spoke" }), RoomError); // everyone spoke
  await assert.rejects(as(1, { type: "moreWords" }), RoomError); // host only
  await as(0, { type: "moreWords" });
  const v = await see(2);
  assert.equal(v.wordRound, 2);
  assert.equal(v.spoken, 0);
});

test("rooms: a skipped vote finishes the round with no accusation and counts toward the game", async () => {
  const { as, see } = await room({ rounds: 2 }, 3);
  await as(0, { type: "start" });
  await as(0, { type: "discuss" });
  await assert.rejects(as(1, { type: "skipVote" }), RoomError); // host only
  await as(0, { type: "skipVote" });
  const v = await see(1);
  assert.equal(v.phase, "result");
  assert.equal(v.result?.accused, null);
  assert.equal(v.history.length, 1);
  assert.equal(v.gameOver, false);
});

test("rooms: a wrong imposter guess means the crew wins", async () => {
  const { as, see } = await room({ guess: true }, 3);
  await as(0, { type: "start" });
  await as(0, { type: "discuss" });
  await as(0, { type: "startVote" });
  const imp = (await Promise.all([0, 1, 2].map(see))).findIndex((v) => v.card?.imposter);
  for (const i of [0, 1, 2]) await as(i, { type: "vote", target: i === imp ? (imp + 1) % 3 : imp });
  await as(imp, { type: "guess", text: "definitely-not-the-word" });
  const r = await see(0);
  assert.equal(r.phase, "result");
  assert.deepEqual(r.guess, { text: "definitely-not-the-word", correct: false });
  assert.equal(r.history.at(-1)?.guessed, false);
});

test("word check without AI: exact duplicates are caught, case- and space-insensitive", () => {
  const r = exactReview([{ word: "  apple ", clue: "" }, { word: "Moon", clue: "" }, { word: "moon", clue: "" }], ["Apple"]);
  assert.deepEqual(r.map((x) => x.problem), ["taken", null, "twice"]);
});
