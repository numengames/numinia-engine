// ojos-ia-forma (t_5096d6f4, MIS-229): the flat outline of one AI eye per shape, pure (no three.js) so a test can count what is drawn.
// The scale (colour + shape per model size) lives in features/ia/ojos.ts; the page hands the render only `{ color, forma }`.
// Shape is as important as colour: a colour-blind person tells the steps by it. Units are metres on the face, eye centred on (0,0).
export type FormaOjo = "punto" | "ranura" | "redondo" | "estrella";
export const FORMAS_OJO: readonly FormaOjo[] = ["punto", "ranura", "redondo", "estrella"];
/** Where the eyes sit on the face: half the distance between them. */
export const SEPARACION_OJOS_M = 0.045;

type Contorno = { x: number; y: number }[];
const elipse = (rx: number, ry: number, lados: number): Contorno => Array.from({ length: lados }, (_, i) => ({ x: Math.cos((i / lados) * Math.PI * 2) * rx, y: Math.sin((i / lados) * Math.PI * 2) * ry }));
const estrella = (ext: number, int: number, puntas: number): Contorno => Array.from({ length: puntas * 2 }, (_, i) => { const r = i % 2 === 0 ? ext : int, a = (i / (puntas * 2)) * Math.PI * 2 + Math.PI / 2; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; });

/** The outline of one eye (convex or star, a fan from the centre draws it). */
export function contornoOjo(forma: FormaOjo): Contorno {
  switch (forma) {
    case "punto": return elipse(0.011, 0.011, 8);        // a small dot: a script
    case "ranura": return elipse(0.03, 0.011, 12);       // a wide thin slit
    case "redondo": return elipse(0.024, 0.024, 16);     // a round eye
    case "estrella": return estrella(0.042, 0.012, 4);   // a four-pointed sparkle
  }
}

/** Both eyes of one shape as a triangle fan each: `posiciones` (x,y,z per vertex, z = 0) and `indices`. The same arrays are shared by every AI of that shape. */
export function geometriaOjos(forma: FormaOjo): { posiciones: Float32Array; indices: Uint16Array; vertices: number; triangulos: number } {
  const c = contornoOjo(forma), pos: number[] = [], idx: number[] = [];
  for (const lado of [-1, 1]) {
    const base = pos.length / 3;
    pos.push(lado * SEPARACION_OJOS_M, 0, 0);
    for (const p of c) pos.push(lado * SEPARACION_OJOS_M + p.x, p.y, 0);
    for (let i = 0; i < c.length; i++) idx.push(base, base + 1 + i, base + 1 + ((i + 1) % c.length));
  }
  return { posiciones: new Float32Array(pos), indices: new Uint16Array(idx), vertices: pos.length / 3, triangulos: idx.length / 3 };
}

/** How many AIs show their eyes at once (the nearest ones win): one draw call each. */
export const OJOS_PC = 12, OJOS_MOVIL = 4;
export const ojosMax = (movil: boolean): number => (movil ? OJOS_MOVIL : OJOS_PC);
/** Beyond this the eyes are a speck; the name plate and the ring tell who is an AI from afar. */
export const OJOS_VISTOS_HASTA_M = 14;
/** The marks grow with distance (up to ×3 at 12 m) so a shape is still readable across a room. */
export const escalaOjos = (distM: number): number => Math.min(3, Math.max(1, distM / 4));
