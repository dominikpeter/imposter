import { expect, test } from "@playwright/test";

// Installable app + offline one-phone game (the e2e server registers the service worker via NEXT_PUBLIC_SW=1).
test("manifest makes it installable", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m).toMatchObject({ short_name: "Imposter", start_url: "/", display: "standalone", scope: "/" });
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-store"); // updates always reach installed apps
});

test("works offline: the start screen loads and a one-phone game can be played", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // now controlled by the service worker: this load fills its cache
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  await page.waitForTimeout(500);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Imposter", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Tap to reveal" }).click();
  await expect(page.getByText("IMPOSTER", { exact: true }).or(page.getByTestId("word"))).toBeVisible();
  await context.setOffline(false);
});
