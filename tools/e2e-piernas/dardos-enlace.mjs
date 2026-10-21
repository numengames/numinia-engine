// e2e-lenta — DARDOS ENLAZADOS (E1): a page of ANOTHER world plays the Tower's remote board from its AR wall, in two real servers
// and two real browsers. Slow (~2 min on a loaded machine): tools/auto.sh e2e skips it unless E2E_LENTAS=1. Run it alone, under the lock:
//   flock /var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/cache/scratch/fotos.lock node tools/e2e-piernas/dardos-enlace.mjs
//   (SHOTS=<folder> saves A's pictures; DEBUG=1 prints the walking; E2E_TORRE_PORT / E2E_MUNDO_PORT / E2E_VITE_PORT = 8913 / 8911 / 5311)
// It starts, on throwaway worlds and its own ports:
//   · the «Torre» server (engine, dardos.json: ONE duel board `torre`, remoto, rondas 1; the gate of the conditions of entry ON);
//   · «world A» (another engine server whose dardos.json says "enlace": { servidor: ws://127.0.0.1:<torre>/ws, diana: "torre" } and has no board);
//   · one vite page server for both (each page says which server it talks to with ?server=).
// Then (E2: through the REAL button, chooser and norms, with real clicks — Playwright clicks carry user activation, and IWER's requestSession is
// wrapped to record whether the activation was alive at the call):
//  1) A (PC, 1280×800) opens the Tower, accepts its norms (the same ACEPTAR the bubble sends), runs to the throwing line and presses E.
//  2) B (an emulated Quest 3, IWER) opens world A: /status says the link; `__numinia.dardosEnlace.vigente()` resolves it; nothing is
//     connected until B presses «Entrar en AR»: a chooser opens (PC picture) with «Dardos de … en tu pared» first and focused and «El mundo en
//     tu mesa»; it connects the link ahead; the Tower's gate is shut, so the button says «aceptar las normas»; B presses it: the Tower's norms
//     appear on the flat page (picture), B ticks «acepto» and finishes the steps (the optional data boxes start empty); the link says «listo».
//     The Tower counts a visit, not a person, and A sees nobody.
//  3) B presses the darts button (a real click): the AR session starts INSIDE that click (user activation alive) and the wall is hung (trigger).
//     A's sign says «<B's name> · En su pared (AR) · desde <world A>».
//  4) The duel: A throws 3 (mouse), «Cambiar turno»; B throws 3 (trigger), presses «Cambiar turno» on its 3D panel. Each sees the other's
//     darts, both see the same scores and the same verdict.
//  5) B leaves AR with the page's own button (nobody calls the link): the link closes by itself, the Tower has no visit left, and at no moment had
//     an avatar for B (A.remotePositions() always empty).
//  6) C (a phone, 390×844): chooser and norms on a phone (pictures), «Salir» of the norms goes back to the chooser, the miniature option enters
//     AR without the link, Escape closes the chooser and the link; the Tower itself (no link) goes straight to AR as ever; with the Tower DOWN
//     the chooser says it in plain Spanish with «Reintentar», and the miniature still works.
// No page errors anywhere. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir, loadavg } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const MS = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const hallar = () => { try { return readdirSync(MS).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse().map((d) => join(MS, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find(existsSync); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? hallar() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const TP = Number(process.env.E2E_TORRE_PORT ?? 8913), MP = Number(process.env.E2E_MUNDO_PORT ?? 8911), VP = Number(process.env.E2E_VITE_PORT ?? 5311);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= MS;
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");

// ---- two throwaway worlds ----
const TABLERO = { x: 14, z: 0, radio: 3 };
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-enlace-"));
const mundoDir = (n, aparicion, dardos) => { const d = join(tmp, n, "entorno"); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion }, null, 2));
  writeFileSync(join(d, "dardos.json"), JSON.stringify({ schema: "numinia-engine/dardos@1", ...dardos }, null, 2)); return d; };
const torreDir = mundoDir("torre", { x: -34, z: 0, radio: 3 }, { sitios: [{ id: "torre", nombre: "Diana de la Torre", x: TABLERO.x, y: 0, z: TABLERO.z, radio: TABLERO.radio, duelo: true, remoto: true, rondas: 1 }] });
const mundoADir = mundoDir("mundoA", { x: 0, z: 0, radio: 3 }, { sitios: [], enlace: { servidor: `ws://127.0.0.1:${TP}/ws`, diana: "torre" } });

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
for (const port of [TP, MP, VP]) if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) { console.error(`port ${port} is in use: set E2E_TORRE_PORT / E2E_MUNDO_PORT / E2E_VITE_PORT`); process.exit(2); }
const servidor = (puerto, dir, nombre, extra = {}) => arrancar("nice", ["-n", "10", "node", "packages/server/src/main.ts"], { PORT: String(puerto), MUNDO_DIR: dir, DATOS_DIR: join(tmp, nombre, "datos"), SESIONES_DIR: join(tmp, nombre, "sesiones"), AVENTURA_DIR: "", ...extra }, nombre);
servidor(TP, torreDir, "torre", { MOTOR_CONDICIONES_PUERTA: "si" }); // the Tower asks everybody to accept its norms
servidor(MP, mundoADir, "mundoA");
arrancar("nice", ["-n", "10", "npx", "vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const a = await fetch(`http://127.0.0.1:${TP}/status`).catch(() => null), b = await fetch(`http://127.0.0.1:${MP}/status`).catch(() => null); if (r.ok && a && b) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const estadoDe = (p) => fetch(`http://127.0.0.1:${p}/status`).then((r) => r.json());
const URL_TORRE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${TP}`, URL_MUNDO = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${MP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
let IGNORAR_RED = false; // while the Tower is stopped on purpose, the browser's own «could not connect» lines are expected
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => { out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra }); if (process.env.DEBUG) console.error("paso", paso, Math.round((Date.now() - t0) / 1000) + " s"); };
const abrir = async (etiqueta, url, opts = {}, init = "") => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${etiqueta}: ${e}`));
  p.on("crash", () => errors.push(`${etiqueta}: la página se ha caído (crash)`));
  p.on("console", (m) => { if (m.type() === "error" && !(IGNORAR_RED && /WebSocket|ERR_CONNECTION|Failed to load resource/i.test(m.text()))) errors.push(`${etiqueta} console: ${m.text().slice(0, 200)}`); });
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 60000 });
  return p;
};
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
async function caminar(p, x, z, cerca = 0.8, maxMs = 90000) {
  await p.bringToFront();
  const t = Date.now(); let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z; d = Math.hypot(dx, dz);
    if (process.env.DEBUG) console.error("caminar", Math.round(me.x * 10) / 10, Math.round(me.z * 10) / 10, "→", Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    if (d <= cerca) break;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    const corre = Math.max(Math.abs(dx), Math.abs(dz)) > 3;
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
    if (carga <= 8) throw e;
    (out.cargas ??= []).push({ carga: Math.round(carga * 10) / 10, espera: String(fn).slice(0, 90), ms });
    return p.waitForFunction(fn, arg, { timeout: ms * 3 });
  }
};
const fotoE2 = async (p, nombre) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${nombre}.png` }); };
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/dardos-enlace-${n}.png` }); };
const duelo = (p) => ctl(p, () => { const d = globalThis.__numinia.dardos.duelo(); return d && { sitio: d.sitio, ronda: d.ronda, esperando: d.esperando, turnoDe: d.turnoDe, yo: d.yo, miTurno: d.miTurno, rival: d.rival, yoPuntos: d.yoPuntos, a: d.a && { entity: d.a.entity, nombre: d.a.nombre, puntos: d.a.puntos, pared: d.a.pared, mundo: d.a.mundo }, b: d.b && { entity: d.b.entity, nombre: d.b.nombre, puntos: d.b.puntos, pared: d.b.pared, mundo: d.b.mundo }, fin: d.fin && { ganador: d.fin.ganador, empate: d.fin.empate, abandono: d.fin.abandono, texto: d.fin.texto, gane: d.fin.gane } }; });
const vista = (p) => ctl(p, () => globalThis.__numinia.dardosHud?.duelo?.() ?? null);
const prompt = (p) => ctl(p, () => { const b = document.getElementById("interactuar"); return b && !b.hidden ? b.textContent : ""; });
async function pulsarE(a) {
  await esperar(a, () => { const b = document.getElementById("interactuar"); return b && !b.hidden && /dardos/i.test(b.textContent ?? ""); }, null, 30000);
  const texto = await prompt(a);
  for (let i = 0; i < 3; i++) {
    await a.keyboard.press("KeyE");
    if (await esperar(a, () => globalThis.__numinia.dardosHud?.duelo?.().letrero.fase === "espera", null, 12000).then(() => true, () => false)) return texto;
  }
  throw new Error("E did not open the duel (the sign never said «espera»)");
}
/** The person says yes to the norms of the world they are in: the same ACEPTAR the bubble sends, with the version of every layer read. */
const aceptarNormas = async (p) => {
  await esperar(p, () => globalThis.__numinia.session.condiciones?.capas, null, 20000);
  const r = await ctl(p, () => { const c = globalThis.__numinia.session.condiciones; return { puerta: c.puerta, abierta: c.abierta, faltan: c.faltan, ok: globalThis.__numinia.session.aceptar(Object.fromEntries(c.capas.map((l) => [l.capa, l.version])), []) }; });
  await esperar(p, () => globalThis.__numinia.session.condiciones?.abierta === true, null, 15000);
  return r;
};

// B's page: a Quest 3 with a wall 2.4 m in front of the viewer
const INIT_AR = IWER + `;
  class Pared { constructor(d) { this.d = d; this.environmentCanvas = document.createElement("canvas"); } render() {}
    computeHitTestResults() { return [new Float32Array([1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,1.5,-2.4,1])]; } }
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.installSEM(Pared); globalThis.__iwer = dev;
  globalThis.__reqs = []; { const xr = navigator.xr, orig = xr.requestSession.bind(xr); xr.requestSession = (m, i) => { globalThis.__reqs.push({ modo: m, activo: navigator.userActivation?.isActive === true }); return orig(m, i); }; }`;
const gatillo = (r, ms) => r.evaluate((ms) => new Promise((ok) => { const c = globalThis.__iwer.controllers.right; c.updateButtonValue("trigger", 1); setTimeout(() => { c.updateButtonValue("trigger", 0); setTimeout(ok, 150); }, ms); }), ms);
// B's link object (the page's `__numinia.dardosEnlace.enlace()`), kept in `__l`
const L = (b, code, arg) => b.evaluate(code, arg);
const arEstado = (b) => L(b, () => { const s = globalThis.__l.ar(); return s && { fase: s.fase, pared: s.pared, lanzados: s.lanzados, clavados: s.clavados, ultimo: s.ultimo }; });
const vistaB = (b) => L(b, () => { const v = globalThis.__l.vista(); return { estado: v.estado, fase: v.fase, motivo: v.motivo, aviso: v.aviso, entity: v.entity, yo: v.yo, condiciones: v.condiciones && { puerta: v.condiciones.puerta, abierta: v.condiciones.abierta, faltan: v.condiciones.faltan }, panelAR: v.arduelo }; });

const res = {};
let ok = false;
try {
  // ------------------------------------------------------------------------------------------ 1) A in the Tower
  const a = await abrir("A", URL_TORRE, { viewport: { width: 1280, height: 800 } });
  const ea = await ctl(a, () => globalThis.__numinia.session.entity);
  res.normasA = await aceptarNormas(a);
  res.torre0 = await estadoDe(TP);
  // B loads world A first and waits (a host who waits alone for 60 s is cancelled, and loading is the slow part)
  const b = await abrir("B", URL_MUNDO, { viewport: { width: 640, height: 400 } }, INIT_AR);
  await esperar(a, () => globalThis.__numinia.view.dardos.linea("torre"), null, 20000);
  const linea = await ctl(a, () => globalThis.__numinia.view.dardos.linea("torre"));
  await caminar(a, linea.x + 0.7 * Math.sin(linea.rumbo), linea.z + 0.7 * Math.cos(linea.rumbo), 0.4);
  nota("A en la línea");
  res.promptA = await pulsarE(a);
  nota("A espera rival");

  // ------------------------------------------------------------------------------------------ 2) B: the setting, the button, the chooser, the gate, the norms
  res.estadoMundo = (await estadoDe(MP)).dardosEnlace;
  res.vigente = await L(b, () => { const v = globalThis.__numinia.dardosEnlace.vigente(); return { motivo: v.motivo, enlace: v.enlace }; });
  res.vigenteTorre = await ctl(a, () => { const v = globalThis.__numinia.dardosEnlace.vigente(); return { motivo: v.motivo, enlace: v.enlace }; });
  res.visitasAntes = (await estadoDe(TP)).visitas ?? 0;
  res.tituloB = await b.title();
  res.estadoInicial = await L(b, () => ({ elegir: !!document.getElementById("ar-elegir"), boton: document.getElementById("ar")?.textContent, visible: !document.getElementById("ar")?.hidden }));
  await b.bringToFront();
  await b.setViewportSize({ width: 1280, height: 800 }); // the chooser's PC picture
  await b.click("#ar", { timeout: 20000 });
  await esperar(b, () => !!document.getElementById("ar-elegir"), null, 15000);
  await L(b, async () => { globalThis.__l = await globalThis.__numinia.dardosEnlace.enlace(); });
  await esperar(b, () => globalThis.__l.estado() === "puerta", null, 20000);
  await esperar(b, () => document.getElementById("ar-elegir-dardos")?.dataset.accion === "normas", null, 5000);
  res.elegir = await L(b, () => { const d = document.getElementById("ar-elegir-dardos"), m = document.getElementById("ar-elegir-mesa"), p = document.querySelector("#ar-elegir .ae-panel").getBoundingClientRect();
    return { titulo: document.getElementById("ar-elegir-titulo").textContent, dardos: d.querySelector("b").textContent, ayuda: d.querySelector("small").textContent, mesa: m.querySelector("b").textContent, orden: [...document.querySelectorAll("#ar-elegir .ae-btn")].map((x) => x.id), foco: document.activeElement?.id, accion: d.dataset.accion, caben: p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight }; });
  res.alAbrir = await vistaB(b);
  await fotoE2(b, "enlace-pc-1-elegir");
  nota("B: elegir abierto (puerta)", { elegir: res.elegir.dardos });
  res.sinAceptar = await L(b, async () => { const r = await globalThis.__l.jugarEnPared(); return { ok: r.ok, why: r.ok ? "" : r.why }; });
  const intentoSitio = await L(b, () => { const x = globalThis.__l.dardos.jugar("torre", "pared"); return x.ok; }); // sent, and the Tower ignores it: the gate is shut
  await b.waitForTimeout(800);
  res.ignorado = await ctl(a, () => { const s = globalThis.__numinia.dardos.sitios().find((x) => x.id === "torre"); return { espera: s.espera, jugadores: s.jugadores }; });
  res.intentoSitio = intentoSitio;
  res.pedidasAntes = await L(b, () => globalThis.__reqs.length);
  // the darts button leads to the Tower's norms, on the flat page
  await b.click("#ar-elegir-dardos");
  await esperar(b, () => !!document.getElementById("condiciones"), null, 10000);
  await b.waitForTimeout(400);
  res.normasPantalla = await L(b, () => { const c = document.getElementById("condiciones"), o = globalThis.__l.vista().condiciones;
    const pasos = [...c.querySelectorAll(".paso")].map((x) => x.textContent.replace(/^\d+|✓/g, "").trim());
    return { eyebrow: c.querySelector(".etq")?.textContent, titulo: c.querySelector("h1")?.textContent, sub: c.querySelector(".sub")?.textContent, pasos, capas: o.capas.map((l) => l.capa), primeraNorma: o.capas[0].puntos.find((p) => p.tipo !== "datos")?.titulo, texto: c.innerText,
      chooserOculto: document.getElementById("ar-elegir").hidden, propioCerrado: globalThis.__numinia.condiciones.cerrada(), cajaOk: !!c.querySelector("input[id^=condiciones-ok-]") }; });
  await fotoE2(b, "enlace-pc-2-normas");
  nota("B: normas de la Torre en pantalla", { eyebrow: res.normasPantalla.eyebrow });
  // accept like a person: tick «acepto» on each layer, go on; the optional data boxes start empty and are left empty
  res.datosMarcados = null;
  for (let i = 0; i < 8 && (await b.$("#condiciones")); i++) {
    const caja = await b.$("#condiciones input[id^=condiciones-ok-]");
    if (caja && !(await caja.isChecked())) await caja.check();
    if (!caja) res.datosMarcados = await L(b, () => [...document.querySelectorAll("#condiciones .permiso input[type=checkbox]")].filter((x) => x.checked).length);
    const fin = await b.$("#condiciones-sin-opcional, #condiciones-aceptar");
    if (fin && (await fin.isEnabled())) { await fin.click(); break; }
    await b.click("#condiciones-siguiente");
    await b.waitForTimeout(150);
  }
  await esperar(b, () => !document.getElementById("condiciones") && globalThis.__l.estado() === "listo", null, 15000);
  await b.waitForTimeout(300);
  res.tras = await vistaB(b);
  res.aceptoB = res.tras.condiciones?.abierta === true;
  res.trasNormas = await L(b, () => { const d = document.getElementById("ar-elegir-dardos"), r = document.getElementById("ar-elegir"); return { chooser: !!r && !r.hidden, accion: d.dataset.accion, ayuda: d.querySelector("small").textContent, foco: document.activeElement?.id, propioCerrado: globalThis.__numinia.condiciones.cerrada() }; });
  await fotoE2(b, "enlace-pc-3-listo");
  res.torre1 = await estadoDe(TP);
  res.aVeA = await ctl(a, () => ({ visible: globalThis.__numinia.session.stats.visible, remotos: globalThis.__numinia.session.remotePositions().length }));
  nota("B enlazado (listo)", { visitas: res.torre1.visitas, conectados: res.torre1.conectados });
  res.tokenGuardado = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("numinia.invitado@")));
  await esperar(a, () => globalThis.__numinia.dardos.duelo()?.esperando !== false, null, 5000).catch(() => {});

  // ------------------------------------------------------------------------------------------ 3) B presses the darts button: AR starts in that click, the wall is hung
  await b.setViewportSize({ width: 640, height: 400 });
  await b.bringToFront();
  await b.click("#ar-elegir-dardos"); // a real click: `requestSession` runs inside it (the wrapper in INIT_AR records the activation)
  await esperar(b, () => globalThis.__numinia.view.ar.jugando, null, 20000);
  await b.waitForTimeout(600);
  await b.evaluate(() => { const c = globalThis.__iwer.controllers.right; c.position.set(0.02, 1.52, -0.35); c.quaternion.set(0, 0, 0, 1); });
  res.pedidasAR = await L(b, () => globalThis.__reqs);
  res.jugarEnPared = await L(b, () => ({ ok: globalThis.__numinia.view.ar.jugando && globalThis.__l.estado() === "jugando", chooser: !!document.getElementById("ar-elegir"), boton: document.getElementById("ar").textContent }));
  await gatillo(b, 150);
  await esperar(b, () => globalThis.__l.ar()?.fase === "colocada", null, 8000);
  nota("B colgó la diana", await arEstado(b));
  await esperar(a, () => { const d = globalThis.__numinia.dardos.duelo(); return d && !d.esperando && d.rival; }, null, 20000);
  await esperar(b, () => { const d = globalThis.__l.dardos.duelo(); return d && d.yo && !d.esperando; }, null, 20000);
  await a.waitForTimeout(600);
  const nombreB = await b.evaluate(() => globalThis.__numinia.session.who.nombre);
  res.nombreB = nombreB;
  res.inicio = { dA: await duelo(a), dB: await L(b, () => { const d = globalThis.__l.dardos.duelo(); return d && { yo: d.yo, a: d.a.nombre, b: d.b?.nombre, mundoA: d.a.mundo, pared: d.a.pared }; }) };
  res.sign0 = (await vista(a)).letrero;
  res.panelB0 = (await vistaB(b)).panelAR;
  res.torre2 = await estadoDe(TP);
  await esperar(a, () => globalThis.__numinia.dardos.tirando() && !!globalThis.__numinia.dardosHud.abierto(), null, 10000);
  await a.waitForTimeout(900);
  await foto(a, "1-partida");
  nota("partida en marcha");

  // ------------------------------------------------------------------------------------------ 4) the duel
  const box = await a.evaluate(() => { const r = document.querySelector("#dardos-hud canvas.diana").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const tirosA = [];
  for (let n = 1; n <= 3; n++) {
    await a.mouse.move(box.x + box.w / 2, box.y + box.h / 2 - box.h * 0.22);
    await a.mouse.down(); await a.waitForTimeout(715); await a.mouse.up();
    await esperar(a, (k) => (globalThis.__numinia.dardos.estado().ultimo?.numero ?? 0) >= k, n, 12000);
    await a.waitForTimeout(250);
    tirosA.push(await ctl(a, () => { const e = globalThis.__numinia.dardos.estado(); return { numero: e.ultimo.numero, puntos: e.ultimo.puntos }; }));
  }
  res.tirosA = tirosA;
  await esperar(a, () => globalThis.__numinia.dardosHud.duelo().botones.cambiar, null, 15000);
  await esperar(b, () => globalThis.__l.dardos.duelo()?.retirando === true, null, 15000);
  await b.waitForTimeout(700);
  res.bVeA = { enLaPared: (await arEstado(b)).clavados, enElControlador: await L(b, (e) => globalThis.__l.dardos.clavados("torre").filter((x) => x.quien === e).length, ea) };
  await a.click("#dardos-hud .duelo-botones .cambiar", { timeout: 15000 });
  await esperar(b, () => globalThis.__l.dardos.duelo()?.miTurno === true, null, 15000);
  await b.waitForTimeout(500);
  const tirosB = [];
  for (let n = 1; n <= 3; n++) {
    const n0 = (await arEstado(b)).lanzados;
    await gatillo(b, 700);
    await esperar(b, (k) => globalThis.__l.ar().lanzados > k, n0, 6000);
    await esperar(b, (k) => (globalThis.__l.dardos.estado().ultimo?.numero ?? 0) >= k, n, 12000);
    await b.waitForTimeout(350);
    tirosB.push({ ar: await arEstado(b), servidor: await L(b, () => { const u = globalThis.__l.dardos.estado().ultimo; return { numero: u.numero, puntos: u.puntos }; }) });
    if (n === 3) res.aVeDeB = await ctl(a, (e) => globalThis.__numinia.dardos.clavados("torre").filter((x) => x.quien !== e).length, ea);
  }
  res.tirosB = tirosB;
  await esperar(b, () => globalThis.__l.vista().arduelo?.boton === "cambiar", null, 15000);
  res.botonAR = (await vistaB(b)).panelAR;
  await b.evaluate((p) => { const c = globalThis.__iwer.controllers.right, o = c.position, d = [p.x - o.x, p.y - o.y, p.z - o.z], n = Math.hypot(...d), u = d.map((v) => v / n);
    const ang = Math.acos(Math.max(-1, Math.min(1, -u[2]))), ax = [u[1], -u[0], 0], an = Math.hypot(...ax) || 1, sn = Math.sin(ang / 2);
    c.quaternion.set((ax[0] / an) * sn, (ax[1] / an) * sn, 0, Math.cos(ang / 2)); }, res.botonAR.puntoBoton);
  await gatillo(b, 150);
  await b.evaluate(() => globalThis.__iwer.controllers.right.quaternion.set(0, 0, 0, 1));

  // ------------------------------------------------------------------------------------------ 5) the end, seen by both; B leaves; nothing stays open
  await esperar(a, () => globalThis.__numinia.dardos.duelo()?.fin, null, 15000);
  await esperar(b, () => globalThis.__l.dardos.duelo()?.fin, null, 15000);
  await a.waitForTimeout(500);
  res.fin = { dA: await duelo(a), dB: await L(b, () => { const d = globalThis.__l.dardos.duelo(); return d && { yo: d.yo, a: { nombre: d.a.nombre, puntos: d.a.puntos }, b: { nombre: d.b.nombre, puntos: d.b.puntos }, fin: { ganador: d.fin.ganador, empate: d.fin.empate, gane: d.fin.gane, texto: d.fin.texto } }; }), signA: (await vista(a)).letrero, panelB: (await vistaB(b)).panelAR };
  await foto(a, "2-fin");
  res.sumas = { sumaA: tirosA.reduce((s, t) => s + t.puntos, 0), sumaB: tirosB.reduce((s, t) => s + t.servidor.puntos, 0) };
  res.aVeA2 = await ctl(a, () => ({ visible: globalThis.__numinia.session.stats.visible, remotos: globalThis.__numinia.session.remotePositions().length }));
  res.torre3 = await estadoDe(TP);
  await b.evaluate(() => document.getElementById("ar").click()); // the page's own button («Dardos en tu pared (salir)»; IWER's overlay covers it for the mouse): nobody calls the link
  await esperar(b, () => globalThis.__numinia.view.ar.state === "off", null, 10000).catch(() => {});
  res.arSalio = await b.evaluate(() => globalThis.__numinia.view.ar.state);
  res.tras2 = await vistaB(b);
  await esperar(b, () => globalThis.__l.estado() === "cerrado", null, 10000).catch(() => {});
  for (let i = 0; i < 40; i++) { res.torre4 = await estadoDe(TP); if (!(res.torre4.visitas ?? 0)) break; await new Promise((r) => setTimeout(r, 150)); }
  res.cerrado = (await vistaB(b)).estado;
  res.botonTrasAR = await b.evaluate(() => document.getElementById("ar").textContent);

  // ------------------------------------------------------------------------------------------ 6) C: a phone — chooser, norms, «Salir», the miniature, Escape; the Tower itself; the Tower down
  await a.bringToFront();
  const c = await abrir("C", URL_MUNDO, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, INIT_AR);
  await c.bringToFront();
  const estadoC = () => L(c, () => globalThis.__l.estado());
  const chooserC = () => L(c, () => { const r = document.getElementById("ar-elegir"), p = r?.querySelector(".ae-panel")?.getBoundingClientRect(), f = r?.querySelector(".ae-fallo"), rt = document.getElementById("ar-elegir-reintentar");
    return { abierto: !!r && !r.hidden, caben: !!p && p.left >= 0 && p.right <= innerWidth && p.top >= 0 && p.bottom <= innerHeight, foco: document.activeElement?.id, dardos: document.getElementById("ar-elegir-dardos")?.querySelector("b")?.textContent, ayuda: document.getElementById("ar-elegir-dardos")?.querySelector("small")?.textContent, fallo: f && !f.hidden ? f.textContent : "", reintentar: !!rt && !rt.hidden, accion: document.getElementById("ar-elegir-dardos")?.dataset.accion }; });
  const arC = () => L(c, () => ({ estado: globalThis.__numinia.view.ar.state, jugando: globalThis.__numinia.view.ar.jugando, pedidas: globalThis.__reqs.slice() }));
  const pulsarARC = async () => { if (!(await c.isVisible("#ar"))) await c.click("#menu-abrir", { timeout: 20000 }); await c.click("#ar", { timeout: 20000 }); }; // on a phone the AR entry lives in «Menú»
  const abrirElegirC = async () => { await pulsarARC(); await esperar(c, () => !!document.getElementById("ar-elegir"), null, 15000); await L(c, async () => { globalThis.__l = await globalThis.__numinia.dardosEnlace.enlace(); }); };
  const salirDeARC = async () => { await L(c, () => globalThis.__numinia.view.ar.exit()); await esperar(c, () => globalThis.__numinia.view.ar.state === "off", null, 10000); };
  res.movil = {};
  await abrirElegirC();
  await esperar(c, () => globalThis.__l.estado() === "puerta", null, 20000);
  res.movil.elegir = await chooserC();
  await fotoE2(c, "enlace-movil-1-elegir");
  await c.click("#ar-elegir-dardos");
  await esperar(c, () => !!document.getElementById("condiciones"), null, 10000);
  await c.waitForTimeout(400);
  res.movil.normas = await L(c, () => { const n = document.getElementById("condiciones"), p = n.querySelector(".cond-panel").getBoundingClientRect(); return { movil: n.classList.contains("movil"), caben: p.left >= 0 && p.right <= innerWidth && p.bottom <= innerHeight, titulo: n.querySelector("h1")?.textContent }; });
  await fotoE2(c, "enlace-movil-2-normas");
  await c.click("#condiciones-salir");
  await esperar(c, () => !document.getElementById("condiciones") && !!document.getElementById("ar-elegir") && !document.getElementById("ar-elegir").hidden, null, 8000);
  res.movil.trasSalir = { chooser: await chooserC(), enlace: await estadoC(), torre: (await estadoDe(TP)).visitas ?? 0 };
  await c.click("#ar-elegir-mesa"); // the miniature: AR starts in this click, without the link
  await esperar(c, () => globalThis.__numinia.view.ar.state !== "off", null, 15000);
  res.movil.mesa = { ar: await arC(), enlace: await estadoC(), chooser: await L(c, () => !!document.getElementById("ar-elegir")) };
  await salirDeARC();
  await abrirElegirC();
  await c.keyboard.press("Escape");
  await esperar(c, () => !document.getElementById("ar-elegir"), null, 5000);
  await esperar(c, () => globalThis.__l.estado() === "cerrado", null, 8000).catch(() => {});
  res.movil.escape = { enlace: await estadoC(), arFuera: (await arC()).estado === "off" };
  for (let i = 0; i < 40; i++) { res.movil.visitasTrasEscape = (await estadoDe(TP)).visitas ?? 0; if (!res.movil.visitasTrasEscape) break; await new Promise((r) => setTimeout(r, 150)); }
  nota("C: móvil hecho");

  // the Tower itself has no link: the button enters AR as ever, no chooser
  await c.goto(URL_TORRE);
  await c.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 60000 });
  await aceptarNormas(c);
  await esperar(c, () => !document.getElementById("condiciones"), null, 8000).catch(() => {});
  await pulsarARC();
  await esperar(c, () => globalThis.__numinia.view.ar.state !== "off", null, 15000);
  res.movil.torre = { chooser: await L(c, () => !!document.getElementById("ar-elegir")), ar: await arC(), vigente: await L(c, () => globalThis.__numinia.dardosEnlace.vigente().motivo) };
  await salirDeARC();

  // the Tower DOWN: plain Spanish, «Reintentar», and the miniature still works
  await a.close(); await b.close();
  IGNORAR_RED = true;
  const torreProc = procs[0];
  try { process.kill(-torreProc.p.pid, "SIGTERM"); } catch { /* gone */ }
  for (let i = 0; i < 40 && (await fetch(`http://127.0.0.1:${TP}/status`).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 150));
  await c.goto(URL_MUNDO);
  await c.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 60000 });
  await abrirElegirC();
  await esperar(c, () => globalThis.__l.estado() === "error", null, 20000);
  res.movil.caido = await chooserC();
  await fotoE2(c, "enlace-movil-3-error");
  await c.click("#ar-elegir-reintentar");
  await esperar(c, () => globalThis.__l.estado() === "error" && document.getElementById("ar-elegir-reintentar") && !document.getElementById("ar-elegir-reintentar").hidden, null, 20000);
  res.movil.reintentado = await chooserC();
  await c.click("#ar-elegir-mesa");
  await esperar(c, () => globalThis.__numinia.view.ar.state !== "off", null, 15000);
  res.movil.mesaCaido = { ar: await arC() };
  await salirDeARC();
  IGNORAR_RED = false;
  const sa = res.fin.dA, sb = res.fin.dB, mundoB = res.tituloB;
  const etiqueta = res.sign0?.etiqueta ?? "";
  const mv = res.movil, elegirOk = (x) => /^Dardos de .+ en tu pared$/.test(x.dardos ?? "");
  res.checks = {
    ajusteDelMundo: res.estadoMundo?.servidor === `ws://127.0.0.1:${TP}/ws` && res.estadoMundo?.diana === "torre",
    vigente: res.vigente.motivo === "ok" && res.vigente.enlace?.diana === "torre",
    laTorreNoSeEnlazaConsigoMisma: res.vigenteTorre.enlace === null && ["mismo-servidor", "diana-propia"].includes(res.vigenteTorre.motivo),
    nadaAbiertoHastaPulsarElBoton: res.visitasAntes === 0 && res.estadoInicial.elegir === false && res.estadoInicial.visible === true && res.estadoInicial.boton === "Entrar en AR",
    elegirConDosBotones: elegirOk(res.elegir) && res.elegir.titulo === "Entrar en AR" && res.elegir.mesa === "El mundo en tu mesa" && res.elegir.orden.join() === "ar-elegir-dardos,ar-elegir-mesa" && res.elegir.caben,
    dardosConElFocoPorDefecto: res.elegir.foco === "ar-elegir-dardos",
    conectaAntesDeEntrar: res.alAbrir.estado === "puerta" && res.alAbrir.condiciones?.puerta === true && res.alAbrir.condiciones?.abierta === false && res.alAbrir.condiciones.faltan.length > 0 && res.pedidasAntes === 0 && res.elegir.accion === "normas" && /aceptar las normas/.test(res.elegir.ayuda),
    noColgaSinNormas: res.sinAceptar.ok === false && /aceptar las normas/.test(res.sinAceptar.why),
    elTorreIgnoraAntesDeAceptar: res.intentoSitio === true && res.ignorado.espera === true && res.ignorado.jugadores === 1, // 1 = A alone (B's attempt did nothing)
    normasDeLaTorreEnPantalla: /^Antes de entrar/.test(res.normasPantalla.eyebrow ?? "") && res.normasPantalla.chooserOculto === true && res.normasPantalla.propioCerrado === false && res.normasPantalla.cajaOk === true && res.normasPantalla.capas.length >= 1 && !!res.normasPantalla.primeraNorma && res.normasPantalla.texto.includes(res.normasPantalla.primeraNorma) && /no pasa nada: sigues en este mundo/.test(res.normasPantalla.sub ?? ""),
    datosOpcionalesSinMarcar: res.datosMarcados === null || res.datosMarcados === 0,
    aceptaYQuedaListo: res.aceptoB === true && res.tras.estado === "listo" && res.trasNormas.chooser === true && res.trasNormas.accion === "entrar" && /Normas aceptadas/.test(res.trasNormas.ayuda) && res.trasNormas.foco === "ar-elegir-dardos" && res.trasNormas.propioCerrado === false,
    invitadoPropioPorServidor: res.tokenGuardado.length === 1 && res.tokenGuardado[0] === `numinia.invitado@127.0.0.1:${TP}`,
    laTorreContaUnaVisitaNoUnaPersona: res.torre1.visitas === 1 && res.torre1.conectados === res.torre0.conectados,
    sinAvatarEnLaTorre: res.aVeA.visible === 0 && res.aVeA.remotos === 0 && res.aVeA2.visible === 0 && res.aVeA2.remotos === 0,
    laSesionDeARNaceEnElClic: res.pedidasAR.length === 1 && res.pedidasAR[0].modo === "immersive-ar" && res.pedidasAR[0].activo === true,
    colgoLaPared: res.jugarEnPared.ok === true && res.jugarEnPared.chooser === false && /Dardos en tu pared \(salir\)/.test(res.jugarEnPared.boton),
    unidoDesdePared: res.inicio.dA.b?.pared === true || res.inicio.dA.a?.pared === true,
    letreroNombraDeDondeViene: /En su pared \(AR\)/.test(etiqueta) && etiqueta.includes(`desde ${mundoB}`),
    nombreEnElMarcador: [res.inicio.dA.a?.nombre, res.inicio.dA.b?.nombre].includes(nombreB),
    ambosVenLosDardos: res.bVeA.enLaPared >= 3 && res.bVeA.enElControlador >= 3 && res.aVeDeB >= 3,
    mismasPuntuaciones: sa.a.puntos === sb.a.puntos && sa.b.puntos === sb.b.puntos && [sa.a.puntos, sa.b.puntos].sort().join() === [res.sumas.sumaA, res.sumas.sumaB].sort().join(),
    mismoVeredicto: sa.fin.texto === sb.fin.texto && sa.fin.empate === sb.fin.empate && (sa.fin.empate || (sa.fin.gane !== sb.fin.gane)),
    salirDeARCierraElEnlaceSolo: res.arSalio === "off" && res.cerrado === "cerrado" && (res.torre4.visitas ?? 0) === 0 && res.botonTrasAR === "Entrar en AR",
    movilElegirCabe: mv.elegir.abierto && mv.elegir.caben && elegirOk(mv.elegir) && mv.elegir.foco === "ar-elegir-dardos" && mv.elegir.accion === "normas",
    movilNormasCaben: mv.normas.movil === true && mv.normas.caben === true,
    salirDeLasNormasVuelveAlElegir: mv.trasSalir.chooser.abierto && mv.trasSalir.enlace === "puerta" && mv.trasSalir.chooser.foco === "ar-elegir-dardos",
    maquetaEntraEnARSinEnlace: mv.mesa.ar.estado !== "off" && mv.mesa.ar.jugando === false && mv.mesa.enlace === "cerrado" && mv.mesa.chooser === false && mv.mesa.ar.pedidas.length === 1 && mv.mesa.ar.pedidas[0].activo === true,
    escapeCierraTodo: mv.escape.enlace === "cerrado" && mv.escape.arFuera && mv.visitasTrasEscape === 0,
    laTorreEntraEnARComoSiempre: mv.torre.chooser === false && mv.torre.ar.estado !== "off" && mv.torre.ar.jugando === false && ["mismo-servidor", "diana-propia"].includes(mv.torre.vigente),
    torreCaidaSeDiceYTieneSalida: mv.caido.fallo.length > 0 && /No se puede llegar a|no responde|Se ha cortado/.test(mv.caido.fallo) && mv.caido.reintentar === true && !/\d{4}|ws:/.test(mv.caido.fallo) && mv.reintentado.reintentar === true && mv.mesaCaido.ar.estado !== "off" && mv.mesaCaido.ar.jugando === false,
    sinErrores: errors.length === 0,
  };
  ok = Object.values(res.checks).every(Boolean);
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  for (const pg of browser.contexts().flatMap((c) => c.pages())) out.html = [...(out.html ?? []), await pg.evaluate(() => `url=${location.href} ar=${globalThis.__numinia?.view.ar.state} link=${JSON.stringify(globalThis.__l?.vista?.() ?? null).slice(0, 500)}`).catch((x) => String(x))];
} finally {
  out.ok = ok;
  console.log(JSON.stringify({ ...res, ...out }, null, 1));
  console.log(ok ? "E2E DARDOS ENLACE OK" : "E2E DARDOS ENLACE FALLA");
  await browser.close().catch(() => {});
  for (const { p, log, nombre } of procs) { if (!ok) console.error(`--- ${nombre} ---\n${log().slice(-2500)}`); try { process.kill(-p.pid, "SIGTERM"); } catch { /* gone */ } } // our own process groups only
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
