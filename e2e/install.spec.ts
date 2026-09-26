import { expect, test } from "@playwright/test";

// The "add to home screen" banner. beforeinstallprompt only fires in Chrome once install criteria are met,
// so the test dispatches it; the component's own gate (phone viewport, not dismissed, not installed) is real.
const fireInstallPrompt = () =>
  window.dispatchEvent(
    Object.assign(new Event("beforeinstallprompt"), { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: "dismissed" }) }),
  );

test("install banner: appears on a phone, installs or dismisses, and stays gone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).waitFor(); // hydrated: the listener is attached
  await page.evaluate(fireInstallPrompt);
  const banner = page.getByRole("dialog", { name: /home screen/i });
  await expect(banner).toBeVisible();

  await banner.getByRole("button", { name: "Not now" }).click();
  await expect(banner).toBeHidden();

  // dismissal is remembered: after a reload the event no longer brings it back
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).waitFor();
  await page.evaluate(fireInstallPrompt);
  await expect(page.getByRole("dialog", { name: /home screen/i })).toHaveCount(0);
});
