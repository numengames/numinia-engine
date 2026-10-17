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
export type Forma = "flecha" | "punto" | "cuadrado" | "rombo" | "estrella" | "anillo" | "triangulo";
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
  persona: { nombre: "Persona", color: "#2f6fd0", forma: "punto", tam: 4, orden: 80, enLista: true, alBorde: false },
  agente: { nombre: "Agente (IA)", color: "#14897a", forma: "rombo", tam: 4, orden: 75, enLista: true, alBorde: false },
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
  for (const m of ms) {
    const p = proyectar(v, m.x, m.z), px = Math.round(p.px), py = Math.round(p.py);
    const dentro = px >= -margen && py >= -margen && px <= v.ancho + margen && py <= v.alto + margen;
    if (dentro) s += `${m.tipo}${px},${py}${m.yaw === undefined ? "" : "^" + Math.round((m.yaw * 60) / Math.PI)};`;
    else if (alBordeDe(m.tipo)) s += `${m.tipo}~${Math.round(Math.atan2(p.py - v.alto / 2, p.px - v.ancho / 2) * 30)};`;
  }
  return s;
}
