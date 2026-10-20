// condiciones/c4 — the entry bubble in VR, as pure numbers (no three.js; tested in node: test/condiciones-vr.test.ts).
// What the panel shows and what its buttons do is NOT decided here: it comes from apps/plaza/condiciones-logica.ts through
// apps/plaza/condiciones-vr-logica.ts (the same steps, the same «Siguiente»/«Salir»/the two equal decisions as on a flat screen).
// Here live only the geometry of one flat panel (maqueta 3: «3 · VR · dentro del visor»), where a ray, a pinch or a fingertip
// lands on it, how the stick turns pages, where it stands in front of you, and how the bubble around you fades in and bursts.
//
// THE PANEL: 1.2 m wide, 1.2 m from the eyes at eye height, STILL (placed once; put back in front of you only after you have
// looked away for a while). Canvas 1440 × 1100 px (1200 px per metre): a card of 1440 × 1000 and, under it, the hint pill.
// Letters ≥ 36 px = 30 mm = 1.4° at 1.2 m (Meta asks ≥ 1.2°); every button ≥ 84 px = 70 mm = 3.3° (Meta asks ≥ 3°).
export const PANEL = { distM: 1.2, anchoM: 1.2, bajoM: 0.04 } as const;
export const LIENZO = { w: 1440, h: 1100 } as const;
export const PX_POR_M = LIENZO.w / PANEL.anchoM;
export const ALTO_M = LIENZO.h / PX_POR_M;
export const TARJETA = { x: 0, y: 0, w: LIENZO.w, h: 1000 } as const;

export type Rect = { x: number; y: number; w: number; h: number };
export const CABECERA_H = 236;
export const CUERPO: Rect = { x: 48, y: 252, w: LIENZO.w - 96, h: 360 };
/** Lines of text a page holds (7 × 48 px = 336 px of the body): «less text per page», in big letters. */
export const LINEAS_PAGINA = 7;
export const LINEA_H = 48;
/** The data permissions a page holds (each box takes 170 px: its title and two lines of what it is for). */
export const CASILLAS_PAGINA = 2;
export const CASILLA_H = 170, CASILLA_HUECO = 16;
export const PAGINADOR_Y = 624, PAGINADOR_H = 84;
export const FILA_NORMAS: Rect = { x: 48, y: 720, w: LIENZO.w - 96, h: 92 };
export const PIE_TEXTO_Y = 838;
export const BOTONES_Y = 858, BOTON_H = 118, BOTON_HUECO = 20, BOTONES_DER = LIENZO.w - 48;
export const AYUDA: Rect = { x: 250, y: 1014, w: LIENZO.w - 500, h: 64 };
export const DOTS_MAX = 8; // more pages than this: «3 / 16» instead of dots

/** How a line of the page is written: its font and where its text starts (a chip or a number may sit before it). */
export type EstiloLinea = "punto" | "cont" | "titulo" | "cuerpo" | "hueco" | "nuevo" | "cambiado" | "antes" | "quitado" | "nota";
export const ESTILOS: Record<EstiloLinea, { px: number; peso: number; sangria: number }> = {
  punto: { px: 40, peso: 500, sangria: 92 }, cont: { px: 40, peso: 500, sangria: 92 }, titulo: { px: 40, peso: 650, sangria: 0 }, cuerpo: { px: 36, peso: 400, sangria: 0 },
  hueco: { px: 36, peso: 400, sangria: 0 }, nuevo: { px: 38, peso: 500, sangria: 230 }, cambiado: { px: 38, peso: 500, sangria: 230 }, antes: { px: 34, peso: 400, sangria: 230 },
  quitado: { px: 36, peso: 400, sangria: 0 }, nota: { px: 34, peso: 400, sangria: 0 },
};
/** The width left for a line's text, px. */
export const anchoTexto = (e: EstiloLinea): number => CUERPO.w - ESTILOS[e].sangria - 8;

/** One line of a page. `chip` = the small label before the first line of a point (its number, «NUEVO», «CAMBIADO»). */
export type LineaVR = { texto: string; estilo: EstiloLinea; chip?: string };
export type CasillaVR = { texto: string; detalle?: string; marcada: boolean; etiqueta?: string; obligatoria?: boolean };
export type BotonVR = { id: string; texto: string; prim: boolean; desactivado: boolean };
/** Everything the panel draws, handed over by the page (the panel keeps no state of its own besides the highlight). */
export type ModeloVR = {
  eyebrow: string; titulo: string; subtitulo: string;
  lineas: LineaVR[]; pagina: number; paginas: number; /** what the pager's caption says next to the dots */ notaPaginas: string;
  casillaNormas: CasillaVR | null; casillasDatos: CasillaVR[];
  pie: string; botones: BotonVR[]; aviso: string; enviando: boolean;
};

/** Wrap `texto` into lines of at most `ancho` px, `medir` being the real text width (a word alone wider than the line is kept whole). */
export function envolverConMedida(texto: string, ancho: number, medir: (t: string) => number): string[] {
  const out: string[] = []; let l = "";
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    const prueba = l ? `${l} ${w}` : w;
    if (!l || medir(prueba) <= ancho) l = prueba; else { out.push(l); l = w; }
  }
  if (l) out.push(l);
  return out;
}

// ── zones: what a point of the panel hits ──────────────────────────────────────────────────────────────────────────
export type TipoZona = "pag-ant" | "pag-sig" | "norma" | "dato" | "boton";
export type Zona = Rect & { id: number; tipo: TipoZona; /** the index among its kind (the data box's, the button's) */ indice: number; activa: boolean; boton?: string };
export const ID_PAG_ANT = 1, ID_PAG_SIG = 2, ID_NORMA = 3;
export const idDato = (k: number): number => 20 + k;
export const idBoton = (k: number): number => 100 + k;

const ANCHO_BOTON: Record<string, number> = { atras: 190, salir: 150, siguiente: 320, "sin-opcional": 470, todo: 470, aceptar: 420 };
const ancho = (b: BotonVR): number => ANCHO_BOTON[b.id] ?? 300;

export const flechaAnt: Rect = { x: 48, y: PAGINADOR_Y, w: 96, h: PAGINADOR_H };
export const flechaSig: Rect = { x: 480, y: PAGINADOR_Y, w: 96, h: PAGINADOR_H };
export const puntos: Rect = { x: 156, y: PAGINADOR_Y, w: 312, h: PAGINADOR_H };
export const rectDato = (k: number): Rect => ({ x: CUERPO.x, y: CUERPO.y + k * (CASILLA_H + CASILLA_HUECO), w: CUERPO.w, h: CASILLA_H });

/** The buttons' rectangles, right-aligned, in the order the model gives them (left to right). */
export function rectsBotones(botones: readonly BotonVR[]): Rect[] {
  const out: Rect[] = []; let x = BOTONES_DER;
  for (let k = botones.length - 1; k >= 0; k--) { const w = ancho(botones[k]); x -= w; out[k] = { x, y: BOTONES_Y, w, h: BOTON_H }; x -= BOTON_HUECO; }
  return out;
}

/** Every pressable thing of this model. A button that is off, or an arrow with no page beyond, is `activa: false` and hits nothing. */
export function disposicion(vm: ModeloVR): Zona[] {
  const z: Zona[] = [];
  z.push({ ...flechaAnt, id: ID_PAG_ANT, tipo: "pag-ant", indice: 0, activa: vm.pagina > 0 });
  z.push({ ...flechaSig, id: ID_PAG_SIG, tipo: "pag-sig", indice: 0, activa: vm.pagina < vm.paginas - 1 });
  if (vm.casillaNormas) z.push({ ...FILA_NORMAS, id: ID_NORMA, tipo: "norma", indice: 0, activa: !vm.enviando });
  vm.casillasDatos.forEach((_, k) => z.push({ ...rectDato(k), id: idDato(k), tipo: "dato", indice: k, activa: !vm.enviando }));
  const rs = rectsBotones(vm.botones);
  vm.botones.forEach((b, k) => z.push({ ...rs[k], id: idBoton(k), tipo: "boton", indice: k, activa: !b.desactivado, boton: b.id }));
  return z;
}

export const dentro = (r: Rect, x: number, y: number, margen = 0): boolean => x >= r.x - margen && x <= r.x + r.w + margen && y >= r.y - margen && y <= r.y + r.h + margen;
/** uv as three gives it (u right, v UP, 0..1) → canvas px. */
export const uvAPx = (u: number, v: number): [number, number] => [u * LIENZO.w, (1 - v) * LIENZO.h];
/** Metres on the plane (x right, y up, from its centre) → canvas px. */
export const metrosAPx = (x: number, y: number): [number, number] => [(x / PANEL.anchoM + 0.5) * LIENZO.w, (0.5 - y / ALTO_M) * LIENZO.h];

/** What the point (u, v) hits: the id of an active zone, or 0 (gaps, text, an off button, outside). */
export function zonaDe(u: number, v: number, zonas: readonly Zona[]): number {
  const [x, y] = uvAPx(u, v);
  for (const z of zonas) if (z.activa && dentro(z, x, y)) return z.id;
  return 0;
}
export const zonaPorId = (zonas: readonly Zona[], id: number): Zona | undefined => zonas.find((z) => z.id === id);

// ── the stick turns pages ──────────────────────────────────────────────────────────────────────────────────────────
/** One push = one page, re-armed when the stick returns near the middle (like the snap turn it replaces while the bubble is up). */
export const PALANCA = { empuja: 0.6, suelta: 0.3 } as const;
export function palancaPagina(x: number, armado: boolean): { dir: -1 | 0 | 1; armado: boolean } {
  if (Math.abs(x) <= PALANCA.suelta) return { dir: 0, armado: true };
  if (armado && Math.abs(x) >= PALANCA.empuja) return { dir: x > 0 ? 1 : -1, armado: false };
  return { dir: 0, armado };
}
/** The page after a turn, kept inside 0..paginas-1. */
export const paginaTras = (pagina: number, dir: number, paginas: number): number => Math.max(0, Math.min(Math.max(0, paginas - 1), pagina + dir));

// ── a fingertip touching the panel (a tracked hand: «tocando con el dedo») ─────────────────────────────────────────
/** Like the watch's touch (menu-vr.ts TOQUE): within 15 mm in front of a button and not further than 20 mm behind it. */
export const TOQUE = { cercaM: 0.015, atrasM: 0.02, sueltaM: 0.03, ms: 450, margenPx: 10 } as const;
export type EstadoToque = { armado: boolean; ultimo: number };
export const toqueInicio = (): EstadoToque => ({ armado: true, ultimo: -1e9 });
/** One step. `punta` = the fingertip in the panel's own metres (z > 0 in front of it), null = no fingertip. */
export function toquePaso(e: EstadoToque, punta: { x: number; y: number; z: number } | null, zonas: readonly Zona[], ahora: number): { estado: EstadoToque; id: number } {
  if (!punta) return { estado: e.armado ? e : { ...e, armado: true }, id: 0 };
  const [px, py] = metrosAPx(punta.x, punta.y);
  const sobre = zonas.find((z) => z.activa && dentro(z, px, py, TOQUE.margenPx))?.id ?? 0;
  if (!e.armado) return { estado: { armado: !sobre || Math.abs(punta.z) > TOQUE.sueltaM, ultimo: e.ultimo }, id: 0 };
  if (sobre && punta.z > -TOQUE.atrasM && punta.z < TOQUE.cercaM && ahora - e.ultimo >= TOQUE.ms) return { estado: { armado: false, ultimo: ahora }, id: sobre };
  return { estado: e, id: 0 };
}

// ── where it stands ─────────────────────────────────────────────────────────────────────────────────────────────────
type V3 = { x: number; y: number; z: number };
/** In front of the eyes along the gaze's horizontal direction, at eye height (a little under, so the centre of the card is where you look). */
export function colocarPanel(ojo: V3, mira: V3): V3 {
  let dx = mira.x, dz = mira.z; const n = Math.hypot(dx, dz);
  if (n < 1e-4) { dx = 0; dz = -1; } else { dx /= n; dz /= n; }
  return { x: ojo.x + dx * PANEL.distM, y: ojo.y - PANEL.bajoM, z: ojo.z + dz * PANEL.distM };
}
/** Degrees between where you look (horizontally) and where the panel is. */
export function desvioGrados(ojo: V3, mira: V3, pos: V3): number {
  const gx = mira.x, gz = mira.z, px = pos.x - ojo.x, pz = pos.z - ojo.z, a = Math.hypot(gx, gz), b = Math.hypot(px, pz);
  if (a < 1e-4 || b < 1e-4) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, (gx * px + gz * pz) / (a * b)))) * 180) / Math.PI;
}
/** Put it back in front of you after you have looked away (turned round) for this long. */
export const RECOLOCAR = { grados: 70, ms: 2500 } as const;
export type EstadoMirada = { desdeMs: number | null };
export function miradaPaso(e: EstadoMirada, desvio: number, ahora: number): { estado: EstadoMirada; recolocar: boolean } {
  if (desvio < RECOLOCAR.grados) return { estado: { desdeMs: null }, recolocar: false };
  const desde = e.desdeMs ?? ahora;
  return ahora - desde >= RECOLOCAR.ms ? { estado: { desdeMs: null }, recolocar: true } : { estado: { desdeMs: desde }, recolocar: false };
}

// ── the bubble around you ──────────────────────────────────────────────────────────────────────────────────────────
/** A sphere of 1.6 m of radius around you: seen from inside, a faint tint (never dark: the world stays readable), fading in over ~1 s
 * so it never «switches on», still while you stand (it only follows when you walk away from its middle) and bursting like the others'
 * (pompas.ts: ~⅓ s of growing and fading). One mesh, one flat material, no texture, no shader. */
export const BURBUJA = { radioM: 1.6, opacidad: 0.16, entraMs: 1000, estallidoMs: 340, escalaFinal: 1.35, sigueM: 0.4 } as const;
const suave = (t: number): number => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
/** The tint's opacity `ms` after the bubble came up. */
export const opacidadBurbuja = (ms: number): number => BURBUJA.opacidad * suave(ms / BURBUJA.entraMs);
/** The burst `ms` after it started: scale and opacity (from `desde`, the opacity it had), and whether it is over. */
export function estallidoBurbuja(ms: number, desde = BURBUJA.opacidad): { escala: number; opacidad: number; fin: boolean } {
  const t = Math.max(0, Math.min(1, ms / BURBUJA.estallidoMs));
  return { escala: 1 + (BURBUJA.escalaFinal - 1) * suave(t), opacidad: desde * (1 - t), fin: t >= 1 };
}
/** The panel's own fade when it goes with the burst. */
export const opacidadPanelEstallando = (ms: number): number => 1 - suave(ms / (BURBUJA.estallidoMs * 0.6));
/** Does the bubble's middle follow the head? Only once it is `sigueM` away (horizontally), so standing and turning move nothing. */
export const debeSeguir = (centro: V3, ojo: V3): boolean => Math.hypot(ojo.x - centro.x, ojo.z - centro.z) > BURBUJA.sigueM;
