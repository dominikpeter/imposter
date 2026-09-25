import { expect, test, type Page } from "@playwright/test";
import { CATEGORIES } from "../src/lib/i18n";

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

// language lives in the settings sheet
async function setLanguage(page: Page, label: string) {
  await page.getByRole("button", { name: /^(Settings|Réglages|Einstellungen)$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: /^(Close|Fermer|Schliessen)$/ }).click();
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

  await expect(page.getByText(/Word round 1/)).toBeVisible();
  const imp = imposters[0];
  await voteAll(page, PLAYERS.map((_, i) => PLAYERS[i === imp ? (imp + 1) % PLAYERS.length : imp]));

  await expect(page.getByText("Caught!")).toBeVisible();
  await expect(page.getByText(seen.find(Boolean)!, { exact: true })).toBeVisible();

  // end-of-round stats: 1 round, crew won, every crew member scored 1 point
  const stats = page.getByRole("region", { name: "Game stats" });
  await expect(stats).toBeVisible();
  await expect(stats.getByText("Crew · 100%")).toBeVisible();
  await expect(stats.getByText("Most suspected").first()).toBeVisible();
  await stats.getByText("All numbers").click();
  await expect(stats.getByRole("row")).toHaveCount(PLAYERS.length + 1);
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
  await expect(page.getByText(/Word round 1/)).toBeVisible();
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

test("settings: color theme and dark mode stick after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Forest/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Dark/ }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "forest");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Light / dark" }).click(); // quick toggle in the header
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("languages switch everywhere", async ({ page }) => {
  await page.goto("/");
  await setLanguage(page, "Deutsch");
  await expect(page.getByRole("button", { name: "Spiel starten" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await setLanguage(page, "Français");
  await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();
});

test("word language: English app, German words", async ({ page }) => {
  const german = new Set(CATEGORIES.flatMap((c) => c.words.map((w) => w.de)));
  await page.goto("/");
  await page.getByRole("button", { name: "Deutsch", exact: true }).click(); // word language, not the app language
  await page.getByRole("button", { name: "Start game" }).click();
  const words = (await revealAll(page, 5)).filter((w): w is string => w !== null);
  expect(words.length).toBeGreaterThan(0);
  for (const w of words) expect(german, `"${w}" is not a German pack word`).toContain(w);
  await expect(page.locator("html")).toHaveAttribute("lang", "en"); // the app itself stays English
});

test("no horizontal scrolling on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  for (const lang of ["English", "Français", "Deutsch"]) {
    await setLanguage(page, lang);
    for (const mode of [/Our own words|Nos propres|Eigene/, /Word packs|Packs de mots|Wortpakete/]) {
      await page.getByRole("button", { name: mode }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
  }
});

test("joker mode: a surviving imposter earns a joker and later sees the word hint", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Remove" }).last().click(); // Lisa, Nora, Tim
  const three = PLAYERS.slice(0, 3);
  await expect(page.getByRole("checkbox", { name: /Joker mode/ })).toBeDisabled(); // clue is on by default
  await page.getByText("Imposter gets a clue").click();
  await page.getByText("Joker mode").click();
  await page.getByRole("button", { name: "Start game" }).click();

  const seen = await revealAll(page, 3);
  const imp = seen.indexOf(null);
  const innocent = (imp + 1) % 3;
  // everyone blames an innocent player → the imposter survives
  await voteAll(page, three.map((_, i) => three[i === innocent ? (innocent + 1) % 3 : innocent]));
  await expect(page.getByText("earned a joker!")).toBeVisible();
  await expect(page.getByText(`${three[imp]} earned a joker!`)).toBeVisible();

  // skip votes (no new jokers) until the joker holder is the imposter again
  for (let round = 0; round < 40; round++) {
    await page.getByRole("button", { name: "Play again" }).click();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Tap to reveal" }).click();
      const imposterCard = page.getByText("IMPOSTER", { exact: true });
      await expect(imposterCard.or(page.getByTestId("word"))).toBeVisible();
      if (i === imp && (await imposterCard.isVisible())) {
        await expect(page.getByText("Joker hint")).toBeVisible();
        await expect(page.getByText(/^[A-ZÄÖÜ](\s[_\s-]*)+$/)).toBeVisible(); // "S _ _ _ _"
        return;
      }
      await expect(page.getByText("Joker hint")).toHaveCount(0);
      await page.getByRole("button", { name: /Hide & pass on/ }).click();
    }
    await page.getByRole("button", { name: "Reveal without voting" }).click();
  }
  throw new Error("joker holder never became imposter");
});
