"use client";

import { LoaderCircle, TriangleAlert, WandSparkles } from "lucide-react";
import type { Draft, Note } from "@/lib/game";
import { UI, type Lang } from "@/lib/i18n";
import { btn, card, field } from "@/lib/ui";

const NOTE = { corrected: "noteCorrected", taken: "noteTaken", twice: "noteTwice", too_hard: "noteTooHard" } as const;

/** Secret-word form shared by the one-phone game and rooms; shows the AI review per field. */
export function WordForm(p: {
  draft: Draft[];
  setDraft: (d: Draft[]) => void;
  notes: (Note | null)[];
  joker: boolean; // hint required in joker mode
  busy: boolean;
  lang: Lang;
  banner?: string;
  onSubmit: () => void;
}) {
  const t = (k: keyof typeof UI) => UI[k][p.lang];
  const edit = (i: number, patch: Partial<Draft>) => p.setDraft(p.draft.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
      className="enter flex w-full flex-col gap-4 text-left"
    >
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">{t("writeTitle")}</h2>
        <p className="mt-2 text-muted">{t("writeHelp")}</p>
      </div>
      {p.banner && <p className="pop rounded-2xl bg-tint px-4 py-3 text-center font-medium text-primary-ink">{p.banner}</p>}
      {p.draft.map((d, i) => {
        const note = p.notes[i];
        return (
          <div key={i} className={`${card} flex flex-col gap-2 p-3 ${note && note !== "corrected" ? "border-red-400" : ""}`}>
            <input
              required
              autoFocus={i === 0}
              autoComplete="off"
              maxLength={40}
              value={d.word}
              placeholder={`${t("word")} ${p.draft.length > 1 ? i + 1 : ""}`}
              onChange={(e) => edit(i, { word: e.target.value })}
              className={`${field} font-semibold`}
            />
            <input
              autoComplete="off"
              maxLength={40}
              value={d.clue}
              required={p.joker}
              placeholder={t(p.joker ? "clueRequired" : "clue")}
              onChange={(e) => edit(i, { clue: e.target.value })}
              className={`${field} border-divider/30 text-base`}
            />
            {note && (
              <p role="status" className={`pop flex items-start gap-1.5 px-1 text-sm font-medium ${note === "corrected" ? "text-primary-ink" : "text-red-500"}`}>
                {note === "corrected" ? <WandSparkles className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
                {t(NOTE[note])}
              </p>
            )}
          </div>
        );
      })}
      <button disabled={p.busy || p.draft.some((d) => !d.word.trim() || (p.joker && !d.clue.trim()))} className={btn}>
        {p.busy ? (
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-5 animate-spin" aria-hidden /> {t("checking")}
          </span>
        ) : (
          t("done")
        )}
      </button>
    </form>
  );
}
