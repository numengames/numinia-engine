// e2e-lenta
// e2e leg H7 + H6 + J4 («mundo»): ONE throwaway world with its own server and page (E2E_SERVER_PORT / E2E_VITE_PORT, default
// 8802 / 5182), chromium. (1) H7: the owner (/dueño) opens «Entorno» → «Ajustes del mundo», renames the world and sets the limit
// to 2; the guest's tab title follows at once, aventura/ficha.json holds it, and a third tab is refused with «está lleno».
// (2) H6: a named picture placed in the world is in the twin list «Imágenes del mundo» (accessibility tree), a decorative one is
// not. (3) J4: the picture carries a https link; its twin button asks (a real dialog) and, on accept, asks the browser for a NEW noopener tab; on dismiss
// nothing is asked. Prints JSON; exit 0 only when right. SHOTS=<dir> writes screenshots.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { deflateSync } from "node:zlib";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8802), VP = Number(process.env.E2E_VITE_PORT ?? 5182);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const ADMIN = "codigo-de-administracion-largo";
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


const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-mundo-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos"), aventura = join(tmp, "aventura");
for (const d of [entorno, datos, aventura]) mkdirSync(d);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }, null, 2));
writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Plaza de prueba", notas: "no se toca" }));

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: aventura, MOTOR_CONSTRUIR: "todos", MOTOR_ADMIN: ADMIN }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`, HTTP = `http://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], out = { pasos: [], errors };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  await ctx.addInitScript(() => { const o = window.open.bind(window); globalThis.__abiertas = []; window.open = (...a) => { globalThis.__abiertas.push(a.slice(0, 3)); return o(...a); }; }); // records what the page asked to open (and still does it)
  const abrir = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
    return p;
  };
  const a = await abrir(), b = await abrir();
  const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/mundo-${n}.png` }); };

  // ---- H7: the owner sets title and limit from the panel ----
  await a.evaluate((c) => globalThis.__numinia.chat.decir(`/dueño ${c}`), ADMIN);
  await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede, null, { timeout: 10000 });
  await a.bringToFront(); await a.mouse.move(400, 300); await a.keyboard.press("KeyC"); // build mode (the settings live in the builder's «Entorno» drawer)
  await a.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 10000 });
  await a.evaluate(() => globalThis.__numinia.constructorUI.abrirCajon("entorno"));
  await a.waitForFunction(() => { const f = document.getElementById("ficha-mundo"); return f && !f.hidden && f.getBoundingClientRect().height > 0; }, null, { timeout: 10000 }).catch(async (e) => {
    out.diag = await a.evaluate(() => { const f = document.getElementById("ficha-mundo"), n = globalThis.__numinia; return { existe: !!f, hidden: f?.hidden, h: f?.getBoundingClientRect().height, padreHidden: f?.parentElement?.hidden, cajon: n.constructorUI.cajonAbierto?.(), cadena: (() => { const r = []; for (let e = f; e && r.length < 8; e = e.parentElement) { const cs = getComputedStyle(e); r.push(`${e.tagName}#${e.id}.${e.className} d=${cs.display} h=${Math.round(e.getBoundingClientRect().height)} hid=${e.hidden}`); } return r; })(), hijos: f ? [...f.children].map((c) => c.tagName + ':' + Math.round(c.getBoundingClientRect().height)) : null, puede: n.constructor.estado.puede, ajustes: n.ajustesMundo ?? null }; });
    throw e;
  });
  out.panel = await a.evaluate(() => ({ titulo: document.getElementById("ficha-nombre").value, aforo: document.getElementById("ficha-aforo").value, avatares: [...document.querySelectorAll("#ficha-avatar option")].length, etiquetas: [...document.querySelectorAll("#ficha-mundo input, #ficha-mundo select")].every((c) => c.labels?.length > 0) }));
  await a.locator("#ficha-nombre").fill("Plaza renombrada");
  await a.locator("#ficha-aforo").fill("2");
  await foto(a, "1-panel");
  await a.locator("#ficha-guardar").click();
  await a.waitForFunction(() => /Guardado/.test(document.getElementById("ficha-estado").textContent), null, { timeout: 10000 });
  await b.waitForFunction(() => document.title === "Plaza renombrada", null, { timeout: 10000 });
  out.tituloB = await b.title();
  const fichero = JSON.parse(readFileSync(join(aventura, "ficha.json"), "utf8"));
  out.ficha = fichero;
  const estado = await (await fetch(`${HTTP}/status`)).json();
  out.status = { nombre: estado.nombre, aforo: estado.aforo };
  const c = await ctx.newPage();
  c.on("pageerror", (e) => errors.push(String(e)));
  await c.goto(BASE);
  await c.waitForFunction(() => !document.getElementById("mundo-lleno").hidden, null, { timeout: 30000 });
  out.lleno = await c.evaluate(() => document.getElementById("mundo-lleno").textContent);
  await foto(c, "2-lleno");
  await c.close();

  // ---- H6 + J4: a named picture with a link, a decorative one ----
  await a.keyboard.press("KeyC"); // back to playing (building never opens links)
  await a.waitForFunction(() => document.getElementById("panel-construir").hidden, null, { timeout: 5000 });
  const tono = Date.now() % 50;
  const cartel = png(512, 256, [249, 200 - tono, 120]), hc = await sha(cartel), deco = png(64, 64, [10, 10, 10 + tono]), hd = await sha(deco);
  const billete = await a.evaluate(() => localStorage.getItem("numinia.invitado"));
  for (const [h, buf] of [[hc, cartel], [hd, deco]]) {
    const put = await fetch(`${HTTP}/a/${h}.png`, { method: "PUT", headers: { authorization: `Bearer ${billete}`, "content-type": "image/png" }, body: buf });
    if (put.status !== 200 && put.status !== 201) throw new Error(`PUT ${put.status}`);
  }
  const yo = await a.evaluate(() => globalThis.__numinia.session.selfPosition(0));
  const sitio = (dz) => ({ x: Math.round(yo.x * 100) / 100, y: 1.6, z: Math.round((yo.z - dz) * 100) / 100 });
  const poner = async (h, nombre, dz) => {
    await a.evaluate(({ h, nombre, s }) => globalThis.__numinia.constructor.colocarFichero(h, "png", nombre, s), { h, nombre, s: sitio(dz) });
    await a.waitForFunction((h) => [...globalThis.__numinia.session.features.stateOf("objetos").values()].some((v) => v.modelo === h), h, { timeout: 8000 });
    return a.evaluate((h) => [...globalThis.__numinia.session.features.stateOf("objetos")].find(([, v]) => v.modelo === h)[0], h);
  };
  const idCartel = await poner(hc, "Cartel de la plaza", 4), idDeco = await poner(hd, "adorno", 6);
  await a.evaluate(async ({ idCartel, idDeco }) => {
    const s = globalThis.__numinia.session.features;
    s.send("objetos", "nombrar", { id: idCartel, nombre: "Cartel de la plaza", decorado: false });
    s.send("objetos", "nombrar", { id: idDeco, nombre: "", decorado: true });
    s.send("objetos", "ajustar", { id: idCartel, enlace: "https://numinia.com/", oculto: false, volumen: 1, solido: false, colision: "ninguna", alcance: "burbuja", radio: 8 });
  }, { idCartel, idDeco });
  await a.waitForFunction((id) => globalThis.__numinia.gemelos.lista().some((g) => g.id === id && g.enlace), idCartel, { timeout: 10000 });
  out.gemelos = await a.evaluate(() => globalThis.__numinia.gemelos.lista().map((g) => ({ nombre: g.nombre, texto: g.texto, enlace: g.enlace })));
  out.arbol = await a.locator("#gemelos-mundo").ariaSnapshot();
  const boton = a.locator("#gemelos-mundo button");
  out.boton = await boton.count();
  // dismiss: nothing is asked of the browser to open; accept: window.open(url, "_blank", "noopener") exactly once.
  // (The popup itself is not asserted: chrome-headless-shell does not surface a noopener tab as a page; the call is what the page owns.)
  a.once("dialog", (d) => { out.pregunta = d.message(); d.dismiss(); });
  await boton.first().focus(); await a.keyboard.press("Enter"); // keyboard, as a screen-reader user does
  await sleep(600);
  out.llamadasTrasNo = await a.evaluate(() => globalThis.__abiertas.length);
  a.once("dialog", (d) => d.accept());
  await boton.first().focus(); await a.keyboard.press("Enter");
  await sleep(600);
  out.llamadasOpen = await a.evaluate(() => globalThis.__abiertas);
  await foto(a, "3-cartel");

  ok = errors.length === 0 && out.panel.etiquetas && out.panel.titulo === "Plaza de prueba"
    && out.tituloB === "Plaza renombrada" && out.ficha.nombre === "Plaza renombrada" && out.ficha.aforo === 2 && out.ficha.notas === "no se toca"
    && out.status.nombre === "Plaza renombrada" && out.status.aforo === 2 && /está lleno/.test(out.lleno)
    && out.gemelos.length === 1 && out.gemelos[0].nombre === "Cartel de la plaza" && /Cartel de la plaza/.test(out.arbol) && !/adorno/.test(out.arbol)
    && out.boton === 1 && /https:\/\/numinia\.com\//.test(out.pregunta ?? "") && out.llamadasTrasNo === 0 && out.llamadasOpen.length === 1 && out.llamadasOpen[0][0] === "https://numinia.com/" && out.llamadasOpen[0][1] === "_blank" && out.llamadasOpen[0][2] === "noopener";
} catch (e) {
  out.fallo = String(e?.stack ?? e).split("\n").slice(0, 6).join("\n");
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").slice(-15);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
