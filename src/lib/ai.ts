import { createHash } from "node:crypto";
import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { exactReview, wordKey, type Draft, type Review } from "./game.ts";
import { later, recordAi } from "./metrics.ts";
import { db } from "./store.ts";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-6-luna";
// explicit base URL: don't inherit a machine-wide OPENAI_BASE_URL (e.g. a local dev proxy)
const openai = createOpenAI({ baseURL: "https://api.openai.com/v1" });

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
 * Without OPENAI_API_KEY (or if the call fails) it falls back to the exact checks only.
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
  if (!useAi || !process.env.OPENAI_API_KEY || !draft.length) return exact;
  const key = reviewKey(draft, taken, lang);
  void db.set(`${key}:pending`, true, { ex: 10 }).catch(() => {});
  try {
    const { output, usage } = await generateText({
      model: openai(MODEL),
      output: Output.object({ schema }),
      providerOptions: { openai: { reasoningEffort: "none", store: false } satisfies OpenAILanguageModelResponsesOptions },
      instructions,
      prompt: JSON.stringify({ uiLanguage: lang, TAKEN: taken, words: draft }),
    });
    later(() => recordAi(who, usage));
    const fixed: Draft[] = draft.map((d, i) => ({
      word: (output.results[i]?.word || d.word).trim().slice(0, 40),
      clue: (output.results[i]?.hint || d.clue).trim().slice(0, 40), // an empty AI hint never erases the writer's
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
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { text, usage } = await generateText({
      model: openai(MODEL),
      // priority processing: measured ~0.8 s instead of 1.6–2.7 s; a call is ~100 tokens, so the premium is tiny
      providerOptions: { openai: { reasoningEffort: "none", store: false, ...(fast ? { serviceTier: "priority" } : {}) } satisfies OpenAILanguageModelResponsesOptions },
      maxOutputTokens: 80,
      instructions:
        "Explain the given word in 1-2 short, simple sentences (at most 30 words) for a party game player who doesn't know it. " +
        'Answer in the language with this code: "' + lang + '" (German: Swiss spelling, "ss" not "ß"). No lists, no markdown.',
      prompt: word,
    });
    later(() => recordAi(who, usage));
    const clean = text.trim();
    if (clean) later(() => db.set(explainKey(word, lang), clean, { ex: 90 * 86_400 }));
    return clean || null;
  } catch (e) {
    console.warn("explainWord failed:", (e as Error).message);
    return null;
  }
}
