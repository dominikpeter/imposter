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

test("stripe webhook refuses unsigned events", async ({ request }) => {
  const res = await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } });
  expect([400, 503]).toContain(res.status()); // 503 when no webhook secret is set (as on the e2e server)
});
