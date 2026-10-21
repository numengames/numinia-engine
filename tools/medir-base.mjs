// medir.mjs — B7: mide (a) base+naturaleza, (b) solo base, (c) solo plano, en UNA sesión, con los interruptores de la página.
// Uso: TMPDIR=/tmp node medir.mjs [salida.json]   (bajo flock cache/scratch/fotos.lock). Swiftshader: valen calls/triángulos/ms de JS/objetos/bytes, NO fps ni GPU.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
const P = process.env.P ?? "/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work";
const MOTOR = process.env.MOTOR ?? `${P}/numinia-engine-wt-coherencia/`;
const PW = `${MOTOR}node_modules/playwright-core`;
const CACHES = ["/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/home/.cache/ms-playwright", "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright"];
const CHROME = CACHES.map((c) => `${c}/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`).find(existsSync);
const BASE = process.env.BASE ?? "http://127.0.0.1:5335/?webgl2&pulso=2000&server=ws://127.0.0.1:8895";
const FOTOS = process.env.FOTOS ?? `${P}/coherencia-base/fotos/`; mkdirSync(FOTOS, { recursive: true });
const SALIDA = process.argv[2] ?? `${P}/coherencia-base/medir.json`;
const { chromium } = createRequire(import.meta.url)(PW);
const b = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errores = []; p.on("pageerror", (e) => errores.push(String(e)));
await p.addInitScript(() => localStorage.setItem("numinia.novedades.version", "999.0.0"));
await p.goto(BASE, { waitUntil: "load", timeout: 60000 });
const estado = () => p.evaluate(() => { const n = globalThis.__numinia, v = n?.view; return { welcome: !!n?.session?.welcome, base: !!v?.espacioBase?.activa, nat: !!v?.naturaleza?.activa, carga: document.getElementById("carga")?.hidden ?? null }; });
let e; for (let i = 0; i < 80; i++) { await p.waitForTimeout(1000); e = await estado(); if (e.welcome && e.carga === true && e.base && e.nat) break; }
console.log("inicio", JSON.stringify(e));
// the world may have been left with a switch off by an earlier test: bring it to the state (a) through the page's own switches, and say so
const inicial = { ...e }; let encendidos = [];
async function pulsar(id, quiere) {
  const s = await estado(); const on = id.startsWith("naturaleza") ? s.nat : s.base;
  const r = await p.evaluate(({ id, quiere, on }) => { const x = document.getElementById(id); if (!x) return "sin botón"; if (on !== quiere) x.click(); return `${id} ${on}->${quiere}`; }, { id, quiere, on });
  console.log("pulsar", r); return r;
}
async function esperar(base, nat) { for (let i = 0; i < 60; i++) { await p.waitForTimeout(500); const s = await estado(); if (s.base === base && s.nat === nat) return s; } return await estado(); }
if (!e.base) { await pulsar("espacio-base-interruptor", true); encendidos.push("base"); }
if (!e.nat) { await pulsar("naturaleza-interruptor", true); encendidos.push("naturaleza"); }
if (encendidos.length) { e = await esperar(true, true); console.log("tras encender", encendidos.join("+"), JSON.stringify(e)); }
if (!(e.base && e.nat)) { console.log("ABORTO: no llega a base+naturaleza"); await b.close(); process.exit(2); }
// bytes: resource timing once, right after load settles (all three states share the same downloads)
await p.waitForTimeout(3000);
const bytes = await p.evaluate(() => { const r = performance.getEntriesByType("resource"); let tr = 0, enc = 0, dec = 0; for (const x of r) { tr += x.transferSize || 0; enc += x.encodedBodySize || 0; dec += x.decodedBodySize || 0; } const nav = performance.getEntriesByType("navigation")[0]; return { recursos: r.length, transferSize: tr + (nav?.transferSize || 0), encodedBodySize: enc + (nav?.encodedBodySize || 0), decodedBodySize: dec + (nav?.decodedBodySize || 0) }; });
// wrap per-frame hooks reachable from the view, to count calls and ms in each state
await p.evaluate(() => {
  const v = globalThis.__numinia.view; globalThis.__t = {};
  for (const k of ["espacioBase", "naturaleza"]) { const o = v[k]; if (!o || typeof o.actualizar !== "function" || o.__w) continue; const f = o.actualizar.bind(o); globalThis.__t[k] = { n: 0, ms: 0 }; o.actualizar = (dt) => { const t0 = performance.now(); f(dt); const c = globalThis.__t[k]; c.n++; c.ms += performance.now() - t0; }; o.__w = 1; }
  // the scene root: climb from the base group while it exists (kept for states without a base)
  let o = v.espacioBase?.grupo; while (o?.parent) o = o.parent; globalThis.__raiz = o;
});
const configs = [["a", "base + naturaleza"], ["b", "solo base"], ["c", "solo plano"]];
const out = { carga: (await import("node:fs")).readFileSync("/proc/loadavg", "utf8").trim(), bytes, estados: {}, errores: [], inicial, encendidosAntes: encendidos };
for (const [k, nombre] of configs) {
  if (k === "b") { await pulsar("naturaleza-interruptor", false); await esperar(true, false); }
  if (k === "c") { await pulsar("espacio-base-interruptor", false); await esperar(false, false); }
  await p.waitForTimeout(5000); // rest
  await p.evaluate(() => { for (const t of Object.values(globalThis.__t)) { t.n = 0; t.ms = 0; } });
  const m = await p.evaluate(() => new Promise((res) => {
    const n = globalThis.__numinia, v = n.view; const cpu = [], raf = []; let prev = null, rafN = 0, drawn = 0; const t0 = performance.now(); const gc0 = performance.now();
    const paso = () => { const c = n.cost(); if (c !== prev) { prev = c; drawn++; if (typeof c.cpuMs === "number") cpu.push(c.cpuMs); } rafN++;
      if (rafN < 180) requestAnimationFrame(paso); else {
        const dur = performance.now() - t0;
        // count scene objects
        let meshes = 0, lines = 0, points = 0, instanced = 0, instancias = 0, groups = 0, total = 0, vis = 0;
        let r = v.espacioBase?.grupo ?? globalThis.__raiz; while (r?.parent) r = r.parent;
        r.traverse((o) => { total++; if (o.visible) vis++; if (o.isInstancedMesh) { instanced++; instancias += o.count; } if (o.isMesh) meshes++; else if (o.isLine || o.isLineSegments) lines++; else if (o.isPoints) points++; else if (o.isGroup) groups++; });
        const s = [...cpu].sort((a, b) => a - b);
        const mem = performance.memory ? { usedJSHeapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), totalJSHeapMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1) } : null;
        const hooks = {}; for (const [k, t] of Object.entries(globalThis.__t)) hooks[k] = { llamadas: t.n, msTotal: +t.ms.toFixed(3), msPorLlamada: t.n ? +(t.ms / t.n).toFixed(5) : 0 };
        res({ lastFrame: v.lastFrame(), cuadrosDibujados: drawn, rafs: rafN, rafSegundos: +(dur / 1000).toFixed(2), cpuMs: { n: cpu.length, media: s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) : null, mediana: s.length ? s[s.length >> 1] : null, p95: s.length ? s[Math.floor(s.length * 0.95)] : null }, objetos: { total, visibles: vis, meshes, lineas: lines, puntos: points, instanced, instancias, grupos: groups }, memoria: mem, hooks,
          eb: v.espacioBase?.estadisticas?.(), nat: v.naturaleza?.estadisticas?.() ? { triangulos: v.naturaleza.estadisticas().triangulos, llamadas: v.naturaleza.estadisticas().llamadas, arboles: v.naturaleza.estadisticas().arboles } : null });
      } };
    requestAnimationFrame(paso);
  }));
  m.estado = await estado(); m.nombre = nombre;
  await p.screenshot({ path: `${FOTOS}medir-${k}.png` });
  out.estados[k] = m; console.log(k, JSON.stringify({ calls: m.lastFrame.calls, tri: m.lastFrame.triangles, cpu: m.cpuMs, obj: m.objetos, mem: m.memoria, hooks: m.hooks, dibujados: m.cuadrosDibujados }));
}
// leave the world as it was
await pulsar("espacio-base-interruptor", true); await pulsar("naturaleza-interruptor", true);
out.final = await esperar(true, true); console.log("final", JSON.stringify(out.final));
out.cargaFin = readFileSync("/proc/loadavg", "utf8").trim(); out.errores = errores.slice(0, 5);
writeFileSync(SALIDA, JSON.stringify(out, null, 1)); console.log("guardado", SALIDA, "errores", errores.length);
await b.close();
