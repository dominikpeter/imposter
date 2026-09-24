"use client";

import { BookOpen, Moon, Settings, Sparkles, Sun, SunMoon, X } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { LANGS, UI, type Lang } from "@/lib/i18n";
import { aiStore, paletteStore, PALETTES, press, segmented, themeStore, THEMES, useAi, usePalette, useTheme } from "@/lib/ui";

const dark = "(prefers-color-scheme: dark)";
const onSystemChange = (cb: () => void) => {
  const m = matchMedia(dark);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const round = `grid size-11 place-items-center rounded-full border border-line bg-surface text-xl ${press}`;
// header pair: one soft pill holding both icon buttons
const pillBtn = `grid size-10 place-items-center rounded-full text-ink/80 hover:bg-tint hover:text-ink ${press}`;

/** Header right side: quick light/dark toggle + settings sheet (language, appearance, colors). */
export function TopControls({ lang, setLang, lockedNote }: { lang: Lang; setLang: (l: Lang) => void; lockedNote?: string }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const theme = useTheme();
  const palette = usePalette();
  const systemDark = useSyncExternalStore(onSystemChange, () => matchMedia(dark).matches, () => false);
  const isDark = theme === "dark" || (theme === "auto" && systemDark);
  const sheet = useRef<HTMLDialogElement>(null);
  const ai = useAi();

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-line/70 bg-surface/60 p-0.5 shadow-sm backdrop-blur">
      <button onClick={() => themeStore.set(isDark ? "light" : "dark")} aria-label={t("toggleTheme")} className={pillBtn}>
        <span key={String(isDark)} className="pop">
          {isDark ? <Moon className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
        </span>
      </button>
      <span className="h-5 w-px bg-line" aria-hidden />
      <button onClick={() => sheet.current?.showModal()} aria-label={t("settings")} className={pillBtn}>
        <Settings className="size-5" aria-hidden />
      </button>

      <dialog
        ref={sheet}
        onClick={(e) => e.target === sheet.current && sheet.current.close()} // tap outside closes
        className="sheet mx-auto mt-auto mb-0 w-full max-w-md rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-black/50 sm:mb-auto sm:rounded-3xl"
      >
        <div className="flex flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Settings className="size-6" aria-hidden /> {t("settings")}
            </h2>
            <button onClick={() => sheet.current?.close()} aria-label={t("close")} className={`${round} text-2xl`}>
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("language")}</h3>
            {lockedNote ? (
              <p className="text-sm text-muted">{lockedNote}</p>
            ) : (
              segmented(
                LANGS.map((l) => ({ id: l.id, label: l.label, title: l.label })),
                lang,
                setLang,
                "sm",
              )
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("appearance")}</h3>
            {segmented(
              THEMES.map((id) => ({
                id,
                label: (
                  <>
                    {id === "auto" ? <SunMoon className="size-4" aria-hidden /> : id === "light" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
                    {t(id === "auto" ? "themeAuto" : id === "light" ? "themeLight" : "themeDark")}
                  </>
                ),
              })),
              theme,
              themeStore.set,
              "sm",
            )}
          </section>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="size-4 text-primary-ink" aria-hidden /> {t("aiHelp")}
              </span>
              <span className="block text-sm text-muted">{t("aiHelpDesc")}</span>
            </span>
            <input type="checkbox" checked={ai} onChange={(e) => aiStore.set(e.target.checked ? "on" : "off")} className="peer sr-only" />
            <span className="switch shrink-0 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
          </label>

          <section className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("colors")}</h3>
            <div className="grid grid-cols-2 gap-2">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => paletteStore.set(p.id)}
                  aria-pressed={palette === p.id}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border-2 px-3 text-left font-semibold ${press} ${
                    palette === p.id ? "border-primary-dark bg-tint" : "border-line"
                  }`}
                >
                  <span className="flex -space-x-2" aria-hidden>
                    {p.swatch.map((c) => (
                      <span key={c} className="size-6 rounded-full ring-2 ring-surface" style={{ background: c }} />
                    ))}
                  </span>
                  {t(`palette_${p.id}`)}
                </button>
              ))}
            </div>
          </section>
          <a
            href="https://github.com/dominikpeter/imposter/blob/main/docs/MANUAL.md"
            target="_blank"
            rel="noreferrer"
            className={`flex min-h-12 items-center justify-center gap-2 rounded-full border border-line font-semibold text-primary-ink ${press}`}
          >
            <BookOpen className="size-5" aria-hidden /> {t("howToPlay")}
          </a>
        </div>
      </dialog>
    </div>
  );
}
