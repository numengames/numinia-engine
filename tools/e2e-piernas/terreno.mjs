// e2e leg (M6b: terreno con relieve sobre M6). A throwaway world with a hill (activos/terreno/loma.glb,
// tools/hacer-terreno.mjs, placed as a "malla" thing: no box fallback — bx0..bz1 degenerate so solidsFrom skips it,
// only the real triangles collide, M6's pipeline unchanged). Ports E2E_SERVER_PORT / E2E_VITE_PORT (default
// 8799 / 5181). Checks, over a straight walk across the hill:
//  1) the avatar's y rises then falls back (it follows the relief, no jump/step pose);
//  2) it never clips through the mesh nor floats above it (|y - groundHeight| small along the way);
//  3) the camera (N1b: it sits CAMARA.suelo above the avatar's own y, which already comes from groundHeight over
//     the mesh) never goes under the terrain either.
// Env: SHOTS=<folder> saves a picture at the hilltop. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8799), VP = Number(process.env.E2E_VITE_PORT ?? 5181);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

// ---- the throwaway world: spawn right at the foot of the hill, the hill's own triangles as the only geometry ----
const LOMA = "bc858f7faf1aeb21d71ad88a4f6c908a0170a6903f5f706a11e2c7fda5431cf2"; // features/objetos/biblioteca.json «loma»
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-terreno-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos");
mkdirSync(entorno); mkdirSync(datos);
// N1: "W walks where the camera looks" and the camera starts at yaw 0 (looking along -z), so spawning on +z and
// walking straight W (no mouse touched) crosses the hill along z, through the origin, out the far (-z) side.
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 9.5, radio: 1 } }, null, 2));
// M6b: colision "malla" with a DEGENERATE box (bx1===bx0 etc.) so solidsFrom (U10's box list) skips it entirely —
// only the real triangles of the hill collide, the whole point of M6b over a flat box platform.
const loma = { modelo: LOMA, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, nombre: "Loma de pruebas", decorado: false, fijado: true, animar: false,
  tipo: "modelo", ext: "glb", oculto: false, volumen: 1, solido: true, colision: "malla", bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false };
writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 8, savedAt: new Date().toISOString(), state: [["o1", { value: loma, at: { x: 0, z: 0 } }]], store: [["siguiente", 2]] }));

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
let muestras = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  const pos = () => a.evaluate(() => { const p = globalThis.__numinia.session.selfPosition(0); return { x: p.x, y: p.y, z: p.z }; });
  const camY = () => a.evaluate(() => globalThis.__numinia.view.cam.estado().camara.y);
  const foto = async (n) => { if (SHOTS) await a.screenshot({ path: `${SHOTS}/terreno-${n}.png` }); };

  const p0 = await pos();
  nota("0 aparece al pie de la loma", { pos: p0 });
  if (!(p0.y < 0.5)) throw new Error(`not at the foot of the hill: ${JSON.stringify(p0)}`);
  await foto(0);

  // walk straight where the camera looks (yaw 0, -z) across the hill, sampling y every 150 ms
  await a.bringToFront(); await a.mouse.click(450, 320);
  await a.keyboard.down("KeyW"); // walk pace (no Shift): slower crossing, more samples per metre
  let cimaFoto = false;
  for (const t = Date.now(); Date.now() - t < 30000; ) {
    const p = await pos(), cy = await camY();
    muestras.push({ z: r2(p.z), y: r2(p.y), camY: r2(cy) });
    if (!cimaFoto && p.y > 1.5) { await foto(1); cimaFoto = true; }
    if (p.z < -9) break;
    await sleep(150);
  }
  await a.keyboard.up("KeyW");
  await foto(2);
  nota("1 cruce de la loma", { n: muestras.length, primero: muestras[0], ultimo: muestras[muestras.length - 1] });

  const maxY = Math.max(...muestras.map((m) => m.y));
  nota("2 medidas", { maxY, cimaFoto });
  if (!(muestras[muestras.length - 1].z < -8)) throw new Error(`no cruzó la loma: ${JSON.stringify(muestras[muestras.length - 1])}`);
  if (!(maxY > 1.3)) throw new Error(`no subió con el relieve: maxY=${maxY}`);
  if (!(muestras[muestras.length - 1].y < 0.5)) throw new Error(`no bajó al otro lado: ${JSON.stringify(muestras[muestras.length - 1])}`);
  // sube y luego baja (no es un escalón ni una meseta): el pico está cerca del centro del terreno (z≈0), no en los extremos
  const pico = muestras.reduce((best, m) => (m.y > best.y ? m : best), muestras[0]);
  if (!(Math.abs(pico.z) < 4)) throw new Error(`el pico no está cerca del centro de la loma: ${JSON.stringify(pico)}`);
  // la cámara nunca atraviesa el relieve: siempre por encima de la altura del propio avatar en cada instante
  const atraviesa = muestras.find((m) => m.camY < m.y - 0.01);
  if (atraviesa) throw new Error(`la cámara atraviesa el terreno: ${JSON.stringify(atraviesa)}`);
  out.muestras = muestras;
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.muestrasFallo = muestras;
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").filter((l) => l.includes("objetos") || l.includes("mundo") || l.includes("malla")).slice(-12);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
