// e2e leg (dardos v1): darts in a real browser, three ways.
// 1) PC (1280×800, mouse): A waits for the board's card («lugar: Diana de la plaza»), walks to its throwing line (the
//    3D board's view.dardos.linea), the prompt says «E: tirar dardos», E opens the turn and the throwing view; three
//    times: mouse over the board, press, hold ~0.7 s (the bar beside the board near its gold window; after the release the word PERFECTO / CASI / FLOJO ↓ / FUERTE ↑ shows), release → the server lands a dart
//    (sector/ring/points), the HUD counts; after the third, «fin», the scoreboard line and the 3D board has 3 darts.
//    Tab B (another guest 8 m away) sees A's darts land (clavados) and takes them out at A's `fin`.
// 2) Phone (390×844, touch): walk to the line, tap the prompt button, then FLICK upward on the board (CDP touch
//    events): each flick throws (a slow one drops), the strength comes from the flick's speed; three darts = a turn.
// 3) AR (IWER Quest 3, a WALL 2.4 m in front at 1.5 m): «En tu pared (AR)» enters immersive-ar with the minigame (no
//    miniature), the trigger hangs the board on the wall (fase «colocada», pared: true), then hold the trigger ~0.7 s
//    and release: the dart goes along the controller's ray, the server answers, the dart is drawn on the AR board.
// No page errors anywhere. Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE, SHOTS. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SHOTS = process.env.SHOTS ?? "";
const SOLO = process.env.SOLO ?? ""; // "pc" | "movil" | "ar": only that part
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now();
const out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });

const abrir = async (opts = {}, init = "") => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("crash", () => errors.push("la página se ha caído (crash)"));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 40000 });
  return p;
};
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
async function caminar(p, x, z, cerca = 0.8, maxMs = 40000) {
  await p.bringToFront();
  const t = Date.now();
  let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (process.env.DEBUG) console.error("caminar", Math.round(me.x * 10) / 10, Math.round(me.z * 10) / 10, "→", Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    if (d <= cerca) break;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    // far: run (Shift, 4 m/s); near: walk (1.5 m/s) — the sim's RUN_SPEED/SPEED since #24 (walking used to be 4)
    const corre = Math.max(Math.abs(dx), Math.abs(dz)) > 3;
    if (corre) held.unshift("Shift");
    const ms = Math.max(90, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / (corre ? 4 : 1.5)) * 1000));
    for (const k of held) await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    for (const k of held) await p.keyboard.up(k);
    await p.waitForTimeout(120);
  }
  return Math.round(d * 10) / 10;
}
const ctl = (p, code, arg) => p.evaluate(code, arg);
const esperar = (p, fn, arg, ms = 10000) => p.waitForFunction(fn, arg, { timeout: ms });
const estado = (p) => ctl(p, () => { const e = globalThis.__numinia.dardos.estado(); return { sitio: e.sitio, dardos: e.dardos, tirada: e.tirada, ultimo: e.ultimo && { texto: e.ultimo.texto, puntos: e.ultimo.puntos, x: e.ultimo.x, y: e.ultimo.y }, fin: e.fin && { dardos: e.fin.dardos, puntos: e.fin.puntos }, aviso: e.aviso, marcador: e.marcador }; });
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/dardos-${n}.png` }); };
const prompt = (p) => ctl(p, () => { const b = document.getElementById("interactuar"); return b && !b.hidden ? b.textContent : ""; });
/** Wait for the board's card and the 3D board, then walk to its throwing line. */
async function aLaLinea(p) {
  await esperar(p, () => globalThis.__numinia.session.features.cards().some((c) => c.feature === "dardos"), null, 15000);
  await esperar(p, () => !!globalThis.__numinia.view.dardos.linea("diana"), null, 15000);
  const l = await ctl(p, () => globalThis.__numinia.view.dardos.linea("diana"));
  return { linea: l, dist: await caminar(p, l.x, l.z) };
}
const hudAbierto = (p) => ctl(p, () => !!globalThis.__numinia.dardosHud?.abierto() && !document.getElementById("dardos-hud").hidden);

const res = {};
// ---------------------------------------------------------------------------------------------------------------- PC
if (!SOLO || SOLO === "pc") try {
  const a = await abrir({ viewport: { width: 1280, height: 800 } });
  const card = await (async () => { await esperar(a, () => globalThis.__numinia.session.features.cards().some((c) => c.feature === "dardos"), null, 15000); return ctl(a, () => { const c = globalThis.__numinia.session.features.cards().find((c) => c.feature === "dardos"); return { key: c.key, role: c.role, name: c.name, at: c.at }; }); })();
  out.card = card;
  const b = await abrir();
  out.bDistancia = await caminar(b, card.at.x + 6, card.at.z - 5, 1.5);
  const { linea, dist } = await aLaLinea(a);
  nota("A en la línea", { linea, dist });
  await esperar(a, () => /dardos/i.test(document.getElementById("interactuar")?.textContent ?? ""), null, 8000).catch(() => {});
  res.pcPrompt = await prompt(a);
  await foto(a, "pc-0-diana-en-la-plaza");
  await a.keyboard.press("KeyE");
  await esperar(a, () => globalThis.__numinia.dardos.tirando() && !!globalThis.__numinia.dardosHud?.abierto(), null, 8000);
  res.pcHud = await hudAbierto(a);
  await a.waitForTimeout(900); // the camera eases round to the board
  res.pcCamara = await ctl(a, () => { const l = globalThis.__numinia.view.dardos.linea("diana"), y = globalThis.__numinia.view.cam.yaw(), d = l.rumbo - Math.PI - y; return Math.round(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * 100) / 100; });
  await foto(a, "pc-1-abierto");
  const box = await a.evaluate(() => { const r = document.querySelector("#dardos-hud canvas.diana").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const tiros = [];
  for (let n = 1; n <= 3; n++) {
    // aim at the treble 20 (a bit above the centre) — the hand sway and the server's tremor move it
    await a.mouse.move(box.x + box.w / 2, box.y + box.h / 2 - box.h * 0.22);
    await a.mouse.down();
    await a.waitForTimeout(715); // the bar reaches the straight mark (0.65 of a 1.1 s ramp) at 715 ms
    const pot = await ctl(a, () => globalThis.__numinia.dardosHud.potencia());
    await a.mouse.up();
    if (n === 1) { // v4: the bar beside the board (28 css px wide track, the board's height), the word and the aim ring after the release
      res.pcBarra = await a.evaluate(() => { const b = document.querySelector("#dardos-hud canvas.barra").getBoundingClientRect(), d = document.querySelector("#dardos-hud canvas.diana").getBoundingClientRect(); return { visible: b.width > 0 && getComputedStyle(document.querySelector("#dardos-hud .guia")).display !== "none", ancho: Math.round(b.width), altoIgual: Math.abs(b.height - d.height) < 2, derecha: b.left >= d.right - 1, zona: globalThis.__numinia.dardosHud.zona() }; });
      res.pcSuelta = await a.evaluate(() => ({ dato: globalThis.__numinia.dardosHud.suelto(), texto: document.querySelector("#dardos-hud .suelta")?.textContent ?? "", visible: !document.querySelector("#dardos-hud .suelta")?.hidden }));
      await foto(a, "pc-1b-suelta");
    }
    await esperar(a, (k) => globalThis.__numinia.dardos.estado().marcador.dardos >= k || (globalThis.__numinia.dardos.estado().ultimo?.numero ?? 0) >= k, n, 6000).catch(() => {});
    await a.waitForTimeout(250);
    const e = await estado(a);
    tiros.push({ potencia: pot, ...e.ultimo });
    if (n === 2) { await foto(a, "pc-2-dos-dardos"); await a.evaluate(() => { document.getElementById("dardos-hud").style.visibility = "hidden"; }); await foto(a, "pc-2b-diana-3d"); await a.evaluate(() => { document.getElementById("dardos-hud").style.visibility = ""; }); }
  }
  await esperar(a, () => !globalThis.__numinia.dardos.tirando(), null, 6000);
  const e = await estado(a);
  res.pc = { tiros, fin: e.fin, marcador: e.marcador, hud: await ctl(a, () => ({ cuenta: document.querySelector("#dardos-hud .cuenta").textContent, resultado: document.querySelector("#dardos-hud .resultado").textContent, marcador: document.querySelector("#dardos-hud .marcador").textContent })), en3D: await ctl(a, () => globalThis.__numinia.view.dardos.contar()) };
  await foto(a, "pc-3-fin");
  res.bVio = await ctl(b, () => ({ clavados: globalThis.__numinia.dardos.clavados().length, en3D: globalThis.__numinia.view.dardos.contar() }));
  nota("PC hecho", res.pc);
  await a.context().close(); await b.context().close();
} catch (e) { errors.push("pc: " + String(e?.message ?? e).slice(0, 300)); }

// ------------------------------------------------------------------------------------------------------------- MÓVIL
if (!SOLO || SOLO === "movil") try {
  const m = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const { dist } = await aLaLinea(m);
  const antesPos = await yo(m);
  nota("móvil en la línea", { dist });
  await esperar(m, () => /dardos/i.test(document.getElementById("interactuar")?.textContent ?? ""), null, 8000).catch(() => {});
  res.movilPrompt = await prompt(m);
  await m.evaluate(() => document.getElementById("interactuar").click());
  await esperar(m, () => globalThis.__numinia.dardos.tirando() && !!globalThis.__numinia.dardosHud?.abierto(), null, 8000);
  res.movilCoarse = await m.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const box = await m.evaluate(() => { const r = document.querySelector("#dardos-hud canvas.diana").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cdp = await m.context().newCDPSession(m);
  res.movilEncima = await m.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}#${e.id}.${e.className}` : ""; }, [box.x + box.w / 2, box.y + box.h * 0.62]);
  res.movilCaja = box;
  // real touch events; each carries its own timestamp (a loaded machine delays the dispatch, not the gesture)
  const tocar = (type, x, y, ts) => cdp.send("Input.dispatchTouchEvent", { type, timestamp: ts, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  async function flick(x, y, px, pasos, msPaso) {
    const t = Date.now() / 1000;
    await tocar("touchStart", x, y, t); await m.waitForTimeout(160);
    for (let i = 1; i <= pasos; i++) { await tocar("touchMove", x, y - (px * i) / pasos, t + 0.16 + (i * msPaso) / 1000); }
    await tocar("touchEnd", x, y - px, t + 0.16 + (pasos * msPaso) / 1000);
  }
  // an exact flick inside the page: pointer events at 16 ms (a busy wait, so a slow frame cannot stretch it)
  const flickExacto = (px, ms) => m.evaluate(([x, y, px, ms]) => {
    const t = document.querySelector("#dardos-hud .tablero");
    const ev = (type, yy) => t.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 77, isPrimary: true, clientX: x, clientY: yy, bubbles: true, cancelable: true }));
    const espera = (n) => { const f = performance.now() + n; while (performance.now() < f); };
    ev("pointerdown", y); espera(150);
    const pasos = Math.max(2, Math.round(ms / 16));
    for (let i = 1; i <= pasos; i++) { espera(ms / pasos); ev("pointermove", y - (px * i) / pasos); }
    ev("pointerup", y - px);
  }, [box.x + box.w / 2, box.y + box.h * 0.62, px, ms]);
  const tiros = [];
  const uno = async (como, fn) => {
    const n0 = await ctl(m, () => globalThis.__numinia.dardos.estado().ultimo?.numero ?? 0);
    await fn();
    await esperar(m, (k) => { const u = globalThis.__numinia.dardos.estado().ultimo; return !!u && (u.numero !== k || !globalThis.__numinia.dardos.tirando()); }, n0, 6000).catch(() => {});
    await m.waitForTimeout(200);
    const est = await estado(m);
    tiros.push({ como, ...est.ultimo, aviso: est.aviso, flick: await ctl(m, () => globalThis.__numinia.dardosHud.flick()) });
  };
  await uno("toque real, rápido (CDP)", () => flick(box.x + box.w / 2, box.y + box.h * 0.62, 120, 6, 16));
  await uno("medio (≈0,65)", () => flickExacto(0.65 * 2.6 * box.h * 0.1, 100));  // 0.65 × FLICK_LLENO canvas heights/s for 100 ms
  await uno("flojo (cae)", () => flickExacto(0.25 * 2.6 * box.h * 0.1, 100));
  await esperar(m, () => !globalThis.__numinia.dardos.tirando(), null, 6000).catch(() => {});
  const e = await estado(m);
  const despuesPos = await yo(m);
  res.movil = { tiros, fin: e.fin, marcador: e.marcador, seMovioM: Math.round(Math.hypot(despuesPos.x - antesPos.x, despuesPos.z - antesPos.z) * 100) / 100 };
  await foto(m, "movil-fin");
  nota("móvil hecho", res.movil);
  await m.context().close();
} catch (e) { errors.push("movil: " + String(e?.message ?? e).slice(0, 300)); }

// ---------------------------------------------------------------------------------------------------------------- AR
if (!SOLO || SOLO === "ar") try {
  // a wall 2.4 m in front of the viewer, its normal toward you: the hit pose's y axis = (0, 0, 1)
  const init = IWER + `;
    class Pared { constructor(d) { this.d = d; this.environmentCanvas = document.createElement("canvas"); } render() {}
      computeHitTestResults() { return [new Float32Array([1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,1.5,-2.4,1])]; } }
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); dev.installSEM(Pared); globalThis.__iwer = dev;`;
  const r = await abrir({ viewport: { width: 640, height: 400 } }, init);
  const { dist } = await aLaLinea(r);
  nota("AR en la línea", { dist });
  await r.keyboard.press("KeyE").catch(() => {});
  await esperar(r, () => globalThis.__numinia.dardos.tirando() && !!globalThis.__numinia.dardosHud?.abierto(), null, 8000);
  await esperar(r, () => !document.querySelector("#dardos-hud button.ar").hidden, null, 6000);
  res.arBoton = await r.evaluate(() => document.querySelector("#dardos-hud button.ar").textContent);
  await r.evaluate(() => document.querySelector("#dardos-hud button.ar").click());
  await esperar(r, () => globalThis.__numinia.view.ar.jugando, null, 15000);
  res.arJugando = await r.evaluate(() => ({ jugando: globalThis.__numinia.view.ar.jugando, state: globalThis.__numinia.view.ar.state, maquetaOculta: globalThis.__numinia.view.ar.maqueta().pilares === 0 }));
  await r.waitForTimeout(600);
  // the right controller in front of your chest, pointing straight ahead (at the wall where the board will hang)
  await r.evaluate(() => { const c = globalThis.__iwer.controllers.right; c.position.set(0.02, 1.52, -0.35); c.quaternion.set(0, 0, 0, 1); });
  const gatillo = (ms) => r.evaluate((ms) => new Promise((ok) => { const c = globalThis.__iwer.controllers.right; c.updateButtonValue("trigger", 1); setTimeout(() => { c.updateButtonValue("trigger", 0); setTimeout(ok, 150); }, ms); }), ms);
  await gatillo(150); // hang the board where the ring is
  await esperar(r, () => globalThis.__numinia.dardosHud.ar()?.fase === "colocada", null, 6000);
  res.arColocada = await r.evaluate(() => globalThis.__numinia.dardosHud.ar());
  await foto(r, "ar-colocada");
  const tiros = [];
  for (let n = 1; n <= 3; n++) {
    const n0 = await ctl(r, () => globalThis.__numinia.dardosHud.ar().lanzados);
    await gatillo(700);
    await esperar(r, (k) => globalThis.__numinia.dardosHud.ar().lanzados > k, n0, 4000).catch(() => {});
    await esperar(r, (k) => globalThis.__numinia.dardosHud.ar().clavados >= k || !globalThis.__numinia.dardos.tirando(), n, 5000).catch(() => {});
    await r.waitForTimeout(200);
    tiros.push({ ar: await ctl(r, () => { const s = globalThis.__numinia.dardosHud.ar(); return { lanzados: s.lanzados, clavados: s.clavados, ultimo: s.ultimo, zona: s.zona }; }), servidor: (await estado(r)).ultimo });
  }
  await esperar(r, () => !globalThis.__numinia.dardos.tirando(), null, 6000).catch(() => {});
  res.ar = { tiros, fin: (await estado(r)).fin };
  await foto(r, "ar-tres-dardos");
  await r.evaluate(() => globalThis.__numinia.view.ar.exit());
  await esperar(r, () => globalThis.__numinia.view.ar.state === "off", null, 8000).catch(() => {});
  res.arSalio = await r.evaluate(() => globalThis.__numinia.view.ar.state);
  nota("AR hecho", res.ar);
  await r.context().close();
} catch (e) { errors.push("ar: " + String(e?.message ?? e).slice(0, 300)); }

await browser.close();
const okPC = SOLO && SOLO !== "pc" ? true : /dardos/i.test(res.pcPrompt ?? "") && res.pcHud && res.pc?.tiros.length === 3 && res.pc.tiros.every((t) => typeof t.puntos === "number" && t.texto)
  && res.pc.fin?.dardos === 3 && res.pc.fin.puntos === res.pc.tiros.reduce((s, t) => s + t.puntos, 0) && res.pc.marcador.dardos === 3 && res.pc.en3D.dardos === 3 && /Marcador: 3 dardos/.test(res.pc.hud.marcador)
  && res.pc.tiros.filter((t) => Math.abs(t.potencia - 0.65) < 0.2).length >= 2 && res.bVio?.clavados === 0 && res.pcCamara < 0.35
  && res.pcBarra?.visible && res.pcBarra.altoIgual && res.pcBarra.derecha && res.pcBarra.zona === 0.04 && res.pcSuelta?.visible && /PERFECTO|CASI|FLOJO|FUERTE/.test(res.pcSuelta.texto) && res.pcSuelta.dato?.via === "raton";
const okMovil = SOLO && SOLO !== "movil" ? true : res.movilCoarse && res.movil?.tiros.length === 3 && res.movil.fin?.dardos === 3 && res.movil.tiros.every((t) => typeof t.puntos === "number") && res.movil.tiros[2].y < res.movil.tiros[1].y - 0.3 && res.movil.seMovioM < 0.3; // the lazy flick drops; the board never moved the avatar
const okAR = SOLO && SOLO !== "ar" ? true : res.arJugando?.jugando && res.arColocada?.pared === true && res.ar?.tiros.length === 3 && res.ar.tiros.every((t) => t.ar.ultimo && t.servidor && t.ar.zona === 0.06) && res.ar.tiros.some((t) => Math.hypot(t.ar.ultimo.x, t.ar.ultimo.y) < 0.6) && res.ar.fin?.dardos === 3 && res.arSalio === "off";
const ok = okPC && okMovil && okAR && errors.length === 0;
console.log(JSON.stringify({ ...res, okPC, okMovil, okAR, ...out }, null, 1));
console.log(ok ? "E2E DARDOS OK" : "E2E DARDOS FALLA");
process.exit(ok ? 0 : 1);
