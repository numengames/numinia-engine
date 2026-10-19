// gente-politica (ux2-gente): which person a click lands on. Pure, no three.js: the view projects each person's feet and
// the top of their head to the screen (index.ts pickPerson) and hands them here; the nearest body whose screen box holds
// the point wins. A body is ~1.7 m tall and ~0.7 m wide with its arms, so its box is ANCHO of its screen height wide;
// a far body still takes a click MIN_PX wide and tall (a person 60 m away is a few pixels).

export type Proyectada = { id: number; pies: { x: number; y: number }; cabeza: { x: number; y: number }; prof: number };
export const ANCHO = 0.42;
export const MIN_PX = 22;

/** The id of the person under (x, y), the nearest to the camera when bodies overlap; null if none. `prof` <= 0 = behind. */
export function personaEn(lista: Iterable<Proyectada>, x: number, y: number): number | null {
  let mejor: number | null = null, cerca = Infinity;
  for (const p of lista) {
    if (!(p.prof > 0)) continue;
    const alto = Math.max(MIN_PX, Math.hypot(p.pies.x - p.cabeza.x, p.pies.y - p.cabeza.y));
    const cx = (p.pies.x + p.cabeza.x) / 2, cy = (p.pies.y + p.cabeza.y) / 2;
    const medio = Math.max(MIN_PX / 2, (alto * ANCHO) / 2);
    if (Math.abs(x - cx) <= medio && Math.abs(y - cy) <= alto / 2 && p.prof < cerca) { mejor = p.id; cerca = p.prof; }
  }
  return mejor;
}
