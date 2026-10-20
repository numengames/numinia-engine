// e2e leg (N18 bienes, corte 2): your goods in 3D, worn, and receipts from other worlds — on a PC and on a phone.
// Starts its own server (MOTOR_SECRET set, so this world signs) and page on spare ports, with a COPY of the example world
// whose bienes/confianza.json trusts ONE other world («Mundo Vecino», a key made here). Then:
//  PC (A) brings a receipt signed by Mundo Vecino (a file, through the sheet's «Traer un recibo de otro mundo»): it is
//    checked, becomes A's here, marked «De otro mundo»; «Ver en 3D» turns its model (the Farolillo) in the sheet (drag);
//    «En la mano» → B (another guest) sees it in A's hand (loaded, drawn, at hand height); «Sobre la cabeza» moves it up;
//    A brings a receipt from an UNTRUSTED world: real, listed under «De otro mundo · no es tuyo aquí», not in A's goods.
//  Phone (C, 390×844, touch): brings the same trusted receipt → «otra persona» (one receipt, one person); brings its own
//    trusted receipt → wears it on its head, B sees it; «Ver en 3D» turned with a finger (touch drag).
// Env: SHOTS=<folder> saves pictures; E2E_SERVER_PORT / E2E_VITE_PORT (default 8796 / 5178).
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { crearRecibos } from "../../packages/server/src/recibos.ts";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8796), VP = Number(process.env.E2E_VITE_PORT ?? 5178);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

// ---- the worlds: this one (a copy of the example that trusts Mundo Vecino) and two others that sign receipts ----
const FAROLILLO = "911db167762103bbf472a72941f59c22f0c8953d631185b3225d89d87e89baaa";
const vecino = crearRecibos("mundo-vecino-secreto-de-prueba-e2e-xx", "vecino.example"), extrano = crearRecibos("mundo-extrano-secreto-de-prueba-e2e-x", "extrano.example");
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-bienes-"));
const aventura = join(tmp, "aventura");
cpSync(join(REPO, "aventuras/ejemplo"), aventura, { recursive: true });
writeFileSync(join(aventura, "bienes/confianza.json"), JSON.stringify({ formato: "confianza@1", emisores: [{ emisor: vecino.emisor, nombre: "Mundo Vecino", nota: "e2e" }] }));
const recibo = (r, id, nombre, dueno = "otro-invitado") => r.firmar({ id, objeto: { id: "farolillo-vecino", nombre, descripcion: "Un farolillo que viene de otro mundo.", modelo: FAROLILLO, licencia: "CC0-1.0" }, dueno, mision: "fiesta", instante: "2026-10-17T20:00:00.000Z" });
const fichero = (token, nombre) => ({ name: `recibo-${nombre}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ formato: "nb1", recibo: token }, null, 2)) });
const R1 = recibo(vecino, "aaaaaaaaaaaaaaaaaaaaaaaa", "Farolillo del Vecino"), R2 = recibo(extrano, "bbbbbbbbbbbbbbbbbbbbbbbb", "Farolillo Extraño"), R3 = recibo(vecino, "cccccccccccccccccccccccc", "Farolillo del Móvil");

const procs = [];
const arrancar = (cmd, args, env, log) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre: log }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MOTOR_SECRET: "e2e-bienes-este-mundo-secreto-xxxxxxxx", AVENTURA_DIR: aventura, DATOS_DIR: join(tmp, "datos"), SESIONES_DIR: join(tmp, "sesiones"), MOTOR_CONSTRUIR: "todos" }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/a/${FAROLILLO}.glb`).catch(() => null); if (r.ok && s) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const abrir = async (movil = false) => {
  const ctx = await browser.newContext(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 900, height: 640 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 40000 });
  return p;
};
const ctl = (p, code, arg) => p.evaluate(code, arg);
const esperar = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms });
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/bienes-${n}.png` }); };
const inventario = (p) => ctl(p, () => document.querySelector("#ficha [data-seccion=inventario]")?.textContent ?? "");
const abrirFicha = async (p) => { await ctl(p, () => globalThis.__numinia.ficha.abrir("reserva")); await esperar(p, () => !!document.querySelector("#ficha [data-seccion=inventario] input[type=file]")); };
const traer = async (p, f) => { await abrirFicha(p); await p.setInputFiles("#ficha [data-seccion=inventario] input[type=file]", f); };
const ETIQUETA = { "Ver en 3D": (n) => `Ver ${n} en 3D`, "En la mano": (n) => `Llevar ${n} en la mano`, "Sobre la cabeza": (n) => `Llevar ${n} sobre la cabeza`, "Quitártelo": (n) => `Quitarte ${n}` };
/** A good's button by its accessible name (what a screen reader says), as a person would find it. */
const boton = async (p, nombre, texto, tocar = false) => {
  const l = p.locator("#ficha").getByRole("button", { name: ETIQUETA[texto](nombre), exact: true });
  await l.scrollIntoViewIfNeeded({ timeout: 8000 });
  if (tocar) await l.tap(); else await l.click();
};
const puestoEn = (p, ent) => ctl(p, (e) => globalThis.__numinia.view.puestos()[String(e)] ?? null, ent);

let ok = false;
try {
  const a = await abrir(), b = await abrir();
  const ea = await ctl(a, () => globalThis.__numinia.session.entity);
  out.emisor = await ctl(a, () => globalThis.__numinia.bienes.emisor());
  nota("A y B dentro", { ea, emisor: !!out.emisor });

  // 1) A brings a receipt from Mundo Vecino, whom this world trusts: checked, A's here, «De otro mundo»
  await traer(a, fichero(R1, "vecino"));
  await esperar(a, () => globalThis.__numinia.bienes.lista().some((x) => x.nombre === "Farolillo del Vecino"));
  await esperar(a, () => /Farolillo del Vecino[\s\S]*De otro mundo[\s\S]*Recibo firmado por su mundo ✓/.test(document.querySelector("#ficha [data-seccion=inventario]")?.textContent ?? ""));
  out.traido = { veredicto: await ctl(a, () => globalThis.__numinia.bienes.presentado()?.motivo), lista: await ctl(a, () => globalThis.__numinia.bienes.lista().map((x) => ({ nombre: x.nombre, ajeno: x.ajeno, verse: x.verse, mundo: x.mundo }))) };
  nota("recibo de confianza traído");

  // 2) «Ver en 3D»: the model turns in the sheet; dragging turns it
  await boton(a, "Farolillo del Vecino", "Ver en 3D");
  await esperar(a, () => !!document.querySelector("#ficha canvas.vitrina"));
  const cv = a.locator("#ficha canvas.vitrina");
  await cv.scrollIntoViewIfNeeded();
  await a.waitForTimeout(2500);
  const caja = await cv.boundingBox();
  await esperar(a, () => Number(document.querySelector("#ficha canvas.vitrina")?.dataset.listo) > 0, null, 15000);
  const giro0 = await ctl(a, () => Number(document.querySelector("#ficha canvas.vitrina").dataset.giro ?? "NaN"));
  await a.mouse.move(caja.x + caja.width * 0.3, caja.y + caja.height / 2); await a.mouse.down();
  await a.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height / 2, { steps: 8 }); await a.mouse.up();
  out.vitrina = { caja: { w: Math.round(caja.width), h: Math.round(caja.height) }, mallas: await ctl(a, () => Number(document.querySelector("#ficha canvas.vitrina").dataset.listo)), giro0, giro: await ctl(a, () => Number(document.querySelector("#ficha canvas.vitrina").dataset.giro)) };
  // the arrow keys turn it too (focus on the canvas)
  await cv.focus(); await a.keyboard.press("ArrowRight");
  out.vitrina.teclado = await ctl(a, () => Number(document.querySelector("#ficha canvas.vitrina").dataset.giro));
  await foto(a, "1-vitrina-pc");
  nota("vitrina");

  // 3) wear it in the hand → B sees it on A; on the head → higher
  await boton(a, "Farolillo del Vecino", "En la mano");
  await esperar(b, (e) => { const p = globalThis.__numinia.view.puestos()[String(e)]; return p && p.cargado && p.dibujado && p.donde === "mano"; }, ea, 15000);
  out.mano = { enB: await puestoEn(b, ea), enA: await ctl(a, () => globalThis.__numinia.view.puestos().self ?? null), pie: await ctl(b, (e) => globalThis.__numinia.session.positionOf?.(e)?.y ?? null, ea) };
  await ctl(a, () => globalThis.__numinia.ficha.cerrar());
  await a.waitForTimeout(400);
  await foto(a, "2-A-en-la-mano"); // A's own third-person view: the lantern in A's hand
  await abrirFicha(a);
  await boton(a, "Farolillo del Vecino", "Sobre la cabeza");
  await esperar(b, (e) => { const p = globalThis.__numinia.view.puestos()[String(e)]; return p?.donde === "cabeza" && p.cargado && p.dibujado && p.y > 1; }, ea);
  out.cabeza = { enB: await puestoEn(b, ea), enA: await ctl(a, () => globalThis.__numinia.view.puestos().self ?? null) };
  await ctl(a, () => globalThis.__numinia.ficha.cerrar());
  await esperar(a, () => { const p = globalThis.__numinia.view.puestos().self; return p?.donde === "cabeza" && p.dibujado && p.y > 1; }, null, 10000);
  out.cabeza.enA = await ctl(a, () => globalThis.__numinia.view.puestos().self ?? null);
  await foto(a, "3-A-sobre-la-cabeza");
  nota("llevado");

  // 4) an UNTRUSTED world's receipt: real, «de otro mundo», not A's here
  await traer(a, fichero(R2, "extrano"));
  await esperar(a, () => globalThis.__numinia.bienes.otros().length === 1);
  await esperar(a, () => /De otro mundo · no es tuyo aquí[\s\S]*Farolillo Extraño/.test(document.querySelector("#ficha [data-seccion=inventario]")?.textContent ?? ""));
  out.extrano = { veredicto: await ctl(a, () => globalThis.__numinia.bienes.presentado()?.motivo), suyos: await ctl(a, () => globalThis.__numinia.bienes.lista().length), otros: await ctl(a, () => globalThis.__numinia.bienes.otros().map((x) => x.nombre)) };
  await a.locator("#ficha .otros-titulo").scrollIntoViewIfNeeded();
  await foto(a, "4-otro-mundo-pc");
  nota("no confiado");

  // 5) the phone: the same receipt is someone else's; its own one, worn on the head, seen by B; the 3D view turned by a finger
  const c = await abrir(true);
  const ec = await ctl(c, () => globalThis.__numinia.session.entity);
  await traer(c, fichero(R1, "vecino"));
  await esperar(c, () => /otra persona/.test(globalThis.__numinia.bienes.presentado()?.motivo ?? ""));
  out.movil = { mismo: await ctl(c, () => globalThis.__numinia.bienes.presentado()?.motivo), suyos: await ctl(c, () => globalThis.__numinia.bienes.lista().length) };
  await traer(c, fichero(R3, "movil"));
  await esperar(c, () => globalThis.__numinia.bienes.lista().some((x) => x.nombre === "Farolillo del Móvil"));
  await boton(c, "Farolillo del Móvil", "Sobre la cabeza", true);
  await esperar(b, (e) => { const p = globalThis.__numinia.view.puestos()[String(e)]; return p && p.cargado && p.donde === "cabeza"; }, ec, 15000);
  await b.waitForTimeout(1500);
  out.movil.enB = await puestoEn(b, ec);
  await boton(c, "Farolillo del Móvil", "Ver en 3D", true);
  await esperar(c, () => !!document.querySelector("#ficha canvas.vitrina"));
  const cvm = c.locator("#ficha canvas.vitrina"); await cvm.scrollIntoViewIfNeeded(); await c.waitForTimeout(2000);
  const bm = await cvm.boundingBox();
  // a finger drag (CDP touch events: the canvas listens to pointer events, which touch produces)
  const cdp = await c.context().newCDPSession(c);
  const y = bm.y + bm.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bm.x + bm.width * 0.2, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bm.x + bm.width * (0.2 + i * 0.08), y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.waitForTimeout(200);
  out.movil.vitrina = { giro: await ctl(c, () => Number(document.querySelector("#ficha canvas.vitrina")?.dataset.giro)), w: Math.round(bm.width), h: Math.round(bm.height), dentro: bm.x >= 0 && bm.x + bm.width <= 390, scrollY: await ctl(c, () => document.querySelector("#ficha")?.scrollTop ?? 0) };
  out.movil.botones = await ctl(c, () => [...document.querySelectorAll("#ficha li.bien .acciones button")].map((x) => Math.round(x.getBoundingClientRect().height)));
  await foto(c, "5-movil-vitrina");
  await ctl(c, () => globalThis.__numinia.ficha.cerrar());
  await esperar(c, () => { const p = globalThis.__numinia.view.puestos().self; return p?.donde === "cabeza" && p.dibujado; }, null, 10000);
  out.movil.propio = await ctl(c, () => globalThis.__numinia.view.puestos().self ?? null);
  await foto(c, "6-movil-cabeza");
  nota("móvil");

  // 6) A leaves: B stops drawing what A wore
  await a.close();
  await esperar(b, (e) => !globalThis.__numinia.view.puestos()[String(e)], ea, 8000);
  out.seFue = true;

  const m = out.mano.enB, h = out.cabeza.enB;
  ok = !!out.emisor && out.traido.lista.some((x) => x.ajeno && x.verse && x.mundo === "vecino.example") && /confía/.test(out.traido.veredicto ?? "")
    && out.vitrina.mallas > 0 && out.vitrina.giro > 0.6 && out.vitrina.teclado > out.vitrina.giro && m?.cargado && m.dibujado && h?.cargado && h.y > m.y + 0.4
    && out.extrano.suyos === 1 && out.extrano.otros[0] === "Farolillo Extraño" && /no confía/.test(out.extrano.veredicto ?? "")
    && out.movil.suyos === 0 && out.movil.enB?.cargado && out.movil.enB.y > 0.5 && out.cabeza.enA?.dibujado && out.movil.vitrina.giro > 0.6 && out.movil.vitrina.dentro && out.movil.botones.every((x) => x >= 36)
    && out.seFue && errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  for (const pg of browser.contexts().flatMap((c) => c.pages())) out.html = [...(out.html ?? []), await pg.evaluate(() => document.querySelector("#ficha [data-seccion=inventario]")?.innerHTML?.slice(0, 1500) ?? "").catch(() => "")];
} finally {
  out.ok = ok;
  console.log(JSON.stringify(out, null, 1));
  await browser.close().catch(() => {});
  for (const { p, log, nombre } of procs) { if (!ok) console.error(`--- ${nombre} ---\n${log().slice(-2500)}`); p.kill("SIGTERM"); }
  rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}
