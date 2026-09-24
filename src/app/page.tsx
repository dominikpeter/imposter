"use client";

import { CirclePlus, Eye, LogIn, MessagesSquare, PartyPopper, PenLine, Scale, Smartphone, Users, VenetianMask, Vote } from "lucide-react";
import { TopicIcon } from "@/components/TopicIcon";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CATEGORIES, UI, type Lang } from "@/lib/i18n";
import { ScanCode } from "@/components/ScanCode";
import { TopControls } from "@/components/TopControls";
import { mergeWritten, newRound, packSecret, pick, type Round, type Secret, type Text } from "@/lib/game";
import { tally } from "@/lib/vote";
import type { RoundLog } from "@/lib/stats";
import { Stats } from "@/components/Stats";
import { api, SAVE_KEY, saveIdentity, type Identity } from "@/lib/roomClient";
import { btn, card, chip, chipOff, chipOn, field, ghost, heading, press, segmented, stepper } from "@/lib/ui";

type Phase = "setup" | "write" | "reveal" | "discuss" | "vote" | "tie" | "result";
type Mode = "packs" | "custom";
type Play = "pass" | "phones";

// everything needed to resume after a reload / accidental back; read once on the client (server gets {})
type Saved = Partial<{
  lang: Lang; players: string[]; imposterCount: number; mode: Mode; cats: string[]; perPlayer: number; hint: boolean;
  pool: Secret[]; used: string[]; writing: Secret[]; phase: Phase; round: Round | null; turn: number; votes: number[];
  accused: number | null; play: Play; myName: string; history: RoundLog[];
}>;
const KEY = SAVE_KEY;
const saved: Saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
})();
const blank = (n: number) => Array.from({ length: n }, () => ({ word: "", clue: "" }));
const noop = () => () => {};

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
  const [play, setPlay] = useState<Play>(saved.play ?? "pass");
  const [history, setHistory] = useState<RoundLog[]>(saved.history ?? []);
  const [myName, setMyName] = useState(saved.myName ?? "");
  const [code, setCode] = useState("");
  const [online, setOnline] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ lang, players, imposterCount, mode, cats, perPlayer, hint, pool, used, writing, phase, round, turn, votes, accused, play, myName, history }),
      );
    } catch {}
  }, [lang, players, imposterCount, mode, cats, perPlayer, hint, pool, used, writing, phase, round, turn, votes, accused, play, myName, history]);

  // server + hydration render nothing, so restored state never mismatches the server HTML
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  const t = (k: keyof typeof UI) => UI[k][lang];
  const tx = (v: Text) => (typeof v === "string" ? v : v[lang]);
  // ponytail: up to half the table can be imposters; raise if a "chaos" mode ever wants more
  // online the player count is unknown until start; the server caps it at half the table
  const maxImposters = play === "phones" ? 5 : Math.max(1, Math.floor(players.length / 2));
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

  const errText = (e: unknown) =>
    t(({ started: "errStarted", not_found: "errNotFound", full: "errFull", no_storage: "errNoStorage" } as const)[(e as Error).message as "started"] ?? "errOffline");

  const goOnline = async (path: string, body: object) => {
    setBusy(true);
    setError("");
    try {
      const r = await api<Identity & { code: string }>(path, body);
      saveIdentity(r.code, { pid: r.pid, token: r.token });
      router.push(`/r/${r.code}`);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };
  const createRoom = () =>
    goOnline("", { name: myName, settings: { imposterCount, mode, cats, perPlayer, hint } });
  const joinByCode = (c = code) => goOnline(`/${c}`, { type: "join", name: myName });
  const joining = play === "phones" && online === "join";

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
    setHistory([...history, { names, imposters: round!.imposters, accused, votes: v, word: round!.word }]);
    setPhase("result");
  };

  const quit = () => {
    if (!confirm(t("quitConfirm"))) return;
    setWriting([]);
    setPhase("setup");
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
          {(() => { const Icon = phase === "write" ? PenLine : phase === "vote" ? Vote : Eye; return <Icon className="mx-auto size-12" strokeWidth={1.75} aria-hidden />; })()}
          <span className="mt-3 block font-semibold">{action}</span>
        </span>
      </button>
    </>
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
        <TopControls lang={lang} setLang={setLang} />
      </header>

      {phase === "setup" && (
        <div key="setup" className="enter flex flex-1 flex-col gap-4">
          {segmented(
            [
              { id: "pass" as Play, label: <><Smartphone className="size-5 shrink-0" aria-hidden />{t("onePhone")}</> },
              { id: "phones" as Play, label: <><Users className="size-5 shrink-0" aria-hidden />{t("everyPhone")}</> },
            ],
            play,
            setPlay,
          )}

          {play === "pass" ? (
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
          ) : (
            <section key="phones" className={`${card} enter flex flex-col gap-4`}>
              <input
                value={myName}
                maxLength={24}
                autoComplete="nickname"
                placeholder={t("yourName")}
                onChange={(e) => setMyName(e.target.value)}
                className={`${field} font-semibold`}
              />
              <div className="grid grid-cols-2 gap-2">
                {(["create", "join"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOnline(o)}
                    aria-pressed={online === o}
                    className={`flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left ${press} ${
                      online === o ? "border-primary-dark bg-tint" : "border-line"
                    }`}
                  >
                    {o === "create" ? <CirclePlus className="size-7 text-primary-ink" aria-hidden /> : <LogIn className="size-7 text-primary-ink" aria-hidden />}
                    <span className="leading-tight font-semibold hyphens-auto">{t(o === "create" ? "createNew" : "joinExisting")}</span>
                    <span className="text-sm leading-snug text-muted">{t(o === "create" ? "createHelp" : "joinHelp")}</span>
                  </button>
                ))}
              </div>
              {online === "join" && (
                <div key="join" className="enter flex items-center gap-2">
                  <input
                    value={code}
                    maxLength={4}
                    autoCapitalize="characters"
                    autoComplete="off"
                    inputMode="text"
                    aria-label={t("roomCode")}
                    placeholder={t("roomCode")}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    className={`${field} min-w-0 flex-1 text-center font-mono text-2xl font-bold tracking-[0.4em] uppercase placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:tracking-normal placeholder:normal-case`}
                  />
                  <ScanCode
                    labels={{ scan: t("scan"), pointCamera: t("pointCamera"), noCamera: t("noCamera"), close: t("close") }}
                    onCode={(c) => {
                      setCode(c);
                      if (myName.trim()) joinByCode(c);
                    }}
                  />
                </div>
              )}
              {error && <p className="text-sm font-medium text-red-500" role="alert">{error}</p>}
            </section>
          )}

          {!joining && (
            <>
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
                    className={`${chip} ${allCats ? "border-primary-dark bg-primary-dark text-on-primary" : chipOff}`}
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
                        <TopicIcon name={c.icon} /> {c.name[lang]}
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
            </>
          )}

          <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {play === "pass" ? (
              <button onClick={start} disabled={!canStart} className={`${btn} shadow-lg shadow-primary-dark/25`}>
                {canStart ? t("start") : players.length < 3 ? t("minPlayers") : t("pickTopic")}
              </button>
            ) : joining ? (
              <button
                onClick={() => joinByCode()}
                disabled={busy || code.length !== 4 || !myName.trim()}
                className={`${btn} shadow-lg shadow-primary-dark/25`}
              >
                {!myName.trim() ? t("yourName") : <><LogIn className="size-5 shrink-0" aria-hidden />{t("join")}</>}
              </button>
            ) : (
              <button
                onClick={createRoom}
                disabled={busy || !myName.trim() || (mode === "packs" && !cats.length)}
                className={`${btn} shadow-lg shadow-primary-dark/25`}
              >
                {!myName.trim() ? t("yourName") : mode === "packs" && !cats.length ? t("pickTopic") : <><CirclePlus className="size-5 shrink-0" aria-hidden />{t("createRoom")}</>}
              </button>
            )}
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
                  <p data-testid="word" className="mt-2 text-5xl font-bold tracking-tight break-words text-primary-ink">{tx(round.word)}</p>
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
          <MessagesSquare className="pop size-16 text-primary-ink" strokeWidth={1.5} aria-hidden />
          <h2 className="enter text-4xl font-bold tracking-tight [animation-delay:60ms]">{t("discuss")}</h2>
          <p className="enter rounded-full bg-tint px-5 py-2 text-lg text-primary-ink [animation-delay:140ms]">
            <span className="font-semibold">{names[round.starter]}</span> {t("starts")}
          </p>
          <p className="enter max-w-xs text-muted [animation-delay:200ms]">{t("discussHelp")}</p>
          <div className="enter mt-6 flex w-full flex-col gap-2 [animation-delay:280ms]">
            <button onClick={startVote} className={btn}>
              <Vote className="size-5 shrink-0" aria-hidden /> {t("vote")}
            </button>
            <button
              onClick={() => {
                setAccused(null);
                setHistory([...history, { names, imposters: round.imposters, accused: null, votes: null, word: round.word }]);
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
          <Scale className="pop size-16 text-primary-ink" strokeWidth={1.5} aria-hidden />
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
            <MessagesSquare className="size-5 shrink-0" aria-hidden /> {t("discussAgain")}
          </button>
        </div>
      )}

      {phase === "result" && round && (
        <div key="result" className="flex flex-1 flex-col justify-center gap-3 text-center">
          {accused !== null && (
            <div className="pop mb-2">
              <p className="text-4xl font-bold tracking-tight">
                {round.imposters.includes(accused) ? <><PartyPopper className="inline size-9 -translate-y-1 text-primary-ink" aria-hidden /> {t("caught")}</> : <><VenetianMask className="inline size-9 -translate-y-1 text-primary-ink" aria-hidden /> {t("wrong")}</>}
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
          <Stats history={history} lang={lang} onReset={() => setHistory([])} />
        </div>
      )}
    </main>
  );
}
