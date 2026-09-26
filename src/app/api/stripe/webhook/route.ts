import type Stripe from "stripe";
import { stripe } from "@/lib/coffee";
import { count } from "@/lib/metrics";
import { db } from "@/lib/store";

// Stripe → paid coffees for the admin stats. Register https://whoislying.ch/api/stripe/webhook in the Stripe
// Dashboard for checkout.session.completed, checkout.session.async_payment_succeeded and …_failed (`just stripe-setup`).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not configured", { status: 503 });
  let event: Stripe.Event;
  try {
    // the signature proves Stripe sent exactly this body: anything else is ignored
    event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const s = event.data.object;
    // TWINT/bank methods can complete unpaid and settle later (async_payment_succeeded): count only paid ones,
    // and each session once (Stripe retries, and both events can arrive for one session)
    if (s.metadata?.app === "imposter" && s.payment_status === "paid" && (await db.set(`stripe:paid:${s.id}`, 1, { ex: 30 * 86_400, nx: true })))
      await count({ coffees: 1, coffeeRappen: s.amount_total ?? 0 });
  }
  return Response.json({ received: true });
}
