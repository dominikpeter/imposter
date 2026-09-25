import { VenetianMask } from "lucide-react";
import { UI, type Lang } from "@/lib/i18n";
import type { VoteEvent } from "@/lib/room";

/**
 * Early voting, shown with the result: one column per change of mind (and the final votes), stacked by suspect.
 * Stacked columns instead of lines: with few voters, equal counts would hide lines behind each other.
 * Colours follow the suspect's seat in the fixed categorical order; a 9th+ suspect folds into "other".
 */
export function VoteTimeline({ log, names, imposters, lang }: { log: VoteEvent[]; names: string[]; imposters: number[]; lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const suspects = [...new Set(log.map((e) => e.target))].sort((a, b) => a - b);
  const color = (seat: number) => {
    const i = suspects.indexOf(seat);
    return i < 8 ? `var(--s${i + 1})` : "var(--c-divider)";
  };
  // the state after every event: each voter's latest pick
  const picks = new Map<number, number>();
  const steps = log.map((e) => {
    picks.set(e.voter, e.target);
    const counts = new Map<number, number>();
    for (const target of picks.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    return { e, counts };
  });
  const max = Math.max(1, ...steps.map((s) => [...s.counts.values()].reduce((a, b) => a + b, 0)));
  const firstFinal = log.findIndex((e) => e.final);

  return (
    <section className="flex flex-col gap-3 text-left" aria-label={t("voteTimeline")}>
      <div>
        <h3 className="font-semibold">{t("voteTimeline")}</h3>
        <p className="text-sm text-muted">{t("voteTimelineHelp")}</p>
      </div>
      <div className="flex h-32 items-end gap-0.5 border-b border-line">
        {steps.map(({ e, counts }, i) => (
          <div
            key={i}
            title={`${names[e.voter]} → ${names[e.target]}${e.final ? ` (${t("finalVote")})` : ""}\n${suspects.map((s) => `${names[s]}: ${counts.get(s) ?? 0}`).join(", ")}`}
            className={`flex h-full flex-1 flex-col-reverse gap-0.5 ${i >= firstFinal && firstFinal >= 0 ? "" : "opacity-85"}`}
          >
            {suspects.map((s) =>
              counts.get(s) ? (
                <div key={s} className="rounded-sm" style={{ height: `${((counts.get(s) ?? 0) / max) * 100}%`, background: color(s) }} />
              ) : null,
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{t("talkStart")}</span>
        <span>{t("finalVote")}</span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {suspects.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: color(s) }} />
            {names[s]}
            {imposters.includes(s) && <VenetianMask className="size-4 text-imp" aria-label={t("imposter")} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
