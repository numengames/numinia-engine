// lucha — the creature data sheets (v1). A creature is numbers and a look, read by the server (coherence, box) and the
// page (colour); an agent reads this file and understands the creature without opening code (BACKLOG principle 1).
// Design and the other eleven sheets: mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md §2. Each sheet names its canon
// source (numinia-archive, lore/game/manual/es/06-inventario-y-bestiario.md) and quotes it; the numbers are the engine's.

export type Ficha = {
  nombre: string;
  /** Coherence (the creature's «hit points»): it dissolves at 0 — in Numinia creatures are dissolved, not killed. */
  coherenciaMax: number;
  /** The solid box (m), centred on x,z and standing on y: ancho = along x, alto = y, largo = along z. */
  caja: { ancho: number; alto: number; largo: number };
  /** Interaction reach (m) from its centre: «E: golpear» appears inside radio + the J4 slack. */
  radio: number;
  /** Flat colour for the placeholder block («#rrggbb»): low-poly, honest mesh (PRI-008). */
  color: string;
  /** Where it comes from, in the canon's own words (short). */
  fuente: string;
};

export const BESTIARIO: Record<string, Ficha> = {
  "guardian-crisalida": {
    nombre: "Guardián de Crisálida",
    coherenciaMax: 40,
    caja: { ancho: 2.4, alto: 1.2, largo: 1.4 },
    radio: 2.2,
    color: "#d9cfe6", // bone white with the canon's pale violet plates
    fuente: "Bestiario del manual de Numinia: «criatura reptiliana de naturaleza profundamente territorial, vinculada a un núcleo etérico que custodia con una agresividad extrema».",
  },
};
