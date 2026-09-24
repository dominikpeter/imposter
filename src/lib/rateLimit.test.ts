import { test } from "node:test";
import assert from "node:assert/strict";
import { allowAi } from "./rateLimit.ts";

test("AI limit: per client per minute, plus one daily budget for everyone", async () => {
  const k = `t${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(await allowAi(k, 3, 1e9), true);
  assert.equal(await allowAi(k, 3, 1e9), false); // 4th call this minute
  assert.equal(await allowAi(`${k}-other`, 3, 1e9), true); // other clients unaffected
  assert.equal(await allowAi(`${k}-x`, 100, 0), false); // daily budget used up blocks everyone
});
