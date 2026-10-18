// Herramienta de diseño: simula una economía de Numinia y saca números para decidir ANTES de programarla.
// Uso:  node tools/economia.ts prestigio [--sesiones 52] [--persona gastador|ahorrador] [--semillas 1-3] [--escalada] [--corridas 200]
//       node tools/economia.ts reliquias [--encuentros 300] [--base 50] [--piedad 10] [--corridas 500]
//       añade --json para la salida en datos. No toca el motor: solo lee tools/economia/.
import { validar } from "./economia/diagrama.ts";
import { correr, finales, primerTick, resumen } from "./economia/simular.ts";
import { COSTES, diagramaPrestigio, type Persona } from "./economia/modelos/prestigio.ts";
import { diagramaReliquias } from "./economia/modelos/reliquias.ts";

const args = process.argv.slice(2);
const que = args[0];
const opt = (k: string, def: string): string => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const flag = (k: string): boolean => args.includes(`--${k}`);
const json = flag("json");
const fila = (nombre: string, r: ReturnType<typeof resumen>) => `${nombre.padEnd(44)} p50 ${String(r.p50).padStart(6)}   p95 ${String(r.p95).padStart(6)}   media ${String(r.media).padStart(7)}   [${r.min}..${r.max}]`;

if (que === "prestigio") {
  const sesiones = Number(opt("sesiones", "52"));
  const persona = opt("persona", "gastador") as Persona;
  const [a, b] = opt("semillas", "1-3").split("-").map(Number) as [number, number];
  const corridas = Number(opt("corridas", "200"));
  const d = diagramaPrestigio({ semillasPorSesion: [a, b], persona, escalada: flag("escalada") });
  const v = validar(d);
  if (!v.ok) { console.error(v.issues); process.exit(1); }
  const rs = correr(d, { ticks: sesiones, semillas: corridas });
  const salida = {
    diagrama: d.nombre, sesiones, corridas, semillasPorSesion: [a, b],
    prestigioFinal: resumen(finales(rs, "prestigio")),
    semillasSinGastar: resumen(finales(rs, "semillas")),
    competencias: resumen(finales(rs, "competencias")),
    aptitudes: resumen(finales(rs, "aptitudes")),
    caracteristicas: resumen(finales(rs, "caracteristicas")),
    competenciasNuevas: resumen(finales(rs, "competencias_nuevas")),
    aptitudesNuevas: resumen(finales(rs, "aptitudes_nuevas")),
    sesionesHasta: Object.fromEntries(Object.entries(COSTES).map(([k, coste]) => [k, resumen(rs.map((r) => primerTick(r, "prestigio", coste)))])),
  };
  if (json) { console.log(JSON.stringify(salida, null, 2)); process.exit(0); }
  console.log(`${d.nombre} — ${sesiones} sesiones, ${corridas} corridas (semillas 1..${corridas}), ${a}-${b} Semillas por sesión`);
  console.log(fila("Prestigio total al final", salida.prestigioFinal));
  console.log(fila("Puntos de Semilla sin gastar", salida.semillasSinGastar));
  console.log(fila("Niveles de Competencia comprados (50)", salida.competencias));
  console.log(fila("Niveles de Aptitud comprados (100)", salida.aptitudes));
  console.log(fila("Niveles de Característica comprados (200)", salida.caracteristicas));
  console.log(fila("Competencias nuevas (500)", salida.competenciasNuevas));
  console.log(fila("Aptitudes nuevas (1000)", salida.aptitudesNuevas));
  console.log("Sesiones hasta reunir (en Prestigio total) el coste de…");
  for (const [k, r] of Object.entries(salida.sesionesHasta)) console.log(fila(`  ${k} (${COSTES[k as keyof typeof COSTES]})`, r));
} else if (que === "reliquias") {
  const encuentros = Number(opt("encuentros", "300"));
  const base = Number(opt("base", "50")), piedad = Number(opt("piedad", "0"));
  const corridas = Number(opt("corridas", "500"));
  const d = diagramaReliquias({ base, piedad });
  const v = validar(d);
  if (!v.ok) { console.error(v.issues); process.exit(1); }
  const rs = correr(d, { ticks: encuentros, semillas: corridas });
  const salida = {
    diagrama: d.nombre, encuentros, corridas,
    primera: resumen(rs.map((r) => primerTick(r, "reliquias", 1))),
    tercera: resumen(rs.map((r) => primerTick(r, "reliquias", 3))),
    reliquiasFinal: resumen(finales(rs, "reliquias")),
    rachaMaxima: resumen(rs.map((r) => Math.max(...r.series.fallos))),
  };
  if (json) { console.log(JSON.stringify(salida, null, 2)); process.exit(0); }
  console.log(`${d.nombre} — ${encuentros} encuentros, ${corridas} corridas`);
  console.log(fila("Encuentros hasta la 1.ª Reliquia", salida.primera));
  console.log(fila("Encuentros hasta la 3.ª (las tres portadas)", salida.tercera));
  console.log(fila("Reliquias al final", salida.reliquiasFinal));
  console.log(fila("Racha más larga sin Reliquia", salida.rachaMaxima));
} else {
  console.log("Uso: node tools/economia.ts prestigio|reliquias [opciones] [--json]  (ver cabecera del archivo)");
  process.exit(que ? 1 : 0);
}
