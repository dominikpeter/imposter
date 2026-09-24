"use client";

import { useState } from "react";
import { CATEGORIES, LANGS, UI, type Lang } from "@/lib/i18n";

type Text = string | Record<Lang, string>;
type Secret = { word: Text; clue: Text; author?: number };
type Round = Secret & { imposters: number[]; starter: number };
type Phase = "setup" | "write" | "reveal" | "discuss" | "result";
type Mode = "packs" | "custom";

const pick = (n: number) => Math.floor(Math.random() * n);

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function packSecret(cats: string[]): Secret {
  const pool = CATEGORIES.filter((c) => cats.includes(c.id));
  const c = pool[pick(pool.length)];
  const clue = Object.fromEntries(LANGS.map((l) => [l.id, `${c.emoji} ${c.name[l.id]}`])) as Record<Lang, string>;
  return { word: c.words[pick(c.words.length)], clue };
}

function newRound(players: number, imposterCount: number, secret: Secret): Round {
  // whoever wrote the word already knows it, so they can never be the imposter
  const candidates = [...Array(players).keys()].filter((i) => i !== secret.author);
  return { ...secret, imposters: shuffle(candidates).slice(0, imposterCount), starter: pick(players) };
}


const btn =
  "flex min-h-14 w-full items-center justify-center rounded-full bg-primary-dark px-6 text-lg font-semibold text-white transition hover:bg-primary active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100";
const ghost = "min-h-11 rounded-full px-4 font-medium text-primary-dark transition hover:bg-primary-light/40";
const card = "rounded-3xl border border-primary-light/60 bg-white p-5";
const heading = "text-lg font-semibold";
const round_btn =
  "size-11 rounded-full border border-divider/70 bg-white text-2xl leading-none text-ink transition hover:border-primary hover:text-primary-dark disabled:opacity-30 disabled:hover:border-divider/70 disabled:hover:text-ink";
const field =
  "w-full rounded-2xl border border-divider/60 bg-white px-4 py-3 text-lg outline-none transition placeholder:text-divider focus:border-primary";

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [players, setPlayers] = useState(["Anna", "Ben", "Chloé", "David"]);
  const [imposterCount, setImposterCount] = useState(1);
  const [mode, setMode] = useState<Mode>("packs");
  const [cats, setCats] = useState(CATEGORIES.map((c) => c.id));
  const [perPlayer, setPerPlayer] = useState(2);
  const [pool, setPool] = useState<Secret[]>([]);
  const [draft, setDraft] = useState<{ word: string; clue: string }[]>([]);
  const [hint, setHint] = useState(true);
  const [phase, setPhase] = useState<Phase>("setup");
  const [round, setRound] = useState<Round | null>(null);
  const [turn, setTurn] = useState(0);
  const [shown, setShown] = useState(false);

  const t = (k: keyof typeof UI) => UI[k][lang];
  const tx = (v: Text) => (typeof v === "string" ? v : v[lang]);
  // ponytail: up to half the table can be imposters; raise if a "chaos" mode ever wants more
  const maxImposters = Math.max(1, Math.floor(players.length / 2));
  const imposters = Math.min(imposterCount, maxImposters);
  const names = players.map((p, i) => p.trim() || `${t("playerName")} ${i + 1}`);
  const canStart = players.length >= 3 && (mode === "custom" || cats.length > 0);

  // authors are player indices, so adding/removing players invalidates written words
  const editPlayers = (next: string[]) => {
    if (next.length !== players.length) setPool([]);
    setPlayers(next);
  };

  const begin = (secret: Secret) => {
    setRound(newRound(players.length, imposters, secret));
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
    if (mode === "packs") return begin(packSecret(cats));
    if (pool.length) return beginFromPool(pool);
    setDraft(Array.from({ length: perPlayer }, () => ({ word: "", clue: "" })));
    setTurn(0);
    setShown(false);
    setPhase("write");
  };

  const submitWords = () => {
    const next = [...pool, ...draft.map((d) => ({ word: d.word.trim(), clue: d.clue.trim(), author: turn }))];
    setDraft(Array.from({ length: perPlayer }, () => ({ word: "", clue: "" })));
    setShown(false);
    if (turn + 1 < players.length) {
      setPool(next);
      setTurn(turn + 1);
    } else beginFromPool(next);
  };


  const passScreen = (action: string) => (
    <>
      <div>
        <p className="text-lg text-muted">{t("passTo")}</p>
        <p className="mt-1 text-5xl font-bold tracking-tight break-words">{names[turn]}</p>
      </div>
      <button
        onClick={() => setShown(true)}
        aria-label={action}
        className="card-back mt-2 grid aspect-[4/5] w-full max-w-64 place-items-center rounded-3xl border border-primary-light p-4 text-primary-dark transition hover:border-primary active:scale-[0.98]"
      >
        <span className="rounded-2xl bg-white/95 px-6 py-5">
          <span className="block text-5xl">{phase === "write" ? "✍️" : "👀"}</span>
          <span className="mt-3 block font-semibold">{action}</span>
        </span>
      </button>
    </>
  );

  const stepper = (value: number, set: (n: number) => void, min: number, max: number) => (
    <div className="flex items-center gap-2">
      <button onClick={() => set(value - 1)} disabled={value <= min} className={round_btn} aria-label="−">
        −
      </button>
      <span className="w-8 text-center text-2xl font-semibold tabular-nums">{value}</span>
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
          className={`h-1.5 rounded-full transition-all ${i === turn ? "w-6 bg-primary-dark" : i < turn ? "w-1.5 bg-primary-light" : "w-1.5 bg-divider/60"}`}
        />
      ))}
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-6 flex items-center justify-between gap-3">
        <button onClick={() => setPhase("setup")} className="min-h-11 rounded-lg text-left">
          <h1 className="text-2xl font-bold tracking-tight">Imposter</h1>
          <p className="text-sm text-muted">{t("tagline")}</p>
        </button>
        <div className="flex rounded-full border border-primary-light/60 bg-white p-0.5 text-sm font-semibold uppercase">
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLang(l.id)}
              aria-label={l.label}
              aria-pressed={lang === l.id}
              className={`min-h-10 min-w-11 rounded-full transition ${lang === l.id ? "bg-primary-dark text-white" : "text-muted hover:text-ink"}`}
            >
              {l.id}
            </button>
          ))}
        </div>
      </header>

      {phase === "setup" && (
        <div className="fade flex flex-1 flex-col gap-4">
          <section className={card}>
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className={heading}>{t("players")}</h2>
              <span className="text-muted tabular-nums">{players.length}</span>
            </div>
            <ul className="flex flex-col">
              {players.map((p, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-divider/30 last:border-0">
                  <input
                    value={p}
                    placeholder={`${t("playerName")} ${i + 1}`}
                    onChange={(e) => editPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
                    className="min-w-0 flex-1 bg-transparent py-3 text-lg outline-none placeholder:text-divider"
                  />
                  <button
                    onClick={() => editPlayers(players.filter((_, j) => j !== i))}
                    aria-label="Remove"
                    className="size-11 rounded-full text-2xl leading-none text-divider transition hover:bg-canvas hover:text-ink"
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
              <div>
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
            <div className="grid grid-cols-2 rounded-full bg-canvas p-1 font-medium">
              {(["packs", "custom"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`min-h-11 rounded-full transition ${mode === m ? "bg-primary-dark text-white" : "text-muted hover:text-ink"}`}
                >
                  {t(m === "packs" ? "builtIn" : "ourWords")}
                </button>
              ))}
            </div>
            {mode === "packs" ? (
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = cats.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
                      aria-pressed={on}
                      className={`min-h-11 rounded-full border px-4 font-medium transition ${
                        on ? "border-primary-light bg-primary-light/50 text-primary-dark" : "border-divider/60 bg-white text-muted hover:border-divider"
                      }`}
                    >
                      {c.emoji} {c.name[lang]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span>{t("perPlayer")}</span>
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
              </>
            )}
          </section>

          <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mt-auto pt-2">
            <button onClick={start} disabled={!canStart} className={`${btn} shadow-lg shadow-primary-dark/25`}>
              {canStart ? t("start") : t("minPlayers")}
            </button>
          </div>
        </div>
      )}

      {phase === "write" && (
        <div key={`${turn}-${shown}`} className="fade flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {progress}
          {!shown ? (
            passScreen(t("tapWrite"))
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitWords();
              }}
              className="flex w-full flex-col gap-5 text-left"
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
                    className={`${field} border-transparent bg-canvas text-base focus:bg-white`}
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
        <div key={`${turn}-${shown}`} className="fade flex flex-1 flex-col items-center justify-center gap-6 text-center">
          {progress}
          {!shown ? (
            passScreen(t("tapReveal"))
          ) : (
            <>
              {round.imposters.includes(turn) ? (
                <div className="reveal imposter-back w-full rounded-3xl px-6 py-12 text-white">
                  <p className="text-lg text-white/80">{t("youAre")}</p>
                  <p className="mt-1 text-4xl font-bold tracking-tight break-words sm:text-5xl">{t("imposter")}</p>
                  {hint && tx(round.clue) && (
                    <p className="mx-auto mt-6 inline-block rounded-full bg-white/15 px-4 py-1.5 font-medium">
                      {t("clueLabel")}: {tx(round.clue)}
                    </p>
                  )}
                  <p className="mt-4 text-white/80">{t("blend")}</p>
                </div>
              ) : (
                <div className={`${card} reveal w-full py-12`}>
                  <p className="text-lg text-muted">{tx(round.clue) || t("yourWord")}</p>
                  <p className="mt-2 text-5xl font-bold tracking-tight break-words text-primary-dark">{tx(round.word)}</p>
                </div>
              )}
              <button
                onClick={() => {
                  setShown(false);
                  if (turn + 1 < players.length) setTurn(turn + 1);
                  else setPhase("discuss");
                }}
                className={btn}
              >
                {t("hideNext")}
              </button>
            </>
          )}
        </div>
      )}

      {phase === "discuss" && round && (
        <div className="fade flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="text-6xl">💬</span>
          <h2 className="text-4xl font-bold tracking-tight">{t("discuss")}</h2>
          <p className="rounded-full bg-primary-light/50 px-5 py-2 text-lg text-primary-dark">
            <span className="font-semibold">{names[round.starter]}</span> {t("starts")}
          </p>
          <p className="max-w-xs text-muted">{t("discussHelp")}</p>
          <button onClick={() => setPhase("result")} className={`${btn} mt-6`}>
            {t("revealImposter")}
          </button>
        </div>
      )}

      {phase === "result" && round && (
        <div className="fade flex flex-1 flex-col justify-center gap-3 text-center">
          <div className="reveal imposter-back rounded-3xl px-6 py-10 text-white">
            <p className="text-lg text-white/80">{t("imposterWas")}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight break-words">
              {new Intl.ListFormat(lang).format(round.imposters.map((i) => names[i]))}
            </p>
          </div>
          <div className={card}>
            <p className="text-muted">{t("theWord")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight break-words text-primary-dark">{tx(round.word)}</p>
          </div>
          <button onClick={start} className={`${btn} mt-6`}>
            {mode === "custom" && !pool.length ? t("writeNew") : t("playAgain")}
          </button>
          {mode === "custom" && pool.length > 0 && (
            <p className="text-sm text-muted">
              {pool.length} {t("left")}
            </p>
          )}
          <button onClick={() => setPhase("setup")} className={`${ghost} mx-auto text-muted hover:text-ink`}>
            {t("newSetup")}
          </button>
        </div>
      )}
    </main>
  );
}
