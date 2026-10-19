// e2e-lenta — the whole darts duel (AR-D5) in two real browsers: A on a PC in the world, B on a wall in AR (IWER Quest 3).
// Slow (~1-2 min on a loaded machine): tools/auto.sh e2e skips it unless E2E_LENTAS=1; run it alone:
//   node tools/e2e-piernas/dardos-duelo.mjs        (SHOTS=<folder> saves A's pictures; DEBUG=1 prints the walking;
//   RETRASO_LECTURA_MS=7000 delays the read of the darts at the end: shows the client takes them out 6 s after `finduelo`)
// It starts its OWN server and page (E2E_SERVER_PORT / E2E_VITE_PORT, default 8799 / 5181) on a throwaway world: entorno.json
// puts everybody ~45 m west of the board (B stays far from it: farther than radius + CERCA_M, so only the duel events reach it)
// and dardos.json has ONE board {id "torre", duelo, remoto, rondas 1}. Then:
//  1) A (1280×800, mouse) runs to the throwing line and presses E: the sign over the 3D board says «Esperando rival — ¿juegas desde tu pared (AR)?».
//  2) B (AR, wall 2.4 m in front) opens the darts view, «En tu pared (AR)», hangs the board (trigger): B joins `desde pared`
//     while its avatar is far away. A's page now shows B's name and «En su pared (AR)»; B's AR panel says whose turn it is.
//  3) Turns: A throws 3 darts (mouse hold + release) while B tries one out of turn (nothing is sent); then B throws 3 (trigger)
//     while A tries one out of turn (the server says «No es tu turno»). Every dart lands on BOTH sides; the scores and the verdict
//     (Ganas / Pierdes / Empate) agree with the server and with each other.
//  4) B leaves AR cleanly.
//  5) Variant: a second match; B leaves AR in the middle of it → A reads «Ganas · tu rival se fue» (abandono).
//  v3 (teams): the change of turn is ALWAYS a button. After the 3rd dart the visit waits in «Retira los dardos»: A clicks «Cambiar turno»
//     in its HUD; B presses the same button on its 3D AR panel with the controller ray (IWER aimed at the panel's button).
//  6) Three players on a board with `equipos: 3` (A on the PC, B and C in other browsers, all joined before the host presses): the
//     host sees «Empezar» only once 2 teams sit and clicks it; the turns go A, B, C; each presses «Cambiar turno» in its HUD; the three
//     rows, their scores and the verdict agree on the three pages. Under load (loadavg > 8) a wait that times out is retried once
//     with a longer limit and the run says it was the load (out.cargas); with the machine quiet a timeout is a failure.
// No page errors anywhere. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir, loadavg } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const MS = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright"; // the installed headless shell may be any revision
const hallar = () => { try { return readdirSync(MS).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse().map((d) => join(MS, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find(existsSync); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? hallar() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8799), VP = Number(process.env.E2E_VITE_PORT ?? 5181);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");

// ---- the throwaway world: spawn square around (-34, 0), one duel board at (14, 0) ----
const TABLERO = { x: 14, z: 0, radio: 3 }, CERCA_M = 40; // CERCA_M = features/dardos/feature.ts
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-duelo-"));
const entorno = join(tmp, "entorno");
mkdirSync(entorno);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: -34, z: 0, radio: 3 } }, null, 2));
writeFileSync(join(entorno, "dardos.json"), JSON.stringify({ schema: "numinia-engine/dardos@1", sitios: [{ id: "torre", nombre: "Diana de la Torre", x: TABLERO.x, y: 0, z: TABLERO.z, radio: TABLERO.radio, duelo: true, remoto: true, rondas: 1 }, { id: "mesa", nombre: "Mesa de tres", x: 14, y: 0, z: 14, radio: 3, duelo: true, remoto: true, rondas: 1, equipos: 3 }] }, null, 2));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
for (const port of [SP, VP]) if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) { console.error(`port ${port} is in use: set E2E_SERVER_PORT / E2E_VITE_PORT`); process.exit(2); }
arrancar("nice", ["-n", "10", "node", "packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: join(tmp, "datos"), SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: "" }, "server");
arrancar("nice", ["-n", "10", "npx", "vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/status`).catch(() => null); if (r.ok && s) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => { out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra }); if (process.env.DEBUG) console.error("paso", paso, Math.round((Date.now() - t0) / 1000) + " s"); };
const abrir = async (etiqueta, opts = {}, init = "") => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${etiqueta}: ${e}`));
  p.on("crash", () => errors.push(`${etiqueta}: la página se ha caído (crash)`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${etiqueta} console: ${m.text().slice(0, 200)}`); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 60000 });
  return p;
};
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
async function caminar(p, x, z, cerca = 0.8, maxMs = 60000) {
  await p.bringToFront();
  const t = Date.now();
  let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (process.env.DEBUG) console.error("caminar", Math.round(me.x * 10) / 10, Math.round(me.z * 10) / 10, "→", Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    if (d <= cerca) break;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    const corre = Math.max(Math.abs(dx), Math.abs(dz)) > 3; // run (Shift, 4 m/s) far away, walk (1.5 m/s) near
    if (corre) held.unshift("Shift");
    const ms = Math.max(90, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / (corre ? 4 : 1.5)) * 1000));
    for (const k of held) await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    for (const k of held) await p.keyboard.up(k);
    await p.waitForTimeout(120);
  }
  return Math.round(d * 10) / 10;
}
const ctl = (p, code, arg) => p.evaluate(code, arg);
const esperar = async (p, fn, arg, ms = 15000) => {
  try { return await p.waitForFunction(fn, arg, { timeout: ms }); } catch (e) {
    const carga = loadavg()[0];
    if (carga <= 8) throw e; // the machine is quiet: a timeout is a failure
    (out.cargas ??= []).push({ carga: Math.round(carga * 10) / 10, espera: String(fn).slice(0, 90), ms }); // loaded: wait again, three times as long, and say so
    return p.waitForFunction(fn, arg, { timeout: ms * 3 });
  }
};
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/dardos-duelo-${n}.png` }); };
const duelo = (p) => ctl(p, () => { const d = globalThis.__numinia.dardos.duelo(); return d && { sitio: d.sitio, ronda: d.ronda, esperando: d.esperando, turnoDe: d.turnoDe, yo: d.yo, miTurno: d.miTurno, rival: d.rival, yoPuntos: d.yoPuntos, a: d.a && { entity: d.a.entity, nombre: d.a.nombre, puntos: d.a.puntos, pared: !!d.a.pared }, b: d.b && { entity: d.b.entity, nombre: d.b.nombre, puntos: d.b.puntos, pared: !!d.b.pared }, fin: d.fin && { ganador: d.fin.ganador, empate: d.fin.empate, abandono: d.fin.abandono, texto: d.fin.texto, gane: d.fin.gane } }; });
const vista = (p) => ctl(p, () => globalThis.__numinia.dardosHud?.duelo?.() ?? null);
const aviso = (p) => ctl(p, () => ({ aviso: globalThis.__numinia.dardos.estado().aviso, resultado: document.querySelector("#dardos-hud .resultado")?.textContent ?? "" }));
const prompt = (p) => ctl(p, () => { const b = document.getElementById("interactuar"); return b && !b.hidden ? b.textContent : ""; });
/** Wait for «E: tirar dardos» and press E until the sign says somebody (me) waits. Returns the prompt text. */
async function pulsarE(a) {
  await esperar(a, () => { const b = document.getElementById("interactuar"); return b && !b.hidden && /dardos/i.test(b.textContent ?? ""); }, null, 30000);
  const texto = await prompt(a);
  for (let i = 0; i < 3; i++) {
    await a.keyboard.press("KeyE");
    if (await esperar(a, () => globalThis.__numinia.dardosHud?.duelo?.().letrero.fase === "espera", null, 12000).then(() => true, () => false)) return texto;
  }
  throw new Error("E did not open the duel (the sign never said «espera»)");
}
const entidad = (p) => ctl(p, () => globalThis.__numinia.session.entity);

// B's page: a Quest 3 with a wall 2.4 m in front of the viewer, its normal toward you (as the v1 leg)
const INIT_AR = IWER + `;
  class Pared { constructor(d) { this.d = d; this.environmentCanvas = document.createElement("canvas"); } render() {}
    computeHitTestResults() { return [new Float32Array([1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,1.5,-2.4,1])]; } }
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.installSEM(Pared); globalThis.__iwer = dev;`;
const gatillo = (r, ms) => r.evaluate((ms) => new Promise((ok) => { const c = globalThis.__iwer.controllers.right; c.updateButtonValue("trigger", 1); setTimeout(() => { c.updateButtonValue("trigger", 0); setTimeout(ok, 150); }, ms); }), ms);
const arEstado = (r) => ctl(r, () => { const s = globalThis.__numinia.dardosHud.ar(); return s && { fase: s.fase, pared: s.pared, lanzados: s.lanzados, clavados: s.clavados, ultimo: s.ultimo }; });

/** B opens the darts view (a far player has no board to press E at: the page's test hook opens it), starts AR and hangs the board. */
async function bEnPared(b) {
  await b.bringToFront();
  await esperar(b, () => globalThis.__numinia.dardosHud && globalThis.__numinia.dardos.sitios().some((s) => s.id === "torre"), null, 20000);
  await ctl(b, () => globalThis.__numinia.dardosHud.abrir());
  await esperar(b, () => !document.querySelector("#dardos-hud button.ar").hidden, null, 8000);
  out.arBoton ??= await b.evaluate(() => document.querySelector("#dardos-hud button.ar").textContent);
  await b.evaluate(() => document.querySelector("#dardos-hud button.ar").click());
  await esperar(b, () => globalThis.__numinia.view.ar.jugando, null, 20000);
  await b.waitForTimeout(600);
  // the right controller in front of the chest, pointing straight at the wall
  await b.evaluate(() => { const c = globalThis.__iwer.controllers.right; c.position.set(0.02, 1.52, -0.35); c.quaternion.set(0, 0, 0, 1); });
  await gatillo(b, 150); // hangs the board where the ring is → joins «desde pared»
  await esperar(b, () => globalThis.__numinia.dardosHud.ar()?.fase === "colocada", null, 8000);
}
const salirAR = async (b) => {
  await b.evaluate(() => globalThis.__numinia.view.ar.exit());
  await esperar(b, () => globalThis.__numinia.view.ar.state === "off", null, 10000).catch(() => {});
  return b.evaluate(() => globalThis.__numinia.view.ar.state);
};

const res = {};
let ok = false;
try {
  // ------------------------------------------------------------------------------------------ 1) A waits at the board
  const a = await abrir("A", { viewport: { width: 1280, height: 800 } });
  const ea = await entidad(a);
  // B loads first and waits at its spawn: a host who waits alone for 60 s is cancelled (TURNO_INACTIVO_S), and loading is the slow part
  const b = await abrir("B", { viewport: { width: 640, height: 400 } }, INIT_AR);
  const eb = await entidad(b);
  const pb = await yo(b);
  res.bLejos = Math.round(Math.hypot(pb.x - TABLERO.x, pb.z - TABLERO.z) * 10) / 10;
  await esperar(a, () => globalThis.__numinia.view.dardos.linea("torre"), null, 20000);
  const linea = await ctl(a, () => globalThis.__numinia.view.dardos.linea("torre"));
  const dist = await caminar(a, linea.x + 0.7 * Math.sin(linea.rumbo), linea.z + 0.7 * Math.cos(linea.rumbo), 0.4); // the line is 2.6 m from the board and the radius is 3: stand a little inside it
  nota("A en la línea", { linea, dist });
  res.promptA = await pulsarE(a);
  // nobody threw yet, so the throwing view (which turns the camera to the board) is not open: turn it here for the picture
  await ctl(a, () => { const l = globalThis.__numinia.view.dardos.linea("torre"), cam = globalThis.__numinia.view.cam, d = l.rumbo - Math.PI - cam.yaw(); cam.girar(Math.atan2(Math.sin(d), Math.cos(d))); });
  await a.waitForTimeout(1500);
  res.letreroEspera = (await vista(a)).letrero;
  res.sitioEspera = await ctl(a, () => { const s = globalThis.__numinia.dardos.sitios().find((s) => s.id === "torre"); return { espera: s.espera, ocupado: s.ocupado, duelo: s.duelo, remoto: s.remoto, rondas: s.rondas }; });
  await ctl(a, () => { const h = document.getElementById("dardos-hud"); h.dataset.vis = h.style.visibility; h.style.visibility = "hidden"; }); // the picture shows the 3D board and its sign, not the throwing view
  await foto(a, "1-letrero-espera");
  if (process.env.CAPTURA) await a.screenshot({ path: process.env.CAPTURA });
  await ctl(a, () => { document.getElementById("dardos-hud").style.visibility = ""; });
  nota("A espera rival", res.letreroEspera);

  // ------------------------------------------------------------------------------------------ 2) B joins from its wall
  nota("B dentro, lejos", { eb, lejos: res.bLejos });
  await bEnPared(b);
  nota("B colgó la diana", await arEstado(b));
  await esperar(a, () => { const d = globalThis.__numinia.dardos.duelo(); return d && !d.esperando && d.rival; }, null, 15000);
  await esperar(b, () => { const d = globalThis.__numinia.dardos.duelo(); return d && d.yo && !d.esperando; }, null, 15000);
  await a.waitForTimeout(500);
  const dA0 = await duelo(a), dB0 = await duelo(b);
  const nombreB = dB0.a.entity === eb ? dB0.a.nombre : dB0.b.nombre;
  res.inicio = { dA: dA0, dB: dB0, nombreB, bLejos: res.bLejos };
  res.sign0 = (await vista(a)).letrero;
  res.panelB0 = (await vista(b)).panelAR;
  res.lineaA0 = (await vista(a)).linea;
  await esperar(a, () => globalThis.__numinia.dardos.tirando() && !!globalThis.__numinia.dardosHud.abierto(), null, 10000);
  await a.waitForTimeout(900); // the camera eases round to the board
  await foto(a, "2-partida");
  nota("partida en marcha", { rivalDeA: dA0.rival?.nombre, turno: dA0.turnoDe });

  // ------------------------------------------------------------------------------------------ 3) the turns
  // 3a) B tries to throw out of turn: the power bar does not fill, nothing is sent
  const b0 = await arEstado(b);
  await gatillo(b, 700);
  await b.waitForTimeout(500);
  const b1 = await arEstado(b);
  res.bFueraDeTurno = { antes: { lanzados: b0.lanzados, clavados: b0.clavados }, despues: { lanzados: b1.lanzados, clavados: b1.clavados }, aviso: await aviso(b) };
  // 3b) A throws its 3 darts (mouse hold + release as in the v1 leg)
  const box = await a.evaluate(() => { const r = document.querySelector("#dardos-hud canvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const tirosA = [];
  for (let n = 1; n <= 3; n++) {
    await a.mouse.move(box.x + box.w / 2, box.y + box.h / 2 - box.h * 0.22);
    await a.mouse.down();
    await a.waitForTimeout(690);
    if (process.env.DEBUG) console.error("cargando", await ctl(a, () => ({ c: globalThis.__numinia.dardosHud.cargando(), p: globalThis.__numinia.dardosHud.potencia(), box: document.querySelector("#dardos-hud canvas").getBoundingClientRect().toJSON(), top: (() => { const e = document.elementFromPoint(640, 400); return e && e.outerHTML.slice(0, 160); })() })), JSON.stringify(box));
    await a.mouse.up();
    if (process.env.DEBUG) { await a.waitForTimeout(1500); console.error("tras soltar", JSON.stringify(await aviso(a)), JSON.stringify(await ctl(a, () => globalThis.__numinia.dardos.estado().ultimo))); }
    await esperar(a, (k) => (globalThis.__numinia.dardos.estado().ultimo?.numero ?? 0) >= k, n, 12000);
    await a.waitForTimeout(250);
    const u = await ctl(a, () => { const e = globalThis.__numinia.dardos.estado(); return { numero: e.ultimo.numero, puntos: e.ultimo.puntos, texto: e.ultimo.texto }; });
    tirosA.push(u);
  }
  res.tirosA = tirosA;
  // v3: after the third dart the visit waits in «Retira los dardos»: nothing changes until A presses «Cambiar turno» in its HUD
  await esperar(a, () => globalThis.__numinia.dardosHud.duelo().botones.cambiar, null, 15000);
  await esperar(b, () => globalThis.__numinia.dardos.duelo()?.retirando === true, null, 15000);
  await b.waitForTimeout(700); // A's darts fly in on the wall (0.4 s) and stick
  res.retirandoA = { vistaA: (await vista(a)), panelB: (await vista(b)).panelAR, miTurnoB: await ctl(b, () => globalThis.__numinia.dardos.duelo().miTurno), bVeA: (await arEstado(b)).clavados, aClavadosDeA: await ctl(a, (e) => globalThis.__numinia.dardos.clavados("torre").filter((x) => x.quien === e).length, ea) };
  await a.click("#dardos-hud .duelo-botones .cambiar", { timeout: 15000 });
  // the turn passes to B
  await esperar(b, () => globalThis.__numinia.dardos.duelo()?.miTurno === true, null, 15000);
  await esperar(a, () => globalThis.__numinia.dardos.duelo()?.miTurno === false && globalThis.__numinia.dardos.duelo()?.turnoDe !== null, null, 15000);
  await b.waitForTimeout(500);
  res.turnoB = { panelB: (await vista(b)).panelAR, bVeA: (await arEstado(b)).clavados, aClavadosDeA: await ctl(a, (e) => globalThis.__numinia.dardos.clavados("torre").filter((x) => x.quien === e).length, ea) };
  // 3c) A tries out of turn: the server says no
  await ctl(a, () => { globalThis.__numinia.dardosHud.abrir(); });
  await a.mouse.move(box.x + box.w / 2, box.y + box.h / 2 - box.h * 0.22);
  await a.mouse.down(); await a.waitForTimeout(400); await a.mouse.up();
  await a.waitForTimeout(700);
  res.aFueraDeTurno = await aviso(a);
  // A's page notes, the instant `finduelo` lands, how many of B's darts it shows: the client takes the darts out DUELO_DARDOS_MS (6 s)
  // after the end, so a slow machine (load 20+) reading them late would see 0 without any bug (the old flaky `dardosDeBenA`)
  await ctl(a, (e) => { const R = (globalThis.__reg = { fin: null, vistos: null }); globalThis.__numinia.dardos.alCambiar((que) => { if (que === "duelo" && !R.fin && globalThis.__numinia.dardos.duelo()?.fin) { R.fin = performance.now(); R.vistos = globalThis.__numinia.dardos.clavados("torre").filter((x) => x.quien !== e).length; } }); }, ea);
  // the same for B's AR wall: the darts on it count at the instant the match ends
  await ctl(b, () => { const R = (globalThis.__reg = { fin: null, clavados: null }); globalThis.__numinia.dardos.alCambiar((que) => { if (que === "duelo" && !R.fin && globalThis.__numinia.dardos.duelo()?.fin) { R.fin = performance.now(); R.clavados = globalThis.__numinia.dardosHud.ar().clavados; } }); });
  // 3d) B throws its 3 darts (trigger hold + release); B's own puntos come from the server (`estado().ultimo`)
  const tirosB = [];
  for (let n = 1; n <= 3; n++) {
    const n0 = (await arEstado(b)).lanzados;
    await gatillo(b, 700);
    await esperar(b, (k) => globalThis.__numinia.dardosHud.ar().lanzados > k, n0, 6000);
    await esperar(b, (k) => (globalThis.__numinia.dardos.estado().ultimo?.numero ?? 0) >= k, n, 12000);
    await b.waitForTimeout(350);
    tirosB.push({ ar: (await arEstado(b)), servidor: await ctl(b, () => { const u = globalThis.__numinia.dardos.estado().ultimo; return { numero: u.numero, puntos: u.puntos }; }) });
    if (n === 3) {
      // everything that must be seen right at the third dart, before the match ends and the darts go
      if (process.env.RETRASO_LECTURA_MS) await b.waitForTimeout(Number(process.env.RETRASO_LECTURA_MS)); // proof of the 6 s window: RETRASO_LECTURA_MS=7000 makes the late read see 0
      res.alFinalDeB = {
        aVeDeB: await ctl(a, (e) => globalThis.__numinia.dardos.clavados("torre").filter((x) => x.quien !== e).length, ea).catch(() => -1),
        aVeDeBAlAcabar: await ctl(a, () => globalThis.__reg?.vistos ?? null).catch(() => null), // what A showed at the very moment the match ended
        bVeAR: (await arEstado(b)).clavados,
        bVeARAlAcabar: await ctl(b, () => globalThis.__reg?.clavados ?? null).catch(() => null),
      };
    }
  }
  res.tirosB = tirosB;
  // v3: B presses «Cambiar turno» on its 3D panel with the controller ray (last visit: the press ends the match)
  await esperar(b, () => globalThis.__numinia.dardosHud.duelo().panelAR?.boton === "cambiar", null, 15000);
  res.botonAR = (await vista(b)).panelAR;
  await b.evaluate((p) => { const c = globalThis.__iwer.controllers.right, o = c.position, d = [p.x - o.x, p.y - o.y, p.z - o.z], n = Math.hypot(...d), u = d.map((v) => v / n);
    // the quaternion that turns -z onto u: axis = (-z) × u = (u.y, -u.x, 0), angle = acos(-u.z)
    const ang = Math.acos(Math.max(-1, Math.min(1, -u[2]))), ax = [u[1], -u[0], 0], an = Math.hypot(...ax) || 1, sn = Math.sin(ang / 2);
    c.quaternion.set((ax[0] / an) * sn, (ax[1] / an) * sn, 0, Math.cos(ang / 2)); }, res.botonAR.puntoBoton);
  await gatillo(b, 150);
  await b.evaluate(() => globalThis.__iwer.controllers.right.quaternion.set(0, 0, 0, 1));
  // ------------------------------------------------------------------------------------------ 4) the end, seen by both
  await esperar(a, () => globalThis.__numinia.dardos.duelo()?.fin, null, 15000);
  await esperar(b, () => globalThis.__numinia.dardos.duelo()?.fin, null, 15000);
  await a.waitForTimeout(500);
  const dA = await duelo(a), dB = await duelo(b);
  res.fin = { dA, dB, signA: (await vista(a)).letrero, panelB: (await vista(b)).panelAR, lineaA: (await vista(a)).linea, lineaB: (await vista(b)).linea, aviso: await aviso(a) };
  await foto(a, "3-fin");
  const sumaA = tirosA.reduce((s, t) => s + t.puntos, 0), sumaB = tirosB.reduce((s, t) => s + t.servidor.puntos, 0);
  res.sumas = { sumaA, sumaB };
  res.arSalio = await salirAR(b);
  nota("partida 1 hecha", { sumaA, sumaB, arSalio: res.arSalio });

  // ------------------------------------------------------------------------------------------ 5) variant: B leaves AR mid-match
  await esperar(a, () => !globalThis.__numinia.dardos.tirando(), null, 10000).catch(() => {});
  res.promptA2 = await pulsarE(a);
  await bEnPared(b);
  await esperar(a, () => { const d = globalThis.__numinia.dardos.duelo(); return d && !d.esperando && d.rival; }, null, 15000);
  await esperar(b, () => { const d = globalThis.__numinia.dardos.duelo(); return d && d.yo && !d.esperando; }, null, 15000);
  res.v2inicio = { dA: await duelo(a), dB: await duelo(b) };
  await a.waitForTimeout(400);
  res.arSalio2 = await salirAR(b); // mid-match: A's turn
  await esperar(a, () => globalThis.__numinia.dardos.duelo()?.fin, null, 15000);
  await a.waitForTimeout(400);
  res.abandono = { dA: await duelo(a), signA: (await vista(a)).letrero, lineaA: (await vista(a)).linea };
  await foto(a, "4-abandono");
  nota("variante hecha", { fin: res.abandono.dA.fin });

  // ------------------------------------------------------------------------------------------ 6) three teams, the host starts with a button
  // C's browser opens BEFORE anybody joins (loading is the slow part on a loaded machine; a host waiting alone for 60 s is cancelled)
  const c = await abrir("C", { viewport: { width: 640, height: 400 } });
  const ec = await entidad(c);
  const todos = [a, b, c], ents = [ea, eb, ec];
  const unirse = (p) => ctl(p, () => globalThis.__numinia.dardos.jugar("mesa", "pared"));
  // join first, open the HUD after (a stale result of the last match would close a HUD opened before: `alTerminar`)
  const abrirHud = async (p) => { for (let i = 0; i < 3; i++) { await ctl(p, () => globalThis.__numinia.dardosHud.abrir()); if (await esperar(p, () => !document.getElementById("dardos-hud").hidden, null, 4000).then(() => true, () => false)) return; } throw new Error("el HUD no se abrió"); };
  const equiposEn = (p) => ctl(p, () => globalThis.__numinia.dardos.duelo()?.equipos?.length ?? 0);
  const botones = async (p) => (await vista(p)).botones;
  const t3 = (res.t3 = {});
  for (const p of todos) await esperar(p, () => globalThis.__numinia.dardos.sitios().some((x) => x.id === "mesa" && x.equipos === 3), null, 30000);
  t3.estadoMesa = await ctl(a, () => { const x = globalThis.__numinia.dardos.sitios().find((y) => y.id === "mesa"); return { equipos: x.equipos, duelo: x.duelo }; });
  await unirse(a); await esperar(a, () => globalThis.__numinia.dardos.duelo()?.sitio === "mesa" && globalThis.__numinia.dardos.duelo().esperando, null, 20000); await abrirHud(a);
  t3.solo = await botones(a);                        // alone: no «Empezar»
  await unirse(b); await esperar(a, () => globalThis.__numinia.dardos.duelo()?.equipos?.length === 2, null, 20000); await abrirHud(b);
  await esperar(a, () => globalThis.__numinia.dardosHud.duelo().botones.empezar, null, 15000);
  t3.con2 = { a: await botones(a), b: await botones(b), esperando: await ctl(a, () => globalThis.__numinia.dardos.duelo().esperando) };   // 2 teams but the host did not press: the 3rd may still come
  await unirse(c); await esperar(a, () => globalThis.__numinia.dardos.duelo()?.equipos?.length === 3, null, 20000); await abrirHud(c);
  for (const p of todos) await esperar(p, () => globalThis.__numinia.dardosHud.duelo()?.letrero.filas.length === 3 && globalThis.__numinia.dardos.duelo().esperando, null, 20000);
  t3.espera = { botonesA: await botones(a), botonesB: await botones(b), botonesC: await botones(c), filas: (await vista(a)).letrero.filas.map((f) => f.nombre), pieB: (await vista(b)).letrero.pie, lineaA: (await vista(a)).linea };
  await a.click("#dardos-hud .duelo-botones .empezar", { timeout: 15000 });
  for (const p of todos) await esperar(p, () => { const d = globalThis.__numinia.dardos.duelo(); return d && !d.esperando && d.ronda === 1; }, null, 20000);
  nota("tres equipos: empezó", { equipos: 3 });
  t3.visitas = []; t3.turnos = [];
  for (let k = 0; k < 3; k++) {
    const p = todos[k];
    await esperar(p, () => globalThis.__numinia.dardos.duelo()?.miTurno === true, null, 20000);
    t3.turnos.push({ k, turnoEq: await ctl(p, () => globalThis.__numinia.dardos.duelo().turnoEq), botonesAntes: await botones(p) });
    for (let n = 1; n <= 3; n++) { await ctl(p, () => globalThis.__numinia.dardos.lanzar(0.1, 0.6, 0.65, "mesa")); await esperar(p, (m) => globalThis.__numinia.dardos.estado().dardos >= m, n, 15000); await p.waitForTimeout(350); }
    const tirada = await ctl(p, () => globalThis.__numinia.dardos.estado().tirada);
    await esperar(p, () => globalThis.__numinia.dardosHud.duelo().botones.cambiar, null, 15000);
    const otros = []; for (const q of todos) if (q !== p) otros.push((await botones(q)).cambiar);
    const piePropio = (await vista(p)).letrero.pie;
    t3.visitas.push({ k, tirada, otrosVenCambiar: otros, piePropio, retirandoEnTodos: await Promise.all(todos.map((q) => ctl(q, () => globalThis.__numinia.dardos.duelo().retirando))) });
    await p.click("#dardos-hud .duelo-botones .cambiar", { timeout: 15000 });
    if (k < 2) await esperar(todos[k + 1], () => globalThis.__numinia.dardos.duelo()?.miTurno === true, null, 20000);
  }
  for (const p of todos) await esperar(p, () => globalThis.__numinia.dardos.duelo()?.fin, null, 20000);
  await a.waitForTimeout(400);
  t3.fin = [];
  for (const p of todos) t3.fin.push({ puntos: await ctl(p, () => globalThis.__numinia.dardos.duelo().equipos.map((x) => x.puntos)), fin: await ctl(p, () => { const f = globalThis.__numinia.dardos.duelo().fin; return { empate: f.empate, gane: f.gane, ganador: f.ganador, texto: f.texto }; }), filas: (await vista(p)).letrero.filas.length, pie: (await vista(p)).letrero.pie });
  nota("tres equipos: acabó", { puntos: t3.fin[0].puntos });
  await a.context().close(); await b.context().close(); await c.context().close();

  // ------------------------------------------------------------------------------------------ the verdict
  const unoDe = (d) => (d.fin.empate ? "Empate" : d.fin.gane ? "Ganas" : "Pierdes");
  const esperadoA = sumaA > sumaB ? "Ganas" : sumaA < sumaB ? "Pierdes" : "Empate";
  const esperadoB = sumaA > sumaB ? "Pierdes" : sumaA < sumaB ? "Ganas" : "Empate";
  const i = res.inicio, f = res.fin;
  const tiradas3 = t3.visitas.map((v) => v.tirada), max3 = Math.max(...tiradas3), unico3 = tiradas3.filter((v) => v === max3).length === 1;
  const pie = (s) => s ?? "";
  res.checks = {
    esperaA: /Esperando rival/.test(pie(res.letreroEspera.pie)) && /AR/.test(pie(res.letreroEspera.pie)) && res.letreroEspera.visible && res.sitioEspera.espera === true,
    bLejos: res.bLejos > TABLERO.radio + CERCA_M,
    arBoton: /pared \(AR\)/.test(out.arBoton),
    bJugoDesdePared: i.dB.yo && i.dB.a.pared === true || i.dB.b?.pared === true,
    aVeAB: i.dA.rival?.nombre === i.nombreB && i.nombreB && i.dA.rival.entity === eb,
    aVeEtiqueta: res.sign0.etiqueta === "En su pared (AR)" && res.sign0.visible,
    turnoInicial: i.dA.miTurno === true && i.dB.miTurno === false && i.dA.turnoDe === ea && !i.dA.esperando && !i.dB.esperando,
    panelBdiceTurno: /^Es el turno de /.test(pie(res.panelB0?.pie)) && res.panelB0.visible,
    lineaAdiceNombre: res.lineaA0.includes(i.nombreB),
    bFueraNoSeEnvia: res.bFueraDeTurno.despues.lanzados === res.bFueraDeTurno.antes.lanzados && res.bFueraDeTurno.despues.clavados === res.bFueraDeTurno.antes.clavados,
    aTresDardos: tirosA.length === 3 && tirosA.every((t) => typeof t.puntos === "number"),
    retirandoA: res.retirandoA.vistaA.letrero.fase === "juego" && /Retira los dardos/.test(res.retirandoA.vistaA.letrero.pie) && res.retirandoA.vistaA.botones.cambiar === true && res.retirandoA.miTurnoB === false && res.retirandoA.bVeA >= 3 && res.retirandoA.aClavadosDeA >= 3 && /retira los dardos/.test(pie(res.retirandoA.panelB?.pie)) && res.retirandoA.panelB?.boton === null,
    turnoDeB: /^Tu turno/.test(pie(res.turnoB.panelB?.pie)) && res.turnoB.bVeA === 0 && res.turnoB.aClavadosDeA === 0,
    botonAR: res.botonAR?.boton === "cambiar" && !!res.botonAR.puntoBoton && res.fin.dB.fin !== undefined,
    aFueraRechazado: /No es tu turno/i.test(`${res.aFueraDeTurno.aviso} ${res.aFueraDeTurno.resultado}`),
    bTresDardos: tirosB.length === 3 && tirosB.every((t) => typeof t.servidor.puntos === "number" && t.ar.ultimo),
    dardosDeBenA: Math.max(res.alFinalDeB.aVeDeB, res.alFinalDeB.aVeDeBAlAcabar ?? 0) >= 3 && (res.alFinalDeB.aVeDeBAlAcabar === null || res.alFinalDeB.aVeDeBAlAcabar >= 3),
    dardosEnARdeB: Math.max(res.alFinalDeB.bVeAR, res.alFinalDeB.bVeARAlAcabar ?? 0) >= 3 && (res.alFinalDeB.bVeARAlAcabar === null || res.alFinalDeB.bVeARAlAcabar >= 3),
    puntosIgualesA: f.dA.a.puntos + 0 === (f.dA.a.entity === ea ? sumaA : sumaB) && f.dA.b.puntos === (f.dA.b.entity === ea ? sumaA : sumaB),
    puntosIgualesEnAyB: f.dA.a.puntos === f.dB.a.puntos && f.dA.b.puntos === f.dB.b.puntos,
    veredictoA: unoDe(f.dA) === esperadoA && f.dA.fin.abandono === false,
    veredictoB: unoDe(f.dB) === esperadoB,
    mismoTexto: f.dA.fin.texto === f.dB.fin.texto && !!f.dA.fin.texto,
    letreroFin: f.signA.fase === "fin" && f.signA.pie === esperadoA,
    panelFinB: f.panelB?.pie === esperadoB,
    arSalio: res.arSalio === "off" && res.arSalio2 === "off",
    abandono: res.abandono.dA.fin.abandono === true && res.abandono.dA.fin.gane === true && res.abandono.signA.pie === "Ganas · tu rival se fue" && /se fue/i.test(res.abandono.dA.fin.texto + " " + res.abandono.signA.pie),
    // ---- six: three teams, the host starts by button ----
    t3Tablero: t3.estadoMesa.equipos === 3 && t3.estadoMesa.duelo === true,
    t3SinEmpezarSolo: t3.solo.empezar === false && t3.solo.cambiar === false,
    t3EmpezarCon2: t3.con2.a.empezar === true && t3.con2.b.empezar === false && t3.con2.esperando === true,
    t3TresFilas: t3.espera.filas.length === 3 && t3.espera.botonesA.empezar === true && !t3.espera.botonesB.empezar && !t3.espera.botonesC.empezar && /Esperando al anfitrión/.test(t3.espera.pieB) && /Pulsa Empezar/.test(t3.espera.lineaA),
    t3OrdenAyBC: t3.turnos.every((t, k) => t.turnoEq === k + 1 && t.botonesAntes.cambiar === false),
    t3RetirandoYBoton: t3.visitas.every((v) => v.otrosVenCambiar.every((x) => x === false) && /Retira los dardos/.test(v.piePropio) && v.retirandoEnTodos.every(Boolean)),
    t3Puntos: t3.fin.every((x) => JSON.stringify(x.puntos) === JSON.stringify(tiradas3)) && t3.fin.every((x) => x.filas === 3),
    t3Veredicto: t3.fin.every((x, k) => (unico3 ? x.fin.empate === false && x.fin.gane === (tiradas3[k] === max3) : x.fin.empate === true && x.fin.gane === false)),
    sinErrores: errors.length === 0,
  };
  ok = Object.values(res.checks).every(Boolean);
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  for (const pg of browser.contexts().flatMap((c) => c.pages())) out.html = [...(out.html ?? []), await pg.evaluate(async () => "arSupported=" + (await globalThis.__numinia?.view.arSupported?.()) + " btn.hidden=" + document.querySelector("#dardos-hud button.ar")?.hidden + " hud.hidden=" + document.getElementById("dardos-hud")?.hidden + " xr=" + !!navigator.xr + " estado=" + JSON.stringify(globalThis.__numinia?.dardos.estado()) + " | " + JSON.stringify(globalThis.__numinia?.dardosHud?.duelo?.() ?? null) + " | " + (document.querySelector("#dardos-hud .resultado")?.textContent ?? "") + " | prompt=" + (document.getElementById("interactuar")?.hidden ? "(oculto)" : document.getElementById("interactuar")?.textContent) + " | " + JSON.stringify(globalThis.__numinia?.session.features.cards().filter((c) => c.feature === "dardos")) + " | " + JSON.stringify(globalThis.__numinia?.session.selfPosition(1))).catch(() => "")];
} finally {
  out.ok = ok;
  console.log(JSON.stringify({ ...res, ...out }, null, 1));
  console.log(ok ? "E2E DARDOS DUELO OK" : "E2E DARDOS DUELO FALLA");
  await browser.close().catch(() => {});
  for (const { p, log, nombre } of procs) { if (!ok) console.error(`--- ${nombre} ---\n${log().slice(-2500)}`); try { process.kill(-p.pid, "SIGTERM"); } catch { /* gone */ } } // our own process groups only
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
