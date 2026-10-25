// e2e leg MIS-222 (t_ac672264, story 1 of 2): fill a hole of the gallery FROM INSIDE VR with an image already on the server — there is no
// file picker in a headset. One Quest 3 emulated with IWER (helpers of foto-vr.mjs / graboso-vr.mjs). Before entering VR a builder
// (the e2e server runs with MOTOR_CONSTRUIR=todos) uploads two cards and hangs them in front of itself: A becomes a 2.4 × 1.6 m hole,
// B stays a plain picture (the image «already uploaded»). In VR the ray aims at the hole and the trigger opens the menu's «Obra» view
// (not a file chooser: none opens), which lists both images; pressing «Poner» on B's row asks the server, which fits B into the frame.
// A second tab sees it. The session never leaves VR. Not a Quest: IWER only. Env: BASE (…/?webgl2&server=ws://127.0.0.1:<port>),
// SERVER_HTTP, CHROME, PW_CORE. Prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");

/** A plain-colour RGB PNG of w × h (zlib + CRC32: no dependency). */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, [r, g, b]) {
  const fila = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { fila[1 + 3 * x] = r; fila[2 + 3 * x] = g; fila[3 + 3 * x] = b; }
  const trozo = (tipo, datos) => {
    const t = Buffer.from(tipo, "ascii"), l = Buffer.alloc(4), c = Buffer.alloc(4);
    l.writeUInt32BE(datos.length); c.writeUInt32BE(crc32(Buffer.concat([t, datos])));
    return Buffer.concat([l, t, datos, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => fila)))), trozo("IEND", Buffer.alloc(0))]);
}
const sha = async (b) => Buffer.from(await crypto.subtle.digest("SHA-256", b)).toString("hex");

const SERVER_HTTP = process.env.SERVER_HTTP ?? "http://127.0.0.1:8790";

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
    let selectores = 0; a.on("filechooser", () => { selectores++; });
    await a.goto(BASE);
    paso("la página arranca", await esperar(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, 30000));
    paso("puede construir", await esperar(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, 10000));
    // a second tab (not in VR) to see what happens on the wall
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push("B " + String(e)));
    await b.goto(BASE); await b.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
    await a.bringToFront();

    // the two cards go up and hang 2.5 m in front of A; A is made a hole
    const tono = Date.now() % 200;
    const cartelA = png(768, 512, [249, 235, 220 - (tono % 50)]), shaA = await sha(cartelA);
    const cartelB = png(640, 640, [1, 142, 161 + (tono % 50)]), shaB = await sha(cartelB);
    const billete = await ctl(() => localStorage.getItem("numinia.invitado"));
    for (const [s, c] of [[shaA, cartelA], [shaB, cartelB]]) {
      const put = await fetch(`${SERVER_HTTP}/a/${s}.png`, { method: "PUT", headers: { authorization: `Bearer ${billete}`, "content-type": "image/png" }, body: c });
      paso("sube un cartel", put.status === 200 || put.status === 201, { status: put.status });
    }
    const yo = await ctl(() => globalThis.__numinia.session.selfPosition(0));
    const sitio = { x: Math.round(yo.x * 100) / 100, y: 1.6, z: Math.round((yo.z - 2.5) * 100) / 100 };
    await ctl(({ s, sitio }) => globalThis.__numinia.constructor.colocarFichero(s, "png", "Hueco de VR", sitio), { s: shaA, sitio });
    await ctl(({ s, sitio }) => globalThis.__numinia.constructor.colocarFichero(s, "png", "Mar de VR", { x: sitio.x + 6, y: 1.6, z: sitio.z }), { s: shaB, sitio });
    await esperar(({ a, b }) => { const m = [...globalThis.__numinia.session.features.stateOf("objetos").values()]; return m.some((v) => v.modelo === a) && m.some((v) => v.modelo === b); }, { a: shaA, b: shaB }, 8000);
    const hueco = await ctl((s) => [...globalThis.__numinia.session.features.stateOf("objetos")].find(([, v]) => v.modelo === s)[0], shaA);
    await ctl((id) => { const c = globalThis.__numinia.constructor; c.transformar(id, { sx: 1.6, sy: 1.6, sz: 1.6 }); c.hueco(id, 2.4, 1.6); }, hueco);
    paso("el cartel A es un hueco", await esperar((id) => globalThis.__numinia.constructor.huecos().some((h) => h.id === id), hueco, 6000), { hueco });
    paso("el servidor lista dos imágenes subidas", await ctl(() => globalThis.__numinia.constructor.imagenes().length >= 2));
    await esperar(() => !!globalThis.__numinia.view.pickThing, null, 2000);

    // into VR
    paso("«Entrar en VR» ya no dice «Preparando…»", await esperar(() => { const x = document.getElementById("vr"); return !!x && !x.hidden && !/Preparando/.test(x.textContent || ""); }, null, 30000));
    await ctl(() => document.getElementById("vr").click());
    paso("entra en VR", await esperar(() => globalThis.__numinia.view.vr.active && globalThis.__numinia.view.renderer.xr.isPresenting, null, 15000));
    await esperar(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000);
    await a.waitForTimeout(1500);

    // the ray at the hole + trigger → the menu opens on «Obra»
    const centro = { x: sitio.x, y: sitio.y, z: sitio.z };
    await ctl((w) => globalThis.__apuntar(w), centro);
    r.hallazgos.rayoVivo = await esperar(() => globalThis.__numinia.view.manos.estado().der?.rayo === true, null, 10000);
    r.hallazgos.cosas = await ctl(() => globalThis.__numinia.view.objects());
    await a.waitForTimeout(400);
    const apunta = await ctl(() => globalThis.__numinia.view.manos.estado().der?.apunta);
    r.hallazgos.apunta = apunta;
    paso("el rayo apunta al hueco", apunta === hueco, { apunta, hueco });
    await gatillo();
    paso("el menú se abre en «Obra»", await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 4000));
    const contenido = await ctl(() => globalThis.__numinia.menuVR.contenido("obra"));
    r.hallazgos.obra = { titulo: contenido.titulo, filas: contenido.filas.map((f) => [f.texto, f.detalle]) };
    paso("el título dice qué hueco es y cuánto mide", /Hueco de VR/.test(contenido.titulo) && /2,4 × 1,6/.test(contenido.titulo), { titulo: contenido.titulo });
    paso("la vista lista las imágenes ya subidas (con «Poner»)", contenido.filas.length >= 2 && contenido.filas.every((f) => f.botones?.[0]?.texto === "Poner"), { filas: contenido.filas.map((f) => f.texto) });
    paso("no se abrió ningún selector de ficheros", selectores === 0, { selectores });
    if (process.env.MENU_PNG) { // the menu's own canvas (what the headset draws), to look at it
      const url = await ctl(() => globalThis.__numinia.view.vr.menu.malla.material.map.image.toDataURL("image/png"));
      writeFileSync(process.env.MENU_PNG, Buffer.from(url.split(",")[1], "base64"));
    }

    // «Poner» on B's row: the ray at its button, trigger
    const fila = contenido.filas.findIndex((f) => f.texto === "Mar de VR");
    paso("la imagen B está en la lista", fila >= 0, { filas: contenido.filas.map((f) => f.texto) });
    const zona = await ctl((i) => globalThis.__numinia.view.vr.menu.zonaMundo(100 + i), fila);
    r.hallazgos.zona = zona;
    paso("el botón «Poner» de esa fila está en el panel", !!zona, { fila });
    await ctl((w) => globalThis.__apuntar(w), zona); await a.waitForTimeout(400);
    paso("el rayo apunta al botón", /^panel:/.test((await ctl(() => globalThis.__numinia.view.manos.estado().der?.apunta)) ?? ""));
    await gatillo();
    paso("el servidor encaja B en el hueco", await esperar(({ id, s }) => globalThis.__numinia.session.features.stateOf("objetos").get(id)?.modelo === s, { id: hueco, s: shaB }, 15000), { hueco });
    const tras = await ctl((id) => { const v = globalThis.__numinia.session.features.stateOf("objetos").get(id); return v && { modelo: v.modelo, ext: v.ext, lleno: v.huecoLleno, sx: Math.round(v.sx * 100) / 100 }; }, hueco);
    r.hallazgos.hueco = tras;
    paso("el hueco queda lleno con esa imagen, entera (cuadrada: 1,6 de alto)", tras.lleno === true && tras.modelo === shaB && tras.sx === 1.6, { tras });
    paso("el menú se cierra y sigues en VR", await esperar(() => !globalThis.__numinia.view.vr.menu.abierto && globalThis.__numinia.view.renderer.xr.isPresenting, null, 4000));
    paso("la otra pestaña lo ve", await b.waitForFunction(({ id, s }) => globalThis.__numinia.session.features.stateOf("objetos").get(id)?.modelo === s, { id: hueco, s: shaB }, { timeout: 8000 }).then(() => true, () => false));
    paso("sigue sin haberse abierto un selector de ficheros", selectores === 0, { selectores });

    // a second go: the hole already holds a work; the view says it is replaced, and Poner with A puts the card back
    await ctl((w) => globalThis.__apuntar(w), centro); await a.waitForTimeout(400);
    await gatillo();
    paso("pulsado de nuevo, vuelve a abrirse en «Obra»", await esperar(() => globalThis.__numinia.view.vr.menu.abierto, null, 4000));
    const c2 = await ctl(() => globalThis.__numinia.menuVR.contenido("obra"));
    paso("con obra puesta, avisa de que la sustituye", /sustituye/.test(c2.nota), { nota: c2.nota });
    paso("sin errores de página", errors.length === 0, { errors });
    r.ok = true;
  } catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
  finally { await browser.close(); }
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok ? 0 : 1);
}
pierna();
