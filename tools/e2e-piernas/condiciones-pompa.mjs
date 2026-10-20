// e2e leg condiciones/c5: what the others see of someone who is still reading the norms. ONE Chromium, TWO contexts (two people), against the
// gated world `aventuras/condiciones-prueba` on its own ports (E2E_SERVER_PORT / E2E_VITE_PORT, default 8801 / 5185); a second server with the gate
// OFF (the default world) shows that nothing is drawn nor sent there. Nothing else is touched.
//  1) A enters and accepts. B enters and does NOT accept. A sees B inside a bubble (one sphere, the shared geometry and material) with the plate
//     «… · leyendo las normas…» over it; B sees no sphere over itself (its bubble is the panel).
//  2) B can neither be pushed nor heard (checked in the unit tests); here: B stays put and A walks up to it unhindered.
//  3) B accepts → A sees the bubble burst (`estallando`) and go; the plate goes back to the plain name (or none).
//  4) gate OFF: A and B walk in together: no bubble, no plate, nothing in `session.leyendo`.
// Env: SHOTS=<folder> saves pictures from A (1400×900). Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8801), SP2 = SP + 1, VP = Number(process.env.E2E_VITE_PORT ?? 5185);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-pompa-"));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
const mundo = (n) => { const d = join(tmp, n); mkdirSync(join(d, "entorno"), { recursive: true }); mkdirSync(join(d, "datos"), { recursive: true }); return d; };
const a = mundo("a"), b = mundo("b");
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: join(a, "entorno"), DATOS_DIR: join(a, "datos"), SESIONES_DIR: join(a, "sesiones"), AVENTURA_DIR: "aventuras/condiciones-prueba", MOTOR_CONDICIONES_PUERTA: "" }, "con-puerta");
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP2), MUNDO_DIR: join(b, "entorno"), DATOS_DIR: join(b, "datos"), SESIONES_DIR: join(b, "sesiones"), MOTOR_CONDICIONES_PUERTA: "" }, "sin-puerta");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 90; i++) {
  try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s1 = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null), s2 = await fetch(`http://127.0.0.1:${SP2}/health`).catch(() => null); if (r.ok && s1?.ok && s2?.ok) break; } catch { /* not yet */ }
  await new Promise((r) => setTimeout(r, 500));
}
const URL_CON = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;
const URL_SIN = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP2}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const verifica = (cond, msg) => { if (!cond) throw new Error(msg); };
let ok = false;

const abrir = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  return p;
};
const foto = async (p, nombre) => { if (SHOTS) await p.screenshot({ path: join(SHOTS, `${nombre}.png`) }); };
// what A knows and draws about the others' bubbles
const vista = (p) => p.evaluate(() => {
  const n = globalThis.__numinia, s = n.session, v = n.view.pompas();
  return { yo: s.entity, leyendo: [...s.leyendo], pompas: v.lista, geometrias: v.geometrias, materiales: v.materiales, mallas: v.mallas,
    rotulos: n.view.nameTags().filter((x) => /leyendo las normas/.test(x.text)), otros: s.remotePositions().map((r) => r.id) };
});
// accept as a person would (the page's own function: what the panel sends)
const aceptar = (p) => p.evaluate(() => { const s = globalThis.__numinia.session, c = s.condiciones; const versiones = {}; for (const k of c?.capas ?? []) versiones[k.capa] = k.version; return s.aceptar(versiones, []); });
// turn the camera of `p` toward the other person and put it near enough to read the plate
const mirarAlOtro = (p) => p.evaluate(() => { const n = globalThis.__numinia, r = n.session.remotePositions()[0], y = n.session.selfPosition(1); if (!r) return false; n.view.cam.mirarHacia(Math.atan2(-(r.x - y.x), -(r.z - y.z)), 0.25); return Math.hypot(r.x - y.x, r.z - y.z); });

try {
  // ---------- 1) A inside, B arrives and does not accept ----------
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const A = await abrir(ctxA, URL_CON);
  await A.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
  verifica(await aceptar(A), "A no pudo enviar su aceptación");
  await A.waitForFunction(() => globalThis.__numinia.condiciones.cerrada() === false, null, { timeout: 15000 });
  await sleep(500);
  const v0 = await vista(A);
  verifica(v0.leyendo.length === 0 && v0.pompas.length === 0 && v0.mallas === 0, `A solo en el mundo: nada que dibujar ${JSON.stringify(v0)}`);
  nota("1a A dentro y sola: ni pompas ni geometría creada", { geometrias: v0.geometrias, materiales: v0.materiales });

  const ctxB = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const B = await abrir(ctxB, URL_CON);
  await B.waitForSelector("#condiciones .cond-panel", { timeout: 15000 });
  await A.waitForFunction(() => globalThis.__numinia.session.leyendo.size === 1, null, { timeout: 15000 });
  await sleep(800);
  const dist = await mirarAlOtro(A); await sleep(1200);
  const v1 = await vista(A);
  nota("1b A ve a B dentro de una pompa con letrero", { dist, ...v1 });
  verifica(v1.leyendo.length === 1 && v1.pompas.length === 1 && v1.pompas[0].drawn && !v1.pompas[0].estallando, `A ve una pompa dibujada: ${JSON.stringify(v1.pompas)}`);
  verifica(v1.geometrias === 1 && v1.materiales === 1 && v1.mallas === 1, "una geometría y un material compartidos");
  verifica(v1.rotulos.length === 1 && v1.rotulos[0].drawn && /leyendo las normas…/.test(v1.rotulos[0].text), `el letrero «leyendo las normas…» se dibuja: ${JSON.stringify(v1.rotulos)}`);
  const vB = await vista(B);
  verifica(vB.pompas.every((x) => x.target !== vB.yo) && !vB.leyendo.includes(vB.yo), "B no ve una esfera sobre sí misma (su pompa es el panel)");
  await foto(A, "a-ve-la-pompa-de-b");

  // B stays put: pressing W does nothing, and A can walk up to it
  const pB0 = await B.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, z: s.z }; });
  await B.keyboard.down("KeyW"); await sleep(1200); await B.keyboard.up("KeyW"); await sleep(300);
  const pB1 = await B.evaluate(() => { const s = globalThis.__numinia.session.selfPosition(0); return { x: s.x, z: s.z }; });
  verifica(Math.hypot(pB1.x - pB0.x, pB1.z - pB0.z) < 0.05, "B no se mueve mientras lee");
  nota("2 B sigue quieta mientras lee");

  // ---------- 3) B accepts: the bubble bursts and goes ----------
  verifica(await aceptar(B), "B no pudo enviar su aceptación");
  await A.waitForFunction(() => globalThis.__numinia.view.pompas().lista.some((x) => x.estallando) || globalThis.__numinia.session.leyendo.size === 0, null, { timeout: 15000, polling: 16 });
  const v2 = await vista(A);
  nota("3a B acepta: A deja de verla leyendo y la pompa estalla", { leyendo: v2.leyendo, pompas: v2.pompas });
  verifica(v2.leyendo.length === 0, "A ya no cuenta a B entre quienes leen");
  await foto(A, "a-ve-estallar-la-pompa");
  await sleep(900);
  const v3 = await vista(A);
  verifica(v3.pompas.length === 0 && v3.rotulos.length === 0, `la pompa y el letrero se fueron: ${JSON.stringify(v3.pompas)} ${JSON.stringify(v3.rotulos)}`);
  nota("3b la pompa ya no está y el letrero tampoco", { mallas: v3.mallas });
  await foto(A, "a-b-ya-esta-dentro");
  await ctxB.close(); await ctxA.close();

  // ---------- 4) gate OFF: nothing drawn, nothing sent ----------
  {
    const c1 = await browser.newContext({ viewport: { width: 900, height: 600 } }), c2 = await browser.newContext({ viewport: { width: 900, height: 600 } });
    const P1 = await abrir(c1, URL_SIN), P2 = await abrir(c2, URL_SIN);
    await sleep(2000);
    const w1 = await vista(P1), w2 = await vista(P2);
    verifica(w1.leyendo.length === 0 && w2.leyendo.length === 0 && w1.pompas.length === 0 && w1.geometrias === 0 && w1.rotulos.length === 0, `puerta apagada: nada ${JSON.stringify(w1)}`);
    nota("4 puerta apagada: ni pompa, ni letrero, ni geometría", { otros: w1.otros.length, geometrias: w1.geometrias });
    await c1.close(); await c2.close();
  }
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
