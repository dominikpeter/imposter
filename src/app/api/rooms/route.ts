import { aiUser } from "@/lib/auth";
import { createRoom } from "@/lib/room";
import { handle } from "./handle";

// POST { name, settings } → { code, pid, token } for the host
export async function POST(req: Request) {
  return handle(async (db) => {
    const body = await req.json();
    // AI help in a room runs on the host's account: only when the host is signed in
    const user = await aiUser(req);
    return createRoom(db, body?.name, { ...(body?.settings ?? {}), ai: !!user && body?.settings?.ai !== false }, user?.id);
  });
}
