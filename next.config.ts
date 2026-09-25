import type { NextConfig } from "next";

// ponytail: no script-src CSP; Next's inline bootstrap scripts need per-request nonces (dynamic rendering). Add if we ever render user HTML.
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // camera only for the QR scanner on our own pages
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  devIndicators: false, // no dev-mode badge: it overlaps the bottom buttons on a phone
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next", // e2e builds into .next-e2e so it can run next to `just dev`
  headers: async () => [{ source: "/:path*", headers: security }],
};

export default nextConfig;
