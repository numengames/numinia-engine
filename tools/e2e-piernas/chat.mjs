// e2e leg J3 (chat): two people (two browser contexts = two guests with their own names). A opens the chat with the
// real keyboard (Enter), types "hola", sends it (Enter); B, within 20 m, sees A's bubble and the line in its list and
// draws A's name over A's head. Then: typing WASD inside the box does not move A; 300 bytes are refused; a quick flood
// is cut by the page and by the server; the zone channel reaches B and a late tab gets it as history; /ayuda answers
// only A. Prints JSON; exit 0 only when everything is right. Receives BASE and SERVER_HTTP (tools/e2e-piernas/README.md).
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const open = async (ctx) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 30000 });
  return p;
};
const ctxA = await browser.newContext({ viewport: { width: 480, height: 300 } });
const ctxB = await browser.newContext({ viewport: { width: 480, height: 300 } });
const out = { errors };
const checks = {};
try {
  const a = await open(ctxA), b = await open(ctxB);
  const A = await a.evaluate(() => ({ entity: globalThis.__numinia.session.entity, who: globalThis.__numinia.session.who }));
  const B = await b.evaluate(() => ({ entity: globalThis.__numinia.session.entity, who: globalThis.__numinia.session.who }));
  Object.assign(out, { a: A, b: B });
  checks.dosInvitados = A.who.id !== B.who.id;

  // B walks towards A until it stands within 14 m (near chat reaches 20 m), like tools/e2e.mjs does
  const offset = () => b.evaluate((w) => { const n = globalThis.__numinia, me = n.session.selfPosition(1), o = n.session.remotePositions().find((r) => r.id === w); return o ? { dx: o.x - me.x, dz: o.z - me.z } : null; }, A.entity);
  await b.waitForFunction((id) => globalThis.__numinia.session.remotePositions().some((r) => r.id === id), A.entity, { timeout: 10000 }).catch(() => {});
  await b.bringToFront();
  for (const t0 = Date.now(); Date.now() - t0 < 45000; ) {
    const d = await offset();
    if (d && Math.hypot(d.dx, d.dz) <= 14) break;
    const held = [];
    if (d && Math.abs(d.dx) > 2) held.push(d.dx > 0 ? "KeyD" : "KeyA");
    if (d && Math.abs(d.dz) > 2) held.push(d.dz > 0 ? "KeyS" : "KeyW");
    for (const k of held) await b.keyboard.down(k);
    await b.waitForTimeout(d ? Math.min(1500, Math.max(250, (Math.hypot(d.dx, d.dz) - 10) * 220)) : 400);
    for (const k of held) await b.keyboard.up(k);
  }
  await b.waitForTimeout(400);
  const d0 = await offset();
  out.distanciaAB = d0 ? Math.round(Math.hypot(d0.dx, d0.dz) * 10) / 10 : null;
  checks.cerca = out.distanciaAB !== null && out.distanciaAB <= 18;

  // A's name over A's head, drawn in B (the server sends it within 24 m; the page draws the nearest)
  await b.waitForFunction((w) => globalThis.__numinia.view.nameTags().some((t) => t.target === w.entity && t.text === w.who.nombre && t.drawn), A, { timeout: 8000 }).catch(() => {});
  out.nombreEnB = await b.evaluate((w) => globalThis.__numinia.view.nameTags().find((t) => t.target === w) ?? null, A.entity);
  checks.nombre = out.nombreEnB?.text === A.who.nombre && out.nombreEnB?.drawn === true;
  checks.nombrePropioNo = await a.evaluate(() => !globalThis.__numinia.view.nameTags().some((t) => t.target === "self" && t.drawn));

  // A: Enter opens the box (focused input), types "hola", Enter sends (and closes it)
  await a.bringToFront();
  await a.keyboard.press("Enter");
  checks.enterAbre = await a.evaluate(() => document.activeElement?.id === "chat-texto" && !document.getElementById("chat-form").hidden);
  await a.keyboard.type("hola");
  await a.keyboard.press("Enter");
  checks.enterEnviaYCierra = await a.evaluate(() => document.getElementById("chat-form").hidden && document.activeElement?.id !== "chat-texto");
  await b.waitForFunction(() => /hola/.test(document.getElementById("chat-lista")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
  out.listaB = await b.evaluate(() => [...document.querySelectorAll("#chat-lista li")].map((li) => li.textContent));
  out.bocadilloEnB = await b.evaluate((w) => globalThis.__numinia.view.bubbles().find((x) => x.target === w) ?? null, A.entity);
  out.listaA = await a.evaluate(() => [...document.querySelectorAll("#chat-lista li")].map((li) => li.textContent));
  checks.bocadillo = out.bocadilloEnB?.text === "hola";
  checks.lista = out.listaB.includes(`${A.who.nombre}: hola`) && out.listaA.includes("Tú: hola");
  checks.lectorDePantalla = await b.evaluate(() => { const l = document.getElementById("chat-lista"); return l.getAttribute("role") === "log" && l.getAttribute("aria-live") === "polite"; });

  // typing WASD inside the box never moves A (and the box's keys do not reach the gestures or the builder)
  await a.keyboard.press("Enter");
  const p0 = await a.evaluate(() => globalThis.__numinia.session.selfPosition(1));
  await a.keyboard.type("wasd WASD");
  await a.keyboard.down("KeyW"); await a.waitForTimeout(900); await a.keyboard.up("KeyW");
  await a.waitForTimeout(300);
  const p1 = await a.evaluate(() => globalThis.__numinia.session.selfPosition(1));
  out.wasdEnLaCaja = { dx: Math.round((p1.x - p0.x) * 1000) / 1000, dz: Math.round((p1.z - p0.z) * 1000) / 1000, texto: await a.evaluate(() => document.getElementById("chat-texto").value) };
  checks.escribirNoMueve = Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.01 && out.wasdEnLaCaja.texto.startsWith("wasd WASD");
  await a.keyboard.press("Escape");
  checks.escapeCierra = await a.evaluate(() => document.getElementById("chat-form").hidden && document.getElementById("chat-texto").value === "");

  // 300 bytes (150 × «ñ»): refused by the page with the reason; the text stays to be fixed; B never gets it
  await a.keyboard.press("Enter");
  await a.keyboard.type("ñ".repeat(150));
  await a.keyboard.press("Enter");
  out.largo = { estado: await a.evaluate(() => document.getElementById("chat-estado").textContent), sigue: await a.evaluate(() => document.getElementById("chat-texto").value.length) };
  await a.keyboard.press("Escape");
  checks.largoRechazado = /300 de 200 bytes/.test(out.largo.estado) && out.largo.sigue === 150;

  // a quick flood through the box: the page lets 3 go and says why it stops; then 10 straight to the wire: the server lets ≤ 4 through
  for (let i = 0; i < 5; i++) { await a.keyboard.press("Enter"); await a.keyboard.type(`f${i}`); await a.keyboard.press("Enter"); }
  out.rafagaPagina = await a.evaluate(() => document.getElementById("chat-estado").textContent);
  await a.keyboard.press("Escape");
  await a.waitForTimeout(3500); // the server's bucket fills again (1 a second, 3 at most)
  await a.evaluate(() => { for (let i = 0; i < 10; i++) globalThis.__numinia.session.features.send("chat", "decir", { texto: `r${i}` }); });
  await b.waitForTimeout(1500);
  const lineasB = await b.evaluate(() => globalThis.__numinia.chat.lineas.map((l) => l.texto));
  out.rafaga = { pagina: lineasB.filter((t) => /^f\d$/.test(t)), servidor: lineasB.filter((t) => /^r\d$/.test(t)) };
  checks.rafaga = /deprisa/.test(out.rafagaPagina) && out.rafaga.pagina.length >= 2 && out.rafaga.pagina.length <= 4 && out.rafaga.servidor.length >= 1 && out.rafaga.servidor.length <= 4;

  // the zone channel: the «Cerca» button switches to «Zona»; B gets it; a tab that enters later gets it as history
  await a.waitForTimeout(1200);
  await a.keyboard.press("Enter");
  await a.click("#chat-canal");
  await a.keyboard.type("hola zona");
  await a.keyboard.press("Enter");
  await b.waitForFunction(() => globalThis.__numinia.chat.lineas.some((l) => l.tipo === "zona" && l.texto === "hola zona"), null, { timeout: 5000 }).catch(() => {});
  checks.zona = await b.evaluate(() => globalThis.__numinia.chat.lineas.some((l) => l.tipo === "zona" && l.texto === "hola zona"));
  const c = await open(ctxB);
  await c.waitForFunction(() => globalThis.__numinia.chat.lineas.some((l) => l.tipo === "antes"), null, { timeout: 5000 }).catch(() => {});
  out.historialEnC = await c.evaluate(() => globalThis.__numinia.chat.lineas.filter((l) => l.tipo === "antes").map((l) => l.texto));
  checks.historial = out.historialEnC.includes("hola zona");
  await c.close();

  // a command: not published, answered only to A
  await a.bringToFront();
  await a.evaluate(() => globalThis.__numinia.chat.decir("/ayuda"));
  await a.waitForFunction(() => globalThis.__numinia.chat.lineas.some((l) => l.tipo === "aviso" && /Órdenes/.test(l.texto)), null, { timeout: 5000 }).catch(() => {});
  checks.orden = await a.evaluate(() => globalThis.__numinia.chat.lineas.some((l) => l.tipo === "aviso" && /Órdenes/.test(l.texto)))
    && !(await b.evaluate(() => globalThis.__numinia.chat.lineas.some((l) => /ayuda/.test(l.texto))));

  // and the box closed, the same W does move A (the check above was not empty)
  const q0 = await a.evaluate(() => globalThis.__numinia.session.selfPosition(1));
  await a.keyboard.down("KeyW"); await a.waitForTimeout(600); await a.keyboard.up("KeyW");
  await a.waitForTimeout(300);
  const q1 = await a.evaluate(() => globalThis.__numinia.session.selfPosition(1));
  out.wasdFuera = Math.round(Math.hypot(q1.x - q0.x, q1.z - q0.z) * 100) / 100;
  checks.fueraSiMueve = out.wasdFuera > 0.5;
} catch (e) { out.error = String(e).split("\n")[0]; }
await browser.close();
out.checks = checks;
const ok = !out.error && errors.length === 0 && Object.keys(checks).length >= 15 && Object.values(checks).every(Boolean);
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "E2E CHAT OK" : "E2E CHAT FALLA");
process.exit(ok ? 0 : 1);
