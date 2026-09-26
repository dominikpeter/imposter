import { CATEGORIES } from "../src/lib/i18n";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

// Feature-list audit: flows the other specs don't cover. Rooms are set up through the API to keep this fast;
// every test uses its own fake client IP (x-real-ip) so the per-IP rate limits never leak between tests.

test.describe.configure({ timeout: 60_000 }); // many full rounds and several phones per test

const PLAYERS = ["Lisa", "Nora", "Tim", "Beni"]; // app defaults
const ip = () => `10.${rnd()}.${rnd()}.${rnd()}`;
const rnd = () => Math.floor(Math.random() * 250) + 1;

type Id = { pid: string; token: string };
type Card = null | { imposter: true } | { imposter: false; word: string | Record<string, string> };

// ---------- one phone ----------

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

// everyone accuses the imposter (the imposter accuses the next player)
const catchVotes = (names: string[], imp: number) => names.map((_, i) => names[i === imp ? (imp + 1) % names.length : imp]);

async function threePlayers(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Remove" }).last().click(); // Lisa, Nora, Tim
}

// the imposters / rounds steppers are the first two on the setup screen
const stepper = (page: Page, sign: "−" | "+", n: 0 | 1) => page.getByRole("button", { name: sign, exact: true }).nth(n);

test("two imposters: both get the imposter card and neither learns who the other one is", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("1–2")).toBeVisible(); // at most half of 5 players
  await stepper(page, "+", 0).click();
  await expect(stepper(page, "+", 0)).toBeDisabled();
  await page.getByRole("button", { name: "Start game" }).click();
  for (let i = 0; i < PLAYERS.length; i++) {
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const card = page.locator(".imposter-back");
    if (await page.getByText("IMPOSTER", { exact: true }).isVisible()) {
      for (const other of PLAYERS) await expect(card).not.toContainText(other);
    }
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
  await page.getByRole("button", { name: "Reveal without voting" }).click();
  await expect(page.getByText("The imposters were")).toBeVisible();
});

test("guided turns: Done hands over in order, then another round of words", async ({ page }) => {
  await threePlayers(page);
  await page.getByRole("button", { name: "Start game" }).click();
  await revealAll(page, 3);
  await expect(page.getByText("Word round 1")).toBeVisible();
  await expect(page.getByText("Round 1 / 5")).toBeVisible();
  const order = await page.getByRole("list", { name: "Discuss" }).getByRole("listitem").allInnerTexts();
  expect(order.map((s) => s.trim()).sort()).toEqual(["Lisa", "Nora", "Tim"]);
  for (let k = 0; k < 3; k++) {
    await expect(page.getByRole("heading", { name: `${order[k].trim()}'s turn` })).toBeVisible();
    const label = k < 2 ? `Done · Next: ${order[k + 1].trim()}` : "Done";
    await page.getByRole("button", { name: label, exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Everyone said a word" })).toBeVisible();
  await page.getByRole("button", { name: /Another round of words/ }).click();
  await expect(page.getByText("Word round 2")).toBeVisible();
  await expect(page.getByRole("heading", { name: `${order[0].trim()}'s turn` })).toBeVisible();
});

test("imposter guess: a caught imposter who names the word still wins", async ({ page }) => {
  await threePlayers(page);
  await page.getByText("Imposter can guess").click();
  await page.getByRole("button", { name: "Start game" }).click();
  const seen = await revealAll(page, 3);
  const imp = seen.indexOf(null);
  const names = PLAYERS.slice(0, 3);
  await voteAll(page, catchVotes(names, imp));

  await expect(page.getByText(`Give the phone to ${names[imp]}`)).toBeVisible();
  await page.getByRole("button", { name: names[imp], exact: true }).click();
  await expect(page.getByRole("heading", { name: "You've been caught!" })).toBeVisible();
  await page.getByPlaceholder("The word is…").fill(` ${seen.find(Boolean)!.toLowerCase()} `); // case and spaces don't matter
  await page.getByRole("button", { name: "Guess", exact: true }).click();

  await expect(page.getByText("Guessed it!")).toBeVisible();
  await expect(page.getByText(`${names[imp]} named the word. The imposters win!`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Game stats" }).getByText("Imposters · 100%")).toBeVisible();
});

test("imposter guess: a wrong guess means the crew wins", async ({ page }) => {
  await threePlayers(page);
  await page.getByText("Imposter can guess").click();
  await page.getByRole("button", { name: "Start game" }).click();
  const seen = await revealAll(page, 3);
  const imp = seen.indexOf(null);
  const names = PLAYERS.slice(0, 3);
  await voteAll(page, catchVotes(names, imp));
  await page.getByRole("button", { name: names[imp], exact: true }).click();
  await page.getByPlaceholder("The word is…").fill("Xylophonezzz");
  await page.getByRole("button", { name: "Guess", exact: true }).click();
  await expect(page.getByText("Caught!")).toBeVisible();
  await expect(page.getByText(`${names[imp]} guessed “Xylophonezzz”: wrong!`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Game stats" }).getByText("Crew · 100%")).toBeVisible();
});

test("rounds per game: after the last round it's game over with a winner, New game starts fresh", async ({ page }) => {
  await threePlayers(page);
  for (let i = 0; i < 3; i++) await stepper(page, "−", 1).click(); // 5 → 2 rounds
  await page.getByRole("button", { name: "Start game" }).click();
  for (let round = 1; round <= 2; round++) {
    const seen = await revealAll(page, 3);
    await expect(page.getByText(`Round ${round} / 2`)).toBeVisible();
    await voteAll(page, catchVotes(PLAYERS.slice(0, 3), seen.indexOf(null)));
    if (round === 1) await page.getByRole("button", { name: "Play again · Round 2/2" }).click();
  }
  await expect(page.getByText("Game over!")).toBeVisible();
  await expect(page.getByText(/ wins? the game!$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Play again/ })).toHaveCount(0);
  await page.getByRole("button", { name: "New game" }).click();
  await revealAll(page, 3);
  await expect(page.getByText("Round 1 / 2")).toBeVisible(); // stats were reset
});

test("rounds per game: a new setup after game over starts again at round 1", async ({ page }) => {
  // BUG: "Change setup" keeps the finished game's history, and starting from setup never clears it
  // (src/app/page.tsx:765 and start() at :169). The discuss screen then shows "Round 2 / 1" and
  // the very first round of the new game already ends with "Game over!".
  await threePlayers(page);
  for (let i = 0; i < 4; i++) await stepper(page, "−", 1).click(); // 1 round
  await page.getByRole("button", { name: "Start game" }).click();
  await revealAll(page, 3);
  await page.getByRole("button", { name: "Reveal without voting" }).click();
  await expect(page.getByText("Game over!")).toBeVisible();
  await page.getByRole("button", { name: "Change setup" }).click();
  await page.getByRole("button", { name: "Start game" }).click();
  await revealAll(page, 3);
  await expect(page.getByText("Round 1 / 1")).toBeVisible({ timeout: 3000 });
});

test("skip vote and reset stats", async ({ page }) => {
  await threePlayers(page);
  await page.getByRole("button", { name: "Start game" }).click();
  await revealAll(page, 3);
  await page.getByRole("button", { name: "Reveal without voting" }).click();
  // no verdict, just the reveal
  await expect(page.getByText("Caught!")).toHaveCount(0);
  await expect(page.getByText("Wrong one!")).toHaveCount(0);
  await expect(page.getByText("The imposter was")).toBeVisible();
  const stats = page.getByRole("region", { name: "Game stats" });
  await expect(stats).toBeVisible();
  await page.getByRole("button", { name: "Play again · Round 2/5" }).click();
  const seen = await revealAll(page, 3);
  await voteAll(page, catchVotes(PLAYERS.slice(0, 3), seen.indexOf(null)));
  await expect(stats.getByText("Crew · 100%")).toBeVisible(); // the skipped round counts for neither side
  await stats.getByRole("button", { name: /Reset stats/ }).click();
  await expect(stats).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play again · Round 1/5" })).toBeVisible();
});

test("topics: A–Z tiles, first 8 then 'More topics', All topics toggles every topic", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("27 / 27")).toBeVisible();
  const allBtn = page.getByRole("button", { name: "All topics" });
  await expect(allBtn).toHaveAttribute("aria-pressed", "true");
  const tiles = page.locator(".grid-cols-tiles").getByRole("button");
  await expect(tiles).toHaveCount(8);
  const first = (await tiles.allInnerTexts()).map((s) => s.trim());
  expect(first).toEqual([...first].sort((a, b) => a.localeCompare(b, "en")));
  await page.getByRole("button", { name: "More topics (+19)" }).click();
  await expect(tiles).toHaveCount(27);
  const names = (await tiles.allInnerTexts()).map((s) => s.trim());
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  expect(names).toContain("Nerd");

  await allBtn.click();
  await expect(page.getByText("0 / 27")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pick a topic" })).toBeDisabled();
  await page.getByRole("button", { name: "Nerd" }).click();
  await expect(page.getByText("1 / 27")).toBeVisible();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByRole("button", { name: "Tap to reveal" })).toBeVisible();
});

test("own words: used up after every word was played, then the game asks for new ones", async ({ page }) => {
  await threePlayers(page);
  await page.getByRole("button", { name: "Our own words" }).click();
  await page.getByRole("button", { name: "−" }).last().click(); // 1 word each
  await page.getByRole("button", { name: "Start game" }).click();
  for (const w of ["Apple", "Moon", "Train"]) {
    await page.getByRole("button", { name: "Tap to write" }).click();
    await page.getByPlaceholder(/^Word/).fill(w);
    await page.getByRole("button", { name: "Done" }).click();
  }
  const played = new Set<string>();
  for (let round = 1; round <= 3; round++) {
    const seen = await revealAll(page, 3);
    played.add(seen.find(Boolean)!);
    await page.getByRole("button", { name: "Reveal without voting" }).click();
    if (round < 3) {
      await expect(page.getByText(`${3 - round} left`)).toBeVisible();
      await page.getByRole("button", { name: `Play again · Round ${round + 1}/5` }).click();
    }
  }
  expect([...played].sort()).toEqual(["Apple", "Moon", "Train"]); // no repeats
  await page.getByRole("button", { name: "Write new words" }).click();
  await expect(page.getByRole("button", { name: "Tap to write" })).toBeVisible();
});

// one-phone state in localStorage (SAVE_KEY in src/lib/roomClient.ts), to reach joker situations without luck
const SAVE_KEY = "imposter:v1";
const savedRound = { word: "Pizza", clue: "", authors: [1], key: "pizza", imposters: [0], starter: 0, jokered: [0] };
const jokersAfter = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}").jokers as string[], SAVE_KEY);

test("joker: quitting a round where a joker was spent gives it back", async ({ page }) => {
  // seeded before the app script runs, so its own save effect can't overwrite it
  await page.addInitScript(([k, round]) => {
    localStorage.setItem(k, JSON.stringify({ players: ["Lisa", "Nora", "Tim"], hint: false, joker: true, jokers: [], phase: "reveal", round, turn: 0 }));
  }, [SAVE_KEY, { ...savedRound, word: { en: "Pizza", fr: "Pizza", de: "Pizza" }, key: "food:0", authors: [] }] as const);
  await page.goto("/");
  await page.getByRole("button", { name: "Tap to reveal" }).click();
  await expect(page.getByText("Joker hint")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Quit round/ }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  expect(await jokersAfter(page)).toEqual(["Lisa"]);
});

test("joker: quitting while writing new words does not hand out a joker again", async ({ page }) => {
  // BUG: quit() refunds `round.jokered` whenever phase !== "result" (src/app/page.tsx:276). With own words, after the
  // last written word was played, "Write new words" moves to the write phase but keeps the finished round in `round`,
  // so quitting there gives the joker back although it was already used: a free extra joker.
  // seeded before the app script runs, so its own save effect can't overwrite it
  await page.addInitScript(([k, round]) => {
    localStorage.setItem(k, JSON.stringify({
      players: ["Lisa", "Nora", "Tim"], mode: "custom", perPlayer: 1, hint: false, joker: true, jokers: [], pool: [],
      phase: "result", round, accused: null,
      history: [{ names: ["Lisa", "Nora", "Tim"], imposters: [0], accused: null, votes: null, word: "Pizza", guessed: false }],
    }));
  }, [SAVE_KEY, savedRound] as const);
  await page.goto("/");
  await page.getByRole("button", { name: "Write new words" }).click();
  await expect(page.getByRole("button", { name: "Tap to write" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Quit round/ }).click();
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  expect(await jokersAfter(page)).toEqual([]);
});

// ---------- rooms ----------

async function createRoom(request: APIRequestContext, addr: string, settings: object, name = "Lisa") {
  const res = await request.post("/api/rooms", { data: { name, settings }, headers: { "x-real-ip": addr } });
  expect(res.status()).toBe(200);
  return (await res.json()) as Id & { code: string };
}

async function joinRoom(request: APIRequestContext, addr: string, code: string, name: string) {
  return request.post(`/api/rooms/${code}`, { data: { type: "join", name }, headers: { "x-real-ip": addr } });
}

async function viewAs(request: APIRequestContext, code: string, id: Id) {
  const res = await request.get(`/api/rooms/${code}`, { headers: { "x-pid": id.pid, "x-token": id.token } });
  return (await res.json()) as { me: number; card: Card; phase: string };
}

// a phone already joined as `id`: the identity is what the app keeps in localStorage after joining
async function phoneAs(browser: Browser, addr: string, code: string, id?: Id) {
  const ctx = await browser.newContext({ ...test.info().project.use, extraHTTPHeaders: { "x-real-ip": addr } });
  if (id) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`imposter:room:${code}`, JSON.stringify(id)] as const);
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  return page;
}

async function roomOf(request: APIRequestContext, settings: object, names = ["Lisa", "Nora", "Tim"]) {
  const addr = ip();
  const host = await createRoom(request, addr, settings, names[0]);
  const ids: Id[] = [host];
  for (const n of names.slice(1)) ids.push(await (await joinRoom(request, addr, host.code, n)).json());
  const seats = await Promise.all(ids.map(async (id) => ({ id, me: (await viewAs(request, host.code, id)).me })));
  return { addr, code: host.code, ids: seats.sort((a, b) => a.me - b.me).map((s) => s.id), names };
}

test("rooms: own words are written on each phone with a waiting count; writers are never the imposter", async ({ browser, request }) => {
  const { addr, code, ids, names } = await roomOf(request, { mode: "custom", perPlayer: 1, ai: false });
  const phones = await Promise.all(ids.map((id) => phoneAs(browser, addr, code, id)));
  await expect(phones[0].getByText(/Our own words/)).toBeVisible(); // lobby shows the host's settings
  await phones[0].getByRole("button", { name: /Start game/ }).click();

  const words = ["Apple", "Moon", "Train"];
  for (const [i, p] of phones.entries()) {
    await p.getByPlaceholder(/^Word/).fill(words[i]);
    await p.getByRole("button", { name: "Done" }).click();
    if (i < 2) await expect(p.getByText(`Waiting for the others · ${i + 1}/3`)).toBeVisible();
  }
  for (const p of phones) await expect(p.getByRole("button", { name: "Tap to reveal" })).toBeVisible();
  const cards = await Promise.all(ids.map((id) => viewAs(request, code, id)));
  const imp = cards.findIndex((c) => c.card?.imposter);
  expect(imp).toBeGreaterThanOrEqual(0);
  const word = (cards.find((c) => c.card && !c.card.imposter)!.card as { word: string }).word;
  expect(words).toContain(word);
  expect(words[imp]).not.toBe(word); // the imposter didn't write the word
  expect(names).toHaveLength(3);
});

test("rooms: the host picks the word language; every phone keeps its own app language", async ({ browser, request }) => {
  const { addr, code, ids } = await roomOf(request, { lang: "de", cats: ["food"] });
  const phones = await Promise.all(ids.map((id) => phoneAs(browser, addr, code, id)));
  await expect(phones[1].getByText("Word language")).toBeVisible(); // English app on this phone
  await expect(phones[1].getByRole("listitem").filter({ hasText: "Word language" })).toContainText("Deutsch");
  await expect(phones[1].locator("html")).toHaveAttribute("lang", "en");
  await phones[0].getByRole("button", { name: /Start game/ }).click();
  const german = new Set(CATEGORIES.find((c) => c.id === "food")!.words.map((w) => w.de));
  let words = 0;
  for (const p of phones) {
    await p.getByRole("button", { name: "Tap to reveal" }).click();
    await expect(p.getByText("IMPOSTER", { exact: true }).or(p.getByTestId("word"))).toBeVisible();
    if (await p.getByTestId("word").isVisible()) {
      expect(german).toContain(await p.getByTestId("word").innerText());
      words++;
    }
    await expect(p.getByRole("button", { name: "I'm ready" })).toBeVisible(); // UI stays English
  }
  expect(words).toBe(2);
});

test("rooms: 20 players at most; late joiners are turned away once the game started", async ({ browser, request }) => {
  const addr = ip();
  const host = await createRoom(request, addr, {});
  for (let i = 1; i < 20; i++) expect((await joinRoom(request, addr, host.code, `P${i}`)).status()).toBe(200);
  const full = await joinRoom(request, addr, host.code, "Late");
  expect(full.status()).toBe(409);
  expect(await full.json()).toEqual({ error: "full" });

  const guest = await phoneAs(browser, addr, host.code);
  await guest.getByPlaceholder("Your name").fill("Late");
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("This room is full.", { timeout: 15_000 }); // after 20 joins; slow on a busy machine

  // started: joining is refused even with room to spare
  const small = await roomOf(request, {});
  const start = await request.post(`/api/rooms/${small.code}`, { data: { ...small.ids[0], type: "start" } });
  expect(start.status()).toBe(200);
  const late = await joinRoom(request, small.addr, small.code, "Late");
  expect(late.status()).toBe(409);
  expect(await late.json()).toEqual({ error: "started" });
});

test("rooms: tie → discuss again, caught imposter guesses on their own phone, game over → New game", async ({ browser, request }) => {
  const { addr, code, ids, names } = await roomOf(request, { rounds: 1, guess: true, ai: false });
  const phones = await Promise.all(ids.map((id) => phoneAs(browser, addr, code, id)));
  const [host] = phones;
  await host.getByRole("button", { name: /Start game/ }).click();
  for (const p of phones) {
    await p.getByRole("button", { name: "Tap to reveal" }).click();
    await p.getByRole("button", { name: "I'm ready" }).click();
  }
  await expect(host.getByText("Round 1 / 1")).toBeVisible();
  await host.getByRole("button", { name: /Vote/ }).click();

  // 1 : 1 : 1 → tie on every phone; only the host continues
  for (const [i, p] of phones.entries()) await p.getByRole("button", { name: names[(i + 1) % 3], exact: true }).click();
  for (const p of phones) await expect(p.getByRole("heading", { name: "It's a tie!" })).toBeVisible();
  await expect(phones[1].getByText("The host continues")).toBeVisible();
  await host.getByRole("button", { name: /Discuss again/ }).click();
  for (const p of phones) await expect(p.getByText("Word round 1")).toBeVisible();

  const cards = await Promise.all(ids.map((id) => viewAs(request, code, id)));
  const imp = cards.findIndex((c) => c.card?.imposter);
  const word = (cards.find((c) => c.card && !c.card.imposter)!.card as { word: Record<string, string> }).word.en;
  await host.getByRole("button", { name: /Vote/ }).click();
  for (const [i, p] of phones.entries()) await p.getByRole("button", { name: names[i === imp ? (imp + 1) % 3 : imp], exact: true }).click();

  await expect(phones[imp].getByRole("heading", { name: "You've been caught!" })).toBeVisible();
  await expect(phones[(imp + 1) % 3].getByText(`${names[imp]} is guessing the word…`)).toBeVisible();
  await phones[imp].getByPlaceholder("The word is…").fill(word);
  await phones[imp].getByRole("button", { name: "Guess", exact: true }).click();

  for (const p of phones) {
    await expect(p.getByText("Guessed it!")).toBeVisible();
    await expect(p.getByText("Game over!")).toBeVisible();
    await expect(p.getByText(`${names[imp]} wins the game!`)).toBeVisible(); // +2 for escaping beats everyone else
  }
  await host.getByRole("button", { name: "New game" }).click();
  for (const p of phones) await expect(p.getByRole("button", { name: "Tap to reveal" })).toBeVisible();
});

// ---------- platform ----------

test("rate limits: 20 new rooms and 30 joins per minute per IP, then 429", async ({ browser, request }) => {
  test.setTimeout(90_000);
  // limits count per clock minute: start early in a minute so the burst and the checks share one
  const left = 60_000 - (Date.now() % 60_000);
  if (left < 25_000) await new Promise((r) => setTimeout(r, left + 200));
  const addr = ip();
  for (let i = 0; i < 20; i++) await createRoom(request, addr, {});
  const blocked = await request.post("/api/rooms", { data: { name: "Lisa", settings: {} }, headers: { "x-real-ip": addr } });
  expect(blocked.status()).toBe(429);
  expect(await blocked.json()).toEqual({ error: "rate_limited" });
  expect((await request.post("/api/rooms", { data: { name: "Lisa", settings: {} }, headers: { "x-real-ip": ip() } })).status()).toBe(200);

  // the start screen explains it
  const page = await (await browser.newContext({ ...test.info().project.use, extraHTTPHeaders: { "x-real-ip": addr } })).newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Every phone/ }).click();
  await page.getByPlaceholder("Your name").fill("Lisa");
  await page.getByRole("button", { name: /Create room/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Too many tries. Wait a minute, then try again.");

  const joiner = ip();
  const { code } = await createRoom(request, ip(), {});
  for (let i = 0; i < 30; i++) expect((await joinRoom(request, joiner, "ZZZZZ", `P${i}`)).status()).toBe(404); // guessing codes counts too
  expect((await joinRoom(request, joiner, code, "Nora")).status()).toBe(429);
});

test("security headers on pages and API responses", async ({ request }) => {
  for (const path of ["/", "/r/ABCDE", "/api/rooms/ABCDE", "/api/me"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["strict-transport-security"], path).toContain("max-age=63072000");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(h["permissions-policy"], path).toContain("camera=(self)");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
  expect((await request.get("/api/rooms/ABCDE")).status()).toBe(404);
});

test("signed out: word checks still work without AI (exact duplicates)", async ({ request }) => {
  const res = await request.post("/api/words/check", { data: { words: [{ word: " apple ", clue: "" }, { word: "Moon", clue: "" }], taken: ["Apple"], lang: "en" } });
  expect(res.status()).toBe(200);
  const reviews = (await res.json()) as { problem: string | null }[];
  expect(reviews.map((r) => r.problem)).toEqual(["taken", null]);
  expect((await request.get("/api/me")).ok()).toBe(true);
  expect((await (await request.get("/api/me")).json()).user).toBeNull();
});

test("icons, manual link and GitHub credit", async ({ page, request }) => {
  for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png"]) expect((await request.get(path)).status(), path).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("link", { name: "How to play" })).toHaveAttribute("href", /docs\/MANUAL\.md$/);
  await expect(page.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/dominikpeter/imposter");
});

test("prefers-reduced-motion switches the entrance animations off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start game" })).toBeVisible();
  const names = await page.locator(".enter, .pop, .hero-card").evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names)).toEqual(new Set(["none"]));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const moving = await page.locator(".enter").first().evaluate((e) => getComputedStyle(e).animationName);
  expect(moving).not.toBe("none");
});

test("rooms: a dropped phone — the host confirms and continues without it", async ({ browser, request }) => {
  const { addr, code, ids } = await roomOf(request, {});
  const act = (i: number, a: object) => request.post(`/api/rooms/${code}`, { data: { ...ids[i], ...a }, headers: { "x-real-ip": addr } });
  await act(0, { type: "start" });
  for (const i of [0, 1, 2]) await act(i, { type: "ready" });
  await act(0, { type: "startVote" });
  await act(0, { type: "vote", target: 1 });
  await act(1, { type: "vote", target: 0 }); // seat 2's phone never votes

  const host = await phoneAs(browser, addr, code, ids[0]);
  await expect(host.getByText("Waiting for the others · 2/3")).toBeVisible();
  const go = host.getByRole("button", { name: "Continue without them" });
  host.once("dialog", (d) => d.dismiss()); // a stray tap asks first and changes nothing
  await go.click();
  await expect(host.getByText("Waiting for the others · 2/3")).toBeVisible();
  host.once("dialog", (d) => d.accept());
  await go.click();
  await expect(host.getByText("It's a tie!")).toBeVisible(); // 1 : 1 → talk again

  const guest = await phoneAs(browser, addr, code, ids[1]);
  await expect(guest.getByText("It's a tie!")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Continue without them" })).toHaveCount(0); // host only
});
