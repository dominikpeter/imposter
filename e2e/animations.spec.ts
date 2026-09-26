import { expect, test, type Page } from "@playwright/test";

// The verdict's animations (Verdict.tsx + globals.css): confetti and the party popper when the crew catches the
// imposter, the sneaking mask when an imposter gets away, and none of it moving under prefers-reduced-motion.
const NAMES = ["Lisa", "Nora", "Tim", "Beni"];

/** One round on one phone with the 4 default players; everyone votes the imposter (crew wins) or a crew member. */
async function playRound(page: Page, crewWins: boolean) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  let imposter = -1;
  for (let i = 0; i < NAMES.length; i++) {
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const card = page.getByText("IMPOSTER", { exact: true });
    await expect(card.or(page.getByTestId("word"))).toBeVisible();
    if (await card.isVisible()) imposter = i;
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
  await page.getByRole("button", { name: /^Vote/ }).click();
  const target = crewWins ? imposter : (imposter + 1) % NAMES.length;
  for (let i = 0; i < NAMES.length; i++) {
    await page.getByRole("button", { name: "Tap to vote" }).click();
    // nobody can vote for themselves: the accused votes for whoever comes next
    const pick = i === target ? (target + 1) % NAMES.length : target;
    await page.getByRole("button", { name: NAMES[pick], exact: true }).click();
  }
}

const animation = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

test("crew catches the imposter: confetti and the party popper", async ({ page }) => {
  await playRound(page, true);
  await expect(page.getByText("Caught!")).toBeVisible();
  await expect(page.locator(".confetti > i")).toHaveCount(26);
  expect(await animation(page, ".confetti > i")).toBe("confetti");
  expect(await animation(page, ".tada")).toBe("tada");
  await expect(page.locator(".sneak")).toHaveCount(0);
});

test("imposter gets away: the mask sneaks off, no confetti", async ({ page }) => {
  await playRound(page, false);
  await expect(page.getByText("Wrong one!")).toBeVisible();
  expect(await animation(page, ".sneak")).toBe("sneak");
  await expect(page.locator(".confetti")).toHaveCount(0);
});

test("reduced motion: nothing moves, the confetti stays invisible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await playRound(page, true);
  await expect(page.getByText("Caught!")).toBeVisible();
  expect(await animation(page, ".confetti > i")).toBe("none");
  expect(await page.locator(".confetti > i").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
  expect(await animation(page, ".tada")).toBe("none");
});

test("reduced motion: the escaping mask stays still too", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await playRound(page, false);
  await expect(page.getByText("Wrong one!")).toBeVisible();
  expect(await animation(page, ".sneak")).toBe("none");
});
