import type { CSSProperties } from "react";
import { VenetianMask } from "lucide-react";

// a dealt hand: everyone holds the same word, one card hides the imposter. Content sits top-left like a
// playing card's index, so the overlapping neighbour never covers it. Sizes are in cqw: the fan scales to fit 320px phones.
const CARDS = [
  { x: -31, y: 14, rot: -14 },
  { x: -15.5, y: 4, rot: -7 },
  { x: 0, y: 0, rot: 0 },
  { x: 15.5, y: 4, rot: 7 },
  { x: 31, y: 14, rot: 14 },
];
const IMPOSTER = 3;

/** Start-screen illustration: cards deal in, bob, and the imposter's mask glances around. Decorative only. */
export function Hero({ word }: { word: string }) {
  return (
    <div aria-hidden className="@container relative mx-auto h-36 w-full max-w-xs">
      {CARDS.map((c, i) => (
        <div
          key={i}
          className="hero-card flex aspect-card flex-col items-start rounded-2xl border border-line bg-surface p-2 shadow-lg"
          style={{ "--x": `${c.x}cqw`, "--y": `${c.y}px`, "--rot": `${c.rot}deg`, "--i": i } as CSSProperties}
        >
          {i === IMPOSTER ? (
            <VenetianMask className="hero-mask text-imp" strokeWidth={1.75} />
          ) : (
            <span className="leading-tight font-bold">{word}</span>
          )}
        </div>
      ))}
    </div>
  );
}
