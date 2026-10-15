// e2e: two real browser tabs against the running server + page. Light: 480x300, software GL, no screenshots
// unless SHOTS=1. Needs `npm run server` and `npm run dev` running.
// Usage: taskset -c 0-1 nice -n 19 node tools/e2e.mjs
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? "/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work/archive-world-agent/web/node_modules/playwright-core";
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
// cron/Hermes shells point HOME at the profile home, where Playwright would look for its browsers in vain
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox, webkit } = createRequire(import.meta.url)(PW);
const ENGINE = process.env.BROWSER ?? "chromium"; // chromium | firefox | webkit
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
  webkit: () => webkit.launch(),
};
const browser = await launchers[ENGINE]();
// HTTPS=1: the page uses our own certificate (dev:lan), so ignore certificate errors
const ctx = await browser.newContext({ viewport: { width: 480, height: 300 }, ignoreHTTPSErrors: process.env.HTTPS === "1" });
const errors = [];
const open = async () => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  return p;
};
const state = (p) => p.evaluate(() => {
  const n = globalThis.__numinia;
  return { entity: n.session.entity, backend: n.view.backend, probe: n.probe, stats: n.session.stats, remotes: n.session.remotePositions() };
});

const a = await open(), b = await open();
const A = await state(a);
await b.waitForFunction((id) => globalThis.__numinia.session.remotePositions().some((r) => r.id === id), A.entity, { timeout: 10000 });
const before = (await state(b)).remotes.find((r) => r.id === A.entity);
await a.bringToFront();
await a.keyboard.down("KeyW");
await a.waitForTimeout(1500);
await a.keyboard.up("KeyW");
await a.waitForTimeout(700);
const after = (await state(b)).remotes.find((r) => r.id === A.entity);
const A2 = await state(a), B2 = await state(b);
if (process.env.SHOTS === "1") { await a.screenshot({ path: "e2e-a.png" }); await b.screenshot({ path: "e2e-b.png" }); }
await browser.close();

const dz = after.z - before.z;
const result = {
  engine: ENGINE,
  backend: A2.backend,
  probe: { browser: A2.probe.browser.toString(16), server: A2.probe.server.toString(16), equal: A2.probe.browser === A2.probe.server, ms: A2.probe.ms },
  tabBSeesTabA: { entity: A.entity, movedZ: Math.round(dz * 100) / 100, expectedZ: -6 },
  corrections: A2.stats.corrections, rttMs: A2.stats.rttMs, visibleFromB: B2.stats.visible, errors,
};
const ok = result.probe.equal && dz < -4 && dz > -7.5 && result.corrections === 0 && errors.length === 0;
console.log(JSON.stringify(result, null, 1));
console.log(ok ? "E2E OK" : "E2E FALLA");
process.exit(ok ? 0 : 1);
