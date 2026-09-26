// Pure coffee constants + amount validation, safe to import from client code (no Stripe SDK here).
export const COFFEES = { small: 1, big: 5, deluxe: 10 } as const; // CHF
export type Coffee = keyof typeof COFFEES;
export const MAX_CHF = 200; // custom amount cap: a typo shouldn't become a 5000 CHF charge

/** Whole francs for a size or a custom amount; null when it isn't a coffee we sell. */
export function coffeeAmount(body: { size?: unknown; chf?: unknown }): number | null {
  if (typeof body.size === "string" && Object.hasOwn(COFFEES, body.size)) return COFFEES[body.size as Coffee];
  const chf = body.chf;
  return typeof chf === "number" && Number.isInteger(chf) && chf >= 1 && chf <= MAX_CHF ? chf : null;
}
