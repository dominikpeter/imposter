"use client";

import { createAuthClient } from "better-auth/react";
import { useEffect, useState } from "react";
import type { AiUser } from "./auth";

export const authClient = createAuthClient();

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

export const signIn = (provider: Me["providers"][number]) => authClient.signIn.social({ provider, callbackURL: location.pathname });
export const signOut = async () => {
  await authClient.signOut();
  cache = null;
  location.reload();
};
