import { count } from "@/lib/metrics";
import { allow, clientKey } from "@/lib/rateLimit";

// POST → one finished one-phone round (those never touch the server otherwise); anonymous, just a counter
export async function POST(req: Request) {
  if (await allow(`round:${clientKey(req)}`, 30)) await count({ localRounds: 1 });
  return new Response(null, { status: 204 });
}
