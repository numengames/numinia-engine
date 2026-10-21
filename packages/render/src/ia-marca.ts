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
