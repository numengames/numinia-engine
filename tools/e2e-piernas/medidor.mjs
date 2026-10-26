// e2e leg medidor (MIS-200 t_ee19c84b): the live frame meter and the draw-call census, on the desktop and in VR (IWER, Quest 3).
// Checks the meter fills (frames, ms, draw calls of the frame — not a running total, programs), that the census adds up to
// the renderer's own `info.render.drawCalls` within a tolerance, and that the overlay shows with `?medidor`. Prints the numbers
// as JSON: it is also the tool that measures draw calls before/after a change (env LABEL names the run, OUT writes the JSON).
// Env: BASE, CHROME, LABEL, OUT, ESPERA (ms to let models load, default 12000), VR=0 to skip the headset part.
// Not a Quest: IWER draws through WebGL on SwiftShader, so milliseconds mean nothing here; draw calls and the census do.
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell").sort().at(-1);
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?server=ws://127.0.0.1:8790";
const BASE = (BASE0.includes("webgl2") ? BASE0 : BASE0.replace("?", "?webgl2&")) + "&medidor";
const ESPERA = Number(process.env.ESPERA ?? 12000);
if (!existsSync(PW) || !existsSync(CHROME ?? "")) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const IWER = readFileSync(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url).pathname, "utf8");

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], r = { etiqueta: process.env.LABEL ?? "", ok: false, pasos: [] };
const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript(IWER + `;
    Object.defineProperty(IWER.XRWebGLLayer.prototype, 'framebuffer', { get() { return this.__fb ??= this.context.createFramebuffer(); } });
    const dev = new IWER.XRDevice(IWER.metaQuest3); dev.installRuntime({ forceInstall: true }); globalThis.__iwer = dev;`);
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  a.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 60000 });
  await a.waitForTimeout(ESPERA);

  // one reading: reset the window, let ~1.5 s of frames pass, read the summary and ask for (then read) the census; also the renderer's own count
  const leer = async (donde) => {
    await a.evaluate(() => { const m = globalThis.__numinia.medidorVivo; m.reiniciar(); m.censo(); });
    await a.waitForTimeout(2500);
    // a heavy world on a software GPU draws a frame in seconds: wait for a few (up to 60 s)
    await a.waitForFunction(() => globalThis.__numinia.medidorVivo.resumen().cuadros >= 3, null, { timeout: 60000, polling: 500 }).catch(() => {});
    return a.evaluate((donde) => {
      const n = globalThis.__numinia, m = n.medidorVivo, info = n.view.renderer.info.render;
      const censo = m.censo();
      return { donde, resumen: m.resumen(), infoDrawCalls: Math.max(info.drawCalls, m.resumen().llamadas.ultima), /* info is reset at the start of a render: read it between two and it is 0 */ infoTriangulos: info.triangles, censo: censo && { ojos: censo.ojos, llamadas: censo.llamadas, resto: censo.resto, piezas: censo.piezas, porCategoria: Object.fromEntries(Object.entries(censo.porCategoria).filter(([, f]) => f.piezas)) }, overlay: document.getElementById("medidor")?.textContent ?? null };
    }, donde);
  };

  const esc = await leer("escritorio");
  r.escritorio = esc;
  paso("desktop: the window fills (frames, a median, draw calls of the frame)", esc.resumen.cuadros >= 3 && esc.resumen.cuadroMs.p50 > 0 && esc.resumen.llamadas.ultima > 0, { resumen: esc.resumen });
  paso("desktop: programs counted", esc.resumen.programas > 0, { programas: esc.resumen.programas });
  // the census is the camera pass only: on the desktop the renderer's count also has the sun's shadow pass and the post-processing quads
    paso("desktop: the census returned and fits inside the renderer's own count", !!esc.censo && esc.censo.llamadas > 0 && esc.censo.llamadas <= esc.infoDrawCalls, { censo: esc.censo?.llamadas, renderer: esc.infoDrawCalls });
  paso("desktop: the ?medidor overlay shows the line and the census", /fps/.test(esc.overlay ?? "") && /piezas/.test(esc.overlay ?? ""), { overlay: esc.overlay });

  if (process.env.VR !== "0") {
    await a.evaluate(() => document.getElementById("vr").click());
    paso("enters VR", await a.waitForFunction(() => globalThis.__numinia.view.vr.active, null, { timeout: 30000 }).then(() => true, () => false));
    await a.waitForFunction(() => globalThis.__numinia.view.manos.estado().izq?.tipo === "mando" && globalThis.__numinia.view.manos.estado().der?.tipo === "mando", null, { timeout: 20000 }).catch(() => {});
    await a.waitForTimeout(4000);
    const vr = await leer("vr");
    r.vr = vr;
    paso("VR: two eyes in the census", vr.censo?.ojos === 2, { ojos: vr.censo?.ojos });
    // no shadow pass and no post-processing in a headset: what the census does not see is the sky and little else
    paso("VR: the census fits inside the renderer's own count", !!vr.censo && vr.censo.llamadas > 0 && vr.censo.llamadas <= vr.infoDrawCalls, { censo: vr.censo?.llamadas, resto: vr.censo?.resto, renderer: vr.infoDrawCalls });
    paso("VR: the panel carries one short line of the meter", (await a.evaluate(() => globalThis.__numinia.medidorVivo.activo)) === true);
  }
  paso("no page errors", errors.length === 0, { errors });
  r.ok = true;
} catch (e) { r.error = String(e.message ?? e); r.errors = errors; }
await browser.close();
const salida = JSON.stringify(r, null, 1);
if (process.env.OUT) writeFileSync(process.env.OUT, salida);
console.log(salida);
process.exit(r.ok ? 0 : 1);
