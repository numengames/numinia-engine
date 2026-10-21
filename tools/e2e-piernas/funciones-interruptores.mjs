// e2e leg funciones/f3: the «Funciones de este mundo» switches in the Entorno panel, on PC and on a phone. Starts its OWN servers and page (ports
// E2E_SERVER_PORT / E2E_VITE_PORT, default 8871 / 5271; a second server on E2E_SERVER_PORT + 1 forces the gate from outside, a third on + 2 lets
// nobody build) on throwaway copies of aventuras/condiciones-prueba (its condiciones.json says `"puerta": true`); on the first two every guest may
// build (MOTOR_CONSTRUIR=todos). Nothing else is touched.
// What it checks:
//  1) owner (PC 1400×900) accepts the norms, enters build mode, opens the «Entorno» drawer: under «Espacio base» there is «Funciones de este
//     mundo» with three switches (Normas de entrada, Dardos, Pesca), each showing the server's state (all on), the help line under the norms.
//  2) turns «Normas de entrada» off in the panel → the server's state says off (the switch follows the server, not the click) → a second NEW
//     page enters with no bubble and W walks; turns it on → a third NEW page sees the bubble (and the pages already inside are not put out).
//  3) turns «Dardos» off → the board is gone from the page (`dardos.sitios()` and the 3D boards) and the state says off; on again → it is back.
//  4) a phone (390×844, touch, real emulation): the same block in the same drawer, tapped with a finger, no horizontal overflow.
//  5) a server that fixes the gate from outside (MOTOR_CONDICIONES_PUERTA=si): «Normas de entrada» is shown, disabled, «Lo fija el servidor.».
//  6) someone who cannot build does not see the block.
// Env: SHOTS=<folder> saves the pictures. Prints JSON; exit 0 only when all is right. Run it under the one-Chromium lock on the PC.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8871), SP2 = SP + 1, SP3 = SP + 2, VP = Number(process.env.E2E_VITE_PORT ?? 5271);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-func-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
const mundo = (n) => { const d = join(tmp, n); mkdirSync(join(d, "entorno"), { recursive: true }); mkdirSync(join(d, "datos"), { recursive: true }); cpSync(join(REPO, "aventuras/condiciones-prueba"), join(d, "aventura"), { recursive: true }); return d; };
const servidor = (n, port, env, nombre) => { const d = mundo(n); return arrancar("node", ["packages/server/src/main.ts"], { PORT: String(port), MUNDO_DIR: join(d, "entorno"), DATOS_DIR: join(d, "datos"), SESIONES_DIR: join(d, "sesiones"), AVENTURA_DIR: join(d, "aventura"), ...env }, nombre); };
servidor("a", SP, { MOTOR_CONSTRUIR: "todos", MOTOR_CONDICIONES_PUERTA: "" }, "servidor-libre"); // the file's `puerta: true` decides, the switch may change it
servidor("b", SP2, { MOTOR_CONSTRUIR: "todos", MOTOR_CONDICIONES_PUERTA: "si" }, "servidor-fijo"); // the gate forced from outside: `fija`
servidor("c", SP3, { MOTOR_CONDICIONES_PUERTA: "" }, "servidor-sin-obra"); // nobody builds here (the default)
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await Promise.all([SP, SP2, SP3].map((p) => fetch(`http://127.0.0.1:${p}/health`).catch(() => null))); if (r.ok && s.every((x) => x?.ok)) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const URL_A = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const URL_B = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP2}`;
const URL_C = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP3}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const verifica = (cond, msg) => { if (!cond) throw new Error(msg); };
const foto = async (p, nombre) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${nombre}.png`) }); };
let ok = false;

const abrir = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  return p;
};
const hayBurbuja = (p) => p.evaluate(() => !!document.getElementById("condiciones"));
const pos = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, z: s.z }; });
const caminar = async (p, ms = 1500) => { const p0 = await pos(p); await p.keyboard.down("KeyW"); await sleep(ms); await p.keyboard.up("KeyW"); await sleep(400); const p1 = await pos(p); return Math.hypot(p1.x - p0.x, p1.z - p0.z); };
const aceptar = async (p, tactil = false) => {
  const pulsa = (sel) => (tactil ? p.locator(sel).tap() : p.locator(sel).click());
  await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
  await p.locator("#condiciones-ok-casa").check(); await pulsa("#condiciones-siguiente"); await sleep(250);
  await p.locator("#condiciones-ok-comunidad").check(); await pulsa("#condiciones-siguiente"); await sleep(250);
  await pulsa("#condiciones-sin-opcional");
  await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 8000 });
};
const abrirEntorno = async (p, tactil) => {
  await p.waitForFunction(() => globalThis.__numinia.constructor.estado.puede, null, { timeout: 15000 });
  await p.evaluate(() => { if (document.getElementById("panel-construir").hidden) document.getElementById("construir").click(); });
  await p.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 10000 });
  if (tactil) await p.locator("#dock-entorno").tap(); else await p.locator("#dock-entorno").click();
  await p.waitForFunction(() => { const g = document.getElementById("funciones-mundo"); return !!g && !g.hidden && g.querySelectorAll("button").length > 0; }, null, { timeout: 8000 });
  await sleep(500);
};
/** What the block shows right now: the rows as drawn, plus where it sits and its geometry. */
const bloque = (p) => p.evaluate(() => {
  const g = document.getElementById("funciones-mundo"), base = document.getElementById("espacio-base-interruptor");
  const filas = [...g.querySelectorAll("button[role=switch]")].map((x) => { const r = x.getBoundingClientRect(), f = x.closest(".interruptor"), fr = f.getBoundingClientRect(); return { f: x.dataset.funcion, etiqueta: f.firstChild.textContent, on: x.getAttribute("aria-checked"), off: x.disabled, w: Math.round(r.width), h: Math.round(r.height), ancho: Math.round(fr.width), nota: f.nextSibling?.textContent ?? "" }; });
  return { titulo: g.querySelector("h3")?.textContent, filas, actual: globalThis.__numinia.funciones.actual(), debajoDeBase: !base || !!(base.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING),
    estado: document.querySelector("#panel-entorno .estado")?.textContent, desborda: document.documentElement.scrollWidth > innerWidth, base: base ? { w: Math.round(base.getBoundingClientRect().width), h: Math.round(base.getBoundingClientRect().height) } : null };
});
const interruptor = (p, f) => p.locator(`#funcion-${f}-interruptor`);
const esperaActual = (p, f, valor) => p.waitForFunction(([f, v]) => globalThis.__numinia.funciones.actual()[f] === v, [f, valor], { timeout: 8000 });
const desplazaHasta = async (p, f) => { await interruptor(p, f).scrollIntoViewIfNeeded(); await sleep(200); };
const dardosAhora = (p) => p.evaluate(() => ({ sitios: globalThis.__numinia.dardos.sitios().length, dibujadas: globalThis.__numinia.view.dardos.contar().dianas }));

try {
  // ---------- 1-3) owner on PC ----------
  const ctxPC = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const A = await abrir(ctxPC, URL_A);
  await aceptar(A);
  await abrirEntorno(A, false);
  const b1 = await bloque(A);
  nota("1 el bloque está en el panel Entorno, debajo de «Espacio base»", b1);
  verifica(b1.titulo === "Funciones de este mundo", `título: ${b1.titulo}`);
  verifica(JSON.stringify(b1.filas.map((f) => f.etiqueta)) === JSON.stringify(["Normas de entrada", "Dardos", "Pesca"]), `filas: ${JSON.stringify(b1.filas.map((f) => f.etiqueta))}`);
  verifica(b1.filas.every((f) => f.on === "true" && !f.off), "las tres están encendidas y se pueden pulsar");
  verifica(b1.filas[0].nota === "Apagadas, se entra sin aceptar normas. Para demos.", `ayuda de las normas: ${b1.filas[0].nota}`);
  verifica(b1.debajoDeBase, "el bloque va debajo de «Espacio base» en el panel");
  verifica(b1.base && b1.filas.every((f) => f.w === b1.base.w && f.h === b1.base.h), `mismo interruptor que «Espacio base» (${JSON.stringify(b1.base)}): ${JSON.stringify(b1.filas.map((f) => [f.w, f.h]))}`);
  await desplazaHasta(A, "pesca");
  await foto(A, "pc-1-panel-entorno-funciones");

  // normas off → a new page enters with no bubble
  await interruptor(A, "normas").click();
  await esperaActual(A, "normas", false);
  await sleep(500);
  const b2 = await bloque(A);
  verifica(b2.filas[0].on === "false" && b2.filas[1].on === "true", `el interruptor sigue al servidor: ${JSON.stringify(b2.filas.map((f) => f.on))}`);
  verifica(/Normas de entrada: apagada/.test(b2.estado), `la línea de estado: ${b2.estado}`);
  await foto(A, "pc-2-normas-apagadas");
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const B = await abrir(ctxB, URL_A);
  await sleep(1200);
  verifica(!(await hayBurbuja(B)), "normas apagadas: la segunda página no ve la burbuja");
  const dB = await caminar(B);
  verifica(dB > 0.5, `normas apagadas: W camina en la segunda página (${dB})`);
  nota("2a normas apagadas desde el panel: la segunda página entra sin burbuja y camina", { metros: Math.round(dB * 100) / 100 });

  // normas on → a third page sees the bubble; the pages already inside stay
  await interruptor(A, "normas").click();
  await esperaActual(A, "normas", true);
  const ctxC = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const C = await abrir(ctxC, URL_A);
  await C.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
  verifica(await hayBurbuja(C), "normas encendidas: la tercera página ve la burbuja");
  verifica(!(await hayBurbuja(A)) && !(await hayBurbuja(B)), "los que ya estaban dentro no vuelven a la burbuja");
  nota("2b normas encendidas desde el panel: la tercera página ve la burbuja; las de dentro se quedan");
  await ctxC.close(); await ctxB.close();

  // darts off → the board is gone
  const d0 = await dardosAhora(A);
  await A.waitForFunction(() => globalThis.__numinia.dardos.sitios().length === 1 && globalThis.__numinia.view.dardos.contar().dianas >= 1, null, { timeout: 10000 });
  await interruptor(A, "dardos").click();
  await esperaActual(A, "dardos", false);
  await A.waitForFunction(() => globalThis.__numinia.dardos.sitios().length === 0 && globalThis.__numinia.view.dardos.contar().dianas === 0, null, { timeout: 8000 });
  const b3 = await bloque(A);
  verifica(b3.filas[1].on === "false" && b3.filas[0].on === "true" && b3.filas[2].on === "true", `solo los dardos están apagados: ${JSON.stringify(b3.filas.map((f) => f.on))}`);
  await foto(A, "pc-3-dardos-apagados");
  nota("3a dardos apagados desde el panel: la diana desaparece (datos y dibujo)", { antes: d0, despues: await dardosAhora(A) });
  await interruptor(A, "dardos").click();
  await esperaActual(A, "dardos", true);
  await A.waitForFunction(() => globalThis.__numinia.dardos.sitios().length === 1, null, { timeout: 8000 });
  nota("3b dardos encendidos otra vez: la diana vuelve");

  // ---------- 4) phone ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
    await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version);
    const M = await abrir(ctx, URL_A); // the gate is ON again: the phone's owner accepts first, like anyone
    await aceptar(M, true);
    await abrirEntorno(M, true);
    const m1 = await bloque(M);
    nota("4 móvil: el mismo bloque en el mismo cajón", m1);
    verifica(m1.titulo === "Funciones de este mundo" && m1.filas.length === 3 && m1.debajoDeBase, "móvil: el bloque y sus tres filas, debajo de «Espacio base»");
    verifica(!m1.desborda, "móvil: sin desborde horizontal");
    verifica(m1.base && m1.filas.every((f) => f.w === m1.base.w && f.h === m1.base.h && f.h >= 44 && f.ancho >= 300), `móvil: interruptores del mismo tamaño que «Espacio base» (${JSON.stringify(m1.base)}), de 44 px de alto y fila entera: ${JSON.stringify(m1.filas)}`);
    await desplazaHasta(M, "pesca");
    await foto(M, "movil-1-panel-entorno-funciones");
    await interruptor(M, "pesca").tap();
    await esperaActual(M, "pesca", false);
    await sleep(500);
    const m2 = await bloque(M);
    verifica(m2.filas[2].on === "false" && /Pesca: apagada/.test(m2.estado), `móvil: un toque apaga la pesca y el interruptor lo sigue: ${JSON.stringify([m2.filas[2], m2.estado])}`);
    await foto(M, "movil-2-pesca-apagada");
    await interruptor(M, "pesca").tap();
    await esperaActual(M, "pesca", true);
    nota("4b móvil: un toque apaga y otro enciende la pesca, siguiendo al servidor");
    await ctx.close();
  }

  // ---------- 5) the gate fixed from outside ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const F = await abrir(ctx, URL_B);
    await aceptar(F);
    await abrirEntorno(F, false);
    const f1 = await bloque(F);
    nota("5 servidor que fija las normas: el interruptor sale desactivado", f1);
    const n = f1.filas[0];
    verifica(n.f === "normas" && n.off === true && n.on === "true", `normas fija: ${JSON.stringify(n)}`);
    verifica(/Lo fija el servidor\./.test(n.nota) && f1.filas.slice(1).every((f) => !f.off), `la nota dice quién lo fija y las otras se pulsan: ${n.nota}`);
    await F.evaluate(() => { document.getElementById("funcion-normas-interruptor").click(); });
    await sleep(400);
    verifica((await F.evaluate(() => globalThis.__numinia.funciones.actual().normas)) === true, "pulsar la fija no cambia nada");
    await desplazaHasta(F, "pesca");
    await foto(F, "pc-4-normas-fijas");
    await ctx.close();
  }

  // ---------- 6) whoever cannot build does not see the block ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const L = await abrir(ctx, URL_C);
    await aceptar(L); // this world has the gate on too; accepting does not make you a builder
    await sleep(1500);
    const puede = await L.evaluate(() => globalThis.__numinia.constructor.estado.puede);
    await L.evaluate(() => { const b = document.getElementById("construir"); if (b && document.getElementById("panel-construir")?.hidden) b.click(); });
    await sleep(900);
    const visto = await L.evaluate(() => { const g = document.getElementById("funciones-mundo"), e = document.getElementById("panel-entorno"); const ver = (x) => !!x && !x.hidden && getComputedStyle(x).display !== "none" && x.getClientRects().length > 0; return { hay: !!g, visible: ver(g), panelEntorno: ver(e), funcionesDelMundo: globalThis.__numinia.funciones.actual() }; });
    verifica(puede === false && !visto.visible, `sin permiso de construir no se ve el bloque: ${JSON.stringify({ puede, visto })}`);
    nota("6 sin permiso de construir: el bloque no se ve", { puede, ...visto });
    await ctx.close();
  }
  await ctxPC.close();
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
process.exit(ok ? 0 : 1);
