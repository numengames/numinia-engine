// e2e leg (N4, pesca en todas partes): the same pond fished three ways, each by a new guest.
//  1. MÓVIL (390×844, touch): walk onto the boardwalk, TAP the «Pescar» prompt; the HUD fits the screen, its «Recoger»
//     button is big (≥ 48 px) and does not cover the stick or «Saltar»; a real touch held on it reels (aria-pressed)
//     and hooks at the bite; the hint speaks touch. The fight is then played to the end; a fish lands.
//  2. PC + MANDO (an emulated standard gamepad): the hint says «A (o RT)»; A at the «pescar» prompt casts; A held at the
//     bite hooks; the whole fight is played with A only; a fish lands. Cast again and B lets go.
//  3. VR (IWER as a Quest 3): a rod stands on a holder on the boardwalk; the right controller at its handle makes it
//     glow, the grip takes it (in the real hand); a flick forward casts (a float lands); at the bite a sharp lift hooks;
//     the trigger reels the fight to the end; the rod buzzes (haptics) and a gauge above it says what to do. Grip
//     again: the rod is back on its holder. The bite and the catch SOUND (hud.dataset.sonidos), the nibble too when it came. Then with TRACKED HANDS: a pinch at the handle takes it, a flick casts, a
//     pinch at the holder puts it back (after letting go). 0 page errors.
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE; SHOTS=<folder> saves pictures. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&");
const SHOTS = process.env.SHOTS ?? "";
const SOLO = process.env.SOLO ?? ""; // movil | mando | vr: run one part only (debugging)
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
async function movil() {
  const { ctx, p } = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const r = {};
  try {
    r.tactil = await ctl(p, () => matchMedia("(pointer: coarse)").matches);
    r.pantalan = await alPantalan(p);
    r.prompt = await ctl(p, () => document.getElementById("interactuar").textContent);
    await p.tap("#interactuar");
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000);
    await esperar(p, () => !document.getElementById("pesca-hud").hidden, null, 4000);
    await p.waitForTimeout(300);
    r.layout = await ctl(p, () => {
      const R = (el) => { if (!el || el.hidden || getComputedStyle(el).display === "none") return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null; };
      const hud = R(document.getElementById("pesca-hud")), boton = R(document.getElementById("pesca-recoger"));
      // the other touch controls on screen (the stick, «Saltar», the chat/menu bar) must not sit under the HUD
      const otros = [...document.querySelectorAll("#hud button, #hud [id*=stick], #hud [class*=stick], #saltar, #stick, .stick, #joystick")]
        .filter((el) => !el.closest("#pesca-hud") && el.id !== "interactuar").map((el) => ({ id: el.id || el.className, r: R(el) })).filter((x) => x.r);
      const cruza = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      return { vw: innerWidth, vh: innerHeight, hud, boton, pista: document.querySelector("#pesca-hud .pista")?.textContent, tapados: otros.filter((o) => cruza(o.r, hud)).map((o) => o.id) };
    });
    await foto(p, "movil-espera");
    // a real touch held on «Recoger»: aria-pressed follows, and lifting the finger lets go
    await esperar(p, () => ["picada", "pelea", "nada"].includes(globalThis.__numinia.pesca.estado().fase), null, 14000);
    r.picada = await fase(p);
    const b = r.layout.boton, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "pelea", null, 3000).catch(() => {});
    r.pelea = await fase(p);
    r.pulsado = await ctl(p, () => document.getElementById("pesca-recoger").getAttribute("aria-pressed"));
    await foto(p, "movil-pelea");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p.waitForTimeout(200);
    r.suelto = await ctl(p, () => document.getElementById("pesca-recoger").getAttribute("aria-pressed"));
    r.fin = await pelearCon(p, "pagina");
    r.cesta = await ctl(p, () => globalThis.__numinia.pesca.estado().cesta.peces);
    r.panel = await ctl(p, () => document.querySelector("#pesca-hud .resultado .titulo")?.textContent);
    await foto(p, "movil-resultado");
  } catch (e) { r.error = String(e?.message ?? e); }
  await ctx.close();
  const L = r.layout;
  r.ok = !!(r.tactil && /^Pescar/.test(r.prompt ?? "") && L && L.hud.x >= 0 && L.hud.x + L.hud.w <= L.vw && L.hud.y + L.hud.h <= L.vh && L.boton.h >= 48 && L.boton.w >= 120
    && L.tapados.length === 0 && /Mantén «Recoger»/.test(L.pista) && r.picada === "picada" && r.pelea === "pelea" && r.pulsado === "true" && r.suelto === "false"
    && r.fin.fase === "nada" && r.cesta >= 1 && r.panel === "¡Pescado!" && !r.error);
  out.movil = r; nota("móvil", { ok: r.ok });
}

// ---------------------------------------------------------------- 2. PC + MANDO ----------------------------------------------------------------
const PAD = `globalThis.__pad = { id: "Emulated standard pad", index: 0, connected: true, mapping: "standard", timestamp: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null };
  Object.defineProperty(navigator, "getGamepads", { value: () => [globalThis.__pad, null, null, null], configurable: true });
  globalThis.__boton = (i, v) => { const b = globalThis.__pad.buttons[i]; b.pressed = v > 0.5; b.value = v; b.touched = v > 0; };`;
async function mando() {
  const { ctx, p } = await abrir({}, PAD);
  const r = {};
  try {
    await ctl(p, () => dispatchEvent(new Event("gamepadconnected")));
    r.pantalan = await alPantalan(p);
    await ctl(p, () => globalThis.__boton(0, 1)); await p.waitForTimeout(200); await ctl(p, () => globalThis.__boton(0, 0));
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000);
    r.lanzado = true;
    r.pista = await ctl(p, () => document.querySelector("#pesca-hud .pista")?.textContent);
    // at the bite, A held hooks (watched in the page: the hook window is short)
    r.engancha = await ctl(p, () => new Promise((res) => {
      const P = globalThis.__numinia.pesca, t = Date.now();
      const id = setInterval(() => {
        const f = P.estado().fase;
        if (f === "picada") globalThis.__boton(0, 1);
        if (f === "pelea" || f === "nada" || Date.now() - t > 16000) { clearInterval(id); res({ f, recogiendo: P.estado().recogiendo }); }
      }, 30);
    }));
    r.fin = await pelearCon(p, "mando");
    r.cesta = await ctl(p, () => globalThis.__numinia.pesca.estado().cesta.peces);
    await foto(p, "mando-resultado");
    // cast again, then B lets go of the rod
    await esperar(p, () => !document.getElementById("interactuar").hidden, null, 6000);
    await ctl(p, () => globalThis.__boton(0, 1)); await p.waitForTimeout(200); await ctl(p, () => globalThis.__boton(0, 0));
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase !== "nada", null, 4000);
    await ctl(p, () => globalThis.__boton(1, 1)); await p.waitForTimeout(200); await ctl(p, () => globalThis.__boton(1, 0));
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "nada", null, 4000).catch(() => {});
    r.trasB = await fase(p);
  } catch (e) { r.error = String(e?.message ?? e); }
  await ctx.close();
  r.ok = !!(r.lanzado && /A \(o RT\)/.test(r.pista ?? "") && r.engancha?.f === "pelea" && r.fin?.fase === "nada" && r.cesta >= 1 && r.trasB === "nada" && !r.error);
  out.mando = r; nota("mando", { ok: r.ok });
}

// ---------------------------------------------------------------- 3. VR ----------------------------------------------------------------
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
const sonidoOk = (s = [], z = []) => s.includes("picada") && s.lastIndexOf("exito") > s.indexOf("picada") && (!z.some(([, , ph]) => ph === "mordisqueo") || s.includes("mordisqueo"));
async function vr() {
  const { ctx, p } = await abrir({}, XR);
  const r = {};
  try {
    r.pantalan = await alPantalan(p);
    await esperar(p, () => getComputedStyle(document.getElementById("vr")).display !== "none", null, 8000);
    // the emulated Quest 3 draws two 2064×2208 eyes in software: a quarter of that keeps the frames coming on a busy
    // machine (the gestures are measured per frame; what is tested is the input, not swiftshader's fill rate)
    await ctl(p, () => { try { globalThis.__numinia.view.renderer.xr.setFramebufferScaleFactor(0.25); } catch { /* not every renderer lets it */ } });
    await ctl(p, () => document.getElementById("vr").click());
    await esperar(p, () => globalThis.__numinia.view.vr.active, null, 15000);
    await p.waitForTimeout(800);
    // count the rod's haptic pulses
    await ctl(p, () => { const m = globalThis.__numinia.view.manos, v = m.vibrar.bind(m); globalThis.__zumbidos = []; m.vibrar = (l, f, ms) => { globalThis.__zumbidos.push([l, Math.round((f ?? 0.5) * 100) / 100, globalThis.__numinia.pesca.estado().fase]); return v(l, f, ms); }; });
    await ctl(p, () => { let ultimo = performance.now(); globalThis.__huecos = []; globalThis.__numinia.view.pesca.cadaCuadro(() => { const n = performance.now(); if (n - ultimo > 150) globalThis.__huecos.push([Math.round(n - ultimo), globalThis.__numinia.pesca.estado().fase]); ultimo = n; }); });
    r.fps = await ctl(p, () => new Promise((res) => { let n = 0; const parar = globalThis.__numinia.view.pesca.cadaCuadro(() => n++); setTimeout(() => { parar(); res(n / 2); }, 2000); }));
    r.soporte = await ctl(p, () => globalThis.__numinia.view.pesca.soporte("estanque"));
    r.antes = await contar(p);
    // the right controller at the handle: it glows; the grip takes the rod
    await ctl(p, (s) => globalThis.__poner(globalThis.__iwer.controllers.right, s), r.soporte);
    await esperar(p, () => globalThis.__numinia.view.pesca.contar().resaltado === "estanque", null, 5000).catch(() => {});
    r.resaltado = (await contar(p)).resaltado;
    await foto(p, "vr-1-soporte");
    await ctl(p, () => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 1)); await p.waitForTimeout(450);
    await ctl(p, () => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0)); await p.waitForTimeout(250);
    r.cogida = await contar(p);
    r.rayo = await ctl(p, () => globalThis.__numinia.view.manos.estado().der?.rayo ?? null);
    // a flick forward casts; at the bite a sharp lift hooks; the trigger plays the fight. Up to 5 casts: on a loaded
    // machine a frame can take most of a second and the 1.2 s hook window passes (what is checked is that each step
    // is possible with the hands, not the swiftshader frame rate)
    r.intentos = [];
    const reposo = () => ctl(p, () => { const me = globalThis.__numinia.session.selfPosition(1), m = globalThis.__numinia.view.pesca.mirada() ?? { x: 0, z: -1 }; globalThis.__poner(globalThis.__iwer.controllers.right, { x: me.x + m.x * 0.5 + 0.2, y: me.y + 1.0, z: me.z + m.z * 0.5 }); });
    for (let i = 0; i < 5 && !r.cesta; i++) {
      const it = {};
      await ctl(p, () => globalThis.__lanzar(globalThis.__iwer.controllers.right));
      await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000).catch(() => {});
      it.lance = await fase(p);
      await reposo();
      if (it.lance !== "espera") { it.rastro = await ctl(p, () => globalThis.__numinia.pescaPagina().manos.rastro().slice(-12)); r.intentos.push(it); continue; }
      r.trasLance = "espera";
      await p.waitForTimeout(600);
      if (!r.espera) { r.espera = await contar(p); await foto(p, "vr-2-lanzada"); }
      it.engancha = await ctl(p, () => new Promise((res) => {
        const P = globalThis.__numinia.pesca, t = Date.now();
        let alzado = false;
        const id = setInterval(async () => {
          const f = P.estado().fase;
          if (f === "picada" && !alzado) { alzado = true; await globalThis.__levantar(globalThis.__iwer.controllers.right); }
          if (f === "pelea" || f === "nada" || Date.now() - t > 16000) { clearInterval(id); res({ f, alzado, rastro: f === "pelea" ? undefined : globalThis.__numinia.pescaPagina().manos.rastro().filter((x) => x[4] === "picada" || x[3]).slice(-30) }); }
        }, 30);
      }));
      if (it.engancha.f === "pelea") {
        r.engancha = it.engancha;
        const peleando = pelearCon(p, "vr");
        await p.waitForTimeout(500);
        if (!r.medidor?.medidor) { r.medidor = await contar(p); await foto(p, "vr-3-pelea"); }
        it.fin = r.fin = await peleando;
        it.log = await ctl(p, () => (globalThis.__log ?? []).filter((_, i) => i % 4 === 0).slice(0, 30)); await ctl(p, () => { globalThis.__log = []; });
      }
      r.cesta = await ctl(p, () => globalThis.__numinia.pesca.estado().cesta.peces);
      await reposo();
      r.intentos.push(it);
      await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "nada", null, 4000).catch(() => {});
      await p.waitForTimeout(800);
    }
    r.zumbidos = await ctl(p, () => globalThis.__zumbidos);
    r.sonidos = await ctl(p, () => (document.getElementById("pesca-hud").dataset.sonidos ?? "").split(",").filter(Boolean)); // what played, in order (pesca-sonido.ts)
    r.huecos = await ctl(p, () => globalThis.__huecos.slice(0, 40)); // frames slower than 150 ms (a loaded machine), with the phase
    // grip again: the rod goes back on its holder
    await ctl(p, () => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 1)); await p.waitForTimeout(450);
    await ctl(p, () => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0)); await p.waitForTimeout(250);
    r.devuelta = await contar(p);
    // tracked hands: a pinch at the handle takes it, a flick casts, let go, a pinch at the holder puts it back
    await ctl(p, () => { globalThis.__iwer.primaryInputMode = "hand"; });
    await esperar(p, () => globalThis.__numinia.view.manos.estado().izq?.tipo === "mano", null, 6000).catch(() => {});
    await ctl(p, (s) => globalThis.__poner(globalThis.__iwer.hands.right, s), r.soporte);
    await p.waitForTimeout(400);
    await ctl(p, () => globalThis.__iwer.hands.right.updatePinchValue(1)); await p.waitForTimeout(450);
    await ctl(p, () => globalThis.__iwer.hands.right.updatePinchValue(0)); await p.waitForTimeout(250);
    r.mano = await contar(p);
    r.trasPinza = await ctl(p, () => globalThis.__numinia.view.manos.entrada("der"));
    r.manoFase = await fase(p); // taking it with a pinch is not a cast
    if (r.manoFase !== "nada") r.manoRastro = await ctl(p, () => globalThis.__numinia.pescaPagina().manos.rastro().filter((x) => x[3] || Math.abs(x[1]) > 1.5 || Math.abs(x[2]) > 1.5));
    await ctl(p, () => globalThis.__lanzar(globalThis.__iwer.hands.right));
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000).catch(() => {});
    r.manoLance = await fase(p);
    await ctl(p, () => globalThis.__numinia.pesca.soltar());
    await esperar(p, () => globalThis.__numinia.pesca.estado().fase === "nada", null, 4000).catch(() => {});
    await ctl(p, (s) => globalThis.__poner(globalThis.__iwer.hands.right, s), r.soporte);
    await p.waitForTimeout(400);
    r.alcanceDevolver = await ctl(p, () => ({ a: globalThis.__numinia.view.pesca.alAlcance(true), fase: globalThis.__numinia.pesca.estado().fase }));
    await ctl(p, () => globalThis.__iwer.hands.right.updatePinchValue(1)); await p.waitForTimeout(450);
    r.devolverPinza = await ctl(p, () => ({ entrada: globalThis.__numinia.view.manos.entrada("der"), fase: globalThis.__numinia.pesca.estado().fase, a: globalThis.__numinia.view.pesca.alAlcance(true), rastro: globalThis.__numinia.pescaPagina().manos.rastro().slice(-3) }));
    await ctl(p, () => globalThis.__iwer.hands.right.updatePinchValue(0)); await p.waitForTimeout(250);
    r.manoDevuelta = await contar(p);
    await ctl(p, () => globalThis.__numinia.view.vr.exit());
    await esperar(p, () => !globalThis.__numinia.view.vr.active, null, 8000).catch(() => {});
  } catch (e) { r.error = String(e?.message ?? e); }
  await ctx.close();
  const z = r.zumbidos ?? [];
  r.ok = !!(r.antes?.soportes >= 1 && r.resaltado === "estanque" && r.cogida?.sujeta === "der" && r.cogida.canaMano && r.rayo === false
    && r.trasLance === "espera" && r.espera?.pescadores === 1 && !r.espera.canaMano
    && r.engancha?.f === "pelea" && r.medidor?.medidor && /Pelea|Afloja|tirar|Arrancada/.test(r.medidor.medidorTexto)
    && r.fin?.fase === "nada" && r.fin.medidor > 3 && r.cesta >= 1
    && z.some(([, f, ph]) => ph === "picada" && f >= 0.9) && sonidoOk(r.sonidos, z) && z.filter(([, , ph]) => ph === "pelea").length >= 3
    && r.devuelta?.sujeta === null && !r.devuelta.canaMano
    && r.mano?.sujeta === "der" && r.manoFase === "nada" && r.manoLance === "espera" && r.manoDevuelta?.sujeta === null && !r.error);
  out.vr = r; nota("vr", { ok: r.ok });
}

try {
  if (!SOLO || SOLO === "movil") await movil();
  if (!SOLO || SOLO === "mando") await mando();
  if (!SOLO || SOLO === "vr") await vr();
} catch (e) { errors.push("leg: " + String(e?.message ?? e)); }
await browser.close();
const ok = (SOLO ? [out[SOLO]] : [out.movil, out.mando, out.vr]).every((x) => x?.ok) && errors.length === 0;
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "PESCA-TODAS OK" : "PESCA-TODAS FALLA");
process.exit(ok ? 0 : 1);
