// gesto-ia (ia-llamar S13) — the five gestures an AI's brain can make with its body, as moves of the world's `gestos` feature
// (features/gestos/movimientos.ts: a closed list, played on the avatar for everyone within 30 m). All five have a clip of the
// house (activos/animaciones/*.vrma, written over Quaternius' idle body by tools/vrma/convertir.js) and end by themselves: the
// bridge sends no «parar». test/puente-llamadas.test.ts checks that every move named here is in the world's list and that
// each one has its clip in the catalogue. Pure: no I/O, no Node import (it bundles into the Worker).

export const TIPOS_GESTO = ["saludar", "asentir", "negar", "pensar", "señalar"] as const;
export type TipoGesto = (typeof TIPOS_GESTO)[number];

export type GestoIA = {
  /** The id in features/gestos/movimientos.ts that plays it. */
  movimiento: string;
  /** Seconds after which the bridge sends «parar» (a loop would go on); absent = the move ends by itself. */
  paraS?: number;
  /** false = the house has no clip of its own for it yet: the nearest one plays. */
  propio: boolean;
  /** What others see, in plain words (it goes back to the brain). */
  como: string;
};

export const GESTOS_IA: Readonly<Record<TipoGesto, GestoIA>> = {
  saludar: { movimiento: "saludar", propio: true, como: "saludas con la mano" },
  asentir: { movimiento: "asentir", propio: true, como: "asientes con la cabeza, como quien dice «sí»" },
  negar: { movimiento: "negar", propio: true, como: "niegas con la cabeza, como quien dice «no»" },
  pensar: { movimiento: "pensar", propio: true, como: "te llevas la mano a la barbilla, como quien piensa" },
  señalar: { movimiento: "senalar", propio: true, como: "extiendes el brazo hacia lo que tienes delante" },
};
