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
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.constructor.estado.puede, null, { timeout: 30000 });
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
    // 1. build mode with the key C: the panel shows, the gizmo arrives (dynamic import)
    await a.mouse.move(400, 300);
    await a.keyboard.press("KeyC");
    const abierto = await a.waitForFunction(() => !document.getElementById("panel-construir").hidden && globalThis.__numinia.view.editor.estado().cargado, null, { timeout: 10000 }).then(() => true, () => false);
    paso("abrir con C", abierto, { modo: await a.evaluate(() => globalThis.__numinia.constructor.estado.modo) });
    // 2. «colocar donde apuntas»: the library's Bloque follows the pointer; a click on the ground 3 m ahead places it
    const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    await a.locator('#panel-construir [aria-label="Biblioteca"] button', { hasText: "Bloque" }).click();
    const suelo = await a.evaluate(() => { const n = globalThis.__numinia, me = n.session.selfPosition(1); return { w: [me.x, 0, me.z - 3], s: n.view.editor.pantalla(me.x, 0, me.z - 3) }; });
    await a.mouse.move(suelo.s.x - 30, suelo.s.y, { steps: 3 });
    await a.mouse.move(suelo.s.x, suelo.s.y, { steps: 3 });
    await a.waitForTimeout(200);
    await a.mouse.click(suelo.s.x, suelo.s.y);
    await a.waitForFunction((n0) => { const n = globalThis.__numinia; return !!n.constructor.estado.seleccionado && n.session.features.stateOf("objetos").size > n0; }, n0, { timeout: 8000 });
    id = await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
    const enB = await esperaB(([k]) => globalThis.__numinia.session.features.stateOf("objetos").has(k), id);
    const o0 = await deB(id);
    paso("colocar donde apuntas", enB && Math.abs(o0.x - suelo.w[0]) <= 0.3 && Math.abs(o0.z - suelo.w[2]) <= 0.3 && o0.x * 2 === Math.round(o0.x * 2), { id, x: o0?.x, z: o0?.z, apuntado: suelo.w });
    await a.waitForFunction(() => globalThis.__numinia.view.objects().loaded >= globalThis.__numinia.view.objects().placed, null, { timeout: 20000 });
    await a.waitForTimeout(400);
    // 3. Esc deselects; a real click on the thing selects it; the gizmo (mover) draws more than without it
    await a.keyboard.press("Escape");
    await a.waitForTimeout(300);
    const sinGizmo = await a.evaluate(() => ({ sel: globalThis.__numinia.constructor.estado.seleccionado, calls: globalThis.__numinia.view.lastFrame().calls }));
    const centro = await a.evaluate(([x, z]) => globalThis.__numinia.view.editor.pantalla(x, 0.5, z), [o0.x, o0.z]);
    await a.mouse.click(centro.x, centro.y);
    await a.waitForTimeout(400);
    const conGizmo = await a.evaluate(() => ({ sel: globalThis.__numinia.constructor.estado.seleccionado, ed: globalThis.__numinia.view.editor.estado(), calls: globalThis.__numinia.view.lastFrame().calls }));
    paso("seleccionar con un clic", sinGizmo.sel === "" && conGizmo.sel === id && conGizmo.ed.seleccionado === id && conGizmo.ed.herramienta === "mover", { sinGizmo: sinGizmo.sel, conGizmo: conGizmo.sel });
    paso("el gizmo se dibuja", conGizmo.calls > sinGizmo.calls, { llamadasSin: sinGizmo.calls, llamadasCon: conGizmo.calls });
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
    // 7. Delete removes it; B sees it gone
    await a.keyboard.press("Delete");
    const borrado = await esperaB(([k]) => !globalThis.__numinia.session.features.stateOf("objetos").has(k), id);
    paso("Supr lo borra para todos", borrado);
    id = "";
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
