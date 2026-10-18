// contadores — declaration (v1, D-044: «temporizador y contador que todos ven»). A piece (pieza) any world turns on
// with a file: `entorno/contadores.json` lists its counters. Three kinds: a countdown (`cuenta_atras`, seconds), a
// counter (`contador`, a start value and a cap) and a clock (`reloj`, the world's stopwatch: seconds since it was
// started). The SERVER keeps every clock and publishes the value ONCE a second (not every tick) and only to who is in
// the counter's zone (shared state WITH `at`: area of interest, J9), so a page never counts on its own and a hundred
// counters cost nothing to who is far. When a countdown reaches zero or a counter its cap, the server emits `llegada`
// with the counter's `evento` name: the cable (D-041) listens to ("contadores", "llegada") and does the rest. Orders
// are intents (`arranca`, `para`, `suma`, `reinicia`) for a page, a phone, VR (the chat: /contador …) and an agent
// alike; who may give them is the file's `manda`: everyone near, or only who directs (STD-052 manage-rituals).
// v1 h3: `state.persist` (S4) — the value and whether it runs survive a server restart. A counter marked
// `variante: "equipo"` stops being a single value: whoever orders it names a team (`equipo`, 1-16 letters/digits/
// hyphens, e.g. `/contador marcador:rojo suma`) and the server keeps one value per team under the same id, created
// the first time that team is named (up to EQUIPOS_MAX per counter) — a free name, never a fixed roster the file
// must list.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who gets a counter in the shared state, from afar (m): a room, a hall, a plaza. */
export const ALCANCE_M = 60;
/** Most counters one world lists. */
export const CONTADORES_MAX = 32;
/** Longest countdown / clock (s): a day. */
export const SEGUNDOS_MAX = 86_400;
/** A counter's range. */
export const VALOR_MAX = 1_000_000;
/** How many ticks between two published values: the server ticks at 20 Hz, so 20 = once a second. */
export const PUBLICA_CADA_TICKS = 20;
/** The milestones of a countdown the page announces aloud (seconds left). */
export const HITOS_S = [300, 60, 30, 10] as const;
export const TIPOS = ["cuenta_atras", "contador", "reloj"] as const;
export const DONDE = ["panel", "cartel", "ambos"] as const;
export const MANDA = ["todos", "dirige"] as const;
/** h3: `ninguna` = un solo valor (hoy); `equipo` = un valor por equipo, nombrado libremente al dar la orden. */
export const VARIANTES = ["ninguna", "equipo"] as const;
/** Como mucho equipos distintos vive un contador `variante: "equipo"` (el resto se rechaza). */
export const EQUIPOS_MAX = 8;
export type Tipo = (typeof TIPOS)[number];
export type Donde = (typeof DONDE)[number];
export type Manda = (typeof MANDA)[number];
export type Variante = (typeof VARIANTES)[number];

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const VALOR = { kind: "int", min: -VALOR_MAX, max: VALOR_MAX } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;
const EVENTO = { kind: "text", maxBytes: 32, default: "" } as const;
const TEXTO = { kind: "text", maxBytes: 120 } as const;
/** `""` = sin equipo (contador normal); si no, 1-16 letras minúsculas, cifras o guiones. */
const EQUIPO = { kind: "text", maxBytes: 16, default: "" } as const;

export const contadores = defineFeature({
  id: "contadores",
  version: 1,
  level: "base",
  describe: "Temporizadores y contadores que todos ven igual: una cuenta atrás («os quedan 12 minutos»), un marcador que sube y baja hasta un tope, el reloj del mundo. Los lleva el servidor y publica el valor una vez por segundo a quien está en su zona. Al llegar a cero o al tope avisa con el nombre de su evento (para el cable). Órdenes: arranca, para, suma, reinicia.",
  state: {
    describe: "Un contador por clave (su id, o id:equipo cuando es de variante equipo): nombre; tipo (cuenta_atras = segundos que bajan; contador = un valor con un tope; reloj = segundos que suben); dónde está (x, z; y = altura del suelo, m) y desde cuánto se le dan órdenes (radio, m); valor = lo que marca ahora (segundos o puntos); inicio = con qué empieza; tope = a dónde llega (0 = sin tope); marcha = si corre; donde = dónde se ve (panel de la página, cartel en el mundo, ambos); evento = el nombre que dispara al llegar; manda = quién le da órdenes (todos los que están cerca, o solo quien dirige); equipo = \"\" en un contador normal, o el nombre del equipo en uno de variante equipo.",
    fields: {
      nombre: NOMBRE, tipo: { kind: "enum", values: [...TIPOS] }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 4 },
      valor: VALOR, inicio: VALOR, tope: VALOR, marcha: { kind: "bool", default: false },
      donde: { kind: "enum", values: [...DONDE] }, evento: EVENTO, manda: { kind: "enum", values: [...MANDA] },
      equipo: EQUIPO,
    },
    card: { role: "lugar", name: "{nombre}", description: "Contador del mundo: lo lleva el servidor, todos ven lo mismo", at: ["x", "z"], actions: ["arranca", "para", "suma", "reinicia"], interact: { intent: "pulsar", prompt: "usar el contador", radius: "radio", key: "id" } },
    radius: ALCANCE_M,
    persist: true, // h3: el valor y si está en marcha sobreviven a un reinicio del servidor
  },
  intents: {
    arranca: { describe: "Poner en marcha el contador (una cuenta atrás baja, un reloj sube). equipo: solo en un contador de variante equipo (el nombre del equipo).", spoken: "arrancar el contador", fields: { id: ID, equipo: EQUIPO }, rate: { perSecond: 2, burst: 4 } },
    para: { describe: "Parar el contador donde está. equipo: solo en un contador de variante equipo.", spoken: "parar el contador", fields: { id: ID, equipo: EQUIPO }, rate: { perSecond: 2, burst: 4 } },
    suma: { describe: "Sumar al contador (cuanto puede ser negativo para restar; vacío = 1). Un marcador sube hasta su tope; a una cuenta atrás se le dan o quitan segundos. equipo: solo en un contador de variante equipo.", spoken: "sumar al contador", fields: { id: ID, cuanto: { kind: "int", min: -VALOR_MAX, max: VALOR_MAX, default: 1 }, equipo: EQUIPO }, rate: { perSecond: 4, burst: 8 } },
    reinicia: { describe: "Volver al valor de inicio, parado. equipo: solo en un contador de variante equipo.", spoken: "reiniciar el contador", fields: { id: ID, equipo: EQUIPO }, rate: { perSecond: 2, burst: 4 } },
    pulsar: { describe: "Usarlo desde al lado (la tecla E): una cuenta atrás o un reloj arranca si está parado y para si corre; un marcador suma 1. equipo: solo en un contador de variante equipo.", spoken: "usar el contador", fields: { id: ID, equipo: EQUIPO }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    llegada: {
      describe: "El contador llegó: una cuenta atrás a cero, un marcador a su tope. Lleva el nombre de su evento (evento) para que otra pieza (el cable) haga lo suyo; a quien está en la zona le suena.",
      fields: { id: ID, nombre: NOMBRE, tipo: { kind: "enum", values: [...TIPOS] }, valor: VALOR, evento: EVENTO, texto: TEXTO, equipo: EQUIPO },
      announce: { text: "{texto}", sound: "campana", importance: 2 },
    },
    hito: {
      describe: "Un momento que se dice en voz alta (y lee el lector de pantalla): arrancó, se paró, quedan 5 minutos, 1 minuto, 30 s, 10 s; el marcador cambió.",
      fields: { id: ID, nombre: NOMBRE, texto: TEXTO, equipo: EQUIPO },
      announce: { text: "{texto}", sound: "suave", importance: 1 },
    },
    rechazado: { describe: "La orden que diste al contador no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});

/** A counter as the world's file lists it (numinia-engine/contadores@1). */
export type ContadorFichero = { id: string; nombre: string; tipo: Tipo; x: number; z: number; y?: number; radio?: number; inicio: number; tope: number; donde: Donde; evento: string; manda: Manda; variante: Variante };
export type Problema = { path: string; message: string };
const PLANTILLA = "{ \"schema\": \"numinia-engine/contadores@1\", \"contadores\": [{ \"id\": \"sala\", \"nombre\": \"Sala 1\", \"tipo\": \"cuenta_atras\", \"segundos\": 900, \"x\": 0, \"z\": 0, \"evento\": \"sala-a-cero\" }] }";

/** Read entorno/contadores.json. Each wrong line is left out WITH its reason (path + how to fix); the rest is used. */
export function leerContadores(crudo: unknown): { valor: ContadorFichero[]; problemas: Problema[] } {
  const problemas: Problema[] = [], valor: ContadorFichero[] = [];
  if (crudo === undefined || crudo === null) return { valor, problemas };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { valor, problemas: [{ path: "contadores", message: `contadores.json es un objeto: ${PLANTILLA}` }] };
  const o = crudo as { schema?: unknown; contadores?: unknown };
  if (o.schema !== undefined && o.schema !== "numinia-engine/contadores@1") problemas.push({ path: "contadores.schema", message: "el esquema es \"numinia-engine/contadores@1\"" });
  if (o.contadores !== undefined && !Array.isArray(o.contadores)) { problemas.push({ path: "contadores.contadores", message: `una lista de contadores: ${PLANTILLA}` }); return { valor, problemas }; }
  const vistos = new Set<string>(), bytes = (t: string) => new TextEncoder().encode(t).length;
  for (const [i, c] of (Array.isArray(o.contadores) ? o.contadores : []).entries()) {
    const path = `contadores.contadores[${i}]`, e = c as Record<string, unknown>;
    if (!e || typeof e !== "object" || Array.isArray(e)) { problemas.push({ path, message: "cada contador es un objeto" }); continue; }
    const id = String(e.id ?? "");
    if (!/^[a-z0-9-]{1,16}$/.test(id)) { problemas.push({ path: `${path}.id`, message: "un id de 1 a 16 letras minúsculas, cifras o guiones" }); continue; }
    if (vistos.has(id)) { problemas.push({ path: `${path}.id`, message: `«${id}» está repetido` }); continue; }
    const nombre = String(e.nombre ?? "").trim();
    if (!nombre || bytes(nombre) > 60) { problemas.push({ path: `${path}.nombre`, message: "un nombre de 1 a 60 bytes (lo que se lee en el cartel y en el panel)" }); continue; }
    const tipo = String(e.tipo ?? "") as Tipo;
    if (!(TIPOS as readonly string[]).includes(tipo)) { problemas.push({ path: `${path}.tipo`, message: `tipo: ${TIPOS.join(", ")}` }); continue; }
    const num = (k: string) => typeof e[k] === "number" && Number.isFinite(e[k]);
    const ent = (k: string) => num(k) && Number.isInteger(e[k]);
    if (!num("x") || !num("z")) { problemas.push({ path, message: "x y z en metros (números)" }); continue; }
    let inicio = 0, tope = 0;
    if (tipo === "cuenta_atras") {
      if (!ent("segundos") || (e.segundos as number) < 1 || (e.segundos as number) > SEGUNDOS_MAX) { problemas.push({ path: `${path}.segundos`, message: `segundos: entero de 1 a ${SEGUNDOS_MAX}` }); continue; }
      inicio = e.segundos as number;
    } else if (tipo === "contador") {
      if (e.inicio !== undefined && (!ent("inicio") || Math.abs(e.inicio as number) > VALOR_MAX)) { problemas.push({ path: `${path}.inicio`, message: `inicio: entero entre -${VALOR_MAX} y ${VALOR_MAX} (0 si falta)` }); continue; }
      if (e.tope !== undefined && (!ent("tope") || Math.abs(e.tope as number) > VALOR_MAX)) { problemas.push({ path: `${path}.tope`, message: `tope: entero entre -${VALOR_MAX} y ${VALOR_MAX} (0 = sin tope)` }); continue; }
      inicio = (e.inicio as number) ?? 0; tope = (e.tope as number) ?? 0;
      if (tope !== 0 && tope === inicio) { problemas.push({ path: `${path}.tope`, message: "el tope no puede ser el valor de inicio" }); continue; }
    }
    const donde = e.donde === undefined ? "ambos" : String(e.donde);
    if (!(DONDE as readonly string[]).includes(donde)) { problemas.push({ path: `${path}.donde`, message: `donde: ${DONDE.join(", ")} (ambos si falta)` }); continue; }
    const manda = e.manda === undefined ? "dirige" : String(e.manda);
    if (!(MANDA as readonly string[]).includes(manda)) { problemas.push({ path: `${path}.manda`, message: `manda: ${MANDA.join(", ")} (dirige si falta)` }); continue; }
    const variante = e.variante === undefined ? "ninguna" : String(e.variante);
    if (!(VARIANTES as readonly string[]).includes(variante)) { problemas.push({ path: `${path}.variante`, message: `variante: ${VARIANTES.join(", ")} (ninguna si falta)` }); continue; }
    const evento = e.evento === undefined ? "" : String(e.evento);
    if (evento && !/^[a-z0-9-]{1,32}$/.test(evento)) { problemas.push({ path: `${path}.evento`, message: "evento: un nombre de 1 a 32 letras minúsculas, cifras o guiones (lo que oye el cable)" }); continue; }
    if (e.radio !== undefined && (!num("radio") || (e.radio as number) < 1 || (e.radio as number) > 16)) { problemas.push({ path: `${path}.radio`, message: "radio: de 1 a 16 metros (4 si falta)" }); continue; }
    if (valor.length >= CONTADORES_MAX) { problemas.push({ path, message: `como mucho ${CONTADORES_MAX} contadores por mundo` }); break; }
    vistos.add(id);
    valor.push({ id, nombre, tipo, x: Number(e.x), z: Number(e.z), y: num("y") ? Number(e.y) : undefined, radio: num("radio") ? Number(e.radio) : undefined, inicio, tope, donde: donde as Donde, evento, manda: manda as Manda, variante: variante as Variante });
  }
  return { valor, problemas };
}

/** What a person reads on the sign and the panel: a countdown or a clock as m:ss (h:mm:ss past an hour), a counter as
 * «valor» or «valor / tope». */
export function formato(tipo: Tipo, valor: number, tope = 0): string {
  if (tipo === "contador") return tope ? `${valor} / ${tope}` : String(valor);
  const s = Math.max(0, valor), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
