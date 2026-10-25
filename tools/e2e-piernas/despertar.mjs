// e2e leg (lote 10, MIS-... t_af276a26): «el e2e comprueba en pantalla la columna Despertar». A real signed QR link (GET /e/<token>) wakes the
// point «la fuente» (0, 12) of features/despertar/enlaces.json: the page must (1) get the event (view.beaconCount() 0 → 1), (2) DRAW the column of
// light on screen — compared in PIXELS, same camera pose before/after: a clear gold-lit patch appears in a vertical band around the point's
// projected column and nowhere else —, (3) with the setting «Despertar → Columna de luz» OFF the same scan draws no column (count of lit pixels stays at the noise),
// (4) a forged token wakes nothing. The camera is aimed at the point with view.cam.mirarHacia so the check does not depend on the spawn's heading.
// Starts its OWN server (MOTOR_SECRET set) and page on a throwaway world (E2E_SERVER_PORT / E2E_VITE_PORT, default 8799 / 5181); run it under the shared
// Chromium lock. Env: SHOTS=<folder> saves pictures. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { firmar } from "../../features/despertar/tokens.ts";
import { signer } from "../../packages/server/src/secret.ts";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64", "chrome-headless-shell")).find(existsSync); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8799), VP = Number(process.env.E2E_VITE_PORT ?? 5181);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);

const SECRETO = "e2e-despertar-secreto-0123456789";
const sign = signer(SECRETO), PUNTO = { id: "fuente", x: 0, z: 12 };
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-despertar-")), entorno = join(tmp, "entorno"), datos = join(tmp, "datos");
mkdirSync(entorno); mkdirSync(datos);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const procs = [];
const arrancar = (cmd, args, env) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); p.stdout.on("data", () => {}); p.stderr.on("data", () => {}); procs.push(p); };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), MOTOR_SECRET: SECRETO });
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) });
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const escanear = async (token) => { const r = await fetch(`http://127.0.0.1:${SP}/e/${token}`); return { status: r.status, texto: await r.text() }; };

// pixel diff done in the page: how many pixels of `despues` are clearly LIT (brighter, gold-ish: R and G up much more than B) compared with `antes`, and where (column bounds)
const COMPARAR = async (p, antes, despues) => p.evaluate(async ([a, b]) => {
  const cargar = (u) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
  const [A, B] = await Promise.all([cargar(a), cargar(b)]), w = A.width, h = A.height;
  const px = (im) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const da = px(A), db = px(B); let n = 0, x0 = w, x1 = -1;
  const cols = new Uint32Array(w);
  for (let y = Math.round(h * 0.12); y < h * 0.62; y++) for (let x = 0; x < w; x++) { // the sky band: clear of the bottom HUD (hotbar) and the top row of buttons
    const i = (y * w + x) * 4, dr = db[i] - da[i], dg = db[i + 1] - da[i + 1], dbl = db[i + 2] - da[i + 2];
    if (dr > 14 && dg > 10 && dr - dbl > 12) { n++; cols[x]++; }
  }
  for (let x = 0; x < w; x++) if (cols[x] > h * 0.08) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return { w, h, lit: n, bandX: x1 >= 0 ? [x0, x1] : null };
}, [antes, despues]);
const foto = async (p, nombre) => { const buf = await p.screenshot(); if (SHOTS) writeFileSync(join(SHOTS, `${nombre}.png`), buf); return `data:image/png;base64,${buf.toString("base64")}`; };

const errors = [], out = { pasos: [], errors }, t0 = Date.now();
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false, browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const a = await ctx.newPage(); a.on("pageerror", (e) => errors.push(String(e)));
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  await sleep(1500);
  // aim at the point: three.js yaw 0 looks along −z, so the direction (dx, dz) is yaw = atan2(−dx, −dz); pitch 0.25 = a little down, the column rises to 40 m
  const apuntar = async () => { await a.evaluate(([x, z]) => globalThis.__numinia.view.cam.mirarHacia(Math.atan2(-x, -z), 0.1), [PUNTO.x, PUNTO.z]); await sleep(1500); };
  const cuenta = () => a.evaluate(() => globalThis.__numinia.view.beaconCount());
  await apuntar();
  nota("1 camera aimed at the point", { cam: await a.evaluate(() => globalThis.__numinia.view.cam.estado().yaw), cuenta: await cuenta() });

  // (4) a forged token wakes nothing
  const falso = await escanear("no-vale-" + firmar(sign, PUNTO.id).slice(-12));
  await sleep(600);
  nota("2 a forged token", { status: falso.status, cuenta: await cuenta() });
  if (falso.status !== 404 || (await cuenta()) !== 0) throw new Error("a forged token must wake nothing");

  // (1)+(2) the real scan: event arrives and the column is on screen
  const antes = await foto(a, "despertar-0-antes");
  const real = await escanear(firmar(sign, PUNTO.id));
  await a.waitForFunction(() => globalThis.__numinia.view.beaconCount() > 0, null, { timeout: 8000 });
  await sleep(1200);
  const durante = await foto(a, "despertar-1-columna");
  const con = await COMPARAR(a, antes, durante);
  nota("3 the real scan", { status: real.status, cuenta: await cuenta(), ...con });
  if (real.status !== 200 || !/Has despertado/.test(real.texto)) throw new Error("the real link must answer 200 «Has despertado»");
  if (!(con.lit >= 400)) throw new Error(`the column of light is not on screen (lit pixels ${con.lit})`);
  if (!con.bandX || con.bandX[0] > con.w * 0.65 || con.bandX[1] < con.w * 0.35) throw new Error(`the lit band must pass through the middle of the screen where the point is: ${JSON.stringify(con.bandX)}`);

  // the effect ends by itself (10 s) and the point may be woken again
  await a.waitForFunction(() => globalThis.__numinia.view.beaconCount() === 0, null, { timeout: 15000 });
  const sola = await foto(a, "despertar-2-despues");
  nota("4 the column ends by itself", { cuenta: await cuenta(), lit: (await COMPARAR(a, antes, sola)).lit });

  // (3) the person turned the column off in Ajustes: the same scan draws nothing (the notice still arrives, only the drawing is off)
  await a.evaluate(() => globalThis.__numinia.ajustes.set("despertar.columna", false));
  await sleep(500); await apuntar();
  const antes2 = await foto(a, "despertar-3-sin-columna-antes");
  const otra = await escanear(firmar(sign, PUNTO.id));
  await sleep(2500);
  const durante2 = await foto(a, "despertar-4-sin-columna");
  const sin = await COMPARAR(a, antes2, durante2);
  nota("5 setting off: scan answered, nothing drawn", { status: otra.status, cuenta: await cuenta(), ...sin });
  if (otra.status !== 200) throw new Error("the second scan answers 200");
  if ((await cuenta()) !== 0 || !(sin.lit < con.lit * 0.1)) throw new Error(`with the column off nothing may be drawn (lit ${sin.lit} vs ${con.lit} with it on)`);
  if (errors.length) throw new Error("page errors: " + errors.join(" | "));
  ok = true;
} catch (e) { out.error = String(e?.stack ?? e); }
finally {
  await browser?.close();
  for (const p of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 2));
process.exit(ok ? 0 : 1);
