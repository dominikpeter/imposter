import { test } from "node:test";
import assert from "node:assert/strict";
import { stats, winners, type RoundLog } from "./stats.ts";

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

test("a caught imposter who guesses the word escapes; timeline is cumulative", () => {
  const s = stats([
    { names, imposters: [1], accused: 1, votes: [1, 0, 1], word: "a", guessed: true }, // Nora caught but guessed
    { names, imposters: [2], accused: 2, votes: [2, 2, 0], word: "b" }, // Tim caught
  ]);
  assert.equal(s.imposterWins, 1);
  assert.equal(s.crewWins, 1);
  const p = Object.fromEntries(s.players.map((x) => [x.name, x]));
  assert.equal(p.Nora.escaped, 1);
  assert.deepEqual(s.timeline, [
    { Lisa: 1, Nora: 2, Tim: 1 },
    { Lisa: 2, Nora: 3, Tim: 1 },
  ]);
});

test("a draw names every leader", () => {
  const r = (accused: number) => ({ names: ["A", "B", "C"], imposters: [0], accused, votes: [1, 0, 0], word: "x" });
  assert.deepEqual(winners([r(0)]), ["B", "C"]); // both caught the imposter: 1 point each
});
