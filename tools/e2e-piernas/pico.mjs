// e2e leg (Pico 4 headset browser, PICO Browser 3.3.x = Chrome 105): a touch-looking browser with a Pico user agent and an
// emulated Quest 3 runtime (IWER) whose sessions have NO `enabledFeatures` (Chrome < 107). Checks what Pablo saw wrong on
// the real headset (2026-10-25): (1) the page is the `vr` profile, not a phone — no touch HUD, no «Saltar», and the
// «Entrar en VR» button is on screen (a coarse pointer + 5 touch points made it a phone that hid the button); (2) every
// session that comes back from requestSession is given an `enabledFeatures` list before three's setSession reads it;
// (3) when setSession throws, VR/AR say why (lastError), end the session and can be entered again — no zombie that
// answers false forever; (4) the real click enters VR and AR, and exits.
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&"); // IWER draws through WebGL
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const PICO_UA = "Mozilla/5.0 (X11; Linux x86_64; PICO 4 OS5.13.8 like Quest) AppleWebKit/537.36 (KHTML, like Gecko) PicoBrowser/3.3.46 Chrome/105.0.5195.68 VR Safari/537.36  OculusBrowser/7.0";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], checks = {};
const ok = (k, v, data) => { checks[k] = { ok: !!v, ...data }; };

try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 }, userAgent: PICO_UA, hasTouch: true, isMobile: true });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;
    Object.defineProperty(navigator, 'userAgent', { get: () => ${JSON.stringify(PICO_UA)}, configurable: true }); // IWER installs its own Quest user agent
    // Chrome 105: the session object has no enabledFeatures at all. Keep every session to look at it afterwards.
    globalThis.__sesiones = [];
    const xr = navigator.xr, pedir = xr.requestSession.bind(xr);
    xr.requestSession = async (m, i) => {
      const s = await pedir(m, i);
      Object.defineProperty(s, 'enabledFeatures', { value: undefined, configurable: true, writable: true });
      globalThis.__sesiones.push({ modo: m, sesion: s, terminada: false }); s.addEventListener('end', () => { globalThis.__sesiones.at(-1).terminada = true; });
      return s;
    };`);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe?.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });

  // ---- 1. the profile ----
  const perfil = await p.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches, toques: navigator.maxTouchPoints, ua: navigator.userAgent.includes("PicoBrowser"),
    clase: document.documentElement.dataset.aparato, tactil: document.documentElement.classList.contains("tactil"), saltar: !!document.getElementById("saltar"),
    caps: (({ aparato, aparatoForzado, interfazTactil, pantallaPequena }) => ({ aparato, aparatoForzado, interfazTactil, pantallaPequena }))(globalThis.__numinia.capacidades ?? {}),
  }));
  ok("precondición: el navegador parece un móvil (puntero grueso, toques) con el UA del Pico", perfil.coarse && perfil.toques > 0 && perfil.ua, perfil);
  ok("perfil: visor (vr), sin HUD táctil ni «Saltar»", perfil.clase === "vr" && !perfil.tactil && !perfil.saltar && perfil.caps.aparato === "vr" && perfil.caps.interfazTactil === false && perfil.caps.pantallaPequena === false && perfil.caps.aparatoForzado === false, perfil);
  await p.waitForSelector("#vr", { state: "visible", timeout: 10000 }).catch(() => {});
  const boton = await p.evaluate(() => { const b = document.getElementById("vr"), r = b?.getBoundingClientRect(); return { texto: b?.textContent, visible: !!b && getComputedStyle(b).display !== "none" && r.width > 0 && r.height > 0, caja: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; });
  ok("«Entrar en VR» está a la vista en la barra", boton.visible && boton.texto === "Entrar en VR", boton);

  const estado = (modo) => p.evaluate((m) => { const v = globalThis.__numinia.view[m]; return { estado: v.state, error: v.lastError, activo: m === "vr" ? v.active : v.state !== "off", xr: globalThis.__numinia.view.renderer.xr.enabled }; }, modo);
  const sesiones = () => p.evaluate(() => globalThis.__sesiones.map((s) => ({ modo: s.modo, features: Array.isArray(s.sesion.enabledFeatures) ? s.sesion.enabledFeatures : String(s.sesion.enabledFeatures), terminada: s.terminada })));
  /** Next setSession call rejects once (what three does on Chrome 105 when it reads enabledFeatures). */
  const romperUnaVez = () => p.evaluate(() => { const xr = globalThis.__numinia.view.renderer.xr, orig = xr.setSession.bind(xr); xr.setSession = async (s) => { xr.setSession = orig; throw new TypeError("Cannot read properties of undefined (reading 'includes')"); }; });

  // ---- 2. VR: setSession fails once → says why, ends the session, and a second click enters ----
  await romperUnaVez();
  await p.click("#vr");
  await p.waitForFunction(() => globalThis.__numinia.view.vr.lastError !== "", null, { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => globalThis.__sesiones.at(-1)?.terminada === true, null, { timeout: 5000 }).catch(() => {});
  const fallo = await estado("vr"), ses1 = await sesiones();
  ok("VR: si setSession falla se sabe por qué, la sesión se cierra y el estado vuelve a off", /includes/.test(fallo.error) && fallo.estado === "off" && fallo.xr === false && ses1.at(-1)?.terminada === true, { fallo, ses1 });
  await p.click("#vr");
  await p.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 }).catch(() => {});
  const dentro = await estado("vr"), ses2 = await sesiones();
  ok("VR: el segundo clic entra (nada de zombi) y la sesión sin enabledFeatures recibe la lista", dentro.activo && dentro.estado === "on" && ses2.at(-1)?.modo === "immersive-vr" && Array.isArray(ses2.at(-1)?.features), { dentro, ses2 });
  await p.waitForTimeout(1500);
  ok("VR: hay cuadros (el visor dibuja)", await p.evaluate(() => globalThis.__numinia.view.renderer.xr.isPresenting === true), {});
  // what a session mounts, counted: objects in the scene, the rig's and the camera's children, the hands' group
  const montado = () => p.evaluate(() => { const v = globalThis.__numinia.view, esc = v.vr.rig.parent; let n = 0; esc.traverse(() => n++); return { objetos: n, rig: v.vr.rig.children.length, camara: v.vr.rig.children.find((c) => c.isCamera)?.children.filter((c) => c.name !== "aviso-muneca").length ?? -1, // the “turn your wrist” notice is shown once per device: only the first entry has it
  manos: v.vr.rig.children.filter((c) => c.name === "manos").length }; });
  const montado1 = await montado();
  const pulsarVR = () => p.evaluate(() => document.getElementById("vr").click()); // inside a session IWER's overlay covers the page: press it from the page
  await pulsarVR(); // «Salir de VR»
  await p.waitForFunction(() => globalThis.__numinia.view.vr.state === "off", null, { timeout: 10000 }).catch(() => {});
  ok("VR: se sale", (await estado("vr")).estado === "off", {});
  // leave and enter again in the SAME page (no reload): the second entry must mount exactly what the first did
  await pulsarVR();
  await p.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const montado2 = await montado();
  ok("VR: salir y volver a entrar en la misma página monta lo mismo (nada duplicado)", (await estado("vr")).activo && montado2.manos === 1 && montado2.rig === montado1.rig && montado2.camara === montado1.camara && Math.abs(montado2.objetos - montado1.objetos) <= 2, { montado1, montado2 });
  await pulsarVR();
  await p.waitForFunction(() => globalThis.__numinia.view.vr.state === "off", null, { timeout: 10000 }).catch(() => {});

  // ---- 3. AR: the same ----
  const arHay = await p.evaluate(() => { const b = document.getElementById("ar"); return !!b && !b.hidden && getComputedStyle(b).display !== "none"; });
  ok("«Entrar en AR» está a la vista", arHay, {});
  if (arHay) {
    await romperUnaVez();
    await p.evaluate(() => globalThis.__numinia.view.ar.enter().catch(() => false));
    const falloAR = await p.evaluate(() => ({ error: globalThis.__numinia.view.ar.lastError, estado: globalThis.__numinia.view.ar.state, xr: globalThis.__numinia.view.renderer.xr.enabled }));
    ok("AR: si setSession falla se sabe por qué y el estado sigue off", /includes/.test(falloAR.error) && falloAR.estado === "off" && falloAR.xr === false, falloAR);
    // the button would open the chooser of the linked world (dardos-enlace.mjs covers it); the plain miniature is what we need here
    await p.evaluate(() => globalThis.__numinia.view.ar.enter().catch(() => false));
    await p.waitForFunction(() => globalThis.__numinia.view.ar.state !== "off", null, { timeout: 15000 }).catch(() => {});
    const dentroAR = await p.evaluate(() => globalThis.__numinia.view.ar.state), sesAR = await sesiones();
    ok("AR: el segundo clic entra y la sesión recibe la lista", dentroAR !== "off" && sesAR.at(-1)?.modo === "immersive-ar" && Array.isArray(sesAR.at(-1)?.features), { dentroAR, sesAR });
    await p.evaluate(() => globalThis.__numinia.view.ar.exit());
    await p.waitForFunction(() => globalThis.__numinia.view.ar.state === "off", null, { timeout: 10000 }).catch(() => {});
    ok("AR: se sale", (await p.evaluate(() => globalThis.__numinia.view.ar.state)) === "off", {});
  }
} catch (e) {
  ok("sin excepción", false, { error: String(e?.stack ?? e).slice(0, 600) });
}
ok("sin errores de página", errors.length === 0, { errors: errors.slice(0, 5) });
await browser.close();
const todo = Object.values(checks).every((c) => c.ok);
console.log(JSON.stringify({ leg: "pico", ok: todo, checks }, null, 1));
process.exit(todo ? 0 : 1);
