// e2e leg (J5): the minimap, the big map over the zone seen from above, waypoints, the HTML twin and the player sheet.
// Two tabs per browser (chromium, then firefox; BROWSER=… runs one). Checks: the minimap draws you and tab B (read-only
// hook with counts by kind), it redraws only when something changes (≤ 5/s) and never keeps the page busy; a block
// placed by A is a marker with its name and direction in words in the HTML list (and in the accessibility tree); M opens
// the big map with a non-empty, north-up picture of the zone (its cost measured); «Marcar destino» puts a beacon in the
// world and a marker on both maps, a second press takes it away; I opens the sheet with your name; no page errors.
// Leaves the world as it found it (the block is undone). Usage: BASE=… SERVER_HTTP=… node tools/e2e-piernas/mapa.mjs
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
};
const engines = process.env.BROWSER ? [process.env.BROWSER] : ["chromium", "firefox"];
const espera = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function pasada(engine) {
  const browser = await launchers[engine]();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const errors = [], r = { engine, checks: {} };
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
    return p;
  };
  const ok = (k, v, extra) => { r.checks[k] = v; if (extra !== undefined) r[k] = extra; };
  let idBloque = null;
  const a = await open(), b = await open();
  try {
    const B = await b.evaluate(() => globalThis.__numinia.session.entity);
    await a.bringToFront();
    // 1) the minimap draws you and tab B (zoomed out to 120 m: two spawns are at most 113 m apart)
    await a.evaluate(() => globalThis.__numinia.mapa.minimapa.zoom(3));
    const visto = await espera(a, (id) => { const m = globalThis.__numinia.mapa; return m.dibujado().mini.tu === 1 && m.marcadores().some((x) => x.id === `p${id}`) && (m.dibujado().mini.persona ?? 0) >= 1; }, B, 15000);
    ok("minimapaTuYB", visto, await a.evaluate(() => ({ dibujado: globalThis.__numinia.mapa.dibujado().mini, cuenta: globalThis.__numinia.mapa.contar() })));
    // 2) redraws: none while nothing moves, at most 5 per second while walking; the page is never kept busy
    await a.evaluate(() => globalThis.__numinia.mapa.minimapa.zoom(1));
    await a.waitForTimeout(600);
    const d0 = await a.evaluate(() => globalThis.__numinia.mapa.stats().mini.dibujos);
    await a.waitForTimeout(2000);
    const d1 = await a.evaluate(() => ({ n: globalThis.__numinia.mapa.stats().mini.dibujos, busy: globalThis.__numinia.view.busy(), p: globalThis.__numinia.session.selfPosition(1) }));
    await a.keyboard.down("KeyW"); await a.waitForTimeout(2000); await a.keyboard.up("KeyW");
    const d2 = await a.evaluate(() => ({ n: globalThis.__numinia.mapa.stats().mini.dibujos, p: globalThis.__numinia.session.selfPosition(1) }));
    const quieto = d1.n - d0, andando = d2.n - d1.n, metros = Math.round(Math.hypot(d2.p.x - d1.p.x, d2.p.z - d1.p.z) * 10) / 10;
    ok("redibujo", quieto <= 2 && andando >= (metros > 1 ? 1 : 0) && andando <= 11 && !d1.busy, { quieto2s: quieto, andando2s: andando, metrosAndados: metros, busyQuieto: d1.busy });
    // 3) a block placed 3 m in front of A is a marker with its name, in the list with its direction in words
    const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    await a.evaluate(() => globalThis.__numinia.constructor.colocar("bloque"));
    await espera(a, (n) => { const g = globalThis.__numinia; return !!g.constructor.estado.seleccionado && g.session.features.stateOf("objetos").size > n; }, n0, 5000);
    idBloque = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    const marcador = await espera(a, (id) => globalThis.__numinia.mapa.marcadores().some((m) => m.id === `c:objetos:${id}` && m.tipo === "objeto" && m.nombre === "Bloque"), idBloque, 5000);
    ok("bloqueEsMarcador", marcador);
    // 4) M opens the big map; its picture of the zone is generated, has things in it, and has north up
    await a.keyboard.press("KeyM");
    const abierto = await espera(a, () => document.getElementById("mapa-grande")?.open === true, null, 3000);
    const imagen = await espera(a, () => (globalThis.__numinia.mapa.imagen()?.conCosas ?? 0) > 100, null, 20000);
    const img = await a.evaluate(() => globalThis.__numinia.mapa.imagen());
    const color = await a.evaluate(() => ({ ne: globalThis.__numinia.mapa.muestra(12.73, -12.73), se: globalThis.__numinia.mapa.muestra(12.73, 12.73) }));
    const norte = !!color.ne && !!color.se && color.ne[2] > color.ne[1] && color.se[1] > color.se[2]; // NE pillar blue, SE pillar green
    ok("mapaGrande", abierto && imagen, { imagen: img });
    ok("imagenNorteArriba", norte, { coloresPilares: color });
    // cost of the picture on this backend: the GPU path again (warm) and the footprints path
    r.costeImagen = await a.evaluate(async () => {
      const v = globalThis.__numinia.view, t0 = performance.now();
      const g = await v.cenital({ px: 512 }), t1 = performance.now();
      const h = await v.cenital({ px: 512, modo: "huellas" }), t2 = performance.now();
      return { backend: v.backend, primeraMs: globalThis.__numinia.mapa.imagen()?.ms, primeraPartes: globalThis.__numinia.mapa.imagen()?.partes, gpuCalienteMs: Math.round((t1 - t0) * 10) / 10, gpuPartes: g.partes, gpuModo: g.modo, huellasMs: Math.round((t2 - t1) * 10) / 10, huellasPartes: h.partes, px: 512, cuadroMs: globalThis.__numinia.cost().cpuMs };
    });
    // the HTML twin lists the block by name with its direction in words, and the accessibility tree has its buttons
    const fila = `#mapa-lista li[data-id="c:objetos:${idBloque}"]`;
    const enLista = await espera(a, (sel) => !!document.querySelector(sel), fila, 4000);
    const textoFila = enLista ? await a.locator(`${fila} .ver`).textContent() : "";
    ok("listaHtml", enLista && /^Bloque · objeto · (al (norte|noreste|noroeste), a [2-4] m|aquí mismo)$/.test(textoFila ?? ""), { textoFila });
    const arbol = await a.locator("#mapa-lista").ariaSnapshot().catch((e) => String(e));
    ok("arbolAccesible", arbol.includes('button "Marcar destino: Bloque"'));
    // 5) «Marcar destino» (keyboard: Enter on the focused button) → a beacon and a marker on both maps; again → gone
    const beacons0 = await a.evaluate(() => globalThis.__numinia.view.beaconCount());
    await a.locator(`${fila} .marcar`).focus();
    await a.keyboard.press("Enter");
    const marcado = await espera(a, (id) => globalThis.__numinia.mapa.destino()?.id === `c:objetos:${id}`, idBloque, 3000);
    const enMapas = await espera(a, () => { const d = globalThis.__numinia.mapa.dibujado(); return d.mini.destino === 1 && d.grande.destino === 1; }, null, 3000);
    const beacons1 = await a.evaluate(() => ({ n: globalThis.__numinia.view.beaconCount(), busy: globalThis.__numinia.view.busy(), boton: document.querySelector("#mapa-lista .marcar[aria-label^='Quitar']")?.getAttribute("aria-label") ?? "" }));
    await a.locator(`${fila} .marcar`).click();
    const quitado = await espera(a, () => globalThis.__numinia.mapa.destino() === null, null, 3000);
    const beacons2 = await a.evaluate(() => globalThis.__numinia.view.beaconCount());
    ok("destino", marcado && enMapas && beacons1.n === beacons0 + 1 && quitado && beacons2 === beacons0, { balizas: [beacons0, beacons1.n, beacons2], botonActivo: beacons1.boton, busyConDestino: beacons1.busy });
    // 5b) C2: «Ir» (icon button) remembers where you were; «Volver» appears and, pressed, forgets the origin
    const sinOrigen = await a.evaluate(() => globalThis.__numinia.mapa.puedeVolver());
    await a.locator(`${fila} .ir`).click();
    const conOrigen = await espera(a, () => globalThis.__numinia.mapa.puedeVolver() && !!document.querySelector("#mapa-grande .detalle .volver"), null, 3000);
    await a.locator("#mapa-grande .detalle .volver").click();
    const sinVolver = await espera(a, () => !globalThis.__numinia.mapa.puedeVolver(), null, 3000);
    ok("irYvolver", sinOrigen === false && conOrigen && sinVolver, { sinOrigen, conOrigen, sinVolver });
    // 6) I opens the sheet (the map closes) with your name; Escape closes it
    await a.keyboard.press("KeyI");
    const fichaAbierta = await espera(a, () => document.getElementById("ficha")?.open === true && document.getElementById("mapa-grande")?.open === false, null, 3000);
    const nombre = await a.evaluate(() => globalThis.__numinia.session.who?.nombre ?? "");
    const textoFicha = await a.evaluate(() => globalThis.__numinia.ficha.texto());
    await a.keyboard.press("Escape");
    const cerrada = await espera(a, () => document.getElementById("ficha")?.open === false, null, 2000);
    ok("ficha", fichaAbierta && !!nombre && textoFicha.includes(nombre) && /WebGL2|WebGPU/.test(textoFicha) && cerrada, { nombre, fichaTieneAparato: /Cuadros por segundo/.test(textoFicha) });
  } catch (e) { r.error = String(e).split("\n")[0]; }
  finally {
    // leave the world as it was: undo the block
    if (idBloque) {
      await a.evaluate(() => globalThis.__numinia.constructor.deshacer()).catch(() => {});
      r.checks.limpio = await espera(a, (id) => !globalThis.__numinia.session.features.stateOf("objetos").has(id), idBloque, 5000);
    }
    r.errors = errors;
    await browser.close();
  }
  r.ok = !r.error && errors.length === 0 && Object.values(r.checks).every(Boolean) && Object.keys(r.checks).length >= 9;
  return r;
}

const resultados = [];
for (const e of engines) resultados.push(await pasada(e));
console.log(JSON.stringify(resultados, null, 1));
const todo = resultados.every((x) => x.ok);
console.log(todo ? "E2E MAPA OK" : "E2E MAPA FALLA");
process.exit(todo ? 0 : 1);
