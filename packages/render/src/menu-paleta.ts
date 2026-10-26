// J18b story 5 (MIS-222 t_1b395abe, MENU-MUNECA-Y-PINTURA-VR.md §3.1 / §3.7): the brush's palette in the VR menu, as pure numbers and words (no three.js,
// no DOM; tested in test/menu-paleta.test.ts). It is the «Construir» section's content while you paint: the eight colours of the engine's palette
// (PRI-008: flat colour, no texture), three thicknesses drawn at their TRUE width (1440 px per metre of the panel: 0.5 cm = 7 px), and two verbs
// («Deshacer», «Dejar de pintar»). Pressing a colour or a thickness only sets what the NEXT stroke is made of (pintar-vr.ts `ajustar`): the choice is
// written into the `trazo@1` file (`color`, `grosor`), so everyone sees the colour you chose; the palette costs a canvas redraw and nothing else
// (no new draw call, no new texture, no network).

import { CONTENIDO, FILA, BOTON_MIN, type Rect } from "./menu-vr.ts";

/** What a colour is called in the palette (the index is the stroke's `color`, 0–7; the hex is PALETA_TRAZO's, trazo-tubo.ts). */
export const NOMBRES_COLOR = ["Crema", "Rojo", "Ámbar", "Verde", "Agua", "Turquesa", "Piedra", "Tinta"] as const;
/** The three thicknesses in metres (apps/plaza/pincel.ts GROSORES_M, the same numbers) and how they read. */
export const GROSORES_VR = [{ m: 0.005, texto: "Fino", detalle: "0,5 cm" }, { m: 0.015, texto: "Medio", detalle: "1,5 cm" }, { m: 0.04, texto: "Grueso", detalle: "4 cm" }] as const;

/** Letter sizes in canvas px. */
export const TEXTO_PALETA = { titulo: 36, etiqueta: 28, boton: 32, nota: 26 } as const;

export type DisposicionPaleta = { titulo: Rect; colores: Rect[]; etiquetaGrosor: Rect; grosores: Rect[]; acciones: Rect[]; nota: Rect };

/** Where everything sits in the content area (canvas px): title, 8 swatches in one row, a label, 3 thickness buttons, 2 verbs, the footnote.
 *  The order of `colores`, `grosores`, `acciones` is the order of the buttons the menu registers (ids 100…). */
export function disposicionPaleta(): DisposicionPaleta {
  const { x, y, w, h } = CONTENIDO, HUECO = 16, N = 8;
  const bw = Math.floor((w - (N - 1) * HUECO) / N), cy = y + 80, CH = 132;
  const colores: Rect[] = Array.from({ length: N }, (_, i) => ({ x: x + i * (bw + HUECO), y: cy, w: bw, h: CH }));
  const etiquetaGrosor: Rect = { x, y: cy + CH + 24, w, h: 40 };
  const gy = etiquetaGrosor.y + etiquetaGrosor.h + 8, gw = Math.floor((w - 2 * HUECO) / 3), GH = 96;
  const grosores: Rect[] = [0, 1, 2].map((i) => ({ x: x + i * (gw + HUECO), y: gy, w: gw, h: GH }));
  const ay = gy + GH + 32, aw = Math.floor((w - HUECO) / 2);
  const acciones: Rect[] = [0, 1].map((i) => ({ x: x + i * (aw + HUECO), y: ay, w: aw, h: FILA.h + 12 }));
  return { titulo: { x, y, w, h: 64 }, colores, etiquetaGrosor, grosores, acciones, nota: { x, y: y + h - 44, w, h: 44 } };
}

/** Which of the three thicknesses is this one (the nearest), or -1 if the brush holds none of them (set from code). */
export function indiceGrosor(m: number): number {
  let mejor = -1, d = Infinity;
  GROSORES_VR.forEach((g, i) => { const e = Math.abs(g.m - m); if (e < d) { d = e; mejor = i; } });
  return d < 0.0005 ? mejor : -1;
}

/** The thickness drawn as a line of its true width on the panel (px at 1440 px per metre), never thinner than 4 px so that 0.5 cm still reads. */
export const pxGrosor = (m: number, pxPorM = 1440): number => Math.max(4, Math.round(m * pxPorM));

/** The least size of anything pressable in the palette (px): for the test (buttons ≥ BOTON_MIN). */
export function medidasPaleta(): { minBotonPx: number; solapes: number } {
  const d = disposicionPaleta(), todas = [...d.colores, ...d.grosores, ...d.acciones];
  let solapes = 0;
  for (let i = 0; i < todas.length; i++) for (let j = i + 1; j < todas.length; j++) {
    const a = todas[i], b = todas[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) solapes++;
  }
  return { minBotonPx: Math.min(BOTON_MIN, ...todas.map((r) => Math.min(r.w, r.h))), solapes };
}
