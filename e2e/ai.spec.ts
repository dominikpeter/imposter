import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// Real OpenAI (gpt-6-luna) calls through the dev server: runs only when .env.local has a key.
const hasKey = existsSync(".env.local") && /^OPENAI_API_KEY=.+/m.test(readFileSync(".env.local", "utf8"));
test.skip(!hasKey, "no OPENAI_API_KEY in .env.local");
test.setTimeout(120_000);
const AI = { timeout: 30_000 };

async function write(page: Page, word: string) {
  await page.getByPlaceholder(/^Word/).fill(word);
  await page.getByRole("button", { name: "Done" }).click();
}

test("own words: autocorrect, too hard, duplicate cancels both, then AI explains a word", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Remove" }).last().click(); // Lisa, Nora, Tim
  await page.getByRole("button", { name: "Our own words" }).click();
  await page.getByRole("button", { name: "−" }).last().click(); // 1 word each
  await page.getByRole("button", { name: "Start game" }).click();

  // Lisa: typo → autocorrected, confirm
  await page.getByRole("button", { name: "Tap to write" }).click();
  await write(page, "Bananna");
  await expect(page.getByRole("status").filter({ hasText: "Autocorrected" })).toBeVisible(AI);
  await expect(page.getByPlaceholder(/^Word/)).toHaveValue("Banana");
  await page.getByRole("button", { name: "Done" }).click();

  // Nora: same word as Lisa → both cancelled, Nora writes another
  await expect(page.getByText("Nora", { exact: true })).toBeVisible(AI);
  await page.getByRole("button", { name: "Tap to write" }).click();
  await write(page, "banana");
  await expect(page.getByRole("status").filter({ hasText: "Someone already wrote this" })).toBeVisible(AI);
  await expect(page.getByPlaceholder(/^Word/)).toHaveValue("");
  await write(page, "Elephant");

  // Tim: far too obscure → rejected, then a normal word
  await expect(page.getByText("Tim", { exact: true })).toBeVisible(AI);
  await page.getByRole("button", { name: "Tap to write" }).click();
  await write(page, "Pneumonoultramicroscopicsilicovolcanoconiosis");
  await expect(page.getByRole("status").filter({ hasText: "Too hard" })).toBeVisible(AI);
  await write(page, "Moon");

  // Lisa comes back: her Banana was cancelled because Nora wrote it too
  await expect(page.getByText("Lisa", { exact: true })).toBeVisible(AI);
  await page.getByRole("button", { name: "Tap to write" }).click();
  await expect(page.getByText("Someone wrote the same word as you")).toBeVisible();
  await write(page, "Train");

  // round starts; the first crew card gets an AI explanation
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole("button", { name: "Tap to reveal" })).toBeVisible(AI);
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const word = page.getByTestId("word");
    await expect(word.or(page.getByText("IMPOSTER", { exact: true }))).toBeVisible();
    if (await word.isVisible()) {
      expect(["Elephant", "Moon", "Train"]).toContain(await word.innerText());
      await page.getByRole("button", { name: "Explain with AI" }).click();
      await expect(page.getByText(/\w{4,}.*\w{4,}/).filter({ hasNotText: /Explain|Hide/ }).last()).toBeVisible(AI);
      return;
    }
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
});

async function phone(browser: Browser) {
  return (await browser.newContext({ ...test.info().project.use })).newPage();
}

test("rooms: two phones write the same word → the first writer is asked for a new one", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Every phone/ }).click();
  await host.getByPlaceholder("Your name").fill("Lisa");
  await host.getByRole("button", { name: "Our own words" }).click();
  await host.getByRole("button", { name: "−" }).last().click();
  await host.getByRole("button", { name: /Create room/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{4}$/);
  const code = host.url().split("/").pop()!;
  const [nora, tim] = [await phone(browser), await phone(browser)];
  for (const [p, n] of [[nora, "Nora"], [tim, "Tim"]] as const) {
    await p.goto(`/r/${code}`);
    await p.getByPlaceholder("Your name").fill(n);
    await p.getByRole("button", { name: "Join" }).click();
  }
  await expect(host.getByRole("button", { name: /Start game/ })).toBeEnabled();
  await host.getByRole("button", { name: /Start game/ }).click();

  await expect(host.getByPlaceholder(/^Word/)).toBeVisible();
  await write(host, "Pizza");
  await expect(host.getByText(/Waiting for the others/)).toBeVisible(AI);

  await write(nora, "pizza");
  await expect(nora.getByRole("status").filter({ hasText: "Someone already wrote this" })).toBeVisible(AI);
  await expect(host.getByText("Someone wrote the same word as you")).toBeVisible(AI); // Lisa must write again
  await write(nora, "Rocket");
  await write(tim, "Castle");
  await write(host, "Guitar");
  for (const p of [host, nora, tim]) await expect(p.getByText("Keep your card secret!")).toBeVisible(AI);
});
