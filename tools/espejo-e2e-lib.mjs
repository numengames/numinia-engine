// espejo-e2e-lib: the pieces the browser-driven checks of the Hermes world share (tools/e2e-espejo.mjs, tools/capturas-espejo.mjs).
//   · crearMundo(): a throwaway world folder born from plantillas/hermes, with the switches the check asks for, and the REAL server on it
//     (MOTOR_PLANTILLA=hermes, the built page in dist/plaza, the local link on its own port, fixed test keys)
//   · fuenteLocal(): a fake outside source (plain `ws` client) that signs the link's challenge, publishes a lote and answers requests
//   · abrirNavegador(): one headless Chromium (software GL) and pages on the world
// Needs `npm run build` first (the page is served from dist/plaza). Nothing here touches a real Hermes, a real profile or the network beyond 127.0.0.1.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { firmarReto } from "../packages/server/src/enlace-espejo.ts";

export const RAIZ = join(fileURLToPath(import.meta.url), "../..");
export const CLAVE_ENLACE = "clave-del-enlace-e2e-0123456789";
export const CODIGO_ADMIN = "codigo-de-administracion-e2e-largo";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
export { dormir };

const puertaLibre = () => new Promise((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
/** The environment of the child without anything of the host's own world settings. */
const limpio = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE|WWW_DIR|APPS_DIR)/.test(k)));

function arrancar(env, esperar = "[instancia]") {
  const hijo = spawn(process.execPath, ["packages/server/src/main.ts"], { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
  const log = []; const guardar = (d) => log.push(String(d));
  hijo.stdout.on("data", guardar); hijo.stderr.on("data", guardar);
  return new Promise((ok, mal) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      if (log.join("").includes(esperar)) { clearInterval(t); ok({ hijo, log }); }
      else if (hijo.exitCode !== null || Date.now() - t0 > 30000) { clearInterval(t); hijo.kill("SIGTERM"); mal(new Error(`the server did not start:\n${log.join("")}`)); }
    }, 100);
  });
}
const parar = async (hijo) => { if (hijo.exitCode === null) { hijo.kill("SIGTERM"); await new Promise((r) => { hijo.once("exit", r); setTimeout(r, 3000); }); } };

/** A throwaway Hermes world. `funciones` = switches to turn ON besides `salud` (written into the world's own espejo.json before the real start);
 *  `entorno(x)` may edit the world's entorno.json (e.g. drop `tema`) before the real start.
 *  Returns { url, puertoEnlace, carpeta, log, parar(), leerEspejo() }. */
export async function crearMundo({ funciones = {}, plantillaEspejo, entorno } = {}) {
  if (!existsSync(join(RAIZ, "dist/plaza/index.html"))) throw new Error("dist/plaza is missing: run `npm run build` first");
  const carpeta = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-espejo-")), mundo = join(carpeta, "mundo");
  const puerto = await puertaLibre(), puertoEnlace = await puertaLibre();
  const env = { ...limpio(), PORT: String(puerto), HOST: "127.0.0.1", MOTOR_MUNDO: mundo, MOTOR_PLANTILLA: "hermes", MOTOR_HABITANTES: "no", MOTOR_ENLACE_PUERTO: String(puertoEnlace), MOTOR_ENLACE_CLAVE: CLAVE_ENLACE, MOTOR_ADMIN: CODIGO_ADMIN, MOTOR_SECRET: "secreto-de-prueba-e2e-largo-0123456789", WWW_DIR: join(RAIZ, "dist/plaza") };
  // 1) the first start makes the world from the template; 2) the check's switches are written into ITS espejo.json; 3) the real start
  const a = await arrancar(env); await parar(a.hijo);
  const fichero = join(mundo, "entorno/espejo.json");
  const e = JSON.parse(readFileSync(fichero, "utf8"));
  if (plantillaEspejo) Object.assign(e, plantillaEspejo(e));
  e.funciones = { ...e.funciones, ...funciones };
  writeFileSync(fichero, JSON.stringify(e, null, 2));
  if (entorno) { const f2 = join(mundo, "entorno/entorno.json"), x = JSON.parse(readFileSync(f2, "utf8")); entorno(x); writeFileSync(f2, JSON.stringify(x, null, 2)); }
  const b = await arrancar(env, "[enlace] escuchando");
  const url = `http://127.0.0.1:${puerto}/`;
  return {
    url, puertoEnlace, carpeta, mundo, log: () => b.log.join(""),
    leerEspejo: () => JSON.parse(readFileSync(fichero, "utf8")),
    async parar() { await parar(b.hijo); rmSync(carpeta, { recursive: true, force: true }); },
  };
}

/** A fake outside source. Signs the challenge, then `lote`s what it is given; `alPedir(fn)` answers each request with fn(peticion) → { ok, texto }. */
export async function fuenteLocal(puerto, { cosas = [], alPedir } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${puerto}/`);
  const recibidos = [], peticiones = [];
  const mandar = (m) => ws.send(JSON.stringify({ v: 1, ...m }));
  await new Promise((ok, mal) => { ws.once("open", ok); ws.once("error", mal); });
  ws.on("message", (d) => {
    const m = JSON.parse(String(d)); recibidos.push(m);
    if (m.t === "reto") mandar({ t: "hola", plugin: "e2e", hermes_version: "0.0-e2e", firma: firmarReto(CLAVE_ENLACE, m.nonce) });
    else if (m.t === "hola") mandar({ t: "lote", objetos: cosas.filter((c) => m.funciones.includes(TIPO_FUNCION[c.tipo] ?? c.tipo)) });
    else if (m.t === "peticion") { peticiones.push(m); const r = alPedir ? alPedir(m) : { ok: true, texto: "Hecho." }; if (r) mandar({ t: "resultado", peticion: m.id, ok: r.ok, texto: r.texto }); }
  });
  for (let i = 0; i < 100 && !recibidos.some((m) => m.t === "hola"); i++) await dormir(50);
  if (!recibidos.some((m) => m.t === "hola")) throw new Error("the link did not answer hola");
  return {
    recibidos, peticiones,
    lote: (objetos) => mandar({ t: "lote", objetos }),
    cerrar: () => ws.close(),
  };
}
const TIPO_FUNCION = { sesion: "sesiones", perfil: "perfiles", mensaje: "chat" };

/** One headless Chromium (software GL; the caller holds the browser lock). */
export async function abrirNavegador() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright"; // cron/Hermes shells point HOME at the profile home
  const { chromium } = createRequire(import.meta.url)(process.env.PW_CORE ?? join(RAIZ, "node_modules/playwright-core"));
  const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"] });
  return {
    browser,
    /** A page on the world with its own visitor. `admin` = the visitor takes the owner role (they may flip switches and ask for verbs). */
    async pagina(mundo, { ancho = 1280, alto = 720, admin = true, query = "?webgl2" } = {}) {
      const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
      const p = await ctx.newPage(); const errores = [];
      p.on("pageerror", (e) => errores.push(String(e)));
      await p.goto(mundo.url + query);
      await p.waitForFunction(() => globalThis.__numinia?.session?.entity >= 0 && globalThis.__numinia.probe?.done, null, { timeout: 40000 });
      if (admin) {
        await p.evaluate((c) => globalThis.__numinia.session.features.send("chat", "decir", { texto: `/dueño ${c}` }), CODIGO_ADMIN);
        await p.waitForFunction(() => globalThis.__numinia.espejo.interruptor.estado.puede === true, null, { timeout: 15000 });
      }
      return Object.assign(p, { errores });
    },
    cerrar: () => browser.close(),
  };
}
