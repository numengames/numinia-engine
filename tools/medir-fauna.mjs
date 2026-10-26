// medir-fauna (lote13 t_2f633444): what the procedural background creatures (butterflies, fireflies, birds: no GLB, no texture —
// packages/render/src/naturaleza/{mariposas,aves}.ts) cost in a live nature world, read from the live meter and the nature's own
// stats. Run it against a world with `naturaleza.json` fauna on and again with `{"fauna":{"activa":false}}` and compare (same
// conditions: SwiftShader ms only compare runs of THE SAME conditions). Phone class (level D) by default, CPU throttle by TASAS.
// Env: BASE, CHROME, TASAS ("1,4"), MOVIL=0, ESPERA (ms, 14000), VENTANA (ms, 9000), LABEL, OUT.
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = (BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&")) + "&medidor";
const MOVIL = process.env.MOVIL !== "0", TASAS = (process.env.TASAS ?? "1,4").split(",").map(Number);
const ESPERA = Number(process.env.ESPERA ?? 14000), VENTANA = Number(process.env.VENTANA ?? 9000);
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], r = { etiqueta: process.env.LABEL ?? "", clase: MOVIL ? "movil (nivel D)" : "escritorio", ok: false, filas: [] };
try {
  const ctx = await browser.newContext(MOVIL ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 800, height: 500 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(a);
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 90000 });
  await a.waitForTimeout(ESPERA);
  for (const tasa of TASAS) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: tasa });
    await a.evaluate(() => globalThis.__numinia.medidorVivo.reiniciar());
    await a.waitForTimeout(VENTANA);
    const x = await a.evaluate(() => {
      const n = globalThis.__numinia, s = n.medidorVivo.resumen(), nat = n.view.naturaleza.estadisticas?.() ?? null;
      let hojasFauna = 0; n.view.scene.traverse((o) => { if (/mariposa|luci[eé]rnaga|ave|insecto|fauna/i.test(o.name || "")) hojasFauna++; });
      return { fps: s.fps, cuadroMsP50: s.cuadroMs.p50, cpuMsP50: s.cpuMs.p50, cpuMsMax: s.cpuMs.max, llamadas: s.llamadas.ultima, cuadros: s.cuadros, tris: n.view.renderer.info.render.triangles, nat, objetosFauna: hojasFauna, activa: n.view.naturaleza.activa };
    });
    x.tasa = tasa; r.filas.push(x); console.error(JSON.stringify({ tasa, fps: x.fps, cpu: x.cpuMsP50, llamadas: x.llamadas, fauna: x.nat?.triangulos?.fauna, total: x.nat?.triangulos?.total, activa: x.activa }));
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  r.ok = errors.length === 0; r.errors = errors;
} catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
await browser.close();
const salida = JSON.stringify(r, null, 1);
if (process.env.OUT) writeFileSync(process.env.OUT, salida);
console.log(salida);
process.exit(r.ok ? 0 : 1);
