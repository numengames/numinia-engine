// e2e leg condiciones/c6: a layer goes up a version and whoever comes back sees ONLY what changed. Starts its OWN server and page (ports
// E2E_SERVER_PORT / E2E_VITE_PORT, default 8851 / 5251) on a COPY of aventuras/condiciones-prueba made in the scratch folder (the file in the
// repo is never touched): the leg changes the copy's condiciones.json and restarts the server, like a community publishing a new version.
//  0) v1.0: two people (PC 1400×900 and phone 390×844, touch) accept everything, data boxes included → they walk.
//  A) the community goes to v1.1 with ONE new norm and ONE changed (the maqueta 6): both contexts reload → «Han cambiado las normas», two
//     points tagged NUEVO / CAMBIADO (the old title struck), none of the unchanged ones, «v1.0 → v1.1», no data step, no house page → accept → they walk.
//  B) v1.2: one new norm, one removed (a line «ya no está»), a changed data point, a new data point: the norms page shows the new and the removed;
//     «Lo que tú eliges» shows only the changed and the new, EMPTY, tagged; «Entrar sin lo opcional» → the permission of the point that did not
//     change is still given, the changed one is gone, the new one was never given.
//  C) the same file again: nobody sees the bubble.
// Env: SHOTS=<folder> saves a picture of each step (PC and phone). Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8851), VP = Number(process.env.E2E_VITE_PORT ?? 5251);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-cond-c6-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); const x = { p, log: () => t, nombre }; procs.push(x); return x; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the world: a COPY of the test world, with its own data folder (what the people accepted survives the restarts of the server)
const mundo = join(tmp, "mundo"), aventura = join(mundo, "aventura");
mkdirSync(join(mundo, "entorno"), { recursive: true }); mkdirSync(join(mundo, "datos"), { recursive: true });
cpSync(join(REPO, "aventuras/condiciones-prueba"), aventura, { recursive: true });
const FICHERO = join(aventura, "condiciones.json");
const base = JSON.parse(readFileSync(FICHERO, "utf8"));
const escribir = (o) => writeFileSync(FICHERO, JSON.stringify(o, null, 2));
const clonar = (o) => JSON.parse(JSON.stringify(o));
const comunidad = (o) => o.capas.find((c) => c.capa === "comunidad");

// v1.1: one new norm and one changed (the maqueta 6)
const v11 = clonar(base); { const c = comunidad(v11); c.version = "1.1";
  c.puntos.find((p) => p.id === "fotos").titulo = "No grabes ni retransmitas a otros sin pedírselo.";
  c.puntos.splice(2, 0, { id: "viernes", titulo: "Los viernes a las 18:00 UTC la plaza es solo para el encuentro; fuera de él, quédate en la torre.", texto: "4. Los viernes. De 18:00 a 19:00 UTC la plaza se usa solo para el encuentro. Fuera de ese rato, quédate en la torre.", obligatorio: true, tipo: "norma" }); }
// v1.2: a new norm, a removed one, a changed data point, a new data point (`ia` stays as it was)
const v12 = clonar(v11); { const c = comunidad(v12); c.version = "1.2";
  c.puntos = c.puntos.filter((p) => p.id !== "pruebas");
  c.puntos.splice(2, 0, { id: "calma", titulo: "Pasadas las 23:00 UTC, habla bajito.", texto: "5. Calma. Pasadas las 23:00 UTC se pide voz baja en la plaza.", obligatorio: true, tipo: "norma" });
  c.puntos.find((p) => p.id === "avisos").texto = "Te avisamos de sus encuentros y de las novedades. Lo quitas cuando quieras.";
  c.puntos.push({ id: "sorteo", titulo: "Entrar en el sorteo mensual", texto: "Usamos tu nombre solo para el sorteo.", obligatorio: false, tipo: "datos" }); }

let servidor = null;
const encender = async () => {
  servidor = arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: join(mundo, "entorno"), DATOS_DIR: join(mundo, "datos"), SESIONES_DIR: join(mundo, "sesiones"), AVENTURA_DIR: aventura, MOTOR_SECRET: "una-clave-de-prueba-de-la-pata-c6", MOTOR_CONDICIONES_PUERTA: "" }, "servidor");
  for (let i = 0; i < 60; i++) { const r = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r?.ok) return; await sleep(300); }
  throw new Error("el servidor no arranca");
};
const apagar = async () => { const s = servidor; s.p.kill("SIGTERM"); await new Promise((r) => { if (s.p.exitCode !== null) return r(); s.p.once("exit", r); setTimeout(r, 4000); }); await sleep(300); };

await encender();
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 90; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); if (r.ok) break; } catch { /* not yet */ } await sleep(500); }
const URL_CON = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const verifica = (cond, msg) => { if (!cond) throw new Error(msg); };
const r2 = (v) => Math.round(v * 100) / 100;
let ok = false;

const abrir = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  return p;
};
const recargar = async (p) => { await p.reload(); await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 }); };
const pos = (p) => p.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, y: s.y, z: s.z }; });
// the loading screen waits for the whole world (0.59.0) and a phone takes its time under swiftshader: walk only once the world is in
const mundoListo = (p) => p.waitForFunction(() => (globalThis.__numinia.carga?.estado ?? "listo") === "listo", null, { timeout: 60000 });
// hold W until the body has gone 1.2 m (a fixed wall-clock time walks less when the machine is loaded: the step is capped per frame), at most 12 s;
// `meta` 0 = hold it for exactly `ms` (the check that someone must NOT move)
const caminar = async (p, ms = 1500, meta = 1.2) => {
  await mundoListo(p); const p0 = await pos(p); let d = 0;
  await p.keyboard.down("KeyW");
  for (let t = 0; t < (meta ? Math.max(ms, 12000) : ms) && (!meta || d < meta); t += 200) { await sleep(200); const q = await pos(p); d = Math.hypot(q.x - p0.x, q.z - p0.z); }
  await p.keyboard.up("KeyW"); await sleep(400);
  const p1 = await pos(p); return Math.hypot(p1.x - p0.x, p1.z - p0.z);
};
const foto = async (p, nombre) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${nombre}.png`) }); };
const pulsar = async (p, id) => { await p.locator(`#${id}`).click(); await sleep(250); };
const hayBurbuja = (p) => p.evaluate(() => !!document.getElementById("condiciones"));
/** What the bubble shows now: title, eyebrow, the changed points with their tags, the data boxes, the buttons. */
const ver = (p) => p.evaluate(() => {
  const r = document.getElementById("condiciones"); if (!r) return null;
  return {
    titulo: r.querySelector("h1")?.textContent, etq: r.querySelector(".cab .etq")?.textContent, paso: r.dataset.paso, movil: r.classList.contains("movil"),
    cambios: [...r.querySelectorAll(".cambio")].map((x) => ({ id: x.dataset.punto ?? null, tipo: x.dataset.cambio, texto: x.textContent })),
    permisos: [...r.querySelectorAll(".permiso")].map((x) => ({ id: x.querySelector("input")?.dataset.punto, on: x.querySelector("input")?.checked, marca: x.querySelector(".marca")?.textContent ?? null })),
    cajas: [...r.querySelectorAll("input[type=checkbox]")].map((x) => ({ id: x.id || x.dataset.punto, on: x.checked })), pasos: [...r.querySelectorAll(".paso")].map((x) => x.textContent), pasosVisibles: !r.querySelector(".pasos")?.hidden,
    botones: [...r.querySelectorAll(".pie button")].map((x) => ({ id: x.id, t: x.textContent, off: x.disabled })), pie: r.querySelector(".ver")?.textContent, cajaTexto: r.querySelector("label.acepto")?.textContent ?? null,
    desborda: document.documentElement.scrollWidth > innerWidth,
  };
});
const aceptado = async (p) => { await p.evaluate(() => globalThis.__numinia.session.pedirCondiciones()); await sleep(600); return p.evaluate(() => globalThis.__numinia.session.condiciones?.aceptado ?? null); };

try {
  const pc = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
  const gente = [{ n: "pc", ctx: pc }, { n: "movil", ctx: movil }];
  const paginas = {};

  // ---------- 0) v1.0: both accept everything, data included ----------
  for (const g of gente) {
    const p = paginas[g.n] = await abrir(g.ctx, URL_CON);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 }); await sleep(500);
    await p.locator("#condiciones-ok-casa").check(); await pulsar(p, "condiciones-siguiente");
    await p.locator("#condiciones-ok-comunidad").check(); await pulsar(p, "condiciones-siguiente");
    const v = await ver(p); verifica(v.paso === "datos" && v.permisos.length === 3, `0 ${g.n}: «Tus datos» con sus casillas ${JSON.stringify(v.permisos)}`);
    await pulsar(p, "condiciones-todo");
    await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 6000 });
    const a = await aceptado(p);
    verifica(a?.versiones?.comunidad === "1.0" && ["informe", "ia", "avisos"].every((x) => a.datos.includes(x)), `0 ${g.n}: aceptado ${JSON.stringify(a)}`);
    const d = await caminar(p, 1200); verifica(d > 0.5, `0 ${g.n}: camina (${d})`);
    nota(`0 ${g.n}: acepta v1.0 con todos los permisos de datos`, { aceptado: a, metros: r2(d) });
  }

  // ---------- A) the community goes to v1.1: one new, one changed ----------
  await apagar(); escribir(v11); await encender();
  for (const g of gente) {
    const p = paginas[g.n]; await recargar(p);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 }); await sleep(600);
    const v = await ver(p);
    verifica(v.titulo === "Han cambiado las normas", `A ${g.n}: título «${v.titulo}»`);
    verifica(v.paso === "capa" && v.cajas.length === 1 && v.cajas[0].id === "condiciones-ok-comunidad" && !v.cajas[0].on, `A ${g.n}: una sola casilla, la de la comunidad, vacía ${JSON.stringify(v.cajas)}`);
    verifica(JSON.stringify(v.cambios.map((c) => [c.id, c.tipo])) === JSON.stringify([["fotos", "cambiado"], ["viernes", "nuevo"]]), `A ${g.n}: solo lo cambiado ${JSON.stringify(v.cambios)}`);
    verifica(/CAMBIADO/.test(v.cambios[0].texto) && /No grabes ni hagas fotos a otros sin pedírselo\./.test(v.cambios[0].texto) && /No grabes ni retransmitas/.test(v.cambios[0].texto), `A ${g.n}: el cambiado enseña el título de antes y el de ahora ${v.cambios[0].texto}`);
    verifica(/NUEVO/.test(v.cambios[1].texto) && /viernes/.test(v.cambios[1].texto), `A ${g.n}: el nuevo ${v.cambios[1].texto}`);
    verifica(!/turno|pruebas|Trata bien/.test(v.cambios.map((c) => c.texto).join(" ")), `A ${g.n}: lo que no cambió no sale`);
    verifica(/v1\.0 → v1\.1/.test(v.etq) && /v1\.0 → v1\.1/.test(v.pie), `A ${g.n}: versión vieja → nueva (${v.etq} | ${v.pie})`);
    verifica(!v.pasosVisibles, `A ${g.n}: una sola página, sin contador de pasos`);
    verifica(/Acepto la versión 1\.1 de las normas de Numen Games/.test(v.cajaTexto), `A ${g.n}: casilla «${v.cajaTexto}»`);
    verifica(v.botones.some((b) => b.id === "condiciones-aceptar" && b.off), "A: «Acepto y entro» espera a la casilla");
    verifica(!v.desborda, `A ${g.n}: nada desborda`);
    const quieto = await caminar(p, 1200, 0); verifica(quieto < 0.05, `A ${g.n}: sigue dentro de la pompa (${quieto})`);
    await foto(p, `${g.n}-A1-han-cambiado`);
    await p.locator("#condiciones-ver-todo").click(); await sleep(250);
    const texto = await ver(p); verifica(/Los viernes\. De 18:00/.test(texto.cambios.map((c) => c.texto).join(" ")), "A: «Ver todo el texto» enseña el texto de lo cambiado");
    await foto(p, `${g.n}-A2-ver-todo-el-texto`);
    await p.locator("#condiciones-ver-todo").click(); await sleep(150);
    await p.locator("#condiciones-ok-comunidad").check(); await sleep(150);
    await foto(p, `${g.n}-A3-aceptada`);
    nota(`A ${g.n}: «Han cambiado las normas» con NUEVO y CAMBIADO, nada más`, { cambios: v.cambios.map((c) => c.id), etq: v.etq });
    await pulsar(p, "condiciones-aceptar");
    await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 6000 }); await sleep(400);
    const a = await aceptado(p);
    verifica(a?.versiones?.comunidad === "1.1" && a.versiones.casa === "1.0" && ["informe", "ia", "avisos"].every((x) => a.datos.includes(x)), `A ${g.n}: acepta v1.1 y los permisos de datos siguen: ${JSON.stringify(a)}`);
    const d = await caminar(p, 1500); verifica(d > 0.5, `A ${g.n}: camina (${d})`);
    nota(`A ${g.n}: acepta y camina; los permisos de datos siguen dados`, { aceptado: a });
  }

  // ---------- B) v1.2: new, removed, a changed data point, a new data point ----------
  await apagar(); escribir(v12); await encender();
  for (const g of gente) {
    const p = paginas[g.n]; await recargar(p);
    await p.waitForSelector("#condiciones .cond-panel", { timeout: 15000 }); await sleep(600);
    const v = await ver(p);
    verifica(v.titulo === "Han cambiado las normas" && v.paso === "capa", `B ${g.n}: título ${v.titulo}`);
    verifica(JSON.stringify(v.cambios.map((c) => [c.id, c.tipo])) === JSON.stringify([["calma", "nuevo"], ["pruebas", "quitado"]]), `B ${g.n}: lo nuevo y lo quitado ${JSON.stringify(v.cambios)}`);
    verifica(/ya no está/.test(v.cambios[1].texto) && /La torre es un sitio de pruebas/.test(v.cambios[1].texto), `B ${g.n}: lo quitado, en una línea «ya no está»: ${v.cambios[1].texto}`);
    verifica(v.pasosVisibles && v.pasos.length === 2, `B ${g.n}: dos pasos (la capa que cambió y «Lo que tú eliges»): ${JSON.stringify(v.pasos)}`);
    await foto(p, `${g.n}-B1-nuevo-y-quitado`);
    await p.locator("#condiciones-ok-comunidad").check(); await pulsar(p, "condiciones-siguiente");
    const d = await ver(p);
    verifica(d.paso === "datos" && JSON.stringify(d.permisos.map((x) => [x.id, x.on, x.marca])) === JSON.stringify([["avisos", false, "CAMBIADO"], ["sorteo", false, "NUEVO"]]), `B ${g.n}: «Tus datos» solo con lo cambiado y lo nuevo, vacío: ${JSON.stringify(d.permisos)}`);
    const dos = await p.evaluate(() => { const f = (id) => { const r = document.getElementById(id).getBoundingClientRect(), s = getComputedStyle(document.getElementById(id)); return { w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor }; }; return { sin: f("condiciones-sin-opcional"), todo: f("condiciones-todo") }; });
    verifica(dos.sin.w === dos.todo.w && dos.sin.h === dos.todo.h && dos.sin.bg === dos.todo.bg, `B ${g.n}: botones iguales ${JSON.stringify(dos)}`);
    await foto(p, `${g.n}-B2-datos-cambiados`);
    await pulsar(p, "condiciones-sin-opcional");
    await p.waitForFunction(() => !document.getElementById("condiciones"), null, { timeout: 6000 }); await sleep(400);
    const a = await aceptado(p);
    verifica(a?.versiones?.comunidad === "1.2" && a.datos.includes("ia") && a.datos.includes("informe") && !a.datos.includes("avisos") && !a.datos.includes("sorteo"), `B ${g.n}: ia e informe siguen, avisos (cambiado) se perdió, sorteo (nuevo) no se dio: ${JSON.stringify(a)}`);
    nota(`B ${g.n}: «Entrar sin lo opcional»: el permiso intacto sigue, el cambiado se pierde, el nuevo no se da`, { datos: a.datos });
  }

  // ---------- C) the same file: nobody sees a bubble ----------
  await apagar(); await encender();
  for (const g of gente) {
    const p = paginas[g.n]; await recargar(p); await sleep(1500);
    verifica(!(await hayBurbuja(p)), `C ${g.n}: sin burbuja con el mismo fichero`);
    const d = await caminar(p, 1200); verifica(d > 0.5, `C ${g.n}: camina (${d})`);
  }
  nota("C el mismo fichero: nadie ve la burbuja");
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  for (const x of procs) out[`registro-${x.nombre}`] = x.log().split("\n").filter((l) => /condiciones|error|Error/.test(l)).slice(-8);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  await sleep(300);
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
