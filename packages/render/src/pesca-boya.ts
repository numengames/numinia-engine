// pesca-boya — the maths of the gauge that stands on MY float at the waterline (pure: no three, no DOM; test/pesca-boya.test.ts).
// Pablo: «la barra de pesca venga como en la línea de flotación ... y desde la boya». While a fish bites (picada) or fights
// (pelea) a small card rises from the water beside my own float showing the line's tension (green → yellow → red from 80 %,
// a notch marks the 80 %) and how close the fish is (progress). A coming surge (arrancada «aviso») makes it pulse slowly in
// orange, a surge («si») fast in red. It grows with the distance to the eye (clamped) so it reads from the third-person
// camera at ~8 m and from a headset at arm's length. Others' floats get no card. The drawing (one mesh, one canvas texture
// repainted only when a value moves by ≥ 1 %) is in pesca.ts; here only what can be decided without a GPU.
export type FaseBoya = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";
export type EntradaBoya = { fase: FaseBoya; tension: number; progreso: number; arrancada: "no" | "aviso" | "si" };

/** From this tension (%) the line is about to snap: the bar is red and the page says «suelta». Same threshold as the HUD. */
export const TENSION_ALTA = 80;
/** From this tension (%) the bar leaves green for yellow. */
export const TENSION_MEDIA = 60;
export const VERDE = "#7bd389", AMARILLO = "#f0c35b", ROJO = "#e5484d", NARANJA = "#ff8a5b";
/** Width of the card (m) at its smallest scale, and the distance (m) to the eye at which scale 1 is reached. */
export const ANCHO_M = 0.62, DIST_UNO_M = 4, ESCALA_MIN = 0.8, ESCALA_MAX = 2.6;

const limitar = (v: number, a: number, b: number) => (Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a);

/** Is the card on view: only for my own float, and only while the fish bites or fights. */
export function boyaVisible(fase: FaseBoya, mio: boolean): boolean {
  return mio && (fase === "picada" || fase === "pelea");
}

/** Colour of the tension bar: green below 60 %, yellow below 80 %, red from 80 % on. */
export function colorTension(tension: number): string {
  const t = limitar(tension, 0, 100);
  return t >= TENSION_ALTA ? ROJO : t >= TENSION_MEDIA ? AMARILLO : VERDE;
}

/** Scale of the card for a given distance (m) to the eye: it grows with the distance so it keeps a readable angular size, within limits. */
export function escalaBoya(distancia: number): number {
  return limitar(distancia / DIST_UNO_M, ESCALA_MIN, ESCALA_MAX);
}

/** Pulse of the whole card (a factor around 1) at time `ms`: still without a surge, slow and small on «aviso», fast and bigger on «si». */
export function pulsoBoya(arrancada: EntradaBoya["arrancada"], ms: number): number {
  if (arrancada === "si") return 1 + 0.09 * Math.sin(ms / 45);
  if (arrancada === "aviso") return 1 + 0.05 * Math.sin(ms / 140);
  return 1;
}

/** Colour of the card's frame: orange on a coming surge, red on a surge or a tension past the limit, none otherwise. */
export function marcoBoya(e: EntradaBoya): string | null {
  if (e.arrancada === "si" || (e.fase === "pelea" && e.tension >= TENSION_ALTA)) return ROJO;
  if (e.arrancada === "aviso" || e.fase === "picada") return NARANJA;
  return null;
}

/** What the canvas shows, as a string: equal strings = same picture, so the texture is repainted only when this changes (values by 1 %). */
export function claveBoya(e: EntradaBoya): string {
  const pelea = e.fase === "pelea";
  return `${e.fase}|${pelea ? Math.round(limitar(e.tension, 0, 100)) : 0}|${pelea ? Math.round(limitar(e.progreso, 0, 100)) : 0}|${e.arrancada}`;
}

/** Fill fractions (0..1) of the tension and progress bars; empty outside the fight. */
export function rellenos(e: EntradaBoya): { tension: number; progreso: number } {
  return e.fase === "pelea" ? { tension: limitar(e.tension, 0, 100) / 100, progreso: limitar(e.progreso, 0, 100) / 100 } : { tension: 0, progreso: 0 };
}
