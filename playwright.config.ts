import { defineConfig, devices } from "@playwright/test";

// mobile-first app → test on a phone viewport; runs against `next dev` (in-memory rooms, no Redis needed)
// or against a deployment: BASE_URL=https://… npm run e2e
// own ports: `reuseExistingServer` must never pick up another app's dev server on :3000
const PORT = 3218;
const PWA_PORT = 3219; // offline/service-worker tests need a production build (dev loads code via hot reload)
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const pwaURL = process.env.BASE_URL ?? `http://localhost:${PWA_PORT}`;
const phone = { ...devices["Pixel 7"], trace: "retain-on-failure" as const };

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? undefined : 3, // shared dev laptops: more parallel browsers starve one dev server
  timeout: process.env.CI ? 30_000 : 60_000, // local runs share the laptop with other work
  projects: [
    { name: "app", testIgnore: /pwa\.spec\.ts/, use: { ...phone, baseURL } },
    { name: "pwa", testMatch: /pwa\.spec\.ts/, use: { ...phone, baseURL: pwaURL } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : [
        { command: `E2E_AUTH_BYPASS=1 ADMIN_EMAIL=admin@e2e.test NEXT_DIST_DIR=.next-e2e npx next dev -p ${PORT}`, url: baseURL, reuseExistingServer: true, timeout: 120_000 },
        { command: `NEXT_DIST_DIR=.next-pwa npx next build && NEXT_DIST_DIR=.next-pwa npx next start -p ${PWA_PORT}`, url: pwaURL, reuseExistingServer: true, timeout: 300_000 },
      ],
});
