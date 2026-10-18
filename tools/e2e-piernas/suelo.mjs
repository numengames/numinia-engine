// e2e leg (D-045 suelo de la muerte): a world with a void. Starts its OWN server and page (ports E2E_SERVER_PORT /
// E2E_VITE_PORT, default 8797 / 5179) on a throwaway world: entorno.json with `sueloMinimo: 1` and `vuelta: (0, 3, 0)`, and
// one solid platform 3 m high (x, z −6…6) saved in datos/objetos.json. Nothing of the house's worlds is touched. Then:
//  1) A appears on the flat ground inside the platform (0 m < 1 m): within a second the server puts A on the fixed point,
//     standing on the platform (3 m), the page fades (#fundido) and the live region reads «Has vuelto a un sitio seguro».
//  2) A runs straight ahead (Shift+W) off the edge («el hueco»), falls under 1 m and comes back to the LAST spot where it
//     stood on the platform (3 m, inside x,z ±6), with motivo «caida»; another fade.
//  3) A asks on purpose (`suelo.volver`): back again, motivo «pedido».
// Env: SHOTS=<folder> saves pictures. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8797), VP = Number(process.env.E2E_VITE_PORT ?? 5179);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

// ---- the throwaway world: a void under 1 m, a fixed point on top of a 3 m platform, the platform itself ----
const BLOQUE = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588"; // features/objetos/biblioteca.json «Bloque» (CC0)
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-suelo-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos");
mkdirSync(entorno); mkdirSync(datos);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 }, sueloMinimo: 1, vuelta: { x: 0, y: 3, z: 0 } }, null, 2));
const plataforma = { modelo: BLOQUE, x: 0, y: 1.5, z: 0, rx: 0, ry: 0, rz: 0, sx: 12, sy: 3, sz: 12, nombre: "Plataforma de pruebas", decorado: false, fijado: true, animar: false,
  tipo: "modelo", ext: "glb", oculto: false, volumen: 1, solido: true, bx0: -6, by0: 0, bz0: -6, bx1: 6, by1: 3, bz1: 6, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false };
writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 5, savedAt: new Date().toISOString(), state: [["p1", { value: plataforma, at: { x: 0, z: 0 } }]], store: [["siguiente", 2]] }));

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: "" }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  const pos = () => a.evaluate(() => { const p = globalThis.__numinia.session.selfPosition(0); return { x: p.x, y: p.y, z: p.z }; });
  const vueltas = () => a.evaluate(() => globalThis.__numinia.session.features.log.filter((l) => l.feature === "suelo" && l.event === "vuelta").map((l) => l.msg.motivo));
  const fundidos = () => a.evaluate(() => Number(document.getElementById("fundido")?.dataset.ultimo ?? 0));
  const avisos = () => a.evaluate(() => document.getElementById("avisos")?.textContent ?? "");
  const foto = async (n) => { if (SHOTS) await a.screenshot({ path: `${SHOTS}/suelo-${n}.png` }); };

  // 1) appearing inside the platform (0 m, under the minimum) → the fixed point on top of it
  await a.waitForFunction(() => globalThis.__numinia.session.selfPosition(0).y >= 2.99, null, { timeout: 8000 });
  await sleep(300);
  const p1 = await pos(); const v1 = await vueltas();
  nota("1 puesto en el punto de vuelta", { pos: p1, vueltas: v1, fundido: (await fundidos()) > 0, aviso: await avisos() });
  if (!(Math.abs(p1.y - 3) < 0.01 && Math.abs(p1.x) < 0.01 && Math.abs(p1.z) < 0.01)) throw new Error(`not on the fixed point: ${JSON.stringify(p1)}`);
  if (!(await fundidos())) throw new Error("no fade");
  if (!(await avisos()).includes("Has vuelto a un sitio seguro")) throw new Error(`live region: ${await avisos()}`);
  await foto(1);

  // 2) run off the edge: falls under 1 m, comes back to the last spot on the platform
  const f1 = await fundidos();
  await a.bringToFront(); await a.mouse.click(450, 320);
  await a.keyboard.down("Shift"); await a.keyboard.down("KeyW");
  let cayo = null;
  for (const t = Date.now(); Date.now() - t < 12000; ) { const p = await pos(); if (p.y < 1) { cayo = p; break; } await sleep(40); }
  nota("2 cayó por el borde", { pos: cayo });
  if (!cayo) throw new Error("never fell under 1 m");
  await a.keyboard.up("KeyW"); await a.keyboard.up("Shift");
  await a.waitForFunction(() => globalThis.__numinia.session.selfPosition(0).y >= 2.99, null, { timeout: 6000 });
  await sleep(300);
  const p2 = await pos(); const v2 = await vueltas();
  nota("2 de vuelta a la última posición segura", { pos: p2, vueltas: v2, fundidoNuevo: (await fundidos()) > f1 });
  if (!(Math.abs(p2.y - 3) < 0.01 && Math.abs(p2.x) <= 6.01 && Math.abs(p2.z) <= 6.01)) throw new Error(`not back on the platform: ${JSON.stringify(p2)}`);
  if (Math.hypot(p2.x, p2.z) < 2) throw new Error(`came back to the fixed point, not to the last safe spot: ${JSON.stringify(p2)}`);
  if (v2[v2.length - 1] !== "caida") throw new Error(`motivo: ${JSON.stringify(v2)}`);
  if (!((await fundidos()) > f1)) throw new Error("no second fade");
  await foto(2);

  // 3) asked on purpose (the cable's «vuelve_a_seguro» = intent suelo.volver)
  const r = await a.evaluate(() => globalThis.__numinia.session.features.send("suelo", "volver", {}));
  if (!r.ok) throw new Error(`volver refused: ${r.why}`);
  await a.waitForFunction((n) => globalThis.__numinia.session.features.log.filter((l) => l.feature === "suelo" && l.event === "vuelta").length > n, v2.length, { timeout: 4000 });
  const v3 = await vueltas(); const p3 = await pos();
  nota("3 pedido a propósito", { pos: p3, motivo: v3[v3.length - 1] });
  if (v3[v3.length - 1] !== "pedido") throw new Error(`motivo: ${JSON.stringify(v3)}`);
  out.estado = await a.evaluate(() => Object.fromEntries(globalThis.__numinia.session.features.stateOf("suelo")));
  ok = errors.length === 0;
  out.posiciones = { punto: p1, caida: { x: r2(cayo.x), y: r2(cayo.y), z: r2(cayo.z) }, vuelta: { x: r2(p2.x), y: r2(p2.y), z: r2(p2.z) } };
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").filter((l) => l.includes("suelo") || l.includes("mundo")).slice(-12);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
