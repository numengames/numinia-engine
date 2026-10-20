// e2e leg (combate h2 + PVP): the character HUD shows the real Estado and Carga, and the three kit slots work. Starts its OWN
// server and page (ports E2E_SERVER_PORT / E2E_VITE_PORT, default 8798 / 5180) on a throwaway world: entorno.json with the
// player appearing next to the default creature (24, 10) and `pvp: true`; nothing of the house's worlds is touched. Then:
//  1) The «Qué hay de nuevo» card shows the running version (and is closed). The HUD reads Estado «Estable» and Carga 0 / 100 and
//     the three slots are buttons (no «Próximamente»).
//  2) Key 3 (Discontinuidad, costs 55) with Carga 0 is REFUSED by the server and the notice says so; the Carga does not move.
//  3) Key 1 (Corte Breve, gives Carga) raises the Carga; with enough Carga key 2 (Incisión Semántica, costs 30) LOWERS it.
//  4) E2E_PVP=1 only: a second page B (same browser, second context) joins; A strikes B until Aletargado, A sees the Estado
//     labels over B (≈ Desestabilizado, ? Confundido, ‼ Colapsado, ☾ Aletargado), one picture per blow (pvp-1…4).
// Env: SHOTS=<folder> saves pictures (novedades, hud-0, hud-carga, hud, pvp-1…4). Prints JSON; exit 0 only when all is right.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
// CHROME wins; else the newest chrome-headless-shell the Playwright cache has (highest revision), whatever number it is today.
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const PVP = process.env.E2E_PVP === "1";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8798), VP = Number(process.env.E2E_VITE_PORT ?? 5180);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-lucha-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos");
mkdirSync(entorno); mkdirSync(datos);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 21, z: 10, radio: 1 }, pvp: PVP }, null, 2));

// the house creature, but coming back 1 s after it dissolves (a few Corte Breve may finish it: the leg must not depend on the dice)
writeFileSync(join(entorno, "lucha.json"), JSON.stringify({ schema: "numinia-engine/lucha@1", criaturas: [{ id: "guardian-1", especie: "guardian-crisalida", x: 24, y: 0, z: 10, reaparicion: 1 }] }));
const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, log: () => t, nombre }); return p; };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: "" }, "server");
arrancar("node", ["node_modules/vite/bin/vite.js", "--config", "apps/plaza/vite.config.mjs", "--strictPort"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const a = await ctx.newPage();
  a.on("pageerror", (e) => errors.push(String(e)));
  await a.goto(BASE);
  await a.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
  const hud = () => a.evaluate(() => ({
    estado: globalThis.__numinia.estado.actual?.() ?? null,
    carga: globalThis.__numinia.carga.actual?.() ?? null,
    hudEstado: document.querySelector("#hud-personaje .hp-estado .hp-val")?.textContent ?? null,
    hudCarga: document.querySelector("#hud-personaje")?.textContent ?? "",
    botones: [...document.querySelectorAll("#habilidades button[data-habilidad]")].map((b) => b.dataset.habilidad),
    pronto: document.querySelectorAll("#habilidades .prox").length,
    avisos: document.getElementById("avisos")?.textContent ?? "",
  }));
  const carga = () => a.evaluate(() => Math.round(globalThis.__numinia.lucha.carga()));
  const foto = async (n) => { if (SHOTS) await a.screenshot({ path: `${SHOTS}/${n}.png` }); };

  // 1) the news, then the HUD — ux2-barra: the news is a notice in the bell's history (no card over the HUD): the bell
  // counts it, opening the bell shows it whole and remembers the version
  const version = JSON.parse((await import("node:fs")).readFileSync(join(REPO, "package.json"), "utf8")).version;
  await a.waitForFunction(() => { const n = document.querySelector("#avisos-abrir .insignia-n"); return n && !n.hidden; }, null, { timeout: 8000 }).catch(() => {});
  const campana = await a.evaluate(() => ({ contador: document.querySelector("#avisos-abrir .insignia-n")?.hidden === false ? document.querySelector("#avisos-abrir .insignia-n").textContent : "", tarjeta: !!document.getElementById("novedades") }));
  await a.click("#avisos-abrir");
  await a.waitForFunction(() => document.getElementById("avisos-centro")?.open, null, { timeout: 3000 }).catch(() => {});
  const tarjeta = await a.evaluate(() => { const li = document.querySelector("#avisos-centro .aviso-novedades"); return { titulo: li?.querySelector("b")?.textContent ?? "", items: [...(li?.querySelectorAll("li") ?? [])].map((l) => l.textContent), guardada: localStorage.getItem("numinia.novedades.version") }; });
  nota("1 novedades en la campana", { ...campana, ...tarjeta });
  if (campana.tarjeta || !campana.contador || !tarjeta.titulo.includes(version) || !tarjeta.items.length || tarjeta.guardada !== version) throw new Error(`news for ${version} not in the bell: ${JSON.stringify({ campana, tarjeta })}`);
  await foto("novedades");
  await a.keyboard.press("Escape");
  await a.waitForFunction(() => globalThis.__numinia.lucha.activo(), null, { timeout: 15000 });
  await a.waitForFunction(() => document.querySelectorAll("#habilidades button[data-habilidad]").length === 3, null, { timeout: 5000 });
  await a.waitForFunction(() => document.querySelector("#hud-personaje .hp-estado .hp-val"), null, { timeout: 5000 });   // the HUD re-reads once a second
  const h1 = await hud();
  nota("1 HUD con Estado y Carga", h1);
  if (h1.hudEstado !== "Estable") throw new Error(`Estado: ${h1.hudEstado}`);
  if (!h1.carga || h1.carga.valor !== 0 || h1.carga.max !== 100 || !h1.hudCarga.includes("0 / 100")) throw new Error(`Carga: ${JSON.stringify(h1.carga)}`);
  if (h1.pronto !== 0) throw new Error("slots still say Próximamente");
  await a.mouse.click(550, 350);   // focus the canvas, never an input
  await foto("hud-0");

  // 2) Discontinuidad (55) without Carga: refused, said, Carga unchanged
  await a.keyboard.press("3");
  await a.waitForFunction(() => document.getElementById("avisos")?.textContent.trim().length > 0, null, { timeout: 4000 });
  const h2 = await hud();
  nota("2 tecla 3 sin Carga", { aviso: h2.avisos, carga: await carga() });
  if ((await carga()) !== 0) throw new Error("Carga moved on a refused ability");

  // 3) Corte Breve raises it; Incisión (30) lowers it
  let subio = 0;
  const enPie = () => a.waitForFunction(() => globalThis.__numinia.lucha.criaturas().some((c) => c.modo !== "disuelta"), null, { timeout: 6000 });
  for (const t = Date.now(); Date.now() - t < 30000 && (await carga()) < 30; ) { await enPie(); await a.keyboard.press("1"); await sleep(1100); subio++; }
  const alta = await carga();
  nota("3 tecla 1 sube la Carga", { carga: alta, pulsaciones: subio });
  if (alta < 30) throw new Error(`Carga never reached 30: ${alta}`);
  await sleep(1300);   // the HUD re-reads once a second
  await foto("hud-carga");
  await enPie(); await sleep(300);
  await a.keyboard.press("2");
  await a.waitForFunction((v) => Math.round(globalThis.__numinia.lucha.carga()) < v, alta, { timeout: 4000 });
  const baja = await carga();
  nota("3 tecla 2 baja la Carga", { antes: alta, despues: baja, hudCarga: (await hud()).hudCarga.replace(/\s+/g, " ").slice(0, 120) });
  await sleep(1300);   // the HUD re-reads once a second
  const h3 = await hud();
  if (!h3.hudCarga.includes(`${baja} / 100`)) throw new Error(`HUD bar says «${h3.hudCarga}», Carga is ${baja}`);
  await foto("hud");

  // 4) PVP labels (only with E2E_PVP=1)
  if (PVP) {
    const ctxB = await browser.newContext({ viewport: { width: 700, height: 500 } });
    const b = await ctxB.newPage();
    b.on("pageerror", (e) => errors.push(String(e)));
    await b.goto(BASE);
    await b.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
    const idB = await b.evaluate(() => globalThis.__numinia.session.entity);
    await sleep(1500);
    const vistos = [];
    for (let i = 0; i < 4; i++) {
      await a.evaluate((id) => globalThis.__numinia.lucha.golpear(`p:${id}`), idB);
      await sleep(1100);
      vistos.push(await a.evaluate((id) => globalThis.__numinia.lucha.estadoDe(id), idB));
      await foto(`pvp-${i + 1}`);
    }
    const avisoA = (await hud()).avisos;
    nota("4 PVP: golpes a B", { estadoDeB: vistos, avisoA, estadoPropioB: await b.evaluate(() => globalThis.__numinia.estado.actual?.() ?? null) });
    if (!vistos.some((v) => v !== "ninguno")) throw new Error(`no Estado heard over B: ${JSON.stringify(vistos)} ${avisoA}`);
    await ctxB.close();
  }
  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").filter((l) => l.includes("lucha") || l.includes("mundo")).slice(-12);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch { /* gone */ } }
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
