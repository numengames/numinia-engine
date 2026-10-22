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
  return { modelos: modelosDelMundo(catalogo.modelos, avatar).map((m) => ({ id: m.id, nombre: m.nombre, url: `${origen}/a/${m.sha256}.vrm` })), animaciones };
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

/** E3: one avatar this world brings in its own zip (entorno/avatares.json, told by GET /status `avatares`), as the picker needs it:
 * what to show (name, licence with the deed to link, the credit that CC BY requires) and where its files are (/a/<sha256>.vrm). */
export type AvatarDelMundo = { id: string; nombre: string; sha256: string; url: string; miniatura: string | null; licencia: string; creditoUrl: string | null; credito: string };

/** The Creative Commons deed of a licence the engine lets a world carry (the link CC BY asks for next to the credit). */
export function escrituraDe(licencia: string): string | null {
  return licencia === "CC0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : /^CC-BY/.test(licencia) ? "https://creativecommons.org/licenses/by/4.0/" : null;
}

/** /status `avatares` → the picker's list. The page trusts nothing it is told: a line without a 64-hex file, a name or (for CC BY)
 * a credit is skipped, so a wrong answer can never show an avatar without the attribution it was published with. Nothing = []. */
export function avataresDelMundo(origen: string, crudo: unknown): AvatarDelMundo[] {
  if (!Array.isArray(crudo)) return [];
  const out: AvatarDelMundo[] = [];
  for (const a of crudo.slice(0, 8)) {
    const x = a as Record<string, unknown> | null;
    if (!x || typeof x !== "object") continue;
    const { id, nombre, sha256, licencia, credito, miniatura } = x;
    if (typeof id !== "string" || typeof nombre !== "string" || typeof licencia !== "string" || typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256) || !nombre) continue;
    const cred = typeof credito === "string" ? credito : "";
    if (/^CC-BY/.test(licencia) && !cred) continue;
    const mini = typeof miniatura === "string" && /^[0-9a-f]{64}\.(png|jpg|webp)$/.test(miniatura) ? `${origen}/a/${miniatura}` : null;
    out.push({ id, nombre, sha256, url: `${origen}/a/${sha256}.vrm`, miniatura: mini, licencia, creditoUrl: escrituraDe(licencia), credito: cred });
  }
  return out;
}
