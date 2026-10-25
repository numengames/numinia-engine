// e2e leg (MIS-200, pasar la caña de una mano a la otra): IWER as a Quest 3 on the fishing boardwalk. The right controller
// takes the rod at its holder (grip); the LEFT controller comes to the right one and presses its grip: the rod is now in
// the left hand (both controllers buzzed, the handover itself casts nothing); a flick with the LEFT controller casts (a float
// lands); while waiting, the Bolsa row «Cambiar de mano» (manos.cambiarMano)
// «Cambiar de mano» (manos.cambiarMano) passes it back to the right hand with no gesture. 0 page errors.
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE; SHOTS=<folder> saves pictures. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&");
const SHOTS = process.env.SHOTS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now();
const out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });

async function abrir(opts = {}, init = "") {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_CONNECTION|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 30000 });
  return { ctx, p };
}
const ctl = (p, code, arg) => p.evaluate(code, arg);
const esperar = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms });
const fase = (p) => ctl(p, () => globalThis.__numinia.pesca.estado().fase);
const contar = (p) => ctl(p, () => globalThis.__numinia.view.pesca.contar());
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/pesca-todas-${n}.png` }); };
async function caminar(p, x, z, cerca = 0.6, maxMs = 60000) {
  const t = Date.now();
  let d = Infinity, antes = null, lado = 0;
  while (Date.now() - t < maxMs) {
    const me = await ctl(p, () => globalThis.__numinia.session.selfPosition(1)), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (d <= cerca) break;
    // stuck against something (a wall, a stall): step aside, alternating sides, and try again
    if (antes && Math.hypot(me.x - antes.x, me.z - antes.z) < 0.15) {
      const k = Math.abs(dx) > Math.abs(dz) ? (lado++ % 2 ? "KeyW" : "KeyS") : (lado++ % 2 ? "KeyA" : "KeyD");
      await p.keyboard.down(k); await p.waitForTimeout(1500); await p.keyboard.up(k);
    }
    antes = me;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    const ms = Math.max(100, Math.min(2500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / 1.5) * 1000)); // walking is 1.5 m/s
    for (const k of held) await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    for (const k of held) await p.keyboard.up(k);
    await p.waitForTimeout(120);
  }
  return Math.round(d * 10) / 10;
}
/** Walk onto the boardwalk the lazy 3D chunk built, until the «pescar» prompt shows. */
async function alPantalan(p) {
  await esperar(p, () => globalThis.__numinia.session.features.cards().some((c) => c.feature === "pesca"), null, 10000);
  await esperar(p, () => globalThis.__numinia.view.pesca.contar().cargado && !!globalThis.__numinia.view.pesca.sitio("estanque"), null, 15000);
  const t = await ctl(p, () => globalThis.__numinia.view.pesca.sitio("estanque"));
  const d = await caminar(p, t.pantalan.x, t.pantalan.z, 0.6);
  if (process.env.DEPURAR) console.error("alPantalan", d, JSON.stringify(await ctl(p, () => { const el = document.getElementById("interactuar"); return { txt: el?.textContent, hidden: el?.hidden, me: globalThis.__numinia.session.selfPosition(1), focus: document.activeElement?.id }; })), JSON.stringify(t.pantalan));
  await esperar(p, () => /pescar/i.test(document.getElementById("interactuar")?.textContent ?? "") && !document.getElementById("interactuar").hidden, null, 6000);
  return { d, ...t };
}
/** Play the fight from the page with `poner(true|false)` (rest past 70 % tension, reel again under 45 %), until it ends. */
const pelearCon = (p, como) => ctl(p, (como) => new Promise((res) => {
  const N = globalThis.__numinia, P = N.pesca, t = Date.now();
  const poner = (v) => {
    if (como === "mando") globalThis.__pad.buttons[0].pressed = v, globalThis.__pad.buttons[0].value = v ? 1 : 0;
    else if (como === "vr") globalThis.__iwer.controllers.right.updateButtonValue("trigger", v ? 1 : 0);
    else P.recoger(v);
  };
  let recogiendo = null, max = 0, textos = new Set(), medidor = 0, rojo = 0;
  const id = setInterval(() => {
    const e = P.estado();
    max = Math.max(max, e.tension);
    textos.add(document.querySelector("#pesca-hud .que")?.textContent ?? "");
    if (como === "vr") { const c = N.view.pesca.contar(); if (c.medidor) { medidor++; textos.add("medidor: " + c.medidorTexto); } (globalThis.__log ??= []).push([Date.now() - t, e.tension, e.arrancada, e.recogiendo, recogiendo, N.view.manos.entrada("der")?.gatillo]); }
    if (e.fase === "nada" || Date.now() - t > 60000) { clearInterval(id); poner(false); res({ s: Math.round((Date.now() - t) / 100) / 10, maxTension: max, fase: e.fase, textos: [...textos].filter(Boolean), medidor }); return; }
    if (e.fase !== "pelea") return;
    const quiero = recogiendo ? e.tension < 70 && e.arrancada === "no" : e.tension < 45 && e.arrancada !== "aviso";
    if (quiero !== recogiendo) { recogiendo = quiero; poner(quiero); }
  }, 60);
}), como);

// ---------------------------------------------------------------- 1. MÓVIL ----------------------------------------------------------------
const XR = IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
  globalThis.__poner = (inp, w) => { const r = globalThis.__numinia.view.vr.rig.position; inp.position.set(w.x - r.x, w.y - r.y, w.z - r.z); inp.quaternion.set(0, 0, 0, 1); };
  // move an input from a to b (world) over ms, one step per animation frame (what a swing looks like to the headset)
  globalThis.__barrer = (inp, a, b, ms) => new Promise((res) => {
    const t = performance.now();
    const paso = () => { const k = Math.min(1, (performance.now() - t) / ms); globalThis.__poner(inp, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }); if (k < 1) requestAnimationFrame(paso); else setTimeout(res, 120); };
    paso();
  });
  // a flick of the rod forward (where the head looks), from above the shoulder
  globalThis.__lanzar = (inp) => { const N = globalThis.__numinia, m = N.view.pesca.mirada() ?? { x: 0, z: -1 }, me = N.session.selfPosition(1);
    const a = { x: me.x - m.x * 0.3 + 0.2, y: me.y + 1.9, z: me.z - m.z * 0.3 }, b = { x: me.x + m.x * 0.9 + 0.2, y: me.y + 1.3, z: me.z + m.z * 0.9 };
    return globalThis.__barrer(inp, a, b, 220); };
  globalThis.__levantar = (inp) => { const N = globalThis.__numinia, m = N.view.pesca.mirada() ?? { x: 0, z: -1 }, me = N.session.selfPosition(1);
    const a = { x: me.x + m.x * 0.5 + 0.2, y: me.y + 1.0, z: me.z + m.z * 0.5 }, b = { x: me.x + m.x * 0.3 + 0.2, y: me.y + 1.9, z: me.z + m.z * 0.3 };
    return globalThis.__barrer(inp, a, b, 220); };`;
/** The bite sounded (and the catch after it); a nibble sounded too if the rod buzzed for one (it is random: 65 % of casts). */

const sujeta = (p) => ctl(p, () => globalThis.__numinia.pescaPagina().manos.sujeta());
async function vr() {
  const { ctx, p } = await abrir({}, XR);
  const r = {};
  try {
    r.pantalan = await alPantalan(p);
    await esperar(p, () => getComputedStyle(document.getElementById("vr")).display !== "none", null, 8000);
    await ctl(p, () => { try { globalThis.__numinia.view.renderer.xr.setFramebufferScaleFactor(0.25); } catch { /* not every renderer lets it */ } });
    await esperar(p, () => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, 15000).catch(() => {}); // MIS-200 (t_9687b5fc): the entry says «Preparando…» until the world has loaded
    await ctl(p, () => document.getElementById("vr").click());
    await esperar(p, () => globalThis.__numinia.view.vr.active, null, 15000);
    await p.waitForTimeout(800);
    // count the haptic pulses each controller receives (the handover buzzes both from inside the hands layer)
    await ctl(p, () => { globalThis.__zumbidos = []; const s = globalThis.__numinia.view.renderer.xr.getSession(); for (const src of s.inputSources) { const h = src.gamepad?.hapticActuators?.[0]; if (!h) continue; const v = h.pulse.bind(h); h.pulse = (f, ms) => { globalThis.__zumbidos.push([src.handedness === "left" ? "izq" : "der", Math.round((f ?? 0.5) * 100) / 100]); return v(f, ms); }; } });
    r.soporte = await ctl(p, () => globalThis.__numinia.view.pesca.soporte("estanque"));
    // 1. the right controller takes the rod at the holder
    await ctl(p, (s) => globalThis.__poner(globalThis.__iwer.controllers.right, s), r.soporte);
    await esperar(p, () => globalThis.__numinia.view.pesca.contar().resaltado === "estanque", null, 5000).catch(() => {});
    await ctl(p, () => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 1)); await p.waitForTimeout(450);
    await ctl(p, () => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0)); await p.waitForTimeout(250);
    r.cogida = await sujeta(p);
    // 2. bring the rod hand up in front of you and the left controller next to it; the left grip hands it over
    const reposo = () => ctl(p, () => { const me = globalThis.__numinia.session.selfPosition(1), m = globalThis.__numinia.view.pesca.mirada() ?? { x: 0, z: -1 }; globalThis.__poner(globalThis.__iwer.controllers.right, { x: me.x + m.x * 0.5 + 0.2, y: me.y + 1.0, z: me.z + m.z * 0.5 }); });
    await reposo(); await p.waitForTimeout(500);
    r.zumbidosAntes = await ctl(p, () => globalThis.__zumbidos.length);
    await ctl(p, () => { const me = globalThis.__numinia.session.selfPosition(1), m = globalThis.__numinia.view.pesca.mirada() ?? { x: 0, z: -1 }; globalThis.__poner(globalThis.__iwer.controllers.left, { x: me.x + m.x * 0.5 + 0.08, y: me.y + 1.0, z: me.z + m.z * 0.5 }); });
    await p.waitForTimeout(400);
    await ctl(p, () => globalThis.__iwer.controllers.left.updateButtonValue("squeeze", 1)); await p.waitForTimeout(450);
    r.paso = await sujeta(p);
    r.lanzadoPorElPase = await fase(p);
    await ctl(p, () => globalThis.__iwer.controllers.left.updateButtonValue("squeeze", 0)); await p.waitForTimeout(300);
    r.zumbidosPase = await ctl(p, (n) => globalThis.__zumbidos.slice(n), r.zumbidosAntes);
    await foto(p, "cambiar-1-izquierda");
    // 3. cast with the LEFT controller (the right one rests)
    await ctl(p, () => globalThis.__poner(globalThis.__iwer.controllers.right, { x: 0, y: 0.2, z: 0 }));
    for (let i = 0; i < 5 && r.lance !== "espera"; i++) {
      await ctl(p, () => globalThis.__lanzar(globalThis.__iwer.controllers.left));
      await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000).catch(() => {});
      r.lance = await fase(p);
      if (r.lance !== "espera") await ctl(p, () => { const me = globalThis.__numinia.session.selfPosition(1), m = globalThis.__numinia.view.pesca.mirada() ?? { x: 0, z: -1 }; globalThis.__poner(globalThis.__iwer.controllers.left, { x: me.x + m.x * 0.5 - 0.2, y: me.y + 1.0, z: me.z + m.z * 0.5 }); });
    }
    r.pescadores = (await contar(p)).pescadores;
    r.sujetaTrasLance = await sujeta(p);
    // 4. while waiting, the button path (Bolsa › Cambiar de mano) passes it back to the right hand; the cast stays
    r.boton = await ctl(p, () => globalThis.__numinia.view.manos.cambiarMano());
    await p.waitForTimeout(300);
    r.trasBoton = { sujeta: await sujeta(p), fase: await fase(p) };
    r.filaBolsa = await ctl(p, () => { const f = globalThis.__numinia.menuVR.contenido("bolsa").filas[0]; return f && { texto: f.texto, detalle: f.detalle }; });
    await esperar(p, () => !globalThis.__numinia.view.vr.active, null, 100).catch(() => {});
  } catch (e) { r.error = String(e?.message ?? e); }
  await ctx.close();
  const z = r.zumbidosPase ?? [];
  r.ok = !!(r.cogida === "der" && r.paso === "izq" && r.lanzadoPorElPase === "nada" && z.some(([l]) => l === "izq") && z.some(([l]) => l === "der")
    && r.lance === "espera" && r.pescadores === 1 && r.sujetaTrasLance === "izq"
    && r.boton?.ok === true && r.trasBoton?.sujeta === "der" && r.trasBoton.fase === "espera" && /Cambiar de mano/.test(r.filaBolsa?.texto ?? "") && !r.error);
  out.vr = r; nota("vr", { ok: r.ok });
}

try { await vr(); } catch (e) { errors.push("leg: " + String(e?.message ?? e)); }
await browser.close();
const ok = out.vr?.ok && errors.length === 0;
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "PESCA-CAMBIAR-MANO OK" : "PESCA-CAMBIAR-MANO FALLA");
process.exit(ok ? 0 : 1);
