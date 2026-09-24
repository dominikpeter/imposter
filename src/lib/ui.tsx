// shared look & feel for the one-phone game and online rooms
import { useSyncExternalStore, type ReactNode } from "react";

export type Theme = "auto" | "light" | "dark";
export const THEMES: Theme[] = ["auto", "light", "dark"];
export type Palette = "night" | "classic" | "forest" | "berry";
// swatch = [button, accent, glow] preview for the settings sheet
export const PALETTES: { id: Palette; swatch: [string, string, string] }[] = [
  { id: "night", swatch: ["#1c2541", "#5bc0be", "#6fffe9"] },
  { id: "classic", swatch: ["#1976d2", "#7c4dff", "#bbdefb"] },
  { id: "forest", swatch: ["#1b4332", "#40916c", "#b7e4c7"] },
  { id: "berry", swatch: ["#5a189a", "#e0569b", "#f7c6e0"] },
];

// a preference kept in localStorage and mirrored to <html data-*>; applied before paint by the script in layout.tsx
function pref<T extends string>(key: "theme" | "palette" | "ai", fallback: T, allowed: readonly T[]) {
  const listeners = new Set<() => void>();
  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: (): T => {
      try {
        const v = localStorage.getItem(key) as T;
        return allowed.includes(v) ? v : fallback;
      } catch {
        return fallback;
      }
    },
    set: (next: T) => {
      const root = document.documentElement;
      if (next === fallback) delete root.dataset[key];
      else root.dataset[key] = next;
      try {
        if (next === fallback) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {}
      listeners.forEach((l) => l());
    },
  };
}
export const themeStore = pref<Theme>("theme", "auto", THEMES);
export const paletteStore = pref<Palette>("palette", "night", PALETTES.map((p) => p.id));
export const aiStore = pref<"on" | "off">("ai", "on", ["on", "off"]); // AI word check + explain button

export const press = "transition duration-200 ease-spring active:scale-[0.97]";
export const btn = `flex min-h-14 w-full items-center justify-center rounded-full bg-primary-dark px-6 text-lg font-semibold text-on-primary hover:bg-primary disabled:opacity-40 disabled:active:scale-100 ${press}`;
export const ghost = `min-h-11 rounded-full px-4 font-medium text-primary-ink hover:bg-tint ${press}`;
export const card = "rounded-3xl border border-line bg-surface p-5";
export const heading = "text-lg font-semibold";
export const chip = `inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-medium whitespace-nowrap ${press}`;
export const chipOn = "border-primary-ink/40 bg-tint text-primary-ink shadow-sm";
export const chipOff = "border-dashed border-divider/70 bg-transparent text-muted hover:border-divider hover:text-ink";
export const round_btn = `size-11 rounded-full border border-divider/70 bg-surface text-2xl leading-none text-ink hover:border-primary hover:text-primary-ink disabled:opacity-30 disabled:active:scale-100 disabled:hover:border-divider/70 disabled:hover:text-ink ${press}`;
export const field =
  "w-full rounded-2xl border border-divider/60 bg-surface px-4 py-3 text-lg transition outline-none placeholder:text-divider focus:border-primary focus-visible:outline-none";

// segmented control with a sliding indicator (transform only)
export const segmented = <T extends string>(
  options: { id: T; label: ReactNode; title?: string }[],
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
          className={`relative z-10 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-2 py-1 leading-tight text-balance transition-colors duration-300 ${o.id === value ? "text-on-primary" : "text-muted hover:text-ink"}`}
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
export const useAi = () => useSyncExternalStore(aiStore.subscribe, aiStore.get, () => "on" as const) === "on";
export const usePalette = () => useSyncExternalStore(paletteStore.subscribe, paletteStore.get, () => "night" as Palette);
