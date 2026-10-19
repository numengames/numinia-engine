// pesca: qué suena en cada fase (VR y pantalla plana, al momento del servidor). La función es PURA —de la fase anterior y
// la nueva sale el id de sonido, o nada— y suena por la puerta única de la página (`sonar.ts` → `sonarLocal`: fila del
// catálogo, fichero si lo hay y receta de `sintesis.ts` si no, bus «efectos»), no por un Web Audio propio. Es mi caña:
// local. El pez cobrado lo oyen los de alrededor y lo manda el servidor.
//  · mordisqueo: `pesca-mordisqueo`, un tic agudo y suave (algo roza el cebo)
//  · picada:     `pesca-picada`, el doble golpe más grave que no se confunde con el tic ni con el cobro
// sonidos.ts ya oye el lanzamiento y el chapuzón; mordisqueo y picada suenan solo aquí.
import { sonar } from "./sonar.ts";

export type Fase = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";

/** Qué sonido de pesca hace un cambio de fase (solo mordisqueo y picada; el éxito/fallo salen del resultado, en pesca.ts). */
export function sonidoDeFase(antes: Fase, ahora: Fase): "mordisqueo" | "picada" | null {
  if (antes === ahora) return null;
  return ahora === "mordisqueo" ? "mordisqueo" : ahora === "picada" ? "picada" : null;
}

/** id del catálogo de cada sonido de fase */
export const ID: Record<"mordisqueo" | "picada", string> = { mordisqueo: "pesca-mordisqueo", picada: "pesca-picada" };
const GAIN = { mordisqueo: 0.5, picada: 0.8 } as const;

/** Hace sonar lo que toque al pasar de `antes` a `ahora`; devuelve qué sonó (la prueba y el e2e lo leen). */
export function sonarFase(antes: Fase, ahora: Fase, sonarId: typeof sonar = sonar): "mordisqueo" | "picada" | null {
  const s = sonidoDeFase(antes, ahora);
  if (s) sonarId(ID[s], { gain: GAIN[s] }, 120);
  return s;
}
