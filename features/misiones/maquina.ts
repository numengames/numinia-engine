// misiones — the quest state machine (J5): pure functions over one player's progress. The server feeds them what IT
// saw (where the player stands, whom it talks to, what it took); a page never completes a step by asking. Same
// input, same output: no clock, no randomness. Dialogue choice (which node, which options) lives here too.
import { alAlcanceEnAltura } from "../../packages/feature/src/index.ts";
import type { Aventura, Condicion, Mision, Nodo, Opcion, Paso, Pnj } from "./formato.ts";

/** An active quest: the index of the step it is on and the things taken for it (for `entrega`). */
export type Activa = { paso: number; tiene: string[] };
/** One player's quests, as the server keeps it (store `p:<guest>`). Plain JSON. */
export type Progreso = { v: 1; activas: Record<string, Activa>; hechas: string[]; seguida: string };
export const ACTIVAS_MAX = 16;
export const HECHAS_MAX = 200; // the oldest completed ones are forgotten past this (a store value is ≤ 4 KB)

export const nuevoProgreso = (): Progreso => ({ v: 1, activas: {}, hechas: [], seguida: "" });

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Progress as it comes back from the store: whatever does not fit is dropped, never thrown. */
export function leerProgreso(v: unknown): Progreso {
  const p = nuevoProgreso();
  if (typeof v !== "object" || v === null) return p;
  const o = v as Record<string, unknown>;
  if (typeof o.activas === "object" && o.activas !== null) {
    for (const [id, a] of Object.entries(o.activas as Record<string, unknown>).slice(0, ACTIVAS_MAX)) {
      const x = a as { paso?: unknown; tiene?: unknown };
      if (!ID.test(id) || typeof x !== "object" || x === null || !Number.isInteger(x.paso) || Number(x.paso) < 0) continue;
      p.activas[id] = { paso: Number(x.paso), tiene: Array.isArray(x.tiene) ? x.tiene.filter((c): c is string => typeof c === "string" && ID.test(c)).slice(0, 16) : [] };
    }
  }
  if (Array.isArray(o.hechas)) p.hechas = o.hechas.filter((h): h is string => typeof h === "string" && ID.test(h)).slice(-HECHAS_MAX);
  if (typeof o.seguida === "string" && p.activas[o.seguida]) p.seguida = o.seguida;
  return p;
}

export type EstadoMision = "sin_empezar" | "activa" | "hecha";
export const estadoDe = (p: Progreso, id: string): EstadoMision => (p.activas[id] ? "activa" : p.hechas.includes(id) ? "hecha" : "sin_empezar");

/** May this player take this quest now: not on it, not done (unless repeatable), every required quest done. */
export function disponible(p: Progreso, m: Mision): boolean {
  if (p.activas[m.id]) return false;
  if (p.hechas.includes(m.id) && !m.repetible) return false;
  return m.requisitos.misiones.every((r) => p.hechas.includes(r));
}

/** Every condition holds (an empty list always does). */
export function cumple(p: Progreso, cs: Condicion[], a: Aventura): boolean {
  return cs.every((c) => {
    const m = a.misiones.get(c.mision);
    if (!m) return false;
    const act = p.activas[c.mision];
    if (c.estado === "activa") return !!act && (!c.paso || m.pasos[act.paso]?.id === c.paso) && (!c.tiene || act.tiene.includes(c.tiene));
    if (c.estado === "hecha") return p.hechas.includes(c.mision);
    if (c.estado === "disponible") return disponible(p, m);
    return !act && !p.hechas.includes(c.mision);
  });
}

/** The node a person opens with for this player: the first entrada whose conditions hold (the last has none). */
export const nodoInicial = (n: Pnj, p: Progreso, a: Aventura): string => (n.dialogo.entradas.find((e) => cumple(p, e.si, a)) ?? n.dialogo.entradas[n.dialogo.entradas.length - 1]).nodo;

/** The options this player sees in a node (in order; those whose conditions fail are hidden). */
export const opcionesDe = (nodo: Nodo, p: Progreso, a: Aventura): Opcion[] => nodo.opciones.filter((o) => cumple(p, o.si, a)).slice(0, 4);

/** What the server saw the player do. */
export type Suceso =
  | { tipo: "llega"; x: number; z: number; y?: number }      // it stands here (checked a few times a second); y = its feet's height (the ground when absent)
  | { tipo: "habla"; pnj: string }                           // it started talking to this person
  | { tipo: "avanzar"; pnj: string; mision: string }         // it chose an option avanzar_paso
  | { tipo: "entregar"; pnj: string; mision: string }        // it chose an option entregar
  | { tipo: "usa"; cosa: string };                           // it took or used this thing
/** A step completed: which quest, which step (index) and whether that finished the quest. */
export type Hecho = { mision: string; paso: number; completada: boolean };

function cumplePaso(s: Paso, act: Activa, m: Mision, a: Aventura, x: Suceso): boolean {
  // llega_a: inside the circle and, when the step names a height, standing at it (± ALCANCE_ALTURA_M: a floor below does not count)
  if (s.tipo === "llega_a") return x.tipo === "llega" && (x.x - s.x) ** 2 + (x.z - s.z) ** 2 <= s.radio ** 2 && alAlcanceEnAltura(x.y, s.y);
  if (s.tipo === "usa" || s.tipo === "coge") return x.tipo === "usa" && x.cosa === s.cosa;
  if (x.tipo !== "habla" && x.tipo !== "avanzar" && x.tipo !== "entregar") return false;
  if (x.pnj !== s.pnj) return false;
  const exp = a.explicitos.get(s.pnj);
  if (s.tipo === "habla_con") return (x.tipo === "avanzar" && x.mision === m.id) || (x.tipo === "habla" && !exp?.avanza.has(m.id));
  return act.tiene.includes(s.cosa) && ((x.tipo === "entregar" && x.mision === m.id) || (x.tipo === "habla" && !exp?.entrega.has(m.id)));
}

function completar(p: Progreso, m: Mision): void {
  delete p.activas[m.id];
  if (!p.hechas.includes(m.id)) p.hechas.push(m.id);
  if (p.hechas.length > HECHAS_MAX) p.hechas.splice(0, p.hechas.length - HECHAS_MAX);
  if (p.seguida === m.id) p.seguida = Object.keys(p.activas)[0] ?? "";
}

/** Apply what the player did: completes at most one step per active quest (the current one). Changes `p`. */
export function registrar(p: Progreso, a: Aventura, x: Suceso): Hecho[] {
  const out: Hecho[] = [];
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id), s = m?.pasos[act.paso];
    if (!m || !s || !cumplePaso(s, act, m, a, x)) continue;
    if (s.tipo === "coge") act.tiene.push(s.cosa);
    if (s.tipo === "entrega") act.tiene = act.tiene.filter((c) => c !== s.cosa);
    act.paso++;
    const completada = act.paso >= m.pasos.length;
    out.push({ mision: id, paso: act.paso - 1, completada });
    if (completada) completar(p, m);
  }
  return out;
}

type Res = { ok: true } | { ok: false; motivo: string };
const no = (motivo: string): Res => ({ ok: false, motivo });

/** Take a quest (from a person who offers it: the server checks who and how close). Tracks it if nothing is tracked. */
export function aceptar(p: Progreso, m: Mision, a: Aventura): Res {
  if (p.activas[m.id]) return no(`Ya tienes «${m.titulo}» en tu libro.`);
  if (p.hechas.includes(m.id) && !m.repetible) return no(`Ya completaste «${m.titulo}».`);
  const falta = m.requisitos.misiones.filter((r) => !p.hechas.includes(r)).map((r) => `«${a.misiones.get(r)?.titulo ?? r}»`);
  if (falta.length) return no(`Antes tienes que completar ${falta.join(", ")}.`);
  if (Object.keys(p.activas).length >= ACTIVAS_MAX) return no(`Ya llevas ${ACTIVAS_MAX} misiones: termina o deja alguna.`);
  p.activas[m.id] = { paso: 0, tiene: [] };
  if (!p.seguida) p.seguida = m.id;
  return { ok: true };
}

/** Leave an active quest (what was done in it is lost). */
export function abandonar(p: Progreso, id: string): boolean {
  if (!p.activas[id]) return false;
  delete p.activas[id];
  if (p.seguida === id) p.seguida = Object.keys(p.activas)[0] ?? "";
  return true;
}

/** Track an active quest ("" = none). */
export function seguir(p: Progreso, id: string): boolean {
  if (id && !p.activas[id]) return false;
  p.seguida = id;
  return true;
}

/** Where a step points, for the map, the beacon and the HUD: a place, a person or a thing (and its id). */
export function objetivo(s: Paso, a: Aventura): { x: number; z: number; nombre: string; que: string } {
  if (s.tipo === "llega_a") return { x: s.x, z: s.z, nombre: s.lugar, que: "" };
  if (s.tipo === "habla_con" || s.tipo === "entrega") { const n = a.pnjs.get(s.pnj); return { x: n?.posicion.x ?? 0, z: n?.posicion.z ?? 0, nombre: n?.nombre ?? s.pnj, que: s.pnj }; }
  const c = a.cosas.get(s.cosa);
  return { x: c?.posicion.x ?? 0, z: c?.posicion.z ?? 0, nombre: c?.nombre ?? s.cosa, que: s.cosa };
}

/** True when some active quest's current step is «llega_a» (the server checks those players' positions). */
export const esperaLlegada = (p: Progreso, a: Aventura): boolean => Object.entries(p.activas).some(([id, act]) => a.misiones.get(id)?.pasos[act.paso]?.tipo === "llega_a");
