// e2e leg MIS-222 (modo foto dentro de VR, t_b83d8aef): one Quest 3 emulated with IWER (the watch/ray helpers of graboso-vr.mjs).
// The wrist watch's camera button, pressed INSIDE the XR session, takes one picture of the headset's view (view.fotoVR: the head's pose
// re-drawn into a render target — the page's canvas gets nothing in XR) and the page frames it: a 1280×720 PNG whose foot band has the
// frame's colour and the world's name, the world above it NOT black (IWER draws the render to texture, unlike the layer's framebuffer),
// the VR furniture (the watch itself) not in it. The session keeps running; the file is offered for download; on leaving VR the picture is
// on screen in the photo panel. Not a Quest: IWER only, so how it looks in the lenses is NOT verified. Env: BASE (…/?webgl2&server=ws://127.0.0.1:<port>),
// CHROME, PW_CORE. Prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");

// what the picture holds: sizes, the foot band's colour, accent/text pixels, and how much of the world part is not black
const MEDIR_FOTO = async () => {
  const f = globalThis.__numinia.foto, u = f.ultima(), url = await f.datos();
  if (!u || !url) return null;
  const im = new Image(); im.src = url; await im.decode();
  const k = document.createElement("canvas"); k.width = im.naturalWidth; k.height = im.naturalHeight;
  const g = k.getContext("2d"); g.drawImage(im, 0, 0);
  const w = k.width, h = k.height, corto = Math.min(w, h), banda = Math.max(28, Math.round(corto * 0.1)), borde = Math.max(4, Math.round(corto * 0.022));
  const cerca = (p, c, tol = 6) => Math.abs(p[0] - c[0]) <= tol && Math.abs(p[1] - c[1]) <= tol && Math.abs(p[2] - c[2]) <= tol;
  const fondo = [0x14, 0x11, 0x0f], ambar = [0xef, 0xa5, 0x17];
  const bandaPx = g.getImageData(0, h - banda, w, banda).data; let enFondo = 0, claros = 0, enAmbar = 0;
  for (let i = 0; i < bandaPx.length; i += 4) { const p = [bandaPx[i], bandaPx[i + 1], bandaPx[i + 2]]; if (cerca(p, fondo)) enFondo++; else if ((p[0] + p[1] + p[2]) / 3 > 150) claros++; if (cerca(p, ambar, 30)) enAmbar++; }
  const izq = g.getImageData(0, Math.round(h / 3), borde, Math.round(h / 3)).data; let bordeOk = 0; for (let i = 0; i < izq.length; i += 4) if (cerca([izq[i], izq[i + 1], izq[i + 2]], fondo)) bordeOk++;
  const mundo = g.getImageData(borde, borde, w - 2 * borde, h - banda - borde).data; let vivos = 0, suma = 0;
  for (let i = 0; i < mundo.length; i += 4) { const l = (mundo[i] + mundo[i + 1] + mundo[i + 2]) / 3; suma += l; if (l > 12) vivos++; }
  const n = mundo.length / 4;
  return { ancho: w, alto: h, bytes: u.bytes, nombre: u.nombre, banda, borde, bandaFondo: +(enFondo / (bandaPx.length / 4)).toFixed(3), bandaTexto: claros, bandaAmbar: enAmbar,
    bordeFondo: +(bordeOk / (izq.length / 4)).toFixed(3), mundoNoNegro: +(vivos / n).toFixed(3), mundoLuminancia: +(suma / n).toFixed(1), mundoDistinto: new Set([...Array(200)].map((_, j) => mundo[(Math.floor((j / 200) * n)) * 4] + "," + mundo[(Math.floor((j / 200) * n)) * 4 + 1])).size };
};

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
    const bajadas = []; a.on("download", (d) => bajadas.push(d.suggestedFilename()));
    await a.goto(BASE);
    paso("la página arranca", await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000));
    paso("el modo foto existe", await ctl(() => typeof globalThis.__numinia.foto?.disparar === "function" && typeof globalThis.__numinia.view.fotoVR?.sacar === "function"));
    paso("«Entrar en VR» ya no dice «Preparando…»", await esperar(() => { const b = document.getElementById("vr"); return !!b && !b.hidden && !/Preparando/.test(b.textContent || ""); }, null, 30000), { texto: await ctl(() => document.getElementById("vr")?.textContent) });
    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR", await esperar(() => globalThis.__numinia.view.vr.active && globalThis.__numinia.view.renderer.xr.isPresenting, null, 15000));
    await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
    await ctl(() => globalThis.__mirarMuneca());
    paso("girar la muñeca enseña el reloj", await esperar(() => globalThis.__numinia.view.vr.reloj.visible, null, 4000));
    const diag = await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico());
    paso("el reloj tiene el botón «camara»", diag.botones.includes("camara"), { botones: diag.botones });
    paso("antes de pulsar no hay foto", (await ctl(() => globalThis.__numinia.foto.ultima())) === null);

    const MUEBLES = () => globalThis.__numinia.view.vr.rig.children.map((c) => c.visible).join();
    const mueblesAntes = await ctl(MUEBLES);
    paso("rayo + gatillo en la cámara del reloj", await pulsarReloj("camara"));
    paso("la pulsación llega al reloj", (await ctl(() => globalThis.__numinia.view.vr.reloj.diagnostico())).ultimoPulsado === "camara");
    paso("sale una foto dentro de la sesión de VR", await esperar(() => !!globalThis.__numinia.foto.ultima(), null, 20000), { errors });
    paso("sigue dentro de la sesión de VR", await ctl(() => globalThis.__numinia.view.vr.active && globalThis.__numinia.view.renderer.xr.isPresenting));
    paso("lo que la foto escondió (panel, manos, viñeta…) vuelve a estar como estaba", (await ctl(MUEBLES)) === mueblesAntes, { antes: mueblesAntes, ahora: await ctl(MUEBLES) });
    const f = await ctl(MEDIR_FOTO);
    r.hallazgos.foto = f;
    if (process.env.FOTO_PNG) { const url = await ctl(() => globalThis.__numinia.foto.datos()); writeFileSync(process.env.FOTO_PNG, Buffer.from(url.split(",")[1], "base64")); } // to look at it
    paso("la foto es un PNG de 1280×720 con bytes", !!f && f.ancho === 1280 && f.alto === 720 && f.bytes > 1000 && /\.png$/.test(f.nombre), { f });
    paso("el marco: la franja del pie tiene el color de la casa", f.bandaFondo > 0.6 && f.bordeFondo > 0.95, { f });
    paso("el marco: el nombre del mundo y la barra ámbar en la franja", f.bandaTexto > 80 && f.bandaAmbar > 20, { f });
    paso("el mundo no sale negro (IWER pinta el render a textura)", f.mundoNoNegro > 0.2 && f.mundoDistinto > 3, { f });
    await a.waitForTimeout(500);
    paso("el archivo se ofrece para guardar", bajadas.length === 1 && /\.png$/.test(bajadas[0]), { bajadas });
    paso("sin errores de página dentro de VR", errors.length === 0, { errors });

    // a second press makes a second picture (another name or at least another file offered), the session untouched
    const antes = (await ctl(() => globalThis.__numinia.foto.ultima())).nombre;
    await a.waitForTimeout(1200); // the file name carries the second
    paso("segundo rayo + gatillo", await pulsarReloj("camara"));
    paso("la segunda foto sustituye a la primera", await esperar((n) => globalThis.__numinia.foto.ultima()?.nombre !== n, antes, 20000), { antes });
    paso("sigue en VR tras dos fotos", await ctl(() => globalThis.__numinia.view.renderer.xr.isPresenting));

    // out of VR: the picture waits on the page with its buttons
    await ctl(() => globalThis.__numinia.view.vr.exit());
    paso("sale de VR", await esperar(() => !globalThis.__numinia.view.vr.active, null, 10000));
    paso("al salir, la foto está en pantalla con sus botones", await esperar(() => { const p = document.querySelector("#foto .foto-hecha"); return !!p && !p.hidden && !!p.querySelector("img")?.getAttribute("src") && getComputedStyle(p).display !== "none"; }, null, 6000),
      { estado: await ctl(() => ({ hecha: !!globalThis.__numinia.foto.ultima(), activo: globalThis.__numinia.foto.activo(), panelOculto: document.querySelector("#foto .foto-hecha")?.hidden })) });
    await a.screenshot({ path: process.env.CAPTURA ?? "/tmp/foto-vr-salida.png" });
    paso("sin errores de página", errors.length === 0, { errors });
    r.ok = true;
  } catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
  finally { await browser.close(); }
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok ? 0 : 1);
}
pierna();
