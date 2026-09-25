"use client";

import { BookOpen, Heart, Moon, Settings, Sparkles, Sun, SunMoon, X } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { LANGS, UI, type Lang } from "@/lib/i18n";
import { SignIn } from "@/components/SignIn";
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
export function TopControls({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
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
        <div className="flex flex-col gap-5 p-5 pb-safe">
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
            {segmented(
              LANGS.map((l) => ({ id: l.id, label: l.label, title: l.label })),
              lang,
              setLang,
              "sm",
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
          {ai && <SignIn lang={lang} />}

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

          <footer className="flex flex-col items-center gap-1 pt-1 text-sm text-muted">
            <p className="flex items-center gap-1">
              {t("madeWith").split("{heart}")[0]}
              <Heart className="size-4 fill-danger text-danger" aria-label="love" />
              {t("madeWith").split("{heart}")[1]}
            </p>
            <a
              href="https://github.com/dominikpeter/imposter"
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-1.5 font-medium text-primary-ink hover:underline"
            >
              {/* GitHub mark (lucide has no brand icons) */}
              <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {t("sourceOnGithub")}
            </a>
          </footer>
        </div>
      </dialog>
    </div>
  );
}
