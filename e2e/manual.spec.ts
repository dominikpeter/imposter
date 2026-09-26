import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// Regenerates the screenshots in docs/manual/ (`just manual-shots`). Not part of the normal e2e run.
test.skip(!process.env.MANUAL_SHOTS, "run with `just manual-shots`");
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
test.setTimeout(180_000);

const DIR = "docs/manual";
const NAMES = ["Lisa", "Nora", "Tim", "Beni"];
const hasAiKey = existsSync(".env.local") && /^(OPENAI|OPENROUTER)_API_KEY=.+/m.test(readFileSync(".env.local", "utf8"));
const settle = (p: Page) => p.waitForTimeout(1600); // entrance animations and the card fan
const shot = async (p: Page, name: string) => {
  await settle(p);
  await p.screenshot({ path: `${DIR}/${name}.png` });
};

// reveal cards until both a crew card and the imposter card were photographed; returns the imposter's seat
async function revealAll(page: Page) {
  let imp = -1;
  let word = false;
  for (let i = 0; i < NAMES.length; i++) {
    if (i === 0) await shot(page, "03-pass");
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const card = page.getByText("IMPOSTER", { exact: true });
    await expect(card.or(page.getByTestId("word"))).toBeVisible();
    if (await card.isVisible()) {
      imp = i;
      await shot(page, "05-imposter");
    } else if (!word) {
      word = true;
      await shot(page, "04-word");
    }
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
  return imp;
}

test("one phone: setup, cards, discussion, vote, result, stats, settings", async ({ page }) => {
  await page.goto("/");
  await shot(page, "01-setup");
  const words = page.locator("section").filter({ has: page.getByRole("heading", { name: "Words" }) });
  await words.scrollIntoViewIfNeeded();
  await settle(page);
  await words.screenshot({ path: `${DIR}/02-topics.png` });

  const rules = page.locator("section").filter({ hasText: "Joker mode" });
  await page.getByText("Imposter gets a clue").click();
  await page.getByText("Joker mode").click();
  await rules.scrollIntoViewIfNeeded();
  await settle(page);
  await rules.screenshot({ path: `${DIR}/11-joker-setting.png` });
  await page.getByText("Joker mode").click(); // back to the defaults for the round
  await page.getByText("Imposter gets a clue").click();

  await page.getByRole("button", { name: "Start game" }).click();
  const imp = await revealAll(page);
  await shot(page, "06-discuss");
  await page.getByRole("button", { name: /Vote/ }).click();
  for (let i = 0; i < NAMES.length; i++) {
    await page.getByRole("button", { name: "Tap to vote" }).click();
    if (i === 0) await shot(page, "07-vote");
    await page.getByRole("button", { name: NAMES[i === imp ? (imp + 1) % NAMES.length : imp], exact: true }).click();
  }
  await page.evaluate(() => scrollTo(0, 0));
  await shot(page, "08-result");
  const stats = page.getByRole("region", { name: "Game stats" });
  await stats.scrollIntoViewIfNeeded();
  await settle(page);
  await stats.screenshot({ path: `${DIR}/09-stats.png` });

  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole("button", { name: "Settings" }).click();
  await shot(page, "10-settings");
});

test("every phone: create, join, lobby, card", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Every phone/ }).click();
  await page.getByPlaceholder("Your name").fill("Lisa");
  await shot(page, "14-create");
  await page.getByRole("button", { name: /Create room/ }).click();
  await page.waitForURL(/\/r\//);
  const code = page.url().split("/").pop()!;
  for (const n of ["Nora", "Tim"]) await page.request.post(`/api/rooms/${code}`, { data: { type: "join", name: n } });
  await expect(page.getByText("Tim", { exact: true })).toBeVisible({ timeout: 5000 });
  await shot(page, "16-lobby");

  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 })).newPage();
  await guest.goto(`/r/${code}`);
  await guest.getByPlaceholder("Your name").fill("Beni");
  await shot(guest, "15-join");

  await page.getByRole("button", { name: /Start game/ }).click();
  await page.getByRole("button", { name: "Tap to reveal" }).click();
  await shot(page, "17-room-card");
});

test("AI: autocorrect and explain (signed in, real OpenAI)", async ({ browser }) => {
  test.skip(!hasAiKey, "no AI key (OPENROUTER_API_KEY or OPENAI_API_KEY) in .env.local");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, extraHTTPHeaders: { "x-e2e-user": "Tester" } });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Remove" }).last().click(); // Lisa, Nora, Tim
  await page.getByRole("button", { name: "Our own words" }).click();
  await page.getByRole("button", { name: "−" }).last().click(); // 1 word each
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Tap to write" }).click();
  await page.getByPlaceholder(/^Word/).fill("Bananna");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Autocorrected" })).toBeVisible({ timeout: 30_000 });
  await shot(page, "12-autocorrect");
  await page.getByRole("button", { name: "Done" }).click(); // accept "Banana"

  for (const w of ["Guitar", "Volcano"]) {
    await page.getByRole("button", { name: "Tap to write" }).click();
    await page.getByPlaceholder(/^Word/).fill(w);
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Done" }).click({ timeout: 30_000 }).catch(() => {}); // confirm if the AI adjusted it
  }
  // reveal until a crew card, then explain it
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    if (await page.getByTestId("word").isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Explain with AI" }).click();
      await expect(page.locator("p.pop")).toBeVisible({ timeout: 30_000 });
      await shot(page, "13-explain");
      return;
    }
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
});
