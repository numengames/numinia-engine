// tools/economia — el simulador: N ticks sobre un diagrama, enteros y azar sembrado.
// Límite de capa: importa solo el diagrama (datos) y el RNG de packages/core (mulberry32, el mismo
// que usa la simulación del motor), para que la disciplina sea una: misma semilla → mismo resultado.
// No importa nada de Node ni del DOM: se puede correr en el servidor, en el navegador o en un test.
import { rngInt } from "../../packages/core/src/index.ts";
import type { Diagrama, Estado, Id, Nodo, Tasa } from "./diagrama.ts";

export type Opciones = {
  /** cuántos ticks simular */
  ticks: number;
  /** semilla del azar (uint32); la misma semilla con el mismo diagrama da la misma serie */
  semilla: number;
  /** condición de fin: si devuelve true al acabar un tick, la simulación para antes de `ticks` */
  hasta?: (leer: (id: Id) => number, tick: number) => boolean;
};

export type Resultado = {
  /** ticks simulados de verdad (≤ opciones.ticks si `hasta` paró antes) */
  ticks: number;
  /** por almacén, su cuenta al final de cada tick; el índice 0 es el estado inicial */
  series: Record<Id, number[]>;
  /** cuántas veces disparó cada nodo moviendo al menos una unidad */
  disparos: Record<Id, number>;
};

type Interno = {
  cuenta: Map<Id, number>;
  nodos: Map<Id, Nodo>;
  rng: Uint32Array;
  disparos: Map<Id, number>;
  turnos: Map<Id, number>; // contador de las puertas con reparto «turnos»
  activadores: Map<Id, Extract<Estado, { tipo: "activador" }>[]>;
  disparadores: Map<Id, Id[]>;
  leyendo: Set<Id>; // guarda contra registros que se leen a sí mismos
};

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

function leer(s: Interno, id: Id): number {
  const n = s.nodos.get(id);
  if (!n) return 0;
  if (n.tipo === "almacen") return s.cuenta.get(id) ?? 0;
  if (n.tipo !== "registro") return 0;
  if (s.leyendo.has(id)) return 0; // un registro que depende de sí mismo vale 0: se avisa en la validación futura, aquí no se cuelga
  s.leyendo.add(id);
  const v = tasa(s, n.valor);
  s.leyendo.delete(id);
  return v;
}

/** Evalúa una tasa a un entero ≥ 0 con el estado actual. */
export function tasa(s: Interno, t: Tasa | undefined): number {
  if (t === undefined) return 1;
  if (typeof t === "number") return t;
  if (typeof t === "function") return Math.max(0, Math.trunc(t((id) => leer(s, id), (n) => (n > 0 ? rngInt(s.rng, n) : 0))));
  if ("lee" in t) {
    const base = leer(s, t.lee) * (t.por ?? 1);
    const v = Math.floor(base / (t.entre ?? 1)) + (t.mas ?? 0);
    return Math.max(0, clamp(v, t.min ?? -Infinity, t.max ?? Infinity));
  }
  if ("dado" in t) {
    let suma = t.mas ?? 0;
    for (let i = 0; i < (t.veces ?? 1); i++) suma += 1 + rngInt(s.rng, t.dado);
    return Math.max(0, suma);
  }
  const [a, b] = t.uniforme;
  return a + rngInt(s.rng, b - a + 1);
}

function poner(s: Interno, id: Id, delta: number): number {
  const n = s.nodos.get(id);
  const max = n && n.tipo === "almacen" && n.max !== undefined ? n.max : Infinity;
  const antes = s.cuenta.get(id) ?? 0;
  const despues = clamp(antes + delta, 0, max);
  s.cuenta.set(id, despues);
  return despues - antes; // lo que de verdad se movió
}

function activo(s: Interno, id: Id): boolean {
  for (const a of s.activadores.get(id) ?? []) {
    const v = leer(s, a.si);
    const ok = a.es === "<" ? v < a.que : a.es === "<=" ? v <= a.que : a.es === ">" ? v > a.que : a.es === ">=" ? v >= a.que : a.es === "==" ? v === a.que : v !== a.que;
    if (!ok) return false;
  }
  return true;
}

/** Dispara un nodo; devuelve cuántas unidades movió. Encadena disparadores y salidas de puerta. */
function disparar(s: Interno, id: Id, profundidad: number): number {
  if (profundidad > 64) return 0; // un ciclo de disparadores no cuelga la simulación
  const n = s.nodos.get(id);
  if (!n || n.tipo === "almacen" || n.tipo === "registro" || !activo(s, id)) return 0;
  let movido = 0;
  if (n.tipo === "fuente") {
    if (n.probabilidad === undefined || rngInt(s.rng, 1000) < n.probabilidad) for (const sal of n.salidas) movido += poner(s, sal.a, tasa(s, sal.tasa));
  } else if (n.tipo === "sumidero") {
    movido += -poner(s, n.de, -tasa(s, n.tasa));
  } else if (n.tipo === "conversor") {
    for (let v = 0; v < (n.veces ?? 1); v++) {
      if (v > 0 && !activo(s, id)) break; // los activadores se miran en cada vez: lo que se compró ya cuenta
      const pide = n.entradas.map((e) => ({ de: e.de, n: tasa(s, e.tasa) }));
      if (!pide.every((p) => (s.cuenta.get(p.de) ?? 0) >= p.n)) break; // todo o nada
      for (const p of pide) movido += -poner(s, p.de, -p.n);
      for (const sal of n.salidas) poner(s, sal.a, tasa(s, sal.tasa));
    }
  } else if (n.tipo === "puerta") {
    const unidades = -poner(s, n.de, -tasa(s, n.tasa));
    const pesos = n.salidas.map((sal) => tasa(s, sal.peso));
    const total = pesos.reduce((a, b) => a + b, 0);
    for (let u = 0; u < unidades; u++) {
      if (total === 0) break; // sin pesos, las unidades se pierden
      let k: number;
      if (n.reparto === "turnos") { const t = s.turnos.get(id) ?? 0; s.turnos.set(id, t + 1); k = t % total; } else k = rngInt(s.rng, total);
      let i = 0;
      while (k >= pesos[i]) { k -= pesos[i]; i++; }
      const sal = n.salidas[i];
      movido++;
      if (sal.a !== undefined) poner(s, sal.a, 1);
      if (sal.dispara !== undefined) disparar(s, sal.dispara, profundidad + 1);
    }
  }
  if (movido > 0) {
    s.disparos.set(id, (s.disparos.get(id) ?? 0) + 1);
    for (const d of s.disparadores.get(id) ?? []) disparar(s, d, profundidad + 1);
  }
  return movido;
}

/**
 * Simula `ticks` pasos. En cada tick, los nodos `auto` disparan en el orden en que están declarados
 * (tiempo síncrono con orden fijo: es la regla que hace la serie reproducible); los pasivos solo
 * cuando algo los dispara. Valida antes con `validar()` — aquí se confía en el diagrama.
 */
export function simular(d: Diagrama, op: Opciones): Resultado {
  const s: Interno = {
    cuenta: new Map(), nodos: new Map(), rng: new Uint32Array([op.semilla >>> 0]), disparos: new Map(), turnos: new Map(),
    activadores: new Map(), disparadores: new Map(), leyendo: new Set(),
  };
  for (const n of d.nodos) { s.nodos.set(n.id, n); if (n.tipo === "almacen") s.cuenta.set(n.id, n.inicial ?? 0); }
  for (const e of d.estados ?? []) {
    if (e.tipo === "activador") s.activadores.set(e.activa, [...(s.activadores.get(e.activa) ?? []), e]);
    else s.disparadores.set(e.cuando, [...(s.disparadores.get(e.cuando) ?? []), e.dispara]);
  }
  const almacenes = d.nodos.filter((n) => n.tipo === "almacen").map((n) => n.id);
  const series: Record<Id, number[]> = {};
  for (const id of almacenes) series[id] = [s.cuenta.get(id) ?? 0];
  const autos = d.nodos.filter((n) => n.tipo !== "almacen" && n.tipo !== "registro" && (n.modo ?? "auto") === "auto").map((n) => n.id);
  let t = 0;
  for (; t < op.ticks; t++) {
    for (const id of autos) disparar(s, id, 0);
    for (const id of almacenes) series[id].push(s.cuenta.get(id) ?? 0);
    if (op.hasta && op.hasta((id) => leer(s, id), t + 1)) { t++; break; }
  }
  const disparos: Record<Id, number> = {};
  for (const n of d.nodos) if (n.tipo !== "almacen" && n.tipo !== "registro") disparos[n.id] = s.disparos.get(n.id) ?? 0;
  return { ticks: t, series, disparos };
}

// ---- Ayudas para sacar conclusiones de muchas corridas (Monte Carlo determinista) ----

/** Corre el mismo diagrama con las semillas 1..n (o las que se den). Mismo diagrama y semillas → mismas series. */
export function correr(d: Diagrama, op: Omit<Opciones, "semilla"> & { semillas: number | number[] }): Resultado[] {
  const semillas = typeof op.semillas === "number" ? Array.from({ length: op.semillas }, (_, i) => i + 1) : op.semillas;
  return semillas.map((semilla) => simular(d, { ticks: op.ticks, semilla, hasta: op.hasta }));
}

/** Primer tick en que el almacén alcanza `valor` (≥), o -1 si nunca. */
export function primerTick(r: Resultado, almacen: Id, valor: number): number {
  const serie = r.series[almacen] ?? [];
  for (let t = 0; t < serie.length; t++) if (serie[t] >= valor) return t;
  return -1;
}

export type Resumen = { n: number; min: number; p50: number; p95: number; max: number; media: number };

/** Mínimo, mediana, percentil 95, máximo y media de una lista de números (los -1 de «nunca» cuentan como Infinity). */
export function resumen(valores: number[]): Resumen {
  const v = valores.map((x) => (x < 0 ? Infinity : x)).sort((a, b) => a - b);
  const p = (q: number) => v[Math.max(0, Math.min(v.length - 1, Math.ceil(q * v.length) - 1))]; // rango más cercano
  const finitos = v.filter((x) => Number.isFinite(x));
  return { n: v.length, min: v[0], p50: p(0.5), p95: p(0.95), max: v[v.length - 1], media: finitos.length ? Math.round((finitos.reduce((a, b) => a + b, 0) / finitos.length) * 10) / 10 : Infinity };
}

/** El valor final de un almacén en cada corrida. */
export const finales = (rs: Resultado[], almacen: Id): number[] => rs.map((r) => r.series[almacen][r.series[almacen].length - 1]);
