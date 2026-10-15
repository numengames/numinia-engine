// misiones — the formats an adventure writes as text files (J5), and their checks. An adventure is a folder:
//   misiones/<id>.json   mision@1   a quest: steps with conditions, rewards, texts
//   pnj/<id>.json        pnj@1      a person of the world (PNJ) with a deterministic dialogue tree gated by quest state
//   cosas/<id>.json      cosa@1     a thing in the world you take or use (the J4 prompt «E: coger la caja»)
// The recipe for authors (people or LLMs) is docs/EXTENDER.md «Misiones y PNJ». Every check returns Result with paths
// that say how to fix each problem; nothing here throws, touches the network or the world.
import type { Issue, Result } from "../../packages/core/src/index.ts";

export const FORMATOS = { mision: "mision@1", pnj: "pnj@1", cosa: "cosa@1" } as const;
export const TIPOS_PASO = ["llega_a", "habla_con", "usa", "coge", "entrega"] as const;
export const ESTADOS = ["sin_empezar", "disponible", "activa", "hecha"] as const;
export const ACCIONES = ["dar_mision", "avanzar_paso", "entregar", "despedir"] as const;
/** Lengths in UTF-8 bytes (what the wire carries; letters with accents count 2) and counts. */
export const LIM = {
  id: 32, titulo: 80, descripcion: 300, textoPaso: 160, lugar: 60, nombre: 60, descripcionCosa: 140, linea: 400, opcion: 100,
  aviso: 40, textoMision: 200, pasos: 16, opciones: 4, nodos: 64, entradas: 16, recompensas: 8, requisitos: 16,
} as const;
export const MUNDO = 2000; // metres: the furthest a person, a thing or a place can be (the wire's range)

export type TipoPaso = (typeof TIPOS_PASO)[number];
export type Estado = (typeof ESTADOS)[number];
export type Paso =
  | { id: string; tipo: "llega_a"; texto: string; x: number; z: number; radio: number; lugar: string }
  | { id: string; tipo: "habla_con"; texto: string; pnj: string }
  | { id: string; tipo: "usa" | "coge"; texto: string; cosa: string }
  | { id: string; tipo: "entrega"; texto: string; cosa: string; pnj: string };
export type Recompensa = { tipo: "insignia"; id: string; nombre: string };
export type Mision = {
  formato: "mision@1"; id: string; titulo: string; descripcion: string; requisitos: { misiones: string[] }; pasos: Paso[];
  recompensas: Recompensa[]; textos: { aceptada: string; completada: string }; repetible: boolean;
};
/** True when every listed fact holds for this player. `paso` and `tiene` only with estado "activa". */
export type Condicion = { mision: string; estado: Estado; paso?: string; tiene?: string };
export type Accion = { tipo: "dar_mision" | "avanzar_paso" | "entregar"; mision: string } | { tipo: "despedir" };
export type Opcion = { texto: string; si: Condicion[]; ir?: string; accion?: Accion };
export type Nodo = { texto: string; opciones: Opcion[] };
export type Apariencia = { modelo: string; escala: number };
export type Pnj = {
  formato: "pnj@1"; id: string; nombre: string; descripcion: string; apariencia: Apariencia; posicion: { x: number; z: number };
  giro: number; radio: number; dialogo: { entradas: { si: Condicion[]; nodo: string }[]; nodos: Record<string, Nodo> };
};
export type Cosa = { formato: "cosa@1"; id: string; nombre: string; descripcion: string; apariencia: Apariencia; posicion: { x: number; z: number }; radio: number; aviso: string };
export type Fichero = { fichero: string; texto: string };
export type Aventura = {
  misiones: Map<string, Mision>; pnjs: Map<string, Pnj>; cosas: Map<string, Cosa>;
  /** Who offers each quest (people whose tree has dar_mision for it). */
  dadores: Map<string, string[]>;
  /** Per person, the quests whose habla_con / entrega step completes only through an explicit option (avanzar_paso /
   * entregar); for any other quest, talking to that person completes those steps by itself. */
  explicitos: Map<string, { avanza: Set<string>; entrega: Set<string> }>;
};

// ---------- small checks: each pushes an issue with its path and returns a usable value ----------
type O = Record<string, unknown>;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/, SHA = /^[0-9a-f]{64}$/;
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
function posicion(v: unknown, path: string, is: Issue[]): { x: number; z: number } {
  const o = objeto(v, path, is);
  if (!o) return { x: 0, z: 0 };
  campos(o, ["x", "z"], path, is);
  return { x: numero(o.x, en(path, "x"), -MUNDO, MUNDO, is), z: numero(o.z, en(path, "z"), -MUNDO, MUNDO, is) };
}
function apariencia(v: unknown, path: string, is: Issue[]): Apariencia {
  const o = objeto(v, path, is, true);
  if (!o) return { modelo: "", escala: 1 };
  campos(o, ["modelo", "escala", "vrm"], path, is);
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
  if (tipo === "llega_a") {
    campos(o, ["id", "tipo", "texto", "x", "z", "radio", "lugar"], path, is);
    return { ...base, tipo, x: numero(o.x, en(path, "x"), -MUNDO, MUNDO, is), z: numero(o.z, en(path, "z"), -MUNDO, MUNDO, is), radio: numero(o.radio, en(path, "radio"), 1, 50, is, 4), lugar: texto(o.lugar, en(path, "lugar"), LIM.lugar, is) };
  }
  if (tipo === "habla_con") { campos(o, ["id", "tipo", "texto", "pnj"], path, is); return { ...base, tipo, pnj: id(o.pnj, en(path, "pnj"), is) }; }
  if (tipo === "entrega") { campos(o, ["id", "tipo", "texto", "cosa", "pnj"], path, is); return { ...base, tipo, cosa: id(o.cosa, en(path, "cosa"), is), pnj: id(o.pnj, en(path, "pnj"), is) }; }
  campos(o, ["id", "tipo", "texto", "cosa"], path, is);
  return { ...base, tipo, cosa: id(o.cosa, en(path, "cosa"), is) };
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
  const recompensas = lista(o.recompensas, "recompensas", 0, LIM.recompensas, is, true).map((r, i) => {
    const p = en("recompensas", i), ro = objeto(r, p, is) ?? {};
    campos(ro, ["tipo", "id", "nombre"], p, is);
    if (ro.tipo !== "insignia") is.push({ path: en(p, "tipo"), message: "hoy solo \"insignia\" (un recuerdo de lo hecho; sin economía)" });
    return { tipo: "insignia" as const, id: id(ro.id, en(p, "id"), is), nombre: texto(ro.nombre, en(p, "nombre"), LIM.nombre, is) };
  });
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
  campos(o, ["formato", "id", "nombre", "descripcion", "apariencia", "posicion", "giro", "radio", "dialogo", "notas"], "", is);
  formato(o, FORMATOS.pnj, is);
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
    formato: FORMATOS.pnj, id: id(o.id, "id", is), nombre: texto(o.nombre, "nombre", LIM.nombre, is), descripcion: texto(o.descripcion, "descripcion", LIM.descripcionCosa, is, true),
    apariencia: apariencia(o.apariencia, "apariencia", is), posicion: posicion(o.posicion, "posicion", is), giro: numero(o.giro, "giro", -180, 180, is, 0),
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
  return resultado(is, {
    formato: FORMATOS.cosa, id: id(o.id, "id", is), nombre: texto(o.nombre, "nombre", LIM.nombre, is), descripcion: texto(o.descripcion, "descripcion", LIM.descripcionCosa, is, true),
    apariencia: apariencia(o.apariencia, "apariencia", is), posicion: posicion(o.posicion, "posicion", is), radio: numero(o.radio, "radio", 1, 8, is, 2),
    aviso: texto(o.aviso, "aviso", LIM.aviso, is),
  });
}

// ---------- the whole adventure: each file, then the references between them ----------
const conFichero = (f: string, is: Issue[]) => is.map((i) => ({ path: i.path ? `${f}: ${i.path}` : f, message: i.message }));

/** Load an adventure from its files. What has problems is left out (and said, with its file and path); the rest loads. */
export function cargarAventura(f: { misiones: Fichero[]; pnj: Fichero[]; cosas: Fichero[] }): { aventura: Aventura; issues: Issue[] } {
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
  // references, until nothing more falls (a dropped person can make a quest impossible, and the other way round)
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let cae = false;
    for (const m of [...misiones.values()]) {
      const is: Issue[] = [];
      for (const r of m.requisitos.misiones) if (!misiones.has(r)) is.push({ path: "requisitos.misiones", message: `no hay ninguna misión «${r}» (hay: ${hay(misiones)})` });
      m.pasos.forEach((p, i) => {
        const at = `pasos[${i}]`;
        if ((p.tipo === "habla_con" || p.tipo === "entrega") && !pnjs.has(p.pnj)) is.push({ path: `${at}.pnj`, message: `no hay ningún pnj «${p.pnj}» (hay: ${hay(pnjs)})` });
        if ((p.tipo === "usa" || p.tipo === "coge" || p.tipo === "entrega") && !cosas.has(p.cosa)) is.push({ path: `${at}.cosa`, message: `no hay ninguna cosa «${p.cosa}» (hay: ${hay(cosas)})` });
        if (p.tipo === "entrega" && !m.pasos.slice(0, i).some((q) => q.tipo === "coge" && q.cosa === p.cosa)) is.push({ path: at, message: `para entregar «${p.cosa}» antes hay que cogerla: pon un paso coge con esa cosa delante` });
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
        if (ac.tipo === "avanzar_paso" && !m.pasos.some((s) => s.tipo === "habla_con" && s.pnj === n.id)) is.push({ path: `${at}.accion`, message: `la misión «${m.id}» no tiene ningún paso habla_con con «${n.id}»` });
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
  return { aventura: { misiones, pnjs, cosas, dadores, explicitos }, issues };
}

/** Cut a text to at most `max` UTF-8 bytes without breaking a character (what goes on the wire). */
export function corta(s: string, max: number): string {
  if (bytes(s) <= max) return s;
  let out = "";
  for (const ch of s) { if (bytes(out + ch) > max - 3) break; out += ch; }
  return out + "...";
}
