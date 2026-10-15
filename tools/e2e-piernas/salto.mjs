// e2e leg J2 (salto): two real tabs against the running server + page. A presses Space: tab B sees A rise above
// 0.5 m and come back to 0; a double jump (Space again near the top) climbs higher than a single one; Shift+W for
// 1.5 s goes about twice as far as W alone (and reads ~8 m/s against ~4); Space typed in a text box is not a jump;
// A's prediction makes 0 corrections; the browser's replay fingerprint equals the server's. Then a phone (touch
// emulation): the «Saltar» button jumps and the stick pushed to its edge runs. Then an emulated Quest 3 (IWER, MIT):
// the A button jumps. Gets BASE (?webgl2&server=…) and SERVER_HTTP from tools/auto.sh e2e. Prints JSON; exit 0 only
// when all is right.
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

/** What B draws of A: its height every ~20 ms while `act` runs, then until B has seen A go above 0.5 m and land
 * again (at most `ms`). A busy machine slows a page's ticks, and an avatar only advances on its own inputs. */
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
  for (const t0 = Date.now(); Date.now() - t0 < ms && !(Math.max(0, ...ys) > 0.5 && ys[ys.length - 1] === 0); ) await sleep(50);
  stop = true; await sampler;
  return { max: r2(Math.max(0, ...ys)), last: ys.length ? ys[ys.length - 1] : null, samples: ys.length };
};

// 1) single jump
result.single = await watch(6000, () => a.keyboard.press("Space"));
// 2) double jump: the second press once A's own (predicted) height passes 1.2 m, i.e. near the top
result.double = await watch(6000, async () => {
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
// 4) typing is not jumping: Space inside a text box (the chat to come) writes a space and A stays on the ground
await a.evaluate(() => { const box = document.createElement("input"); box.id = "prueba-texto"; document.body.appendChild(box); });
await a.bringToFront();
await a.focus("#prueba-texto");
await a.keyboard.press("Space");
let typedMaxY = 0;
for (let i = 0; i < 40; i++) { typedMaxY = Math.max(typedMaxY, await a.evaluate(() => globalThis.__numinia.session.selfPosition(1).y)); await sleep(25); }
result.typing = await a.evaluate((y) => {
  const box = document.getElementById("prueba-texto"), r = { value: box.value, focused: document.activeElement === box, maxY: y };
  box.remove(); return r;
}, typedMaxY);
await sleep(300);
// 5) Space on a focused button (e.g. after clicking «Construir» with the mouse) jumps and does not click the button
await a.evaluate(() => { const b = document.createElement("button"); b.id = "prueba-boton"; b.textContent = "x"; b.dataset.clics = "0"; b.onclick = () => { b.dataset.clics = String(Number(b.dataset.clics) + 1); }; document.body.appendChild(b); });
await a.focus("#prueba-boton");
await a.keyboard.press("Space");
await a.waitForFunction(() => globalThis.__numinia.session.selfPosition(1).y > 0.5, null, { timeout: 5000, polling: 10 }).catch(() => {});
result.focusedButton = await a.evaluate(() => { const b = document.getElementById("prueba-boton"), r = { clicks: Number(b.dataset.clics), y: Math.round(globalThis.__numinia.session.selfPosition(1).y * 100) / 100 }; b.remove(); return r; });
await a.waitForFunction(() => globalThis.__numinia.session.selfPosition(1).y === 0, null, { timeout: 5000 }).catch(() => {});
await sleep(500);
const A2 = await a.evaluate(() => { const n = globalThis.__numinia; return { corrections: n.session.stats.corrections, probe: n.probe, format: n.session.welcome.format, y: n.session.selfPosition(1).y }; });
result.corrections = A2.corrections;
result.probe = { browser: A2.probe.browser.toString(16), server: A2.probe.server.toString(16), equal: A2.probe.browser === A2.probe.server };
result.format = A2.format;
await ctx.close();

// 6) a phone: the «Saltar» button jumps (a real button, first in #acciones) and the stick pushed to its edge runs
const tctx = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
const t = await tctx.newPage();
t.on("pageerror", (e) => errors.push(String(e)));
result.touch = { button: false, maxY: 0, edgeSpeed: 0, halfSpeed: 0 };
try {
  await t.goto(BASE);
  await t.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  result.touch.button = await t.evaluate(() => { const b = document.getElementById("saltar"); return !!b && b.tagName === "BUTTON" && b.textContent === "Saltar"; });
  await t.tap("#saltar");
  await t.waitForFunction(() => globalThis.__numinia.session.selfPosition(1).y > 0.5, null, { timeout: 5000, polling: 10 }).catch(() => {});
  result.touch.maxY = r2(await t.evaluate(() => globalThis.__numinia.session.selfPosition(1).y));
  await sleep(1200);
  // a finger on the canvas, dragged 30 px (walk) and then 80 px (past the 45 px edge: run)
  const drag = (dy) => t.evaluate((dy) => {
    const ev = (type, y) => new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: 200, clientY: y, bubbles: true });
    if (dy === 0) { dispatchEvent(ev("pointerdown", 400)); return; }
    if (dy < 0) { dispatchEvent(ev("pointerup", 400)); return; }
    dispatchEvent(ev("pointermove", 400 - dy));
  }, dy);
  await drag(0); await drag(30); await sleep(600);
  result.touch.halfSpeed = r2(await t.evaluate(() => globalThis.__numinia.session.selfPosition(1).speed));
  await drag(80); await sleep(600);
  result.touch.edgeSpeed = r2(await t.evaluate(() => globalThis.__numinia.session.selfPosition(1).speed));
  await drag(-1);
  result.touch.corrections = await t.evaluate(() => globalThis.__numinia.session.stats.corrections);
} catch (e) { result.touch.error = String(e).split("\n")[0]; }
await tctx.close();

// 7) VR: an emulated Quest 3 presses A (right controller): the avatar jumps and lands again
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
  && result.typing.value === " " && result.typing.maxY === 0 && result.focusedButton.clicks === 0 && result.focusedButton.y > 0.5
  && result.touch.button && result.touch.maxY > 0.5 && result.touch.halfSpeed > 2 && result.touch.halfSpeed < 4.1
  && Math.abs(result.touch.edgeSpeed - 8) < 0.1 && result.touch.corrections === 0
  && result.vr.entered && result.vr.maxY > 0.5 && result.vr.landed && result.vr.corrections === 0
  && errors.length === 0;
console.log(JSON.stringify(result, null, 1));
console.log(ok ? "E2E SALTO OK" : "E2E SALTO FALLA");
process.exit(ok ? 0 : 1);
