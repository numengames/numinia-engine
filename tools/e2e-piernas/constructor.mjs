import { readFileSync } from "node:fs";
// e2e leg M22 (constructor): the builder's hands with a REAL mouse and keyboard, two tabs, for chromium and firefox
// (WebGPURenderer; BASE carries ?webgl2 = its WebGL2 backend). Tab A opens build mode with the key C, takes the
// Bloque from the library and clicks the ground 3 m ahead (it follows the pointer, the click places it); B gets it.
// A deselects (Esc) and selects it again with a click at its projected screen position; drags the gizmo's X handle
// → B sees x change; key 3 (girar), drags the Y ring → B sees ry change; Ctrl+Z twice (one undo step per drag) and
// Ctrl+Shift+Z / Ctrl+Y bring both back, B sees each step; Delete removes it (the world stays as it was found).
// Env: BASE, SERVER_HTTP (tools/auto.sh e2e), BROWSERS=chromium,firefox (default both), SHOTS=1 screenshots.
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
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox").split(",").filter((b) => launchers[b]);

/** Find a screen point where the gizmo's handle `axis` is under the pointer, walking along world points `pts`. */
async function buscarAsa(p, axis, pts) {
  for (const w of pts) {
    const s = await p.evaluate(([x, y, z]) => globalThis.__numinia.view.editor.pantalla(x, y, z), w);
    if (!s) continue;
    await p.mouse.move(s.x, s.y);
    if ((await p.evaluate(() => globalThis.__numinia.view.editor.estado().ejeBajo)) === axis) return s;
  }
  return null;
}
async function arrastrar(p, from, dx, dy) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  let busy = false;
  for (let i = 1; i <= 10; i++) {
    await p.mouse.move(from.x + (dx * i) / 10, from.y + (dy * i) / 10);
    await p.waitForTimeout(40);
    if (i === 5) busy = await p.evaluate(() => globalThis.__numinia.view.busy() && globalThis.__numinia.view.editor.estado().arrastrando);
  }
  await p.mouse.up();
  return busy;
}

async function pierna(engine) {
  const browser = await launchers[engine]();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version); // the «what is new» card shows once per version in a fresh browser and would cover the panel
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.constructor.estado.puede, null, { timeout: 30000 });
    // t_45ef2f70: the builder (its card, its dock) and the environment's panel arrive after the first frame, not with the page
    await p.waitForFunction(() => !!document.getElementById("ficha-objeto") && !!document.querySelector("#cajon-entorno #panel-entorno"), null, { timeout: 30000 });
    return p;
  };
  const r = { engine, ok: false, pasos: [] };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  const deB = (k) => b.evaluate((k) => globalThis.__numinia.session.features.stateOf("objetos").get(k) ?? null, k);
  const esperaB = (fn, k, arg) => b.waitForFunction(fn, [k, arg], { timeout: 8000 }).then(() => true, () => false);
  let a, b, id = "";
  try {
    a = await open(); b = await open();
    r.backend = await a.evaluate(() => globalThis.__numinia.view.backend);
    await a.bringToFront();
    // C3: playing (builder closed): the object card is not there
    paso("ficha oculta con el constructor cerrado", await a.evaluate(() => { const f = document.getElementById("ficha-objeto"); return !!f && f.hidden; }));
    // 1. build mode with the key C: the panel shows, the gizmo arrives (dynamic import)
    await a.mouse.move(400, 300);
    await a.keyboard.press("KeyC");
    const abierto = await a.waitForFunction(() => !document.getElementById("panel-construir").hidden && globalThis.__numinia.view.editor.estado().cargado, null, { timeout: 10000 }).then(() => true, () => false);
    paso("abrir con C", abierto, { modo: await a.evaluate(() => globalThis.__numinia.constructor.estado.modo) });
    // ux2-dock: entering shows ONLY the dock (9 icons with tooltip + aria-label), no drawer, the environment inside its drawer
    const dock = await a.evaluate(() => {
      const p = document.getElementById("panel-construir"), d = document.getElementById("dock-construir"), bs = [...d.querySelectorAll("button")];
      return { n: bs.length, ids: bs.map((b) => b.id.replace("dock-", "")).join(), tips: bs.every((b) => b.title && b.getAttribute("aria-label") === b.title && b.querySelector("svg")),
        abiertos: [...p.querySelectorAll(".cajon")].filter((c) => !c.hidden).length, alto: Math.round(p.getBoundingClientRect().height),
        entornoDentro: !!document.querySelector("#cajon-entorno #panel-entorno"), ficha: document.getElementById("ficha-objeto").hidden };
    });
    paso("al entrar solo el dock, sin cajones", dock.n === 10 && dock.ids === "anadir,objetos,cable,entorno,precision,inspector,ayuda,deshacer,rehacer,salir" && dock.tips && dock.abiertos === 0 && dock.alto < 120 && dock.entornoDentro && dock.ficha, dock);
    if (process.env.SHOTS === "1") await a.screenshot({ path: `e2e-dock-${engine}.png` });
    // one drawer at a time: Añadir opens (its icon marked), Entorno replaces it, the same icon again closes it, Esc closes too
    const cajones = () => a.evaluate(() => ({ abiertos: [...document.querySelectorAll("#panel-construir .cajon")].filter((c) => !c.hidden).map((c) => c.id.replace("cajon-", "")).join(),
      marcados: [...document.querySelectorAll("#dock-construir [aria-expanded=true]")].map((b) => b.dataset.cajon).join() }));
    await a.locator("#dock-anadir").click(); const k1 = await cajones();
    await a.locator("#dock-entorno").click(); const k2 = await cajones();
    await a.locator("#dock-entorno").click(); const k3 = await cajones();
    await a.locator("#dock-precision").click(); await a.keyboard.press("Escape"); const k4 = await cajones();
    paso("un solo cajón abierto a la vez (su icono marcado; otra vez o Esc lo cierra)", k1.abiertos === "anadir" && k1.marcados === "anadir" && k2.abiertos === "entorno" && k2.marcados === "entorno" && k3.abiertos === "" && k3.marcados === "" && k4.abiertos === "", { k1, k2, k3, k4 });
    // «Añadir»: ONE library (each piece once), a search that filters it, «Subir» next to it
    await a.locator("#dock-anadir").click();
    const lib = await a.evaluate(() => { const ps = [...document.querySelectorAll("#cajon-anadir .pieza")]; return { n: ps.length, ids: ps.map((p) => p.dataset.pieza), bloques: document.querySelectorAll("#panel-construir [data-pieza=bloque]").length, subir: !!document.querySelector("#cajon-anadir #subir:not([hidden])") }; });
    await a.locator("#buscar-biblioteca").fill("farol");
    const filtradas = await a.evaluate(() => [...document.querySelectorAll("#cajon-anadir .pieza")].filter((p) => !p.hidden).map((p) => p.dataset.pieza).join());
    await a.locator("#buscar-biblioteca").fill(""); await a.locator("#buscar-biblioteca").blur();
    paso("Añadir: una sola biblioteca, buscador y Subir", lib.n > 0 && new Set(lib.ids).size === lib.n && lib.bloques === 1 && lib.subir && filtradas === "farolillo", { ...lib, filtradas });
    if (process.env.SHOTS === "1") await a.screenshot({ path: `e2e-cajon-anadir-${engine}.png` });
    // 2. «arrastra al mundo»: drag the library's Bloque out of the drawer onto the ground in front of the avatar (a point the drawer does not cover) and let go there
    const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    // the drop point: ahead of the avatar on the ground, at a screen point the open drawer does NOT cover. The drawer (a panel under the
    // top dock) now sits over the middle of the screen, where 3 m straight ahead projects, so a release there lands on the drawer's own
    // button and the drag is cancelled (the page only places on the canvas): look for a ground point near that one whose pixel is the canvas.
    const suelo = await a.evaluate(() => {
      const n = globalThis.__numinia, me = n.session.selfPosition(1), lienzo = n.view.renderer.domElement;
      const cand = [];
      for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (Math.hypot(dx, dz) >= 2.5) cand.push([dx, dz]);
      cand.sort((p, q) => Math.hypot(...p) - Math.hypot(...q) || p[0] - q[0]); // the nearest ground the drawer leaves free
      for (const [dx, dz] of cand) {
        const w = [me.x + dx, 0, me.z + dz], s = n.view.editor.pantalla(...w);
        if (!s || s.x < 60 || s.y < 80 || s.x > innerWidth - 20 || s.y > innerHeight - 20) continue;
        if (document.elementFromPoint(s.x, s.y) === lienzo && document.elementFromPoint(s.x - 30, s.y) === lienzo) return { w, s };
      }
      return null;
    });
    if (!suelo) paso("un punto del suelo que el cajón no tape", false, { vp: await a.evaluate(() => [innerWidth, innerHeight]) });
    const pieza = await a.locator('#cajon-anadir [data-pieza="bloque"]').boundingBox();
    await a.mouse.move(pieza.x + pieza.width / 2, pieza.y + pieza.height / 2);
    await a.mouse.down();
    await a.mouse.move(suelo.s.x - 30, suelo.s.y, { steps: 6 });
    await a.mouse.move(suelo.s.x, suelo.s.y, { steps: 3 });
    await a.waitForTimeout(200);
    await a.mouse.up();
    await a.waitForFunction((n0) => { const n = globalThis.__numinia; return !!n.constructor.estado.seleccionado && n.session.features.stateOf("objetos").size > n0; }, n0, { timeout: 8000 });
    id = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    const enB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").has(k), id);
    const o0 = await deB(id);
    paso("arrastrar de la biblioteca al mundo", enB && Math.abs(o0.x - suelo.w[0]) <= 0.3 && Math.abs(o0.z - suelo.w[2]) <= 0.3 && o0.x * 2 === Math.round(o0.x * 2), { id, x: o0?.x, z: o0?.z, apuntado: suelo.w });
    await a.waitForFunction(() => globalThis.__numinia.view.objects().loaded >= globalThis.__numinia.view.objects().placed, null, { timeout: 20000 });
    await a.waitForTimeout(400);
    // 3. the drawer stays open after a drop (to add more); its icon closes it. Esc deselects; a real click on the thing
    // selects it; the gizmo (mover) draws more than without it
    await a.locator("#dock-anadir").click();
    // the view draws on demand and three's counters are reset by any pass (0 between frames): read the most draw calls
    // seen over 600 ms of frames, not one instant (under load one instant may be a frame from before the change)
    const llamadas = () => a.evaluate(() => new Promise((ok) => { let m = 0; const t0 = performance.now();
      const mira = () => { m = Math.max(m, globalThis.__numinia.view.lastFrame().calls); if (performance.now() - t0 < 600) requestAnimationFrame(mira); else ok(m); }; mira(); }));
    await a.keyboard.press("Escape");
    await a.waitForTimeout(300);
    const sinGizmo = { sel: await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado), calls: await llamadas() };
    const centro = await a.evaluate(([x, z]) => globalThis.__numinia.view.editor.pantalla(x, 0.5, z), [o0.x, o0.z]);
    await a.mouse.click(centro.x, centro.y);
    await a.waitForTimeout(300);
    const conGizmo = { ...(await a.evaluate(() => ({ sel: globalThis.__numinia.constructor.estado.seleccionado, ed: globalThis.__numinia.view.editor.estado() }))), calls: await llamadas() };
    paso("seleccionar con un clic", sinGizmo.sel === "" && conGizmo.sel === id && conGizmo.ed.seleccionado === id && conGizmo.ed.herramienta === "mover", { sinGizmo: sinGizmo.sel, conGizmo: conGizmo.sel });
    paso("el gizmo se dibuja", conGizmo.calls > sinGizmo.calls, { llamadasSin: sinGizmo.calls, llamadasCon: conGizmo.calls });
    // C3 / ux2-dock: open + selected → the card on the right: name, «Seleccionado · G mover · R girar · 4 escala», position,
    // turn, size, Duplicar, Borrar (red); its icon-only buttons each with title + aria-label + a tip, reachable by Tab
    const ficha = await a.evaluate(() => {
      const f = document.getElementById("ficha-objeto"), r = f.getBoundingClientRect(), ics = [...f.querySelectorAll("button.ic")].filter((b) => !b.hidden);
      return { visible: !f.hidden, titulo: f.querySelector("h3").textContent, sub: f.querySelector(".sub").textContent.replace(/\s+/g, " ").trim(), claves: [...f.querySelectorAll(".kv dt")].filter((d) => !d.hidden).map((d) => d.textContent).join(),
        x: Number(f.querySelector("input[data-k=x]").value), botones: [...f.querySelectorAll(".acciones > button:not(.ic)")].map((b) => b.textContent.trim()).join(), rojo: f.querySelector("button.peligro")?.textContent.trim(),
        completos: ics.every((b) => b.title && b.getAttribute("aria-label") === b.title && b.dataset.tip === b.title && b.querySelector("svg")), tab: ics.every((b) => b.tabIndex >= 0 && !b.disabled),
        fijar: ics.some((b) => /^Anclar/.test(b.title)), derecha: r.right > innerWidth - 40 && r.left > innerWidth / 2, cajon: document.querySelectorAll("#panel-construir .cajon:not([hidden])").length };
    });
    paso("tarjeta a la derecha con lo básico del objeto elegido", ficha.visible && ficha.titulo !== "" && ficha.sub === "Seleccionado · G mover · R girar · 4 escala" && ficha.claves === "Posición,Giro,Tamaño"
      && Math.abs(ficha.x - o0.x) < 0.01 && ficha.botones === "Duplicar,Borrar" && ficha.rojo === "Borrar" && ficha.completos && ficha.tab && ficha.fijar && ficha.derecha && ficha.cajon === 0, ficha);
    if (process.env.SHOTS === "1") await a.screenshot({ path: `e2e-ficha-${engine}.png` });
    // «Inspector» (was N): every field of the object and its «Lógica»; «Abrir el cable» opens the cable's drawer, focused
    await a.locator("#dock-inspector").click();
    const logica = await a.evaluate(() => { const p = document.querySelector("#cajon-inspector .logica"); return { abierto: !document.getElementById("cajon-inspector").hidden, inspector: !!document.querySelector("#cajon-inspector .inspector"), listas: p.querySelectorAll("ul").length, texto: p.textContent }; });
    paso("Inspector: todos los campos y la lógica", logica.abierto && logica.inspector && logica.listas === 3 && /Entran/.test(logica.texto) && /Salen/.test(logica.texto), logica);
    await a.locator("#cajon-inspector .logica button").click();
    const cable = await a.evaluate(() => ({ foco: document.activeElement?.id, abiertos: [...document.querySelectorAll("#panel-construir .cajon:not([hidden])")].map((c) => c.id).join() }));
    paso("«Abrir el cable» lleva al cajón del cable", cable.foco === "cable-panel" && cable.abiertos === "cajon-cable", cable);
    // a field of the Inspector changes the object on the SERVER (B sees it): se ve al jugar, nombre, anclado
    await a.locator("#dock-inspector").click();
    const casilla = (t) => a.locator("#cajon-inspector .inspector label", { hasText: t }).locator("input[type=checkbox]");
    await casilla("se ve al jugar").uncheck();
    const ocultoEnB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.oculto === true, id);
    await casilla("se ve al jugar").check();
    const visibleEnB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.oculto === false, id);
    await a.locator("#cajon-inspector .inspector input[type=text]").fill("Mesa de ajustes");
    await a.keyboard.press("Enter"); await a.locator("#cajon-inspector .inspector input[type=text]").blur();
    const nombreEnB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.nombre === "Mesa de ajustes", id);
    await casilla("anclado").check();
    const ancladoEnB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.fijado === true, id);
    await casilla("anclado").uncheck();
    const sueltoEnB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.fijado !== true, id);
    paso("un campo del Inspector cambia el objeto en el servidor (B lo ve)", ocultoEnB && visibleEnB && nombreEnB && ancladoEnB && sueltoEnB, { ocultoEnB, visibleEnB, nombreEnB, ancladoEnB, sueltoEnB });
    const titulo = await a.evaluate(() => document.querySelector("#ficha-objeto h3").textContent);
    paso("el título de la tarjeta sigue al nombre nuevo", titulo === "Mesa de ajustes", { titulo });
    await a.evaluate(() => document.activeElement?.blur());
    await a.keyboard.press("Escape"); // closes the Inspector
    const ficha2 = await a.evaluate(() => document.getElementById("ficha-objeto").hidden);
    await a.keyboard.press("Escape"); // deselects
    paso("tarjeta oculta sin objeto elegido", await a.waitForFunction(() => document.getElementById("ficha-objeto").hidden, null, { timeout: 3000 }).then(() => !ficha2, () => false));
    await a.mouse.click(centro.x, centro.y);
    await a.waitForFunction((k) => globalThis.__numinia.constructor.estado.seleccionado === k, id, { timeout: 3000 });
    // 4. drag the X handle (red arrow) to the right → B sees x change
    const ejeX = [];
    for (let t = 0.2; t <= 4; t += 0.1) ejeX.push([o0.x + t, 0, o0.z]);
    const asaX = await buscarAsa(a, "X", ejeX);
    paso("asa X bajo el ratón", !!asaX, { asaX });
    const ocupadoX = await arrastrar(a, asaX, 90, 0);
    await a.waitForTimeout(400);
    const finX = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), id); // what A shows after the release
    const movidoEnB = await esperaB(([k, f]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - f.x) < 0.01; }, id, finX);
    const o1 = await deB(id);
    paso("mover con el gizmo llega a B", movidoEnB && Math.abs(o1.x - o0.x) >= 0.4 && o1.z === o0.z && o1.y === o0.y, { x0: o0.x, x1: o1.x, enA: finX?.x });
    paso("dibuja mientras arrastra", ocupadoX);
    await a.waitForTimeout(1200); // the server keeps moves less than 1 s apart as one change (H1): next drag = new step
    // 5. key 3 (girar), drag the Y ring (between X and Z, where no other ring passes) → B sees ry change
    await a.keyboard.press("Digit3");
    await a.waitForFunction(() => globalThis.__numinia.view.editor.estado().herramienta === "girar", null, { timeout: 3000 });
    await a.waitForTimeout(300);
    const anillo = [];
    for (let t = 0.3; t <= 4; t += 0.1) anillo.push([o1.x + t * Math.SQRT1_2, 0, o1.z + t * Math.SQRT1_2]);
    const asaY = await buscarAsa(a, "Y", anillo);
    paso("anillo Y bajo el ratón", !!asaY, { asaY });
    await arrastrar(a, asaY, 70, 0);
    await a.waitForTimeout(400);
    const finY = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), id);
    const giradoEnB = await esperaB(([k, f]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.ry - f.ry) < 0.05; }, id, finY);
    const o2 = await deB(id);
    paso("girar con el gizmo llega a B", giradoEnB && Math.abs(o2.ry) >= 1 && o2.x === o1.x, { ry: o2.ry, enA: finY?.ry });
    // 6. Ctrl+Z, Ctrl+Z (each drag is one step), Ctrl+Shift+Z, Ctrl+Y — B sees every step
    const igual = ([k, w]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - w.x) < 0.01 && Math.abs(o.ry - w.ry) < 0.05; };
    await a.keyboard.press("Control+KeyZ");
    const u1 = await esperaB(igual, id, { x: o1.x, ry: o1.ry });
    await a.keyboard.press("Control+KeyZ");
    const u2 = await esperaB(igual, id, { x: o0.x, ry: o0.ry });
    await a.keyboard.press("Control+Shift+KeyZ");
    const r1 = await esperaB(igual, id, { x: o1.x, ry: o1.ry });
    await a.keyboard.press("Control+KeyY");
    const r2 = await esperaB(igual, id, { x: o2.x, ry: o2.ry });
    paso("deshacer y rehacer llegan a B", u1 && u2 && r1 && r2, { deshacerGiro: u1, deshacerMover: u2, rehacerMover: r1, rehacerGiro: r2 });
    if (process.env.SHOTS === "1") await a.screenshot({ path: `e2e-constructor-${engine}.png` });
    // C3: closing the builder hides the card even with the selection kept; opening it brings it back
    await a.keyboard.press("KeyC");
    const cerrada = await a.waitForFunction(() => document.getElementById("panel-construir").hidden && document.getElementById("ficha-objeto").hidden, null, { timeout: 3000 }).then(() => true, () => false);
    await a.keyboard.press("KeyC");
    const vuelve = await a.waitForFunction(() => !document.getElementById("ficha-objeto").hidden, null, { timeout: 3000 }).then(() => true, () => false);
    paso("la tarjeta se oculta al cerrar el constructor y vuelve al abrirlo", cerrada && vuelve, { cerrada, vuelve });
    // C3: «Ir» in the map (the hook main.ts wires): builder open → that object is selected and its card opens by itself;
    // builder closed → «Ir» only travels (nothing selected, no card)
    await a.keyboard.press("Escape");
    const alIrAbierto = await a.evaluate((k) => { const n = globalThis.__numinia; return n.constructorUI.alIr({ id: k }); }, id);
    const fichaIr = await a.waitForFunction((k) => globalThis.__numinia.constructor.estado.seleccionado === k && !document.getElementById("ficha-objeto").hidden, id, { timeout: 3000 }).then(() => true, () => false);
    await a.keyboard.press("KeyC"); // close; the selection stays but the builder is shut
    await a.keyboard.press("KeyC"); await a.keyboard.press("Escape"); await a.keyboard.press("KeyC");
    const alIrCerrado = await a.evaluate((k) => globalThis.__numinia.constructorUI.alIr({ id: k }), id);
    const sinFicha = await a.evaluate(() => document.getElementById("ficha-objeto").hidden);
    paso("«Ir» abre la ficha solo con el constructor abierto", alIrAbierto && fichaIr && !alIrCerrado && sinFicha, { alIrAbierto, fichaIr, alIrCerrado, sinFicha });
    await a.keyboard.press("KeyC");
    await a.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 3000 });
    // the card's «Tamaño» field: one number for the three scales, applied on the server (B sees it)
    await a.evaluate((k) => globalThis.__numinia.constructor.seleccionar(k), id);
    await a.waitForFunction(() => !document.getElementById("ficha-objeto").hidden, null, { timeout: 3000 });
    await a.locator("#ficha-objeto input[data-k=u]").fill("2");
    await a.keyboard.press("Enter"); await a.locator("#ficha-objeto input[data-k=u]").blur();
    const tamano = await esperaB(([k]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && o.sx === 2 && o.sy === 2 && o.sz === 2; }, id);
    paso("el tamaño de la tarjeta llega a B", tamano, { o: await deB(id) });
    // 7. Delete removes it; B sees it gone
    await a.keyboard.press("Delete");
    const borrado = await esperaB(([k]) => !globalThis.__numinia.session.features.stateOf("objetos").has(k), id);
    paso("Supr lo borra para todos", borrado);
    id = "";
    // C3: a world where building is off (BASE_SIN): no card, whatever the keys do
    if (process.env.BASE_SIN) {
      const c = await ctx.newPage();
      c.on("pageerror", (e) => errors.push(String(e)));
      await c.goto(process.env.BASE_SIN + (process.env.BASE_SIN.includes("?") ? "&" : "?") + "pulso=2000");
      await c.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
      await c.mouse.move(400, 300); await c.keyboard.press("KeyC"); await c.waitForTimeout(800);
      const sin = await c.evaluate(() => ({ puede: globalThis.__numinia.constructor.estado.puede, panel: document.getElementById("panel-construir").hidden, ficha: document.getElementById("ficha-objeto").hidden }));
      paso("mundo sin permiso de construir: sin ficha", !sin.puede && sin.panel && sin.ficha, sin);
      await c.close();
    }
    r.ok = errors.length === 0;
  } catch (e) {
    r.error = String(e).split("\n")[0].slice(0, 300);
  } finally {
    if (id && a) await a.evaluate((k) => { const c = globalThis.__numinia.constructor; c.seleccionar(k); c.borrar(); }, id).catch(() => {}); // clean up after a failure
    r.errors = errors;
    await browser.close();
  }
  return r;
}

const resultados = [];
for (const e of ENGINES) resultados.push(await pierna(e));
const ok = resultados.length > 0 && resultados.every((x) => x.ok);
console.log(JSON.stringify(resultados, null, 1));
console.log(ok ? "E2E CONSTRUCTOR OK" : "E2E CONSTRUCTOR FALLA");
process.exit(ok ? 0 : 1);
