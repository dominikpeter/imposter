import { PartyPopper, VenetianMask } from "lucide-react";
import { JokerEarned } from "@/components/Joker";
import type { Text } from "@/lib/game";
import { UI, type Lang } from "@/lib/i18n";
import { card } from "@/lib/ui";

export type Guess = { text: string; correct: boolean } | null;

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

/** Round result shared by both modes: verdict, imposter guess, earned jokers, who the imposters were, the word. */
export function Verdict(p: { names: string[]; imposters: number[]; accused: number | null; word: Text; guess: Guess; joker: boolean; lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][p.lang];
  const { names, imposters, accused, guess } = p;
  const caught = accused !== null && imposters.includes(accused);
  const guessed = caught && !!guess?.correct;
  const survivors = accused === null ? [] : imposters.filter((i) => i !== accused || guessed);
  const icon = "inline size-9 -translate-y-1 text-primary-ink";
  return (
    <>
      {accused !== null && (
        <div className="pop mb-2">
          <p className="text-4xl font-bold tracking-tight">
            {caught && !guessed ? <PartyPopper className={icon} aria-hidden /> : <VenetianMask className={icon} aria-hidden />}{" "}
            {t(guessed ? "guessedRight" : caught ? "caught" : "wrong")}
          </p>
          <p className="mt-1 text-lg text-balance text-muted">
            {guessed ? (
              fill(t("guessedRightHelp"), { name: names[accused] })
            ) : (
              <>
                <span className="font-semibold text-ink">{names[accused]}</span> {t(caught ? "caughtHelp" : "wrongHelp")}
              </>
            )}
          </p>
          {caught && guess && !guess.correct && guess.text && (
            <p className="mt-1 text-muted">{fill(t("guessedWrong"), { name: names[accused], guess: guess.text })}</p>
          )}
        </div>
      )}
      {p.joker && (
        <JokerEarned lang={p.lang} names={survivors.map((i) => names[i])} text={t(survivors.length > 1 ? "jokersEarned" : "jokerEarned")} />
      )}
      <div className="flip imposter-back glow relative rounded-3xl px-6 py-10 text-white">
        <p className="text-lg text-white/80">{t(imposters.length > 1 ? "impostersWere" : "imposterWas")}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight break-words">{new Intl.ListFormat(p.lang).format(imposters.map((i) => names[i]))}</p>
      </div>
      <div className={`${card} enter anim-delay-200`}>
        <p className="text-muted">{t("theWord")}</p>
        <p data-testid="result-word" className="mt-1 text-3xl font-bold tracking-tight break-words text-primary-ink">{typeof p.word === "string" ? p.word : p.word[p.lang]}</p>
      </div>
    </>
  );
}
