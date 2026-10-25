// e2e-lenta
// lote 7 «activos» — measure H13 (levels of detail) and M16 (manifest + files by hash) on a world folder, on ANY engine checkout
// (MOTOR_DIR=<worktree>; a checkout without the cards just reports what it has, so the same leg gives BEFORE and AFTER).
//   WORLD=<folder with datos/, entorno/> (default: the events template)   COPIAS=<n> adds n far copies of the heaviest model that
//   can have levels (a «plaza con 200 copias»: ring of 100–420 m); MODELO=<sha256 prefix> picks the model (so BEFORE and AFTER use the same)   Env as carga-entera.mjs: E2E_SERVER_PORT / E2E_VITE_PORT, CHROME, PW_CORE.
// Steps: copy the world; `optimizar` its files (the lighter copies, and the levels where the checkout makes them); start the server and
// the page; load once (wait until the loading screen is gone + 4 s); record bytes over the wire for /a/ (CDP), draw calls and triangles of
// the last frame (view.lastFrame()), the loading screen's count; reload with the browser's HTTP cache OFF (what a browser that evicted
// it, or a second visit to another origin of the same files, costs) and record /a/ bytes again; reload once more with it ON.
// Run it under `flock /var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/cache/scratch/fotos.lock`. SALIDA=<file.json> writes the JSON.
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = (process.env.MOTOR_DIR ?? new URL("../../", import.meta.url).pathname).replace(/\/$/, "");
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const WORLD = process.env.WORLD ?? "/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work/plantillas/eventos/mundo";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8814), VP = Number(process.env.E2E_VITE_PORT ?? 5334);
const COPIAS = Number(process.env.COPIAS ?? 0), ETIQUETA = process.env.ETIQUETA ?? "";
if (!existsSync(PW) || !existsSync(CHROME) || !existsSync(WORLD)) { console.error("playwright-core, chromium or the world not found; set PW_CORE / CHROME / WORLD"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-activos-"));
const mundo = join(tmp, "mundo");
cpSync(WORLD, mundo, { recursive: true, filter: (f) => !/\/sesiones(\/|$)/.test(f) && !/claves\.env$/.test(f) });
mkdirSync(join(mundo, "sesiones"), { recursive: true });
const out = { etiqueta: ETIQUETA, motor: REPO.split("/").pop(), mundo: WORLD.split("/").slice(-2).join("/"), copiasLejanas: COPIAS };

// 1. the files: lighter copies (and levels, where this checkout makes them)
const activos = join(mundo, "datos/activos");
const t0 = Date.now();
const cli = spawnSync("node", ["packages/server/src/optimizar-cli.ts", activos, "--otra-vez"], { cwd: REPO, encoding: "utf8", env: process.env });
out.optimizarS = Math.round((Date.now() - t0) / 100) / 10;
const lods = readdirSync(join(activos, "optimizados")).filter((f) => /\.lod[12]\.glb$/.test(f));
out.ficherosDeNivel = lods.length;

// 2. 200 far copies of the model with the most triangles that got levels (or, with none, the biggest .glb)
if (COPIAS > 0) {
  const informe = existsSync(join(activos, "optimizados/informe.jsonl")) ? readFileSync(join(activos, "optimizados/informe.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  const con = informe.filter((l) => l.tipo === "glb" && l.lods?.length).sort((a, b) => b.triangulos - a.triangulos)[0];
  const glbs = readdirSync(activos).filter((f) => /^[0-9a-f]{64}\.glb$/.test(f));
  const modelo = process.env.MODELO ? glbs.map((f) => f.slice(0, 64)).find((h) => h.startsWith(process.env.MODELO)) : con?.sha256 ?? glbs.map((f) => ({ f, n: readFileSync(join(activos, f)).length })).sort((a, b) => b.n - a.n)[0].f.slice(0, 64);
  const fila = informe.find((l) => l.sha256 === modelo && l.tipo === "glb");
  out.modeloDeLasCopias = { sha256: modelo.slice(0, 12), triangulos: fila?.triangulos ?? null, niveles: fila?.lods?.map((x) => x.triangulos) ?? [] };
  const lineas = readFileSync(join(mundo, "datos/objetos.jsonl"), "utf8").trim().split("\n");
  const modelo0 = lineas.map((l) => JSON.parse(l)).find((l) => l.op === "s" && l.value?.tipo === "modelo");
  let siguiente = 1000;
  for (let i = 0; i < COPIAS; i++) {
    const ang = (i / COPIAS) * Math.PI * 2 * 3 + 0.3, r = 100 + ((i * 37) % 320);
    const v = { ...modelo0.value, modelo, x: Math.round(Math.cos(ang) * r * 100) / 100, y: 0, z: Math.round(Math.sin(ang) * r * 100) / 100, nombre: "", decorado: true, fijado: false, animar: false, solido: false, oculto: false };
    appendFileSync(join(mundo, "datos/objetos.jsonl"), JSON.stringify({ t: new Date().toISOString(), v: modelo0.v, op: "s", key: `o${siguiente++}`, value: v }) + "\n");
  }
}

// 3. server + page
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, nombre, log: () => t }); };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), HOST: "127.0.0.1", MOTOR_MUNDO: mundo, MOTOR_CONSTRUIR: "todos", MOTOR_OPTIMIZAR: "no" }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP), PLAZA_SERVER_PORT: String(SP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let ok = false, browser;
try {
  const man = await fetch(`http://127.0.0.1:${SP}/manifiesto.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  out.manifiesto = man ? { ficheros: man.ficheros.length, total: man.total, clases: man.clases } : null;
  browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  let pedidos = new Map(), a = null;
  const nuevaCuenta = () => { a = { peticiones: 0, bytes: 0, desdeCacheHttp: 0, porTipo: {} }; pedidos = new Map(); };
  cdp.on("Network.requestWillBeSent", (e) => { if (/\/(a\/|manifiesto\.json)/.test(e.request.url)) pedidos.set(e.requestId, e.request.url); });
  cdp.on("Network.responseReceived", (e) => { const u = pedidos.get(e.requestId); if (u && /\/a\//.test(u) && (e.response.fromDiskCache || e.response.fromMemoryCache)) a.desdeCacheHttp++; });
  cdp.on("Network.loadingFinished", (e) => { const u = pedidos.get(e.requestId); if (!u || !/\/a\//.test(u)) return; a.peticiones++; a.bytes += e.encodedDataLength; const k = /\.lod\d\.glb/.test(u) ? "nivel" : u.split(".").pop(); a.porTipo[k] = (a.porTipo[k] ?? 0) + e.encodedDataLength; });
  const cargar = async (nombre, opts = {}) => {
    nuevaCuenta();
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: !!opts.sinCacheHttp });
    const ti = Date.now();
    if (opts.recargar) await page.reload({ timeout: 180000 }); else await page.goto(BASE, { timeout: 180000 });
    await page.waitForFunction(() => document.getElementById("carga")?.hidden, null, { timeout: 180000, polling: 200 });
    const hastaJugar = Date.now() - ti;
    await sleep(4000);
    const r = await page.evaluate(() => { const v = globalThis.__numinia.view, f = v.lastFrame(), o = v.objects(); return { lastFrame: f, objetos: o, cargaMundo: v.cargaMundo?.() ?? null, texto: [...document.querySelectorAll("#carga .c-piezas")].map((e) => e.textContent) }; });
    out[nombre] = { hastaJugarMs: hastaJugar, red: { ...a }, ...r };
  };
  await cargar("primeraCarga");
  await cargar("segundaCarga_sinCacheHttp", { recargar: true, sinCacheHttp: true });
  await cargar("segundaCarga_conCacheHttp", { recargar: true });
  out.cache = await page.evaluate(async () => (globalThis.caches ? (await globalThis.caches.keys()).length : -1));
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").slice(-12);
} finally {
  await browser?.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.errors = errors; out.ok = ok;
const txt = JSON.stringify(out, null, 1);
if (process.env.SALIDA) writeFileSync(process.env.SALIDA, txt);
console.log(txt);
process.exit(ok ? 0 : 1);
