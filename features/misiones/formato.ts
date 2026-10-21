// misiones — the formats an adventure writes as text files (J5), and their checks. An adventure is a folder:
//   misiones/<id>.json   mision@1   a quest: steps with conditions, rewards, texts
//   pnj/<id>.json        pnj@1      a person of the world (PNJ) with a deterministic dialogue tree gated by quest state
//   cosas/<id>.json      cosa@1     a thing in the world you take or use (the J4 prompt «E: coger la caja»)
//   secuencias/<id>.json secuencia@1 (U14 (5)) a short scripted moment — people move, extra models show, lines appear —
//                        played only on the pages of the player whose step names it (`secuencia`); a step may also
//                        wait (`espera`, seconds) before it can be done. Run time: secuencia.ts
// Vertical worlds: a person and a thing may carry `posicion.y` (metres above the ground) and a `llega_a` step a `y`;
// reach then also asks for the player's height (packages/feature ALCANCE_ALTURA_M). Absent = the ground, as before.
// Steps in any order (U14): consecutive steps with the same `grupo` form a block done in any order; `recibe` = a person
// gives you a thing; `entrega` may name several things (`cosas`). All optional: files without them read as before.
// A person may say its trade (pnj@1 `oficio`, U14 (4)): a second, smaller line under the name.
// The recipe for authors (people or LLMs) is docs/EXTENDER.md «Misiones y PNJ». Every check returns Result with paths
// that say how to fix each problem; nothing here throws, touches the network or the world.
import type { Issue, Result } from "../../packages/core/src/index.ts";
import { SOUNDS } from "../../packages/feature/src/index.ts"; // U14 (5): a sequence's sounds are the house's
import type { Sound } from "../../packages/feature/src/index.ts";
import biblioteca from "../objetos/biblioteca.json" with { type: "json" }; // U14 (5): what a missing model can be instead

export const FORMATOS = { mision: "mision@1", pnj: "pnj@1", cosa: "cosa@1" } as const;
export const TIPOS_PASO = ["llega_a", "habla_con", "usa", "coge", "entrega", "recibe", "hace"] as const; // new kinds go at the end (the wire's enum)
/** T1, step `hace` (the builder DOES something): the closed list of actions. The server decides the first ten from events the
 * other pieces already emit (objetos `hizo`, disparadores `hizo` / `senal`); the last three happen on the page, which the server
 * cannot see: the page says so with the intent `hace`, and only for those (ACCIONES_PAGINA). New ones go at the end. */
export const ACCIONES_HACE = ["coloca", "mueve", "gira", "escala", "oculta", "borra", "crea_cable", "edita_cable", "borra_cable", "dispara_cable", "abre_construir", "abre_cable", "abre_biblioteca"] as const;
export const ACCIONES_PAGINA = ["abre_construir", "abre_cable", "abre_biblioteca"] as const;
export type AccionHace = (typeof ACCIONES_HACE)[number];
const CON_CABLE: readonly string[] = ["crea_cable", "edita_cable", "borra_cable", "dispara_cable"];
/** The sha256 of a library model by its id (`bloque`, `farolillo`…), or "" when the library has none. */
export const shaDeBiblioteca = (id: string): string => biblioteca.modelos.find((m) => m.id === id)?.modelo ?? "";
export const ESTADOS = ["sin_empezar", "disponible", "activa", "hecha"] as const;
export const ACCIONES = ["dar_mision", "avanzar_paso", "entregar", "despedir"] as const;
/** The voices a person can have (pnj@1 `voz`): the house's NPC voice takes, a short wordless greeting when you start
 *  talking and a farewell when you stop (features/sonido/catalogo.json: `pnj-saludo-<voz>`, `pnj-despedida-<voz>`). New
 *  voices go at the end: a person without `voz` gets one from its id, and the order decides which. */
export const VOCES_PNJ = ["hombre-joven", "mujer-mayor"] as const;
export type VozPnj = (typeof VOCES_PNJ)[number];
/** Lengths in UTF-8 bytes (what the wire carries; letters with accents count 2) and counts. */
export const LIM = {
  id: 32, titulo: 80, descripcion: 300, textoPaso: 160, lugar: 60, nombre: 60, descripcionCosa: 140, linea: 400, opcion: 100,
  aviso: 40, textoMision: 200, pasos: 16, opciones: 4, nodos: 64, entradas: 16, recompensas: 8, requisitos: 16,
  grupo: 40, cosasEntrega: 8,
  oficio: 40, marcas: 256, // U14 (4): a person's trade (pnj@1 `oficio`); each id list of the `marcas` event (≈ 25 short ids)
} as const;
export const MUNDO = 2000; // metres: the furthest a person, a thing or a place can be (the wire's range)
export const ALTURA_MAX = 30; // metres: the highest floor a person (pnj@1 posicion.y) or a place to reach (llega_a y) can be on

export type TipoPaso = (typeof TIPOS_PASO)[number];
export type Estado = (typeof ESTADOS)[number];
/** Any step may carry `grupo` (1–40 bytes): CONSECUTIVE steps with the same grupo form a block done in any order (the
 * quest moves past it when all are done); the grupo also names the counter the player sees («Piezas reunidas 1/3»).
 * U14 (5), optional too: `secuencia` = the id of a secuencia@1 played for that player when the step is done; `espera` =
 * seconds (1–60) before it can be done, counted from when it became the step to do (in a grupo: from the block's start). */
type PasoBase = { id: string; texto: string; grupo?: string; secuencia?: string; espera?: number; senala?: string };
export type Paso = PasoBase & (
  | { tipo: "llega_a"; x: number; z: number; radio: number; lugar: string; y?: number } // y (optional, metres): the floor to reach it from
  | { tipo: "habla_con"; pnj: string }
  | { tipo: "recibe"; pnj: string; cosa: string } // the person gives you the thing: it goes to what you carry (`tiene`)
  | { tipo: "usa" | "coge"; cosa: string }
  | { tipo: "entrega"; cosa: string; pnj: string } // one thing, as written…
  | { tipo: "entrega"; cosas: string[]; pnj: string } // …or several at once (1–8); cosasDe() reads either
  | { tipo: "hace"; accion: AccionHace; modelo?: string; disparador?: string } // T1: the builder does something (modelo = a library id, only with coloca; disparador = a cable's id, only with the cable actions)
);
/** What an entrega asks for (its `cosa` or its `cosas`); for coge, usa and recibe, their one thing; else nothing. */
export const cosasDe = (s: Paso): string[] => ("cosas" in s ? s.cosas : "cosa" in s ? [s.cosa] : []);
/** A quest's reward: an `insignia` (a memory of what you did) or, N10, an `objeto` — a digital good that becomes YOURS: the
 * world signs a receipt of ownership (features/bienes) and it waits in your inventory. `descripcion`, `modelo` (sha256 of a
 * .glb: how it looks) and `licencia` (what you may do with its art: «CC0-1.0», «CC-BY-4.0»…; owning ≠ the copyright) are
 * optional and travel inside the receipt. */
export type Recompensa = { tipo: "insignia"; id: string; nombre: string } | { tipo: "semilla"; color: ColorSemilla; n: number } | { tipo: "objeto"; id: string; nombre: string; descripcion: string; modelo: string; licencia: string };
export const TIPOS_RECOMPENSA = ["insignia", "objeto"] as const;
/** N10: a licence as a short SPDX-like id (letters, digits, . - +), at most 40 characters. */
export const LICENCIA = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/;
/** Y1: a Semilla del Conocimiento as a quest reward (lore 06: five colours, 1-5 prestige points). Goes to the inventory. */
export const COLORES_SEMILLA = ["verde", "azul", "plateada", "dorada", "roja"] as const;
export type ColorSemilla = (typeof COLORES_SEMILLA)[number];
export type Mision = {
  formato: "mision@1"; id: string; titulo: string; descripcion: string; requisitos: { misiones: string[] }; pasos: Paso[];
  recompensas: Recompensa[]; textos: { aceptada: string; completada: string }; repetible: boolean;
};
/** True when every listed fact holds for this player. `paso` and `tiene` only with estado "activa"; `paso` = that step is
 * to do now (inside a grupo: one of the block's steps not done yet). */
export type Condicion = { mision: string; estado: Estado; paso?: string; tiene?: string };
export type Accion = { tipo: "dar_mision" | "avanzar_paso" | "entregar"; mision: string } | { tipo: "despedir" };
export type Opcion = { texto: string; si: Condicion[]; ir?: string; accion?: Accion };
export type Nodo = { texto: string; opciones: Opcion[] };
export type Apariencia = { modelo: string; escala: number };
/** A person's `posicion.y` (optional, metres above the ground, 0–30: the floor of a tower it stands on; 0 when absent).
 * `oficio` (optional, 1–40 bytes; "" when absent): their trade («Carpintero»), a smaller line under the name (U14 (4)).
 * `voz` (optional, one of VOCES_PNJ; "" when absent = chosen from the id, always the same): how they sound when you
 * start and stop talking to them. */
export type Pnj = {
  formato: "pnj@1"; id: string; nombre: string; oficio: string; voz: VozPnj | ""; descripcion: string; apariencia: Apariencia; posicion: { x: number; z: number; y: number };
  giro: number; radio: number; dialogo: { entradas: { si: Condicion[]; nodo: string }[]; nodos: Record<string, Nodo> };
};
/** A thing's `posicion.y` (optional, metres above the ground: a thing on a table or held up at chest height, reachable
 * with a hand in VR) and `apariencia.color` (optional «#rrggbb»: the house block in a colour, so two things differ).
 * `apariencia.usada` (optional, U14 (6)): how it looks for a player once THEY did the step that uses it (`usa`/`coge`)
 * in a quest they have or finished — the open chest; absent when the file does not say it. */
export type Cosa = { formato: "cosa@1"; id: string; nombre: string; descripcion: string; apariencia: Apariencia & { color: string; usada?: Apariencia }; posicion: { x: number; z: number; y: number }; radio: number; aviso: string };
export type Fichero = { fichero: string; texto: string };
export type Aventura = {
  misiones: Map<string, Mision>; pnjs: Map<string, Pnj>; cosas: Map<string, Cosa>;
  /** U14 (5): the scripted moments its steps may play (secuencia@1). */
  secuencias: Map<string, Secuencia>;
  /** Who offers each quest (people whose tree has dar_mision for it). */
  dadores: Map<string, string[]>;
  /** Per person, the quests whose habla_con / recibe / entrega step completes only through an explicit option
   * (avanzar_paso / entregar); for any other quest, talking to that person completes those steps by itself. */
  explicitos: Map<string, { avanza: Set<string>; entrega: Set<string> }>;
};

// ---------- small checks: each pushes an issue with its path and returns a usable value ----------
type O = Record<string, unknown>;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/, SHA = /^[0-9a-f]{64}$/, SENALA = /^[a-z0-9-]{1,32}$/;
const utf8 = new TextEncoder();
const bytes = (s: string) => utf8.encode(s).length;
const esObjeto = (v: unknown): v is O => typeof v === "object" && v !== null && !Array.isArray(v);
const en = (path: string, k: string | number) => (typeof k === "number" ? `${path}[${k}]` : path ? `${path}.${k}` : k);

function campos(o: O, permitidos: string[], path: string, is: Issue[]): void {
  for (const k of Object.keys(o)) if (!permitidos.includes(k)) is.push({ path: en(path, k), message: `campo desconocido (aquí van: ${permitidos.join(", ")})` });
}
function id(v: unknown, path: string, is: Issue[]): string {
  if (typeof v === "string" && ID.test(v)) return v;
  is.push({ path, message: "un id: minúsculas, cifras y guiones, de 1 a 32 (p. ej. \"primeros-pasos\")" });
  return "";
}
function texto(v: unknown, path: string, max: number, is: Issue[], opcional = false): string {
  if (opcional && (v === undefined || v === "")) return "";
  if (typeof v !== "string" || !v.trim()) { is.push({ path, message: `un texto de 1 a ${max} bytes` }); return ""; }
  if (bytes(v.trim()) > max) is.push({ path, message: `como mucho ${max} bytes en UTF-8 (las letras con tilde cuentan 2): acórtalo` });
  return v.trim();
}
function numero(v: unknown, path: string, min: number, max: number, is: Issue[], def?: number): number {
  if (v === undefined && def !== undefined) return def;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) { is.push({ path, message: `un número entre ${min} y ${max}` }); return def ?? min; }
  return v;
}
function objeto(v: unknown, path: string, is: Issue[], opcional = false): O | null {
  if (opcional && v === undefined) return null;
  if (!esObjeto(v)) { is.push({ path, message: "un objeto { … }" }); return null; }
  return v;
}
function lista(v: unknown, path: string, min: number, max: number, is: Issue[], opcional = false): unknown[] {
  if (opcional && v === undefined) return [];
  if (!Array.isArray(v) || v.length < min || v.length > max) { is.push({ path, message: `una lista [ … ] de ${min} a ${max} elementos` }); return Array.isArray(v) ? v.slice(0, max) : []; }
  return v;
}
function formato(o: O, esperado: string, is: Issue[]): void {
  if (o.formato !== esperado) is.push({ path: "formato", message: `debe ser "${esperado}" (la primera línea dice qué es el fichero)` });
}
function posicion(v: unknown, path: string, is: Issue[], otros: string[] = []): { x: number; z: number } {
  const o = objeto(v, path, is);
  if (!o) return { x: 0, z: 0 };
  campos(o, ["x", "z", ...otros], path, is);
  return { x: numero(o.x, en(path, "x"), -MUNDO, MUNDO, is), z: numero(o.z, en(path, "z"), -MUNDO, MUNDO, is) };
}
function apariencia(v: unknown, path: string, is: Issue[], otros: string[] = []): Apariencia {
  const o = objeto(v, path, is, true);
  if (!o) return { modelo: "", escala: 1 };
  campos(o, ["modelo", "escala", "vrm", ...otros], path, is);
  const modelo = o.modelo === undefined ? "" : typeof o.modelo === "string" && SHA.test(o.modelo) ? o.modelo : (is.push({ path: en(path, "modelo"), message: "el sha256 (64 letras hex) de un .glb de la biblioteca (features/objetos/biblioteca.json) o subido; sin él, el de la casa" }), "");
  if (o.vrm !== undefined && !(typeof o.vrm === "string" && SHA.test(o.vrm))) is.push({ path: en(path, "vrm"), message: "el sha256 de un .vrm (reservado: hoy se dibuja el modelo)" });
  return { modelo, escala: numero(o.escala, en(path, "escala"), 0.05, 50, is, 1) };
}
function condiciones(v: unknown, path: string, is: Issue[]): Condicion[] {
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((c, i) => {
    const p = Array.isArray(v) ? en(path, i) : path, o = objeto(c, p, is);
    if (!o) return { mision: "", estado: "activa" as const };
    campos(o, ["mision", "estado", "paso", "tiene"], p, is);
    const estado = ESTADOS.includes(o.estado as Estado) ? (o.estado as Estado) : (is.push({ path: en(p, "estado"), message: `uno de: ${ESTADOS.join(", ")}` }), "activa" as const);
    const out: Condicion = { mision: id(o.mision, en(p, "mision"), is), estado };
    if (o.paso !== undefined) out.paso = id(o.paso, en(p, "paso"), is);
    if (o.tiene !== undefined) out.tiene = id(o.tiene, en(p, "tiene"), is);
    if ((out.paso || out.tiene) && estado !== "activa") is.push({ path: p, message: "paso y tiene solo valen con estado \"activa\"" });
    return out;
  });
}
const parse = (f: Fichero, is: Issue[]): unknown => {
  try { return JSON.parse(f.texto); } catch (e) { is.push({ path: "", message: `no es JSON válido: ${String((e as Error).message)}` }); return null; }
};
const resultado = <T>(is: Issue[], v: T): Result<T> => (is.length ? { ok: false, issues: is } : { ok: true, value: v });

// ---------- mision@1 ----------
function paso(v: unknown, path: string, is: Issue[]): Paso {
  const o = objeto(v, path, is) ?? {};
  const tipo = TIPOS_PASO.includes(o.tipo as TipoPaso) ? (o.tipo as TipoPaso) : (is.push({ path: en(path, "tipo"), message: `uno de: ${TIPOS_PASO.join(", ")}` }), "llega_a" as const);
  const base = { id: id(o.id, en(path, "id"), is), texto: texto(o.texto, en(path, "texto"), LIM.textoPaso, is) };
  const permite = (...k: string[]) => campos(o, ["id", "tipo", "texto", ...k, "grupo", "secuencia", "espera", "senala"], path, is); // any step may have these
  let p: Paso;
  if (tipo === "llega_a") {
    permite("x", "z", "radio", "lugar", "y");
    const l: Extract<Paso, { tipo: "llega_a" }> = { ...base, tipo, x: numero(o.x, en(path, "x"), -MUNDO, MUNDO, is), z: numero(o.z, en(path, "z"), -MUNDO, MUNDO, is), radio: numero(o.radio, en(path, "radio"), 1, 50, is, 4), lugar: texto(o.lugar, en(path, "lugar"), LIM.lugar, is) };
    if (o.y !== undefined) l.y = numero(o.y, en(path, "y"), 0, ALTURA_MAX, is); // optional: arriving also means standing at that height (± ALCANCE_ALTURA_M)
    p = l;
  } else if (tipo === "habla_con") { permite("pnj"); p = { ...base, tipo, pnj: id(o.pnj, en(path, "pnj"), is) }; }
  else if (tipo === "recibe") { permite("pnj", "cosa"); p = { ...base, tipo, pnj: id(o.pnj, en(path, "pnj"), is), cosa: id(o.cosa, en(path, "cosa"), is) }; }
  else if (tipo === "entrega") { permite("cosa", "cosas", "pnj"); p = entrega(o, base, path, is); }
  else if (tipo === "hace") { permite("accion", "modelo", "disparador"); p = hace(o, base, path, is); }
  else { permite("cosa"); p = { ...base, tipo, cosa: id(o.cosa, en(path, "cosa"), is) }; }
  if (o.senala !== undefined) { // T1: the id of the page's button the arrow will point at (any step); only checked and carried here
    if (typeof o.senala === "string" && SENALA.test(o.senala)) p.senala = o.senala;
    else is.push({ path: en(path, "senala"), message: "el id del botón de la página que señala la flecha: minúsculas, cifras y guiones, de 1 a 32 (p. ej. \"dock-cable\")" });
  }
  if (o.grupo !== undefined) p.grupo = texto(o.grupo, en(path, "grupo"), LIM.grupo, is);
  if (o.secuencia !== undefined) p.secuencia = id(o.secuencia, en(path, "secuencia"), is); // U14 (5): played for you when done
  if (o.espera !== undefined) p.espera = numero(o.espera, en(path, "espera"), 1, ESPERA_MAX, is); // U14 (5): seconds before it can be done
  return p;
}
/** hace: `accion` (one of ACCIONES_HACE); `modelo` (a library id) only with coloca; `disparador` (a cable id) only with the cable actions. */
function hace(o: O, base: { id: string; texto: string }, path: string, is: Issue[]): Paso {
  const accion = ACCIONES_HACE.includes(o.accion as AccionHace) ? (o.accion as AccionHace) : (is.push({ path: en(path, "accion"), message: `qué hace quien construye, una de: ${ACCIONES_HACE.join(", ")}` }), "coloca" as const);
  const p: Extract<Paso, { tipo: "hace" }> = { ...base, tipo: "hace", accion };
  if (o.modelo !== undefined) {
    if (accion !== "coloca") is.push({ path: en(path, "modelo"), message: "«modelo» solo va con la acción \"coloca\" (cuenta solo un objeto de ese modelo); quítalo o cambia la acción" });
    else if (typeof o.modelo !== "string" || !shaDeBiblioteca(o.modelo)) is.push({ path: en(path, "modelo"), message: `el id de un modelo de la biblioteca (${biblioteca.modelos.map((m) => m.id).join(", ")}), no su sha256` });
    else p.modelo = o.modelo;
  }
  if (o.disparador !== undefined) {
    if (!CON_CABLE.includes(accion)) is.push({ path: en(path, "disparador"), message: `«disparador» solo va con las acciones de cable (${CON_CABLE.join(", ")}); quítalo o cambia la acción` });
    else p.disparador = id(o.disparador, en(path, "disparador"), is);
  }
  return p;
}
/** entrega: `cosa` (one thing) or `cosas` (1–8, given all at once), never both; kept as written (cosasDe reads either). */
function entrega(o: O, base: { id: string; texto: string }, path: string, is: Issue[]): Paso {
  const pnj = id(o.pnj, en(path, "pnj"), is);
  if (o.cosas === undefined) {
    if (o.cosa === undefined) is.push({ path: en(path, "cosa"), message: "qué se entrega: \"cosa\": \"<id>\" (una) o \"cosas\": [\"<id>\", …] (varias a la vez)" });
    return { ...base, tipo: "entrega", cosa: o.cosa === undefined ? "" : id(o.cosa, en(path, "cosa"), is), pnj };
  }
  if (o.cosa !== undefined) is.push({ path: en(path, "cosa"), message: "o \"cosa\" (una) o \"cosas\" (varias), no las dos: pon la cosa dentro de \"cosas\"" });
  const cosas = lista(o.cosas, en(path, "cosas"), 1, LIM.cosasEntrega, is).map((c, j) => id(c, en(en(path, "cosas"), j), is));
  cosas.forEach((c, j) => { if (c && cosas.indexOf(c) < j) is.push({ path: en(en(path, "cosas"), j), message: `«${c}» ya está en la lista: cada cosa, una vez` }); });
  return { ...base, tipo: "entrega", cosas, pnj };
}
/** A grupo is ONE run of consecutive steps: the same name again further on would be a second block (a mistake). */
function gruposSeguidos(pasos: Paso[], is: Issue[]): void {
  const primero = new Map<string, number>(); // grupo → the first step of its run
  pasos.forEach((p, i) => {
    if (!p.grupo || pasos[i - 1]?.grupo === p.grupo) return;
    const antes = primero.get(p.grupo);
    if (antes === undefined) primero.set(p.grupo, i);
    else is.push({ path: en(en("pasos", i), "grupo"), message: `«${p.grupo}» ya es el grupo de pasos[${antes}]: los pasos de un grupo van seguidos (pon este junto a ellos, o dale otro nombre si es otro grupo)` });
  });
}

/** One quest file, on its own (references to people, things and other quests are checked by cargarAventura). */
export function leerMision(v: unknown): Result<Mision> {
  const is: Issue[] = [];
  const o = objeto(v, "", is);
  if (!o) return resultado(is, null as never);
  campos(o, ["formato", "id", "titulo", "descripcion", "requisitos", "pasos", "recompensas", "textos", "repetible", "notas"], "", is);
  formato(o, FORMATOS.mision, is);
  const req = objeto(o.requisitos, "requisitos", is, true);
  if (req) campos(req, ["misiones"], "requisitos", is);
  const pasos = lista(o.pasos, "pasos", 1, LIM.pasos, is).map((p, i) => paso(p, en("pasos", i), is));
  const vistos = new Set<string>();
  pasos.forEach((p, i) => { if (p.id && vistos.has(p.id)) is.push({ path: en(en("pasos", i), "id"), message: `«${p.id}» ya es otro paso: cada paso, un id distinto` }); vistos.add(p.id); });
  gruposSeguidos(pasos, is);
  const recompensas = lista(o.recompensas, "recompensas", 0, LIM.recompensas, is, true).map((r, i) => {
    const p = en("recompensas", i), ro = objeto(r, p, is) ?? {};
    if (ro.tipo === "objeto") return objetoRecompensa(ro, p, is);
    if (ro.tipo === "semilla") { // Y1: a Semilla del Conocimiento into the inventory (the Reserva, features/inventario)
      campos(ro, ["tipo", "color", "n"], p, is);
      const color = COLORES_SEMILLA.includes(ro.color as ColorSemilla) ? (ro.color as ColorSemilla) : (is.push({ path: en(p, "color"), message: `uno de: ${COLORES_SEMILLA.join(", ")}` }), "verde" as const);
      const n = ro.n === undefined ? 1 : Number.isInteger(ro.n) && (ro.n as number) >= 1 && (ro.n as number) <= 99 ? (ro.n as number) : (is.push({ path: en(p, "n"), message: "entero de 1 a 99 (cuántas semillas)" }), 1);
      return { tipo: "semilla" as const, color, n };
    }
    campos(ro, ["tipo", "id", "nombre"], p, is);
    if (ro.tipo !== "insignia") is.push({ path: en(p, "tipo"), message: "\"insignia\" (un recuerdo de lo hecho), \"semilla\" (una Semilla del Conocimiento al inventario) u \"objeto\" (un bien digital que pasa a ser de quien completa: recibo firmado e inventario)" });
    return { tipo: "insignia" as const, id: id(ro.id, en(p, "id"), is), nombre: texto(ro.nombre, en(p, "nombre"), LIM.nombre, is) };
  });
  const ids = new Set<string>();
  recompensas.forEach((r, i) => { if (r.tipo === "semilla") return; if (r.id && ids.has(r.id)) is.push({ path: en(en("recompensas", i), "id"), message: `«${r.id}» ya es otra recompensa de esta misión: cada una, un id distinto` }); ids.add(r.id); });
  const tx = objeto(o.textos, "textos", is, true) ?? {};
  campos(tx, ["aceptada", "completada"], "textos", is);
  if (o.repetible !== undefined && typeof o.repetible !== "boolean") is.push({ path: "repetible", message: "true o false" });
  if (o.notas !== undefined && typeof o.notas !== "string") is.push({ path: "notas", message: "un texto para quien escribe (no se muestra)" });
  return resultado(is, {
    formato: FORMATOS.mision, id: id(o.id, "id", is), titulo: texto(o.titulo, "titulo", LIM.titulo, is), descripcion: texto(o.descripcion, "descripcion", LIM.descripcion, is),
    requisitos: { misiones: lista(req?.misiones, "requisitos.misiones", 0, LIM.requisitos, is, true).map((m, i) => id(m, `requisitos.misiones[${i}]`, is)) },
    pasos, recompensas, repetible: o.repetible === true,
    textos: { aceptada: texto(tx.aceptada, "textos.aceptada", LIM.textoMision, is, true), completada: texto(tx.completada, "textos.completada", LIM.textoMision, is, true) },
  });
}

/** N10: `{ "tipo": "objeto", "id", "nombre", "descripcion"?, "modelo"?: "<sha256 de un .glb>", "licencia"?: "CC0-1.0" }`. */
function objetoRecompensa(ro: Record<string, unknown>, p: string, is: Issue[]): Recompensa {
  campos(ro, ["tipo", "id", "nombre", "descripcion", "modelo", "licencia"], p, is);
  let modelo = "", licencia = "";
  if (ro.modelo !== undefined) { if (typeof ro.modelo === "string" && SHA.test(ro.modelo)) modelo = ro.modelo; else is.push({ path: en(p, "modelo"), message: "el sha256 (64 letras hex) del .glb del objeto (subido al mundo o de la biblioteca)" }); }
  if (ro.licencia !== undefined) { if (typeof ro.licencia === "string" && LICENCIA.test(ro.licencia)) licencia = ro.licencia; else is.push({ path: en(p, "licencia"), message: "la licencia de su arte como un id corto (\"CC0-1.0\", \"CC-BY-4.0\"): tener el objeto no da los derechos de su obra" }); }
  return { tipo: "objeto", id: id(ro.id, en(p, "id"), is), nombre: texto(ro.nombre, en(p, "nombre"), LIM.nombre, is), descripcion: texto(ro.descripcion, en(p, "descripcion"), LIM.descripcionCosa, is, true), modelo, licencia };
}

// ---------- secuencia@1 (U14 (5)): a short scripted moment that only the player who caused it sees ----------
// A step names it (`secuencia`); when the server sees that step done it sends the sequence to that player's pages alone,
// which play it (secuencia.ts): people move (their model, on that page only), extra models show for a while (wings on
// someone's back), lines appear as the page's note, a house sound plays. Nothing of it reaches the simulation or the
// other players, and when it ends every person stands again where the server says.
export const SECUENCIA = "secuencia@1";
export const TIPOS_PISTA = ["mueve", "muestra", "texto", "sonido"] as const; // new kinds go at the end (the wire's enum)
/** secuencia@1's limits: seconds, tracks, keys per `mueve`, metres (height, offset) and bytes (a line). */
export const LIM_SECUENCIA = { duracion: 30, pistas: 16, claves: 12, alto: 60, desplazamiento: 10, texto: 120 } as const;
/** mision@1 `espera`: the most seconds a step may wait before it can be done. */
export const ESPERA_MAX = 60;
export type TipoPista = (typeof TIPOS_PISTA)[number];
/** Where a person is at second `t`: absolute world metres and its yaw (degrees). What a key leaves out is the person's
 * own (its pnj@1 posicion and giro). */
export type Clave = { t: number; x?: number; y?: number; z?: number; giro?: number };
/** `mueve`: a person along a smooth curve through its keys (still before the first, held after the last). `muestra`: a
 * model from `desde` to `hasta`, on a person (`pnj`: `offset` in its frame, its giro + `giro`, its size) or at x, y, z.
 * `texto`: a line as the page's note at `t`. `sonido`: a house sound at `t`. */
export type Pista =
  | { tipo: "mueve"; pnj: string; claves: Clave[] }
  | { tipo: "muestra"; modelo: string; pnj: string; x: number; y: number; z: number; offset: { x: number; y: number; z: number }; giro: number; escala: number; desde: number; hasta: number }
  | { tipo: "texto"; t: number; texto: string }
  | { tipo: "sonido"; t: number; sonido: Sound };
export type Secuencia = { formato: typeof SECUENCIA; id: string; duracion: number; pistas: Pista[] };

/** A moment of the sequence: seconds from 0 to its duracion. */
function momento(v: unknown, path: string, dur: number, is: Issue[], def?: number): number {
  if (v === undefined && def !== undefined) return def;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= dur) return v;
  is.push({ path, message: `un momento de la secuencia en segundos, de 0 a su duracion (${dur})` });
  return def ?? 0;
}
function pista(v: unknown, path: string, dur: number, is: Issue[]): Pista {
  const o = objeto(v, path, is) ?? {}, L = LIM_SECUENCIA;
  const tipo = TIPOS_PISTA.includes(o.tipo as TipoPista) ? (o.tipo as TipoPista) : (is.push({ path: en(path, "tipo"), message: `uno de: ${TIPOS_PISTA.join(", ")}` }), "texto" as const);
  const permite = (...k: string[]) => campos(o, ["tipo", ...k], path, is);
  if (tipo === "mueve") {
    permite("pnj", "claves");
    let antes = -1;
    const claves = lista(o.claves, en(path, "claves"), 1, L.claves, is).map((c, j) => {
      const p = en(en(path, "claves"), j), co = objeto(c, p, is) ?? {};
      campos(co, ["t", "x", "y", "z", "giro"], p, is);
      const n0 = is.length, k: Clave = { t: momento(co.t, en(p, "t"), dur, is) };
      if (is.length === n0 && j > 0 && k.t <= antes) is.push({ path: en(p, "t"), message: `cada clave va después de la anterior (aquí ${k.t} s, la anterior ${antes} s)` });
      antes = Math.max(antes, k.t);
      if (co.x !== undefined) k.x = numero(co.x, en(p, "x"), -MUNDO, MUNDO, is);
      if (co.y !== undefined) k.y = numero(co.y, en(p, "y"), 0, L.alto, is);
      if (co.z !== undefined) k.z = numero(co.z, en(p, "z"), -MUNDO, MUNDO, is);
      if (co.giro !== undefined) k.giro = numero(co.giro, en(p, "giro"), -180, 180, is);
      return k;
    });
    return { tipo, pnj: id(o.pnj, en(path, "pnj"), is), claves };
  }
  if (tipo === "muestra") {
    permite("modelo", "pnj", "x", "y", "z", "offset", "giro", "escala", "desde", "hasta");
    const modelo = typeof o.modelo === "string" && SHA.test(o.modelo) ? o.modelo : (is.push({ path: en(path, "modelo"), message: "el sha256 (64 letras hex) de un .glb que tenga el servidor (de la biblioteca de la casa o subido)" }), "");
    const sigue = o.pnj !== undefined, pnj = sigue ? id(o.pnj, en(path, "pnj"), is) : "";
    if (sigue && (o.x !== undefined || o.y !== undefined || o.z !== undefined)) is.push({ path, message: "o «pnj» (va con esa persona; colócalo con «offset») o «x», «y», «z» (se queda ahí), no los dos" });
    if (!sigue && o.offset !== undefined) is.push({ path: en(path, "offset"), message: "«offset» va con «pnj» (cuánto se aparta de esa persona); sin pnj, pon el sitio en «x», «y», «z»" });
    const off = objeto(o.offset, en(path, "offset"), is, true) ?? {}, D = L.desplazamiento;
    campos(off, ["x", "y", "z"], en(path, "offset"), is);
    const d = (k: string) => numero(off[k], en(en(path, "offset"), k), -D, D, is, 0);
    const desde = momento(o.desde, en(path, "desde"), dur, is, 0), hasta = momento(o.hasta, en(path, "hasta"), dur, is, dur);
    if (hasta <= desde) is.push({ path: en(path, "hasta"), message: `después de «desde» (${desde} s): es cuándo se va` });
    return {
      tipo, modelo, pnj, desde, hasta, offset: { x: d("x"), y: d("y"), z: d("z") },
      x: sigue ? 0 : numero(o.x, en(path, "x"), -MUNDO, MUNDO, is), y: sigue ? 0 : numero(o.y, en(path, "y"), 0, L.alto, is, 0), z: sigue ? 0 : numero(o.z, en(path, "z"), -MUNDO, MUNDO, is),
      giro: numero(o.giro, en(path, "giro"), -180, 180, is, 0), escala: numero(o.escala, en(path, "escala"), 0.05, 50, is, 1),
    };
  }
  if (tipo === "sonido") {
    permite("t", "sonido");
    const sonido = SOUNDS.includes(o.sonido as Sound) ? (o.sonido as Sound) : (is.push({ path: en(path, "sonido"), message: `uno de los sonidos de la casa: ${SOUNDS.join(", ")}` }), SOUNDS[0]);
    return { tipo, t: momento(o.t, en(path, "t"), dur, is), sonido };
  }
  permite("t", "texto");
  return { tipo: "texto", t: momento(o.t, en(path, "t"), dur, is), texto: texto(o.texto, en(path, "texto"), L.texto, is) };
}

/** One sequence file, on its own (the people it moves and the models it shows are checked by cargarAventura). */
export function leerSecuencia(v: unknown): Result<Secuencia> {
  const is: Issue[] = [];
  const o = objeto(v, "", is);
  if (!o) return resultado(is, null as never);
  campos(o, ["formato", "id", "duracion", "pistas", "notas"], "", is);
  formato(o, SECUENCIA, is);
  if (o.notas !== undefined && typeof o.notas !== "string") is.push({ path: "notas", message: "un texto para quien escribe (no se muestra)" });
  const antes = is.length;
  let dur = numero(o.duracion, "duracion", 1, LIM_SECUENCIA.duracion, is);
  if (is.length > antes) dur = LIM_SECUENCIA.duracion; // a bad duracion is said once, not again at every moment
  const pistas = lista(o.pistas, "pistas", 1, LIM_SECUENCIA.pistas, is).map((x, i) => pista(x, en("pistas", i), dur, is));
  // one person, one movement at a time: two `mueve` of the same person may not overlap in time
  pistas.forEach((p, i) => {
    if (p.tipo !== "mueve" || !p.claves.length) return;
    const a0 = p.claves[0].t, a1 = p.claves[p.claves.length - 1].t;
    pistas.slice(0, i).forEach((q, j) => {
      if (q.tipo !== "mueve" || q.pnj !== p.pnj || !q.claves.length) return;
      const b0 = q.claves[0].t, b1 = q.claves[q.claves.length - 1].t;
      if (a0 <= b1 && b0 <= a1) is.push({ path: en("pistas", i), message: `pistas[${j}] ya mueve a «${p.pnj}» de ${b0} a ${b1} s: una persona, un movimiento a la vez (junta sus claves en una pista o sepáralas en el tiempo)` });
    });
  });
  return resultado(is, { formato: SECUENCIA, id: id(o.id, "id", is), duracion: dur, pistas });
}

// ---------- pnj@1 ----------
function accion(v: unknown, path: string, is: Issue[]): Accion | undefined {
  if (v === undefined) return undefined;
  const o = objeto(v, path, is) ?? {};
  campos(o, ["tipo", "mision"], path, is);
  if (o.tipo === "despedir") return { tipo: "despedir" };
  if (o.tipo === "dar_mision" || o.tipo === "avanzar_paso" || o.tipo === "entregar") return { tipo: o.tipo, mision: id(o.mision, en(path, "mision"), is) };
  is.push({ path: en(path, "tipo"), message: `uno de: ${ACCIONES.join(", ")}` });
  return undefined;
}

/** One person's file, on its own. The LAST entrada has no `si`: it is what the person says when nothing else applies. */
export function leerPnj(v: unknown): Result<Pnj> {
  const is: Issue[] = [];
  const o = objeto(v, "", is);
  if (!o) return resultado(is, null as never);
  campos(o, ["formato", "id", "nombre", "oficio", "voz", "descripcion", "apariencia", "posicion", "giro", "radio", "dialogo", "notas"], "", is);
  formato(o, FORMATOS.pnj, is);
  const voz: VozPnj | "" = o.voz === undefined ? "" : VOCES_PNJ.includes(o.voz as VozPnj) ? (o.voz as VozPnj) : (is.push({ path: "voz", message: `una de: ${VOCES_PNJ.join(", ")} (sin «voz», una elegida por su id)` }), "");
  const d = objeto(o.dialogo, "dialogo", is) ?? {};
  campos(d, ["entradas", "nodos"], "dialogo", is);
  const nodosO = objeto(d.nodos, "dialogo.nodos", is) ?? {};
  const nodos: Record<string, Nodo> = {};
  const nombresNodos = Object.keys(nodosO);
  if (nombresNodos.length < 1 || nombresNodos.length > LIM.nodos) is.push({ path: "dialogo.nodos", message: `de 1 a ${LIM.nodos} nodos, cada uno con su nombre` });
  for (const k of nombresNodos) {
    const p = `dialogo.nodos.${k}`;
    if (!ID.test(k)) is.push({ path: p, message: "el nombre de un nodo: minúsculas, cifras y guiones" });
    const n = objeto(nodosO[k], p, is) ?? {};
    campos(n, ["texto", "opciones"], p, is);
    const opciones = lista(n.opciones, `${p}.opciones`, 0, LIM.opciones, is, true).map((x, i) => {
      const po = `${p}.opciones[${i}]`, oo = objeto(x, po, is) ?? {};
      campos(oo, ["texto", "si", "ir", "accion"], po, is);
      const op: Opcion = { texto: texto(oo.texto, `${po}.texto`, LIM.opcion, is), si: condiciones(oo.si, `${po}.si`, is) };
      if (oo.ir !== undefined) { op.ir = id(oo.ir, `${po}.ir`, is); if (op.ir && !(op.ir in nodosO)) is.push({ path: `${po}.ir`, message: `no hay ningún nodo «${op.ir}» (hay: ${nombresNodos.join(", ")})` }); }
      const ac = accion(oo.accion, `${po}.accion`, is);
      if (ac) op.accion = ac;
      return op;
    });
    nodos[k] = { texto: texto(n.texto, `${p}.texto`, LIM.linea, is), opciones };
  }
  const entradas = lista(d.entradas, "dialogo.entradas", 1, LIM.entradas, is).map((x, i) => {
    const p = `dialogo.entradas[${i}]`, eo = objeto(x, p, is) ?? {};
    campos(eo, ["si", "nodo"], p, is);
    const nodo = id(eo.nodo, `${p}.nodo`, is);
    if (nodo && !(nodo in nodosO)) is.push({ path: `${p}.nodo`, message: `no hay ningún nodo «${nodo}» (hay: ${nombresNodos.join(", ")})` });
    return { si: condiciones(eo.si, `${p}.si`, is), nodo };
  });
  if (entradas.length && entradas[entradas.length - 1].si.length) is.push({ path: `dialogo.entradas[${entradas.length - 1}].si`, message: "la última entrada no lleva «si»: es lo que dice cuando nada más se cumple" });
  return resultado(is, {
    formato: FORMATOS.pnj, id: id(o.id, "id", is), nombre: texto(o.nombre, "nombre", LIM.nombre, is), oficio: texto(o.oficio, "oficio", LIM.oficio, is, true), voz, descripcion: texto(o.descripcion, "descripcion", LIM.descripcionCosa, is, true),
    apariencia: apariencia(o.apariencia, "apariencia", is), posicion: { ...posicion(o.posicion, "posicion", is, ["y"]), y: altura(o.posicion, is, ALTURA_MAX) }, giro: numero(o.giro, "giro", -180, 180, is, 0),
    radio: numero(o.radio, "radio", 1, 8, is, 3), dialogo: { entradas, nodos },
  });
}

// ---------- cosa@1 ----------
/** One thing's file: what it is called, where it lies, what the prompt says («coger la caja») and how close you must be. */
export function leerCosa(v: unknown): Result<Cosa> {
  const is: Issue[] = [];
  const o = objeto(v, "", is);
  if (!o) return resultado(is, null as never);
  campos(o, ["formato", "id", "nombre", "descripcion", "apariencia", "posicion", "radio", "aviso", "notas"], "", is);
  formato(o, FORMATOS.cosa, is);
  const ap = apariencia(o.apariencia, "apariencia", is, ["color", "usada"]), usada = usadaDe(o.apariencia, ap.escala, is);
  return resultado(is, {
    formato: FORMATOS.cosa, id: id(o.id, "id", is), nombre: texto(o.nombre, "nombre", LIM.nombre, is), descripcion: texto(o.descripcion, "descripcion", LIM.descripcionCosa, is, true),
    apariencia: { ...ap, color: color(o.apariencia, is), ...(usada ? { usada } : {}) },
    posicion: { ...posicion(o.posicion, "posicion", is, ["y"]), y: altura(o.posicion, is, ALTURA_MAX) }, radio: numero(o.radio, "radio", 1, 8, is, 2),
    aviso: texto(o.aviso, "aviso", LIM.aviso, is),
  });
}
/** `posicion.y` of a person (pnj@1) or a thing (cosa@1): metres above the ground, 0–ALTURA_MAX (a hand's height, a
 * table, or the floor of a tower); 0 when absent. Both formats share the cap. */
function altura(v: unknown, is: Issue[], max = ALTURA_MAX): number {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return o.y === undefined ? 0 : numero(o.y, "posicion.y", 0, max, is, 0);
}
const COLOR = /^#[0-9a-f]{6}$/i;
/** cosa@1 `apariencia.color`: «#rrggbb» or nothing (the model's own colours). */
function color(v: unknown, is: Issue[]): string {
  const c = typeof v === "object" && v !== null ? (v as Record<string, unknown>).color : undefined;
  if (c === undefined) return "";
  if (typeof c === "string" && COLOR.test(c)) return c.toLowerCase();
  is.push({ path: "apariencia.color", message: "un color como «#3a7bd5» (# y seis cifras hexadecimales)" });
  return "";
}

/** cosa@1 `apariencia.usada` (U14 (6)): `{ "modelo": "<sha256 of a .glb>", "escala"? }` = how the thing looks for a
 * player once they did the step that uses it (`usa` or `coge`) — the chest open for YOU while the others still see it
 * closed. `escala` is the thing's own when absent. The page decides it from that player's own book (client.ts). */
function usadaDe(v: unknown, escala: number, is: Issue[]): Apariencia | undefined {
  const u = typeof v === "object" && v !== null ? (v as Record<string, unknown>).usada : undefined;
  if (u === undefined) return undefined;
  const p = "apariencia.usada";
  if (!esObjeto(u)) { is.push({ path: p, message: "un objeto { \"modelo\": \"<sha256 de un .glb>\", \"escala\": 1 }: cómo se ve la cosa cuando ya la has usado (el cofre abierto)" }); return undefined; }
  campos(u, ["modelo", "escala"], p, is);
  if (typeof u.modelo !== "string" || !SHA.test(u.modelo)) { is.push({ path: en(p, "modelo"), message: "el sha256 (64 letras hex) del .glb de cómo se ve ya usada (subido al mundo o de la biblioteca)" }); return undefined; }
  return { modelo: u.modelo, escala: numero(u.escala, en(p, "escala"), 0.05, 50, is, escala) };
}

// ---------- the whole adventure: each file, then the references between them ----------
const conFichero = (f: string, is: Issue[]) => is.map((i) => ({ path: i.path ? `${f}: ${i.path}` : f, message: i.message }));

/** Load an adventure from its files. What has problems is left out (and said, with its file and path); the rest loads.
 * U14 (5): `secuencias` (secuencia@1, optional) and `o.modelo`, when the caller can tell whether this server has a .glb
 * (the server: api.activo; tools/aventura.ts: the library and the world's datos/activos/): a sequence whose model is
 * not there does not load. */
export function cargarAventura(f: { misiones: Fichero[]; pnj: Fichero[]; cosas: Fichero[]; secuencias?: Fichero[] }, o: { modelo?: (sha256: string) => boolean } = {}): { aventura: Aventura; issues: Issue[] } {
  const issues: Issue[] = [];
  const leer = <T extends { id: string }>(fs: Fichero[], fn: (v: unknown) => Result<T>, into: Map<string, T>) => {
    for (const x of fs) {
      if (!x.fichero.endsWith(".json")) continue; // notes (.md, .txt) live next to the data and are not read
      const is: Issue[] = [];
      const v = parse(x, is);
      const r = is.length ? null : fn(v);
      if (!r) { issues.push(...conFichero(x.fichero, is)); continue; }
      if (!r.ok) { issues.push(...conFichero(x.fichero, r.issues)); continue; }
      if (into.has(r.value.id)) { issues.push({ path: `${x.fichero}: id`, message: `«${r.value.id}» ya está en otro fichero; uso el primero` }); continue; }
      into.set(r.value.id, r.value);
    }
  };
  const misiones = new Map<string, Mision>(), pnjs = new Map<string, Pnj>(), cosas = new Map<string, Cosa>();
  leer(f.misiones, leerMision, misiones);
  leer(f.pnj, leerPnj, pnjs);
  leer(f.cosas, leerCosa, cosas);
  const hay = (m: Map<string, unknown>) => [...m.keys()].join(", ") || "ninguna";
  // U14 (5): the scripted moments, and the models they show (only this server's: a page would load nothing)
  const secuencias = new Map<string, Secuencia>();
  leer(f.secuencias ?? [], leerSecuencia, secuencias);
  const casa = biblioteca.modelos.map((m) => m.id).join(", ");
  if (o.modelo) for (const s of [...secuencias.values()]) {
    const is: Issue[] = [];
    s.pistas.forEach((p, i) => { if (p.tipo === "muestra" && !o.modelo!(p.modelo)) is.push({ path: `pistas[${i}].modelo`, message: `el servidor no tiene ningún .glb con ese sha256: súbelo (arrástralo al mundo, con permiso de construir) o cópialo como datos/activos/<sha256>.glb; los de la casa (${casa}) tienen su sha256 en features/objetos/biblioteca.json` }); });
    if (is.length) { issues.push(...conFichero(`secuencias/${s.id}`, is)); secuencias.delete(s.id); }
  }
  // references, until nothing more falls (a dropped person can make a quest impossible, and the other way round)
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let cae = false;
    for (const s of [...secuencias.values()]) { // U14 (5): the people a sequence moves or follows
      const is: Issue[] = [];
      s.pistas.forEach((p, i) => { if ((p.tipo === "mueve" || (p.tipo === "muestra" && p.pnj)) && !pnjs.has(p.pnj)) is.push({ path: `pistas[${i}].pnj`, message: `no hay ningún pnj «${p.pnj}» (hay: ${hay(pnjs)})` }); });
      if (is.length) { issues.push(...conFichero(`secuencias/${s.id}`, is)); secuencias.delete(s.id); cae = true; }
    }
    for (const m of [...misiones.values()]) {
      const is: Issue[] = [];
      for (const r of m.requisitos.misiones) if (!misiones.has(r)) is.push({ path: "requisitos.misiones", message: `no hay ninguna misión «${r}» (hay: ${hay(misiones)})` });
      m.pasos.forEach((p, i) => {
        const at = `pasos[${i}]`;
        if ((p.tipo === "habla_con" || p.tipo === "recibe" || p.tipo === "entrega") && !pnjs.has(p.pnj)) is.push({ path: `${at}.pnj`, message: `no hay ningún pnj «${p.pnj}» (hay: ${hay(pnjs)})` });
        cosasDe(p).forEach((c, j) => {
          const donde = "cosas" in p ? `${at}.cosas[${j}]` : `${at}.cosa`;
          if (!cosas.has(c)) is.push({ path: donde, message: `no hay ninguna cosa «${c}» (hay: ${hay(cosas)})` });
          else if (p.tipo === "entrega" && !m.pasos.slice(0, i).some((q) => (q.tipo === "coge" || q.tipo === "recibe") && q.cosa === c)) is.push({ path: donde, message: `para entregar «${c}» antes hay que tenerla: pon delante un paso coge (la coge) o recibe (alguien se la da) con esa cosa` });
        });
        if (p.secuencia && !secuencias.has(p.secuencia)) is.push({ path: `${at}.secuencia`, message: `no hay ninguna secuencia «${p.secuencia}» (hay: ${hay(secuencias)}; van en secuencias/<id>.json)` });
      });
      if (is.length) { issues.push(...conFichero(`misiones/${m.id}`, is)); misiones.delete(m.id); cae = true; }
    }
    for (const n of [...pnjs.values()]) {
      const is: Issue[] = [];
      const revisa = (cs: Condicion[], at: string) => cs.forEach((c, i) => {
        const m = misiones.get(c.mision), p = cs.length > 1 ? `${at}[${i}]` : at;
        if (!m) { is.push({ path: `${p}.mision`, message: `no hay ninguna misión «${c.mision}» (hay: ${hay(misiones)})` }); return; }
        if (c.paso && !m.pasos.some((s) => s.id === c.paso)) is.push({ path: `${p}.paso`, message: `la misión «${m.id}» no tiene ningún paso «${c.paso}» (tiene: ${m.pasos.map((s) => s.id).join(", ")})` });
        if (c.tiene && !cosas.has(c.tiene)) is.push({ path: `${p}.tiene`, message: `no hay ninguna cosa «${c.tiene}»` });
      });
      n.dialogo.entradas.forEach((e, i) => revisa(e.si, `dialogo.entradas[${i}].si`));
      for (const [k, nodo] of Object.entries(n.dialogo.nodos)) nodo.opciones.forEach((op, i) => {
        const at = `dialogo.nodos.${k}.opciones[${i}]`;
        revisa(op.si, `${at}.si`);
        const ac = op.accion;
        if (!ac || ac.tipo === "despedir") return;
        const m = misiones.get(ac.mision);
        if (!m) return void is.push({ path: `${at}.accion.mision`, message: `no hay ninguna misión «${ac.mision}» (hay: ${hay(misiones)})` });
        if (ac.tipo === "avanzar_paso" && !m.pasos.some((s) => (s.tipo === "habla_con" || s.tipo === "recibe") && s.pnj === n.id)) is.push({ path: `${at}.accion`, message: `la misión «${m.id}» no tiene ningún paso habla_con ni recibe con «${n.id}»` });
        if (ac.tipo === "entregar" && !m.pasos.some((s) => s.tipo === "entrega" && s.pnj === n.id)) is.push({ path: `${at}.accion`, message: `la misión «${m.id}» no tiene ningún paso entrega a «${n.id}»` });
      });
      if (is.length) { issues.push(...conFichero(`pnj/${n.id}`, is)); pnjs.delete(n.id); cae = true; }
    }
    if (!cae) break;
  }
  // derived: who gives which quest, and which steps complete only through an explicit option
  const dadores = new Map<string, string[]>(), explicitos = new Map<string, { avanza: Set<string>; entrega: Set<string> }>();
  for (const n of pnjs.values()) {
    const x = { avanza: new Set<string>(), entrega: new Set<string>() };
    for (const nodo of Object.values(n.dialogo.nodos)) for (const op of nodo.opciones) {
      const ac = op.accion;
      if (!ac || ac.tipo === "despedir") continue;
      if (ac.tipo === "dar_mision") { const l = dadores.get(ac.mision) ?? []; if (!l.includes(n.id)) l.push(n.id); dadores.set(ac.mision, l); }
      if (ac.tipo === "avanzar_paso") x.avanza.add(ac.mision);
      if (ac.tipo === "entregar") x.entrega.add(ac.mision);
    }
    explicitos.set(n.id, x);
  }
  return { aventura: { misiones, pnjs, cosas, secuencias, dadores, explicitos }, issues };
}

/** Cut a text to at most `max` UTF-8 bytes without breaking a character (what goes on the wire). */
export function corta(s: string, max: number): string {
  if (bytes(s) <= max) return s;
  let out = "";
  for (const ch of s) { if (bytes(out + ch) > max - 3) break; out += ch; }
  return out + "...";
}
