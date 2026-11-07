// sucesos — the world's file and the pure numbers (v1, Y48). Kept apart from feature.ts so the page (which only needs the
// declaration) does not carry the reader or the draw: the server and the composition root import this file.
import { rngInt } from "../../packages/core/src/index.ts";
import { AVISO_MAX, AYUDA_MAX_PCT, CUANTO_MAX, DURACION_MAX, PERSONAS_MAX, PESO_MAX, PROGRESO_ESCALA, SUCESOS_MAX } from "./feature.ts";

/** An event as the world's file lists it (numinia-engine/sucesos@1). */
export type Siguiente = { id: string; peso: number };
export type SucesoFichero = {
  id: string; nombre: string; x: number; z: number; y?: number; radio: number;
  anuncio: string; aviso: number; duracion: number; ayuda: number; ayudaMax: number;
  recompensa: { texto: string; cosa: string; cuanto: number }; final: string; siguiente: Siguiente[]; empieza: boolean;
};
export type Problema = { path: string; message: string };
const PLANTILLA = "{ \"schema\": \"numinia-engine/sucesos@1\", \"sucesos\": [{ \"id\": \"lluvia\", \"nombre\": \"Lluvia de estrellas\", \"x\": 0, \"z\": 0, \"anuncio\": \"Se acerca una lluvia de estrellas\", \"duracion\": 120, \"recompensa\": { \"texto\": \"Recoges polvo de estrella\", \"cosa\": \"polvo\", \"cuanto\": 3 }, \"empieza\": true }] }";
const bytes = (t: string) => new TextEncoder().encode(t).length;

/** Read entorno/sucesos.json. Each wrong line is left out WITH its reason (path + how to fix); the rest is used. A
 * `siguiente` that names an event the file does not have is dropped (and said); the event itself stays. */
export function leerSucesos(crudo: unknown): { valor: SucesoFichero[]; problemas: Problema[] } {
  const problemas: Problema[] = [], valor: SucesoFichero[] = [];
  if (crudo === undefined || crudo === null) return { valor, problemas };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { valor, problemas: [{ path: "sucesos", message: `sucesos.json es un objeto: ${PLANTILLA}` }] };
  const o = crudo as { schema?: unknown; sucesos?: unknown };
  if (o.schema !== undefined && o.schema !== "numinia-engine/sucesos@1") problemas.push({ path: "sucesos.schema", message: "el esquema es \"numinia-engine/sucesos@1\"" });
  if (o.sucesos !== undefined && !Array.isArray(o.sucesos)) { problemas.push({ path: "sucesos.sucesos", message: `una lista de sucesos: ${PLANTILLA}` }); return { valor, problemas }; }
  const vistos = new Set<string>();
  const lista = Array.isArray(o.sucesos) ? o.sucesos : [];
  for (const [i, c] of lista.entries()) {
    const path = `sucesos.sucesos[${i}]`, e = c as Record<string, unknown>;
    if (!e || typeof e !== "object" || Array.isArray(e)) { problemas.push({ path, message: "cada evento es un objeto" }); continue; }
    const id = String(e.id ?? "");
    if (!/^[a-z0-9-]{1,16}$/.test(id)) { problemas.push({ path: `${path}.id`, message: "un id de 1 a 16 letras minúsculas, cifras o guiones" }); continue; }
    if (vistos.has(id)) { problemas.push({ path: `${path}.id`, message: `«${id}» está repetido` }); continue; }
    const nombre = String(e.nombre ?? "").trim();
    if (!nombre || bytes(nombre) > 60) { problemas.push({ path: `${path}.nombre`, message: "un nombre de 1 a 60 bytes (lo que se lee en su ficha)" }); continue; }
    const num = (k: string) => typeof e[k] === "number" && Number.isFinite(e[k]);
    const entre = (k: string, min: number, max: number, def: number): number | null => (e[k] === undefined ? def : num(k) && Number.isInteger(e[k]) && (e[k] as number) >= min && (e[k] as number) <= max ? (e[k] as number) : null);
    if (!num("x") || !num("z")) { problemas.push({ path, message: "x y z en metros (números)" }); continue; }
    const anuncio = String(e.anuncio ?? "").trim();
    if (!anuncio || bytes(anuncio) > 120) { problemas.push({ path: `${path}.anuncio`, message: "anuncio: la frase que oye quien está cerca, de 1 a 120 bytes" }); continue; }
    const duracion = entre("duracion", 1, DURACION_MAX, -1);
    if (duracion === null || duracion < 1) { problemas.push({ path: `${path}.duracion`, message: `duracion: segundos que tarda SIN nadie, entero de 1 a ${DURACION_MAX}` }); continue; }
    const aviso = entre("aviso", 0, AVISO_MAX, 10), ayuda = entre("ayuda", 0, AYUDA_MAX_PCT, 25), ayudaMax = entre("ayudaMax", 1, PERSONAS_MAX, 8);
    if (aviso === null) { problemas.push({ path: `${path}.aviso`, message: `aviso: segundos entre el anuncio y el comienzo, entero de 0 a ${AVISO_MAX} (10 si falta)` }); continue; }
    if (ayuda === null) { problemas.push({ path: `${path}.ayuda`, message: `ayuda: % de velocidad que suma cada persona, entero de 0 a ${AYUDA_MAX_PCT} (25 si falta)` }); continue; }
    if (ayudaMax === null) { problemas.push({ path: `${path}.ayudaMax`, message: `ayudaMax: cuántas personas cuentan, entero de 1 a ${PERSONAS_MAX} (8 si falta)` }); continue; }
    if (e.radio !== undefined && (!num("radio") || (e.radio as number) < 2 || (e.radio as number) > 60)) { problemas.push({ path: `${path}.radio`, message: "radio: de 2 a 60 metros (12 si falta)" }); continue; }
    const r = (e.recompensa ?? {}) as Record<string, unknown>;
    const texto = String(r.texto ?? "").trim(), cosa = String(r.cosa ?? ""), cuanto = r.cuanto === undefined ? 1 : r.cuanto;
    if (typeof r !== "object" || Array.isArray(r) || !texto || bytes(texto) > 120) { problemas.push({ path: `${path}.recompensa.texto`, message: "recompensa: { texto (1 a 120 bytes), cosa?, cuanto? } — todos los participantes reciben la entera" }); continue; }
    if (cosa && !/^[a-z0-9-]{1,24}$/.test(cosa)) { problemas.push({ path: `${path}.recompensa.cosa`, message: "cosa: 1 a 24 letras minúsculas, cifras o guiones (vacío = solo la frase)" }); continue; }
    if (typeof cuanto !== "number" || !Number.isInteger(cuanto) || cuanto < 0 || cuanto > CUANTO_MAX) { problemas.push({ path: `${path}.recompensa.cuanto`, message: `cuanto: entero de 0 a ${CUANTO_MAX} (1 si falta)` }); continue; }
    const final = e.final === undefined ? "" : String(e.final).trim();
    if (bytes(final) > 120) { problemas.push({ path: `${path}.final`, message: "final: la frase de cuando acaba, hasta 120 bytes" }); continue; }
    if (valor.length >= SUCESOS_MAX) { problemas.push({ path, message: `como mucho ${SUCESOS_MAX} sucesos por mundo` }); break; }
    vistos.add(id);
    valor.push({ id, nombre, x: Number(e.x), z: Number(e.z), y: num("y") ? Number(e.y) : undefined, radio: num("radio") ? Number(e.radio) : 12, anuncio, aviso, duracion, ayuda, ayudaMax,
      recompensa: { texto, cosa, cuanto }, final, siguiente: [], empieza: e.empieza === true });
  }
  // the chain, once every id is known (a loop back to itself is fine: a cycle of weather)
  for (const [i, c] of lista.entries()) {
    const e = c as Record<string, unknown>, ev = valor.find((v) => v.id === String(e?.id ?? ""));
    if (!ev || e.siguiente === undefined) continue;
    const path = `sucesos.sucesos[${i}].siguiente`;
    if (!Array.isArray(e.siguiente)) { problemas.push({ path, message: "siguiente: una lista [{ id, peso }] (peso 1 a 100, 1 si falta)" }); continue; }
    for (const [j, s] of e.siguiente.entries()) {
      const sid = String((s as Record<string, unknown>)?.id ?? ""), peso = (s as Record<string, unknown>)?.peso ?? 1;
      if (!valor.some((v) => v.id === sid)) { problemas.push({ path: `${path}[${j}].id`, message: `«${sid.slice(0, 16)}» no es un evento de este fichero (se deja fuera)` }); continue; }
      if (typeof peso !== "number" || !Number.isInteger(peso) || peso < 1 || peso > PESO_MAX) { problemas.push({ path: `${path}[${j}].peso`, message: `peso: entero de 1 a ${PESO_MAX} (1 si falta)` }); continue; }
      ev.siguiente.push({ id: sid, peso });
    }
  }
  return { valor, problemas };
}

/** Progress added in one second, out of PROGRESO_ESCALA: the base pace plus `ayuda` % for each person helping (up to `ayudaMax`). Integers only. */
export function ritmo(e: Pick<SucesoFichero, "duracion" | "ayuda" | "ayudaMax">, personas: number): number {
  const k = Math.max(0, Math.min(Math.trunc(personas), e.ayudaMax));
  return Math.floor((PROGRESO_ESCALA * (100 + e.ayuda * k)) / (100 * e.duracion));
}

/** The next event of a chain by weight, drawn with the given integer RNG state (core's mulberry32: same state → same pick), or "" (no chain). */
export function elegirSiguiente(lista: readonly Siguiente[], rng: Uint32Array): string {
  if (!lista.length) return "";
  const total = lista.reduce((a, s) => a + s.peso, 0);
  let r = rngInt(rng, total);
  for (const s of lista) { if (r < s.peso) return s.id; r -= s.peso; }
  return lista[lista.length - 1].id;
}
