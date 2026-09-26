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
  await host.waitForURL(/\/r\/[A-Z0-9]{5,6}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByAltText(`QR ${code}`)).toBeVisible();
  // WhatsApp: opens a chat with the invite text and this room's link
  const wa = new URL((await host.getByRole("link", { name: "WhatsApp" }).getAttribute("href"))!);
  expect(wa.host).toBe("wa.me");
  expect(wa.searchParams.get("text")).toMatch(new RegExp(`^Join my Imposter game! Room ${code} https?://.+/r/${code}$`));
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
    await expect(p.getByTestId("result-word")).toHaveText(cards.find(Boolean)!);
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

test("early voting: pick and change a suspect while talking; the result shows how the votes moved", async ({ browser, request }) => {
  const addr = { "x-real-ip": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const host = await (await request.post("/api/rooms", { data: { name: "Lisa", settings: { earlyVote: true } }, headers: addr })).json();
  const ids = [host];
  for (const name of ["Nora", "Tim"]) ids.push(await (await request.post(`/api/rooms/${host.code}`, { data: { type: "join", name }, headers: addr })).json());
  const act = (i: number, a: object) => request.post(`/api/rooms/${host.code}`, { data: { ...ids[i], ...a }, headers: addr });
  const seat = async (i: number) => (await (await request.get(`/api/rooms/${host.code}`, { headers: { "x-pid": ids[i].pid, "x-token": ids[i].token } })).json()).me as number;
  const seats = await Promise.all([0, 1, 2].map(seat));
  const byName = ["Lisa", "Nora", "Tim"];
  await act(0, { type: "start" });
  await act(0, { type: "discuss" });

  const phone = await (await browser.newContext({ ...test.info().project.use, extraHTTPHeaders: addr })).newPage();
  await phone.addInitScript(([k, v]) => localStorage.setItem(k, v), [`imposter:room:${host.code}`, JSON.stringify(ids[0])] as const);
  await phone.goto(`/r/${host.code}`);
  const picker = phone.getByRole("region", { name: "Your suspect" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: "Lisa" })).toHaveCount(0); // never yourself
  await picker.getByRole("button", { name: "Nora" }).click();
  await expect(picker.getByRole("button", { name: "Nora" })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: "Tim" }).click(); // changed my mind
  await expect(picker.getByRole("button", { name: "Tim" })).toHaveAttribute("aria-pressed", "true");
  await expect(picker.getByRole("button", { name: "Nora" })).toHaveAttribute("aria-pressed", "false");
  await act(1, { type: "lean", target: seats[0] });

  await act(0, { type: "startVote" });
  for (const [i, target] of [[0, 2], [1, 2], [2, 0]] as const) await act(i, { type: "vote", target: seats[target] });
  const chart = phone.getByRole("region", { name: "How the votes moved" });
  await expect(chart).toBeVisible({ timeout: 10_000 });
  for (const n of byName) await expect(chart.getByRole("listitem").filter({ hasText: n })).toHaveCount(1);
  await expect(chart.getByLabel("Imposter")).toHaveCount(1); // the real imposter is marked in the legend
  await chart.screenshot({ path: "test-results/vote-timeline.png" }); // for a look at the chart
});
