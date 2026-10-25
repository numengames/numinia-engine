// e2e leg (lote 5, carril plaza-vr): (1) «nadie enterrado en el suelo de la plaza»: a world with the nature ON (relieve) and a person of the
// adventure standing on a hill — the state says ground + posicion.y (not 0) and the person is drawn there; (4) «los moñoñis reaccionan al clic»:
// a plain click on a moñoni (body or smile) makes both pieces hop (view.reaccionando), they end exactly where they were, a click on empty
// ground does nothing. Starts its OWN server and page (E2E_SERVER_PORT / E2E_VITE_PORT, default 8798 / 5180) on a throwaway world; run it
// under the shared Chromium lock. Env: SHOTS=<folder> saves pictures. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { alturaEn } from "../../packages/relieve/src/relieve.ts";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64", "chrome-headless-shell")).find(existsSync); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8798), VP = Number(process.env.E2E_VITE_PORT ?? 5180);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);

// ---- the throwaway world: nature on (seed 1234), Bruno moved onto a hill, two moñoni pieces 3 m from the spawn ----
const SEMILLA = 1234, nat = (x, z) => alturaEn(SEMILLA, x, z, { tamano: 200, plaza: 12, sinEstanque: false });
let colina = null;
for (let r = 20; r <= 60 && !colina; r += 2) for (let a = 0; a < 360 && !colina; a += 5) { const x = Math.round(r * Math.cos(a * Math.PI / 180)), z = Math.round(r * Math.sin(a * Math.PI / 180)); if (nat(x, z) > 4) colina = { x, z, h: nat(x, z) }; }
if (!colina) throw new Error("no hill found");
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-plaza5-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos"), aventura = join(tmp, "aventura");
mkdirSync(entorno); mkdirSync(datos);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }, null, 2));
writeFileSync(join(entorno, "naturaleza.json"), JSON.stringify({ schema: "numinia-engine/naturaleza@1", activa: true, semilla: SEMILLA }, null, 2));
cpSync(join(REPO, "aventuras/ejemplo"), aventura, { recursive: true });
const bruno = JSON.parse(readFileSync(join(aventura, "pnj/bruno.json"), "utf8")); bruno.posicion = { x: colina.x, z: colina.z };
writeFileSync(join(aventura, "pnj/bruno.json"), JSON.stringify(bruno, null, 2));
const pose = { x: 0, y: 0.86, z: -3, rx: 0, ry: 0, rz: 0, sx: 2.8, sy: 2.8, sz: 2.8, decorado: false, fijado: false, animar: false, tipo: "modelo", ext: "glb", oculto: false, volumen: 1, solido: false, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false };
const lib = JSON.parse(readFileSync(join(REPO, "features/objetos/biblioteca.json"), "utf8")).modelos;
const sha = (id) => lib.find((m) => m.id === id).modelo;
const objs = [["m1", { ...pose, modelo: sha("bolita-rica-turquesa"), nombre: "Moñoni 1" }], ["m2", { ...pose, modelo: sha("bolita-rica-boca"), nombre: "Moñoni 1 boca" }]];
writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 5, savedAt: new Date().toISOString(), state: objs.map(([k, v]) => [k, { value: v, at: { x: v.x, z: v.z } }]), store: [["siguiente", 3], ["sembrado", true]] }));

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, nombre, log: () => t }); };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: aventura }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors, colina };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  const foto = async (n) => { if (SHOTS) await a.screenshot({ path: `${SHOTS}/plaza-lote5-${n}.png` }); };

  // 1) Bruno stands on the hill: state y = ground (no posicion.y: stands on the ground), and the page has him there
  await a.waitForFunction(() => globalThis.__numinia.session.features.cards().some((c) => c.feature === "pnj" && c.key === "bruno"), null, { timeout: 20000 });
  const est = await a.evaluate(() => { const s = globalThis.__numinia.session.features.stateOf("pnj"); const v = s.get("bruno"); return v && { x: v.x, y: v.y, z: v.z }; });
  nota("1 Bruno en la colina", { estado: est, suelo: colina.h });
  if (!est || Math.abs(est.y - colina.h) > 0.05) throw new Error(`Bruno is not on the hill: ${JSON.stringify(est)} vs ${colina.h}`);
  await foto("1-colina-estado");

  // 4) the moñoni: find it on screen, click, both pieces hop, they come back exactly
  await a.waitForFunction(() => globalThis.__numinia.view.objects().loaded >= 2, null, { timeout: 40000 });
  await sleep(500);
  const punto = await a.evaluate(() => {
    const n = globalThis.__numinia, lienzo = n.view.renderer.domElement;
    for (let y = 20; y < innerHeight - 20; y += 10) for (let x = 20; x < innerWidth - 20; x += 10) if (document.elementFromPoint(x, y) === lienzo && n.view.pick(x, y) === "m1") return { x, y };
    return null;
  });
  nota("4 moñoni en pantalla", { punto });
  if (!punto) throw new Error("the moñoni is not on screen / not pickable");
  await foto("4-antes");
  const reposo = await a.evaluate(() => ["m1", "m2"].map((k) => globalThis.__numinia.view.dibujadoDe(k)));
  if (reposo.some((r) => !r)) throw new Error("the pieces are not drawn");
  // a click on empty sky/ground does nothing
  await a.mouse.click(30, 30); await sleep(200);
  const nada = await a.evaluate(() => globalThis.__numinia.view.reaccionando());
  if (nada.length) throw new Error(`a click on nothing made something hop: ${nada}`);
  // the in-page sampler reads the drawn position on every animation frame of the page while the hop runs
  await a.evaluate(() => { const n = globalThis.__numinia; globalThis.__muestras = []; const t0 = performance.now(); const paso = () => { const v = n.view; globalThis.__muestras.push({ t: Math.round(performance.now() - t0), m1: v.dibujadoDe("m1"), m2: v.dibujadoDe("m2") }); if (performance.now() - t0 < 2500) requestAnimationFrame(paso); }; requestAnimationFrame(paso); });
  await a.mouse.click(punto.x, punto.y);
  await a.waitForFunction(() => globalThis.__numinia.view.reaccionando().length === 2, null, { timeout: 2000 });
  nota("4 reacciona", { piezas: await a.evaluate(() => globalThis.__numinia.view.reaccionando()) });
  await sleep(600); await foto("4-salto");
  await a.waitForFunction(() => globalThis.__numinia.view.reaccionando().length === 0, null, { timeout: 6000 });
  await sleep(2600);
  const muestras = await a.evaluate(() => globalThis.__muestras);
  const maxSube = Math.max(...muestras.map((m) => m.m1.y - reposo[0].y)), maxSubeBoca = Math.max(...muestras.map((m) => m.m2.y - reposo[1].y));
  const fin = await a.evaluate(() => ["m1", "m2"].map((k) => globalThis.__numinia.view.dibujadoDe(k)));
  nota("4 terminó", { fotogramas: muestras.length, maxSube, maxSubeBoca, reposoY: reposo[0].y, finY: fin[0].y });
  if (!(maxSube > 0.2 && maxSubeBoca > 0.2)) throw new Error(`no visible hop: ${maxSube} / ${maxSubeBoca}`);
  if (JSON.stringify(fin) !== JSON.stringify(reposo)) throw new Error("they did not come back exactly where they were");
  await foto("4-despues");
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").slice(-12);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 2));
process.exit(ok ? 0 : 1);
