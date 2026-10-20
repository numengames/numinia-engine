// Puente de sonido de la página: las piezas de VR (dardos-vr, pesca-sonido) suenan por aquí sin importar `sonidos.ts`
// (que llega aparte, perezoso). Al montarse, `sonidos.ts` engancha su `sonarLocal` —la PUERTA ÚNICA: fichero si lo hay,
// receta si no, el mismo pool de voces y los buses del núcleo—. Antes de eso, o sin audio, todo es silencio: nadie falla.
// Solo sonidos LOCALES (mi mano, mi caña): lo compartido (dardo lanzado e impacto, pez cobrado…) lo manda el servidor
// con su semilla y `sonarLocal` se niega a tocarlo (D-048), así que aquí no hace falta ninguna marca anti-doble.
import type { Opciones } from "../../packages/render/src/audio/sonar.ts";

export type Sonar = (id: string, o?: Opciones, ms?: number) => boolean;

export const puente: { sonar: Sonar | null } = { sonar: null };

export const sonar: Sonar = (id, o, ms) => puente.sonar?.(id, o, ms) ?? false;
