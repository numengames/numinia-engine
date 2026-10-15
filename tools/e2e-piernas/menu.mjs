// e2e leg U2 (one owner for the keys + the game menu), chromium + firefox.
//  1. Escape with nothing open opens the menu: six fixed entries in order (Continuar · Ajustes · Controles y ayuda · Zona de usuario ·
//     Gente · Salir), «Continuar» has the focus; Escape closes it; keys typed in the menu never walk you.
//  2. Escape closes ONE layer: typing in the chat (the box closes, the menu does NOT open; the next Escape opens it), the settings (O),
//     the settings opened FROM the menu (it closes, the menu stays), the controls page, the builder (selection, then the builder).
//  3. The ⚙ button opens the same menu at 480 px and with a touch screen; «Zona de usuario» closes the menu and opens the sheet;
//     «Gente» lists who is near; an added entry shows after the fixed ones and runs; the fixed ones cannot be replaced.
//  4. The browser's back gesture (`?atras`): with nothing open it opens the menu, then closes it; with a panel open it closes the panel.
//  5. The pointer released (pointerlockchange) opens the menu (where the browser lets the page capture it).
//  6. «Salir» closes the connection and offers «Volver a entrar», which brings the same guest back.
// No page errors. Leaves the world as it found it. Receives BASE (and SERVER_HTTP, unused). Prints JSON; exit 0 = right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
};
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox").split(",");
const FIJAS = ["Continuar", "Ajustes", "Controles y ayuda", "Zona de usuario", "Gente", "Salir"];

const listo = (p) => p.waitForFunction(() => globalThis.__numinia?.carga?.estado === "listo" && globalThis.__numinia.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.menu && !!globalThis.__numinia.ajustes, null, { timeout: 60000 });
const abierto = (p, id) => p.evaluate((i) => !!document.getElementById(i)?.open, id);
const capas = (p) => p.evaluate(() => globalThis.__numinia.capas.abiertas());
const esc = async (p) => { await p.keyboard.press("Escape"); await p.waitForTimeout(150); };
const pos = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(1); return { x: s.x, z: s.z }; });

async function pierna(engine) {
  const r = { engine, errors: [] };
  const browser = await launchers[engine]();
  try {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => r.errors.push(String(e)));
    await p.goto(BASE);
    await listo(p);

    // ---- 1. Escape opens the menu ----
    await esc(p);
    r.abre = await abierto(p, "menu");
    r.entradas = await p.evaluate(() => [...document.querySelectorAll("#menu .entradas button")].map((b) => b.textContent));
    r.api = await p.evaluate(() => globalThis.__numinia.menu.entradas().map((e) => `${e.etiqueta}${e.fija ? "" : "*"}`));
    r.foco = await p.evaluate(() => document.activeElement?.textContent);
    r.capasConMenu = await capas(p);
    // typing inside the menu never walks you (W held 500 ms)
    const p0 = await pos(p);
    await p.keyboard.down("KeyW"); await p.waitForTimeout(500); await p.keyboard.up("KeyW");
    const p1 = await pos(p);
    r.noAnda = Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05;
    await esc(p);
    r.cierra = !(await abierto(p, "menu"));

    // ---- 2. one layer at a time ----
    await p.keyboard.press("Enter"); // opens the chat box
    await p.waitForFunction(() => !document.getElementById("chat-form").hidden && document.activeElement?.id === "chat-texto", null, { timeout: 3000 });
    await p.keyboard.type("hola");
    await esc(p);
    r.chat = { cerrado: await p.evaluate(() => document.getElementById("chat-form").hidden), menu: await abierto(p, "menu") };
    await esc(p); r.chat.luegoMenu = await abierto(p, "menu"); await esc(p);

    await p.keyboard.press("KeyO");
    r.ajustesO = await abierto(p, "ajustes");
    await esc(p);
    r.ajustesCierra = { ajustes: await abierto(p, "ajustes"), menu: await abierto(p, "menu") };

    await esc(p); // menu
    await p.locator("#menu-ajustes").click();
    r.desdeMenu = { ajustes: await abierto(p, "ajustes"), menu: await abierto(p, "menu"), capas: await capas(p) };
    await esc(p);
    r.desdeMenu.trasEscape = { ajustes: await abierto(p, "ajustes"), menu: await abierto(p, "menu") };
    await p.locator("#menu-controles").click();
    r.controles = await p.evaluate(() => ({ abierto: document.getElementById("controles").open, filas: document.querySelectorAll("#controles tbody tr").length, esc: [...document.querySelectorAll("#controles tbody th")].some((t) => t.textContent === "Este menú") }));
    await esc(p);
    r.controles.trasEscape = { controles: await abierto(p, "controles"), menu: await abierto(p, "menu") };

    // ---- 3. entries: gente, zona, added ones ----
    await p.locator("#menu-gente").click();
    r.gente = await p.evaluate(() => ({ abierto: document.getElementById("gente").open, texto: document.getElementById("gente").textContent.includes("U4") }));
    await esc(p);
    r.agrega = await p.evaluate(() => {
      const n = globalThis.__numinia, bien = n.menu.agregar({ id: "x:prueba", etiqueta: "Prueba", accion: () => { globalThis.__prueba = 1; } });
      return { bien, repetida: n.menu.agregar({ id: "x:prueba", etiqueta: "Otra", accion() {} }), pisaFija: n.menu.agregar({ id: "salir", etiqueta: "Falso", accion() {} }), sinAccion: n.menu.agregar({ id: "x:b", etiqueta: "B" }), orden: n.menu.entradas().map((e) => e.etiqueta) };
    });
    await p.locator("#menu-x\\:prueba").click();
    r.agrega.corre = await p.evaluate(() => globalThis.__prueba === 1);
    await p.evaluate(() => globalThis.__numinia.menu.quitar("x:prueba"));
    await p.locator("#menu-zona").click();
    r.zona = { menu: await abierto(p, "menu"), ficha: await abierto(p, "ficha") };
    await esc(p);

    // builder: Escape = selection, then the builder; never the menu while it is open
    await p.waitForFunction(() => globalThis.__numinia.constructor.estado.puede, null, { timeout: 8000 }).catch(() => {});
    if (await p.evaluate(() => globalThis.__numinia.constructor.estado.puede)) {
      await p.keyboard.press("KeyC");
      await p.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 3000 });
      r.construir = { abierto: true };
      await esc(p); // nothing selected, nothing to cancel: it goes back one step = closes the builder, and the menu does NOT open
      r.construir.trasEscape = { panel: await p.evaluate(() => !document.getElementById("panel-construir").hidden), menu: await abierto(p, "menu") };
      await esc(p); r.construir.luegoMenu = await abierto(p, "menu"); await esc(p);
    } else r.construir = { omitido: "este servidor no deja construir" };

    // the ⚙ button, at 480 px and with touch
    const t = await browser.newContext({ viewport: { width: 480, height: 300 }, hasTouch: true });
    const m = await t.newPage();
    m.on("pageerror", (e) => r.errors.push(String(e)));
    await m.goto(BASE); await listo(m);
    r.engranaje = await m.evaluate(() => { const b = document.getElementById("menu-abrir"), q = b.getBoundingClientRect(), top = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return { visible: !b.hidden && q.width >= 40, libre: top === b || b.contains(top) }; });
    await m.locator("#menu-abrir").tap();
    r.engranaje.abre = await abierto(m, "menu");
    r.engranaje.entradas = await m.evaluate(() => [...document.querySelectorAll("#menu .entradas button")].map((b) => b.textContent));
    r.engranaje.expandido = await m.evaluate(() => document.getElementById("menu-abrir").getAttribute("aria-expanded"));
    await m.locator("#menu-continuar").tap();
    r.engranaje.continuar = !(await abierto(m, "menu"));
    await t.close();

    // ---- 4. the back gesture (?atras forces it on a desktop) ----
    const a = await (await browser.newContext({ viewport: { width: 480, height: 300 } })).newPage();
    a.on("pageerror", (e) => r.errors.push(String(e)));
    await a.goto(BASE + "&atras"); await listo(a);
    await a.mouse.click(240, 150); await a.waitForTimeout(200); // the first touch puts our history entry
    const largo0 = await a.evaluate(() => history.length);
    await a.evaluate(() => history.back()); await a.waitForTimeout(400);
    r.atras = { entrada: largo0, menuAbre: await abierto(a, "menu") };
    await a.evaluate(() => history.back()); await a.waitForTimeout(400);
    r.atras.menuCierra = !(await abierto(a, "menu"));
    await a.keyboard.press("KeyO"); await a.waitForTimeout(200);
    await a.evaluate(() => history.back()); await a.waitForTimeout(400);
    r.atras.panel = { ajustes: await abierto(a, "ajustes"), menu: await abierto(a, "menu") };
    r.atras.sigueAqui = (await a.evaluate(() => location.pathname)) === new URL(BASE).pathname;

    // ---- 5. pointer released → menu (only where the browser lets the page capture it) ----
    await p.mouse.click(240, 150);
    const lock = await p.evaluate(async () => { try { await document.body.requestPointerLock(); } catch { /* refused */ } await new Promise((s) => setTimeout(s, 300)); return !!document.pointerLockElement; });
    if (lock) { await p.evaluate(() => document.exitPointerLock()); await p.waitForTimeout(400); r.puntero = { capturado: true, menu: await abierto(p, "menu") }; await esc(p); }
    else r.puntero = { capturado: false, nota: "este navegador sin pantalla no deja capturar el ratón: no probado" };

    // ---- 6. Salir ----
    const nombre = await p.evaluate(() => globalThis.__numinia.session.who?.nombre);
    await esc(p);
    await p.locator("#menu-salir").click();
    await p.waitForFunction(() => globalThis.__numinia.carga.estado === "salido", null, { timeout: 5000 });
    await p.waitForTimeout(1800); // no reconnection tries
    r.salir = await p.evaluate(() => ({ titulo: document.getElementById("carga-t").textContent, botones: [...document.querySelectorAll("#carga-botones button")].map((b) => b.textContent), intento: globalThis.__numinia.conexion.estado().intento, menu: !!document.getElementById("menu").open }));
    await esc(p); r.salir.escape = !(await abierto(p, "menu"));
    await p.locator("#carga-botones button").click();
    await listo(p);
    r.salir.mismaPersona = !!nombre && (await p.evaluate(() => globalThis.__numinia.session.who?.nombre)) === nombre;
  } catch (e) { r.fallo = String(e.message ?? e).split("\n")[0]; r.capasAlFallar = await capas(p).catch(() => null); }
  finally { await browser.close(); }
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  r.ok = !r.fallo && r.abre && igual(r.entradas, FIJAS) && r.foco === "Continuar" && r.noAnda && r.cierra
    && igual(r.capasConMenu, ["menu"])
    && r.chat?.cerrado && r.chat.menu === false && r.chat.luegoMenu === true
    && r.ajustesO && r.ajustesCierra?.ajustes === false && r.ajustesCierra.menu === false
    && r.desdeMenu?.ajustes && r.desdeMenu.menu && r.desdeMenu.trasEscape?.ajustes === false && r.desdeMenu.trasEscape.menu === true
    && r.controles?.abierto && r.controles.filas >= 14 && r.controles.esc && r.controles.trasEscape?.controles === false && r.controles.trasEscape.menu === true
    && r.gente?.abierto && r.gente.texto
    && r.agrega?.bien?.ok === true && r.agrega.repetida.ok === false && r.agrega.pisaFija.ok === false && r.agrega.sinAccion.ok === false && igual(r.agrega.orden, [...FIJAS, "Prueba"]) && r.agrega.corre
    && r.zona?.menu === false && r.zona.ficha === true
    && (r.construir?.omitido || (r.construir.trasEscape?.panel === false && r.construir.trasEscape.menu === false && r.construir.luegoMenu === true))
    && r.engranaje?.visible && r.engranaje.libre && r.engranaje.abre && igual(r.engranaje.entradas, FIJAS) && r.engranaje.expandido === "true" && r.engranaje.continuar
    && r.atras?.menuAbre && r.atras.menuCierra && r.atras.panel?.ajustes === false && r.atras.panel.menu === false && r.atras.sigueAqui
    && (r.puntero?.capturado === false || r.puntero?.menu === true)
    && r.salir?.titulo === "Has salido del mundo" && igual(r.salir.botones, ["Volver a entrar"]) && r.salir.intento === 0 && r.salir.menu === false && r.salir.escape && r.salir.mismaPersona
    && r.errors.length === 0;
  return r;
}

const todo = [];
for (const e of ENGINES) todo.push(await pierna(e));
console.log(JSON.stringify(todo, null, 1));
process.exit(todo.every((x) => x.ok) ? 0 : 1);
