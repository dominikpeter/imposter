import { createOpenAI, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { exactReview, wordKey, type Draft, type Review } from "./game.ts";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-6-luna";
// explicit base URL: don't inherit a machine-wide OPENAI_BASE_URL (e.g. a local dev proxy)
const openai = createOpenAI({ baseURL: "https://api.openai.com/v1" });

const schema = z.object({
  results: z.array(
    z.object({
      word: z.string().describe("the word with spelling fixed; same language and meaning"),
      hint: z.string().describe("the hint with spelling fixed, or empty"),
      tooHard: z.boolean(),
      sameAs: z.string().describe('the TAKEN word it duplicates, copied exactly, or ""'),
    }),
  ),
});

const instructions = `You check secret words that players type into "Imposter", a party game where everyone describes the word with one-word hints.
For each word, in order:
- word: fix spelling and capitalisation only. Keep the language the player used, never translate or swap it for another word. German: Swiss spelling ("ss", never "ß").
- hint: fix its spelling the same way (keep empty if empty).
- tooHard: true if most players (teens included) wouldn't know it, it's very technical or obscure, or it isn't a real word or well-known name.
- sameAs: if the word means the same thing as one of the TAKEN words (same thing, synonym, translation, plural, other spelling), copy that TAKEN word exactly; otherwise "".`;

/**
 * Autocorrect + "too hard" + duplicate check for players' own words.
 * Exact duplicates are always caught; the AI adds spelling fixes, difficulty and same-meaning duplicates.
 * Without OPENAI_API_KEY (or if the call fails) it falls back to the exact checks only.
 */
export async function reviewWords(draft: Draft[], taken: string[], lang: string, useAi = true): Promise<Review[]> {
  const exact = exactReview(draft, taken);
  if (!useAi || !process.env.OPENAI_API_KEY || !draft.length) return exact;
  try {
    const { output } = await generateText({
      model: openai(MODEL),
      output: Output.object({ schema }),
      providerOptions: { openai: { reasoningEffort: "none", store: false } satisfies OpenAILanguageModelResponsesOptions },
      instructions,
      prompt: JSON.stringify({ uiLanguage: lang, TAKEN: taken, words: draft }),
    });
    const fixed: Draft[] = draft.map((d, i) => ({
      word: (output.results[i]?.word || d.word).trim().slice(0, 40),
      clue: (output.results[i]?.hint || d.clue).trim().slice(0, 40), // an empty AI hint never erases the writer's
    }));
    // exact checks again on the corrected words (a fix can turn into a duplicate)
    return exactReview(fixed, taken).map((r, i) => {
      if (r.problem) return r;
      const ai = output.results[i];
      const same = ai?.sameAs ? taken.findIndex((t) => wordKey(t) === wordKey(ai.sameAs)) : -1;
      if (same >= 0) return { ...r, problem: "taken", taken: same };
      return ai?.tooHard ? { ...r, problem: "too_hard" } : r;
    });
  } catch (e) {
    console.warn("reviewWords: AI check failed, exact checks only:", (e as Error).message);
    return exact;
  }
}

/** A short, kid-friendly explanation of a secret word for crew members who don't know it (never shown to imposters). */
export async function explainWord(word: string, lang: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { text } = await generateText({
      model: openai(MODEL),
      providerOptions: { openai: { reasoningEffort: "none", store: false } satisfies OpenAILanguageModelResponsesOptions },
      maxOutputTokens: 200,
      instructions:
        "Explain the given word in 1-2 short, simple sentences for a party game player who doesn't know it. " +
        'Answer in the language with this code: "' + lang + '" (German: Swiss spelling, "ss" not "ß"). No lists, no markdown.',
      prompt: word,
    });
    return text.trim() || null;
  } catch (e) {
    console.warn("explainWord failed:", (e as Error).message);
    return null;
  }
}
