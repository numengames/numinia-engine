// J1: the house avatars and animations for the plaza, by their sha256 on the instance's server (/a/<sha256>.vrm|.vrma).
// The list itself is activos/avatares/catalogo.json (written by tools/avatares-catalogo.ts). ?sinavatares = capsules only.
import catalogo from "../../activos/avatares/catalogo.json" with { type: "json" };
import type { CatalogoAvatares } from "../../packages/render/src/index.ts";

export function catalogoDeAvatares(origen: string, params: URLSearchParams): CatalogoAvatares | undefined {
  if (params.has("sinavatares")) return undefined;
  const animaciones: CatalogoAvatares["animaciones"] = {};
  for (const [clip, a] of Object.entries(catalogo.animaciones)) animaciones[clip as keyof CatalogoAvatares["animaciones"]] = { url: `${origen}/a/${a.sha256}.vrma`, pasoPorCadera: a.pasoPorCadera };
  return { modelos: catalogo.modelos.map((m) => ({ nombre: m.nombre, url: `${origen}/a/${m.sha256}.vrm` })), animaciones };
}
