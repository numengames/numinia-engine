// medir-recorrido (lote13 t_f3f9e61a): what the per-frame walk of the scene costs in a loaded world. three's renderer calls
// scene.updateMatrixWorld() at the start of every render: it visits EVERY node and, for each one with matrixAutoUpdate (the
// default), composes its local matrix and multiplies it into the world matrix — whether it moved or not. This leg counts the
// nodes, times that walk in the page (many calls, mean ms), times the frame's own CPU draw cost (the live meter, `cpuMs`) and
// reports the walk as a share of it. Run it on the same world before and after a change, in the same conditions: SwiftShader
// ms are only relative, the JS walk is a real CPU cost (CPU-throttle it with TASA to see a phone-class one).
// Env: BASE, CHROME, ESPERA (ms of load, 12000), VENTANA (ms of meter, 6000), TASA (CPU throttle rate, default 1 and 4), LABEL, OUT.
import { createRequire } from "node:module";
import { existsSync, writeFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = (BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&")) + "&medidor";
const ESPERA = Number(process.env.ESPERA ?? 12000), VENTANA = Number(process.env.VENTANA ?? 6000);
const TASAS = (process.env.TASA ?? "1,4").split(",").map(Number);
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], r = { etiqueta: process.env.LABEL ?? "", ok: false, filas: [] };
try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
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
      const n = globalThis.__numinia; const escena = n.view.scene;
      let nodos = 0, auto = 0, mallas = 0, visibles = 0;
      escena.traverse((o) => { nodos++; if (o.matrixAutoUpdate) auto++; if (o.isMesh) mallas++; if (o.visible) visibles++; });
      // who the nodes that still compose are: by type, the kind of node and what its parent is (top 8)
      const quien = new Map(); escena.traverse((o) => { if (!o.matrixAutoUpdate) return; const k = `${o.type}${o.isMesh ? "" : o.children.length ? "+hijos" : "(vacio)"} <- ${o.parent?.type ?? "-"}${o.parent?.name ? ":" + o.parent.name.slice(0, 18) : ""}`; quien.set(k, (quien.get(k) ?? 0) + 1); });
      const quienes = [...quien.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      // the walk as the renderer does it each frame (nothing forced), many times; the first calls warm the JIT
      const caminar = (veces) => { const t = performance.now(); for (let i = 0; i < veces; i++) escena.updateMatrixWorld(); return (performance.now() - t) / veces; };
      caminar(50);
      const sinForzar = caminar(300);
      const t1 = performance.now(); for (let i = 0; i < 100; i++) escena.updateMatrixWorld(true); const forzado = (performance.now() - t1) / 100;
      // upper bound of the cheap win: every node below a thing frozen (matrixAutoUpdate off), timed, then put back exactly as it was
      const antes = []; escena.traverse((o) => antes.push([o, o.matrixAutoUpdate]));
      for (const [o] of antes) { if (o.matrixAutoUpdate) o.updateMatrix(); o.matrixAutoUpdate = false; }
      caminar(50); const congelado = caminar(300);
      for (const [o, v] of antes) o.matrixAutoUpdate = v;
      const s = n.medidorVivo.resumen();
      return { quienes, nodos, matrixAutoUpdate: auto, mallas, visibles, caminarMs: Math.round(sinForzar * 1000) / 1000, caminarForzadoMs: Math.round(forzado * 1000) / 1000, todoCongeladoMs: Math.round(congelado * 1000) / 1000, cpuMsP50: s.cpuMs.p50, cuadroMsP50: s.cuadroMs.p50, fps: s.fps, llamadas: s.llamadas.ultima, cuadros: s.cuadros };
    });
    x.tasa = tasa; x.parteDelCuadro = x.cpuMsP50 > 0 ? Math.round((x.caminarMs / x.cpuMsP50) * 1000) / 10 + " %" : null;
    r.filas.push(x); console.error(JSON.stringify(x));
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  r.ok = errors.length === 0; r.errors = errors;
} catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
await browser.close();
const salida = JSON.stringify(r, null, 1);
if (process.env.OUT) writeFileSync(process.env.OUT, salida);
console.log(salida);
process.exit(r.ok ? 0 : 1);
