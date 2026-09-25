import { expect, test, type Locator, type Page } from "@playwright/test";

// many rounds in a row, then the stats screen must add up to what was played
const PLAYERS = ["Lisa", "Nora", "Tim", "Beni"]; // app defaults
type Played = { imposters: number[]; accused: number | null; votes: number[] | null };

// reveal every card; returns the seats that saw the imposter card
async function revealAll(page: Page) {
  const imposters: number[] = [];
  for (let i = 0; i < PLAYERS.length; i++) {
    await page.getByRole("button", { name: "Tap to reveal" }).click();
    const imposter = page.getByText("IMPOSTER", { exact: true });
    await expect(imposter.or(page.getByTestId("word"))).toBeVisible();
    if (await imposter.isVisible()) imposters.push(i);
    await page.getByRole("button", { name: /Hide & pass on/ }).click();
  }
  return imposters;
}

async function voteAll(page: Page, targets: number[]) {
  await page.getByRole("button", { name: /Vote/ }).click();
  for (const t of targets) {
    await page.getByRole("button", { name: "Tap to vote" }).click();
    await page.getByRole("button", { name: PLAYERS[t], exact: true }).click();
  }
}

// the rules, from what was played: crew +1 for a vote on the imposter, imposter +2 for getting away
function score(played: Played[]) {
  const per = PLAYERS.map(() => ({ points: 0, imposter: 0, escaped: 0, hits: 0, votes: 0, gains: [] as number[] }));
  for (const r of played) {
    per.forEach((p, i) => {
      let g = 0;
      if (r.imposters.includes(i)) {
        p.imposter++;
        if (r.accused !== null && r.accused !== i) g = 2;
        p.escaped += g / 2;
      } else if (r.votes && r.imposters.includes(r.votes[i])) {
        g = 1;
        p.hits++;
      }
      p.votes += r.votes?.filter((v) => v === i).length ?? 0;
      p.points += g;
      p.gains.push(g);
    });
  }
  return per;
}

// hero tile: the number sits above its label
const tileValue = (stats: Locator, label: string) => stats.getByText(label, { exact: true }).locator("xpath=..").locator("span").first();

test("one phone, 6 rounds: stats add up, game over at the round limit, new game resets", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const rounds = page.getByRole("heading", { name: "Rounds" }).locator("..");
  await rounds.getByRole("button", { name: "+" }).click(); // 5 → 6 rounds
  await expect(rounds.getByText("6", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start game" }).click();

  const played: Played[] = [];
  const n = PLAYERS.length;
  for (let r = 0; r < 6; r++) {
    if (r > 0) await page.getByRole("button", { name: `Play again · Round ${r + 1}/6` }).click();
    const imposters = await revealAll(page);
    expect(imposters).toHaveLength(1);
    const imp = imposters[0];
    const innocent = (imp + 1) % n;
    await expect(page.getByText(`Round ${r + 1} / 6`)).toBeVisible();
    const catchIt = PLAYERS.map((_, i) => (i === imp ? innocent : imp));
    let votes: number[] | null;
    if (r === 2) {
      await page.getByRole("button", { name: "Reveal without voting" }).click(); // nobody scores
      votes = null;
    } else if (r === 3) {
      // a tie first (2:2), then talk again and catch the imposter
      const other = (imp + 2) % n;
      const rest = [...PLAYERS.keys()].filter((i) => i !== imp && i !== other);
      await voteAll(page, PLAYERS.map((_, i) => (i === imp || i === rest[1] ? other : imp)));
      await expect(page.getByRole("heading", { name: "It's a tie!" })).toBeVisible();
      await page.getByRole("button", { name: /Discuss again/ }).click();
      await voteAll(page, (votes = catchIt));
    } else if (r === 1 || r === 4) {
      // wrong player accused: the imposter gets away; in round 5 the accused one still voted right
      votes = PLAYERS.map((_, i) => (i === innocent ? (r === 4 ? imp : (innocent + 1) % n) : innocent));
      await voteAll(page, votes);
    } else {
      await voteAll(page, (votes = catchIt));
    }
    const accused = votes === null ? null : r === 1 || r === 4 ? innocent : imp;
    played.push({ imposters, accused, votes });
    if (accused === imp) await expect(page.getByText("Caught!")).toBeVisible();
    const stats = page.getByRole("region", { name: "Game stats" });
    await expect(tileValue(stats, "Rounds")).toHaveText(String(r + 1)); // stats grow round by round
    if (r < 5) await expect(page.getByText("Game over!")).toHaveCount(0);
  }

  // game over exactly at the configured 6 rounds
  await expect(page.getByText("Game over!")).toBeVisible();
  await expect(page.getByRole("button", { name: /Play again/ })).toHaveCount(0);
  const want = score(played);
  const top = Math.max(...want.map((p) => p.points));
  const leaders = PLAYERS.filter((_, i) => want[i].points === top);
  await expect(page.getByText(new RegExp(`${leaders.length > 1 ? "win" : "wins"} the game!`))).toContainText(leaders[0]);

  const stats = page.getByRole("region", { name: "Game stats" });
  await expect(tileValue(stats, "Rounds")).toHaveText("6");
  await expect(tileValue(stats, "Crew wins")).toHaveText("3"); // rounds 1, 4, 6
  await expect(tileValue(stats, "Imposter wins")).toHaveText("2"); // rounds 2, 5

  // leaderboard: every total, best first
  const order = PLAYERS.map((name, i) => ({ name, ...want[i] })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const board = stats.getByRole("heading", { name: "Leaderboard" }).locator("..").getByRole("listitem");
  await expect(board).toHaveCount(n);
  for (const [i, p] of order.entries()) await expect(board.nth(i)).toHaveAttribute("title", `${p.name}: ${p.points} pts`);

  // points per round: one bar per player, one segment per round that scored, labelled "Round N: +k", ending at the total
  await expect(stats.getByRole("heading", { name: "Points per round" })).toBeVisible();
  for (const p of order) {
    const bar = stats.getByRole("img", { name: `${p.name}: ${p.points}`, exact: true });
    await expect(bar).toBeVisible();
    const titles = p.gains.flatMap((g, r) => (g > 0 ? [`Round ${r + 1}: +${g}`] : []));
    const segs = bar.locator("span[title]");
    await expect(segs).toHaveCount(titles.length);
    for (const [k, title] of titles.entries()) await expect(segs.nth(k)).toHaveAttribute("title", title);
  }

  // "All numbers": one row per player, the top value of each column is the solid cell
  const table = stats.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(n + 1);
  const cols = ["imposter", "escaped", "hits", "votes", "points"] as const;
  for (const [c, key] of cols.entries()) {
    const max = Math.max(...want.map((p) => p[key]));
    for (const p of order) {
      const cell = table.getByRole("row").filter({ hasText: p.name }).getByRole("cell").nth(c + 1);
      await expect(cell).toHaveText(String(p[key]));
      const style = (await cell.getAttribute("style")) ?? "";
      if (max > 0 && p[key] === max) expect(style, `${p.name} ${key}`).toContain("var(--c-on-primary)");
      else expect(style, `${p.name} ${key}`).not.toContain("var(--c-on-primary)");
    }
  }
  // the column icons are explained under the table
  const legend = table.locator("xpath=..").getByRole("listitem");
  await expect(legend).toHaveText(["Times imposter", "Got away as imposter", "Voted for the imposter", "Votes received"]);
  for (const label of ["Imposter", "escaped", "right votes", "votes"])
    await expect(table.getByRole("columnheader").getByLabel(label, { exact: true })).toBeVisible();

  // new game: back to round 1 with empty stats
  await page.getByRole("button", { name: "New game" }).click();
  await revealAll(page);
  await expect(page.getByText("Round 1 / 6")).toBeVisible();
  await page.getByRole("button", { name: "Reveal without voting" }).click();
  await expect(tileValue(page.getByRole("region", { name: "Game stats" }), "Rounds")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Play again · Round 2/6" })).toBeVisible();
});

test("room: 3 rounds played through the API, the host's phone follows to game over, stats and new game", async ({ page, request }) => {
  test.setTimeout(120_000);
  const post = async (path: string, data: object) => {
    const r = await request.post(`/api/rooms${path}`, { data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const host = await post("", { name: "Lisa", settings: { rounds: 3, imposterCount: 1 } });
  const code: string = host.code;
  const ids = [host, ...[await post(`/${code}`, { type: "join", name: "Nora" }), await post(`/${code}`, { type: "join", name: "Tim" })]];
  const see = async (p: { pid: string; token: string }) =>
    (await request.get(`/api/rooms/${code}`, { headers: { "x-pid": p.pid, "x-token": p.token } })).json();
  // seats as the room orders them
  const seats = (await Promise.all(ids.map(async (p) => ({ p, me: (await see(p)).me })))).sort((a, b) => a.me - b.me).map((x) => x.p);
  const act = (i: number, a: object) => post(`/${code}`, { pid: seats[i].pid, token: seats[i].token, ...a });
  expect(seats[0].pid).toBe(host.pid);

  // the host's phone
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [`imposter:room:${code}`, JSON.stringify({ pid: host.pid, token: host.token })]);
  await page.goto(`/r/${code}`);
  await expect(page.getByText("Lisa (you)")).toBeVisible();

  const names = ["Lisa", "Nora", "Tim"];
  const points = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    await act(0, { type: "start" });
    const views = await Promise.all(seats.map(see));
    const imp = views.findIndex((v) => v.card?.imposter);
    expect(views.filter((v) => v.card?.imposter)).toHaveLength(1);
    for (let i = 0; i < 3; i++) await act(i, { type: "ready" });
    await act(0, { type: "startVote" });
    // odd rounds: everyone accuses an innocent player, so the imposter gets away
    const target = r % 2 ? (imp + 1) % 3 : imp;
    for (let i = 0; i < 3; i++) await act(i, { type: "vote", target: i === target ? (target + 1) % 3 : target });
    // caught: both crew voted for the imposter (+1 each); got away: only the imposter scores (+2)
    for (let i = 0; i < 3; i++) points[i] += target === imp ? (i === imp ? 0 : 1) : i === imp ? 2 : 0;
    const stats = page.getByRole("region", { name: "Game stats" });
    await expect(tileValue(stats, "Rounds")).toHaveText(String(r + 1), { timeout: 10_000 });
    if (r < 2) await expect(page.getByRole("button", { name: `Play again · Round ${r + 2}/3` })).toBeVisible();
  }

  await expect(page.getByText("Game over!")).toBeVisible();
  const stats = page.getByRole("region", { name: "Game stats" });
  const board = stats.getByRole("heading", { name: "Leaderboard" }).locator("..").getByRole("listitem");
  for (const [i, name] of names.entries()) {
    await expect(board.filter({ hasText: name })).toHaveAttribute("title", `${name}: ${points[i]} pts`);
    await expect(stats.getByRole("img", { name: `${name}: ${points[i]}`, exact: true })).toBeVisible();
  }
  const refused = await request.post(`/api/rooms/${code}`, { data: { pid: host.pid, token: host.token, type: "start" } });
  expect(refused.status()).toBe(403); // no fourth round

  await page.getByRole("button", { name: "New game" }).click();
  await expect.poll(async () => (await see(host)).history.length).toBe(0);
  expect((await see(host)).phase).toBe("reveal");
  await expect(page.getByRole("button", { name: "Tap to reveal" })).toBeVisible();
});
