// e2e leg M18b (el Graboso): one real tab. K takes the relic out: the head appears over the shoulder (view.graboso.visible),
// the «Grabar» entry of the bar's «Cámara» menu reads «Guardar» (aria-pressed) and the recorder runs on canvas.captureStream + the fake microphone
// (--use-fake-ui-for-media-stream / --use-fake-device-for-media-stream). K again keeps it: a clip exists, its blob has
// bytes, its name is UTC, Descargar points at it and the <video> opens with «Ver». A short clip is marked short; the cap
// select clamps; typing K in the chat box does nothing. Prints JSON; exit 0 only when right (tools/e2e-piernas/README.md).
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 480, height: 300 }, permissions: ["microphone"] });
const out = { errors };
const checks = {};
const estado = (p) => p.evaluate(() => { const g = globalThis.__numinia.graboso; const e = g.graboso.estado; return { fase: e.fase, topeS: e.topeS, sonido: e.sonido, error: e.error, clip: e.clip ? { bytes: e.clip.blob.size, tipo: e.clip.tipo, duracionS: e.clip.duracionS, nombre: e.clip.nombre, conSonido: e.clip.conSonido, corto: e.clip.corto } : null, soporta: g.soporta, tipo: g.tipo, boton: { texto: g.boton.textContent, pressed: g.boton.getAttribute("aria-pressed") }, hud: g.hud.textContent, cabeza: globalThis.__numinia.view.graboso.visible() }; });
try {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
  out.inicio = await estado(p);
  checks.soporta = out.inicio.soporta && /^video\/webm/.test(out.inicio.tipo);
  checks.guardadoAlEmpezar = out.inicio.fase === "guardado" && out.inicio.clip === null && out.inicio.boton.pressed === "false" && !out.inicio.cabeza;
  checks.ayuda = await p.evaluate(() => /K: grabar/.test(document.getElementById("help")?.textContent ?? ""));

  // K: out and recording
  await p.bringToFront();
  await p.keyboard.press("KeyK");
  await p.waitForFunction(() => globalThis.__numinia.graboso.graboso.estado.fase === "grabando", null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(2600); // the head's code arrives lazily and at least two 1 s chunks are recorded
  out.grabando = await estado(p);
  checks.grabando = out.grabando.fase === "grabando" && out.grabando.boton.texto === "Guardar" && out.grabando.boton.pressed === "true";
  checks.cabezaFuera = out.grabando.cabeza === true;
  // MIS-247: the fine head (the CC0 GLB, fetched by its sha) replaces the simple one
  await p.waitForFunction(() => globalThis.__numinia.view.graboso.cabeza() === "fina", null, { timeout: 8000 }).catch(() => {});
  out.cabezaFina = await p.evaluate(() => globalThis.__numinia.view.graboso.cabeza());
  checks.cabezaFina = out.cabezaFina === "fina";
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/graboso-fina.png` });
  checks.contador = /0:0\d \/ 1:00/.test(out.grabando.hud);
  checks.conMicrofono = out.grabando.sonido === true;

  // K: kept, with a clip
  await p.keyboard.press("KeyK");
  await p.waitForFunction(() => { const e = globalThis.__numinia.graboso.graboso.estado; return e.fase === "guardado" && (e.clip !== null || e.error); }, null, { timeout: 8000 }).catch(() => {});
  out.guardado = await estado(p);
  checks.clip = !!out.guardado.clip && out.guardado.clip.bytes > 1000 && out.guardado.clip.duracionS >= 2 && out.guardado.clip.duracionS < 10;
  checks.clipCorto = out.guardado.clip?.corto === true && /la misión pide 30 s/.test(await p.evaluate(() => document.getElementById("avisos")?.textContent ?? ""));
  checks.nombreUTC = /^graboso-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.webm$/.test(out.guardado.clip?.nombre ?? "");
  out.descarga = await p.evaluate(() => { const a = document.querySelector("#graboso-hud a"); return a ? { href: a.href, download: a.download, hidden: a.hidden } : null; });
  checks.descargar = !!out.descarga && /^blob:/.test(out.descarga.href) && out.descarga.download === out.guardado.clip?.nombre && !out.descarga.hidden;
  checks.botonVuelve = out.guardado.boton.texto === "Grabar" && out.guardado.boton.pressed === "false";
  // the blob really is a WebM (EBML header 1A 45 DF A3)
  out.cabeceraWebm = await p.evaluate(async () => { const b = globalThis.__numinia.graboso.graboso.estado.clip?.blob; if (!b) return null; const u = new Uint8Array(await b.slice(0, 4).arrayBuffer()); return Array.from(u, (x) => x.toString(16).padStart(2, "0")).join(""); });
  checks.esWebm = out.cabeceraWebm === "1a45dfa3";

  // «Ver» opens the video with the blob; «Quitar» drops the clip
  await p.waitForFunction(() => !globalThis.__numinia.view.graboso.visible(), null, { timeout: 4000 }).catch(() => {}); // the head shrinks back (0.4 s)
  checks.cabezaGuardada = !(await p.evaluate(() => globalThis.__numinia.view.graboso.visible()));
  await p.evaluate(() => { for (const b of document.querySelectorAll("#graboso-hud button")) if (b.textContent === "Ver") b.click(); });
  await p.waitForTimeout(300);
  out.video = await p.evaluate(() => { const v = document.getElementById("graboso-video"); return { hidden: v.hidden, src: v.src.slice(0, 5) }; });
  checks.ver = out.video.hidden === false && out.video.src === "blob:";
  await p.evaluate(() => { for (const b of document.querySelectorAll("#graboso-hud button")) if (b.textContent === "Quitar") b.click(); });
  await p.waitForTimeout(200);
  out.trasQuitar = await estado(p);
  checks.quitar = out.trasQuitar.clip === null && !(await p.evaluate(() => document.getElementById("graboso-hud").classList.contains("visible")));

  // the cap select clamps to 30–60 and the page's K never acts while typing in the chat
  checks.tope = await p.evaluate(() => { const g = globalThis.__numinia.graboso.graboso; return g.tope(45) === 45 && g.tope(999) === 60 && g.tope(1) === 30 && g.tope(60) === 60; });
  await p.keyboard.press("Enter"); // J3: opens the chat box
  await p.waitForTimeout(200);
  await p.keyboard.type("k");
  await p.waitForTimeout(400);
  out.escribiendo = await estado(p);
  checks.kEnElChat = out.escribiendo.fase === "guardado";
  await p.keyboard.press("Escape");
} catch (e) { errors.push(String(e?.stack ?? e)); }
out.checks = checks;
out.ok = Object.values(checks).every(Boolean) && errors.length === 0;
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(out.ok ? 0 : 1);
