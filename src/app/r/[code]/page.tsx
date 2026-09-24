"use client";

import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { TopControls } from "@/components/TopControls";
import type { Text } from "@/lib/game";
import type { View } from "@/lib/room";
import { api, loadIdentity, SAVE_KEY, saveIdentity, type Identity } from "@/lib/roomClient";
import { btn, card, field, ghost, press } from "@/lib/ui";

const noop = () => () => {};
const POLL_MS = 1500;

function readSaved(): { lang?: Lang; myName?: string } {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
function writeSaved(patch: object) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...readSaved(), ...patch }));
  } catch {}
}

export default function Room() {
  const code = useParams<{ code: string }>().code.toUpperCase();
  const router = useRouter();
  // server + hydration render nothing, so localStorage-derived state never mismatches
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [lang, setLangState] = useState<Lang>(() => (typeof window === "undefined" ? "en" : (readSaved().lang ?? "en")));
  const [id, setId] = useState<Identity | null>(() => (typeof window === "undefined" ? null : loadIdentity(code)));
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState(() => (typeof window === "undefined" ? "" : (readSaved().myName ?? "")));
  const [draft, setDraft] = useState<{ word: string; clue: string }[]>([]);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const t = (k: keyof typeof UI) => UI[k][lang];
  const tx = (x: Text) => (typeof x === "string" ? x : x[lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    writeSaved({ lang: l });
  };
  const url = typeof window === "undefined" ? "" : `${location.origin}/r/${code}`;

  const refresh = useCallback(async () => {
    try {
      setV(await api<View>(`/${code}`, undefined, id));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [code, id]);

  // poll while visible; refresh right away when the phone wakes up
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh();
    const first = setTimeout(refresh, 0); // always load once, even if opened in a background tab
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#0b132b", light: "#ffffff" } }).then(setQr, () => {});
  }, [url]);

  // new phase or round → hide the card again, fresh word fields
  const phaseKey = v ? `${v.phase}-${v.roundNo}` : "";
  const [seenPhase, setSeenPhase] = useState("");
  if (phaseKey !== seenPhase) {
    setSeenPhase(phaseKey);
    setShown(false);
    if (v?.phase === "write") setDraft(Array.from({ length: v.settings.perPlayer }, () => ({ word: "", clue: "" })));
  }

  const send = async (body: object) => {
    setBusy(true);
    try {
      await api(`/${code}`, { ...id, ...body });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      const r = await api<Identity>(`/${code}`, { type: "join", name });
      saveIdentity(code, r);
      writeSaved({ myName: name });
      setId({ pid: r.pid, token: r.token });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: "Imposter", url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {} // user cancelled the share sheet
  };

  if (!hydrated) return <main className="flex-1" />;

  const errMsg =
    err === "not_found" ? t("errNotFound") : err === "started" ? t("errStarted") : err === "full" ? t("errFull") : err === "no_storage" ? t("errNoStorage") : err ? t("errOffline") : "";
  const joined = !!v && v.me >= 0;
  const names = v?.players ?? [];
  const hostName = v ? names[v.hostIndex] : "";

  const waiting = (text: string) => (
    <p className="enter flex items-center justify-center gap-2 text-muted">
      <span className="inline-block size-2 animate-pulse rounded-full bg-primary" /> {text}
    </p>
  );
  const progressText = v ? `${t("waitingOthers")} · ${v.done}/${names.length}` : "";

  const theCard = () =>
    v?.card &&
    (!shown ? (
      <button
        onClick={() => setShown(true)}
        aria-label={t("tapReveal")}
        className={`card-back enter grid aspect-[4/5] w-full max-w-64 place-items-center self-center rounded-3xl border border-line p-4 text-primary-ink hover:border-primary ${press}`}
      >
        <span className="rounded-2xl bg-surface/95 px-6 py-5">
          <span className="block text-5xl">👀</span>
          <span className="mt-3 block font-semibold">{t("tapReveal")}</span>
        </span>
      </button>
    ) : v.card.imposter ? (
      <button onClick={() => setShown(false)} className="flip imposter-back glow relative w-full rounded-3xl px-6 py-12 text-white">
        <p className="text-lg text-white/80">{t("youAre")}</p>
        <p className="shake mt-1 text-4xl font-bold tracking-tight break-words">{t("imposter")}</p>
        {v.card.clue && (
          <p className="mx-auto mt-6 inline-block rounded-full bg-white/15 px-4 py-1.5 font-medium">
            {t("clueLabel")}: {tx(v.card.clue)}
          </p>
        )}
        <p className="mt-4 text-white/80">{t("blend")}</p>
      </button>
    ) : (
      <button onClick={() => setShown(false)} className={`${card} flip w-full py-14`}>
        <p className="text-lg text-muted">{tx(v.card.clue) || t("yourWord")}</p>
        <p data-testid="word" className="mt-2 text-5xl font-bold tracking-tight break-words text-primary-ink">{tx(v.card.word)}</p>
      </button>
    ));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-6 flex items-center justify-between gap-3">
        <button
          onClick={() => (!joined || v?.phase === "lobby" || confirm(t("leaveConfirm"))) && router.push("/")}
          aria-label={t("leave")}
          className={`${ghost} -ml-3 flex items-center gap-1 whitespace-nowrap text-muted`}
        >
          <span className="text-2xl leading-none">×</span>
          <span className="font-mono font-bold tracking-widest text-ink">{code}</span>
        </button>
        <TopControls lang={lang} setLang={setLang} />
      </header>

      {errMsg && (
        <p role="alert" className="enter mb-4 rounded-2xl bg-tint px-4 py-3 text-center font-medium text-primary-ink">
          {errMsg}
        </p>
      )}
      {!v && (err === "not_found" || err === "no_storage") && (
        <button onClick={() => router.push("/")} className={`${ghost} self-center border border-line`}>
          ← {t("home")}
        </button>
      )}

      {/* join form: new visitor, or identity lost */}
      {v && !joined && v.phase === "lobby" && (
        <div key="join" className="enter flex flex-1 flex-col justify-center gap-4 text-center">
          <p className="text-muted">👑 {hostName}</p>
          <h1 className="text-4xl font-bold tracking-tight">{t("joinTitle")}</h1>
          <p className="font-mono text-3xl font-bold tracking-[0.3em] text-primary-ink">{code}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
            className="mt-4 flex flex-col gap-3"
          >
            <input
              autoFocus
              value={name}
              maxLength={24}
              autoComplete="nickname"
              placeholder={t("yourName")}
              onChange={(e) => setName(e.target.value)}
              className={`${field} text-center font-semibold`}
            />
            <button disabled={busy || !name.trim()} className={btn}>
              {t("join")}
            </button>
          </form>
        </div>
      )}

      {v && !joined && v.phase !== "lobby" && (
        <div className="enter flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <span className="text-6xl">🔒</span>
          <p className="text-lg">{t("errStarted")}</p>
          <button onClick={() => router.push("/")} className={`${ghost} border border-line`}>
            ← {t("home")}
          </button>
        </div>
      )}

      {joined && v.phase === "lobby" && (
        <div key="lobby" className="enter flex flex-1 flex-col gap-4">
          <section className={`${card} flex flex-col items-center gap-3 text-center`}>
            <p className="text-muted">{t("scanToJoin")}</p>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- local data: URL, nothing to optimise
              <img src={qr} alt={`QR ${code}`} width={220} height={220} className="pop rounded-2xl bg-white p-2" />
            )}
            <p className="font-mono text-4xl font-bold tracking-[0.3em] text-primary-ink">{code}</p>
            <button onClick={share} className={`${ghost} border border-line`}>
              {copied ? `✓ ${t("copied")}` : `🔗 ${t("share")}`}
            </button>
          </section>
          <section className={card}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{t("players")}</h2>
              <span key={names.length} className="pop inline-block text-muted tabular-nums">
                {names.length}
              </span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {names.map((n, i) => (
                <li key={i} className="pop rounded-full bg-tint px-4 py-2 font-medium text-primary-ink">
                  {n}
                  {i === v.hostIndex && " 👑"}
                  {i === v.me && <span className="text-muted"> ({t("you")})</span>}
                </li>
              ))}
            </ul>
          </section>
          <div className="sticky bottom-0 z-20 -mx-4 mt-auto bg-gradient-to-t from-canvas from-70% to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {v.isHost ? (
              <button onClick={() => send({ type: "start" })} disabled={busy || names.length < 3} className={`${btn} shadow-lg shadow-primary-dark/25`}>
                {names.length < 3 ? t("needThree") : `🚀 ${t("start")}`}
              </button>
            ) : (
              waiting(t("waitingHost"))
            )}
          </div>
        </div>
      )}

      {joined && v.phase === "write" && (
        <div key="write" className="flex flex-1 flex-col justify-center gap-5">
          {v.iDone ? (
            <div className="enter flex flex-col items-center gap-4 text-center">
              <span className="pop text-6xl">✅</span>
              {waiting(progressText)}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send({ type: "words", words: draft });
              }}
              className="enter flex flex-col gap-4"
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
                    maxLength={40}
                    value={d.word}
                    placeholder={`${t("word")} ${draft.length > 1 ? i + 1 : ""}`}
                    onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, word: e.target.value } : x)))}
                    className={`${field} font-semibold`}
                  />
                  <input
                    autoComplete="off"
                    maxLength={40}
                    value={d.clue}
                    placeholder={t("clue")}
                    onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, clue: e.target.value } : x)))}
                    className={`${field} border-divider/30 text-base`}
                  />
                </div>
              ))}
              <button disabled={busy || draft.some((d) => !d.word.trim())} className={btn}>
                {t("done")}
              </button>
              <p className="text-center text-sm text-muted">
                {v.done}/{names.length}
              </p>
            </form>
          )}
        </div>
      )}

      {joined && v.phase === "reveal" && (
        <div key="reveal" className="flex flex-1 flex-col justify-center gap-6 text-center">
          <p className="enter text-lg text-muted">{t("keepSecret")}</p>
          {theCard()}
          {v.isHost ? (
            <button onClick={() => send({ type: "discuss" })} disabled={busy} className={`${btn} enter [animation-delay:200ms]`}>
              💬 {t("startDiscussion")}
            </button>
          ) : (
            waiting(t("hostNext"))
          )}
        </div>
      )}

      {joined && v.phase === "discuss" && (
        <div key="discuss" className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="pop text-6xl">💬</span>
          <h2 className="enter text-4xl font-bold tracking-tight">{t("discuss")}</h2>
          {v.starter !== null && (
            <p className="enter rounded-full bg-tint px-5 py-2 text-lg text-primary-ink [animation-delay:100ms]">
              <span className="font-semibold">{names[v.starter]}</span> {t("starts")}
            </p>
          )}
          <p className="enter max-w-xs text-muted [animation-delay:160ms]">{t("discussHelp")}</p>
          <button onClick={() => setShown(!shown)} className={`${ghost} border border-line`}>
            👀 {t("myCard")}
          </button>
          {shown && theCard()}
          <div className="enter mt-4 flex w-full flex-col gap-2 [animation-delay:240ms]">
            {v.isHost ? (
              <>
                <button onClick={() => send({ type: "startVote" })} disabled={busy} className={btn}>
                  🗳️ {t("vote")}
                </button>
                <button onClick={() => send({ type: "skipVote" })} disabled={busy} className={`${ghost} text-muted`}>
                  {t("skipVote")}
                </button>
              </>
            ) : (
              waiting(t("hostNext"))
            )}
          </div>
        </div>
      )}

      {joined && v.phase === "vote" && (
        <div key="vote" className="flex flex-1 flex-col justify-center gap-5 text-center">
          {v.iDone ? (
            <div className="enter flex flex-col items-center gap-4">
              <span className="pop text-6xl">🗳️</span>
              {waiting(progressText)}
            </div>
          ) : (
            <div className="enter flex flex-col gap-4">
              <h2 className="text-3xl font-bold tracking-tight">{t("whoIs")}</h2>
              <div className="grid grid-cols-2 gap-2">
                {names.map((n, i) =>
                  i === v.me ? null : (
                    <button
                      key={i}
                      onClick={() => send({ type: "vote", target: i })}
                      disabled={busy}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className={`enter min-h-16 rounded-2xl border border-line bg-surface px-3 text-lg font-semibold break-words hover:border-primary ${press}`}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
              <p className="text-sm text-muted">
                {v.done}/{names.length}
              </p>
            </div>
          )}
        </div>
      )}

      {joined && v.phase === "tie" && (
        <div key="tie" className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="pop text-6xl">⚖️</span>
          <h2 className="enter text-4xl font-bold tracking-tight">{t("tie")}</h2>
          <p className="enter max-w-xs text-muted">{t("tieHelp")}</p>
          <ul className="enter flex w-full flex-col gap-2">
            {(v.counts ?? [])
              .map((c, i) => ({ c, i }))
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
          {v.isHost ? (
            <button onClick={() => send({ type: "discuss" })} disabled={busy} className={`${btn} enter mt-4`}>
              💬 {t("discussAgain")}
            </button>
          ) : (
            waiting(t("hostNext"))
          )}
        </div>
      )}

      {joined && v.phase === "result" && v.result && (
        <div key="result" className="flex flex-1 flex-col justify-center gap-3 text-center">
          {v.result.accused !== null && (
            <div className="pop mb-2">
              <p className="text-4xl font-bold tracking-tight">
                {v.result.imposters.includes(v.result.accused) ? `🎉 ${t("caught")}` : `😈 ${t("wrong")}`}
              </p>
              <p className="mt-1 text-lg text-muted">
                <span className="font-semibold text-ink">{names[v.result.accused]}</span>{" "}
                {t(v.result.imposters.includes(v.result.accused) ? "caughtHelp" : "wrongHelp")}
              </p>
            </div>
          )}
          <div className="flip imposter-back glow relative rounded-3xl px-6 py-10 text-white">
            <p className="text-lg text-white/80">{t(v.result.imposters.length > 1 ? "impostersWere" : "imposterWas")}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight break-words">
              {new Intl.ListFormat(lang).format(v.result.imposters.map((i) => names[i]))}
            </p>
          </div>
          <div className={`${card} enter [animation-delay:200ms]`}>
            <p className="text-muted">{t("theWord")}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight break-words text-primary-ink">{tx(v.result.word)}</p>
          </div>
          <div className="enter mt-6 flex flex-col gap-3 [animation-delay:340ms]">
            {v.isHost ? (
              <button onClick={() => send({ type: "start" })} disabled={busy} className={btn}>
                {v.settings.mode === "custom" && !v.poolLeft ? t("writeNew") : t("playAgain")}
              </button>
            ) : (
              waiting(t("hostNext"))
            )}
          </div>
        </div>
      )}

      {!v && !errMsg && waiting("…")}
    </main>
  );
}
