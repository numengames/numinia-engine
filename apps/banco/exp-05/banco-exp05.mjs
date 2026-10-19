#!/usr/bin/env node
// E05 runner: carga apps/banco/exp-05 en los tres modos (actual/directa/byte), 3 configs x N rondas, WebGPU real.
// flock <scratch>/fotos.lock node tools/banco-exp05.mjs [--rondas 3] [--cuadros 240] [--salida informes/banco/e05]
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PUERTO = Number(opt("puerto", process.env.EXP05_PUERTO ?? 5921));
const RONDAS = Math.max(1, Number(opt("rondas", 3)));
const CUADROS = Number(opt("cuadros", 240)), CALENTAR = Number(opt("calentar", 40));
const SALIDA = join(repo, opt("salida", "informes/banco/e05"));
if ((process.env.TMPDIR ?? "").length > 60) process.env.TMPDIR = "/tmp";

const FLAGS = ["--no-sandbox", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "--disable-gpu-sandbox", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--enable-webgpu-developer-features"];
const { chromium } = await import("playwright-core");
function chrome() { if (process.env.CHROME) return process.env.CHROME; try { const p = chromium.executablePath(); if (existsSync(p)) return p; } catch {} throw new Error("exp05: pon CHROME=/ruta/a/chrome"); }

let vite = null, browser = null;
async function arrancarVite() {
  const bin = join(repo, "node_modules/vite/bin/vite.js");
  vite = spawn(process.execPath, [bin, "--config", join(repo, "apps/banco/exp-05/vite.config.mjs")], { cwd: repo, env: { ...process.env, EXP05_PUERTO: String(PUERTO) }, stdio: ["ignore", "inherit", "inherit"] });
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${PUERTO}/`); if (r.ok) return; } catch {} if (vite.exitCode !== null) throw new Error(`exp05: vite salió con ${vite.exitCode}`); await new Promise((r) => setTimeout(r, 150)); }
  throw new Error("exp05: vite no contesta");
}
async function cerrar() { await browser?.close().catch(() => {}); browser = null; if (vite && vite.exitCode === null) vite.kill("SIGTERM"); }
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { cerrar().finally(() => process.exit(130)); });

const med = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : NaN; };
const commit = (() => { try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo }).toString().trim(); } catch { return "?"; } })();
const MODOS = ["actual", "directa", "byte"];

try {
  await arrancarVite();
  browser = await chromium.launch({ executablePath: chrome(), headless: true, args: FLAGS });
  const crudo = [];
  for (let r = 0; r < RONDAS; r++) {
    const orden = MODOS.map((_, i) => MODOS[(i + r) % MODOS.length]);
    for (const modo of orden) {
      const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errores = [];
      p.on("pageerror", (e) => errores.push(String(e.message).slice(0, 300)));
      await p.goto(`http://127.0.0.1:${PUERTO}/?${new URLSearchParams({ modo, cuadros: CUADROS, calentar: CALENTAR })}`);
      await p.waitForFunction(() => window.__exp05?.estado.listo, null, { timeout: 60000 });
      const err = await p.evaluate(() => window.__exp05.estado.error);
      if (err) { await p.close(); throw new Error(`exp05 (${modo}): ${err}`); }
      const res = await p.evaluate(() => window.__exp05.estado.resultado);
      await p.close();
      crudo.push({ ronda: r, modo, errores, ...res });
      console.error(`ronda ${r + 1}/${RONDAS} ${modo.padEnd(8)} gpu ${res.gpuMs?.mediana?.toFixed(3) ?? "—"} ms · cpu ${res.cpuRenderMs?.mediana?.toFixed(3)} ms · ráfaga ${res.rafagaMs?.toFixed(3)} · pase=${res.esperaPase}`);
    }
  }
  await cerrar();

  const filas = MODOS.map((modo) => {
    const rs = crudo.filter((x) => x.modo === modo);
    const g = rs.map((x) => x.gpuMs?.mediana).filter(Number.isFinite);
    return { modo, esperaPase: rs[0].esperaPase, toneMapping: rs[0].toneMapping, outputColorSpace: rs[0].outputColorSpace, outputBufferType: rs[0].outputBufferType,
      gpu: med(g), gpuMin: g.length ? Math.min(...g) : NaN, gpuMax: g.length ? Math.max(...g) : NaN,
      gpuP99: med(rs.map((x) => x.gpuMs?.p99)), cpu: med(rs.map((x) => x.cpuRenderMs?.mediana)), rafaga: med(rs.map((x) => x.rafagaMs)),
      llamadas: med(rs.map((x) => x.drawCalls?.mediana)), triangulos: med(rs.map((x) => x.triangulos?.mediana)),
      bytes: rs[0].memoria.total ?? null, cuadrosConGpu: med(rs.map((x) => x.cuadrosConGpu)), errores: rs.flatMap((x) => x.errores).slice(0, 5) };
  });
  const base = filas.find((f) => f.modo === "actual");
  for (const f of filas) f.dGpu = f.gpu - base.gpu;

  mkdirSync(SALIDA, { recursive: true });
  const fecha = new Date().toISOString();
  writeFileSync(join(SALIDA, `e05-${fecha.replace(/[:.]/g, "-")}.json`), JSON.stringify({ fecha, commit, opciones: { RONDAS, CUADROS, CALENTAR }, crudo, filas }, null, 1));
  const n = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
  const s = (x, d = 3) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + x.toFixed(d) : "—");
  let md = `# E05 pase de salida — ${fecha.slice(0, 16).replace("T", " ")} UTC · commit ${commit}\n\n`;
  md += `${CUADROS} cuadros tras ${CALENTAR} de calentamiento · ${RONDAS} rondas (mediana de medianas) · WebGPU real\n\n`;
  md += "| Modo | ¿pase activo? | tono | espacio | buffer | GPU ms (min–max) | GPU p99 | Δ GPU vs actual | CPU ms | ráfaga | llamadas | triángulos |\n";
  md += "|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|\n";
  for (const f of filas) md += `| ${f.modo} | ${f.esperaPase} | ${f.toneMapping} | ${f.outputColorSpace} | ${f.outputBufferType} | ${n(f.gpu)} (${n(f.gpuMin)}–${n(f.gpuMax)}) | ${n(f.gpuP99)} | ${f.modo === "actual" ? "" : s(f.dGpu)} | ${n(f.cpu)} | ${n(f.rafaga)} | ${f.llamadas} | ${f.triangulos} |\n`;
  writeFileSync(join(SALIDA, `e05-${fecha.replace(/[:.]/g, "-")}.md`), md);
  console.log(md);
  console.error(`\nescrito ${SALIDA}/e05-${fecha.replace(/[:.]/g, "-")}.{json,md}`);
} catch (e) {
  console.error(String(e?.stack ?? e));
  await cerrar();
  process.exit(1);
}
