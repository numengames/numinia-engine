// e2e-lenta — DARDOS ENLAZADOS (E1): a page of ANOTHER world plays the Tower's remote board from its AR wall, in two real servers
// and two real browsers. Slow (~2 min on a loaded machine): tools/auto.sh e2e skips it unless E2E_LENTAS=1. Run it alone, under the lock:
//   flock /var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/cache/scratch/fotos.lock node tools/e2e-piernas/dardos-enlace.mjs
//   (SHOTS=<folder> saves A's pictures; DEBUG=1 prints the walking; E2E_TORRE_PORT / E2E_MUNDO_PORT / E2E_VITE_PORT = 8913 / 8911 / 5311)
// It starts, on throwaway worlds and its own ports:
//   · the «Torre» server (engine, dardos.json: ONE duel board `torre`, remoto, rondas 1; the gate of the conditions of entry ON);
//   · «world A» (another engine server whose dardos.json says "enlace": { servidor: ws://127.0.0.1:<torre>/ws, diana: "torre" } and has no board);
//   · one vite page server for both (each page says which server it talks to with ?server=).
// Then:
//  1) A (PC, 1280×800) opens the Tower, accepts its norms (the same ACEPTAR the bubble sends), runs to the throwing line and presses E.
//  2) B (an emulated Quest 3, IWER) opens world A: /status says the link; `__numinia.dardosEnlace.vigente()` resolves it; nothing is
//     connected yet (the Tower has no visit). B `conectar()`s: the link says «puerta» (the gate of the Tower is shut) and refuses to hang
//     the wall; B accepts through the link (ACEPTAR); the link says «listo». The Tower counts a visit, not a person, and A sees nobody.
//  3) B hangs the wall in AR (trigger): it joins `torre` «desde pared». A's sign says «<B's name> · En su pared (AR) · desde <world A>».
//  4) The duel: A throws 3 (mouse), «Cambiar turno»; B throws 3 (trigger), presses «Cambiar turno» on its 3D panel. Each sees the other's
//     darts, both see the same scores and the same verdict.
//  5) B leaves AR and closes the link: the Tower has no visit left, and at no moment had an avatar for B (A.remotePositions() always empty).
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
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => { out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra }); if (process.env.DEBUG) console.error("paso", paso, Math.round((Date.now() - t0) / 1000) + " s"); };
const abrir = async (etiqueta, url, opts = {}, init = "") => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`${etiqueta}: ${e}`));
  p.on("crash", () => errors.push(`${etiqueta}: la página se ha caído (crash)`));
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${etiqueta} console: ${m.text().slice(0, 200)}`); });
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
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.installSEM(Pared); globalThis.__iwer = dev;`;
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

  // ------------------------------------------------------------------------------------------ 2) B: the setting, the link, the gate
  res.estadoMundo = (await estadoDe(MP)).dardosEnlace;
  res.vigente = await L(b, () => { const v = globalThis.__numinia.dardosEnlace.vigente(); return { motivo: v.motivo, enlace: v.enlace }; });
  res.visitasAntes = (await estadoDe(TP)).visitas ?? 0;
  res.tituloB = await b.title();
  await L(b, async () => { globalThis.__l = await globalThis.__numinia.dardosEnlace.enlace(); });
  res.estadoInicial = await vistaB(b);
  res.conectar = await L(b, () => globalThis.__l.conectar());
  res.alConectar = await vistaB(b);
  res.sinAceptar = await L(b, async () => { const r = await globalThis.__l.jugarEnPared(); return { ok: r.ok, why: r.ok ? "" : r.why }; });
  const intentoSitio = await L(b, () => { const x = globalThis.__l.dardos.jugar("torre", "pared"); return x.ok; }); // sent, and the Tower ignores it: the gate is shut
  await b.waitForTimeout(800);
  res.ignorado = await ctl(a, () => { const s = globalThis.__numinia.dardos.sitios().find((x) => x.id === "torre"); return { espera: s.espera, jugadores: s.jugadores }; });
  res.intentoSitio = intentoSitio;
  res.aceptoB = await L(b, () => { const c = globalThis.__l.vista().condiciones; return globalThis.__l.aceptar(Object.fromEntries(c.capas.map((l) => [l.capa, l.version])), []); });
  await esperar(b, () => globalThis.__l.estado() === "listo", null, 15000);
  res.tras = await vistaB(b);
  res.torre1 = await estadoDe(TP);
  res.aVeA = await ctl(a, () => ({ visible: globalThis.__numinia.session.stats.visible, remotos: globalThis.__numinia.session.remotePositions().length }));
  nota("B enlazado (listo)", { visitas: res.torre1.visitas, conectados: res.torre1.conectados });
  res.tokenGuardado = await b.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("numinia.invitado@")));
  await esperar(a, () => globalThis.__numinia.dardos.duelo()?.esperando !== false, null, 5000).catch(() => {});

  // ------------------------------------------------------------------------------------------ 3) B hangs the wall
  await b.bringToFront();
  const colgar = L(b, async () => { const r = await globalThis.__l.jugarEnPared(); return { ok: r.ok, why: r.ok ? "" : r.why }; });
  await esperar(b, () => globalThis.__numinia.view.ar.jugando, null, 20000);
  await b.waitForTimeout(600);
  await b.evaluate(() => { const c = globalThis.__iwer.controllers.right; c.position.set(0.02, 1.52, -0.35); c.quaternion.set(0, 0, 0, 1); });
  res.jugarEnPared = await colgar;
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
  await L(b, () => globalThis.__l.salir());
  await esperar(b, () => globalThis.__numinia.view.ar.state === "off", null, 10000).catch(() => {});
  res.arSalio = await b.evaluate(() => globalThis.__numinia.view.ar.state);
  res.tras2 = await vistaB(b);
  await L(b, () => globalThis.__l.cerrar());
  await esperar(a, () => true, null, 100);
  for (let i = 0; i < 40; i++) { res.torre4 = await estadoDe(TP); if (!(res.torre4.visitas ?? 0)) break; await new Promise((r) => setTimeout(r, 150)); }
  res.cerrado = (await vistaB(b)).estado;
  const sa = res.fin.dA, sb = res.fin.dB, mundoB = res.tituloB;
  const etiqueta = res.sign0?.etiqueta ?? "";
  res.checks = {
    ajusteDelMundo: res.estadoMundo?.servidor === `ws://127.0.0.1:${TP}/ws` && res.estadoMundo?.diana === "torre",
    vigente: res.vigente.motivo === "ok" && res.vigente.enlace?.diana === "torre",
    nadaAbiertoHastaPedirlo: res.visitasAntes === 0 && res.estadoInicial.estado === "cerrado",
    puertaCerrada: res.conectar === "puerta" && res.alConectar.condiciones?.puerta === true && res.alConectar.condiciones?.abierta === false && res.alConectar.condiciones.faltan.length > 0,
    noColgaSinNormas: res.sinAceptar.ok === false && /aceptar las normas/.test(res.sinAceptar.why),
    elTorreIgnoraAntesDeAceptar: res.intentoSitio === true && res.ignorado.espera === true && res.ignorado.jugadores === 1, // 1 = A alone (B's attempt did nothing)
    aceptaYQuedaListo: res.aceptoB === true && res.tras.estado === "listo" && res.tras.condiciones.abierta === true,
    invitadoPropioPorServidor: res.tokenGuardado.length === 1 && res.tokenGuardado[0] === `numinia.invitado@127.0.0.1:${TP}`,
    laTorreContaUnaVisitaNoUnaPersona: res.torre1.visitas === 1 && res.torre1.conectados === res.torre0.conectados,
    sinAvatarEnLaTorre: res.aVeA.visible === 0 && res.aVeA.remotos === 0 && res.aVeA2.visible === 0 && res.aVeA2.remotos === 0,
    colgoLaPared: res.jugarEnPared.ok === true,
    unidoDesdePared: res.inicio.dA.b?.pared === true || res.inicio.dA.a?.pared === true,
    letreroNombraDeDondeViene: /En su pared \(AR\)/.test(etiqueta) && etiqueta.includes(`desde ${mundoB}`),
    nombreEnElMarcador: [res.inicio.dA.a?.nombre, res.inicio.dA.b?.nombre].includes(nombreB),
    ambosVenLosDardos: res.bVeA.enLaPared >= 3 && res.bVeA.enElControlador >= 3 && res.aVeDeB >= 3,
    mismasPuntuaciones: sa.a.puntos === sb.a.puntos && sa.b.puntos === sb.b.puntos && [sa.a.puntos, sa.b.puntos].sort().join() === [res.sumas.sumaA, res.sumas.sumaB].sort().join(),
    mismoVeredicto: sa.fin.texto === sb.fin.texto && sa.fin.empate === sb.fin.empate && (sa.fin.empate || (sa.fin.gane !== sb.fin.gane)),
    salioDeAR: res.arSalio === "off",
    cerroYNoQuedaVisita: res.cerrado === "cerrado" && (res.torre4.visitas ?? 0) === 0,
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
