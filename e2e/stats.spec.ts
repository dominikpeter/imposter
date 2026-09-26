import { expect, test } from "@playwright/test";

// Stats drill-down (Stats.tsx): tap a player for their rates, rivals and points per round; tap a round for the word,
// the imposter, who got accused and every vote. Plus the "report a problem" link in Settings.
const NAMES = ["Lisa", "Nora", "Tim", "Beni"];

test("stats: open a player and a round for the details", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  let imposter = -1;
  let word = "";
  for (let i = 0; i < NAMES.length; i++) {
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const card = page.getByText("IMPOSTER", { exact: true });
    await expect(card.or(page.getByTestId("word"))).toBeVisible();
    if (await card.isVisible()) imposter = i;
    else word = (await page.getByTestId("word").textContent())!.trim();
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
  // everyone votes the imposter (the imposter votes the next player): the crew wins
  await page.getByRole("button", { name: /^Vote/ }).click();
  for (let i = 0; i < NAMES.length; i++) {
    await page.getByRole("button", { name: "Tap to vote" }).click();
    await page.getByRole("button", { name: NAMES[i === imposter ? (imposter + 1) % NAMES.length : imposter], exact: true }).click();
  }
  await expect(page.getByText("Caught!")).toBeVisible();

  const stats = page.getByRole("region", { name: "Game stats" });
  const crew = NAMES[(imposter + 1) % NAMES.length];
  // a crew member: 1 of 1 right, never imposter, +1 in round 1
  await stats.locator("summary").filter({ hasText: crew }).click();
  const player = stats.locator("details[open]").filter({ hasText: "Right votes as crew" });
  await expect(player.getByText("100% (1/1)")).toBeVisible();
  await expect(player.getByText("1: +1")).toBeVisible();
  await expect(player.getByText(`${NAMES[imposter]} (1×)`).first()).toBeVisible();

  // the round: word, caught, the imposter and all four votes
  await stats.locator("summary").filter({ hasText: word }).click();
  const round = stats.locator("details[open]").filter({ hasText: "Accused" });
  await expect(round.getByText("Caught", { exact: true })).toBeVisible();
  await expect(round.getByRole("list", { name: "votes" }).getByRole("listitem")).toHaveCount(4);
  await expect(round.getByText(`${crew} → ${NAMES[imposter]}`)).toBeVisible();
});

test("settings links to GitHub issues for problems", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("link", { name: /Problem with the app/ })).toHaveAttribute("href", "https://github.com/dominikpeter/imposter/issues");
});
