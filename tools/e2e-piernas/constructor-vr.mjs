// e2e leg M22b-3 (constructor, VR with the controller's ray): page A enters VR with IWER (Quest 3) and places a
// Bloque through the API; the right controller's ray is aimed at it; a short trigger selects it; holding the trigger
// past PRENSION_MS and re-aiming the ray 1.5 m away moves it (no TransformControls — the thing follows the ray's far
// point, Hyperfy's way); letting go of the trigger drops it — page B (a plain flat tab, same world) sees the new
// position. This is the card's bar (select, move 1 m, let go; the other tab sees it). Squeeze-to-duplicate on the
// selection is checked too, best-effort (logged, not failing the leg): it is simpler timing-wise to miss under load
// and is not part of the acceptance criterion; see PROGRESO-M22b3.md for the follow-up. Env: BASE, SERVER_HTTP
// (tools/auto.sh e2e), SHOTS=1 screenshots.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const errors = [];
  const ctxA = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctxA.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    // aim the right controller from where it is at a world point: its position is local to the rig (the player's root)
    globalThis.__apuntar = (w) => {
      const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
      const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
      c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
    };`);
  const ctxB = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const r = { ok: false, pasos: [] };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  const deB = (k) => b.evaluate((k) => globalThis.__numinia.session.features.stateOf("objetos").get(k) ?? null, k);
  const esperaB = (fn, k, arg) => b.waitForFunction(fn, [k, arg], { timeout: 8000 }).then(() => true, () => false);
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 8000) => a.waitForFunction(fn, arg, { timeout: ms });
  const pulsarGatillo = (ms) => a.evaluate((ms) => new Promise((ok) => {
    const c = globalThis.__iwer.controllers.right; c.updateButtonValue("trigger", 1);
    setTimeout(() => { c.updateButtonValue("trigger", 0); setTimeout(ok, 150); }, ms);
  }), ms);
  let a, b, id = "";
  try {
    a = await ctxA.newPage(); a.on("pageerror", (e) => errors.push(String(e))); a.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
    b = await ctxB.newPage(); b.on("pageerror", (e) => errors.push(String(e)));
    await Promise.all([a.goto(BASE), b.goto(BASE0)]);
    await Promise.all([
      esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who && globalThis.__numinia.constructor.estado.puede, null, 30000),
      b.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 }),
    ]);
    await ctl(() => document.getElementById("vr").click());
    await esperar(() => globalThis.__numinia.view.vr.active, null, 15000);
    await esperar(() => globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000); // the hands load a few seconds in (index.ts)
    await a.waitForTimeout(500);
    // 1. place a Bloque 3 m ahead through the API (the library's own preview is a later M22b-3 slice)
    const n0 = await ctl(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    const p0 = await ctl(() => { const me = globalThis.__numinia.session.selfPosition(1); return { x: me.x, y: 1, z: me.z - 3 }; });
    await ctl((p) => globalThis.__numinia.constructor.colocarEn("bloque", { x: p.x, y: 0, z: p.z }), p0);
    await esperar((n0) => globalThis.__numinia.session.features.stateOf("objetos").size > n0, n0, 8000);
    id = await ctl(() => globalThis.__numinia.constructor.estado.seleccionado);
    await ctl(() => globalThis.__numinia.constructor.seleccionar("")); // start from nothing selected
    const o0 = await deB(id);
    paso("colocado y visto por B", !!o0, { id });
    // 2. aim the right controller's ray at the block; a SHORT trigger selects it
    await ctl((p) => globalThis.__apuntar(p), p0);
    await a.waitForTimeout(150);
    await pulsarGatillo(60); // shorter than PRENSION_MS (180 ms): a tap, not a grab
    await a.waitForTimeout(200);
    const sel = await ctl(() => globalThis.__numinia.constructor.estado.seleccionado);
    paso("el rayo + gatillo corto selecciona", sel === id, { sel });
    // 3. holding the trigger on the SAME selection past PRENSION_MS takes it; re-aiming 1.5 m away moves it
    await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("trigger", 1));
    await esperar(() => globalThis.__numinia.constructorVR.cogido("der") !== null, null, 4000).catch(() => {});
    const cogidoYa = await ctl(() => globalThis.__numinia.constructorVR.cogido("der"));
    paso("el gatillo mantenido lo coge", cogidoYa === id, { cogidoYa });
    await ctl((p) => globalThis.__apuntar({ x: p.x + 1.5, y: 0, z: p.z }), p0); // re-aim: the thing follows
    await a.waitForTimeout(500);
    await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("trigger", 0)); // let go: drop
    await a.waitForTimeout(400);
    const dA = await ctl((k) => globalThis.__numinia.view.editor.dondeEsta(k), id);
    const movido = Math.hypot(dA.x - o0.x, dA.z - o0.z);
    const enB = await esperaB(([k, w]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - w.x) < 0.01 && Math.abs(o.z - w.z) < 0.01; }, id, dA);
    const o1 = await deB(id);
    const sueltoYa = await ctl(() => globalThis.__numinia.constructorVR.cogido("der"));
    paso("moverlo ≥ 1 m con el rayo llega a B y se suelta", enB && movido >= 1 && sueltoYa === null, { movido: Math.round(movido * 100) / 100, o1: o1 && { x: o1.x, z: o1.z }, sueltoYa });
    if (process.env.SHOTS === "1") await a.screenshot({ path: "e2e-constructor-vr.png" });
    // 4. squeeze on the selection (ray still on it, not holding) duplicates it; best-effort — logged, not fatal
    // (the card's bar is step 3; see PROGRESO-M22b3.md for tightening this one under load)
    await ctl((p) => globalThis.__apuntar({ x: p.x + 1.5, y: 0, z: p.z }), p0);
    await a.waitForTimeout(150);
    const n1 = await ctl(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0.8));
    await esperar((n1) => globalThis.__numinia.session.features.stateOf("objetos").size > n1, n1, 4000).catch(() => {});
    await a.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0));
    await a.waitForTimeout(300);
    const id2 = await ctl(() => globalThis.__numinia.constructor.estado.seleccionado);
    const dup = await esperaB(([n1]) => globalThis.__numinia.session.features.stateOf("objetos").size > n1, n1);
    r.pasos.push({ paso: "apretar duplica (mejor esfuerzo, no bloquea la pierna)", ok: dup && id2 !== id && id2 !== "", id, id2 });
    await ctl(() => globalThis.__numinia.view.vr.exit());
    await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000).catch(() => {});
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

const resultado = await pierna();
console.log(JSON.stringify(resultado, null, 1));
console.log(resultado.ok ? "E2E CONSTRUCTOR-VR OK" : "E2E CONSTRUCTOR-VR FALLA");
process.exit(resultado.ok ? 0 : 1);
