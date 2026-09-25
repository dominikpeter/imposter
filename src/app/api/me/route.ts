import { aiUser, providers } from "@/lib/auth";

// GET → who is signed in (for AI features) and which login providers are configured
export async function GET(req: Request) {
  return Response.json({ user: await aiUser(req), providers }, { headers: { "Cache-Control": "no-store" } });
}
