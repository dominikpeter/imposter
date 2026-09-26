import { act, joinRoom, RoomError, view } from "@/lib/room";
import { MAX_CODE_LENGTH } from "@/lib/game";
import { allow, clientKey, spent } from "@/lib/rateLimit";
import { handle } from "../handle";

// 5 or 6 characters (random per room, see createRoom); 4-character codes from before an earlier switch keep working
const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_CODE_LENGTH);

const JOINS_PER_MINUTE = 30;

// GET (x-pid / x-token headers, kept out of URLs and logs) → this player's view, polled by every phone
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle(async (db) => {
    // a view also tells whether a code is live: misses count against the join limit, and once it is used up
    // outsiders get "rate_limited" for hits and misses alike, so codes can't be probed here instead of by joining
    const guesses = `join:${clientKey(req)}`;
    try {
      const v = await view(db, code, req.headers.get("x-pid"), req.headers.get("x-token"));
      if (v.me < 0 && (await spent(guesses, JOINS_PER_MINUTE))) throw new RoomError("rate_limited");
      return v;
    } catch (e) {
      if (e instanceof RoomError && e.code === "not_found" && !(await allow(guesses, JOINS_PER_MINUTE))) throw new RoomError("rate_limited");
      throw e;
    }
  });
}

// POST { type: "join", name } or { pid, token, type, ...action }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = clean((await params).code);
  return handle(async (db) => {
    const { pid, token, ...a } = await req.json();
    if (a.type === "join") {
      // join attempts per IP: stops scripts from trying codes until they hit someone's open lobby
      if (!(await allow(`join:${clientKey(req)}`, JOINS_PER_MINUTE))) throw new RoomError("rate_limited");
      return joinRoom(db, code, a.name);
    }
    return act(db, code, pid, token, a);
  });
}
