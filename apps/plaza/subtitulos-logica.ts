// V13 (docs/V13-SUBTITULOS-VOZ.md): the pure part of the voice subtitles — no DOM, no clock of its own.
// Where a speaker is relative to where you look (8 sectors, 8° hysteresis), near/far with hysteresis, who leaves when there
// are more boxes than room, and how long a box stays. The page part is subtitulos.ts.

/** The 8 sectors of 45°, clockwise from straight ahead: the word in the box (§4) and the sentence the screen reader says (§7). */
export const SECTORES: readonly { palabra: string; lector: string }[] = [
  { palabra: "delante", lector: "delante de ti" },
  { palabra: "delante dcha.", lector: "delante de ti a la derecha" },
  { palabra: "derecha", lector: "a tu derecha" },
  { palabra: "detrás dcha.", lector: "detrás de ti a la derecha" },
  { palabra: "detrás", lector: "detrás de ti" },
  { palabra: "detrás izq.", lector: "detrás de ti a la izquierda" },
  { palabra: "izquierda", lector: "a tu izquierda" },
  { palabra: "delante izq.", lector: "delante de ti a la izquierda" },
];
export const HISTERESIS_GRADOS = 8;
export const CERCA_M = 15;          // half of VOZ_RADIO_M (30 m)
export const HISTERESIS_M = 1;
export const MARGEN_VISTA_GRADOS = 5;
export const MIN_EN_PANTALLA_MS = 1500;

const PI = Math.PI, DOS_PI = 2 * Math.PI, GRADO = PI / 180;

/** Angle in (−π, π] of `otro` as seen from `yo` looking along camera `yaw`: 0 = straight ahead, + = to the right.
 *  Camera forward is (−sin yaw, −cos yaw) in (x, z); right is (cos yaw, −sin yaw) (the same frame as the camera). */
export function anguloRelativo(yaw: number, yo: { x: number; z: number }, otro: { x: number; z: number }): number {
  const dx = otro.x - yo.x, dz = otro.z - yo.z;
  const delante = -Math.sin(yaw) * dx - Math.cos(yaw) * dz, derecha = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  return Math.atan2(derecha, delante);
}

const normalizar = (a: number): number => { a = (a + PI) % DOS_PI; if (a < 0) a += DOS_PI; return a - PI; };

/** Sector 0–7 for an angle. With `previo`, the sector only changes once the angle is HISTERESIS_GRADOS past the border. */
export function sectorDe(angulo: number, previo?: number): number {
  const crudo = Math.round(normalizar(angulo) / (PI / 4));
  const nuevo = ((crudo % 8) + 8) % 8;
  if (previo === undefined || previo === nuevo) return nuevo;
  const centro = previo * (PI / 4);
  const distancia = Math.abs(normalizar(angulo - centro));
  return distancia <= PI / 8 + HISTERESIS_GRADOS * GRADO ? previo : nuevo;
}

/** In sight: inside half the horizontal field of view minus 5° on each side (§4): then there is no arrow and no word. */
export function aLaVista(angulo: number, campoHorizontalGrados: number): boolean {
  return Math.abs(normalizar(angulo)) < (campoHorizontalGrados / 2 - MARGEN_VISTA_GRADOS) * GRADO;
}

/** Far (> 15 m up to 30 m) with 1 m of hysteresis: once far, it is near again only at 14 m or less. */
export function esLejos(distanciaM: number, eraLejos: boolean): boolean {
  return eraLejos ? distanciaM > CERCA_M - HISTERESIS_M : distanciaM > CERCA_M;
}

/** Seconds a box stays after the last word: about 15 characters per second of reading, between 3 and 8. */
export function permanenciaMs(caracteres: number): number {
  return Math.min(8, Math.max(3, caracteres / 15)) * 1000;
}

export type Caja = { entidad: number; escenario: boolean; llegada: number; ultima: number };

/** There is no room for a new box: which one leaves? The one whose last word is oldest; never the stage's, never one that has
 *  been on screen less than 1.5 s. `null` = nobody can leave yet, the new one waits. */
export function quienSale(cajas: readonly Caja[], ahora: number): number | null {
  let elegida: Caja | null = null;
  for (const c of cajas) {
    if (c.escenario || ahora - c.llegada < MIN_EN_PANTALLA_MS) continue;
    if (!elegida || c.ultima < elegida.ultima) elegida = c;
  }
  return elegida ? elegida.entidad : null;
}

/** Display order: the stage first (top), then by arrival, the newest at the bottom, next to the view. */
export function ordenar<T extends Caja>(cajas: readonly T[]): T[] {
  return [...cajas].sort((a, b) => (a.escenario === b.escenario ? a.llegada - b.llegada : a.escenario ? -1 : 1));
}

/** The line the screen reader gets (§7), e.g. «Marta, detrás de ti a la izquierda, lejos: habla.» */
export function frase(o: { nombre: string; escenario: boolean; escrito?: boolean; sector?: number | null; lejos?: boolean; texto: string }): string {
  const partes = [o.nombre];
  if (o.escenario) partes.push("en el escenario");
  else {
    if (o.escrito) partes.push("escrito");
    if (o.sector !== null && o.sector !== undefined) partes.push(SECTORES[o.sector].lector);
    if (o.lejos) partes.push("lejos");
  }
  return `${partes.join(", ")}: ${o.texto}`;
}

/** The name as «Gente» shows it, cut at 24 characters with «…» (§3). */
export const recortarNombre = (n: string): string => (n.length > 24 ? `${n.slice(0, 23)}…` : n);
