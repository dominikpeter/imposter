// browser side of online rooms: who I am in each room, and calls to /api/rooms
export type Identity = { pid: string; token: string };

export const idKey = (code: string) => `imposter:room:${code}`;

export function loadIdentity(code: string): Identity | null {
  try {
    return JSON.parse(localStorage.getItem(idKey(code)) ?? "null");
  } catch {
    return null;
  }
}

export function saveIdentity(code: string, id: Identity) {
  try {
    localStorage.setItem(idKey(code), JSON.stringify(id));
  } catch {}
}

export class ApiError extends Error {}

export const SAVE_KEY = "imposter:v1"; // the one-phone game's saved state; rooms read/write only its `lang`

export async function api<T>(path: string, body?: unknown, id?: Identity | null): Promise<T> {
  const res = await fetch(`/api/rooms${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? { "x-pid": id?.pid ?? "", "x-token": id?.token ?? "" } : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "offline");
  return data as T;
}

/** A room API error code as the i18n key of the message players see (anything unknown: connection problem). */
export const errorKey = (code: string) =>
  (({ started: "errStarted", not_found: "errNotFound", full: "errFull", no_storage: "errNoStorage", rate_limited: "errTooMany" }) as const)[
    code as "started"
  ] ?? "errOffline";

/** The one-phone game's saved state (the room page reads/writes its language and name too). Read fresh each time. */
export function readSaved<T extends object>(): Partial<T> {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
export function writeSaved(patch: object) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...readSaved(), ...patch }));
  } catch {}
}
