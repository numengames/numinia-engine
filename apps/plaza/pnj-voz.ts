// The NPC voice: a short wordless greeting when a conversation OPENS and a farewell when it CLOSES.
// Nothing more: a new line or a chosen answer does not sound (each step of the chat with its «hmm» would saturate the mix,
// and what is said is already written and read by the reader). The world sounds, not the interface (Pablo, 2026-10-19): the voice
// comes from the person, placed in 3D at mouth height, not from the dialogue box.
//
// LOCAL: the conversation is mine (the server only sends it to me), so only I hear it; those around do not see
// the panel and do not hear it either. That is why it is not one of the SHARED sounds of `sonidos.ts` and carries no seed: without a seed, the
// door does not repeat the same take twice in a row (`voces.ts`).
//
// Each person ALWAYS has the same voice: the one in their sheet (pnj@1 `voz`) or, if it names none, one chosen by their id with a
// hash (FNV-1a): the same on every page and on every visit.
import { VOCES_PNJ, type VozPnj } from "../../features/misiones/formato.ts";
import type { Opciones } from "../../packages/render/src/audio/sonar.ts";

/** What it watches of the page's quests (`features/misiones/client.ts`). */
export type ConversacionPnj = {
  dialogo(): { pnj: string } | null;
  alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): unknown;
  personaDe(pnj: string): { x: number; y: number; z: number; escala: number } | null;
  vozDe(pnj: string): string;
};

/** Quiet: today's sounds are provisional (better low than loud). On top comes the ×0.32 of the «efectos» bus. */
export const GAIN_VOZ_PNJ = 0.5;
/** Page brake: whoever opens and closes quickly does not stack greetings (the catalogue also brings its own cooldown). */
export const MS_VOZ_PNJ = 800;
/** How high above their feet a person of scale 1 speaks (the mouth, not the floor). */
export const BOCA_M = 1.5;

/** 32-bit FNV-1a: short, stable and the same in the browser and in Node. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** A person's voice: the one in their sheet if it is a house one; otherwise the one that falls to them by their id (always the same). */
export function vozPnj(pnj: string, voz = ""): VozPnj {
  return (VOCES_PNJ as readonly string[]).includes(voz) ? (voz as VozPnj) : VOCES_PNJ[hash(pnj) % VOCES_PNJ.length];
}

/** Hooks the greeting and the farewell to the page's conversations. `sonar` is the local door (`sonarLocal`).
 *  Returns how to unhook. */
export function montarVozPnj(m: ConversacionPnj, sonar: (id: string, o?: Opciones, ms?: number) => boolean): () => void {
  let abierta: string | null = m.dialogo()?.pnj ?? null;
  const decir = (pnj: string, que: "saludo" | "despedida"): void => {
    const p = m.personaDe(pnj);
    if (!p) return; // this page does not draw it (it is gone): there is nowhere to get the voice from
    const donde = { x: p.x, y: p.y + BOCA_M * (p.escala || 1), z: p.z };
    sonar(`pnj-${que}-${vozPnj(pnj, m.vozDe(pnj))}`, { donde, gain: GAIN_VOZ_PNJ }, MS_VOZ_PNJ); // i18n-ok: sound id, not text
  };
  const quitar = m.alCambiar((que) => {
    if (que !== "dialogo") return;
    const ahora = m.dialogo()?.pnj ?? null;
    if (ahora === abierta) return; // the same conversation with another line: silent
    const antes = abierta;
    abierta = ahora;
    if (antes) decir(antes, "despedida");
    if (ahora) decir(ahora, "saludo");
  });
  return () => { if (typeof quitar === "function") quitar(); };
}
