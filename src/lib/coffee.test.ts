import assert from "node:assert/strict";
import { test } from "node:test";
import { coffeeAmount, MAX_CHF } from "./coffee.ts";

test("coffee sizes and custom amounts", () => {
  assert.equal(coffeeAmount({ size: "small" }), 1);
  assert.equal(coffeeAmount({ size: "big" }), 5);
  assert.equal(coffeeAmount({ size: "deluxe" }), 10);
  assert.equal(coffeeAmount({ chf: 3 }), 3);
  assert.equal(coffeeAmount({ chf: MAX_CHF }), MAX_CHF);
  for (const bad of [{ size: "toString" }, { size: "huge" }, { chf: 0 }, { chf: -5 }, { chf: 2.5 }, { chf: MAX_CHF + 1 }, { chf: "5" }, {}])
    assert.equal(coffeeAmount(bad), null, JSON.stringify(bad));
});
