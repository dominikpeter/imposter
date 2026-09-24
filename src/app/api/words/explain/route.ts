import { explainWord } from "@/lib/ai";
import { allow } from "@/lib/rateLimit";

// POST { word, lang } → { text } short explanation of a secret word
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const word = String(body?.word ?? "").trim().slice(0, 40);
  if (!word) return Response.json({ error: "bad_request" }, { status: 400 });
  if (!(await allow(req, "explain", 60))) return Response.json({ error: "rate_limited" }, { status: 429 });
  const text = await explainWord(word, String(body?.lang ?? "en").slice(0, 5));
  return text ? Response.json({ text }) : Response.json({ error: "no_ai" }, { status: 503 });
}
