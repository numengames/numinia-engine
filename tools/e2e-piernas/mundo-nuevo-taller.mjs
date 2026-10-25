// e2e-lenta
// e2e leg (primera vez, Story O): a world BORN now — an empty MOTOR_MUNDO folder, first start — carries the Taller onboarding and
// nothing else, and a person plays all 11 missions with the real interface up to the «Constructor» badge.
// Starts its own server (on a folder that does not exist yet) and page on spare ports; asserts first what the folder got, then that the
// quest book lists only the 11 onboarding missions on first entry (picture), then the whole run (the same one plantillas/taller was
// proved with: talk to Lumen, accept, do it with the buttons, the guide arrow within 40 px of each button).
// Env: SHOTS=<folder> saves pictures (default: the temp folder); E2E_SERVER_PORT / E2E_VITE_PORT (default 8921 / 5421); CHROME; PW_CORE.
// Takes minutes under load: `tools/auto.sh e2e` skips it unless E2E_LENTAS=1. Run alone: node tools/e2e-piernas/mundo-nuevo-taller.mjs
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHES = ["/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/home/.cache/ms-playwright", "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright"];
const CHROME = process.env.CHROME ?? CACHES.flatMap((c) => ["1248", "1243"].map((v) => `${c}/chromium_headless_shell-${v}/chrome-headless-shell-linux64/chrome-headless-shell`)).find(existsSync);
if (!existsSync(PW) || !CHROME || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
const SP = Number(process.env.E2E_SERVER_PORT ?? 8921), VP = Number(process.env.E2E_VITE_PORT ?? 5421);
const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-mundo-nuevo-"));
const MUNDO = join(tmp, "mundo"); // does not exist: the server's first start makes it
const FOTOS = (process.env.SHOTS || join(tmp, "fotos")).replace(/\/?$/, "/");
mkdirSync(FOTOS, { recursive: true });
const { chromium } = createRequire(import.meta.url)(PW);
const version = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version;

const procs = [];
const arrancar = (cmd, args, env) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); p.log = ""; p.stdout.on("data", (d) => { p.log += d; }); p.stderr.on("data", (d) => { p.log += d; }); procs.push(p); return p; };
const limpiar = () => { for (const p of procs) { try { p.kill("SIGTERM"); } catch { /* gone */ } } if (!process.env.KEEP) rmSync(tmp, { recursive: true, force: true }); };
process.on("exit", limpiar);
const srv = arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), HOST: "127.0.0.1", MOTOR_MUNDO: MUNDO, MOTOR_CONSTRUIR: "todos", MOTOR_SECRET: "e2e-mundo-nuevo-secreto-xxxxxxxxxxxx", MOTOR_ADMIN: "e2e-mundo-nuevo-admin-xxxxxxxxxxxxx" });
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP), PLAZA_SERVER_PORT: String(SP) });
for (let i = 0; i < 120; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`), s = await fetch(`http://127.0.0.1:${SP}/status`); if (r.ok && s.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}&pulso=2000`;
const todos = (d) => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath ?? e.path, e.name).slice(d.length + 1)).sort();
const MISIONES = ["abre-el-taller", "pon-un-farolillo", "muevelo", "apagalo", "mira-el-cable", "tu-primer-cable", "cuando-zona", "cuanto-espera", "varios-que", "encadena", "tu-mini-mision"];
const paso = (n, ok, d = {}) => { console.log(`${ok ? "ok " : "FALLA"} ${n} ${Object.keys(d).length ? JSON.stringify(d) : ""}`); if (!ok) throw new Error(n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"] });
let rc = 0;

const libro = (p) => p.evaluate(() => globalThis.__numinia.misiones.libro().map((m) => ({ id: m.id, estado: m.estado, paso: m.paso })));
const dlg = (p) => p.evaluate(() => { const x = globalThis.__numinia.misiones.dialogo(); return x ? { texto: x.texto, opciones: x.opciones } : null; });
const flecha = (p) => p.evaluate(() => { const f = document.getElementById("flecha-guia"); if (!f || f.hidden) return null; const r = f.getBoundingClientRect(); return { r: { x: r.x, y: r.y, w: r.width, h: r.height }, obj: f.dataset.objetivo, label: f.getAttribute("aria-label") }; });
const distA = (p, f, id) => p.evaluate(([f, id]) => { const e = document.getElementById(id); if (!e) return 9999; const b = e.getBoundingClientRect(); const dx = Math.max(b.left - (f.r.x + f.r.w), f.r.x - b.right, 0), dy = Math.max(b.top - (f.r.y + f.r.h), f.r.y - b.bottom, 0); return Math.hypot(dx, dy); }, [f, id]);
const cerrarLibro = async (p) => { if (await p.evaluate(() => !document.getElementById("libro").hidden)) { await p.mouse.move(640, 360); await p.keyboard.press("KeyJ"); await sleep(400); } };
const panelAbierto = (p) => p.evaluate(() => !document.getElementById("panel-construir").hidden);

async function entrar(ctx) {
  const p = await ctx.newPage();
  p.errores = []; p.on("pageerror", (e) => p.errores.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.constructor.estado.puede === true, null, { timeout: 40000 });
  return p;
}
async function abrirConstruir(p) {
  if (await panelAbierto(p)) return;
  await p.mouse.move(640, 360); await p.keyboard.press("KeyC");
  await p.waitForFunction(() => !document.getElementById("panel-construir").hidden && globalThis.__numinia.view.editor.estado().cargado, null, { timeout: 15000 });
  await sleep(500);
}
async function salirConstruir(p) {
  if (!(await panelAbierto(p))) return;
  await p.evaluate(() => document.activeElement?.blur());
  await p.keyboard.press("Escape"); await sleep(300);
  if (await panelAbierto(p)) await p.evaluate(() => document.getElementById("dock-salir").click());
  await p.waitForFunction(() => document.getElementById("panel-construir").hidden, null, { timeout: 5000 });
  await sleep(400);
}
/** Habla con Lumen (API de misiones, el radio de su diálogo es 3 m); si está lejos, se acerca andando. */
async function hablar(p) {
  const intento = async () => { for (let i = 0; i < 12; i++) { await p.evaluate(() => globalThis.__numinia.misiones.hablar("lumen")); await sleep(400); if (await dlg(p)) return true; } return false; };
  if (await intento()) return true;
  await p.bringToFront(); await p.keyboard.down("KeyW"); await sleep(1200); await p.keyboard.up("KeyW");
  return await intento();
}
/** Habla con Lumen, elige la primera opción (aceptar) y comprueba que la misión `id` queda activa. */
async function aceptar(p, id) {
  paso(`hablar con Lumen (${id})`, await hablar(p), { dlg: await dlg(p) });
  for (let i = 0; i < 4; i++) {
    const l = await libro(p);
    if (l.find((m) => m.id === id)?.estado === "activa") break;
    if (!(await dlg(p))) break;
    await p.evaluate(() => globalThis.__numinia.misiones.elegir(1)); await sleep(500);
  }
  if (await dlg(p)) await p.evaluate(() => globalThis.__numinia.misiones.adios());
  await sleep(500);
  const l = await libro(p);
  paso(`misión ${id} aceptada (activa)`, l.find((m) => m.id === id)?.estado === "activa", { libro: l.filter((m) => m.estado !== "bloqueada").map((m) => `${m.id}:${m.estado}:${m.paso}`) });
  await cerrarLibro(p);
}
const senala = (p) => p.evaluate(() => globalThis.__numinia.misiones.senala());
/** La flecha apunta a `id` (y está a ≤ 40 px) con la misión activa. */
async function mirarFlecha(p, id, sen = id) {
  await p.waitForFunction((id) => globalThis.__numinia.misiones.senala() === id, sen, { timeout: 8000 }).catch(() => {});
  paso(`senala() = ${sen}`, (await senala(p)) === sen, { senala: await senala(p) });
  let f = null;
  for (let i = 0; i < 20; i++) { f = await flecha(p); if (f?.obj === id) break; await sleep(250); }
  paso(`flecha apunta a #${id}`, f?.obj === id, { f });
  const d = await distA(p, f, id);
  paso(`flecha a ≤ 40 px de #${id}`, d <= 40, { px: Math.round(d) });
}
async function completa(p, id, extra = 8000) {
  const ok = await p.waitForFunction((id) => globalThis.__numinia.misiones.libro().find((m) => m.id === id)?.estado === "hecha", id, { timeout: extra }).then(() => true, () => false);
  const l = await libro(p);
  paso(`misión ${id} COMPLETADA (servidor)`, ok, { libro: l.filter((m) => m.estado !== "bloqueada").map((m) => `${m.id}:${m.estado}:${m.paso}`) });
}
const foto = async (p, n) => { await cerrarLibro(p); await sleep(500); await p.screenshot({ path: `${FOTOS}${n}.png` }); };
const objetos = (p) => p.evaluate(() => [...globalThis.__numinia.session.features.stateOf("objetos").entries()].map(([k, v]) => ({ k, ...v })));
async function buscarAsa(p, axis, pts) {
  for (const w of pts) {
    const s = await p.evaluate(([x, y, z]) => globalThis.__numinia.view.editor.pantalla(x, y, z), w);
    if (!s) continue;
    await p.mouse.move(s.x, s.y);
    if ((await p.evaluate(() => globalThis.__numinia.view.editor.estado().ejeBajo)) === axis) return s;
  }
  return null;
}
async function arrastrar(p, from, dx, dy) {
  await p.mouse.move(from.x, from.y); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(from.x + (dx * i) / 10, from.y + (dy * i) / 10); await sleep(40); }
  await p.mouse.up();
}
const abrirCable = async (p) => { await abrirConstruir(p); if (!(await p.locator("#cable-lista").isVisible())) { await p.locator("#dock-cable").click(); await sleep(600); } };
const cableLi = (p, nombre) => p.locator("#cable-lista li", { hasText: nombre });

try {
  paso("el servidor dijo que el mundo nació con el onboarding", /mundo nuevo: nace con el onboarding del Taller/.test(srv.log), { log: srv.log.split("\n").find((l) => l.includes("mundo nuevo")) });
  const ficheros = todos(MUNDO).filter((f) => !/^(datos|sesiones)\//.test(f) && f !== "claves.env" && f !== "mundo.json");
  paso("la carpeta nueva trae el onboarding y nada más", ficheros.length === 11 + 1 + 1 + 7 && !ficheros.some((f) => /ejemplo|alma|bruno|teo|lia/i.test(f)), { ficheros });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, version);
  const p = await entrar(ctx);
  paso("entrar", true);
  // ---------- first entry: the quest book holds nothing of the example; the onboarding is offered by Lumen alone ----------
  await sleep(2500);
  const libro0 = await libro(p);
  paso("el libro de misiones empieza vacío (ni rastro de las misiones de ejemplo)", libro0.length === 0, { libro: libro0 });
  await p.mouse.move(640, 360); await p.keyboard.press("KeyJ"); await sleep(800);
  await p.screenshot({ path: `${FOTOS}20-libro-primera-entrada.png` });
  console.log("libro (texto):", (await p.evaluate(() => document.getElementById("libro").innerText)).replace(/\s+/g, " ").slice(0, 400));
  await cerrarLibro(p);

  console.log("api misiones:", await p.evaluate(() => Object.keys(globalThis.__numinia.misiones).join()));
  paso("sin misión activa: no hay flecha", (await flecha(p)) === null);
  await sleep(1500);

  // ---------- M1: abre el taller ----------
  await aceptar(p, "abre-el-taller");
  { const l1 = await libro(p); paso("tras hablar con Lumen el libro lista solo «abre-el-taller»", l1.length === 1 && l1[0].id === "abre-el-taller", { libro: l1 });
    await p.mouse.move(640, 360); await p.keyboard.press("KeyJ"); await sleep(800); await p.screenshot({ path: `${FOTOS}21-libro-tras-hablar-con-lumen.png` }); await cerrarLibro(p); }
  await mirarFlecha(p, "construir");
  await p.mouse.move(640, 360); await p.keyboard.press("KeyC");
  await p.waitForFunction(() => !document.getElementById("panel-construir").hidden, null, { timeout: 15000 });
  await completa(p, "abre-el-taller");
  await foto(p, "30-m01-abre-el-taller");

  // ---------- M2: pon un farolillo ----------
  await salirConstruir(p);
  await aceptar(p, "pon-un-farolillo");
  await mirarFlecha(p, "construir", "dock-anadir"); // panel cerrado: la flecha lleva a Construir
  await abrirConstruir(p);
  await mirarFlecha(p, "dock-anadir");
  await p.screenshot({ path: `${FOTOS}30-m02-flecha-anadir.png` });
  await p.locator("#dock-anadir").click();
  const caja = await p.locator("#cajon-anadir").boundingBox();
  const suelo = await p.evaluate(() => { const n = globalThis.__numinia, me = n.session.selfPosition(1); const c = document.getElementById("cajon-anadir").getBoundingClientRect();
    for (let dx = 2; dx <= 8; dx += 0.5) for (const dz of [-1, 0, 1, 2, 3]) { const s = n.view.editor.pantalla(me.x + dx, 0, me.z + dz); if (s && s.x > c.right + 40 && s.x < innerWidth - 40 && s.y > 150 && s.y < innerHeight - 140) return { w: [me.x + dx, 0, me.z + dz], s }; }
    return null; });
  paso("hay suelo a la vista fuera del cajón", !!suelo, { suelo, caja });
  const n0 = (await objetos(p)).length;
  const pieza = await p.locator('#cajon-anadir [data-pieza="farolillo"]').boundingBox();
  await p.mouse.move(pieza.x + pieza.width / 2, pieza.y + pieza.height / 2); await p.mouse.down();
  await p.mouse.move(suelo.s.x - 30, suelo.s.y, { steps: 6 }); await p.mouse.move(suelo.s.x, suelo.s.y, { steps: 3 });
  await sleep(200); await p.mouse.up();
  await p.waitForFunction((n0) => globalThis.__numinia.session.features.stateOf("objetos").size > n0, n0, { timeout: 20000 });
  const farol = (await objetos(p)).at(-1);
  paso("farolillo colocado arrastrando de la biblioteca", farol.modelo === "farolillo" || /farol/i.test(JSON.stringify(farol)), { farol });
  await p.waitForFunction(() => globalThis.__numinia.view.objects().loaded >= globalThis.__numinia.view.objects().placed, null, { timeout: 30000 });
  await p.locator("#dock-anadir").click(); await sleep(500);
  await completa(p, "pon-un-farolillo");
  await foto(p, "31-m02-pon-un-farolillo");
  const FID = farol.k;

  // ---------- M3: muévelo y gíralo ----------
  await salirConstruir(p);
  await aceptar(p, "muevelo");
  await abrirConstruir(p);
  // elegir el farolillo con un clic sobre él
  const sel = async () => p.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado);
  let o0 = (await objetos(p)).find((o) => o.k === FID);
  for (const dy of [0.4, 0.8, 0.2, 1.2, 0]) {
    if ((await sel(p)) === FID) break;
    const s = await p.evaluate(([x, y, z]) => globalThis.__numinia.view.editor.pantalla(x, y, z), [o0.x, (o0.y ?? 0) + dy, o0.z]);
    if (s) { await p.mouse.click(s.x, s.y); await sleep(500); }
  }
  paso("farolillo elegido con un clic", (await sel(p)) === FID, { sel: await sel(p), o0 });
  await p.keyboard.press("Digit2"); await sleep(500); // mover
  console.log("modo", await p.evaluate(() => globalThis.__numinia.constructor.estado.modo));
  const cy = (o0.y ?? 0);
  const ejeX = []; for (let t = 0.2; t <= 4; t += 0.1) { ejeX.push([o0.x + t, cy, o0.z]); ejeX.push([o0.x + t, cy + 0.5, o0.z]); }
  const asaX = await buscarAsa(p, "X", ejeX);
  paso("asa X del gizmo bajo el ratón", !!asaX, { asaX });
  await arrastrar(p, asaX, 80, 0);
  await p.waitForFunction(([k, x0]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - x0) >= 0.3; }, [FID, o0.x], { timeout: 8000 }).catch(() => {});
  let o1 = (await objetos(p)).find((o) => o.k === FID);
  paso("movido con la flecha X (el servidor lo guarda)", Math.abs(o1.x - o0.x) >= 0.3, { x0: o0.x, x1: o1.x });
  let l = await libro(p);
  console.log("tras mover:", JSON.stringify(l.filter((m) => m.id === "muevelo")));
  // girar: tecla R + aro
  await p.mouse.move(640, 130); await sleep(300);
  await p.keyboard.press("KeyR"); await sleep(600);
  console.log("modo", await p.evaluate(() => globalThis.__numinia.constructor.estado.modo));
  const aro = [];
  for (const r of [0.6, 0.9, 1.2, 1.6, 0.4, 2]) for (let a = 0; a < 360; a += 10) aro.push([o1.x + r * Math.cos((a * Math.PI) / 180), cy + 0.02, o1.z + r * Math.sin((a * Math.PI) / 180)]);
  let asaG = await buscarAsa(p, "Y", aro);
  if (!asaG) { const ejes = await p.evaluate(() => globalThis.__numinia.view.editor.estado()); console.log("estado editor", JSON.stringify(ejes)); }
  paso("aro de girar (eje Y) bajo el ratón", !!asaG, { asaG });
  const giro0 = (await objetos(p)).find((o) => o.k === FID);
  await arrastrar(p, asaG, 70, 40);
  await sleep(1200);
  const giro1 = (await objetos(p)).find((o) => o.k === FID);
  console.log("giro", JSON.stringify([giro0.ry ?? giro0.giro ?? giro0.rot, giro1.ry ?? giro1.giro ?? giro1.rot]), JSON.stringify(giro1));
  await completa(p, "muevelo", 10000);
  await p.screenshot({ path: `${FOTOS}32-m03-muevelo.png` });

  // ---------- M4: apágalo ----------
  await salirConstruir(p);
  await aceptar(p, "apagalo");
  await abrirConstruir(p);
  const oa = (await objetos(p)).find((o) => o.k === FID);
  for (const dy of [0.4, 0.8, 0.2, 1.2, 0, 0.6, 1.0]) {
    if ((await sel(p)) === FID) break;
    const s = await p.evaluate(([x, y, z]) => globalThis.__numinia.view.editor.pantalla(x, y, z), [oa.x, (oa.y ?? 0) + dy, oa.z]);
    if (s) { await p.mouse.click(s.x, s.y); await sleep(500); }
  }
  paso("farolillo elegido con un clic", (await sel(p)) === FID, { sel: await sel(p) });
  await p.locator("#dock-inspector").click(); await sleep(600);
  console.log("inspector", await p.evaluate(() => ({ sel: globalThis.__numinia.constructor.estado.seleccionado, hidden: document.getElementById("cajon-inspector").hidden, txt: document.getElementById("cajon-inspector").innerText.slice(0, 300) })));
  await p.screenshot({ path: `${FOTOS}dbg-inspector.png` });
  const casilla = p.locator("#cajon-inspector .inspector label", { hasText: "se ve al jugar" }).locator("input[type=checkbox]");
  await casilla.uncheck();
  await p.waitForFunction((k) => globalThis.__numinia.session.features.stateOf("objetos").get(k)?.oculto === true, FID, { timeout: 8000 });
  await completa(p, "apagalo");
  await sleep(500);
  await foto(p, "33-m04-apagalo");

  // ---------- M5: mira el cable ----------
  await salirConstruir(p);
  await aceptar(p, "mira-el-cable");
  await mirarFlecha(p, "construir", "dock-cable");
  await abrirConstruir(p);
  await mirarFlecha(p, "dock-cable");
  await p.screenshot({ path: `${FOTOS}34-m05-flecha-cable.png` });
  await p.locator("#dock-cable").click(); await sleep(600);
  l = await libro(p);
  console.log("tras abrir Cable:", JSON.stringify(l.filter((m) => m.id === "mira-el-cable")));
  await mirarFlecha(p, "cable-probar-boton-rojo");
  await foto(p, "34-m05-mira-el-cable-1");
  await cableLi(p, "Botón rojo").locator(".cable-probar").first().click();
  await completa(p, "mira-el-cable");
  await sleep(800);
  await foto(p, "34-m05-mira-el-cable");

  // ---------- M6: tu primer cable ----------
  await salirConstruir(p);
  await aceptar(p, "tu-primer-cable");
  await abrirConstruir(p);
  if (await p.evaluate(() => document.getElementById("cajon-cable")?.hidden !== false)) { await p.locator("#dock-cable").click(); await sleep(500); }
  await mirarFlecha(p, "cable-nuevo");
  await p.screenshot({ path: `${FOTOS}35-m06-flecha-nuevo.png` });
  await p.locator("#cable-nuevo").click(); await sleep(400);
  console.log("borrador", await p.evaluate(() => [...document.querySelectorAll(".cable-borrador select, .cable-borrador input")].map((s) => `${s.dataset.k}|${s.getAttribute("aria-label")}|${s.value}`).join(" ;; ")));
  await p.locator(".cable-borrador .cable-crear").click();
  await p.waitForFunction(() => globalThis.__numinia.disparadores.lista().length >= 2, null, { timeout: 8000 });
  await completa(p, "tu-primer-cable");
  const lista = await p.evaluate(() => globalThis.__numinia.disparadores.lista().map((d) => ({ id: d.id, nombre: d.nombre, tipo: d.tipo })));
  console.log("cables", JSON.stringify(lista));
  const mio = lista.find((d) => d.id !== "boton-rojo");
  await sleep(500);
  await foto(p, "35-m06-tu-primer-cable");
  const NOM = mio.nombre;
  const hueco = (k) => cableLi(p, NOM).locator(`.cable-frase [data-k^="${k}"]`).first();
  const guardar = async () => { await cableLi(p, NOM).locator(".cable-guardar-frase").click(); await sleep(900); console.log("tras guardar:", await p.evaluate((n) => { const li = [...document.querySelectorAll("#cable-lista li")].find((x) => x.textContent.includes(n)); return (li?.querySelector(".cable-error")?.textContent ?? "") + " | " + (li?.querySelector(".cable-nota")?.textContent ?? ""); }, NOM)); };
  const volcarFila = async () => console.log("fila", await p.evaluate((n) => [...document.querySelectorAll("#cable-lista li")].find((li) => li.textContent.includes(n))?.querySelectorAll(".cable-frase select, .cable-frase input, .cable-frase button") ? [...[...document.querySelectorAll("#cable-lista li")].find((li) => li.textContent.includes(n)).querySelectorAll(".cable-frase select, .cable-frase input, .cable-frase button")].map((s) => `${s.tagName}[${s.dataset.k}|${s.getAttribute("aria-label")}|${s.type}|${s.value}|${s.tagName === "SELECT" ? [...s.options].map((o) => o.value).join("/") : ""}]`).join(" ;; ") : "?", NOM));
  await volcarFila();

  // ---------- M7: cuándo = zona ----------
  await salirConstruir(p);
  await aceptar(p, "cuando-zona");
  await abrirCable(p);
  await volcarFila();
  await hueco("tipo").selectOption("zona"); await sleep(400);
  await volcarFila();
  await guardar();
  await completa(p, "cuando-zona");
  console.log("cable ahora", JSON.stringify(await p.evaluate((id) => globalThis.__numinia.disparadores.lista().find((d) => d.id === id), mio.id)));
  await foto(p, "36-m07-cuando-zona");

  // ---------- M8: espera + un solo uso ----------
  await salirConstruir(p);
  await aceptar(p, "cuanto-espera");
  await abrirCable(p);
  const espera = hueco("espera");
  const opEsp = await espera.evaluate((s) => [...s.options].map((o) => o.value));
  console.log("opciones de espera", opEsp);
  await espera.selectOption(opEsp.find((v) => Number(v) >= 5) ?? opEsp.at(-1)); await sleep(300);
  await cableLi(p, NOM).locator('.cable-frase input[type=checkbox]').first().check(); await sleep(300);
  await guardar();
  await completa(p, "cuanto-espera");
  console.log("cable ahora", JSON.stringify(await p.evaluate((id) => globalThis.__numinia.disparadores.lista().find((d) => d.id === id), mio.id)));
  await foto(p, "37-m08-cuanto-espera");

  // ---------- M9: otra acción ----------
  await salirConstruir(p);
  await aceptar(p, "varios-que");
  await abrirCable(p);
  await cableLi(p, NOM).locator(".cable-otra").click(); await sleep(400);
  await volcarFila();
  await guardar();
  await completa(p, "varios-que");
  await foto(p, "38-m09-varios-que");

  // ---------- M10: cuándo = señal ----------
  await salirConstruir(p);
  await aceptar(p, "encadena");
  await abrirCable(p);
  await hueco("tipo").selectOption("senal"); await sleep(400);
  await volcarFila();
  const campoSenal = cableLi(p, NOM).locator('.cable-frase input[data-k^="senal"]').first();
  if (await campoSenal.count()) { await campoSenal.fill("luz-del-taller"); await sleep(300); }
  await guardar();
  await completa(p, "encadena");
  console.log("cable ahora", JSON.stringify(await p.evaluate((id) => globalThis.__numinia.disparadores.lista().find((d) => d.id === id), mio.id)));
  await foto(p, "39-m10-encadena");

  // ---------- M11: tu mini-misión ----------
  await salirConstruir(p);
  await aceptar(p, "tu-mini-mision");
  paso("hablar con Lumen (enseñarle la mini-misión)", await hablar(p), { dlg: await dlg(p) });
  console.log("   dlg:", JSON.stringify(await dlg(p)));
  await p.evaluate(() => globalThis.__numinia.misiones.elegir(1)); await sleep(800);
  if (await dlg(p)) { console.log("   dlg:", JSON.stringify(await dlg(p))); await p.evaluate(() => globalThis.__numinia.misiones.adios()); }
  await completa(p, "tu-mini-mision");
  await sleep(1500);
  await p.screenshot({ path: `${FOTOS}40-m11-tu-mini-mision.png` });
  // insignia «Constructor» en el libro
  await p.mouse.move(640, 360); await p.keyboard.press("KeyJ"); await sleep(800);
  const libroTxt = await p.evaluate(() => document.getElementById("libro").innerText);
  paso("insignia «Constructor» en el libro", /Constructor/.test(libroTxt), { extracto: libroTxt.slice(-400) });
  await p.screenshot({ path: `${FOTOS}41-final.png` });
  { const lf = await libro(p); paso("al final el libro lista las 11 misiones del onboarding, hechas, y ninguna más", JSON.stringify(lf.map((m) => m.id).sort()) === JSON.stringify([...MISIONES].sort()) && lf.every((m) => m.estado === "hecha"), { libro: lf.map((m) => `${m.id}:${m.estado}`) }); }
  paso("sin errores de página", p.errores.length === 0, { errores: p.errores });
  await ctx.close();
} catch (e) { rc = 1; console.error("FALLA:", e.message); }
await browser.close();
console.log(JSON.stringify({ ok: rc === 0 }));
process.exitCode = rc; limpiar(); process.exit(rc);
