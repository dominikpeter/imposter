import { CATEGORIES, LANGS, type Lang } from "./i18n.ts";

export type Text = string | Record<Lang, string>;
// authors = players who wrote this word; they already know it, so they can't be the imposter
export type Secret = { word: Text; clue: Text; authors: number[]; key: string };
export type Round = Secret & { imposters: number[]; starter: number };

export const pick = (n: number) => Math.floor(Math.random() * n);

export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/** Random pack word from the chosen topics, skipping keys in `used`; when every word was used, starts over. */
export function packSecret(cats: string[], used: Set<string>): Secret {
  const all = CATEGORIES.filter((c) => cats.includes(c.id)).flatMap((c) =>
    c.words.map((word, i) => {
      const clue = Object.fromEntries(LANGS.map((l) => [l.id, `${c.emoji} ${c.name[l.id]}`])) as Record<Lang, string>;
      return { word, clue, authors: [], key: `${c.id}:${i}` };
    }),
  );
  const fresh = all.filter((s) => !used.has(s.key));
  const pool = fresh.length ? fresh : all;
  return pool[pick(pool.length)];
}

/** Merge players' written words; the same word (case/space-insensitive) becomes one secret with all its authors. */
export function mergeWritten(pool: Secret[], words: { word: string; clue: string }[], author: number): Secret[] {
  const next = [...pool];
  for (const { word, clue } of words) {
    const w = word.trim();
    if (!w) continue;
    const key = w.toLocaleLowerCase().replace(/\s+/g, " ");
    const i = next.findIndex((s) => s.key === key);
    if (i >= 0) next[i] = { ...next[i], authors: [...next[i].authors, author], clue: next[i].clue || clue.trim() };
    else next.push({ word: w, clue: clue.trim(), authors: [author], key });
  }
  return next;
}

export function newRound(players: number, imposterCount: number, secret: Secret): Round {
  const candidates = [...Array(players).keys()].filter((i) => !secret.authors.includes(i));
  return { ...secret, imposters: shuffle(candidates).slice(0, imposterCount), starter: pick(players) };
}
