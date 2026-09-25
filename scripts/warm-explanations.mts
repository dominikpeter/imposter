// Precompute "Explain with AI" for every pack word in EN/FR/DE, so crew members get instant answers.
// Skips what's cached already. Run with the target's env, e.g. `just warm-explanations` (production).
import { warmExplanation } from "../src/lib/ai.ts";
import { CATEGORIES, LANGS } from "../src/lib/i18n.ts";

const jobs = CATEGORIES.flatMap((c) => c.words.flatMap((w) => LANGS.map((l) => ({ word: w[l.id], lang: l.id }))));
let done = 0, fresh = 0, failed = 0;
const worker = async () => {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    try {
      if (await warmExplanation(job.word, job.lang)) fresh++;
    } catch {
      failed++;
    }
    if (++done % 200 === 0) console.log(`${done} done, ${fresh} new, ${failed} failed`);
  }
};
const total = jobs.length;
await Promise.all(Array.from({ length: 8 }, worker)); // 8 at a time: fast, well within OpenAI rate limits
console.log(`finished: ${total} words, ${fresh} newly explained, ${failed} failed`);
