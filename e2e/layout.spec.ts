import { expect, test, type Page } from "@playwright/test";

// Every screen on real phone sizes: no sideways scrolling, and a screenshot per screen in test-results/layout/ for review.
const SIZES = [
  { name: "320-small", width: 320, height: 568 }, // iPhone SE (1st gen), smallest still in use
  { name: "360-android", width: 360, height: 740 }, // Galaxy S8/S9 class
  { name: "375-se", width: 375, height: 667 }, // iPhone SE 2/3
  { name: "390-iphone", width: 390, height: 844 }, // iPhone 13–15
  { name: "430-promax", width: 430, height: 932 }, // iPhone Pro Max
  { name: "412-android-large", width: 412, height: 915 }, // Galaxy S20+/Pixel XL class
  { name: "844-landscape", width: 844, height: 390 }, // phone turned sideways
  { name: "768-tablet", width: 768, height: 1024 }, // iPad portrait
  { name: "1280-desktop", width: 1280, height: 800 }, // laptop
];
const NAMES = ["Lisa", "Nora", "Tim", "Beni"]; // app defaults

for (const size of SIZES) {
  test(`every screen fits: ${size.name}`, async ({ page, browser }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(size);
    const check = async (p: Page, screen: string, fullPage = false) => {
      await p.waitForTimeout(700); // let entrance animations settle
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      expect(sw, `${screen} scrolls sideways`).toBeLessThanOrEqual(size.width);
      // pill buttons: icon and label on one line (a non-flex button once stacked the icon above its label)
      const stacked = await p.evaluate(() =>
        [...document.querySelectorAll("button.rounded-full")].flatMap((b) => {
          const icon = b.querySelector(":scope > svg, :scope > span > svg");
          const r = b.getBoundingClientRect();
          if (!icon || !b.textContent?.trim() || !r.height || getComputedStyle(b).visibility === "hidden") return [];
          const i = icon.getBoundingClientRect();
          return Math.abs(i.top + i.height / 2 - (r.top + r.height / 2)) > 8 ? [b.textContent.trim()] : [];
        }),
      );
      expect(stacked, `${screen}: icon not beside its label`).toEqual([]);
      await p.screenshot({ path: `test-results/layout/${size.name}/${screen}.png`, fullPage });
    };

    await page.goto("/");
    await check(page, "01-setup", true);
    await page.getByRole("button", { name: "Settings" }).click();
    await check(page, "02-settings");
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Start game" }).click();
    await check(page, "03-pass");
    let imp = -1;
    for (let i = 0; i < NAMES.length; i++) {
      await page.getByRole("button", { name: "Tap to reveal" }).click();
      const card = page.getByText("IMPOSTER", { exact: true });
      await expect(card.or(page.getByTestId("word"))).toBeVisible();
      if (await card.isVisible()) {
        imp = i;
        await check(page, "05-imposter");
      } else if (i === (imp === 0 ? 1 : 0)) await check(page, "04-word");
      await page.getByRole("button", { name: /Hide & pass on/ }).click();
    }
    await check(page, "06-discuss");
    await page.getByRole("button", { name: /^Done/ }).click();
    await check(page, "07-turn-2");
    await page.getByRole("button", { name: /Vote/ }).click();
    for (let i = 0; i < NAMES.length; i++) {
      await page.getByRole("button", { name: "Tap to vote" }).click();
      if (i === 0) await check(page, "08-vote");
      await page.getByRole("button", { name: NAMES[i === imp ? (imp + 1) % NAMES.length : imp], exact: true }).click();
    }
    await check(page, "09-result", true);

    // online: create screen, lobby with settings, join screen
    await page.getByRole("button", { name: "Change setup" }).click();
    await page.getByRole("button", { name: /Every phone/ }).click();
    await page.getByPlaceholder("Your name").fill("Lisa");
    await check(page, "10-online-create", true);
    await page.getByRole("button", { name: /Create room/ }).click();
    await page.waitForURL(/\/r\//);
    const code = page.url().split("/").pop()!;
    for (const n of ["Nora", "Tim"]) await page.request.post(`/api/rooms/${code}`, { data: { type: "join", name: n } });
    await expect(page.getByText("Tim", { exact: true })).toBeVisible({ timeout: 5000 });
    await check(page, "11-lobby", true);
    const guest = await (await browser.newContext({ viewport: size })).newPage();
    await guest.goto(`/r/${code}`);
    await check(guest, "12-join");
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    await check(page, "13-room-card");
    await page.getByRole("button", { name: "I'm ready" }).click();
    await check(page, "14-room-waiting-ready");
  });
}
