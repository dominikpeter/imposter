"use client";

import { useEffect, useState } from "react";
import type { AiUser } from "./auth";

// the Better Auth client is only needed when someone taps sign-in/out: load it then, not on every page load
const client = () =>
  Promise.all([import("better-auth/react"), import("better-auth/client/plugins")]).then(([m, p]) => m.createAuthClient({ plugins: [p.emailOTPClient()] }));

// ai: false when the admin switched AI off for everyone
// email: sign-in with a mailed code is available; coffee: the "buy me a coffee" tip (Stripe) is set up
export type Me = { user: AiUser | null; providers: ("google" | "github" | "microsoft")[]; email: boolean; coffee: boolean; ai: boolean };
let cache: Promise<Me> | null = null;
const load = () =>
  (cache ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => r.json())
    .catch(() => ({ user: null, providers: [], email: false, coffee: false, ai: false })));

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

// Settings was open when sign-in started: keep it open after the redirect/reload comes back, so the player
// sees they're signed in instead of the sheet just vanishing. TopControls reopens it once and clears this.
const REOPEN_KEY = "imposter:reopen-settings";
// a timestamp, not a flag: an abandoned sign-in (Back from the provider, a failed redirect) must not pop Settings
// open on some unrelated page load much later in the same tab
const REOPEN_WITHIN_MS = 10 * 60_000;
const keepSettingsOpen = () => {
  try {
    sessionStorage.setItem(REOPEN_KEY, String(Date.now()));
  } catch {}
};
/** True once, right after a sign-in that started with Settings open (clears itself so it never fires again). */
export const consumeReopenSettings = () => {
  try {
    const at = Number(sessionStorage.getItem(REOPEN_KEY));
    sessionStorage.removeItem(REOPEN_KEY);
    return at > 0 && Date.now() - at < REOPEN_WITHIN_MS;
  } catch {
    return false;
  }
};
export const signIn = async (provider: Me["providers"][number]) => {
  keepSettingsOpen();
  return (await client()).signIn.social({ provider, callbackURL: location.pathname });
};
/** Mail a sign-in code; true when sent. */
export const sendCode = async (email: string, lang: string) =>
  !(await (await client()).emailOtp.sendVerificationOtp({ email, type: "sign-in" }, { headers: { "x-lang": lang } })).error; // mail in the app's language
/** Sign in with the mailed code; true when it matched (the page reloads signed in). */
export const signInWithCode = async (email: string, otp: string) => {
  if ((await (await client()).signIn.emailOtp({ email, otp })).error) return false;
  cache = null;
  keepSettingsOpen();
  location.reload();
  return true;
};
export const signOut = async () => {
  await (await client()).signOut();
  cache = null;
  location.reload();
};
