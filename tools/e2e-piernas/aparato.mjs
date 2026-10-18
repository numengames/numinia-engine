// e2e leg U25 (device profile): on a desktop tab, ?aparato=movil-vertical draws the world inside a 390×844 frame
// (the outer page starts no view and no connection) and the framed copy lays out the touch HUD (html.tactil, «Saltar»,
// interfazTactil, a phone-size window); ?aparato=movil-horizontal frames 844×390; the plain page keeps the desktop HUD;
// a touch phone forced to ?aparato=escritorio drops the touch HUD. Forcing works because the e2e page is vite dev.
// Usage (tools/auto.sh e2e runs it): BASE=http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8792 node tools/e2e-piernas/aparato.mjs
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const ENGINE = process.env.BROWSER ?? "chromium";
const browser = await (ENGINE === "firefox" ? firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }) : chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }));
const errors = [];
const con = (extra) => { const u = new URL(BASE); for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v); return u.toString(); };
const listo = () => globalThis.__numinia?.probe?.done && globalThis.__numinia.session.entity >= 0 && (globalThis.__numinia.carga?.estado ?? "listo") === "listo";
const open = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  return p;
};
/** What the layout looks like from inside a page (or the framed copy). */
const como = (f) => f.evaluate(() => ({
  clase: document.documentElement.dataset.aparato, tactil: document.documentElement.classList.contains("tactil"),
  saltar: !!document.getElementById("saltar"), ancho: innerWidth, alto: innerHeight,
  caps: (({ aparato, aparatoForzado, interfazTactil, pantallaPequena, movil, desarrollo }) => ({ aparato, aparatoForzado, interfazTactil, pantallaPequena, movil, desarrollo }))(globalThis.__numinia.capacidades ?? {}),
  ajuste: ((v) => (v ? { valor: v.valor, visible: v.visible, forzado: v.forzado } : null))(globalThis.__numinia.ajustes?.lista?.().find((v) => v.id === "interfaz.aparato")),
}));
const checks = {};
const ok = (k, v, data) => { checks[k] = { ok: !!v, ...data }; };

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // ---- desktop, as it comes ----
  const pc = await open(ctx, BASE);
  await pc.waitForFunction(listo, null, { timeout: 60000 });
  const normal = await como(pc);
  ok("escritorio: HUD de escritorio, sin marco", normal.clase === "escritorio" && !normal.tactil && !normal.saltar && (await pc.$("iframe")) === null && normal.caps.aparatoForzado === false, normal);
  ok("escritorio: el ajuste «Aparato (desarrollo)» se ve en desarrollo", normal.ajuste?.visible === true && normal.ajuste?.valor === "auto", { ajuste: normal.ajuste });
  await pc.close();

  // ---- desktop, forced phone upright: a 390×844 frame; inside it the touch HUD ----
  const mv = await open(ctx, con({ aparato: "movil-vertical" }));
  await mv.waitForFunction(() => !!globalThis.__numinia?.marco, null, { timeout: 30000 });
  const fuera = await mv.evaluate(() => ({ marco: globalThis.__numinia.marco, canvas: document.querySelectorAll("canvas").length, iframes: document.querySelectorAll("iframe").length, caja: (() => { const r = document.querySelector(".marco-caja").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left + r.width / 2) }; })() }));
  ok("movil-vertical: la página de fuera es solo un marco 390×844 centrado (sin mundo propio)", fuera.marco.ancho === 390 && fuera.marco.alto === 844 && fuera.canvas === 0 && fuera.iframes === 1 && Math.abs(fuera.caja.x - 640) <= 2, fuera);
  const frame = mv.frames().find((f) => f !== mv.mainFrame());
  await frame.waitForFunction(listo, null, { timeout: 60000 });
  const dentro = await como(frame);
  ok("movil-vertical: dentro del marco, HUD táctil a 390×844", dentro.clase === "movil-vertical" && dentro.tactil && dentro.saltar && dentro.ancho === 390 && dentro.alto === 844 && dentro.caps.interfazTactil === true && dentro.caps.pantallaPequena === true && dentro.caps.movil === true && dentro.caps.aparatoForzado === true, dentro);
  ok("movil-vertical: el menú dice que lo forzó la dirección", dentro.ajuste?.valor === "movil-vertical" && dentro.ajuste?.forzado === true, { ajuste: dentro.ajuste });
  await mv.close();

  // ---- desktop, forced phone on its side: 844×390 ----
  const mh = await open(ctx, con({ aparato: "movil-horizontal" }));
  await mh.waitForFunction(() => !!globalThis.__numinia?.marco, null, { timeout: 30000 });
  const fh = mh.frames().find((f) => f !== mh.mainFrame());
  await fh.waitForFunction(listo, null, { timeout: 60000 });
  const lado = await como(fh);
  ok("movil-horizontal: marco 844×390 con HUD táctil", lado.clase === "movil-horizontal" && lado.saltar && lado.ancho === 844 && lado.alto === 390, lado);
  await mh.close();

  // ---- the setting: choosing «Móvil vertical» in the menu reloads into the frame; the frame's «auto» link leaves it ----
  const aj = await open(ctx, BASE);
  await aj.waitForFunction(listo, null, { timeout: 60000 });
  await Promise.all([aj.waitForURL(/aparato=movil-vertical/, { timeout: 30000 }), aj.evaluate(() => globalThis.__numinia.ajustes.set("interfaz.aparato", "movil-vertical"))]);
  await aj.waitForFunction(() => !!globalThis.__numinia?.marco, null, { timeout: 30000 });
  ok("ajuste: elegir «Móvil vertical» recarga dentro del marco", true, { url: aj.url() });
  await Promise.all([aj.waitForURL(/aparato=auto/, { timeout: 30000 }), aj.click(".marco-barra a:text-is('auto')")]);
  await aj.waitForFunction(listo, null, { timeout: 60000 });
  const vuelta = await como(aj);
  ok("marco: el enlace «auto» vuelve al escritorio aunque el ajuste guarde un móvil", vuelta.clase === "escritorio" && (await aj.$("iframe")) === null && vuelta.ajuste?.valor === "auto" && vuelta.ajuste?.forzado === true, vuelta);
  await aj.close();
  await ctx.close();

  // ---- a real touch phone forced to the desktop profile: no frame, no touch HUD ----
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const te = await open(tel, con({ aparato: "escritorio" }));
  await te.waitForFunction(listo, null, { timeout: 60000 });
  const tesc = await como(te);
  ok("móvil forzado a escritorio: sin marco ni HUD táctil", tesc.clase === "escritorio" && !tesc.tactil && !tesc.saltar && (await te.$("iframe")) === null, tesc);
  await tel.close();
} catch (e) {
  ok("sin excepción", false, { error: String(e?.stack ?? e).slice(0, 600) });
}
ok("sin errores de página", errors.length === 0, { errors: errors.slice(0, 5) });
await browser.close();
const todo = Object.values(checks).every((c) => c.ok);
console.log(JSON.stringify({ leg: "aparato", ok: todo, checks }, null, 1));
process.exit(todo ? 0 : 1);
