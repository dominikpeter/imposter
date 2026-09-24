import { Check } from "lucide-react";
import { TopicIcon } from "@/components/TopicIcon";
import { CATEGORIES, UI, type Lang } from "@/lib/i18n";
import { press } from "@/lib/ui";

// tiles adapt to the phone: 2 per row at 320px, 3 on most phones, 4 on large ones
const grid = "grid grid-cols-[repeat(auto-fill,minmax(4.6rem,1fr))] gap-2";
const tile = "flex min-h-[3.9rem] flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center text-sm leading-tight font-medium hyphens-auto";

/** Topic tiles: pickable in setup (with "All topics"), read-only in the room lobby. */
export function TopicGrid({ lang, cats, onChange }: { lang: Lang; cats: string[]; onChange?: (cats: string[]) => void }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const all = cats.length === CATEGORIES.length;
  if (!onChange)
    return (
      <ul className={grid}>
        {CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => (
          <li key={c.id} className={`${tile} border-transparent bg-tint text-primary-ink`}>
            <TopicIcon name={c.icon} className="size-5" />
            {c.name[lang]}
          </li>
        ))}
      </ul>
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
        {CATEGORIES.map((c) => {
          const on = cats.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => onChange(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
              aria-pressed={on}
              className={`${tile} ${press} ${on ? "border-primary-ink/40 bg-tint text-primary-ink shadow-sm" : "border-dashed border-divider/70 text-muted"}`}
            >
              <TopicIcon name={c.icon} className="size-5" />
              {c.name[lang]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
