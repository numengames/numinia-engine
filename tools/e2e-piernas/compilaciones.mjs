// e2e-lenta
// e2e leg (t_159e18d2, slow): late shader compiles. Pablo's Quest 3S session of 2026-10-26 had 11 of 17 hitches >= 0.6 s while new
// shaders linked mid-play (leaving the Ayuntamiento 0.80 s). Here an emulated Quest 3 (IWER) enters VR in a world, waits for the loading
// screen to come down, zeroes the counter of compilaciones.ts (`view.compiles()`: pipelines linked by a DRAW, not through compileAsync)
// and walks a route — by default the house plaza; with MUNDO_COPIA=<world folder> the route of RUTA (JSON [[x,z],...]) into and out of it.
// Passes only when no pipeline was linked inside a frame after the loading screen — including the ones of entering VR itself. Prints the numbers (and the last late ones, named).
// Own server and page (E2E_SERVER_PORT / E2E_VITE_PORT, default 8921 / 5321) on a throwaway copy of the world; nothing else is touched.
// Env: CHROME, MUNDO_COPIA, RUTA, MIDE=1 (print and exit 0 whatever the count: for measuring before a fix), SHOTS.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find(existsSync); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8921), VP = Number(process.env.E2E_VITE_PORT ?? 5321);
const MIDE = process.env.MIDE === "1";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-compilaciones-"));
const mundo = join(tmp, "mundo");
if (process.env.MUNDO_COPIA) { cpSync(process.env.MUNDO_COPIA, mundo, { recursive: true }); rmSync(join(mundo, "claves.env"), { force: true }); rmSync(join(mundo, "sesiones"), { recursive: true, force: true }); } else mkdirSync(mundo);
const RUTA = process.env.RUTA ? JSON.parse(process.env.RUTA) : (process.env.MUNDO_COPIA ? [[0, -20], [0, -36], [0, -48], [0, -56], [0, -36], [0, -20], [0, 0]] : [[0, -6], [6, -6], [6, 0], [0, 0]]);

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); p.on("exit", (c) => { if (c) console.error(`[${nombre}] salió ${c}: ${t.slice(-400)}`); }); procs.push(p); return p; };
const limpiar = async (browser) => { try { await browser?.close(); } catch { /* closing */ } for (const p of procs) { try { p.kill(); } catch { /* gone */ } } try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), HOST: "127.0.0.1", MOTOR_MUNDO: mundo }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP), PLAZA_SERVER_PORT: String(SP) }, "vite");
for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 1000)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors, ruta: RUTA };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 120000 });
  // the loading screen down: view.cargaOculta() was called (apps/plaza/main.ts) — read through the counter's own state
  const t1 = Date.now();
  await p.waitForFunction(() => globalThis.__numinia.view.compiles().cargaLista, null, { timeout: 180000, polling: 500 }).catch(() => {});
  nota("loading screen down", { ms: Date.now() - t1, compiles: await p.evaluate(() => { const c = globalThis.__numinia.view.compiles(); return { previas: c.previas, antes: c.antesDelPrimerCuadro, bajoLaCarga: c.bajoLaCarga, tardias: c.tardias, recientes: c.recientes.map((r) => `${r.objeto} | ${r.material} | ${r.firma}`) }; }), shaders: await p.evaluate(() => globalThis.__numinia.view.shaders()) });
  // a player takes seconds to put the headset on: let the VR warm-up (hands, then the rig and the world with the stereo camera in the tier-B state) finish first
  const tw = Date.now();
  const calentado = await p.waitForFunction(() => globalThis.__numinia.view.vrCalentado(), null, { timeout: 120000, polling: 500 }).then(() => true, () => false);
  nota("VR warm-up", { terminado: calentado, ms: Date.now() - tw, compiles: await p.evaluate(() => { const c = globalThis.__numinia.view.compiles(); return { previas: c.previas, tardias: c.tardias, recientes: c.recientes.map((r) => `${r.objeto} | ${r.material} | ${r.firma}`) }; }) });
  await p.evaluate(() => document.getElementById("vr").click());
  const enVR = await p.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 60000 }).then(() => true, () => false);
  nota("enters VR", { enVR });
  if (!enVR) throw new Error("did not enter VR");
  await p.waitForFunction(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando", null, { timeout: 20000 }).catch(() => {});
  // let the VR warm-up (3.5 s after the hands, then compileAsync of the rig and the world with the two-eye camera) finish
  await p.waitForFunction(() => globalThis.__numinia.view.shaders().enCola === 0 && !globalThis.__numinia.view.cargando(), null, { timeout: 120000, polling: 500 }).catch(() => {});
  await p.waitForTimeout(Number(process.env.CALENTAR_MS ?? 25000));
  const antes = await p.evaluate(() => { const c = globalThis.__numinia.view.compiles(); globalThis.__numinia.view.reiniciarCompiles(); return { previas: c.previas, antes: c.antesDelPrimerCuadro, bajoLaCarga: c.bajoLaCarga, tardiasAlEntrarEnVR: c.tardias, recientes: c.recientes }; });
  nota("VR settled, late counter zeroed", antes);

  const yo = () => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
  const pasos = [];
  for (const [x, z] of RUTA) {
    const tt = Date.now(); let d = Infinity;
    while (Date.now() - tt < 90000) {
      const me = await yo(), dx = x - me.x, dz = z - me.z; d = Math.hypot(dx, dz);
      if (d <= 1.5) break;
      const ms = Math.max(150, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - 0.6) / 1.5) * 1000));
      await p.evaluate(([sx, sz]) => globalThis.__iwer.controllers.left.updateAxes("thumbstick", sx, sz), [(dx / d) * 0.9, (dz / d) * 0.9]);
      await p.waitForTimeout(ms);
      await p.evaluate(() => globalThis.__iwer.controllers.left.updateAxes("thumbstick", 0, 0));
      await p.waitForTimeout(100);
    }
    const c = await p.evaluate(() => { const c = globalThis.__numinia.view.compiles(); return { tardias: c.tardias, tardiasMs: c.tardiasMs, programas: globalThis.__numinia.view.programas() }; });
    pasos.push({ a: [x, z], llegoA: d <= 1.5, d: Math.round(d * 10) / 10, s: Math.round((Date.now() - tt) / 100) / 10, ...c });
  }
  out.ruta_pasos = pasos;
  const fin = await p.evaluate(() => globalThis.__numinia.view.compiles());
  out.final = fin;
  nota("walk done", { tardias: fin.tardias, tardiasMs: fin.tardiasMs });
  if (errors.length) nota("page errors", { errors });
  // the burst of entering VR counts too (it used to be zeroed away): the player feels it as the first seconds of the session
  ok = MIDE || (fin.tardias === 0 && antes.tardiasAlEntrarEnVR === 0 && errors.length === 0);
} catch (e) { out.error = String(e?.message ?? e); }
console.log(JSON.stringify(out, null, 1));
await limpiar(browser);
process.exit(ok ? 0 : 1);
