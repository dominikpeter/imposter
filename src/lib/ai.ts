import { createHash } from "node:crypto";
import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { exactReview, wordKey, type Draft, type Review } from "./game.ts";
import { later, recordAi } from "./metrics.ts";
import { db } from "./store.ts";
import { aiEnabled, allowAi } from "./rateLimit.ts";

// gpt-6-luna without reasoning: through OpenRouter (OPENROUTER_API_KEY) on OpenAI's priority tier ("openai/fast"), and
// straight at OpenAI (OPENAI_API_KEY) as the fallback when OpenRouter fails (e.g. its requests-per-minute cap for new
// accounts). Benchmarked Sep 2026 against DeepSeek, GLM, MiMo, Hy3 and gpt-oss-120b: most accurate, word check ~0.9 s.
// OPENROUTER_MODEL=openai/gpt-oss-120b switches to the model Zettelispiil uses (always reasons: low effort, fastest host).
// Both speak the OpenAI API, so one SDK; explicit base URLs: never inherit a machine-wide OPENAI_BASE_URL (dev proxy).
const LANGUAGE: Record<string, string> = { en: "English", fr: "French", de: "German" };
const ROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openai/gpt-6-luna";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-6-luna";
const reasons = /gpt-oss/.test(ROUTER_MODEL); // can't switch reasoning off
// OpenRouter routing isn't an AI SDK option: add it to the request body. `order` + fallbacks, not `only`: when the
// preferred host is busy, another one answers instead of an error.
const routing = reasons ? { sort: "latency", require_parameters: true } : { order: ["openai/fast"], allow_fallbacks: true };
const withRouting: typeof fetch = (url, init) => {
  if (typeof init?.body !== "string") return fetch(url, init);
  return fetch(url, { ...init, body: JSON.stringify({ ...JSON.parse(init.body), provider: routing }) });
};
// maxTokens: room for the answer; a reasoning model spends part of it thinking before it writes anything
type Route = { name: string; model: () => LanguageModel; options: (fast: boolean) => ProviderOptions; maxTokens: number };
const routes: Route[] = [];
if (process.env.OPENROUTER_API_KEY) {
  const router = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY, fetch: withRouting });
  routes.push({
    name: "openrouter",
    model: () => router.chat(ROUTER_MODEL), // Chat Completions API
    options: () => ({ openai: { reasoningEffort: reasons ? "low" : "none" } }), // thinking only adds seconds here
    maxTokens: reasons ? 600 : 80,
  });
}
if (process.env.OPENAI_API_KEY) {
  const openai = createOpenAI({ baseURL: "https://api.openai.com/v1" });
  routes.push({
    name: "openai",
    model: () => openai(OPENAI_MODEL),
    // no thinking, no stored logs; priority tier when a player waits (measured ~0.8 s instead of 1.6–2.7 s, tiny premium)
    options: (fast) => ({ openai: { reasoningEffort: "none", store: false, ...(fast ? { serviceTier: "priority" } : {}) } satisfies OpenAILanguageModelResponsesOptions }),
    maxTokens: 80,
  });
}
export const aiConfigured = routes.length > 0;

/** Runs one AI call on the first route that answers; throws only if every route failed. */
async function firstAnswer<T>(run: (r: Route) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const r of routes) {
    try {
      return await run(r);
    } catch (e) {
      last = e;
      if (r !== routes.at(-1)) console.warn(`AI via ${r.name} failed, trying the next route:`, (e as Error).message);
    }
  }
  throw last;
}

// kept short on purpose: every token here is sent (and paid for) on every word check
const schema = z.object({
  results: z.array(z.object({ word: z.string(), hint: z.string(), tooHard: z.boolean(), sameAs: z.string() })),
});

const instructions = `Party game word check. For each word, in order:
word: "" if spelled right; else the word with spelling and capitals fixed (same language, never translate; German "ss", not "ß").
hint: "" unless its spelling needs a fix; then the fixed hint.
tooHard: true if a typical teen wouldn't know it, it's technical/scientific jargon, or not a real word.
sameAs: the TAKEN entry meaning the same thing (synonym, translation, plural, variant), copied exactly; else "".`;

/**
 * Autocorrect + "too hard" + duplicate check for players' own words.
 * Exact duplicates are always caught; the AI adds spelling fixes, difficulty and same-meaning duplicates.
 * Without an AI key (or if the call fails) it falls back to the exact checks only.
 */
// A check started while the player was still typing (prefetch) lands here; "Done" with the same input then gets it
// instantly instead of waiting ~1 s for the model again. Keyed by the exact input, short-lived.
const reviewKey = (draft: Draft[], taken: string[], lang: string) =>
  `review:${createHash("sha1").update(JSON.stringify([draft, taken, lang])).digest("base64url")}`;
export async function cachedReview(draft: Draft[], taken: string[], lang: string) {
  const key = reviewKey(draft, taken, lang);
  try {
    // a prefetch for the same input still running (Done tapped at ~1 s): wait for it instead of paying twice
    for (let i = 0; i < 20; i++) {
      const [hit, pending] = await Promise.all([db.get<Review[]>(key), db.get<boolean>(`${key}:pending`)]);
      if (hit || !pending) return hit;
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {}
  return null;
}

// `who`: the account the call runs on (a user id, or the room host's), for the admin usage stats
export async function reviewWords(draft: Draft[], taken: string[], lang: string, useAi = true, who?: string): Promise<Review[]> {
  const exact = exactReview(draft, taken);
  if (!useAi || !aiConfigured || !draft.length) return exact;
  const key = reviewKey(draft, taken, lang);
  void db.set(`${key}:pending`, true, { ex: 10 }).catch(() => {});
  try {
    const { output, usage } = await firstAnswer((r) =>
      generateText({
        model: r.model(),
        output: Output.object({ schema }),
        providerOptions: r.options(true), // a player is waiting on "Done"
        instructions,
        prompt: JSON.stringify({ uiLanguage: lang, TAKEN: taken, words: draft }),
      }),
    );
    later(() => recordAi(who, usage));
    // Swiss spelling for sure, in code: louder prompt wording for it made the model put spelling fixes in the hint
    // instead of the word ("Guitarr" came back unchanged with hint "Guitar"); ß never appears in Swiss German
    const swiss = (s: string) => s.replace(/ß/g, "ss").replace(/ẞ/g, "SS");
    const fixed: Draft[] = draft.map((d, i) => ({
      word: swiss(output.results[i]?.word || d.word).trim().slice(0, 40),
      // the AI only corrects a hint the writer typed, never invents one: models tend to echo the word back as its
      // "fixed hint", and the imposter would see that as their clue. An empty AI hint never erases the writer's.
      clue: d.clue ? swiss(output.results[i]?.hint || d.clue).trim().slice(0, 40) : "",
    }));
    // exact checks again on the corrected words (a fix can turn into a duplicate)
    const result: Review[] = exactReview(fixed, taken).map((r, i) => {
      if (r.problem) return r;
      const ai = output.results[i];
      const same = ai?.sameAs ? taken.findIndex((t) => wordKey(t) === wordKey(ai.sameAs)) : -1;
      if (same >= 0) return { ...r, problem: "taken", taken: same };
      return ai?.tooHard ? { ...r, problem: "too_hard" } : r;
    });
    await db.set(key, result, { ex: 600 }).catch(() => {}); // before answering: a Done right after finds it
    return result;
  } catch (e) {
    console.warn("reviewWords: AI check failed, exact checks only:", (e as Error).message);
    return exact;
  }
}

// Explanations don't depend on who asks: pack words come up again and again, so a cached one answers in
// milliseconds without an AI call (and without using anyone's AI budget)
const explainKey = (word: string, lang: string) => `explain:${lang}:${wordKey(word)}`;
export const cachedExplanation = (word: string, lang: string) => db.get<string>(explainKey(word, lang)).catch(() => null);

/** Fill the cache ahead of time (scripts/warm-explanations.mts): true if a new explanation was stored. */
export async function warmExplanation(word: string, lang: string) {
  if (await cachedExplanation(word, lang)) return false;
  const text = await explainWord(word, lang, undefined, false); // batch: nobody waits, standard tier is cheaper
  if (text) await db.set(explainKey(word, lang), text, { ex: 90 * 86_400 });
  return !!text;
}

/** A short, kid-friendly explanation of a secret word for crew members who don't know it (never shown to imposters). */
export async function explainWord(word: string, lang: string, who?: string, fast = true): Promise<string | null> {
  if (!aiConfigured) return null;
  try {
    const { text, usage } = await firstAnswer((r) =>
      generateText({
        model: r.model(),
        providerOptions: r.options(fast), // priority when a player waits; batch warming takes the cheaper standard tier
        maxOutputTokens: r.maxTokens,
        // the language by name: given just the code next to the German spelling note, gpt-oss answered "fr" in German
        instructions:
          "Explain the given word in 1-2 short, simple sentences (at most 30 words) for a party game player who doesn't know it. " +
          `Answer in ${LANGUAGE[lang] ?? "English"} only.` + (lang === "de" ? ' Swiss spelling: "ss", never "ß".' : "") + " No lists, no markdown.",
        prompt: word,
      }),
    );
    later(() => recordAi(who, usage));
    const clean = text.trim();
    if (clean) later(() => db.set(explainKey(word, lang), clean, { ex: 90 * 86_400 }));
    return clean || null;
  } catch (e) {
    console.warn("explainWord failed:", (e as Error).message);
    return null;
  }
}

// ---- the AI gate: every entry point (routes and rooms) goes through these two ----
// cached answer (only while the admin switch is on) → the account's budget → the model

/** Word check for `account` (a user id, or null = signed out / AI off: exact checks only). */
export async function checkWords(draft: Draft[], taken: string[], lang: string, account: string | null): Promise<Review[]> {
  if (!account) return exactReview(draft, taken);
  const [hit, on] = await Promise.all([cachedReview(draft, taken, lang), aiEnabled()]);
  if (hit && on) return hit;
  return reviewWords(draft, taken, lang, await allowAi(`user:${account}`), account);
}

/** Explanation on `account`'s budget; "rate_limited" when the budget (or the admin switch) says no. */
export async function explain(word: string, lang: string, account: string): Promise<string | null | "rate_limited"> {
  const [hit, on] = await Promise.all([cachedExplanation(word, lang), aiEnabled()]);
  if (hit && on) return hit;
  if (!(await allowAi(`user:${account}`))) return "rate_limited";
  return explainWord(word, lang, account);
}
