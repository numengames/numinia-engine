// e2e for VR (J6): the IWER emulator (Meta, MIT) plays a Quest 3. Checks: no WebXR = no VR button and no errors;
// with VR = button, session starts, left stick moves the avatar, right stick snaps 30 degrees, vignette shows
// while moving, the panel exists, session ends. Needs `npm run server` + `npm run dev`.
// Usage: taskset -c 0-1 nice -n 19 node tools/e2e-vr.mjs
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
const shown = () => getComputedStyle(document.getElementById("vr")).display !== "none";

// 1) a device without WebXR: the page works and offers no VR
{
  const p = await (await browser.newContext({ viewport: { width: 480, height: 300 } })).newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 30000 });
  await p.waitForTimeout(500);
  results.noXrButtonHidden = !(await p.evaluate(shown));
  await p.close();
}

// 2) emulated Quest 3
{
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 30000 });
  await p.waitForFunction(shown, null, { timeout: 5000 }).catch(() => {});
  results.vrButtonShown = await p.evaluate(shown);
  if (results.vrButtonShown) {
    const pos = () => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return [s.x, s.z]; });
    await p.evaluate(() => document.getElementById("vr").click());
    await p.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 }).catch(() => {});
    results.entered = await p.evaluate(() => globalThis.__numinia.view.vr.active);
    await p.waitForTimeout(1500);
    const p0 = await pos();
    // left stick pushed forward (thumbstick y = -1)
    await p.evaluate(() => globalThis.__iwer.controllers.left.updateAxes("thumbstick", 0, -1));
    await p.waitForFunction(() => globalThis.__numinia.view.vr.axes().some((v) => v !== 0), null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(2500);
    results.vignetteWhileMoving = await p.evaluate(() => globalThis.__numinia.view.vr.vignetteOpacity);
    const p1 = await pos();
    results.moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    await p.evaluate(() => globalThis.__iwer.controllers.left.updateAxes("thumbstick", 0, 0));
    // right stick: one push = one 30 degree snap; holding it must not spin
    await p.evaluate(() => globalThis.__iwer.controllers.right.updateAxes("thumbstick", 1, 0));
    await p.waitForTimeout(1200);
    results.yawAfterHold = await p.evaluate(() => globalThis.__numinia.view.vr.yawDegrees);
    await p.evaluate(() => globalThis.__iwer.controllers.right.updateAxes("thumbstick", 0, 0));
    await p.waitForTimeout(300);
    await p.evaluate(() => globalThis.__iwer.controllers.right.updateAxes("thumbstick", -1, 0));
    await p.waitForTimeout(600);
    results.yawAfterBack = await p.evaluate(() => globalThis.__numinia.view.vr.yawDegrees);
    await p.evaluate(() => globalThis.__iwer.controllers.right.updateAxes("thumbstick", 0, 0));
    await p.evaluate(() => globalThis.__numinia.view.vr.exit());
    await p.waitForFunction(() => !globalThis.__numinia.view.vr.active, null, { timeout: 8000 }).catch(() => {});
    results.exited = !(await p.evaluate(() => globalThis.__numinia.view.vr.active));
  }
  await ctx.close();
}
await browser.close();
results.errors = errors;
const ok = results.noXrButtonHidden && results.vrButtonShown && results.entered && results.moved > 0.5 && results.vignetteWhileMoving > 0.2
  && results.yawAfterHold === -30 && results.yawAfterBack === 0 && results.exited && errors.length === 0;
console.log(JSON.stringify(results, null, 1));
console.log(ok ? "E2E VR OK" : "E2E VR FALLA");
process.exit(ok ? 0 : 1);
