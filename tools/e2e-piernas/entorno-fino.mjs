// e2e leg entorno-fino (H4b): the fine environment in the builder's «Entorno» drawer. Starts its OWN server and page (ports
// E2E_SERVER_PORT / E2E_VITE_PORT, default 8931 / 5431) on an empty data folder where every guest may build (MOTOR_CONSTRUIR=todos).
// What it checks, with the real HTML controls:
//  1) A (desktop, level A) picks the sky kind and the sky, fog and sun COLOURS, the fog's near distance and the sun's strength → B's render
//     state (view.entorno.estado(): background, fog colour/near, sun colour/strength) follows.
//  2) A UPLOADS an .hdr through the panel's file button (the house HDR file, so its sha256 is known): the server keeps it under /a/, the
//     environment names «<sha256>.hdr» and B lights the world from the file (luzEntorno «fichero»); A picks it from the library as the
//     sky picture too → B draws it (modoCielo «imagen»).
//  3) A phone (touch, mobile → level C) that enters AFTER that fetches NO .hdr at all (requests counted), shows the colour sky, says so in
//     the panel (the note) and the state reports `ficheros.omitidos`; the desktop control page DID fetch it. Simulated B/D tiers do the same.
//  4) A page that cannot build does not get the controls to change anything (the server refuses, checked by the unit test), no page errors.
// Env: SHOTS=<folder> saves the pictures. Prints JSON; exit 0 only when all is right. Run it under the one-Chromium lock on the PC.
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
const SP = Number(process.env.E2E_SERVER_PORT ?? 8931), VP = Number(process.env.E2E_VITE_PORT ?? 5431);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const HDR_FICHERO = join(REPO, "activos/cielos/kloofendal_48d_partly_cloudy_puresky_1k.hdr");
const HDR_SHA = createHash("sha256").update(readFileSync(HDR_FICHERO)).digest("hex");
const HDR = `${HDR_SHA}.hdr`;

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

try {
  const ctxPC = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const A = await abrir(ctxPC, URL_A);
  await A.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && globalThis.__numinia.ambiente.estado.puede, null, { timeout: 15000 });
  const B = await abrir(ctxPC, URL_A);
  await A.bringToFront();
  await A.evaluate(() => { if (document.getElementById("panel-construir").hidden) document.getElementById("construir").click(); });
  await A.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 10000 });
  await A.locator("#dock-entorno").click();
  await A.waitForSelector("#entorno-color-cieloArriba", { state: "attached", timeout: 10000 });
  await A.locator("#entorno-color-cieloArriba").scrollIntoViewIfNeeded();
  const etiquetas = await A.evaluate(() => [...document.querySelectorAll("#panel-entorno input[type=color], #panel-entorno select, #panel-entorno input[type=range]")].map((i) => i.getAttribute("aria-label") || i.closest("label")?.textContent || ""));
  nota("0 los controles finos están en el panel Entorno", { etiquetas });
  for (const t of ["Tipo de cielo", "Color del cielo (arriba)", "Color del cielo (horizonte)", "Color de la niebla", "Color del sol", "Fuerza del sol", "Niebla (cerca)", "Fondo del cielo (imagen)", "Luz del cielo (HDR)"]) verifica(etiquetas.some((e) => e.includes(t)), `falta el control «${t}»`);
  const e0 = await estado(B);
  verifica(e0.nivel === "A", `la pestaña B es nivel A (${e0.nivel})`);
  await foto(A, "pc-1-panel-fino");

  // ---------- 1) colours, fog, sun ----------
  await A.locator("#panel-entorno select[aria-label='Tipo de cielo']").selectOption("degradado");
  await A.locator("#entorno-color-cieloArriba").fill("#223388");
  await A.locator("#entorno-color-cieloHorizonte").fill("#e0a060");
  await A.locator("#entorno-color-nieblaColor").fill("#aa5500");
  await A.locator("#entorno-color-solColor").fill("#ff2200");
  const poner = (campo, v) => A.evaluate(([c, x]) => { const i = [...document.querySelectorAll("#panel-entorno input[type=range]")].find((r) => r.getAttribute("aria-label") === c); i.value = String(x); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); }, [campo, v]);
  await poner("Fuerza del sol", 6); await poner("Niebla (cerca)", 25);
  await B.bringToFront();
  await esperaEstado(B, "(e) => e.cielo === 'degradado' && e.fondo === '#e0a060' && e.niebla && e.niebla.color === '#aa5500' && e.sol.color === '#ff2200'");
  await sleep(500);
  const e1 = await estado(B), v1 = await valores(B);
  nota("1 A cambia cielo, niebla y sol con el panel; B lo ve", { fondo: e1.fondo, niebla: e1.niebla, sol: e1.sol, cielo: e1.cielo, preset: v1.preset });
  verifica(e1.niebla.cerca === 25 && e1.sol.intensidad === 6, `niebla cerca / fuerza del sol: ${JSON.stringify([e1.niebla, e1.sol.intensidad])}`);
  verifica(v1.nieblaAuto === false && v1.preset === "propio", `la niebla a mano apaga «del cielo»: ${JSON.stringify([v1.nieblaAuto, v1.preset])}`);
  await mirarAlCielo(B);
  await foto(B, "pc-2-B-cielo-a-mano");
  await A.bringToFront();
  await A.locator("#entorno-niebla-auto").click();
  await B.bringToFront();
  await esperaEstado(B, "(e) => e.niebla && e.niebla.color === '#e0a060'");
  nota("1b «Niebla del color del cielo» vuelve a seguir al horizonte");

  // ---------- 2) upload an HDR through the panel ----------
  await A.bringToFront();
  await A.evaluate(() => globalThis.__numinia.ambiente.restaurar()); // back to the house look, so the HDR is the only change in the pictures
  await B.bringToFront();
  await esperaEstado(B, "(e) => e.cielo === 'atmosfera'");
  await A.bringToFront();
  const antesSubidas = await A.evaluate(() => globalThis.__numinia.soltar?.cuenta ? { ...globalThis.__numinia.soltar.cuenta } : null);
  await A.locator("#entorno-hdr-fichero").setInputFiles(HDR_FICHERO);
  await A.waitForFunction((h) => globalThis.__numinia.ambiente.valores().hdr === h, HDR, { timeout: 30000 });
  const r = await fetch(`http://127.0.0.1:${SP}/a/${HDR}`, { method: "HEAD" });
  verifica(r.status === 200, `el servidor guarda ${HDR} en /a/ (${r.status})`);
  await B.bringToFront();
  await esperaEstado(B, "(e) => e.luzEntorno === 'fichero'");
  const e2 = await estado(B);
  nota("2 A sube un .hdr con «Subir…»; B enciende la luz con ese fichero", { hdr: HDR, luzEntorno: e2.luzEntorno, ficheros: e2.ficheros, subidoPorElServidor: r.status });
  verifica(e2.ficheros.hdr === HDR && !e2.ficheros.omitidos, `ficheros en nivel A: ${JSON.stringify(e2.ficheros)}`);
  // the library: the same house sky as the picture behind
  await A.bringToFront();
  const opcionesImagen = await A.locator("#entorno-imagen option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent })));
  verifica(opcionesImagen.some((o) => o.v === HDR) && opcionesImagen[0].v === "", `la biblioteca ofrece «ninguno» y el cielo de la casa: ${JSON.stringify(opcionesImagen)}`);
  await A.locator("#entorno-imagen").selectOption(HDR);
  await B.bringToFront();
  await esperaEstado(B, "(e) => e.modoCielo === 'imagen'");
  await sleep(1500);
  const e3 = await estado(B);
  nota("2b el fondo de la biblioteca se dibuja en B", { modoCielo: e3.modoCielo, fondo: e3.fondo, ficheros: e3.ficheros });
  await mirarAlCielo(B);
  await foto(B, "pc-3-B-hdr-de-fondo");
  await A.bringToFront(); await A.locator("#entorno-imagen").scrollIntoViewIfNeeded(); await foto(A, "pc-4-A-panel-fondo");

  // ---------- 3) a phone (level C) fetches no .hdr; the desktop does ----------
  const ctrl = [], movil = [];
  const ctxPC2 = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const PC2 = await abrir(ctxPC2, URL_A, ctrl);
  await esperaEstado(PC2, "(e) => e.luzEntorno === 'fichero'");
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const M = await abrir(ctxM, URL_A, movil);
  await sleep(4000);
  const eM = await estado(M);
  nota("3 un móvil (nivel C) no baja ningún .hdr; el de escritorio sí", { nivelMovil: eM.nivel, peticionesMovil: movil.length, peticionesEscritorio: ctrl.length, ficheros: eM.ficheros, modoCielo: eM.modoCielo, luzEntorno: eM.luzEntorno });
  verifica(eM.nivel === "C", `el móvil es nivel C (${eM.nivel})`);
  verifica(ctrl.length >= 1, "el escritorio sí pide el .hdr (control)");
  verifica(movil.length === 0, `el móvil no pide ningún .hdr: ${movil.join(", ")}`);
  verifica(eM.ficheros.omitidos && eM.ficheros.hdr === "" && eM.ficheros.fondo === "" && eM.modoCielo !== "imagen" && eM.luzEntorno !== "fichero", `el móvil usa el cielo de colores: ${JSON.stringify(eM)}`);
  await M.evaluate(() => globalThis.__numinia.view.cam.mirarHacia(globalThis.__numinia.view.cam.yaw(), -0.42)); await sleep(1500);
  await foto(M, "movil-5-nivel-C-sin-hdr");
  for (const nv of ["B", "D"]) {
    await B.bringToFront();
    await B.evaluate((n) => globalThis.__numinia.view.entorno.simularNivel(n), nv);
    await sleep(600);
    const en = await estado(B);
    verifica(en.nivel === nv && en.ficheros.omitidos && en.ficheros.hdr === "" && en.modoCielo !== "imagen" && en.luzEntorno !== "fichero", `nivel ${nv} simulado: ${JSON.stringify([en.nivel, en.ficheros, en.modoCielo, en.luzEntorno])}`);
  }
  await B.evaluate(() => globalThis.__numinia.view.entorno.simularNivel(null)); await sleep(600);
  const eB = await estado(B);
  verifica(eB.nivel === "A" && eB.modoCielo === "imagen", `al volver a A, vuelve el fondo: ${JSON.stringify([eB.nivel, eB.modoCielo])}`);
  nota("3b niveles B y D simulados: sin fichero grande; al volver a A vuelve el fondo");
  // the note on the phone-class tier is in the panel only when the page is not level A: check it on the builder's own page by simulating
  await A.bringToFront();
  await A.evaluate(() => globalThis.__numinia.view.entorno.simularNivel("C")); await sleep(1200);
  const nota3 = await A.locator("#entorno-nota-nivel").evaluate((n) => ({ oculta: n.hidden, texto: n.textContent }));
  verifica(!nota3.oculta && /no se carga el HDR grande/.test(nota3.texto), `la nota del panel en nivel C: ${JSON.stringify(nota3)}`);
  await A.evaluate(() => globalThis.__numinia.view.entorno.simularNivel(null));
  nota("3c la nota del panel avisa en nivel C", nota3);

  // ---------- leave the world as found ----------
  await A.evaluate(() => globalThis.__numinia.ambiente.restaurar());
  await sleep(500);
  verifica(errors.length === 0, `errores de página: ${errors.join(" | ")}`);
  ok = true;
} catch (e) {
  out.fallo = String(e?.message ?? e);
} finally {
  out.ok = ok;
  console.log(JSON.stringify(out, null, 1));
  await browser.close().catch(() => {});
  for (const x of procs) { try { x.p.kill(); } catch { /* gone */ } }
  if (!ok) for (const x of procs) console.error(`--- ${x.nombre}\n${x.log().slice(-1500)}`);
  process.exit(ok ? 0 : 1);
}
