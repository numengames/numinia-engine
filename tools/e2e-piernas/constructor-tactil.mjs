// e2e leg M22b-1 (constructor, touch): the builder's FINGER, two tabs, chromium only (real touches come through CDP
// Input.dispatchTouchEvent, which firefox does not offer). Tab A opens build mode, places a Bloque 3 m ahead through
// the page API (placing with a finger is M22b-2's reticle), then: a tap on the block selects it (and does not turn the
// camera); a one-finger drag of ~300 px moves it over the ground → B sees x/z change ≥ 1 m and the camera's yaw is
// untouched; a tap on the empty ground deselects; Ctrl+Z brings it back for B (one undo step per drag); it is deleted.
// Env: BASE, SERVER_HTTP (tools/auto.sh e2e), SHOTS=1 screenshots.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1) ?? "";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

/** One finger: down at `from`, `n` moves towards `to`, up. `cdp` is a CDPSession of the page. */
async function dedo(p, cdp, from, to, n = 12, ms = 30) {
  const pt = (x, y) => [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= n; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(from.x + ((to.x - from.x) * i) / n, from.y + ((to.y - from.y) * i) / n) });
    await p.waitForTimeout(ms);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const toque = (p, cdp, at) => dedo(p, cdp, at, at, 1, 60);

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const [VW, VH] = (process.env.VISTA ?? "420x800").split("x").map(Number); // C5: VISTA=360x740 for the small phone
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors = [];
  await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, JSON.parse((await import("node:fs")).readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version); // the «what is new» card shows once per version in a fresh browser and would cover the world (see constructor.mjs)
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.constructor.estado.puede, null, { timeout: 30000 });
    return p;
  };
  const r = { engine: "chromium-touch", ok: false, pasos: [] };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  const deB = (k) => b.evaluate((k) => globalThis.__numinia.session.features.stateOf("objetos").get(k) ?? null, k);
  const esperaB = (fn, k, arg) => b.waitForFunction(fn, [k, arg], { timeout: 8000 }).then(() => true, () => false);
  const pantalla = (k) => a.evaluate((k) => { const n = globalThis.__numinia, d = n.view.editor.dondeEsta(k); return d && n.view.editor.pantalla(d.x, d.y + 0.5, d.z); }, k);
  let a, b, id = "";
  try {
    a = await open(); b = await open();
    r.backend = await a.evaluate(() => globalThis.__numinia.view.backend);
    await a.bringToFront();
    const cdp = await ctx.newCDPSession(a);
    // 1. build mode (the page API: the C key needs a keyboard), a Bloque placed through the API 3 m ahead and 1 m to
    // the right: on a 420 px phone the environment panel (#panel-entorno, 270 px, left) covers the left half of the
    // world while building; M22b-1 folds both into strips, the rest (sheets) is M22b-2 / U24
    const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    await a.evaluate(() => { const n = globalThis.__numinia, me = n.session.selfPosition(1); if (document.getElementById("panel-construir").hidden) document.getElementById("construir").click(); n.constructor.colocarEn("bloque", { x: me.x + 1, y: 0, z: me.z - 3 }); });
    await a.waitForFunction((n0) => { const n = globalThis.__numinia; return !!n.constructor.estado.seleccionado && n.session.features.stateOf("objetos").size > n0 && n.view.editor.estado().cargado; }, n0, { timeout: 10000 });
    id = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    const o0 = await deB(id);
    paso("abrir y colocar un bloque", !!o0, { id });
    // 2. Esc deselects through the API; a TAP on the block selects it and the camera does not turn
    await a.evaluate(() => globalThis.__numinia.constructor.seleccionar(null));
    const yaw0 = await a.evaluate(() => globalThis.__numinia.view.cam.yaw());
    let s = await pantalla(id);
    const encima = s && (await a.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, s));
    paso("el bloque está en pantalla y nada lo tapa", !!s && s.x > 0 && s.y > 0 && encima === "CANVAS", { s, encima });
    await toque(a, cdp, s);
    await a.waitForTimeout(300);
    const sel = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    const yaw1 = await a.evaluate(() => globalThis.__numinia.view.cam.yaw());
    paso("un toque selecciona sin girar la cámara", sel === id && Math.abs(yaw1 - yaw0) < 0.01, { sel, yaw0, yaw1 });
    // 2b. C5: the card is a bottom sheet — full width, ≤ 46 vh, 5-column grid of ≥ 44 px icons each with a short visible label (aria-label
    // unchanged), tabs across the whole width, the chosen block still on the canvas above it; a long press on «Borrar» says its title
    // under the bar and does NOT delete; a short tap still presses.
    await a.waitForFunction(() => !document.getElementById("ficha-objeto").hidden, null, { timeout: 4000 });
    const hoja = await a.evaluate(() => {
      const f = document.getElementById("ficha-objeto"), r = f.getBoundingClientRect(), vh = innerHeight, vw = innerWidth;
      const ics = [...f.querySelectorAll("button.ic")].filter((b) => !b.hidden), caja = (b) => b.getBoundingClientRect();
      const et = ics.map((b) => ({ aria: b.getAttribute("aria-label"), corta: b.querySelector(".et")?.textContent ?? "", visible: getComputedStyle(b.querySelector(".et")).display !== "none", w: caja(b).width, h: caja(b).height, x: Math.round(caja(b).left), y: Math.round(caja(b).top) }));
      const fila1 = et.filter((e) => e.y === et[0].y).length, tabs = [...f.querySelectorAll(".pestanas button")].map((b) => caja(b));
      const tr = f.querySelector(".pestanas").getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh, vw, alto: r.height, et, fila1, tabsW: tabs.reduce((s, t) => s + t.width, 0), tabsMin: Math.min(...tabs.map((t) => t.height)), barraW: tr.width, desborda: document.documentElement.scrollWidth > vw };
    });
    paso("C5: la ficha es una hoja inferior (ancho completo, ≤ 46 vh)", hoja.left === 0 && Math.round(hoja.right) === hoja.vw && hoja.alto <= hoja.vh * 0.46 + 1 && Math.round(hoja.bottom) === hoja.vh && !hoja.desborda, { top: hoja.top, alto: hoja.alto, vh: hoja.vh, vw: hoja.vw });
    paso("C5: rejilla de 5 columnas, objetivos ≥ 44 px, etiqueta corta visible y aria-label intacto", hoja.fila1 === 5 && hoja.et.every((e) => e.w >= 44 && e.h >= 44 && e.visible && e.corta !== "" && e.aria !== e.corta && e.aria.length > e.corta.length), { fila1: hoja.fila1, et: hoja.et.map((e) => `${e.corta}|${e.aria}|${Math.round(e.w)}x${Math.round(e.h)}`) });
    paso("C5: las pestañas ocupan todo el ancho y miden ≥ 44 px", Math.abs(hoja.tabsW - hoja.barraW) <= 6 && hoja.tabsMin >= 44, { tabsW: hoja.tabsW, barraW: hoja.barraW, tabsMin: hoja.tabsMin });
    const libre = await pantalla(id);
    const tapa = libre && (await a.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, libre));
    paso("C5: la hoja no tapa el objeto elegido", !!libre && libre.y < hoja.top && tapa === "CANVAS", { libre, top: hoja.top, tapa });
    const iconoBorrar = await a.evaluate(() => { const b = document.querySelector('#ficha-objeto button.peligro'), r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: iconoBorrar.x, y: iconoBorrar.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
    await a.waitForTimeout(700); // past LARGA_MS
    const pista = await a.evaluate(() => { const p = document.getElementById("ficha-pista"); return { oculta: p.hidden, texto: p.textContent, visible: getComputedStyle(p).display !== "none", rol: p.getAttribute("role"), top: document.getElementById("ficha-objeto").getBoundingClientRect().top, alto: document.getElementById("ficha-objeto").getBoundingClientRect().height, vh: innerHeight }; });
    if (process.env.CAPTURA) await a.screenshot({ path: process.env.CAPTURA }); // while the finger rests: the title line is showing
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await a.waitForTimeout(250);
    const sigue = await deB(id);
    paso("C5: pulsación larga sobre «Borrar» dice su título completo y no borra", !pista.oculta && pista.visible && pista.texto.startsWith("Borrar (Supr") && pista.rol === "status" && !!sigue, { pista, sigue: !!sigue });
    paso("C5: con la línea del título la hoja sigue ≤ 46 vh y sin tapar el objeto", pista.alto <= pista.vh * 0.46 + 1 && libre.y < pista.top, { top: pista.top, alto: pista.alto, y: libre.y });
    const fijo0 = !!(await deB(id)).fijado;
    const iconoFijar = await a.evaluate(() => { const b = [...document.querySelectorAll('#ficha-objeto button.ic')].find((x) => /^(Anclar|Soltar)/.test(x.getAttribute("aria-label"))), r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await toque(a, cdp, iconoFijar);
    const anclado = await esperaB(([k, v]) => !!globalThis.__numinia.session.features.stateOf("objetos").get(k)?.fijado === v, id, !fijo0);
    paso("C5: un toque corto sobre «Anclar» sigue pulsando (B lo ve anclado)", anclado);
    await a.waitForTimeout(300);
    await toque(a, cdp, iconoFijar); // loose again, so the drag below can move it
    paso("C5: y otro toque lo suelta", await esperaB(([k, v]) => !!globalThis.__numinia.session.features.stateOf("objetos").get(k)?.fijado === v, id, fijo0));
    // 3. one finger drags the block ~300 px to the right → it moves ≥ 1 m for B; the camera's yaw stays; the drag ran (busy)
    s = await pantalla(id);
    const antes = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), id);
    const t0 = Date.now();
    let sostenido = false;
    const vigila = a.waitForFunction(() => globalThis.__numinia.view.editor.estado().sostenido !== null && globalThis.__numinia.view.busy(), null, { timeout: 2000 }).then(() => { sostenido = true; }, () => {});
    await dedo(a, cdp, s, { x: s.x + 150, y: s.y - 60 }, 14, 35);
    await vigila;
    await a.waitForTimeout(500);
    const despues = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), id);
    const movido = Math.hypot(despues.x - antes.x, despues.z - antes.z);
    const enB = await esperaB(([k, w]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - w.x) < 0.01 && Math.abs(o.z - w.z) < 0.01; }, id, despues);
    const yaw2 = await a.evaluate(() => globalThis.__numinia.view.cam.yaw());
    const o1 = await deB(id);
    paso("arrastrar con el dedo lo mueve y llega a B", enB && movido >= 1 && Math.abs(yaw2 - yaw0) < 0.01 && sostenido && !(await a.evaluate(() => globalThis.__numinia.view.editor.estado().arrastrando)), { movido: Math.round(movido * 100) / 100, ms: Date.now() - t0, sostenido, yaw2, enB: o1 && { x: o1.x, z: o1.z } });
    paso("sin asas en «mover» táctil", (await a.evaluate(() => globalThis.__numinia.view.editor.estado().herramienta)) === null);
    // 4. a tap on empty ground deselects
    // ground 1.5 m nearer and 1.5 m left of the block, inside the 420 px screen, with nothing under it
    const vacio = await a.evaluate((k) => { const n = globalThis.__numinia, d = n.view.editor.dondeEsta(k), s = n.view.editor.pantalla(d.x - 1.5, 0, d.z + 1.5); return s && s.x > 20 && s.x < 400 && s.y > 60 && s.y < 480 && n.view.editor.pick(s.x, s.y) === null && document.elementFromPoint(s.x, s.y)?.tagName === "CANVAS" ? s : null; }, id);
    if (vacio) {
      await toque(a, cdp, vacio);
      await a.waitForTimeout(300);
      const sel2 = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
      paso("un toque en el vacío deselecciona", !sel2, { sel: sel2, vacio, encima: await a.evaluate((v) => document.elementFromPoint(v.x, v.y)?.tagName, vacio), aviso: await a.evaluate(() => document.querySelector("#panel-construir .estado")?.textContent) });
    } else r.pasos.push({ paso: "un toque en el vacío deselecciona", ok: true, saltado: "no hay suelo vacío en pantalla" });
    // 5. undo (API) brings it back where it was, B sees it (one step per drag)
    await a.evaluate(() => globalThis.__numinia.constructor.deshacer());
    const vuelto = await esperaB(([k, w]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - w.x) < 0.01 && Math.abs(o.z - w.z) < 0.01; }, id, o0);
    paso("deshacer devuelve el arrastre en B", vuelto);
    if (process.env.SHOTS === "1") await a.screenshot({ path: "e2e-constructor-tactil.png" });
    // 6. delete through the API; B sees it gone
    await a.evaluate((k) => { const c = globalThis.__numinia.constructor; c.seleccionar(k); c.borrar(); }, id);
    paso("borrar para todos", await esperaB(([k]) => !globalThis.__numinia.session.features.stateOf("objetos").has(k), id));
    id = "";
    r.ok = errors.length === 0;
  } catch (e) {
    r.error = String(e).split("\n")[0].slice(0, 300);
  } finally {
    if (id && a) await a.evaluate((k) => { const c = globalThis.__numinia.constructor; c.seleccionar(k); c.borrar(); }, id).catch(() => {});
    r.errors = errors;
    await browser.close();
  }
  return r;
}

const resultados = [await pierna()];
const ok = resultados.every((x) => x.ok);
console.log(JSON.stringify(resultados, null, 1));
console.log(ok ? "E2E CONSTRUCTOR-TACTIL OK" : "E2E CONSTRUCTOR-TACTIL FALLA");
process.exit(ok ? 0 : 1);
