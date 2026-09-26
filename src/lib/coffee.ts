import Stripe from "stripe";

// "Buy me a coffee": a one-off tip through Stripe Checkout (hosted page, so no card data ever touches this app).
// Switched on by STRIPE_SECRET_KEY (`just stripe-setup`); the webhook only counts paid coffees for the admin page.
export const COFFEES = { small: 1, big: 5, deluxe: 10 } as const; // CHF
export type Coffee = keyof typeof COFFEES;
export const MAX_CHF = 200; // custom amount cap: a typo shouldn't become a 5000 CHF charge

// the e2e dev server never calls Stripe (even with the live key in .env.local): it "pays" at once, so the flow can be tested
export const coffeeE2e = process.env.NODE_ENV === "development" && process.env.E2E_AUTH_BYPASS === "1";
export const coffeeOn = !!process.env.STRIPE_SECRET_KEY || coffeeE2e;

let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

/** Whole francs for a size or a custom amount; null when it isn't a coffee we sell. */
export function coffeeAmount(body: { size?: unknown; chf?: unknown }): number | null {
  if (typeof body.size === "string" && Object.hasOwn(COFFEES, body.size)) return COFFEES[body.size as Coffee];
  const chf = body.chf;
  return typeof chf === "number" && Number.isInteger(chf) && chf >= 1 && chf <= MAX_CHF ? chf : null;
}
