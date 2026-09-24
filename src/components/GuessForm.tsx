"use client";

import { LoaderCircle, VenetianMask } from "lucide-react";
import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { btn, field, ghost } from "@/lib/ui";

/** The caught imposter's last chance: name the secret word (or give up). */
export function GuessForm({ lang, busy, onGuess }: { lang: Lang; busy: boolean; onGuess: (text: string | null) => void }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuess(text.trim());
      }}
      className="enter flex w-full flex-col items-center gap-4 text-center"
    >
      <VenetianMask className="pop size-16 text-primary-ink" strokeWidth={1.5} aria-hidden />
      <h2 className="text-3xl font-bold tracking-tight">{t("guessTitle")}</h2>
      <p className="text-muted">{t("guessHelp")}</p>
      <input
        autoFocus
        autoComplete="off"
        maxLength={40}
        value={text}
        placeholder={t("guessPlaceholder")}
        onChange={(e) => setText(e.target.value)}
        className={`${field} text-center text-xl font-semibold`}
      />
      <button disabled={busy || !text.trim()} className={btn}>
        {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : t("guessBtn")}
      </button>
      <button type="button" disabled={busy} onClick={() => onGuess(null)} className={`${ghost} text-muted`}>
        {t("giveUp")}
      </button>
    </form>
  );
}
