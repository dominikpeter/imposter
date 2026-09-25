import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

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

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    "https://whoislying.ch",
    "https://www.whoislying.ch",
    "https://imposter-orcin-five.vercel.app",
    ...(env.NODE_ENV === "development" ? ["http://localhost:3000"] : []), // never trust plain http in production
  ],
  // ponytail: Better Auth's own rate limit uses memory storage here (no DB), which resets per serverless instance.
  // OAuth-only sign-in has no password to brute-force; move it to Redis via rateLimit.customStorage if that changes.
  socialProviders,
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 30, strategy: "jwe", refreshCache: true },
  },
  // we only need who you are, not your provider tokens: keeps the cookie small
  account: { storeStateStrategy: "cookie", storeAccountCookie: false },
  plugins: [nextCookies()],
});

export type AiUser = { id: string; name: string };

/**
 * The signed-in user allowed to use AI, or null. E2E bypass: header `x-e2e-user`, honoured only by the dev
 * server started with E2E_AUTH_BYPASS=1 (never in a production build).
 */
export async function aiUser(req: Request): Promise<AiUser | null> {
  const bypass = env.NODE_ENV === "development" && env.E2E_AUTH_BYPASS === "1" && req.headers.get("x-e2e-user");
  if (bypass) return { id: `e2e:${bypass}`, name: bypass };
  try {
    const s = await auth.api.getSession({ headers: req.headers });
    return s ? { id: s.user.id, name: s.user.name || s.user.email } : null;
  } catch {
    return null;
  }
}
