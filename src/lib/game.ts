import { CATEGORIES, type Lang } from "./i18n.ts";

export type Text = string | Record<Lang, string>;
// authors = players who wrote this word; they already know it, so they can't be the imposter
export type Secret = { word: Text; clue: Text; authors: number[]; key: string };
// jokered = imposters who spent a joker this round and get the word hint
export type Round = Secret & { imposters: number[]; starter: number; jokered?: number[] };

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
      const clue = c.name; // the topic is the imposter's clue
      return { word, clue, authors: [], key: `${c.id}:${i}` };
    }),
  );
  const fresh = all.filter((s) => !used.has(s.key));
  const pool = fresh.length ? fresh : all;
  return pool[pick(pool.length)];
}

export type Draft = { word: string; clue: string };
// problem: "taken" = another player's word (index into `taken`), "twice" = repeated in the same draft, "too_hard" = AI verdict
export type Review = Draft & { problem: null | "taken" | "twice" | "too_hard"; taken: number };

export const wordKey = (w: string) => w.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/** The checks that need no AI: exact duplicates of taken words, or the same word twice in one draft. */
export function exactReview(draft: Draft[], taken: string[]): Review[] {
  const keys = taken.map(wordKey);
  return draft.map((d, i) => {
    const k = wordKey(d.word);
    const t = keys.indexOf(k);
    const twice = draft.slice(0, i).some((x) => wordKey(x.word) === k);
    return { word: d.word.trim(), clue: d.clue.trim(), problem: t >= 0 ? "taken" : twice ? "twice" : null, taken: t };
  });
}

export type Note = Review["problem"] | "corrected";

/** Turns reviews into what the form shows: corrected text, a note per field, and whether the draft can be accepted as is. */
export function reviewNotes(draft: Draft[], reviews: Review[]) {
  const notes: (Note | null)[] = reviews.map(
    (r, i) => r.problem ?? (r.word !== draft[i].word.trim() || r.clue !== draft[i].clue.trim() ? "corrected" : null),
  );
  // a rejected word is cleared so the player has to write a new one; corrections stay for a quick look
  const fixed = reviews.map((r) => ({ word: r.problem ? "" : r.word, clue: r.clue }));
  return { fixed, notes, ok: notes.every((n) => n === null) };
}

/** Merge players' written words; the same word (case/space-insensitive) becomes one secret with all its authors. */
export function mergeWritten(pool: Secret[], words: { word: string; clue: string }[], author: number): Secret[] {
  const next = [...pool];
  for (const { word, clue } of words) {
    const w = word.trim();
    if (!w) continue;
    const key = wordKey(w);
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

/** The joker's word hint: pack words → first letter + one blank per letter ("S _ _ _"), own words → the writer's hint. */
export function wordHint(s: Pick<Secret, "word" | "clue">): Text {
  if (typeof s.word === "string") return s.clue;
  const mask = (w: string) => [...w].map((ch, i) => (i === 0 ? ch.toUpperCase() : /[\s-]/.test(ch) ? ch : "_")).join(" ");
  return Object.fromEntries(Object.entries(s.word).map(([l, w]) => [l, mask(w)])) as Record<Lang, string>;
}

/** Joker holders (player ids or names) who are imposters this round spend their joker; returns who spent and who still holds one. */
export function spendJokers(imposters: number[], ids: string[], holders: string[]) {
  const jokered = imposters.filter((i) => holders.includes(ids[i]));
  return { jokered, holders: holders.filter((h) => !jokered.some((i) => ids[i] === h)) };
}

/** Imposters who survived a vote (someone else was accused) earn a joker; a skipped vote earns nothing. */
export function earnJokers(imposters: number[], accused: number | null, ids: string[], holders: string[]) {
  if (accused === null) return holders;
  return [...new Set([...holders, ...imposters.filter((i) => i !== accused).map((i) => ids[i])])];
}
