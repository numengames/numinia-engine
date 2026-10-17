// e2e for mixed reality detected from the SESSION, not from the button (bug found live on Pablo's Quest,
// 2026-10-17): a device can serve an immersive-vr session (the plain "Entrar en VR" button) with
// environmentBlendMode = "alpha-blend" (its own passthrough toggled on at the system level) — ar.ts never ran,
// but the room is still mixed in. The engine must notice from the session itself and hide the world the same
// way AR does, so `view.ar.state !== "off"` (and the new `view.ar.activo()`) become true no matter which button
// opened the session. Needs `npm run server` + `npm run dev`.
// Usage: taskset -c 0-1 nice -n 19 node tools/e2e-mezclada.mjs
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const results = {};

const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
await ctx.addInitScript(IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3);
  // A Quest with room passthrough on at the system level: its plain VR session reports alpha-blend, same as the
  // one Pablo measured live (alchemiststower build 84069eb, 2026-10-17). Entered through the VR button, not AR.
  dev[IWER.P_DEVICE].environmentBlendModes["immersive-vr"] = "alpha-blend";
  dev.installRuntime({ forceInstall: true });
  globalThis.__iwer = dev;`);
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await p.goto(BASE);
await p.waitForFunction(() => globalThis.__numinia?.session.entity >= 0, null, { timeout: 30000 });
await p.waitForFunction(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, { timeout: 5000 }).catch(() => {});

const ar = () => p.evaluate(() => ({ state: globalThis.__numinia.view.ar.state, activo: globalThis.__numinia.view.ar.activo() }));
results.antes = await ar(); // off, before entering anything
await p.evaluate(() => document.getElementById("vr").click()); // the VR button — NOT the AR one
await p.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 }).catch(() => {});
results.vrActivo = await p.evaluate(() => globalThis.__numinia.view.vr.active);
await p.waitForFunction(() => globalThis.__numinia.view.ar.state === "mezclada", null, { timeout: 8000 }).catch(() => {});
results.conVr = await ar(); // the bug: this used to stay { state: "off", activo: false }
await p.evaluate(() => globalThis.__numinia.view.vr.exit());
await p.waitForFunction(() => globalThis.__numinia.view.ar.state === "off", null, { timeout: 8000 }).catch(() => {});
results.trasSalir = await ar();
await ctx.close();
await browser.close();

results.errors = errors;
const ok = results.antes.state === "off" && !results.antes.activo && results.vrActivo
  && results.conVr.state === "mezclada" && results.conVr.activo === true
  && results.trasSalir.state === "off" && !results.trasSalir.activo && errors.length === 0;
console.log(JSON.stringify(results, null, 1));
console.log(ok ? "E2E MEZCLADA OK" : "E2E MEZCLADA FALLA");
process.exit(ok ? 0 : 1);
