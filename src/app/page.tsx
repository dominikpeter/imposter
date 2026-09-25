"use client";

import { CirclePlus, Eye, Languages, Spade, LogIn, MessagesSquare, PenLine, Scale, Smartphone, Users, VenetianMask, Vote } from "lucide-react";
import { TopicGrid } from "@/components/TopicGrid";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CATEGORIES, DEFAULT_CATS, LANGS, UI, type Lang } from "@/lib/i18n";
import { ScanCode } from "@/components/ScanCode";
import { Hero } from "@/components/Hero";
import { TopControls } from "@/components/TopControls";
import { answers, earnJokers, exactReview, mergeWritten, newRound, packSecret, pick, reviewNotes, spendJokers, uniqueNames, wordHint, type Note, type Review, type Round, type Secret, type Text } from "@/lib/game";
import { WordForm } from "@/components/WordForm";
import { TurnGuide } from "@/components/TurnGuide";
import { GuessForm } from "@/components/GuessForm";
import { Verdict, type Guess } from "@/components/Verdict";
import { ExplainWord } from "@/components/ExplainWord";
import { useMe } from "@/lib/authClient";
import { JokerHint } from "@/components/Joker";
import { tally } from "@/lib/vote";
import { type RoundLog, winners } from "@/lib/stats";
import { Stats } from "@/components/Stats";
import { api, SAVE_KEY, saveIdentity, type Identity } from "@/lib/roomClient";
import { btn, card, field, ghost, heading, press, segmented, stepper, useAi } from "@/lib/ui";

type Phase = "setup" | "write" | "reveal" | "discuss" | "vote" | "tie" | "guess" | "result";
type Mode = "packs" | "custom";
type Play = "pass" | "phones";

// everything needed to resume after a reload / accidental back (server gets {})
type Saved = Partial<{
  lang: Lang; players: string[]; imposterCount: number; mode: Mode; cats: string[]; perPlayer: number; hint: boolean;
  pool: Secret[]; used: string[]; writing: Secret[]; phase: Phase; round: Round | null; turn: number; votes: number[];
  accused: number | null; play: Play; myName: string; history: RoundLog[]; joker: boolean; jokers: string[]; queue: number[]; lost: number[];
  rounds: number; guessOpt: boolean; spoken: number; wordRound: number; guess: Guess; wordLang: Lang | "";
}>;
const KEY = SAVE_KEY;
// read on every mount, not once per page load: the room page also writes KEY (language, name) and navigates back here
const readSaved = (): Saved => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
};
const written = (w: Secret[], p: number) => w.filter((s) => s.authors.includes(p)).length; // words player p has in w
const blank = (n: number) => Array.from({ length: n }, () => ({ word: "", clue: "" }));
const noop = () => () => {};

export default function Home() {
  const [saved] = useState(readSaved);
  const [lang, setLang] = useState<Lang>(saved.lang ?? "en");
  const [wordLang, setWordLang] = useState<Lang | "">(saved.wordLang ?? ""); // "" = same as the app
  const W = wordLang || lang; // language of the secret words
  const [players, setPlayers] = useState(saved.players ?? ["Lisa", "Nora", "Tim", "Beni"]);
  const [imposterCount, setImposterCount] = useState(saved.imposterCount ?? 1);
  const [mode, setMode] = useState<Mode>(saved.mode ?? "packs");
  const [cats, setCats] = useState(
    saved.cats?.filter((id) => CATEGORIES.some((c) => c.id === id)) ?? DEFAULT_CATS,
  );
  const [perPlayer, setPerPlayer] = useState(saved.perPlayer ?? 2);
  const [pool, setPool] = useState<Secret[]>(saved.pool ?? []);
  const [used, setUsed] = useState<string[]>(saved.used ?? []);
  const [writing, setWriting] = useState<Secret[]>(saved.writing ?? []);
  // resuming mid-write: a writer sent back after a clash only owes the words they lost
  const [draft, setDraft] = useState(() =>
    blank(Math.max(1, (saved.perPlayer ?? 2) - (saved.phase === "write" ? written(saved.writing ?? [], saved.turn ?? 0) : 0))),
  );
  const [hint, setHint] = useState(saved.hint ?? true);
  const [round, setRound] = useState<Round | null>(saved.round ?? null);
  const [phase, setPhase] = useState<Phase>(saved.round || saved.phase === "write" ? (saved.phase ?? "setup") : "setup");
  const [turn, setTurn] = useState(saved.turn ?? 0);
  const [shown, setShown] = useState(false);
  const [votes, setVotes] = useState<number[]>(saved.votes ?? []);
  const [accused, setAccused] = useState<number | null>(saved.accused ?? null);
  const [play, setPlay] = useState<Play>(saved.play ?? "pass");
  const [history, setHistory] = useState<RoundLog[]>(saved.history ?? []);
  const [joker, setJoker] = useState(saved.joker ?? false);
  const [rounds, setRounds] = useState(saved.rounds ?? 5); // rounds per game
  const [guessOpt, setGuessOpt] = useState(saved.guessOpt ?? false); // caught imposter may guess the word
  const [spoken, setSpoken] = useState(saved.spoken ?? 0); // players who said their word this word round
  const [wordRound, setWordRound] = useState(saved.wordRound ?? 1);
  const [guess, setGuess] = useState<Guess>(saved.guess ?? null);
  const [jokers, setJokers] = useState<string[]>(saved.jokers ?? []); // names holding a joker
  const [queue, setQueue] = useState<number[]>(saved.queue ?? []); // players still to write (incl. replacements)
  const [lost, setLost] = useState<number[]>(saved.lost ?? []); // players whose word was cancelled by a clash
  const [notes, setNotes] = useState<(Note | null)[]>([]);
  const [checking, setChecking] = useState(false);
  const [confirmable, setConfirmable] = useState(""); // corrected draft shown to the player; sending it unchanged = accepted
  const me = useMe();
  const aiPref = useAi();
  const ai = aiPref && !!me?.user && me.ai; // AI only for signed-in players, their switch on, and not paused by the admin
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
        JSON.stringify({ lang, players, imposterCount, mode, cats, perPlayer, hint, pool, used, writing, phase, round, turn, votes, accused, play, myName, history, joker, jokers, queue, lost, rounds, guessOpt, spoken, wordRound, guess, wordLang }),
      );
    } catch {}
  }, [lang, players, imposterCount, mode, cats, perPlayer, hint, pool, used, writing, phase, round, turn, votes, accused, play, myName, history, joker, jokers, queue, lost, rounds, guessOpt, spoken, wordRound, guess, wordLang]);

  // server + hydration render nothing, so restored state never mismatches the server HTML
  const hydrated = useSyncExternalStore(noop, () => true, () => false);

  const t = (k: keyof typeof UI) => UI[k][lang];
  const tx = (v: Text) => (typeof v === "string" ? v : v[lang]);
  const tw = (v: Text) => (typeof v === "string" ? v : v[W]); // words and word hints
  // ponytail: up to half the table can be imposters; raise if a "chaos" mode ever wants more
  // online the player count is unknown until start; the server caps it at half the table
  const maxImposters = play === "phones" ? 5 : Math.max(1, Math.floor(players.length / 2));
  const imposters = Math.min(imposterCount, maxImposters);
  const names = players.map((p, i) => p.trim() || `${t("playerName")} ${i + 1}`);
  const canStart = players.length >= 3 && (mode === "custom" || cats.length > 0);

  // authors are player indices, so adding/removing players invalidates written words
  const editPlayers = (next: string[]) => {
    if (next.length !== players.length) setPool([]);
    setPlayers(next);
  };

  const begin = (secret: Secret, held = jokers, who = names) => {
    const r: Round = newRound(players.length, imposters, secret);
    if (joker) {
      const spent = spendJokers(r.imposters, who, held);
      r.jokered = spent.jokered;
      setJokers(spent.holders);
    }
    setRound(r);
    setSpoken(0);
    setWordRound(1);
    setGuess(null);
    setVotes([]);
    setAccused(null);
    setTurn(0);
    setShown(false);
    setPhase("reveal");
  };

  const beginFromPool = (p: Secret[], held = jokers, who = names) => {
    const i = pick(p.length);
    setPool(p.filter((_, j) => j !== i));
    begin(p[i], held, who);
  };

  const errText = (e: unknown) =>
    t(({ started: "errStarted", not_found: "errNotFound", full: "errFull", no_storage: "errNoStorage", rate_limited: "errTooMany" } as const)[(e as Error).message as "started"] ?? "errOffline");

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
    // the switch as set: the server turns AI on only for a real session (me may not have loaded yet)
    goOnline("", { name: myName, settings: { imposterCount, mode, cats, perPlayer, hint, joker, ai: aiPref, rounds, guess: guessOpt, lang: W } });
  const joinByCode = (c = code) => goOnline(`/${c}`, { type: "join", name: myName });
  const joining = play === "phones" && online === "join";

  const start = () => {
    // the last game is over (also when starting again from setup): a new game starts with fresh rounds and jokers
    const over = history.length >= rounds;
    const held = over ? [] : jokers; // state updates land after this render, so pass the fresh list on
    if (over) {
      setHistory([]);
      setJokers([]);
    }
    // two "Tim"s would share stats and jokers: rename before the round, and use the new names for it right away
    const who = uniqueNames(names);
    if (who.some((n, i) => n !== names[i])) setPlayers(who);
    if (mode === "packs") {
      const s = packSecret(cats, new Set(used));
      setUsed(used.includes(s.key) ? [s.key] : [...used, s.key]); // already used = every word was played, start over
      return begin(s, held, who);
    }
    if (pool.length) return beginFromPool(pool, held, who);
    setWriting([]);
    setQueue(players.map((_, i) => i));
    setLost([]);
    setNotes([]);
    setDraft(blank(perPlayer));
    setTurn(0);
    setShown(false);
    setPhase("write");
  };

  // start the AI check while the player pauses (all words filled): "Done" then finds the answer cached on the server
  useEffect(() => {
    if (!ai || phase !== "write" || !shown || !draft.every((d) => d.word.trim()) || JSON.stringify(draft) === confirmable) return;
    const taken = writing.map((s) => s.word as string);
    const timer = setTimeout(() => {
      fetch("/api/words/check", { method: "POST", body: JSON.stringify({ words: draft, taken, lang: W, ai: true }) }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [ai, phase, shown, draft, confirmable, writing, W]);

  // words stay in `writing` until everyone is done, so quitting halfway never leaves a partial pool
  const submitWords = async () => {
    const taken = writing.map((s) => s.word as string);
    setChecking(ai); // signed out: exact checks right here, no round trip and no spinner
    const reviews: Review[] = !ai
      ? exactReview(draft, taken)
      : (await fetch("/api/words/check", {
        method: "POST",
        body: JSON.stringify({ words: draft, taken, lang: W, ai: JSON.stringify(draft) !== confirmable }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) ?? exactReview(draft, taken); // offline → exact checks only
    setChecking(false);
    // same as one of my own earlier words is "twice", not a clash with someone else
    const mine = reviews.map((r) => (r.problem === "taken" && writing[r.taken].authors.includes(turn) ? { ...r, problem: "twice" as const } : r));
    const { fixed, notes, ok } = reviewNotes(draft, mine);
    if (!ok) {
      // clash with another player's word: this player now knows it, so theirs is cancelled too and they write a new one
      const clashes = mine.filter((r) => r.problem === "taken").map((r) => writing[r.taken]);
      setWriting(writing.filter((s) => !clashes.includes(s)));
      const owners = clashes.flatMap((s) => s.authors);
      setQueue([...queue, ...owners.filter((a, i) => !queue.includes(a) && owners.indexOf(a) === i)]);
      setLost([...lost, ...owners]);
      setDraft(fixed);
      setConfirmable(notes.every((n) => n === null || n === "corrected") ? JSON.stringify(fixed) : "");
      return setNotes(notes);
    }
    const next = mergeWritten(writing, fixed, turn);
    setConfirmable("");
    const rest = queue.filter((p) => p !== turn);
    setLost(lost.filter((p) => p !== turn));
    setNotes([]);
    setShown(false);
    if (rest.length) {
      setWriting(next);
      setQueue(rest);
      setTurn(rest[0]);
      setDraft(blank(perPlayer - written(next, rest[0])));
    } else {
      setWriting([]);
      setQueue([]);
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
    if (guessOpt && round!.imposters.includes(accused)) return setPhase("guess");
    finish(accused, v, false);
  };

  // round over: jokers for imposters who got away (or guessed the word), history for the stats
  const finish = (acc: number | null, v: number[] | null, guessed: boolean) => {
    if (joker && acc !== null) setJokers(earnJokers(round!.imposters, guessed ? -1 : acc, names, jokers));
    setHistory([...history, { names, imposters: round!.imposters, accused: acc, votes: v, word: round!.word, guessed }]);
    setPhase("result");
    fetch("/api/metrics", { method: "POST", keepalive: true }).catch(() => {}); // anonymous "a round was played" for the admin stats
  };

  const submitGuess = async (text: string | null) => {
    let correct = false;
    if (text) {
      setChecking(true);
      const taken = answers(round!.word);
      const reviews: Review[] =
        (await fetch("/api/words/check", { method: "POST", body: JSON.stringify({ words: [{ word: text, clue: "" }], taken, lang, ai }) })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)) ?? exactReview([{ word: text, clue: "" }], taken);
      correct = reviews[0]?.problem === "taken"; // "same as the secret word", spelling-tolerant with AI
      setChecking(false);
    }
    setGuess(text ? { text, correct } : null);
    finish(accused, votes, correct);
  };

  const quit = () => {
    if (!confirm(t("quitConfirm"))) return;
    // a joker spent on a round that never finished goes back to its holder (in "write" the round is already over)
    if (round?.jokered?.length && ["reveal", "discuss", "vote", "tie", "guess"].includes(phase)) setJokers([...jokers, ...round.jokered.map((i) => names[i])]);
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
        className={`card-back enter mt-2 grid aspect-card w-full max-w-64 short:aspect-square place-items-center rounded-3xl border border-line p-4 text-primary-ink hover:border-primary anim-delay-80 ${press}`}
      >
        <span className="rounded-2xl bg-surface/95 px-6 py-5">
          {(() => { const Icon = phase === "write" ? PenLine : phase === "vote" ? Vote : Eye; return <Icon className="mx-auto size-12" strokeWidth={1.75} aria-hidden />; })()}
          <span className="mt-3 block font-semibold">{action}</span>
        </span>
      </button>
    </>
  );

  const progress = (
    <div role="img" className="flex items-center gap-1.5" aria-label={`${turn + 1} / ${players.length}`}>
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-safe pb-safe">
      <header className="mb-6 flex items-center justify-between gap-3 short:mb-3 tiny:mb-1">
        {phase === "setup" ? (
          <span />
        ) : phase === "result" ? (
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
          <div className="-mt-4 mb-2 text-center">
            <Hero lang={W} />
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-primary-ink">Imposter</h1>
            <p className="mt-1 text-lg text-muted">{t("tagline")}</p>
          </div>
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
                      aria-label={t("remove")}
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
                    maxLength={5}
                    autoCapitalize="characters"
                    autoComplete="off"
                    inputMode="text"
                    aria-label={t("roomCode")}
                    placeholder={t("roomCode")}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    className={`${field} min-w-0 flex-1 text-center font-mono text-2xl font-bold tracking-code uppercase placeholder:font-sans placeholder:text-lg placeholder:font-normal placeholder:tracking-normal placeholder:normal-case`}
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
              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
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
              <div className="flex items-center justify-between gap-3">
                <h2 className={heading}>{t("rounds")}</h2>
                {stepper(rounds, setRounds, 1, 30)}
              </div>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                <span>{t("hint")}</span>
                <input
                  type="checkbox"
                  checked={hint}
                  onChange={(e) => {
                    setHint(e.target.checked);
                    if (e.target.checked) setJoker(false); // jokers only make sense when imposters get no clue
                  }}
                  className="peer sr-only"
                />
                <span className="switch shrink-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
              </label>
              <label className={`flex min-h-11 items-center justify-between gap-3 ${hint ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                <span>
                  <span className="flex items-start gap-1.5 font-medium">
                    <Spade className="mt-1 size-4 shrink-0 text-primary-ink" aria-hidden /> {t("joker")}
                  </span>
                  <span className="block text-sm text-muted">{t(hint ? "jokerNeedsNoHint" : "jokerHelp")}</span>
                </span>
                <input type="checkbox" checked={joker} disabled={hint} onChange={(e) => setJoker(e.target.checked)} className="peer sr-only" />
                <span className="switch shrink-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                <span>
                  <span className="flex items-start gap-1.5 font-medium">
                    <VenetianMask className="mt-1 size-4 shrink-0 text-primary-ink" aria-hidden /> {t("guessOption")}
                  </span>
                  <span className="block text-sm text-muted">{t("guessOptionHelp")}</span>
                </span>
                <input type="checkbox" checked={guessOpt} onChange={(e) => setGuessOpt(e.target.checked)} className="peer sr-only" />
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
              <div className="flex flex-col gap-2">
                <div>
                  <h3 className="flex items-center gap-1.5 font-medium">
                    <Languages className="size-4 text-primary-ink" aria-hidden /> {t("wordLang")}
                  </h3>
                  <p className="text-sm text-muted">{t("wordLangHelp")}</p>
                </div>
                {segmented(
                  [{ id: "" as Lang | "", label: t("auto"), title: t("auto") }, ...LANGS.map((l) => ({ id: l.id as Lang | "", label: l.id.toUpperCase(), title: l.label }))],
                  wordLang,
                  setWordLang,
                  "sm",
                )}
              </div>
              {mode === "packs" ? (
                <div key="packs" className="enter flex flex-col gap-2">
                  <div className="flex w-full items-baseline justify-between">
                    <span>{t("topics")}</span>
                    <span key={cats.length} className="pop inline-block text-sm text-muted tabular-nums">
                      {cats.length} / {CATEGORIES.length}
                    </span>
                  </div>
                  <TopicGrid lang={lang} cats={cats} onChange={setCats} />
                </div>
              ) : (
                <div key="custom" className="enter flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 hyphens-auto">{t("perPlayer")}</span>
                    {stepper(perPlayer, setPerPlayer, 1, 10)}
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

          <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-4 pt-6 pb-safe">
            {play === "pass" ? (
              <button onClick={start} disabled={!canStart} className={`${btn} shadow-lg shadow-primary-dark/25`}>
                {canStart ? t("start") : players.length < 3 ? t("minPlayers") : t("pickTopic")}
              </button>
            ) : joining ? (
              <button
                onClick={() => joinByCode()}
                disabled={busy || code.length < 4 || !myName.trim()}
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
        <div key={`write-${turn}-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center short:gap-3 tiny:gap-2">
          {progress}
          {!shown ? (
            passScreen(t("tapWrite"))
          ) : (
            <WordForm
              draft={draft}
              setDraft={setDraft}
              notes={notes}
              joker={joker}
              busy={checking}
              lang={lang}
              banner={lost.includes(turn) ? t("replaceWord") : undefined}
              onSubmit={submitWords}
            />
          )}
        </div>
      )}

      {phase === "reveal" && round && (
        <div key={`reveal-${turn}-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center short:gap-3 tiny:gap-2">
          {progress}
          {!shown ? (
            passScreen(t("tapReveal"))
          ) : (
            <>
              {round.imposters.includes(turn) ? (
                <div className="flip imposter-back glow relative w-full rounded-3xl px-6 py-12 text-white short:py-8 tiny:py-5">
                  <p className="text-lg text-white/80">{t("youAre")}</p>
                  <p className="shake mt-1 text-4xl font-bold tracking-tight break-words sm:text-5xl tiny:text-3xl">{t("imposter")}</p>
                  {hint && tx(round.clue) && (
                    <p className="mx-auto mt-6 inline-block rounded-full bg-white/15 px-4 py-1.5 font-medium">
                      {t("clueLabel")}: {tx(round.clue)}
                    </p>
                  )}
                  {round.jokered?.includes(turn) && <JokerHint label={t("jokerHint")} hint={tw(wordHint(round))} />}
                  <p className="mt-4 text-white/80 tiny:hidden">{t("blend")}</p>
                </div>
              ) : (
                <div className={`${card} flip w-full py-16 short:py-8 tiny:py-5`}>
                  <p className="text-lg text-muted">{tx(round.clue) || t("yourWord")}</p>
                  <p data-testid="word" className="mt-2 text-5xl font-bold tracking-tight break-words text-primary-ink short:text-4xl tiny:text-3xl">{tw(round.word)}</p>
                </div>
              )}
              {!round.imposters.includes(turn) && <ExplainWord word={tw(round.word)} lang={lang} />}
              <button onClick={next} className={`${btn} enter anim-delay-250`}>
                {t("hideNext")}
              </button>
            </>
          )}
        </div>
      )}

      {phase === "discuss" && round && (
        <div key="discuss" className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <p className="text-sm text-muted">
            {t("round")} {history.length + 1} / {rounds}
          </p>
          <TurnGuide
            names={names}
            starter={round.starter}
            spoken={spoken}
            wordRound={wordRound}
            canAdvance
            onSaid={() => setSpoken(spoken + 1)}
            lang={lang}
          />
          <div className="enter mt-2 flex w-full flex-col gap-2">
            {spoken >= players.length && (
              <button
                onClick={() => {
                  setSpoken(0);
                  setWordRound(wordRound + 1);
                }}
                className={`${ghost} flex items-center justify-center gap-2 border border-line`}
              >
                <MessagesSquare className="size-5 shrink-0" aria-hidden /> {t("moreWords")}
              </button>
            )}
            <button onClick={startVote} className={`${spoken >= players.length ? btn : `${ghost} border border-line`} flex items-center justify-center gap-2`}>
              <Vote className="size-5 shrink-0" aria-hidden /> {t("vote")}
            </button>
            <button
              onClick={() => {
                setAccused(null);
                finish(null, null, false);
              }}
              className={`${ghost} text-muted`}
            >
              {t("skipVote")}
            </button>
          </div>
        </div>
      )}

      {phase === "vote" && round && (
        <div key={`vote-${turn}-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center short:gap-3 tiny:gap-2">
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
          <p className="enter max-w-xs text-muted anim-delay-80">{t("tieHelp")}</p>
          <ul className="enter flex w-full flex-col gap-2 anim-delay-140">
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
          <button onClick={() => setPhase("discuss")} className={`${btn} enter mt-4 anim-delay-220`}>
            <MessagesSquare className="size-5 shrink-0" aria-hidden /> {t("discussAgain")}
          </button>
        </div>
      )}

      {phase === "guess" && round && accused !== null && (
        <div key={`guess-${shown}`} className="flex flex-1 flex-col items-center justify-center gap-6 text-center short:gap-3 tiny:gap-2">
          {!shown ? (
            <>
              <p className="text-lg text-muted">{t("passToGuess").replace("{name}", names[accused])}</p>
              <button onClick={() => setShown(true)} className={btn}>
                {names[accused]}
              </button>
            </>
          ) : (
            <GuessForm lang={lang} busy={checking} onGuess={submitGuess} />
          )}
        </div>
      )}

      {phase === "result" && round && (
        <div key="result" className="flex flex-1 flex-col justify-center gap-3 text-center">
          <Verdict names={names} imposters={round.imposters} accused={accused} word={tw(round.word)} guess={guess} joker={joker} lang={lang} />
          <div className="enter flex flex-col gap-3 anim-delay-340">
            {history.length >= rounds ? (
              <>
                <p className="pop mt-4 text-3xl font-bold tracking-tight">{t("gameOver")}</p>
                <p className="text-lg text-primary-ink">{((w) => t(w.length > 1 ? "winGameTie" : "winsGame").replace("{name}", new Intl.ListFormat(lang).format(w)))(winners(history))}</p>
                <button
                  onClick={start}
                  className={btn}
                >
                  {t("newGame")}
                </button>
              </>
            ) : (
              <button onClick={start} className={`${btn} mt-6`}>
                {mode === "custom" && !pool.length ? t("writeNew") : `${t("playAgain")} · ${t("round")} ${history.length + 1}/${rounds}`}
              </button>
            )}
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
