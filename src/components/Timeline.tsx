import { UI, type Lang } from "@/lib/i18n";

const W = 300, H = 190, PAD = { l: 24, r: 70, t: 10, b: 22 };

/** Cumulative points per round, one line per player (max 8, validated categorical colors), direct labels + legend. */
export function Timeline({ timeline, names, lang }: { timeline: Record<string, number>[]; names: string[]; lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const shown = names.slice(0, 8); // a 9th color would not be distinguishable: top 8 only, the table has everyone
  const series = shown.map((n) => [0, ...timeline.map((r) => r[n] ?? 0)]); // start every line at 0 before round 1
  const rounds = timeline.length;
  const max = Math.max(1, ...series.flat());
  const x = (i: number) => PAD.l + (i / Math.max(1, rounds)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  // end labels: nudge apart so equal scores don't overlap (≥ 12px)
  const ends = series.map((s, i) => ({ i, y: y(s[s.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 14);
  return (
    <div>
      <h3 className="mb-2 font-semibold">{t("pointsTimeline")}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("pointsTimeline")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-xs">
              {v}
            </text>
          </g>
        ))}
        {Array.from({ length: rounds }, (_, r) => r + 1)
          .filter((r) => rounds <= 10 || r % Math.ceil(rounds / 10) === 0 || r === rounds)
          .map((r) => (
            <text key={r} x={x(r)} y={H - 6} textAnchor="middle" className="fill-muted text-xs">
              {r}
            </text>
          ))}
        {series.map((s, i) => (
          <g key={shown[i]} style={{ color: `var(--s${i + 1})` }}>
            <polyline
              points={s.map((v, r) => `${x(r)},${y(v)}`).join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="bar-grow"
              style={{ animationDelay: `${300 + i * 80}ms` }}
            >
              <title>{`${shown[i]}: ${s[s.length - 1]}`}</title>
            </polyline>
            <circle cx={x(rounds)} cy={y(s[s.length - 1])} r={4} fill="currentColor" className="stroke-surface" strokeWidth={2} />
          </g>
        ))}
        {ends.map(({ i, y: ly }) => (
          <text key={shown[i]} x={x(rounds) + 8} y={ly + 4} className="fill-ink text-xs font-semibold">
            {shown[i].length > 8 ? `${shown[i].slice(0, 7)}…` : shown[i]} {series[i][rounds]}
          </text>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {shown.map((n, i) => (
          <li key={n} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: `var(--s${i + 1})` }} />
            {n}
          </li>
        ))}
        {names.length > 8 && <li className="text-muted">({t("onlyPoints")})</li>}
      </ul>
    </div>
  );
}
