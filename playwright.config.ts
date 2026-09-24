import { defineConfig, devices } from "@playwright/test";

// mobile-first app → test on a phone viewport; runs against `next dev` (in-memory rooms, no Redis needed)
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { ...devices["Pixel 7"], baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
