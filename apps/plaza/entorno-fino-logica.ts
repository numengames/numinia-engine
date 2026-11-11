// entorno fino (H4b) — the pure rules of the builder's fine environment controls: which colour field a picker writes, what it
// sends with it, which files may be a sky picture or an HDR light, and what the library offers. No DOM, no engine: the page
// (apps/plaza/entorno.ts) only draws and sends; the server (features/entorno) still decides and validates every value.

import { tx } from "../../packages/feature/src/idioma.ts";

export type Valores = Record<string, unknown>;
/** The four colours of the panel: the field of the environment each picker writes, its label (`texto` answers in the active language
 * each time it is read; `en` is always the English one). */
const color = (campo: string, en: string, es: string) => ({ campo, get texto(): string { return tx(en, es); }, en });
export const COLORES: { campo: string; texto: string; en: string }[] = [
  color("cieloArriba", "Sky colour (top)", "Color del cielo (arriba)"), // i18n-ok: the Spanish half of color(en, es)
  color("cieloHorizonte", "Sky colour (horizon)", "Color del cielo (horizonte)"), // i18n-ok: the Spanish half of color(en, es)
  color("nieblaColor", "Fog colour", "Color de la niebla"), // i18n-ok: the Spanish half of color(en, es)
  color("solColor", "Sun colour", "Color del sol"), // i18n-ok: the Spanish half of color(en, es)
];
/** Sky kinds (features/entorno CIELOS) with a name a person reads (getters: each read answers in the active language). */
export const CIELO_NOMBRE: Record<string, string> = {
  get atmosfera() { return tx("Atmosphere (living sky)", "Atmósfera (cielo vivo)"); },
  get degradado() { return tx("Two-colour gradient", "Degradado de dos colores"); },
  get color() { return tx("Single colour", "Un solo color"); },
};

/** 0xRRGGBB → "#rrggbb" (what <input type="color"> speaks). */
export const aHex = (n: number): string => `#${(Math.max(0, Math.min(0xffffff, Math.round(Number(n) || 0))) >>> 0).toString(16).padStart(6, "0")}`;
/** "#rrggbb" → 0xRRGGBB, or null when it is not one. */
export const deHex = (s: string): number | null => (/^#[0-9a-fA-F]{6}$/.test(s) ? parseInt(s.slice(1), 16) : null);

/** What a colour pick sends. A hand-picked fog colour turns the fog's «del cielo» off (else the sky would repaint it at once);
 * null = not a colour. */
export function cambioColor(campo: string, hex: string): Valores | null {
  const c = deHex(hex);
  if (c === null || !COLORES.some((x) => x.campo === campo)) return null;
  return campo === "nieblaColor" ? { nieblaColor: c, nieblaAuto: false } : { [campo]: c };
}

/** A sky picture (background) or an HDR light: which extensions each takes. The light is only ever an .hdr. */
export type CampoFondo = "imagen" | "hdr";
export const EXTENSIONES: Record<CampoFondo, readonly string[]> = { imagen: ["hdr", "png", "jpg", "webp"], hdr: ["hdr"] };
export const ACEPTA_FONDO: Record<CampoFondo, string> = { imagen: ".hdr,.png,.jpg,.jpeg,.webp", hdr: ".hdr" };
/** The name the server keeps a file under: «<sha256>.<ext>» (features/entorno FICHERO). */
export const NOMBRE_FICHERO = /^[0-9a-f]{64}\.(hdr|png|jpg|webp)$/;

/** May this file be uploaded for this field? The extension decides (as on a drop); the reason is a sentence for the person. */
export function fondoAceptable(campo: CampoFondo, fichero: string): { ok: true; ext: string } | { ok: false; why: string } {
  const e = fichero.split(".").pop()?.toLowerCase() ?? "", ext = e === "jpeg" ? "jpg" : e;
  if (EXTENSIONES[campo].includes(ext)) return { ok: true, ext };
  return { ok: false, why: campo === "hdr" ? tx("the sky light is an .hdr file", "la luz del cielo es un fichero .hdr") : tx("the background is an .hdr, .png, .jpg or .webp image", "el fondo es una imagen .hdr, .png, .jpg o .webp") };
}

/** The options of a library list: «none», the house skies, and the current value when it is neither (an upload). */
export function opcionesFondo(campo: CampoFondo, actual: string, casa: { id: string; nombre: string; hdr: string }[]): { valor: string; texto: string }[] {
  const lista = [{ valor: "", texto: campo === "hdr" ? tx("None (the light comes from the sky itself)", "Ninguna (la luz sale del propio cielo)") : tx("None (the sky above)", "Ninguno (el cielo de arriba)") }, ...casa.map((c) => ({ valor: c.hdr, texto: tx(`${c.nombre} (the house, CC0)`, `${c.nombre} (la casa, CC0)`) }))];
  if (actual && !lista.some((o) => o.valor === actual)) { const f = `${actual.slice(0, 8)}…${actual.slice(actual.lastIndexOf("."))}`; lista.push({ valor: actual, texto: tx(`Uploaded: ${f}`, `Subido: ${f}`) }); }
  return lista;
}

/** The sentence under the controls for the tier the page runs on: where the big HDR is not fetched. */
export function notaNivel(nivel: string): string {
  return nivel === "A" ? "" : tx("On this device (phone or headset) the big HDR is not fetched: the colour sky and its light show.", "En este aparato (móvil o gafas) no se carga el HDR grande: se ve el cielo de colores y su luz.");
}
