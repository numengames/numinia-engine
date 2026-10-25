// e2e leg M22b-1 (constructor, touch): the builder's FINGER, two tabs, chromium only (real touches come through CDP
// Input.dispatchTouchEvent, which firefox does not offer). Tab A opens build mode, places a Bloque 3 m ahead through
// the page API (placing with a finger is M22b-2's reticle), then: a tap on the block selects it (and does not turn the
// camera); a one-finger drag of ~300 px moves it over the ground → B sees x/z change ≥ 1 m and the camera's yaw is
// untouched; a tap on the empty ground deselects; Ctrl+Z brings it back for B (one undo step per drag); lote4: two fingers
// (first on the block, second anywhere) turn and scale it, one undo step; it is deleted.
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
    // the right (ux2-dock: entering shows only the dock, at the bottom on a phone; nothing covers the world)
    const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    await a.evaluate(() => { const n = globalThis.__numinia, me = n.session.selfPosition(1); if (document.getElementById("panel-construir").hidden) document.getElementById("construir").click(); n.constructor.colocarEn("bloque", { x: me.x + 1, y: 0, z: me.z - 3 }); });
    await a.waitForFunction((n0) => { const n = globalThis.__numinia; return !!n.constructor.estado.seleccionado && n.session.features.stateOf("objetos").size > n0 && n.view.editor.estado().cargado; }, n0, { timeout: 10000 });
    id = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    await b.waitForFunction((k) => globalThis.__numinia.session.features.stateOf("objetos").has(k), id, { timeout: 5000 }).catch(() => {}); // B hears it a beat later under load
    const o0 = await deB(id);
    paso("abrir y colocar un bloque", !!o0, { id });
    // 2. Esc deselects through the API; a TAP on the block selects it and the camera does not turn
    await a.evaluate(() => globalThis.__numinia.constructor.seleccionar(null));
    await a.waitForFunction(() => document.getElementById("ficha-objeto").hidden, null, { timeout: 3000 }).catch(() => {}); // the card follows on the next frame
    const yaw0 = await a.evaluate(() => globalThis.__numinia.view.cam.yaw());
    let s = await pantalla(id);
    const encima = s && (await a.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, s));
    paso("el bloque está en pantalla y nada lo tapa", !!s && s.x > 0 && s.y > 0 && encima === "CANVAS", { s, encima });
    await toque(a, cdp, s);
    await a.waitForTimeout(300);
    const sel = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    const yaw1 = await a.evaluate(() => globalThis.__numinia.view.cam.yaw());
    paso("un toque selecciona sin girar la cámara", sel === id && Math.abs(yaw1 - yaw0) < 0.01, { sel, yaw0, yaw1 });
    // 2b. ux2-dock on touch: the dock goes to the bottom (44 px tall targets); the card is a sheet just above it (≤ 42 vh), its
    // icon-only buttons with a short visible label (aria-label unchanged), the chosen block still on the canvas above it.
    // «Añadir» rises as a sheet over the dock and the card gives way while it is open (one sheet at a time).
    await a.waitForFunction(() => !document.getElementById("ficha-objeto").hidden, null, { timeout: 4000 });
    const hoja = await a.evaluate(() => {
      const f = document.getElementById("ficha-objeto"), r = f.getBoundingClientRect(), vh = innerHeight, vw = innerWidth, caja = (b) => b.getBoundingClientRect();
      const d = document.getElementById("dock-construir"), rd = d.getBoundingClientRect(), dbs = [...d.querySelectorAll("button")].map((b) => caja(b));
      const ics = [...f.querySelectorAll(".acciones button")].filter((b) => !b.hidden);
      const et = [...f.querySelectorAll(".acciones button.ic")].filter((b) => !b.hidden).map((b) => ({ aria: b.getAttribute("aria-label"), corta: b.querySelector(".et")?.textContent ?? "", visible: getComputedStyle(b.querySelector(".et")).display !== "none" }));
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh, vw, alto: r.height, dockTop: rd.top, dockBottom: rd.bottom, dockAlto: Math.min(...dbs.map((x) => x.height)), dockAncho: Math.min(...dbs.map((x) => x.width)), dockCabe: rd.left >= 0 && rd.right <= vw && d.scrollWidth <= d.clientWidth + 1,
        accMin: Math.min(...ics.map((b) => caja(b).height)), et, desborda: document.documentElement.scrollWidth > vw };
    });
    // above the chat line (52 px + margins), every icon 44 px tall and ≥ 36 px wide, the nine of them inside a 412 px screen
    paso("táctil: el dock va abajo, entero, con objetivos de 44 px de alto", hoja.dockBottom > hoja.vh - 100 && hoja.dockAlto >= 44 && hoja.dockAncho >= 36 && hoja.dockCabe, { dockTop: hoja.dockTop, dockBottom: hoja.dockBottom, dockAlto: hoja.dockAlto, dockAncho: hoja.dockAncho, dockCabe: hoja.dockCabe, vh: hoja.vh });
    paso("táctil: la tarjeta es una hoja sobre el dock (≤ 42 vh)", hoja.left <= 8 && hoja.right >= hoja.vw - 8 && hoja.alto <= hoja.vh * 0.42 + 1 && hoja.bottom <= hoja.dockTop && !hoja.desborda, { top: hoja.top, bottom: hoja.bottom, alto: hoja.alto, vh: hoja.vh, vw: hoja.vw, dockTop: hoja.dockTop });
    paso("táctil: botones de la tarjeta ≥ 44 px, etiqueta corta visible y aria-label intacto", hoja.accMin >= 44 && hoja.et.length >= 2 && hoja.et.every((e) => e.visible && e.corta !== "" && e.aria.length > e.corta.length), { accMin: hoja.accMin, et: hoja.et.map((e) => `${e.corta}|${e.aria}`) });
    const libre = await pantalla(id);
    const tapa = libre && (await a.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, libre));
    paso("táctil: la hoja no tapa el objeto elegido", !!libre && libre.y < hoja.top && tapa === "CANVAS", { libre, top: hoja.top, tapa });
    if (process.env.CAPTURA) await a.screenshot({ path: process.env.CAPTURA });
    const centroDe = (sel) => a.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    await toque(a, cdp, await centroDe("#dock-anadir"));
    await a.waitForTimeout(250);
    const sube = await a.evaluate(() => { const c = document.getElementById("cajon-anadir"), r = c.getBoundingClientRect(), d = document.getElementById("dock-construir").getBoundingClientRect();
      return { abierto: !c.hidden, alto: r.height, vh: innerHeight, encima: r.bottom <= d.top + 1, fichaVisible: getComputedStyle(document.getElementById("ficha-objeto")).display !== "none" }; });
    if (process.env.CAPTURA_CAJON) await a.screenshot({ path: process.env.CAPTURA_CAJON });
    await toque(a, cdp, await centroDe("#dock-anadir"));
    await a.waitForTimeout(250);
    const baja = await a.evaluate(() => ({ cerrado: document.getElementById("cajon-anadir").hidden, fichaVisible: getComputedStyle(document.getElementById("ficha-objeto")).display !== "none" }));
    paso("táctil: «Añadir» sube como hoja sobre el dock y la tarjeta le cede el sitio", sube.abierto && sube.encima && sube.alto <= sube.vh * 0.5 + 1 && !sube.fichaVisible && baja.cerrado && baja.fichaVisible, { sube, baja });
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
    // 5b. lote4 (M22b-2): two fingers. The first rests on the block, the second joins 120 px to its right; the second then
    // swings a quarter turn clockwise on the screen and out to 1.25x the distance → the block turns (yaw down by 90°) and
    // grows 1.25x, B sees it, and ONE undo brings both back.
    const dosDedos = async (c, p1, p2a, p2b, n = 14) => {
      const pts = (a1, b1) => [{ x: a1.x, y: a1.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }, ...(b1 ? [{ x: b1.x, y: b1.y, radiusX: 8, radiusY: 8, force: 1, id: 2 }] : [])];
      await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(p1) });
      await a.waitForTimeout(80);
      await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(p1, p2a) });
      await a.waitForTimeout(80);
      for (let i = 1; i <= n; i++) {
        const t = i / n, ang = (Math.PI / 2) * t, rad = 120 + 30 * t;
        await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(p1, { x: p1.x + rad * Math.cos(ang), y: p1.y + rad * Math.sin(ang) }) });
        await a.waitForTimeout(35);
      }
      await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    s = await pantalla(id);
    await toque(a, cdp, s);
    await a.waitForTimeout(300);
    const antes2 = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), id);
    const dedo2 = { x: s.x + 120, y: s.y };
    const libre2 = await a.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, dedo2);
    paso("dos dedos: el segundo dedo cae sobre el mundo", libre2 === "CANVAS", { dedo2, libre2 });
    await dosDedos(cdp, s, dedo2, null);
    await a.waitForTimeout(600);
    const dos = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), id);
    const yawC = await a.evaluate(() => globalThis.__numinia.view.cam.yaw());
    const girado = Math.abs((((dos.ry - antes2.ry + 90) % 360) + 540) % 360 - 180) < 3; // -90° (clockwise fingers turn the thing clockwise seen from above)
    paso("dos dedos: girar los dedos 90° gira el objeto 90°; separarlos lo escala 1,25", girado && Math.abs(dos.sx / antes2.sx - 1.25) < 0.04 && Math.abs(dos.sy / antes2.sy - 1.25) < 0.04 && Math.abs(yawC - yaw0) < 0.01, { antes: antes2, dos, yawC });
    paso("dos dedos: llega a B", await esperaB(([k, w]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.sx - w.sx) < 0.011 && Math.abs(o.ry - w.ry) < 0.11; }, id, dos), { dos });
    paso("dos dedos: el gesto terminó (nada sostenido)", await a.evaluate(() => globalThis.__numinia.view.editor.estado().sostenido === null));
    await a.evaluate(() => globalThis.__numinia.constructor.deshacer());
    paso("dos dedos: un solo deshacer devuelve giro y tamaño a B", await esperaB(([k, w]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.sx - w.sx) < 0.011 && Math.abs(o.ry - w.ry) < 0.11; }, id, { sx: antes2.sx, ry: antes2.ry }));
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
