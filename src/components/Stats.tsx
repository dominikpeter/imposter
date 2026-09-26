"use client";

import { ChartColumn, ChevronDown, CircleCheck, Footprints, Medal, RotateCcw, Search, Siren, Trophy, VenetianMask, type LucideIcon } from "lucide-react";
import { UI, type Lang } from "@/lib/i18n";
import { most, stats, type PlayerStats, type RoundLog, type RoundResult } from "@/lib/stats";
import type { Text } from "@/lib/game";
import { card, ghost } from "@/lib/ui";
import { Timeline } from "@/components/Timeline";

const MEDALS = ["text-gold", "text-silver", "text-bronze"];
// "All numbers" as a heatmap: each column shaded by its own maximum, one hue light → strong (text stays readable)
const HEAT = ["imposter", "escaped", "correctVotes", "votesTaken", "points"] as const;
// the column's top value is a solid cell (button colours, readable text); the rest ramp from faint to 45 %
const heat = (v: number, max: number) =>
  !v || !max
    ? undefined
    : v === max
      ? { backgroundColor: "var(--c-primary-dark)", color: "var(--c-on-primary)" }
      : { backgroundColor: `color-mix(in oklab, var(--c-primary-dark) ${Math.round(12 + (v / max) * 33)}%, var(--c-surface))` };

const RESULT: Record<RoundResult, { dot: string; label: keyof typeof UI }> = {
  caught: { dot: "bg-crew", label: "resultCaught" },
  escaped: { dot: "bg-imp", label: "resultEscaped" },
  guessed: { dot: "bg-imp", label: "resultGuessed" },
  skipped: { dot: "bg-line", label: "resultSkipped" },
};
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");
const chevron = <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />;

/** End-of-round session stats: tiles, crew-vs-imposter split, awards, two bar charts, table view. */
export function Stats({ history, lang, onReset }: { history: RoundLog[]; lang: Lang; onReset?: () => void }) {
  if (!history.length) return null;
  const t = (k: keyof typeof UI) => UI[k][lang];
  const s = stats(history);
  const decided = s.crewWins + s.imposterWins;
  const top = (f: (p: PlayerStats) => number) => {
    const best = [...s.players].sort((a, b) => f(b) - f(a))[0];
    return best && f(best) > 0 ? best : null;
  };
  const awards = [
    { Icon: Trophy as LucideIcon, label: t("mvp"), p: top((p) => p.points), value: (p: PlayerStats) => `${p.points} ${t(p.points === 1 ? "pt" : "pts")}` },
    { Icon: VenetianMask, label: t("bestLiar"), p: top((p) => p.escaped), value: (p: PlayerStats) => `${p.escaped}× ${t("escapes")}` },
    { Icon: Search, label: t("detective"), p: top((p) => p.correctVotes), value: (p: PlayerStats) => `${p.correctVotes} ${t(p.correctVotes === 1 ? "hit" : "hits")}` },
    { Icon: Siren, label: t("suspected"), p: top((p) => p.votesTaken), value: (p: PlayerStats) => `${p.votesTaken} ${t(p.votesTaken === 1 ? "vote1" : "votes")}` },
  ].filter((a) => a.p);
  const maxPts = Math.max(1, ...s.players.map((p) => p.points));
  const colMax = Object.fromEntries(HEAT.map((k) => [k, Math.max(0, ...s.players.map((p) => p[k]))])) as Record<(typeof HEAT)[number], number>;
  const suspects = [...s.players].filter((p) => p.votesTaken > 0).sort((a, b) => b.votesTaken - a.votesTaken);
  const maxVotes = Math.max(1, ...suspects.map((p) => p.votesTaken));
  const word = (w: Text) => (typeof w === "string" ? w : w[lang]);
  const rival = (counts: Record<string, number>) => ((m) => (m ? `${m[0]} (${m[1]}×)` : "–"))(most(counts));

  return (
    <section aria-label={t("stats")} className={`${card} enter mt-4 flex flex-col gap-6 text-left anim-delay-450`}>
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ChartColumn className="size-6 text-primary-ink" aria-hidden /> {t("stats")}
      </h2>

      {/* hero tiles */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: s.rounds, label: t("rounds"), dot: null },
          { n: s.crewWins, label: t("crewWins"), dot: "bg-crew" },
          { n: s.imposterWins, label: t("imposterWins"), dot: "bg-imp" },
        ].map((tile, i) => (
          <div key={i} className="flex flex-col items-center rounded-2xl bg-tint px-2 py-3 text-center">
            <span key={tile.n} className="pop text-4xl font-bold tabular-nums" style={{ animationDelay: `${500 + i * 90}ms` }}>
              {tile.n}
            </span>
            <span className="mt-1 flex flex-col items-center gap-1 text-sm leading-tight text-balance text-muted">
              <span className={`size-2.5 shrink-0 rounded-full ${tile.dot ?? ""}`} /> {/* empty for Rounds: keeps the labels aligned */}
              {tile.label}
            </span>
          </div>
        ))}
      </div>

      {/* crew vs imposters: one split bar, legend + direct labels */}
      {decided > 0 && (
        <div>
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${t("crew")} ${s.crewWins} · ${t("imposters")} ${s.imposterWins}`}>
            {s.crewWins > 0 && <div className="bar-grow rounded-l-full bg-crew" style={{ flexGrow: s.crewWins }} title={`${t("crew")}: ${s.crewWins}`} />}
            {s.imposterWins > 0 && (
              <div className="bar-grow rounded-r-full bg-imp anim-delay-120" style={{ flexGrow: s.imposterWins }} title={`${t("imposters")}: ${s.imposterWins}`} />
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-crew" /> {t("crew")} · {Math.round((s.crewWins / decided) * 100)}%
            </span>
            <span className="flex items-center gap-1.5">
              {t("imposters")} · {Math.round((s.imposterWins / decided) * 100)}% <span className="size-2.5 rounded-full bg-imp" />
            </span>
          </div>
        </div>
      )}

      {/* awards */}
      {awards.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {awards.map((a, i) => (
            <div key={a.label} className="pop flex flex-col rounded-2xl border border-line p-3" style={{ animationDelay: `${600 + i * 100}ms` }}>
              <a.Icon className="size-7 text-primary-ink" strokeWidth={1.75} aria-hidden />
              <span className="mt-1 text-sm text-muted">{a.label}</span>
              <span className="truncate text-lg font-bold">{a.p!.name}</span>
              <span className="text-sm text-muted">{a.value(a.p!)}</span>
            </div>
          ))}
        </div>
      )}

      {/* leaderboard: one series, value labels at the bar end */}
      <div>
        <h3 className="font-semibold">{t("leaderboard")}</h3>
        <p className="text-sm text-muted">{t("pointsHelp")}</p>
        <p className="mb-3 text-sm text-muted">{t("tapForDetails")}</p>
        <ol className="flex flex-col gap-1">
          {s.players.map((p, i) => (
            <li key={p.name} title={`${p.name}: ${p.points} ${t("pts")}`}>
              <details className="group rounded-2xl open:bg-tint">
                <summary className="summary-plain flex min-h-11 items-center gap-2 rounded-2xl px-1 py-1">
                  <span className="grid w-7 shrink-0 place-items-center">
                    {MEDALS[i] ? <Medal className={`size-5 ${MEDALS[i]}`} aria-label={`#${i + 1}`} /> : <span className="text-sm text-muted">{i + 1}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="h-2.5 rounded-full bg-tint group-open:bg-surface">
                      <span
                        className="bar-grow block h-full rounded-full bg-crew"
                        style={{ width: `${(p.points / maxPts) * 100}%`, animationDelay: `${700 + i * 70}ms` }}
                      />
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {p.points} <span className="font-normal text-muted">{t(p.points === 1 ? "pt" : "pts")}</span>
                  </span>
                  {chevron}
                </summary>
                {/* drill-down: rates, rivals, what each round brought */}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pt-1 pb-3 text-sm">
                  <div>
                    <dt className="text-muted">{t("hitRate")}</dt>
                    <dd className="font-semibold tabular-nums">{pct(p.correctVotes, p.crewVotes)} <span className="font-normal text-muted">({p.correctVotes}/{p.crewVotes})</span></dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("escapeRate")}</dt>
                    <dd className="font-semibold tabular-nums">{pct(p.escaped, p.imposter)} <span className="font-normal text-muted">({p.escaped}/{p.imposter})</span></dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted">{t("suspectsMost")}</dt>
                    <dd className="truncate font-semibold">{rival(p.votedFor)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted">{t("suspectedBy")}</dt>
                    <dd className="truncate font-semibold">{rival(p.votedBy)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">{t("perRound")}</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {p.gains.map((g, r) => (
                        <span
                          key={r}
                          title={`${t("round")} ${r + 1}`}
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${g ? "bg-primary-dark text-on-primary" : "bg-surface text-muted"}`}
                        >
                          {r + 1}: +{g}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              </details>
            </li>
          ))}
        </ol>
      </div>

      {s.rounds > 0 && <Timeline timeline={s.timeline} names={s.players.map((p) => p.name)} lang={lang} />}

      {/* times imposter: one series, value labels at the bar end */}
      {s.players.some((p) => p.imposter > 0) && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <VenetianMask className="size-4 text-imp" aria-hidden /> {t("timesImposter")}
          </h3>
          <ol className="flex flex-col gap-2">
            {[...s.players]
              .sort((a, b) => b.imposter - a.imposter)
              .map((p, i) => (
                <li key={p.name} className="flex items-end gap-2" title={`${p.name}: ${p.imposter}`}>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="h-2.5 rounded-full bg-tint">
                      <span className="bar-grow block h-full rounded-full bg-imp" style={{ width: `${(p.imposter / Math.max(1, ...s.players.map((x) => x.imposter))) * 100}%`, animationDelay: `${750 + i * 70}ms` }} />
                    </span>
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{p.imposter}</span>
                </li>
              ))}
          </ol>
        </div>
      )}

      {/* most suspected */}
      {suspects.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-semibold">
            <Siren className="size-4 text-imp" aria-hidden /> {t("suspected")}
          </h3>
          <ol className="flex flex-col gap-2">
            {suspects.map((p, i) => (
              <li key={p.name} className="flex items-end gap-2" title={`${p.name}: ${p.votesTaken} ${t("votes")}`}>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="h-2.5 rounded-full bg-tint">
                    <span className="bar-grow block h-full rounded-full bg-imp" style={{ width: `${(p.votesTaken / maxVotes) * 100}%`, animationDelay: `${800 + i * 70}ms` }} />
                  </span>
                </span>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">{p.votesTaken}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* rounds & words: one row per round, open it for the imposters and every vote */}
      <div>
        <h3 className="mb-2 font-semibold">{t("roundsWords")}</h3>
        <ol className="flex flex-col gap-1">
          {s.log.map((r, i) => (
            <li key={i}>
              <details className="group rounded-2xl border border-line open:bg-tint">
                <summary className="summary-plain flex min-h-11 items-center gap-2 px-3 py-2">
                  <span className="w-5 shrink-0 text-sm text-muted tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{word(r.word)}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
                    <span className={`size-2.5 rounded-full ${RESULT[r.result].dot}`} /> {t(RESULT[r.result].label)}
                  </span>
                  {chevron}
                </summary>
                <div className="flex flex-col gap-2 px-3 pb-3 text-sm">
                  <p className="flex items-center gap-1.5">
                    <VenetianMask className="size-4 shrink-0 text-imp" aria-hidden />
                    <span className="text-muted">{t("asImposter")}</span> <span className="min-w-0 truncate font-semibold">{r.imposters.join(", ")}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Siren className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="text-muted">{t("accusedLabel")}</span> <span className="min-w-0 truncate font-semibold">{r.accused ?? t("nobody")}</span>
                  </p>
                  {r.votes.length > 0 && (
                    <ul className="flex flex-wrap gap-1" aria-label={t("votes")}>
                      {r.votes.map(([from, to]) => (
                        <li
                          key={from}
                          className={`max-w-full truncate rounded-full px-2 py-0.5 text-xs border bg-surface ${r.imposters.includes(to) ? "border-crew font-semibold" : "border-line"}`}
                        >
                          {from} → {to}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>

      {/* table view: every number, for screen readers and the curious */}
      <div className="rounded-2xl border border-line">
        <h3 className="px-4 pt-3 font-semibold">{t("details")}</h3>
        <p className="px-4 text-sm text-muted">{t("heatLegend")}</p>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full border-separate border-spacing-0.5 text-sm tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="px-1.5 py-2 text-left font-medium">{t("player")}</th>
                <th className="px-1.5 py-2 text-right font-medium" title={t("asImposter")}>
                  <VenetianMask className="ml-auto size-4" aria-label={t("asImposter")} />
                </th>
                <th className="px-1.5 py-2 text-right font-medium" title={t("escapes")}>
                  <Footprints className="ml-auto size-4" aria-label={t("escapes")} />
                </th>
                <th className="px-1.5 py-2 text-right font-medium" title={t("hits")}>
                  <CircleCheck className="ml-auto size-4" aria-label={t("hits")} />
                </th>
                <th className="px-1.5 py-2 text-right font-medium" title={t("votes")}>
                  <Siren className="ml-auto size-4" aria-label={t("votes")} />
                </th>
                <th className="px-1.5 py-2 text-right font-medium">{t("pts")}</th>
              </tr>
            </thead>
            <tbody>
              {s.players.map((p) => (
                <tr key={p.name}>
                  <td className="max-w-24 truncate px-1.5 py-2">{p.name}</td>
                  {HEAT.map((k) => (
                    <td key={k} className={`rounded-md px-1.5 py-2 text-right ${k === "points" ? "font-semibold" : ""}`} style={heat(p[k], colMax[k])}>
                      {p[k]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {/* what the column icons mean */}
          <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 px-1.5 text-sm text-muted sm:grid-cols-2">
            {[
              { Icon: VenetianMask, label: t("timesImposter") },
              { Icon: Footprints, label: t("legendEscaped") },
              { Icon: CircleCheck, label: t("legendHits") },
              { Icon: Siren, label: t("legendVotes") },
            ].map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0" aria-hidden /> {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {onReset && (
        <button onClick={onReset} className={`${ghost} self-center text-muted`}>
          <span className="flex items-center gap-2">
            <RotateCcw className="size-4" aria-hidden /> {t("resetStats")}
          </span>
        </button>
      )}
    </section>
  );
}
