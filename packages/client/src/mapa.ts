// mapa (J5): the map's arithmetic and its registry of marker kinds. Pure (no DOM, no three.js): tested in Node.
// World axes: x east, z south (the camera at yaw 0 looks along -z, which the maps call north). A map view is a centre
// in metres, a scale in px per metre and a turn `giro` in radians: 0 = north up; giro = the camera's yaw = whatever
// the camera looks at points up. Markers come only from what the page already receives (area of interest): nothing
// here asks the server for anyone's position.

/** How a map looks at the world: centre (m), px per metre, turn (rad; 0 = north up), size in px. */
export type Vista = { cx: number; cz: number; escala: number; giro: number; ancho: number; alto: number };

/** World (metres) → map pixels. */
export function proyectar(v: Vista, x: number, z: number): { px: number; py: number } {
  const dx = x - v.cx, dz = z - v.cz, c = Math.cos(v.giro), s = Math.sin(v.giro);
  return { px: v.ancho / 2 + (dx * c - dz * s) * v.escala, py: v.alto / 2 + (dx * s + dz * c) * v.escala };
}

/** Map pixels → world (metres): where a click or a tap lands. */
export function desproyectar(v: Vista, px: number, py: number): { x: number; z: number } {
  const u = (px - v.ancho / 2) / v.escala, w = (py - v.alto / 2) / v.escala, c = Math.cos(v.giro), s = Math.sin(v.giro);
  return { x: v.cx + u * c + w * s, z: v.cz - u * s + w * c };
}

/** Screen angle (rad, clockwise from up) of an arrow for someone facing `yaw` on a map turned by `giro`. */
export const anguloFlecha = (giro: number, yaw: number): number => giro - yaw;

/** The yaw of a step (dx, dz): 0 = walking north (-z), + = turned left (three's rotation.y, like the camera). */
export const yawDePaso = (dx: number, dz: number): number => Math.atan2(-dx, -dz);

/** A point outside a round map of radius `r` (px) around (cx, cy) is pulled to its edge (objectives, waypoints). */
export function alBorde(px: number, py: number, cx: number, cy: number, r: number): { px: number; py: number; fuera: boolean } {
  const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
  if (d <= r) return { px, py, fuera: false };
  return { px: cx + (dx / d) * r, py: cy + (dy / d) * r, fuera: true };
}

/** Screen angle (rad, clockwise from up, for `forma`'s «flecha») an edge-pinned marker points: from the map's centre
 * (cx, cy) toward where it really is (px, py) — a GPS-style «go this way», not just a static dot at the rim. */
export const anguloBorde = (px: number, py: number, cx: number, cy: number): number => Math.atan2(px - cx, -(py - cy));

/** U14: the canvas transform (a, b, c, d, e, f, for ctx.transform) that lays a picture of the zone — `px` pixels square
 * over x0..x1 × z0..z1 metres, north up — under a map view, turned and scaled like everything else drawn on it. */
export function matrizImagen(v: Vista, img: { x0: number; z0: number; x1: number; z1: number; px: number }): [number, number, number, number, number, number] {
  const c = Math.cos(v.giro), s = Math.sin(v.giro), sx = ((img.x1 - img.x0) / img.px) * v.escala, sz = ((img.z1 - img.z0) / img.px) * v.escala;
  const o = proyectar(v, img.x0, img.z0);
  return [sx * c, sx * s, -sz * s, sz * c, o.px, o.py];
}

/** U14: the segments of a floor plan's cut (x0, z0, x1, z1 in metres, one after another) that show in a view, as map
 * pixels written into `out` (kept between draws: no garbage at 5 draws a second). Those wholly beyond the canvas edge
 * (plus `margen` px) are left out. Returns how many were written. E4: `k` multiplies what is written — the minimap
 * passes an Int32Array and 4 (quarter pixels, drawn under a ×¼ scale) so the canvas gets small integers, which V8
 * hands over as they are; a fractional coordinate becomes a new heap number per moveTo/lineTo argument (≈1 MB every
 * 10 s walking in the TRG26 template). */
export function segmentosEnVista(v: Vista, seg: ArrayLike<number>, out: { [i: number]: number }, margen = 4, k = 1): number {
  const c = Math.cos(v.giro), s = Math.sin(v.giro), e = v.escala, w2 = v.ancho / 2, h2 = v.alto / 2, x1 = v.ancho + margen, y1 = v.alto + margen;
  let n = 0;
  for (let i = 0; i + 3 < seg.length; i += 4) {
    const ax = seg[i] - v.cx, az = seg[i + 1] - v.cz, bx = seg[i + 2] - v.cx, bz = seg[i + 3] - v.cz;
    const apx = w2 + (ax * c - az * s) * e, apy = h2 + (ax * s + az * c) * e, bpx = w2 + (bx * c - bz * s) * e, bpy = h2 + (bx * s + bz * c) * e;
    if ((apx < -margen && bpx < -margen) || (apy < -margen && bpy < -margen) || (apx > x1 && bpx > x1) || (apy > y1 && bpy > y1)) continue;
    out[n * 4] = apx * k; out[n * 4 + 1] = apy * k; out[n * 4 + 2] = bpx * k; out[n * 4 + 3] = bpy * k; n++;
  }
  return n;
}

// ---------- words: what a screen reader says (and what the list shows) ----------
export const RUMBOS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"] as const;
export type Rumbo = (typeof RUMBOS)[number];
/** Below this distance (m) a thing is «aquí mismo» (no direction). */
export const AQUI_M = 1.5;

/** Compass word from here to there: north = -z, east = +x. */
export function rumbo(dx: number, dz: number): Rumbo {
  const a = Math.atan2(dx, -dz); // 0 north, +π/2 east
  return RUMBOS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

/** «a 23 m», «a 1,2 km» (Spanish decimal comma), «a menos de 1 m». */
export function distancia(m: number): string {
  if (!(m >= 1)) return "a menos de 1 m";
  if (m < 999.5) return `a ${Math.round(m)} m`;
  return `a ${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

/** «al noreste, a 23 m»; «aquí mismo» when closer than AQUI_M. */
export function enPalabras(dx: number, dz: number): string {
  const d = Math.hypot(dx, dz);
  return d < AQUI_M ? "aquí mismo" : `al ${rumbo(dx, dz)}, ${distancia(d)}`;
}

const LADOS = ["delante", "delante a la derecha", "a tu derecha", "detrás a la derecha", "detrás", "detrás a la izquierda", "a tu izquierda", "delante a la izquierda"] as const;
/** Where a thing is for someone facing `yaw` (V4/V5 say «a tu izquierda»): eight sides of 45°. */
export function lado(dx: number, dz: number, yaw: number): (typeof LADOS)[number] {
  const rel = Math.atan2(dx, -dz) + yaw; // bearing minus the facing bearing (which is -yaw)
  return LADOS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
}

/** Time connected: «menos de 1 min», «12 min», «1 h 05 min» (the player sheet). */
export function duracion(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

// ---------- redraw rule (phones stay cool): only when what is shown changed, at most every `minMs` ----------
export function crearLimitador(minMs = 200) {
  let ultimaFirma: string | null = null, ultimo = -Infinity, dibujos = 0, saltados = 0;
  return {
    /** True when the picture must be drawn now: its signature changed and the last draw is `minMs` old. */
    debe(ahora: number, firma: string): boolean {
      if (firma === ultimaFirma) return false;
      if (ahora - ultimo < minMs) { saltados++; return false; }
      ultimaFirma = firma; ultimo = ahora; dibujos++;
      return true;
    },
    /** The next `debe` draws even with the same signature (a resize, a new style). */
    forzar(): void { ultimaFirma = null; },
    get stats() { return { dibujos, saltados }; },
  };
}

// ---------- markers and their kinds (a registry: an adventure adds its own) ----------
export type Forma = "flecha" | "punto" | "cuadrado" | "rombo" | "estrella" | "anillo" | "triangulo" | "exclamacion" | "visto" | "rombo-hueco";
/** How a kind of marker looks and behaves. Shape AND colour: colour alone never tells kinds apart. */
export type Tipo = {
  nombre: string;    // the legend's word, and what a screen reader says
  color: string;     // CSS colour
  forma: Forma;
  tam: number;       // half-size in px on the minimap (the big map scales it a bit)
  orden: number;     // drawing order: higher on top
  enLista: boolean;  // listed in the HTML twin (you are not)
  alBorde: boolean;  // when out of the minimap, pinned to its edge (where to go)
};
/** One thing on the map. `id` unique across sources; `yaw` only for whoever has a heading (the arrow). */
export type Marcador = { id: string; tipo: string; nombre: string; x: number; z: number; detalle?: string; yaw?: number };

export const TIPOS_BASE: Readonly<Record<string, Tipo>> = {
  tu: { nombre: "Tú", color: "#e07a3f", forma: "flecha", tam: 7, orden: 100, enLista: false, alBorde: false },
  destino: { nombre: "Destino", color: "#d6336c", forma: "anillo", tam: 6, orden: 95, enLista: true, alBorde: true },
  objetivo: { nombre: "Objetivo de misión", color: "#e0a800", forma: "estrella", tam: 6, orden: 90, enLista: true, alBorde: true },
  // U14 (4): a person (or quest thing) the server marks for you: «!» something for you now (drawn over an objective's
  // star, whose points still show), «✓» you are done with them
  "para-ti": { nombre: "Algo para ti", color: "#ffb21e", forma: "exclamacion", tam: 5.5, orden: 92, enLista: true, alBorde: false },
  hecho: { nombre: "Ya hecho", color: "#2f9e44", forma: "visto", tam: 5, orden: 75, enLista: true, alBorde: false },
  persona: { nombre: "Persona", color: "#2f6fd0", forma: "punto", tam: 4, orden: 80, enLista: true, alBorde: false },
  agente: { nombre: "Agente (IA)", color: "#14897a", forma: "rombo", tam: 4, orden: 75, enLista: true, alBorde: false },
  // ia-visible S5: an AI that sleeps (state `dormida` of features/ia): the same green diamond, but hollow — shape AND fill tell it from an awake one
  "agente-dormida": { nombre: "Agente (IA) dormida", color: "#14897a", forma: "rombo-hueco", tam: 4, orden: 74, enLista: true, alBorde: false },
  npc: { nombre: "Personaje", color: "#8a3fc0", forma: "rombo", tam: 5, orden: 70, enLista: true, alBorde: false },
  portal: { nombre: "Salida o portal", color: "#0f8a6a", forma: "anillo", tam: 5, orden: 60, enLista: true, alBorde: true },
  elemento: { nombre: "Elemento (agua, fuego…)", color: "#1679a8", forma: "triangulo", tam: 5, orden: 50, enLista: true, alBorde: false },
  lugar: { nombre: "Lugar", color: "#3d6b2f", forma: "anillo", tam: 4, orden: 40, enLista: true, alBorde: false },
  objeto: { nombre: "Objeto", color: "#5a4632", forma: "cuadrado", tam: 4, orden: 30, enLista: true, alBorde: false },
  otro: { nombre: "Otra cosa", color: "#3b4450", forma: "punto", tam: 3, orden: 10, enLista: true, alBorde: false },
};
/** The roles of a card (packages/feature ROLES) and how the map draws each. An unknown role is «otro» (a dot). */
export const ROL_A_TIPO: Readonly<Record<string, string>> = {
  objeto: "objeto", cartel: "objeto", boton: "objeto", pantalla: "objeto", asiento: "objeto",
  persona: "npc", criatura: "npc", puerta: "portal", salida: "portal", lugar: "lugar", punto: "lugar", elemento: "elemento",
};

/** ia-visible S8: which in-world entity a map marker stands for, when it is an AI (agente / agente-dormida, id `p<entity>`); null for anything else. */
export function quienDeAgente(m: { id: string; tipo: string } | null | undefined): number | null {
  if (!m || (m.tipo !== "agente" && m.tipo !== "agente-dormida")) return null;
  const q = /^p(\d+)$/.exec(m.id);
  return q ? Number(q[1]) : null;
}

export type Registro = ReturnType<typeof crearRegistro>;
export function crearRegistro() {
  const tipos = new Map<string, Tipo>(Object.entries(TIPOS_BASE));
  const roles = new Map<string, string>(Object.entries(ROL_A_TIPO));
  const base = TIPOS_BASE.otro;
  return {
    /** Add or change a kind (an adventure's «tesoro», «trampa»…). Unset fields copy «otro». */
    registrar(id: string, t: Partial<Tipo> & { nombre: string }): void { tipos.set(id, { ...(tipos.get(id) ?? base), ...t }); },
    /** Draw cards of `role` as `tipo` (e.g. a new role «vehiculo» → a kind of its own). */
    rol(role: string, tipo: string): void { roles.set(role, tipo); },
    tipoDeRol(role: string): string { return roles.get(role) ?? "otro"; },
    /** A kind's look; unknown kinds look like «otro» (the default dot). */
    tipo(id: string): Tipo { return tipos.get(id) ?? base; },
    tipos(): [string, Tipo][] { return [...tipos.entries()].sort((a, b) => b[1].orden - a[1].orden); },
  };
}

/** A source of markers (people, cards, quests, an adventure's own): called each time the map looks. */
export type Fuente = () => readonly Marcador[] | null | undefined;

/** Ask every source; one that throws is skipped and named (a broken adventure never breaks the map). */
export function reunir(fuentes: ReadonlyMap<string, Fuente>): { marcadores: Marcador[]; fallos: string[] } {
  const marcadores: Marcador[] = [], fallos: string[] = [];
  for (const [id, f] of fuentes) {
    try {
      for (const m of f() ?? []) if (Number.isFinite(m.x) && Number.isFinite(m.z)) marcadores.push(m);
    } catch { fallos.push(id); }
  }
  return { marcadores, fallos };
}

/** How many markers of each kind (the e2e hook and the minimap's spoken summary). */
export function contar(ms: readonly Marcador[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of ms) out[m.tipo] = (out[m.tipo] ?? 0) + 1;
  return out;
}

export type Entrada = Marcador & { d: number; texto: string };
/** The HTML twin's rows: listed kinds, nearest first, at most `max` (V4: 30–50), each with its words. */
export function cercanos(ms: readonly Marcador[], yo: { x: number; z: number }, reg: Registro, max = 50): Entrada[] {
  const out: Entrada[] = [];
  for (const m of ms) {
    if (!reg.tipo(m.tipo).enLista) continue;
    const dx = m.x - yo.x, dz = m.z - yo.z;
    out.push({ ...m, d: Math.hypot(dx, dz), texto: enPalabras(dx, dz) });
  }
  return out.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).slice(0, max);
}

/** What a map shows, as a short text: the centre in whole pixels (the ground, grid and landmarks move with it), the
 * integer pixels of each marker inside the picture (+ margin), the direction of those pinned to the edge
 * (`alBorde(tipo)`), the turn in 2° steps and the zoom. Same text = same picture = no redraw. */
export function firma(v: Vista, ms: readonly Marcador[], alBordeDe: (tipo: string) => boolean = () => false, margen = 16): string {
  let s = `${Math.round(v.cx * v.escala)},${Math.round(v.cz * v.escala)}|${Math.round((v.giro * 90) / Math.PI)}|${v.escala.toFixed(3)}|${Math.round(v.ancho)}x${Math.round(v.alto)}|`;
  const c = Math.cos(v.giro), sn = Math.sin(v.giro), w2 = v.ancho / 2, h2 = v.alto / 2; // E4: proyectar inlined (no object per marker, 5 times a second)
  for (const m of ms) {
    const dx = m.x - v.cx, dz = m.z - v.cz, qx = w2 + (dx * c - dz * sn) * v.escala, qy = h2 + (dx * sn + dz * c) * v.escala, px = Math.round(qx), py = Math.round(qy);
    const dentro = px >= -margen && py >= -margen && px <= v.ancho + margen && py <= v.alto + margen;
    if (dentro) s += `${m.tipo}${px},${py}${m.yaw === undefined ? "" : "^" + Math.round((m.yaw * 60) / Math.PI)};`;
    else if (alBordeDe(m.tipo)) s += `${m.tipo}~${Math.round(Math.atan2(qy - h2, qx - w2) * 30)};`;
  }
  return s;
}
