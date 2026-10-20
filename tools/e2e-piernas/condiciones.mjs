// e2e leg condiciones/c3: the entry bubble on PC and on a phone. Starts its OWN two servers and one page (ports E2E_SERVER_PORT /
// E2E_VITE_PORT, default 8799 / 5183; the second server is E2E_SERVER_PORT + 1) on throwaway world folders; nothing else is touched:
//   · server A: aventuras/condiciones-prueba (its condiciones.json says `"puerta": true`: house layer, community layer, data points);
//   · server B: the engine's default world (no condiciones.json, no env): the gate is OFF by default.
// What it checks:
//  0) gate OFF (B): no #condiciones in the page, W walks at once, nothing is held.
//  1) gate ON, PC 1400×900 (A): the bubble (#condiciones: role=dialog, aria-modal, backdrop-filter blur) and the first step are there; the
//     panel has focus; W does not move you (the server holds you too); Escape and a click outside do not close it; Enter does not open the
//     chat; Tab never leaves the panel; «Siguiente» waits for the box of the layer (empty by default).
//  2) accept house (box by keyboard) → community → «Lo que tú eliges»: every data box is EMPTY and the two buttons are the same size and colour;
//     «← Atrás» goes back. «Entrar sin lo opcional» → ACEPTAR with datos [] → the bubble bursts (class `estallando`), goes, and W walks.
//  3) «Aceptar todo y entrar» (a second guest) sends all the data ids; «Salir» (a third) closes the connection and shows the farewell, nothing accepted.
//  4) phone portrait 390×844 (touch, real emulation): the same flow with the panel taking the screen; and `?aparato=movil-vertical` on a desktop
//     window frames the world at phone size and the bubble inside it has the phone layout.
// Env: SHOTS=<folder> saves a picture of every step (PC 1400×900 and phone 390×844). Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8799), SP2 = SP + 1, VP = Number(process.env.E2E_VITE_PORT ?? 5183);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-cond-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
const mundo = (n) => { const d = join(tmp, n); mkdirSync(join(d, "entorno"), { recursive: true }); mkdirSync(join(d, "datos"), { recursive: true }); return d; };
const a = mundo("a"), b = mundo("b");
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: join(a, "entorno"), DATOS_DIR: join(a, "datos"), SESIONES_DIR: join(a, "sesiones"), AVENTURA_DIR: "aventuras/condiciones-prueba", MOTOR_CONDICIONES_PUERTA: "" }, "con-puerta");
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP2), MUNDO_DIR: join(b, "entorno"), DATOS_DIR: join(b, "datos"), SESIONES_DIR: join(b, "sesiones"), MOTOR_CONDICIONES_PUERTA: "" }, "sin-puerta"); // the default world: nothing asked of the gate
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 90; i++) {
  try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s1 = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null), s2 = await fetch(`http://127.0.0.1:${SP2}/health`).catch(() => null); if (r.ok && s1?.ok && s2?.ok) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const URL_CON = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const URL_SIN = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP2}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;
const verifica = (cond, msg) => { if (!cond) throw new Error(msg); };
let ok = false;

const abrir = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  return p;
};
const pos = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, y: s.y, z: s.z }; });
const lejos = (p0, p1) => Math.hypot(p1.x - p0.x, p1.z - p0.z);
const foto = async (p, nombre) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${nombre}.png`) }); };
const hayBurbuja = (p) => p.evaluate(() => !!document.getElementById("condiciones"));
const caminar = async (p, ms = 1500) => { const p0 = await pos(p); await p.keyboard.down("KeyW"); await sleep(ms); await p.keyboard.up("KeyW"); await sleep(400); return lejos(p0, await pos(p)); };
const estadoPanel = (p) => p.evaluate(() => {
  const r = document.getElementById("condiciones"); if (!r) return null;
  const panel = r.querySelector(".cond-panel"), cs = getComputedStyle(r), bp = panel.getBoundingClientRect();
  return { rol: panel.getAttribute("role"), modal: panel.getAttribute("aria-modal"), blur: cs.backdropFilter || cs.webkitBackdropFilter, movil: r.classList.contains("movil"), titulo: r.querySelector("h1")?.textContent, paso: r.dataset.paso,
    pasos: [...r.querySelectorAll(".paso")].map((x) => x.textContent), foco: document.activeElement?.id || document.activeElement?.tagName, focoDentro: r.contains(document.activeElement),
    botones: [...r.querySelectorAll(".pie button")].map((x) => ({ id: x.id, t: x.textContent, off: x.disabled })), cajas: [...r.querySelectorAll("input[type=checkbox]")].map((x) => ({ id: x.id || x.dataset.punto, on: x.checked })),
    panel: { x: Math.round(bp.x), y: Math.round(bp.y), w: Math.round(bp.width), h: Math.round(bp.height) }, ver: r.querySelector(".ver")?.textContent, enc: innerWidth, alto: innerHeight, scrollX: document.documentElement.scrollWidth, scrollPanel: panel.scrollWidth > panel.clientWidth };
});
const pulsar = async (p, id) => { await p.locator(`#${id}`).click(); await sleep(250); };
const tabHasta = async (p, id, max = 14) => { for (let i = 0; i < max; i++) { if (await p.evaluate((x) => document.activeElement?.id === x, id)) return true; await p.keyboard.press("Tab"); } return false; };

try {
  // ---------- 0) the gate OFF (the default world): nothing changes ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const p = await abrir(ctx, URL_SIN);
    await sleep(1500);
    const e = await p.evaluate(() => ({ hay: !!document.getElementById("condiciones"), estilo: !!document.querySelector("style[data-condiciones]"), cerrada: globalThis.__numinia.condiciones.cerrada(), inertes: document.querySelectorAll("[inert]").length, cond: globalThis.__numinia.session.condiciones }));
    verifica(!e.hay && !e.estilo && !e.cerrada && e.inertes === 0, `puerta apagada: ${JSON.stringify(e)}`);
    const d = await caminar(p);
    verifica(d > 0.5, `puerta apagada: W no mueve (${d})`);
    nota("0 puerta apagada: ni pompa ni panel, W camina", { cond: e.cond, metros: r2(d) });
    await ctx.close();
  }

  // ---------- 1-2) the gate ON, PC ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await abrir(ctx, URL_CON);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
    await sleep(600);
    const e1 = await estadoPanel(p);
    nota("1 la pompa y el panel están", e1);
    verifica(e1.rol === "dialog" && e1.modal === "true", "role dialog + aria-modal");
    verifica(/blur/.test(e1.blur), `el mundo detrás está borroso (${e1.blur})`);
    verifica(e1.titulo === "Las normas de este sitio" && e1.paso === "capa", `paso 1: ${e1.titulo}`);
    verifica(e1.pasos.length === 3 && /Numinia/.test(e1.pasos[0]) && /Numen Games/.test(e1.pasos[1]) && /Lo que tú eliges/.test(e1.pasos[2]), `los pasos salen del fichero: ${JSON.stringify(e1.pasos)}`);
    verifica(e1.focoDentro, "el foco está dentro del panel");
    verifica(e1.cajas.every((c) => !c.on) && e1.botones.find((x) => x.id === "condiciones-siguiente")?.off === true, "casilla vacía y «Siguiente» espera");
    verifica(!e1.movil, "PC: no es el diseño de móvil");
    verifica(e1.panel.w >= 800 && e1.panel.h >= 500, `panel grande en PC ${JSON.stringify(e1.panel)}`);
    await foto(p, "pc-1-casa");

    // can't move, can't close
    const p0 = await pos(p);
    const d = await caminar(p, 1800);
    const p1 = await pos(p);
    verifica(d < 0.05, `inmóvil dentro de la pompa (${d})`);
    const servidor = await p.evaluate(() => { const s = globalThis.__numinia.session; return { cond: s.condiciones && { puerta: s.condiciones.puerta, abierta: s.condiciones.abierta, faltan: s.condiciones.faltan } }; });
    verifica(servidor.cond?.puerta === true && servidor.cond.abierta === false && servidor.cond.faltan.length === 2, `el servidor dice: ${JSON.stringify(servidor)}`);
    await p.keyboard.press("Escape"); await p.keyboard.press("Enter"); await p.keyboard.press("KeyG"); await p.keyboard.press("KeyM"); await p.keyboard.press("KeyP"); await sleep(300);
    await p.mouse.click(15, 15); await p.mouse.click(700, 880); await p.mouse.click(1380, 30); await sleep(300);
    const e1b = await p.evaluate(() => { const c = document.getElementById("chat"); const ab = document.querySelector("dialog[open]"); const arriba = document.elementFromPoint(1380, 30); return { hay: !!document.getElementById("condiciones"), abiertoOtro: !!ab, chatFoco: !!c && c.contains(document.activeElement), arribaDentro: !!arriba?.closest("#condiciones"), foco: document.activeElement?.id || document.activeElement?.tagName, menus: [...document.querySelectorAll(".menu-barra")].filter((m) => !m.hidden).length }; });
    verifica(e1b.hay && !e1b.abiertoOtro && !e1b.chatFoco && e1b.arribaDentro && e1b.menus === 0, `no se cierra ni se escapa nada: ${JSON.stringify(e1b)}`);
    nota("1b W, Escape, Enter, clic fuera: nada se mueve ni se cierra", { metros: r2(d), ...e1b });
    // Tab stays in the panel
    const focos = [];
    for (let i = 0; i < 12; i++) { await p.keyboard.press("Tab"); focos.push(await p.evaluate(() => { const r = document.getElementById("condiciones"); return r.contains(document.activeElement) ? (document.activeElement.id || document.activeElement.tagName) : `FUERA:${document.activeElement?.tagName}`; })); }
    verifica(!focos.some((f) => f.startsWith("FUERA")), `Tab no sale del panel: ${focos}`);
    for (let i = 0; i < 12; i++) { await p.keyboard.press("Shift+Tab"); const f = await p.evaluate(() => document.getElementById("condiciones").contains(document.activeElement)); verifica(f, "Shift+Tab no sale del panel"); }
    nota("1c Tab y Mayús+Tab dan vueltas dentro del panel", { focos });

    // 2) house box by keyboard, next
    verifica(await tabHasta(p, "condiciones-ok-casa"), "la casilla de la casa se alcanza con Tab");
    await p.keyboard.press("Space"); await sleep(200);
    const e2 = await estadoPanel(p);
    verifica(e2.cajas.find((c) => c.id === "condiciones-ok-casa")?.on === true && e2.botones.find((x) => x.id === "condiciones-siguiente")?.off === false, "marcada la casilla, «Siguiente» se abre");
    await foto(p, "pc-1b-casa-aceptada");
    await pulsar(p, "condiciones-siguiente");
    const e3 = await estadoPanel(p);
    verifica(/Numen Games/.test(e3.titulo) && e3.pasos[0] === "✓Numinia", `paso 2: ${e3.titulo} ${JSON.stringify(e3.pasos)}`);
    verifica(e3.botones.some((x) => x.id === "condiciones-atras") && e3.botones.find((x) => x.id === "condiciones-siguiente").off, "paso 2: Atrás y «Siguiente» cerrado hasta marcar");
    await foto(p, "pc-2-comunidad");
    await p.locator("#condiciones-ok-comunidad").check(); await sleep(150);
    await foto(p, "pc-2b-comunidad-aceptada");
    await pulsar(p, "condiciones-siguiente");
    const e4 = await estadoPanel(p);
    verifica(e4.paso === "datos" && e4.titulo === "Lo que tú eliges", `paso 3: ${e4.titulo}`);
    verifica(e4.cajas.length === 3 && e4.cajas.every((c) => !c.on), `los permisos de datos salen VACÍOS: ${JSON.stringify(e4.cajas)}`);
    const dos = await p.evaluate(() => { const f = (id) => { const x = document.getElementById(id), r = x.getBoundingClientRect(), s = getComputedStyle(x); return { w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, color: s.color, borde: s.borderColor, fuente: s.fontSize + s.fontWeight, txt: x.textContent, off: x.disabled }; }; return { sin: f("condiciones-sin-opcional"), todo: f("condiciones-todo") }; });
    verifica(dos.sin.w === dos.todo.w && dos.sin.h === dos.todo.h && dos.sin.bg === dos.todo.bg && dos.sin.color === dos.todo.color && dos.sin.borde === dos.todo.borde && dos.sin.fuente === dos.todo.fuente, `«Entrar sin lo opcional» y «Aceptar todo y entrar» iguales: ${JSON.stringify(dos)}`);
    verifica(dos.sin.txt === "Entrar sin lo opcional" && dos.todo.txt === "Aceptar todo y entrar" && !dos.sin.off && !dos.todo.off, "los rótulos y activos aunque no se marque nada");
    nota("2 «Tus datos»: casillas vacías, dos botones iguales", { ...dos, ver: e4.ver });
    await foto(p, "pc-3-datos");
    await pulsar(p, "condiciones-atras");
    verifica((await estadoPanel(p)).titulo.includes("Numen Games") && (await p.locator("#condiciones-ok-comunidad").isChecked()), "Atrás vuelve al paso anterior sin perder la casilla");
    await pulsar(p, "condiciones-siguiente");
    // 2b) enter without the optional
    await p.locator("#condiciones-sin-opcional").click();
    await p.waitForSelector("#condiciones.estallando", { timeout: 4000 }).catch(() => null);
    await foto(p, "pc-4-pompa-se-deshace");
    await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 5000 });
    const sp = await p.evaluate(() => { const c = globalThis.__numinia.session.condiciones; return { abierta: c.abierta, aceptado: c.aceptado && { versiones: c.aceptado.versiones, datos: c.aceptado.datos }, inertes: document.querySelectorAll("[inert]").length, cerrada: globalThis.__numinia.condiciones.cerrada() }; });
    verifica(sp.abierta && sp.aceptado?.datos.length === 0 && sp.aceptado.versiones.casa === "1.0" && sp.aceptado.versiones.comunidad === "1.0" && sp.inertes === 0 && !sp.cerrada, `aceptadas las normas, sin datos: ${JSON.stringify(sp)}`);
    await sleep(500);
    const camina = await caminar(p, 2200);
    verifica(camina > 0.8, `con la pompa deshecha, W camina (${camina})`);
    nota("3 «Entrar sin lo opcional»: la pompa se va y W camina", { ...sp, metros: r2(camina) });
    await foto(p, "pc-5-caminando");
    await ctx.close();
  }

  // ---------- 3) «Aceptar todo y entrar» and «Salir» ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await abrir(ctx, URL_CON);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
    await p.locator("#condiciones-ok-casa").check(); await pulsar(p, "condiciones-siguiente");
    await p.locator("#condiciones-ok-comunidad").check(); await pulsar(p, "condiciones-siguiente");
    await p.locator('input[data-punto="ia"]').check(); await sleep(150);
    const lbl = await p.locator("#condiciones-sin-opcional").textContent();
    verifica(lbl === "Entrar con lo que he marcado", `con una marcada el primer botón lo dice: ${lbl}`);
    await foto(p, "pc-3b-datos-una-marcada");
    await p.locator('input[data-punto="ia"]').uncheck();
    await p.locator("#condiciones-todo").click();
    await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 6000 });
    const ac = await p.evaluate(() => globalThis.__numinia.session.condiciones.aceptado);
    verifica(JSON.stringify([...ac.datos].sort()) === JSON.stringify(["avisos", "ia", "informe"]), `«Aceptar todo» manda todos los permisos: ${JSON.stringify(ac)}`);
    nota("4 «Aceptar todo y entrar»", { datos: ac.datos });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p = await abrir(ctx, URL_CON);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
    await p.locator("#condiciones-salir").click(); await sleep(700);
    const s = await p.evaluate(() => ({ titulo: document.querySelector("#condiciones h1")?.textContent, reiniciar: !!document.getElementById("condiciones-reiniciar"), hay: !!document.getElementById("condiciones") }));
    verifica(s.hay && s.titulo === "Has salido de este mundo" && s.reiniciar, `Salir: ${JSON.stringify(s)}`);
    await foto(p, "pc-6-salir");
    nota("5 «Salir» saca del mundo", s);
    await ctx.close();
  }

  // ---------- 4) phone portrait ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
    const p = await abrir(ctx, URL_CON);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
    await sleep(600);
    const m1 = await estadoPanel(p);
    verifica(m1.movil, "móvil: diseño de móvil");
    verifica(m1.panel.w >= 360 && m1.panel.h >= 600 && m1.scrollX <= m1.enc, `móvil: el panel ocupa casi toda la pantalla y no se sale: ${JSON.stringify(m1.panel)} (${m1.scrollX}/${m1.enc})`);
    nota("6 móvil: pompa y panel", m1);
    await foto(p, "movil-1-casa");
    await p.locator(".leer-mas").click(); await sleep(250);
    await foto(p, "movil-1b-texto-entero");
    await p.locator(".leer-mas").click();
    await p.locator("#condiciones-ok-casa").check(); await pulsar(p, "condiciones-siguiente");
    await foto(p, "movil-2-comunidad");
    await p.locator("#condiciones-ok-comunidad").check(); await pulsar(p, "condiciones-siguiente");
    const m3 = await estadoPanel(p);
    verifica(m3.paso === "datos" && m3.cajas.every((c) => !c.on), "móvil: datos vacíos");
    const dosM = await p.evaluate(() => { const f = (id) => { const r = document.getElementById(id).getBoundingClientRect(), s = getComputedStyle(document.getElementById(id)); return { w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, dentro: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; }; return { sin: f("condiciones-sin-opcional"), todo: f("condiciones-todo") }; });
    verifica(dosM.sin.w === dosM.todo.w && dosM.sin.h === dosM.todo.h && dosM.sin.bg === dosM.todo.bg && dosM.sin.dentro && dosM.todo.dentro, `móvil: botones iguales y a la vista ${JSON.stringify(dosM)}`);
    await foto(p, "movil-3-datos");
    const d = await caminar(p, 1200);
    verifica(d < 0.05, `móvil: inmóvil en la pompa (${d})`);
    await p.locator("#condiciones-sin-opcional").click();
    await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 6000 });
    await sleep(400);
    const dm = await caminar(p, 2200);
    verifica(dm > 0.8, `móvil: la pompa se fue y camina (${dm})`);
    await foto(p, "movil-4-caminando");
    nota("7 móvil: acepta sin lo opcional y camina", { botones: dosM, metros: r2(dm) });
    await ctx.close();
  }
  {
    // ?aparato=movil-vertical on a desktop window: the page frames the world at phone size, the bubble inside has the phone layout
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(`${URL_CON}&aparato=movil-vertical`);
    const marco = await (async () => { for (let i = 0; i < 60; i++) { const f = p.frames().find((x) => x !== p.mainFrame()); if (f) return f; await sleep(500); } return null; })();
    verifica(marco, "?aparato=movil-vertical: hay un marco con el mundo");
    await marco.waitForSelector("#condiciones .cond-panel", { timeout: 30000 });
    const m = await marco.evaluate(() => ({ movil: document.getElementById("condiciones").classList.contains("movil"), ancho: innerWidth, dataset: document.documentElement.dataset.aparato }));
    verifica(m.movil && m.ancho <= 400, `?aparato=movil-vertical: ${JSON.stringify(m)}`);
    if (SHOTS) await p.screenshot({ path: join(SHOTS, "movil-5-parametro-aparato.png") });
    nota("8 ?aparato=movil-vertical", m);
    await ctx.close();
  }
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  for (const x of procs) out[`registro-${x.nombre}`] = x.log().split("\n").filter((l) => /condiciones|error|Error/.test(l)).slice(-8);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  await sleep(300);
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
