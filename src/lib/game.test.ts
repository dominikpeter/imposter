import { test } from "node:test";
import assert from "node:assert/strict";
import { earnJokers, exactReview, mergeWritten, reviewNotes, newRound, packSecret, spendJokers, uniqueNames, wordHint } from "./game.ts";
import { CATEGORIES } from "./i18n.ts";

test("pack words never repeat until the topic is exhausted", () => {
  const used = new Set<string>();
  const n = CATEGORIES[0].words.length;
  for (let i = 0; i < n; i++) {
    const s = packSecret([CATEGORIES[0].id], used);
    assert.ok(!used.has(s.key), `repeat at ${i}`);
    used.add(s.key);
  }
  assert.ok(packSecret([CATEGORIES[0].id], used)); // exhausted → starts over instead of crashing
});

test("duplicate written words merge and exclude every author", () => {
  let pool = mergeWritten([], [{ word: "Pizza", clue: "" }], 1);
  pool = mergeWritten(pool, [{ word: " pizza ", clue: "food" }, { word: "Moon", clue: "" }], 2);
  assert.equal(pool.length, 2);
  assert.deepEqual(pool[0].authors, [1, 2]);
  assert.equal(pool[0].clue, "food");
  for (let i = 0; i < 50; i++) {
    const r = newRound(4, 2, pool[0]);
    assert.ok(r.imposters.every((p) => p !== 1 && p !== 2));
    assert.equal(r.imposters.length, 2);
  }
});

test("joker hint: first letter + blanks for packs, the writer's hint for own words", () => {
  assert.deepEqual(wordHint({ word: { en: "Ice cream", fr: "Glace", de: "Glace" }, clue: "" }), {
    en: "I _ _   _ _ _ _ _",
    fr: "G _ _ _ _",
    de: "G _ _ _ _",
  });
  assert.equal(wordHint({ word: "Pizza", clue: "food" }), "food");
});

test("jokers: survivors earn one, the next imposter round spends it", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(earnJokers([1], 2, ids, []), ["b"]); // b escaped
  assert.deepEqual(earnJokers([1], 1, ids, []), []); // b caught
  assert.deepEqual(earnJokers([1], null, ids, []), []); // vote skipped
  assert.deepEqual(earnJokers([1, 3], 3, ids, ["b"]), ["b"]); // no double jokers
  assert.deepEqual(spendJokers([1], ids, ["b", "c"]), { jokered: [1], holders: ["c"] });
  assert.deepEqual(spendJokers([0], ids, ["b"]), { jokered: [], holders: ["b"] });
});

test("exact review: another player's word and repeats in one draft", () => {
  const r = exactReview([{ word: " pizza ", clue: "" }, { word: "Moon", clue: "" }, { word: "moon", clue: "x" }], ["Sun", "Pizza"]);
  assert.deepEqual(r.map((x) => [x.problem, x.taken]), [["taken", 1], [null, -1], ["twice", -1]]);
  assert.equal(r[0].word, "pizza");
});

test("review notes: corrections shown, rejected words cleared, clean drafts accepted", () => {
  const draft = [{ word: "Bananna", clue: "" }, { word: "Pizza", clue: "" }, { word: "Moon", clue: "" }];
  const r = reviewNotes(draft, [
    { word: "Banana", clue: "", problem: null, taken: -1 },
    { word: "Pizza", clue: "", problem: "taken", taken: 0 },
    { word: "Moon", clue: "", problem: null, taken: -1 },
  ]);
  assert.deepEqual(r.notes, ["corrected", "taken", null]);
  assert.deepEqual(r.fixed.map((f) => f.word), ["Banana", "", "Moon"]);
  assert.equal(r.ok, false);
  assert.equal(reviewNotes([{ word: "Moon", clue: "" }], [{ word: "Moon", clue: "", problem: null, taken: -1 }]).ok, true);
});

test("the draw is fair: every player is imposter and starter about equally often", () => {
  const n = 5, rounds = 20_000;
  const imp = Array(n).fill(0), start = Array(n).fill(0);
  const secret = { word: "x", clue: "", authors: [], key: "x" };
  for (let r = 0; r < rounds; r++) {
    const round = newRound(n, 1, secret);
    imp[round.imposters[0]]++;
    start[round.starter]++;
  }
  for (const c of [...imp, ...start]) assert.ok(Math.abs(c / rounds - 1 / n) < 0.02, `share ${c / rounds}`);
  // two imposters are always two different players
  for (let r = 0; r < 1000; r++) assert.equal(new Set(newRound(n, 2, secret).imposters).size, 2);
});

test("every topic is selected by default, Nerd included", async () => {
  const { DEFAULT_CATS } = await import("./i18n.ts");
  assert.equal(DEFAULT_CATS.length, CATEGORIES.length);
  assert.ok(DEFAULT_CATS.includes("nerd"));
  assert.match(packSecret(["nerd"], new Set()).key, /^nerd:/);
});

test("duplicate names get a number", () => {
  assert.deepEqual(uniqueNames(["Tim", "Nora", "tim", "Tim"]), ["Tim", "Nora", "tim 2", "Tim 3"]);
});
