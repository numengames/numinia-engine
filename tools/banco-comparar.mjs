#!/usr/bin/env node
// banco-comparar: did a change make the engine's core slower? Reads two `npm run bench` outputs (bench@2) —
// the base (before) and the new one (after) — and judges each metric:
//   node tools/banco-comparar.mjs base.json nuevo.json [--umbral 10] [--sigmas 3] [--forzar]
// A metric EMPEORA (worse) when the new median is more than --umbral % above the base AND the difference is larger
// than --sigmas standard errors of the difference (from each run's per-round spread). If the rounds scatter too
// much to tell, it says «ruido» and does not fail: more rounds (--rounds 9) or a calmer machine, then again.
// Exit: 0 = nothing worse · 1 = something worse · 2 = cannot compare (bad file, other scene, other machine).
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SCHEMA = "numinia-engine/bench@2";
const NOMBRES = {
  cicloP50Ms: "ciclo completo (100 ms) p50", tickConEnvioP50Ms: "tick con envío p50", tickSinEnvioP50Ms: "tick sin envío p50",
  cicloP99Ms: "ciclo completo p99", tickConEnvioP99Ms: "tick con envío p99", tickSinEnvioP99Ms: "tick sin envío p99",
};

/** The last line of a file that parses as a JSON object (bench prints one line; a saved log may carry more). */
export function leerInforme(texto) {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lineas.length - 1; i >= 0; i--) { try { const o = JSON.parse(lineas[i]); if (o && typeof o === "object") return o; } catch { /* next */ } }
  try { return JSON.parse(texto); } catch { return null; }
}

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { if (xs.length < 2) return Infinity; const m = media(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

/** Why these two reports cannot be compared (empty = they can). */
export function noComparables(base, nuevo) {
  const motivos = [];
  for (const [quien, r] of [["base", base], ["nuevo", nuevo]]) {
    if (!r || r.schema !== SCHEMA) motivos.push(`${quien}: no es ${SCHEMA} (es ${r?.schema ?? "otra cosa"}); bench@1 mezclaba dos clases de tick, vuelve a medirlo con el banco nuevo`);
  }
  if (motivos.length) return motivos;
  for (const k of ["personas", "ticks", "calentamiento"]) if (base[k] !== nuevo[k]) motivos.push(`${k} distinto: ${base[k]} frente a ${nuevo[k]}`);
  if (base.huella !== nuevo.huella) motivos.push(`escena distinta (huella ${base.huella} frente a ${nuevo.huella}): el cambio tocó la simulación, no se comparan peras con manzanas`);
  const eb = base.entorno ?? {}, en = nuevo.entorno ?? {};
  for (const k of ["cpuModelo", "node"]) if (eb[k] !== en[k]) motivos.push(`aparato distinto (${k}: ${eb[k]} frente a ${en[k]})`);
  return motivos;
}

/** Judge every metric both reports carry. */
export function comparar(base, nuevo, { umbral = 0.10, sigmas = 3 } = {}) {
  const filas = [];
  for (const k of Object.keys(NOMBRES)) {
    const b = base.metricas?.[k], n = nuevo.metricas?.[k];
    if (!b || !n || !(b.mediana > 0)) continue;
    const ratio = n.mediana / b.mediana;
    const se = Math.sqrt(sd(b.rondas) ** 2 / b.rondas.length + sd(n.rondas) ** 2 / n.rondas.length);
    const dif = n.mediana - b.mediana;
    const claro = Number.isFinite(se) && Math.abs(dif) > sigmas * se;
    // the smallest change these two runs could tell apart, as a fraction of the base
    const detectable = Number.isFinite(se) ? (sigmas * se) / b.mediana : Infinity;
    let estado;
    if (ratio > 1 + umbral) estado = claro ? "EMPEORA" : "ruido";
    else if (ratio < 1 - umbral) estado = claro ? "mejora" : "ruido";
    else estado = "igual";
    filas.push({ metrica: k, nombre: NOMBRES[k], base: b.mediana, nuevo: n.mediana, ratio, detectable, estado });
  }
  return { filas, empeora: filas.some((f) => f.estado === "EMPEORA") };
}

const f2 = (x) => x.toFixed(2).replace(".", ",");
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 1000) / 10} %`.replace(".", ",") : "—");

export function legible(base, nuevo, r, { umbral = 0.10 } = {}) {
  const cab = (x) => `${x.entorno?.motor ?? "?"} (${x.entorno?.commit ?? "?"}), carga ${x.entorno?.carga1m ?? "?"}, ${x.rondas} rondas${x.fiable === false ? ", NO FIABLE" : ""}`;
  const out = [`base:  ${cab(base)}`, `nuevo: ${cab(nuevo)}`, `tope: empeorar más de ${pc(umbral)}`, ""];
  out.push(`${"métrica".padEnd(28)} ${"base".padStart(8)} ${"nuevo".padStart(8)} ${"cambio".padStart(8)}  ${"se ve desde".padStart(11)}  veredicto`);
  for (const f of r.filas) {
    const cambio = `${f.ratio >= 1 ? "+" : ""}${pc(f.ratio - 1)}`;
    out.push(`${f.nombre.padEnd(28)} ${f2(f.base).padStart(8)} ${f2(f.nuevo).padStart(8)} ${cambio.padStart(8)}  ${pc(f.detectable).padStart(11)}  ${f.estado}`);
  }
  out.push("", "«se ve desde» = el menor cambio que estas dos pasadas distinguen del ruido; «ruido» = pasa del tope pero la dispersión no deja afirmarlo (más rondas).");
  for (const x of [base, nuevo]) for (const a of x.avisos ?? []) out.push(`⚠ ${x === base ? "base" : "nuevo"}: ${a}`);
  out.push(r.empeora ? "RESULTADO: EMPEORA (salida 1)" : "RESULTADO: no empeora nada que se pueda afirmar (salida 0)");
  return out.join("\n");
}

const esOrden = () => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (esOrden()) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(`--${k}`); if (i < 0) return d; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
  const umbral = opt("umbral", 10) / 100, sigmas = opt("sigmas", 3);
  const forzar = args.includes("--forzar"); const ficheros = args.filter((a) => !a.startsWith("--"));
  if (ficheros.length !== 2) { console.error("uso: node tools/banco-comparar.mjs base.json nuevo.json [--umbral 10] [--sigmas 3] [--forzar]"); process.exit(2); }
  const [base, nuevo] = ficheros.map((f) => { try { return leerInforme(readFileSync(f, "utf8")); } catch (e) { console.error(`no puedo leer ${f}: ${e.message}`); process.exit(2); } });
  const motivos = noComparables(base, nuevo);
  for (const m of motivos) console.error(`no comparable: ${m}`);
  // --forzar compares anyway (e.g. a change that alters the scene on purpose), never two files of another schema
  if (motivos.length && !(forzar && base?.schema === SCHEMA && nuevo?.schema === SCHEMA)) process.exit(2);
  const r = comparar(base, nuevo, { umbral, sigmas });
  console.log(legible(base, nuevo, r, { umbral }));
  process.exit(r.empeora ? 1 : 0);
}
