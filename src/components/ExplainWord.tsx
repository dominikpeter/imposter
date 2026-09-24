"use client";

import { Lightbulb, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { ghost, useAi } from "@/lib/ui";

/** "Explain with AI" under a crew member's word; loads in the background, never blocks the game. */
export function ExplainWord({ word, lang }: { word: string; lang: Lang }) {
  const ai = useAi();
  const [state, setState] = useState<{ key: string; text?: string; loading?: boolean; failed?: boolean }>({ key: "" });
  const key = `${lang}:${word}`;
  if (!ai) return null;
  const t = (k: keyof typeof UI) => UI[k][lang];
  const cur = state.key === key ? state : { key }; // new word or language → start fresh

  const load = async () => {
    setState({ key, loading: true });
    try {
      const r = await fetch("/api/words/explain", { method: "POST", body: JSON.stringify({ word, lang }) });
      const d = r.ok ? await r.json() : null;
      setState(d?.text ? { key, text: d.text } : { key, failed: true });
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
