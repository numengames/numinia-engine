// e2e leg MIS-241 + MIS-240 (builder: «Objetos del mundo»; map: «Editar»), chromium: the dock has the new drawer; it lists
// every object of the world (name, kind, pieces), the search and «con pieza» narrow it; a press on a far object selects it,
// closes the drawer so its card shows, and the jump takes you next to it; on the big map a picked world object has «Editar»
// (a person has none), which opens Construir on it with its card; the same list on a phone. No page errors.
// Env: BASE, SERVER_HTTP (the server must give build roles: MOTOR_CONSTRUIR=todos), SHOTS=<dir> screenshots. Prints JSON; exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000";
const SHOTS = process.env.SHOTS;
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const listo = (p) => p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.constructor.estado.puede, null, { timeout: 40000 });
const foto = async (p, nombre) => {
  if (!SHOTS) return;
  await p.waitForFunction(() => { const c = document.getElementById("carga"); return !c || c.hidden || getComputedStyle(c).display === "none" || getComputedStyle(c).visibility === "hidden" || getComputedStyle(c).opacity === "0"; }, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${SHOTS}/${nombre}.png` });
};
const nuevoContexto = (browser, o) => browser.newContext(o).then(async (ctx) => { await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, VERSION); return ctx; });
const objetos = (p) => p.evaluate(() => globalThis.__numinia.constructor.lista().map((o) => ({ id: o.id, nombre: o.nombre ?? "", x: o.x, z: o.z })));
const filas = (p) => p.evaluate(() => [...document.querySelectorAll("#lista-objetos .objeto-fila")].map((b) => ({ id: b.dataset.id, nombre: b.querySelector(".n").textContent, tipo: b.querySelector(".t").textContent, pieza: b.querySelector(".con-pieza")?.textContent ?? "", pulsado: b.getAttribute("aria-pressed") === "true", visible: b.getClientRects().length > 0 })));
const yo = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(1); return { x: s.x, z: s.z }; });

/** Put a named object in the world at (x, z) and wait until the server has it with that name. */
async function poner(p, nombre, x, z, enlace = "") {
  const antes = new Set((await objetos(p)).map((o) => o.id));
  const res = await p.evaluate(([x, z]) => { const c = globalThis.__numinia.constructor; return c.colocarEn(c.biblioteca[0].id, { x, y: 0, z }, 0); }, [x, z]);
  if (!res.ok) throw new Error(`colocarEn: ${res.why}`);
  await p.waitForFunction((a) => globalThis.__numinia.constructor.lista().some((o) => !a.includes(o.id)), [...antes], { timeout: 8000 });
  const id = (await objetos(p)).find((o) => !antes.has(o.id)).id;
  await p.evaluate(([id, nombre]) => { const c = globalThis.__numinia.constructor; c.seleccionar(id); return c.nombrar(nombre, false); }, [id, nombre]);
  await p.waitForFunction(([id, n]) => globalThis.__numinia.constructor.objeto(id)?.nombre === n, [id, nombre], { timeout: 8000 });
  if (enlace) { await p.evaluate(([id, e]) => { const c = globalThis.__numinia.constructor; c.seleccionar(id); return c.ajustar({ enlace: e }); }, [id, enlace]); await p.waitForFunction(([id, e]) => globalThis.__numinia.constructor.objeto(id)?.enlace === e, [id, enlace], { timeout: 8000 }); }
  return id;
}

const r = { errors: [], ids: [] };
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const ctx = await nuevoContexto(browser, { viewport: { width: 1280, height: 800 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => r.errors.push(String(e)));
  await a.goto(BASE); await listo(a);
  // the world we test in: three named things far apart, one with a link
  const idNorte = await poner(a, "Farola norte", 25, 28);
  const idOeste = await poner(a, "Mesa del oeste", -30, 20, "https://numinia.com");
  const idSur = await poner(a, "Árbol del sur", 5, -34);
  r.ids = [idNorte, idOeste, idSur];
  const total = (await objetos(a)).length;
  // the dock has the drawer; open it
  await a.keyboard.press("KeyC");
  await a.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 10000 });
  r.dock = await a.evaluate(() => [...document.querySelectorAll("#dock-construir button")].map((b) => b.id.replace("dock-", "")).join());
  await a.locator("#dock-objetos").click();
  await a.waitForFunction(() => !document.getElementById("cajon-objetos").hidden && document.querySelectorAll("#lista-objetos .objeto-fila").length > 0, null, { timeout: 5000 });
  const f0 = await filas(a);
  r.lista = {
    titulo: await a.evaluate(() => document.getElementById("cajon-objetos-titulo").textContent),
    abierto: await a.evaluate(() => document.getElementById("dock-objetos").getAttribute("aria-expanded")),
    filas: f0.length, total, resumen: await a.evaluate(() => document.querySelector(".resumen-objetos").textContent),
    norte: f0.find((f) => f.id === idNorte), oeste: f0.find((f) => f.id === idOeste),
    ordenados: f0.map((f) => f.nombre).slice(0, 3),
    decorados: f0.filter((f) => f.nombre === "(decorado)").length,
  };
  await foto(a, "7-objetos-lista-abierta");
  // the search and «con pieza»
  await a.fill("#buscar-objetos", "arbol");
  r.busca = { ids: (await filas(a)).map((f) => f.id), resumen: await a.evaluate(() => document.querySelector(".resumen-objetos").textContent) };
  await a.fill("#buscar-objetos", "zzzz");
  r.busca.nada = { filas: (await filas(a)).length, resumen: await a.evaluate(() => document.querySelector(".resumen-objetos").textContent) };
  await a.fill("#buscar-objetos", "");
  await a.locator("#objetos-solo-pieza").check();
  r.conPieza = (await filas(a)).map((f) => f.id);
  await a.locator("#objetos-solo-pieza").uncheck();
  // a press on a far object: selected, drawer shut, its card shows, the jump takes you beside it
  const antes = await yo(a);
  await a.locator(`#lista-objetos .objeto-fila[data-id="${idNorte}"]`).click();
  await a.waitForFunction((id) => globalThis.__numinia.constructor.estado.seleccionado === id && document.getElementById("cajon-objetos").hidden, idNorte, { timeout: 5000 });
  r.pulsar = await a.evaluate(() => { const f = document.getElementById("ficha-objeto"); return { ficha: !!f && !f.hidden, titulo: f?.querySelector("h2, .titulo, [id*=titulo]")?.textContent ?? "", cajonAbierto: document.documentElement.classList.contains("cajon-abierto"), aviso: document.querySelector("#panel-construir .estado")?.textContent ?? "" }; });
  const llegada = await a.waitForFunction(([x, z]) => { const s = globalThis.__numinia.session.selfPosition(1); return Math.hypot(s.x - x, s.z - z) < 6; }, [25, 28], { timeout: 12000 }).then(() => true, () => false);
  r.pulsar.antes = antes; r.pulsar.despues = await yo(a); r.pulsar.llegada = llegada;
  // the camera looks at it once you are there: the object's middle is inside the picture, not under the card (right) nor off-screen
  await a.waitForTimeout(2500);
  r.pulsar.enPantalla = await a.evaluate(() => { const s = globalThis.__numinia.view.editor.pantalla(25, 0.5, 28); return s ? { x: Math.round(s.x), y: Math.round(s.y), dentro: s.x > 20 && s.x < 930 && s.y > 90 && s.y < 700 } : null; }); // clear of the dock (top) and of the card (right, from x 944)
  await foto(a, "8-objetos-ir-y-editar");
  // the map: «Editar» only for a world object, and it opens Construir on it
  await a.keyboard.press("KeyC"); // leave the builder: the map's button must bring it back
  await a.waitForFunction(() => document.getElementById("panel-construir").hidden, null, { timeout: 5000 });
  await a.evaluate(() => globalThis.__numinia.mapa.abrir());
  await a.waitForSelector(`#mapa-grande li[data-id="c:objetos:${idOeste}"] .ver`, { state: "attached", timeout: 8000 });
  await a.locator(`#mapa-grande li[data-id="c:objetos:${idOeste}"] .ver`).click();
  r.mapa = { nombre: await a.evaluate(() => document.querySelector("#mapa-grande .detalle h3")?.textContent), editar: await a.locator("#mapa-grande .detalle .editar").count() };
  await a.evaluate(() => document.querySelector("#mapa-grande .detalle")?.scrollIntoView({ block: "center" }));
  await foto(a, "9-mapa-seleccion-con-editar");
  await a.locator("#mapa-grande .detalle .editar").click();
  await a.waitForFunction((id) => !document.getElementById("panel-construir").hidden && globalThis.__numinia.constructor.estado.seleccionado === id && /Mesa del oeste/.test(document.getElementById("ficha-objeto")?.textContent ?? ""), idOeste, { timeout: 5000 });
  r.mapa.despues = await a.evaluate(() => ({ mapaAbierto: globalThis.__numinia.mapa.abierto(), construyendo: !document.getElementById("panel-construir").hidden, sel: globalThis.__numinia.constructor.estado.seleccionado, ficha: !document.getElementById("ficha-objeto").hidden, titulo: document.querySelector("#ficha-objeto")?.textContent?.slice(0, 40) }));
  await foto(a, "10-mapa-editar-abre-construir");
  // a person on the map has no «Editar» (a second visitor)
  const b = await (await nuevoContexto(browser, { viewport: { width: 800, height: 600 } })).newPage();
  b.on("pageerror", (e) => r.errors.push(String(e)));
  await b.goto(BASE); await listo(b);
  await a.evaluate(() => globalThis.__numinia.mapa.abrir());
  const persona = await a.waitForSelector('#mapa-grande li[data-id^="p"] .ver', { state: "attached", timeout: 15000 }).then(() => true, () => false);
  if (persona) { await a.locator('#mapa-grande li[data-id^="p"] .ver').first().click(); r.mapa.personaEditar = await a.locator("#mapa-grande .detalle .editar").count(); } else r.mapa.personaEditar = "sin persona en el mapa";
  await a.evaluate(() => globalThis.__numinia.mapa.cerrar());
  await b.close();
  // leave the world as found
  await a.evaluate((ids) => { const c = globalThis.__numinia.constructor; for (const id of ids) c.borrarId(id); }, r.ids);
  await a.waitForFunction((ids) => globalThis.__numinia.constructor.lista().every((o) => !ids.includes(o.id)), r.ids, { timeout: 8000 }).catch(() => {});
  await ctx.close();

  // ---------------- a phone ----------------
  const tel = await nuevoContexto(browser, { viewport: { width: 390, height: 780 }, hasTouch: true, deviceScaleFactor: 2 });
  const q = await tel.newPage();
  q.on("pageerror", (e) => r.errors.push(String(e)));
  await q.goto(BASE); await listo(q);
  const idM = await poner(q, "Farola del móvil", 8, 14);
  await q.evaluate(() => document.getElementById("construir").click()); // the phone's menu has no «Construir» entry (aparatos pc, vr): the page's own button, as cable-decir.mjs does
  await q.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 10000 });
  await q.locator("#dock-objetos").tap();
  await q.waitForSelector("#lista-objetos .objeto-fila", { timeout: 5000 });
  const fm = await filas(q);
  r.movil = { aparato: await q.evaluate(() => document.documentElement.dataset.aparato), filas: fm.length, sinDesbordeX: await q.evaluate(() => { const c = document.getElementById("cajon-objetos"); return c.scrollWidth <= c.clientWidth + 1; }), alto44: await q.evaluate(() => [...document.querySelectorAll("#lista-objetos .objeto-fila")].every((b) => b.getBoundingClientRect().height >= 40)) };
  await foto(q, "11-objetos-lista-movil");
  await q.locator(`#lista-objetos .objeto-fila[data-id="${idM}"]`).tap();
  await q.waitForFunction((id) => globalThis.__numinia.constructor.estado.seleccionado === id && document.getElementById("cajon-objetos").hidden, idM, { timeout: 5000 });
  await q.waitForFunction(() => /Farola del móvil/.test(document.getElementById("ficha-objeto")?.textContent ?? ""), null, { timeout: 5000 });
  r.movil.ficha = await q.evaluate(() => { const f = document.getElementById("ficha-objeto"); return !!f && !f.hidden && f.getClientRects().length > 0; });
  await foto(q, "12-objetos-movil-seleccionado");
  await q.evaluate((id) => globalThis.__numinia.constructor.borrarId(id), idM);
  await q.waitForFunction((id) => !globalThis.__numinia.constructor.objeto(id), idM, { timeout: 8000 }).catch(() => {});
  await tel.close();
} catch (e) { r.fallo = String(e).split("\n")[0]; }
await browser.close();

const l = r.lista ?? {}, p = r.pulsar ?? {}, m = r.mapa ?? {}, t = r.movil ?? {};
r.ok = !r.fallo && r.errors.length === 0
  && r.dock === "anadir,objetos,cable,entorno,precision,inspector,ayuda,deshacer,rehacer,salir"
  && l.titulo === "Objetos del mundo" && l.abierto === "true" && l.filas === l.total && l.total >= 3
  && l.norte?.nombre === "Farola norte" && l.norte.tipo.startsWith("Modelo") && l.norte.pieza === ""
  && l.oeste?.nombre === "Mesa del oeste" && l.oeste.pieza === "enlace" && l.ordenados.every((n, i, v) => i === 0 || n.localeCompare(v[i - 1], "es") >= 0 || n === "(decorado)")
  && /objetos en el mundo/.test(l.resumen)
  && r.busca?.ids.length === 1 && r.busca.ids[0] === r.ids[2] && r.busca.nada.filas === 0 && /Ningún objeto/.test(r.busca.nada.resumen)
  && r.conPieza?.length === 1 && r.conPieza[0] === r.ids[1]
  && p.ficha && !p.cajonAbierto && p.llegada && p.enPantalla?.dentro === true && Math.hypot(p.despues.x - 25, p.despues.z - 28) < 6 && Math.hypot(p.antes.x - 25, p.antes.z - 28) > 6
  && m.nombre === "Mesa del oeste" && m.editar === 1 && m.despues?.construyendo && !m.despues.mapaAbierto && m.despues.sel === r.ids[1] && m.despues.ficha && /Mesa del oeste/.test(m.despues.titulo)
  && (m.personaEditar === 0 || m.personaEditar === "sin persona en el mapa")
  && t.filas >= 1 && t.sinDesbordeX && t.alto44 && t.ficha && /^movil/.test(t.aparato);
console.log(JSON.stringify(r, null, 1));
console.log(r.ok ? "E2E OBJETOS-LISTA OK" : "E2E OBJETOS-LISTA FALLA");
process.exit(r.ok ? 0 : 1);
