// gesto-ia (ia-llamar S13) — the four gestures an AI's brain can make with its body, as moves of the world's `gestos` feature
// (features/gestos/movimientos.ts: a closed list, played on the avatar for everyone within 30 m). The house has a real clip only for
// «saludar»; the others use the nearest clip that exists today and stop by themselves after `paraS` seconds. When the art team adds
// «asentir», «pensar» or «señalar» clips, change the move here (one line each): test/puente-llamadas.test.ts checks that every move named
// here is in the world's list. Pure: no I/O, no Node import (it bundles into the Worker).

export const TIPOS_GESTO = ["saludar", "asentir", "pensar", "señalar"] as const;
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
  asentir: { movimiento: "hablar", paraS: 2, propio: false, como: "mueves las manos un momento, como quien dice «sí, claro»" },
  pensar: { movimiento: "agacharse", paraS: 4, propio: false, como: "te agachas unos segundos, como quien mira algo de cerca" },
  señalar: { movimiento: "usar", propio: false, como: "extiendes la mano hacia lo que tienes delante" },
};
