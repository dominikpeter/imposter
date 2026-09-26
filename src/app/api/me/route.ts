import { aiUser, emailLogin, providers } from "@/lib/auth";
import { aiEnabled } from "@/lib/rateLimit";
import { coffeeOn } from "@/lib/coffee";

// GET → who is signed in (for AI features) and which login providers are configured
export async function GET(req: Request) {
  return Response.json({ user: await aiUser(req), providers, email: emailLogin, coffee: coffeeOn, ai: await aiEnabled() }, { headers: { "Cache-Control": "no-store" } });
}
