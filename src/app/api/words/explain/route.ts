import { cachedExplanation, explainWord } from "@/lib/ai";
import { aiUser } from "@/lib/auth";
import { aiEnabled, allowAi } from "@/lib/rateLimit";

// POST { word, lang } → { text } short explanation of a secret word
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const word = String(body?.word ?? "").trim().slice(0, 40);
  // a game word (max 3 words), not free text: keeps this from being a general-purpose AI endpoint
  if (!word || word.split(/\s+/).length > 3) return Response.json({ error: "bad_request" }, { status: 400 });
  const user = await aiUser(req);
  if (!user) return Response.json({ error: "login" }, { status: 401 });
  const lang = String(body?.lang ?? "en").slice(0, 5);
  const [hit, on] = await Promise.all([cachedExplanation(word, lang), aiEnabled()]);
  if (hit && on) return Response.json({ text: hit }); // cached: instant, no AI call, no budget used
  if (!(await allowAi(`user:${user.id}`))) return Response.json({ error: "rate_limited" }, { status: 429 });
  const text = await explainWord(word, lang, user.id);
  return text ? Response.json({ text }) : Response.json({ error: "no_ai" }, { status: 503 });
}
