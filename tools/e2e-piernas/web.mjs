// e2e leg (N17): a web screen in a real browser, three ways, with NO network: this leg serves its own two pages on a
// spare port (one that lets itself be framed, one that answers X-Frame-Options: DENY like numinia.org does today) and
// starts its OWN engine server on another spare port with a world folder whose entorno/web.json lists only that port
// and ships the two screens (people appear at the origin; the screens hang 6 m north, facing them).
// 1) PC (1280×800): the server asked both sites (marco «si» / «no»); walking up, the open screen shows the live page in
//    an iframe laid over the panel (CSS3D); a REAL mouse click at the button's place on the screen (Playwright finds it
//    through the 3D transform) reaches the page inside (its counter goes to 1); the iframe is sandboxed (no top
//    navigation), has no camera/microphone (Permissions Policy), no referrer; the closed site is a card with «Abrir …»
//    (no iframe); walking behind the screen hides the page.
// 2) Phone (390×844, touch): the same screen answers a TAP.
// 3) VR (IWER Quest 3): inside VR no DOM is drawn (#web-capa hidden, every screen «xr»); the ray on the panel's
//    «Abrir fuera de VR» + trigger leaves VR and shows the card with the link to the page.
// No page errors anywhere. Env: BASE (the page, from tools/auto.sh e2e), SHOTS, SOLO=pc|movil|vr. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SHOTS = process.env.SHOTS ?? "";
const SOLO = process.env.SOLO ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url), "utf8");
const RAIZ = new URL("../../", import.meta.url).pathname;
const TMP = process.env.TMPDIR || "/tmp";

// ---- the two local pages ----
const pagina = (titulo) => `<!doctype html><meta charset="utf-8"><title>${titulo}</title>
<body style="margin:0;font:32px sans-serif;background:#fff;color:#123">
<h1 style="margin:20px">${titulo}</h1>
<button id="b" style="font-size:48px;padding:30px 60px;margin:20px">Púlsame</button> <span id="n">0</span>
<p id="p">${"Texto largo para desplazar. ".repeat(80)}</p>
<script>let n=0;document.getElementById("b").addEventListener("click",()=>{document.getElementById("n").textContent=String(++n)});</script>`;
const sitio = createServer((req, res) => {
  if (req.url?.startsWith("/pagina.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(pagina("Página de prueba")); return; }
  if (req.url?.startsWith("/cerrada.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" }); res.end(pagina("Web cerrada")); return; }
  res.writeHead(404); res.end();
});
await new Promise((ok) => sitio.listen(0, "127.0.0.1", ok));
const SP_SITIO = sitio.address().port;
const SITIO = `http://127.0.0.1:${SP_SITIO}`;

// ---- our own engine server with a world folder ----
const libre = () => new Promise((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const SP = await libre();
const DIR = join(TMP, `e2e-web-${SP}`);
mkdirSync(join(DIR, "entorno"), { recursive: true });
mkdirSync(join(DIR, "datos"), { recursive: true });
writeFileSync(join(DIR, "entorno", "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }));
writeFileSync(join(DIR, "entorno", "web.json"), JSON.stringify({ schema: "numinia-engine/web@1", dominios: [`127.0.0.1:${SP_SITIO}`], pantallas: [
  { id: "prueba", url: `${SITIO}/pagina.html`, titulo: "Página de prueba", texto: "Una página servida en esta máquina.", x: 0, y: 1.8, z: -6, ry: 0, ancho: 3.2, alto: 1.8 },
  { id: "cerrada", url: `${SITIO}/cerrada.html`, titulo: "Web cerrada", x: 4.5, y: 1.8, z: -6, ry: 0, ancho: 2.4, alto: 1.5 },
] }));
const ADMIN = "codigo-admin-e2e-web-largo";
const servidor = spawn(process.execPath, ["packages/server/src/main.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(SP), MUNDO_DIR: join(DIR, "entorno"), DATOS_DIR: join(DIR, "datos"), MOTOR_ADMIN: ADMIN, MOTOR_SECRET: "secreto-de-prueba-e2e-web-1234" }, stdio: ["ignore", "pipe", "pipe"] });
let logServidor = "";
servidor.stdout.on("data", (d) => { logServidor += d; }); servidor.stderr.on("data", (d) => { logServidor += d; });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${SP}/health`)).ok) break; } catch { /* not yet */ } await new Promise((ok) => setTimeout(ok, 250)); }
const PAGINA = BASE.replace(/server=[^&]*/, `server=ws://127.0.0.1:${SP}`) + (BASE.includes("server=") ? "" : `${BASE.includes("?") ? "&" : "?"}server=ws://127.0.0.1:${SP}`);

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), res = {};
const out = { pasos: [], res, errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const abrir = async (opts = {}, init = "") => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("crash", () => errors.push("la página se ha caído (crash)"));
  p.on("console", (m) => { if (m.type() === "error" && !/Refused to display|X-Frame-Options|frame-ancestors|Unsafe attempt to initiate navigation/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });
  await p.goto(PAGINA);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 40000 });
  return p;
};
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
async function caminar(p, x, z, cerca = 0.6, maxMs = 30000) {
  await p.bringToFront();
  const t = Date.now();
  let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (d <= cerca) break;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    const ms = Math.max(90, Math.min(1200, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / 1.5) * 1000));
    for (const k of held) await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    for (const k of held) await p.keyboard.up(k);
    await p.waitForTimeout(120);
  }
  return Math.round(d * 10) / 10;
}
const estadoWeb = (p) => p.evaluate(() => globalThis.__numinia.view.web.estado());
const de = (lista, id) => lista.find((e) => e.id === id) ?? null;
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/web-${n}.png` }); };
const listos = (p) => p.waitForFunction(() => { const l = globalThis.__numinia.web.pantallas(); return l.length === 2 && l.every((x) => x.marco !== "?"); }, null, { timeout: 15000 });
/** The page's counter inside the screen's iframe, and the button's centre on the screen (through the CSS3D transform). */
async function marcoDe(p) {
  await p.waitForFunction(() => !!document.querySelector("#web-capa iframe.web-iframe"), null, { timeout: 15000 });
  for (let i = 0; i < 40; i++) { const f = p.frames().find((x) => x.url().includes("/pagina.html")); if (f) { await f.waitForSelector("#b", { timeout: 10000 }); return f; } await p.waitForTimeout(250); }
  return null;
}

/** Where the inner page's button lands on the screen: its rect inside the page, through the screen's 3D transform. */
async function dondeBoton(p, f) {
  const r = await f.evaluate(() => { const b = document.getElementById("b").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  return p.evaluate(([x, y]) => globalThis.__numinia.view.web.puntoEnPantalla("prueba", x, y), [r.x, r.y]);
}
/** Walk north past the screen until the camera stands behind it (the camera follows a few metres behind you). */
async function aDetras(p) {
  for (let z = -9; z >= -24; z -= 3) {
    await caminar(p, 0, z, 0.8);
    await p.waitForTimeout(500);
    const e = de(await estadoWeb(p), "prueba");
    if (e?.motivo === "detrás") return e;
  }
  return de(await estadoWeb(p), "prueba");
}

// ------------------------------------------------------------------------------------------------------------- PC
if (!SOLO || SOLO === "pc") try {
  const p = await abrir();
  await listos(p);
  res.marcos = await p.evaluate(() => Object.fromEntries(globalThis.__numinia.web.pantallas().map((x) => [x.id, x.marco])));
  res.tarjetaRol = await p.evaluate(() => globalThis.__numinia.session.features.cards().filter((c) => c.feature === "web").map((c) => `${c.role}: ${c.name}`));
  nota("pantallas", { marcos: res.marcos });
  res.pcDist = await caminar(p, 1.5, -1.5);
  await p.waitForFunction(() => globalThis.__numinia.view.web.estado().find((e) => e.id === "prueba")?.iframe, null, { timeout: 15000 }).catch(() => {});
  res.pcEstado = await estadoWeb(p);
  const f = await marcoDe(p);
  res.pcIframe = !!f;
  if (f) {
    const atr = await p.evaluate(() => { const i = document.querySelector("#web-capa iframe.web-iframe"); return { sandbox: i.getAttribute("sandbox"), allow: i.getAttribute("allow"), referrer: i.getAttribute("referrerpolicy") }; });
    res.pcAtributos = atr;
    const punto = await dondeBoton(p, f);
    res.pcBoton = punto && { x: Math.round(punto.x), y: Math.round(punto.y) };
    if (punto) res.pcPila = await p.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 3).map((e) => `${e.tagName}.${e.className}`), [punto.x, punto.y]);
    await foto(p, "1-pc-cerca");
    if (punto) await p.mouse.click(punto.x, punto.y);
    await p.waitForTimeout(400);
    res.pcClics = await f.evaluate(() => document.getElementById("n").textContent);
    res.pcCamara = await f.evaluate(() => document.featurePolicy ? document.featurePolicy.allowsFeature("camera") : "sin featurePolicy");
    res.pcMicro = await f.evaluate(() => document.featurePolicy ? document.featurePolicy.allowsFeature("microphone") : "sin featurePolicy");
    res.pcArriba = await f.evaluate(() => { try { top.location.href = "about:blank"; return "navegó"; } catch { return "bloqueado"; } });
    await p.waitForTimeout(300);
    res.pcSigueEnElMundo = await p.evaluate(() => location.href.includes("server="));
    res.pcReferrer = await f.evaluate(() => document.referrer);
  }
  res.pcTarjeta = await p.evaluate(() => { const el = document.querySelector('#web-capa .web-pantalla[data-id="cerrada"]'); return el ? { tarjeta: !!el.querySelector(".web-tarjeta"), iframe: !!el.querySelector("iframe"), enlace: el.querySelector(".web-abrir-grande")?.getAttribute("href"), rel: el.querySelector(".web-abrir-grande")?.getAttribute("rel"), texto: el.querySelector(".web-abrir-grande")?.textContent } : null; });
  // behind the screen: the live page hides (its back is the panel's)
  // the click left the keyboard in the page inside (as any iframe does): a click on the world gives it back to walking
  await p.mouse.click(640, 560);
  await p.waitForTimeout(200);
  res.pcTecladoAlMundo = await p.evaluate(() => document.activeElement?.tagName !== "IFRAME");
  res.pcDetras = await aDetras(p);
  await foto(p, "2-pc-detras");
  nota("pc");
  await p.context().close();
} catch (e) { errors.push(`pc: ${String(e?.message ?? e).slice(0, 300)}`); }

// ---------------------------------------------------------------------------------------------------------- phone
if (!SOLO || SOLO === "movil") try {
  const m = await abrir({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await listos(m);
  res.movilDist = await caminar(m, 0, -2.5);
  await m.waitForFunction(() => globalThis.__numinia.view.web.estado().find((e) => e.id === "prueba")?.iframe, null, { timeout: 15000 }).catch(() => {});
  res.movilEstado = de(await estadoWeb(m), "prueba");
  const f = await marcoDe(m);
  if (f) {
    const punto = await dondeBoton(m, f);
    res.movilBoton = punto && { x: Math.round(punto.x), y: Math.round(punto.y) };
    if (punto) await m.touchscreen.tap(punto.x, punto.y);
    await m.waitForTimeout(400);
    res.movilToques = await f.evaluate(() => document.getElementById("n").textContent);
    await foto(m, "3-movil");
  }
  nota("movil");
  await m.context().close();
} catch (e) { errors.push(`movil: ${String(e?.message ?? e).slice(0, 300)}`); }

// ------------------------------------------------------------------------------------------------------------- VR
if (!SOLO || SOLO === "vr") try {
  const v = await abrir({ viewport: { width: 640, height: 400 } }, IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
  await listos(v);
  res.vrDist = await caminar(v, 0, -2);
  await v.waitForFunction(() => getComputedStyle(document.getElementById("vr")).display !== "none", null, { timeout: 8000 }).catch(() => {});
  await v.evaluate(() => document.getElementById("vr").click());
  await v.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 15000 }).catch(() => {});
  res.vrDentro = await v.evaluate(() => globalThis.__numinia.view.vr.active);
  await v.waitForTimeout(1200);
  res.vrCapaOculta = await v.evaluate(() => { const c = document.getElementById("web-capa"); return !c || getComputedStyle(c).display === "none"; });
  res.vrEstado = (await estadoWeb(v)).map((e) => `${e.id}:${e.motivo}:${e.dom}`);
  // point the right controller at the screen's «Abrir fuera de VR» and pull the trigger
  const apuntar = () => v.evaluate(() => {
    const n = globalThis.__numinia.view, b = n.web.botonMundo("prueba"); if (!b) return false;
    const c = globalThis.__iwer.controllers.right;
    const loc = n.vr.rig.worldToLocal(new n.vr.rig.position.constructor(b.x, b.y, b.z));
    const dx = loc.x - c.position.x, dy = loc.y - c.position.y, dz = loc.z - c.position.z;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const qy = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], qx = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
    const q = [qy[3] * qx[0], qy[1] * qx[3], -qy[1] * qx[0], qy[3] * qx[3]];
    c.quaternion.set(q[0], q[1], q[2], q[3]);
    return true;
  });
  res.vrApunta = await apuntar();
  await v.waitForTimeout(500);
  res.vrRayo = await v.evaluate(() => globalThis.__numinia.view.manos.estado?.().der?.apunta ?? null);
  await v.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("trigger", 1));
  await v.waitForTimeout(400);
  await v.evaluate(() => globalThis.__iwer.controllers.right.updateButtonValue("trigger", 0));
  await v.waitForFunction(() => !globalThis.__numinia.view.vr.active, null, { timeout: 8000 }).catch(() => {});
  res.vrFuera = !(await v.evaluate(() => globalThis.__numinia.view.vr.active));
  await v.waitForTimeout(400);
  res.vrTarjeta = await v.evaluate(() => { const t = document.getElementById("web-fuera"); const a = document.getElementById("web-fuera-abrir"); return t && !t.hidden ? { href: a.getAttribute("href"), rel: a.getAttribute("rel"), texto: a.textContent } : null; });
  await foto(v, "4-tras-vr");
  if (!res.vrFuera) await v.evaluate(() => globalThis.__numinia.view.vr.exit());
  nota("vr");
  await v.context().close();
} catch (e) { errors.push(`vr: ${String(e?.message ?? e).slice(0, 300)}`); }

await browser.close();
servidor.kill();
sitio.close();
const pc = !SOLO || SOLO === "pc", movil = !SOLO || SOLO === "movil", vr = !SOLO || SOLO === "vr";
const fallos = [];
const pide = (cond, que) => { if (!cond) fallos.push(que); };
if (pc) {
  pide(res.marcos?.prueba === "si" && res.marcos?.cerrada === "no", "el servidor no supo qué sitio se deja enmarcar");
  pide(res.tarjetaRol?.includes("pantalla: Página de prueba"), "sin ficha accesible");
  pide(res.pcIframe && de(res.pcEstado ?? [], "prueba")?.dom, "la pantalla abierta no muestra la página cerca");
  pide(res.pcClics === "1", "el clic del ratón no llegó a la página");
  pide(res.pcAtributos?.sandbox && !res.pcAtributos.sandbox.includes("allow-top-navigation") && /camera 'none'/.test(res.pcAtributos.allow) && res.pcAtributos.referrer === "no-referrer", "atributos de seguridad del iframe");
  pide(res.pcCamara === false && res.pcMicro === false, "la página de dentro tiene cámara o micrófono");
  pide(res.pcArriba === "bloqueado" && res.pcSigueEnElMundo, "la página de dentro pudo navegar el mundo");
  pide(res.pcReferrer === "", "la página de dentro sabe de dónde viene");
  pide(res.pcTarjeta?.tarjeta && !res.pcTarjeta.iframe && res.pcTarjeta.enlace?.endsWith("/cerrada.html") && /noopener/.test(res.pcTarjeta.rel ?? ""), "la web cerrada no es una tarjeta con «Abrir»");
  pide(res.pcTecladoAlMundo, "tras usar la página, un clic en el mundo no devolvió el teclado");
  pide(res.pcDetras && !res.pcDetras.dom && res.pcDetras.motivo === "detrás", "por detrás se seguía viendo la página");
}
if (movil) pide(res.movilToques === "1", "el toque del móvil no llegó a la página");
if (vr) {
  pide(res.vrDentro && res.vrCapaOculta && res.vrEstado?.every((e) => e.endsWith(":xr:false")), "dentro de VR se intentó dibujar el DOM");
  pide(res.vrRayo === "panel:1", "el rayo no apunta al botón «Abrir fuera de VR»");
  pide(res.vrFuera && res.vrTarjeta?.href?.endsWith("/pagina.html"), "«Abrir fuera de VR» no sacó de VR con el enlace");
}
pide(errors.length === 0, "errores en la página");
out.fallos = fallos;
console.log(JSON.stringify(out, null, 1));
if (fallos.length) console.log(logServidor.split("\n").filter((l) => l.includes("[web]") || l.includes("[mundo]")).join("\n"));
console.log(fallos.length ? "E2E WEB FALLA" : "E2E WEB OK");
process.exit(fallos.length ? 1 : 0);
