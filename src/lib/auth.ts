import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware } from "better-auth/api";
import { createHmac } from "node:crypto";
import { emailOTP } from "better-auth/plugins";
import { Redis } from "@upstash/redis";
import { url as redisUrl, token as redisToken } from "./store.ts";
import { later, recordLogin } from "./metrics.ts";
import { UI, type Lang } from "./i18n.ts";

// Login only unlocks the AI features (the game itself needs no account). No user database: the session is an
// encrypted cookie, backed by Redis when configured. Providers are switched on by their env vars, so any subset works.
const env = process.env;
const provider = (id: string, extra: object = {}) =>
  env[`${id}_CLIENT_ID`] && env[`${id}_CLIENT_SECRET`]
    ? { clientId: env[`${id}_CLIENT_ID`]!, clientSecret: env[`${id}_CLIENT_SECRET`]!, ...extra }
    : undefined;

const socialProviders = Object.fromEntries(
  Object.entries({
    google: provider("GOOGLE", { prompt: "select_account" }),
    github: provider("GITHUB"),
    microsoft: provider("MICROSOFT", {
      tenantId: "common",
      authority: "https://login.microsoftonline.com",
      prompt: "select_account",
      // Microsoft sends the avatar as a big base64 blob; it would bloat the session cookie
      mapProfileToUser: () => ({ image: undefined }),
    }),
  }).filter(([, v]) => v),
);
export const providers = Object.keys(socialProviders) as ("google" | "github" | "microsoft")[];

// The code must survive between two requests that may hit different serverless instances, so it lives in
// Redis (Better Auth "secondary storage"; this also moves sessions and its own rate limits there).
// Raw strings: Better Auth stores JSON text itself, Upstash's auto-parsing would hand it objects.
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false }) : null;
/** Atomic counter that expires `ttl` seconds after its first hit. */
const bump = async (r: Redis, key: string, ttl: number) => (await r.multi().incr(key).expire(key, ttl, "NX").exec<[number, number]>())[0];
const secondaryStorage = redis
  ? {
      get: (k: string) => redis.get<string>(`auth:${k}`),
      set: async (k: string, v: string, ttl?: number) => void (await (ttl ? redis.set(`auth:${k}`, v, { ex: ttl }) : redis.set(`auth:${k}`, v))),
      delete: async (k: string) => void (await redis.del(`auth:${k}`)),
      getAndDelete: (k: string) => redis.getdel<string>(`auth:${k}`),
      increment: (k: string, ttl: number) => bump(redis, `auth:${k}`, ttl),
    }
  : undefined;

// Email sign-in: a 6-digit code by mail (Resend). The e2e dev server uses a fixed code instead of mailing.
const e2e = env.NODE_ENV === "development" && env.E2E_AUTH_BYPASS === "1";
export const emailLogin = !!env.RESEND_API_KEY || e2e;
// Better Auth limits code requests per IP only. These stop one inbox being flooded from many IPs, and
// random addresses from burning the whole Resend quota (then nobody could sign in until the next day).
// ponytail: fixed caps; raise DAILY_MAILS with the Resend plan.
const PER_EMAIL_HOUR = 5;
const DAILY_MAILS = 90; // Resend free tier: 100 a day
async function mailCode(email: string, otp: string, lang: Lang) {
  if (redis) {
    const [mine, all] = await Promise.all([
      bump(redis, `auth-mail:${email.toLowerCase()}`, 60 * 60),
      bump(redis, `auth-mail:day:${new Date().toISOString().slice(0, 10)}`, 60 * 60 * 24),
    ]);
    if (mine > PER_EMAIL_HOUR || all > DAILY_MAILS) throw new Error("code mail cap reached"); // not mailed; Better Auth still answers "sent" (no account probing)
  }
  if (!env.RESEND_API_KEY || e2e) return; // e2e: counted, never mailed (fake addresses would bounce and hurt the domain)
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? "Imposter <onboarding@resend.dev>", // set by `just email-setup`; resend.dev only reaches the Resend account owner
      to: email,
      subject: UI.mailSubject[lang].replace("{code}", otp),
      text: UI.mailBody[lang].replace("{code}", otp),
    }),
  });
  if (!res.ok) throw new Error(`Resend refused the mail: ${res.status}`); // status only: the body echoes the address
}

/**
 * Account id = keyed hash of the email. There is no user table (each serverless instance has its own memory),
 * so without this every sign-in on a fresh instance makes a new random id: admin stats would split one person
 * into many rows, and signing in again would reset their AI limit.
 */
const stableId = (email: string) => createHmac("sha256", env.BETTER_AUTH_SECRET ?? "dev").update(email.toLowerCase()).digest("base64url").slice(0, 32);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    "https://whoislying.ch",
    "https://www.whoislying.ch",
    "https://imposter-orcin-five.vercel.app",
    ...(env.NODE_ENV === "development" ? ["http://localhost:*"] : []), // any local port (e2e runs on its own); never plain http in production
  ],
  socialProviders,
  secondaryStorage, // without Redis (local dev) everything stays in this one process's memory
  // email codes can be guessed: Better Auth's rate limit lives in Redis too (per IP), plus 3 tries per code
  rateLimit: { enabled: true, storage: secondaryStorage ? "secondary-storage" : "memory" },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    // with Redis: the cookie is re-checked daily, which also slides the 30 days while you keep playing
    cookieCache: { enabled: true, maxAge: secondaryStorage ? 60 * 60 * 24 : 60 * 60 * 24 * 30, strategy: "jwe", refreshCache: !secondaryStorage },
  },
  databaseHooks: { user: { create: { before: async (user) => ({ data: { ...user, id: stableId(user.email) } }) } } },
  // we only need who you are, not your provider tokens: keeps the cookie small
  account: { storeStateStrategy: "cookie", storeAccountCookie: false },
  plugins: [
    ...(emailLogin
      ? [
          emailOTP({
            allowedAttempts: 3,
            storeOTP: "hashed", // a Redis leak must not hand out live codes
            generateOTP: e2e ? () => "123456" : undefined,
            sendVerificationOTP: ({ email, otp, type }, ctx) => {
              const lang = ctx?.headers?.get("x-lang");
              return type === "sign-in" ? mailCode(email, otp, lang === "fr" || lang === "de" ? lang : "en") : Promise.resolve();
            },
          }),
        ]
      : []),
    nextCookies(), // last: sets the cookies of the plugins before it
  ],
  // every completed sign-in (/callback/<provider>, /sign-in/email-otp) lands in the admin stats
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const s = ctx.context.newSession;
      const provider = ctx.path.startsWith("/callback/") ? ctx.path.split("/")[2] : ctx.path === "/sign-in/email-otp" ? "email" : null;
      if (!s || !provider) return;
      later(() => recordLogin({ id: s.user.id, name: s.user.name ?? "", email: s.user.email ?? "", provider }));
    }),
  },
});

export type AiUser = { id: string; name: string; email: string; verified: boolean };

/**
 * The signed-in user allowed to use AI, or null. E2E bypass: header `x-e2e-user`, honoured only by the dev
 * server started with E2E_AUTH_BYPASS=1 (never in a production build).
 */
export async function aiUser(req: { headers: Headers }): Promise<AiUser | null> {
  const bypass = env.NODE_ENV === "development" && env.E2E_AUTH_BYPASS === "1" && req.headers.get("x-e2e-user");
  if (bypass) return { id: `e2e:${bypass}`, name: bypass, email: `${bypass.toLowerCase()}@e2e.test`, verified: true };
  try {
    const s = await auth.api.getSession({ headers: req.headers });
    return s ? { id: s.user.id, name: s.user.name || s.user.email, email: s.user.email, verified: !!s.user.emailVerified } : null;
  } catch {
    return null;
  }
}

/** Admin page access: signed-in accounts listed in ADMIN_EMAIL (comma-separated, set in Vercel; not in the repo). */
export function isAdmin(user: AiUser | null) {
  const allowed = (env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  // only an address the provider verified: an unverified email could be anyone's
  return !!user?.email && user.verified && allowed.includes(user.email.toLowerCase());
}
