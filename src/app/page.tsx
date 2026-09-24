"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CATEGORIES, LANGS, UI, type Lang } from "@/lib/i18n";
import { mergeWritten, newRound, packSecret, pick, type Round, type Secret, type Text } from "@/lib/game";
import { tally } from "@/lib/vote";

type Phase = "setup" | "write" | "reveal" | "discuss" | "vote" | "tie" | "result";
type Mode = "packs" | "custom";

// everything needed to resume after a reload / accidental back; read once on the client (server gets {})
type Saved = Partial<{
  lang: Lang; players: string[]; imposterCount: number; mode: Mode; cats: string[]; perPlayer: number; hint: boolean;
  pool: Secret[]; used: string[]; writing: Secret[]; phase: Phase; round: Round | null; turn: number; votes: number[];
  accused: number | null;
}>;
const KEY = "imposter:v1";
const saved: Saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
})();
const blank = (n: number) => Array.from({ length: n }, () => ({ word: "", clue: "" }));
const noop = () => () => {};

type Theme = "auto" | "light" | "dark";
const THEMES: Theme[] = ["auto", "light", "dark"];

// "auto" follows the system; a saved choice is applied before paint by the script in layout.tsx
const listeners = new Set<() => void>();
const themeStore = {
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: (): Theme => {
    try {
      const t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : "auto";
    } catch {
      return "auto";
    }
  },
  set: (next: Theme) => {
    const root = document.documentElement;
    if (next === "auto") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    listeners.forEach((l) => l());
  },
};

const press = "transition duration-200 ease-spring active:scale-[0.97]";
const btn = `flex min-h-14 w-full items-center justify-center rounded-full bg-primary-dark px-6 text-lg font-semibold text-white hover:bg-primary disabled:opacity-40 disabled:active:scale-100 ${press}`;
const ghost = `min-h-11 rounded-full px-4 font-medium text-primary-ink hover:bg-tint ${press}`;
const card = "rounded-3xl border border-line bg-surface p-5";
const heading = "text-lg font-semibold";
const chip = `min-h-11 rounded-full border px-4 font-medium ${press}`;
const chipOn = "border-line bg-tint text-primary-ink";
const chipOff = "border-divider/60 bg-surface text-muted hover:border-divider";
const round_btn = `size-11 rounded-full border border-divider/70 bg-surface text-2xl leading-none text-ink hover:border-primary hover:text-primary-ink disabled:opacity-30 disabled:active:scale-100 disabled:hover:border-divider/70 disabled:hover:text-ink ${press}`;
const field =
  "w-full rounded-2xl border border-divider/60 bg-surface px-4 py-3 text-lg transition outline-none placeholder:text-divider focus:border-primary focus-visible:outline-none";

export default function Home() {
  const [lang, setLang] = useState<Lang>(saved.lang ?? "en");
  const [players, setPlayers] = useState(saved.players ?? ["Lisa", "Nora", "Tim", "Beni", "Domi"]);
  const [imposterCount, setImposterCount] = useState(saved.imposterCount ?? 1);
  const [mode, setMode] = useState<Mode>(saved.mode ?? "packs");
  const [cats, setCats] = useState(
    saved.cats?.filter((id) => CATEGORIES.some((c) => c.id === id)) ?? CATEGORIES.map((c) => c.id),
  );
  const [perPlayer, setPerPlayer] = useState(saved.perPlayer ?? 2);
  const [pool, setPool] = useState<Secret[]>(saved.pool ?? []);
  const [used, setUsed] = useState<string[]>(saved.used ?? []);
  const [writing, setWriting] = useState<Secret[]>(saved.writing ?? []);
  const [draft, setDraft] = useState(() => blank(saved.perPlayer ?? 2));
  const [hint, setHint] = useState(saved.hint ?? true);
  const [round, setRound] = useState<Round | null>(saved.round ?? null);
  const [phase, setPhase] = useState<Phase>(saved.round || saved.phase === "write" ? (saved.phase ?? "setup") : "setup");
  const [turn, setTurn] = useState(saved.turn ?? 0);
  const [shown, setShown] = useState(false);
  const [votes, setVotes] = useState<number[]>(saved.votes ?? []);
  const [accused, setAccused] = useState<number | null>(saved.accused ?? null);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ lang, players, imposterCount, mode, cats, perPlayer, hint, pool, used, writing, phase, round, turn, votes, accused }),
      );
    } catch {}
  }, [lang, players, imposterCount, mode, cats, perPlayer, hint, pool, used, writing, phase, round, turn, votes, accused]);

  // server + hydration render nothing, so restored state never mismatches the server HTML
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  const t = (k: keyof typeof UI) => UI[k][lang];
  const tx = (v: Text) => (typeof v === "string" ? v : v[lang]);
  // ponytail: up to half the table can be imposters; raise if a "chaos" mode ever wants more
  const maxImposters = Math.max(1, Math.floor(players.length / 2));
  const imposters = Math.min(imposterCount, maxImposters);
  const names = players.map((p, i) => p.trim() || `${t("playerName")} ${i + 1}`);
  const canStart = players.length >= 3 && (mode === "custom" || cats.length > 0);
  const allCats = cats.length === CATEGORIES.length;

  // authors are player indices, so adding/removing players invalidates written words
  const editPlayers = (next: string[]) => {
    if (next.length !== players.length) setPool([]);
    setPlayers(next);
  };

  const begin = (secret: Secret) => {
    setRound(newRound(players.length, imposters, secret));
    setVotes([]);
    setAccused(null);
    setTurn(0);
    setShown(false);
    setPhase("reveal");
  };

  const beginFromPool = (p: Secret[]) => {
    const i = pick(p.length);
    setPool(p.filter((_, j) => j !== i));
    begin(p[i]);
  };

  const start = () => {
    if (mode === "packs") {
      const s = packSecret(cats, new Set(used));
      setUsed(used.includes(s.key) ? [s.key] : [...used, s.key]); // already used = every word was played, start over
      return begin(s);
    }
    if (pool.length) return beginFromPool(pool);
    setWriting([]);
    setDraft(blank(perPlayer));
    setTurn(0);
    setShown(false);
    setPhase("write");
  };

  // words stay in `writing` until everyone is done, so quitting halfway never leaves a partial pool
  const submitWords = () => {
    const next = mergeWritten(writing, draft, turn);
    setDraft(blank(perPlayer));
    setShown(false);
    if (turn + 1 < players.length) {
      setWriting(next);
      setTurn(turn + 1);
    } else {
      setWriting([]);
      beginFromPool(next);
    }
  };

  const startVote = () => {
    setVotes([]);
    setTurn(0);
    setShown(false);
    setPhase("vote");
  };

  const castVote = (target: number) => {
    const v = [...votes, target];
    setVotes(v);
    setShown(false);
    if (v.length < players.length) return setTurn(turn + 1);
    const { accused } = tally(v, players.length);
    if (accused === null) return setPhase("tie");
    setAccused(accused);
    setPhase("result");
  };

  const quit = () => {
    if (!confirm(t("quitConfirm"))) return;
    setWriting([]);
    setPhase("setup");
  };

  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "auto" as Theme);

  // segmented control with a sliding indicator (transform only)
  const segmented = <T extends string>(
    options: { id: T; label: string; title?: string }[],
    value: T,
    onChange: (v: T) => void,
    size: "sm" | "md" = "md",
  ) => {
    const i = Math.max(0, options.findIndex((o) => o.id === value));
    return (
      <div
        className={`relative grid rounded-full border border-line bg-surface p-0.5 ${size === "sm" ? "text-sm font-semibold" : "font-medium"}`}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-primary-dark transition-transform duration-300 ease-spring"
          style={{ width: `calc((100% - 0.25rem) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
        />
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            aria-label={o.title}
            aria-pressed={o.id === value}
            className={`relative z-10 min-h-10 rounded-full px-1 whitespace-nowrap transition-colors duration-300 ${o.id === value ? "text-white" : "text-muted hover:text-ink"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  };

  const passScreen = (action: string) => (
    <>
      <div className="enter">
        <p className="text-lg text-muted">{t("passTo")}</p>
        <p className="mt-1 text-5xl font-bold tracking-tight break-words">{names[turn]}</p>
      </div>
      <button
        onClick={() => setShown(true)}
        aria-label={action}
        className={`card-back enter mt-2 grid aspect-[4/5] w-full max-w-64 place-items-center rounded-3xl border border-line p-4 text-primary-ink hover:border-primary [animation-delay:80ms] ${press}`}
      >
        <span className="rounded-2xl bg-surface/95 px-6 py-5">
          <span className="block text-5xl">{phase === "write" ? "✍️" : phase === "vote" ? "🗳️" : "👀"}</span>
          <span className="mt-3 block font-semibold">{action}</span>
        </span>
      </button>
    </>
  );

  const stepper = (value: number, set: (n: number) => void, min: number, max: number) => (
    <div className="flex shrink-0 items-center gap-1">
      <button onClick={() => set(value - 1)} disabled={value <= min} className={round_btn} aria-label="−">
        −
      </button>
      <span key={value} className="pop inline-block w-8 text-center text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <button onClick={() => set(value + 1)} disabled={value >= max} className={round_btn} aria-label="+">
        +
      </button>
    </div>
  );

  const progress = (
    <div className="flex items-center gap-1.5" aria-label={`${turn + 1} / ${players.length}`}>
      {players.map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${i === turn ? "w-6 bg-primary-dark" : i < turn ? "w-1.5 bg-primary-light" : "w-1.5 bg-divider/60"}`}
        />
      ))}
    </div>
  );

  const next = () => {
    setShown(false);
    if (turn + 1 < players.length) setTurn(turn + 1);
    else setPhase("discuss");
  };

  if (!hydrated) return <main className="flex-1" />;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-6 flex items-center justify-between gap-3">
        {phase === "setup" || phase === "result" ? (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Imposter</h1>
            <p className="text-sm text-muted">{t("tagline")}</p>
          </div>
        ) : (
          <button onClick={quit} aria-label={t("quit")} className={`${ghost} -ml-3 flex items-center gap-1 whitespace-nowrap text-muted`}>
            <span className="text-2xl leading-none">×</span>
            <span className="max-[359px]:hidden">{t("quit")}</span>
          </button>
        )}
        {segmented(
          LANGS.map((l) => ({ id: l.id, label: l.id.toUpperCase(), title: l.label })),
          lang,
          setLang,
          "sm",
        )}
      </header>

      {phase === "setup" && (
        <div key="setup" className="enter flex flex-1 flex-col gap-4">
          <section className={card}>
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className={heading}>{t("players")}</h2>
              <span key={players.length} className="pop inline-block text-muted tabular-nums">
                {players.length}
              </span>
            </div>
            <ul className="flex flex-col">
              {players.map((p, i) => (
                <li key={i} className="enter flex items-center gap-3 border-b border-divider/30 last:border-0">
                  <input
                    value={p}
                    placeholder={`${t("playerName")} ${i + 1}`}
                    onChange={(e) => editPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
                    className="min-w-0 flex-1 bg-transparent py-3 text-lg outline-none placeholder:text-divider focus-visible:outline-none"
                  />
                  <button
                    onClick={() => editPlayers(players.filter((_, j) => j !== i))}
                    aria-label="Remove"
                    className={`size-11 rounded-full text-2xl leading-none text-divider hover:bg-canvas hover:text-ink ${press}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => editPlayers([...players, ""])} className={`${ghost} -ml-4 mt-1`}>
              + {t("addPlayer")}
            </button>
          </section>

          <section className={`${card} flex flex-col gap-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 hyphens-auto">
                <h2 className={heading}>{t("imposters")}</h2>
                <p className="text-sm text-muted">1–{maxImposters}</p>
              </div>
              {stepper(imposters, setImposterCount, 1, maxImposters)}
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span>{t("hint")}</span>
              <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} className="peer sr-only" />
              <span className="switch shrink-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
            </label>
          </section>

          <section className={`${card} flex flex-col gap-4`}>
            <h2 className={heading}>{t("words")}</h2>
            {segmented(
              [
                { id: "packs" as Mode, label: t("builtIn") },
                { id: "custom" as Mode, label: t("ourWords") },
              ],
              mode,
              setMode,
            )}
            {mode === "packs" ? (
              <div key="packs" className="enter flex flex-wrap gap-2">
                <div className="mb-1 flex w-full items-baseline justify-between">
                  <span>{t("topics")}</span>
                  <span key={cats.length} className="pop inline-block text-sm text-muted tabular-nums">
                    {cats.length} / {CATEGORIES.length}
                  </span>
                </div>
                <button
                  onClick={() => setCats(allCats ? [] : CATEGORIES.map((c) => c.id))}
                  aria-pressed={allCats}
                  className={`${chip} ${allCats ? "border-primary-dark bg-primary-dark text-white" : chipOff}`}
                >
                  {t("allTopics")}
                </button>
                {CATEGORIES.map((c) => {
                  const on = cats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
                      aria-pressed={on}
                      className={`${chip} ${on ? chipOn : chipOff}`}
                    >
                      {c.emoji} {c.name[lang]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div key="custom" className="enter flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 hyphens-auto">{t("perPlayer")}</span>
                  {stepper(perPlayer, setPerPlayer, 1, 5)}
                </div>
                {pool.length > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-2">
                    <span className="text-muted">
                      {pool.length} {t("left")}
                    </span>
                    <button onClick={() => setPool([])} className={`${ghost} -mr-3`}>
                      {t("writeNew")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-muted">{t("appearance")}</span>
            <div className="w-52">
              {segmented(
                THEMES.map((id) => ({ id, label: t(id === "auto" ? "themeAuto" : id === "light" ? "themeLight" : "themeDark") })),
                theme,
                themeStore.set,
                "sm",
              )}
            </div>
          </div>

          <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mt-auto pt-2">
            <button onClick={start} disabled={!canStart} className={`${btn} shadow-lg shadow-primary-dark/25`}>
              {canStart ? t("start") : players.length < 3 ? t("minPlayers") : t("pickTopic")}
            </button>
          </div>
        </div>
      )}

      {phase === "write" && (
        <div key={`write-${turn}-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {progress}
          {!shown ? (
            passScreen(t("tapWrite"))
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitWords();
              }}
              className="enter flex w-full flex-col gap-5 text-left"
            >
              <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight">{t("writeTitle")}</h2>
                <p className="mt-2 text-muted">{t("writeHelp")}</p>
              </div>
              {draft.map((d, i) => (
                <div key={i} className={`${card} flex flex-col gap-2 p-3`}>
                  <input
                    required
                    autoFocus={i === 0}
                    autoComplete="off"
                    value={d.word}
                    placeholder={`${t("word")} ${perPlayer > 1 ? i + 1 : ""}`}
                    onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)))}
                    className={`${field} font-semibold`}
                  />
                  <input
                    autoComplete="off"
                    value={d.clue}
                    placeholder={t("clue")}
                    onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, clue: e.target.value } : x)))}
                    className={`${field} border-divider/30 text-base`}
                  />
                </div>
              ))}
              <button disabled={draft.some((d) => !d.word.trim())} className={btn}>
                {t("done")}
              </button>
            </form>
          )}
        </div>
      )}

      {phase === "reveal" && round && (
        <div key={`reveal-${turn}-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {progress}
          {!shown ? (
            passScreen(t("tapReveal"))
          ) : (
            <>
              {round.imposters.includes(turn) ? (
                <div className="flip imposter-back glow relative w-full rounded-3xl px-6 py-12 text-white">
                  <p className="text-lg text-white/80">{t("youAre")}</p>
                  <p className="shake mt-1 text-4xl font-bold tracking-tight break-words sm:text-5xl">{t("imposter")}</p>
                  {hint && tx(round.clue) && (
                    <p className="mx-auto mt-6 inline-block rounded-full bg-white/15 px-4 py-1.5 font-medium">
                      {t("clueLabel")}: {tx(round.clue)}
                    </p>
                  )}
                  <p className="mt-4 text-white/80">{t("blend")}</p>
                </div>
              ) : (
                <div className={`${card} flip w-full py-16`}>
                  <p className="text-lg text-muted">{tx(round.clue) || t("yourWord")}</p>
                  <p className="mt-2 text-5xl font-bold tracking-tight break-words text-primary-ink">{tx(round.word)}</p>
                </div>
              )}
              <button onClick={next} className={`${btn} enter [animation-delay:250ms]`}>
                {t("hideNext")}
              </button>
            </>
          )}
        </div>
      )}

      {phase === "discuss" && round && (
        <div key="discuss" className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="pop text-6xl">💬</span>
          <h2 className="enter text-4xl font-bold tracking-tight [animation-delay:60ms]">{t("discuss")}</h2>
          <p className="enter rounded-full bg-tint px-5 py-2 text-lg text-primary-ink [animation-delay:140ms]">
            <span className="font-semibold">{names[round.starter]}</span> {t("starts")}
          </p>
          <p className="enter max-w-xs text-muted [animation-delay:200ms]">{t("discussHelp")}</p>
          <div className="enter mt-6 flex w-full flex-col gap-2 [animation-delay:280ms]">
            <button onClick={startVote} className={btn}>
              🗳️ {t("vote")}
            </button>
            <button
              onClick={() => {
                setAccused(null);
                setPhase("result");
              }}
              className={`${ghost} text-muted`}
            >
              {t("skipVote")}
            </button>
          </div>
        </div>
      )}

      {phase === "vote" && round && (
        <div key={`vote-${turn}-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {progress}
          {!shown ? (
            passScreen(t("tapVote"))
          ) : (
            <div className="enter flex w-full flex-col gap-4">
              <div>
                <p className="text-lg text-muted">{names[turn]}</p>
                <h2 className="text-3xl font-bold tracking-tight">{t("whoIs")}</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {names.map((n, i) =>
                  i === turn ? null : (
                    <button
                      key={i}
                      onClick={() => castVote(i)}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className={`enter min-h-16 rounded-2xl border border-line bg-surface px-3 text-lg font-semibold break-words hover:border-primary ${press}`}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "tie" && round && (
        <div key="tie" className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="pop text-6xl">⚖️</span>
          <h2 className="enter text-4xl font-bold tracking-tight">{t("tie")}</h2>
          <p className="enter max-w-xs text-muted [animation-delay:80ms]">{t("tieHelp")}</p>
          <ul className="enter flex w-full flex-col gap-2 [animation-delay:140ms]">
            {tally(votes, players.length)
              .counts.map((c, i) => ({ c, i }))
              .filter((x) => x.c > 0)
              .sort((a, b) => b.c - a.c)
              .map(({ c, i }) => (
                <li key={i} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                  <span className="font-semibold">{names[i]}</span>
                  <span className="text-muted tabular-nums">
                    {c} {t(c === 1 ? "voteOne" : "votes")}
                  </span>
                </li>
              ))}
          </ul>
          <button onClick={() => setPhase("discuss")} className={`${btn} enter mt-4 [animation-delay:220ms]`}>
            💬 {t("discussAgain")}
          </button>
        </div>
      )}

      {phase === "result" && round && (
        <div key="result" className="flex flex-1 flex-col justify-center gap-3 text-center">
          {accused !== null && (
            <div className="pop mb-2">
              <p className="text-4xl font-bold tracking-tight">
                {round.imposters.includes(accused) ? `🎉 ${t("caught")}` : `😈 ${t("wrong")}`}
              </p>
              <p className="mt-1 text-lg text-muted">
                <span className="font-semibold text-ink">{names[accused]}</span>{" "}
                {t(round.imposters.includes(accused) ? "caughtHelp" : "wrongHelp")}
              </p>
            </div>
          )}
          <div className="flip imposter-back glow relative rounded-3xl px-6 py-10 text-white">
            <p className="text-lg text-white/80">{t(round.imposters.length > 1 ? "impostersWere" : "imposterWas")}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight break-words">
              {new Intl.ListFormat(lang).format(round.imposters.map((i) => names[i]))}
            </p>
          </div>
          <div className={`${card} enter [animation-delay:200ms]`}>
            <p className="text-muted">{t("theWord")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight break-words text-primary-ink">{tx(round.word)}</p>
          </div>
          <div className="enter flex flex-col gap-3 [animation-delay:340ms]">
            <button onClick={start} className={`${btn} mt-6`}>
              {mode === "custom" && !pool.length ? t("writeNew") : t("playAgain")}
            </button>
            {mode === "custom" && pool.length > 0 && (
              <p className="text-sm text-muted">
                {pool.length} {t("left")}
              </p>
            )}
            <button onClick={() => setPhase("setup")} className={`mx-auto min-h-11 rounded-full px-4 text-muted hover:text-ink ${press}`}>
              {t("newSetup")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
