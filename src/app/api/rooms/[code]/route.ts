import { act, joinRoom, RoomError, view } from "@/lib/room";
import { allow, clientKey } from "@/lib/rateLimit";
import { handle } from "../handle";

// 5 characters; 4-character codes from before the switch keep working until those rooms expire
const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);

// GET (x-pid / x-token headers, kept out of URLs and logs) → this player's view, polled by every phone
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle((db) => view(db, code, req.headers.get("x-pid"), req.headers.get("x-token")));
}

// POST { type: "join", name } or { pid, token, type, ...action }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle(async (db) => {
    const { pid, token, ...a } = await req.json();
    if (a.type === "join") {
      // join attempts per IP: stops scripts from trying codes until they hit someone's open lobby
      if (!(await allow(`join:${clientKey(req)}`, 30))) throw new RoomError("rate_limited");
      return joinRoom(db, code, a.name);
    }
    return act(db, code, pid, token, a);
  });
}
