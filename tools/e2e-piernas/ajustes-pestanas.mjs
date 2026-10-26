// e2e leg MIS-239 (settings as ONE card with tabs; folded sections on a phone), chromium: at 1280 px the categories are a
// strip of tabs (role=tab, one selected, the panel named by it), a press and the arrow keys change tab, and every setting
// the registry shows is reachable through the tabs; at 360 px there is no strip, each category is a heading that opens its
// settings (one at a time, pressed again it folds), every setting is reachable through the headings, a search opens the
// matches, and widening the window turns the sections back into tabs. No page errors. Screenshots into SHOTS (optional).
// Receives BASE. Prints JSON; exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000";
const SHOTS = process.env.SHOTS;
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const listo = (p) => p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.ajustes, null, { timeout: 30000 });
const foto = async (p, nombre) => {
  if (!SHOTS) return;
  await p.waitForFunction(() => { const c = document.getElementById("carga"); return !c || c.hidden || getComputedStyle(c).display === "none" || getComputedStyle(c).visibility === "hidden" || getComputedStyle(c).opacity === "0"; }, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(400); // the chevron's transition
  await p.screenshot({ path: `${SHOTS}/${nombre}.png` });
};
/** The settings the registry shows (id list) and those on screen right now (visible rows of the window). */
const registro = (p) => p.evaluate(() => globalThis.__numinia.ajustes.lista().filter((s) => s.visible).map((s) => s.id));
const enPantalla = (p) => p.evaluate(() => [...document.querySelectorAll("#ajustes-grupos .ajuste:not(.info)")].filter((f) => f.getClientRects().length > 0).map((f) => f.dataset.id));
const seleccionada = (p) => p.evaluate(() => document.querySelector('#ajustes nav [role="tab"][aria-selected="true"]')?.dataset.cat ?? null);
const pestanas = (p) => p.evaluate(() => [...document.querySelectorAll('#ajustes nav [role="tab"]')].filter((b) => b.getClientRects().length > 0).map((b) => b.dataset.cat));
const cabeceras = (p) => p.evaluate(() => [...document.querySelectorAll("#ajustes .cat-cab")].filter((b) => b.getClientRects().length > 0).map((b) => ({ cat: b.dataset.cat, abierta: b.getAttribute("aria-expanded") === "true" })));
const abrirAjustes = async (p) => { await p.evaluate(() => globalThis.__numinia.ajustes.abrir()); await p.waitForFunction(() => document.getElementById("ajustes").open, null, { timeout: 3000 }); };

const r = { errors: [] };
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  // ---------------- 1. a wide window: tabs ----------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => r.errors.push(String(e)));
  await p.goto(BASE); await listo(p);
  const todos = await registro(p);
  await abrirAjustes(p);
  r.ancho = { modo: await p.evaluate(() => document.getElementById("ajustes").dataset.modo), pestanas: await pestanas(p), seleccionada: await seleccionada(p) };
  r.ancho.cabecerasVisibles = (await cabeceras(p)).length;
  r.ancho.tablist = await p.evaluate(() => { const t = document.querySelector('#ajustes nav [role="tablist"]'); return !!t && t.getAttribute("aria-orientation") === "vertical"; });
  r.ancho.panel = await p.evaluate(() => { const l = document.getElementById("ajustes-grupos"), sel = document.querySelector('#ajustes nav [role="tab"][aria-selected="true"]'); return { role: l.getAttribute("role"), nombradoPor: l.getAttribute("aria-labelledby"), esLaSeleccionada: sel?.id === l.getAttribute("aria-labelledby"), tabsSeleccionadas: document.querySelectorAll('#ajustes nav [role="tab"][aria-selected="true"]').length }; });
  await foto(p, "1-ajustes-escritorio-pestanas");
  // every setting is reachable through the tabs (nothing lost), one tab at a time
  const alcanzados = new Set(); const porPestana = {};
  for (const c of await pestanas(p)) {
    await p.click(`#ajustes nav [role="tab"][data-cat="${c}"]`);
    const ids = await enPantalla(p); porPestana[c] = ids.length; ids.forEach((i) => alcanzados.add(i));
    if ((await seleccionada(p)) !== c) r.noCambia = c;
  }
  r.ancho.porPestana = porPestana;
  r.ancho.perdidos = todos.filter((i) => !alcanzados.has(i));
  // a press changes tab: Sonido shows its settings and hides Gráficos'
  await p.click('#ajustes nav [role="tab"][data-cat="graficos"]');
  const graf = await enPantalla(p);
  await p.click('#ajustes nav [role="tab"][data-cat="sonido"]');
  const son = await enPantalla(p);
  r.cambiaDePestana = { graficos: graf.length, sonido: son.length, sinMezcla: graf.every((i) => !son.includes(i)) && graf.some((i) => i.startsWith("graficos.")) && son.every((i) => i.startsWith("sonido.")) };
  await foto(p, "2-ajustes-escritorio-sonido");
  // arrows: roving focus, the tab reached opens
  const orden = await pestanas(p);
  await p.focus(`#ajustes nav [role="tab"][data-cat="${orden[0]}"]`);
  await p.keyboard.press("ArrowDown");
  r.flechas = { esperada: orden[1], seleccionada: await seleccionada(p), enfocada: await p.evaluate(() => document.activeElement?.dataset?.cat) };
  await p.keyboard.press("End"); r.flechas.fin = await seleccionada(p) === orden[orden.length - 1];
  await p.keyboard.press("ArrowDown"); r.flechas.vuelta = await seleccionada(p) === orden[0];
  r.flechas.tabindex = await p.evaluate(() => [...document.querySelectorAll('#ajustes nav [role="tab"]')].filter((b) => b.tabIndex === 0).length);
  // the search crosses categories and brings the tabs back
  await p.fill("#ajustes-buscar", "volumen");
  r.busquedaAncha = { ids: (await enPantalla(p)).length, seleccionadas: await p.evaluate(() => document.querySelectorAll('#ajustes nav [aria-selected="true"]').length) };
  await p.fill("#ajustes-buscar", "");
  await p.keyboard.press("Escape");
  await ctx.close();

  // ---------------- 2. a phone: folded sections ----------------
  const tel = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, deviceScaleFactor: 2 });
  const q = await tel.newPage();
  q.on("pageerror", (e) => r.errors.push(String(e)));
  await q.goto(BASE); await listo(q);
  await abrirAjustes(q);
  r.movil = { modo: await q.evaluate(() => document.getElementById("ajustes").dataset.modo), tiraVisible: (await pestanas(q)).length, cabeceras: await cabeceras(q), ajustesVisiblesAlAbrir: (await enPantalla(q)).length };
  r.movil.sinDesbordeX = await q.evaluate(() => { const d = document.getElementById("ajustes"); return d.scrollWidth <= d.clientWidth + 1; });
  await foto(q, "3-ajustes-movil-plegado");
  const alc2 = new Set();
  for (const { cat } of r.movil.cabeceras) {
    await q.click(`#ajustes .cat-cab[data-cat="${cat}"]`);
    const cs = await cabeceras(q), abiertas = cs.filter((c) => c.abierta).map((c) => c.cat);
    if (abiertas.length !== 1 || abiertas[0] !== cat) r.variasAbiertas = { cat, abiertas }; // one open at a time
    (await enPantalla(q)).forEach((i) => alc2.add(i));
  }
  r.movil.perdidos = (await registro(q)).filter((i) => !alc2.has(i));
  await q.click('#ajustes .cat-cab[data-cat="sonido"]'); // opens (it was not the open one)
  r.movil.sonidoAbierta = (await cabeceras(q)).find((c) => c.cat === "sonido")?.abierta;
  const sonM = await enPantalla(q);
  r.movil.sonidoSolo = sonM.length > 0 && sonM.every((i) => i.startsWith("sonido."));
  await foto(q, "4-ajustes-movil-sonido-desplegado");
  await q.click('#ajustes .cat-cab[data-cat="sonido"]'); // pressed again: folds
  r.movil.sePlega = (await cabeceras(q)).every((c) => !c.abierta) && (await enPantalla(q)).length === 0;
  // a slider inside an unfolded section still changes the setting
  await q.click('#ajustes .cat-cab[data-cat="graficos"]');
  await q.focus("#ajuste-graficos\\.resolucion"); await q.keyboard.press("ArrowLeft");
  await q.waitForFunction(() => globalThis.__numinia.ajustes.get("graficos.resolucion") === 95, null, { timeout: 3000 });
  r.movil.controlFunciona = true;
  await foto(q, "5-ajustes-movil-graficos-desplegado");
  await q.evaluate(() => globalThis.__numinia.ajustes.restablecer());
  // the search opens every match and ignores the folds
  await q.fill("#ajustes-buscar", "volumen");
  const busc = await enPantalla(q);
  r.movil.busqueda = { ids: busc.length, soloCoincidencias: busc.length > 0 };
  await foto(q, "6-ajustes-movil-busqueda");
  await q.fill("#ajustes-buscar", "");
  r.movil.aparato = await q.evaluate(() => document.documentElement.dataset.aparato);
  await q.evaluate(() => globalThis.__numinia.ajustes.cerrar());
  await tel.close();
  // a narrow window of a computer (no touch): widening it turns the sections back into tabs, without losing the open one
  const nar = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const w = await nar.newPage();
  w.on("pageerror", (e) => r.errors.push(String(e)));
  await w.goto(BASE); await listo(w);
  await abrirAjustes(w);
  r.estrecha = { modo: await w.evaluate(() => document.getElementById("ajustes").dataset.modo), aparato: await w.evaluate(() => document.documentElement.dataset.aparato) };
  await w.click('#ajustes .cat-cab[data-cat="controles"]');
  await w.setViewportSize({ width: 1280, height: 800 });
  await w.waitForFunction(() => document.getElementById("ajustes").dataset.modo === "pestanas", null, { timeout: 3000 });
  r.alEnsanchar = { modo: await w.evaluate(() => document.getElementById("ajustes").dataset.modo), seleccionada: await seleccionada(w), cabecerasVisibles: (await cabeceras(w)).length };
  await w.setViewportSize({ width: 360, height: 740 });
  await w.waitForFunction(() => document.getElementById("ajustes").dataset.modo === "acordeon", null, { timeout: 3000 });
  r.alEstrechar = { abierta: (await cabeceras(w)).find((c) => c.abierta)?.cat ?? null, tiraVisible: (await pestanas(w)).length };
  await nar.close();
} catch (e) { r.fallo = String(e).split("\n")[0]; }
await browser.close();

const a = r.ancho ?? {}, m = r.movil ?? {};
r.ok = !r.fallo && r.errors.length === 0
  && a.modo === "pestanas" && a.pestanas?.length >= 5 && a.seleccionada && a.cabecerasVisibles === 0 && a.tablist === true
  && a.panel?.role === "tabpanel" && a.panel.esLaSeleccionada && a.panel.tabsSeleccionadas === 1 && !r.noCambia && a.perdidos?.length === 0
  && r.cambiaDePestana?.sinMezcla === true
  && r.flechas?.seleccionada === r.flechas?.esperada && r.flechas.enfocada === r.flechas.esperada && r.flechas.fin && r.flechas.vuelta && r.flechas.tabindex === 1
  && r.busquedaAncha?.ids > 0 && r.busquedaAncha.seleccionadas === 0
  && m.modo === "acordeon" && r.estrecha?.modo === "acordeon" && m.tiraVisible === 0 && m.cabeceras?.length >= 5 && m.cabeceras.every((c) => !c.abierta) && m.ajustesVisiblesAlAbrir === 0 && m.sinDesbordeX
  && !r.variasAbiertas && m.perdidos?.length === 0 && m.sonidoAbierta === true && m.sonidoSolo && m.sePlega && m.controlFunciona
  && m.busqueda?.soloCoincidencias
  && r.alEnsanchar?.modo === "pestanas" && r.alEnsanchar.seleccionada === "controles" && r.alEnsanchar.cabecerasVisibles === 0
  && r.alEstrechar?.abierta === "controles" && r.alEstrechar.tiraVisible === 0;
console.log(JSON.stringify(r, null, 1));
console.log(r.ok ? "E2E AJUSTES-PESTAÑAS OK" : "E2E AJUSTES-PESTAÑAS FALLA");
process.exit(r.ok ? 0 : 1);
