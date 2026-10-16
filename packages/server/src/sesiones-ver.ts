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
  return lines.join("\n");
}

/** Totals by device class: sessions, median frame p99, lost frames. */
export function resumir(filas: Fila[]): string {
  const by = new Map<string, Fila[]>();
  for (const f of filas) { const k = `${f.entrada?.clase ?? "¿?"} · ${String(f.entrada?.navegador ?? "¿?")}`; by.set(k, [...(by.get(k) ?? []), f]); }
  const out = ["", "Resumen por aparato y navegador:"];
  for (const [k, fs] of [...by].sort()) {
    const p = fs.flatMap((f) => f.pulsos);
    const cuadros = p.reduce((a, x) => a + (x.cuadros ?? 0), 0), perdidos = p.reduce((a, x) => a + (x.perdidos ?? 0), 0);
    out.push(`  ${k}: ${fs.length} sesiones · cuadro p99 ${n(med(p.map((x) => x.cuadroMs?.p99)), " ms")} · perdidos ${cuadros ? n((100 * perdidos) / cuadros, " %") : "—"} · ping ${n(med(p.map((x) => x.rttMs).filter((x) => x >= 0)), " ms")}`);
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
