import { expect, test, type Browser, type Page } from "@playwright/test";

// each player is a separate browser context = a separate phone with its own localStorage
async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...test.info().project.use });
  return ctx.newPage();
}

async function joinAs(page: Page, code: string, name: string) {
  await page.goto(`/r/${code}`);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText(`${name} (you)`)).toBeVisible();
}

async function readCard(page: Page) {
  await page.getByRole("button", { name: "Tap to reveal" }).click();
  const imposter = page.getByText("IMPOSTER", { exact: true });
  const word = page.getByTestId("word");
  await expect(imposter.or(word)).toBeVisible();
  return (await imposter.isVisible()) ? null : word.innerText();
}

test("every phone: create, join by link, private cards, vote, result on all phones", async ({ browser }) => {
  const host = await phone(browser);
  await host.goto("/");
  await host.getByRole("button", { name: /Every phone/ }).click();
  await host.getByPlaceholder("Your name").fill("Lisa");
  await host.getByRole("button", { name: /Create room/ }).click();
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByAltText(`QR ${code}`)).toBeVisible();
  await expect(host.getByRole("button", { name: /at least 3 players/ })).toBeDisabled();

  const nora = await phone(browser);
  const tim = await phone(browser);
  await joinAs(nora, code.toLowerCase(), "Nora"); // lowercase link still works
  await joinAs(tim, code, "Tim");
  await expect(nora.getByText("Waiting for the host to start")).toBeVisible();

  const phones = [host, nora, tim];
  const names = ["Lisa", "Nora", "Tim"];
  await expect(host.getByRole("button", { name: /Start game/ })).toBeEnabled();
  await host.getByRole("button", { name: /Start game/ }).click();

  const cards = await Promise.all(phones.map(readCard));
  expect(cards.filter((c) => c === null)).toHaveLength(1);
  expect(new Set(cards.filter(Boolean)).size).toBe(1);
  const imp = cards.indexOf(null);

  // a late joiner is turned away
  const late = await phone(browser);
  await late.goto(`/r/${code}`);
  await expect(late.getByText("This game already started.")).toBeVisible();

  // everyone confirms they've seen their card → the discussion starts by itself
  for (const p of phones) await p.getByRole("button", { name: "I'm ready" }).click();
  for (const p of phones) await expect(p.getByText(/Word round 1/)).toBeVisible();
  // guided turns: exactly one phone says "Your turn!"; it hands over with Done
  await expect.poll(async () => (await Promise.all(phones.map((p) => p.getByText("Your turn!").count()))).reduce((a, b) => a + b)).toBe(1);
  await host.getByRole("button", { name: /Vote/ }).click();

  for (const [i, p] of phones.entries()) {
    await expect(p.getByRole("heading", { name: "Who is the imposter?" })).toBeVisible();
    await expect(p.getByRole("button", { name: names[i], exact: true })).toHaveCount(0); // can't vote for yourself
    const target = i === imp ? names[(imp + 1) % 3] : names[imp];
    await p.getByRole("button", { name: target, exact: true }).click();
  }

  for (const p of phones) {
    await expect(p.getByText("Caught!")).toBeVisible();
    await expect(p.getByText(cards.find(Boolean)!, { exact: true })).toBeVisible();
  }
  await expect(host.getByRole("button", { name: "Play again" })).toBeVisible();
  await expect(nora.getByText("The host continues")).toBeVisible();
});

test("unknown room code shows a clear message and a way back", async ({ page }) => {
  await page.goto("/r/QQQQ");
  await expect(page.getByText("Room not found. Check the code.")).toBeVisible();
  await page.getByRole("button", { name: /Back to start/ }).click();
  await expect(page).toHaveURL("/");
});
