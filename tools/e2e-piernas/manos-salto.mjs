// e2e leg (MIS-200 t_8d0bc2dd, lote vr-2 «manos»): jump with the hands. An emulated Quest 3 (IWER, MIT) switches to TRACKED
// HANDS; the emulated hands are driven with known kinematics (a 5 ms timer sets their position from performance.now(), a
// minimum-jerk rise like a real flick). Both hands flicked up together make the avatar jump and land; one hand, a slow
// raise of both, and lowering the arms do not; holding the hands up after landing does not repeat; flicking again after
// bringing them down jumps again. Controllers (A/X) still jump and a swung pair of controllers does not.
// Needs the server + page running (BASE=http://…/?webgl2&server=ws://… as tools/auto.sh e2e gives). Prints JSON, exit 0 only if right.
// The machine must be quiet: a stalled frame in a 200 ms swing makes the positive case re-run (up to 3 attempts, printed).
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&");
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], fallos = [], out = { errors, fallos, pasos: [] };
const afirma = (ok, que, dato) => { if (!ok) fallos.push({ que, dato }); return ok; };
const r2 = (v) => Math.round(v * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
await ctx.addInitScript(IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
  const mj = (u) => { u = Math.min(1, Math.max(0, u)); return 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5; }; // minimum-jerk: the shape of a real flick
  // Move the emulated hands/controllers (modo: "hands" | "controllers") vertically: the ones in lados go from y0 by alto (m, + is up)
  // over dur ms, minimum-jerk; the others stay at y0. Resolves with the largest speed COMMANDED (m/s), for the report.
  globalThis.__subir = ({ modo, lados, y0, alto, dur, retraso = 0 }) => new Promise((ok) => {
    const ins = modo === "hands" ? globalThis.__iwer.hands : globalThis.__iwer.controllers, t0 = performance.now();
    const r = globalThis.__numinia.view.vr.rig.position;
    const id = setInterval(() => {
      const t = performance.now() - t0;
      for (const l of ["left", "right"]) {
        const u = lados.includes(l) ? (t - (l === "right" ? retraso : 0)) / dur : 0;
        ins[l].position.set(l === "left" ? -0.25 : 0.25, y0 + alto * mj(u) - r.y, -0.3);
      }
      if (t >= dur + retraso + 60) { clearInterval(id); ok(1.875 * Math.abs(alto) / (dur / 1000)); }
    }, 5);
  });
  globalThis.__quietas = (modo, y) => { const ins = modo === "hands" ? globalThis.__iwer.hands : globalThis.__iwer.controllers, r = globalThis.__numinia.view.vr.rig.position; for (const l of ["left", "right"]) ins[l].position.set(l === "left" ? -0.25 : 0.25, y - r.y, -0.3); };`);
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(String(e)));
p.on("crash", () => errors.push("page crash"));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
const ctl = (code, arg) => p.evaluate(code, arg);
const esperar = (fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms });
const alto = () => ctl(() => globalThis.__numinia.session.selfPosition(1).y);
/** Highest the avatar gets during `ms` ms of polling while `act` runs. */
async function maximo(act, ms = 1800) {
  const fin = Date.now() + ms; let max = 0;
  const a = act();
  while (Date.now() < fin) { max = Math.max(max, await alto()); await sleep(25); }
  await a;
  return r2(max);
}
const aterrizado = () => esperar(() => globalThis.__numinia.session.selfPosition(1).y === 0, null, 6000).catch(() => {});

try {
  await p.goto(BASE);
  await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000);
  await esperar(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, 8000);
  await ctl(() => document.getElementById("vr").click());
  await esperar(() => globalThis.__numinia.view.vr.active, null, 15000);
  await sleep(800);
  // diagnostics: every time the hands module asks for a jump, keep the last frames' wrist heights (commanded) and the clock
  await ctl(() => {
    const m = globalThis.__numinia.view.manos, antes = m.takeSalto.bind(m), rec = [];
    globalThis.__saltos = []; globalThis.__fase = "inicio";
    const tick = () => { rec.push([Math.round(performance.now()), +globalThis.__iwer.hands.left.position.y.toFixed(3), +globalThis.__iwer.hands.right.position.y.toFixed(3)]); if (rec.length > 24) rec.shift(); requestAnimationFrame(tick); };
    tick();
    m.takeSalto = () => { const r = antes(); if (r) globalThis.__saltos.push({ fase: globalThis.__fase, t: Math.round(performance.now()), ultimos: rec.slice(-8) }); return r; };
  });
  const fase = (f) => ctl((f) => { globalThis.__fase = f; }, f);
  // 1. controllers: A still jumps; two controllers swung up do NOT (they have A/X)
  await ctl(() => globalThis.__quietas("controllers", 1.0)); await sleep(400);
  out.mandosSacudidos = await maximo(() => ctl(() => globalThis.__subir({ modo: "controllers", lados: ["left", "right"], y0: 1.0, alto: 0.4, dur: 200 })));
  afirma(out.mandosSacudidos === 0, "two swung controllers do not jump", out.mandosSacudidos);
  await ctl(() => globalThis.__iwer.controllers.right.updateButtonValue("a-button", 1));
  out.botonA = await maximo(async () => {}, 900);
  await ctl(() => globalThis.__iwer.controllers.right.updateButtonValue("a-button", 0));
  afirma(out.botonA > 0.3, "A still jumps", out.botonA); await aterrizado();
  // 2. tracked hands
  await ctl(() => { globalThis.__iwer.primaryInputMode = "hand"; });
  await esperar(() => { const e = globalThis.__numinia.view.manos.estado(); return e.izq?.tipo === "mano" && e.der?.tipo === "mano"; }, null, 8000);
  await ctl(() => globalThis.__quietas("hands", 1.0)); await sleep(700); // a calm read arms the detector
  await aterrizado(); await sleep(500); // (the hands arriving at 1 m from wherever they were may count once: let it land)
  await fase("reposo"); out.reposo = await maximo(async () => {}, 900);
  afirma(out.reposo === 0, "hands at rest do not jump", out.reposo);
  // one hand flicked
  await fase("unaMano"); out.unaMano = await maximo(() => ctl(() => globalThis.__subir({ modo: "hands", lados: ["right"], y0: 1.0, alto: 0.5, dur: 200 })));
  afirma(out.unaMano === 0, "one hand flicked does not jump", out.unaMano);
  await ctl(() => globalThis.__quietas("hands", 1.0)); await sleep(500);
  // both raised slowly (0.5 m in 1.2 s)
  await fase("lenta"); out.lenta = await maximo(() => ctl(() => globalThis.__subir({ modo: "hands", lados: ["left", "right"], y0: 1.0, alto: 0.5, dur: 1200 })), 2200);
  afirma(out.lenta === 0, "a slow raise of both does not jump", out.lenta);
  // lowered fast from up there
  await fase("bajar"); out.bajar = await maximo(() => ctl(() => globalThis.__subir({ modo: "hands", lados: ["left", "right"], y0: 1.5, alto: -0.5, dur: 200 })));
  afirma(out.bajar === 0, "lowering the arms does not jump", out.bajar);
  await sleep(500);
  // both flicked up together: a jump (re-run up to 3 times on a busy machine)
  out.intentos = [];
  for (let n = 0; n < 3; n++) {
    await ctl(() => globalThis.__quietas("hands", 1.0)); await sleep(700);
    await fase("dosManos"); const m = await maximo(() => ctl(() => globalThis.__subir({ modo: "hands", lados: ["left", "right"], y0: 1.0, alto: 0.4, dur: 200, retraso: 30 })), 1400);
    out.intentos.push(m);
    if (m > 0.3) break;
    await aterrizado();
  }
  out.dosManos = out.intentos[out.intentos.length - 1];
  afirma(out.dosManos > 0.3, "both hands flicked up make the avatar jump", out.intentos);
  await aterrizado();
  out.aterriza = (await alto()) === 0;
  afirma(out.aterriza, "and it lands", await alto());
  // the hands stay up: no repeat
  await fase("arribaQuietas"); out.arribaQuietas = await maximo(async () => {}, 2000);
  afirma(out.arribaQuietas === 0, "hands held up do not repeat the jump", out.arribaQuietas);
  // down (slowly), then flicked again: a second jump
  await ctl(() => globalThis.__subir({ modo: "hands", lados: ["left", "right"], y0: 1.4, alto: -0.4, dur: 1200 }));
  await sleep(600);
  await fase("otraVez"); out.otraVez = await maximo(() => ctl(() => globalThis.__subir({ modo: "hands", lados: ["left", "right"], y0: 1.0, alto: 0.4, dur: 200 })), 1400);
  afirma(out.otraVez > 0.3, "after bringing them down, a new flick jumps again", out.otraVez);
  await aterrizado();
  out.saltos = await ctl(() => globalThis.__saltos);
  out.corrections = await ctl(() => globalThis.__numinia.session.stats.corrections);
  afirma(out.corrections === 0, "the server never corrected the jumps", out.corrections);
  await ctl(() => globalThis.__numinia.view.vr.exit());
} catch (e) { fallos.push({ que: "exception", dato: String(e).split("\n")[0] }); }
await browser.close();
afirma(errors.length === 0, "0 page errors", errors);
out.ok = fallos.length === 0;
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
