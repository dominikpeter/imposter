"use client";

import { Check, Mic } from "lucide-react";
import { speakerAt } from "@/lib/game";
import { UI, type Lang } from "@/lib/i18n";
import { btn } from "@/lib/ui";

const fill = (s: string, name: string) => s.replace("{name}", name);

/** Guides the word round: whose turn it is, the speaking order, and "Done" to hand over to the next player. */
export function TurnGuide(p: {
  names: string[];
  starter: number;
  spoken: number; // how many have spoken in this word round
  wordRound: number;
  me?: number; // rooms: my seat, to say "Your turn!"
  canAdvance: boolean; // one phone: always; rooms: the speaker (or the host)
  onSaid: () => void;
  lang: Lang;
}) {
  const t = (k: keyof typeof UI) => UI[k][p.lang];
  const n = p.names.length;
  const order = Array.from({ length: n }, (_, k) => speakerAt(p.starter, k, n));
  const speaker = order[p.spoken];
  const mine = p.me === speaker;
  return (
    <div className="flex w-full flex-col items-center gap-4 text-center">
      <p className="text-sm font-medium tracking-wide text-muted uppercase">{fill(t("wordRound"), String(p.wordRound))}</p>
      {p.spoken < n ? (
        <div key={`${p.wordRound}-${p.spoken}`} className="pop flex flex-col items-center gap-2">
          <span className="grid size-20 place-items-center rounded-full bg-tint text-primary-ink">
            <Mic className="size-9" strokeWidth={1.75} aria-hidden />
          </span>
          <h2 className="text-4xl font-bold tracking-tight">{mine ? t("yourTurn") : fill(t("turnOf"), p.names[speaker])}</h2>
          <p className="text-muted">{t("sayWord")}</p>
        </div>
      ) : (
        <div className="pop flex flex-col items-center gap-2">
          <span className="grid size-20 place-items-center rounded-full bg-tint text-primary-ink">
            <Check className="size-10" aria-hidden />
          </span>
          <h2 className="text-3xl font-bold tracking-tight">{t("allSaid")}</h2>
        </div>
      )}
      <ol className="flex flex-wrap justify-center gap-1.5" aria-label={t("discuss")}>
        {order.map((s, k) => (
          <li
            key={s}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              k < p.spoken ? "bg-tint text-muted" : k === p.spoken ? "bg-primary-dark text-on-primary" : "border border-line text-muted"
            }`}
          >
            {k < p.spoken && <Check className="size-3.5" aria-hidden />}
            {p.names[s]}
          </li>
        ))}
      </ol>
      {p.spoken < n && p.canAdvance && (
        <button onClick={p.onSaid} className={`${btn} mt-2`}>
          {p.spoken + 1 < n ? `${t("saidWord")} · ${fill(t("nextUp"), p.names[order[p.spoken + 1]])}` : t("saidWord")}
        </button>
      )}
    </div>
  );
}
