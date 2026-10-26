// e2e leg sol-real (D-076): the sun follows the real one only when the world offers it, the player switched it on and the browser's own question was answered yes.
// Own server and page (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8933 / 5435). Checks: (1) not offered → switching it on never asks the browser for a place and the sun stays the
// world's; (2) offered but the player has not switched it on → never asks; (3) offered + on + accepted (Madrid) → the sun is the computed one for Madrid at the page's clock, NO request leaves
// the page carrying the place (every request URL/body is scanned for the coordinates), the place is not in localStorage; (4) switched off → the world's sun returns; (5) declined → the
// setting goes back off and the sun stays. Exit 0 only when all is right. Run under the one-Chromium lock.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8933), VP = Number(process.env.E2E_VITE_PORT ?? 5435);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-fino-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
mkdirSync(join(tmp, "datos"), { recursive: true });
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MOTOR_CONSTRUIR: "todos", DATOS_DIR: join(tmp, "datos") }, "servidor");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const URL_A = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const verifica = (cond, msg) => { if (!cond) throw new Error(msg); };
const foto = async (p, nombre) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${nombre}.png`) }); };
/** Look a little up so the sky shows in the picture (pitch + = down). */
const mirarAlCielo = async (p) => { await p.evaluate(() => globalThis.__numinia.view.cam.mirarHacia(globalThis.__numinia.view.cam.yaw(), -0.42)); await sleep(1200); };
let ok = false;

const abrir = async (ctx, url, peticiones) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  if (peticiones) p.on("request", (r) => { if (/\.hdr(\?|$)/.test(r.url())) peticiones.push(r.url()); });
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.ambiente?.valores(), null, { timeout: 60000 });
  return p;
};
const estado = (p) => p.evaluate(() => globalThis.__numinia.view.entorno.estado());
const valores = (p) => p.evaluate(() => ({ ...globalThis.__numinia.ambiente.valores() }));
const esperaEstado = async (p, f, arg) => {
  try { await p.waitForFunction(new Function("a", `return (${f})(globalThis.__numinia.view.entorno.estado(), a)`), arg, { timeout: 20000 }); }
  catch (e) { const s = await estado(p).catch(() => null), v = await valores(p).catch(() => null); throw new Error(`espera «${f}» agotada; estado=${JSON.stringify(s)} valores=${JSON.stringify(v)}`); }
};


const solEstado = (p) => p.evaluate(() => { const e = globalThis.__numinia.view.entorno.estado(); return { sol: e.sol, solReal: e.solReal }; });
const pagina = async (ctx, init) => { if (init) await ctx.addInitScript(init); return abrir(ctx, URL_A); };
const CUENTA = `(() => { const g = navigator.geolocation, o = g.getCurrentPosition.bind(g); window.__geoPreguntas = 0; g.getCurrentPosition = (...a) => { window.__geoPreguntas++; return o(...a); }; })();`;
const MADRID = { latitude: 40.4168, longitude: -3.7038, accuracy: 20 };
const LUGAR = /40\.41|3\.70|40\.4168|-3\.7038/;
try {
  // the real sun for Madrid at the page's own clock (the same maths, here in Node, imported from the repo)
  const { posicionSol } = await import(join(REPO, "packages/render/src/sol-real.ts"));

  // ---------- 1) the world does not offer it ----------
  const ctx1 = await browser.newContext({ viewport: { width: 1100, height: 700 }, permissions: ["geolocation"], geolocation: MADRID });
  const A = await pagina(ctx1, CUENTA);
  const peticiones = [];
  A.on("request", (r) => { peticiones.push(`${r.url()} ${r.postData() ?? ""}`); });
  const antes = await solEstado(A);
  await A.evaluate(() => globalThis.__numinia.ajustes.set("graficos.solReal", true));
  await sleep(1500);
  const e1 = await solEstado(A), preg1 = await A.evaluate(() => window.__geoPreguntas);
  nota("1 el mundo no lo ofrece: activarlo no pregunta al navegador y el sol es el del mundo", { antes, despues: e1, preguntas: preg1 });
  verifica(preg1 === 0, `no se pregunta la ubicación (${preg1})`);
  verifica(JSON.stringify(e1.sol) === JSON.stringify(antes.sol) && !e1.solReal.ofrecido && !e1.solReal.activo, "sol sin cambios");
  await A.evaluate(() => globalThis.__numinia.ajustes.set("graficos.solReal", false));

  // ---------- 2) offered, player has not switched it on ----------
  await A.evaluate(() => globalThis.__numinia.ambiente.ajustar({ solReal: true }));
  await esperaEstado(A, "(s) => s.solReal.ofrecido");
  await sleep(1500);
  const preg2 = await A.evaluate(() => window.__geoPreguntas), e2 = await solEstado(A);
  nota("2 el mundo lo ofrece pero la persona no lo ha activado: no se pregunta", { preguntas: preg2, estado: e2 });
  verifica(preg2 === 0 && !e2.solReal.activo, "sin activar no pregunta");

  // ---------- 3) offered + on + accepted ----------
  await A.evaluate(() => globalThis.__numinia.ajustes.set("graficos.solReal", true));
  try { await esperaEstado(A, "(s) => s.solReal.activo"); } catch (e) { throw new Error(`${e.message.slice(0, 80)} preguntas=${await A.evaluate(() => window.__geoPreguntas)} ajuste=${await A.evaluate(() => globalThis.__numinia.ajustes.get("graficos.solReal"))} sr=${JSON.stringify(await A.evaluate(() => globalThis.__numinia.solReal?.estado()))}`); }
  const e3 = await solEstado(A), preg3 = await A.evaluate(() => window.__geoPreguntas);
  const ahora = await A.evaluate(() => Date.now());
  const esperado = posicionSol(ahora, 40.4168, -3.7038);
  const guardado = await A.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  nota("3 ofrecido + activado + aceptado (Madrid): el sol es el calculado, sin enviar la ubicación", { estado: e3, esperado, preguntas: preg3, peticionesTotales: peticiones.length });
  verifica(preg3 === 1, `se pregunta una vez (${preg3})`);
  verifica(Math.abs(e3.sol.altura - esperado.altura) < 1.5 && Math.abs(e3.sol.rumbo - esperado.rumbo) < 3, `el sol es el de Madrid: ${JSON.stringify([e3.sol, esperado])}`);
  verifica(!peticiones.some((u) => LUGAR.test(u)), `ninguna petición lleva la ubicación: ${peticiones.filter((u) => LUGAR.test(u)).join(" | ")}`);
  verifica(!LUGAR.test(guardado) && !/"solReal"[^}]*(40|-4)/.test("") , `la ubicación no se guarda: ${guardado.slice(0, 300)}`);
  await mirarAlCielo(A);
  await foto(A, "pc-5-sol-real-madrid");

  // ---------- 4) switched off ----------
  await A.evaluate(() => globalThis.__numinia.ajustes.set("graficos.solReal", false));
  await esperaEstado(A, "(s) => !s.solReal.activo");
  const e4 = await solEstado(A);
  nota("4 apagado: vuelve el sol del mundo", { estado: e4 });
  verifica(JSON.stringify(e4.sol) === JSON.stringify(antes.sol), `el sol del mundo vuelve: ${JSON.stringify([e4.sol, antes.sol])}`);

  // ---------- 5) declined ----------
  const ctx5 = await browser.newContext({ viewport: { width: 1100, height: 700 } }); // no geolocation permission → the browser says no
  const B = await pagina(ctx5, CUENTA);
  await B.evaluate(() => globalThis.__numinia.ambiente.ajustar({ solReal: true }));
  await esperaEstado(B, "(s) => s.solReal.ofrecido");
  const antes5 = await solEstado(B);
  await B.evaluate(() => globalThis.__numinia.ajustes.set("graficos.solReal", true));
  await B.waitForFunction(() => globalThis.__numinia.ajustes.get("graficos.solReal") === false, null, { timeout: 25000 });
  const e5 = await solEstado(B), preg5 = await B.evaluate(() => window.__geoPreguntas);
  nota("5 rechazado: el ajuste vuelve a apagarse y el sol sigue siendo el del mundo", { estado: e5, preguntas: preg5 });
  verifica(preg5 >= 1 && !e5.solReal.activo && JSON.stringify(e5.sol) === JSON.stringify(antes5.sol), "rechazo sin cambio");

  verifica(errors.length === 0, `errores de página: ${errors.join(" | ")}`);
  ok = true;
} catch (e) {
  out.fallo = String(e?.message ?? e); out.erroresDePagina = errors.slice(0, 5);
} finally {
  out.ok = ok;
  console.log(JSON.stringify(out, null, 1));
  await browser.close().catch(() => {});
  for (const x of procs) { try { x.p.kill(); } catch { /* gone */ } }
  if (!ok) for (const x of procs) console.error(`--- ${x.nombre}\n${x.log().slice(-1500)}`);
  process.exit(ok ? 0 : 1);
}
