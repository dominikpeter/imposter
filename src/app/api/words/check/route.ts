import { reviewWords } from "@/lib/ai";
import { aiUser } from "@/lib/auth";
import { allowAi } from "@/lib/rateLimit";


// POST { words: [{word, clue}], taken: string[], lang } → one review per word (autocorrect, too hard, duplicates)
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const words = (Array.isArray(body?.words) ? body.words : []).slice(0, 5).map((w: { word?: unknown; clue?: unknown }) => ({ word: clip(w?.word, 40), clue: clip(w?.clue, 40) }));
  const taken = (Array.isArray(body?.taken) ? body.taken : []).slice(0, 200).map((t: unknown) => clip(t, 40));
  if (!words.length) return Response.json({ error: "bad_request" }, { status: 400 });

  // AI only for signed-in accounts within their limits; otherwise exact checks only, the game keeps working
  const user = body?.ai !== false ? await aiUser(req) : null;
  return Response.json(await reviewWords(words, taken, clip(body?.lang, 5), !!user && (await allowAi(`user:${user.id}`))));
}
