"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { ghost, press } from "@/lib/styles";

/** Registers the offline service worker in production (never in dev: stale caches would fight hot reload). */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_VERSION}`, { scope: "/" }).catch(() => {}); // new version → new worker + fresh cache
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Settings: "Install app" where the browser offers it (Chrome/Edge/Android), Share → Add to Home Screen on iPhone. */
export function InstallApp({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  // read once on first render: settings only ever render in the browser (the pages wait for hydration)
  const [installed, setInstalled] = useState(
    () => typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true),
  );
  const [ios] = useState(() => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent));
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our button instead of the browser's own mini-bar
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed || (!prompt && !ios)) return null;
  return prompt ? (
    <button
      onClick={async () => {
        await prompt.prompt();
        if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
        setPrompt(null);
      }}
      className={`${ghost} flex items-center justify-center gap-2 border border-line`}
    >
      <Download className="size-5 shrink-0" aria-hidden /> {t("installApp")}
    </button>
  ) : (
    <p className="flex items-start gap-2 rounded-2xl bg-tint px-4 py-3 text-sm">
      <Share className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden /> {t("installIos")}
    </p>
  );
}

const DISMISS_KEY = "imposter:install-dismissed:v1"; // versioned: a later redesign can re-offer by bumping v1
const isPhone = () =>
  typeof window !== "undefined" &&
  matchMedia("(pointer: coarse)").matches &&
  innerWidth <= 820 &&
  !(matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

/**
 * Proactive, dismissible "add to home screen" banner for phones that haven't installed the app.
 * Android/Chrome: an Add button that fires the native install prompt. iPhone: the Share → Add to Home Screen hint.
 * Hidden once installed, once dismissed (remembered per browser), and on desktop.
 */
export function InstallBanner({ lang }: { lang: Lang }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios] = useState(() => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent));

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {} // private mode / blocked storage: just treat as not dismissed
    if (dismissed || !isPhone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
      setShow(true);
    };
    addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setShow(false);
    addEventListener("appinstalled", onInstalled);
    // iOS fires no beforeinstallprompt: show the Share hint on its own (Safari only — Chrome iOS can't add to home screen)
    const t0 = ios && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent) ? setTimeout(() => setShow(true), 1200) : undefined;
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
      if (t0) clearTimeout(t0);
    };
  }, [ios]);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md p-3 pb-safe" role="dialog" aria-label={t("installBannerTitle")}>
      <div className="enter flex items-start gap-3 rounded-3xl border border-line bg-surface p-4 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static PWA icon, no optimization needed */}
        <img src="/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("installBannerTitle")}</p>
          <p className="mt-0.5 text-sm text-muted">{ios ? t("installBannerIos") : t("installBannerNote")}</p>
          <div className="mt-3 flex items-center gap-2">
            {prompt && (
              <button
                onClick={async () => {
                  await prompt.prompt();
                  await prompt.userChoice;
                  setPrompt(null);
                  dismiss();
                }}
                className={`flex min-h-11 items-center gap-1.5 rounded-full bg-primary-dark px-5 font-semibold text-on-primary ${press}`}
              >
                <Download className="size-5" aria-hidden /> {t("installBannerAdd")}
              </button>
            )}
            {ios && <Share className="size-5 shrink-0 text-primary-ink" aria-hidden />}
            <button onClick={dismiss} className={`${ghost} min-h-11 text-muted`}>
              {t("installBannerDismiss")}
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label={t("close")} className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-tint">
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
