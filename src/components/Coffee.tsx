"use client";

import { Coffee as CoffeeIcon, Heart, LoaderCircle } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { UI, type Lang } from "@/lib/i18n";
import { field, press } from "@/lib/ui";
import { MAX_CHF } from "@/lib/coffee-config";

const SIZES = [
  { size: "small", chf: 1, label: "coffeeSmall" },
  { size: "big", chf: 5, label: "coffeeBig" },
  { size: "deluxe", chf: 10, label: "coffeeDeluxe" },
] as const;

// Apple and Google require their own in-app purchase for tips inside store apps: no tip jar in the Capacitor app
const inStoreApp = () => !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
const never = () => () => {};

/** Settings: tip jar. Opens Stripe's hosted checkout; back on the app, `thanks` says thank you. */
export function Coffee({ lang, thanks }: { lang: Lang; thanks: boolean }) {
  const t = (k: keyof typeof UI) => UI[k][lang];
  const native = useSyncExternalStore(never, inStoreApp, () => false);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Back from Stripe without paying: the browser restores this page from its back/forward cache with the
  // spinner still on and every button disabled. Unlock on every show, so you can always buy (another) coffee.
  useEffect(() => {
    const unlock = (e: PageTransitionEvent) => e.persisted && setBusy(null);
    addEventListener("pageshow", unlock);
    return () => removeEventListener("pageshow", unlock);
  }, []);
  const chf = Number(custom);
  const customOk = Number.isInteger(chf) && chf >= 1 && chf <= MAX_CHF;

  const pay = async (key: string, body: object) => {
    setBusy(key);
    setFailed(false);
    try {
      const res = await fetch("/api/coffee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lang, path: location.pathname }) });
      const { url } = await res.json();
      if (!res.ok || !url) throw new Error();
      location.assign(url); // Stripe's page, then back to the app
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };

  if (native) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <CoffeeIcon className="size-4 text-primary-ink" aria-hidden /> {t("coffee")}
      </h3>
      {thanks ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-tint px-4 py-3 font-semibold text-primary-ink">
          <Heart className="beat size-5 shrink-0 fill-danger text-danger" aria-hidden /> {t("coffeeThanks")}
        </p>
      ) : (
        <p className="text-sm text-muted">{t("coffeeNote")}</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {SIZES.map((c) => (
          <button
            key={c.size}
            disabled={!!busy}
            onClick={() => pay(c.size, { size: c.size })}
            className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border border-line px-1 text-center disabled:opacity-40 ${press}`}
          >
            {busy === c.size ? (
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
            ) : (
              <>
                <span className="text-lg font-bold tabular-nums">CHF {c.chf}</span>
                <span className="text-xs text-muted">{t(c.label)}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (customOk) pay("custom", { chf });
        }}
        className="flex gap-2"
      >
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CHF}
          step={1}
          aria-label={t("coffeeOther")}
          placeholder={t("coffeeOther")}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className={`${field} min-w-0 flex-1`}
        />
        <button
          disabled={!customOk || !!busy}
          className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-line px-4 font-semibold disabled:opacity-40 ${press}`}
        >
          {busy === "custom" ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <CoffeeIcon className="size-5" aria-hidden />}
          {t("coffeeGive")}
        </button>
      </form>
      {failed && (
        <p role="alert" className="text-sm text-imp">
          {t("coffeeFailed")}
        </p>
      )}
    </section>
  );
}
