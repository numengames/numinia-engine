// condiciones/c4 — the entry bubble in VR, the decisions without a browser or a headset. The panel in the headset is ANOTHER VIEW of
// the same logic as the flat one (condiciones-logica.ts: the steps, what a step says, the footer's buttons and when they are off, the
// text of the box); this file only turns a step into PAGES: «less text per page, in big letters».
//   · a norms step = «Lo esencial» (each norm's title, a few per page) followed by the whole text, a few lines per page;
//   · a changes step (c6) = what changed first (NUEVO / CAMBIADO / the removed), then the whole text of what changed;
//   · «Tus datos» = two permissions per page, every box EMPTY (the two ways in stay on every page, equal);
//   · the box that accepts a layer's norms is always on screen, whatever page you are on; «Siguiente» waits for it exactly as it does
//     on the flat panel (the pager only moves through the text: pages never gate anything — the law is in the box).
// `medir` is the real width of a piece of text (the panel's canvas); here a fake one is enough to test the paging.
import type { CondicionesCapa } from "../../packages/net/src/index.ts";
import {
  botonesDePie, ETIQUETAS, flechaVersion, lineaQuitado, NOTA_DATOS_VUELVE, rotuloNormas, textosDePaso, esVuelta,
} from "./condiciones-logica.ts";
import type { Marcas, Paso, PasoCapa, PasoDatos } from "./condiciones-logica.ts";
import {
  anchoTexto, CASILLAS_PAGINA, envolverConMedida, LINEAS_PAGINA, type CasillaVR, type EstiloLinea, type LineaVR, type ModeloVR,
} from "../../packages/render/src/condiciones-vr-geom.ts";

export type Medir = (texto: string, estilo: EstiloLinea) => number;
/** One page: its lines of text and, on «Tus datos», which permissions (indices into the step's `permisos`) it carries. */
export type PaginaVR = { lineas: LineaVR[]; datos: number[]; /** where the whole text starts (norms steps), for the pager's caption */ textoEntero?: boolean };

/** `texto` written in `estilo`: wrapped to the panel's width; `chip` (a number, «NUEVO») goes before the first line. */
export function lineasDe(texto: string, estilo: EstiloLinea, medir: Medir, chip?: string): LineaVR[] {
  return envolverConMedida(texto, anchoTexto(estilo), (t) => medir(t, estilo)).map((t, k) => ({ texto: t, estilo: estilo === "punto" && k > 0 ? "cont" : estilo, ...(k === 0 && chip ? { chip } : {}) }));
}

/** Blocks of lines onto pages of at most `max` lines: a block is kept together when it fits on a page, split by its lines when it does not. */
export function trocearBloques(bloques: LineaVR[][], max = LINEAS_PAGINA): LineaVR[][] {
  const paginas: LineaVR[][] = []; let actual: LineaVR[] = [];
  const cierra = (): void => { if (actual.length) { paginas.push(actual); actual = []; } };
  for (const b of bloques) {
    if (b.length > max) { cierra(); for (let k = 0; k < b.length; k += max) paginas.push(b.slice(k, k + max)); continue; }
    if (actual.length + b.length > max) cierra();
    actual.push(...b);
  }
  cierra();
  return paginas;
}

/** A text of paragraphs (the norm's whole text) as one flow of lines under its title, with a blank line between paragraphs, cut into pages
 * (a blank line is never the first or last of a page). */
export function paginasDeTexto(titulo: string, texto: string, medir: Medir, max = LINEAS_PAGINA): LineaVR[][] {
  const flujo: LineaVR[] = [...lineasDe(titulo, "titulo", medir)];
  for (const par of texto.split(/\n+/).map((x) => x.trim()).filter(Boolean)) { flujo.push({ texto: "", estilo: "hueco" }); flujo.push(...lineasDe(par, "cuerpo", medir)); }
  const paginas: LineaVR[][] = [];
  for (let k = 0; k < flujo.length; k += max) paginas.push(flujo.slice(k, k + max));
  return paginas.map((p) => { let a = 0, b = p.length; while (a < b && p[a].estilo === "hueco") a++; while (b > a && p[b - 1].estilo === "hueco") b--; return p.slice(a, b); }).filter((p) => p.length);
}

/** The pages of a norms step that is not a change (c3): the essentials, then each norm's whole text. */
function paginasDeNormas(p: PasoCapa, medir: Medir): PaginaVR[] {
  const esenciales = trocearBloques(p.normas.map((n, k) => lineasDe(n.titulo, "punto", medir, String(k + 1))));
  const texto = p.normas.flatMap((n) => paginasDeTexto(n.titulo, n.texto, medir));
  return [...esenciales.map((lineas) => ({ lineas, datos: [] as number[] })), ...texto.map((lineas, k) => ({ lineas, datos: [] as number[], ...(k === 0 ? { textoEntero: true } : {}) }))];
}

/** The pages of a norms step of someone who is back (c6): only what changed, then the whole text of the changed points. */
function paginasDeCambios(p: PasoCapa, medir: Medir): PaginaVR[] {
  const cb = p.cambios!, bloques: LineaVR[][] = [];
  for (const n of p.normas) {
    const etq = cb.etiquetas[n.id] ?? "nuevo", antes = cb.antes[n.id];
    const b = lineasDe(n.titulo, etq === "nuevo" ? "nuevo" : "cambiado", medir, ETIQUETAS[etq]);
    if (etq === "cambiado" && antes && antes !== n.titulo) b.push(...lineasDe(`Antes: ${antes}`, "antes", medir));
    bloques.push(b);
  }
  for (const q of cb.quitados) { const l = lineaQuitado(q); bloques.push(lineasDe(`${l.tachado} — ${l.nota}`, "quitado", medir)); }
  if (!bloques.length) {
    const otros = Object.keys(cb.etiquetas).length > 0;
    bloques.push(lineasDe(otros ? "Las normas son las mismas. Lo que cambia son permisos opcionales: están en el paso siguiente." : "Las normas son las mismas: solo ha cambiado el número de versión.", "nota", medir));
  }
  const texto = p.normas.flatMap((n) => paginasDeTexto(n.titulo, n.texto, medir));
  return [...trocearBloques(bloques).map((lineas) => ({ lineas, datos: [] as number[] })), ...texto.map((lineas, k) => ({ lineas, datos: [] as number[], ...(k === 0 ? { textoEntero: true } : {}) }))];
}

/** The pages of «Tus datos»: CASILLAS_PAGINA permissions each, no text. */
function paginasDeDatos(p: PasoDatos): PaginaVR[] {
  const out: PaginaVR[] = [];
  for (let k = 0; k < p.permisos.length; k += CASILLAS_PAGINA) out.push({ lineas: [], datos: p.permisos.slice(k, k + CASILLAS_PAGINA).map((_, j) => k + j) });
  return out.length ? out : [{ lineas: [], datos: [] }];
}

export function paginasDePaso(p: Paso, medir: Medir): PaginaVR[] {
  const r = p.tipo === "datos" ? paginasDeDatos(p) : p.cambios ? paginasDeCambios(p, medir) : paginasDeNormas(p, medir);
  return r.length ? r : [{ lineas: [], datos: [] }];
}

/** Pages are worked out once per step (the steps are replaced, not edited, when the server sends a new offer). */
export function crearPaginador(medir: Medir) {
  const cache = new WeakMap<Paso, PaginaVR[]>();
  return (p: Paso): PaginaVR[] => { let r = cache.get(p); if (!r) { r = paginasDePaso(p, medir); cache.set(p, r); } return r; };
}

/** The small line, short enough for one line in big letters (the world's name is on the flat panel; here: «Antes de entrar · 1 de 3 · La Plaza»). */
export function eyebrow(p: Paso, plano: string, i: number, n: number): string {
  if (p.tipo === "capa" && p.cambios) return n > 1 ? `${plano} · ${i + 1} de ${n}` : plano; // c6: «La Plaza · v1.0 → v1.1»
  return ["Antes de entrar", ...(n > 1 ? [`${i + 1} de ${n}`] : []), ...(p.tipo === "capa" ? [p.nombre] : [])].join(" · ");
}

export type EntradaModelo = {
  pasos: Paso[]; i: number; marcas: Marcas; capas: CondicionesCapa[]; mundo: string; pagina: number; paginar: (p: Paso) => PaginaVR[];
  enviando: boolean; saliendo: boolean; aviso: string; /** «Salir» was pressed once and asks again */ salirPide: boolean;
};

/** The notes under the stick/pager: «Texto entero: 4 páginas más» on the essentials, «Página 3 de 7» elsewhere, nothing when there is one page. */
export function notaDePaginas(paginas: PaginaVR[], pagina: number): string {
  if (paginas.length <= 1) return "";
  const aparte = paginas.findIndex((x) => x.textoEntero);
  if (pagina === 0 && aparte > 0) return `Texto entero: ${paginas.length - aparte} página${paginas.length - aparte === 1 ? "" : "s"} más`;
  return `Página ${pagina + 1} de ${paginas.length}`;
}

/** Everything the panel draws for step `i`, page `pagina` (clamped), from the same state the flat panel reads. */
export function modelo(e: EntradaModelo): ModeloVR | null {
  const p = e.pasos[e.i];
  if (!p) return null;
  const paginas = e.paginar(p), pagina = Math.max(0, Math.min(paginas.length - 1, e.pagina)), pg = paginas[pagina];
  const t = textosDePaso(p, e.capas, e.mundo);
  const casillaNormas: CasillaVR | null = p.tipo === "capa" && p.exige ? { texto: rotuloNormas(p, e.capas), marcada: e.marcas.normas[p.capa] === true, obligatoria: true } : null;
  const casillasDatos: CasillaVR[] = p.tipo === "datos" ? pg.datos.map((k) => { const x = p.permisos[k]; return { texto: x.punto.titulo, detalle: x.punto.texto, marcada: e.marcas.datos.has(x.punto.id), ...(x.etiqueta ? { etiqueta: ETIQUETAS[x.etiqueta] } : {}) }; }) : [];
  const versiones = e.pasos.filter((x): x is PasoCapa => x.tipo === "capa").map((x) => (x.cambios ? `${x.nombre} · ${flechaVersion(x.cambios.desde, x.version)}` : `${x.nombre} · v${x.version}`)).join("   ");
  const ocupado = e.enviando || e.saliendo;
  return {
    eyebrow: eyebrow(p, t.eyebrow, e.i, e.pasos.length), titulo: t.titulo, subtitulo: t.subtitulo,
    lineas: pg.lineas, pagina, paginas: paginas.length, notaPaginas: notaDePaginas(paginas, pagina),
    casillaNormas, casillasDatos,
    pie: p.tipo === "datos" && p.vuelve ? NOTA_DATOS_VUELVE : versiones,
    botones: botonesDePie(e.pasos, e.i, e.marcas, ocupado).map((b) => ({ id: b.id, texto: b.id === "salir" && e.salirPide ? "¿Salir? Otra vez" : b.texto, prim: b.prim, desactivado: b.desactivado })),
    aviso: e.aviso, enviando: e.enviando,
  };
}
export { esVuelta };
