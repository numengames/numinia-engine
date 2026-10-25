// e2e leg (J10): «Manos a la obra» played in VR with the IWER emulator (Meta, MIT) as a Quest 3. Your hands are drawn
// (a hand on each controller whose fingers follow the grip; then tracked hands, 25 joints each); the ray of the right
// controller points at Teo and the trigger opens the conversation on a 3D panel; the ray on answer 1 + trigger accepts;
// B leaves; walking to the blue watering can, the right controller next to it shows a halo and the grip takes it — it
// is drawn in that hand; then with TRACKED HANDS a pinch next to the seed sack takes it into the left hand; back at Teo
// a pinch on his name / body and on «Aquí tienes» completes the quest and both things leave your hands. 0 page errors.
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE; SHOTS=<folder> saves pictures.
// Load-proof: the page's sim clamps a frame to 250 ms (apps/plaza/main.ts: dt = min(250, now - last)), so on a loaded
// machine (~2 fps) a fixed WALL-clock window covers less SIM time and the avatar walks less. Every walk below therefore
// goes on until the distance is reached or a generous timeout, and logs seconds + XR frames + fps + distance, so a failure
// says «too slow» (timeout, low fps) or «does not walk» (distance 0 at any fps).
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const carga = () => { try { return readFileSync("/proc/loadavg", "utf8").split(" ")[0]; } catch { return "?"; } };

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
const SHOTS = process.env.SHOTS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now();
const out = { carga: [carga()], pasos: [], caminatas: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });

const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
await ctx.addInitScript(IWER + `;
  Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
  const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
  // count the XR frames the page really draws (load shows up here as a low rate)
  globalThis.__xrFrames = 0; const rafXR = IWER.XRSession.prototype.requestAnimationFrame;
  IWER.XRSession.prototype.requestAnimationFrame = function (cb) { return rafXR.call(this, (t, f) => { globalThis.__xrFrames++; return cb(t, f); }); };
  // aim an emulated input (controller or hand) from where it is at a world point; rig = the avatar (no snap turns here)
  globalThis.__apuntar = (inp, w) => {
    const r = globalThis.__numinia.view.vr.rig.position, p = inp.position;
    const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
    inp.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx); // q = qY(yaw) * qX(pitch)
  };
  globalThis.__poner = (inp, w) => { const r = globalThis.__numinia.view.vr.rig.position; inp.position.set(w.x - r.x, w.y - r.y, w.z - r.z); inp.quaternion.set(0, 0, 0, 1); };`);
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const ctl = (code, arg) => p.evaluate(code, arg);
const esperar = (fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms });
const yo = () => ctl(() => globalThis.__numinia.session.selfPosition(1));
const manos = () => ctl(() => globalThis.__numinia.view.manos.estado());
const paneles = () => ctl(() => globalThis.__numinia.view.vr.estadoPaneles());
const cuadros = () => ctl(() => globalThis.__xrFrames ?? 0);
const foto = async (n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/manos-${n}.png` }); };
const SPEED = 1.5; // SPEED 1.5 m/s since #24 (was 4): walking pace of the sim, used to size key/stick holds
const ANDA_S = 3, ANDA_MIN = 0.2 * SPEED * (ANDA_S - 0.25); // pinch-walk ideal hold (s) and least forward metres (≈ 0.8)
const ANDA_MAX_MS = 20000; // ...but on a slow page the pinch is held until that distance, up to this long (wall clock)
/** Walk on the flat page with the keys. In VR the keys do nothing since #24 (the headset is the only source of
 *  movement): there it walks with the left controller's stick, below the run edge (0.97); with tracked hands the
 *  controllers are put back for the walk and the hands come back after it. */
async function caminar(x, z, cerca = 1.0, maxMs = 60000) {
  const enVR = await ctl(() => globalThis.__numinia.view.vr.active);
  const modo = enVR ? await ctl(() => globalThis.__iwer.primaryInputMode) : null;
  if (modo === "hand") {
    await ctl(() => { globalThis.__iwer.primaryInputMode = "controller"; });
    await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando", null, 6000).catch(() => {});
  }
  const t = Date.now(), f0 = await cuadros();
  let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (d <= cerca) break;
    const ms = Math.max(100, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / SPEED) * 1000));
    if (enVR) { // no snap turns in this leg: stick right = +x, stick back = +z
      await ctl(([sx, sz]) => globalThis.__iwer.controllers.left.updateAxes("thumbstick", sx, sz), [(dx / d) * 0.9, (dz / d) * 0.9]);
      await p.waitForTimeout(ms);
      await ctl(() => globalThis.__iwer.controllers.left.updateAxes("thumbstick", 0, 0));
    } else {
      const held = [];
      if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
      if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
      for (const k of held) await p.keyboard.down(k);
      await p.waitForTimeout(ms);
      for (const k of held) await p.keyboard.up(k);
    }
    await p.waitForTimeout(120);
  }
  if (modo === "hand") {
    await ctl(() => { globalThis.__iwer.primaryInputMode = "hand"; });
    await esperar(() => { const e = globalThis.__numinia.view.manos.estado(); return e.izq?.tipo === "mano" && e.der?.tipo === "mano"; }, null, 6000).catch(() => {});
  }
  const s = (Date.now() - t) / 1000, f = (await cuadros()) - f0;
  out.caminatas.push({ a: [x, z], d: Math.round(d * 10) / 10, s: Math.round(s * 10) / 10, cuadrosXR: f, fps: f ? Math.round((f / s) * 10) / 10 : null, llego: d <= cerca });
  return Math.round(d * 10) / 10;
}
/** Press and let go an emulated button (controller) or a pinch (hand). */
async function pulsar(lado, boton) {
  await ctl(([l, b]) => { const d = globalThis.__iwer; if (b === "pinch") d.hands[l].updatePinchValue(1); else d.controllers[l].updateButtonValue(b, 1); }, [lado, boton]);
  await p.waitForTimeout(250);
  await ctl(([l, b]) => { const d = globalThis.__iwer; if (b === "pinch") d.hands[l].updatePinchValue(0); else d.controllers[l].updateButtonValue(b, 0); }, [lado, boton]);
  await p.waitForTimeout(250);
}
const entrada = (modo, lado) => (modo === "mano" ? `globalThis.__iwer.hands.${lado}` : `globalThis.__iwer.controllers.${lado}`);
const apuntar = (modo, lado, w) => ctl(([e, w]) => globalThis.__apuntar(eval(e), w), [entrada(modo, lado), w]);
const poner = (modo, lado, w) => ctl(([e, w]) => globalThis.__poner(eval(e), w), [entrada(modo, lado), w]);
const fila = (n) => ctl((n) => globalThis.__numinia.view.vr.filaMundo(n), n);
const cosaEn = (k) => ctl((k) => { const c = globalThis.__numinia.session.features.cards().find((x) => x.feature === "misiones" && x.key === k); return c ? c.at : null; }, k);

let ok = false;
try {
  await p.goto(BASE);
  await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000);
  await esperar(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, 8000);
  // 1. walk next to Teo on the flat page, then enter VR
  await esperar(() => globalThis.__numinia.session.features.cards().some((c) => c.feature === "pnj" && c.key === "teo"), null, 10000).catch(() => {});
  const dTeo = await caminar(-6.5, 4);
  await esperar(() => document.getElementById("vr").getAttribute("aria-disabled") !== "true", null, 15000).catch(() => {}); // MIS-200 (t_9687b5fc): the entry says «Preparando…» until the world has loaded
  await ctl(() => document.getElementById("vr").click());
  await esperar(() => globalThis.__numinia.view.vr.active, null, 15000);
  await p.waitForTimeout(800);
  // 2. the hands: one on each controller; the grip bends the fingers
  out.mandos = await manos();
  await ctl(() => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0.6));
  await p.waitForTimeout(300);
  out.dedos = (await manos()).der;
  await ctl(() => globalThis.__iwer.controllers.right.updateButtonValue("squeeze", 0));
  nota("VR con mandos", { dTeo });
  await foto("1-mandos");
  // 3. the ray on Teo + trigger = talk; the panel; the ray on answer 1 + trigger = accept; B leaves
  await apuntar("mando", "right", { x: -8, y: 1.0, z: 4 });
  await esperar(() => globalThis.__numinia.view.manos.estado().der?.apunta === "pnj:teo", null, 5000).catch(() => {});
  out.apuntaTeo = (await manos()).der?.apunta;
  await pulsar("right", "trigger");
  await esperar(() => globalThis.__numinia.view.vr.estadoPaneles().dialogo, null, 5000).catch(() => {});
  out.dialogo = await paneles();
  await foto("2-dialogo");
  const f1 = await fila(1);
  if (f1) await apuntar("mando", "right", f1);
  await esperar(() => globalThis.__numinia.view.manos.estado().der?.apunta === "panel:1", null, 4000).catch(() => {});
  out.apuntaFila = (await manos()).der?.apunta;
  await pulsar("right", "trigger");
  await esperar(() => globalThis.__numinia.misiones.libro().some((m) => m.id === "manos-a-la-obra"), null, 5000).catch(() => {});
  out.aceptada = await ctl(() => globalThis.__numinia.misiones.libro().map((m) => [m.id, m.estado, m.paso]));
  await pulsar("right", "b-button");
  await esperar(() => !globalThis.__numinia.view.vr.estadoPaneles().dialogo, null, 4000).catch(() => {});
  out.trasB = (await paneles()).dialogo;
  nota("misión aceptada en VR");
  // 4. the watering can: right controller next to it → halo; grip → in the right hand
  const reg = await cosaEn("regadera");
  out.dReg = await caminar(reg.x + 1.0, reg.z, 0.5);
  await esperar(() => globalThis.__numinia.view.objects().loaded >= 1, null, 8000).catch(() => {});
  await poner("mando", "right", { x: reg.x, y: 1.05, z: reg.z });
  await esperar(() => globalThis.__numinia.view.manos.estado().der?.candidato === "misiones:regadera", null, 5000).catch(() => {});
  out.candidato = (await manos()).der?.candidato;
  await foto("3-halo");
  await pulsar("right", "squeeze");
  await esperar(() => globalThis.__numinia.view.llevando()["misiones:regadera"] === "der", null, 5000).catch(() => {});
  out.llevaRegadera = await ctl(() => globalThis.__numinia.view.llevando());
  await foto("4-en-la-mano");
  nota("regadera en la mano derecha");
  // 5. tracked hands: 25 joints each; a pinch next to the seeds → in the left hand
  await ctl(() => { globalThis.__iwer.primaryInputMode = "hand"; });
  await esperar(() => { const e = globalThis.__numinia.view.manos.estado(); return e.izq?.tipo === "mano" && e.izq.articulaciones >= 20 && e.der?.tipo === "mano"; }, null, 6000).catch(() => {});
  out.manos = await manos();
  await foto("5-manos");
  // walking with tracked hands: the left hand points ahead (-Z), pinch and hold in empty air → you move that way.
  // SPEED 1.5 m/s since #24: held ANDA_S s, the first ANDAR_MS (0.25 s) only arms it; headless software GL drops frames
  // (the stick's intention goes stale between them), so ask for a fifth of the ideal distance, as the 4 m/s leg did.
  {
    // The pose matters: the left hand is the WATCH hand. At (-0.2, 1.3, -0.3) with the back of the hand up it sits in the
    // watch gesture's hysteresis band (55° to open, 70° to close; measured 62°): whether the watch is open there depends on
    // the path the hand took (IWER's switch to tracked hands), not on load or on the code under test — and a hand showing the
    // watch is «busy» (manos.ts `ocupar`), so its pinch never walks (dz 0 for 20 s at 25 fps, on main too). So: roll the hand
    // 180° about its pointing axis (back of the hand down, pointing still -Z), which is outside the opening cone for sure
    // and closes an open watch in 400 ms; then wait for the watch to be gone before pinching.
    await ctl(() => { const h = globalThis.__iwer.hands.left; h.position.set(-0.2, 1.3, -0.3); h.quaternion.set(0, 0, 1, 0); });
    out.relojCerrado = await esperar(() => !globalThis.__numinia.view.vr.reloj.visible, null, 8000).then(() => true, () => false);
    await p.waitForTimeout(300);
    // what could stop the pinch from being a step: the wrist watch visible on the left wrist (that hand is then «busy»)
    out.andaAntes = await ctl(() => { try { const v = globalThis.__numinia.view; const r = v.vr.reloj.diagnostico(); return { relojVisible: r.visible, relojAbierto: r.abierto, opacidad: r.opacidad, medida: r.medida, izq: v.manos.estado().izq, andar: v.manos.andar(null) }; } catch (e) { return { error: String(e) }; } });
    const a = await yo(), f0 = await cuadros(), t1 = Date.now();
    await ctl(() => globalThis.__iwer.hands.left.updatePinchValue(1));
    const traza = []; // [wall s, XR frames, dz, watch visible]
    let b = a;
    while (Date.now() - t1 < ANDA_MAX_MS) {
      await p.waitForTimeout(250);
      b = await yo();
      const rv = await ctl(() => { try { return globalThis.__numinia.view.vr.reloj.visible; } catch { return null; } });
      traza.push([Math.round((Date.now() - t1) / 100) / 10, (await cuadros()) - f0, Math.round((b.z - a.z) * 100) / 100, rv]);
      if (b.z - a.z < -ANDA_MIN && Math.abs(b.x - a.x) < Math.abs(b.z - a.z) / 2) break;
    }
    const s = (Date.now() - t1) / 1000, f = (await cuadros()) - f0;
    await ctl(() => globalThis.__iwer.hands.left.updatePinchValue(0));
    await p.waitForTimeout(400);
    b = await yo();
    out.andaConMano = { dx: Math.round((b.x - a.x) * 10) / 10, dz: Math.round((b.z - a.z) * 10) / 10, s: Math.round(s * 10) / 10, cuadrosXR: f, fps: f ? Math.round((f / s) * 10) / 10 : null, simTope_s: f ? Math.round(f * 0.25 * 10) / 10 : null };
    out.andaTraza = traza.length > 24 ? [...traza.slice(0, 12), ...traza.slice(-12)] : traza;
  }
  const sem = await cosaEn("semillas");
  out.dSem = await caminar(sem.x + 1.0, sem.z, 0.5);
  await poner("mano", "left", { x: sem.x, y: 1.0, z: sem.z });
  await esperar(() => globalThis.__numinia.view.manos.estado().izq?.candidato === "misiones:semillas", null, 5000).catch(() => {});
  out.candidatoMano = (await manos()).izq?.candidato;
  await pulsar("left", "pinch");
  await esperar(() => globalThis.__numinia.view.llevando()["misiones:semillas"] === "izq", null, 5000).catch(() => {});
  out.llevaDos = await ctl(() => globalThis.__numinia.view.llevando());
  nota("semillas en la mano izquierda (pellizco)");
  // 6. back to Teo: a pinch with the ray on him, then on «Aquí tienes»
  out.dVuelta = await caminar(-6.5, 4);
  await ctl(() => { const h = globalThis.__iwer.hands.right; h.position.set(0.2, 1.3, -0.3); });
  await apuntar("mano", "right", { x: -8, y: 1.0, z: 4 });
  await esperar(() => globalThis.__numinia.view.manos.estado().der?.apunta === "pnj:teo", null, 5000).catch(() => {});
  await pulsar("right", "pinch");
  await esperar(() => /Traes las dos/.test(globalThis.__numinia.misiones.dialogo()?.texto ?? ""), null, 5000).catch(() => {});
  out.entrega = await ctl(() => globalThis.__numinia.misiones.dialogo()?.texto ?? "");
  const f2 = await fila(1);
  if (f2) await apuntar("mano", "right", f2);
  await esperar(() => globalThis.__numinia.view.manos.estado().der?.apunta === "panel:1", null, 4000).catch(() => {});
  await pulsar("right", "pinch");
  await esperar(() => globalThis.__numinia.misiones.libro().some((m) => m.id === "manos-a-la-obra" && m.estado === "hecha"), null, 5000).catch(() => {});
  out.final = await ctl(() => ({ libro: globalThis.__numinia.misiones.libro().map((m) => [m.id, m.estado]), llevando: globalThis.__numinia.view.llevando(), panel: globalThis.__numinia.view.vr.estadoPaneles() }));
  await foto("6-hecha");
  nota("misión completada en VR");
  await ctl(() => globalThis.__numinia.view.vr.exit());
  await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000).catch(() => {});
  const m = out.mandos, d = out.dedos, h = out.manos, fin = out.final;
  ok = m.izq?.tipo === "mando" && m.der?.tipo === "mando" && m.izq.dibujada && m.der.dibujada && m.der.rayo
    && d?.resto > 0.5 && out.apuntaTeo === "pnj:teo" && out.dialogo.dialogo && out.apuntaFila === "panel:1"
    && out.aceptada.some(([id, e]) => id === "manos-a-la-obra" && e === "activa") && out.trasB === false
    && out.candidato === "misiones:regadera" && out.llevaRegadera["misiones:regadera"] === "der"
    && h.izq?.tipo === "mano" && h.izq.articulaciones >= 20 && h.izq.dibujada && h.der?.articulaciones >= 20
    && out.andaConMano.dz < -ANDA_MIN && Math.abs(out.andaConMano.dx) < Math.abs(out.andaConMano.dz) / 2
    && out.candidatoMano === "misiones:semillas" && out.llevaDos["misiones:semillas"] === "izq" && out.llevaDos["misiones:regadera"] === "der"
    && /Traes las dos/.test(out.entrega) && fin.libro.some(([id, e]) => id === "manos-a-la-obra" && e === "hecha") && Object.keys(fin.llevando).length === 0
    && errors.length === 0;
} catch (e) { errors.push("leg: " + String(e?.message ?? e)); }
await browser.close();
out.carga.push(carga());
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "E2E MANOS OK" : "E2E MANOS FALLA");
process.exit(ok ? 0 : 1);
