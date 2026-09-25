import { aiUser } from "@/lib/auth";
import { createRoom, RoomError } from "@/lib/room";
import { allow, clientKey } from "@/lib/rateLimit";
import { handle } from "./handle";

// POST { name, settings } → { code, pid, token } for the host
export async function POST(req: Request) {
  return handle(async (db) => {
    // rooms live in Redis for hours: cap how fast one IP can create them
    if (!(await allow(`create:${clientKey(req)}`, 20))) throw new RoomError("rate_limited");
    const body = await req.json();
    // AI help in a room runs on the host's account: only when the host is signed in
    const user = await aiUser(req);
    return createRoom(db, body?.name, { ...(body?.settings ?? {}), ai: !!user && body?.settings?.ai !== false }, user?.id);
  });
}
