import { db, persistent } from "./store.ts";

const PER_MINUTE = 60; // per account
const PER_USER_DAY = 200; // per account and day: one person can't use up everyone's budget
const PER_DAY = 1000; // all AI calls together: this is what caps the OpenAI bill

export const clientKey = (req: Request) =>
  req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

/** Counts one hit for `key` in the current minute; false once `perMinute` is used up. Fails open without shared storage. */
export async function allow(key: string, perMinute: number) {
  if (!persistent && process.env.VERCEL) return true; // nothing to count with; rooms need Redis anyway
  const bucket = `rl:${key}:${Math.floor(Date.now() / 60_000)}`;
  const used = (await db.get<number>(bucket)) ?? 0;
  if (used >= perMinute) return false;
  await db.set(bucket, used + 1, { ex: 60 });
  return true;
}

// global AI switch, flipped on the admin page; every AI path goes through allowAi, so off means off everywhere
export const AI_OFF = "config:ai-off";
export const aiEnabled = async () => !(await db.get<boolean>(AI_OFF).catch(() => null));
export const setAiEnabled = (on: boolean) => db.set(AI_OFF, !on, { ex: 10 * 365 * 86_400 });

/** Counts one AI call for `key` (an account); false once its minute or day budget, or the global day budget, is used up. */
export async function allowAi(key: string, perMinute = PER_MINUTE, perDay = PER_DAY, perUserDay = PER_USER_DAY) {
  // serverless instances don't share memory: without Redis a limit can't hold on Vercel, so no AI there
  if (!persistent && process.env.VERCEL) return false;
  const now = Date.now();
  const minute = `rl:${key}:${Math.floor(now / 60_000)}`;
  const day = `rl:day:${Math.floor(now / 86_400_000)}`;
  const userDay = `rl:uday:${key}:${Math.floor(now / 86_400_000)}`;
  // ponytail: read-then-write counters, a burst of parallel requests can slip a few past the limit
  // one parallel round of reads (incl. the global switch); the writes start right away but nobody waits for them
  // (deferring them past the AI call would let a burst of parallel requests slip through the limits)
  const [off, m, d, u] = await Promise.all([db.get<boolean>(AI_OFF), db.get<number>(minute), db.get<number>(day), db.get<number>(userDay)]);
  if (off || (m ?? 0) >= perMinute || (d ?? 0) >= perDay || (u ?? 0) >= perUserDay) return false;
  void Promise.all([
    db.set(minute, (m ?? 0) + 1, { ex: 60 }),
    db.set(day, (d ?? 0) + 1, { ex: 2 * 86_400 }),
    db.set(userDay, (u ?? 0) + 1, { ex: 2 * 86_400 }),
  ]).catch(() => {});
  return true;
}
