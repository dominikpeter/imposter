import { expect, test } from "@playwright/test";

// The "add to home screen" banner. beforeinstallprompt only fires in Chrome once install criteria are met,
// so the test dispatches it; the component's own gate (phone viewport, not dismissed, not installed) is real.
const fireInstallPrompt = () =>
  window.dispatchEvent(
    Object.assign(new Event("beforeinstallprompt"), { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: "dismissed" }) }),
  );

test("install banner: appears on a phone, doesn't cover the Start game button, and can be dismissed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).waitFor(); // hydrated: the listener is attached
  await page.evaluate(fireInstallPrompt);
  const banner = page.getByRole("dialog", { name: /home screen/i });
  await expect(banner).toBeVisible();

  // it sits above the fold, in the normal page flow — never as a bottom sheet hiding the primary CTA
  const startGame = page.getByRole("button", { name: "Start game" });
  await expect(startGame).toBeVisible();
  const [bannerBox, buttonBox] = [await banner.boundingBox(), await startGame.boundingBox()];
  expect(bannerBox && buttonBox && bannerBox.y + bannerBox.height <= buttonBox.y).toBe(true);

  await banner.getByRole("button", { name: "Not now" }).click();
  await expect(banner).toBeHidden();

  // dismissal is remembered: after a reload the event no longer brings it back
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).waitFor();
  await page.evaluate(fireInstallPrompt);
  await expect(page.getByRole("dialog", { name: /home screen/i })).toHaveCount(0);
});

test("install banner: shown once ever, even if the player never taps Add or Not now", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).waitFor();
  await page.evaluate(fireInstallPrompt);
  await expect(page.getByRole("dialog", { name: /home screen/i })).toBeVisible();

  // closed the tab without deciding (no click at all) — a later visit must not show it again
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).waitFor();
  await page.evaluate(fireInstallPrompt);
  await expect(page.getByRole("dialog", { name: /home screen/i })).toHaveCount(0);
});
