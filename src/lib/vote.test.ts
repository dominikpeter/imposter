import { test } from "node:test";
import assert from "node:assert/strict";
import { tally } from "./vote.ts";

test("clear majority accuses that player", () => {
  assert.deepEqual(tally([2, 2, 0, 2], 4), { counts: [1, 0, 3, 0], accused: 2 });
});

test("tie at the top accuses no one", () => {
  assert.equal(tally([1, 0, 1, 0], 4).accused, null);
});

test("tie below the top does not matter", () => {
  assert.equal(tally([3, 3, 0, 1, 3], 5).accused, 3);
});
