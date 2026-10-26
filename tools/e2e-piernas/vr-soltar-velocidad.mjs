// e2e leg (N3 + N4, Pablo's VR recording of 18-10): IWER emulates a Quest 3 with controllers.
// N3 «soltar»: a thing the right hand carries (a piece registered on the real hands layer) is let go by CLICKING AND HOLDING the right
//   thumbstick for 0.5 s (a short click does nothing; the left stick, whose hand carries nothing, does nothing); the Bolsa row «Soltar»
//   does the same without a stick.
// N4 velocidad: «Velocidad al andar en VR» goes to 200 % (a value above is refused), and the left stick pushed the same way moves the
//   avatar clearly faster than at 100 % and never faster than the published cap (limits.json vr_stick_speed_cap: 200 % of 1.5 m/s).
// Load-proof like manos.mjs: speeds are measured over sim time (the page's frames), not the wall clock alone. Env: BASE, CHROME, PW_CORE.
import { createRequire } from "node:module";
import { existsSync, readFileSync, globSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&");
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const LIM = JSON.parse(readFileSync(new URL("../../limits.json", import.meta.url), "utf8")).limits.find((l) => l.key === "vr_stick_speed_cap");
const SPEED = 1.5; // the sim's walking pace, m/s
const TOPE = SPEED * (LIM.value / 100); // 3 m/s

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], out = { pasos: [], errors };
const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
await ctx.addInitScript(IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
  globalThis.__xrFrames = 0; const rafXR = IWER.XRSession.prototype.requestAnimationFrame;
  IWER.XRSession.prototype.requestAnimationFrame = function (cb) { return rafXR.call(this, (t, f) => { globalThis.__xrFrames++; return cb(t, f); }); };`);
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const ctl = (code, arg) => p.evaluate(code, arg);
const esperar = (fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms });
const yo = () => ctl(() => globalThis.__numinia.session.selfPosition(1));
const clic = (lado, v) => ctl(([l, v]) => globalThis.__iwer.controllers[l].updateButtonValue("thumbstick", v), [lado, v]);

let sentido = -1; // each walk goes the other way (stick forward, then back): the avatar never reaches the world's edge
/** Push the left stick (empuje, 0-1) and read what the page tells the sim: the push and the run flag, as m/s (the sim's own paces:
 *  walking 1.5, running 4). That is deterministic; the avatar's measured speed over the wall clock is not on a loaded machine (the
 *  page's frame is clamped to 250 ms of sim time, as manos.mjs explains), so it is logged for the report but never judged. */
async function andar(s, empuje = 0.9) {
  sentido = -sentido;
  await ctl((e) => globalThis.__iwer.controllers.left.updateAxes("thumbstick", 0, e), empuje * sentido);
  await esperar(() => globalThis.__numinia.view.vr.axes().some((v) => v !== 0), null, 8000).catch(() => {});
  await p.waitForTimeout(500);
  const dicho = await ctl(([ms1, ms2]) => { const v = globalThis.__numinia.view.vr, [x, z] = v.axes(); return { empuje: Math.hypot(x, z), correr: v.correr(), ms: Math.hypot(x, z) * (v.correr() ? ms2 : ms1) }; }, [SPEED, 4]);
  const a = await yo(), t0 = Date.now();
  await p.waitForTimeout(s * 1000);
  const b = await yo(), dt = (Date.now() - t0) / 1000;
  await ctl(() => globalThis.__iwer.controllers.left.updateAxes("thumbstick", 0, 0));
  await p.waitForTimeout(600);
  return { ...dicho, medida: Math.hypot(b.x - a.x, b.z - a.z) / dt };
}
const marca = (paso, extra = {}) => out.pasos.push({ paso, ...extra });

let ok = false;
try {
  await p.goto(BASE);
  await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who && !!globalThis.__numinia.ajustes, null, 30000);
  await esperar(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, 8000);
  await esperar(() => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, 15000).catch(() => {});
  await ctl(() => document.getElementById("vr").click());
  await esperar(() => globalThis.__numinia.view.vr.active, null, 15000);
  await p.waitForTimeout(800);

  // ── N4: the setting ──
  out.ajuste = await ctl(() => { const a = globalThis.__numinia.ajustes; const d = a.lista().find((s) => s.id === "controles.velocidadVR"); return { max: d?.max, min: d?.min, defecto: d?.defecto, valor: a.get("controles.velocidadVR") }; });
  out.sobreElTope = await ctl(() => { const r = globalThis.__numinia.ajustes.set("controles.velocidadVR", 250); return { ok: r.ok, valor: globalThis.__numinia.ajustes.get("controles.velocidadVR") }; });
  await ctl(() => globalThis.__numinia.ajustes.set("controles.velocidadVR", 100));
  await p.waitForTimeout(300);
  out.vel100 = await andar(2);
  await ctl(() => globalThis.__numinia.ajustes.set("controles.velocidadVR", 200));
  await p.waitForTimeout(300);
  out.velView = await ctl(() => globalThis.__numinia.view.vr.velocidad);
  out.vel200 = await andar(2);
  await ctl(() => globalThis.__numinia.ajustes.set("controles.velocidadVR", 150));
  await p.waitForTimeout(300);
  out.vel150 = await andar(2);
  await ctl(() => globalThis.__numinia.ajustes.set("controles.velocidadVR", 200));
  await p.waitForTimeout(300);
  out.velBorde200 = await andar(2, 1); // the stick's edge still runs, at the running pace, whatever the setting
  await ctl(() => globalThis.__numinia.ajustes.set("controles.velocidadVR", 100));
  marca("velocidad", { dicho: [out.vel100.ms, out.vel150.ms, out.vel200.ms, out.velBorde200.ms], medida: [out.vel100.medida, out.vel150.medida, out.vel200.medida, out.velBorde200.medida], tope: TOPE });

  // ── N3: let go ──
  // a thing in the right hand: a piece on the real hands layer, as the rod / the dart / a quest thing are
  await ctl(() => {
    globalThis.__cosa = { lado: "der", soltadas: 0 };
    globalThis.__numinia.view.manos.llevable("e2e-cosa", { que: "la cosa de prueba", lado: () => globalThis.__cosa.lado, puede: () => true, pasar: (a) => { globalThis.__cosa.lado = a; },
      soltar: () => { globalThis.__cosa.lado = null; globalThis.__cosa.soltadas++; return true; } });
  });
  const cosa = () => ctl(() => ({ ...globalThis.__cosa, lleva: globalThis.__numinia.view.manos.llevando().map((x) => x.que) }));
  await clic("right", 1); await p.waitForTimeout(250); await clic("right", 0); await p.waitForTimeout(300);
  out.tras_clic_corto = await cosa();
  await clic("left", 1); await p.waitForTimeout(900); await clic("left", 0); await p.waitForTimeout(300);
  out.tras_izquierda = await cosa();
  await clic("right", 1);
  await esperar(() => globalThis.__cosa.soltadas > 0, null, 6000).catch(() => {});
  out.tras_mantener = await cosa();
  await p.waitForTimeout(1200);
  out.sigue_apretada = await cosa(); // held on: it must not drop twice
  await clic("right", 0);
  marca("soltar con la palanca", { corto: out.tras_clic_corto.soltadas, izq: out.tras_izquierda.soltadas, mantenida: out.tras_mantener.soltadas });

  // the Bolsa row «Soltar»
  await ctl(() => { globalThis.__cosa.lado = "izq"; });
  out.bolsa = await ctl(() => { const f = globalThis.__numinia.view.vr; return { hay: typeof globalThis.__numinia.view.manos.soltar === "function" }; });
  out.botonSoltar = await ctl(() => { const r = globalThis.__numinia.view.manos.soltar(); return { ...r, soltadas: globalThis.__cosa.soltadas, lleva: globalThis.__numinia.view.manos.llevando().length }; });

  await ctl(() => globalThis.__numinia.view.vr.exit());
  await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000).catch(() => {});

  const a = out.ajuste, v1 = out.vel100.ms, v1_5 = out.vel150.ms, v2 = out.vel200.ms, near = (x, y) => Math.abs(x - y) < 0.1 * y + 0.05;
  ok = a.max === 200 && a.min === 40 && a.defecto === 100 && out.sobreElTope.valor === 100 && out.sobreElTope.ok === false && out.velView === 2
    && near(v1, SPEED * 0.9) && near(v1_5, SPEED * 0.9 * 1.5) && near(v2, SPEED * 0.9 * 2) && v2 <= TOPE && !out.vel100.correr && out.vel200.correr && out.velBorde200.correr && near(out.velBorde200.ms, 4)
    && out.tras_clic_corto.soltadas === 0 && out.tras_izquierda.soltadas === 0 && out.tras_mantener.soltadas === 1 && out.tras_mantener.lado === null
    && out.sigue_apretada.soltadas === 1 && out.botonSoltar.ok === true && out.botonSoltar.soltadas === 2 && out.botonSoltar.lleva === 0
    && errors.length === 0;
} catch (e) { errors.push("leg: " + String(e?.message ?? e)); }
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "E2E VR SOLTAR Y VELOCIDAD OK" : "E2E VR SOLTAR Y VELOCIDAD FALLA");
process.exit(ok ? 0 : 1);
