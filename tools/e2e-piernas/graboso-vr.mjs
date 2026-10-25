// e2e leg MIS-200 (el Graboso en VR): one Quest 3 emulated with IWER (the watch/ray helpers of menu-vr.mjs). The wrist watch gets a
// «Grabar» button between the camera and the notices, drawn only where the Graboso exists (apps/plaza/graboso.ts). Checks: the watch lists
// it; a ray + trigger on it starts the recording (fase «grabando», the page's pill shows the clock, the button's face turns red); a second
// press keeps the clip (a blob with bytes, the pill says «Clip …», the face is no longer red). It also measures what the recording SEES:
// a clip recorded flat before entering VR vs the clip recorded inside the XR session (are the frames black?). IWER does not paint the 3D
// (menu-vr.mjs), so a black clip here is a finding about the emulator, not proof about a headset: it is printed, never faked.
// Not a Quest: IWER only. Env: BASE (…/?webgl2&server=ws://127.0.0.1:<port>), CHROME, PW_CORE. Prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");

// what a clip shows: play it muted, draw a frame, count the pixels that are not black
const MEDIR_CLIP = async () => {
  const c = globalThis.__numinia.graboso.graboso.estado.clip;
  if (!c) return null;
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(c.blob);
  let fotogramas = 0; if (v.requestVideoFrameCallback) { const f = () => { fotogramas++; v.requestVideoFrameCallback(f); }; v.requestVideoFrameCallback(f); }
  await v.play().catch(() => {});
  await new Promise((ok) => setTimeout(ok, 1200));
  const k = document.createElement("canvas"); k.width = v.videoWidth || 64; k.height = v.videoHeight || 64;
  const g = k.getContext("2d"); g.drawImage(v, 0, 0, k.width, k.height);
  const d = g.getImageData(0, 0, k.width, k.height).data; let suma = 0, vivos = 0;
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; suma += l; if (l > 12) vivos++; }
  URL.revokeObjectURL(v.src);
  return { bytes: c.blob.size, tipo: c.tipo, fotogramas, escritosEspejo: globalThis.__numinia.view.espejoGrabar?.escritos?.() ?? null, ancho: k.width, alto: k.height, luminanciaMedia: +(suma / (d.length / 4)).toFixed(2), pixelesNoNegros: +(vivos / (d.length / 4)).toFixed(4) };
};
// does the canvas's capture stream deliver frames right now? (the cause of an empty clip: counted on a <video> over a fresh stream)
const FOTOGRAMAS = async () => {
  const lienzo = globalThis.__numinia.view.renderer.domElement, s = lienzo.captureStream(30), v = document.createElement("video");
  v.muted = true; v.srcObject = s; let n = 0;
  if (v.requestVideoFrameCallback) { const f = () => { n++; v.requestVideoFrameCallback(f); }; v.requestVideoFrameCallback(f); }
  void v.play().catch(() => {}); // not awaited: on a stream with no frames play() never settles
  await new Promise((ok) => setTimeout(ok, 1500));
  const pistas = s.getVideoTracks().map((t) => t.readyState); s.getTracks().forEach((t) => t.stop());
  return { fotogramasEn1500ms: n, pistas, enXR: !!globalThis.__numinia.view.renderer.xr.isPresenting };
};
// rough frame cost inside the XR session: rAF frames of the session over 3 s (software GL: only the ON/OFF ratio means anything)
const RITMO = () => new Promise((ok) => { const se = globalThis.__numinia.view.renderer.xr.getSession(); let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 3000) se.requestAnimationFrame(f); else ok({ cuadros: n, msPorCuadro: +((performance.now() - t0) / n).toFixed(1) }); }; se.requestAnimationFrame(f); });
// how much of the watch's «Grabar» face is red (the recording colour, #D33440)
const ROJO_BOTON = () => {
  const v = globalThis.__numinia.view.vr, k = v.reloj.lienzo, g = k.getContext("2d"), c = k.width / 2, o = 176, a = (45 * Math.PI) / 180;
  const x = Math.round(c + Math.cos(a) * o), y = Math.round(c + Math.sin(a) * o), d = g.getImageData(x - 40, y - 40, 80, 80).data; let rojo = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 100 && d[i + 3] > 200) rojo++;
  return rojo;
};
const ESTADO = () => { const g = globalThis.__numinia.graboso, e = g.graboso.estado; return { fase: e.fase, error: e.error, sonido: e.sonido, clip: e.clip ? { bytes: e.clip.blob.size, duracionS: e.clip.duracionS, corto: e.clip.corto } : null, boton: g.boton.getAttribute("aria-pressed"), pildora: { visible: g.hud.classList.contains("visible"), listo: g.hud.classList.contains("listo"), texto: g.hud.textContent.trim() }, soporta: g.soporta }; };

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, permissions: ["microphone"] });
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
    // v11: the pose in which you read a real watch — head level, the wrist 0.25 m ahead, 0.10 m to the left and ~0.29 m UNDER the
    // eyes (52° below the gaze: outside the old 45° cone), the back of the controller towards the eyes
    globalThis.__relojNatural = () => {
      const d = globalThis.__iwer, h = d.position, c = d.controllers.left; d.quaternion.set(0, 0, 0, 1);
      const w = [-0.1, -0.26, -0.25]; c.position.set(h.x + w[0], h.y + w[1], h.z + w[2]);
      const q = giro([-1, 0, 0], [-w[0], -w[1], -w[2]].map((v) => v / Math.hypot(...w))); c.quaternion.set(q[0], q[1], q[2], q[3]);
      const r = d.controllers.right; r.position.set(h.x + 0.15, h.y - 0.2, h.z - 0.15);
    };
    // v11: the left arm stretched out in front (0.71 m from the eyes), the back of the hand up: it must not open the watch
    globalThis.__brazoEstirado = () => {
      const d = globalThis.__iwer, h = d.position, c = d.controllers.left; d.quaternion.set(0, 0, 0, 1);
      c.position.set(h.x - 0.15, h.y - 0.25, h.z - 0.65); const q = giro([-1, 0, 0], [0, 1, 0]); c.quaternion.set(q[0], q[1], q[2], q[3]);
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
  const r = { ok: false, pasos: [], hallazgos: {} };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  let a;
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 8000) => a.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const boton = (b, nombre, v) => a.evaluate(([b, nombre, v]) => globalThis.__iwer.controllers[b].updateButtonValue(nombre, v), [b, nombre, v]);
  const gatillo = async (ms = 80) => { await boton("right", "trigger", 1); await a.waitForTimeout(ms); await boton("right", "trigger", 0); await a.waitForTimeout(250); };
  // the whole way to a watch button: wrist towards you, ray on the button, trigger (the wrist stays up for the next press)
  const pulsarReloj = async (id) => {
    await ctl(() => globalThis.__mirarMuneca());
    if (!(await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000))) return false;
    await a.waitForTimeout(500); // the fade-in must be complete (it ignores presses below 0.9 opacity)
    const en = await ctl((id) => globalThis.__numinia.view.vr.reloj.botonMundo(id), id);
    if (!en) return false;
    await ctl((w) => globalThis.__apuntar(w), en); await a.waitForTimeout(300);
    await gatillo(); return true;
  };
  try {
    a = await ctx.newPage(); a.on("pageerror", (e) => errors.push(String(e))); a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    await a.goto(BASE);
    paso("la página arranca", await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000));
    const inicio = await ctl(ESTADO);
    paso("el Graboso existe y el navegador sabe grabar", inicio.soporta === true && inicio.fase === "guardado", { inicio });

    // baseline: the same clip recorded flat, before VR (what the canvas capture sees on a plain page)
    await ctl(() => globalThis.__numinia.graboso.graboso.alternar());
    await esperar(() => globalThis.__numinia.graboso.graboso.estado.fase === "grabando", null, 8000);
    await a.waitForTimeout(2500);
    await ctl(() => globalThis.__numinia.graboso.graboso.alternar());
    await esperar(() => !!globalThis.__numinia.graboso.graboso.estado.clip, null, 8000);
    r.hallazgos.clipPlano = await ctl(MEDIR_CLIP);
    r.hallazgos.capturaPlano = await ctl(FOTOGRAMAS);
    await ctl(() => globalThis.__numinia.graboso.graboso.quitarClip()); // so the clip checked after the VR press is the one that press made

    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR", await esperar(() => globalThis.__numinia.view.vr.active, null, 15000));
    await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
    await ctl(() => globalThis.__mirarMuneca());
    paso("girar la muñeca enseña el reloj", await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000));
    const diag = await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico());
    paso("el reloj tiene el botón «graboso» junto a micro, cámara y avisos", ["menu", "micro", "camara", "graboso", "avisos"].every((b) => diag.botones.includes(b)), { botones: diag.botones });
    await ctl(() => { globalThis.__numinia.view.vr.reloj.pintar(); });
    const rojoAntes = await ctl(ROJO_BOTON);
    paso("apagado, el botón no es rojo", rojoAntes < 20, { rojoAntes });

    r.hallazgos.ritmoSinGrabar = await ctl(RITMO); // before the first press: nothing extra runs
    // 1. press: it starts recording
    paso("rayo + gatillo en «Grabar» (1)", await pulsarReloj("graboso"));
    paso("la pulsación llega al reloj", (await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico())).ultimoPulsado === "graboso");
    paso("empieza a grabar", await esperar(() => globalThis.__numinia.graboso.graboso.estado.fase === "grabando", null, 8000), { estado: await ctl(ESTADO) });
    await a.waitForTimeout(2600);
    const grabando = await ctl(ESTADO);
    paso("la píldora marca la grabación", grabando.fase === "grabando" && grabando.boton === "true" && grabando.pildora.visible && /0:0\d \/ 1:00/.test(grabando.pildora.texto), { grabando });
    await ctl(() => { globalThis.__numinia.view.vr.reloj.pintar(); });
    const rojoGrabando = await ctl(ROJO_BOTON);
    paso("grabando, el botón del reloj se pinta rojo", rojoGrabando > 100, { rojoGrabando });
    r.hallazgos.ritmoGrabando = await ctl(RITMO); // MIS-200: what the XR mirror costs per frame (rough, software GL)
    r.hallazgos.capturaVR = await ctl(FOTOGRAMAS); // while the Graboso records inside the XR session
    paso("sigue dentro de la sesión de VR", await ctl(() => globalThis.__numinia.view.vr.active && globalThis.__numinia.view.renderer.xr.isPresenting));

    // 2. press again: it keeps the clip
    paso("rayo + gatillo en «Grabar» (2)", await pulsarReloj("graboso"));
    paso("el segundo pulso para la grabación", await esperar(() => globalThis.__numinia.graboso.graboso.estado.fase === "guardado", null, 8000), { estado: await ctl(ESTADO) });
    await esperar(() => globalThis.__numinia.graboso.graboso.estado.clip || globalThis.__numinia.graboso.graboso.estado.error, null, 6000);
    const parado = await ctl(ESTADO);
    paso("la píldora lo refleja: botón suelto y sin contador", parado.boton === "false" && !/\d:\d\d \/ 1:00/.test(parado.pildora.texto), { parado });
    await ctl(() => { globalThis.__numinia.view.vr.reloj.pintar(); });
    paso("parado, el botón vuelve a no ser rojo", (await ctl(ROJO_BOTON)) < 20);
    // what came out of the recording inside XR: a clip (then it is measured) or nothing (a finding, printed as it is)
    if (parado.clip) {
      paso("la píldora dice «Clip …» con bytes", parado.pildora.listo && /^Clip \d+:\d\d/.test(parado.pildora.texto) && parado.clip.bytes > 0, { parado });
      r.hallazgos.clipVR = await ctl(MEDIR_CLIP);
    } else {
      r.hallazgos.clipVR = { sinClip: true, error: parado.error, pildora: parado.pildora };
    }
    // MIS-200 t_40a65495: the clip recorded INSIDE the XR session must hold frames (before: the canvas stream gave 0 and the
    // Graboso kept nothing). Required, not printed: this step fails on vr/mis200-graboso and passes with the XR mirror.
    paso("el clip hecho dentro de VR tiene fotogramas (> 0)", !!parado.clip && r.hallazgos.clipVR.fotogramas > 0 && r.hallazgos.clipVR.ancho > 0, { clipVR: r.hallazgos.clipVR, error: parado.error });
    paso("el espejo de VR escribió fotogramas mientras grababa", (r.hallazgos.clipVR.escritosEspejo ?? 0) > 0, { clipVR: r.hallazgos.clipVR });
    paso("el clip de VR no es negro (IWER sí pinta el render a textura)", r.hallazgos.clipVR.pixelesNoNegros > 0, { clipVR: r.hallazgos.clipVR });
    r.hallazgos.lectura = r.hallazgos.clipPlano && r.hallazgos.clipVR?.pixelesNoNegros !== undefined
      ? `plano: ${r.hallazgos.clipPlano.pixelesNoNegros * 100}% de píxeles no negros; en VR (IWER): ${r.hallazgos.clipVR.pixelesNoNegros * 100}%`
      : `el clip hecho DENTRO de VR no existe (${r.hallazgos.clipVR?.error || "sin error"}); la captura del lienzo da ${r.hallazgos.capturaVR?.fotogramasEn1500ms} fotogramas en 1,5 s en VR y ${r.hallazgos.capturaPlano?.fotogramasEn1500ms} en la página plana`;
    paso("sin errores de página", errors.length === 0, { errors });
    r.ok = true;
  } catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
  finally { await browser.close(); }
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok ? 0 : 1);
}
pierna();
