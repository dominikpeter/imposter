import Stripe from "stripe";

// "Buy me a coffee": a one-off tip through Stripe Checkout (hosted page, so no card data ever touches this app).
// Switched on by STRIPE_SECRET_KEY (`just stripe-setup`); the webhook only counts paid coffees for the admin page.
// Amounts/validation live in ./coffee-config.ts so the client can share them without bundling the Stripe SDK.
export { COFFEES, MAX_CHF, coffeeAmount, type Coffee } from "./coffee-config.ts";

// the e2e dev server never calls Stripe (even with the live key in .env.local): it "pays" at once, so the flow can be tested
export const coffeeE2e = process.env.NODE_ENV === "development" && process.env.E2E_AUTH_BYPASS === "1";
export const coffeeOn = !!process.env.STRIPE_SECRET_KEY || coffeeE2e;

let client: Stripe | null = null;
export const stripe = () => (client ??= new Stripe(process.env.STRIPE_SECRET_KEY!));
