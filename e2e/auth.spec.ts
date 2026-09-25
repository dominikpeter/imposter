import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

// Sign-in gates every AI feature. The dev server treats the `x-e2e-user` header as a signed-in account
// (E2E_AUTH_BYPASS, development only; see aiUser in src/lib/auth.ts). No test here waits on OpenAI.
const SIGNED_IN = { "x-e2e-user": "Tester" };
const NAME = { google: "Google", github: "GitHub", microsoft: "Microsoft" } as const;
const OAUTH_HOST = { google: "accounts.google.com", github: "github.com", microsoft: "login.microsoftonline.com" } as const;
type Provider = keyof typeof NAME;
type Id = { pid: string; token: string };
type View = { me: number; phase: string; card: null | { imposter: boolean }; settings: { ai: boolean } };

// own fake client IP per room, so the per-IP rate limits never leak between tests
const rnd = () => Math.floor(Math.random() * 250) + 1;
const ip = () => `10.${rnd()}.${rnd()}.${rnd()}`;

/** A started 3-player room; the host is signed in or not. Returns API helpers per seat. */
async function startedRoom(request: APIRequestContext, hostSignedIn: boolean) {
  const addr = { "x-real-ip": ip() };
  const res = await request.post("/api/rooms", { data: { name: "Lisa", settings: {} }, headers: { ...addr, ...(hostSignedIn ? SIGNED_IN : {}) } });
  expect(res.status()).toBe(200);
  const host = (await res.json()) as Id & { code: string };
  const ids: Id[] = [host];
  for (const name of ["Nora", "Tim"]) ids.push(await (await request.post(`/api/rooms/${host.code}`, { data: { type: "join", name }, headers: addr })).json());
  const act = (id: Id, a: object) => request.post(`/api/rooms/${host.code}`, { data: { ...id, ...a }, headers: addr });
  const view = async (id: Id) => (await (await request.get(`/api/rooms/${host.code}`, { headers: { "x-pid": id.pid, "x-token": id.token } })).json()) as View;
  expect((await act(host, { type: "start" })).status()).toBe(200);
  const views = await Promise.all(ids.map(view));
  const crew = ids.filter((_, i) => views[i].card && !views[i].card!.imposter);
  const imposter = ids.find((_, i) => views[i].card?.imposter)!;
  return { code: host.code, addr, ids, act, view, crew, imposter, ai: views[0].settings.ai };
}

/** A phone already joined as `id` (the identity the app keeps after joining), signed in or not. */
async function phoneAs(browser: Browser, code: string, id: Id, headers: Record<string, string>) {
  const ctx = await browser.newContext({ ...test.info().project.use, extraHTTPHeaders: headers });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`imposter:room:${code}`, JSON.stringify(id)] as const);
  const page = await ctx.newPage();
  await page.goto(`/r/${code}`);
  return page;
}

const openSettings = (page: Page) => page.getByRole("button", { name: "Settings" }).click();
const aiSwitch = (page: Page) => page.getByRole("checkbox", { name: /AI help/ });
const explainBtn = (page: Page) => page.getByRole("button", { name: "Explain with AI" });

test.describe("signed out", () => {
  test("no AI switch or AI buttons; sign-in is offered instead and AI endpoints refuse", async ({ page }) => {
    const me = await (await page.request.get("/api/me")).json();
    expect(me.user).toBeNull();

    await page.goto("/");
    await openSettings(page);
    await expect(aiSwitch(page)).toHaveCount(0);
    await expect(page.getByText(/^Signed in as/)).toHaveCount(0);
    for (const p of me.providers as Provider[]) await expect(page.getByRole("button", { name: `Continue with ${NAME[p]}` })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // no crew card offers "Explain with AI"
    await page.getByRole("button", { name: "Start game" }).click();
    for (let i = 0; i < 4; i++) { // the 4 default players
      await page.getByRole("button", { name: "Tap to reveal" }).click();
      await expect(page.getByText("IMPOSTER", { exact: true }).or(page.getByTestId("word"))).toBeVisible();
      await expect(explainBtn(page)).toHaveCount(0);
      await page.getByRole("button", { name: /Hide & pass on/ }).click();
    }

    expect((await page.request.post("/api/words/explain", { data: { word: "Pizza", lang: "en" } })).status()).toBe(401);
  });

  test("every configured provider starts a real OAuth redirect", async ({ page, request, baseURL }) => {
    const { providers } = (await (await request.get("/api/me")).json()) as { providers: Provider[] };
    test.skip(!providers.length, "no OAuth provider configured in .env.local (just auth-setup)");

    for (const p of providers) {
      const res = await request.post("/api/auth/sign-in/social", { data: { provider: p, callbackURL: "/" }, headers: { origin: baseURL! } });
      expect(res.status()).toBe(200);
      const url = new URL((await res.json()).url);
      expect(url.host).toBe(OAUTH_HOST[p]);
      expect(url.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/callback/${p}`);
      expect(url.searchParams.get("client_id")).toBeTruthy();
      expect(url.searchParams.get("state")).toBeTruthy(); // CSRF protection
      if (p === "google") expect(url.searchParams.get("code_challenge")).toBeTruthy(); // PKCE
    }

    // and the button in Settings goes there (the provider's page is stubbed: no real login in tests)
    const p = providers[0];
    await page.route(`https://${OAUTH_HOST[p]}/**`, (r) => r.fulfill({ body: "provider login page" }));
    await page.goto("/");
    await openSettings(page);
    await page.getByRole("button", { name: `Continue with ${NAME[p]}` }).click();
    await page.waitForURL((u) => u.host === OAUTH_HOST[p]);
  });
});

test.describe("signed in", () => {
  test.use({ extraHTTPHeaders: SIGNED_IN });

  test("AI switch and account in Settings; crew cards offer Explain with AI", async ({ page }) => {
    expect((await (await page.request.get("/api/me")).json()).user?.name).toBe("Tester");
    await page.goto("/");
    await openSettings(page);
    await expect(aiSwitch(page)).toBeChecked(); // on by default
    await expect(page.getByText("Signed in as Tester")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Start game" }).click();
    for (let i = 0; i < 4; i++) { // the 4 default players
      await page.getByRole("button", { name: "Tap to reveal" }).click();
      const imposter = page.getByText("IMPOSTER", { exact: true });
      await expect(imposter.or(page.getByTestId("word"))).toBeVisible();
      await expect(explainBtn(page)).toHaveCount((await imposter.isVisible()) ? 0 : 1); // never for the imposter
      await page.getByRole("button", { name: /Hide & pass on/ }).click();
    }
  });

  test("switching AI off hides it again", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await aiSwitch(page).locator("..").click();
    await expect(aiSwitch(page)).not.toBeChecked();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    await expect(explainBtn(page)).toHaveCount(0);
  });
});

test.describe("rooms: AI follows the host", () => {
  test("signed-in host: every crew phone gets AI, even signed out; never the imposter", async ({ browser, request }) => {
    const r = await startedRoom(request, true);
    expect(r.ai).toBe(true);

    // a signed-out guest on the crew sees the AI row in the lobby settings and "Explain with AI" on their card
    const guest = r.crew.find((id) => id !== r.ids[0]) ?? r.crew[0];
    const phone = await phoneAs(browser, r.code, guest, r.addr);
    await phone.getByRole("button", { name: "Tap to reveal" }).click();
    await expect(phone.getByTestId("word")).toBeVisible();
    await expect(explainBtn(phone)).toBeVisible();

    // the server runs it on the host's account for crew, and refuses the imposter (who would learn the word)
    expect((await r.act(guest, { type: "explain", lang: "en" })).status()).toBe(200);
    expect((await r.act(r.imposter, { type: "explain", lang: "en" })).status()).toBe(403);
  });

  test("signed-out host: no AI for anyone, not even a signed-in guest", async ({ browser, request }) => {
    const r = await startedRoom(request, false);
    expect(r.ai).toBe(false);

    const guest = r.crew.find((id) => id !== r.ids[0]) ?? r.crew[0];
    const phone = await phoneAs(browser, r.code, guest, { ...r.addr, ...SIGNED_IN });
    await phone.getByRole("button", { name: "Tap to reveal" }).click();
    await expect(phone.getByTestId("word")).toBeVisible();
    await expect(explainBtn(phone)).toHaveCount(0);
    for (const id of r.ids) expect((await r.act(id, { type: "explain", lang: "en" })).status()).toBe(403);
  });

  test("lobby lists AI help only when the host is signed in", async ({ browser, request }) => {
    for (const signedIn of [true, false]) {
      const addr = { "x-real-ip": ip() };
      const host = (await (await request.post("/api/rooms", { data: { name: "Lisa", settings: {} }, headers: { ...addr, ...(signedIn ? SIGNED_IN : {}) } })).json()) as Id & { code: string };
      const guest = (await (await request.post(`/api/rooms/${host.code}`, { data: { type: "join", name: "Nora" }, headers: addr })).json()) as Id;
      const phone = await phoneAs(browser, host.code, guest, addr);
      await expect(phone.getByRole("heading", { name: "Game settings" })).toBeVisible();
      await expect(phone.getByRole("listitem").filter({ hasText: "AI help" })).toHaveCount(signedIn ? 1 : 0);
    }
  });
});
