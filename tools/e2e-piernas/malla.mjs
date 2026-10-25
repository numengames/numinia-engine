// e2e leg (M6 h5-h8, real GLB): a world whose only floor and walls are a mesh collider built from a .glb — no
// solid box backs any of them (their bx0..bz1 stay a 1 cm sliver far from the geometry, so only `colision: "malla"`
// can be doing the work). Starts its OWN server and page (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8799 /
// 5181) on a throwaway world: `sueloMinimo: 1` and `vuelta: (0, 4, 0)` (D-045's own safe-spot snap, same recipe as
// suelo.mjs) put A on a room 4 m up whose floor and four walls are ONE `colision: "malla"` thing (a hand-built
// .glb, 12 x 12 m room). A spawns below 1 m (under the mesh, nothing solid there): the snap puts it at (0, 4, 0);
// from then on gravity is the only thing that could pull it back down — if the GLB mesh floor were not read, A
// would fall through, cross back under 1 m and the house would snap it again (a second «vuelta»). Then:
//  1) A settles on the mesh floor at y≈4 with exactly ONE vuelta (the snap that put it there) — no second one.
//  2) A walks straight for long enough to cross the room twice over if nothing stopped it; a GLB mesh wall (M6
//     h5-h7's `blockedMesh`) holds it inside |x|,|z| <= 6 the whole time, still with no second vuelta.
// Env: SHOTS=<folder> saves a picture of A standing against a wall. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8799), VP = Number(process.env.E2E_VITE_PORT ?? 5181);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

// ---- a tiny .glb writer (same recipe as test/colision-mundo.test.ts) ----
function glb(json, bin) {
  const j = new TextEncoder().encode(JSON.stringify(json)), jp = (4 - (j.length % 4)) % 4, bp = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const total = 12 + 8 + j.length + jp + (bin ? 8 + bin.length + bp : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, j.length + jp, true); dv.setUint32(16, 0x4e4f534a, true); out.set(j, 20); out.fill(0x20, 20 + j.length, 20 + j.length + jp);
  if (bin) { const at = 20 + j.length + jp; dv.setUint32(at, bin.length + bp, true); dv.setUint32(at + 4, 0x004e4942, true); out.set(bin, at + 8); }
  return out;
}
/** A room, authored directly in world space (the object's own place/turn/scale stays identity): a floor at y=4
 * (16 x 16 m, centred on the «vuelta» point) and four walls (4..8 m) at x = ±6, z = ±6 (a 12 x 12 m room). */
function cuartoGlb() {
  const F = 8, L = 6, B = 4, T = 8; // floor half-side 8 m, wall half-side 6 m, wall bottom/top
  const v = [
    [-F, B, -F], [-F, B, F], [F, B, F], [F, B, -F], // 0-3 floor (up-facing winding)
    [-L, B, -L], [-L, B, L], [-L, T, L], [-L, T, -L], // 4-7 wall x=-L
    [L, B, -L], [L, B, L], [L, T, L], [L, T, -L], // 8-11 wall x=+L
    [-L, B, -L], [L, B, -L], [L, T, -L], [-L, T, -L], // 12-15 wall z=-L
    [-L, B, L], [L, B, L], [L, T, L], [-L, T, L], // 16-19 wall z=+L
  ];
  const quads = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15], [16, 17, 18, 19]];
  const idx = [];
  for (const [a, b, c, d] of quads) idx.push(a, b, c, a, c, d);
  const pos = v.flat();
  const posBytes = new Uint8Array(new Float32Array(pos).buffer), idxBytes = new Uint8Array(new Uint16Array(idx).buffer);
  const posPad = (4 - (posBytes.length % 4)) % 4;
  const bin = new Uint8Array(posBytes.length + posPad + idxBytes.length); bin.set(posBytes); bin.set(idxBytes, posBytes.length + posPad);
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: v.length, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: idx.length, type: "SCALAR" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posBytes.length }, { buffer: 0, byteOffset: posBytes.length + posPad, byteLength: idxBytes.length }],
    buffers: [{ byteLength: bin.length }],
  };
  return glb(json, bin);
}
const cuarto = cuartoGlb();
const hash = createHash("sha256").update(cuarto).digest("hex");

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-malla-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos"), activos = join(datos, "activos");
mkdirSync(entorno); mkdirSync(datos); mkdirSync(activos);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 }, sueloMinimo: 1, vuelta: { x: 0, y: 4, z: 0 } }, null, 2));
writeFileSync(join(activos, `${hash}.glb`), cuarto);
// bx0..bz1 a 1 cm sliver far from the room (x=100): `solido: true` (so colisionDe reads "malla", not "ninguna"),
// but solidsFrom needs bx1 > bx0 so it stays a real (if tiny) box the box-collision path could in principle use —
// placed far away on purpose, so the floor and the walls here can only be the GLB mesh, nothing else.
const cuartoObj = {
  modelo: hash, ext: "glb", x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, nombre: "Cuarto de malla",
  tipo: "modelo", oculto: false, volumen: 1, solido: true, colision: "malla", bx0: 100, by0: 0, bz0: 100, bx1: 100.01, by1: 0.01, bz1: 100.01,
  alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false, decorado: false, fijado: true, animar: false, enlace: "",
};
writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 8, savedAt: new Date().toISOString(), state: [["p1", { value: cuartoObj, at: { x: 0, z: 0 } }]], store: [["siguiente", 2]] }));

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: "" }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
await new Promise((r) => setTimeout(r, 1500)); // M6 h8 builds the world's mesh off-tick, async (.glb parse): give it a head
// start before anyone spawns, or they would land on nothing

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors, hash: hash.slice(0, 12) };
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
  const foto = async (n) => { if (SHOTS) { await a.keyboard.press("Escape").catch(() => {}); await a.screenshot({ path: `${SHOTS}/malla-${n}.png` }); } };

  // 1) the first «vuelta» puts A near the GLB mesh floor at y=4 m; gravity pulls it down a touch first, but the
  //    mesh catches it well before 1 m (M6 h3-h4 STEP_UP/SNAP_DOWN) and it settles there — no second vuelta
  await a.waitForFunction(() => globalThis.__numinia.session.selfPosition(0).y >= 3.5, null, { timeout: 20000 });
  await sleep(2500); // if the mesh floor were not read, gravity would carry it under 1 m well inside this window (fall speed 20 m/s²)
  const p1 = await pos(); const v1 = await vueltas();
  nota("1 de pie sobre el suelo de malla", { pos: p1, vueltas: v1 });
  if (!(p1.y > 3.3 && p1.y < 4.3)) throw new Error(`not standing on the mesh floor (y should be near 4): ${JSON.stringify(p1)}`);
  if (v1.length !== 1) throw new Error(`should snap exactly once (the mesh floor should hold it after that): ${JSON.stringify(v1)}`);
  await foto(1);

  // 2) walk in a straight line for long enough to cross the 12 x 12 m room twice over; a GLB mesh wall must hold A
  //    inside |x| <= 6, |z| <= 6 the whole time — there is no solid box anywhere near this room (M6 h5-h7: `blockedMesh`)
  await a.bringToFront(); await a.mouse.click(450, 320);
  await a.keyboard.down("Shift"); await a.keyboard.down("KeyW");
  let maxOut = 0, moved = false;
  const start = await pos();
  for (const t = Date.now(); Date.now() - t < 9000; ) {
    const p = await pos();
    maxOut = Math.max(maxOut, Math.abs(p.x), Math.abs(p.z));
    if (Math.hypot(p.x - start.x, p.z - start.z) > 1) moved = true;
    await sleep(150);
  }
  await a.keyboard.up("KeyW"); await a.keyboard.up("Shift");
  const p2 = await pos(); const v2 = await vueltas();
  nota("2 caminó contra una pared de malla", { pos: p2, maxOut, vueltas: v2 });
  if (!moved) throw new Error("never moved: the walk never left the spawn point");
  if (maxOut > 7) throw new Error(`a GLB mesh wall should have held it near |x|,|z| <= 6: maxOut=${maxOut}`);
  if (!(p2.y > 3.3 && p2.y < 4.3)) throw new Error(`fell off the mesh floor while walking: ${JSON.stringify(p2)}`);
  if (v2.length !== 1) throw new Error(`should still be exactly one vuelta: fell through at some point: ${JSON.stringify(v2)}`);
  await foto(2);

  out.posiciones = { suelo: { x: r2(p1.x), y: r2(p1.y), z: r2(p1.z) }, contraPared: { x: r2(p2.x), y: r2(p2.y), z: r2(p2.z) } };
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").filter((l) => l.includes("activos") || l.includes("malla") || l.includes("mundo") || l.includes("suelo")).slice(-16);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
