// Rediseño v2 (story E, maquetas p6/p7): the VR menu and the wrist watch as pure numbers (no three.js, tested in node:
// test/vr-menu.test.ts). The views that paint them are menu-invocado.ts (the panel) and muneca.ts (the watch).
//
// THE PANEL (p7): one flat panel 1.0 × 0.611 m, 1.2 m from the eyes, a little below them so it leans towards you, STILL
// (placed once when it opens; it closes with B, with «Menú» again, with its X, or walking 2 m away). A header (title,
// «Salir de VR», X), the list of sections on the left — the same seven as the computer: Tú · Gente · Bolsa · Misiones ·
// Mapa · Construir · Ajustes, and since v7 Chat (8 rows) — and the section's content on the right. Pointed at with the ray of either hand; trigger
// or pinch presses. Canvas 1440 × 880 px (1440 px per metre; 800 until the eighth row, «Chat», needed room): a list row is 84 px = 58 mm ≈ 2.8° at 1.2 m.
//
// THE WATCH (p6): a disc of 12 cm over the wrist of the menu hand. Centre «Menú» (turquoise), around it four round
// buttons: microphone (top), camera (right), notices (bottom), back to the city (left; only when the world has a city —
// otherwise its place is not drawn and cannot be pressed). Canvas 512 × 512 px.

import { iconoDe, idsPanelVR, nombreDe, seccionDeReloj } from "./menu-secciones.ts";

// ── the panel ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const MENU = { distM: 1.2, bajoGrados: 12, anchoM: 1.0, altoM: 880 / 1440, cierraM: 2 } as const;
export const LIENZO = { w: 1440, h: 880 } as const;
export const PX_POR_M = LIENZO.w / MENU.anchoM;

// the list, names and icons are the world's ONE list of sections (menu-secciones.ts): the same the computer's bar and the
// phone's menu read (test/menu-paridad.test.ts keeps them together)
export type Seccion = "tu" | "gente" | "bolsa" | "misiones" | "mapa" | "construir" | "ajustes" | "chat";
export const SECCIONES = idsPanelVR() as readonly Seccion[];
/** What the panel can show: a section of the list, the notices (opened from the watch) or «obra» (MIS-222: the pictures a hole
 * can take, opened by pressing a hole; apps/plaza/obra-vr.ts) — the last two are not in the list. */
export type Vista = Seccion | "avisos" | "obra";
/** The views that are not rows of the list: opened by something else, never greyed out. */
export const VISTAS_SUELTAS: readonly Vista[] = ["avisos", "obra"];
const VISTAS: readonly Vista[] = [...SECCIONES, ...VISTAS_SUELTAS];
export const ETIQUETAS = Object.fromEntries(VISTAS.map((v) => [v, v === "obra" ? "Obra" : nombreDe(v)])) as Record<Vista, string>;
/** Phosphor icons (apps/plaza/iconos.ts names), the same as the computer's sections. */
export const ICONOS = Object.fromEntries(VISTAS.map((v) => [v, v === "obra" ? "image-square" : iconoDe(v)])) as Record<Vista, string>;

/** A rectangle in canvas px (x right, y down). */
export type Rect = { x: number; y: number; w: number; h: number };
export type Caja = Rect & { id: number };

/** Ids: 1 = close (X), 2 = «Salir de VR», 10..17 = the list, 100.. = the content's buttons. 0 = nothing. */
export const ID_CERRAR = 1, ID_SALIR = 2;
export const idSeccion = (i: number) => 10 + i;
export const idBoton = (i: number) => 100 + i;
export const seccionDeId = (id: number): Seccion | null => (id >= 10 && id < 10 + SECCIONES.length ? SECCIONES[id - 10] : null);

export const CABECERA = { h: 120, boton: 96, margen: 24 } as const;
export const LISTA = { x: 24, y: 136, w: 320, fila: 84, hueco: 8 } as const;
export const CONTENIDO = { x: 376, y: 136, w: LIENZO.w - 376 - 24, h: LIENZO.h - 136 - 24 } as const;
/** Rows inside the content (people, things, places, settings): 84 px tall, 8 apart. */
export const FILA = { h: 84, hueco: 8 } as const;
/** A button inside the content: at least 84 × 84 px (58 mm ≈ 2.8° at 1.2 m). */
export const BOTON_MIN = 84;

export function cajaCerrar(): Caja { const b = CABECERA.boton; return { id: ID_CERRAR, x: LIENZO.w - CABECERA.margen - b, y: (CABECERA.h - b) / 2, w: b, h: b }; }
export function cajaSalir(): Caja { const b = CABECERA.boton, c = cajaCerrar(); return { id: ID_SALIR, x: c.x - 16 - 300, y: c.y, w: 300, h: b }; }
export function cajasLista(): Caja[] {
  return SECCIONES.map((_, i) => ({ id: idSeccion(i), x: LISTA.x, y: LISTA.y + i * (LISTA.fila + LISTA.hueco), w: LISTA.w, h: LISTA.fila }));
}
/** How many content rows fit (the content area, minus a title of `titulo` px and a pager row when needed). */
export function filasCaben(titulo = 0, conPaginas = false): number {
  const alto = CONTENIDO.h - titulo - (conPaginas ? FILA.h + FILA.hueco : 0);
  return Math.max(1, Math.floor((alto + FILA.hueco) / (FILA.h + FILA.hueco)));
}
/** The i-th content row (0-based), under a title of `titulo` px. */
export function rectFila(i: number, titulo = 0): Rect {
  return { x: CONTENIDO.x, y: CONTENIDO.y + titulo + i * (FILA.h + FILA.hueco), w: CONTENIDO.w, h: FILA.h };
}
/** Buttons at the right end of a row, in order left to right, each `anchos[k]` px wide (≥ BOTON_MIN), 12 px apart. */
export function botonesFila(fila: Rect, anchos: readonly number[]): Rect[] {
  const out: Rect[] = []; let x = fila.x + fila.w;
  for (let k = anchos.length - 1; k >= 0; k--) { const w = Math.max(BOTON_MIN, anchos[k]); x -= w; out.unshift({ x, y: fila.y, w, h: fila.h }); x -= 12; }
  return out;
}
/** The pager under the rows: «anterior» and «siguiente». */
export function cajasPaginas(): [Rect, Rect] {
  const y = CONTENIDO.y + CONTENIDO.h - FILA.h, w = 200;
  return [{ x: CONTENIDO.x + CONTENIDO.w - 2 * w - 12, y, w, h: FILA.h }, { x: CONTENIDO.x + CONTENIDO.w - w, y, w, h: FILA.h }];
}

export const dentro = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** uv as three gives it (u to the right, v UP, both 0..1) → canvas px. */
export const uvAPx = (u: number, v: number): [number, number] => [u * LIENZO.w, (1 - v) * LIENZO.h];

/** What a point of the panel hits: header buttons, the list (a disabled section hits nothing), then the content's own
 * buttons (`botones`, in order: idBoton(i)). */
export function zonaDe(u: number, v: number, botones: readonly Rect[] = [], desactivadas: ReadonlySet<Seccion> = new Set()): number {
  const [x, y] = uvAPx(u, v);
  for (const c of [cajaCerrar(), cajaSalir()]) if (dentro(c, x, y)) return c.id;
  for (const c of cajasLista()) if (dentro(c, x, y)) return desactivadas.has(seccionDeId(c.id)!) ? 0 : c.id;
  for (const [i, r] of botones.entries()) if (dentro(r, x, y)) return idBoton(i);
  return 0;
}

/** Visual angle (degrees) of something `tamM` across, seen from `distM`. */
export const anguloGrados = (tamM: number, distM: number = MENU.distM): number => (2 * Math.atan(tamM / 2 / distM) * 180) / Math.PI;
/** The least angle of the panel's fixed targets (header and list) and the least gap between two neighbours, in mm. */
export function medidas(): { minGrados: number; minSeparacionMm: number } {
  const fijas = [cajaSalir(), cajaCerrar(), ...cajasLista()];
  let minGrados = Infinity, minSep = Infinity;
  for (const c of fijas) minGrados = Math.min(minGrados, anguloGrados(c.w / PX_POR_M), anguloGrados(c.h / PX_POR_M));
  for (let i = 1; i < fijas.length; i++) {
    const a = fijas[i - 1], b = fijas[i];
    const sep = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
    minSep = Math.min(minSep, (sep / PX_POR_M) * 1000);
  }
  return { minGrados, minSeparacionMm: minSep };
}

/** Where the panel stands when it opens: along the flattened gaze, MENU.distM from the eyes in a straight line,
 * MENU.bajoGrados under them (so, turned to face the eyes, it leans back towards you). null when the gaze is vertical. */
export function colocarMenu(ojo: { x: number; y: number; z: number }, mira: { x: number; z: number }): { x: number; y: number; z: number } | null {
  const l = Math.hypot(mira.x, mira.z);
  if (l < 1e-6) return null;
  const b = (MENU.bajoGrados * Math.PI) / 180, h = MENU.distM * Math.cos(b);
  return { x: ojo.x + (mira.x / l) * h, y: ojo.y - MENU.distM * Math.sin(b), z: ojo.z + (mira.z / l) * h };
}
/** True when the eyes are further than MENU.cierraM from the still panel: it closes by itself. */
export function demasiadoLejos(ojo: { x: number; y: number; z: number }, panel: { x: number; y: number; z: number }): boolean {
  return Math.hypot(ojo.x - panel.x, ojo.y - panel.y, ojo.z - panel.z) > MENU.cierraM;
}
/** Pages: how many there are and the rows of page `p` (clamped). */
export function paginar<T>(filas: readonly T[], porPagina: number, p: number): { pagina: number; paginas: number; filas: T[] } {
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina)), pagina = Math.max(0, Math.min(paginas - 1, p));
  return { pagina, paginas, filas: filas.slice(pagina * porPagina, (pagina + 1) * porPagina) };
}

// ── the watch ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const RELOJ = { diametroM: 0.12, lienzo: 512 } as const;
export const BOTONES_RELOJ = ["menu", "micro", "camara", "graboso", "avisos", "ciudad"] as const;
export type BotonReloj = (typeof BOTONES_RELOJ)[number];
export const NOMBRES_RELOJ = Object.fromEntries(BOTONES_RELOJ.map((b) => [b, seccionDeReloj(b).es])) as Record<BotonReloj, string>;
/** A round target on the disc, in canvas px (centre and radius). */
export type Circulo = { id: BotonReloj; cx: number; cy: number; r: number };
/** Disc radius, «Menú» radius (84 px = 3.9 cm across), the four buttons' radius (52 px = 2.4 cm across) and how far
 * from the centre they sit (176 px). */
export const DISCO = { r: 248, centro: 84, boton: 52, orbita: 176 } as const;
const ANGULO: Record<Exclude<BotonReloj, "menu">, number> = { micro: -90, camara: 0, graboso: 45, avisos: 90, ciudad: 180 };
/** Which optional buttons the watch has: `true`/`false` = only «ciudad» (the older callers), or both. */
export type Presentes = boolean | { ciudad: boolean; graboso?: boolean };
const quePresentes = (p: Presentes): { ciudad: boolean; graboso: boolean } => typeof p === "boolean" ? { ciudad: p, graboso: false } : { ciudad: p.ciudad, graboso: !!p.graboso };
/** The watch's targets; «ciudad» only when the world has a city, «graboso» only where the Graboso exists. */
export function circulosReloj(presentes: Presentes): Circulo[] {
  const hay = quePresentes(presentes);
  const c = RELOJ.lienzo / 2, out: Circulo[] = [{ id: "menu", cx: c, cy: c, r: DISCO.centro }];
  for (const id of ["micro", "camara", "graboso", "avisos", "ciudad"] as const) {
    if (id === "ciudad" && !hay.ciudad) continue;
    if (id === "graboso" && !hay.graboso) continue;
    const a = (ANGULO[id] * Math.PI) / 180;
    out.push({ id, cx: c + Math.cos(a) * DISCO.orbita, cy: c + Math.sin(a) * DISCO.orbita, r: DISCO.boton });
  }
  return out;
}
/** What a point of the disc hits (canvas px), with `margen` px of slack around each button (a fingertip is not a point). */
export function botonRelojEn(x: number, y: number, hayCiudad: Presentes, margen = 0): BotonReloj | null {
  for (const b of circulosReloj(hayCiudad)) if (Math.hypot(x - b.cx, y - b.cy) <= b.r + margen) return b.id;
  return null;
}
/** Disc-local metres (x right, y up, the disc's centre at 0) → canvas px. */
export function metrosAPxReloj(x: number, y: number): [number, number] {
  const s = RELOJ.lienzo / RELOJ.diametroM;
  return [RELOJ.lienzo / 2 + x * s, RELOJ.lienzo / 2 - y * s];
}

// ── pressing the watch with a fingertip ────────────────────────────────────────────────────────────────────────────
/** A press: the tip comes within `cercaM` of the disc's plane over a button; it re-arms only after leaving beyond
 * `sueltaM` (or off every button) and never sooner than `ms` after the last press (no double press from a shaky finger). */
export const TOQUE = { cercaM: 0.015, sueltaM: 0.03, ms: 450, margenPx: 14 } as const;
export type EstadoToque = { armado: boolean; ultimo: number };
export const toqueInicio = (): EstadoToque => ({ armado: true, ultimo: -1e9 });
/** One step: the fingertip in disc-local metres (z = distance in front of the disc; null = no fingertip). */
export function toquePaso(e: EstadoToque, punta: { x: number; y: number; z: number } | null, hayCiudad: Presentes, ahora: number): { estado: EstadoToque; pulsado: BotonReloj | null } {
  if (!punta) return { estado: { ...e, armado: true }, pulsado: null };
  const [px, py] = metrosAPxReloj(punta.x, punta.y);
  const sobre = botonRelojEn(px, py, hayCiudad, TOQUE.margenPx);
  const cerca = punta.z > -0.02 && punta.z < TOQUE.cercaM;
  if (!e.armado) {
    const lejos = !sobre || Math.abs(punta.z) > TOQUE.sueltaM;
    return { estado: { armado: lejos, ultimo: e.ultimo }, pulsado: null };
  }
  if (sobre && cerca && ahora - e.ultimo >= TOQUE.ms) return { estado: { armado: false, ultimo: ahora }, pulsado: sobre };
  return { estado: e, pulsado: null };
}

// ── the settings rows (the menu's «Ajustes»: the settings registry's own rows, −/+ or a switch) ──────────────────────
/** A settings row's next value: an option list cycles (`paso` ±1), a number moves by its step within its limits, a
 * switch flips. Pure (tested in test/vr-menu.test.ts). */
export function siguienteValor(a: { tipo: string; valor: unknown; min?: number; max?: number; paso?: number; opciones?: { valor: unknown }[] }, paso: 1 | -1): unknown {
  if (a.tipo === "booleano" || typeof a.valor === "boolean") return !a.valor;
  if (a.opciones?.length) {
    const i = a.opciones.findIndex((o) => o.valor === a.valor), n = a.opciones.length;
    return a.opciones[((i < 0 ? 0 : i + paso) % n + n) % n].valor;
  }
  const v = Number(a.valor) + paso * (a.paso ?? 1);
  return Math.max(a.min ?? -Infinity, Math.min(a.max ?? Infinity, Math.round(v * 1000) / 1000));
}
/** A settings row's value as words. */
export function textoValor(a: { tipo: string; valor: unknown; unidad?: string; opciones?: { valor: unknown; nombre: string }[] }): string {
  if (a.tipo === "booleano" || typeof a.valor === "boolean") return a.valor ? "Sí" : "No";
  const o = a.opciones?.find((x) => x.valor === a.valor);
  if (o) return o.nombre;
  return `${a.valor}${a.unidad ? ` ${a.unidad}` : ""}`;
}

/** Clock line for the header: «21:40». */
export const hhmm = (d: Date): string => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
