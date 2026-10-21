// v1 «la muñeca se ve»: the first-time notice that tells you where the menu is, as pure logic (no three.js; tested in
// node, test/vr-muneca.test.ts). The first time someone enters VR on a device, a short floating notice says «Gira la
// muñeca y mírate el reloj: ahí está el menú» for AVISO.ms or until the menu opens. «Seen» lives in localStorage, per
// device, and is written the moment the notice first shows (so a second entry never shows it again). The notice waits
// while the entry bubble is up (nothing else competes for the eyes) and AVISO.esperaMs after that, so the controls card
// has been read first. The picture is in muneca-aviso-vr.ts.
import { textoVR } from "./textos-vr/index.ts";

export const AVISO = {
  /** How long it stays once shown (ms), unless the menu opens first. */
  ms: 6000,
  /** Calm time (no entry bubble) before it first shows, ms. */
  esperaMs: 1500,
  /** Fade in/out (ms), for the picture only. */
  fundidoMs: 250,
  /** localStorage key: set to "1" once the notice has been shown on this device. */
  clave: "numinia.vr.avisoMuneca",
  /** The panel in the world: metres wide, metres from the eyes, and its canvas. */
  anchoM: 0.9, distM: 1.1, lienzo: { w: 1024, h: 360 },
  /** The text's height in canvas pixels. */
  letraPx: 52,
} as const;

/** Visual angle of `px` canvas pixels of the panel, in degrees (Meta asks ≥ 1.2° for text in a headset). */
export function gradosDePx(px: number): number {
  const m = (px * AVISO.anchoM) / AVISO.lienzo.w;
  return (2 * Math.atan(m / 2 / AVISO.distM) * 180) / Math.PI;
}

type Almacen = { getItem(k: string): string | null; setItem(k: string, v: string): void };
/** Has this device seen the notice? A storage that is missing or cannot be read counts as SEEN: a blocked storage must
 * not make the notice come back on every entry. */
export function yaVisto(almacen: Almacen | null | undefined): boolean {
  if (!almacen) return true;
  try { return almacen.getItem(AVISO.clave) === "1"; } catch { return true; }
}
export function marcarVisto(almacen: Almacen | null | undefined): void {
  try { almacen?.setItem(AVISO.clave, "1"); } catch { /* storage full or blocked: the notice may come back once more */ }
}

export type FaseAviso = "espera" | "visible" | "hecho";
export type EstadoAviso = { fase: FaseAviso; /** espera: since when it has been calm; visible: since when it shows. */ desde: number | null };
export const avisoInicio = (visto: boolean): EstadoAviso => ({ fase: visto ? "hecho" : "espera", desde: null });

export type EntradaAviso = {
  /** Something else owns the eyes (the entry bubble is up or about to be). */
  bloqueado: boolean;
  /** The menu is open: the player found it. */
  menuAbierto: boolean;
};
export type SalidaAviso = { estado: EstadoAviso; mostrar: boolean; /** True on the one frame the notice first shows. */ empieza: boolean };

/** One step: the previous state, this frame's inputs and the clock (ms). */
export function avisoPaso(e: EstadoAviso, en: EntradaAviso, ahora: number): SalidaAviso {
  const fin: SalidaAviso = { estado: { fase: "hecho", desde: null }, mostrar: false, empieza: false };
  if (e.fase === "hecho" || en.menuAbierto) return fin;
  if (e.fase === "espera") {
    if (en.bloqueado) return { estado: { fase: "espera", desde: null }, mostrar: false, empieza: false };
    const desde = e.desde ?? ahora;
    if (ahora - desde < AVISO.esperaMs) return { estado: { fase: "espera", desde }, mostrar: false, empieza: false };
    return { estado: { fase: "visible", desde: ahora }, mostrar: true, empieza: true };
  }
  // visible
  if (en.bloqueado) return { estado: { fase: "espera", desde: null }, mostrar: false, empieza: false }; // the bubble came up: step aside, come back after
  if (ahora - (e.desde ?? ahora) >= AVISO.ms) return fin;
  return { estado: e, mostrar: true, empieza: false };
}

/** The sentence in the player's language (the page's <html lang>); Spanish when unknown. */
export const textoAviso = (idioma?: string | null): string => textoVR("avisoMuneca", idioma);
