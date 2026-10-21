// e2e leg condiciones/c4: the entry bubble INSIDE the headset (IWER, a Meta Quest 3 emulator — not a real Quest). Starts its OWN server and
// page (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8861 / 5193) on a COPY of aventuras/condiciones-prueba in a throwaway folder; nothing
// else is touched.
//   1) on the flat page: the bubble is up; the first step's box is ticked and «Siguiente» pressed (the state to be kept), then «Entrar en VR»
//      (the bubble's own button: the bar's one is behind the inert page).
//   2) in VR: the panel is up ~1.2 m in front at eye height, on the SAME step with the SAME ticked box; the bubble around you is a faint tint
//      (the world is not darkened); the sticks do not move you (client: vr.axes() is zero) and the server holds you too.
//   3) the right stick turns pages (not the world: no snap turn); rays + trigger: «Siguiente» off until the box is ticked → ray on the box
//      + trigger ticks it → ray on «Siguiente» + trigger goes on → «Tus datos»: EMPTY boxes, the two equal buttons.
//   4) «Salir» asks twice (nothing happens on the first press). A trigger on «Entrar sin lo opcional» sends ACEPTAR with no data; the panel
//      fades with the burst and goes; the stick now moves you.
//   2c) c8: the panel is taken by its top bar (ray on the bar + trigger HELD) and moved: it follows the hand, faces the head, stays there
//      when the trigger is let go, never closer than 0,6 m nor further than 2 m; and its buttons still work where it ended up.
//   5) the cost: the panel is repainted only when something changed (counted), one texture.
// Env: SHOTS=<folder> saves the panel's canvas of every moment and a screenshot of the page in the headset (1400×900). Prints JSON; exit 0
// only when all is right. A fingertip/pinch press is covered by test/condiciones-vr.test.ts (geometry) — IWER's hands are not driven here.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, globSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const CHROME = process.env.CHROME ?? globSync(`${CACHE}/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`).sort().at(-1) ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8861), VP = Number(process.env.E2E_VITE_PORT ?? 5193);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-cond-vr-"));
const mundo = join(tmp, "mundo"); mkdirSync(join(mundo, "entorno"), { recursive: true }); mkdirSync(join(mundo, "datos"), { recursive: true });
cpSync(join(REPO, "aventuras/condiciones-prueba"), join(tmp, "aventura"), { recursive: true });
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: join(mundo, "entorno"), DATOS_DIR: join(mundo, "datos"), SESIONES_DIR: join(mundo, "sesiones"), AVENTURA_DIR: join(tmp, "aventura"), MOTOR_CONDICIONES_PUERTA: "" }, "servidor");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s1 = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s1?.ok) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const URL_CON = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], out = { pasos: [], errors }, t0 = Date.now();
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const verifica = (cond, msg, extra = {}) => { if (!cond) throw new Error(`${msg} ${JSON.stringify(extra)}`); };
let ok = false;

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    // aim the right controller from where it is at a world point (its position is local to the rig)
    globalThis.__apuntar = (w) => {
      const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
      const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
      c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
    };`);
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  const ctl = (code, arg) => a.evaluate(code, arg);
  const esperar = (fn, arg, ms = 8000) => a.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const boton = (b, nombre, v) => ctl(([b, nombre, v]) => globalThis.__iwer.controllers[b].updateButtonValue(nombre, v), [b, nombre, v]);
  const gatillo = async (ms = 80) => { await boton("right", "trigger", 1); await sleep(ms); await boton("right", "trigger", 0); await sleep(220); };
  const palanca = async (lado, x, y) => ctl(([lado, x, y]) => globalThis.__iwer.controllers[lado].updateAxes("thumbstick", x, y), [lado, x, y]);
  const estado = () => ctl(() => globalThis.__numinia.view.vr.condiciones()?.estado() ?? null);
  const yo = () => ctl(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, y: s.y, z: s.z }; });
  const lejos = (p0, p1) => Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const lienzo = async (nombre) => {
    if (!SHOTS) return;
    const url = await ctl(() => globalThis.__numinia.view.vr.condiciones()?.lienzo.toDataURL("image/png"));
    if (url) writeFileSync(join(SHOTS, `${nombre}.png`), Buffer.from(url.split(",")[1], "base64"));
    await a.screenshot({ path: join(SHOTS, `${nombre}-pagina.png`) }).catch(() => {});
  };
  /** ray at a zone of the panel (by id or button name) and the trigger */
  const pulsa = async (id) => {
    const w = await ctl((id) => globalThis.__numinia.view.vr.condiciones().zonaMundo(id), id);
    verifica(w, `la zona ${id} existe`);
    await ctl((w) => globalThis.__apuntar(w), w); await sleep(300);
    await gatillo();
  };

  await a.goto(URL_CON);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  await a.waitForSelector("#condiciones .cond-panel", { timeout: 20000 });
  await sleep(500);

  // 1) the flat page: tick house box, «Siguiente» (the state that must be kept)
  const plano0 = await ctl(() => ({ titulo: document.querySelector("#condiciones h1")?.textContent, vr: !!document.getElementById("condiciones-vr") }));
  verifica(plano0.vr, "la burbuja plana ofrece «Entrar en VR» (el botón de la barra queda tras la burbuja)", plano0);
  await a.locator("#condiciones .cond-panel input[type=checkbox]").first().check();
  await a.locator("#condiciones-siguiente").click(); await sleep(400);
  const plano1 = await ctl(() => ({ titulo: document.querySelector("#condiciones h1")?.textContent, eyebrow: document.querySelector("#condiciones .etq")?.textContent, paso: globalThis.__numinia.condiciones.estado.paso, normas: { ...globalThis.__numinia.condiciones.estado.marcas.normas } }));
  nota("1 en PC: casa aceptada y el segundo paso abierto", plano1);
  verifica(plano1.paso === 1 && plano1.normas.casa === true, "estado previo", plano1);
  const antesPos = await yo();
  await ctl(() => document.getElementById("condiciones-vr").click());
  verifica(await esperar(() => globalThis.__numinia.view.vr.active, null, 20000), "entra en VR");
  verifica(await esperar(() => globalThis.__numinia.view.vr.condiciones()?.abierto === true, null, 20000), "el panel de la burbuja se abre en VR", { vr: await ctl(() => ({ activo: globalThis.__numinia.view.vr.active, hay: !!globalThis.__numinia.view.vr.condiciones() })) });
  await sleep(500);
  verifica(await esperar(() => globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 20000), "mando derecho");

  // 2) the panel in VR: where, what, the state kept, the bubble faint
  let e = await estado();
  nota("2 panel en VR", { titulo: e.titulo, eyebrow: e.eyebrow, d: e.diagnostico, burbuja: e.burbuja, norma: e.casillaNormas, botones: e.botones.map((b) => `${b.id}${b.desactivado ? "(off)" : ""}`) });
  verifica(Math.abs(e.diagnostico.distanciaM - 1.2) < 0.1, "a ~1,2 m", e.diagnostico);
  const ojoY = await ctl(() => { const q = globalThis.__iwer.position; return globalThis.__numinia.view.vr.rig.position.y + q.y; });
  verifica(Math.abs(e.diagnostico.alturaM - (ojoY - 0.04)) < 0.1, "a la altura de los ojos", { panel: e.diagnostico.alturaM, ojoY });
  verifica(e.eyebrow.includes(plano1.eyebrow.split("·")[0].trim()) && e.titulo === plano1.titulo, "el mismo paso que en el plano", { e: e.titulo, plano1 });
  verifica(e.burbuja.visible && e.burbuja.opacidad <= 0.2, "la pompa es un tinte suave, nunca oscuro", e.burbuja);
  const vigOpacidad = await ctl(() => globalThis.__numinia.view.vr.vignetteOpacity);
  verifica(vigOpacidad < 0.05, "el mundo no se oscurece de golpe", { vigOpacidad });
  await lienzo("1-vr-paso2-inicio");
  // old help card and menu out of the way, the watch hidden
  verifica(!(await ctl(() => globalThis.__numinia.view.vr.estadoPaneles().panel)) && !(await ctl(() => globalThis.__numinia.view.vr.menu.abierto)), "una sola cosa delante: ni tarjeta de ayuda ni menú");
  // the sticks do not move you (client) and the server holds you
  await palanca("left", 0, -0.95); await sleep(1500);
  const ejes = await ctl(() => globalThis.__numinia.view.vr.axes());
  const p1 = await yo(); await palanca("left", 0, 0);
  verifica(ejes[0] === 0 && ejes[1] === 0, "el cliente no intenta mover (vr.axes() = 0)", { ejes });
  verifica(lejos(antesPos, p1) < 0.05, "ni el servidor te deja moverte", { d: lejos(antesPos, p1) });
  nota("2b la palanca izquierda no mueve", { ejes, metros: lejos(antesPos, p1) });
  // the paint count stays still when nothing changes
  const pinturas0 = (await estado()).pinturas; await sleep(1200); const pinturas1 = (await estado()).pinturas;
  verifica(pinturas1 - pinturas0 <= 1, "redibuja solo al cambiar", { pinturas0, pinturas1 });

  // 2c) c8: take the panel by its bar and put it somewhere else (the builder's gesture: hold the trigger, move the ray, let go)
  const barra0 = await ctl(() => globalThis.__numinia.view.vr.condiciones().zonaMundo(4));
  verifica(barra0, "la barra de arriba existe (zona 4)");
  const antesPanel = (await estado()).diagnostico;
  await ctl((w) => globalThis.__apuntar(w), barra0); await sleep(400);
  const apunta = await ctl(() => globalThis.__numinia.view.manos.sondeo("der")?.apunta);
  verifica(apunta === "panel:4", "el rayo está sobre la barra", { apunta });
  await boton("right", "trigger", 1); await sleep(300);
  e = await estado();
  verifica(e.agarrado === "der", "gatillo apretado sobre la barra = panel cogido por la mano derecha", { agarrado: e.agarrado });
  await lienzo("1b-vr-barra-cogida");
  const objetivo = { x: barra0.x + 0.7, y: barra0.y + 0.15, z: barra0.z + 0.2 };
  await ctl((w) => globalThis.__apuntar(w), objetivo); await sleep(500);
  e = await estado();
  verifica(Math.hypot(e.diagnostico.pos[0] - antesPanel.pos[0], e.diagnostico.pos[2] - antesPanel.pos[2]) > 0.3, "mientras lo sostienes el panel te sigue la mano", { antes: antesPanel.pos, ahora: e.diagnostico.pos });
  await boton("right", "trigger", 0); await sleep(500);
  e = await estado();
  const movido = Math.hypot(e.diagnostico.pos[0] - antesPanel.pos[0], e.diagnostico.pos[2] - antesPanel.pos[2]);
  nota("2c el panel cogido por la barra y movido", { antes: antesPanel.pos, despues: e.diagnostico.pos, movidoM: Math.round(movido * 100) / 100, horizontalM: e.diagnostico.horizontalM, haciaOjoGrados: e.diagnostico.haciaOjoGrados });
  verifica(e.agarrado === null, "soltar el gatillo suelta el panel", { agarrado: e.agarrado });
  verifica(movido > 0.3, "el panel se movió", { movido });
  verifica(e.diagnostico.horizontalM >= 0.6 - 0.02 && e.diagnostico.horizontalM <= 2 + 0.02, "dentro de 0,6–2 m de la cabeza", e.diagnostico);
  verifica(e.diagnostico.haciaOjoGrados < 3, "al soltar mira a la cabeza", e.diagnostico);
  await lienzo("1c-vr-panel-movido");
  const quieto = (await estado()).diagnostico.pos; await sleep(3200);
  verifica(JSON.stringify((await estado()).diagnostico.pos) === JSON.stringify(quieto), "se queda donde lo soltaste (no vuelve solo)", { quieto });
  // the limit: pushing the hand far forward while holding it cannot take the panel beyond 2 m
  const barra1 = await ctl(() => globalThis.__numinia.view.vr.condiciones().zonaMundo(4));
  await ctl((w) => globalThis.__apuntar(w), barra1); await sleep(400);
  const pos0 = await ctl(() => { const p = globalThis.__iwer.controllers.right.position; return { x: p.x, y: p.y, z: p.z }; });
  await boton("right", "trigger", 1); await sleep(300);
  verifica((await estado()).agarrado === "der", "se vuelve a coger por la barra");
  await ctl((z) => { const p = globalThis.__iwer.controllers.right.position; p.z = z; }, pos0.z - 2.5); await sleep(500);
  e = await estado();
  verifica(e.diagnostico.horizontalM <= 2.02, "con la mano muy adelantada no pasa de 2 m", e.diagnostico);
  await ctl(([x, y, z]) => { const p = globalThis.__iwer.controllers.right.position; p.x = x; p.y = y; p.z = z; }, [pos0.x, pos0.y, pos0.z]); await sleep(300);
  await boton("right", "trigger", 0); await sleep(400);
  nota("2d el límite de 2 m con la mano adelantada", { horizontalM: e.diagnostico.horizontalM });
  // pressing the bar is not a press of anything: nothing changed in the page's state
  verifica((await ctl(() => globalThis.__numinia.condiciones.estado.paso)) === 1 && (await estado()).botones.length > 0, "coger la barra no pulsa nada: sigues en el mismo paso");

  // 3) pages with the stick; back to step 1 to test the box and «Siguiente»
  await pulsa("atras"); await esperar(() => globalThis.__numinia.condiciones.estado.paso === 0, null, 4000); await sleep(400);
  e = await estado();
  verifica(e.titulo === "Las normas de este sitio", "«← Atrás» vuelve al primer paso", { t: e.titulo });
  verifica(e.casillaNormas?.marcada === true, "la casilla que marcaste en PC sigue marcada", e.casillaNormas);
  verifica(e.paginas >= 2, "el texto está paginado", { paginas: e.paginas });
  const yaw0 = await ctl(() => globalThis.__numinia.view.vr.yawDegrees);
  await palanca("right", 0.95, 0); await sleep(300); await palanca("right", 0, 0); await sleep(300);
  e = await estado();
  verifica(e.pagina === 1, "la palanca derecha pasa de página", { pagina: e.pagina });
  verifica((await ctl(() => globalThis.__numinia.view.vr.yawDegrees)) === yaw0, "y no te gira", {});
  await palanca("right", 0.95, 0); await sleep(1000); // held a whole second: still one page per push
  const sostenida = (await estado()).pagina; await palanca("right", 0, 0); await sleep(300);
  verifica(sostenida === 2, "una página por empujón (mantenida no repite…)", { sostenida });
  await palanca("right", -0.95, 0); await sleep(300); await palanca("right", 0, 0); await sleep(300);
  nota("3 la palanca pasa las páginas", { pagina: (await estado()).pagina, paginas: e.paginas });
  await lienzo("2-vr-paso1-paginas");
  // untick through the ray, «Siguiente» goes off, tick again, on
  await pulsa(3); await sleep(300);
  e = await estado();
  verifica(e.casillaNormas?.marcada === false && e.botones.find((b) => b.id === "siguiente")?.desactivado === true, "rayo + gatillo desmarca la casilla y «Siguiente» espera", e);
  await pulsa("siguiente"); await sleep(300);
  verifica((await estado()).titulo === "Las normas de este sitio", "con «Siguiente» apagado el gatillo no hace nada");
  await pulsa(3); await sleep(300);
  verifica((await estado()).casillaNormas?.marcada === true, "rayo + gatillo marca la casilla");
  await pulsa("siguiente"); await esperar(() => globalThis.__numinia.view.vr.condiciones().estado().titulo !== "Las normas de este sitio", null, 4000); await sleep(300);
  e = await estado();
  nota("3b rayo + gatillo en «Siguiente»", { titulo: e.titulo, paso: await ctl(() => globalThis.__numinia.condiciones.estado.paso) });
  verifica(/Numen Games|comunidad/i.test(e.titulo) || e.titulo !== "Las normas de este sitio", "paso 2", { t: e.titulo });
  // second layer: box, then «Tus datos»
  if (e.casillaNormas) { await pulsa(3); await sleep(300); }
  await pulsa("siguiente"); await esperar(() => globalThis.__numinia.view.vr.condiciones().estado().titulo === "Lo que tú eliges", null, 4000); await sleep(400);
  e = await estado();
  verifica(e.titulo === "Lo que tú eliges", "«Tus datos»", { t: e.titulo });
  verifica(e.casillasDatos.length >= 1 && e.casillasDatos.every((c) => c.marcada === false), "casillas de datos VACÍAS", e.casillasDatos);
  const dec = e.botones.filter((b) => b.id === "sin-opcional" || b.id === "todo");
  verifica(dec.length === 2 && dec.every((b) => !b.desactivado), "los dos botones iguales, activos", e.botones);
  verifica(e.botones.some((b) => b.id === "salir"), "Salir");
  nota("3c Tus datos en VR", { casillas: e.casillasDatos, botones: e.botones.map((b) => b.texto), paginas: e.paginas });
  await lienzo("3-vr-tus-datos");
  // the page of data: tick one, untick; the second page by the arrow
  if (e.paginas > 1) { await pulsa(2); await sleep(300); verifica((await estado()).pagina === 1, "la flecha › pasa de página"); await pulsa(1); await sleep(300); }
  await pulsa(20); await sleep(300);
  verifica((await estado()).casillasDatos[0].marcada === true, "el rayo marca un permiso opcional"); await lienzo("4-vr-dato-marcado");
  await pulsa(20); await sleep(300);
  verifica((await estado()).casillasDatos[0].marcada === false, "y lo desmarca");
  // «Salir» asks twice
  await pulsa("salir"); await sleep(400);
  const pide = await estado();
  verifica(/Otra vez/.test(pide.botones.find((b) => b.id === "salir")?.texto ?? "") && (await ctl(() => !globalThis.__numinia.condiciones.estado.saliendo)), "«Salir» pide confirmación y no sale a la primera", pide.botones);
  await lienzo("5-vr-salir-pregunta");
  await sleep(3300);
  verifica(!/Otra vez/.test((await estado()).botones.find((b) => b.id === "salir")?.texto ?? ""), "la pregunta caduca");
  nota("3d «Salir» pregunta y caduca");

  // 4) accept: «Entrar sin lo opcional» → panel out, bubble bursts, the stick moves you
  await pulsa("sin-opcional");
  verifica(await esperar(() => globalThis.__numinia.condiciones.estado.enviando || globalThis.__numinia.condiciones.estado.estallando || !globalThis.__numinia.condiciones.cerrada(), null, 6000), "se envía ACEPTAR");
  const estalla = await esperar(() => globalThis.__numinia.view.vr.condiciones().estado().estallando || !globalThis.__numinia.view.vr.condiciones().abierto, null, 6000);
  const durante = await estado();
  nota("4 aceptar: la pompa estalla", { estalla, burbuja: durante.burbuja, abierto: durante.abierto });
  verifica(await esperar(() => globalThis.__numinia.view.vr.condiciones().abierto === false, null, 6000), "el panel se va", await estado());
  const fin = await estado();
  verifica(!fin.diagnostico.visible && !fin.burbuja.visible, "ni panel ni pompa", fin);
  const serv = await ctl(() => { const c = globalThis.__numinia.session.condiciones; return c && { abierta: c.abierta, datos: c.aceptado?.datos }; });
  verifica(serv?.abierta === true && (serv.datos ?? []).length === 0, "el servidor te dejó pasar con datos []", serv);
  const q0 = await yo(); await palanca("left", 0, -0.95); await sleep(1800);
  const q1 = await yo(); await palanca("left", 0, 0);
  verifica(lejos(q0, q1) > 0.5, "ahora la palanca te mueve", { d: lejos(q0, q1) });
  nota("4b la locomoción VR vuelve", { metros: Math.round(lejos(q0, q1) * 100) / 100, serv });
  await lienzo("6-vr-dentro");
  await ctl(() => globalThis.__numinia.view.vr.exit());
  await esperar(() => !globalThis.__numinia.view.vr.active, null, 8000);
  ok = errors.length === 0;
  if (!ok) out.error = "errores de página";
} catch (e) {
  out.error = String(e).split("\n")[0].slice(0, 600);
} finally {
  out.ok = ok;
  await browser.close().catch(() => {});
  for (const x of procs) { try { x.p.kill("SIGTERM"); } catch { /* gone */ } }
  if (!ok) for (const x of procs) out[`log-${x.nombre}`] = x.log().slice(-600);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? "E2E CONDICIONES-VR OK" : "E2E CONDICIONES-VR FALLA");
  process.exit(ok ? 0 : 1);
}
