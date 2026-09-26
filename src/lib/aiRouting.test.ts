import assert from "node:assert/strict";
import { test } from "node:test";

// What the app actually sends to OpenRouter, without a key or the network: fetch is stubbed before ai.ts builds its
// routes (node --test runs each file in its own process, so this stays here). CI has no AI key, so this is the only
// check that the model, the reasoning setting and the provider routing reach the request body.
process.env.OPENROUTER_API_KEY = "sk-or-test";
delete process.env.OPENAI_API_KEY; // OpenRouter is the only route: a request that fails can't be answered elsewhere
delete process.env.OPENROUTER_MODEL;

const sent: Record<string, unknown>[] = [];
globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  sent.push(body);
  const content = body.response_format
    ? JSON.stringify({ results: [{ word: "Banana", hint: "", tooHard: false, sameAs: "" }] })
    : "Melted cheese you dip bread into.";
  return new Response(
    JSON.stringify({
      id: "gen-test", object: "chat.completion", created: 0, model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof fetch;

// imported only now, after the key and the stub: ai.ts builds its routes from the environment when it first loads
const ai = () => import("./ai.ts");

test("OpenRouter request: gpt-6-luna, no reasoning, OpenAI's priority tier preferred with fallbacks", async () => {
  const { explainWord } = await ai();
  sent.length = 0;
  assert.equal(await explainWord("Fondue", "en", undefined, true), "Melted cheese you dip bread into.");
  const [body] = sent;
  assert.equal(body.model, "openai/gpt-6-luna");
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.deepEqual(body.provider, { order: ["openai/fast"], allow_fallbacks: true });
});

test("the word check asks for structured JSON and reads it back", async () => {
  const { reviewWords } = await ai();
  sent.length = 0;
  const [r] = await reviewWords([{ word: "Bananna", clue: "" }], [], "en");
  assert.equal(r.word, "Banana");
  assert.equal(r.clue, ""); // the AI never invents a clue
  const format = sent[0].response_format as { type: string };
  assert.equal(format.type, "json_schema");
  assert.deepEqual(sent[0].provider, { order: ["openai/fast"], allow_fallbacks: true });
});
