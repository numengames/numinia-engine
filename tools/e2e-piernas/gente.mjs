// e2e leg ux2-gente («Gente» with friends, and the card of someone you click in the world). Three people (one context
// each: tabs of one context are the same guest): A watches; B (wearing Astrodisco) and C (Polybot) come in.
// A goes next to B, clicks B's body → B's small card (busto, name, «Saludar», «Mensaje», «Ver ficha», «⋮»); the «⋮»
// opens Silenciar · Bloquear · Denunciar · Añadir amigo; «Añadir amigo» keeps B in THIS browser (localStorage
// numinia.amigos, keyed by the tag the server sends, never the identity); Escape closes the card. A adds C from
// «Aquí ahora», C leaves → C is under «Desconectados» with «visto hace…». «Ver ficha» opens Gente on B: full-body
// portrait, «En <mundo>», «Ir a su lado». Silenciar = voz.ts drops B's voice; Mensaje = the chat with «@Lucía »;
// Bloquear = /bloquear; Denunciar = the form → /denunciar (the server keeps it). A reload keeps the friends.
// Phone (390×844): the panel fits, a row shows the sheet with «‹ Volver». FOTOS=<dir> saves screenshots there.
// Usage: BASE=http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8792 node tools/e2e-piernas/gente.mjs
import { createRequire } from "node:module";
import { existsSync, readFileSync, mkdirSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const FOTOS = process.env.FOTOS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
const MODELOS = JSON.parse(readFileSync(new URL("../../activos/avatares/catalogo.json", import.meta.url), "utf8")).modelos.map((m) => m.id);
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [];
const checks = {};
const ok = (k, v, data = {}) => { checks[k] = { ok: !!v, ...data }; };
const contexto = async (o = { viewport: { width: 1600, height: 900 } }) => {
  const c = await browser.newContext(o);
  await c.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch { /* */ } }, VERSION);
  return c;
};
const open = async (ctx, url = BASE) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who && globalThis.__numinia.viajar.estado.recibido, null, { timeout: 60000 });
  return p;
};
const ent = (p) => p.evaluate(() => globalThis.__numinia.session.entity);
const foto = async (p, nombre) => { if (FOTOS) await p.screenshot({ path: `${FOTOS}/gente-${nombre}.png` }); };
const ser = (p, avatar) => p.evaluate((i) => globalThis.__numinia.session.features.send("avatar", "elegir", { tipo: "casa", modelo: i, sha: "", ext: "" }), Math.max(0, MODELOS.indexOf(avatar)));
/** The name the server gives someone (the one «Gente» and the orders use). */
const nombreDe = async (p, quien) => { await p.evaluate(() => globalThis.__numinia.viajar.pedirGente()); await p.waitForFunction((q) => globalThis.__numinia.viajar.estado.gente.some((g) => g.quien === q), quien, { timeout: 8000 }); return p.evaluate((q) => globalThis.__numinia.viajar.estado.gente.find((g) => g.quien === q).nombre, quien); };
const ultimoAviso = (p) => p.evaluate(() => globalThis.__numinia.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto).slice(-1)[0] ?? "");
/** Click B's body as A sees it (the view's own projection of their head, a little lower: the chest). */
async function pulsar(a, quien) {
  for (let i = 0; i < 30; i++) {
    const s = await a.evaluate((q) => globalThis.__numinia.view.personaEnPantalla(q), quien);
    if (s && s.x > 40 && s.x < 1560 && s.y > 40 && s.y < 860) {
      const pie = await a.evaluate((q) => { const n = globalThis.__numinia; for (let dy = 10; dy <= 80; dy += 10) { const s = n.view.personaEnPantalla(q); if (n.view.pickPerson(s.x, s.y + dy) === q) return dy; } return 30; }, quien);
      await a.mouse.click(s.x, s.y + pie);
      return s;
    }
    await a.waitForTimeout(200);
  }
  return null;
}

try {
  const ctxA = await contexto(), ctxB = await contexto(), ctxC = await contexto();
  const a = await open(ctxA), b = await open(ctxB), c = await open(ctxC);
  const A = await ent(a), B = await ent(b), C = await ent(c);
  await ser(b, "astrodisco"); await ser(c, "polybot");
  const nB = await nombreDe(a, B), nC = await nombreDe(a, C);
  const ord = [nB, nC].sort((x, y) => x.localeCompare(y, "es")).join("|");
  // A and B go to an open bit of the plaza (the map's «Ir»), 6 m apart, and A looks at B
  await b.evaluate(() => globalThis.__numinia.viajar.irAPunto(4, 2));
  await a.evaluate(() => globalThis.__numinia.viajar.irAPunto(4, 8));
  await a.waitForTimeout(3500);
  await a.evaluate((q) => { const n = globalThis.__numinia, r = n.session.remotePositions().find((x) => x.id === q), y = n.session.selfPosition(1); n.view.cam.mirarHacia(Math.atan2(-(r.x - y.x), -(r.z - y.z)), 0.15); }, B);
  await a.waitForTimeout(1500);

  // ---- the card ----
  const s = await pulsar(a, B);
  await a.waitForFunction((q) => globalThis.__numinia.gente.tarjetaAbierta() === q, B, { timeout: 4000 }).catch(() => {});
  await a.waitForTimeout(400);
  const tarjeta = await a.evaluate(() => { const t = document.getElementById("gente-tarjeta"), r = t.getBoundingClientRect(); return { visible: !t.hidden && r.width > 0, nombre: t.querySelector(".textos b")?.textContent, sub: t.querySelector(".textos .sub")?.textContent, img: t.querySelector(".retrato img")?.getAttribute("src") ?? null, botones: [...t.querySelectorAll(".acciones button")].map((x) => x.textContent || x.title), dentro: r.right <= innerWidth && r.bottom <= innerHeight && r.x >= 0 && r.y >= 0 }; });
  ok("tarjeta", s && tarjeta.visible && tarjeta.nombre === nB && /astrodisco-busto/.test(tarjeta.img ?? "") && tarjeta.dentro && tarjeta.botones.join("|") === "Saludar|Mensaje|Ver ficha", { s, tarjeta });
  await foto(a, "tarjeta");
  await a.click("#gente-tarjeta .gente-mas");
  await a.waitForTimeout(200);
  const menu = await a.evaluate(() => [...document.querySelectorAll("#gente-tarjeta .gente-menu button")].map((x) => x.textContent));
  ok("menu", menu.join("|") === "Silenciar|Bloquear|Denunciar|Añadir amigo", { menu });
  await foto(a, "tarjeta-menu");
  await a.click("#gente-tarjeta .gente-menu button:last-child");
  const am1 = await a.evaluate(() => ({ lista: globalThis.__numinia.gente.amigos(), guardado: localStorage.getItem("numinia.amigos"), sub: document.querySelector("#gente-tarjeta .textos .sub")?.textContent }));
  const idB = await b.evaluate(() => globalThis.__numinia.session.who.id);
  ok("anadir", am1.lista.length === 1 && am1.lista[0].nombre === nB && /^h:[0-9a-f]{16}$/.test(am1.lista[0].clave) && !am1.guardado.includes(idB) && /^En tus amigos/.test(am1.sub ?? ""), { am1 });
  await a.keyboard.press("Escape");
  ok("escape", (await a.evaluate(() => globalThis.__numinia.gente.tarjetaAbierta())) === null, {});
  // a click elsewhere closes it too
  await pulsar(a, B);
  await a.waitForTimeout(200);
  await a.mouse.click(60, 860);
  ok("fuera", (await a.evaluate(() => globalThis.__numinia.gente.tarjetaAbierta())) === null, {});

  // ---- C as a friend, then C leaves ----
  await a.keyboard.press("KeyL");
  await a.waitForFunction(() => document.getElementById("gente")?.open, null, { timeout: 4000 });
  await a.click("#gente-tab-aqui");
  await a.waitForSelector(`#gente [data-quien="${C}"] .gente-fila`, { timeout: 8000 });
  await a.click(`#gente [data-quien="${C}"] .gente-fila`);
  await a.click("#gente-anadir");
  ok("anadirCabecera", (await a.evaluate(() => globalThis.__numinia.gente.amigos().map((x) => x.nombre).sort((x, y) => x.localeCompare(y, "es")).join("|"))) === ord, {});
  await a.keyboard.press("Escape");
  await ctxC.close();
  await a.waitForTimeout(1500);

  // ---- «Ver ficha» from the card: Gente on B ----
  await pulsar(a, B);
  await a.waitForFunction((q) => globalThis.__numinia.gente.tarjetaAbierta() === q, B, { timeout: 4000 }).catch(() => {});
  await a.click("#gente-tarjeta-ficha");
  await a.waitForFunction(() => document.getElementById("gente")?.open && !!document.getElementById("gente-ir"), null, { timeout: 4000 });
  await a.waitForTimeout(5800); // the list refreshes (C gone)
  const ficha = await a.evaluate(() => {
    const g = document.getElementById("gente");
    return { nombre: g.querySelector(".gente-nombre")?.textContent, chip: g.querySelector(".chip")?.textContent, sub: g.querySelector(".gente-datos .sub")?.textContent, ahora: g.querySelector(".gente-ahora p")?.textContent,
      cuerpo: g.querySelector(".gente-figura img")?.getAttribute("src") ?? null, tab: g.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
      secciones: [...g.querySelectorAll(".gente-seccion")].map((x) => x.textContent), fuera: [...g.querySelectorAll(".gente-fila.fuera")].map((x) => x.textContent),
      botones: [...g.querySelectorAll(".gente-botones button, .gente-delicados button")].map((x) => x.textContent), letra: g.querySelector(".gente-letra")?.textContent,
      filasDelicadas: new Set([...g.querySelectorAll(".gente-delicados button")].map((x) => Math.round(x.getBoundingClientRect().top))).size };
  });
  ok("ficha", ficha.nombre === nB && /^En /.test(ficha.chip ?? "") && /desde el/.test(ficha.sub ?? "") && /Astrodisco/.test(ficha.sub ?? "") && /m de ti|a tu lado/.test(ficha.ahora ?? "") && /astrodisco-cuerpo/.test(ficha.cuerpo ?? "")
    && /^Amigos · 2/.test(ficha.tab ?? "") && ficha.secciones.join("|") === "Conectados|Desconectados" && ficha.fuera.join("").startsWith(nC) && /hace/.test(ficha.fuera.join("")) && ficha.botones.join("|") === "Ir a su lado|Mensaje|Saludar|Silenciar|Bloquear|Denunciar|Quitar de amigos"
    && /se guardan en este navegador/.test(ficha.letra ?? "") && ficha.filasDelicadas === 1, { ficha });
  await foto(a, "amigos");
  await a.click("#gente-tab-aqui");
  await a.waitForTimeout(300);
  await foto(a, "aqui");
  ok("aqui", (await a.evaluate((q) => !!document.querySelector(`#gente [data-quien="${q}"] .gente-fila[aria-current="true"]`) && /^Aquí ahora · 1/.test(document.getElementById("gente-tab-aqui").textContent), B)), {});

  // ---- the actions ----
  await a.click("#gente-silenciar");
  ok("silenciar", await a.evaluate((q) => globalThis.__numinia.voz.silenciado(q) && document.getElementById("gente-silenciar").getAttribute("aria-pressed") === "true", B), {});
  await a.click("#gente-silenciar");
  await a.click("#gente-bloquear");
  await a.waitForTimeout(500);
  const bloq = await ultimoAviso(a);
  ok("bloquear", /no lees ni oyes/.test(bloq) && (await a.evaluate(() => document.getElementById("gente-bloquear").textContent)) === "Desbloquear", { bloq });
  await a.click("#gente-bloquear");
  await a.waitForTimeout(300);
  await a.click("#gente-denunciar");
  await a.fill("#gente-denuncia-motivo", "Prueba e2e: insulta en el chat");
  await foto(a, "denuncia");
  await a.click("#gente-denuncia-enviar");
  await a.waitForTimeout(500);
  const den = await ultimoAviso(a);
  ok("denunciar", /Aviso (guardado|enviado)/.test(den) && !(await a.evaluate(() => document.getElementById("gente-denuncia").open)), { den });
  await a.click("#gente-mensaje");
  await a.waitForTimeout(200);
  const msg = await a.evaluate(() => ({ gente: document.getElementById("gente").open, chat: document.getElementById("chat-texto")?.value, abierto: !document.getElementById("chat-form")?.hidden }));
  ok("mensaje", !msg.gente && msg.chat === `@${nB} ` && msg.abierto, msg);
  await a.keyboard.press("Escape");

  // ---- a reload keeps the friends ----
  await a.reload();
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.viajar.estado.recibido, null, { timeout: 60000 });
  ok("recarga", (await a.evaluate(() => globalThis.__numinia.gente.amigos().map((x) => x.nombre).sort((x, y) => x.localeCompare(y, "es")).join("|"))) === ord, {});

  // ---- phone ----
  const ctxM = await contexto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const m = await open(ctxM);
  await m.evaluate(() => globalThis.__numinia.gente.abrir());
  await m.waitForSelector(`#gente [data-quien="${B}"] .gente-fila`, { timeout: 8000 });
  const r1 = await m.evaluate((q) => { const r = document.querySelector(`#gente [data-quien="${q}"] .gente-fila`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, alto: r.height }; }, B);
  await m.touchscreen.tap(r1.x, r1.y);
  await m.waitForTimeout(300);
  const mv = await m.evaluate(() => { const g = document.getElementById("gente").getBoundingClientRect(), ir = document.getElementById("gente-ir").getBoundingClientRect(), v = document.querySelector("#gente .gente-volver").getBoundingClientRect(); return { dentro: g.x >= 0 && g.right <= innerWidth + 0.5 && g.bottom <= innerHeight + 0.5, ir: ir.height, volver: v.height, lista: document.querySelector("#gente .gente-izq").getBoundingClientRect().width }; });
  ok("movil", r1.alto >= 44 && mv.dentro && mv.ir >= 44 && mv.volver >= 44 && mv.lista === 0, { r1, mv });
  await foto(m, "movil");
  await ctxM.close();
  await ctxB.close();
  await ctxA.close();
} catch (e) { checks.excepcion = { ok: false, error: String(e).split("\n").slice(0, 3).join(" | ") }; }
await browser.close();

const allOk = Object.values(checks).every((c) => c.ok) && errors.length === 0 && Object.keys(checks).length >= 14;
console.log(JSON.stringify({ checks, errors }, null, 1));
console.log(allOk ? "E2E GENTE OK" : "E2E GENTE FALLA");
process.exit(allOk ? 0 : 1);
