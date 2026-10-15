// e2e leg «entorno» (H4 + H8 + H12): two tabs in chromium and in firefox. A builder in tab A switches the environment
// preset → tab B's render state changes (view.entorno.estado(): background, fog, sun); A places water and fire → B draws
// them (counts, particles, fire light); the cost per frame is measured on A for each device tier (simulated: defaults,
// caps, sky mode); no page errors. Everything is left as it was found (environment values restored, elements removed).
// Gets BASE and SERVER_HTTP from tools/auto.sh (tools/e2e-piernas/README.md). Prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
};
const motores = (process.env.BROWSERS ?? "chromium,firefox").split(",");

async function pierna(motor) {
  const browser = await launchers[motor]();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.ambiente?.valores(), null, { timeout: 30000 });
    return p;
  };
  const out = { motor, ok: false };
  let a, b, antes = null, ids = [], claves0 = null;
  try {
    a = await open(); b = await open();
    const estadoB = () => b.evaluate(() => globalThis.__numinia.view.entorno.estado());
    const cuenta = (p) => p.evaluate(() => globalThis.__numinia.view.elementos.contar());
    out.catalogo = await a.evaluate(() => globalThis.__numinia.session.features.catalog?.features.map((f) => f.id) ?? []);
    await a.waitForFunction(() => globalThis.__numinia.ambiente.estado.puede || globalThis.__numinia.session.features.catalog, null, { timeout: 5000 });
    out.puede = await a.evaluate(() => globalThis.__numinia.ambiente.estado.puede);
    antes = await a.evaluate(() => ({ ...globalThis.__numinia.ambiente.valores() }));
    const e0 = await estadoB();
    out.costeInicioA = await a.evaluate(() => globalThis.__numinia.cost());
    if (!out.puede) {
      // building closed: refused, and said why
      await a.evaluate(() => globalThis.__numinia.ambiente.preset("noche"));
      await a.waitForTimeout(800);
      out.rechazo = await a.evaluate(() => globalThis.__numinia.ambiente.estado.ultimoRechazo);
      out.ok = /construir/.test(out.rechazo) && (await estadoB()).preset === e0.preset;
    } else {
      // 1) A switches the preset; B's render state follows
      const objetivo = antes.preset === "noche" ? "atardecer" : "noche";
      await a.evaluate((n) => globalThis.__numinia.ambiente.preset(n), objetivo);
      await b.bringToFront(); // a page in the background stops its loop (and its messages) in headless chromium
      await b.waitForFunction((n) => globalThis.__numinia.view.entorno.estado().preset === n, objetivo, { timeout: 8000 });
      await b.waitForTimeout(600);
      const e1 = await estadoB();
      out.entornoB = { antes: { preset: e0.preset, fondo: e0.fondo, niebla: e0.niebla?.color, sol: e0.sol.altura }, despues: { preset: e1.preset, fondo: e1.fondo, niebla: e1.niebla?.color, sol: e1.sol.altura, modoCielo: e1.modoCielo } };
      const cambio = e1.preset === objetivo && (e1.fondo !== e0.fondo || e1.niebla?.color !== e0.niebla?.color) && e1.sol.altura !== e0.sol.altura;
      // 2) A places water and fire in front of itself; B draws them (a tab in the background stops its loop: front it)
      const c0 = await cuenta(b);
      claves0 = await a.evaluate(() => [...globalThis.__numinia.session.features.stateOf("elementos").keys()]);
      await a.bringToFront();
      const poner = async (tipo, dx, dz) => {
        const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("elementos").size);
        await a.evaluate(([t, x, z]) => { const e = globalThis.__numinia.elementos, h = e.aqui(); return e.poner(t, { x: h.x + x, z: h.z + z }); }, [tipo, dx, dz]);
        await a.waitForFunction((n) => globalThis.__numinia.session.features.stateOf("elementos").size > n && !!globalThis.__numinia.elementos.estado.seleccionado, n0, { timeout: 8000 });
        ids.push(await a.evaluate(() => globalThis.__numinia.elementos.estado.seleccionado));
      };
      await poner("agua", -2, -6);
      await poner("fuego", 2.5, -4);
      await b.bringToFront();
      await b.waitForFunction(([ag, fu]) => { const c = globalThis.__numinia.view.elementos.contar(); return c.agua > ag && c.fuego > fu; }, [c0.agua, c0.fuego], { timeout: 15000 });
      await b.waitForTimeout(800);
      const c1 = await cuenta(b);
      out.elementosB = { antes: c0, despues: c1 };
      const dibujados = c1.agua === c0.agua + 1 && c1.fuego === c0.fuego + 1 && c1.particulas > c0.particulas;
      const fichas = await b.evaluate((ks) => globalThis.__numinia.session.features.cards().filter((c) => ks.includes(c.key)).map((c) => c.name).sort(), ids);
      out.fichasB = fichas;
      // 3) cost per frame on A for each tier (A looks at what it placed, under the day sky); then back to this device
      await a.bringToFront();
      await a.evaluate(() => globalThis.__numinia.ambiente.preset("día"));
      await a.waitForFunction(() => globalThis.__numinia.view.entorno.estado().preset === "día", null, { timeout: 8000 });
      out.coste = {};
      for (const nivel of ["A", "B", "C", "D"]) {
        await a.evaluate((n) => globalThis.__numinia.view.entorno.simularNivel(n), nivel);
        await a.keyboard.down("KeyS"); await a.waitForTimeout(120); await a.keyboard.up("KeyS"); // a frame with movement
        await a.waitForTimeout(1500);
        out.coste[nivel] = await a.evaluate(() => { const n = globalThis.__numinia; const e = n.view.entorno.estado(); return { ...n.cost(), particulas: n.view.elementos.contar().particulas, luces: n.view.elementos.contar().luces, reflejos: n.view.elementos.contar().reflejos, sombras: e.sol.sombras, cielo: e.modoCielo, luzEntorno: e.luzEntorno, calidad: e.calidad }; });
      }
      await a.evaluate(() => globalThis.__numinia.view.entorno.simularNivel(null));
      const nivelesOk = out.coste.D.particulas <= 500 && out.coste.C.sombras === false && out.coste.A.cielo === "vivo" && out.coste.C.cielo === "horneado" && out.coste.D.luces === 0;
      // 4) leave the world as it was: remove the elements, put back the exact environment
      for (const id of ids) { await a.evaluate((k) => globalThis.__numinia.elementos.quitar(k), id); await a.waitForTimeout(150); }
      await a.evaluate((v) => globalThis.__numinia.ambiente.poner(v), antes);
      await b.bringToFront();
      await b.waitForFunction(([p, ks]) => globalThis.__numinia.view.entorno.estado().preset === p && !ks.some((k) => globalThis.__numinia.session.features.stateOf("elementos").has(k)), [antes.preset, ids], { timeout: 8000 });
      const c2 = await cuenta(b);
      out.alFinalB = { preset: (await estadoB()).preset, agua: c2.agua, fuego: c2.fuego };
      ids = [];
      out.checks = { cambio, dibujados, fichas: fichas.includes("Estanque") && fichas.includes("Hoguera"), nivelesOk, limpio: c2.agua === c0.agua && c2.fuego === c0.fuego };
      out.ok = Object.values(out.checks).every(Boolean);
    }
  } catch (e) {
    out.error = String(e).split("\n")[0];
    try { // best effort: never leave things behind
      const sobran = claves0 ? await a.evaluate((k0) => [...globalThis.__numinia.session.features.stateOf("elementos").keys()].filter((k) => !k0.includes(k)), claves0) : ids;
      for (const id of new Set([...ids, ...sobran])) await a?.evaluate((k) => globalThis.__numinia.elementos.quitar(k), id);
      if (antes) await a?.evaluate((v) => globalThis.__numinia.ambiente.poner(v), antes);
      await a?.waitForTimeout(500);
    } catch { /* the browser may be gone */ }
  }
  out.errors = errors;
  out.ok = out.ok && errors.length === 0 && (out.catalogo ?? []).includes("entorno") && out.catalogo.includes("elementos");
  await browser.close();
  return out;
}

const resultados = [];
for (const m of motores) resultados.push(await pierna(m));
console.log(JSON.stringify(resultados, null, 1));
const ok = resultados.every((r) => r.ok);
console.log(ok ? "E2E ENTORNO OK" : "E2E ENTORNO FALLA");
process.exit(ok ? 0 : 1);
