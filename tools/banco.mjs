#!/usr/bin/env node
// banco de pruebas gráfico (v1) — the runner. Starts the bench page (apps/banco, its own Vite on --puerto), opens ONE
// headless Chromium, and for every configuration — the bare scene («base»), each technique alone, and all together —
// loads a fresh page, flies the fixed camera path at 100 % and 50 % resolution and reads the page's numbers
// (apps/banco/main.ts). Rounds alternate the order of the configurations so a slow drift of the machine does not land on
// one technique. Writes informes/banco/banco-<UTC>.json + .md (informes/ is git-ignored) and prints the table.
//
//   flock <cerrojo> nice node tools/banco.mjs [--tecnicas niebla,sombras] [--backend webgpu,webgl2] [--rondas 3]
//        [--cuadros 240] [--calentar 40] [--tam 3360x1760] [--nivel B] [--puerto 5801] [--gpu real|swiftshader]
//   node tools/banco.mjs --sonda            only says which GPU each backend gets, and whether it has GPU timers
//
// Chromium: CHROME=<path to chrome> or Playwright's default install. One browser at a time on the machine: wrap the run
// in flock (docs/BANCO-GRAFICO.md). On a headless box the GPU flags below give the real GPU to WebGL2 (ANGLE on Vulkan)
// and to WebGPU (Dawn on Vulkan); --gpu swiftshader forces the software path (then GPU ms mean nothing).
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import os from "node:os";

const repo = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const PUERTO = Number(opt("puerto", process.env.BANCO_PUERTO ?? 5801));
const RONDAS = Math.max(1, Number(opt("rondas", 3)));
const CUADROS = Number(opt("cuadros", 240)), CALENTAR = Number(opt("calentar", 40));
const TAM = opt("tam", "3360x1760"), NIVEL = opt("nivel", "B");
const BACKENDS = opt("backend", "webgpu,webgl2").split(",").filter(Boolean);
const GPU = opt("gpu", "real");
const SALIDA = join(repo, opt("salida", "informes/banco"));

// Chromium puts its singleton socket under TMPDIR; a deep TMPDIR overflows the 108-byte socket path and it aborts
if ((process.env.TMPDIR ?? "").length > 60) process.env.TMPDIR = "/tmp";

const FLAGS_BASE = ["--no-sandbox", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "--disable-gpu-sandbox"];
const FLAGS = {
  // Chrome's headless-GPU recipe (developer.chrome.com/blog/supercharge-web-ai-testing). Measured 2026-10-19 in a
  // podman container with /dev/dri + /dev/nvidia*: WebGL2 = ANGLE on Vulkan on the NVIDIA card with
  // EXT_disjoint_timer_query_webgl2; WebGPU = Dawn on Vulkan, same card, with timestamp-query. Developer features: the
  // Chrome docs say timestamps are otherwise rounded to 100 µs (here sub-µs values came back even without it; kept on).
  real: [...FLAGS_BASE, "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--enable-webgpu-developer-features"],
  swiftshader: [...FLAGS_BASE, "--use-gl=swiftshader", "--enable-webgl"],
};

const { chromium } = await import("playwright-core");
function chrome() {
  if (process.env.CHROME) return process.env.CHROME;
  try { const p = chromium.executablePath(); if (existsSync(p)) return p; } catch { /* no default install */ }
  throw new Error("banco: no encuentro Chromium. Pon CHROME=/ruta/a/chrome (p. ej. …/ms-playwright/chromium-1248/chrome-linux64/chrome).");
}

let vite = null;
async function arrancarVite() {
  const bin = join(repo, "node_modules/vite/bin/vite.js");
  vite = spawn(process.execPath, [bin, "--config", join(repo, "apps/banco/vite.config.mjs")], { cwd: repo, env: { ...process.env, BANCO_PUERTO: String(PUERTO) }, stdio: ["ignore", "inherit", "inherit"] });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PUERTO}/`); if (r.ok) return; } catch { /* not up yet */ }
    if (vite.exitCode !== null) throw new Error(`banco: vite salió con ${vite.exitCode} (¿puerto ${PUERTO} ocupado?)`);
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("banco: vite no contesta");
}
let browser = null;
async function cerrar() { await browser?.close().catch(() => {}); browser = null; if (vite && vite.exitCode === null) vite.kill("SIGTERM"); }
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { cerrar().finally(() => process.exit(130)); });

async function pagina(params) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errores = [];
  p.on("pageerror", (e) => errores.push(String(e.message).slice(0, 300)));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:${PUERTO}/?${new URLSearchParams(params)}`);
  await p.waitForFunction(() => window.__banco?.estado.listo || window.__banco?.estado.error, null, { timeout: 120000 });
  const err = await p.evaluate(() => window.__banco.estado.error);
  if (err) { await p.close(); throw new Error(`banco: la página falló (${params.on || "base"}, ${params.backend}): ${err}`); }
  return { p, errores };
}

async function sonda() {
  const out = {};
  for (const b of ["webgpu", "webgl2"]) {
    const { p } = await pagina({ backend: b, cuadros: 10, calentar: 5, tam: "640x360" });
    out[b] = await p.evaluate(() => window.__banco.estado.info);
    await p.close();
  }
  return out;
}

const commit = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo }).toString().trim(); } catch { return "?"; } })();
const carga = () => readFileSync("/proc/loadavg", "utf8").split(" ").slice(0, 3).map(Number);
const med = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : NaN; };

const DESDE = opt("desde", null); // re-make the table (statistics included) from an earlier report's raw data, no browser
try {
  let medida;
  if (DESDE) {
    const prev = JSON.parse(readFileSync(DESDE, "utf8"));
    medida = { crudo: prev.crudo, configs: [...new Map(prev.crudo.map((x) => [x.config, { nombre: x.config, on: x.on }])).values()], cargaAntes: prev.maquina.cargaAntes, cargaDespues: prev.maquina.cargaDespues, fecha: prev.fecha, commit: prev.commit, opciones: prev.opciones };
    medida.configs.sort((x, y) => (x.nombre === "base" ? -1 : y.nombre === "base" ? 1 : x.nombre === "todas" ? 1 : y.nombre === "todas" ? -1 : 0));
  } else medida = await medirTodo();
  const informe = estadistica(medida);
  const base = DESDE ? DESDE.replace(/\.json$/, "") : join(SALIDA, `banco-${informe.fecha.replace(/[:.]/g, "-")}`);
  if (!DESDE) { mkdirSync(SALIDA, { recursive: true }); writeFileSync(`${base}.json`, JSON.stringify(informe, null, 1)); }
  const md = tabla(informe);
  writeFileSync(`${base}.md`, md);
  console.log(md);
  console.error(`\nescrito ${DESDE ? "" : `${base}.json y `}${base}.md`);
} catch (e) {
  console.error(String(e?.stack ?? e));
  await cerrar();
  process.exit(1);
}
await cerrar();

async function medirTodo() {
  await arrancarVite();
  browser = await chromium.launch({ executablePath: chrome(), headless: true, args: FLAGS[GPU] ?? FLAGS.real });
  if (flag("sonda")) { console.log(JSON.stringify(await sonda(), null, 2)); await cerrar(); process.exit(0); }

  const { p: p0 } = await pagina({ backend: BACKENDS[0], cuadros: 10, calentar: 5, tam: "64x64" });
  const todas = await p0.evaluate(() => window.__banco.tecnicas());
  await p0.close();
  const ids = opt("tecnicas", todas.map((t) => t.id).join(",")).split(",").filter(Boolean);
  const configs = [{ nombre: "base", on: [] }, ...ids.map((id) => ({ nombre: id, on: [id] })), ...(ids.length > 1 ? [{ nombre: "todas", on: ids }] : [])];
  const cargaAntes = carga();
  const crudo = [];
  for (let r = 0; r < RONDAS; r++) {
    const orden = configs.map((_, i) => configs[(i + r) % configs.length]); // rotate: no technique always runs first or last
    for (const backend of BACKENDS) for (const c of orden) {
      const { p, errores } = await pagina({ backend, on: c.on.join(","), nivel: NIVEL, tam: TAM, cuadros: CUADROS, calentar: CALENTAR });
      const res = await p.evaluate(() => window.__banco.medir({ escalas: [1, 0.5] }));
      if (flag("fotos") && r === 0) { mkdirSync(SALIDA, { recursive: true }); await p.screenshot({ path: join(SALIDA, `foto-${backend}-${c.nombre}.png`) }); }
      await p.close();
      crudo.push({ ronda: r, backend, config: c.nombre, on: c.on, errores, ...res });
      const e1 = res.porEscala["1"];
      console.error(`ronda ${r + 1}/${RONDAS} ${backend} ${c.nombre.padEnd(15)} gpu ${e1.gpuMs?.mediana?.toFixed(3) ?? "—"} ms · cpu ${e1.cpuRenderMs?.mediana?.toFixed(3)} ms · ${e1.drawCalls?.mediana} llamadas${errores.length ? ` · ${errores.length} errores` : ""}`);
    }
  }
  const cargaDespues = carga();
  await cerrar();
  return { crudo, configs, cargaAntes, cargaDespues, fecha: new Date().toISOString(), commit, opciones: { RONDAS, CUADROS, CALENTAR, TAM, NIVEL, BACKENDS, GPU, flags: FLAGS[GPU] } };
}

// ---- statistics: per backend × configuration × scale, the median over rounds of each round's median ----
function estadistica({ crudo, configs, cargaAntes, cargaDespues, fecha, commit, opciones }) {
  const backends = [...new Set(crudo.map((x) => x.backend))];
  const filas = [];
  for (const backend of backends) for (const c of configs) {
    const rs = crudo.filter((x) => x.backend === backend && x.config === c.nombre);
    if (!rs.length) continue;
    const esc = (e, k, s = "mediana") => rs.map((x) => x.porEscala[e]?.[k]?.[s]);
    const fila = { backend, config: c.nombre, on: c.on, info: rs[0].info, cuentas: rs[0].cuentas, errores: rs.flatMap((x) => x.errores).slice(0, 5) };
    for (const e of ["1", "0.5"]) {
      const g = esc(e, "gpuMs").filter(Number.isFinite), gp95 = esc(e, "gpuMs", "p95");
      fila[e] = { px: rs[0].porEscala[e].px, gpu: med(g), gpuMin: g.length ? Math.min(...g) : NaN, gpuMax: g.length ? Math.max(...g) : NaN, gpuP95: med(gp95),
        cpu: med(esc(e, "cpuRenderMs")), cpuTec: med(esc(e, "cpuTecnicasMs")), llamadas: med(esc(e, "drawCalls")), triangulos: med(esc(e, "triangulos")), cuadrosConGpu: med(rs.map((x) => x.porEscala[e].cuadrosConGpu)), rafaga: med(rs.map((x) => x.porEscala[e].rafagaMs)) };
    }
    const m = rs[0].memoria;
    fila.memoria = { geometrias: m.geometries, texturas: m.textures, programas: m.programs, bytes: m.total ?? null, texturasBytes: m.texturesSize ?? null };
    filas.push(fila);
  }
  for (const f of filas) { // deltas against the bare scene of the same backend
    const b = filas.find((x) => x.backend === f.backend && x.config === "base");
    for (const e of ["1", "0.5"]) { f[e].dGpu = f[e].gpu - b[e].gpu; f[e].dCpu = f[e].cpu - b[e].cpu; }
    // noise = how far the rounds' medians spread (base and this one), floor 2 µs; a delta counts above twice the noise
    const ruido = Math.max(0.002, b["1"].gpuMax - b["1"].gpuMin, f["1"].gpuMax - f["1"].gpuMin);
    const frac = (f["0.5"].px[0] * f["0.5"].px[1]) / (f["1"].px[0] * f["1"].px[1]);
    // share of the technique's GPU cost that scales with pixels: 1 = all fragment (fill-rate), 0 = none (vertex/fixed)
    f.partePixeles = f.config !== "base" && f["1"].dGpu > 2 * ruido ? Math.max(0, Math.min(1, (f["1"].dGpu - f["0.5"].dGpu) / (f["1"].dGpu * (1 - frac)))) : null;
    f.ruidoMs = ruido;
    // the GPU timer cannot be trusted if it says more than the back-to-back control, or if rounds disagree by > 50 %
    f.temporizador = !Number.isFinite(f["1"].gpu) ? "sin dato" : f["1"].rafaga && f["1"].gpuMax > f["1"].rafaga * 1.05 ? "supera la ráfaga" : f["1"].gpuMax > 1.5 * f["1"].gpuMin ? "inestable" : "ok";
  }
  return { fecha, commit, maquina: { cpus: os.cpus().length, modelo: os.cpus()[0]?.model, cargaAntes, cargaDespues }, opciones, filas, crudo };
}

function tabla(inf) {
  const n = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
  const s = (x, d = 3) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(d) : "—");
  const k = (x) => (Number.isFinite(x) ? (x >= 1000 ? `${(x / 1000).toFixed(1)} k` : String(Math.round(x))) : "—");
  const out = [];
  out.push(`# Banco gráfico — ${inf.fecha.slice(0, 16).replace("T", " ")} UTC · commit ${inf.commit}`, "");
  out.push(`Nivel ${inf.opciones.NIVEL} · ${inf.opciones.TAM} px al 100 % · ${inf.opciones.CUADROS} cuadros por pasada tras ${inf.opciones.CALENTAR} de calentamiento · ${inf.opciones.RONDAS} rondas (mediana de medianas) · carga ${inf.maquina.cargaAntes.join(" ")} → ${inf.maquina.cargaDespues.join(" ")} (${inf.maquina.cpus} hilos)`, "");
  for (const backend of [...new Set(inf.filas.map((f) => f.backend))]) {
    const fs = inf.filas.filter((f) => f.backend === backend);
    if (!fs.length) continue;
    const i = fs[0].info;
    out.push(`## ${i.backend}${i.backend.toLowerCase() !== backend ? ` (¡pedido ${backend}!)` : ""} — ${i.gpu || "GPU desconocida"} — temporizador GPU: ${i.timestamps ? "sí" : "NO"}`, "");
    const malas = fs.filter((f) => f.temporizador !== "ok").length;
    if (malas) out.push(`> ⚠ En ${malas} de ${fs.length} filas el temporizador GPU no pasa el control: en este backend, aquí, los ms de GPU no sirven; valen llamadas, triángulos, CPU y memoria.`, "");
    out.push("| Configuración | Llamadas | Triángulos | GPU ms 100 % | Δ GPU | GPU ms 50 % | Δ GPU 50 % | Parte que escala con píxeles | Temporizador | CPU ms render | Δ CPU | ms/cuadro en ráfaga | Geometrías | Texturas |");
    out.push("|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|");
    for (const f of fs) {
      const a = f["1"], b = f["0.5"];
      out.push(`| ${f.config} | ${k(a.llamadas)} | ${k(a.triangulos)} | ${n(a.gpu)} (${n(a.gpuMin)}–${n(a.gpuMax)}) | ${f.config === "base" ? "" : s(a.dGpu)} | ${n(b.gpu)} | ${f.config === "base" ? "" : s(b.dGpu)} | ${f.partePixeles === null ? (f.config === "base" ? "" : "bajo el ruido") : `${Math.round(f.partePixeles * 100)} %`} | ${f.temporizador} | ${n(a.cpu)} | ${f.config === "base" ? "" : s(a.dCpu)} | ${n(a.rafaga)} | ${f.memoria.geometrias} | ${f.memoria.texturas} |`);
    }
    out.push("");
  }
  out.push("Cómo leer: GPU ms = todas las pasadas de render del cuadro (sombra incluida), medidas con consultas de tiempo de la GPU; Δ = frente a «base» del mismo backend. «Parte que escala con píxeles» compara el Δ al 100 % y al 50 % de resolución por eje (25 % de píxeles): 100 % = coste de fragmentos (fill-rate), 0 % = coste de vértices o fijo. CPU ms render = lo que tarda la llamada renderer.render() en el hilo principal. «ms/cuadro en ráfaga» = el mismo recorrido dibujado seguido con una sola espera a la GPU al final: es max(CPU, GPU) por cuadro y sirve de control (si el temporizador GPU da más que esto, el temporizador miente: columna «Temporizador» = «supera la ráfaga»; «inestable» = las rondas difieren más del 50 %). Un Δ cuenta si supera dos veces el ruido (lo que se separan las rondas, mínimo 2 µs). Los ms absolutos son de ESTA GPU de escritorio: no son ms de Quest; sirven para ordenar técnicas y ver su tipo de coste. Método: docs/BANCO-GRAFICO.md.");
  return out.join("\n") + "\n";
}
