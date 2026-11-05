// formas-extra (mundo-hermes M6): the flat shapes of the second wave, in a chunk of their own — fetched only when the first one of them is asked for, so a world that
// shows no documents, skills, work board or guide never downloads a byte of it. Same rules as formas-planas.ts: pure black and white by code, one mesh per shape, no textures.
//   estante  a bookcase with three tiers of books (a document): books white when on, outlines when off
//   tableta  an upright tablet on a foot with a lamp and three lines (a skill): lamp filled + solid frame = enabled · ring + dashed frame = disabled
//   tablero  the work board: three columns (POR HACER / EN CURSO / HECHO), the count of each, up to three white cards with a short title, drawn with a tiny 5×7 letter set
//   guia     the guide: a plain white silhouette, taller than a profile, whose only detail is the hair band on her head
import { B, N, Malla, marcoRaya, parte } from "./formas-planas.ts";
import type { FormaPlana } from "./formas-planas.ts";

/** A 5×7 letter set drawn with flat rectangles (rows top to bottom, '#' = on). Capitals, digits and a few marks; accents are dropped, anything else is «?». */
const GLIFOS: Record<string, string> = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#", B: "####./#...#/#...#/####./#...#/#...#/####.", C: ".###./#...#/#..../#..../#..../#...#/.###.", D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####", F: "#####/#..../#..../####./#..../#..../#....", G: ".###./#...#/#..../#.###/#...#/#...#/.####", H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: ".###./..#../..#../..#../..#../..#../.###.", J: "..###/...#./...#./...#./...#./#..#./.##..", K: "#...#/#..#./#.#../##.../#.#../#..#./#...#", L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#", N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#", O: ".###./#...#/#...#/#...#/#...#/#...#/.###.", P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#", R: "####./#...#/#...#/####./#.#../#..#./#...#", S: ".####/#..../#..../.###./....#/....#/####.", T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.", V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..", W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#", X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..", Z: "#####/....#/...#./..#../.#.../#..../#####",
  0: ".###./#...#/#..##/#.#.#/##..#/#...#/.###.", 1: "..#../.##../..#../..#../..#../..#../.###.", 2: ".###./#...#/....#/...#./..#../.#.../#####", 3: "####./....#/....#/.###./....#/....#/####.",
  4: "...#./..##./.#.#./#..#./#####/...#./...#.", 5: "#####/#..../####./....#/....#/#...#/.###.", 6: "..##./.#.../#..../####./#...#/#...#/.###.", 7: "#####/....#/...#./..#../.#.../.#.../.#...",
  8: ".###./#...#/#...#/.###./#...#/#...#/.###.", 9: ".###./#...#/#...#/.####/....#/...#./.##..",
  " ": ".../.../.../.../.../.../...", ".": "...../...../...../...../...../...../..#..", ",": "...../...../...../...../..#../..#../.#...", ":": "...../..#../...../...../..#../...../.....",
  "-": "...../...../...../.###./...../...../.....", "'": "..#../..#../...../...../...../...../.....", "!": "..#../..#../..#../..#../..#../...../..#..", "?": ".###./#...#/....#/...#./..#../...../..#..",
  "/": "....#/....#/...#./..#../.#.../#..../#....", "+": "...../..#../..#../#####/..#../..#../.....", "(": "...#./..#../.#.../.#.../.#.../..#../...#.", ")": ".#.../..#../...#./...#./...#./..#../.#...", "_": "...../...../...../...../...../...../#####",
};
const ANCHO_GLIFO = 5, AVANCE = 6; // columns, incl. one blank
/** Plain capital letters without accents: the only thing the letter set can draw. «Ñ» → N. */
export const sinAcentos = (t: string): string => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
/** The width in metres of `texto` drawn with pixels of `px` metres. */
export const anchoTexto = (texto: string, px: number): number => Math.max(0, [...texto].length * AVANCE - 1) * px;
/** Cut a title to `max` letters, with a dot at the end when it was longer (the letter set has no «…»). */
export const acortar = (t: string, max: number): string => { const s = [...sinAcentos(t)]; return s.length <= max ? s.join("") : s.slice(0, max - 1).join("").trimEnd() + "."; };
/** Draw `texto` with its left edge at x0 and its BASELINE at y0 (the glyph is 7 pixels tall), in `color`; horizontal runs of lit pixels become one rectangle. */
function texto(m: Malla, t: string, x0: number, y0: number, px: number, z: number, color: number): void {
  let x = x0;
  for (const ch of sinAcentos(t)) {
    const g = (GLIFOS[ch] ?? GLIFOS["?"]).split("/");
    g.forEach((fila, r) => { for (let c = 0; c < ANCHO_GLIFO; ) { if (fila[c] !== "#") { c++; continue; } let d = c; while (fila[d] === "#") d++; m.rect(x + c * px, y0 + (6 - r) * px, x + d * px, y0 + (7 - r) * px, z, color); c = d; } });
    x += AVANCE * px;
  }
}

/** The bookcase: 2.4 m wide, 2.3 m tall, three tiers; a document. */
function estante(m: Malla, f: FormaPlana): void {
  const W = 1.2, H = 2.3, e = 0.07, a = f.estado === "off" ? "borde" : "lleno";
  m.rect(-W, 0, -W + e, H, 0, B); m.rect(W - e, 0, W, H, 0, B); // sides
  for (const y of [0, 0.77, 1.54, H - e]) m.rect(-W, y, W, y + e, 0, B); // tiers
  const libros: [number, number][] = [[0.2, 0.62], [0.14, 0.5], [0.22, 0.66], [0.16, 0.55], [0.24, 0.6], [0.12, 0.46], [0.2, 0.64], [0.18, 0.52], [0.22, 0.58]];
  [0, 1, 2].forEach((t) => {
    let x = -W + e + 0.1, i = t * 2;
    while (true) { const [w, h] = libros[i++ % libros.length]; if (x + w > W - e - 0.08) break; parte(m, a, x, t * 0.77 + e, x + w, t * 0.77 + e + h, 0.005); x += w + 0.05; }
  });
  if (f.estado === "fail") { m.barra(-W, 0, W, H, 0.08, 0.03, B); m.barra(-W, H, W, 0, 0.08, 0.03, B); }
}

/** The tablet: 1.5 × 1 m on a foot at 0.45 m. enabled = solid frame + lamp filled; disabled = dashed frame + lamp ring. */
function tableta(m: Malla, f: FormaPlana): void {
  const W = 0.75, y0 = 0.45, y1 = 1.45, on = f.estado === "on";
  m.rect(-0.05, 0, 0.05, y0, 0, B); m.rect(-0.3, 0, 0.3, 0.05, 0, B); // the foot
  m.rect(-W, y0, W, y1, 0, N);
  if (on) m.marco(-W, y0, W, y1, 0.06, 0.005, B); else marcoRaya(m, -W, y0, W, y1, 0.06, 0.005);
  if (on) m.disco(W - 0.2, y1 - 0.2, 0.1, 0.01, B, 20); else m.anillo(W - 0.2, y1 - 0.2, 0.065, 0.1, 0.01, B, 20);
  for (const [i, ancho] of [[0, 0.95], [1, 0.8], [2, 0.55]] as const) m.rect(-W + 0.15, y1 - 0.45 - i * 0.18, -W + 0.15 + ancho, y1 - 0.45 - i * 0.18 + 0.07, 0.01, B);
  if (f.estado === "fail") { m.barra(-W, y0, W, y1, 0.07, 0.03, B); m.barra(-W, y1, W, y0, 0.07, 0.03, B); }
}

/** The work board: 10.8 × 4.2 m on two posts. Each column shows its name, its count (big) and up to three cards. */
export const CARTELES: [string, string][] = [["POR HACER", "hacer"], ["EN CURSO", "curso"], ["HECHO", "hecho"]];
function tablero(m: Malla, f: FormaPlana): void {
  const W = 5.4, y0 = 1.0, y1 = 5.2, col = 3.6;
  m.rect(-W + 0.4, 0, -W + 0.55, y0, 0, B); m.rect(W - 0.55, 0, W - 0.4, y0, 0, B); // posts
  m.rect(-W, y0, W, y1, 0, N); m.marco(-W, y0, W, y1, 0.1, 0.005, B);
  for (const x of [-col / 2, col / 2]) m.rect(x - 0.025, y0 + 0.1, x + 0.025, y1 - 0.1, 0.005, B); // the dividers
  (f.columnas ?? []).slice(0, 3).forEach((c, i) => {
    const cx = (i - 1) * col, nombre = CARTELES[i][0];
    texto(m, nombre, cx - anchoTexto(nombre, 0.06) / 2, y1 - 0.75, 0.06, 0.01, B);
    const n = String(Math.max(0, Math.floor(c.n)));
    texto(m, n, cx - anchoTexto(n, 0.11) / 2, y1 - 1.75, 0.11, 0.01, B);
    m.rect(cx - 1.6, y1 - 1.95, cx + 1.6, y1 - 1.92, 0.01, B);
    for (let k = 0; k < 3; k++) {
      const top = y1 - 2.2 - k * 0.9, bajo = top - 0.7, t = c.top[k];
      if (t) { m.rect(cx - 1.6, bajo, cx + 1.6, top, 0.01, B); const s = acortar(t, 12); texto(m, s, cx - 1.5, bajo + 0.2, 0.04, 0.02, N); }
      else if (k === 0 && c.n === 0) marcoRaya(m, cx - 1.6, bajo, cx + 1.6, top, 0.04, 0.01); // an empty column shows one dashed slot
    }
    const mas = c.n - c.top.length;
    if (mas > 0 && c.top.length) { const s = `+${mas}`; texto(m, s, cx - anchoTexto(s, 0.06) / 2, y0 + 0.2, 0.06, 0.01, B); }
  });
  if (f.estado === "fail") { m.barra(-W, y0, W, y1, 0.1, 0.03, B); m.barra(-W, y1, W, y0, 0.1, 0.03, B); }
}

/** The guide: 2.2 m, all white (body, arms, legs, head); the one detail is a black hair band across the head with a small hook on its side. */
function guia(m: Malla, _f: FormaPlana): void {
  m.rect(-0.2, 0, -0.03, 0.95, 0, B); m.rect(0.03, 0, 0.2, 0.95, 0, B); // legs
  m.quad([-0.34, 0.95, 0], [0.34, 0.95, 0], [0.4, 1.7, 0], [-0.4, 1.7, 0], B); // torso, a little wider at the shoulders
  m.rect(-0.56, 0.95, -0.42, 1.65, 0, B); m.rect(0.42, 0.95, 0.56, 1.65, 0, B); // arms
  m.rect(-0.08, 1.7, 0.08, 1.8, 0, B); // neck
  const cy = 1.98, r = 0.25;
  m.disco(0, cy, r, 0, B, 28);
  // the hair band: an arc of black across the upper head (angles 35°..145°), with a small black hook (a disc) at its right end
  const a0 = (35 * Math.PI) / 180, a1 = (145 * Math.PI) / 180, n = 10;
  for (let i = 0; i < n; i++) {
    const s = a0 + ((a1 - a0) * i) / n, t = a0 + ((a1 - a0) * (i + 1)) / n, r0 = r - 0.075, r1 = r - 0.02;
    m.quad([Math.cos(s) * r0, cy + Math.sin(s) * r0, 0.01], [Math.cos(s) * r1, cy + Math.sin(s) * r1, 0.01], [Math.cos(t) * r1, cy + Math.sin(t) * r1, 0.01], [Math.cos(t) * r0, cy + Math.sin(t) * r0, 0.01], N);
  }
  m.disco(Math.cos(a0) * (r - 0.05), cy + Math.sin(a0) * (r - 0.05), 0.045, 0.012, N, 12);
}

export const HACER_EXTRA: Record<string, (m: Malla, f: FormaPlana) => void> = { estante, tableta, tablero, guia };
