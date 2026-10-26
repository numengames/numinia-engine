// lucha — the creature data sheets (v1). A creature is numbers and a look, read by the server (coherence, box) and the
// page (colour); an agent reads this file and understands the creature without opening code (BACKLOG principle 1).
// MIS-245: a sheet may carry `conducta` (persecucion.ts): numbers for how it walks and strikes; without it a creature stands still.
// Design and the other eleven sheets: mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md §2. Each sheet names its canon
// source (numinia-archive, lore/game/manual/es/06-inventario-y-bestiario.md) and quotes it; the numbers are the engine's.

import type { Conducta } from "./persecucion.ts";

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
  /** How it walks and strikes (MIS-245). Absent = it stands still and only strikes back at who hits it. */
  conducta?: Conducta;
};

export const BESTIARIO: Record<string, Ficha> = {
  "guardian-crisalida": {
    nombre: "Guardián de Crisálida",
    coherenciaMax: 40,
    caja: { ancho: 2.4, alto: 1.2, largo: 1.4 },
    radio: 2.2,
    color: "#d9cfe6", // bone white with the canon's pale violet plates
    fuente: "Bestiario del manual de Numinia: «criatura reptiliana de naturaleza profundamente territorial, vinculada a un núcleo etérico que custodia con una agresividad extrema».",
    // «No persigue a quien abandona el territorio protegido»: the leash is its territory (SISTEMA-DE-LUCHA-Y-BESTIARIO §2: 3,5 m/s, 4 de daño, 16 ticks, 2,0 m)
    conducta: { velocidad: 3.5, vision: 9, correa: 10, alcance: 2.0, enfriamiento: 16, dano: 4, variacion: 2 },
  },
  "desgarraformas": {
    nombre: "Desgarraforma",
    coherenciaMax: 14,
    caja: { ancho: 0.8, alto: 1.6, largo: 0.8 },
    radio: 1.6,
    color: "#7d8691", // slate grey
    fuente: "Bestiario del manual de Numinia: «silueta humanoide, delgada y fibrosa, ligeramente encorvada»; piel «mineral, casi pétrea»; «Atacan generalmente en grupos, irrumpiendo desde posiciones inesperadas y retirándose».",
    conducta: { velocidad: 4.5, vision: 10, correa: 25, alcance: 1.6, enfriamiento: 10, dano: 2, variacion: 2 },
  },
  "umbrilego": {
    nombre: "Umbrílego",
    coherenciaMax: 24,
    caja: { ancho: 1.2, alto: 1.5, largo: 1.2 },
    radio: 2.0,
    color: "#4d5a52", // dark greenish grey
    fuente: "Bestiario del manual de Numinia: «masa oscura y semitranslúcida de fibras, membranas y tejidos húmedos, sostenida por varios apéndices largos y aracnoides»; «no intenta destruir físicamente a sus adversarios».",
    conducta: { velocidad: 2, vision: 8, correa: 15, alcance: 2.0, enfriamiento: 12, dano: 3, variacion: 1 },
  },
  "residuo-del-velo": {
    nombre: "Residuo del Velo",
    coherenciaMax: 6,
    caja: { ancho: 0.5, alto: 0.5, largo: 0.5 },
    radio: 1.4,
    color: "#a8844a", // oxidised brass
    fuente: "Glosario del manual de Numinia, «Residuos»: «tecnologías antiguas que han quedado fuera de uso»; como criatura es del motor: la unidad pequeña para aprender a pelear.",
    conducta: { velocidad: 3, vision: 6, correa: 10, alcance: 1.4, enfriamiento: 10, dano: 1, variacion: 2 },
  },
};
