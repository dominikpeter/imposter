import { useState, type CSSProperties } from "react";
import { VenetianMask } from "lucide-react";
import { pick } from "@/lib/game";
import { CATEGORIES, type Lang } from "@/lib/i18n";

// a dealt hand: everyone holds the same word, one card hides the imposter. Content sits top-left like a
// playing card's index, so the overlapping neighbour never covers it. Sizes are in cqw: the fan scales to fit 320px phones.
const CARDS = [
  { x: -31, y: 14, rot: -14 },
  { x: -15.5, y: 4, rot: -7 },
  { x: 0, y: 0, rot: 0 },
  { x: 15.5, y: 4, rot: 7 },
  { x: 31, y: 14, rot: 14 },
];
// short single words fit the small cards
const shortWords = (lang: Lang) => CATEGORIES.flatMap((c) => c.words.map((w) => w[lang])).filter((w) => w.length <= 6 && !w.includes(" "));

/** Start-screen illustration: cards deal in, bob, and the imposter's mask glances around. Decorative only.
 *  A new random word and imposter seat on every visit (the page renders on the client only, so no hydration clash). */
export function Hero({ lang }: { lang: Lang }) {
  const [{ word, imposter }] = useState(() => {
    const words = shortWords(lang);
    return { word: words[pick(words.length)] ?? "Pizza", imposter: pick(CARDS.length) };
  });
  return (
    <div aria-hidden className="@container relative mx-auto h-36 w-full max-w-xs">
      {CARDS.map((c, i) => (
        <div
          key={i}
          className="hero-card flex aspect-card flex-col items-start rounded-2xl border border-line bg-surface p-2 shadow-lg"
          style={{ "--x": `${c.x}cqw`, "--y": `${c.y}px`, "--rot": `${c.rot}deg`, "--i": i } as CSSProperties}
        >
          {i === imposter ? (
            <VenetianMask className="hero-mask text-imp" strokeWidth={1.75} />
          ) : (
            <span className="leading-tight font-bold">{word}</span>
          )}
        </div>
      ))}
    </div>
  );
}
