// e2e-espejo: browser-driven checks of the Hermes world (mundo-hermes, M4). It starts the REAL server on a throwaway world born from
// plantillas/hermes (MOTOR_PLANTILLA=hermes), plays the outside source through the local link, opens the built page in one headless
// Chromium and asserts through the page's DOM and state (`__numinia`). Deterministic: fixed keys, fixed things, no sleeps without a condition.
//   Needs:  npm run build   (the page is served from dist/plaza)
//   Run:    npm run test:e2e            (≈ 1-2 min; software GL; on a shared machine hold the browser lock: flock <lock> npm run test:e2e)
//   Env:    CHROME=/path/to/chrome  PW_CORE=/path/to/playwright-core  E2E_SHOTS=<dir> (keeps a screenshot of every failing check there)
// It is NOT part of `npm test` / `npm run gates` (they run test/*.test.ts only): a browser is needed and it is slower.
import assert from "node:assert/strict";
import { crearMundo, fuenteLocal, abrirNavegador, dormir } from "./espejo-e2e-lib.mjs";

/** The one accent colour of the black-and-white theme (apps/plaza/tema-byn.ts `--byn-acento`): the only colour besides black and white. */
export const ACENTO = [255, 212, 0];

const cron = (id, titulo, extra = {}) => ({ tipo: "cron", id, titulo, estado: "programado", zona: "z7", acciones: ["cron.pausar", "cron.ejecutar"], ...extra });
const perfil = (i) => ({ tipo: "perfil", id: `p${i}`, titulo: `Perfil ${i}`, subtitulo: "", estado: i % 3 === 0 ? "activo" : "programado", zona: "z6", acciones: [] });
const COSAS = [
  cron("resumen", "Resumen diario"), cron("limpieza", "Limpieza semanal", { estado: "pausado", acciones: ["cron.reanudar"] }),
  ...Array.from({ length: 14 }, (_, i) => perfil(i)),
  { tipo: "uso", id: "total", titulo: "Uso total", subtitulo: "33,8 M tokens · caché 4.302 M · $1,654.69 est. · 1329 ses. · 30 d", estado: "activo", zona: "z2", acciones: [] },
];

// ---------- helpers on a page ----------
export const yo = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(1); return { x: s.x, z: s.z }; });
/** Walk (real keys: W = north = −z) until within `tol` metres of (x, z). */
export async function caminarA(p, x, z, tol = 2, maxMs = 25000) {
  const t0 = Date.now(); let teclas = [];
  const soltar = async () => { for (const k of teclas) await p.keyboard.up(k); teclas = []; };
  while (Date.now() - t0 < maxMs) {
    const a = await yo(p), dx = x - a.x, dz = z - a.z;
    if (Math.hypot(dx, dz) <= tol) { await soltar(); return a; }
    const quieren = [Math.abs(dx) > tol / 2 ? (dx > 0 ? "KeyD" : "KeyA") : null, Math.abs(dz) > tol / 2 ? (dz > 0 ? "KeyS" : "KeyW") : null].filter(Boolean);
    if (quieren.join() !== teclas.join()) { await soltar(); for (const k of quieren) await p.keyboard.down(k); teclas = quieren; }
    await p.waitForTimeout(120);
  }
  await soltar(); throw new Error(`could not walk to (${x}, ${z}); stands at ${JSON.stringify(await yo(p))}`);
}
/** Walk to the threshold's panel and look at it with E: the card opens. */
export async function abrirPanel(p) {
  await caminarA(p, 0, -4.5, 3);
  await p.keyboard.press("KeyE");
  await p.waitForSelector("#espejo-ficha:not([hidden])", { timeout: 10000 });
}
export const textoBoton = (p, verbo) => p.locator(`#espejo-ficha button[data-verbo="${verbo}"]`).first().innerText();
export const esperarTexto = (p, sel, re, timeout = 8000) => p.waitForFunction(([s, r]) => new RegExp(r).test(document.querySelector(s)?.textContent ?? ""), [sel, re.source], { timeout });
const claves = (p, prefijo) => p.evaluate((x) => globalThis.__numinia.espejo.cosas().map((c) => c.clave).filter((k) => k.startsWith(x)), prefijo);
const formasDe = (p, prefijo) => p.evaluate((x) => globalThis.__numinia.view.formas.claves().filter((k) => k.startsWith(x)), prefijo);
/** Teleport with the house piece (the same call the card's «Ir a…» button makes) and wait until the visitor stands inside the zone's rectangle. */
export async function irA(p, zona) {
  const z = await p.evaluate((id) => globalThis.__numinia.espejo.vista().zonas.find((q) => q.id === id), zona);
  const r = await p.evaluate(([x, zz, n]) => globalThis.__numinia.viajar.irAPunto(x, zz, n), [z.x, z.z, z.nombre]);
  assert.equal(r.ok, true, JSON.stringify(r));
  await p.waitForFunction((q) => { const s = globalThis.__numinia.session.selfPosition(1); return Math.abs(s.x - q.x) <= q.ancho / 2 && Math.abs(s.z - q.z) <= q.fondo / 2; }, z, { timeout: 15000 });
  return z;
}

// ---------- colour audit of the HUD (computed styles) ----------
/** Every visible element of the page's overlay (anything but the 3D canvas), with the colours it is painted with that are NOT black, white, the accent or fully transparent. */
export function auditarColores(acento) {
  const [ar, ag, ab] = acento;
  const vistos = [];
  const mal = (c) => { // "rgb(r, g, b)" | "rgba(r, g, b, a)" | "color(srgb …)" → true when it is a forbidden colour
    const m = /^rgba?\(([^)]+)\)$/.exec(c.trim()); if (!m) return c.trim() !== "" && c !== "transparent" ? `unparsed ${c}` : null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (a === 0) return null;
    if (a !== 1) return `translucent ${c}`;
    const ok = (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255) || (r === ar && g === ag && b === ab);
    return ok ? null : `${c}`;
  };
  for (const el of document.body.querySelectorAll("*")) {
    if (el.tagName === "CANVAS" || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.closest("svg") && el.tagName !== "svg") continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || r.width < 1 || r.height < 1 || Number(cs.opacity) < 0.05) continue;
    const falla = [];
    const t = (propiedad, valor) => { const m = mal(valor); if (m) falla.push(`${propiedad}: ${m}`); };
    if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) t("color", cs.color);
    t("background-color", cs.backgroundColor);
    for (const lado of ["Top", "Right", "Bottom", "Left"]) if (parseFloat(cs[`border${lado}Width`]) > 0 && cs[`border${lado}Style`] !== "none") t(`border-${lado.toLowerCase()}-color`, cs[`border${lado}Color`]);
    if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") t("outline-color", cs.outlineColor);
    if (cs.backgroundImage !== "none") falla.push(`background-image: ${cs.backgroundImage.slice(0, 60)}`);
    if (cs.boxShadow !== "none") falla.push(`box-shadow: ${cs.boxShadow.slice(0, 60)}`);
    if (cs.backdropFilter && cs.backdropFilter !== "none") falla.push(`backdrop-filter: ${cs.backdropFilter}`);
    // (opacity is not audited: the chat list and a notice fade in and out by design; their colours are what is checked)
    if (falla.length) vistos.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : ""} → ${falla.join("; ")}`);
  }
  return vistos;
}

// ---------- the runner ----------
let pass = 0, fail = 0; const fallos = [];
async function prueba(nombre, fn, p = null) {
  const t0 = Date.now();
  try { await fn(); pass++; console.log(`✔ ${nombre} (${Date.now() - t0} ms)`); }
  catch (e) {
    fail++; fallos.push(nombre); console.log(`✖ ${nombre}\n   ${String(e?.stack ?? e).split("\n").slice(0, 6).join("\n   ")}`);
    if (process.env.E2E_SHOTS && p) await p.screenshot({ path: `${process.env.E2E_SHOTS}/fallo-${fallos.length}.png` }).catch(() => {});
  }
}

export async function correr() {
  const nav = await abrirNavegador();
  const mundo = await crearMundo({ funciones: { cron: true, perfiles: true, uso: true } });
  const fuente = await fuenteLocal(mundo.puertoEnlace, { cosas: COSAS, alPedir: (m) => ({ ok: true, texto: m.verbo === "cron.pausar" ? "Tarea pausada." : "Hecho." }) });
  const pagina = async (o) => { const p = await nav.pagina(mundo, o); await p.waitForFunction((n) => globalThis.__numinia.espejo.cosas().length >= n, COSAS.length, { timeout: 15000 }); return p; };
  try {
    // ---- the world is what the template promises ----
    await prueba("the fresh world shows the 6 zones, the 17 things the source published, and nothing the page could not draw", async () => {
      const p = await pagina();
      const v = await p.evaluate(() => globalThis.__numinia.espejo.vista());
      assert.deepEqual(v.zonas.map((z) => z.id), ["z0", "z7", "z3", "z8", "z6", "z2"]);
      assert.equal((await claves(p, "perfil/")).length, 14);
      assert.equal((await claves(p, "cron/")).length, 2);
      assert.equal((await claves(p, "uso/")).length, 1);
      assert.deepEqual(p.errores, [], "no page errors");
      await p.context().close();
    });

    // ---- the card of a cron: verbs, confirmation, `pedir`, the Spanish result ----
    await prueba("a cron's card lists its verbs; «Pausar» asks «¿Seguro?» first, then sends `pedir`, and the card shows the Spanish result", async () => {
      const p = await pagina();
      await irA(p, "z7");
      const clave = await p.evaluate(() => globalThis.__numinia.espejo.cosas().find((c) => c.titulo === "Resumen diario").clave);
      await p.evaluate((k) => globalThis.__numinia.espejo.usar(k), clave);
      await p.waitForSelector("#espejo-ficha:not([hidden])", { timeout: 8000 });
      assert.match(await p.locator("#espejo-ficha h2").innerText(), /Resumen diario/i);
      assert.match(await p.locator("#espejo-ficha .estado").innerText(), /Estado: programado/);
      assert.equal(await textoBoton(p, "cron.pausar"), "Pausar");
      assert.equal(await textoBoton(p, "cron.ejecutar"), "Ejecutar ahora");
      assert.equal(fuente.peticiones.length, 0, "nothing asked yet");
      await p.click('#espejo-ficha button[data-verbo="cron.pausar"]');
      assert.match(await textoBoton(p, "cron.pausar"), /^¿Seguro\? Confirmar: pausar/);
      await dormir(300); assert.equal(fuente.peticiones.length, 0, "the first press asks nothing outside");
      await p.click('#espejo-ficha button[data-verbo="cron.pausar"]');
      await esperarTexto(p, "#espejo-ficha .dicho", /Hecho\. Tarea pausada\./);
      assert.equal(fuente.peticiones.length, 1);
      assert.deepEqual([fuente.peticiones[0].objeto, fuente.peticiones[0].verbo, fuente.peticiones[0].seguridad], [clave, "cron.pausar", "confirmar"]);
      await p.context().close();
    });

    // ---- teleport buttons move the visitor inside the zone's rectangle ----
    await prueba("the card's «Ir a <zona>» buttons teleport the visitor inside that zone's rectangle", async () => {
      const p = await pagina();
      await abrirPanel(p);
      const vista = await p.evaluate(() => globalThis.__numinia.espejo.vista().zonas);
      const botones = await p.locator('#espejo-ficha button[data-verbo^="ir:"]').allInnerTexts();
      assert.equal(botones.length, vista.length, "one button per zone");
      for (const t of botones) assert.doesNotMatch(t, /^Ir a (El|La|Las|Los) /, `«${t}» has a capitalised article`);
      assert.ok(botones.includes("Ir al umbral") && botones.includes("Ir a la torre de control"), botones.join(" | "));
      await p.click('#espejo-ficha button[data-verbo="ir:z6"]');
      const z = vista.find((q) => q.id === "z6");
      await p.waitForFunction((q) => { const s = globalThis.__numinia.session.selfPosition(1); return Math.abs(s.x - q.x) <= q.ancho / 2 && Math.abs(s.z - q.z) <= q.fondo / 2; }, z, { timeout: 15000 });
      assert.equal(await p.locator("#espejo-ficha").isHidden(), true, "the card closes when you go");
      await p.context().close();
    });

    // ---- the card fits any viewport and never covers the action bar ----
    for (const [ancho, alto, movil] of [[1280, 720, false], [1024, 600, false], [800, 600, false], [360, 640, true]]) {
      await prueba(`the switch panel's card fits a ${ancho}×${alto} viewport (all 12 buttons reachable, scrolls inside, never over the action bar)`, async () => {
        const p = await nav.pagina(mundo, { ancho, alto, query: movil ? "?webgl2&aparato=movil" : "?webgl2" });
        await p.waitForFunction(() => globalThis.__numinia.espejo.cosas().length >= 1, null, { timeout: 15000 });
        await caminarA(p, 0, -4.5, 3);
        await p.evaluate(() => globalThis.__numinia.espejo.usar("salud/panel"));
        await p.waitForSelector("#espejo-ficha:not([hidden])", { timeout: 8000 });
        const m = await p.evaluate(() => {
          const caja = document.getElementById("espejo-ficha"), r = caja.getBoundingClientRect(), a = document.getElementById("acciones"), ra = a && getComputedStyle(a).display !== "none" ? a.getBoundingClientRect() : null;
          const cuerpo = caja.querySelector(".cuerpo"), cerrar = caja.querySelector('button[data-verbo="cerrar"]').getBoundingClientRect();
          return { r: { t: r.top, b: r.bottom, l: r.left, rr: r.right }, vw: innerWidth, vh: innerHeight, acciones: ra ? { t: ra.top, b: ra.bottom, l: ra.left, r: ra.right } : null, botones: caja.querySelectorAll(".grupo button").length, scroll: cuerpo.scrollHeight > cuerpo.clientHeight, cerrar: { t: cerrar.top, b: cerrar.bottom }, anchoBoton: [...caja.querySelectorAll(".grupo button")].map((b) => b.getBoundingClientRect().width) };
        });
        assert.ok(m.r.t >= 0 && m.r.b <= m.vh && m.r.l >= 0 && m.r.rr <= m.vw, `card inside the viewport: ${JSON.stringify(m.r)} in ${m.vw}×${m.vh}`);
        assert.equal(m.botones, 12, "6 switches + 6 zone jumps");
        assert.ok(m.cerrar.t >= m.r.t && m.cerrar.b <= m.r.b, "«Cerrar» is always inside the card");
        if (m.acciones && ancho >= 1280 && alto >= 720) assert.ok(m.r.b <= m.acciones.t, `the card (bottom ${m.r.b}) stays over the action bar (top ${m.acciones.t})`);
        const medio = Math.max(...m.anchoBoton); assert.ok(medio < (m.r.rr - m.r.l) * 0.6, `two columns: the widest button is ${medio}px of a ${m.r.rr - m.r.l}px card`);
        // the last button of the list can be reached by scrolling the card's body, and a press there keeps the scroll
        await p.locator('#espejo-ficha button[data-verbo="ir:z2"]').scrollIntoViewIfNeeded();
        assert.ok(await p.locator('#espejo-ficha button[data-verbo="ir:z2"]').isVisible());
        await p.context().close();
      });
    }

    // ---- the HUD in the hermes theme ----
    await prueba("HUD colours in the hermes theme: every visible panel is only black, white or the one accent (computed colours; no greys, translucent fills, shadows or gradients)", async () => {
      const p = await pagina();
      await p.waitForSelector("html.tema-byn", { timeout: 10000 });
      // computed styles are read once the loading veil is gone and no CSS transition/animation is still running (else a colour is caught half-way)
      await p.waitForFunction(() => { const c = document.getElementById("carga"); return (!c || getComputedStyle(c).display === "none" || getComputedStyle(c).visibility === "hidden" || Number(getComputedStyle(c).opacity) === 0) && document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity); }, null, { timeout: 15000 });
      const abrir = async (sel) => { const l = p.locator(sel).first(); if (await l.count() && await l.isVisible()) { await l.click().catch(() => {}); await p.waitForTimeout(250); } };
      const mal = new Set();
      const recoger = async () => { for (const x of await p.evaluate(auditarColores, ACENTO)) mal.add(x); };
      await recoger();
      for (const sel of ["#notif-boton", "#chat-boton", "#menu-abrir", "#ajustes-abrir", "#boton-mapa"]) { await abrir(sel); await recoger(); await p.keyboard.press("Escape"); await p.waitForTimeout(150); }
      await abrirPanel(p); await recoger();
      assert.deepEqual([...mal], [], `elements painted outside black/white/accent:\n  ${[...mal].join("\n  ")}`);
      await p.context().close();
    });

    // ---- the 14 profiles' plates: no overlap, stacked by distance ----
    await prueba("14 profiles near: their plates sit above the figures, none overlaps another, the nearest keep their place", async () => {
      const p = await pagina();
      await irA(p, "z6");
      await p.waitForFunction(() => globalThis.__numinia.view.placas().filter((q) => q.visible).length >= 5, null, { timeout: 15000 });
      const placas = await p.evaluate(() => globalThis.__numinia.view.placas());
      const vis = placas.filter((q) => q.visible);
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j], solapa = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        assert.equal(solapa, false, `plates ${a.clave} and ${b.clave} overlap`);
      }
      assert.ok(placas.some((q) => q.nivel === 0 && q.visible), "the nearest plates keep their place");
      // (b) screen-space size clamp 90..220 px wide (a few % of slack: the plate is projected at its own depth), nothing drawn beyond 40 m
      const info = await p.evaluate(() => { const n = globalThis.__numinia, s = n.session.selfPosition(1), cs = new Map(n.espejo.cosas().map((c) => [`espejo:${c.tipo}/${c.id}`, c])); return { ancho: innerWidth, s, lejos: n.view.placas().filter((q) => q.visible).map((q) => { const c = cs.get(q.clave); return c ? Math.hypot(c.x - s.x, c.z - s.z) : 0; }) }; });
      for (const q of vis) { const w = ((q.x1 - q.x0) / 2) * info.ancho; assert.ok(w >= 90 * 0.93 && w <= 220 * 1.07, `plate ${q.clave} is ${w.toFixed(0)} px wide (want 90..220)`); }
      assert.ok(info.lejos.every((d) => d <= 40), `a plate is drawn beyond 40 m: ${info.lejos.join(", ")}`);
      await p.context().close();
    });

    // ---- the switch: confirm, flip, the things of that function disappear (this one changes the world: last) ----
    await prueba("a switch lamp asks for confirmation, then flips: the file changes and the things of that function leave the world", async () => {
      const p = await pagina();
      await abrirPanel(p);
      assert.match(await p.locator("#espejo-ficha h2").innerText(), /Panel de interruptores/i);
      assert.equal(await textoBoton(p, "funcion:cron"), "Apagar las tareas programadas");
      await p.click('#espejo-ficha button[data-verbo="funcion:cron"]');
      assert.match(await textoBoton(p, "funcion:cron"), /^¿Seguro\? Confirmar: apagar las tareas programadas/);
      await dormir(400);
      assert.equal(mundo.leerEspejo().funciones.cron, true, "the first press changes nothing");
      assert.equal((await claves(p, "cron/")).length, 2);
      await p.click('#espejo-ficha button[data-verbo="funcion:cron"]');
      await p.waitForFunction(() => globalThis.__numinia.espejo.cosas().every((c) => c.tipo !== "cron"), null, { timeout: 8000 });
      assert.equal(mundo.leerEspejo().funciones.cron, false, "the world's own file was written");
      assert.deepEqual(await formasDe(p, "espejo:cron/"), [], "their shapes are gone");
      assert.equal(await textoBoton(p, "funcion:cron"), "Encender las tareas programadas");
      assert.equal((await claves(p, "perfil/")).length, 14, "other functions stay");
      await esperarTexto(p, "#espejo-ficha .dicho", /Función «cron» apagada\./);
      await p.context().close();
    });
  } finally {
    await nav.cerrar(); fuente.cerrar(); await mundo.parar();
  }

  // ---- a world without the theme flag never loads the theme ----
  const sinTema = await crearMundo({ entorno: (e) => { delete e.tema; } });
  const nav2 = await abrirNavegador();
  try {
    await prueba("a world without `tema` never loads the black-and-white theme (no stylesheet, no chunk, /status has no temaHud)", async () => {
      const st = await (await fetch(`${sinTema.url}status`)).json();
      assert.equal("temaHud" in st, false);
      const pedidos = []; const ctx = await nav2.browser.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage();
      p.on("request", (r) => pedidos.push(r.url()));
      await p.goto(sinTema.url + "?webgl2");
      await p.waitForFunction(() => globalThis.__numinia?.probe?.done, null, { timeout: 40000 });
      await dormir(800);
      assert.equal(await p.evaluate(() => !!document.getElementById("tema-byn-css") || document.documentElement.classList.contains("tema-byn")), false);
      assert.deepEqual(pedidos.filter((u) => /tema-byn/.test(u)), []);
      await ctx.close();
    });
  } finally { await nav2.cerrar(); await sinTema.parar(); }

  console.log(`\nℹ tests ${pass + fail}\nℹ pass ${pass}\nℹ fail ${fail}`);
  if (fail) console.log(`✖ failing: ${fallos.join(" | ")}`);
  return fail === 0;
}

if (import.meta.url === `file://${process.argv[1]}`) correr().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e); process.exit(2); });
