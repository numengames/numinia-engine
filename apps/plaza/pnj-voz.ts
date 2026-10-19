// La voz de los PNJ: un saludo corto, sin palabras, cuando una conversación SE ABRE y una despedida cuando SE CIERRA.
// Nada más: una línea nueva o una respuesta elegida no suenan (cada paso de la charla con su «hmm» saturaría la mezcla,
// y lo que se dice ya está escrito y lo lee el lector). Suena el mundo, no la interfaz (Pablo, 2026-10-19): la voz
// sale de la persona, colocada en 3D a la altura de su boca, no de la caja del diálogo.
//
// LOCAL: la conversación es mía (el servidor solo me la manda a mí), así que solo la oigo yo; los de alrededor no ven
// el panel y tampoco lo oyen. Por eso no es de los COMPARTIDOS de `sonidos.ts` y no lleva semilla: sin semilla, la
// puerta no repite la misma toma dos veces seguidas (`voces.ts`).
//
// Cada persona tiene SIEMPRE la misma voz: la de su ficha (pnj@1 `voz`) o, si no la dice, una elegida por su id con un
// hash (FNV-1a): la misma en todas las páginas y en todas las visitas.
import { VOCES_PNJ, type VozPnj } from "../../features/misiones/formato.ts";
import type { Opciones } from "../../packages/render/src/audio/sonar.ts";

/** Lo que mira de las misiones de la página (`features/misiones/client.ts`). */
export type ConversacionPnj = {
  dialogo(): { pnj: string } | null;
  alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown;
  personaDe(pnj: string): { x: number; y: number; z: number; escala: number } | null;
  vozDe(pnj: string): string;
};

/** Bajito: los sonidos de hoy son provisionales (mejor bajos que altos). Encima va el ×0,32 del bus «efectos». */
export const GAIN_VOZ_PNJ = 0.5;
/** Freno de página: quien abre y cierra deprisa no apila saludos (el catálogo trae además su propio cooldown). */
export const MS_VOZ_PNJ = 800;
/** A qué altura sobre sus pies habla una persona de escala 1 (la boca, no el suelo). */
export const BOCA_M = 1.5;

/** FNV-1a de 32 bits: corto, estable y el mismo en el navegador y en Node. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** La voz de una persona: la de su ficha si es una de las de la casa; si no, la que le toque por su id (siempre la misma). */
export function vozPnj(pnj: string, voz = ""): VozPnj {
  return (VOCES_PNJ as readonly string[]).includes(voz) ? (voz as VozPnj) : VOCES_PNJ[hash(pnj) % VOCES_PNJ.length];
}

/** Engancha el saludo y la despedida a las conversaciones de la página. `sonar` es la puerta local (`sonarLocal`).
 *  Devuelve cómo desengancharse. */
export function montarVozPnj(m: ConversacionPnj, sonar: (id: string, o?: Opciones, ms?: number) => boolean): () => void {
  let abierta: string | null = m.dialogo()?.pnj ?? null;
  const decir = (pnj: string, que: "saludo" | "despedida"): void => {
    const p = m.personaDe(pnj);
    if (!p) return; // esta página no la dibuja (ya no está): no hay de dónde sacar la voz
    const donde = { x: p.x, y: p.y + BOCA_M * (p.escala || 1), z: p.z };
    sonar(`pnj-${que}-${vozPnj(pnj, m.vozDe(pnj))}`, { donde, gain: GAIN_VOZ_PNJ }, MS_VOZ_PNJ);
  };
  const quitar = m.alCambiar((que) => {
    if (que !== "dialogo") return;
    const ahora = m.dialogo()?.pnj ?? null;
    if (ahora === abierta) return; // la misma conversación con otra línea: callada
    const antes = abierta;
    abierta = ahora;
    if (antes) decir(antes, "despedida");
    if (ahora) decir(ahora, "saludo");
  });
  return () => { if (typeof quitar === "function") quitar(); };
}
