"use client";

import { useEffect, useState } from "react";
import type { AiUser } from "./auth";

// the Better Auth client is only needed when someone taps sign-in/out: load it then, not on every page load
const client = () => import("better-auth/react").then((m) => m.createAuthClient());

// ai: false when the admin switched AI off for everyone
export type Me = { user: AiUser | null; providers: ("google" | "github" | "microsoft")[]; ai: boolean };
let cache: Promise<Me> | null = null;
const load = () =>
  (cache ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ user: null, providers: [], ai: false })));

/** Who is signed in (null while loading). */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let live = true;
    load().then((m) => live && setMe(m));
    return () => {
      live = false;
    };
  }, []);
  return me;
}

export const signIn = async (provider: Me["providers"][number]) => (await client()).signIn.social({ provider, callbackURL: location.pathname });
export const signOut = async () => {
  await (await client()).signOut();
  cache = null;
  location.reload();
};
