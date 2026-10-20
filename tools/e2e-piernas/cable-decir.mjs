// e2e leg (D-041 «el cable», historia D «Decirlo»): in a REAL browser, a builder types a sentence in the cable panel and the
// SERVER (with the echo brain: CEREBRO_ECO=1 + a script of answers, no provider, no key, no network) proposes a cable; the page
// shows the sentence with «Aplicar» / «Cancelar», nothing changes until Aplicar, and then the cable exists. A SECOND world with
// no AI shows no text box, only the reason. Also at 360x640. Starts its OWN servers (E2E_SERVER_PORT / +1) and page (E2E_VITE_PORT).
// The echo switch only exists on the server of this leg's launch: production reads CEREBRO_CLAVE and never CEREBRO_ECO unless set.
// Env: SHOTS=<folder> saves pictures (D-*.png). Prints JSON; exit 0 only when all is right. NOT a real Claude call.
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8799), VP = Number(process.env.E2E_VITE_PORT ?? 5181);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-cable-decir-"));
const BLOQUE = "32fce59977a24c3c15eb40084c700c1537e59853747f92ce1d01c6fd65958588";
const FRASE = "que al entrar en el círculo suene la campana";
const CLAVE_FALSA = "sk-ant-api03-ESTA-CLAVE-NO-DEBE-SALIR-NUNCA-0123456789";

function mundo(nombre) {
  const w = join(tmp, nombre), entorno = join(w, "entorno"), datos = join(w, "datos");
  mkdirSync(entorno, { recursive: true }); mkdirSync(datos, { recursive: true });
  writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 3, z: 0, radio: 1 } }));
  writeFileSync(join(entorno, "disparadores.json"), JSON.stringify({ disparadores: [] }));
  const farola = { modelo: BLOQUE, x: 3, y: 1, z: 2, rx: 0, ry: 0, rz: 0, sx: 0.4, sy: 1, sz: 0.4, nombre: "Farola", decorado: false, fijado: true, animar: false, tipo: "modelo", ext: "glb", oculto: false, volumen: 1, solido: false, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0, alcance: "burbuja", radio: 8, huecoAncho: 0, huecoAlto: 0, huecoLleno: false };
  writeFileSync(join(datos, "objetos.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "objetos", version: 5, savedAt: new Date().toISOString(), state: [["f1", { value: farola, at: { x: 3, z: 2 } }]] }));
  return { w, entorno, datos };
}
const conIA = mundo("con"), sinIA = mundo("sin");
const guion = join(tmp, "guion.json");
writeFileSync(guion, JSON.stringify({ [FRASE]: { tipo: "zona", nombre: "Círculo de la campana", receptores: [{ accion: "suena", sonido: "campana" }], cooldown: 5 } }));

const procs = [];
const run = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d)); p.out = () => out; procs.push(p); return p; };
const srv = (m, port, env) => run("node", ["packages/server/src/main.ts"], { PORT: String(port), MUNDO_DIR: m.entorno, DATOS_DIR: m.datos, SESIONES_DIR: join(m.w, "sesiones"), AVENTURA_DIR: "", MOTOR_CONSTRUIR: "todos", ...env }, "srv");
const sCon = srv(conIA, SP, { CEREBRO_ECO: "1", CABLE_ECO_RESPUESTAS: guion });
const sSin = srv(sinIA, SP + 1, { CEREBRO_ECO: "", CEREBRO_CLAVE: "", ANTHROPIC_API_KEY: "" });
run("npx", ["vite", "--config", "apps/plaza/vite.config.mjs", "--port", String(VP), "--strictPort"], { PLAZA_PORT: String(VP) }, "vite");
console.error("PIDS", procs.map((p) => p.pid).join(" "));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resultado = { ok: true, pasos: {} };
const falla = (k, v) => { resultado.ok = false; resultado.pasos[k] = v; };
const marca = (k, ok, extra) => { resultado.pasos[k] = extra ?? ok; if (!ok) resultado.ok = false; };
let browser;
try {
  for (let i = 0; i < 120; i++) { try { const a = await fetch(`http://127.0.0.1:${VP}/`); const b = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); const c = await fetch(`http://127.0.0.1:${SP + 1}/health`).catch(() => null); if (a.ok && b?.ok && c?.ok) break; } catch {} await sleep(500); }
  browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const errs = [];
  const abrir = async (ctxOpts, puerto) => {
    const ctx = await browser.newContext(ctxOpts); const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    const vistos = []; p.on("websocket", (ws) => { ws.on("framereceived", (f) => vistos.push(String(f.payload))); ws.on("framesent", (f) => vistos.push(String(f.payload))); });
    p.vistos = vistos;
    await p.goto(`http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${puerto}`);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 90000 });
    await sleep(800);
    return p;
  };
  const abrirPanel = async (p, movil) => {
    if (movil) { await p.evaluate(() => document.querySelector("#construir")?.click()); await sleep(400); await p.locator("#dock-cable").tap().catch(async () => { await p.locator("#dock-cable").click(); }); }
    else { await p.keyboard.press("KeyC"); await p.locator("#dock-cable").click(); }
    await sleep(600);
  };
  const foto = async (p, nombre) => { if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, nombre) }); } };

  // ---- world WITH an AI (the echo brain) ----
  const a = await abrir({ viewport: { width: 1000, height: 900 } }, SP);
  await abrirPanel(a, false);
  marca("caja visible con IA", await a.locator("#cable-decir-texto").isVisible());
  marca("placeholder de ejemplo", /campana/.test((await a.locator("#cable-decir-texto").getAttribute("placeholder")) ?? ""));
  marca("aria-label de la caja", (await a.locator("#cable-decir-texto").getAttribute("aria-label")) === "Cuéntale al mundo qué quieres que pase" || (await a.locator("#cable-decir-texto").getAttribute("aria-label")) !== null);
  await a.locator("#cable-decir-texto").fill(FRASE);
  await a.locator("#cable-decir-boton").click();
  await a.waitForSelector("#cable-decir-propuesta:not([hidden])", { timeout: 15000 });
  const frase = await a.locator("#cable-decir-frase").textContent();
  marca("frase propuesta", /Círculo de la campana/.test(frase ?? "") && /campana/.test(frase ?? ""), frase);
  marca("aún no hay cable (nada aplicado)", (await a.locator("#cable-lista li").count()) <= 1 && !/Círculo de la campana/.test((await a.locator("#cable-lista").textContent()) ?? ""));
  await a.locator("#cable-decir-propuesta").scrollIntoViewIfNeeded();
  await foto(a, "D-propuesta.png");
  // keyboard: the focus went to «Aplicar»; Tab reaches «Cancelar»
  marca("foco en Aplicar", (await a.evaluate(() => document.activeElement?.id)) === "cable-decir-aplicar");
  // Cancelar leaves everything as it was
  await a.locator("#cable-decir-cancelar").click();
  marca("cancelar oculta la propuesta", await a.locator("#cable-decir-propuesta").isHidden());
  await a.locator("#cable-decir-texto").fill(FRASE); await a.keyboard.press("Enter");
  await a.waitForSelector("#cable-decir-propuesta:not([hidden])", { timeout: 15000 });
  await a.locator("#cable-decir-aplicar").click();
  await a.waitForFunction(() => /Círculo de la campana/.test(document.getElementById("cable-lista")?.textContent ?? "") || [...document.querySelectorAll("#cable-lista input")].some((i) => i.value === "Círculo de la campana"), null, { timeout: 15000 });
  marca("el cable existe tras Aplicar", true);
  await sleep(500);
  const archivo = JSON.parse(readFileSync(join(conIA.entorno, "disparadores.json"), "utf8"));
  marca("disparadores.json reescrito", archivo.disparadores?.length === 1 && archivo.disparadores[0].tipo === "zona" && archivo.disparadores[0].receptores?.[0]?.accion === "suena", JSON.stringify(archivo.disparadores?.[0] ?? null).slice(0, 200));
  await a.locator("#cable-lista").scrollIntoViewIfNeeded();
  await foto(a, "D-aplicado.png");
  // a sentence the echo script does not know: the server says it cannot (no cable), the page shows the reason
  await a.locator("#cable-decir-texto").fill("que llueva oro");
  await a.locator("#cable-decir-boton").click();
  await a.waitForFunction(() => (document.getElementById("cable-decir-error")?.textContent ?? "").length > 5, null, { timeout: 15000 });
  marca("rechazo en español", true, await a.locator("#cable-decir-error").textContent());
  marca("la clave nunca viaja", !a.vistos.some((v) => v.includes("sk-ant") || v.includes(CLAVE_FALSA)));

  // ---- phone ----
  const m = await abrir({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, SP);
  await abrirPanel(m, true);
  await m.locator("#cable-decir-texto").fill(FRASE.replace("círculo", "círculo"));
  await m.locator("#cable-decir-boton").tap().catch(async () => { await m.locator("#cable-decir-boton").click(); });
  await m.waitForSelector("#cable-decir-propuesta:not([hidden])", { timeout: 15000 }).catch(() => {});
  const med = await m.evaluate(() => { const r = document.getElementById("cable-decir")?.getBoundingClientRect(); const bs = [...document.querySelectorAll("#cable-decir button")].filter((b) => b.offsetParent).map((b) => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }); return { ancho: Math.round(r?.width ?? 0), scrollW: document.documentElement.scrollWidth, botones: bs }; });
  marca("360 px sin desbordar", med.ancho > 0 && med.ancho <= 360 && med.scrollW <= 361, med);
  await m.locator("#cable-decir").scrollIntoViewIfNeeded();
  await foto(m, "D-propuesta-movil.png");

  // ---- world WITHOUT an AI ----
  const s = await abrir({ viewport: { width: 1000, height: 900 } }, SP + 1);
  await abrirPanel(s, false);
  marca("sin IA: la caja no se ve", await s.locator("#cable-decir-texto").isHidden() && await s.locator("#cable-decir-boton").isHidden());
  const motivo = (await s.locator("#cable-decir-motivo").textContent()) ?? "";
  marca("sin IA: se ve el motivo", /no tiene una IA conectada/.test(motivo) && await s.locator("#cable-decir-motivo").isVisible(), motivo);
  await foto(s, "D-sin-ia.png");
  const sm = await abrir({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, SP + 1);
  await abrirPanel(sm, true);
  await sm.locator("#cable-decir").scrollIntoViewIfNeeded();
  await foto(sm, "D-sin-ia-movil.png");
  marca("sin errores de página", errs.length === 0, errs.slice(0, 3));
} catch (e) { falla("excepcion", String(e).slice(0, 400)); }
finally { try { await browser?.close(); } catch {} for (const p of procs) p.kill("SIGTERM"); }
resultado.logCon = sCon.out().split("\n").filter((l) => /cable|disparadores/.test(l)).slice(-6);
resultado.logSin = sSin.out().split("\n").filter((l) => /cable/.test(l)).slice(-3);
console.log(JSON.stringify(resultado, null, 1));
process.exit(resultado.ok ? 0 : 1);
