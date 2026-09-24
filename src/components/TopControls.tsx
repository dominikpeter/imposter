"use client";

import { Moon, Settings, Sun, SunMoon, X } from "lucide-react";
import { useRef, useSyncExternalStore } from "react";
import { LANGS, UI, type Lang } from "@/lib/i18n";
import { paletteStore, PALETTES, press, segmented, themeStore, THEMES, usePalette, useTheme } from "@/lib/ui";

const dark = "(prefers-color-scheme: dark)";
const onSystemChange = (cb: () => void) => {
  const m = matchMedia(dark);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const round = `grid size-11 place-items-center rounded-full border border-line bg-surface text-xl ${press}`;

/** Header right side: quick light/dark toggle + settings sheet (language, appearance, colors). */
export function TopControls({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const theme = useTheme();
  const palette = usePalette();
  const systemDark = useSyncExternalStore(onSystemChange, () => matchMedia(dark).matches, () => false);
  const isDark = theme === "dark" || (theme === "auto" && systemDark);
  const sheet = useRef<HTMLDialogElement>(null);

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => themeStore.set(isDark ? "light" : "dark")} aria-label={t("toggleTheme")} className={round}>
        <span key={String(isDark)} className="pop">
          {isDark ? <Moon className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
        </span>
      </button>
      <button onClick={() => sheet.current?.showModal()} aria-label={t("settings")} className={round}>
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
        </div>
      </dialog>
    </div>
  );
}
