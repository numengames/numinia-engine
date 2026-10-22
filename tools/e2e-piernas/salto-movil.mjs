// e2e leg «salto-movil»: on a phone (touch emulation, 390x844) the jump works while a finger is already on the
// walking stick. Case 1: one finger on the big action button (nothing near, so it is «Saltar») jumps. Case 2: finger
// 1 holds the stick pushed forward, finger 2 taps the big button: it must jump (pointerdown, not click, because with a
// finger on the stick the browser may not send the click). Case 3: same through «…» then «Saltar». Case 4: a tap
// jumps ONCE (the click that follows must not make a second, higher jump). Gets BASE (?webgl2&server=…) from
// tools/auto.sh e2e. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const errors = [];
const result = { errors, casos: {} };

/** A fresh phone page; returns helpers to hold a finger on the stick and tap a point with another finger. */
async function telefono() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  await sleep(1500);
  const cdp = await ctx.newCDPSession(p);
  const J = { x: 80, y: 640, id: 1 };
  const alto = () => p.evaluate(() => globalThis.__numinia.session.selfPosition(1).y);
  /** Highest point reached during `ms`, sampled every 30 ms, and how many separate times the avatar left the ground. */
  const vigilar = (ms) => (async () => {
    let max = 0, saltos = 0, enAire = false; const t0 = Date.now();
    while (Date.now() - t0 < ms) { const y = await alto(); max = Math.max(max, y); if (y > 0.05 && !enAire) { saltos++; enAire = true; } if (y <= 0.02) enAire = false; await sleep(25); }
    return { max: r2(max), saltos };
  })();
  const sujetarPalo = async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 80, y: 690, id: 1 }] }); await sleep(100);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [J] }); await sleep(500);
  };
  const tocar = async (x, y, conPalo) => {
    const dedo = { x, y, id: 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: conPalo ? [J, dedo] : [dedo] }); await sleep(90);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [dedo] }); // the finger that lifts is the one listed
  };
  const soltarPalo = () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [J] });
  const centro = async (sel) => { const b = await (await p.$(sel)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  return { ctx, p, sujetarPalo, soltarPalo, tocar, vigilar, centro };
}

try {
  { // 1) alone: one finger on the big button
    const t = await telefono();
    const [x, y] = await t.centro("#accion"); const v = t.vigilar(1800); await t.tocar(x, y, false);
    result.casos.solo = await v; await t.ctx.close();
  }
  { // 2) walking: the stick is held, a second finger taps the big button
    const t = await telefono();
    await t.sujetarPalo();
    const [x, y] = await t.centro("#accion"); const v = t.vigilar(1800); await t.tocar(x, y, true);
    result.casos.andando = await v; await t.soltarPalo(); await t.ctx.close();
  }
  { // 3) walking: the stick is held, «…» then «Saltar» in the menu
    const t = await telefono();
    await t.sujetarPalo();
    { const [mx, my] = await t.centro("#mas"); await t.tocar(mx, my, true); } await sleep(400);
    const [x, y] = await t.centro('#mas-menu [data-id="saltar"]'); const v = t.vigilar(1800);
    await t.tocar(x, y, true);
    result.casos.menu = await v; await t.soltarPalo(); await t.ctx.close();
  }
} catch (e) { result.error = String(e).split("\n")[0]; }
await browser.close();

const c = result.casos;
result.ok = !result.error && errors.length === 0 &&
  c.solo?.max > 0.5 && c.solo?.saltos === 1 &&
  c.andando?.max > 0.5 && c.andando?.saltos === 1 &&
  c.menu?.max > 0.5 && c.menu?.saltos === 1;
// one tap = one jump, not two: a double jump reaches well over 1.5 m
result.ok = result.ok && c.solo.max < 2.2 && c.andando.max < 2.2 && c.menu.max < 2.2;
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
