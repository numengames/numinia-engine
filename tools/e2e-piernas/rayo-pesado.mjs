// e2e-lenta
// e2e leg (t_68c66c8c, slow): the builder's hand rays on a heavy model. Pablo's Quest 3S session of 2026-10-26 fell to 10-19 fps while he moved
// a 130 k-triangle statue (x3.4) and a x10 model with his tracked hands, and for 26 s after a 142 m teleport to a spot with a x10 skinned robot:
// apps/plaza/constructor-xr.ts asks the editor «what is under this ray?» 60 times a second per hand, and three's Raycaster tested every triangle.
// Here an emulated Quest 3 (IWER) enters VR, turns the builder's hands on, makes a placed thing HEAVY (a 300 k-triangle soup, scaled x3.4 / x10),
// aims the right ray at it and times one hand tick (2 picks + 2 points-under-the-ray, what both hands do) — first beside it, then after a
// 140 m teleport onto the x10 one. Passes when the p95 of a tick stays under BUDGET_MS (default 1 ms on this desktop: about 5 ms on a Quest, a
// third of a 72 Hz frame) and the ray still finds the thing. Prints the numbers; MIDE=1 prints and exits 0 (to measure before a fix).
// Own server and page (E2E_SERVER_PORT / E2E_VITE_PORT, default 8931 / 5331) on a throwaway empty world; nothing else is touched.
// Env: CHROME, BUDGET_MS, TRIS (default 300000), MIDE.
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
const SP = Number(process.env.E2E_SERVER_PORT ?? 8931), VP = Number(process.env.E2E_VITE_PORT ?? 5331);
const MIDE = process.env.MIDE === "1", BUDGET_MS = Number(process.env.BUDGET_MS ?? 1), TRIS = Number(process.env.TRIS ?? 300000);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-rayo-pesado-"));
const mundo = join(tmp, "mundo");
if (process.env.MUNDO_COPIA) { cpSync(process.env.MUNDO_COPIA, mundo, { recursive: true }); rmSync(join(mundo, "claves.env"), { force: true }); rmSync(join(mundo, "sesiones"), { recursive: true, force: true }); } else mkdirSync(mundo);


const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); p.on("exit", (c) => { if (c) console.error(`[${nombre}] salió ${c}: ${t.slice(-400)}`); }); procs.push(p); return p; };
const limpiar = async (browser) => { try { await browser?.close(); } catch { /* closing */ } for (const p of procs) { try { p.kill(); } catch { /* gone */ } } try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), HOST: "127.0.0.1", MOTOR_MUNDO: mundo, MOTOR_CONSTRUIR: "todos" }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP), PLAZA_SERVER_PORT: String(SP) }, "vite");
for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 1000)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;


const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], out = { pasos: [], errors, presupuestoMs: BUDGET_MS };
const nota = (paso, extra = {}) => out.pasos.push({ paso, ...extra });
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    // one hand tick of constructor-xr.ts for both hands: 2 picks and 2 points under the ray; ms per tick, sorted
    globalThis.__medir = (o, d, n) => {
      const ed = globalThis.__numinia.view.editor, t = [];
      for (let i = 0; i < n; i++) { const t0 = performance.now(); ed.pickRayo(o, d); ed.pickRayo(o, d); ed.puntoBajoRayo(o, d); ed.puntoBajoRayo(o, d, "~nada"); t.push(performance.now() - t0); }
      t.sort((a, b) => a - b); const q = (f) => Math.round(t[Math.min(n - 1, Math.floor(n * f))] * 100) / 100;
      return { n, p50: q(0.5), p95: q(0.95), max: q(1), encuentra: ed.pickRayo(o, d) };
    };
    // make a placed thing heavy: swap its meshes' geometry for a triangle soup of \`tris\` triangles inside a 1 m box; scale it
    globalThis.__pesar = (id, tris, k) => {
      const g = globalThis.__numinia.view.scene.getObjectByName("objeto:" + id); if (!g) return null;
      const A = g.getObjectByProperty("isMesh", true).geometry.getAttribute("position").constructor;
      let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
      const v = new Float32Array(tris * 9); for (let i = 0; i < v.length; i += 3) { v[i] = rnd(); v[i + 1] = rnd() + 0.5; v[i + 2] = rnd(); }
      const g0 = g.getObjectByProperty("isMesh", true).geometry; const G = g0.isBoxGeometry || g0.isSphereGeometry || g0.type !== "BufferGeometry" ? Object.getPrototypeOf(Object.getPrototypeOf(g0)).constructor : g0.constructor;
      let n = 0; g.traverse((o) => { if (!o.isMesh) return; const geo = new G(); geo.setAttribute("position", new A(v, 3)); o.geometry = geo; o.scale.set(1, 1, 1); n++; });
      g.scale.setScalar(k); g.updateMatrixWorld(true);
      return { mallas: n, tris, k };
    };`);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who && globalThis.__numinia.constructor.estado.puede, null, { timeout: 120000 });
  await p.waitForFunction(() => globalThis.__numinia.view.compiles().cargaLista, null, { timeout: 180000, polling: 500 }).catch(() => {}); // the loading screen is down
  await p.waitForFunction(() => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, { timeout: 120000 }).catch(() => {});
  await p.evaluate(() => document.getElementById("vr").click());
  if (!(await p.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 60000 }).then(() => true, () => false))) throw new Error("did not enter VR");
  await p.waitForFunction(() => globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, { timeout: 30000 }).catch(() => {});
  const entro = await p.evaluate(() => globalThis.__numinia.constructorVR.entrar());
  if (!entro.ok) throw new Error("builder hands do not start: " + JSON.stringify(entro));
  const poner = async (x, z) => {
    const n0 = await p.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    await p.evaluate(([x, z]) => globalThis.__numinia.constructor.colocarEn("bloque", { x, y: 0, z }), [x, z]);
    await p.waitForFunction((n0) => globalThis.__numinia.session.features.stateOf("objetos").size > n0, n0, { timeout: 15000 });
    const id = await p.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    await p.evaluate(() => globalThis.__numinia.constructor.seleccionar(""));
    await p.waitForFunction((id) => !!globalThis.__numinia.view.scene.getObjectByName("objeto:" + id)?.getObjectByProperty("isMesh", true), id, { timeout: 30000 });
    return id;
  };
  const caso = async (nombre, id, k) => {
    const pesado = await p.evaluate(([id, t, k]) => globalThis.__pesar(id, t, k), [id, TRIS, k]);
    const c = await p.evaluate((id) => globalThis.__numinia.view.editor.dondeEsta(id), id);
    const yo = await p.evaluate(() => { const m = globalThis.__numinia.session.selfPosition(1); return { x: m.x, y: 1.4, z: m.z }; });
    const o = yo, d = { x: c.x - yo.x, y: c.y + 0.5 * k - yo.y, z: c.z - yo.z };
    await p.evaluate((a) => globalThis.__medir(a.o, a.d, 5), { o, d }); // warm up
    const m = await p.evaluate((a) => globalThis.__medir(a.o, a.d, 120), { o, d });
    nota(nombre, { id, pesado, ...m, bien: m.p95 <= BUDGET_MS && m.encuentra === id });
    return m.p95 <= BUDGET_MS && m.encuentra === id;
  };
  const yo0 = await p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
  const idA = await poner(yo0.x - 7, yo0.z - 2); // the statue (x3.4): hands move it
  const aOk = await caso("estatua x3.4 delante", idA, 3.4);
  // a second thing 140 m away, x10: teleport there (the server's «punto»), then aim at it
  const idB = await poner(yo0.x + 140, yo0.z);
  await p.evaluate(([x, z]) => globalThis.__numinia.session.features.send("teletransporte", "punto", { x, z, nombre: "" }), [yo0.x + 140, yo0.z - 4]);
  const llego = await p.waitForFunction((x) => globalThis.__numinia.session.selfPosition(1).x > x, yo0.x + 130, { timeout: 40000 }).then(() => true, () => false);
  nota("teletransporte 140 m", { llego });
  await p.waitForTimeout(1500);
  const bOk = await caso("robot x10 tras el salto", idB, 10);
  if (errors.length) nota("page errors", { errors });
  ok = MIDE || (llego && aOk && bOk && errors.length === 0);
} catch (e) { out.error = String(e?.message ?? e); }
console.log(JSON.stringify(out, null, 1));
await limpiar(browser);
process.exit(ok ? 0 : 1);
