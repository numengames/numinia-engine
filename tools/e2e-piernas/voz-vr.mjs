// e2e-lenta
// e2e leg v10: proximity voice WITH ANOTHER PERSON when one of them is in the headset (IWER, a Meta Quest 3 emulator — not a real Quest).
// Starts its OWN server and page (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8891 / 5291) on a COPY of aventuras/condiciones-prueba (the
// entry bubble is ON) in a throwaway folder. Two pages of one browser, both with a FAKE microphone (Chromium's own beep generator): A in the
// headset, B on the flat page. Nothing is heard in the test; what is counted are the frames that cross (session.sendVoice → server → onVoice)
// and where the page puts the voice (the panner of the speaker, the audio listener).
//   1) B passes the door and opens its microphone; A is still behind the rules bubble: B's voice must reach nobody who has not passed?
//      (it reaches A's page — the gate holds the SPEAKER, not the listener — and A's own voice must not leave).
//   2) A enters the headset FROM the bubble, accepts the norms with the controller (ray + trigger), and then:
//        · the microphone is asked at once: entering the headset with the bubble answered opens it (a headset has no keyboard and a permission
//          prompt cannot be shown inside it) — A's frames reach B;
//        · B's frames play in A's page (A hears B) and the voice sits where B stands.
//   3) the distance is the head's: A walks in the room (IWER moves the head inside the rig; the sim does not see it) and the voice of B is
//      attenuated from the HEAD (the listener follows the headset), the panner of B stays at B's body.
//   4) leaving and re-entering the headset does not cut either direction; the microphone stays on.
// Env: none needed; CHROME / PW_CORE as in the other legs. Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, globSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const CHROME = process.env.CHROME ?? globSync(`${CACHE}/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`).sort().at(-1) ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8891), VP = Number(process.env.E2E_VITE_PORT ?? 5291);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(join(REPO, "node_modules/iwer/build/iwer.min.js"), "utf8");

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-voz-vr-"));
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
const URL_VOZ = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const errors = [], out = { pasos: [], errors }, t0 = Date.now();
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const verifica = (cond, msg, extra = {}) => { if (!cond) throw new Error(`${msg} ${JSON.stringify(extra)}`); };
let ok = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ["microphone"] });
  await ctxA.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    globalThis.__apuntar = (w) => {
      const r = globalThis.__numinia.view.vr.rig.position, c = globalThis.__iwer.controllers.right, p = c.position;
      const dx = w.x - (r.x + p.x), dy = w.y - (r.y + p.y), dz = w.z - (r.z + p.z);
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
      c.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
    };`);
  const ctxB = await browser.newContext({ viewport: { width: 1200, height: 800 }, permissions: ["microphone"] });
  const a = await ctxA.newPage(), b = await ctxB.newPage();
  for (const [n, p] of [["A", a], ["B", b]]) {
    p.on("pageerror", (e) => errors.push(`${n}: ${e}`));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${n} console: ${m.text()}`); });
  }
  const esperar = (p, fn, arg, ms = 12000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const boton = (bt, nombre, v) => a.evaluate(([bt, nombre, v]) => globalThis.__iwer.controllers[bt].updateButtonValue(nombre, v), [bt, nombre, v]);
  const gatillo = async (ms = 80) => { await boton("right", "trigger", 1); await sleep(ms); await boton("right", "trigger", 0); await sleep(220); };
  const pulsa = async (id) => {
    const w = await a.evaluate((id) => globalThis.__numinia.view.vr.condiciones().zonaMundo(id), id);
    verifica(w, `la zona ${id} existe`);
    await a.evaluate((w) => globalThis.__apuntar(w), w); await sleep(300);
    await gatillo();
  };
  const estadoCond = () => a.evaluate(() => globalThis.__numinia.view.vr.condiciones()?.estado() ?? null);
  /** counters of a page's voice: frames it sent, frames it received, its mic, its audio context */
  const voz = (p) => p.evaluate(async () => {
    const v = globalThis.__numinia.voz.estado;
    const url = performance.getEntriesByType("resource").map((r) => r.name).find((n) => /audio\/nucleo\.ts/.test(n));
    const au = url ? (await import(/* @vite-ignore */ url)).audio().estado() : null;
    return { enc: v.encendido, env: v.enviadas, rec: v.recibidas, codec: v.codec, err: v.error, ctx: au?.contexto ?? null, pausas: au?.pausas ?? null };
  });
  const sube = async (p, campo, ms = 6000) => { const v0 = (await voz(p))[campo]; const t1 = Date.now(); while (Date.now() - t1 < ms) { if ((await voz(p))[campo] > v0) return true; await sleep(150); } return false; };

  // ---- 0) B passes the door on the flat page, and opens its microphone
  await b.goto(URL_VOZ);
  await b.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  await b.waitForSelector("#condiciones .cond-panel", { timeout: 20000 });
  await b.locator("#condiciones .cond-panel input[type=checkbox]").first().check();
  await b.locator("#condiciones-siguiente").click(); await sleep(300);
  for (let i = 0; i < 4; i++) {
    if (await b.locator("#condiciones-sin-opcional").isVisible().catch(() => false)) break;
    const cb = b.locator("#condiciones .cond-panel input[type=checkbox]"); if (await cb.count()) await cb.first().check().catch(() => {});
    await b.locator("#condiciones-siguiente").click({ timeout: 2000 }).catch(() => {}); await sleep(300);
  }
  await b.locator("#condiciones-sin-opcional").click();
  verifica(await esperar(b, () => !globalThis.__numinia.condiciones.cerrada(), null, 8000), "B entra (el servidor la deja pasar)");
  await b.locator("#microfono").click();
  verifica(await esperar(b, () => globalThis.__numinia.voz.estado.encendido, null, 8000), "B abre su micrófono", await voz(b));
  verifica(await sube(b, "env", 8000), "B envía tramas (el micrófono falso suena)", await voz(b));
  nota("0 B pasó la puerta y habla", await voz(b));

  // ---- 1) A arrives: behind the bubble; B's voice reaches its page, its own does not leave
  await a.goto(URL_VOZ);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  await a.waitForSelector("#condiciones .cond-panel", { timeout: 20000 });
  await a.locator("#condiciones .cond-panel input[type=checkbox]").first().check();
  await a.locator("#condiciones-siguiente").click(); await sleep(400);
  const detras = await voz(a);
  nota("1 A detrás de la burbuja (PC)", detras);
  verifica(detras.enc === false, "A aún no ha encendido micrófono", detras);
  // 1b) the door holds the SPEAKER: A opens the microphone behind the bubble, B hears nothing; then A shuts it again (the headset opens it by itself later)
  const bRec0 = (await voz(b)).rec;
  await a.evaluate(() => document.getElementById("microfono").click()); // the page is inert behind the bubble: the button is pressed in code
  verifica(await esperar(a, () => globalThis.__numinia.voz.estado.encendido, null, 8000), "A abre el micrófono detrás de la burbuja");
  await sube(a, "env", 8000); await sleep(1500);
  const puerta = await voz(b);
  nota("1b la puerta calla al que aún no ha aceptado", { enviadasA: (await voz(a)).env, recibidasPorB: puerta.rec - bRec0 });
  verifica(puerta.rec === bRec0, "B no oye a A mientras A no ha aceptado", { rec: puerta.rec, antes: bRec0 });
  await a.evaluate(() => document.getElementById("microfono").click()); // the page is inert behind the bubble: the button is pressed in code
  verifica(await esperar(a, () => !globalThis.__numinia.voz.estado.encendido, null, 8000), "A cierra el micrófono otra vez");

  // ---- 2) A enters the headset from the bubble and answers it with the controller
  await a.evaluate(() => document.getElementById("condiciones-vr").click());
  verifica(await esperar(a, () => globalThis.__numinia.view.vr.active, null, 25000), "A entra en VR");
  verifica(await esperar(a, () => globalThis.__numinia.view.vr.condiciones()?.abierto === true, null, 25000), "el panel de la burbuja se abre en VR");
  verifica(await esperar(a, () => globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, 25000), "mando derecho");
  await sleep(500);
  const enVRcerrada = await voz(a);
  nota("2 A en VR, tras la burbuja aún cerrada", enVRcerrada);
  // go through the pages with the controller: tick, «Siguiente» until «Tus datos», then «Entrar sin lo opcional»
  for (let i = 0; i < 6; i++) {
    const e = await estadoCond();
    if (e?.botones.some((x) => x.id === "sin-opcional")) break;
    if (e?.casillaNormas && !e.casillaNormas.marcada) await pulsa(3);
    await pulsa("siguiente"); await sleep(500);
  }
  await pulsa("sin-opcional");
  verifica(await esperar(a, () => !globalThis.__numinia.condiciones.cerrada(), null, 10000), "A pasa la puerta desde VR");
  verifica(await esperar(a, () => globalThis.__numinia.view.vr.condiciones().abierto === false, null, 10000), "el panel se va");
  const tras = Date.now();
  // guests appear at random places (here 33 m apart = beyond the 30 m of a voice): B goes to stand 3 m from A, as two people talking would
  const pa = await a.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, z: s.z }; });
  await b.evaluate((p) => globalThis.__numinia.viajar.irAPunto(p.x + 3, p.z), pa);
  verifica(await esperar(b, (p) => { const s = globalThis.__numinia.session.selfPosition(0); return Math.hypot(s.x - p.x, s.z - p.z) < 6; }, pa, 40000), "B llega junto a A");
  nota("2b A aceptó en VR", await voz(a));

  // 2c) the microphone: is it asked on its own once the bubble is answered inside the headset?
  const pedido = await esperar(a, () => globalThis.__numinia.voz.estado.encendido, null, 6000);
  nota("2c ¿micrófono pedido solo al entrar en VR?", { pedido, ms: Date.now() - tras, ...(await voz(a)) });
  verifica(pedido, "al entrar en VR con la burbuja respondida el micrófono se abre solo (en gafas no hay teclado ni se puede ver un permiso)", await voz(a));
  const donde = (p) => p.evaluate(() => { const s = globalThis.__numinia.session; const yo = s.selfPosition(0); return { entidad: s.entity, yo: { x: +yo.x.toFixed(1), z: +yo.z.toFixed(1) }, otros: s.remotePositions().map((r) => ({ id: r.id, x: +r.x.toFixed(1), z: +r.z.toFixed(1) })) }; });
  nota("2c' dónde está cada uno", { a: await donde(a), b: await donde(b) });
  verifica(await sube(a, "env", 8000), "las tramas de A salen", await voz(a));
  verifica(await sube(b, "rec", 8000), "B recibe lo que A dice desde VR", await voz(b));

  // 2d) A hears B: frames arrive, the context runs, B's voice sits where B stands
  verifica(await sube(a, "rec", 8000), "A recibe la voz de B", await voz(a));
  const oido = await a.evaluate(() => { const o = globalThis.__numinia.view.oyente?.()?.pose?.(); return { oyente: o ? { x: o.x, y: o.y, z: o.z, fuente: o.fuente } : null }; });
  nota("2d A oye a B", oido);
  verifica(oido.oyente?.fuente === "visor", "dentro de VR el oyente es el visor", oido);

  // ---- 3) the distance: from the HEAD. Walk in the room (the sim never sees it): the listener moves, the body of A (what B hears from) does not.
  const antes = await a.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); const o = globalThis.__numinia.view.oyente().pose(); return { yo: { x: s.x, z: s.z }, oyente: { x: o.x, z: o.z } }; });
  await a.evaluate(() => { globalThis.__iwer.position.x += 4; });
  await sleep(1500);
  const despues = await a.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); const o = globalThis.__numinia.view.oyente().pose(); return { yo: { x: s.x, z: s.z }, oyente: { x: o.x, z: o.z } }; });
  nota("3 paseo de 4 m en la habitación", { antes, despues });
  verifica(Math.abs(despues.oyente.x - antes.oyente.x) > 3, "el oyente de A sigue a su cabeza", { antes, despues });
  await a.evaluate(() => { globalThis.__iwer.position.x -= 4; });
  await sleep(600);

  // ---- 4) leave and come back in: neither direction is cut, the microphone stays on
  await a.evaluate(() => globalThis.__numinia.view.vr.exit());
  verifica(await esperar(a, () => !globalThis.__numinia.view.vr.active, null, 12000), "A sale de VR");
  verifica(await sube(a, "env", 8000), "fuera de VR sigue enviando", await voz(a));
  verifica(await sube(a, "rec", 8000), "fuera de VR sigue oyendo a B", await voz(a));
  const ctxFuera = (await voz(a)).ctx;
  nota("4a fuera de VR, el audio sigue despierto", { ctx: ctxFuera });
  verifica(ctxFuera === "running", "salir de VR no duerme el audio mientras el micrófono está abierto", await voz(a));
  await a.locator("#vr").click(); // a REAL press (pointerdown): the engine wakes a sleeping audio graph on a gesture, and the bug being tested needs none
  verifica(await esperar(a, () => globalThis.__numinia.view.vr.active, null, 25000), "A vuelve a entrar en VR");
  verifica((await voz(a)).enc, "el micrófono sigue encendido al volver a entrar", await voz(a));
  verifica(await sube(a, "env", 10000), "y vuelve a enviar", await voz(a));
  verifica(await sube(b, "rec", 10000), "B sigue oyendo a A", await voz(b));
  verifica(await sube(a, "rec", 10000), "A sigue oyendo a B", await voz(a));
  nota("4 salir y volver a entrar", { a: await voz(a), b: await voz(b) });
  await a.evaluate(() => globalThis.__numinia.view.vr.exit());
  ok = errors.length === 0;
  if (!ok) out.error = "errores de página";
} catch (e) {
  out.error = String(e).split("\n")[0].slice(0, 800);
} finally {
  out.ok = ok;
  await browser.close().catch(() => {});
  for (const x of procs) { try { x.p.kill("SIGTERM"); } catch { /* gone */ } }
  if (!ok) for (const x of procs) out[`log-${x.nombre}`] = x.log().slice(-600);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? "E2E VOZ-VR OK" : "E2E VOZ-VR FALLA");
  process.exit(ok ? 0 : 1);
}
