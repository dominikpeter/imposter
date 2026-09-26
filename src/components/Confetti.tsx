import type { CSSProperties } from "react";

// theme tokens, so every palette gets its own confetti (Arosa: blue and sun yellow)
const COLORS = ["var(--color-glow)", "var(--color-primary)", "var(--color-crew)", "var(--color-accent)", "var(--color-danger)"];
// spread by the golden angle: even and lively, and the same on every render (no Math.random, nothing to hydrate)
const PIECES = Array.from({ length: 26 }, (_, i) => {
  const a = i * 2.39996; // golden angle, radians
  const spread = 0.35 + ((i * 7) % 10) / 15; // 0.35 … 0.95
  return {
    "--x": `${(Math.cos(a) * 9 * spread).toFixed(2)}rem`,
    "--up": `${(-4 - ((i * 5) % 7)).toFixed(2)}rem`,
    "--down": `${(6 + ((i * 3) % 8)).toFixed(2)}rem`,
    "--r": `${((i % 2 ? 1 : -1) * (240 + ((i * 37) % 360))).toFixed(0)}deg`,
    "--d": `${((i % 6) * 40).toFixed(0)}ms`,
    "--c": COLORS[i % COLORS.length],
  } as CSSProperties;
});

/** A one-off confetti burst for a crew win. Decorative; nothing under reduced motion (globals.css). */
export function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {PIECES.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}
