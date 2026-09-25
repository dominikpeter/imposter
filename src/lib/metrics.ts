import { db } from "./store.ts";

// Usage numbers for the admin page, in the same Redis as the rooms: one counter hash per day plus one row per
// signed-in user. Recording never breaks the game: every write swallows its own errors.
const TTL = 400 * 86_400; // a bit over a year of history
const USERS = "metrics:users";
const dayKey = (d: Date) => `metrics:day:${d.toISOString().slice(0, 10)}`;

export const METRICS = ["logins", "rooms", "roomRounds", "localRounds", "aiCalls", "tokensIn", "tokensOut"] as const;
export type Metric = (typeof METRICS)[number];
export type UserRow = {
  id: string; name: string; email: string; provider: string;
  first: number; last: number; logins: number; aiCalls: number; tokens: number;
};

export async function count(counts: Partial<Record<Metric, number>>) {
  const key = dayKey(new Date());
  await Promise.all(Object.entries(counts).map(([m, by]) => (by ? db.hincr(key, m, by, TTL) : null))).catch(() => {});
}

// ponytail: read-modify-write of one user's row; two simultaneous AI calls of the same user can drop one increment.
// The day counters above are atomic, so totals stay exact. Per-field hashes per user if this ever matters.
async function updateUser(id: string, change: (u: UserRow | null) => UserRow | null) {
  try {
    const rows = await db.hgetall<UserRow>(USERS);
    const next = change(rows[id] ?? null);
    if (next) await db.hset(USERS, id, next, TTL);
  } catch {}
}

export async function recordLogin(u: { id: string; name: string; email: string; provider: string }) {
  const now = Date.now();
  await Promise.all([
    count({ logins: 1 }),
    updateUser(u.id, (r) => ({ aiCalls: 0, tokens: 0, first: now, ...r, ...u, last: now, logins: (r?.logins ?? 0) + 1 })),
  ]);
}

export async function recordAi(who: string | undefined, usage: { inputTokens?: number; outputTokens?: number }) {
  const tokensIn = usage.inputTokens ?? 0;
  const tokensOut = usage.outputTokens ?? 0;
  await Promise.all([
    count({ aiCalls: 1, tokensIn, tokensOut }),
    who && !who.startsWith("room:")
      ? updateUser(who, (r) => r && { ...r, last: Date.now(), aiCalls: r.aiCalls + 1, tokens: r.tokens + tokensIn + tokensOut }) // no row: signed in before tracking began
      : null,
  ]);
}

/** Last `days` days (oldest first, missing days as zeros) and every known user, most recently active first. */
export async function dashboard(days = 30) {
  const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - (days - 1 - i) * 86_400_000));
  const rows = await Promise.all(dates.map((d) => db.hgetall<number>(dayKey(d))));
  const daily = dates.map((d, i) => ({
    date: d.toISOString().slice(0, 10),
    ...Object.fromEntries(METRICS.map((m) => [m, Number(rows[i][m]) || 0])),
  })) as ({ date: string } & Record<Metric, number>)[];
  const users = Object.values(await db.hgetall<UserRow>(USERS)).sort((a, b) => b.last - a.last);
  return { daily, users };
}
