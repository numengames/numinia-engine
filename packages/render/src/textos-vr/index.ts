// VR texts by language: Spanish is the house language and the fallback for any language not written yet (ja, ko, pt-br are pending).
import { es } from "./es.ts";
import { en } from "./en.ts";

export type ClaveVR = keyof typeof es;
export type IdiomaVR = "es" | "en";
export const TEXTOS_VR: Record<IdiomaVR, Record<ClaveVR, string>> = { es, en };

/** «en-GB» / «EN» / «es-ES» → the language we have; anything else (empty, unknown) → Spanish. */
export function idiomaVR(codigo: string | null | undefined): IdiomaVR {
  const base = String(codigo ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return base === "en" ? "en" : "es";
}
/** The text for a key in a language; an unknown key gives "" (never throws). */
export function textoVR(clave: ClaveVR, codigo?: string | null): string {
  return TEXTOS_VR[idiomaVR(codigo)][clave] ?? TEXTOS_VR.es[clave] ?? "";
}
