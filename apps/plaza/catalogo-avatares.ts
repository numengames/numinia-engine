// J1: the house avatars and animations for the plaza, by their sha256 on the instance's server (/a/<sha256>.vrm|.vrma).
// The list itself is activos/avatares/catalogo.json (written by tools/avatares-catalogo.ts). ?sinavatares = capsules only.
import catalogo from "../../activos/avatares/catalogo.json" with { type: "json" };
import type { CatalogoAvatares } from "../../packages/render/src/index.ts";

/** H7: `avatar` = the world's default (ficha@1 `avatar`, a house id from GET /status): everyone wears that one until
 * players choose their own (row H10). An id this page does not know (a newer catalogue) leaves the house mix. */
export function catalogoDeAvatares(origen: string, params: URLSearchParams, avatar?: string): CatalogoAvatares | undefined {
  if (params.has("sinavatares")) return undefined;
  const animaciones: CatalogoAvatares["animaciones"] = {};
  for (const [clip, a] of Object.entries(catalogo.animaciones)) animaciones[clip as keyof CatalogoAvatares["animaciones"]] = { url: `${origen}/a/${a.sha256}.vrma`, pasoPorCadera: a.pasoPorCadera, duracion: a.duracion };
  return { modelos: modelosDelMundo(catalogo.modelos, avatar).map((m) => ({ nombre: m.nombre, url: `${origen}/a/${m.sha256}.vrm` })), animaciones };
}

/** Rediseño v2 (the VR menu's «Tú»): the house id of the model at `indice` of what this world offers (the index
 * `eleccion` gives), for its portrait /retratos/<id>-cuerpo.webp; null when unknown. */
export function idAvatarDe(indice: number | undefined, avatar?: string): string | null {
  if (indice === undefined || indice < 0) return null;
  return modelosDelMundo(catalogo.modelos, avatar)[indice]?.id ?? null;
}

/** The models a world offers: the one it names, or all of them (pure, for tests). */
export function modelosDelMundo<M extends { id: string }>(modelos: readonly M[], avatar?: string): M[] {
  const uno = avatar ? modelos.find((m) => m.id === avatar) : undefined;
  return uno ? [uno] : [...modelos];
}
