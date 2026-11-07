// The page's sound bridge: the VR pieces (dardos-vr, pesca-sonido) sound through here without importing `sonidos.ts`
// (which arrives separately, lazily). When mounted, `sonidos.ts` hooks in its `sonarLocal` —the SINGLE DOOR: file if there is one,
// recipe if not, the same voice pool and the core's buses—. Before that, or without audio, everything is silent: nobody fails.
// LOCAL sounds only (my hand, my rod): what is shared (dart thrown and impact, fish caught…) is sent by the server
// with its seed and `sonarLocal` refuses to play it (D-048), so no anti-double mark is needed here.
import type { Opciones } from "../../packages/render/src/audio/sonar.ts";

export type Sonar = (id: string, o?: Opciones, ms?: number) => boolean;

export const puente: { sonar: Sonar | null } = { sonar: null };

export const sonar: Sonar = (id, o, ms) => puente.sonar?.(id, o, ms) ?? false;
