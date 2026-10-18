// lucha — ability kits (combat level 2). A kit is a table: damage, cooldown, Carga cost and Carga generated per ability,
// read by the server (decides) and later by the page (bar, buttons). Numbers: work/fabrica/IDEAS-MODOS.md § «Combate
// nivel 2». They exist only in the web engine's real-time combat; the tabletop Tirada de Enfrentamiento is untouched.
// Any world can give its creatures' fighters another kit by adding a table here (R-1: a piece, not a one-off).

export const CARGA_MAX = 100;
export const HZ_HAB = 20;

export type Habilidad = {
  nombre: string;
  /** Damage on a hit (before any critical). */
  dano: number;
  /** Seconds before the same player may use this ability again. */
  enfriamiento: number;
  /** Carga spent (must be available). */
  coste: number;
  /** Carga gained on a hit. */
  genera: number;
  /** Lore name in the canon's words (short). */
  lore: string;
};

/** Kit of Eclipse Mnémico (first weapon of the manual's «Armas» chapter). */
export const ECLIPSE: Record<string, Habilidad> = {
  "corte-breve": { nombre: "Corte Breve", dano: 12, enfriamiento: 1, coste: 0, genera: 12, lore: "ataque básico con la daga" },
  "incision-semantica": { nombre: "Incisión Semántica", dano: 30, enfriamiento: 4, coste: 30, genera: 0, lore: "la Intervención del arma" },
  "discontinuidad": { nombre: "Discontinuidad", dano: 55, enfriamiento: 8, coste: 55, genera: 0, lore: "el Efecto del arma (finisher)" },
};
export const HABILIDADES = Object.keys(ECLIPSE);

/** Ticks of an ability's cooldown. */
export const ticksDe = (h: Habilidad): number => Math.round(h.enfriamiento * HZ_HAB);
/** Carga after a hit/spend, clamped to 0..CARGA_MAX (pure). */
export const cargaTras = (carga: number, h: Habilidad): number => Math.max(0, Math.min(CARGA_MAX, carga - h.coste + h.genera));
