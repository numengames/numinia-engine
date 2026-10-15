// e2e for AR (J8): the IWER emulator (Meta, MIT) plays a Quest 3 with a flat floor. Checks: no WebXR = no button and
// no errors; with AR = button, floor found, object placed, session ends by itself. Needs `npm run server` + `npm run dev`.
// Usage: taskset -c 0-1 nice -n 19 node tools/e2e-ar.mjs
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? "/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work/archive-world-agent/web/node_modules/playwright-core";
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const results = {};
const shown = () => getComputedStyle(document.getElementById("ar")).display !== "none";

// 1) a device without WebXR (iPhone, desktop Safari): the page works and offers no AR
{
  const p = await (await browser.newContext({ viewport: { width: 480, height: 300 } })).newPage();
  p.on("pageerror", (e) => errors.push(String(process.env.STACK ? e.stack : e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 30000 });
  await p.waitForTimeout(500);
  results.noXrButtonHidden = !(await p.evaluate(shown));
  await p.close();
}

// 2) emulated Quest 3 with a floor 1.5 m in front of the gaze ray
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  await ctx.addInitScript(IWER + `;
    class Floor { constructor(d) { this.d = d; this.environmentCanvas = document.createElement("canvas"); } render() {}
      computeHitTestResults() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[14] = -1.5; return [m]; } }
    // IWER's base layer has a null framebuffer (it draws on the default one); three needs a real object to bind
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.installSEM(Floor); globalThis.__iwer = dev;`);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(process.env.STACK ? e.stack : e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await p.goto(BASE + (BASE.includes("?") ? "&" : "?") + "armax=6000");
  await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 30000 });
  await p.waitForFunction(shown, null, { timeout: 5000 }).catch(() => {});
  results.arButtonShown = await p.evaluate(shown);
  if (results.arButtonShown) {
    const ar = () => p.evaluate(() => globalThis.__numinia.view.ar.state);
    await p.evaluate(() => document.getElementById("ar").click());
    await p.waitForFunction(() => globalThis.__numinia.view.ar.state === "ready", null, { timeout: 15000 }).catch(() => {});
    results.afterEnter = await ar();
    await p.evaluate(() => { const c = globalThis.__iwer.controllers.right; c.updateButtonValue("trigger", 1); setTimeout(() => c.updateButtonValue("trigger", 0), 150); });
    await p.waitForFunction(() => globalThis.__numinia.view.ar.state === "placed", null, { timeout: 8000 }).catch(() => {});
    results.afterTrigger = await ar();
    await p.waitForFunction(() => globalThis.__numinia.view.ar.state === "off", null, { timeout: 12000 }).catch(() => {});
    results.afterTimeout = await ar();
  }
  await ctx.close();
}
await browser.close();
results.errors = errors;
const ok = results.noXrButtonHidden && results.arButtonShown && results.afterEnter === "ready" && results.afterTrigger === "placed" && results.afterTimeout === "off" && errors.length === 0;
console.log(JSON.stringify(results, null, 1));
console.log(ok ? "E2E AR OK" : "E2E AR FALLA");
process.exit(ok ? 0 : 1);
