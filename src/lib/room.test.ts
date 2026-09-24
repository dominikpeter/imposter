import { test } from "node:test";
import assert from "node:assert/strict";
import { act, createRoom, joinRoom, RoomError, view } from "./room.ts";
import { db as envStore, memoryStore, persistent } from "./store.ts";

// in-memory by default; set UPSTASH_REDIS_REST_URL/TOKEN (e.g. scripts/upstash-local.mjs) to run against Redis
const store = () => (persistent ? envStore : memoryStore());

async function setup(mode: "packs" | "custom") {
  const db = store();
  const host = await createRoom(db, "Lisa", { mode, perPlayer: 1, imposterCount: 1 });
  const others = await Promise.all(["Nora", "Tim", "Beni"].map((n) => joinRoom(db, host.code, n)));
  const all = [host, ...others];
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
