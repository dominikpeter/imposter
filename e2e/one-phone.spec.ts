import { expect, test, type Page } from "@playwright/test";

const PLAYERS = ["Lisa", "Nora", "Tim", "Beni", "Domi"]; // app defaults

// reveal every card; returns the word per player, or null for imposters
async function revealAll(page: Page, n: number) {
  const seen: (string | null)[] = [];
  for (let i = 0; i < n; i++) {
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const imposter = page.getByText("IMPOSTER", { exact: true });
    const word = page.getByTestId("word");
    await expect(imposter.or(word)).toBeVisible();
    seen.push((await imposter.isVisible()) ? null : await word.innerText());
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
  return seen;
}

async function voteAll(page: Page, targets: string[]) {
  await page.getByRole("button", { name: /Vote/ }).click();
  for (const target of targets) {
    await page.getByRole("button", { name: "Tap to vote" }).click();
    await page.getByRole("button", { name: target, exact: true }).click();
  }
}

test("full round: one imposter, same word for the crew, vote catches the imposter", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  const seen = await revealAll(page, PLAYERS.length);

  const imposters = seen.flatMap((w, i) => (w === null ? [i] : []));
  expect(imposters).toHaveLength(1);
  expect(new Set(seen.filter(Boolean)).size).toBe(1);

  await expect(page.getByRole("heading", { name: "Discuss!" })).toBeVisible();
  const imp = imposters[0];
  await voteAll(page, PLAYERS.map((_, i) => PLAYERS[i === imp ? (imp + 1) % PLAYERS.length : imp]));

  await expect(page.getByText("Caught!")).toBeVisible();
  await expect(page.getByText(seen.find(Boolean)!, { exact: true })).toBeVisible();
});

test("a tie sends everyone back to discuss", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  await revealAll(page, PLAYERS.length);
  // Lisa→Nora, Nora→Lisa, Tim→Nora, Beni→Lisa, Domi→Tim  ⇒  2 : 2 : 1
  await voteAll(page, ["Nora", "Lisa", "Nora", "Lisa", "Tim"]);
  await expect(page.getByRole("heading", { name: "It's a tie!" })).toBeVisible();
  await expect(page.getByText("1 vote", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Discuss again/ }).click();
  await expect(page.getByRole("heading", { name: "Discuss!" })).toBeVisible();
});

test("own words: everyone writes, the author of the word is never the imposter", async ({ page }) => {
  await page.goto("/");
  // 3 players, 1 word each
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Remove" }).last().click();
  await page.getByRole("button", { name: "Our own words" }).click();
  await page.getByRole("button", { name: "−" }).last().click();
  await page.getByRole("button", { name: "Start game" }).click();

  const written = ["Apple", "Moon", "Train"];
  for (const w of written) {
    await page.getByRole("button", { name: "Tap to write" }).click();
    await page.getByPlaceholder(/^Word/).fill(w);
    await page.getByRole("button", { name: "Done" }).click();
  }
  const seen = await revealAll(page, 3);
  const word = seen.find(Boolean)!;
  const author = written.indexOf(word);
  expect(author).toBeGreaterThanOrEqual(0);
  expect(seen[author]).toBe(word); // the writer got the word, not the imposter card
  expect(seen.filter((s) => s === null)).toHaveLength(1);
});

test("reload mid-round resumes where we were", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  await revealAll(page, 1);
  await expect(page.getByText("Nora", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Pass the phone to")).toBeVisible();
  await expect(page.getByText("Nora", { exact: true })).toBeVisible();
});

test("quit asks first, then returns to setup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start game" }).click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: /Quit round/ }).click();
  await expect(page.getByText("Pass the phone to")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Quit round/ }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
});

test("languages switch everywhere", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Deutsch" }).click();
  await expect(page.getByRole("button", { name: "Spiel starten" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();
});

test("no horizontal scrolling on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  for (const lang of ["English", "Français", "Deutsch"]) {
    await page.getByRole("button", { name: lang }).click();
    for (const mode of [/Our own words|Nos propres|Eigene/, /Word packs|Packs de mots|Wortpakete/]) {
      await page.getByRole("button", { name: mode }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
  }
});
