// shared look & feel for the one-phone game and online rooms
import { useSyncExternalStore } from "react";

export type Theme = "auto" | "light" | "dark";
export const THEMES: Theme[] = ["auto", "light", "dark"];

// "auto" follows the system; a saved choice is applied before paint by the script in layout.tsx
const listeners = new Set<() => void>();
export const themeStore = {
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: (): Theme => {
    try {
      const t = localStorage.getItem("theme");
      return t === "light" || t === "dark" ? t : "auto";
    } catch {
      return "auto";
    }
  },
  set: (next: Theme) => {
    const root = document.documentElement;
    if (next === "auto") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "auto") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    listeners.forEach((l) => l());
  },
};

export const press = "transition duration-200 ease-spring active:scale-[0.97]";
export const btn = `flex min-h-14 w-full items-center justify-center rounded-full bg-primary-dark px-6 text-lg font-semibold text-on-primary hover:bg-primary disabled:opacity-40 disabled:active:scale-100 ${press}`;
export const ghost = `min-h-11 rounded-full px-4 font-medium text-primary-ink hover:bg-tint ${press}`;
export const card = "rounded-3xl border border-line bg-surface p-5";
export const heading = "text-lg font-semibold";
export const chip = `min-h-11 rounded-full border px-4 font-medium ${press}`;
export const chipOn = "border-line bg-tint text-primary-ink";
export const chipOff = "border-divider/60 bg-surface text-muted hover:border-divider";
export const round_btn = `size-11 rounded-full border border-divider/70 bg-surface text-2xl leading-none text-ink hover:border-primary hover:text-primary-ink disabled:opacity-30 disabled:active:scale-100 disabled:hover:border-divider/70 disabled:hover:text-ink ${press}`;
export const field =
  "w-full rounded-2xl border border-divider/60 bg-surface px-4 py-3 text-lg transition outline-none placeholder:text-divider focus:border-primary focus-visible:outline-none";

// segmented control with a sliding indicator (transform only)
export const segmented = <T extends string>(
  options: { id: T; label: string; title?: string }[],
  value: T,
  onChange: (v: T) => void,
  size: "sm" | "md" = "md",
) => {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div
      className={`relative grid rounded-full border border-line bg-surface p-0.5 ${size === "sm" ? "text-sm font-semibold" : "font-medium"}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-primary-dark transition-transform duration-300 ease-spring"
        style={{ width: `calc((100% - 0.25rem) / ${options.length})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-label={o.title}
          aria-pressed={o.id === value}
          className={`relative z-10 min-h-10 rounded-full px-2 py-1 leading-tight text-balance transition-colors duration-300 ${o.id === value ? "text-on-primary" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

export const stepper = (value: number, set: (n: number) => void, min: number, max: number) => (
  <div className="flex shrink-0 items-center gap-1">
    <button onClick={() => set(value - 1)} disabled={value <= min} className={round_btn} aria-label="−">
      −
    </button>
    <span key={value} className="pop inline-block w-8 text-center text-2xl font-semibold tabular-nums">
      {value}
    </span>
    <button onClick={() => set(value + 1)} disabled={value >= max} className={round_btn} aria-label="+">
      +
    </button>
  </div>
);

export const useTheme = () => useSyncExternalStore(themeStore.subscribe, themeStore.get, () => "auto" as Theme);
