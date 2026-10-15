// e2e leg J2 (salto): two real tabs against the running server + page. A presses Space: tab B sees A rise above
// 0.5 m and come back to 0; a double jump (Space again near the top) climbs higher than a single one; Shift+W for
// 1.5 s goes about twice as far as W alone (and reads ~8 m/s against ~4); A's prediction makes 0 corrections; the
// browser's replay fingerprint equals the server's. Then an emulated Quest 3 (IWER, MIT): the A button jumps.
// Gets BASE (?webgl2&server=…) and SERVER_HTTP from tools/auto.sh e2e. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const result = { errors };

const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
const open = async () => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  return p;
};
const a = await open(), b = await open();
const A = await a.evaluate(() => globalThis.__numinia.session.entity);
await b.waitForFunction((id) => globalThis.__numinia.session.remotePositions().some((r) => r.id === id), A, { timeout: 10000 });
await a.bringToFront();

/** What B draws of A: its height every ~20 ms while `act` runs and for `ms` after. */
const watch = async (ms, act) => {
  const ys = [];
  let stop = false;
  const sampler = (async () => {
    while (!stop) {
      const y = await b.evaluate((id) => globalThis.__numinia.session.remotePositions().find((r) => r.id === id)?.y ?? null, A);
      if (y !== null) ys.push(y);
      await sleep(20);
    }
  })();
  await act();
  await sleep(ms);
  stop = true; await sampler;
  return { max: r2(Math.max(0, ...ys)), last: ys.length ? ys[ys.length - 1] : null, samples: ys.length };
};

// 1) single jump
result.single = await watch(1600, () => a.keyboard.press("Space"));
// 2) double jump: the second press once A's own (predicted) height passes 1.2 m, i.e. near the top
result.double = await watch(2200, async () => {
  await a.keyboard.press("Space");
  await a.waitForFunction(() => globalThis.__numinia.session.selfPosition(1).y > 1.2, null, { timeout: 3000, polling: 10 }).catch(() => {});
  await a.keyboard.press("Space");
});

// 3) walk against run: same 1.5 s, measured on A's own predicted position, plus the speed read half-way
const here = () => a.evaluate(() => { const p = globalThis.__numinia.session.selfPosition(1); return [p.x, p.z]; });
const move = async (keys) => {
  const p0 = await here();
  for (const k of keys) await a.keyboard.down(k);
  await sleep(750);
  const speed = await a.evaluate(() => globalThis.__numinia.session.selfPosition(1).speed);
  await sleep(750);
  for (const k of [...keys].reverse()) await a.keyboard.up(k);
  await sleep(300);
  const p1 = await here();
  return { metres: r2(Math.hypot(p1[0] - p0[0], p1[1] - p0[1])), speed: r2(speed) };
};
result.walk = await move(["KeyW"]);
result.run = await move(["Shift", "KeyW"]);
result.ratio = r2(result.run.metres / Math.max(0.01, result.walk.metres));
await sleep(500);
const A2 = await a.evaluate(() => { const n = globalThis.__numinia; return { corrections: n.session.stats.corrections, probe: n.probe, format: n.session.welcome.format, y: n.session.selfPosition(1).y }; });
result.corrections = A2.corrections;
result.probe = { browser: A2.probe.browser.toString(16), server: A2.probe.server.toString(16), equal: A2.probe.browser === A2.probe.server };
result.format = A2.format;
await ctx.close();

// 4) VR: an emulated Quest 3 presses A (right controller): the avatar jumps and lands again
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const vctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
await vctx.addInitScript(IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
const v = await vctx.newPage();
v.on("pageerror", (e) => errors.push(String(e)));
result.vr = { entered: false, maxY: 0, landed: false };
try {
  await v.goto(BASE);
  await v.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 30000 });
  await v.waitForFunction(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, { timeout: 5000 });
  await v.evaluate(() => document.getElementById("vr").click());
  await v.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 });
  result.vr.entered = true;
  await sleep(1000);
  await v.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("a-button", 1));
  await v.waitForFunction(() => globalThis.__numinia.session.selfPosition(1).y > 0.5, null, { timeout: 5000, polling: 10 }).catch(() => {});
  result.vr.maxY = r2(await v.evaluate(() => globalThis.__numinia.session.selfPosition(1).y));
  await v.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("a-button", 0));
  await v.waitForFunction(() => globalThis.__numinia.session.selfPosition(1).y === 0, null, { timeout: 5000 }).catch(() => {});
  result.vr.landed = await v.evaluate(() => globalThis.__numinia.session.selfPosition(1).y === 0);
  result.vr.corrections = await v.evaluate(() => globalThis.__numinia.session.stats.corrections);
  await v.evaluate(() => globalThis.__numinia.view.vr.exit());
} catch (e) { result.vr.error = String(e).split("\n")[0]; }
await vctx.close();
await browser.close();

const ok = result.single.max > 0.5 && result.single.last === 0
  && result.double.max > result.single.max + 0.5 && result.double.last === 0
  && result.walk.metres > 3 && result.ratio >= 1.5 && result.ratio <= 2.5
  && Math.abs(result.walk.speed - 4) < 0.1 && Math.abs(result.run.speed - 8) < 0.1
  && result.corrections === 0 && result.probe.equal && result.format === 2
  && result.vr.entered && result.vr.maxY > 0.5 && result.vr.landed && result.vr.corrections === 0
  && errors.length === 0;
console.log(JSON.stringify(result, null, 1));
console.log(ok ? "E2E SALTO OK" : "E2E SALTO FALLA");
process.exit(ok ? 0 : 1);
