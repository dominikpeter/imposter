import { defineConfig, devices } from "@playwright/test";

// mobile-first app → test on a phone viewport; runs against `next dev` (in-memory rooms, no Redis needed)
// or against a deployment: BASE_URL=https://… npm run e2e
// own port: `reuseExistingServer` must never pick up another app's dev server on :3000
const PORT = 3218;
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? undefined : 3,
  timeout: process.env.CI ? 30_000 : 60_000, // local runs share the laptop with other work // shared dev laptops: more parallel browsers starve one dev server
  use: { ...devices["Pixel 7"], baseURL, trace: "retain-on-failure" },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: `E2E_AUTH_BYPASS=1 ADMIN_EMAIL=admin@e2e.test NEXT_DIST_DIR=.next-e2e npx next dev -p ${PORT}`, url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
