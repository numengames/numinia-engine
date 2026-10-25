// M22c: encaje (snap) entre objetos — la geometría pura, sin three.js ni el DOM, para poder probarla con node --test.
// Dado el AABB (mínimo/máximo por eje) de lo que arrastras y el de un candidato, si sus caras están cerca a lo
// largo del eje elegido (y se solapan en los otros dos ejes, para no encajar con algo que no está enfrente),
// devuelve cuánto desplazar (en ese eje) para que las caras se toquen exactamente; null si no hay encaje cerca.
export type Caja3 = { min: [number, number, number]; max: [number, number, number] };

/** Si las dos cajas se solapan en los dos ejes que no son `idx` (están "una frente a la otra" en ese eje). */
export function seEnfrentan(mia: Caja3, otra: Caja3, idx: 0 | 1 | 2): boolean {
  for (let i = 0 as 0 | 1 | 2; i < 3; i++) {
    if (i === idx) continue;
    if (!(mia.min[i] < otra.max[i] && mia.max[i] > otra.min[i])) return false;
  }
  return true;
}

/** Cuánto mover `mia` en el eje `idx` para que su cara toque la de `otra` (null = no hay ninguna a menos de `umbral`). */
export function desplazamientoEncaje(mia: Caja3, otra: Caja3, idx: 0 | 1 | 2, umbral: number): number | null {
  if (!seEnfrentan(mia, otra, idx)) return null;
  const miMin = mia.min[idx], miMax = mia.max[idx], otraMin = otra.min[idx], otraMax = otra.max[idx];
  const porDebajo = otraMin - miMax;  // positivo = hueco cuando yo estoy por debajo (mi cara alta toca su cara baja)
  const porEncima = miMin - otraMax;  // positivo = hueco cuando yo estoy por encima (mi cara baja toca su cara alta)
  const cand: number[] = [];
  if (Math.abs(porDebajo) <= umbral) cand.push(porDebajo);
  if (Math.abs(porEncima) <= umbral) cand.push(-porEncima);
  if (!cand.length) return null;
  return cand.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
}

/** El mejor encaje de `mia` contra una lista de candidatos, en el eje `idx`; null si ninguno está lo bastante cerca. */
export function mejorEncaje(mia: Caja3, candidatos: Caja3[], idx: 0 | 1 | 2, umbral = 0.25): number | null {
  let mejor: number | null = null;
  for (const o of candidatos) {
    const d = desplazamientoEncaje(mia, o, idx, umbral);
    if (d !== null && (mejor === null || Math.abs(d) < Math.abs(mejor))) mejor = d;
  }
  return mejor;
}

/** Lote4 (t_20955be6): what the builder SEES while dragging on one axis. `mejorEncaje` with a wider reach than the snap:
 * `desplazamiento` is how far to move for the faces to touch, `falta` how much is left (metres), `encaja` whether the
 * snap takes it now (it is within `umbralEncaje`). Between `umbralEncaje` and `umbralGuia` the page draws a ghost at the
 * place where it will snap, so the jump is announced; null = nothing near enough to announce. */
export type GuiaEncaje = { desplazamiento: number; falta: number; encaja: boolean };
export function guiaEncaje(mia: Caja3, candidatos: Caja3[], idx: 0 | 1 | 2, umbralGuia = 0.6, umbralEncaje = 0.25): GuiaEncaje | null {
  const d = mejorEncaje(mia, candidatos, idx, Math.max(umbralGuia, umbralEncaje));
  if (d === null) return null;
  return { desplazamiento: d, falta: Math.abs(d), encaja: Math.abs(d) <= umbralEncaje };
}
