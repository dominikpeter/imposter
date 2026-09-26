import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { aiUser, isAdmin } from "@/lib/auth";
import { dashboard, type Metric } from "@/lib/metrics";
import { aiEnabled, setAiEnabled } from "@/lib/rateLimit";
import { btn, card, ghost } from "@/lib/styles";

// Owner-only usage dashboard. Anyone else (signed out or not in ADMIN_EMAIL) gets a plain 404.
// ponytail: English only, it's not a player screen.
export const metadata: Metadata = { title: "Admin · Imposter", robots: { index: false, follow: false } };

const fmt = new Intl.NumberFormat("en");
const when = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Zurich" });
const TILES: { label: string; sum: (d: Record<Metric, number>) => number }[] = [
  { label: "Rounds played", sum: (d) => d.roomRounds + d.localRounds },
  { label: "Rooms created", sum: (d) => d.rooms },
  { label: "Sign-ins", sum: (d) => d.logins },
  { label: "AI calls", sum: (d) => d.aiCalls },
  { label: "AI tokens", sum: (d) => d.tokensIn + d.tokensOut },
  { label: "Coffees", sum: (d) => d.coffees },
  { label: "Coffee CHF", sum: (d) => d.coffeeRappen / 100 },
];

// the global AI switch; a server action, so it re-checks the caller itself (anyone can POST to it)
async function switchAi(form: FormData) {
  "use server";
  if (!isAdmin(await aiUser({ headers: await headers() }))) notFound();
  await setAiEnabled(form.get("on") === "1");
  revalidatePath("/admin");
}

export default async function Admin() {
  const user = await aiUser({ headers: await headers() });
  if (!isAdmin(user)) notFound();
  const [{ daily, users }, ai] = await Promise.all([dashboard(30), aiEnabled()]);
  const total = (days: number, f: (d: Record<Metric, number>) => number) => daily.slice(-days).reduce((n, d) => n + f(d), 0);
  const max = Math.max(1, ...daily.map((d) => d.roomRounds + d.localRounds));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-safe pb-safe">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="truncate text-sm text-muted">{user!.email}</p>
      </header>

      <form action={switchAi} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">AI help: {ai ? "on" : "off for everyone"}</h2>
          <p className="text-sm text-muted">{ai ? "Signed-in players get word checks and explanations." : "No AI calls anywhere; the AI buttons are hidden."}</p>
        </div>
        <input type="hidden" name="on" value={ai ? "0" : "1"} />
        <button className={ai ? `${ghost} border border-line` : `${btn} w-auto`}>{ai ? "Turn AI off" : "Turn AI on"}</button>
      </form>

      {/* headline numbers: today, last 7 and last 30 days */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Totals">
        {TILES.map((tile) => (
          <div key={tile.label} className={`${card} flex flex-col gap-1 p-4`}>
            <span className="text-sm text-muted">{tile.label}</span>
            <span className="text-3xl font-bold tabular-nums">{fmt.format(total(1, tile.sum))}</span>
            <span className="text-sm text-muted tabular-nums">
              7d {fmt.format(total(7, tile.sum))} · 30d {fmt.format(total(30, tile.sum))}
            </span>
          </div>
        ))}
      </section>

      {/* rounds per day: stacked room / one phone, hover a bar for the numbers */}
      <section className={card} aria-label="Rounds per day">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Rounds per day · last 30 days</h2>
          <div className="flex gap-3 text-sm text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-crew" /> Rooms</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-imp" /> One phone</span>
          </div>
        </div>
        <div className="flex h-40 items-end gap-0.5 border-b border-line">
          {daily.map((d) => {
            const n = d.roomRounds + d.localRounds;
            return (
              <div key={d.date} title={`${d.date}: ${d.roomRounds} in rooms, ${d.localRounds} on one phone`} className="flex h-full flex-1 flex-col justify-end gap-0.5 hover:opacity-80">
                {d.localRounds > 0 && <div className="rounded-t-sm bg-imp" style={{ height: `${(d.localRounds / max) * 100}%` }} />}
                {d.roomRounds > 0 && <div className={`bg-crew ${d.localRounds ? "" : "rounded-t-sm"}`} style={{ height: `${(d.roomRounds / max) * 100}%` }} />}
                {!n && <div className="h-px bg-line" />}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
          <span>{daily[0].date}</span>
          <span>max {max}/day</span>
          <span>{daily.at(-1)!.date}</span>
        </div>
      </section>

      {/* who signed in (for AI help) */}
      <section className={card} aria-label="Accounts">
        <h2 className="mb-2 font-semibold">Accounts · {users.length}</h2>
        {users.length ? (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Via</th>
                  <th className="px-2 py-2 text-right font-medium">Sign-ins</th>
                  <th className="px-2 py-2 text-right font-medium">AI calls</th>
                  <th className="px-2 py-2 text-right font-medium">Tokens</th>
                  <th className="px-2 py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-2 py-2 whitespace-nowrap">{u.name}</td>
                    <td className="px-2 py-2">{u.email}</td>
                    <td className="px-2 py-2 capitalize">{u.provider}</td>
                    <td className="px-2 py-2 text-right">{fmt.format(u.logins)}</td>
                    <td className="px-2 py-2 text-right">{fmt.format(u.aiCalls)}</td>
                    <td className="px-2 py-2 text-right">{fmt.format(u.tokens)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{when.format(u.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Nobody has signed in since tracking started.</p>
        )}
      </section>

      {/* every number per day (table view of the chart) */}
      <details className={card}>
        <summary className="cursor-pointer font-semibold">Daily numbers</summary>
        <div className="-mx-2 mt-2 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-right text-muted">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Day</th>
                <th className="px-2 py-2 font-medium">Rooms</th>
                <th className="px-2 py-2 font-medium">Room rounds</th>
                <th className="px-2 py-2 font-medium">1-phone rounds</th>
                <th className="px-2 py-2 font-medium">Sign-ins</th>
                <th className="px-2 py-2 font-medium">AI calls</th>
                <th className="px-2 py-2 font-medium">Tokens in / out</th>
              </tr>
            </thead>
            <tbody className="text-right">
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="px-2 py-1.5 text-left">{d.date}</td>
                  <td className="px-2 py-1.5">{d.rooms}</td>
                  <td className="px-2 py-1.5">{d.roomRounds}</td>
                  <td className="px-2 py-1.5">{d.localRounds}</td>
                  <td className="px-2 py-1.5">{d.logins}</td>
                  <td className="px-2 py-1.5">{d.aiCalls}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{fmt.format(d.tokensIn)} / {fmt.format(d.tokensOut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
