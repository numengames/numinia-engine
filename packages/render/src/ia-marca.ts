// ia-marca (ia-visible S4/S5): how an AI is told apart from a person on screen, pure (no three.js, no DOM) so it is tested alone.
// Three signs share ONE green (the map's diamond for an agent, `#14897a`): the name plate (always on, a green border, an «IA» chip,
// a moon when asleep: S4), the ring on the floor (aros.ts, S5) and the diamond on the map (S5). The server says who is an AI and in
// which state (features/ia); the page only draws. Nothing here decides anything.

export const VERDE_IA = "#14897a";          // the same green as the map's «agente» diamond
export const VERDE_IA_CLARO = "#8fd8cc";    // the chip's ink on the plate and the dormant ring's tint
export type EstadoIA = "activa" | "dormida";
/** The name the server gives an AI ends with this (instance/identidad.ts MARCA_IA); the chip replaces it on the plate. */
const MARCA_NOMBRE = " · IA";

/** How an AI's name plate differs from a person's. `null` ficha = a person: nothing changes for them. */
export type EstiloCartel = {
  siempre: true;          // the plate is on whether or not you look at it (a person's shows only when looked at or speaking)
  borde: string;          // border colour
  chip: "IA";             // the label drawn next to the name
  luna: boolean;          // a crescent after the chip: asleep, answers only when called
  tinta: string;          // the name's letters (a little dimmer when asleep)
  chipFondo: string;
  chipTinta: string;
};

/** The plate's style for an entity: its public card's state if it is an AI, `null` if it is a person (their plate keeps its rules). */
export function estiloCartel(estado: EstadoIA | null | undefined): EstiloCartel | null {
  if (estado !== "activa" && estado !== "dormida") return null;
  const dormida = estado === "dormida";
  return { siempre: true, borde: dormida ? "#3f7f77" : VERDE_IA, chip: "IA", luna: dormida, tinta: dormida ? "#c5d3d0" : "#f4f7fb", chipFondo: dormida ? "#3f7f77" : VERDE_IA, chipTinta: "#ffffff" };
}

/** The name without the server's « · IA» suffix when the plate carries the chip instead (never empties a name that is only the suffix). */
export function nombreSinMarca(texto: string): string {
  return texto.length > MARCA_NOMBRE.length && texto.endsWith(MARCA_NOMBRE) ? texto.slice(0, -MARCA_NOMBRE.length) : texto;
}

/** Colour and opacity of the ring on the floor under an AI (S5): bright when active, faint when asleep. */
export function estiloAro(estado: EstadoIA): { color: number; opacidad: number } {
  return estado === "dormida" ? { color: 0x6fb3a9, opacidad: 0.4 } : { color: 0x14897a, opacidad: 0.95 };
}
/** How many rings a device draws at once (draw calls on phones); the nearest ones win. */
export const AROS_PC = 24, AROS_MOVIL = 8;
export const arosMax = (movil: boolean): number => (movil ? AROS_MOVIL : AROS_PC);
/** The ring grows with the distance (seen from afar without reading), up to ×3, the way a name plate does from 8 m. */
export const ARO_CRECE_DESDE_M = 8, ARO_CRECE_MAX = 3;
export const escalaAro = (distM: number): number => Math.min(ARO_CRECE_MAX, Math.max(1, distM / ARO_CRECE_DESDE_M));
