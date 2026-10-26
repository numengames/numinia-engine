// obra-vr (MIS-222 t_ac672264, story 1 of 2): inside a headset there is no file picker, so pressing a hole opens the menu on its
// «Obra» view: the images ALREADY on the server (what the world shows, features/objetos client `imagenes`), each with a «Poner»
// button. Pure (no DOM, no three.js): what the view says, in which order, and what a press asks. The wiring is xr-menu.ts
// (the view) and huecos.ts (what opens it); test/obra-vr.test.ts covers this file, tools/e2e-piernas/huecos-vr.mjs the whole way.
// Story 2 (upload from the paired phone) adds a row here, nothing else changes.
export type ImagenObra = { sha: string; ext: string; nombre: string };
export type HuecoObra = { id: string; nombre: string; ancho: number; alto: number; lleno: boolean };
export type FilaObra = { texto: string; detalle: string; icono: string; boton?: { texto: string; ancho: number; estilo: "accion" | "normal"; poner: ImagenObra } };
export type VistaObra = { titulo: string; nota: string; vacio: string; filas: FilaObra[] };

const metros = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
const RECORTE = 34; // a name longer than this is cut (one line of the panel)
export const recortarNombre = (t: string, n = RECORTE): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** A readable name for an image: its object's name, else «Imagen ab12cd» (never a bare hash). */
export const nombreObra = (i: ImagenObra): string => (i.nombre.trim() ? recortarNombre(i.nombre.trim()) : `Imagen ${i.sha.slice(0, 6)}`);

/** What the «Obra» view shows for a hole: the title says which, the rows are the images (nearest first = world order), each with «Poner». */
export function vistaObra(h: HuecoObra | null, imagenes: readonly ImagenObra[]): VistaObra {
  if (!h) return { titulo: "Obra", nota: "", vacio: "Ese hueco ya no está: apunta a otro.", filas: [] };
  const medida = `${metros(h.ancho)} × ${metros(h.alto)} m`;
  return {
    titulo: `Hueco «${recortarNombre(h.nombre || h.id, 24)}» · ${medida}`,
    nota: h.lleno ? "Ya tiene una obra: la que elijas la sustituye. Se encaja entera en el marco, sin deformarla." : "Elige una imagen de las que ya están en este mundo: se encaja entera en el marco, sin deformarla.",
    vacio: "Aún no hay imágenes subidas a este mundo. Súbelas desde el ordenador (arrastrándolas) y vuelve.",
    filas: imagenes.map((i) => ({ texto: nombreObra(i), detalle: `.${i.ext}`, icono: "image-square", boton: { texto: "Poner", ancho: 170, estilo: "normal" as const, poner: i } })),
  };
}

/** What a press on «Poner» asks of the server, or why not (pure; the server still decides). */
export function pedidoPoner(h: HuecoObra | null, i: ImagenObra, puede: boolean): { ok: true; id: string; sha: string; ext: string; nombre: string } | { ok: false; why: string } {
  if (!puede) return { ok: false, why: "No puedes construir aquí." };
  if (!h) return { ok: false, why: "Ese hueco ya no está." };
  return { ok: true, id: h.id, sha: i.sha, ext: i.ext, nombre: i.nombre.trim() || `Imagen ${i.sha.slice(0, 6)}` };
}
