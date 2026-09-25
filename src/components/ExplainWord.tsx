"use client";

import { Lightbulb, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { ghost, useAi } from "@/lib/ui";
import { useMe } from "@/lib/authClient";

/**
 * "Explain with AI" under a crew member's word; loads in the background, never blocks the game.
 * One phone: needs this player's account. In a room, `explain` asks the room, whose AI runs on the signed-in host.
 */
export function ExplainWord({ word, lang, explain }: { word: string; lang: Lang; explain?: () => Promise<string | null> }) {
  const ai = useAi();
  const me = useMe();
  const [state, setState] = useState<{ key: string; text?: string; loading?: boolean; failed?: boolean }>({ key: "" });
  const key = `${lang}:${word}`;
  if (!ai || me?.ai === false || (!explain && !me?.user)) return null; // your AI switch always counts; one phone also needs your account
  const t = (k: keyof typeof UI) => UI[k][lang];
  const cur = state.key === key ? state : { key }; // new word or language → start fresh

  const load = async () => {
    setState({ key, loading: true });
    try {
      const text = explain
        ? await explain()
        : await fetch("/api/words/explain", { method: "POST", body: JSON.stringify({ word, lang }) }).then((r) => (r.ok ? r.json() : null)).then((d) => d?.text);
      setState(text ? { key, text } : { key, failed: true });
    } catch {
      setState({ key, failed: true });
    }
  };

  if (cur.text) return <p className="pop w-full rounded-2xl bg-tint px-4 py-3 text-left text-primary-ink">{cur.text}</p>;
  return (
    <div className="flex flex-col items-center gap-1">
      <button onClick={load} disabled={cur.loading} className={`${ghost} flex items-center gap-2 border border-line`}>
        {cur.loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Lightbulb className="size-5" aria-hidden />}
        {t(cur.loading ? "explaining" : "explain")}
      </button>
      {cur.failed && <p className="text-sm text-muted">{t("explainFailed")}</p>}
    </div>
  );
}
