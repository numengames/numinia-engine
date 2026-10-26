// e2e leg (lote 8 mesa, t_95245cf0 story 1): 3D dice falling into a tower's tray. Starts its OWN server and page (ports
// E2E_SERVER_PORT / E2E_VITE_PORT, default 8804 / 5184) on a throwaway world with one dice tower (dados.json: 3d6, a tray
// 0.4 m in front of it, 0.9 m up, 0.8 × 0.6 m). Two tabs (A and B) stand near it. A rolls 3d6 at the tower, then:
//  1) both pages draw 3 dice (view.dados.contar(), read back from the real meshes), not at rest at first (they fall);
//  2) within ~4 s all are at rest, inside the tray, above its floor, and the face UP of each reads the value the SERVER rolled
//     (the same on A and B, and the same as the card's «valores»);
//  3) the next roll replaces the first (still 3 dice, a new roll number) and lands face-up right again; a roll of 1d100
//     draws nothing (no model yet: story 3) but the card still says it.
// Env: SHOTS=<folder> saves pictures. Prints JSON; exit 0 only when all is right. Run under the PC's browser flock.
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = new URL("../../", import.meta.url).pathname;
const PW = process.env.PW_CORE ?? join(REPO, "node_modules/playwright-core");
const CACHE = "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const nuevo = () => { try { return readdirSync(CACHE).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])).map((d) => join(CACHE, d, "chrome-headless-shell-linux64/chrome-headless-shell")).find((p) => existsSync(p)); } catch { return undefined; } };
const CHROME = process.env.CHROME ?? nuevo() ?? "";
const SHOTS = process.env.SHOTS ?? "";
const SP = Number(process.env.E2E_SERVER_PORT ?? 8804), VP = Number(process.env.E2E_VITE_PORT ?? 5184);
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= CACHE;
const { chromium } = createRequire(import.meta.url)(PW);

const tmp = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "e2e-dados3d-"));
const entorno = join(tmp, "entorno"), datos = join(tmp, "datos");
mkdirSync(entorno); mkdirSync(datos);
writeFileSync(join(entorno, "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }));
writeFileSync(join(entorno, "dados.json"), JSON.stringify({ schema: "numinia-engine/dados@1", torres: [{ id: "torre", nombre: "Torre de pruebas", x: 0, y: 0, z: 0, radio: 6, dados: "3d6", bandeja: { dx: 0, dz: 0.4, alto: 0.9, ancho: 0.8, fondo: 0.6 } }] }));
const BANDEJA = { x: 0, y: 0.9, z: 0.4, ancho: 0.8, fondo: 0.6 };

const procs = [];
const arrancar = (cmd, args, env, nombre) => { const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let t = ""; p.stdout.on("data", (d) => { t += d; }); p.stderr.on("data", (d) => { t += d; }); procs.push({ p, nombre, log: () => t }); };
arrancar("node", ["packages/server/src/main.ts"], { PORT: String(SP), MUNDO_DIR: entorno, DATOS_DIR: datos, SESIONES_DIR: join(tmp, "sesiones"), AVENTURA_DIR: "" }, "server");
arrancar("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], { PLAZA_PORT: String(VP) }, "vite");
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${VP}/`); const s = await fetch(`http://127.0.0.1:${SP}/health`).catch(() => null); if (r.ok && s?.ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }
const BASE = `http://127.0.0.1:${VP}/?webgl2&server=ws://127.0.0.1:${SP}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now(), out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const abrir = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error" || /\[dados\]/.test(m.text())) errors.push(`console: ${m.text()}`); });
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 40000 });
    return p;
  };
  const a = await abrir(), b = await abrir();
  for (const p of [a, b]) await p.waitForFunction(() => globalThis.__numinia.dados.torres().length === 1, null, { timeout: 15000 });
  const dibujados = (p) => p.evaluate(() => globalThis.__numinia.view.dados.contar());
  const tapete = async (p, n) => { await p.waitForFunction((n) => globalThis.__numinia.dados.ultima()?.n >= n, n, { timeout: 8000 }); };
  // a watcher in each page from the start: the fall is short and the machine slow, so "were they falling?" is asked of what the page saw, not of one sample
  for (const p of [a, b]) await p.evaluate(() => { globalThis.__vigia = { vistos: 0, cayendo: 0, altoMax: 0 }; setInterval(() => { for (const v of globalThis.__numinia.view.dados.contar()) if (v.n === (globalThis.__vigia.n ?? v.n)) for (const d of v.dados) { globalThis.__vigia.vistos++; if (!d.quieto) globalThis.__vigia.cayendo++; globalThis.__vigia.altoMax = Math.max(globalThis.__vigia.altoMax, d.y); } }, 16); });
  const comprobar = async (n, etiqueta) => {
    await Promise.all([tapete(a, n), tapete(b, n)]);
    const va = await a.evaluate(() => globalThis.__numinia.dados.ultima().valores), vb = await b.evaluate(() => globalThis.__numinia.dados.ultima().valores);
    if (JSON.stringify(va) !== JSON.stringify(vb)) throw new Error(`${etiqueta}: A and B heard different values ${va} / ${vb}`);
    await Promise.all([a, b].map((p) => p.waitForFunction((n) => { const v = globalThis.__numinia.view.dados.contar(); return v.length === 1 && v[0].n === n && v[0].dados.length === 3; }, n, { timeout: 15000 })));
    const vigia = await a.evaluate(() => globalThis.__vigia);
    const cayendo = vigia.cayendo > 0 && vigia.altoMax > BANDEJA.y + 0.3;
    await Promise.all([a, b].map((p) => p.waitForFunction(() => { const v = globalThis.__numinia.view.dados.contar(); return v.length === 1 && v[0].dados.every((d) => d.quieto); }, null, { timeout: 20000 })));
    const [fa, fb] = [await dibujados(a), await dibujados(b)];
    for (const [quien, f] of [["A", fa], ["B", fb]]) {
      const d = f[0].dados;
      if (JSON.stringify(d.map((x) => x.valor)) !== JSON.stringify(va)) throw new Error(`${etiqueta} ${quien}: drawn values ${d.map((x) => x.valor)} ≠ rolled ${va}`);
      d.forEach((x, i) => {
        if (x.arriba !== x.valor) throw new Error(`${etiqueta} ${quien} die ${i}: face up reads ${x.arriba}, the server rolled ${x.valor}`);
        if (!(Math.abs(x.x - BANDEJA.x) <= BANDEJA.ancho / 2 && Math.abs(x.z - BANDEJA.z) <= BANDEJA.fondo / 2 && x.y > BANDEJA.y && x.y < BANDEJA.y + 0.2)) throw new Error(`${etiqueta} ${quien} die ${i} not on the tray: ${JSON.stringify(x)}`);
      });
    }
    if (JSON.stringify(fa[0].dados.map((d) => [d.x, d.y, d.z])) !== JSON.stringify(fb[0].dados.map((d) => [d.x, d.y, d.z]))) throw new Error(`${etiqueta}: the dice rest in different places on A and B`);
    nota(etiqueta, { n, valores: va, cayendo, vigia, enReposo: fa[0].dados.map((d) => [Math.round(d.x * 100) / 100, Math.round(d.y * 100) / 100, Math.round(d.z * 100) / 100]) });
    return { cayendo };
  };

  await a.bringToFront();
  const r1 = await a.evaluate(() => globalThis.__numinia.dados.tirar("3d6", "torre"));
  if (!r1.ok) throw new Error(`roll refused: ${r1.why}`);
  const p1 = await comprobar(1, "1 first roll falls and lies face up");
  if (!p1.cayendo) throw new Error("the dice were already at rest when first seen: nothing fell");
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/dados-3d-1.png` });

  for (const p of [a, b]) await p.evaluate(() => { globalThis.__vigia = { vistos: 0, cayendo: 0, altoMax: 0 }; });
  const r2 = await a.evaluate(() => globalThis.__numinia.dados.tirar("3d6", "torre"));
  if (!r2.ok) throw new Error(`2nd roll refused: ${r2.why}`);
  const p2 = await comprobar(2, "2 the next roll replaces it and lands face up");
  if (!p2.cayendo) throw new Error("the second roll was not seen falling");
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/dados-3d-2.png` });

  const r3 = await a.evaluate(() => globalThis.__numinia.dados.tirar("1d100", "torre"));
  if (!r3.ok) throw new Error(`d100 refused: ${r3.why}`);
  await a.waitForFunction(() => globalThis.__numinia.dados.ultima()?.n >= 3, null, { timeout: 8000 });
  await sleep(500);
  const d100 = await dibujados(a); const t100 = await a.evaluate(() => globalThis.__numinia.dados.ultima());
  nota("3 a d100 is told by the card, not drawn", { dibujados: d100.map((v) => [v.n, v.dados.length]), valores: t100.valores });
  if (t100.valores.length !== 1) throw new Error("d100 not heard");
  if (d100.some((v) => v.n === 3)) throw new Error("a d100 was drawn: it has no model yet");

  ok = errors.length === 0;
} catch (e) {
  out.fallo = String(e?.stack ?? e);
  out.servidor = procs.find((p) => p.nombre === "server")?.log().split("\n").filter((l) => l.includes("dados") || l.includes("mundo")).slice(-12);
} finally {
  await browser.close().catch(() => {});
  for (const { p } of procs) p.kill("SIGTERM");
  rmSync(tmp, { recursive: true, force: true });
}
out.ok = ok;
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
