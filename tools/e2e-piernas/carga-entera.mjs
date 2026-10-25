// e2e-lenta
// e2e leg (lote «primera vez», story C): the loading screen covers until the world within view is whole. Starts its OWN server and
// page (E2E_SERVER_PORT / E2E_VITE_PORT, default 8812 / 5332) on a COPY of a world folder (WORLD=<folder with datos/, entorno/>,
// e.g. work/plantillas/eventos/mundo: 146 placed pieces) and, on a page opened with a software GPU, records at the instant the
// screen starts to leave (class «ida»): the time since navigation, the pieces the page still counts as pending, and what the
// screen wrote; then, once it is gone, a screenshot of the world as the player first sees it (no grey, untextured pieces).
// It works on any engine checkout (MOTOR_DIR=<worktree>, default this one), so the same leg measures BEFORE (origin/main, which has
// no view.cargaMundo) and AFTER; only the AFTER must pass the assertions (pending within view = 0).
// Env: SHOTS=<folder> pictures; THROTTLE_KBPS=<n> throttles the page's downloads (a phone's 4G is ~ 2500); CHROME=<headless shell>;
// SALIDA=<file.json> also writes the JSON. Prints JSON; exit 0 only when all is right (AFTER) or when it measured (MEDIR_SOLO=1).
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.env.MOTOR_DIR ?? new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const WORLD = process.env.WORLD ?? "/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work/plantillas/eventos/mundo";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8812), VP = Number(process.env.E2E_VITE_PORT ?? 5332);
const KBPS = Number(process.env.THROTTLE_KBPS ?? 0), SOLO_MEDIR = process.env.MEDIR_SOLO === "1", ETIQUETA = process.env.ETIQUETA ?? "";
if (!existsSync(PW) || !existsSync(CHROME) || !existsSync(WORLD)) { console.error("playwright-core, chromium or the world not found; set PW_CORE / CHROME / WORLD"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-carga-"));
const mundo = join(tmp, "mundo");
cpSync(WORLD, mundo, { recursive: true, filter: (f) => !/\/sesiones(\/|$)/.test(f) && !/claves\.env$/.test(f) });
mkdirSync(join(mundo, "sesiones"), { recursive: true });

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), HOST: "127.0.0.1", MOTOR_MUNDO: mundo, MOTOR_CONSTRUIR: "todos" }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP), PLAZA_SERVER_PORT: String(SP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [], out = { etiqueta: ETIQUETA, motor: REPO.replace(/\/$/, "").split("/").pop(), mundo: WORLD.split("/").slice(-2).join("/"), throttleKBps: KBPS, errors };
let ok = false, browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  // the instant the screen starts to leave (class «ida» is added by ocultarCarga): time since navigation + what the page counts
  await page.addInitScript(() => {
    globalThis.__ida = null;
    const mirar = () => {
      const el = document.getElementById("carga");
      if (!el) return false;
      new MutationObserver(() => {
        if (globalThis.__ida || !(el.classList.contains("ida") || el.hidden)) return;
        const n = globalThis.__numinia, v = n?.view;
        const objs = v?.objects?.(), sh = v?.shaders?.();
        globalThis.__ida = {
          ms: Math.round(performance.now()), bienvenidaMs: n?.informe?.bienvenidaMs, primerCuadroMs: n?.informe?.primerCuadroMs,
          objetos: objs, pendientesObjetos: objs ? objs.placed - objs.loaded - objs.failed : null,
          shaders: sh ? { enCola: sh.enCola, preparados: sh.preparados, lotes: sh.lotes, sinEsperar: sh.sinEsperar } : null,
          cargaMundo: v?.cargaMundo?.() ?? null, informeCarga: n?.informe?.carga ?? null,
          textoPiezas: [...el.querySelectorAll(".c-piezas")].map((e) => e.textContent), pct: el.querySelector(".c-pct")?.textContent ?? null,
          busy: v?.busy?.(),
        };
      }).observe(el, { attributes: true, attributeFilter: ["class", "hidden"] });
      return true;
    };
    const intento = () => { if (!mirar()) requestAnimationFrame(intento); };
    document.addEventListener("DOMContentLoaded", intento);
    // the screen's own progress, sampled as the load goes (to see it move: n de N)
    globalThis.__progreso = [];
    setInterval(() => { const el = document.getElementById("carga"); if (!el || el.hidden) return; globalThis.__progreso.push({ ms: Math.round(performance.now()), piezas: el.querySelector(".c-piezas")?.textContent ?? "", pct: el.querySelector(".c-pct")?.textContent ?? "" }); }, 400);
  });
  if (KBPS > 0) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: KBPS * 1024, uploadThroughput: KBPS * 1024 });
  }
  const t0 = Date.now();
  await page.goto(BASE);
  if (SHOTS) { // the screen itself, while it counts: «n de N piezas» somewhere between 0 and N
    mkdirSync(SHOTS, { recursive: true });
    await page.waitForFunction(() => { const t = document.querySelector("#carga .c-piezas")?.textContent ?? ""; const m = /^(\d+) de (\d+)/.exec(t); return !!m && Number(m[1]) > 0 && Number(m[1]) < Number(m[2]); }, null, { timeout: 120000, polling: 30 }).then(() => page.screenshot({ path: `${SHOTS}/carga-${ETIQUETA || "x"}-pantalla-contando.png` })).catch(() => {});
  }
  await page.waitForFunction(() => globalThis.__ida, null, { timeout: 120000, polling: 100 });
  out.tardoEnIrseS = Math.round((Date.now() - t0) / 100) / 10;
  const ida = await page.evaluate(() => globalThis.__ida);
  out.alOcultar = ida;
  await page.waitForFunction(() => document.getElementById("carga")?.hidden, null, { timeout: 5000 });
  // right after hiding: the world as the player first sees it, and what is still pending a moment later (nothing should pop in)
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/carga-${ETIQUETA || "x"}-justo-despues.png` }); }
  const justo = await page.evaluate(() => ({ objetos: globalThis.__numinia.view.objects(), cargaMundo: globalThis.__numinia.view.cargaMundo?.() ?? null, shaders: (() => { const s = globalThis.__numinia.view.shaders(); return { enCola: s.enCola, preparados: s.preparados }; })() }));
  out.justoDespues = justo;
  await sleep(6000);
  const luego = await page.evaluate(() => ({ objetos: globalThis.__numinia.view.objects(), cargaMundo: globalThis.__numinia.view.cargaMundo?.() ?? null }));
  out.seis_segundos_despues = luego;
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/carga-${ETIQUETA || "x"}-seis-s-despues.png` });
  const prog = await page.evaluate(() => globalThis.__progreso);
  out.progreso = prog.filter((_, i) => i % Math.max(1, Math.floor(prog.length / 12)) === 0).slice(0, 14);
  out.aparecioDespues = luego.objetos.loaded - justo.objetos.loaded; // pieces that finished loading after the screen went
  const faltan = ida.cargaMundo ? ida.cargaMundo.total - ida.cargaMundo.listas : null;
  out.pendientesDentroDeLaVista = faltan;
  if (SOLO_MEDIR) ok = errors.length === 0;
  else {
    if (!ida.cargaMundo) throw new Error("this engine has no view.cargaMundo: run with MEDIR_SOLO=1 for a BEFORE measurement");
    if (faltan !== 0) throw new Error(`the screen left with ${faltan} pieces within view not ready`);
    if (ida.cargaMundo.total < 20) throw new Error(`the world has only ${ida.cargaMundo.total} pieces within view (≥ 20 wanted)`);
    if (ida.informeCarga?.tope) throw new Error("the cap fired: the world was not whole when the screen left");
    if (!ida.textoPiezas.some((t) => /de \d+ pieza/.test(t))) throw new Error(`the screen never said «n de N piezas»: ${JSON.stringify(ida.textoPiezas)}`);
    if (out.progreso.length < 2) throw new Error("no progress sampled");
    ok = errors.length === 0;
  }
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").slice(-12);
} finally {
  await browser?.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
const txt = JSON.stringify(out, null, 1);
if (process.env.SALIDA) writeFileSync(process.env.SALIDA, txt);
console.log(txt);
process.exit(ok ? 0 : 1);
