// e2e-lenta
// e2e leg MIS-265 («portada»): ONE throwaway world with its own server and page (E2E_SERVER_PORT / E2E_VITE_PORT, default
// 8806 / 5186), chromium. The owner (/dueño) opens the photo mode, takes a picture and presses «Usar de portada»: the picture
// is uploaded as a JPEG of at most 1600 px, aventura/ficha.json names it as `portada` (every other key kept), and the
// world's own page (WWW_DIR, as the fleet's container serves it) now carries og:image on the address the visitor asked for —
// the tag numinia.com's worlds room reads for the world's card. A guest's photo has no such button. Prints JSON; exit 0
// only when right. SHOTS=<dir> writes screenshots.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8806), VP = Number(process.env.E2E_VITE_PORT ?? 5186);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
const ADMIN = "codigo-de-administracion-largo";

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-portada-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos"), aventura = join(tmp, "aventura"), www = join(tmp, "www");
for (const d of [entorno, datos, aventura, www]) mkdirSync(d);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }, null, 2));
writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Plaza de prueba", notas: "no se toca" }));
// the world's own page as the engine serves it (the built page is not needed: only its <head> is read here)
writeFileSync(join(www, "index.html"), "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\" /><title>Mundo</title></head><body></body></html>");

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: aventura, WWW_DIR: www, MOTOR_CONSTRUIR: "todos", MOTOR_ADMIN: ADMIN }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`, HTTP = `http://127.0.0.1:${SP}`;
/** The world's page as numinia.com's worlds room reads it (worlds-source.ts parseFace), through the fleet's Caddy. */
const ogImagen = async () => {
  const html = await (await fetch(`${HTTP}/`, { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "plaza.numinia.com" } })).text();
  return /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html)?.[1] ?? null;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], out = { errors };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const abrir = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.ajustesMundo.actual() !== null, null, { timeout: 60000 });
    return p;
  };
  const a = await abrir(), b = await abrir();
  out.antes = await ogImagen();

  // ---- a guest: the photo, and no «Usar de portada» ----
  await b.bringToFront();
  await b.evaluate(() => globalThis.__numinia.foto.abrir());
  await sleep(400);
  out.invitado = await b.evaluate(async () => { const r = await globalThis.__numinia.foto.disparar(); return { ok: r.ok, boton: !document.querySelector("#foto .foto-portada").hidden }; });

  // ---- the owner: photo → «Usar de portada» ----
  await a.bringToFront();
  await a.evaluate((c) => globalThis.__numinia.chat.decir(`/dueño ${c}`), ADMIN);
  await a.waitForFunction(() => globalThis.__numinia.ajustesMundo.estado.puede, null, { timeout: 10000 });
  await a.evaluate(() => globalThis.__numinia.foto.abrir());
  await sleep(600);
  out.foto = await a.evaluate(async () => globalThis.__numinia.foto.disparar());
  const boton = a.locator("#foto .foto-portada");
  out.botonVisible = await boton.isVisible();
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/portada-1-boton.png` });
  await boton.click();
  await a.waitForFunction(() => /portada del mundo|No se puso/.test(document.querySelector("#foto .foto-hecha .estado")?.textContent ?? ""), null, { timeout: 20000 });
  out.estado = await a.evaluate(() => document.querySelector("#foto .foto-hecha .estado").textContent);
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/portada-2-hecha.png` });

  out.ficha = JSON.parse(readFileSync(join(aventura, "ficha.json"), "utf8"));
  out.ajustesB = await b.evaluate(() => globalThis.__numinia.ajustesMundo.actual()?.portada ?? "");
  out.despues = await ogImagen();
  const ruta = out.despues?.replace(/^https:\/\/plaza\.numinia\.com/, "") ?? "";
  const img = await fetch(`${HTTP}${ruta}`);
  const bytes = Buffer.from(await img.arrayBuffer());
  out.imagen = { status: img.status, tipo: img.headers.get("content-type"), kB: Math.round(bytes.length / 1024), jpeg: bytes[0] === 0xff && bytes[1] === 0xd8 };
  out.medida = await a.evaluate(async (u) => { const r = await fetch(u); const bm = await createImageBitmap(await r.blob()); return { w: bm.width, h: bm.height }; }, `${HTTP}${ruta}`);
  if (SHOTS) writeFileSync(`${SHOTS}/portada-3-imagen.jpg`, bytes);

  ok = errors.length === 0 && out.antes === null && out.invitado.ok && out.invitado.boton === false
    && out.foto.ok && out.botonVisible && /portada del mundo/.test(out.estado)
    && /^[0-9a-f]{64}\.jpg$/.test(out.ficha.portada ?? "") && out.ficha.nombre === "Plaza de prueba" && out.ficha.notas === "no se toca"
    && out.ajustesB === out.ficha.portada && out.despues === `https://plaza.numinia.com/a/${out.ficha.portada}`
    && out.imagen.status === 200 && out.imagen.jpeg && Math.max(out.medida.w, out.medida.h) <= 1600 && out.medida.w > 0;
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
