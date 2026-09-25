import { UI, type Lang } from "@/lib/i18n";

/**
 * Points per round as cumulative bars: one bar per player (already sorted by points), one segment per round
 * that scored. One hue, lighter = earlier round, so equal scores never hide behind each other like lines did.
 */
export function Timeline({ timeline, names, lang }: { timeline: Record<string, number>[]; names: string[]; lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const rounds = timeline.length;
  const total = (n: string) => timeline.at(-1)?.[n] ?? 0;
  const max = Math.max(1, ...names.map(total));
  // round r's share of the hue: 35 % for the first round up to 100 % for the latest
  const shade = (r: number) => `color-mix(in oklab, var(--color-crew) ${rounds <= 1 ? 100 : Math.round(35 + (65 * r) / (rounds - 1))}%, var(--c-surface))`;
  return (
    <div>
      <h3 className="font-semibold">{t("pointsTimeline")}</h3>
      <p className="mb-3 flex items-center gap-2 text-sm text-muted">
        <span className="flex gap-0.5" aria-hidden>
          {[35, 67, 100].map((pct) => (
            <span key={pct} className="h-2.5 w-3 rounded-sm" style={{ background: `color-mix(in oklab, var(--color-crew) ${pct}%, var(--c-surface))` }} />
          ))}
        </span>
        {t("roundsLegend")}
      </p>
      <ol className="flex flex-col gap-2">
        {names.map((n, i) => (
          <li key={n} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-sm font-medium">{n}</span>
            <span className="flex h-3 min-w-0 flex-1 gap-0.5" role="img" aria-label={`${n}: ${total(n)}`}>
              {timeline.map((after, r) => {
                const gained = (after[n] ?? 0) - (r ? (timeline[r - 1][n] ?? 0) : 0);
                return gained > 0 ? (
                  <span
                    key={r}
                    title={`${t("round")} ${r + 1}: +${gained}`}
                    className="bar-grow h-full first:rounded-l-sm last:rounded-r-sm"
                    style={{ width: `${(gained / max) * 100}%`, background: shade(r), animationDelay: `${300 + i * 60}ms` }}
                  />
                ) : null;
              })}
            </span>
            <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums">{total(n)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
