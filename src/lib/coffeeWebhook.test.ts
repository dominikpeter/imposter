import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/stripe/webhook/route.ts";
import { stripe } from "./coffee.ts";
import { dashboard } from "./metrics.ts";

// real signature checking with a made-up secret: only Stripe-signed events count, each paid session once
// (both are read lazily, at the first request)
process.env.STRIPE_SECRET_KEY = "sk_test_unit";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit";

const event = (type: string, id: string, payment_status: string) =>
  JSON.stringify({ id: `evt_${Math.random()}`, object: "event", type, data: { object: { id, object: "checkout.session", payment_status, amount_total: 500 } } });
const send = (body: string, sig = stripe().webhooks.generateTestHeaderString({ payload: body, secret: "whsec_unit" })) =>
  POST(new Request("http://x/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": sig } }));
const today = async () => (await dashboard(1)).daily[0];

test("stripe webhook: signed, paid, counted once", async () => {
  const before = await today();
  assert.equal((await send(event("checkout.session.completed", "cs_1", "paid"), "t=1,v1=forged")).status, 400);
  assert.equal((await send(event("checkout.session.completed", "cs_2", "unpaid"))).status, 200); // TWINT pending: not yet
  assert.equal((await send(event("checkout.session.completed", "cs_3", "paid"))).status, 200);
  assert.equal((await send(event("checkout.session.completed", "cs_3", "paid"))).status, 200); // Stripe retry
  assert.equal((await send(event("checkout.session.async_payment_succeeded", "cs_2", "paid"))).status, 200); // settled later
  const after = await today();
  assert.equal(after.coffees - before.coffees, 2);
  assert.equal(after.coffeeRappen - before.coffeeRappen, 1000);
});
