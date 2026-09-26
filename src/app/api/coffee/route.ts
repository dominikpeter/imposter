import { coffeeAmount, coffeeE2e, coffeeOn, stripe } from "@/lib/coffee";
import { UI, type Lang } from "@/lib/i18n";
import { allow, clientKey } from "@/lib/rateLimit";

const NAME = { 1: "coffeeSmall", 5: "coffeeBig", 10: "coffeeDeluxe" } as const;

// POST { size: "small" | "big" | "deluxe" } or { chf: 1…200 }, lang → { url } of Stripe's hosted checkout page
export async function POST(req: Request) {
  if (!coffeeOn) return Response.json({ error: "off" }, { status: 404 });
  if (!(await allow(`coffee:${clientKey(req)}`, 5))) return Response.json({ error: "rate_limited" }, { status: 429 }); // each call opens a Stripe session
  const body = await req.json().catch(() => ({}));
  const chf = coffeeAmount(body ?? {});
  if (!chf) return Response.json({ error: "amount" }, { status: 400 });
  const lang: Lang = body.lang === "fr" || body.lang === "de" ? body.lang : "en";
  // return to the page the coffee was started from (e.g. a room), same-origin only
  // checked after parsing: a path like /\evil.com passes a prefix test but URL() reads the backslash as "//"
  const origin = new URL(req.url).origin;
  const asked = typeof body.path === "string" && body.path.startsWith("/") ? URL.parse(body.path, origin) : null;
  const home = asked?.origin === origin ? asked : new URL("/", origin);
  const cancel = home.toString();
  home.searchParams.set("coffee", "thanks");
  const thanks = home.toString();
  if (coffeeE2e) return Response.json({ url: thanks });

  const name = UI[NAME[chf as keyof typeof NAME] ?? "coffeeCustom"][lang];
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    submit_type: "donate",
    // no payment_method_types: Stripe shows what's enabled in the Dashboard (cards, TWINT, Apple/Google Pay…)
    line_items: [{ quantity: 1, price_data: { currency: "chf", unit_amount: chf * 100, product_data: { name: `Imposter – ${name}` } } }],
    locale: lang,
    success_url: thanks,
    cancel_url: cancel,
    integration_identifier: "imposter_coffee_qxbrtmwk",
    metadata: { app: "imposter" }, // the Stripe account is shared with Zettelispiil: the webhook counts only these
  });
  return Response.json({ url: session.url });
}
