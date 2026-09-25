import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Automated accessibility check (axe-core, WCAG 2.1 A/AA) on every main screen, light and dark.
const NAMES = ["Lisa", "Nora", "Tim", "Beni"];

async function audit(page: Page, screen: string) {
  await page.waitForTimeout(900); // entrance animations: axe reads colours mid-fade as low contrast
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ")}`);
  expect(summary, `${screen}`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test(`one phone, every screen (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/");
    await audit(page, "setup");
    await page.getByRole("button", { name: "Settings" }).click();
    await audit(page, "settings");
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Start game" }).click();
    await audit(page, "pass");
    let imp = -1;
    for (let i = 0; i < NAMES.length; i++) {
      await page.getByRole("button", { name: "Tap to reveal" }).click();
      const card = page.getByText("IMPOSTER", { exact: true });
      await expect(card.or(page.getByTestId("word"))).toBeVisible();
      if (await card.isVisible()) imp = i;
      await audit(page, imp === i ? "imposter card" : "word card");
      await page.getByRole("button", { name: /Hide & pass on/ }).click();
    }
    await audit(page, "discuss");
    await page.getByRole("button", { name: /Vote/ }).click();
    for (let i = 0; i < NAMES.length; i++) {
      await page.getByRole("button", { name: "Tap to vote" }).click();
      if (i === 0) await audit(page, "vote");
      await page.getByRole("button", { name: NAMES[i === imp ? (imp + 1) % NAMES.length : imp], exact: true }).click();
    }
    await audit(page, "result + stats");
  });

  test(`rooms: create, lobby, card (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: /Every phone/ }).click();
    await page.getByPlaceholder("Your name").fill("Lisa");
    await audit(page, "create");
    await page.getByRole("button", { name: /Create room/ }).click();
    await page.waitForURL(/\/r\//);
    const code = page.url().split("/").pop()!;
    for (const n of ["Nora", "Tim"]) await page.request.post(`/api/rooms/${code}`, { data: { type: "join", name: n } });
    await expect(page.getByText("Tim", { exact: true })).toBeVisible();
    await audit(page, "lobby");
    await page.getByRole("button", { name: /Start game/ }).click();
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    await audit(page, "room card");
  });
}
