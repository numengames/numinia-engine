// e2e leg U1 (loading screen + reconnection). Chromium throttles the network (CDP) and watches the phases; chromium + firefox
// check the connection cut and the way back through a small TCP proxy this leg owns (cut = really refuse, restore = listen again).
//  1. slow network: the screen shows (it only appears after 400 ms), the phases come in order (codigo · grafica · red · mundo ·
//     preparar · listo, never backwards, the bar never goes back), Escape while loading opens nothing, the page behind is inert
//     (aria-busy, modal dialog), the screen stays ≥ 600 ms once seen, and at the end the focus is on the world.
//  2. connection cut: «Se ha cortado la conexión», the wait grows (attempt ≥ 2), «Cancelar» stops it, «Reintentar» starts again,
//     with the server back «Reintentar ya» reloads the page and it is the same guest (same name).
//  3. a server that accepts and never answers: after 8 s without progress «Sigue trabajando» with Reintentar / Cancelar.
// No page errors that are not the cut itself. Receives BASE (and SERVER_HTTP, unused). Prints JSON; exit 0 = right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import net from "node:net";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
};
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox").split(",");
const ORDEN = ["codigo", "grafica", "red", "mundo", "preparar", "listo"];
const serverWs = new URL(BASE0).searchParams.get("server") ?? "ws://127.0.0.1:8790";
const SERVIDOR = { host: new URL(serverWs).hostname, port: Number(new URL(serverWs).port) };

// a TCP proxy to the real server that can be cut (refuse + drop what is open), restored, or made mute (accepts, never forwards)
function proxy(puerto) {
  const abiertas = new Set(); let srv = null, mudo = false;
  const crear = () => net.createServer((c) => {
    abiertas.add(c); c.on("close", () => abiertas.delete(c)); c.on("error", () => {});
    if (mudo) return;
    const s = net.connect(SERVIDOR.port, SERVIDOR.host); abiertas.add(s); s.on("close", () => abiertas.delete(s)); s.on("error", () => c.destroy());
    c.pipe(s); s.pipe(c);
  });
  return {
    puerto,
    escuchar: () => new Promise((ok, ko) => { srv = crear(); srv.once("error", ko); srv.listen(puerto, "127.0.0.1", ok); }),
    cortar: () => new Promise((ok) => { for (const c of abiertas) c.destroy(); abiertas.clear(); srv.close(() => ok()); }),
    mudo: (v) => { mudo = v; },
  };
}
const pagina = (puerto) => { const u = new URL(BASE0); u.searchParams.set("server", `ws://127.0.0.1:${puerto}`); u.searchParams.set("pulso", "2000"); return u.toString(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listo = (p, ms = 60000) => p.waitForFunction(() => globalThis.__numinia?.carga?.estado === "listo" && globalThis.__numinia.probe?.done && globalThis.__numinia.session.entity >= 0, null, { timeout: ms });
const sembrar = (p) => p.addInitScript(() => {
  window.__fases = []; window.__vistas = [];
  let abierta = false;
  setInterval(() => {
    const d = document.getElementById("carga"); // when it opens and closes, to the 15 ms
    if (d && d.open !== abierta) { abierta = d.open; window.__vistas.push({ abierta, t: Math.round(performance.now()) }); }
    const c = window.__numinia?.carga; if (!c) return;
    const l = window.__fases.at(-1);
    if (!l || l.f !== c.fase || l.e !== c.estado) window.__fases.push({ f: c.fase, e: c.estado, pct: c.pct, t: Math.round(performance.now()) });
  }, 15);
});
const textoCarga = (p) => p.evaluate(() => ({ t: document.getElementById("carga-t").textContent, f: document.getElementById("carga-f").textContent, aviso: document.getElementById("carga-aviso").textContent, botones: [...document.querySelectorAll("#carga-botones button")].map((b) => b.textContent), abierta: document.getElementById("carga").open, estado: globalThis.__numinia.carga.estado }));
const clic = (p, texto) => p.locator("#carga-botones button", { hasText: texto }).click();

async function pierna(engine) {
  const r = { engine, errors: [] };
  const browser = await launchers[engine]();
  const px = proxy(Number(process.env.E2E_PROXY_PORT ?? 8890) + (engine === "firefox" ? 1 : 0));
  await px.escuchar();
  try {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => r.errors.push(String(e)));
    await sembrar(p);

    // ---- 1. slow network (chromium: CDP; firefox has no throttle, it only checks the same order on a normal load) ----
    if (engine === "chromium") {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 1500 * 1024, uploadThroughput: 1500 * 1024 });
    }
    await p.goto(pagina(px.puerto), { waitUntil: "commit" });
    await p.waitForFunction(() => document.getElementById("carga")?.open, null, { timeout: 30000 }); // it shows
    r.inerte = await p.evaluate(() => ({ busy: document.body.getAttribute("aria-busy"), barra: document.getElementById("carga-b").getAttribute("aria-label"), modal: document.getElementById("carga").matches(":modal") }));
    await p.keyboard.press("Escape");
    r.escapeCargando = await p.evaluate(() => ({ cargaAbierta: document.getElementById("carga").open, menu: !!document.getElementById("menu")?.open }));
    await listo(p);
    await sleep(150); // the 15 ms sampler catches the last state
    const fases = await p.evaluate(() => window.__fases);
    r.fases = fases.map((f) => `${f.f}:${f.e}:${f.pct}`);
    const vistos = fases.map((f) => ORDEN.indexOf(f.f)), pct = fases.map((f) => f.pct);
    r.enOrden = vistos.every((v, i) => i === 0 || v >= vistos[i - 1]) && vistos.includes(ORDEN.indexOf("mundo")) && fases.at(-1).f === "listo";
    r.barraSinVolver = pct.every((v, i) => i === 0 || v >= pct[i - 1]) && pct.at(-1) === 100;
    await sleep(900);
    const vis = await p.evaluate(() => window.__vistas);
    const abre = vis.find((v) => v.abierta), cierra = vis.find((v) => !v.abierta && abre && v.t > abre.t);
    r.quedoMs = abre && cierra ? cierra.t - abre.t : null;
    r.alTerminar = await p.evaluate(() => ({ abierta: document.getElementById("carga").open, busy: document.body.getAttribute("aria-busy"), foco: document.activeElement?.tagName, mostrada: globalThis.__numinia.carga.mostrada }));
    const nombre = await p.evaluate(() => globalThis.__numinia.session.who?.nombre);

    // ---- 2. connection cut and the way back ----
    await p.evaluate(() => { window.__fases = []; });
    await px.cortar();
    await p.waitForFunction(() => globalThis.__numinia.carga.estado === "reconectando", null, { timeout: 15000 });
    r.corte = await textoCarga(p);
    await p.waitForFunction(() => globalThis.__numinia.conexion.estado().intento >= 2, null, { timeout: 15000 });
    r.intento2 = await p.evaluate(() => globalThis.__numinia.conexion.estado());
    await clic(p, "Cancelar");
    r.cancelado = await textoCarga(p);
    const n0 = await p.evaluate(() => globalThis.__numinia.conexion.estado().intento);
    await sleep(2500);
    r.sinMasIntentos = (await p.evaluate(() => globalThis.__numinia.conexion.estado().intento)) === n0;
    await clic(p, "Reintentar");
    r.reintenta = await p.evaluate(() => ({ estado: globalThis.__numinia.carga.estado, intento: globalThis.__numinia.conexion.estado().intento }));
    await px.escuchar(); // the server is back
    await clic(p, "Reintentar ya");
    await p.waitForFunction(() => performance.now() < 20000 && globalThis.__numinia?.carga?.estado !== "reconectando" && !!globalThis.__numinia.carga, null, { timeout: 20000 }).catch(() => {});
    await listo(p, 30000);
    r.mismaPersona = (await p.evaluate(() => globalThis.__numinia.session.who?.nombre)) === nombre && !!nombre;

    // ---- 3. a server that accepts and never answers (chromium only: it waits 8 s) ----
    if (engine === "chromium") {
      px.mudo(true);
      await p.goto(pagina(px.puerto), { waitUntil: "commit" });
      await p.waitForFunction(() => globalThis.__numinia?.carga?.estado === "atascado", null, { timeout: 30000 });
      r.atasco = await textoCarga(p);
      await clic(p, "Cancelar");
      r.atascoCancelado = await textoCarga(p);
      px.mudo(false);
      await clic(p, "Reintentar"); // reloads the page: now the proxy answers
      await listo(p, 40000);
      r.atascoSale = true;
    }
  } catch (e) { r.fallo = String(e.message ?? e).split("\n")[0]; }
  finally { await browser.close(); try { await px.cortar(); } catch { /* already closed */ } }
  const sinCorte = r.errors.filter((e) => !/WebSocket|Failed to fetch|NetworkError|Load failed/i.test(e));
  r.ok = !r.fallo && r.quedoMs !== null && r.inerte?.busy === "true" && !!r.inerte?.barra && r.inerte?.modal === true
    && r.escapeCargando?.cargaAbierta === true && r.escapeCargando?.menu === false
    && r.enOrden && r.barraSinVolver && r.quedoMs >= 580
    && r.alTerminar?.abierta === false && r.alTerminar?.busy === null && r.alTerminar?.foco === "CANVAS" && r.alTerminar?.mostrada === true
    && /Se ha cortado la conexión/.test(r.corte?.t ?? "") && r.corte?.botones.join("+") === "Reintentar ya+Cancelar"
    && r.intento2?.intento >= 2 && r.cancelado?.estado === "sin-conexion" && r.cancelado?.botones.join("+") === "Reintentar"
    && r.sinMasIntentos && r.reintenta?.estado === "reconectando" && r.mismaPersona
    && (engine !== "chromium" || (r.atasco?.estado === "atascado" && /Sigue trabajando/.test(r.atasco.aviso) && r.atasco.botones.join("+") === "Reintentar+Cancelar" && r.atascoCancelado?.estado === "cancelado" && r.atascoSale))
    && sinCorte.length === 0;
  return r;
}

const todo = [];
for (const e of ENGINES) todo.push(await pierna(e));
console.log(JSON.stringify(todo, null, 1));
process.exit(todo.every((x) => x.ok) ? 0 : 1);
