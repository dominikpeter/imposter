"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { TopicIcon } from "@/components/TopicIcon";
import { CATEGORIES, UI, type Lang } from "@/lib/i18n";
import { press } from "@/lib/ui";

const FIRST = 8; // tiles shown before "More topics"
// tiles adapt to the phone: 2 per row at 320px, 3 on most phones, 4 on large ones
const grid = "grid grid-cols-tiles gap-2";
const tile = "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center text-sm leading-tight font-medium hyphens-auto";

/** Topic tiles, A–Z in the current language: pickable in setup (with "All topics"), read-only in the room lobby. */
export function TopicGrid({ lang, cats, onChange }: { lang: Lang; cats: string[]; onChange?: (cats: string[]) => void }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const [open, setOpen] = useState(false);
  const all = cats.length === CATEGORIES.length;
  const list = (onChange ? CATEGORIES : CATEGORIES.filter((c) => cats.includes(c.id))).toSorted((a, b) =>
    a.name[lang].localeCompare(b.name[lang], lang),
  );
  const shown = open ? list : list.slice(0, FIRST);
  const more = list.length > FIRST && (
    <button onClick={() => setOpen(!open)} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full font-medium text-primary-ink ${press}`}>
      {open ? t("lessTopics") : t("moreTopics").replace("{name}", String(list.length - FIRST))}
      <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );

  if (!onChange)
    return (
      <div className="flex flex-col gap-1">
        <ul className={grid}>
          {shown.map((c) => (
            <li key={c.id} className={`${tile} enter border-transparent bg-tint text-primary-ink`}>
              <TopicIcon name={c.icon} className="size-5" />
              {c.name[lang]}
            </li>
          ))}
        </ul>
        {more}
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => onChange(all ? [] : CATEGORIES.map((c) => c.id))}
        aria-pressed={all}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-full border font-semibold ${press} ${
          all ? "border-primary-dark bg-primary-dark text-on-primary" : "border-dashed border-divider/70 text-muted"
        }`}
      >
        {all && <Check className="size-4" aria-hidden />} {t("allTopics")}
      </button>
      <div className={grid}>
        {shown.map((c) => {
          const on = cats.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onChange(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
              aria-pressed={on}
              className={`${tile} enter ${press} ${on ? "border-primary-ink/40 bg-tint text-primary-ink shadow-sm" : "border-dashed border-divider/70 text-muted"}`}
            >
              <TopicIcon name={c.icon} className="size-5" />
              {c.name[lang]}
            </button>
          );
        })}
      </div>
      {more}
    </div>
  );
}
