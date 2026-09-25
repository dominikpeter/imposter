import { JokerHint } from "@/components/Joker";
import { UI, type Lang } from "@/lib/i18n";
import { card as cardStyle } from "@/lib/styles";

/** What one player sees, words already in the right language (clue: app language, word/hint: word language). */
export type ShownCard = { imposter: true; clue: string | null; jokerHint: string | null } | { imposter: false; word: string; clue: string };

/** The revealed card, the same on one phone and in rooms. Tapping it (rooms) hides it again. */
export function SecretCard({ card, lang, onClick }: { card: ShownCard; lang: Lang; onClick?: () => void }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const Box = onClick ? "button" : "div"; // a tag name, not a component defined here: no remount, the flip plays once
  return card.imposter ? (
    <Box onClick={onClick} className="flip imposter-back glow relative w-full rounded-3xl px-6 py-12 text-white short:py-8 tiny:py-5">
      <p className="text-lg text-white/80">{t("youAre")}</p>
      <p className="shake mt-1 text-4xl font-bold tracking-tight break-words sm:text-5xl tiny:text-3xl">{t("imposter")}</p>
      {card.clue && (
        <p className="mx-auto mt-6 inline-block rounded-full bg-white/15 px-4 py-1.5 font-medium">
          {t("clueLabel")}: {card.clue}
        </p>
      )}
      {card.jokerHint && <JokerHint label={t("jokerHint")} hint={card.jokerHint} />}
      <p className="mt-4 text-white/80 tiny:hidden">{t("blend")}</p>
    </Box>
  ) : (
    <Box onClick={onClick} className={`${cardStyle} flip w-full py-14 short:py-8 tiny:py-5`}>
      <p className="text-lg text-muted">{card.clue || t("yourWord")}</p>
      <p data-testid="word" className="mt-2 text-5xl font-bold tracking-tight break-words text-primary-ink short:text-4xl tiny:text-3xl">
        {card.word}
      </p>
    </Box>
  );
}
