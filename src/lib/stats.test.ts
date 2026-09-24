import { test } from "node:test";
import assert from "node:assert/strict";
import { stats, type RoundLog } from "./stats.ts";

const names = ["Lisa", "Nora", "Tim"];

test("scores crew catches, imposter escapes and skipped votes", () => {
  const h: RoundLog[] = [
    { names, imposters: [1], accused: 1, votes: [1, 0, 1], word: "a" }, // Nora caught; Lisa+Tim right
    { names, imposters: [2], accused: 0, votes: [2, 0, 0], word: "b" }, // Tim escapes, Lisa right
    { names, imposters: [0], accused: null, votes: null, word: "c" }, // skipped: nobody scores
  ];
  const s = stats(h);
  assert.equal(s.rounds, 3);
  assert.equal(s.crewWins, 1);
  assert.equal(s.imposterWins, 1);
  const p = Object.fromEntries(s.players.map((x) => [x.name, x]));
  assert.deepEqual([p.Lisa.points, p.Nora.points, p.Tim.points], [2, 0, 3]);
  assert.equal(p.Tim.escaped, 1);
  assert.equal(p.Lisa.votesTaken, 3);
  assert.equal(p.Lisa.imposter, 1);
  assert.equal(s.players[0].name, "Tim"); // leaderboard order
});
