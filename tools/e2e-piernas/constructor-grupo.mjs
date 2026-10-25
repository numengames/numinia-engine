// e2e leg lote4 (constructor): two blocks snap together, and three selected blocks turn/scale as one and undo in ONE step.
// Chromium only; real mouse and keyboard, two tabs (A builds, B watches the server's state).
//  1. A opens build mode (C), places three Bloques 3 m ahead through the page API (a row, 3 m apart, gaps wide enough).
//  2. RUBBER BAND: Shift + drag on the empty world around all three → estado.seleccionados has the three (A) and the
//     blue band div is drawn while dragging and gone after.
//  3. SNAP GUIDE + SNAP: A selects the left block alone, tool «mover», axis X, drags its red arrow towards the middle one.
//     Mid-drag, when the gap is between 25 cm and 60 cm, the editor reports a guide (guia.encaja false, falta in range);
//     letting go closer than 25 cm, the faces touch exactly (B sees the two blocks with zero gap).
//  4. GROUP TURN: A selects the three again (band), tool «girar», drags the Y ring: B sees all three with the SAME new
//     ry, and the two outer ones have orbited around the group's centre (they are no longer on a line parallel to X).
//  5. GROUP SCALE: tool «escalar», drag the uniform handle (centre): B sees every scale grown by the same ratio.
//  6. ONE Ctrl+Z per action: scale → turn → (snap move) each bring ALL the affected blocks back at once in B; Ctrl+Y redoes.
//  7. Cleanup: the three are deleted (Delete, one step) and B sees the world as it was found.
// Env: BASE, SERVER_HTTP (tools/auto.sh e2e), SHOTS=<dir> screenshots of the band / guide / group-turn.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? (await import("node:fs")).globSync("/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell")[0];
const BASE0 = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const BASE = BASE0 + (BASE0.includes("?") ? "&" : "?") + "pulso=2000";
if (!existsSync(PW) || !CHROME || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const SHOTS = process.env.SHOTS && process.env.SHOTS !== "1" ? process.env.SHOTS : "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const proyectar = (p, w) => p.evaluate(([x, y, z]) => globalThis.__numinia.view.editor.pantalla(x, y, z), w);
async function buscarAsa(p, axis, pts) {
  for (const w of pts) {
    const s = await proyectar(p, w);
    if (!s) continue;
    await p.mouse.move(s.x, s.y);
    if ((await p.evaluate(() => globalThis.__numinia.view.editor.estado().ejeBajo)) === axis) return s;
  }
  return null;
}
/** Press at `from`, move in `n` steps by (dx, dy), `alMedio(i)` called after each step, release. */
async function arrastrar(p, from, dx, dy, n = 10, alMedio = null) {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= n; i++) {
    await p.mouse.move(from.x + (dx * i) / n, from.y + (dy * i) / n);
    await p.waitForTimeout(60);
    if (alMedio) await alMedio(i);
  }
  await p.mouse.up();
}

async function pierna() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version);
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && globalThis.__numinia.constructor.estado.puede, null, { timeout: 30000 });
    return p;
  };
  const r = { engine: "chromium", ok: false, pasos: [] };
  const paso = (nombre, ok, datos = {}) => { r.pasos.push({ paso: nombre, ok, ...datos }); if (!ok) throw new Error(`${nombre}: ${JSON.stringify(datos)}`); };
  let a, b, ids = [];
  const deB = (k) => b.evaluate((k) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return o ? { x: o.x, y: o.y, z: o.z, ry: o.ry, sx: o.sx, sy: o.sy, sz: o.sz } : null; }, k);
  const todosB = () => Promise.all(ids.map(deB));
  const esperaB = (fn, arg) => b.waitForFunction(fn, arg, { timeout: 8000 }).then(() => true, () => false);
  const cerca = (x, y, t = 0.02) => Math.abs(x - y) <= t;
  const seleccion = () => a.evaluate(() => [...globalThis.__numinia.constructor.estado.seleccionados]);
  const foto = (nombre) => SHOTS ? a.screenshot({ path: `${SHOTS}/${nombre}.png` }) : null;
  /** Shift + drag on the empty world around the screen points `pts` (a margin of 45 px all round). */
  async function banda(pts, mid = null) {
    const x0 = Math.min(...pts.map((p) => p.x)) - 45, y0 = Math.min(...pts.map((p) => p.y)) - 45;
    const x1 = Math.max(...pts.map((p) => p.x)) + 45, y1 = Math.max(...pts.map((p) => p.y)) + 45;
    await a.keyboard.down("Shift");
    await arrastrar(a, { x: x0, y: y0 }, x1 - x0, y1 - y0, 8, async (i) => { if (i === 5 && mid) await mid(); });
    await a.keyboard.up("Shift");
  }
  try {
    a = await open(); b = await open();
    await a.bringToFront();
    // 1. build mode, three blocks in a row 3 m ahead (camera looks to -z): left, middle, right, 3 m centre to centre
    await a.mouse.move(550, 150);
    await a.keyboard.press("KeyC");
    paso("abrir con C", await a.waitForFunction(() => !document.getElementById("panel-construir").hidden && globalThis.__numinia.view.editor.estado().cargado, null, { timeout: 10000 }).then(() => true, () => false));
    const n0 = await a.evaluate(() => globalThis.__numinia.session.features.stateOf("objetos").size);
    for (const dx of [-3, 0, 3]) {
      await a.evaluate((dx) => { const n = globalThis.__numinia, me = n.session.selfPosition(1); n.constructor.colocarEn("bloque", { x: Math.round(me.x) + dx, y: 0, z: Math.round(me.z) - 5 }); }, dx);
      await a.waitForFunction((n) => globalThis.__numinia.session.features.stateOf("objetos").size > n, n0 + (dx + 3) / 3, { timeout: 5000 });
      ids.push(await a.evaluate(() => globalThis.__numinia.constructor.estado.seleccionado));
    }
    paso("tres bloques colocados (y B los ve)", ids.length === 3 && new Set(ids).size === 3 && await esperaB((ks) => ks.every((k) => globalThis.__numinia.session.features.stateOf("objetos").has(k)), ids), { ids });
    const o0 = await todosB();
    const ancho = await a.evaluate((k) => { const c = globalThis.__numinia.view.editor.cajaPropia(k); return c ? (c[3] - c[0]) * globalThis.__numinia.view.editor.dondeEsta(k).sx : null; }, ids[0]);
    paso("el bloque se mide", ancho > 0.1, { ancho });
    await a.evaluate(() => globalThis.__numinia.constructor.seleccionar(null)); // clear
    await a.waitForTimeout(300);
    const pts = await Promise.all(ids.map((k) => a.evaluate((k) => { const e = globalThis.__numinia.view.editor, d = e.dondeEsta(k); return e.pantalla(d.x, d.y + 0.5, d.z); }, k)));
    paso("los tres están en pantalla", pts.every((p) => p && p.x > 60 && p.x < 1040 && p.y > 60 && p.y < 560), { pts });

    // 2. the rubber band
    let visibleMid = false;
    await banda(pts, async () => { visibleMid = await a.evaluate(() => { const d = document.querySelector(".banda-seleccion"); return !!d && getComputedStyle(d).display === "block" && d.getBoundingClientRect().width > 50; }); await foto("1-rectangulo-seleccion"); });
    await a.waitForTimeout(250);
    const s1 = await seleccion();
    const sinBanda = await a.evaluate(() => !document.querySelector(".banda-seleccion"));
    paso("Mayús + arrastrar dibuja el rectángulo y selecciona los tres", visibleMid && sinBanda && s1.length === 3 && ids.every((k) => s1.includes(k)), { visibleMid, sinBanda, s1 });
    // a band over nothing keeps the selection (Shift adds) and a plain click on the ground still clears it
    await a.keyboard.down("Shift"); await arrastrar(a, { x: 1000, y: 600 }, 60, 40); await a.keyboard.up("Shift");
    paso("un rectángulo vacío no quita nada", (await seleccion()).length === 3);
    await a.evaluate(() => globalThis.__numinia.constructor.seleccionar(null));

    // 3. the snap guide and the snap: the left block alone, tool mover, axis X, drag the red arrow towards the middle one
    await a.evaluate((k) => { globalThis.__numinia.constructor.seleccionar(k); }, ids[0]);
    await a.keyboard.press("Digit2");
    await a.keyboard.press("KeyX");
    await a.waitForFunction(() => { const e = globalThis.__numinia.view.editor.estado(); return e.herramienta === "mover" && e.eje === "X"; }, null, { timeout: 3000 });
    await a.waitForTimeout(300);
    // the left block centre is 3 m from the middle one: faces touch after moving (3 - ancho) m; the guide starts 0.6 m before
    const falta = 3 - ancho;
    const flecha = [];
    for (let t = 0.2; t <= 4; t += 0.1) flecha.push([o0[0].x + t, o0[0].y, o0[0].z]);
    const asaX = await buscarAsa(a, "X", flecha);
    paso("asa X bajo el ratón", !!asaX, { asaX });
    // pixels per metre at the block, to aim the stops
    const pxm = await a.evaluate(([x, y, z]) => { const e = globalThis.__numinia.view.editor, p0 = e.pantalla(x, y, z), p1 = e.pantalla(x + 1, y, z); return p1.x - p0.x; }, [o0[0].x, o0[0].y, o0[0].z]);
    paso("escala en pantalla", pxm > 8, { pxm });
    const guias = [];
    await a.mouse.move(asaX.x, asaX.y); await a.mouse.down();
    // walk until ~0.5 m short of touching (the gizmo moves in 0.5 m steps: inside the guide's 0.6 m, outside the snap's 0.25 m), sample the guide, then one more step
    const pasos = Math.round(((falta - 0.45) * pxm) / 6);
    for (let i = 1; i <= pasos; i++) { await a.mouse.move(asaX.x + i * 6, asaX.y); await a.waitForTimeout(25); }
    await a.waitForTimeout(250);
    guias.push(await a.evaluate(() => { const e = globalThis.__numinia.view.editor.estado(); return { guia: e.guia, visible: !!globalThis.__numinia.view.editor.estado().guia }; }));
    await foto("2-guia-de-encaje");
    const fantasma = await a.evaluate(() => { const o = globalThis.__numinia.view.scene?.getObjectByName?.("guia-encaje"); return o ? o.visible : null; });
    // keep going (the gizmo moves in 0.5 m steps) until the editor says the snap holds it, at most 1.5 m further
    for (let i = 1; i <= Math.round((1.5 * pxm) / 6); i++) {
      await a.mouse.move(asaX.x + (pasos + i) * 6, asaX.y); await a.waitForTimeout(25);
      if (i % 2 === 0 && (await a.evaluate(() => globalThis.__numinia.view.editor.estado().guia?.encaja))) break;
    }
    await a.waitForTimeout(250);
    guias.push(await a.evaluate(() => globalThis.__numinia.view.editor.estado().guia));
    await a.mouse.up();
    await a.waitForTimeout(500);
    const g0 = guias[0].guia, g1 = guias[1];
    paso("la guía avisa antes de encajar (blanca, falta entre 25 y 60 cm)", !!g0 && g0.encaja === false && g0.falta > 0.25 && g0.falta <= 0.6 && fantasma !== false, { g0, fantasma });
    paso("y cuando el encaje ya sujeta, lo dice (encaja)", !!g1 && g1.encaja === true, { g1 });
    const guiaTrasSoltar = await a.evaluate(() => globalThis.__numinia.view.editor.estado().guia);
    paso("la guía desaparece al soltar", guiaTrasSoltar === null, { guiaTrasSoltar });
    const finA = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), ids[0]);
    const enB = await esperaB(([k, x]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - x) < 0.011; }, [ids[0], finA.x]);
    const [l, m] = [await deB(ids[0]), await deB(ids[1])];
    const hueco = (m.x - l.x) - ancho;
    paso("dos bloques encajan: las caras se tocan (B lo ve)", enB && Math.abs(hueco) < 0.03 && l.z === o0[0].z && l.y === o0[0].y, { l, m, hueco, ancho });

    // 4. group turn. The three again (band), tool girar, the Y ring
    await a.evaluate(() => globalThis.__numinia.constructor.seleccionar(null));
    await a.keyboard.press("Digit3");
    await a.waitForFunction(() => globalThis.__numinia.view.editor.estado().herramienta === "girar", null, { timeout: 3000 });
    await a.evaluate(() => globalThis.__numinia.view.editor.eje(null)); // all rings
    const pts2 = await Promise.all(ids.map((k) => a.evaluate((k) => { const e = globalThis.__numinia.view.editor, d = e.dondeEsta(k); return e.pantalla(d.x, d.y + 0.5, d.z); }, k)));
    await banda(pts2);
    await a.waitForTimeout(400);
    const s2 = await seleccion();
    paso("el rectángulo vuelve a coger los tres", s2.length === 3, { s2 });
    const primario = s2[s2.length - 1];
    const dPrim = await a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), primario);
    const anillo = [];
    for (let t = 0.3; t <= 4; t += 0.1) anillo.push([dPrim.x + t * Math.SQRT1_2, dPrim.y, dPrim.z + t * Math.SQRT1_2]);
    const asaY = await buscarAsa(a, "Y", anillo);
    paso("anillo Y bajo el ratón", !!asaY, { asaY });
    const antesGiro = await todosB();
    await arrastrar(a, asaY, 70, 0, 10);
    await a.waitForTimeout(500);
    await foto("3-girar-grupo");
    const finGiro = await Promise.all(ids.map((k) => a.evaluate((k) => globalThis.__numinia.view.editor.dondeEsta(k), k)));
    const ryA = finGiro[ids.indexOf(primario)].ry;
    const girados = await esperaB(([ks, ry]) => ks.every((k) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(Math.abs(o.ry - ry) % 360) < 0.2; }), [ids, ryA]);
    const trasGiro = await todosB();
    const zs = trasGiro.map((o) => o.z), z0 = antesGiro.map((o) => o.z);
    paso("girar el grupo: los tres con el mismo giro (B lo ve)", girados && Math.abs(ryA) >= 1 && trasGiro.every((o) => cerca(Math.abs(o.ry), Math.abs(ryA), 0.2)), { ryA, ry: trasGiro.map((o) => o.ry) });
    paso("…y los de los lados han orbitado alrededor del centro del grupo", Math.max(...zs) - Math.min(...zs) > Math.max(...z0) - Math.min(...z0) + 0.2, { antes: z0, despues: zs });
    paso("…sin cambiar la distancia entre ellos (cuerpo rígido)", cerca(Math.hypot(trasGiro[2].x - trasGiro[0].x, trasGiro[2].z - trasGiro[0].z), Math.hypot(antesGiro[2].x - antesGiro[0].x, antesGiro[2].z - antesGiro[0].z), 0.06));

    // 5. group scale: tool escalar, the uniform handle in the centre
    await a.waitForTimeout(1200); // moves a second apart are separate undo steps
    await a.keyboard.press("Digit4");
    await a.waitForFunction(() => globalThis.__numinia.view.editor.estado().herramienta === "escalar", null, { timeout: 3000 });
    await a.waitForTimeout(300);
    const cEsc = await a.evaluate((k) => { const e = globalThis.__numinia.view.editor, d = e.dondeEsta(k); return e.pantalla(d.x, d.y + 0.5, d.z); }, primario);
    await a.mouse.move(cEsc.x, cEsc.y);
    const bajo = await a.evaluate(() => globalThis.__numinia.view.editor.estado().ejeBajo);
    const antesEsc = await todosB();
    await arrastrar(a, cEsc, 18, -9, 10);
    await a.waitForTimeout(600);
    const trasEsc = await todosB();
    const ratios = trasEsc.map((o, i) => o.sx / antesEsc[i].sx);
    paso("escalar el grupo: los tres crecen en la misma proporción (B lo ve)", bajo !== null && ratios.every((q) => q > 1.05 && cerca(q, ratios[0], 0.03)), { bajo, ratios });
    paso("…y se separan en esa misma proporción desde el centro", (() => {
      const d0 = Math.hypot(antesEsc[2].x - antesEsc[0].x, antesEsc[2].z - antesEsc[0].z), d1 = Math.hypot(trasEsc[2].x - trasEsc[0].x, trasEsc[2].z - trasEsc[0].z);
      return cerca(d1 / d0, ratios[0], 0.06);
    })(), { ratios });

    // 6. one Ctrl+Z per action brings ALL the blocks back at once
    const igual = ([w]) => w.every((q, i) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(q.id); return !!o && Math.abs(o.x - q.x) < 0.02 && Math.abs(o.z - q.z) < 0.02 && Math.abs(o.sx - q.sx) < 0.02 && Math.abs(o.ry - q.ry) < 0.3; });
    const con = (estado) => estado.map((o, i) => ({ ...o, id: ids[i] }));
    await a.keyboard.press("Control+KeyZ");
    const u1 = await esperaB(igual, [con(antesEsc)]);
    paso("un Ctrl+Z deshace la escala de los tres a la vez", u1, { esperado: antesEsc, ahora: await todosB() });
    await a.keyboard.press("Control+KeyZ");
    const u2 = await esperaB(igual, [con(antesGiro)]);
    paso("otro Ctrl+Z deshace el giro de los tres a la vez", u2, { esperado: antesGiro, ahora: await todosB() });
    await a.keyboard.press("Control+KeyY");
    const r1 = await esperaB(igual, [con(antesEsc.map((o, i) => ({ ...trasGiro[i] })))]);
    paso("Ctrl+Y rehace el giro de los tres", r1);
    await a.keyboard.press("Control+Shift+KeyZ");
    paso("Ctrl+Mayús+Z rehace la escala de los tres", await esperaB(igual, [con(trasEsc)]));
    // …and the snap of step 3 is its own step further back
    await a.keyboard.press("Control+KeyZ"); await a.keyboard.press("Control+KeyZ");
    await a.keyboard.press("Control+KeyZ");
    paso("el encaje también se deshace de un solo paso", await esperaB(([k, x]) => { const o = globalThis.__numinia.session.features.stateOf("objetos").get(k); return !!o && Math.abs(o.x - x) < 0.02; }, [ids[0], o0[0].x]), { x: (await deB(ids[0]))?.x, x0: o0[0].x });
    if (SHOTS) await a.screenshot({ path: `${SHOTS}/4-tras-deshacer.png` });

    // 7. cleanup: the three at once (Delete), one step; B sees the world as found
    await a.evaluate((ks) => { globalThis.__numinia.constructor.seleccionarVarios(ks); }, ids);
    await a.keyboard.press("Delete");
    paso("Supr borra los tres juntos", await esperaB(([ks]) => ks.every((k) => !globalThis.__numinia.session.features.stateOf("objetos").has(k)), [ids]));
    ids = [];
    r.ok = errors.length === 0;
  } catch (e) {
    r.error = String(e).split("\n")[0].slice(0, 400);
  } finally {
    if (ids.length && a) await a.evaluate((ks) => { const c = globalThis.__numinia.constructor; for (const k of ks) { c.seleccionar(k); c.borrar(); } }, ids).catch(() => {});
    r.errors = errors;
    await browser.close();
  }
  return r;
}

const resultados = [await pierna()];
const ok = resultados.every((x) => x.ok);
console.log(JSON.stringify(resultados, null, 1));
console.log(ok ? "E2E CONSTRUCTOR-GRUPO OK" : "E2E CONSTRUCTOR-GRUPO FALLA");
process.exit(ok ? 0 : 1);
