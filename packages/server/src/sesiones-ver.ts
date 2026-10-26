// npm run sesiones [-- <carpeta|fichero.jsonl> | --url http://127.0.0.1:8790] [--dias N]
// Reads the session log (T1) and prints, for people, how each player entered and how it went:
// device, browser, graphics, XR, frames, ping, battery, errors. Default folder: SESIONES_DIR or informes/sesiones.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

type Rec = Record<string, any>;
export type Fila = { sesion: string; inicio: string; duracionS: number | null; entrada: Rec | null; pulsos: Rec[]; xr: Rec[]; errores: Rec[]; sale: Rec | null };

/** Group JSONL lines into sessions, oldest first. Bad lines are skipped. */
export function agrupar(lines: string[]): Fila[] {
  const by = new Map<string, Fila>();
  for (const line of lines) {
    let r: Rec; try { r = JSON.parse(line); } catch { continue; }
    if (!r || typeof r.sesion !== "string") continue;
    let f = by.get(r.sesion);
    if (!f) by.set(r.sesion, (f = { sesion: r.sesion, inicio: String(r.t ?? ""), duracionS: null, entrada: null, pulsos: [], xr: [], errores: [], sale: null }));
    if (r.k === "entrada") f.entrada = r;
    else if (r.k === "pulso") f.pulsos.push(r);
    else if (r.k === "xr") f.xr.push(r);
    else if (r.k === "error") f.errores.push(r);
    else if (r.k === "sale") { f.sale = r; f.duracionS = Number(r.duracionS ?? 0); }
  }
  return [...by.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

const med = (xs: number[]) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const n = (x: number, unit = "") => (Number.isFinite(x) ? `${Math.round(x * 10) / 10}${unit}` : "—");

/** One block of text per session (Spanish, for people). */
export function describir(f: Fila): string {
  const e = f.entrada ?? {}, p = f.pulsos;
  const cuadros = p.reduce((a, x) => a + (x.cuadros ?? 0), 0), perdidos = p.reduce((a, x) => a + (x.perdidos ?? 0), 0);
  const modos = [...new Set(p.map((x) => x.modo ?? "plano"))].join(", ") || "—";
  const bat = p.map((x) => x.bateria?.nivel).filter((x) => typeof x === "number");
  const batIni = e.bateria?.nivel ?? bat[0], batFin = bat[bat.length - 1];
  const dur = f.duracionS ?? (p.length ? Math.round((Date.parse(p[p.length - 1].t) - Date.parse(f.inicio)) / 1000) : 0);
  const lines = [
    `■ ${f.inicio.replace("T", " ").slice(0, 19)} UTC · ${Math.floor(dur / 60)} min ${dur % 60} s${f.sale ? "" : " · sigue dentro"} · ${f.sesion}`,
    `  ${e.clase ?? "¿?"} · ${e.aparato || "(modelo oculto)"} · ${e.sistema ?? "¿?"} · ${e.navegador ?? "¿?"}`,
    `  gráfica ${e.backend ?? "¿?"}${e.gpu ? ` (${e.gpu})` : ""} · pantalla ${e.pantalla ?? "¿?"} ×${e.dpr ?? "?"} · ${e.nucleos ?? "?"} núcleos · ${e.memoriaGB ? `${e.memoriaGB} GB` : "memoria ¿?"}`,
    `  XR: VR ${e.xr?.vr ? "sí" : "no"} · AR ${e.xr?.ar ? "sí" : "no"} · usado: ${modos}${f.xr.length ? ` (${f.xr.map((x) => `${x.modo} ${x.accion}${x.detalle ? ` ${x.detalle}` : ""}`).join("; ")})` : ""}`,
    `  entrar: bienvenida ${n(e.tiempos?.bienvenidaMs, " ms")} · primer cuadro ${n(e.tiempos?.primerCuadroMs, " ms")} · huella ${e.huellaIgual === true ? "igual ✓" : e.huellaIgual === false ? "DISTINTA ✗" : "¿?"}`,
    `  cuadros: p50 ${n(med(p.map((x) => x.cuadroMs?.p50)), " ms")} · p99 ${n(med(p.map((x) => x.cuadroMs?.p99)), " ms")} (mediana de ${p.length} pulsos) · perdidos ${cuadros ? n((100 * perdidos) / cuadros, " %") : "—"} · coste p99 ${n(med(p.map((x) => x.costeMs?.p99)), " ms")} · escala mín ${n(Math.min(...p.map((x) => x.escala ?? 1)))}`,
    `  red: ping ${n(med(p.map((x) => x.rttMs).filter((x) => x >= 0)), " ms")} · correcciones ${p.length ? p[p.length - 1].correcciones ?? 0 : "—"} · red ${e.red || "¿?"}${e.ahorroDatos ? " · ahorro de datos" : ""}`,
    `  batería: ${batIni === undefined ? "el navegador no la da" : `${Math.round(batIni * 100)} % → ${batFin === undefined ? "?" : Math.round(batFin * 100)} %`} · preferencias: ${[e.preferencias?.menosMovimiento && "menos movimiento", e.preferencias?.masContraste && "más contraste", e.preferencias?.oscuro && "oscuro"].filter(Boolean).join(", ") || "ninguna"}`,
  ];
  if (f.errores.length) lines.push(`  errores (${f.errores.length}): ${f.errores.slice(0, 3).map((x) => `${x.mensaje} @ ${x.donde}`).join(" | ")}`);
  const b5 = tirones(p);
  if (b5) lines.push(...b5);
  return lines.join("\n");
}

const suma = (xs: unknown[]) => xs.reduce<number>((a, x) => a + (typeof x === "number" && Number.isFinite(x) ? x : 0), 0);
const maximo = (xs: unknown[]) => { const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)); return v.length ? Math.max(...v) : NaN; };
const r2 = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 100) / 100) : "—");
const minimo = (xs: unknown[]) => { const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)); return v.length ? Math.min(...v) : NaN; };

/** E4: the B5 fields of the pulse (docs/MEDIDAS.md, «Qué quiere decir cada cifra del pulso»), summed or taken at their
 * worst over the session: freezes, long frames, LoAF, draw calls, triangles, shader programs, resolution changes. An
 * old page sends none of them: then nothing is printed (not «0», which would say «none»). */
export function tirones(p: Rec[]): string[] | null {
  const hay = (k: string) => p.some((x) => x[k] !== undefined);
  if (!["congelado", "largos", "loaf", "dc", "kTri", "cambiosRes", "programas", "ratio"].some(hay)) return null;
  const out: string[] = [];
  const partes: string[] = [];
  if (hay("congelado")) {
    const veces = suma(p.map((x) => x.congelado?.n));
    partes.push(veces ? `congelada ${veces} ${veces === 1 ? "vez" : "veces"} (${n(suma(p.map((x) => x.congelado?.ms)), " ms")} en total, peor ${n(maximo(p.map((x) => x.congelado?.peor)), " ms")})` : "nunca congelada");
  }
  if (hay("largos")) partes.push(`cuadros largos (> 50 ms) ${suma(p.map((x) => x.largos))}`);
  if (hay("loaf")) partes.push(`LoAF ${suma(p.map((x) => x.loaf?.n))} (bloqueo ${n(suma(p.map((x) => x.loaf?.bloqMs)), " ms")}, peor ${n(maximo(p.map((x) => x.loaf?.peorMs)), " ms")})`);
  else if (hay("largos") || hay("congelado")) partes.push("LoAF: el navegador no lo mide");
  if (partes.length) out.push(`  tirones: ${partes.join(" · ")}`);
  const gpu: string[] = [];
  if (hay("dc")) gpu.push(`dibujos p50 ${n(med(p.map((x) => x.dc?.p50)))} (peor ${n(maximo(p.map((x) => x.dc?.peor)))})`);
  if (hay("kTri")) gpu.push(`miles de triángulos p50 ${n(med(p.map((x) => x.kTri?.p50)))} (peor ${n(maximo(p.map((x) => x.kTri?.peor)))})`);
  if (hay("programas")) gpu.push(`programas máx ${n(maximo(p.map((x) => x.programas)))} (+${suma(p.map((x) => x.programasNuevos))} nuevos)`);
  if (hay("compilesTardios")) gpu.push(`compilaciones tardías ${suma(p.map((x) => x.compilesTardios))}`);
  if (hay("cambiosRes") || hay("ratio")) gpu.push(`cambios de resolución ${suma(p.map((x) => x.cambiosRes))} (ratio mín ${r2(minimo(p.map((x) => x.ratio)))}, último ${r2(p.filter((x) => typeof x.ratio === "number").at(-1)?.ratio ?? NaN)})`);
  if (gpu.length) out.push(`  dibujo: ${gpu.join(" · ")}`);
  return out;
}

/** Totals by device class: sessions, median frame p99, lost frames. */
export function resumir(filas: Fila[]): string {
  const by = new Map<string, Fila[]>();
  for (const f of filas) { const k = `${f.entrada?.clase ?? "¿?"} · ${String(f.entrada?.navegador ?? "¿?")}`; by.set(k, [...(by.get(k) ?? []), f]); }
  const out = ["", "Resumen por aparato y navegador:"];
  for (const [k, fs] of [...by].sort()) {
    const p = fs.flatMap((f) => f.pulsos);
    const cuadros = p.reduce((a, x) => a + (x.cuadros ?? 0), 0), perdidos = p.reduce((a, x) => a + (x.perdidos ?? 0), 0);
    const congeladas = fs.filter((f) => f.pulsos.some((x) => (x.congelado?.n ?? 0) > 0)).length, conB5 = p.some((x) => x.congelado !== undefined || x.largos !== undefined);
    out.push(`  ${k}: ${fs.length} sesiones · cuadro p99 ${n(med(p.map((x) => x.cuadroMs?.p99)), " ms")} · perdidos ${cuadros ? n((100 * perdidos) / cuadros, " %") : "—"} · ping ${n(med(p.map((x) => x.rttMs).filter((x) => x >= 0)), " ms")}` +
      (conB5 ? ` · ${congeladas} con congelación · cuadros largos ${suma(p.map((x) => x.largos))}` : ""));
  }
  return out.join("\n");
}

function leerLineas(where: string, dias: number): string[] {
  if (!existsSync(where)) return [];
  if (statSync(where).isFile()) return readFileSync(where, "utf8").split("\n").filter(Boolean);
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
  return readdirSync(where).filter((f) => /^sesiones-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f.slice(9, 19) >= desde).sort()
    .flatMap((f) => readFileSync(join(where, f), "utf8").split("\n").filter(Boolean));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const url = opt("--url"), dias = Number(opt("--dias") ?? 2);
  if (url) {
    const r = await (await fetch(`${url.replace(/\/$/, "")}/sesiones`)).json() as Rec;
    const filas: Fila[] = (r.ahora ?? []).map((s: Rec) => ({ sesion: s.sesion, inicio: new Date(Date.now() - s.desdeS * 1000).toISOString(), duracionS: null, entrada: s.entrada, pulsos: s.pulso ? [s.pulso] : [], xr: (s.xr ?? []).map((x: string) => ({ modo: x.split(":")[0], accion: x.split(":")[1] })), errores: [], sale: null }));
    console.log(`Conectados ahora con informe: ${filas.length} (${url})\n`);
    console.log(filas.map(describir).join("\n\n") || "(nadie con informe)");
  } else {
    const where = args.find((a) => !a.startsWith("--") && a !== opt("--dias")) ?? process.env.SESIONES_DIR ?? (process.env.MOTOR_MUNDO ? `${process.env.MOTOR_MUNDO}/sesiones` : "informes/sesiones");
    const filas = agrupar(leerLineas(where, dias));
    console.log(`Sesiones en ${where} (últimos ${dias} días): ${filas.length}\n`);
    console.log(filas.map(describir).join("\n\n") || "(ninguna: ¿ha entrado alguien con un navegador?)");
    if (filas.length) console.log(resumir(filas));
  }
}
