import { createRoom } from "@/lib/room";
import { handle } from "./handle";

// POST { name, settings } → { code, pid, token } for the host
export async function POST(req: Request) {
  return handle(async (db) => {
    const body = await req.json();
    return createRoom(db, body?.name, body?.settings ?? {});
  });
}
