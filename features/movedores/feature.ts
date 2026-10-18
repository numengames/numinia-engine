// movedores — declaration (v1, D-043 «mover y girar objetos del mundo, con duración, igual para todos»). A piece
// (pieza) any world turns on with a file: `entorno/movedores.json` lists moving things — a platform that rides up
// and down, a lift that shuttles between floors, a sliding door that opens and closes. Each one goes between two
// poses (position + yaw/pitch/roll) over a duration the SERVER times (not the page): everyone near sees the same
// thing at the same instant, published a few times a second (not every tick) while it moves, same as a door's
// hinge but timed instead of instant. Two kinds:
//   - `vaiven` loops forever on its own: pose A → pose B → pose A…, waiting `espera` seconds at each end
//     (a platform, a shuttle lift).
//   - `interruptor` waits at pose A until someone nearby orders `activa` («E: usar», the same gesture a door
//     takes), then rides to pose B; the next order sends it back — a sliding door, a button-called lift.
// The page only draws the model (`view.place`) where the server says; it never decides where the thing is, so two
// people never see it in different places. Recipe: docs/EXTENDER.md.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who gets a movedor in the shared state, from afar (m). */
export const ALCANCE_M = 64;
/** Who hears it arrive besides who is right next to it (m). */
export const CERCA_M = 30;
/** Most movedores one world lists. */
export const MOVEDORES_MAX = 24;
/** The server ticks at 20 Hz; the pose is published this often while moving (4 → 5 Hz: smooth enough for a
 * platform or a door, far cheaper than every tick). Estimated, not yet measured under load (see docs/BACKLOG.md). */
export const PUBLICA_CADA_TICKS = 4;
export const TICK_HZ = 20;
/** Longest A→B ride (s). */
export const DURACION_MAX_S = 120;
/** Longest pause at an end before a `vaiven` turns back (s). */
export const ESPERA_MAX_S = 600;
export const TIPOS = ["vaiven", "interruptor"] as const;
export const LADOS = ["a", "b"] as const;
export type Tipo = (typeof TIPOS)[number];
export type Lado = (typeof LADOS)[number];

const ID = { kind: "text", maxBytes: 16 } as const;
const COORD = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const GRADO = { kind: "fixed", min: -1080, max: 1080, step: 0.1, default: 0 } as const;
const ESCALA = { kind: "fixed", min: 0.01, max: 50, step: 0.01, default: 1 } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;
const MODELO = { kind: "text", maxBytes: 80 } as const;
const EVENTO = { kind: "text", maxBytes: 32, default: "" } as const;

export const movedores = defineFeature({
  id: "movedores",
  version: 1,
  level: "base",
  describe:
    "Objetos que el servidor mueve y gira de una postura a otra con una duración, igual para todos: una plataforma o un ascensor que va y viene solo (vaiven), o una puerta corredera que espera hasta que alguien cercano la activa (interruptor).",
  state: {
    describe:
      "Un movedor por clave: nombre, modelo (GLB), tipo (vaiven = va y vuelve solo; interruptor = espera una orden), las dos posturas (ax,ay,az,arx,ary,arz = A; bx,by,bz,brx,bry,brz = B, grados), su escala (sx,sy,sz), cuánto tarda de una a otra (duracion, s), cuánto espera en cada punta antes de volver (espera, s; solo vaiven), desde cuánto se activa (radio, m; solo interruptor), el nombre del evento que suena al llegar a cada punta (evento), y la postura y el movimiento de ahora: x,y,z,rx,ry,rz (dónde está ya interpolado), lado (a, b o entre) y marcha (si se está moviendo).",
    fields: {
      nombre: NOMBRE,
      modelo: MODELO,
      tipo: { kind: "enum", values: [...TIPOS] },
      ax: COORD, ay: COORD, az: COORD, arx: GRADO, ary: GRADO, arz: GRADO,
      bx: COORD, by: COORD, bz: COORD, brx: GRADO, bry: GRADO, brz: GRADO,
      sx: ESCALA, sy: ESCALA, sz: ESCALA,
      duracion: { kind: "fixed", min: 0.2, max: DURACION_MAX_S, step: 0.1 },
      espera: { kind: "fixed", min: 0, max: ESPERA_MAX_S, step: 0.1, default: 0 },
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 2.5 },
      evento: EVENTO,
      x: COORD, y: COORD, z: COORD, rx: GRADO, ry: GRADO, rz: GRADO,
      lado: { kind: "enum", values: ["a", "b", "entre"] },
      marcha: { kind: "bool", default: false },
    },
    card: {
      role: "lugar",
      name: "{nombre}",
      description: "Movedor del mundo: lo lleva el servidor, todos lo ven igual",
      at: ["x", "z"],
      actions: ["activa"],
      interact: { intent: "activa", prompt: "usar {nombre}", radius: "radio", key: "id" },
    },
    radius: ALCANCE_M,
  },
  intents: {
    activa: {
      describe: "Pedir que un movedor «interruptor» se mueva al otro lado. Hay que estar a su alcance (radio); se ignora si ya se está moviendo o es «vaiven».",
      spoken: "activar el movedor",
      fields: { id: ID },
      rate: { perSecond: 2, burst: 4 },
    },
  },
  events: {
    llegada: {
      describe: "Un movedor llegó a un lado (a o b) y se detuvo. A quien esté cerca (CERCA_M); lleva el nombre del evento del fichero para que otra pieza (el cable) lo use.",
      fields: { id: ID, nombre: NOMBRE, lado: { kind: "enum", values: [...LADOS] }, evento: EVENTO },
      announce: { text: "{nombre} ha llegado", sound: "paso", importance: 1 },
    },
    rechazado: {
      describe: "La orden no se hizo, y por qué (lejos, ya se mueve, no existe, es vaiven).",
      fields: { motivo: { kind: "text", maxBytes: 160 } },
      announce: { text: "{motivo}", sound: "error", importance: 1 },
    },
  },
});

/** A movedor as the world's file lists it (numinia-engine/movedores@1). */
export type MovedorFichero = {
  id: string; nombre: string; modelo: string; tipo: Tipo;
  ax: number; ay: number; az: number; arx: number; ary: number; arz: number;
  bx: number; by: number; bz: number; brx: number; bry: number; brz: number;
  sx: number; sy: number; sz: number;
  duracion: number; espera: number; radio: number; evento: string; empiezaEn: Lado;
};
export type Problema = { path: string; message: string };
const PLANTILLA =
  '{ "schema": "numinia-engine/movedores@1", "movedores": [{ "id": "plataforma1", "nombre": "Plataforma", "modelo": "<hash del GLB>", "tipo": "vaiven", "ax": 0, "ay": 0, "az": 0, "bx": 0, "by": 4, "bz": 0, "duracion": 4 }] }';

/** Read entorno/movedores.json. Each wrong line is left out WITH its reason (path + how to fix); the rest is used. */
export function leerMovedores(crudo: unknown): { valor: MovedorFichero[]; problemas: Problema[] } {
  const problemas: Problema[] = [], valor: MovedorFichero[] = [];
  if (crudo === undefined || crudo === null) return { valor, problemas };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { valor, problemas: [{ path: "movedores", message: `movedores.json es un objeto: ${PLANTILLA}` }] };
  const o = crudo as { schema?: unknown; movedores?: unknown };
  if (o.schema !== undefined && o.schema !== "numinia-engine/movedores@1") problemas.push({ path: "movedores.schema", message: 'el esquema es "numinia-engine/movedores@1"' });
  if (o.movedores !== undefined && !Array.isArray(o.movedores)) { problemas.push({ path: "movedores.movedores", message: `una lista de movedores: ${PLANTILLA}` }); return { valor, problemas }; }
  const vistos = new Set<string>();
  for (const [i, c] of (Array.isArray(o.movedores) ? o.movedores : []).entries()) {
    const path = `movedores.movedores[${i}]`, e = c as Record<string, unknown>;
    if (!e || typeof e !== "object" || Array.isArray(e)) { problemas.push({ path, message: "cada movedor es un objeto" }); continue; }
    const id = String(e.id ?? "");
    if (!/^[a-z0-9-]{1,16}$/.test(id)) { problemas.push({ path: `${path}.id`, message: "un id de 1 a 16 letras minúsculas, cifras o guiones" }); continue; }
    if (vistos.has(id)) { problemas.push({ path: `${path}.id`, message: `«${id}» está repetido` }); continue; }
    const nombre = String(e.nombre ?? "").trim();
    if (!nombre || new TextEncoder().encode(nombre).length > 60) { problemas.push({ path: `${path}.nombre`, message: "un nombre de 1 a 60 bytes" }); continue; }
    const modelo = String(e.modelo ?? "");
    if (!modelo || new TextEncoder().encode(modelo).length > 80) { problemas.push({ path: `${path}.modelo`, message: "modelo: el hash del GLB (1 a 80 bytes)" }); continue; }
    const tipo = String(e.tipo ?? "") as Tipo;
    if (!(TIPOS as readonly string[]).includes(tipo)) { problemas.push({ path: `${path}.tipo`, message: `tipo: ${TIPOS.join(", ")}` }); continue; }
    const num = (k: string) => typeof e[k] === "number" && Number.isFinite(e[k]);
    let malo = false;
    for (const k of ["ax", "ay", "az", "bx", "by", "bz"]) if (!num(k)) { problemas.push({ path: `${path}.${k}`, message: `${k}: un número (metros)` }); malo = true; break; }
    if (malo) continue;
    for (const k of ["arx", "ary", "arz", "brx", "bry", "brz"]) if (e[k] !== undefined && (!num(k) || Math.abs(e[k] as number) > 1080)) { problemas.push({ path: `${path}.${k}`, message: `${k}: grados entre -1080 y 1080 (0 si falta)` }); malo = true; break; }
    if (malo) continue;
    if (!num("duracion") || (e.duracion as number) < 0.2 || (e.duracion as number) > DURACION_MAX_S) { problemas.push({ path: `${path}.duracion`, message: `duracion: segundos de 0,2 a ${DURACION_MAX_S}` }); continue; }
    if (e.espera !== undefined && (!num("espera") || (e.espera as number) < 0 || (e.espera as number) > ESPERA_MAX_S)) { problemas.push({ path: `${path}.espera`, message: `espera: segundos de 0 a ${ESPERA_MAX_S} (0 si falta)` }); continue; }
    if (e.radio !== undefined && (!num("radio") || (e.radio as number) < 1 || (e.radio as number) > 16)) { problemas.push({ path: `${path}.radio`, message: "radio: de 1 a 16 metros (2,5 si falta)" }); continue; }
    for (const k of ["sx", "sy", "sz"]) if (e[k] !== undefined && (!num(k) || (e[k] as number) <= 0 || (e[k] as number) > 50)) { problemas.push({ path: `${path}.${k}`, message: `${k}: de 0,01 a 50 (1 si falta)` }); malo = true; break; }
    if (malo) continue;
    const evento = e.evento === undefined ? "" : String(e.evento);
    if (evento && !/^[a-z0-9-]{1,32}$/.test(evento)) { problemas.push({ path: `${path}.evento`, message: "evento: un nombre de 1 a 32 letras minúsculas, cifras o guiones (lo que oye el cable)" }); continue; }
    const empiezaEn = e.empiezaEn === undefined ? "a" : String(e.empiezaEn);
    if (!(LADOS as readonly string[]).includes(empiezaEn)) { problemas.push({ path: `${path}.empiezaEn`, message: 'empiezaEn: "a" o "b" ("a" si falta)' }); continue; }
    if (valor.length >= MOVEDORES_MAX) { problemas.push({ path, message: `como mucho ${MOVEDORES_MAX} movedores por mundo` }); break; }
    vistos.add(id);
    valor.push({
      id, nombre, modelo, tipo,
      ax: Number(e.ax), ay: Number(e.ay), az: Number(e.az), arx: Number(e.arx ?? 0), ary: Number(e.ary ?? 0), arz: Number(e.arz ?? 0),
      bx: Number(e.bx), by: Number(e.by), bz: Number(e.bz), brx: Number(e.brx ?? 0), bry: Number(e.bry ?? 0), brz: Number(e.brz ?? 0),
      sx: Number(e.sx ?? 1), sy: Number(e.sy ?? 1), sz: Number(e.sz ?? 1),
      duracion: Number(e.duracion), espera: Number(e.espera ?? 0), radio: Number(e.radio ?? 2.5), evento, empiezaEn: empiezaEn as Lado,
    });
  }
  return { valor, problemas };
}

/** The pose (position + rotation) a movedor has at side `lado`. Pure: the test checks it. */
export function poseDe(f: Pick<MovedorFichero, "ax" | "ay" | "az" | "arx" | "ary" | "arz" | "bx" | "by" | "bz" | "brx" | "bry" | "brz">, lado: Lado) {
  return lado === "a"
    ? { x: f.ax, y: f.ay, z: f.az, rx: f.arx, ry: f.ary, rz: f.arz }
    : { x: f.bx, y: f.by, z: f.bz, rx: f.brx, ry: f.bry, rz: f.brz };
}

/** Linear interpolation between two poses at fraction `t` (0 = first, 1 = second). Pure: the test checks it. */
export function lerpPose(p0: ReturnType<typeof poseDe>, p1: ReturnType<typeof poseDe>, t: number) {
  const k = Math.max(0, Math.min(1, t));
  const l = (a: number, b: number) => a + (b - a) * k;
  return { x: l(p0.x, p1.x), y: l(p0.y, p1.y), z: l(p0.z, p1.z), rx: l(p0.rx, p1.rx), ry: l(p0.ry, p1.ry), rz: l(p0.rz, p1.rz) };
}
