import { test } from "node:test";
import assert from "node:assert/strict";
import { checkWords, explain } from "./ai.ts";
import { setAiEnabled } from "./rateLimit.ts";

// The AI gate decides before any model call; these run without an OpenAI key.
test("AI gate: signed out → exact checks only", async () => {
  const r = await checkWords([{ word: "Pizza", clue: "" }], ["pizza"], "en", null);
  assert.equal(r[0].problem, "taken"); // exact duplicate still caught without AI
});

test("AI gate: admin switch off → explain refuses, word checks fall back to exact", async () => {
  await setAiEnabled(false);
  try {
    assert.equal(await explain("Astronaut", "en", "u-gate"), "rate_limited");
    const r = await checkWords([{ word: "Moon", clue: "" }], [], "en", "u-gate");
    assert.equal(r[0].problem, null);
  } finally {
    await setAiEnabled(true);
  }
});
