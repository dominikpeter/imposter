import { Globe, Lightbulb, ListOrdered, PenLine, Sparkles, Users, VenetianMask, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import { TopicGrid } from "@/components/TopicGrid";
import { CATEGORIES, LANGS, UI, type Lang } from "@/lib/i18n";
import type { Settings } from "@/lib/room";
import { card } from "@/lib/ui";

/** Lobby card: the host's choices, so every player knows the rules and topics before the game starts. */
export function RoomSettings({ settings: s, lang }: { settings: Settings; lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const row = (icon: ReactNode, label: string, value: ReactNode) => (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-muted">
        {icon}
        {label}
      </span>
      <span className="text-right font-semibold">{value}</span>
    </li>
  );
  const i = "size-4 shrink-0";
  const on = (b: boolean) => (b ? "✓" : "–");
  const topics = CATEGORIES.filter((c) => s.cats.includes(c.id));
  return (
    <section className={card}>
      <h2 className="mb-2 text-lg font-semibold">{t("gameSettings")}</h2>
      <ul className="divide-y divide-line">
        {row(<Globe className={i} aria-hidden />, t("wordLang"), LANGS.find((l) => l.id === s.lang)?.label)}
        {row(<Users className={i} aria-hidden />, t("imposters"), s.imposterCount)}
        {row(<ListOrdered className={i} aria-hidden />, t("rounds"), s.rounds)}
        {row(<Lightbulb className={i} aria-hidden />, t("hint"), on(s.hint))}
        {row(<Sparkles className={i} aria-hidden />, t("joker"), on(s.joker))}
        {row(<VenetianMask className={i} aria-hidden />, t("guessOption"), on(s.guess))}
        {row(<WandSparkles className={i} aria-hidden />, t("aiHelp"), on(s.ai))}
        {s.mode === "custom" && row(<PenLine className={i} aria-hidden />, t("ourWords"), `${s.perPlayer} × ${t("word")}`)}
      </ul>
      {s.mode === "packs" && (
        <>
          <h3 className="mt-3 mb-2 font-semibold">
            {t("topics")} <span className="font-normal text-muted">{topics.length === CATEGORIES.length ? `· ${t("allTopics")}` : `· ${topics.length}`}</span>
          </h3>
          <TopicGrid lang={lang} cats={s.cats} />
        </>
      )}
    </section>
  );
}
