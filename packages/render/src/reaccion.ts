// reaccion (lote 5, «los moñoñis reaccionan al clic»): the little hop a placed thing makes when it is clicked — a crouch, two bounces
// that die down, a squash on each landing. Pure: `reaccionDe(x)` maps progress 0…1 to an offset up (metres, for a 1 m tall thing: the
// caller multiplies by the thing's scale) and a stretch (width, height); the render owns the clock and puts the thing back exactly where its
// state says when it ends. Local to whoever clicked (nothing is sent, nothing is stored): a greeting, not an event of the world.
export const REACCION_MS = 900;
export type Reaccion = { sube: number; ancho: number; alto: number };
const REPOSO: Reaccion = { sube: 0, ancho: 1, alto: 1 };

export function reaccionDe(x: number): Reaccion {
  if (!(x > 0) || x >= 1) return REPOSO;
  if (x < 0.12) { const k = x / 0.12; return { sube: 0, ancho: 1 + 0.12 * k, alto: 1 - 0.18 * k }; } // crouch before the jump
  if (x < 0.55) { const k = (x - 0.12) / 0.43, a = Math.sin(k * Math.PI); return { sube: 0.32 * a, ancho: 1.12 - 0.12 * k - 0.08 * a, alto: 0.82 + 0.18 * k + 0.1 * a }; } // the big hop
  if (x < 0.62) { const k = (x - 0.55) / 0.07; return { sube: 0, ancho: 1.04 + 0.08 * Math.sin(k * Math.PI), alto: 1 - 0.14 * Math.sin(k * Math.PI) }; } // landing squash
  if (x < 0.88) { const k = (x - 0.62) / 0.26; return { sube: 0.12 * Math.sin(k * Math.PI), ancho: 1, alto: 1 + 0.05 * Math.sin(k * Math.PI) }; } // the small hop
  const k = (x - 0.88) / 0.12; return { sube: 0, ancho: 1 + 0.05 * (1 - k), alto: 1 - 0.07 * (1 - k) }; // settle
}
