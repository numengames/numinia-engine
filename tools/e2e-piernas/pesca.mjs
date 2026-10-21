// e2e leg (pesca v2): fishing in a real browser. Tab A waits for the spot's card («lugar: Estanque de la plaza»), walks
// onto the boardwalk the lazy 3D chunk built (view.pesca.sitio().pantalan), the prompt says «E: pescar», E casts: the HUD
// appears, the chunk draws one angler; the server bites inside 3-12 s (phase «picada»); A holds F to hook and then plays
// the one-button fight from the page (rest past 70 % tension, reel again under 45 %) until it ends; a fish of the table lands
// in the basket (estado().ultimo, cesta.peces ≥ 1), «Has pescado» is announced, the HUD shows «¡Pescado!» with the fish,
// its size and «En tu cesta: 1», and the fish is drawn in A's hand (contar().enMano) — in tab B too (another guest 10 m
// away: it gets `fin` with the fish, never A's phases). Then the HUD hides. No page errors.
// v3 (pesca → inventario): the same fish is in A's Inventario (estado «captura», icono fish, n ≥ 1, `guardado` from the server), the HUD
// says «A tu Inventario», A's own fish reaches the hand and then goes to the camera (hidden), the Bolsa button pulses and a «+1» rises
// from it, and the Inventario panel lists the fish with its icon, count and rarity (B, who only watched, owns nothing). SHOTS also
// gets pesca-inventario-hud / -vuelo / -bolsa / -panel .png.
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
async function caminar(p, x, z, cerca = 1.0, maxMs = 60000) {
  await p.bringToFront();
  const t = Date.now();
  let d = Infinity, antes = null, lado = 0;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (d <= cerca) break;
    // stuck against something: step aside, alternating sides, and try again
    if (antes && Math.hypot(me.x - antes.x, me.z - antes.z) < 0.15) {
      const k = Math.abs(dx) > Math.abs(dz) ? (lado++ % 2 ? "KeyW" : "KeyS") : (lado++ % 2 ? "KeyA" : "KeyD");
      await p.keyboard.down(k); await p.waitForTimeout(1500); await p.keyboard.up(k);
    }
    antes = me;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    const ms = Math.max(100, Math.min(2500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / 1.5) * 1000)); // walking is 1.5 m/s (#24)
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
const fotoSiempre = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/pesca-${n}.png` }); };
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
  // another guest, opened BEFORE casting (opening a tab is slow and the hook window is 1.2 s), walked to 10 m from the
  // pond so it sees the float and the fish (CERCA_M = 40): no phase of A's reaches it
  const b = await abrir();
  out.bDistancia = await caminar(b, sitio.at.x - 8, sitio.at.z + 6, 1.5, 20000);
  await a.bringToFront();
  // 2. walk onto the boardwalk the 3D chunk built; the prompt offers to fish; E casts
  await esperar(a, () => globalThis.__numinia.view.pesca.contar().cargado && !!globalThis.__numinia.view.pesca.sitio("estanque"), null, 15000);
  const traza = await ctl(a, () => globalThis.__numinia.view.pesca.sitio("estanque"));
  out.pantalan = traza.pantalan;
  out.distancia = await caminar(a, traza.pantalan.x, traza.pantalan.z, 0.6); // on the planks: inside the 4 m reach
  await esperar(a, () => /pescar/.test(document.getElementById("interactuar")?.textContent ?? "") && !document.getElementById("interactuar").hidden, null, 6000)
    .catch(async (e) => { out.sinPrompt = await ctl(a, () => { const p = globalThis.__numinia.session.selfPosition(1), b = document.getElementById("interactuar"); return { en: [p.x, p.z], boton: [b.hidden, b.textContent], alcance: globalThis.__numinia.session.features.reachable(p.x, p.z, p.y), sitios: globalThis.__numinia.pesca.sitios(), fase: globalThis.__numinia.pesca.estado().fase }; }); throw e; });
  out.prompt = await prompt(a);
  const tLanzado = Date.now();
  await a.keyboard.press("KeyE");
  await esperar(a, () => globalThis.__numinia.pesca.estado().fase === "espera", null, 4000);
  nota("caña lanzada");
  await esperar(a, () => !document.getElementById("pesca-hud").hidden, null, 4000);
  out.hud = await ctl(a, () => ({ visible: !document.getElementById("pesca-hud").hidden, texto: document.querySelector("#pesca-hud .que")?.textContent, boton: document.getElementById("pesca-recoger")?.textContent }));
  await esperar(a, () => globalThis.__numinia.view.pesca.contar().pescadores === 1, null, 6000);
  out.dibujo = await ctl(a, () => globalThis.__numinia.view.pesca.contar());
  out.flotadores = await ctl(a, () => globalThis.__numinia.pesca.flotadores().length);
  await a.waitForTimeout(1200); await foto(a, "agua", true); // the float has landed: the first ripple spreads
  // 3. the bite comes inside the declared wait (3-12 s), counted from the cast
  await esperar(a, () => ["picada", "pelea", "nada"].includes(globalThis.__numinia.pesca.estado().fase), null, 14000);
  out.esperaS = Math.round((Date.now() - tLanzado) / 100) / 10;
  const enPicada = await estado(a);
  out.picada = enPicada;
  nota("picada", { fase: enPicada.fase });
  // v3: a page-side watcher (50 ms) of what happens to MY fish after the catch: in the hand, the pulse on the Bolsa button, the «+1», gone
  await ctl(a, () => {
    const w = globalThis.__vigia = { enMano: false, pulso: false, chip: false, oculto: false, tEnMano: 0, tOculto: 0 }, yo = globalThis.__numinia.session.entity;
    setInterval(() => {
      const c = globalThis.__numinia.view.pesca.contar(), ahora = performance.now();
      if (c.enMano.includes(yo) && !w.enMano) { w.enMano = true; w.tEnMano = ahora; }
      if (w.enMano && !w.oculto && !c.enMano.includes(yo) && c.peces === 0) { w.oculto = true; w.tOculto = ahora; }
      if (document.getElementById("inventario-abrir")?.classList.contains("recibe") || document.getElementById("mas")?.classList.contains("recibe")) w.pulso = true;
      if (document.querySelector(".bolsa-mas")) w.chip = true;
    }, 50);
  });
  // 4. hook with F, then the one-button fight from the page, watching the bars as a person would
  await a.keyboard.down("KeyF");
  await esperar(a, () => globalThis.__numinia.pesca.estado().fase === "pelea", null, 3000);
  out.pelea = await estado(a);
  out.hudPelea = await ctl(a, () => ({ barras: !document.querySelector("#pesca-hud .barras").hidden, pulsado: document.getElementById("pesca-recoger").getAttribute("aria-pressed") }));
  out.boya = await ctl(a, () => { const c = globalThis.__numinia.view.pesca.contar(); return { visible: c.boya, escala: c.boyaEscala }; }); // the gauge on my float, at the waterline
  await a.keyboard.up("KeyF");
  // the fight runs in the page (60 ms polling); the photo is taken meanwhile so the fish does not slip while the shot is made
  const peleando = ctl(a, () => new Promise((res) => {
    const P = globalThis.__numinia.pesca, t = Date.now();
    let recogiendo = false, max = 0;
    const id = setInterval(() => {
      const e = P.estado();
      max = Math.max(max, e.tension);
      if (e.fase === "nada" || Date.now() - t > 60000) { clearInterval(id); res({ s: Math.round((Date.now() - t) / 100) / 10, maxTension: max, fase: e.fase }); return; }
      if (e.fase !== "pelea") return;
      // what a person does watching the bar: rest past 70 % (past 55 % if a surge is coming), reel again under 45 %
      const alta = e.tension > 70 || (e.arrancada !== "no" && e.tension > 55);
      if (alta && recogiendo) { recogiendo = false; P.recoger(false); } else if (!alta && e.tension < 45 && !recogiendo) { recogiendo = true; P.recoger(true); }
    }, 60);
  }));
  await a.waitForTimeout(700); await foto(a, "pelea");
  const fin = await peleando;
  out.fin = fin;
  out.despues = await estado(a);
  // 5. the result is unmistakable: the panel «¡Pescado!» with the fish, its size and the basket; the fish flies to the hand
  out.panel = await ctl(a, () => { const r = document.querySelector("#pesca-hud .resultado"); return { visible: !document.getElementById("pesca-hud").hidden && !r.hidden, clase: r.className, titulo: r.querySelector(".titulo").textContent, pez: r.querySelector(".pez").textContent, nota: r.querySelector(".nota").textContent }; });
  await a.waitForTimeout(450); await fotoSiempre(a, "inventario-hud"); // the result panel, as the player sees it (after its 250 ms entrance)
  await esperar(a, () => globalThis.__vigia.enMano, null, 6000).catch(() => {});
  out.enMano = await ctl(a, () => ({ ...globalThis.__numinia.view.pesca.contar(), enMano: globalThis.__vigia.enMano ? [globalThis.__numinia.session.entity] : [] })); // A's fish did reach the hand (it leaves it for the Inventario after ~1 s)
  // v3: it hangs a moment, flies to the camera and is gone; the Bolsa pulses and a «+1» rises from it
  // B (a neighbour) sees the same fish hanging for its 7 s, whatever happens to A's
  await esperar(b, (quien) => globalThis.__numinia.view.pesca.contar().enMano.includes(quien), await ctl(a, () => globalThis.__numinia.session.entity), 6000).catch(() => {});
  out.enManoB = await ctl(b, () => ({ ...globalThis.__numinia.view.pesca.contar(), capturas: globalThis.__numinia.pesca.capturas().map((c) => [c.quien, c.pez, c.cm]) }));
  // the HUD covers the angler: hide it for two shots, the fish hanging in the hand and (1.05 s later) as it leaves for the camera
  await esperar(a, () => globalThis.__vigia.enMano && performance.now() - globalThis.__vigia.tEnMano >= 250, null, 6000).catch(() => {});
  if (SHOTS) await a.evaluate(() => { document.getElementById("pesca-hud").style.visibility = "hidden"; });
  await fotoSiempre(a, "inventario-mano");
  await esperar(a, () => performance.now() - globalThis.__vigia.tEnMano >= 1020, null, 6000).catch(() => {});
  await fotoSiempre(a, "inventario-vuelo"); // the fish leaves the hand 1.1 s after it arrived and flies 0.45 s
  if (SHOTS) await a.evaluate(() => { document.getElementById("pesca-hud").style.visibility = ""; });
  await esperar(a, () => { const c = document.querySelector(".bolsa-mas"); if (!c || +getComputedStyle(c).opacity < 0.9) return false; c.style.animationPlayState = "paused"; document.getElementById("inventario-abrir")?.getAnimations().forEach((x) => x.pause()); return true; }, null, 8000).catch(() => {}); // the «+1» fully shown (its animation starts at opacity 0), frozen: a shot takes longer than the chip lives
  await fotoSiempre(a, "inventario-bolsa");
  await esperar(a, () => globalThis.__vigia.oculto && globalThis.__vigia.pulso && globalThis.__vigia.chip, null, 8000).catch(() => {});
  out.guardado = await ctl(a, () => ({ ...globalThis.__vigia, hudGuardados: document.getElementById("pesca-hud").dataset.guardados ?? "0", msEnLaManoYVuelo: Math.round(globalThis.__vigia.tOculto - globalThis.__vigia.tEnMano) }));
  await foto(a, "pescado");
  // the fish in the hand, from the front and closer (drag = orbit, wheel = zoom), without the HUD over it
  await a.mouse.move(320, 150); await a.mouse.down(); await a.mouse.move(60, 150, { steps: 12 }); await a.mouse.up();
  await a.mouse.wheel(0, -1200); await a.waitForTimeout(400);
  await foto(a, "pez-en-mano", true);
  // the hand empties on its own (EN_MANO_MS) in both pages, without any other event
  await esperar(b, () => globalThis.__numinia.view.pesca.contar().peces === 0 && globalThis.__numinia.pesca.capturas().length === 0, null, 12000).catch(() => {});
  out.manoVaciaB = await ctl(b, () => globalThis.__numinia.view.pesca.contar().peces === 0);
  await esperar(a, () => document.getElementById("pesca-hud").hidden, null, 6000).catch(() => {});
  out.hudDespues = await ctl(a, () => document.getElementById("pesca-hud").hidden);
  out.sonidos = await ctl(a, () => (document.getElementById("pesca-hud").dataset.sonidos ?? "").split(",").filter(Boolean)); // pesca-sonido.ts: the bite knocked (the catch sounds from the server)
  out.anuncio = await ctl(a, () => globalThis.__numinia.session.features.announcements.filter((x) => x.feature === "pesca").map((x) => `${x.event}: ${x.text}`));
  out.etiqueta = await ctl(a, () => document.getElementById("avisos")?.textContent ?? "");
  nota("fin", { resultado: out.despues.ultimo ? "captura" : out.despues.aviso });
  out.b = await ctl(b, () => ({ eventos: globalThis.__numinia.session.features.log.filter((e) => e.feature === "pesca").map((e) => e.event), fase: globalThis.__numinia.pesca.estado().fase }));
  // v3: the fish is in A's Inventario (and only A's); the panel lists it with icon, count and rarity
  const capturadoA = out.despues.ultimo?.pez;
  out.inventario = await ctl(a, () => globalThis.__numinia.inventario.lista().map((o) => ({ tipo: o.tipo, nombre: o.nombre, icono: o.icono, color: o.color, n: o.n, portado: o.portado })));
  out.inventarioB = await ctl(b, () => globalThis.__numinia.inventario.lista().length);
  await ctl(a, () => globalThis.__numinia.inventario.abrir());
  await esperar(a, () => document.querySelectorAll("#inventario .rejilla button.hueco:not(.vacio)").length > 0, null, 4000).catch(() => {});
  out.panelInventario = await ctl(a, () => [...document.querySelectorAll("#inventario .rejilla button.hueco:not(.vacio)")].map((b) => ({ texto: b.getAttribute("aria-label"), icono: !!b.querySelector(".ic svg"), boton: false }))); // La Bolsa galáctica: one icon slot per stack, «Carpa × 3, pez · común»
  out.tituloInventario = await ctl(a, () => [...document.querySelectorAll("#inventario h2, #inventario h3")].map((h) => h.textContent));
  await fotoSiempre(a, "inventario-panel");
  const fila = out.panelInventario.find((x) => x.texto.includes(capturadoA ?? "?"));
  const inventarioOk = out.inventario.some((o) => o.tipo === "captura" && o.nombre === capturadoA && o.icono === "fish" && o.n >= 1 && !o.portado) && out.inventarioB === 0
    && !!fila && fila.icono && !fila.boton && /pez · (común|rara|legendaria)/.test(fila.texto) && out.tituloInventario.some((t) => /Bolsa galáctica/.test(t))
    && out.guardado.enMano && out.guardado.oculto && out.guardado.pulso && out.guardado.chip && out.guardado.hudGuardados === "1";
  out.v3 = { inventarioOk, nota: out.panel.nota };
  const peces = ["Carpa", "Trucha", "Lucio"];
  const yoA = await ctl(a, () => globalThis.__numinia.session.entity);
  const enMano = out.enMano.enMano.includes(yoA) && out.enManoB.enMano.includes(yoA) && out.enManoB.capturas.some((c) => c[0] === yoA && c[1] === out.despues.ultimo?.pez);
  const panel = out.panel.visible && /pescado/.test(out.panel.clase) && out.panel.titulo === "¡Pescado!" && out.panel.pez.startsWith(`🐟 ${out.despues.ultimo?.pez} · `) && /A tu Inventario/.test(out.panel.nota) && /guardado/.test(out.panel.clase);
  out.v2 = { enMano, panel, bLanzado: out.b.eventos.includes("lanzado") && out.b.eventos.includes("fin"), manoVaciaB: out.manoVaciaB };
  ok = sitio.role === "lugar" && sitio.name === "Estanque de la plaza" && /^E: pescar$/.test(out.prompt) && out.hud.visible && /Esperando/.test(out.hud.texto) && out.hud.boton === "Recoger"
    && out.dibujo.cargado && out.dibujo.pescadores === 1 && out.dibujo.sitios === 1 && out.flotadores === 1
    && out.esperaS >= 2.5 && out.esperaS <= 13 && enPicada.fase === "picada" && out.pelea.fase === "pelea" && peces.includes(out.pelea.pez) && out.hudPelea.barras && out.hudPelea.pulsado === "true" && out.boya.visible === true && out.boya.escala >= 0.8
    && !!out.despues.ultimo && peces.includes(out.despues.ultimo.pez) && out.despues.cesta.peces >= 1 && /^Has pescado: /.test(out.despues.aviso) && out.hudDespues === true
    && out.anuncio.some((t) => t.startsWith("captura: Has pescado: ")) && out.b.fase === "nada" && !out.b.eventos.some((e) => ["picada", "pelea", "tension", "captura"].includes(e)) && errors.length === 0
    && enMano && panel && out.v2.bLanzado && out.manoVaciaB
    && out.sonidos.includes("picada") && inventarioOk;
} catch (e) { out.error = String(e).split("\n")[0]; }
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "PESCA OK" : "PESCA FALLA");
process.exit(ok ? 0 : 1);
