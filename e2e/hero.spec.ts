import { expect, test } from "@playwright/test";
import { CATEGORIES, type Lang } from "../src/lib/i18n.ts";

// The Hero illustration's flavor word must follow the app's own display language, not the (possibly
// different) secret-word language chosen for actual gameplay — see src/app/page.tsx (`<Hero lang={lang} />`,
// not `W`). crypto.getRandomValues is pinned to a fixed raw value so the word index (raw % pool length) is
// fully deterministic, for whichever language's pool the component actually reads from.
const shortWords = (lang: Lang) => CATEGORIES.flatMap((c) => c.words.map((w) => w[lang])).filter((w) => w.length <= 6 && !w.includes(" "));
const enWords = shortWords("en");
const deWords = shortWords("de");
// the raw value the old, buggy code (lang=wordLang="de") and the fixed code (lang="en") would land on the
// same-worded pick for is skipped: find a raw value where the two languages disagree, so a regression is caught
let raw = 0;
while (enWords[raw % enWords.length] === deWords[raw % deWords.length]) raw++;
const enWord = enWords[raw % enWords.length];
const deWordIfBuggy = deWords[raw % deWords.length];

test("Hero's flavor word matches the app language, even with a different word language saved", async ({ page }) => {
  await page.addInitScript(
    ([lang, wordLang, r]) => {
      localStorage.setItem("imposter:v1", JSON.stringify({ lang, wordLang }));
      const orig = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = ((arr: Uint32Array) => {
        orig(arr);
        arr[0] = r as number;
        return arr;
      }) as typeof crypto.getRandomValues;
    },
    ["en", "de", raw],
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).waitFor();

  const heroWords = page.locator(".hero-card span");
  await expect(heroWords.first()).toHaveText(enWord);
  await expect(page.getByText(deWordIfBuggy, { exact: true })).toHaveCount(0);
});
