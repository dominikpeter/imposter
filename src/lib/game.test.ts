import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeWritten, newRound, packSecret } from "./game.ts";
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
