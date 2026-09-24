import { db, persistent } from "./store.ts";

const PER_MINUTE = 120; // per client (a whole party behind one Wi-Fi shares an IP)
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

/** Counts one AI call for `key` (an IP or a room); false once the minute or the day budget is used up. */
export async function allowAi(key: string, perMinute = PER_MINUTE, perDay = PER_DAY) {
  // serverless instances don't share memory: without Redis a limit can't hold on Vercel, so no AI there
  if (!persistent && process.env.VERCEL) return false;
  const now = Date.now();
  const minute = `rl:${key}:${Math.floor(now / 60_000)}`;
  const day = `rl:day:${Math.floor(now / 86_400_000)}`;
  // ponytail: read-then-write counters, a burst of parallel requests can slip a few past the limit
  const [m = 0, d = 0] = (await Promise.all([db.get<number>(minute), db.get<number>(day)])).map((x) => x ?? 0);
  if (m >= perMinute || d >= perDay) return false;
  await Promise.all([db.set(minute, m + 1, { ex: 60 }), db.set(day, d + 1, { ex: 2 * 86_400 })]);
  return true;
}
