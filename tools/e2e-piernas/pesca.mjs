// e2e leg (pesca v1): fishing in a real browser. Tab A waits for the spot's card («lugar: Estanque de la plaza»), walks
// to the water, the prompt says «E: pescar», E casts: the HUD appears, the lazy 3D chunk draws one angler; the server
// bites inside 3-12 s (phase «picada»); A holds F to hook and then plays the one-button fight from the page (reel under
// 65 % tension, rest over 35 %) until it ends; a fish of the table lands in the basket (estado().ultimo, cesta.peces ≥ 1)
// and «Has pescado» is announced; the HUD hides again. Tab B (another guest) never gets A's phases. No page errors.
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE, SERVER_HTTP (unused). Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SHOTS = process.env.SHOTS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now();
const out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });

const abrir = async () => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") (out.consola ??= []).push(m.text().slice(0, 200)); });
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 30000 });
  return p;
};
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
async function caminar(p, x, z, cerca = 1.0, maxMs = 30000) {
  await p.bringToFront();
  const t = Date.now();
  let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (d <= cerca) break;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    const ms = Math.max(100, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / 4) * 1000));
    for (const k of held) await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    for (const k of held) await p.keyboard.up(k);
    await p.waitForTimeout(120);
  }
  return Math.round(d * 10) / 10;
}
const ctl = (p, code, arg) => p.evaluate(code, arg);
const esperar = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms });
const estado = (p) => ctl(p, () => { const e = globalThis.__numinia.pesca.estado(); return { fase: e.fase, tension: e.tension, progreso: e.progreso, pez: e.pez, aviso: e.aviso, ultimo: e.ultimo, cesta: e.cesta }; });
const foto = async (p, n, sinHud = false) => { if (!SHOTS) return; if (sinHud) await p.evaluate(() => { document.getElementById("pesca-hud").style.visibility = "hidden"; }); await p.screenshot({ path: `${SHOTS}/pesca-${n}.png` }); if (sinHud) await p.evaluate(() => { document.getElementById("pesca-hud").style.visibility = ""; }); };
const prompt = (p) => ctl(p, () => { const b = document.getElementById("interactuar"); return b && !b.hidden ? b.textContent : ""; });

let ok = false;
try {
  const a = await abrir();
  nota("A dentro", { en: await yo(a) });
  // 1. the spot's card arrives (J9: within 120 m), with its place and its prompt
  await esperar(a, () => globalThis.__numinia.session.features.cards().some((c) => c.feature === "pesca"), null, 10000);
  const sitio = await ctl(a, () => { const c = globalThis.__numinia.session.features.cards().find((c) => c.feature === "pesca"); return { key: c.key, role: c.role, name: c.name, at: c.at }; });
  out.sitio = sitio;
  out.sitioDibujado = await ctl(a, () => globalThis.__numinia.view.pesca.contar());
  // another guest, opened BEFORE casting (opening a tab is slow and the hook window is 1.2 s): no phase of A's reaches it
  const b = await abrir();
  await a.bringToFront();
  // 2. walk to the water; the prompt offers to fish; E casts
  out.distancia = await caminar(a, sitio.at.x, sitio.at.z + 3.0, 0.8); // on the shore: inside the 4 m reach even after overshooting
  await esperar(a, () => /pescar/.test(document.getElementById("interactuar")?.textContent ?? "") && !document.getElementById("interactuar").hidden, null, 6000)
    .catch(async (e) => { out.sinPrompt = await ctl(a, () => { const p = globalThis.__numinia.session.selfPosition(1), b = document.getElementById("interactuar"); return { en: [p.x, p.z], boton: [b.hidden, b.textContent], alcance: globalThis.__numinia.session.features.reachable(p.x, p.z, p.y), sitios: globalThis.__numinia.pesca.sitios(), fase: globalThis.__numinia.pesca.estado().fase }; }); throw e; });
  out.prompt = await prompt(a);
  await a.keyboard.press("KeyE");
  await esperar(a, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000);
  nota("caña lanzada");
  await esperar(a, () => !document.getElementById("pesca-hud").hidden, null, 4000);
  out.hud = await ctl(a, () => ({ visible: !document.getElementById("pesca-hud").hidden, texto: document.querySelector("#pesca-hud .que")?.textContent, boton: document.getElementById("pesca-recoger")?.textContent }));
  await esperar(a, () => globalThis.__numinia.view.pesca.contar().pescadores === 1, null, 6000);
  out.dibujo = await ctl(a, () => globalThis.__numinia.view.pesca.contar());
  out.flotadores = await ctl(a, () => globalThis.__numinia.pesca.flotadores().length);
  await foto(a, "espera", true);
  // 3. the bite comes inside the declared wait (3-12 s)
  const tLanzado = Date.now();
  await esperar(a, () => ["picada", "pelea", "nada"].includes(globalThis.__numinia.pesca.estado().fase), null, 14000);
  out.esperaS = Math.round((Date.now() - tLanzado) / 100) / 10;
  const enPicada = await estado(a);
  out.picada = enPicada;
  nota("picada", { fase: enPicada.fase });
  // 4. hook with F, then the one-button fight from the page, watching the bars as a person would
  await a.keyboard.down("KeyF");
  await esperar(a, () => globalThis.__numinia.pesca.estado().fase === "pelea", null, 3000);
  out.pelea = await estado(a);
  out.hudPelea = await ctl(a, () => ({ barras: !document.querySelector("#pesca-hud .barras").hidden, pulsado: document.getElementById("pesca-recoger").getAttribute("aria-pressed") }));
  await a.keyboard.up("KeyF");
  await a.waitForTimeout(400); await foto(a, "pelea");
  const fin = await ctl(a, () => new Promise((res) => {
    const P = globalThis.__numinia.pesca, t = Date.now();
    let recogiendo = false, max = 0;
    const id = setInterval(() => {
      const e = P.estado();
      max = Math.max(max, e.tension);
      if (e.fase === "nada" || Date.now() - t > 60000) { clearInterval(id); res({ s: Math.round((Date.now() - t) / 100) / 10, maxTension: max, fase: e.fase }); return; }
      if (e.fase !== "pelea") return;
      if (e.tension > 65 && recogiendo) { recogiendo = false; P.recoger(false); } else if (e.tension < 35 && !recogiendo) { recogiendo = true; P.recoger(true); }
    }, 60);
  }));
  out.fin = fin;
  out.despues = await estado(a);
  out.hudDespues = await ctl(a, () => document.getElementById("pesca-hud").hidden);
  out.anuncio = await ctl(a, () => globalThis.__numinia.session.features.announcements.filter((x) => x.feature === "pesca").map((x) => `${x.event}: ${x.text}`));
  out.etiqueta = await ctl(a, () => document.getElementById("avisos")?.textContent ?? "");
  nota("fin", { resultado: out.despues.ultimo ? "captura" : out.despues.aviso });
  out.b = await ctl(b, () => ({ eventos: globalThis.__numinia.session.features.log.filter((e) => e.feature === "pesca").map((e) => e.event), fase: globalThis.__numinia.pesca.estado().fase }));
  const peces = ["Carpa", "Trucha", "Lucio"];
  ok = sitio.role === "lugar" && sitio.name === "Estanque de la plaza" && /^E: pescar$/.test(out.prompt) && out.hud.visible && /Esperando/.test(out.hud.texto) && out.hud.boton === "Recoger"
    && out.dibujo.cargado && out.dibujo.pescadores === 1 && out.dibujo.sitios === 1 && out.flotadores === 1
    && out.esperaS >= 2.5 && out.esperaS <= 13 && enPicada.fase === "picada" && out.pelea.fase === "pelea" && peces.includes(out.pelea.pez) && out.hudPelea.barras && out.hudPelea.pulsado === "true"
    && !!out.despues.ultimo && peces.includes(out.despues.ultimo.pez) && out.despues.cesta.peces >= 1 && /^Has pescado: /.test(out.despues.aviso) && out.hudDespues === true
    && out.anuncio.some((t) => t.startsWith("captura: Has pescado: ")) && out.b.fase === "nada" && !out.b.eventos.some((e) => ["picada", "pelea", "tension", "captura"].includes(e)) && errors.length === 0;
} catch (e) { out.error = String(e).split("\n")[0]; }
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "PESCA OK" : "PESCA FALLA");
process.exit(ok ? 0 : 1);
