// ia-presencia: an AI faces the person it is with (Pablo, 2026-11-11: «cuando te metes dentro de su zona de acción, que te mire, que note
// tu presencia, que esté presente contigo»). The SERVER decides whom (features/burbuja `mira`: the first person who came into its bubble,
// while they stay; then the nearest inside; never another AI). The page only turns that AI's body towards them while it stands still
// (render `orientar`, eased in avatares.ts), and lets go when it attends to nobody. Every page does the same with the same state, so
// everyone sees the AI look at the same person. A world without AIs does nothing here (one empty list, ten times a second).
export const CADA_MS = 100;        // how often the heading is worked out (the body eases between, so 10 Hz looks continuous)
const JUNTOS_M2 = 0.01;            // closer than 10 cm the heading means nothing: keep the one it has

/** Heading (radians, the avatars' `rumbo`: atan2(dx, dz), 0 = +z) from `de` towards `a`, or undefined when they stand on the same spot. Pure. */
export function rumboHacia(de: { x: number; z: number }, a: { x: number; z: number }): number | undefined {
  const dx = a.x - de.x, dz = a.z - de.z;
  return dx * dx + dz * dz < JUNTOS_M2 ? undefined : Math.atan2(dx, dz);
}

type Pos = { id: number; x: number; z: number };
export function montarPresencia(o: {
  /** features/burbuja/client.ts: every AI's bubble and whom it is with. */
  burbujas: { lista(): { quien: number }[]; mira(quien: number): number };
  /** Your own entity (-1 before joining) and position; everybody else's (interpolated, as drawn). */
  yo(): number;
  miPosicion(): { x: number; z: number } | null;
  otros(): readonly Pos[];
  /** render: face this heading while standing still (undefined = back to facing where it walks). */
  orientar(quien: number, rumbo: number | undefined): void;
}) {
  const orientadas = new Set<number>(); // AIs this module is turning now (only these are let go)
  let ultimo = -Infinity;
  const posDe = (q: number, otros: readonly Pos[] | null): { x: number; z: number } | null =>
    q === o.yo() ? o.miPosicion() : otros?.find((r) => r.id === q) ?? null;
  return {
    /** Once per frame; works at most every CADA_MS. */
    cuadro(ahora: number): void {
      if (ahora - ultimo < CADA_MS) return;
      ultimo = ahora;
      const ias = o.burbujas.lista();
      if (ias.length === 0 && orientadas.size === 0) return;
      let otros: readonly Pos[] | null = null;
      const vistas = new Set<number>();
      for (const { quien } of ias) {
        const m = o.burbujas.mira(quien);
        if (m < 0) continue;
        otros ??= o.otros();
        const de = posDe(quien, otros), a = posDe(m, otros);
        if (!de || !a) continue;
        const r = rumboHacia(de, a);
        vistas.add(quien);
        if (r === undefined) continue; // on the same spot: keep the heading it has
        o.orientar(quien, r);
        orientadas.add(quien);
      }
      for (const q of orientadas) if (!vistas.has(q)) { o.orientar(q, undefined); orientadas.delete(q); }
    },
    /** For checks: which AIs are being turned now. */
    orientadas: (): number[] => [...orientadas].sort((a, b) => a - b),
  };
}
