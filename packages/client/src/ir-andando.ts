// ir-andando (MIS-257, t_fb535386): the avatar walks by itself to a marked point on the ground. Pure (no DOM, no three.js,
// no network): tested in Node. It does NOT move anyone: it hands the page the same two stick axes a keyboard or a pad
// would (the world frame, -1..1), tick by tick, so the simulation — the server's own and the page's prediction —
// does the walking: walls stop it, slopes and low steps are climbed as for a person, nothing is teleported.
// It stops by itself when (1) it arrives, (2) a hand touches the controls (a key, the stick, the pad, a jump), or
// (3) it is stuck: no real progress for ATASCO_MS (a wall or a drop in the straight line: there is no pathfinding here,
// «no direct way» is said out loud and the person goes round). It also gives up on a point farther than MAX_M.
// The page owns the words (a notice per reason) and the marker; this file only decides «keep going» or «stop, because…».

export type Motivo = "llegada" | "mando" | "atasco" | "cancelado" | "tiempo";
export type Punto = { x: number; z: number };
export type Destino = Punto & { nombre: string };

/** Close enough: the avatar is on the point (the map's own «you arrived» is 2.5 m, a little wider). */
export const LLEGADA_M = 1.5;
/** No progress of at least PROGRESO_M towards the point for this long = stuck against something. */
export const ATASCO_MS = 2000;
export const PROGRESO_M = 0.35;
/** Farther than this the page answers «too far to walk» instead of starting (the teleport is for that). */
export const MAX_M = 600;
/** Beyond this the avatar runs (Shift held), then walks the last stretch. Walking is 1.5 m/s, running 4 m/s. */
export const CORRER_DESDE_M = 25;
/** Safety net: a trip never lasts more than this many times the walking time (plus 20 s) — a body that «moves» but never arrives. */
export const FACTOR_TIEMPO = 2.5;
const CAMINAR_MS = 1.5;

export type Ejes = { x: number; z: number; correr: boolean };
export type Fin = { motivo: Motivo; destino: Destino; distancia: number };

/** Unit direction in the world frame from `de` to `a` (0, 0 when they are the same point) and the distance (m). */
export function rumbo(de: Punto, a: Punto): { x: number; z: number; d: number } {
  const dx = a.x - de.x, dz = a.z - de.z, d = Math.hypot(dx, dz);
  return d < 1e-9 ? { x: 0, z: 0, d: 0 } : { x: dx / d, z: dz / d, d };
}

/** Can a trip from `de` to `a` start? Not when it is already there, nor farther than MAX_M, nor a non-number. */
export function puedeIr(de: Punto, a: Punto): { ok: true } | { ok: false; motivo: "ya-estas" | "lejos" | "invalido" } {
  if (![de.x, de.z, a.x, a.z].every(Number.isFinite)) return { ok: false, motivo: "invalido" };
  const d = Math.hypot(a.x - de.x, a.z - de.z);
  if (d <= LLEGADA_M) return { ok: false, motivo: "ya-estas" };
  if (d > MAX_M) return { ok: false, motivo: "lejos" };
  return { ok: true };
}

/** The sentence the page says when a trip ends (or cannot start). `nombre` is the destination's name. */
export function frase(motivo: Motivo | "ya-estas" | "lejos" | "invalido" | "empieza", nombre: string): string {
  switch (motivo) {
    case "empieza": return `Vas andando a ${nombre}. Toca cualquier mando o tecla para parar.`;
    case "llegada": return `Has llegado: ${nombre}.`;
    case "mando": return "Dejas de andar solo: has tocado los mandos.";
    case "atasco": return `No hay camino directo a ${nombre}: algo corta el paso. Me paro; rodéalo y pulsa Ir otra vez.`;
    case "tiempo": return `No llego a ${nombre}: me paro.`;
    case "cancelado": return "Dejas de andar solo.";
    case "ya-estas": return `Ya estás en ${nombre}.`;
    case "lejos": return `${nombre} queda demasiado lejos para ir andando (más de ${MAX_M} m).`;
    default: return "No puedo ir a ese punto.";
  }
}

export type IrAndando = {
  /** Start walking to `destino` from `desde` (replaces a trip in progress). */
  empezar(destino: Destino, desde: Punto): { ok: true } | { ok: false; motivo: "ya-estas" | "lejos" | "invalido" };
  /** One look per tick (20 Hz): where you are now, and whether a hand is on the controls. The axes to use this tick,
   * or null when no trip is going (it just ended: `alTerminar` has been told why, once). */
  ejes(pos: Punto, manual: boolean): Ejes | null;
  /** Stop (the page cancels it: the world closed, you were moved, a dialogue took the stage). */
  cancelar(motivo?: Motivo): void;
  activo(): boolean;
  destino(): Destino | null;
};

/** The trip's state machine. `ahora()` is ms (performance.now in the page, a counter in tests). */
export function crearIrAndando(o: { ahora(): number; alTerminar?(f: Fin): void }): IrAndando {
  let dest: Destino | null = null;
  let mejor = Infinity, tMejor = 0, t0 = 0, limite = 0, dUltima = 0;
  const terminar = (motivo: Motivo): null => {
    if (!dest) return null;
    const d = dest; dest = null;
    o.alTerminar?.({ motivo, destino: d, distancia: dUltima });
    return null;
  };
  return {
    empezar(destino, desde) {
      const p = puedeIr(desde, destino);
      if (!p.ok) return p;
      const d = Math.hypot(destino.x - desde.x, destino.z - desde.z), t = o.ahora();
      dest = { x: destino.x, z: destino.z, nombre: destino.nombre };
      mejor = d; tMejor = t; t0 = t; dUltima = d;
      limite = ((d / CAMINAR_MS) * FACTOR_TIEMPO + 20) * 1000;
      return { ok: true };
    },
    ejes(pos, manual) {
      if (!dest) return null;
      if (manual) return terminar("mando");
      const r = rumbo(pos, dest), t = o.ahora();
      dUltima = r.d;
      if (r.d <= LLEGADA_M) return terminar("llegada");
      if (r.d < mejor - PROGRESO_M) { mejor = r.d; tMejor = t; }
      if (t - tMejor >= ATASCO_MS) return terminar("atasco");
      if (t - t0 >= limite) return terminar("tiempo");
      return { x: r.x, z: r.z, correr: r.d > CORRER_DESDE_M };
    },
    cancelar(motivo = "cancelado") { terminar(motivo); },
    activo: () => dest !== null,
    destino: () => (dest ? { ...dest } : null),
  };
}
