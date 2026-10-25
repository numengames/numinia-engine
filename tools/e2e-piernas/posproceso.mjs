// e2e leg posproceso (H12b): bloom, AO and soft shadows are level A only, chosen in the settings, loaded lazily and guarded by a cost gate.
// Starts its OWN server and page (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8932 / 5432). Checks, with the real settings registry:
//  1) A desktop (level A) starts with the three effects OFF and has fetched NO effect code (requests counted: posproceso / Bloom / GTAO chunks).
//  2) Turning them on in the settings fetches the chunks once, builds the pipeline, the sun's shadow radius widens (soft) and the picture
//     differs from the plain one (screenshots + mean pixel difference). Draw rate with and without is measured over 4 s (a software GPU here:
//     the number is a smoke figure, not the reference PC's).
//  3) A phone (touch, mobile → level C): the settings are not offered, asking anyway (settings registry AND view.entorno.efectos) leaves everything off, and
//     NO effect chunk is requested. Simulated B/D tiers on the desktop page drop the effects and bring the plain picture back; back on A they return.
//  4) The cost gate: slow frames fed to view.posproceso.vigilar switch the passes off by themselves and the settings menu shows them off; the soft shadows stay.
// Env: SHOTS=<folder>. Prints JSON; exit 0 only when all is right. Run it under the one-Chromium lock on the PC.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8932), VP = Number(process.env.E2E_VITE_PORT ?? 5432);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-pp-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
mkdirSync(join(tmp, "datos"), { recursive: true });
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), DATOS_DIR: join(tmp, "datos") }, "servidor");
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
let ok = false;
const CODIGO = /\/posproceso\.(ts|js)(\?|$)|posproceso-(?!politica)[\w-]+\.js|BloomNode|GTAONode/; // the lazy chunk (dev: posproceso.ts; build: posproceso-<hash>.js) and the two node modules; NOT posproceso-politica (start bundle)

const abrir = async (ctx, url, peticiones) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  if (peticiones) p.on("request", (r) => { if (CODIGO.test(r.url())) peticiones.push(r.url().split("/").pop()); });
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.ajustes, null, { timeout: 60000 });
  return p;
};
const ent = (p) => p.evaluate(() => { const e = globalThis.__numinia.view.entorno.estado(); return { nivel: e.nivel, efectos: e.efectos, radioSombra: e.radioSombra, sombras: e.calidad.sombras }; });
const pp = (p) => p.evaluate(() => globalThis.__numinia.view.posproceso.estado());
const visibles = (p) => p.evaluate(() => globalThis.__numinia.ajustes.grupos().find((g) => g.id === "graficos").ajustes.filter((x) => ["graficos.bloom", "graficos.ao", "graficos.sombraSuave"].includes(x.id) && x.visible).map((x) => x.id));
const tasa = (p, ms) => p.evaluate(async (t) => { const d0 = globalThis.__numinia.view.power.stats.draws, a = performance.now(); await new Promise((r) => setTimeout(r, t)); return Math.round(((globalThis.__numinia.view.power.stats.draws - d0) / ((performance.now() - a) / 1000)) * 10) / 10; }, ms);
const mirarAlCielo = async (p) => { await p.evaluate(() => globalThis.__numinia.view.cam.mirarHacia(globalThis.__numinia.view.cam.yaw(), 0.18)); await sleep(1500); };
const foto = async (p, nombre) => { const f = SHOTS ? join(SHOTS, `${nombre}.png`) : undefined; return p.screenshot(f ? { path: f } : {}); };
/** Mean absolute difference per channel between two PNGs, decoded in the page. */
const diferencia = (p, a, b) => p.evaluate(async ([x, y]) => {
  const leer = async (b64) => { const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
  const A = await leer(x), B = await leer(y); let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
  return Math.round((s / (A.length / 4) / 3) * 100) / 100;
}, [a.toString("base64"), b.toString("base64")]);

try {
  // ---------- 1) level A starts plain, with no effect code fetched ----------
  const ctxPC = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const pet = [];
  const A = await abrir(ctxPC, URL_A, pet);
  await sleep(2500);
  const e0 = await ent(A), p0 = await pp(A);
  nota("1 nivel A empieza sin efectos y sin bajar su código", { entorno: e0, posproceso: p0, peticiones: [...pet], ajustesVisibles: await visibles(A) }); 
  verifica(e0.nivel === "A", `la página de escritorio es nivel A (${e0.nivel})`);
  verifica(!e0.efectos.bloom && !e0.efectos.ao && !e0.efectos.sombraSuave && !p0.activo, `empieza apagado: ${JSON.stringify([e0.efectos, p0.activo])}`);
  verifica(pet.length === 0, `no se baja código de efectos al arrancar: ${pet.join(", ")}`);
  verifica((await visibles(A)).length === 3, "en A los tres ajustes se ofrecen");
  await mirarAlCielo(A);
  const tasaPlano = await tasa(A, 4000);
  const plano = await foto(A, "pc-1-A-plano");

  // ---------- 2) switch them on in the settings ----------
  await A.evaluate(() => { const a = globalThis.__numinia.ajustes; a.set("graficos.sombras", "alta"); a.set("graficos.sombraSuave", true); a.set("graficos.bloom", true); a.set("graficos.ao", true); });
  await A.waitForFunction(() => globalThis.__numinia.view.posproceso.estado().activo, null, { timeout: 90000 });
  await sleep(600);
  const e1 = await ent(A), p1 = await pp(A);
  nota("2 los ajustes encienden bloom, AO y sombras suaves en A", { entorno: e1, posproceso: p1, peticiones: [...pet] });
  verifica(e1.efectos.bloom && e1.efectos.ao && e1.efectos.sombraSuave, `efectos encendidos: ${JSON.stringify(e1.efectos)}`);
  verifica(p1.construido?.bloom && p1.construido?.ao, `el pipeline lleva bloom y AO: ${JSON.stringify(p1.construido)}`);
  verifica(e1.radioSombra > 1, `la sombra es suave (radio ${e1.radioSombra})`);
  verifica(pet.some((n) => /posproceso/.test(n)) && pet.some((n) => /BloomNode/.test(n)) && pet.some((n) => /GTAONode/.test(n)), `ahora sí se baja el código: ${pet.join(", ")}`);
  await mirarAlCielo(A);
  const conEfectos = await foto(A, "pc-2-A-bloom-ao-sombras");
  const dif = await diferencia(A, plano, conEfectos);
  const tasaFx = await tasa(A, 4000);
  const p1b = await pp(A);
  nota("2b la imagen cambia y se mide el ritmo (GPU por software: cifra de humo, no la del PC de referencia)", { diferenciaMediaPorCanal: dif, dibujosPorSegundo: { plano: tasaPlano, conEfectos: tasaFx }, puerta: p1b });
  verifica(dif > 0.15, `con efectos la imagen difiere de la plana (${dif})`);

  // ---------- 3) tiers other than A ----------
  // 3a simulated B and D on the desktop page: effects off, plain picture; back on A they return
  for (const nv of ["B", "D"]) {
    await A.evaluate((n) => globalThis.__numinia.view.entorno.simularNivel(n), nv);
    await sleep(800);
    const en = await ent(A), pn = await pp(A);
    verifica(!en.efectos.bloom && !en.efectos.ao && !en.efectos.sombraSuave && !pn.activo && en.radioSombra <= 1, `nivel ${nv}: sin efectos: ${JSON.stringify([en.efectos, pn.activo, en.radioSombra])}`);
  }
  nota("3a niveles B y D simulados: efectos apagados, sin pasadas extra");
  await A.evaluate(() => globalThis.__numinia.view.entorno.simularNivel(null));
  await A.waitForFunction(() => globalThis.__numinia.view.posproceso.estado().activo || globalThis.__numinia.view.posproceso.estado().apagadoPorCoste > 0, null, { timeout: 90000 });
  nota("3b al volver a A, vuelven (lo que pidió la persona)", { entorno: await ent(A), posproceso: await pp(A) });

  // 4) the cost gate (deterministic): slow frames switch the passes off, the menu shows it, the soft shadows stay
  await A.evaluate(() => { const a = globalThis.__numinia.ajustes; a.set("graficos.bloom", true); a.set("graficos.ao", true); });
  await A.waitForFunction(() => globalThis.__numinia.view.posproceso.estado().activo, null, { timeout: 90000 });
  const antesGate = await pp(A);
  await A.evaluate(() => { for (let i = 0; i < 400; i++) globalThis.__numinia.view.posproceso.vigilar(60, true); });
  await sleep(500);
  const e4 = await ent(A), p4 = await pp(A), m4 = await A.evaluate(() => ({ bloom: globalThis.__numinia.ajustes.get("graficos.bloom"), ao: globalThis.__numinia.ajustes.get("graficos.ao"), suave: globalThis.__numinia.ajustes.get("graficos.sombraSuave") }));
  nota("4 la puerta de coste apaga las pasadas con cuadros lentos; el menú lo refleja; las sombras suaves siguen", { entorno: e4, posproceso: p4, menu: m4 });
  verifica(!p4.activo && p4.apagadoPorCoste >= 1 && p4.apagadoPorCoste === antesGate.apagadoPorCoste + 1, `la puerta apagó una vez: ${JSON.stringify([antesGate.apagadoPorCoste, p4])}`);
  verifica(!e4.efectos.bloom && !e4.efectos.ao && e4.efectos.sombraSuave && m4.bloom === false && m4.ao === false && m4.suave === true, `menú y estado: ${JSON.stringify([e4.efectos, m4])}`);
  await foto(A, "pc-3-A-tras-la-puerta");

  // ---------- 5) a phone (level C) ----------
  const movil = [];
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const M = await abrir(ctxM, URL_A, movil);
  await sleep(2500);
  const vis = await visibles(M);
  await M.evaluate(() => { const a = globalThis.__numinia.ajustes; a.set("graficos.bloom", true); a.set("graficos.ao", true); a.set("graficos.sombraSuave", true); globalThis.__numinia.view.entorno.efectos({ bloom: true, ao: true, sombraSuave: true }); });
  await sleep(2500);
  const eM = await ent(M), pM = await pp(M);
  nota("5 un móvil (nivel C) no recibe los ajustes; pedirlos a la fuerza no enciende nada ni baja código", { nivel: eM.nivel, ajustesVisibles: vis, entorno: eM, posproceso: pM, peticiones: [...movil] });
  verifica(eM.nivel === "C", `el móvil es nivel C (${eM.nivel})`);
  verifica(vis.length === 0, `el móvil no ve los ajustes: ${vis.join(", ")}`);
  verifica(!eM.efectos.bloom && !eM.efectos.ao && !eM.efectos.sombraSuave && !pM.activo && eM.radioSombra <= 1, `el móvil sin efectos: ${JSON.stringify([eM.efectos, pM.activo, eM.radioSombra])}`);
  verifica(movil.length === 0, `el móvil no baja código de efectos: ${movil.join(", ")}`);
  await foto(M, "movil-4-nivel-C-sin-efectos");

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
