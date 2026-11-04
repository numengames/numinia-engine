// misiones — the quest state machine (J5): pure functions over one player's progress. The server feeds them what IT
// saw (where the player stands, whom it talks to, what it took); a page never completes a step by asking. Same
// input, same output: no clock of its own, no randomness. Dialogue choice (which node, which options) lives here too.
// U14 (5): a step may wait (mision@1 `espera`): the server passes its clock in each event (`ahora`, ms) and an active
// quest keeps `desde`, when its current block became the one to do; a step that still waits is not done, not offered
// («!») and the server says «Todavía no» when someone tries.
import { alAlcanceEnAltura } from "../../packages/feature/src/index.ts";
import { cosasDe, LIM, shaDeBiblioteca } from "./formato.ts";
import type { Aventura, Condicion, Dialogo, Lugar, Mision, Nodo, Opcion, Paso, Pnj } from "./formato.ts";

/** An active quest: the index of the step it is on (the first of its block), the things it carries (taken or given,
 * for `entrega`) and the ids of the steps already done inside the current block (`grupo`; empty outside blocks).
 * U14 (5): `desde` = when that block became the one to do (ms of the server's clock; absent = no wait counts). */
export type Activa = { paso: number; tiene: string[]; hechos: string[]; desde?: number; cierra?: number };
/** A finished grupo (two or more steps, with a next step after it) stays on screen complete — «Piezas reunidas 3/3» — for this
 * long before the quest moves on: `cierra` = when it moves on (ms of the server's clock), `hechos` still lists the whole block.
 * It ends sooner at the player's next deliberate action (any event but the arrival checks). Without a clock nothing waits. */
export const PAUSA_GRUPO_MS = 2000;
/** P4: what a player did on the `marca` steps of one quest, counted for an evaluation (no mark, no pass/fail): every mark made, the
 * ones on a thing the step does not ask for, and every unmark. Kept after the quest is done. */
export type Cuenta = { marcas: number; marcas_erroneas: number; desmarcados: number };
/** One player's quests, as the server keeps it (store `p:<guest>`). Plain JSON. P4, both only once used (a player who never marks
 * anything saves exactly what it saved before): `marcados` = the ids of the things marked as evidence, in order — a thing's number is
 * its place in this list (1-based), unmarking removes it and the rest renumber — and `cuenta` = the counters per quest. */
export type Progreso = { v: 1; activas: Record<string, Activa>; hechas: string[]; seguida: string; marcados?: string[]; cuenta?: Record<string, Cuenta> };
export const ACTIVAS_MAX = 16;
export const CUENTAS_MAX = 8; // P4: quests whose counters are kept (the oldest is forgotten past this)
export const CUENTA_TOPE = 9999;
export const HECHAS_MAX = 200; // the oldest completed ones are forgotten past this (a store value is ≤ 4 KB)

export const nuevoProgreso = (): Progreso => ({ v: 1, activas: {}, hechas: [], seguida: "" });

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const ids = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && ID.test(c)).slice(0, max) : []);
/** Progress as it comes back from the store: whatever does not fit is dropped, never thrown. Saved before `hechos`
 * existed = nothing done inside a block yet; saved before `desde` existed (U14 (5)) = no wait counts. */
export function leerProgreso(v: unknown): Progreso {
  const p = nuevoProgreso();
  if (typeof v !== "object" || v === null) return p;
  const o = v as Record<string, unknown>;
  if (typeof o.activas === "object" && o.activas !== null) {
    for (const [id, a] of Object.entries(o.activas as Record<string, unknown>).slice(0, ACTIVAS_MAX)) {
      const x = a as { paso?: unknown; tiene?: unknown; hechos?: unknown; desde?: unknown };
      if (!ID.test(id) || typeof x !== "object" || x === null || !Number.isInteger(x.paso) || Number(x.paso) < 0) continue;
      p.activas[id] = { paso: Number(x.paso), tiene: ids(x.tiene, 16), hechos: [...new Set(ids(x.hechos, LIM.pasos))] };
      if (typeof x.desde === "number" && Number.isFinite(x.desde) && x.desde >= 0) p.activas[id].desde = x.desde;
      if (typeof (x as { cierra?: unknown }).cierra === "number" && Number.isFinite((x as { cierra: number }).cierra) && (x as { cierra: number }).cierra >= 0) p.activas[id].cierra = (x as { cierra: number }).cierra;
    }
  }
  if (Array.isArray(o.hechas)) p.hechas = o.hechas.filter((h): h is string => typeof h === "string" && ID.test(h)).slice(-HECHAS_MAX);
  if (typeof o.seguida === "string" && p.activas[o.seguida]) p.seguida = o.seguida;
  const marcados = [...new Set(ids(o.marcados, LIM.marcados))];
  if (marcados.length) p.marcados = marcados;
  if (typeof o.cuenta === "object" && o.cuenta !== null) {
    const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? Math.min(v, CUENTA_TOPE) : 0);
    for (const [id, c] of Object.entries(o.cuenta as Record<string, unknown>).slice(0, CUENTAS_MAX)) {
      if (!ID.test(id) || typeof c !== "object" || c === null) continue;
      const x = c as Record<string, unknown>;
      (p.cuenta ??= {})[id] = { marcas: n(x.marcas), marcas_erroneas: n(x.marcas_erroneas), desmarcados: n(x.desmarcados) };
    }
  }
  return p;
}

// ---------- blocks: consecutive steps with the same grupo are done in any order; a step without grupo is a block of one ----------
/** Where the block that holds step `i` ends (the index after its last step). */
export function finBloque(m: Mision, i: number): number {
  const g = m.pasos[i]?.grupo;
  let j = Math.min(i, m.pasos.length) + 1;
  if (g) while (j < m.pasos.length && m.pasos[j].grupo === g) j++;
  return Math.min(j, m.pasos.length);
}
/** Is step `n` still to do in the current block (from `act.paso` to the block's end, and not done yet)? */
export const pendiente = (m: Mision, act: Activa, n: number): boolean => n >= act.paso && n < finBloque(m, act.paso) && !act.hechos.includes(m.pasos[n].id);
const pendienteId = (m: Mision, act: Activa, id: string): boolean => pendiente(m, act, m.pasos.findIndex((s) => s.id === id));
/** Is step `n` done: before the current block, or done inside it. */
export const pasoHecho = (m: Mision, act: Activa, n: number): boolean => n < act.paso || (n < finBloque(m, act.paso) && act.hechos.includes(m.pasos[n].id));
/** The first step still to do (what the book calls the current one); the block's first when nothing is left. */
export function primerPendiente(m: Mision, act: Activa): number {
  for (let n = act.paso, fin = finBloque(m, act.paso); n < fin; n++) if (!act.hechos.includes(m.pasos[n].id)) return n;
  return act.paso;
}

// ---------- waits (U14 (5)): a step with `espera` opens that many seconds after its block became the one to do ----------
/** Whether a quest has any step that waits: only those keep `desde` (the others' saved progress does not change). */
const conEsperas = (m: Mision): boolean => m.pasos.some((s) => s.espera !== undefined);
/** Milliseconds step `n` still waits at `ahora` (the server's clock): 0 = it may be done. No `espera`, or progress saved
 * before `desde` existed, never waits; without a clock (`ahora` absent) no time has passed. */
export function faltaEspera(m: Mision, act: Activa, n: number, ahora?: number): number {
  const s = m.pasos[n];
  if (!s?.espera || act.desde === undefined) return 0;
  return Math.max(0, act.desde + s.espera * 1000 - (ahora ?? act.desde));
}
/** When the next wait of this player ends (ms of the server's clock), or null when no step to do now is waiting: the
 * server resends the book and the marks then, once. */
export function proximaEspera(p: Progreso, a: Aventura, ahora: number): number | null {
  let min: number | null = null;
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m) continue;
    if (act.cierra !== undefined && (min === null || act.cierra < min)) min = act.cierra; // a finished grupo moves on then
    for (let n = act.paso, fin = finBloque(m, act.paso); n < fin; n++) {
      if (act.hechos.includes(m.pasos[n].id)) continue;
      const falta = faltaEspera(m, act, n, ahora);
      if (falta > 0 && (min === null || ahora + falta < min)) min = ahora + falta;
    }
  }
  return min;
}

/** The quest leaves a finished grupo: on to the block after it. Its waits (`desde`) already count from the moment the grupo was
 * done, so the pause is only what the page shows — no step opens later because of it. */
function cerrarBloque(m: Mision, act: Activa): void {
  act.paso = finBloque(m, act.paso); act.hechos = []; delete act.cierra;
}
/** Let the finished grupos move on: at their time (`ahora` >= `cierra`), or at once when the player did something
 * (`porEvento`: any deliberate action, so the next step's first event meets the next block). True when anything moved. */
export function asentar(p: Progreso, a: Aventura, ahora?: number, porEvento = false): boolean {
  let cambio = false;
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m || act.cierra === undefined) continue;
    if (ahora === undefined || ahora >= act.cierra || porEvento) { cerrarBloque(m, act); cambio = true; }
  }
  return cambio;
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
    if (c.estado === "activa") return !!act && (!c.paso || pendienteId(m, act, c.paso)) && (!c.tiene || act.tiene.includes(c.tiene));
    if (c.estado === "hecha") return p.hechas.includes(c.mision);
    if (c.estado === "disponible") return disponible(p, m);
    return !act && !p.hechas.includes(c.mision);
  });
}

/** P2: where this person stands for this player: the first `posiciones` entry whose conditions hold, or null (= its own `posicion` and
 * `giro`, which is all a person without `posiciones` ever has). Pure: a function of the player's progress alone. */
export function lugarDe(n: Pnj, p: Progreso, a: Aventura): Lugar | null {
  for (const l of n.posiciones) if (cumple(p, l.si, a)) return l;
  return null;
}

/** The node a person (or, P3, a thing) opens with for this player: the first entrada whose conditions hold. The last one
 * usually has none (what is said when nothing else applies); when it has some and none holds, there is nothing to say
 * now and the answer is null: no «E» is offered and the server refuses the talk. */
export function nodoInicial(n: { dialogo: Dialogo }, p: Progreso, a: Aventura): string | null {
  const es = n.dialogo.entradas, e = es.find((x) => cumple(p, x.si, a));
  if (e) return e.nodo;
  const ultima = es[es.length - 1];
  return ultima.si.length ? null : ultima.nodo;
}
/** P3: the ids of the people and things with a conversation that have nothing to say to this player now (the marks event
 * carries them as `callan`; the page offers no «E» for them). */
export function callan(p: Progreso, a: Aventura): string[] {
  const out: string[] = [];
  for (const n of a.pnjs.values()) if (nodoInicial(n, p, a) === null) out.push(n.id);
  const marcando = marcablesAhora(p, a); // P4: a marcable thing still opens its card (to mark) when its conversation has nothing to say
  for (const c of a.cosas.values()) if (c.dialogo && nodoInicial({ dialogo: c.dialogo }, p, a) === null && !marcando.includes(c.id)) out.push(c.id);
  return out;
}
/** P3: is a `coge` step on this thing to do now (so «E» on it picks it up, as always, instead of opening its conversation)? */
export function cogePendiente(p: Progreso, a: Aventura, cosa: string): boolean {
  return Object.entries(p.activas).some(([id, act]) => {
    const m = a.misiones.get(id);
    return !!m && m.pasos.some((s, n) => s.tipo === "coge" && s.cosa === cosa && pendiente(m, act, n));
  });
}

/** The options this player sees in a node (in order; those whose conditions fail are hidden). */
export const opcionesDe = (nodo: Nodo, p: Progreso, a: Aventura): Opcion[] => nodo.opciones.filter((o) => cumple(p, o.si, a)).slice(0, 4);

/** What the server saw the player do. U14 (5): `ahora` = the server's clock (ms) when it saw it; steps that wait
 * (mision@1 `espera`) are measured against it. */
export type Suceso = (
  | { tipo: "llega"; x: number; z: number; y?: number }      // it stands here (checked a few times a second); y = its feet's height (the ground when absent)
  | { tipo: "habla"; pnj: string }                           // it started talking to this person
  | { tipo: "avanzar"; pnj: string; mision: string }         // it chose an option avanzar_paso
  | { tipo: "entregar"; pnj: string; mision: string }        // it chose an option entregar
  | { tipo: "usa"; cosa: string; mision?: string }          // it took or used this thing; P3: `mision` = it chose an avanzar_paso option of that thing's conversation
  | { tipo: "hace"; accion: string; modelo?: string; disparador?: string } // T1: the builder did this (modelo = the sha256 of the placed object's model; disparador = the cable's id)
  | { tipo: "marca"; marcados: string[] }                    // P4: it marked or unmarked a thing; `marcados` = everything it has marked now
) & { ahora?: number };
/** A step completed: which quest, which step (index) and whether that finished the quest. */
export type Hecho = { mision: string; paso: number; completada: boolean };

/** P4: the same things, whatever the order. */
const mismoConjunto = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((c) => b.includes(c));

function cumplePaso(s: Paso, act: Activa, m: Mision, a: Aventura, x: Suceso): boolean {
  if (s.tipo === "marca") return x.tipo === "marca" && mismoConjunto(x.marcados, s.cosas); // P4: EXACTLY the relevant set — one thing more or less and it is not done
  // llega_a: inside the circle and, when the step names a height, standing at it (± ALCANCE_ALTURA_M: a floor below does not count)
  if (s.tipo === "llega_a") return x.tipo === "llega" && (x.x - s.x) ** 2 + (x.z - s.z) ** 2 <= s.radio ** 2 && alAlcanceEnAltura(x.y, s.y);
  if (s.tipo === "usa" || s.tipo === "coge") {
    // P3: a `usa` on a thing that holds a conversation is done only by choosing its avanzar_paso option (inspecting alone never counts)
    const conversa = s.tipo === "usa" && !!a.cosas.get(s.cosa)?.dialogo;
    return x.tipo === "usa" && x.cosa === s.cosa && (conversa ? x.mision === m.id : x.mision === undefined);
  }
  // hace: the action asked for; with `modelo` only an object of that model (coloca), with `disparador` only that cable
  if (s.tipo === "hace") return x.tipo === "hace" && x.accion === s.accion && (!s.modelo || x.modelo === shaDeBiblioteca(s.modelo)) && (!s.disparador || x.disparador === s.disparador);
  if (!("pnj" in s) || (x.tipo !== "habla" && x.tipo !== "avanzar" && x.tipo !== "entregar")) return false; // the rest are said to a person
  if (x.pnj !== s.pnj) return false;
  const exp = a.explicitos.get(s.pnj);
  if (s.tipo === "habla_con" || s.tipo === "recibe") return (x.tipo === "avanzar" && x.mision === m.id) || (x.tipo === "habla" && !exp?.avanza.has(m.id));
  return cosasDe(s).every((c) => act.tiene.includes(c)) && ((x.tipo === "entregar" && x.mision === m.id) || (x.tipo === "habla" && !exp?.entrega.has(m.id)));
}

function completar(p: Progreso, m: Mision): void {
  delete p.activas[m.id];
  if (!p.hechas.includes(m.id)) p.hechas.push(m.id);
  if (p.hechas.length > HECHAS_MAX) p.hechas.splice(0, p.hechas.length - HECHAS_MAX);
  if (p.seguida === m.id) p.seguida = Object.keys(p.activas)[0] ?? "";
}

/** Apply what the player did: completes at most one step per active quest — the first of its current block's pending
 * steps (in file order) that this matches and that no longer waits (U14 (5): `espera`, against `x.ahora`); the quest
 * moves past the block when all of it is done, and the next block starts counting then (`desde`). Changes `p`. */
export function registrar(p: Progreso, a: Aventura, x: Suceso): Hecho[] {
  const out: Hecho[] = [];
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m) continue;
    if (act.cierra !== undefined) { // a finished grupo is still on screen: it moves on at its time or at the first deliberate action
      if (x.ahora === undefined || x.ahora >= act.cierra || x.tipo !== "llega") cerrarBloque(m, act);
      else continue; // an arrival check inside the pause: the finished block has nothing left to do
    }
    const fin = finBloque(m, act.paso);
    let n = act.paso;
    while (n < fin && (act.hechos.includes(m.pasos[n].id) || faltaEspera(m, act, n, x.ahora) > 0 || !cumplePaso(m.pasos[n], act, m, a, x))) n++;
    if (n >= fin) continue;
    const s = m.pasos[n];
    if ((s.tipo === "coge" || s.tipo === "recibe") && !act.tiene.includes(s.cosa)) act.tiene.push(s.cosa);
    if (s.tipo === "entrega") { const dadas = cosasDe(s); act.tiene = act.tiene.filter((c) => !dadas.includes(c)); }
    act.hechos.push(s.id);
    if (m.pasos.slice(act.paso, fin).every((q) => act.hechos.includes(q.id))) { // the whole block: on to the next, which starts counting now
      if (x.ahora !== undefined && fin < m.pasos.length && fin - act.paso > 1 && m.pasos[act.paso].grupo) { // a grupo with something after it: its counter stays complete for a moment first
        act.cierra = x.ahora + PAUSA_GRUPO_MS;
        if (conEsperas(m)) act.desde = x.ahora; else delete act.desde; // the next block's waits count from now, as always
      } else {
        act.paso = fin; act.hechos = [];
        if (x.ahora !== undefined && conEsperas(m)) act.desde = x.ahora; else delete act.desde;
      }
    }
    const completada = act.paso >= m.pasos.length;
    out.push({ mision: id, paso: n, completada });
    if (completada) completar(p, m);
  }
  return out;
}

/** U14 (5): the first step to do now that this event would complete but that still waits (its quest, its index and
 * how long, ms) — what the server says when someone tries too early («Todavía no: …»); null when none. */
export function esperando(p: Progreso, a: Aventura, x: Suceso): { mision: string; paso: number; faltaMs: number } | null {
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m) continue;
    for (let n = act.paso, fin = finBloque(m, act.paso); n < fin; n++) {
      if (act.hechos.includes(m.pasos[n].id)) continue;
      const falta = faltaEspera(m, act, n, x.ahora);
      if (falta > 0 && cumplePaso(m.pasos[n], act, m, a, x)) return { mision: id, paso: n, faltaMs: falta };
    }
  }
  return null;
}

type Res = { ok: true } | { ok: false; motivo: string };
const no = (motivo: string): Res => ({ ok: false, motivo });

/** Take a quest (from a person who offers it: the server checks who and how close). Tracks it if nothing is tracked.
 * U14 (5): `ahora` (the server's clock, ms) starts the first block's wait, if one of its steps has `espera`. */
export function aceptar(p: Progreso, m: Mision, a: Aventura, ahora?: number): Res {
  if (p.activas[m.id]) return no(`Ya tienes «${m.titulo}» en tu libro.`);
  if (p.hechas.includes(m.id) && !m.repetible) return no(`Ya completaste «${m.titulo}».`);
  const falta = m.requisitos.misiones.filter((r) => !p.hechas.includes(r)).map((r) => `«${a.misiones.get(r)?.titulo ?? r}»`);
  if (falta.length) return no(`Antes tienes que completar ${falta.join(", ")}.`);
  if (Object.keys(p.activas).length >= ACTIVAS_MAX) return no(`Ya llevas ${ACTIVAS_MAX} misiones: termina o deja alguna.`);
  p.activas[m.id] = { paso: 0, tiene: [], hechos: [] };
  if (m.pasos.some((s) => s.tipo === "marca")) { delete p.cuenta?.[m.id]; if (p.cuenta && !Object.keys(p.cuenta).length) delete p.cuenta; delete p.marcados; } // P4: a new attempt of a quest that marks starts with nothing marked and its counters at zero
  if (ahora !== undefined && conEsperas(m)) p.activas[m.id].desde = ahora;
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
export function objetivo(s: Paso, a: Aventura, p?: Progreso): { x: number; z: number; nombre: string; que: string } {
  if (s.tipo === "llega_a") return { x: s.x, z: s.z, nombre: s.lugar, que: "" };
  if (s.tipo === "habla_con" || s.tipo === "recibe" || s.tipo === "entrega") { const n = a.pnjs.get(s.pnj), l = n && p && n.posiciones.length ? lugarDe(n, p, a) : null; return { x: l?.posicion.x ?? n?.posicion.x ?? 0, z: l?.posicion.z ?? n?.posicion.z ?? 0, nombre: n?.nombre ?? s.pnj, que: s.pnj }; } // P2: where THIS player finds the person
  if (s.tipo === "hace" || s.tipo === "marca") return { x: 0, z: 0, nombre: "", que: "" }; // T1: no place to point at (the page's `senala` is the arrow's target); P4: nor does marking (the book never says which)
  const c = a.cosas.get(s.cosa);
  return { x: c?.posicion.x ?? 0, z: c?.posicion.z ?? 0, nombre: c?.nombre ?? s.cosa, que: s.cosa };
}

/** True when some active quest has a «llega_a» step to do now (the server checks those players' positions). */
export const esperaLlegada = (p: Progreso, a: Aventura): boolean => Object.entries(p.activas).some(([id, act]) => {
  const m = a.misiones.get(id);
  // P3: a later `llega_a` that carries an `antes` notice is watched too (arriving early says why it is not time)
  return !!m && m.pasos.some((s, n) => s.tipo === "llega_a" && (pendiente(m, act, n) || (s.antes !== undefined && n >= act.paso && !act.hechos.includes(s.id))));
});

/** P3: the steps this event would complete if they were not still locked behind an earlier block (a step with `antes`
 * after the current block, not done): what the server answers with that step's `antes` notice. A `entrega` counts without
 * the things in hand (the player has not got them yet: that is why it is early). */
export function bloqueados(p: Progreso, a: Aventura, x: Suceso): { mision: string; paso: number; antes: string }[] {
  const out: { mision: string; paso: number; antes: string }[] = [];
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m) continue;
    for (let n = finBloque(m, act.paso); n < m.pasos.length; n++) {
      const s = m.pasos[n];
      if (s.antes === undefined) continue;
      const llevando: Activa = { ...act, tiene: [...act.tiene, ...(s.tipo === "entrega" ? cosasDe(s) : [])] };
      if (cumplePaso(s, llevando, m, a, x)) out.push({ mision: id, paso: n, antes: s.antes });
    }
  }
  return out;
}

// ---------- evidence markers (P4): what the player marked, its numbers and its counters ----------
/** The `marca` steps to do now (in the current block of an active quest, not done, not waiting): which quest and which step. */
export function pasosMarca(p: Progreso, a: Aventura, ahora?: number): { mision: string; paso: number }[] {
  const out: { mision: string; paso: number }[] = [];
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m) continue;
    m.pasos.forEach((s, n) => { if (s.tipo === "marca" && pendiente(m, act, n) && faltaEspera(m, act, n, ahora) === 0) out.push({ mision: id, paso: n }); });
  }
  return out;
}
/** The things this player may mark or unmark right now: every `marcable` thing while a `marca` step is the one to do, none otherwise. */
export const marcablesAhora = (p: Progreso, a: Aventura, ahora?: number): string[] =>
  pasosMarca(p, a, ahora).length ? [...a.cosas.values()].filter((c) => c.marcable).map((c) => c.id) : [];
/** What is marked, in order (the number of each is its place + 1). Ids the adventure no longer has as marcable are dropped first. */
export function marcados(p: Progreso, a: Aventura): string[] {
  if (p.marcados && p.marcados.some((c) => !a.cosas.get(c)?.marcable)) { const ok = p.marcados.filter((c) => a.cosas.get(c)?.marcable); if (ok.length) p.marcados = ok; else delete p.marcados; }
  return p.marcados ?? [];
}
/** This quest's counters (zeros when it has none yet). */
export const cuentaDe = (p: Progreso, mision: string): Cuenta => ({ marcas: 0, marcas_erroneas: 0, desmarcados: 0, ...p.cuenta?.[mision] });
function sumar(p: Progreso, mision: string, cambio: Partial<Cuenta>): void {
  const c = { ...cuentaDe(p, mision) };
  for (const k of Object.keys(cambio) as (keyof Cuenta)[]) c[k] = Math.min(CUENTA_TOPE, c[k] + (cambio[k] ?? 0));
  p.cuenta ??= {};
  delete p.cuenta[mision]; p.cuenta[mision] = c; // most recently touched last: the oldest goes first past CUENTAS_MAX
  for (const k of Object.keys(p.cuenta)) { if (Object.keys(p.cuenta).length <= CUENTAS_MAX) break; delete p.cuenta[k]; }
}
/** Mark a thing as evidence: it goes last (the next number). Counts one mark for each quest whose `marca` step is to do now, and a wrong
 * one when that quest's step(s) do not ask for the thing. Only while such a step is to do now. Changes `p`; the caller then
 * registers the event `{ tipo: "marca", marcados }` so a step that is now exactly right completes. */
export function marcar(p: Progreso, a: Aventura, cosa: string, ahora?: number): Res {
  const c = a.cosas.get(cosa);
  if (!c?.marcable) return no("Eso no se puede marcar.");
  const pasos = pasosMarca(p, a, ahora);
  if (!pasos.length) return no("Ahora no hay nada que señalizar.");
  const ya = marcados(p, a);
  if (ya.includes(cosa)) return no(`Ya ha marcado ${c.nombre}.`);
  if (ya.length >= LIM.marcados) return no(`Ya tiene ${LIM.marcados} cosas marcadas: desmarque alguna antes.`);
  p.marcados = [...ya, cosa];
  for (const id of new Set(pasos.map((x) => x.mision))) {
    const pide = pasos.filter((x) => x.mision === id).flatMap((x) => { const s = a.misiones.get(id)!.pasos[x.paso]; return s.tipo === "marca" ? s.cosas : []; });
    sumar(p, id, pide.includes(cosa) ? { marcas: 1 } : { marcas: 1, marcas_erroneas: 1 });
  }
  return { ok: true };
}
/** Unmark a thing: the ones marked after it move up one number. Counts one unmark for each quest whose `marca` step is to do now. */
export function desmarcar(p: Progreso, a: Aventura, cosa: string, ahora?: number): Res {
  const pasos = pasosMarca(p, a, ahora);
  if (!pasos.length) return no("Ahora no hay nada que señalizar.");
  const ya = marcados(p, a);
  if (!ya.includes(cosa)) return no(`No tiene marcado ${a.cosas.get(cosa)?.nombre ?? cosa}.`);
  const resto = ya.filter((c) => c !== cosa);
  if (resto.length) p.marcados = resto; else delete p.marcados;
  for (const id of new Set(pasos.map((x) => x.mision))) sumar(p, id, { desmarcados: 1 });
  return { ok: true };
}

// ---------- marks (U14 (4)): what each person and quest thing means to THIS player — the labels and the maps draw it ----------
/** `tiene`: people with «!» — they offer you a quest you may take now, or a step of yours to do now (in the current
 * block of an active quest) is said to them (habla_con, recibe, entrega). `cosas`: things with «!» — a step to do now
 * is to take or use them (coge, usa). `hecho`: people with «✓» — you already did what they had for you (they gave you a
 * quest you hold or finished, or a step done was said to them) and nothing of yours is pending with them: no step still
 * to do in any block (a step later in the quest waits for you: no ✓ yet), no offer. Nothing otherwise. */
export type Marcas = { tiene: string[]; hecho: string[]; cosas: string[] };
/** The marks for one player (pure: the server calls it after each book it sends). Each list without repeats and in a
 * fixed order, the most useful first (steps to do before offers; the active quests' people before the finished ones,
 * newest first), so a list cut for the wire (enTexto) loses the least. U14 (5): a step that still waits at `ahora`
 * (the server's clock) marks nothing yet — its person keeps neither «!» nor «✓» until it opens. */
export function marcas(p: Progreso, a: Aventura, ahora?: number): Marcas {
  const tiene = new Set<string>(), cosas = new Set<string>(), espera = new Set<string>(), vistos = new Set<string>();
  const dieron = (id: string) => { for (const d of a.dadores.get(id) ?? []) vistos.add(d); }; // the givers of a quest you have or had
  for (const [id, act] of Object.entries(p.activas)) {
    const m = a.misiones.get(id);
    if (!m || m.pistas === false) continue; // P3: a quest that does not point leaves no mark of its own
    m.pasos.forEach((s, n) => {
      if ("pnj" in s) (pasoHecho(m, act, n) ? vistos : espera).add(s.pnj);
      if (!pendiente(m, act, n) || faltaEspera(m, act, n, ahora) > 0) return;
      if ("pnj" in s) tiene.add(s.pnj);
      else if (s.tipo === "usa" || s.tipo === "coge") cosas.add(s.cosa);
    });
    dieron(id);
  }
  for (const id of [...p.hechas].reverse()) {
    const m = a.misiones.get(id);
    if (!m || m.pistas === false) continue;
    for (const s of m.pasos) if ("pnj" in s) vistos.add(s.pnj);
    dieron(id);
  }
  for (const m of a.misiones.values()) if (m.pistas !== false && disponible(p, m)) for (const d of a.dadores.get(m.id) ?? []) tiene.add(d);
  return { tiene: [...tiene], hecho: [...vistos].filter((x) => !tiene.has(x) && !espera.has(x)), cosas: [...cosas] };
}
/** An id list as the wire carries it: comma-separated, cut before the id that would pass `max` bytes (ids are ASCII). */
export function enTexto(ids: readonly string[], max: number): string {
  let s = "";
  for (const id of ids) { const t = s ? `${s},${id}` : id; if (t.length > max) break; s = t; }
  return s;
}
