import { db } from "./store.ts";

/** Counts a call for this client in the current hour; false once `perHour` is used up. Guards the OpenAI budget. */
export async function allow(req: Request, name: string, perHour: number) {
  // ponytail: read-then-write counter, a burst of parallel requests can slip a few past the limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const bucket = `rl:${name}:${ip}:${Math.floor(Date.now() / 3_600_000)}`;
  const used = (await db.get<number>(bucket)) ?? 0;
  await db.set(bucket, used + 1, { ex: 3600 });
  return used < perHour;
}
