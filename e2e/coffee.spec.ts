import { expect, test } from "@playwright/test";

// The e2e dev server has no Stripe key: /api/coffee skips Stripe and sends you straight back as if you had paid.
test("buy me a coffee: sizes, custom amount, thank-you on return", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  for (const label of ["CHF 1 Small coffee", "CHF 5 Big coffee", "CHF 10 Deluxe coffee"]) await expect(page.getByRole("button", { name: label })).toBeVisible();

  const give = page.getByRole("button", { name: "Give" });
  const other = page.getByRole("spinbutton", { name: "Other amount (CHF)" });
  await expect(give).toBeDisabled();
  await other.fill("0");
  await expect(give).toBeDisabled();
  await other.fill("7");
  await expect(give).toBeEnabled();

  await page.getByRole("button", { name: "CHF 5 Big coffee" }).click();
  await page.waitForURL((u) => u.pathname === "/" && !u.search); // back from "Stripe", flag dropped from the address
  await expect(page.getByRole("status")).toHaveText("Thank you for the coffee!"); // Settings opened on the thank-you

  // the server decides the amount: nothing outside 1…200 whole francs gets a checkout
  for (const data of [{ chf: 0 }, { chf: 201 }, { chf: 2.5 }, { size: "huge" }, {}])
    expect((await request.post("/api/coffee", { data, headers: { "x-real-ip": "10.9.9.9" } })).status(), JSON.stringify(data)).toBe(400);
});

test("back from Stripe without paying: every coffee can still be bought, again and again", async ({ page }) => {
  // a stand-in Stripe page, so the browser really leaves the app and comes back with Back
  await page.route("**/api/coffee", (r) => r.fulfill({ json: { url: "https://checkout.stripe.test/pay" } }));
  await page.route("https://checkout.stripe.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<h1>Stripe</h1>" }));
  await page.goto("/");
  for (const label of ["CHF 1 Small coffee", "CHF 5 Big coffee"]) {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: label }).click();
    await page.waitForURL("https://checkout.stripe.test/pay");
    await page.goBack(); // changed their mind (back/forward cache or a fresh load: both must work)
    await page.waitForURL((u) => u.hostname === "localhost");
    // the page may come back from the cache with Settings still open
    if (!(await page.getByRole("button", { name: "CHF 10 Deluxe coffee" }).isVisible())) await page.getByRole("button", { name: "Settings" }).click();
    for (const c of ["CHF 1 Small coffee", "CHF 5 Big coffee", "CHF 10 Deluxe coffee"]) await expect(page.getByRole("button", { name: c })).toBeEnabled();
    await page.getByRole("button", { name: "Close" }).click();
  }
});

// the pageshow reset itself, without relying on the browser keeping the page in its cache
test("a page restored from the back/forward cache unlocks the coffee buttons", async ({ page }) => {
  await page.route("**/api/coffee", () => {}); // never answers: the page stays with the buttons locked, as the cache would restore it
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "CHF 5 Big coffee" }).click();
  await expect(page.getByRole("button", { name: "CHF 10 Deluxe coffee" })).toBeDisabled();
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.getByRole("button", { name: "CHF 10 Deluxe coffee" })).toBeEnabled();
});

test("stripe webhook refuses unsigned events", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } });
  expect([400, 503]).toContain(res.status()); // 503 when no webhook secret is set (as on the e2e server)
});

test("coffee return path stays on this site, even for paths the URL parser reads as another host", async ({ request }) => {
  for (const [path, expected] of [["/r/ABCDE", "/r/ABCDE"], ["/\\evil.example/x", "/"], ["//evil.example", "/"], ["/\t/evil.example", "/"], ["https://evil.example", "/"]]) {
    const res = await request.post("/api/coffee", { data: { size: "small", path }, headers: { "x-real-ip": "10.9.9.8" } });
    const url = new URL((await res.json()).url);
    expect(url.hostname, path).toBe("localhost");
    expect(url.pathname, path).toBe(expected);
  }
});
