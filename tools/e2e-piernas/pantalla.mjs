// e2e leg M18 (trozo 2, local only): «Compartir pantalla». Chromium only: Firefox cannot be told to pick a screen without a
// real dialog (and the feature does not exist at all on Android Chrome, Firefox Android or the Quest Browser).
// Chromium gets --auto-select-desktop-capture-source / --auto-accept-this-tab-capture so getDisplayMedia answers without a
// picker. If, under swiftshader + headless, that still yields no track, the leg relaunches with a stub (getDisplayMedia →
// canvas.captureStream()) and says so (`captura: "stub"`): then the real picker is NOT proved, only the page's path.
// What it checks (ux2-barra: «Compartir pantalla» is the third entry of the bar's «Cámara» menu, P opens it): the entry is
// in the top bar and not hidden (secure context, getDisplayMedia present); P while typing
// does nothing; with no video screen near, P shares into the floating window (a <video> with a live srcObject) and says so;
// P again stops: tracks ended, window hidden, srcObject gone. Then a tiny .webm (datos/pantalla.webm) is dropped on the
// world as a video screen; sharing goes to that screen (estado.pantalla = its key; no floating window), stopping restores
// it; the screen is deleted. Nothing is sent: the second tab's feature log carries no event about a share.
// Gets BASE and SERVER_HTTP (tools/e2e-piernas/README.md); prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox").split(",");
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--auto-select-desktop-capture-source=Entire screen", "--auto-accept-this-tab-capture"];
// the stub, when the fake capture gives nothing: a canvas painted every frame, captured as a MediaStream
const STUB = `(() => { const md = navigator.mediaDevices; if (!md) return; md.getDisplayMedia = function () {
  const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); let n = 0;
  const pinta = () => { g.fillStyle = (n++ & 1) ? "#A6DAD5" : "#017C8D"; g.fillRect(0, 0, 320, 180); if (!c.__parado) requestAnimationFrame(pinta); }; pinta();
  const s = c.captureStream(15); s.__stub = true; return Promise.resolve(s); }; })();`;

async function intento(captura) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  if (captura === "stub") await ctx.addInitScript(STUB);
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
    return p;
  };
  const out = { engine: "chromium", captura, ok: false };
  // ux2-barra: enBarra = inside the bar's «Cámara» menu
  const estado = (p) => p.evaluate(() => {
    const n = globalThis.__numinia, b = document.getElementById("compartir-pantalla"), v = document.querySelector("#pantalla-vista video");
    const s = v?.srcObject ?? null, pistas = s ? s.getVideoTracks().map((t) => t.readyState) : [];
    return { boton: !!b, enBarra: b?.parentElement?.id === "camara-menu" && !!b?.closest("#barra-arriba"), hidden: b?.hidden ?? null, pressed: b?.getAttribute("aria-pressed") ?? null, ...n.compartir.estado,
      ventana: !document.getElementById("pantalla-vista").hidden, srcObject: !!s, pistas, aviso: document.getElementById("avisos")?.textContent ?? "", pantallas: n.view.pantallas().length };
  });
  // ux2-barra: sharing is the third entry of the bar's «Cámara» menu. P opens the menu (focus on its first entry), End
  // goes to «Compartir pantalla», Enter presses it; by mouse: the camera button, then the entry.
  const compartirConP = async (p) => {
    await p.keyboard.press("KeyP");
    await p.waitForFunction(() => !document.getElementById("camara-menu").hidden, null, { timeout: 3000 });
    await p.keyboard.press("End"); await p.keyboard.press("Enter");
  };
  const compartirConRaton = async (p) => { await p.locator("#camara-abrir").click(); await p.locator("#compartir-pantalla").click(); };
  try {
    const a = await open(), b = await open();
    const eventosB0 = await b.evaluate(() => globalThis.__numinia.session.features.stats.events);
    await a.bringToFront();
    const e0 = await estado(a);
    out.ayuda = await a.evaluate(() => document.getElementById("help")?.textContent ?? "");
    // P while typing in a text box does nothing (no menu, no sharing) (a box of the page, then taken away)
    await a.evaluate(() => { const c = document.createElement("input"); c.id = "caja-prueba-p"; document.body.appendChild(c); c.focus(); });
    await a.keyboard.press("KeyP");
    await a.waitForTimeout(300);
    out.escribiendo = { ...(await estado(a)), menu: await a.evaluate(() => !document.getElementById("camara-menu").hidden) };
    out.escribiendo.tecleado = await a.evaluate(() => { const c = document.getElementById("caja-prueba-p"); const v = c.value; c.remove(); return v; });
    // 1) no screen near: P › Compartir pantalla → the floating window
    const yo = await a.evaluate(() => globalThis.__numinia.session.selfPosition(1));
    out.cercaAntes = await a.evaluate((yo) => globalThis.__numinia.view.pantallas().filter((p) => Math.hypot(p.x - yo.x, p.z - yo.z) <= 30).length, yo);
    await compartirConP(a);
    await a.waitForFunction(() => globalThis.__numinia.compartir.estado.compartiendo || globalThis.__numinia.compartir.estado.error, null, { timeout: 10000 }).catch(() => {});
    await a.waitForTimeout(400);
    const e1 = await estado(a);
    await compartirConP(a); // the same entry now reads «Dejar de compartir»
    await a.waitForTimeout(300);
    const e2 = await estado(a);
    Object.assign(out, { e0, e1, e2 });
    out.ventanaOk = e0.boton && e0.enBarra && e0.hidden === false && e0.pressed === "false" && !e0.compartiendo && !out.escribiendo.compartiendo && !out.escribiendo.menu
      && (out.cercaAntes > 0 || (e1.compartiendo && e1.pressed === "true" && e1.pantalla === null && e1.ventana && e1.srcObject && e1.pistas.includes("live") && /No hay ninguna pantalla cerca/.test(e1.aviso)))
      && (out.cercaAntes === 0 || (e1.compartiendo && e1.pantalla !== null && !e1.ventana))
      && !e2.compartiendo && e2.pressed === "false" && !e2.ventana && !e2.srcObject && /dejado de compartir/.test(e2.aviso);
    if (!e1.compartiendo) { out.error = e1.error || "no se llegó a compartir"; await browser.close(); return out; }
    // 2) a video screen of the world, dropped on a point of the ground in front of A
    await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, { timeout: 10000 });
    // tools/e2e-piernas/datos/pantalla.webm: one second of one colour, 96×54, VP8 (ffmpeg lavfi, 667 bytes). Recording one in
    // the page with MediaRecorder gives headers without frames under headless: a fixture is honest and the same every run.
    const webm = readFileSync(new URL("./datos/pantalla.webm", import.meta.url));
    out.webm = { bytes: webm.length };
    const nombre = `pantalla-e2e-${Date.now().toString(36)}`;
    const drop = await a.evaluate(({ b64, fichero, x, y }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bytes], fichero, { type: "video/webm" }));
      const target = document.elementFromPoint(x, y) ?? document.body, ev = (type) => new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true });
      target.dispatchEvent(ev("dragenter")); target.dispatchEvent(ev("dragover"));
      const suelo = globalThis.__numinia.view.sueloBajo(x, y);
      target.dispatchEvent(ev("drop"));
      return { suelo };
    }, { b64: webm.toString("base64"), fichero: `${nombre}.webm`, x: 240, y: 220 });
    await a.waitForFunction(() => /Colocado|No se pudo/.test(document.getElementById("subida-estado")?.textContent ?? ""), null, { timeout: 20000 });
    out.subida = await a.evaluate(() => document.getElementById("subida-estado")?.textContent ?? "");
    const key = await a.evaluate((n) => [...globalThis.__numinia.session.features.stateOf("objetos")].find(([, v]) => v.nombre === n)?.[0] ?? null, nombre);
    out.key = key;
    if (key) {
      await a.waitForFunction((k) => globalThis.__numinia.view.pantallas().some((p) => p.key === k), key, { timeout: 20000 }).catch(() => {});
      out.pantallaCargada = await a.evaluate((k) => globalThis.__numinia.view.pantallas().find((p) => p.key === k) ?? null, key);
      out.distancia = out.pantallaCargada && drop.suelo ? Math.round(Math.hypot(out.pantallaCargada.x - yo.x, out.pantallaCargada.z - yo.z) * 10) / 10 : null;
      await compartirConRaton(a);
      await a.waitForFunction(() => globalThis.__numinia.compartir.estado.compartiendo || globalThis.__numinia.compartir.estado.error, null, { timeout: 10000 }).catch(() => {});
      await a.waitForTimeout(400);
      const e3 = await estado(a);
      await compartirConRaton(a);
      await a.waitForTimeout(300);
      const e4 = await estado(a);
      // a live screen that goes away mid-share must not break anything: share again, then delete the thing
      await compartirConP(a);
      await a.waitForFunction(() => globalThis.__numinia.compartir.estado.compartiendo, null, { timeout: 10000 }).catch(() => {});
      await a.evaluate((k) => globalThis.__numinia.session.features.send("objetos", "borrar", { id: k }), key);
      await a.waitForFunction((k) => !globalThis.__numinia.session.features.stateOf("objetos").has(k), key, { timeout: 5000 }).catch(() => {});
      await a.waitForTimeout(300);
      const e5 = await estado(a);
      await compartirConP(a);
      await a.waitForTimeout(300);
      const e6 = await estado(a);
      Object.assign(out, { e3, e4, e5, e6 });
      out.pantallaOk = !!out.pantallaCargada && out.distancia !== null && out.distancia <= 30
        && e3.compartiendo && e3.pantalla === key && !e3.ventana && !e3.srcObject && new RegExp(`Compartiendo tu pantalla en «${nombre}»`).test(e3.aviso)
        && !e4.compartiendo && e4.pantalla === null && e5.compartiendo && e5.pantallas === out.e2.pantallas && !e6.compartiendo;
    }
    out.quedan = await a.evaluate((n) => [...globalThis.__numinia.session.features.stateOf("objetos").values()].filter((v) => v.nombre === n).length, nombre);
    // nothing of the share reached the other tab: no event of B's feature log speaks of a screen share (the share has no wire
    // message at all; B only sees the screen placed and removed, and its own session's noise)
    out.eventosB = await b.evaluate((n0) => { const f = globalThis.__numinia.session.features; return f.log.slice(-(f.stats.events - n0)).map((e) => `${e.feature}.${e.event}`); }, eventosB0);
    out.sinRed = out.eventosB.every((e) => !/pantalla|compartir|vivo|stream/i.test(e));
    out.errors = errors;
    out.ok = out.ventanaOk && out.pantallaOk === true && out.quedan === 0 && out.sinRed && errors.length === 0;
  } catch (e) { out.error = String(e).split("\n")[0]; out.errors = errors; }
  await browser.close();
  return out;
}

const results = [];
if (!ENGINES.includes("chromium")) console.log("pantalla: solo chromium (firefox no elige una pantalla sin diálogo real); nada que probar");
else {
  let r = await intento("real");
  if (!r.ok && !r.e1?.compartiendo) { r.motivoStub = `la captura falsa de chromium no dio pista (${r.error ?? "?"}); se prueba el camino de la página con un stub`; results.push(r); r = await intento("stub"); }
  results.push(r);
}
console.log(JSON.stringify(results, null, 1));
const ok = results.length === 0 || results[results.length - 1].ok;
console.log(ok ? "E2E PANTALLA OK" : "E2E PANTALLA FALLA");
process.exit(ok ? 0 : 1);