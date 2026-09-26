"use client";
/* eslint-disable shadcn/no-raw-colors -- Google/Microsoft logos must keep their official brand colors */

import { LoaderCircle, LogOut, Mail } from "lucide-react";
import { useState } from "react";
import { sendCode, signIn, signInWithCode, signOut, useMe, type Me } from "@/lib/authClient";
import { UI, type Lang } from "@/lib/i18n";
import { field, ghost, press } from "@/lib/ui";

// brand marks (lucide has no brand icons)
const LOGO: Record<Me["providers"][number], React.ReactNode> = {
  google: (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 16 16" className="size-5 fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  microsoft: (
    <svg viewBox="0 0 21 21" className="size-5" aria-hidden>
      <path fill="#f25022" d="M1 1h9v9H1z" />
      <path fill="#7fba00" d="M11 1h9v9h-9z" />
      <path fill="#00a4ef" d="M1 11h9v9H1z" />
      <path fill="#ffb900" d="M11 11h9v9h-9z" />
    </svg>
  ),
};
const NAME = { google: "Google", github: "GitHub", microsoft: "Microsoft" };
const outline = `flex min-h-12 items-center justify-center gap-3 rounded-full border border-line bg-surface font-semibold disabled:opacity-40 ${press}`;

/** Email sign-in: address → mailed 6-digit code → signed in. */
function EmailSignIn({ t }: { t: (k: keyof typeof UI) => string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof UI | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!sent) {
        if (await sendCode(email.trim())) setSent(true);
        else setError("emailFailed");
      } else if (!(await signInWithCode(email.trim(), code))) setError("codeWrong");
    } catch {
      setError("emailFailed");
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {sent ? (
        <>
          <p className="text-sm text-muted">{t("codeSent").replace("{email}", email.trim())}</p>
          <input
            autoFocus
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            aria-label={t("codeLabel")}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${field} text-center text-xl font-semibold tracking-widest`}
          />
        </>
      ) : (
        <input
          type="email"
          required
          autoComplete="email"
          aria-label={t("emailLabel")}
          placeholder={t("emailLabel")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-imp">
          {t(error)}
        </p>
      )}
      <button disabled={busy} className={outline}>
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Mail className="size-5" aria-hidden />}
        {t(sent ? "codeSignIn" : "emailSend")}
      </button>
      {sent && (
        <button type="button" onClick={() => (setSent(false), setCode(""), setError(null))} className={`${ghost} text-sm text-muted`}>
          {t("emailChange")}
        </button>
      )}
    </form>
  );
}

/** Settings: sign in (for AI help) with the configured providers, or who is signed in + sign out. */
export function SignIn({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const me = useMe();
  if (!me) return null;
  if (me.user)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-tint px-4 py-2 text-sm">
        <span className="min-w-0 truncate">{t("signedInAs").replace("{name}", me.user.name)}</span>
        <button onClick={signOut} className={`${ghost} -mr-3 flex shrink-0 items-center gap-1.5 text-muted`}>
          <LogOut className="size-4" aria-hidden /> {t("signOut")}
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">{me.providers.length || me.email ? t("aiLoginNote") : t("noLogin")}</p>
      {me.providers.map((p) => (
        <button
          key={p}
          onClick={() => signIn(p)}
          className={outline}
        >
          {LOGO[p]} {t("continueWith").replace("{name}", NAME[p])}
        </button>
      ))}
      {me.email && <EmailSignIn t={t} />}
    </div>
  );
}
