import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { Redis } from "@upstash/redis";
import { url as redisUrl, token as redisToken } from "./store.ts";
import { later, recordLogin } from "./metrics.ts";

// Login only unlocks the AI features (the game itself needs no account). No database: the session is an
// encrypted cookie (stateless mode). Providers are switched on by their env vars, so any subset works.
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

// Email sign-in: a 6-digit code by mail (Resend). The e2e dev server uses a fixed code instead of mailing.
const e2e = env.NODE_ENV === "development" && env.E2E_AUTH_BYPASS === "1";
export const emailLogin = !!env.RESEND_API_KEY || e2e;
async function mailCode(email: string, otp: string) {
  if (!env.RESEND_API_KEY) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? "Imposter <onboarding@resend.dev>", // resend.dev only reaches the Resend account owner: set RESEND_FROM on a verified domain
      to: email,
      subject: `${otp} is your Imposter code`,
      text: `Your sign-in code: ${otp}\n\nIt works for 5 minutes. If you didn't ask for it, ignore this mail.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// The code must survive between two requests that may hit different serverless instances, so it lives in
// Redis (Better Auth "secondary storage"; this also moves sessions and its own rate limits there).
// Raw strings: Better Auth stores JSON text itself, Upstash's auto-parsing would hand it objects.
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken, automaticDeserialization: false }) : null;
const secondaryStorage = redis
  ? {
      get: (k: string) => redis.get<string>(`auth:${k}`),
      set: async (k: string, v: string, ttl?: number) => void (await (ttl ? redis.set(`auth:${k}`, v, { ex: ttl }) : redis.set(`auth:${k}`, v))),
      delete: async (k: string) => void (await redis.del(`auth:${k}`)),
      getAndDelete: (k: string) => redis.getdel<string>(`auth:${k}`),
      async increment(k: string, ttl: number) {
        const [n] = await redis.multi().incr(`auth:${k}`).expire(`auth:${k}`, ttl, "NX").exec<[number, number]>(); // TTL only when new
        return n;
      },
    }
  : undefined;

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
    cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30, strategy: "jwe", refreshCache: !secondaryStorage },
  },
  // we only need who you are, not your provider tokens: keeps the cookie small
  account: { storeStateStrategy: "cookie", storeAccountCookie: false },
  plugins: [
    ...(emailLogin
      ? [
          emailOTP({
            allowedAttempts: 3,
            generateOTP: e2e ? () => "123456" : undefined,
            sendVerificationOTP: ({ email, otp, type }) => (type === "sign-in" ? mailCode(email, otp) : Promise.resolve()),
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
