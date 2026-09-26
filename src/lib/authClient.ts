"use client";

import { useEffect, useState } from "react";
import type { AiUser } from "./auth";

// the Better Auth client is only needed when someone taps sign-in/out: load it then, not on every page load
const client = () =>
  Promise.all([import("better-auth/react"), import("better-auth/client/plugins")]).then(([m, p]) => m.createAuthClient({ plugins: [p.emailOTPClient()] }));

// ai: false when the admin switched AI off for everyone
// email: sign-in with a mailed code is available
export type Me = { user: AiUser | null; providers: ("google" | "github" | "microsoft")[]; email: boolean; ai: boolean };
let cache: Promise<Me> | null = null;
const load = () =>
  (cache ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ user: null, providers: [], email: false, ai: false })));

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
/** Mail a sign-in code; true when sent. */
export const sendCode = async (email: string, lang: string) =>
  !(await (await client()).emailOtp.sendVerificationOtp({ email, type: "sign-in" }, { headers: { "x-lang": lang } })).error; // mail in the app's language
/** Sign in with the mailed code; true when it matched (the page reloads signed in). */
export const signInWithCode = async (email: string, otp: string) => {
  if ((await (await client()).signIn.emailOtp({ email, otp })).error) return false;
  cache = null;
  location.reload();
  return true;
};
export const signOut = async () => {
  await (await client()).signOut();
  cache = null;
  location.reload();
};
