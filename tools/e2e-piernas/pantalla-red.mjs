// e2e leg M18 (trozo 3): «Compartir pantalla» reaches the other tab. Chromium only (WebCodecs + a stubbed getDisplayMedia that gives a
// canvas.captureStream(); the real picker is proved by the `pantalla` leg, not here). Two tabs of one world: A drops a small .webm on the
// ground as a video screen and shares onto it; B (near) must be told, decode the frames A's page encoded with WebCodecs (VP8) and put them
// on the same screen (B's `pantallaRed.estado.viendo` = 1 and `tramasVistas` grows); a third tab C far away would hear nothing (the server
// rules are proved headless in test/pantalla-red.test.ts). Stopping the share tells B (a sentence, viendo back to 0); the screen is deleted.
// Gets BASE and SERVER_HTTP (tools/e2e-piernas/README.md); prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
// The GPU (owner rule 2026-11-11): ANGLE over Vulkan, never SwiftShader. Wrap the run: scripts/navegador.sh node tools/e2e-piernas/pantalla-red.mjs
const ARGS = ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist"];
const STUB = `(() => { const md = navigator.mediaDevices; if (!md) return; md.getDisplayMedia = function () {
  const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); let n = 0;
  const pinta = () => { g.fillStyle = (n++ & 1) ? "#A6DAD5" : "#017C8D"; g.fillRect(0, 0, 320, 180); if (!c.__parado) requestAnimationFrame(pinta); }; pinta();
  const s = c.captureStream(15); s.__stub = true; return Promise.resolve(s); }; })();`;


const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
await ctx.addInitScript(STUB);
const errors = [];
const open = async () => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  return p;
};
const out = { engine: "chromium", ok: false };
try {
  const a = await open(), b = await open();
  out.webcodecs = await a.evaluate(() => !!(globalThis.VideoEncoder && globalThis.VideoDecoder));
  out.gpu = await a.evaluate(() => { const gl = document.createElement("canvas").getContext("webgl2"); const e = gl?.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; });
  // what this browser says about hardware codecs (informative: the page asks for no preference and takes what the browser gives)
  out.codecs = await a.evaluate(async () => {
    const r = {};
    for (const [n, codec, extra] of [["vp8", "vp8", {}], ["h264", "avc1.42E01F", { avc: { format: "annexb" } }]]) for (const hw of ["prefer-hardware", "prefer-software"]) {
      try { const c = { codec, width: 1280, height: 720, bitrate: 1_200_000, framerate: 15, latencyMode: "realtime", hardwareAcceleration: hw, ...extra }; r[`enc-${n}-${hw}`] = (await VideoEncoder.isConfigSupported(c)).supported; } catch (e) { r[`enc-${n}-${hw}`] = String(e).slice(0, 40); }
      try { r[`dec-${n}-${hw}`] = (await VideoDecoder.isConfigSupported({ codec, codedWidth: 1280, codedHeight: 720, hardwareAcceleration: hw })).supported; } catch (e) { r[`dec-${n}-${hw}`] = String(e).slice(0, 40); }
    }
    return r;
  });
  await a.bringToFront();
  await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, { timeout: 10000 });
  const webm = readFileSync(new URL("./datos/pantalla.webm", import.meta.url));
  const nombre = `pantalla-red-e2e-${Date.now().toString(36)}`;
  await a.evaluate(({ b64, fichero, x, y }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], fichero, { type: "video/webm" }));
    const target = document.elementFromPoint(x, y) ?? document.body, ev = (type) => new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true });
    target.dispatchEvent(ev("dragenter")); target.dispatchEvent(ev("dragover")); globalThis.__numinia.view.sueloBajo(x, y); target.dispatchEvent(ev("drop"));
  }, { b64: webm.toString("base64"), fichero: `${nombre}.webm`, x: 240, y: 220 });
  await a.waitForFunction(() => /Colocado|No se pudo/.test(document.getElementById("subida-estado")?.textContent ?? ""), null, { timeout: 20000 });
  const key = await a.evaluate((n) => [...globalThis.__numinia.session.features.stateOf("objetos")].find(([, v]) => v.nombre === n)?.[0] ?? null, nombre);
  out.key = key;
  if (!key) throw new Error("no se colocó la pantalla");
  for (const p of [a, b]) await p.waitForFunction((k) => globalThis.__numinia.view.pantallas().some((q) => q.key === k), key, { timeout: 20000 });
  // A shares onto it (the button inside the «Cámara» menu)
  await a.locator("#camara-abrir").click(); await a.locator("#compartir-pantalla").click();
  await a.waitForFunction((k) => globalThis.__numinia.compartir.estado.pantalla === k && globalThis.__numinia.pantallaRed.estado.enviando === k, key, { timeout: 15000 });
  await b.waitForFunction(() => globalThis.__numinia.pantallaRed.estado.viendo === 1 && globalThis.__numinia.pantallaRed.estado.tramasVistas > 5, null, { timeout: 20000 });
  out.a = await a.evaluate(() => globalThis.__numinia.pantallaRed.estado);
  out.b = await b.evaluate(() => globalThis.__numinia.pantallaRed.estado);
  out.avisoB = await b.evaluate(() => document.getElementById("avisos")?.textContent ?? "");
  // A stops: B is told and lets go
  await a.locator("#camara-abrir").click(); await a.locator("#compartir-pantalla").click();
  await b.waitForFunction(() => globalThis.__numinia.pantallaRed.estado.viendo === 0, null, { timeout: 10000 });
  out.avisoB2 = await b.evaluate(() => document.getElementById("avisos")?.textContent ?? "");
  await a.evaluate((k) => globalThis.__numinia.session.features.send("objetos", "borrar", { id: k }), key);
  await a.waitForTimeout(300);
  out.errors = errors;
  out.ok = out.webcodecs && /RTX 4080|NVIDIA/i.test(out.gpu ?? "") && out.a.tramasEnviadas > 5 && out.b.tramasVistas > 5 && /alguien está compartiendo/.test(out.avisoB) && /Han dejado de compartir/.test(out.avisoB2) && errors.length === 0;
} catch (e) { out.error = String(e).split("\n")[0]; out.errors = errors; }
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log(out.ok ? "E2E PANTALLA-RED OK" : "E2E PANTALLA-RED FALLA");
process.exit(out.ok ? 0 : 1);
