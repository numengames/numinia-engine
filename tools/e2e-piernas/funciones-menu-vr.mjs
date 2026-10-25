// e2e leg funciones/v3: the «Este mundo» switches inside the VR menu's Ajustes (IWER, Quest 3 emulated). Starts its OWN servers and page
// (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8895 / 5278; a second server on E2E_SERVER_PORT + 1 where nobody builds, a third on + 2 that fixes the gate from outside) on throwaway
// copies of aventuras/condiciones-prueba (it has a dartboard). The first server lets every guest build (MOTOR_CONSTRUIR=todos).
// What it checks:
//  1) a builder accepts the conditions, enters VR, turns the left wrist (the watch), points the right ray at «Menú» and pulls the trigger →
//     the menu opens; «Ajustes» has the VR settings and, after them, «Este mundo» with Normas de entrada · Dardos · Pesca, all «Encendida»
//     (the server's state), and the board exists (data and drawing).
//  2) the ray on «Siguiente», then on «Dardos» + trigger → the SERVER's state says dardos off, the board is gone (data and drawing), the
//     menu's row now says «Apagada»; the same press again → the board is back, «Encendida».
//  3) someone who cannot build (second server) opens the same Ajustes and there is no «Este mundo».
//  4) a server that fixes the gate from outside (MOTOR_CONDICIONES_PUERTA=si): «Normas de entrada» is shown with its button off and the line
//     «Lo fija el servidor.»; pressing it asks nothing and changes nothing.
// Env: SHOTS=<folder> saves the menu's canvases (IWER draws the scene poorly, so the pictures are the canvases themselves). Prints JSON;
// exit 0 only when all is right. Run it under the one-Chromium lock on the PC.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8895), SP2 = SP + 1, SP3 = SP + 2, VP = Number(process.env.E2E_VITE_PORT ?? 5278);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const ID_SECCION = (i) => 10 + i; // menu-vr.ts idSeccion
const ID_BOTON = (i) => 100 + i;  // menu-vr.ts idBoton

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-func-vr-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
const mundo = (n) => { const d = join(tmp, n); mkdirSync(join(d, "entorno"), { recursive: true }); mkdirSync(join(d, "datos"), { recursive: true }); cpSync(join(REPO, "aventuras/condiciones-prueba"), join(d, "aventura"), { recursive: true }); return d; };
const servidor = (n, port, env, nombre) => { const d = mundo(n); return arrancar("node", ["packages/server/src/main.ts"], { PORT: String(port), MUNDO_DIR: join(d, "entorno"), DATOS_DIR: join(d, "datos"), SESIONES_DIR: join(d, "sesiones"), AVENTURA_DIR: join(d, "aventura"), ...env }, nombre); };
servidor("a", SP, { MOTOR_CONSTRUIR: "todos", MOTOR_CONDICIONES_PUERTA: "" }, "servidor-obra");
servidor("b", SP2, { MOTOR_CONDICIONES_PUERTA: "" }, "servidor-sin-obra"); // nobody builds here (the default)
servidor("c", SP3, { MOTOR_CONSTRUIR: "todos", MOTOR_CONDICIONES_PUERTA: "si" }, "servidor-fijo"); // the gate forced from outside: `fija`
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await Promise.all([SP, SP2, SP3].map((p) => fetch(`http://127.0.0.1:${p}/health`).catch(() => null))); if (r.ok && s.every((x) => x?.ok)) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const URL_A = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const URL_B = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP2}`;
const URL_C = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP3}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const verifica = (cond, msg) => { if (!cond) throw new Error(msg); };
let ok = false;

// The IWER Quest 3 plus the same wrist/ray helpers tools/e2e-piernas/menu-vr.mjs uses.
const SCRIPT = IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
  const giro = (a, b) => { const d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; let x = a[1]*b[2]-a[2]*b[1], y = a[2]*b[0]-a[0]*b[2], z = a[0]*b[1]-a[1]*b[0], w = 1 + d;
    if (w < 1e-6) { x = 0; y = 0; z = 1; w = 0; } const n = Math.hypot(x, y, z, w); return [x/n, y/n, z/n, w/n]; };
  globalThis.__mirarMuneca = () => {
    const d = globalThis.__iwer, h = d.position, p = -40 * Math.PI / 180;
    d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2));
    const g = [0, Math.sin(p), -Math.cos(p)], L = 0.42, c = d.controllers.left;
    c.position.set(h.x + g[0] * L, h.y + g[1] * L, h.z + g[2] * L);
    const q = giro([-1, 0, 0], [-g[0], -g[1], -g[2]]); c.quaternion.set(q[0], q[1], q[2], q[3]);
    const r = d.controllers.right; r.position.set(h.x + 0.15, h.y - 0.12, h.z - 0.12);
  };
  globalThis.__bajarMuneca = () => { const d = globalThis.__iwer, h = d.position; d.quaternion.set(0, 0, 0, 1);
    const c = d.controllers.left; c.position.set(h.x - 0.2, h.y - 0.8, h.z - 0.1); c.quaternion.set(0, 0, 0, 1); };
  globalThis.__apuntar = (w) => {
    const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
    const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
    c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
  };`;

/** A fresh page in VR with the menu open on «Ajustes», opened with the watch and the ray like a person does. */
async function abrirAjustes(url, aceptarBurbuja) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(SCRIPT);
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await a.goto(url);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 60000 });
  if (aceptarBurbuja) { // the conditions bubble of this world, on the computer's page, before putting the headset on
    await a.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
    await a.locator("#condiciones-ok-casa").check(); await a.locator("#condiciones-siguiente").click(); await sleep(250);
    await a.locator("#condiciones-ok-comunidad").check(); await a.locator("#condiciones-siguiente").click(); await sleep(250);
    await a.locator("#condiciones-sin-opcional").click();
    await a.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 8000 });
  }
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 8000) => a.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const boton = (b, nombre, v) => a.evaluate(([b, nombre, v]) => globalThis.__iwer.controllers[b].updateButtonValue(nombre, v), [b, nombre, v]);
  const gatillo = async (ms = 80) => { await boton("right", "trigger", 1); await a.waitForTimeout(ms); await boton("right", "trigger", 0); await a.waitForTimeout(250); };
  const apuntarYPulsar = async (id) => {
    const donde = await ctl((id) => globalThis.__numinia.view.vr.menu.zonaMundo(id), id);
    verifica(donde, `la zona ${id} del menú no está`);
    await ctl((w) => globalThis.__apuntar(w), donde); await a.waitForTimeout(250); await gatillo();
  };
  const lienzo = async (nombre) => {
    if (!SHOTS) return;
    const url = await ctl(() => globalThis.__numinia.view.vr.menu.lienzo.toDataURL("image/png"));
    writeFileSync(join(SHOTS, `${nombre}.png`), Buffer.from(url.split(",")[1], "base64"));
  };
  await esperar(() => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, 15000).catch(() => {}); // MIS-200 (t_9687b5fc): the entry says «Preparando…» until the world has loaded
  await ctl(() => document.getElementById("vr").click());
  verifica(await esperar(() => globalThis.__numinia.view.vr.active, null, 15000), "no entra en VR");
  await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
  await ctl(() => globalThis.__mirarMuneca());
  verifica(await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000), "el reloj no sale al girar la muñeca");
  const menuEn = await ctl(() => globalThis.__numinia.view.vr.reloj.botonMundo("menu"));
  await ctl((w) => globalThis.__apuntar(w), menuEn); await a.waitForTimeout(250); await gatillo();
  verifica(await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 3000), "rayo + gatillo en «Menú» no abre el panel");
  await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(150);
  await apuntarYPulsar(ID_SECCION(6)); // «Ajustes»
  verifica(await esperar(() => globalThis.__numinia.view.vr.menu.vista === "ajustes", null, 3000), "rayo + gatillo en «Ajustes» no cambia de sección");
  await a.waitForTimeout(300);
  return { a, ctx, ctl, esperar, apuntarYPulsar, lienzo, filas: () => ctl(() => globalThis.__numinia.view.vr.menu.estado().filas) };
}
const dianas = (a) => a.evaluate(() => ({ sitios: globalThis.__numinia.dardos.sitios().length, dibujadas: globalThis.__numinia.view.dardos.contar().dianas }));
const notasVR = (a) => a.evaluate(() => (globalThis.__numinia.menuVR?.avisos?.() ?? []).slice(0, 4));

try {
  // ---------- 1-2) a builder ----------
  const A = await abrirAjustes(URL_A, true);
  const a = A.a;
  await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede, null, { timeout: 15000 });
  await a.waitForFunction(() => globalThis.__numinia.dardos.sitios().length === 1 && globalThis.__numinia.view.dardos.contar().dianas >= 1, null, { timeout: 15000 });
  await a.waitForTimeout(500);
  const f1 = await A.filas();
  nota("1 «Ajustes» del menú VR: los ajustes de VR y después «Este mundo» con las tres funciones", { filas: f1 });
  verifica(JSON.stringify(f1.slice(-4)) === JSON.stringify(["Este mundo", "Normas de entrada", "Dardos", "Pesca"]), `filas: ${JSON.stringify(f1)}`);
  verifica(await a.evaluate(() => JSON.stringify(globalThis.__numinia.funciones.actual()) === JSON.stringify({ normas: true, dardos: true, pesca: true })), "las tres funciones están encendidas en el servidor");
  const d0 = await dianas(a);
  verifica(d0.sitios === 1 && d0.dibujadas >= 1, `hay diana antes de apagar: ${JSON.stringify(d0)}`);
  await A.lienzo("vr-ajustes-1-vr");
  // page 2: «Siguiente» is the last button of page 1 (5 VR rows + Anterior + Siguiente)
  const n1 = await a.evaluate(() => globalThis.__numinia.view.vr.menu.estado().botones);
  await A.apuntarYPulsar(ID_BOTON(n1 - 1)); await a.waitForTimeout(400);
  const n2 = await a.evaluate(() => globalThis.__numinia.view.vr.menu.estado().botones);
  verifica(n2 === 5, `la segunda página tiene tres botones de función y Anterior/Siguiente (${n2})`);
  await A.lienzo("vr-ajustes-2-este-mundo-encendido");
  // Dardos is the second button of page 2
  await A.apuntarYPulsar(ID_BOTON(1));
  verifica(await A.esperar(() => globalThis.__numinia.funciones.actual().dardos === false, null, 8000), "el servidor dice dardos apagados");
  verifica(await A.esperar(() => globalThis.__numinia.dardos.sitios().length === 0 && globalThis.__numinia.view.dardos.contar().dianas === 0, null, 8000), "la diana desaparece (datos y dibujo)");
  await a.waitForTimeout(900);
  const d1 = await dianas(a);
  verifica(await a.evaluate(() => { const f = globalThis.__numinia.funciones.actual(); return f.normas === true && f.pesca === true; }), "solo los dardos se apagan");
  await A.lienzo("vr-ajustes-3-dardos-apagados");
  nota("2a rayo + gatillo en «Dardos» desde el menú VR: el servidor lo apaga y la diana desaparece (datos y dibujo)", { antes: d0, despues: d1, avisos: await notasVR(a) });
  await A.apuntarYPulsar(ID_BOTON(1));
  verifica(await A.esperar(() => globalThis.__numinia.funciones.actual().dardos === true, null, 8000), "el servidor dice dardos encendidos");
  verifica(await A.esperar(() => globalThis.__numinia.dardos.sitios().length === 1 && globalThis.__numinia.view.dardos.contar().dianas >= 1, null, 8000), "la diana vuelve");
  await a.waitForTimeout(600);
  await A.lienzo("vr-ajustes-4-dardos-encendidos");
  nota("2b el mismo gesto otra vez: la diana vuelve", { despues: await dianas(a), avisos: await notasVR(a) });
  await A.ctx.close();

  // ---------- 3) someone who cannot build ----------
  const B = await abrirAjustes(URL_B, true);
  await B.a.waitForTimeout(500);
  const fB = await B.filas();
  const puede = await B.a.evaluate(() => globalThis.__numinia.constructor.estado.puede);
  verifica(puede === false, `en el servidor sin obra no se puede construir (${puede})`);
  verifica(!fB.includes("Este mundo") && !fB.includes("Dardos"), `sin permiso de construir no hay «Este mundo»: ${JSON.stringify(fB)}`);
  await B.lienzo("vr-ajustes-5-sin-permiso");
  nota("3 sin permiso de construir: «Ajustes» no tiene «Este mundo»", { puede, filas: fB });
  await B.ctx.close();

  // ---------- 4) the server fixes the gate ----------
  const C = await abrirAjustes(URL_C, true);
  await C.a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && globalThis.__numinia.funciones.fija("normas"), null, { timeout: 15000 });
  await C.a.waitForTimeout(500);
  const fC = await C.filas();
  verifica(JSON.stringify(fC.slice(-5)) === JSON.stringify(["Este mundo", "Normas de entrada", "Lo fija el servidor.", "Dardos", "Pesca"]), `filas con la puerta fija: ${JSON.stringify(fC)}`);
  const nC = await C.a.evaluate(() => globalThis.__numinia.view.vr.menu.estado().botones);
  await C.apuntarYPulsar(ID_BOTON(nC - 1)); await C.a.waitForTimeout(400); // «Siguiente»
  const antes = await C.a.evaluate(() => globalThis.__numinia.funciones.actual());
  await C.lienzo("vr-ajustes-6-puerta-fija");
  await C.apuntarYPulsar(ID_BOTON(0)); await C.a.waitForTimeout(900); // «Normas de entrada»: off, asks nothing
  const despues = await C.a.evaluate(() => ({ actual: globalThis.__numinia.funciones.actual(), fija: globalThis.__numinia.funciones.fija("normas"), rechazo: globalThis.__numinia.funciones.estado.ultimoRechazo, cambios: globalThis.__numinia.funciones.estado.cambios }));
  verifica(JSON.stringify(despues.actual) === JSON.stringify(antes) && despues.fija, `pulsar la fija no cambia nada: ${JSON.stringify({ antes, despues })}`);
  nota("4 puerta fijada por el servidor: «Normas de entrada» sale con el botón apagado y «Lo fija el servidor.»; pulsarla no cambia nada", { filas: fC, antes, despues });
  await C.ctx.close();

  ok = errors.length === 0;
  if (!ok) out.fallo = `errores de página: ${errors.slice(0, 3).join(" | ")}`;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  for (const x of procs) out[`registro-${x.nombre}`] = x.log().split("\n").filter((l) => /funciones|condiciones|error|Error/.test(l)).slice(-8);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  await sleep(300);
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "E2E FUNCIONES-MENU-VR OK" : "E2E FUNCIONES-MENU-VR FALLA");
process.exit(ok ? 0 : 1);
