// medir-gente (lote13 t_89ef3813 / t_e91a73ea): frames per second and draw cost with N remote people at a given distance,
// on a phone-class page (level D) with Chromium's CPU throttled (Emulation.setCPUThrottlingRate), read from the live meter
// (`__numinia.medidorVivo`, lote12) — no server bots: the people are laid out client-side by wrapping `view.sync`, so the
// distances are exact (the real bots only roam ±20 m). The people stand in an arc in front of the camera (default 30°, `arco`) and pace ±1.2 m (~1.4 m/s).
// Env: BASE (page with ?webgl2&server=...), CHROME, ESCENAS (JSON [{n, r0, r1, nombre, arco?}], default below), TASAS (CPU throttle
// rates, default "1,4"), MOVIL=0 (desktop class instead of phone/level D), ESPERA (ms of load, 9000), VENTANA (ms measured, 9000),
// LABEL, OUT (JSON file). Not a phone: SwiftShader draws on the CPU, so milliseconds only compare runs of THE SAME conditions.
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = (BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&")) + "&medidor";
const MOVIL = process.env.MOVIL !== "0";
const TASAS = (process.env.TASAS ?? "1,4").split(",").map(Number);
const ESPERA = Number(process.env.ESPERA ?? 9000), VENTANA = Number(process.env.VENTANA ?? 9000);
const ESCENAS = process.env.ESCENAS ? JSON.parse(process.env.ESCENAS) : [
  { nombre: "nadie", n: 0, r0: 0, r1: 0 },
  { nombre: "20 a 6 m", n: 20, r0: 6, r1: 6 },
  { nombre: "20 a 36 m", n: 20, r0: 36, r1: 36 },
  { nombre: "50 (3-60 m)", n: 50, r0: 3, r1: 60 },
  { nombre: "200 (3-60 m)", n: 200, r0: 3, r1: 60 },
];
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], r = { etiqueta: process.env.LABEL ?? "", clase: MOVIL ? "movil (nivel D)" : "escritorio", ok: false, filas: [] };
try {
  const ctx = await browser.newContext(MOVIL ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 800, height: 500 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const cdp = await ctx.newCDPSession(a);
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 90000 });
  await a.waitForTimeout(4000);
  r.aparato = await a.evaluate(() => ({ movil: globalThis.__numinia.view.power?.stats?.mobile ?? null, cupo: globalThis.__numinia.view.avatares().cupo, ancho: innerWidth }));
  // the layout wrapper: extra people handed to the view's own sync, in front of the real list
  await a.evaluate(() => {
    const v = globalThis.__numinia.view, orig = v.sync.bind(v), f = (globalThis.__gente = { lista: [], t0: performance.now() });
    v.sync = (self, list) => {
      if (!self || !f.lista.length) return orig(self, list);
      const t = (performance.now() - f.t0) / 1000, d = v.camera.getWorldDirection(new v.camera.position.constructor()), centro = Math.atan2(d.z, d.x);
      // spread over an arc IN FRONT of the camera (worst case: nobody is culled), each one pacing ±1.2 m (~1.4 m/s)
      return orig(self, [...list, ...f.lista.map((p) => { const th = centro + p.fr + (1.2 / Math.max(2, p.r)) * Math.sin(1.2 * t + p.fase); return { id: p.id, x: self.x + p.r * Math.cos(th), z: self.z + p.r * Math.sin(th), y: 0 }; })]);
    };
  });
  for (const tasa of TASAS) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: tasa });
    for (const e of ESCENAS) {
      await a.evaluate((e) => {
        const f = globalThis.__gente; f.lista = [];
        for (let i = 0; i < e.n; i++) {
          const k = e.n > 1 ? i / (e.n - 1) : 0;
          // equal area between r0 and r1 (a flat sunflower), so 200 people spread over the ground, not a ring
          const r = e.r1 === e.r0 ? e.r0 : Math.sqrt(e.r0 ** 2 + k * (e.r1 ** 2 - e.r0 ** 2));
          f.lista.push({ id: 100000 + i, r, fr: ((i * 0.618034) % 1 - 0.5) * (e.arco ?? 30) * Math.PI / 180, fase: i * 1.7 });
        }
      }, e);
      await a.waitForTimeout(ESPERA * (e.n ? 1 : 0.4));
      await a.evaluate(() => { const m = globalThis.__numinia.medidorVivo; m.reiniciar(); });
      await a.waitForTimeout(VENTANA);
      const x = await a.evaluate(() => {
        const n = globalThis.__numinia, m = n.medidorVivo, av = n.view.avatares(), s = m.resumen(), c = m.censo(), pw = n.view.power?.stats ?? {};
        return { resumen: s, personasLlamadas: c?.porCategoria?.personas, nombresLlamadas: c?.porCategoria?.nombres, lotes: c?.porCategoria?.lotes, censoLlamadas: c?.llamadas,
          vrm: { dibujados: av.dibujados, cupo: av.cupo, cerca: av.lista.filter((q) => q.dibujado && q.cerca).length, lejos: av.lista.filter((q) => q.dibujado && !q.cerca).length },
          power: { scale: pw.scale, emaCostMs: pw.emaCostMs, targetFps: pw.targetFps, mobile: pw.mobile }, tris: n.view.renderer.info.render.triangles };
      });
      const fila = { tasa, escena: e.nombre, n: e.n, fps: x.resumen.fps, cuadroMsP50: x.resumen.cuadroMs.p50, cuadroMsP99: x.resumen.cuadroMs.p99, cpuMsP50: x.resumen.cpuMs.p50, cpuMsMax: x.resumen.cpuMs.max, cuadros: x.resumen.cuadros,
        llamadas: x.resumen.llamadas.ultima, vrm: x.vrm, personas: x.personasLlamadas, nombres: x.nombresLlamadas?.llamadas, lotes: x.lotes?.llamadas, power: x.power, tris: x.tris };
      r.filas.push(fila);
      console.error(JSON.stringify({ tasa, escena: e.nombre, fps: fila.fps, p50: fila.cuadroMsP50, cpu: fila.cpuMsP50, llamadas: fila.llamadas, vrm: fila.vrm }));
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
  r.ok = errors.length === 0; r.errors = errors;
} catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
await browser.close();
const salida = JSON.stringify(r, null, 1);
if (process.env.OUT) writeFileSync(process.env.OUT, salida);
console.log(salida);
process.exit(r.ok ? 0 : 1);
