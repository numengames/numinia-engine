// eventos (MIS-248, 1/3): the world's book of facts — what happened in the world, never to whom.
// `registrar(tipo, datos)` checks the type against a closed list and the data against a small allow-list of keys
// per type, then appends ONE line `{"v":"evento@1","t":<UTC ISO>,"tipo":...,"datos":{...}}` to
// <datos>/eventos-YYYY-MM-DD.jsonl (UTC days; append-only; at most MAX_DIA_BYTES a day, then lines are dropped and
// counted). ZERO personal data: there is no field for a person (no id, no hash, no name, no position); people appear
// only as a COUNT (`participantes`). Anything outside the allow-list returns false; it never throws.
// Off by default: a world switches it on with MOTOR_EVENTOS=si (R-1: one switch, nothing else to set up).
import { appendFileSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const ESQUEMA = "evento@1";
export const MAX_DIA_BYTES = 5 * 1024 * 1024;
export const TEXTO_MAX = 64;
export const CONTEO_MAX = 1_000_000;

type Clase = "texto" | "conteo" | "numero";
const CLAVES: Record<string, Clase> = {
  aventura: "texto", paso: "texto", zona: "texto", resultado: "texto", especie: "texto", arma: "texto",
  duracion_s: "numero", participantes: "conteo",
};
/** The closed list of facts, each with the keys it may carry. */
export const TIPOS: Record<string, readonly string[]> = {
  "aventura.empezada": ["aventura", "zona", "participantes"],
  "aventura.terminada": ["aventura", "resultado", "duracion_s", "participantes"],
  "aventura.abandonada": ["aventura", "paso", "duracion_s", "participantes"],
  "aventura.paso": ["aventura", "paso", "zona"],
  "combate.inicio": ["zona", "especie", "participantes"],
  "combate.fin": ["zona", "especie", "resultado", "duracion_s", "participantes"],
  "criatura.abatida": ["zona", "especie", "arma"],
  "persona.cae": ["zona", "participantes"], // a count of falls, never who
};
/** Names that must never enter, even by a future edit of the lists above (checked by the test and at runtime). */
const PARECE_PERSONA = /(^|_)(id|uid|jugador|persona|usuario|nombre|name|user|player|hash|email|ip|pos|posicion|position|x|y|z)(_|$)/i;

export type Libro = {
  registrar(tipo: string, datos?: Record<string, unknown>): boolean;
  readonly stats: { escritos: number; rechazados: number; descartados: number };
};

function valida(clase: Clase, v: unknown): boolean {
  if (clase === "texto") return typeof v === "string" && v.length > 0 && v.length <= TEXTO_MAX && !/[\u0000-\u001f]/.test(v);
  if (clase === "conteo") return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= CONTEO_MAX;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e7;
}

/** A book that writes into `dir`. `ahora` is injectable (tests move the clock across midnight). */
export function crearLibro(dir: string, ahora: () => Date = () => new Date()): Libro {
  const stats = { escritos: 0, rechazados: 0, descartados: 0 };
  let dia = "", bytes = 0, listo = false;
  const rechazar = () => { stats.rechazados++; return false; };
  function registrar(tipo: string, datos: Record<string, unknown> = {}): boolean {
    try {
      const permitidas = Object.prototype.hasOwnProperty.call(TIPOS, tipo) ? TIPOS[tipo] : null;
      if (!permitidas || datos === null || typeof datos !== "object" || Array.isArray(datos)) return rechazar();
      for (const k of Object.keys(datos)) {
        if (!permitidas.includes(k) || PARECE_PERSONA.test(k) || !valida(CLAVES[k], datos[k])) return rechazar();
      }
      const t = ahora();
      const iso = t.toISOString();
      const hoy = iso.slice(0, 10);
      const archivo = join(dir, `eventos-${hoy}.jsonl`);
      if (hoy !== dia || !listo) {
        mkdirSync(dir, { recursive: true });
        dia = hoy;
        try { bytes = statSync(archivo).size; } catch { bytes = 0; }
        listo = true;
      }
      const linea = JSON.stringify({ v: ESQUEMA, t: iso, tipo, datos }) + "\n";
      const n = Buffer.byteLength(linea);
      if (bytes + n > MAX_DIA_BYTES) { stats.descartados++; return false; }
      appendFileSync(archivo, linea);
      bytes += n; stats.escritos++;
      return true;
    } catch { return rechazar(); }
  }
  return { registrar, stats };
}

/** The house switch: MOTOR_EVENTOS=si turns the book on; anything else = off (a book whose registrar writes nothing). */
export function libroDeEntorno(env: Record<string, string | undefined>, datos: string, log: (l: string) => void = () => {}): Libro {
  if (env.MOTOR_EVENTOS !== "si") return { registrar: () => false, stats: { escritos: 0, rechazados: 0, descartados: 0 } };
  log(`[eventos] libro de eventos encendido: ${datos}/eventos-<día UTC>.jsonl (sin datos de personas)`);
  return crearLibro(datos);
}
