"use client";

import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { ghost } from "@/lib/styles";

/** Registers the offline service worker in production (never in dev: stale caches would fight hot reload). */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
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
