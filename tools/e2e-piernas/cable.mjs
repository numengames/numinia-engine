// e2e leg (D-041 «el cable», historia 6): end to end, in a REAL browser — not the headless in-memory world of
// test/disparadores.test.ts (stories 1-2). Starts its OWN server and page (ports E2E_SERVER_PORT / E2E_VITE_PORT,
// default 8798 / 5180) on a throwaway world: entorno.json, disparadores.json with ONE button («rojo», cooldown 2 s,
// one receiver `muestra` on an object named «Farola» that starts hidden) and datos/objetos.json with that object.
// Builder A (MOTOR_CONSTRUIR=todos, so the «historia 5» read panel shows): sees the cable panel list the button as
// «listo», walks up, presses E («E: pulsar», the same prompt as pesca/huecos), the server flips Farola's `oculto` to
// false for everyone (checked on B too, a second tab that never built anything) and the panel now shows «en espera».
// A second E inside the 2 s cooldown is refused («Todavía no…»); after it passes, «Probar» in the panel (not walking
// up: the point of the list) fires it again and the usage count goes up. Env: SHOTS=<folder> saves pictures. Prints
// JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8798), VP = Number(process.env.E2E_VITE_PORT ?? 5180);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

// ---- the throwaway world: one button wired to show a hidden «Farola» (features/disparadores, D-041) ----
const BLOQUE = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588"; // features/objetos/biblioteca.json «Bloque» (CC0)
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-cable-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos");
mkdirSync(entorno); mkdirSync(datos);
// spawn right next to the button (alcance 2 m default): no locomotion needed to press it, only `pulsar` itself
// (radio is a half-side in metres, min 1: entorno/esquema.ts APARICION_RADIO_MIN — a corner is at most √2 m away)
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 3, z: 0, radio: 1 } }, null, 2));
writeFileSync(join(entorno, "disparadores.json"), JSON.stringify({
  disparadores: [{ id: "rojo", nombre: "Botón rojo", tipo: "boton", x: 3, z: 0, frase: "E: pulsar", cooldown: 2, receptores: [{ accion: "muestra", objeto: "Farola" }] }],
}, null, 2));
const farola = { modelo: BLOQUE, x: 3, y: 1, z: 2, rx: 0, ry: 0, rz: 0, sx: 0.4, sy: 1, sz: 0.4, nombre: "Farola", decorado: false, fijado: true, animar: false,
  tipo: "modelo", ext: "glb", oculto: true, volumen: 1, solido: false, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false };
writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 5, savedAt: new Date().toISOString(), state: [["f1", { value: farola, at: { x: 3, z: 2 } }]], store: [["siguiente", 2]] }));

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: "", MOTOR_CONSTRUIR: "todos" }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
    return p;
  };
  const a = await open(), b = await open();
  const farolaOculta = (p) => p.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").get("f1")?.oculto);
  const panel = (p) => p.evaluate(() => globalThis.__numinia.cable !== undefined && !!document.getElementById("cable-panel") && document.getElementById("cable-panel").style.display !== "none");
  const fila = (p) => p.evaluate(() => document.getElementById("cable-lista")?.textContent ?? "");
  const foto = async (n) => { if (SHOTS) await a.screenshot({ path: `${SHOTS}/cable-${n}.png` }); };

  await sleep(500); // the build panel (and the cable list in it) mounts once the «permiso» event arrives
  nota("0 ambos arrancan", { oculta0: await farolaOculta(a) });
  if (!(await farolaOculta(a))) throw new Error("Farola debería empezar oculta");

  // 1) builder A sees the cable panel (historia 5): the button listed, listo
  const vistaA = await panel(a);
  const textoInicial = await fila(a);
  nota("1 panel del constructor", { vistaA, textoInicial });
  if (!vistaA) throw new Error("el panel del constructor no se ve para quien construye");
  if (!/Botón rojo.*boton.*listo/.test(textoInicial)) throw new Error(`fila inesperada: ${textoInicial}`);

  // 2) presses it (the point of the cable: the prompt and the send live in interactuar.ts for a visitor; here the
  // controller's own `pulsar`, exactly what that prompt calls) — Farola appears for A AND for B (never touched the panel)
  await a.bringToFront();
  const r1 = await a.evaluate(() => globalThis.__numinia.disparadores.pulsar("rojo"));
  await a.waitForFunction(() => globalThis.__numinia.session.features.stateOf("objetos").get("f1")?.oculto === false, null, { timeout: 5000 });
  await b.waitForFunction(() => globalThis.__numinia.session.features.stateOf("objetos").get("f1")?.oculto === false, null, { timeout: 5000 });
  const textoListo = await fila(a);
  nota("2 pulsado: Farola aparece en A y B", { r1, textoListo, ocultaB: await farolaOculta(b) });
  if (!r1.ok) throw new Error(`pulsar rechazado: ${JSON.stringify(r1)}`);
  if (await farolaOculta(b)) throw new Error("B no vio aparecer la Farola");
  if (!/en espera/.test(textoListo)) throw new Error(`el panel no muestra «en espera»: ${textoListo}`);
  await foto(1);

  // 3) a second press inside the 2 s cooldown is refused
  const antes3 = await a.evaluate(() => globalThis.__numinia.session.features.log.length);
  await a.evaluate(() => globalThis.__numinia.disparadores.pulsar("rojo"));
  await a.waitForFunction((n) => globalThis.__numinia.session.features.log.length > n, antes3, { timeout: 4000 });
  const ultimo = await a.evaluate(() => { const l = globalThis.__numinia.session.features.log; const u = l[l.length - 1]; return { feature: u.feature, event: u.event, msg: u.msg }; });
  nota("3 cooldown rechaza", { ultimo });
  if (ultimo.event !== "rechazado" || !/Todavía no/.test(ultimo.msg?.motivo ?? "")) throw new Error(`un segundo disparo dentro del cooldown debería rechazarse: ${JSON.stringify(ultimo)}`);

  // 4) after the cooldown, «Probar» in the panel fires it again (the point of the list: no need to walk up)
  await sleep(2200);
  await a.evaluate(() => { const li = [...document.querySelectorAll("#cable-lista li")].find((l) => /Botón rojo/.test(l.textContent ?? "")); li?.querySelector("button")?.click(); });
  await sleep(300);
  const textoTrasProbar = await fila(a);
  nota("4 «Probar» desde el panel", { textoTrasProbar });
  if (!/2 uso\(s\)/.test(textoTrasProbar)) throw new Error(`«Probar» no disparó una segunda vez: ${textoTrasProbar}`);
  await foto(2);

  // 5) historia A (cable sin JSON): «+ Nuevo cable» creates a cable live (B sees it without touching anything), and
  // «Borrar» asks first, then removes it for both. Builder mode on + the Cable drawer open, as a person would.
  await a.keyboard.press("KeyC");
  await a.locator("#dock-cable").click();
  const ids = (p) => p.evaluate(() => globalThis.__numinia.disparadores.lista().map((d) => d.id).sort().join());
  await a.locator("#cable-nuevo").click();
  await a.waitForFunction(() => globalThis.__numinia.disparadores.lista().some((d) => d.id === "cable-1"), null, { timeout: 5000 });
  await b.waitForFunction(() => globalThis.__numinia.disparadores.lista().some((d) => d.id === "cable-1"), null, { timeout: 5000 });
  await sleep(300);
  const creado = await fila(a);
  nota("5 «+ Nuevo cable» crea un cable para A y B", { creado, idsB: await ids(b) });
  if (!/Cable 1 \(boton\)/.test(creado)) throw new Error(`el cable nuevo no sale en el panel: ${creado}`);
  await a.screenshot({ path: SHOTS ? `${SHOTS}/A-panel-cable.png` : undefined }).catch(() => {});
  // «Borrar» first asks («¿Borrar «Cable 1»?»); «Cancelar» keeps it; «Sí, borrar» removes it for everyone
  const fila1 = a.locator("#cable-lista li", { hasText: "Cable 1" });
  await fila1.locator(".cable-borrar").click();
  const pregunta = await fila(a);
  if (!/¿Borrar «Cable 1»\?/.test(pregunta)) throw new Error(`«Borrar» no pidió confirmación: ${pregunta}`);
  await fila1.locator(".cable-borrar-no").click();
  if (!(await ids(a)).includes("cable-1")) throw new Error("«Cancelar» no debería borrar");
  await fila1.locator(".cable-borrar").click();
  await fila1.locator(".cable-borrar-si").click();
  await a.waitForFunction(() => !globalThis.__numinia.disparadores.lista().some((d) => d.id === "cable-1"), null, { timeout: 5000 });
  await b.waitForFunction(() => !globalThis.__numinia.disparadores.lista().some((d) => d.id === "cable-1"), null, { timeout: 5000 });
  nota("6 «Borrar» pide confirmación y lo quita para A y B", { idsA: await ids(a), idsB: await ids(b) });
  if ((await ids(a)) !== "rojo") throw new Error(`debería quedar solo «rojo»: ${await ids(a)}`);

  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").filter((l) => l.includes("disparadores") || l.includes("objetos")).slice(-16);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
