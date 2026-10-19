// e2e leg rediseño v2 story E (the VR wrist watch and menu, maquetas p6/p7): page A enters VR with IWER (Quest 3);
// the left controller is turned so the back of the wrist faces the eyes (the head pitched down to look at it) → the
// watch shows on the wrist with «Menú» and its four buttons; the right controller's ray on «Menú» + a trigger press
// opens the menu panel still in front of you at ~1.2 m with the computer's seven sections; the ray on «Gente» changes
// section; B closes it; lowering the wrist hides the watch. Not a Quest: IWER only. Env: BASE, SERVER_HTTP
// (tools/auto.sh e2e); CANVAS=<dir> also writes the watch's and the menu's canvases there (vr-reloj.png,
// vr-menu-<section>.png) — IWER draws the scene poorly, so the pictures are the canvases themselves.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");
const CANVAS = process.env.CANVAS ?? "";
const ID_SECCION = (i) => 10 + i; // menu-vr.ts idSeccion

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    // the quaternion turning unit vector a onto unit vector b (THREE's setFromUnitVectors), as [x, y, z, w]
    const giro = (a, b) => { const d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; let x = a[1]*b[2]-a[2]*b[1], y = a[2]*b[0]-a[0]*b[2], z = a[0]*b[1]-a[1]*b[0], w = 1 + d;
      if (w < 1e-6) { x = 0; y = 0; z = 1; w = 0; } const n = Math.hypot(x, y, z, w); return [x/n, y/n, z/n, w/n]; };
    // look at your left wrist like at a watch: head pitched 40° down, the wrist 0.42 m along that gaze, the back of
    // the controller (its −X: muneca-gesto.ts normalDorsoLocal) towards the eyes
    globalThis.__mirarMuneca = () => {
      const d = globalThis.__iwer, h = d.position, p = -40 * Math.PI / 180;
      d.quaternion.set(Math.sin(p / 2), 0, 0, Math.cos(p / 2));
      const g = [0, Math.sin(p), -Math.cos(p)], L = 0.42, c = d.controllers.left;
      c.position.set(h.x + g[0] * L, h.y + g[1] * L, h.z + g[2] * L);
      const q = giro([-1, 0, 0], [-g[0], -g[1], -g[2]]); c.quaternion.set(q[0], q[1], q[2], q[3]);
      // the other hand between the eyes and the watch, to its right (the watch's glass faces the eyes: front side only)
      const r = d.controllers.right; r.position.set(h.x + 0.15, h.y - 0.12, h.z - 0.12);
    };
    globalThis.__bajarMuneca = () => { const d = globalThis.__iwer, h = d.position; d.quaternion.set(0, 0, 0, 1);
      const c = d.controllers.left; c.position.set(h.x - 0.2, h.y - 0.8, h.z - 0.1); c.quaternion.set(0, 0, 0, 1); };
    // aim the right controller from where it is at a world point: its position is local to the rig (the player's root)
    globalThis.__apuntar = (w) => {
      const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
      const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
      c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
    };`);
  const ctxB = await browser.newContext({ viewport: { width: 640, height: 400 } }); // someone else here, for «Gente»
  const r = { ok: false, pasos: [] };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  let a, b;
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 8000) => a.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const boton = (b, nombre, v) => a.evaluate(([b, nombre, v]) => globalThis.__iwer.controllers[b].updateButtonValue(nombre, v), [b, nombre, v]);
  const gatillo = async (ms = 80) => { await boton("right", "trigger", 1); await a.waitForTimeout(ms); await boton("right", "trigger", 0); await a.waitForTimeout(200); };
  const lienzo = async (que, nombre) => {
    if (!CANVAS) return;
    const url = await ctl((que) => { const v = globalThis.__numinia.view.vr; return (que === "reloj" ? v.reloj.lienzo : v.menu.lienzo).toDataURL("image/png"); }, que);
    mkdirSync(CANVAS, { recursive: true });
    writeFileSync(`${CANVAS}/${nombre}.png`, Buffer.from(url.split(",")[1], "base64"));
  };
  try {
    a = await ctx.newPage(); a.on("pageerror", (e) => errors.push(String(e))); a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    b = await ctxB.newPage(); b.on("pageerror", (e) => errors.push("B: " + String(e)));
    await Promise.all([a.goto(BASE), b.goto(BASE0)]);
    paso("la página arranca", await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000));
    await b.waitForFunction(() => globalThis.__numinia?.probe.done && !!globalThis.__numinia.session.who, null, { timeout: 30000 });
    const nombreB = await b.evaluate(() => globalThis.__numinia.session.who.nombre);
    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR", await esperar(() => globalThis.__numinia.view.vr.active, null, 15000));
    await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(600);
    paso("con la muñeca bajada no hay reloj", !(await ctl(() => globalThis.__numinia.view.vr.reloj.visible)));
    // 1. turn the wrist towards you: the watch shows (after ABRIR.ms, 300 ms)
    await ctl(() => globalThis.__mirarMuneca());
    const visto = await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000);
    paso("girar la muñeca hacia ti enseña el reloj", visto, { reloj: await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico()) });
    const diag = await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico());
    paso("el reloj tiene Menú, micro, cámara y avisos", ["menu", "micro", "camara", "avisos"].every((b) => diag.botones.includes(b)), { botones: diag.botones });
    await a.waitForTimeout(400); await lienzo("reloj", "vr-reloj");
    // 2. the right ray on «Menú» + trigger: the menu opens in front of you, with seven sections
    const menuEn = await ctl(() => globalThis.__numinia.view.vr.reloj.botonMundo("menu"));
    await ctl((w) => globalThis.__apuntar(w), menuEn); await a.waitForTimeout(250);
    await gatillo();
    const abierto = await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 3000);
    const e = await ctl(() => globalThis.__numinia.view.vr.menu.estado());
    paso("rayo + gatillo en «Menú» abre el panel", abierto, { reloj: await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico()), e });
    paso("el panel tiene las 7 secciones del ordenador", e.secciones.map((s) => s.nombre).join("·") === "Tú·Gente·Bolsa·Misiones·Mapa·Construir·Ajustes", { secciones: e.secciones });
    paso("el panel está a ~1,2 m y empieza en «Tú»", Math.abs(e.diagnostico.distanciaM - 1.2) < 0.25 && e.vista === "tu", { diag: e.diagnostico, vista: e.vista });
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-tu");
    // 3. the ray on «Gente» + trigger changes section
    await ctl(() => globalThis.__bajarMuneca()); await a.waitForTimeout(100);
    const genteEn = await ctl((id) => globalThis.__numinia.view.vr.menu.zonaMundo(id), ID_SECCION(1));
    await ctl((w) => globalThis.__apuntar(w), genteEn); await a.waitForTimeout(250);
    await gatillo();
    paso("rayo + gatillo en «Gente» cambia de sección", await esperar(() => globalThis.__numinia.view.vr.menu.vista === "gente", null, 3000), { vista: await ctl(() => globalThis.__numinia.view.vr.menu.vista) });
    const genteOk = await esperar((n) => globalThis.__numinia.view.vr.menu.estado().filas.includes(n), nombreB, 5000);
    const eg = await ctl(() => globalThis.__numinia.view.vr.menu.estado());
    paso("«Gente» lista a quien está aquí, con «Ir a su lado»", genteOk && eg.botones >= 1, { filas: eg.filas, botones: eg.botones, nombreB });
    await a.waitForTimeout(300); await lienzo("menu", "vr-menu-gente");
    if (CANVAS) for (const [i, s] of [[2, "bolsa"], [3, "misiones"], [4, "mapa"], [6, "ajustes"]]) {
      await ctl(([i]) => globalThis.__numinia.view.vr.menu.pulsar(10 + i), [i]); await a.waitForTimeout(300); await lienzo("menu", `vr-menu-${s}`);
    }
    // 4. B closes it; the watch hides once the wrist is lowered
    await boton("right", "b-button", 1); await a.waitForTimeout(120); await boton("right", "b-button", 0);
    paso("B cierra el menú", await esperar(() => !globalThis.__numinia.view.vr.menu.abierto, null, 3000));
    paso("bajar la muñeca esconde el reloj", await esperar(() => !globalThis.__numinia.view.vr.reloj.visible, null, 4000));
    await ctl(() => globalThis.__numinia.view.vr.exit());
    await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000);
    r.ok = errors.length === 0;
  } catch (e) {
    r.error = String(e).split("\n")[0].slice(0, 400);
  } finally {
    r.errors = errors;
    await browser.close();
  }
  return r;
}

const resultado = await pierna();
console.log(JSON.stringify(resultado, null, 1));
console.log(resultado.ok ? "E2E MENU-VR OK" : "E2E MENU-VR FALLA");
process.exit(resultado.ok ? 0 : 1);
