import { chromium, devices } from "@playwright/test";
const url = process.argv[2] ?? "https://whoislying.ch/";
const b = await chromium.launch();
const runs = [];
for (let i = 0; i < 3; i++) {
  const ctx = await b.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await page.addInitScript(() => {
    window.__lcp = 0; window.__tbt = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__tbt += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
  });
  const t = Date.now();
  await page.goto(url, { waitUntil: "networkidle" });
  const start = Date.now() - t;
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const js = performance.getEntriesByType("resource").filter((r) => r.initiatorType === "script" || r.name.endsWith(".js")).reduce((n, r) => n + (r.transferSize || 0), 0);
    const nav = performance.getEntriesByType("navigation")[0];
    return { fcp: Math.round(fcp), lcp: Math.round(window.__lcp), tbt: Math.round(window.__tbt), jsKB: Math.round(js / 1024), ttfb: Math.round(nav.responseStart), html: Math.round((nav.transferSize || 0) / 1024) };
  });
  runs.push({ ...m, idle: start });
  await ctx.close();
}
console.log(JSON.stringify(runs));
await b.close();
