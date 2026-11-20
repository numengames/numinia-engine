// The map (J5): a corner minimap and a big map (key M, «Mapa» button) over the zone seen from above, with waypoints
// («Marcar destino»: a column of light in the world and a marker on both maps) and an HTML twin: every marker is also
// a line of text (name, kind, distance and direction in words) with real buttons, for keyboards, screen readers and
// agents. Phones stay cool: the minimap is a 2D canvas redrawn only when what it shows changed, at most 5 times a
// second, and it never keeps the 3D page drawing (view.busy() does not know it exists).
// Markers come from sources (you, the people this page receives, the features' cards with `at`, the misiones contract,
// the waypoint, an adventure's own) and look as their kind says in a registry (packages/client/src/mapa.ts). Both are
// open: `__numinia.mapa.registrar(...)`, `.rol(...)`, `.fuente(...)`. Recipe: docs/entregas/mapa.md.
// U14: a world whose environment says `mapa.corte` (m) is drawn as a floor plan on both maps: the zone's picture cut at
// Map v2.2: by default the zone is drawn as a PAINTED old map (mapa-pintado.ts: flat tones of the house palette, soft ink
// outlines, repainted at the screen's own resolution so a zoom never shows pixels; `mapa.estilo: "foto"` keeps the render as it
// comes), the kinds are the house icons in round badges, people are dots, and the filter is ONE list in a panel apart
// (the magnifying glass), grouped by kind.
// that height (view.cenital) as the minimap's background too, and the cut's walls and columns as lines over it. The
// picture is made when the minimap first needs it, then again only when the zone changes (at most every IMAGEN_MS),
// never in XR (this clock stops there); until it exists, the minimap draws only what stands under the cut.
import { proyectar, desproyectar, anguloFlecha, anguloBorde, yawDePaso, enPalabras, crearLimitador, crearRegistro, reunir, contar, cercanos, firma, matrizImagen, segmentosEnVista, quienDeAgente, puntoNorte } from "../../packages/client/src/mapa.ts";
import type { Vista, Marcador, Tipo, Fuente, Entrada } from "../../packages/client/src/mapa.ts";
import type { ImagenCenital, Huella } from "../../packages/render/src/index.ts";
import { bajoElCorte } from "../../packages/render/src/corte.ts";
import { MARCA_IA } from "../../packages/instance/src/identidad.ts";
import { CAPAS, capasActivas, filtrar, leerCapas, leerMapa, textoCapas, CLAVE_CAPAS, encuadre, esDecorativo, marcadorDePunto, tipoDePunto, agrupar } from "../../packages/client/src/mapa-interes.ts";
import { PALETAS, preparar, pintarVentana, ventanaDeVista, leerFondo } from "../../packages/client/src/mapa-pintado.ts";
import type { Preparado } from "../../packages/client/src/mapa-pintado.ts";
import type { Capas } from "../../packages/client/src/mapa-interes.ts";
import "./iconos-mapa.ts"; // the map's own icons, only in this lazy chunk
import { t as tr } from "../../packages/client/src/idioma.ts";
import { crearDialogo, anunciar } from "./paneles.ts";
import { perfil, esTactil } from "./perfil-aparato.ts";
import { icono, pathsIcono } from "./iconos.ts";
import { frase } from "../../packages/client/src/ir-andando.ts";
import type { Fin } from "../../packages/client/src/ir-andando.ts";
import { tituloDe } from "../../packages/render/src/menu-secciones.ts"; // v2 paridad: the map's name is the one list's
import { esMovil } from "../../packages/client/src/movil.ts"; // U24
import { tx, ligar, alCambiarIdioma } from "../../packages/feature/src/idioma.ts";
import "./mapa.css";

type Vec = { x: number; z: number };
type Ficha = { feature: string; key: string; role: string; name: string; description?: string; at?: Vec };
export type HostMapa = {
  session: { entity: number; selfPosition(alpha: number): Vec; remotePositions(): { id: number; x: number; z: number }[]; features: { cards(): Ficha[]; stateVersion?: number; catalog?: unknown }; who: { id: string; nombre: string } | null };
  view: {
    power: { mobile: boolean };
    vr: { active: boolean }; ar: { state: string };
    beacon(x: number, z: number, text: string, ms: number): void;
    waypoint?(x: number, z: number, text: string): number; dropWaypoint?(id: number): void;
    cenital?(o?: { px?: number; incluir?: Vec; modo?: "gpu" | "huellas"; corte?: number }): Promise<ImagenCenital>;
    huellas?(): Huella[]; cenitalVersion?(): number;
    /** U14: the height (m) where the world's maps are cut (entorno `mapa.corte`); 0 = not cut. */
    mapaCorte?(): number;
    cam?: { yaw?(): number };
  };
  /** `globalThis.__numinia`, read at each use: the optional contracts of other branches (misiones, chat) live there. */
  otros(): Record<string, any>;
  /** U27 (MVL1): go to a marked site of the map (features/teletransporte): omitted = no «Ir» button (this world's page did not wire it). */
  teletransporte?: { activo(): boolean; ir(x: number, z: number, nombre: string): void };
  /** MIS-257: walk by yourself to a point on the ground (packages/client/src/ir-andando.ts; the page feeds the stick). Omitted = no «Ir» that walks. */
  andar?: { ir(d: { x: number; z: number; nombre: string }): { ok: true } | { ok: false; motivo: "ya-estas" | "lejos" | "invalido" }; parar(): void; activo(): boolean };
  /** C2: called after «Ir» sent the trip, with what you went to (the page selects it in the builder, opens its card…). */
  alIr?(donde: { id: string; nombre: string; x: number; z: number }): void;
  /** MIS-240: edit what you picked. `puedeEditar` says whether it is an object you may build on (then the detail shows «Editar»);
   * `alEditar` opens the builder on it and returns whether it did (then the big map closes so you see it). Omitted = no button. */
  puedeEditar?(donde: { id: string; nombre: string; x: number; z: number }): boolean;
  alEditar?(donde: { id: string; nombre: string; x: number; z: number }): boolean;
  /** Map v2: what the world declares for its map (ficha.json `mapa`, served by /status): its points of interest and which characters are decoration. The raw `mapa` object (the server validated it; leerMapa reads it again, never trusting the wire). Omitted = no points: the map shows the doors, people and quests only. */
  mundo?: unknown;
  /** ia-visible S8: the marker picked is an AI in the world; the page opens its card (gente.tarjeta). Omitted = the map only shows its detail. */
  alAgente?(quien: number): void;
};

const PASO_MS = 200;               // the minimap looks 5 times a second; it draws only when the picture changed
const FICHAS_MS = 1000;            // the features' cards are re-read once a second (things rarely move)
const TEXTO_MS = 2000;             // the minimap's text twin, at most every 2 s
const LISTA_MAX = 400;             // C1: the big map lists everything in the world (nearest first), up to this many; the search narrows it
const LISTA_MS = 1000;             // the big map's list, at most once a second while open
const RADIOS = [15, 30, 60, 120];  // minimap zoom: metres from the centre to the edge
const ZOOM_INICIAL = 1;            // the radius the minimap starts with, and the one the north button brings back
const LLEGADA_M = 2.5;             // a waypoint this close is reached (and cleared, with a notice)
const ESTABLE_MS = 1500, ESPERA_MAX_MS = 10_000; // E4: a cut world's minimap picture waits until the zone stood still this long (at most ESPERA_MAX_MS)
const IMAGEN_PINTADA_MS = 30_000; // Map v2.2: a painted (not cut) world's minimap picture is regenerated at most this often while the big map is closed
const IMAGEN_MS = 5000;            // the zone's picture is regenerated at most every 5 s, only while the big map is open (U14: or, in a world cut with mapa.corte, when its minimap's zone changed)
let SUELO = "#F9EBDC"; // Arena (STD-023): the map is paper; «foto» style sets the old green back (montarMapa)
const PAPEL = "#F9EBDC", TINTA = "#3A332D", TURQUESA = "1, 142, 161";
let BYN = false; // mundo-hermes: pure black-and-white palette (entorno.json `tema`); markers differ by SHAPE
/** Switch the map to the black-and-white palette (the page does it once, before the first frame, when /status says `tema: "black-and-white"`). */
export function temaMapa(byn: boolean): void { BYN = byn; SUELO = byn ? "#000" : "#F9EBDC"; }
const tinta = (c: string): string => (BYN ? "#fff" : c);
const CUARTOS = 4;                 // E4: the cut's lines go to the canvas in whole quarter pixels (see corteEnMapa)

/** Draw one marker shape centred at (x, y), half-size `s`, turned `ang` (arrows only). */
const trazos = new Map<string, Path2D[]>();
const luz = (c: string): number => { const m = /^#([0-9a-f]{6})$/i.exec(c); if (!m) return 0; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
/** Map v2.2: a kind with a house icon is a small round badge in the kind's colour with the icon in it (a paper ring around it).
 * Shape (the icon) AND colour tell kinds apart. A sleeping AI is hollow. «¡» marks something for you. Returns whether it drew. */
function insignia(g: CanvasRenderingContext2D, t: Tipo, id: string, x: number, y: number, s: number): boolean {
  if (!t.icono || typeof Path2D === "undefined") return false;
  let ps = trazos.get(t.icono);
  if (!ps) { ps = pathsIcono(t.icono).map((d) => new Path2D(d)); trazos.set(t.icono, ps); }
  if (!ps.length) return false;
  const R = s * 1.2, hueca = id === "agente-dormida", color = tinta(t.color);
  g.save(); g.translate(x, y);
  g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
  g.fillStyle = hueca ? (BYN ? "#000" : PAPEL) : BYN ? "#000" : color; g.fill();
  g.lineWidth = hueca ? 2 : 1.6; g.strokeStyle = hueca ? color : BYN ? "#fff" : PAPEL; g.stroke();
  const k = (R * 1.28) / 256;
  g.translate(-R * 0.64, -R * 0.64); g.scale(k, k);
  g.fillStyle = hueca ? color : BYN ? "#fff" : luz(t.color) > 0.6 ? TINTA : "#fff";
  for (const p of ps) g.fill(p);
  g.restore();
  if (id === "para-ti") { // «!»: a small red disc at the badge's shoulder
    g.save(); g.translate(x + R * 0.8, y - R * 0.8);
    g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.fillStyle = BYN ? "#fff" : "#D33440"; g.fill(); g.lineWidth = 1.2; g.strokeStyle = BYN ? "#000" : PAPEL; g.stroke();
    g.fillStyle = BYN ? "#000" : "#fff"; g.font = `700 ${Math.max(7, Math.round(R * 0.8))}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", 0, R * 0.04);
    g.restore();
  }
  return true;
}

/** Draw one marker shape centred at (x, y), half-size `s`, turned `ang` (arrows only). `id` = the kind's id (badges need it). */
function forma(g: CanvasRenderingContext2D, t: Tipo, x: number, y: number, s: number, ang = 0, id = ""): void {
  if (id && insignia(g, t, id, x, y, s)) return;
  g.save(); g.translate(x, y);
  g.fillStyle = tinta(t.color); g.strokeStyle = BYN ? "#000" : PAPEL; g.lineWidth = 1.5;
  g.beginPath();
  switch (t.forma) {
    case "flecha": g.rotate(ang); g.moveTo(0, -s); g.lineTo(s * 0.75, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.75, s * 0.8); g.closePath(); break;
    case "cuadrado": g.rect(-s, -s, 2 * s, 2 * s); break;
    case "rombo": g.moveTo(0, -s * 1.2); g.lineTo(s, 0); g.lineTo(0, s * 1.2); g.lineTo(-s, 0); g.closePath(); break;
    case "rombo-hueco": // ia-visible S5: a sleeping AI — the diamond's outline in its green over a pale fill
      g.moveTo(0, -s * 1.2); g.lineTo(s, 0); g.lineTo(0, s * 1.2); g.lineTo(-s, 0); g.closePath();
      g.fillStyle = BYN ? "#000" : "rgba(255,255,255,0.7)"; g.fill(); g.strokeStyle = tinta(t.color); g.lineWidth = 2; g.stroke(); g.restore(); return;
    case "hexagono": for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 - Math.PI / 2; if (i) g.lineTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2); else g.moveTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2); } g.closePath(); break; // Map v2: a zone
    case "portal": // Map v2: a door to another space — two rings
      g.arc(0, 0, s * 1.1, 0, Math.PI * 2); g.fillStyle = BYN ? "#000" : "rgba(255,255,255,0.85)"; g.fill(); g.lineWidth = 3; g.strokeStyle = tinta(t.color); g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.55, 0, Math.PI * 2); g.lineWidth = 2.5; g.stroke(); g.fillStyle = tinta(t.color); g.beginPath(); g.arc(0, 0, s * 0.18, 0, Math.PI * 2); g.fill(); g.restore(); return;
    case "pantalla": g.rect(-s * 1.3, -s * 0.85, s * 2.6, s * 1.7); g.fill(); g.stroke(); // Map v2: a screen — a wide rectangle on a stand
      g.beginPath(); g.moveTo(0, s * 0.85); g.lineTo(0, s * 1.3); g.moveTo(-s * 0.6, s * 1.3); g.lineTo(s * 0.6, s * 1.3); g.lineWidth = 2; g.stroke();
      g.fillStyle = "rgba(255,255,255,0.75)"; g.fillRect(-s * 0.9, -s * 0.5, s * 1.8, s * 1.0); g.restore(); return;
    case "libro": // Map v2: information — an open book
      g.moveTo(0, -s * 0.7); g.lineTo(-s * 1.25, -s * 0.9); g.lineTo(-s * 1.25, s * 0.8); g.lineTo(0, s * 1.0); g.lineTo(s * 1.25, s * 0.8); g.lineTo(s * 1.25, -s * 0.9); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.7); g.lineTo(0, s * 1.0); g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 1.5; g.stroke(); g.restore(); return;
    case "agenda": // Map v2: the schedule — a calendar page
      g.rect(-s, -s, 2 * s, 2 * s); g.fill(); g.stroke(); g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(-s * 0.7, -s * 0.35, s * 1.4, s * 0.25); g.fillRect(-s * 0.7, s * 0.2, s * 1.4, s * 0.25); g.fillRect(-s * 0.7, -s * 0.85, s * 1.4, s * 0.2); g.restore(); return;
    case "triangulo": g.moveTo(0, -s * 1.1); g.lineTo(s, s * 0.8); g.lineTo(-s, s * 0.8); g.closePath(); break;
    case "estrella": for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.5 : s * 1.25, a = (i * Math.PI) / 5 - Math.PI / 2; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); break;
    case "anillo": g.arc(0, 0, s, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = tinta(t.color); g.stroke(); g.beginPath(); g.arc(0, 0, s * 0.35, 0, Math.PI * 2); g.fill(); g.restore(); return;
    case "exclamacion": // U14 (4): «!» — a warm disc with the mark in ink
      g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#1d1406"; g.beginPath(); g.moveTo(-s * 0.2, -s * 0.66); g.lineTo(s * 0.2, -s * 0.66); g.lineTo(s * 0.11, s * 0.16); g.lineTo(-s * 0.11, s * 0.16); g.closePath();
      g.moveTo(s * 0.17, s * 0.45); g.arc(0, s * 0.45, s * 0.17, 0, Math.PI * 2); g.fill(); g.restore(); return;
    case "visto": // U14 (4): «✓» — a green disc with a white tick
      g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.48, s * 0.02); g.lineTo(-s * 0.12, s * 0.38); g.lineTo(s * 0.5, -s * 0.36);
      g.lineWidth = Math.max(1.5, s * 0.3); g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); g.restore(); return;
    default: g.arc(0, 0, t.forma === "punto" ? s * 0.8 : s, 0, Math.PI * 2); // people: a small dot
  }
  g.fill(); g.stroke(); g.restore();
}

/** Lines every `paso` metres, projected (they turn with the map). */
function rejilla(g: CanvasRenderingContext2D, v: Vista, paso: number): void {
  const alcance = Math.hypot(v.ancho, v.alto) / 2 / v.escala;
  if (paso * v.escala < 10) return;
  g.strokeStyle = BYN ? "rgba(255,255,255,0.35)" : `rgba(${TURQUESA},0.16)`; g.lineWidth = 1; g.beginPath(); // a faint Turquesa grid: the cyberpunk touch
  for (let k = Math.ceil((v.cx - alcance) / paso); k * paso <= v.cx + alcance; k++) { const a = proyectar(v, k * paso, v.cz - alcance), b = proyectar(v, k * paso, v.cz + alcance); g.moveTo(a.px, a.py); g.lineTo(b.px, b.py); }
  for (let k = Math.ceil((v.cz - alcance) / paso); k * paso <= v.cz + alcance; k++) { const a = proyectar(v, v.cx - alcance, k * paso), b = proyectar(v, v.cx + alcance, k * paso); g.moveTo(a.px, a.py); g.lineTo(b.px, b.py); }
  g.stroke();
}

let pintado = true; // Map v2.2: the painted look (the world's `mapa.estilo` unless «foto»), set in montarMapa
function huella(g: CanvasRenderingContext2D, v: Vista, h: Huella): void {
  const p = [proyectar(v, h.x0, h.z0), proyectar(v, h.x1, h.z0), proyectar(v, h.x1, h.z1), proyectar(v, h.x0, h.z1)];
  g.fillStyle = BYN ? "#fff" : pintado ? "#D6C6B3" : h.color; g.beginPath(); g.moveTo(p[0].px, p[0].py);
  for (let i = 1; i < 4; i++) g.lineTo(p[i].px, p[i].py);
  g.closePath(); g.fill();
  if (pintado && !BYN) { g.strokeStyle = "rgba(58,51,45,0.7)"; g.lineWidth = 1.2; g.lineJoin = "round"; g.stroke(); } // soft ink outline
}

/** U14: the zone's picture under a view (turned with the minimap), the ground's colour beyond its edge. */
function imagenEnMapa(g: CanvasRenderingContext2D, v: Vista, img: ImagenCenital): void {
  g.fillStyle = img.fondo; g.fillRect(0, 0, v.ancho, v.alto);
  g.save(); g.transform(...matrizImagen(v, img)); g.imageSmoothingEnabled = true; g.drawImage(img.canvas, 0, 0); g.restore();
}

/** U14: a floor plan's cut over the picture — walls and columns in ink with a light edge (they read on dark floors and
 * light ones), glass in pale blue; only the segments in view (a few hundred on the minimap) are drawn. */
function corteEnMapa(g: CanvasRenderingContext2D, v: Vista, img: ImagenCenital, buf: { a: Int32Array }): void {
  const ancho = Math.max(1.25, Math.min(3, v.escala * 0.2));
  const trazar = (seg: Float32Array | undefined, estilos: [string, number][]) => {
    if (!seg?.length) return;
    if (buf.a.length < seg.length) buf.a = new Int32Array(seg.length);
    // E4: whole quarter pixels under a ×¼ scale (segmentosEnVista): small integers reach the canvas without a new heap
    // number per argument; a quarter of a CSS pixel is below what a line's antialiasing shows
    const n = segmentosEnVista(v, seg, buf.a, 4, CUARTOS), a = buf.a;
    if (!n) return;
    g.save(); g.scale(1 / CUARTOS, 1 / CUARTOS);
    g.beginPath();
    for (let i = 0; i < n * 4; i += 4) { g.moveTo(a[i], a[i + 1]); g.lineTo(a[i + 2], a[i + 3]); }
    for (const [color, w] of estilos) { g.strokeStyle = color; g.lineWidth = w * CUARTOS; g.stroke(); }
    g.restore();
  };
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  trazar(img.cristal, [["rgba(150,215,255,0.85)", ancho]]);
  trazar(img.seccion, [["rgba(255,255,255,0.65)", ancho + 2], ["#17131d", ancho]]);
  g.restore();
}

/** A canvas whose backing store follows its CSS size and the device pixel ratio (capped at 2: cool phones). */
function lienzo(c: HTMLCanvasElement): { g: CanvasRenderingContext2D; ancho: number; alto: number; ajustar(): boolean } {
  const g = c.getContext("2d")!;
  const l = {
    g, ancho: 0, alto: 0,
    ajustar(): boolean {
      const dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
      if (w === l.ancho && h === l.alto && c.width === Math.round(w * dpr)) return false;
      l.ancho = w; l.alto = h; c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    },
  };
  return l;
}

const boton = (texto: string, etiqueta?: string): HTMLButtonElement => {
  const b = document.createElement("button"); b.type = "button"; b.textContent = texto;
  if (etiqueta) { b.setAttribute("aria-label", etiqueta); b.title = etiqueta; }
  return b;
};

export function montarMapa(h: HostMapa) {
  const reg = crearRegistro();
  const mundo = leerMapa(h.mundo).mapa; // Map v2: the world's declared points and decoration
  const estilo = mundo?.estilo ?? "pintado"; // Map v2.2: how the zone is drawn (default: a painted old map)
  pintado = estilo !== "foto";
  if (!pintado && !BYN) SUELO = "#b7c6ab";
  const paleta = PALETAS[estilo === "pintado-noche" ? "pintado-noche" : "pintado"], papelCss = `rgb(${paleta.papel.join(",")})`;
  const fuentes = new Map<string, Fuente>();
  let ultimos: Marcador[] = [], todos: Marcador[] = [], fallos: string[] = []; // `todos` = every marker the sources gave; `ultimos` = what the layers let show (all the maps and the list read it)
  // Map v2: the layers (legend toggles), remembered per browser
  let capas: Capas = capasActivas(null);
  try { capas = leerCapas(localStorage.getItem(CLAVE_CAPAS)); } catch { /* no storage: defaults */ }
  const refiltrar = (): void => { ultimos = filtrar(todos, capas); };
  const dibujado = { mini: {} as Record<string, number>, grande: {} as Record<string, number> };

  // ---------- where you are and where you face (the camera's yaw when the camera branch gives it; else your steps) ----------
  let yo: Vec | null = null, yawYo = 0, pasoAntes: Vec | null = null;
  function mirar(): void {
    if (h.session.entity < 0) { yo = null; return; }
    const p = h.session.selfPosition(1);
    yo = p;
    const cam = h.view.cam?.yaw?.();
    if (typeof cam === "number" && Number.isFinite(cam)) { yawYo = cam; return; }
    if (!pasoAntes) { pasoAntes = p; return; }
    const dx = p.x - pasoAntes.x, dz = p.z - pasoAntes.z;
    if (dx * dx + dz * dz > 0.04) { yawYo = yawDePaso(dx, dz); pasoAntes = p; }
  }

  // ---------- the built-in sources ----------
  let fichas: Marcador[] = [], fichasT = -Infinity, marcasAntes: unknown = null;
  const nombreDe = (id: number): string => { const n = h.otros().chat?.nombres?.get?.(id); return typeof n === "string" && n ? n : tx(`Person ${id}`, `Persona ${id}`); };
  // AGW-007/J5: the server is the one that ever adds the IA marker to a name — a client that sees it may
  // trust it. Groups AI inhabitants and organization agents apart from people on the map and its list.
  const esIA = (nombre: string): boolean => nombre.endsWith(MARCA_IA);
  fuentes.set("tu", () => (yo ? [{ id: "tu", tipo: "tu", nombre: h.session.who?.nombre ?? tx("You", "Tú"), x: yo.x, z: yo.z, yaw: yawYo }] : []));
  fuentes.set("gente", () => h.session.remotePositions().map((r) => { const nombre = nombreDe(r.id); return { id: `p${r.id}`, tipo: esIA(nombre) ? (h.otros().ia?.de?.(r.id)?.estado === "dormida" ? "agente-dormida" : "agente") : "persona", nombre, x: r.x, z: r.z }; })); // ia-visible S5: a sleeping AI is drawn hollow (features/ia says its state)
  // U14 (4): a person or a quest thing the server marks for you is drawn as «!» or «✓» (misiones.marcaDe), and a
  // person's trade goes next to the name in the list (misiones.oficioDe); re-read at once when the marks change.
  // E4: the cards are rebuilt only when something they come from changed — the shared state (`stateVersion`), the
  // catalog, the misiones contract or its marks — at most once a second; before, every second (3,6 MB / 10 s in a
  // template with 226 things, and nothing had moved). A page without `stateVersion` keeps the old once-a-second.
  let fichasV: unknown = NaN, fichasCat: unknown = null, fichasMis: unknown = null;
  fuentes.set("fichas", () => {
    const ahora = performance.now(), mis = h.otros().misiones, mk = mis?.marcas?.(), fs = h.session.features;
    const v = fs.stateVersion ?? ahora, cambio = v !== fichasV || fs.catalog !== fichasCat || mis !== fichasMis;
    if ((cambio && ahora - fichasT >= FICHAS_MS) || mk !== marcasAntes) {
      fichasT = ahora; marcasAntes = mk; fichasV = v; fichasCat = fs.catalog; fichasMis = mis;
      fichas = [];
      for (const c of h.session.features.cards()) {
        if (!c.at) continue;
        const marca = mis?.marcaDe?.(c.feature, c.key), oficio = c.feature === "pnj" ? mis?.oficioDe?.(c.key) : "";
        // Map v2: what is only furniture or decoration goes to its own (quiet) layer: seats; characters the world declares as background (unless they have something for you)
        const capa = c.feature === "asiento" ? "asientos" : c.feature === "pnj" && !marca && esDecorativo(mundo?.ocultar.pnj, c.key) ? "decorativos" : undefined;
        fichas.push({ id: `c:${c.feature}:${c.key}`, ...(capa ? { capa } : {}), tipo: marca === "!" ? "para-ti" : marca === "✓" ? "hecho" : reg.tipoDeRol(c.role), nombre: oficio ? `${c.name} (${oficio})` : c.name, x: c.at.x, z: c.at.z, ...(c.description ? { detalle: c.description } : {}) });
      }
    }
    return fichas;
  });
  // Map v2: the world's declared points of interest (not inferred from objects)
  const puntos = (mundo?.puntos ?? []).map(marcadorDePunto);
  fuentes.set("interes", () => puntos);
  // misiones (another branch): `objetivos()` → [{ mision, paso, nombre, x, z }]; absent = no objectives
  fuentes.set("misiones", () => {
    const o = (h.otros().misiones?.senalados ?? h.otros().misiones?.objetivos)?.(); // P3: a quest with pistas:false is not on the map
    if (!Array.isArray(o)) return [];
    return o.map((m: { mision?: unknown; paso?: unknown; nombre?: unknown; x?: unknown; z?: unknown }) => ({ id: `m:${String(m.mision)}:${String(m.paso)}`, tipo: "objetivo", nombre: String(m.nombre ?? tx("Objective", "Objetivo")), x: Number(m.x), z: Number(m.z), detalle: tx(`Quest: ${String(m.mision ?? "")}`, `Misión: ${String(m.mision ?? "")}`) }));
  });
  let destino: { id: string; nombre: string; x: number; z: number; baliza: number; lejos: boolean } | null = null;
  fuentes.set("destino", () => (destino ? [{ id: "destino", tipo: "destino", nombre: destino.nombre, x: destino.x, z: destino.z }] : []));
  const alBordeDe = (tipo: string) => reg.tipo(tipo).alBorde;
  // E4: one array kept between draws (the minimap sorts five times a second while you walk); sort is stable, as before
  const ordenados: Marcador[] = [], porOrdenDe = (a: Marcador, b: Marcador) => reg.tipo(a.tipo).orden - reg.tipo(b.tipo).orden;
  const porOrden = (ms: readonly Marcador[]): Marcador[] => { ordenados.length = 0; for (const m of ms) ordenados.push(m); return ordenados.sort(porOrdenDe); };
  const flechas = new WeakMap<Tipo, Tipo>(); // a kind pinned to the minimap's edge is drawn as its arrow (one copy per kind)
  const comoFlecha = (t: Tipo): Tipo => { let f = flechas.get(t); if (!f) flechas.set(t, (f = { ...t, forma: "flecha", icono: undefined })); return f; };

  // ---------- the waypoint ----------
  const limMini = crearLimitador(PASO_MS), limGrande = crearLimitador(PASO_MS);
  // C2: «Ir» remembers where you were so «Volver» takes you back (the server still spaces trips by a few seconds)
  let origenViaje: (Vec & { nombre: string }) | null = null;
  function irA(m: { id: string; nombre: string; x: number; z: number }): void {
    if (!h.teletransporte?.activo()) return;
    if (yo) origenViaje = { x: yo.x, z: yo.z, nombre: tx("where you were", "donde estabas") };
    h.andar?.parar(); // a trip by teleport replaces a walk
    h.teletransporte.ir(m.x, m.z, m.nombre);
    h.alIr?.({ id: m.id, nombre: m.nombre, x: m.x, z: m.z });
    pintarDetalle();
  }
  // MIS-257: «Ir» — the avatar walks to the point over the ground (the page feeds the stick; walls stop it, a hand on the
  // controls stops it). The point is marked as the destination too (a column of light and a marker on both maps), the
  // big map closes so you see yourself go, and every ending says why in a notice (an arrival is said by quitarDestino).
  const decir = anunciar; // the notice shows at the top (paneles.ts) and is read aloud
  function irAndando(m: { id: string; nombre: string; x: number; z: number }): boolean {
    if (!h.andar) return false;
    const r = h.andar.ir({ x: m.x, z: m.z, nombre: m.nombre });
    if (!r.ok) { decir(frase(r.motivo, m.nombre)); return false; }
    if (!destino || destino.id !== m.id) marcarDestino(m);
    decir(frase("empieza", m.nombre));
    if (panel.abierto) panel.cerrar(); // the big map is a modal dialog: close it so you see yourself walk
    pintarDetalle();
    return true;
  }
  /** The page tells the map a walk ended (the words were already said): an arrival clears the marker it was walking to. */
  function andandoTermino(f: Fin): void {
    if (f.motivo === "llegada" && destino && destino.x === f.destino.x && destino.z === f.destino.z) quitarDestino(null);
    pintarDetalle();
  }
  function volver(): boolean {
    if (!origenViaje || !h.teletransporte?.activo()) return false;
    const o = origenViaje; origenViaje = null;
    h.teletransporte.ir(o.x, o.z, o.nombre);
    pintarDetalle();
    return true;
  }
  function marcarDestino(m: { id: string; nombre: string; x: number; z: number }): void {
    if (destino && destino.id === m.id) { quitarDestino("quitado"); return; }
    quitarDestino(null);
    const texto = tx(`Destination: ${m.nombre}`, `Destino: ${m.nombre}`);
    let baliza = -1;
    if (h.view.waypoint) baliza = h.view.waypoint(m.x, m.z, texto); else h.view.beacon(m.x, m.z, texto, 10 * 60_000);
    const d = yo ? Math.hypot(m.x - yo.x, m.z - yo.z) : Infinity;
    destino = { id: m.id, nombre: m.nombre, x: m.x, z: m.z, baliza, lejos: d > LLEGADA_M + 2 };
    anunciar(tx(`Destination set: ${m.nombre}, ${yo ? enPalabras(m.x - yo.x, m.z - yo.z) : ""}.`, `Destino marcado: ${m.nombre}, ${yo ? enPalabras(m.x - yo.x, m.z - yo.z) : ""}.`));
    cambio();
  }
  function quitarDestino(motivo: "quitado" | "llegada" | null): void {
    if (!destino) return;
    if (destino.baliza >= 0) h.view.dropWaypoint?.(destino.baliza);
    const n = destino.nombre;
    destino = null;
    if (motivo === "quitado") anunciar(tx(`Destination cleared: ${n}.`, `Destino quitado: ${n}.`));
    if (motivo === "llegada") anunciar(tx(`You have arrived: ${n}.`, `Has llegado: ${n}.`));
    cambio();
  }
  function cambio(): void { limMini.forzar(); limGrande.forzar(); listaT = -Infinity; pintarDetalle(); }

  // ---------- minimap (corner) ----------
  const mini = document.createElement("section");
  mini.id = "minimapa"; ligar(mini, "aria-label", "Minimap", "Minimapa");
  const miniCanvas = document.createElement("canvas"); miniCanvas.setAttribute("aria-hidden", "true");
  const miniTexto = document.createElement("p"); miniTexto.className = "solo-lector"; miniTexto.id = "minimapa-texto";
  // ux2-barra: the minimap IS the button of the big map (M): no «−», «+», «Mapa», «Ficha» under it (MIS-257: and the N is the compass button on its rim). The wheel over it
  // zooms; turning with the camera is a setting (Ajustes › Interfaz, interfaz.minimapaGira); the sheet is your card (I).
  const bMapa = document.createElement("button"); bMapa.type = "button"; bMapa.id = "minimapa-abrir";
  alCambiarIdioma(() => { bMapa.title = tx(`${tituloDe("mapa")} · wheel: zoom in and out`, `${tituloDe("mapa")} · rueda: acercar y alejar`); bMapa.setAttribute("aria-label", tituloDe("mapa")); }); // v2 paridad: the name is the list's
  bMapa.append(miniCanvas);
  // MIS-257: the north is a button, not a letter painted on the canvas: it rides just inside the rim where north is (up, or swinging
  // round when the minimap turns with the camera) and pressing it puts the minimap back: centred on you, north up,
  // the usual radius. Phosphor «compass» (house icons); on a phone the folded minimap has no buttons (movil.css).
  const caja = document.createElement("div"); caja.className = "caja";
  const bNorte = document.createElement("button"); bNorte.type = "button"; bNorte.className = "norte"; bNorte.id = "minimapa-norte";
  bNorte.innerHTML = icono("compass", 16); ligar(bNorte, "aria-label", "North up: centre the minimap on you", "Norte arriba: centrar el minimapa en ti"); ligar(bNorte, "title", "North up · centre the minimap on you", "Norte arriba · centrar el minimapa en ti");
  // Map v2.2: the filter is a panel apart, opened by a small magnifying glass on the minimap's lower-left rim (and one on the big map)
  const bFiltroMini = document.createElement("button"); bFiltroMini.type = "button"; bFiltroMini.className = "filtro-boton"; bFiltroMini.id = "minimapa-filtro";
  bFiltroMini.innerHTML = icono("magnifying-glass", 16); ligar(bFiltroMini, "aria-label", "Filter the map: what to show", "Filtrar el mapa: qué mostrar"); ligar(bFiltroMini, "title", "Filter the map: what to show", "Filtrar el mapa: qué mostrar");
  bFiltroMini.setAttribute("aria-haspopup", "dialog"); bFiltroMini.setAttribute("aria-controls", "mapa-filtro");
  caja.append(bMapa, bNorte, bFiltroMini);
  mini.append(caja, miniTexto);
  document.body.appendChild(mini);
  // a touch here is not the walking joystick; a mouse click leaves no focus behind (Space must jump, not open the map)
  mini.addEventListener("pointerdown", (e) => e.stopPropagation());
  bMapa.addEventListener("click", (e) => { if (e.detail > 0) bMapa.blur(); });
  const lm = lienzo(miniCanvas);
  let zoom = ZOOM_INICIAL, gira = false, recentrados = 0;
  const ponerZoom = (i: number) => { const z = Math.max(0, Math.min(RADIOS.length - 1, i)); if (z !== zoom) { zoom = z; limMini.forzar(); textoT = -Infinity; } };
  // the wheel over the minimap: away = farther (a bigger radius), toward you = closer; one notch, one step; never the camera's zoom
  let ruedaT = 0;
  mini.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.deltaY || e.timeStamp - ruedaT < 120) return; // a trackpad sends dozens of tiny events: one step per gesture beat
    ruedaT = e.timeStamp;
    ponerZoom(zoom + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  const ponerGiro = (si: boolean) => { if (si === gira) return; gira = si; limMini.forzar(); textoT = -Infinity; };
  /** The north button: centred on you, north up, the usual radius. Says so for screen readers, and redraws at once. */
  function recentrarMini(): void {
    ponerZoom(ZOOM_INICIAL); ponerGiro(false); recentrados++; limMini.forzar(); textoT = -Infinity;
    anunciar(tx("Minimap centred on you, north up.", "Minimapa centrado en ti, norte arriba."));
  }
  bNorte.addEventListener("click", (e) => { recentrarMini(); if (e.detail > 0) bNorte.blur(); });
  bFiltroMini.addEventListener("click", (e) => { abrirFiltro(bFiltroMini); if (e.detail > 0) bFiltroMini.blur(); });
  // on touch screens the features' buttons live in the bottom-right corner: sit to their left
  const acciones = document.getElementById("acciones");
  const sitio = () => { if (!esTactil()) return; /* U3: on a mouse screen the frame table places the map */ mini.style.right = acciones && acciones.childElementCount ? `${acciones.offsetWidth + 20}px` : ""; };
  if (acciones && typeof ResizeObserver === "function") new ResizeObserver(sitio).observe(acciones);
  sitio();

  let huellas: Huella[] = [], huellasBajas: Huella[] = [], huellasV = NaN, corte = 0;
  let imagen: ImagenCenital | null = null, imagenV = NaN, imagenT = -Infinity, generando = false, imagenes = 0, vCambioT = -Infinity, pedidaT = NaN;
  const bufMini = { a: new Int32Array(0) }, bufGrande = { a: new Int32Array(0) };
  // ---------- Map v2.2: the painted zone. The render (`imagen`) is only the input; `prep` = its soft masks (once per picture);
  // `capaMini` = the whole picture painted once (the minimap's background); `capa` = the window the big map is looking at,
  // painted at the screen's own resolution and repainted (debounced) when the view moves away from it: never a stretched bitmap.
  let prep: Preparado | null = null, prepDe: ImagenCenital | null = null, capaMini: (ImagenCenital & { canvas: HTMLCanvasElement }) | null = null;
  let capa: { canvas: HTMLCanvasElement; x0: number; z0: number; x1: number; z1: number; escala: number } | null = null, capaT = 0, capaPintadas = 0;
  const mobil = h.view.power.mobile;
  const lienzoNuevo = (w: number, hh: number): HTMLCanvasElement => { const c = document.createElement("canvas"); c.width = w; c.height = hh; return c; };
  const aCanvas = (px: Uint8ClampedArray, w: number, hh: number, c?: HTMLCanvasElement): HTMLCanvasElement => { const cv = c && c.width === w && c.height === hh ? c : lienzoNuevo(w, hh); cv.getContext("2d")!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, hh), 0, 0); return cv; };
  function prepararPintado(): void {
    if (!pintado || !imagen || prepDe === imagen) return;
    prep = preparar(imagen.rgba, imagen.px, leerFondo(imagen.fondo)); prepDe = imagen; capa = null;
    const S = mobil ? 640 : 1024; // the minimap's bitmap: it is shown small, one whole-zone painting is plenty
    capaMini = { ...imagen, fondo: papelCss, px: S, canvas: aCanvas(pintarVentana(prep, { u0: 0, v0: 0, u1: imagen.px, v1: imagen.px }, S, S, paleta, 1.1), S, S) };
    limMini.forzar(); limGrande.forzar();
  }
  /** Paint the window the big map sees (plus an eighth around it) at the screen's resolution. */
  function pintarCapa(): void {
    if (!prep || !imagen) return;
    const dpr = Math.min(2, devicePixelRatio || 1), vis = { x0: gv.cx - gv.ancho / 2 / gv.escala, z0: gv.cz - gv.alto / 2 / gv.escala, x1: gv.cx + gv.ancho / 2 / gv.escala, z1: gv.cz + gv.alto / 2 / gv.escala };
    const w = ventanaDeVista(imagen, vis, gv.escala, dpr, mobil ? 900 : 1600);
    const salida = w.w / (w.mundo.x1 - w.mundo.x0); // output px per metre
    const px = pintarVentana(prep, w.ventana, w.w, w.h, paleta, 1.1 * Math.min(1.5, Math.max(0.8, dpr)));
    capa = { canvas: aCanvas(px, w.w, w.h, capa?.canvas), ...w.mundo, escala: salida / dpr }; capaPintadas++;
  }
  /** The painted window covers the view and is not much smaller/bigger than the screen needs. */
  const capaVale = (): boolean => {
    if (!capa) return false;
    const x0 = gv.cx - gv.ancho / 2 / gv.escala, x1 = gv.cx + gv.ancho / 2 / gv.escala, z0 = gv.cz - gv.alto / 2 / gv.escala, z1 = gv.cz + gv.alto / 2 / gv.escala, r = capa.escala / gv.escala;
    return x0 >= capa.x0 && x1 <= capa.x1 && z0 >= capa.z0 && z1 <= capa.z1 && r > 0.6 && r < 1.7;
  };
  const vistaMini = (): Vista => {
    const t = lm.ancho;
    return { cx: yo!.x, cz: yo!.z, escala: (t / 2 - 4) / RADIOS[zoom], giro: gira ? yawYo : 0, ancho: t, alto: t };
  };
  function pintarMini(v: Vista, ms: Marcador[]): void {
    const g = lm.g, t = lm.ancho, c = t / 2, r = c - 2;
    if (t < 8) return; // U20: hidden by the density dial (Mínimo) it has no size: draw nothing (and no negative radius)
    g.clearRect(0, 0, t, t);
    g.save(); g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.clip();
    if (pintado && capaMini && imagen) { // Map v2.2: the painted zone (one cached bitmap of the whole picture), the cut's lines over it
      imagenEnMapa(g, v, capaMini);
      rejilla(g, v, 10);
      if (corte > 0 && imagen.corte > 0) corteEnMapa(g, v, imagen, bufMini);
    } else if (corte > 0 && imagen && imagen.corte > 0) { // U14: the floor plan (picture + cut) instead of footprints
      imagenEnMapa(g, v, imagen);
      rejilla(g, v, 10);
      corteEnMapa(g, v, imagen, bufMini);
    } else {
      g.fillStyle = SUELO; g.fillRect(0, 0, t, t);
      rejilla(g, v, 10);
      for (const hu of corte > 0 ? huellasBajas : huellas) huella(g, v, hu);
    }
    const vistos: Record<string, number> = {}, cg = Math.cos(v.giro), sg = Math.sin(v.giro);
    for (const m of porOrden(ms)) {
      const ti = reg.tipo(m.tipo);
      // E4: proyectar and alBorde inlined (no two objects per marker and draw)
      const dx = m.x - v.cx, dz = m.z - v.cz;
      let px = c + (dx * cg - dz * sg) * v.escala, py = c + (dx * sg + dz * cg) * v.escala;
      const rb = r - ti.tam - 2, ex = px - c, ey = py - c, d = Math.hypot(ex, ey), fuera = d > rb;
      let dibujo = ti, ang = m.tipo === "tu" ? anguloFlecha(v.giro, m.yaw ?? 0) : 0;
      if (fuera) {
        if (!ti.alBorde) continue;
        px = c + (ex / d) * rb; py = c + (ey / d) * rb; ang = anguloBorde(px, py, c, c); dibujo = comoFlecha(ti); // GPS-style: point the way, not just a pinned dot
      }
      forma(g, dibujo, px, py, fuera ? ti.tam * 0.8 : ti.tam, ang, fuera ? "" : m.tipo);
      vistos[m.tipo] = (vistos[m.tipo] ?? 0) + 1;
    }
    g.restore();
    g.strokeStyle = BYN ? "#fff" : pintado ? "rgba(58,51,45,0.9)" : "rgba(20,24,30,0.85)"; g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    const n = puntoNorte(v.giro, c, r - 10); // the north button sits just inside the rim where north is (never over the clock above) (a CSS transform: no layout)
    bNorte.style.transform = `translate(${n.x.toFixed(1)}px, ${n.y.toFixed(1)}px) translate(-50%, -50%)`;
    dibujado.mini = vistos;
  }

  // the minimap's text twin (read in browse mode; not a live region: it never interrupts)
  let textoT = -Infinity, textoAntes = "";
  function textoMini(ms: Marcador[]): void {
    if (!yo) return;
    const n = contar(ms), partes: string[] = [];
    for (const [id, ti] of reg.tipos()) if (n[id] && ti.enLista) partes.push(`${n[id]} ${ti.nombre.toLowerCase()}`);
    const cerca = cercanos(ms, yo, reg, 3).map((e) => `${e.nombre} (${reg.tipo(e.tipo).nombre.toLowerCase()}), ${e.texto}`);
    const t = tx(`Minimap, ${gira ? "turns with the camera" : "north up"}, ${RADIOS[zoom]} m around: ${partes.join(", ") || "nothing near"}.`, `Minimapa, ${gira ? "gira con la cámara" : "norte arriba"}, ${RADIOS[zoom]} m alrededor: ${partes.join(", ") || "nada cerca"}.`) +
      (cerca.length ? tx(` Nearest: ${cerca.join("; ")}.`, ` Lo más cerca: ${cerca.join("; ")}.`) : "") + (destino ? tx(` Destination: ${destino.nombre}, ${enPalabras(destino.x - yo.x, destino.z - yo.z)}.`, ` Destino: ${destino.nombre}, ${enPalabras(destino.x - yo.x, destino.z - yo.z)}.`) : "") + (esMovil(perfil().clase) ? tx(" Tap the minimap to see where you are and the list.", " Toca el minimapa para ver dónde estás y la lista.") : tx(" Press M to see where you are and the list.", " Pulsa M para ver dónde estás y la lista."));
    if (t !== textoAntes) { miniTexto.textContent = t; textoAntes = t; }
  }

  // ---------- big map (dialog) ----------
  const panel = crearDialogo({ id: "mapa-grande", titulo: () => tituloDe("mapa").replace(/ \(\w+\)$/, ""), tecla: "KeyM", accion: "mapa", boton: bMapa, alAbrir: () => abrirGrande(), alCerrar: () => { arrastre.clear(); } });
  const zonaLienzo = document.createElement("div"); zonaLienzo.className = "lienzo";
  const gCanvas = document.createElement("canvas"); gCanvas.tabIndex = 0;
  gCanvas.setAttribute("role", "img");
  ligar(gCanvas, "aria-label", "The area seen from above, north up. Arrow keys: move the view; + and −: zoom in and out; 0: centre on you. The same information is in the list.", "La zona vista desde arriba, norte arriba. Flechas: mover la vista; + y −: acercar y alejar; 0: centrar en ti. La misma información está en la lista.");
  const controles = document.createElement("div"); controles.className = "controles";
  const gMas = boton("+", ""), gMenos = boton("−", ""), gCentro = boton("◎", "");
  ligar(gMas, "aria-label", "Zoom in", "Acercar la vista"); ligar(gMas, "title", "Zoom in", "Acercar la vista"); ligar(gMenos, "aria-label", "Zoom out", "Alejar la vista"); ligar(gMenos, "title", "Zoom out", "Alejar la vista"); ligar(gCentro, "aria-label", "Centre the view on you", "Centrarte en la vista"); ligar(gCentro, "title", "Centre the view on you", "Centrarte en la vista");
  const gFiltro = boton("", ""); gFiltro.className = "filtro-boton"; ligar(gFiltro, "aria-label", "Filter the map: what to show", "Filtrar el mapa: qué mostrar"); ligar(gFiltro, "title", "Filter the map: what to show", "Filtrar el mapa: qué mostrar"); gFiltro.innerHTML = icono("magnifying-glass", 18); gFiltro.setAttribute("aria-haspopup", "dialog"); gFiltro.setAttribute("aria-controls", "mapa-filtro");
  controles.append(gFiltro, gMas, gMenos, gCentro);
  const estadoImagen = document.createElement("p"); estadoImagen.className = "estado-imagen";
  zonaLienzo.append(gCanvas, controles, estadoImagen);
  const lado = document.createElement("aside");
  const detalle = document.createElement("section"); detalle.className = "detalle"; detalle.setAttribute("aria-live", "polite"); ligar(detalle, "aria-label", "Details", "Detalle");
  const buscar = document.createElement("input"); buscar.type = "search"; buscar.id = "mapa-buscar"; buscar.placeholder = tr("mapa.buscar"); buscar.setAttribute("aria-label", `${tr("mapa.buscar")} ${tr("mapa.lista.todo")}`);
  const hLista = document.createElement("h3"); hLista.id = "mapa-lista-titulo"; hLista.textContent = tr("mapa.lista"); hLista.tabIndex = -1;
  buscar.addEventListener("input", () => { listaT = -Infinity; pintarLista(); });
  const lista = document.createElement("ul"); lista.id = "mapa-lista"; lista.setAttribute("aria-labelledby", hLista.id);
  lado.append(detalle, hLista, buscar, lista); // Map v2.2: the switches are not here any more: the filter is a panel apart (the magnifying glass)
  panel.cuerpo.append(zonaLienzo, lado);
  const lg = lienzo(gCanvas);
  const gv: Vista = { cx: 0, cz: 0, escala: 3, giro: 0, ancho: 1, alto: 1 };
  let elegido: { id: string; nombre: string; tipo: string; x: number; z: number; detalle?: string } | null = null;
  let pedido = 0;
  const pedir = () => { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; pintarGrande(); }); };

  function abrirGrande(): void {
    lg.ajustar();
    if (yo) { gv.cx = yo.x; gv.cz = yo.z; }
    gv.escala = Math.min(lg.ancho, lg.alto) / 90;
    // Map v2: with declared places the map opens on all of them (you included), not on your feet
    const pts = [...puntos, ...(yo ? [yo] : [])], fit = puntos.length ? encuadre(pts, lg.ancho, lg.alto, 56, 0.8, 6) : null;
    if (fit) { gv.cx = fit.cx; gv.cz = fit.cz; gv.escala = fit.escala; }
    listaT = -Infinity; limGrande.forzar();
    void generarImagen(true);
    pintarGrande(); pintarLista(); pintarDetalle();
  }
  async function generarImagen(alAbrir: boolean): Promise<void> {
    const v = h.view.cenitalVersion?.() ?? 0, ahora = performance.now();
    if (!h.view.cenital || generando || (imagen && v === imagenV) || (!alAbrir && ahora - imagenT < IMAGEN_MS)) return;
    generando = true; imagenT = ahora;
    estadoImagen.textContent = tx("Drawing the area from above…", "Dibujando la zona desde arriba…");
    try {
      const img = await h.view.cenital({ px: h.view.power.mobile ? 256 : 512, incluir: yo ?? undefined });
      imagen = img; imagenV = v; imagenes++;
      estadoImagen.textContent = "";
      prepararPintado();
      limMini.forzar(); limGrande.forzar();
      if (panel.abierto) pedir(); // a picture made for the minimap (U14) does not redraw a closed big map
    } catch (e) { estadoImagen.textContent = tx(`Could not draw the area: ${String((e as Error)?.message ?? e).slice(0, 80)}`, `No se pudo dibujar la zona: ${String((e as Error)?.message ?? e).slice(0, 80)}`); }
    finally { generando = false; }
  }
  function pintarGrande(): void {
    lg.ajustar();
    gv.ancho = lg.ancho; gv.alto = lg.alto;
    const g = lg.g;
    g.fillStyle = pintado ? SUELO : imagen?.fondo ?? SUELO; g.fillRect(0, 0, lg.ancho, lg.alto); // the ground goes on beyond the picture
    if (imagen && pintado && prep) { // Map v2.2: the painted window; stale for a moment while you drag or zoom, then repainted sharp
      if (!capa) pintarCapa();
      else if (!capaVale()) { window.clearTimeout(capaT); capaT = window.setTimeout(() => { capaT = 0; if (panel.abierto) { pintarCapa(); pedir(); } }, 140) as unknown as number; }
      if (capa) { const a = proyectar(gv, capa.x0, capa.z0), b = proyectar(gv, capa.x1, capa.z1); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(capa.canvas, a.px, a.py, b.px - a.px, b.py - a.py); }
    } else if (imagen) {
      const a = proyectar(gv, imagen.x0, imagen.z0), b = proyectar(gv, imagen.x1, imagen.z1);
      g.imageSmoothingEnabled = true; g.drawImage(imagen.canvas, a.px, a.py, b.px - a.px, b.py - a.py);
    } else {
      for (const hu of corte > 0 ? huellasBajas : huellas) huella(g, gv, hu); // U14: no giant box of a building taller than the cut
    }
    rejilla(g, gv, gv.escala >= 4 ? 10 : 50);
    if (imagen && imagen.corte > 0) corteEnMapa(g, gv, imagen, bufGrande); // U14: the floor plan's walls and columns
    const vistos: Record<string, number> = {};
    const k = Math.min(1.8, Math.max(1.1, gv.escala / 4));
    for (const m of porOrden(ultimos)) {
      const ti = reg.tipo(m.tipo), p = proyectar(gv, m.x, m.z);
      if (p.px < -20 || p.py < -20 || p.px > gv.ancho + 20 || p.py > gv.alto + 20) continue;
      forma(g, ti, p.px, p.py, ti.tam * k, m.tipo === "tu" ? anguloFlecha(0, m.yaw ?? 0) : 0, m.tipo);
      vistos[m.tipo] = (vistos[m.tipo] ?? 0) + 1;
    }
    etiquetasInteres(g);
    if (elegido) { const p = proyectar(gv, elegido.x, elegido.z); g.strokeStyle = BYN ? "#fff" : pintado ? `rgb(${TURQUESA})` : "#ffd27a"; g.lineWidth = 3; g.beginPath(); g.arc(p.px, p.py, 17, 0, Math.PI * 2); g.stroke(); }
    // scale bar: 10 m (or 50 m when far)
    const m10 = gv.escala >= 4 ? 10 : 50, w = m10 * gv.escala;
    if (pintado && !BYN) { // an ink scale bar with end ticks, haloed in paper
      g.save(); g.lineCap = "butt"; g.lineJoin = "round";
      const trazoEscala = (): void => { g.beginPath(); g.moveTo(14, gv.alto - 22); g.lineTo(14, gv.alto - 14); g.lineTo(14 + w, gv.alto - 14); g.lineTo(14 + w, gv.alto - 22); };
      g.strokeStyle = "rgba(249,235,220,0.9)"; g.lineWidth = 5; trazoEscala(); g.stroke(); g.strokeStyle = TINTA; g.lineWidth = 1.8; trazoEscala(); g.stroke();
      g.font = "italic 600 12px Georgia, 'Times New Roman', serif"; g.textAlign = "left"; g.textBaseline = "middle"; g.strokeStyle = "rgba(249,235,220,0.9)"; g.lineWidth = 4; g.strokeText(`${m10} m`, w + 20, gv.alto - 16); g.fillStyle = TINTA; g.fillText(`${m10} m`, w + 20, gv.alto - 16);
      g.restore();
    } else {
      g.fillStyle = BYN ? "#000" : "rgba(20,24,30,0.75)"; g.fillRect(10, gv.alto - 26, w + 40, 18);
      g.fillStyle = BYN ? "#fff" : "#ffd27a"; g.fillRect(14, gv.alto - 18, w, 3);
      g.fillStyle = BYN ? "#fff" : "#eef2f6"; g.font = "11px system-ui, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(`${m10} m`, w + 18, gv.alto - 17);
    }
    dibujado.grande = vistos;
  }

  /** Map v2: the names of the places, WoW style: a zone's name large over its marker, the other places' names small under theirs. */
  function etiquetasInteres(g: CanvasRenderingContext2D): void {
    g.textAlign = "center"; g.lineJoin = "round";
    const k = Math.min(1.8, Math.max(1.1, gv.escala / 4));
    const zonaT = tipoDePunto("zona");
    for (const m of [...ultimos.filter((x) => x.tipo !== zonaT), ...ultimos.filter((x) => x.tipo === zonaT)]) { // zone names last: they win where labels meet
      if (!m.tipo.startsWith("poi-")) continue;
      const p = proyectar(gv, m.x, m.z);
      if (p.px < -80 || p.py < -20 || p.px > gv.ancho + 80 || p.py > gv.alto + 20) continue;
      const zona = m.tipo === tipoDePunto("zona"), ti = reg.tipo(m.tipo), r = ti.tam * k;
      if (!zona && gv.escala < 1.2) continue;
      const tipo = pintado && !BYN; // lettered like an old map: a zone in large spaced serif capitals, the rest in small italic; paper halo
      const nombre = tipo && zona ? m.nombre.toUpperCase() : m.nombre;
      g.font = tipo ? (zona ? `600 ${Math.round(Math.max(16, Math.min(34, 10 + gv.escala * 3.2)))}px Georgia, "Times New Roman", serif` : `italic 600 12px Georgia, "Times New Roman", serif`)
        : zona ? `700 ${Math.round(Math.max(14, Math.min(22, 9 + gv.escala * 2)))}px system-ui, sans-serif` : "600 11px system-ui, sans-serif";
      (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = tipo && zona ? "0.16em" : "0px";
      g.textBaseline = zona ? "bottom" : "top";
      const y = zona ? p.py - r - 3 : p.py + r + 3;
      g.lineWidth = zona ? 6 : 4; g.strokeStyle = BYN ? "#000" : tipo ? "rgba(249,235,220,0.92)" : "rgba(14,18,28,0.88)"; g.strokeText(nombre, p.px, y);
      g.fillStyle = BYN ? "#fff" : tipo ? TINTA : zona ? "#ffe9a8" : "#ffffff"; g.fillText(nombre, p.px, y);
      (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
    }
  }

  // details of what you picked (a marker, or a point of the map) with «Marcar destino»
  function pintarDetalle(): void {
    detalle.replaceChildren();
    if (origenViaje && h.teletransporte) {
      const v = boton("", tx("Back to where you were", "Volver a donde estabas")); v.className = "ic volver"; v.innerHTML = icono("arrow-u-up-left", 18);
      v.disabled = !h.teletransporte.activo();
      v.addEventListener("click", () => volver());
      detalle.append(v);
    }
    if (!elegido) { const p = document.createElement("p"); p.textContent = tx("Pick something on the view or in the list to see its details and set it as your destination.", "Elige algo en la vista o en la lista para ver su detalle y marcarlo como destino."); detalle.append(p); return; }
    const t = document.createElement("h3"); t.textContent = elegido.nombre;
    const p = document.createElement("p");
    p.textContent = `${reg.tipo(elegido.tipo).nombre}${yo ? ` · ${enPalabras(elegido.x - yo.x, elegido.z - yo.z)}` : ""}${elegido.detalle ? ` · ${elegido.detalle}` : ""}`;
    const es = destino?.id === elegido.id;
    const b = boton(es ? tx("Clear destination", tx("Remove destination", "Quitar destino")) : tx("Set destination", "Marcar destino"));
    const e = elegido;
    b.addEventListener("click", () => marcarDestino(e));
    detalle.append(t, p, b);
    if (h.andar) { // MIS-257: «Ir» walks there by itself
      const a = boton(tx("Go", "Ir"), tx(`Walk to ${e.nombre}`, `Ir andando a ${e.nombre}`)); a.className = "andar";
      a.addEventListener("click", () => { irAndando(e); });
      detalle.append(a);
    }
    if (h.puedeEditar?.(e) && h.alEditar) { // MIS-240: a thing of the world, and you may build: open it in the builder
      const ed = boton(tx("Edit this object", "Editar este objeto"), tx(`Open ${e.nombre} in Build`, `Abrir ${e.nombre} en Construir`)); ed.className = "editar";
      ed.addEventListener("click", () => { if (h.alEditar!(e) && panel.abierto) panel.cerrar(); });
      detalle.append(ed);
    }
    if (h.teletransporte) { // U27 (MVL1): pick a site, press «Ir de golpe», appear there (the server decides; same in VR)
      const activo = h.teletransporte.activo();
      const g = boton(activo ? tx("Jump there", "Ir de golpe") : tx("Jump there (off in this world)", "Ir de golpe (apagado en este mundo)"));
      g.disabled = !activo;
      g.addEventListener("click", () => irA(e));
      detalle.append(g);
    }
  }
  function elegir(m: typeof elegido, centrar = false): void {
    elegido = m;
    if (m && centrar) { gv.cx = m.x; gv.cz = m.z; }
    pintarDetalle(); pedir();
    const ia = quienDeAgente(m); if (ia !== null) h.alAgente?.(ia);
  }

  // the HTML twin: nearest first, real buttons; rows are updated in place (focus never jumps), reordered only when
  // focus is outside the list
  let listaT = -Infinity;
  const filas = new Map<string, { li: HTMLLIElement; ver: HTMLButtonElement; marcar: HTMLButtonElement; ir: HTMLButtonElement; andar: HTMLButtonElement; e: Entrada }>();
  function pintarLista(): void {
    if (!yo) return;
    // the waypoint is listed only when it is a point of the map (a marker that is the destination already says so)
    const real = destino && todos.some((m) => m.id === destino!.id) ? "destino" : "";
    const q = buscar.value.trim().toLowerCase();
    const entradas = cercanos((q ? todos : ultimos).filter((m) => m.id !== real), yo, reg, LISTA_MAX).filter((e) => !q || `${e.nombre} ${reg.tipo(e.tipo).nombre}`.toLowerCase().includes(q)).map((e) => (e.id === "destino" && destino ? { ...e, id: destino.id } : e));
    const vivos = new Set(entradas.map((e) => e.id));
    const foco = lista.contains(document.activeElement);
    for (const [id, f] of filas) if (!vivos.has(id)) { if (f.li.contains(document.activeElement)) hLista.focus(); f.li.remove(); filas.delete(id); }
    for (const e of entradas) {
      let f = filas.get(e.id);
      if (!f) {
        const li = document.createElement("li"), ver = boton(""), marcar = boton(""), ir = boton(""), andar = boton("");
        ver.className = "ver"; marcar.className = "marcar ic"; ir.className = "ir ic"; andar.className = "andar ic";
        marcar.innerHTML = icono("map-pin", 18); ir.innerHTML = icono("crosshair", 18); andar.innerHTML = icono("person-simple-walk", 18);
        f = { li, ver, marcar, ir, andar, e };
        const fx = f;
        ver.addEventListener("click", () => elegir({ id: fx.e.id, nombre: fx.e.nombre, tipo: fx.e.tipo, x: fx.e.x, z: fx.e.z, detalle: fx.e.detalle }, true));
        marcar.addEventListener("click", () => marcarDestino(fx.e));
        li.append(ver); if (h.andar) li.append(andar); if (h.teletransporte) li.append(ir); li.append(marcar);
        ir.addEventListener("click", () => irA(fx.e));
        andar.addEventListener("click", () => { irAndando(fx.e); });
        li.dataset.id = e.id;
        lista.appendChild(li); filas.set(e.id, f);
      }
      f.e = e;
      const texto = `${e.nombre} · ${reg.tipo(e.tipo).nombre.toLowerCase()} · ${e.texto}`;
      if (f.ver.textContent !== texto) f.ver.textContent = texto;
      const es = destino?.id === e.id, mt = es ? tx("Clear destination", tx("Remove destination", "Quitar destino")) : tx("Set destination", "Marcar destino"), ml = `${mt}: ${e.nombre}`;
      if (f.marcar.getAttribute("aria-label") !== ml) { f.marcar.setAttribute("aria-label", ml); f.marcar.title = mt; }
      if (h.andar) {
        const al = tx(`Walk to ${e.nombre}`, `Ir andando a ${e.nombre}`);
        if (f.andar.getAttribute("aria-label") !== al) { f.andar.setAttribute("aria-label", al); f.andar.title = al; }
      }
      if (h.teletransporte) {
        const activo = h.teletransporte.activo(), il = activo ? tx(`Jump to ${e.nombre}`, `Ir de golpe a ${e.nombre}`) : tx("Jump there (off in this world)", "Ir de golpe (apagado en este mundo)");
        if (f.ir.getAttribute("aria-label") !== il) { f.ir.setAttribute("aria-label", il); f.ir.title = il; }
        f.ir.disabled = !activo;
      }
    }
    if (!foco) for (const e of entradas) lista.appendChild(filas.get(e.id)!.li); // nearest first (moving rows only when focus is elsewhere)
    if (!entradas.length && !lista.childElementCount) { const li = document.createElement("li"); li.textContent = q ? tx("Nothing with that name.", "Nada con ese nombre.") : tr("mapa.nada"); li.dataset.id = ""; lista.appendChild(li); }
    else for (const li of [...lista.children] as HTMLElement[]) if (li.dataset.id === "") li.remove();
  }
  // Map v2.2: the filter — ONE list in a panel apart (like an MMO's «Tracking»): a single column grouped by kind, each group a heading
  // with its switch and its count and, under it, what there is of that kind (a click shows it on the map; the pin sets it as destination).
  // The choice is remembered per browser. The same filter drives the minimap, the big map and the big map's list.
  function ponerCapa(id: string, si: boolean): void {
    if (capas[id] === si) return;
    capas = { ...capas, [id]: si };
    try { localStorage.setItem(CLAVE_CAPAS, textoCapas(capas)); } catch { /* private mode: it lasts until you leave */ }
    refiltrar(); limMini.forzar(); limGrande.forzar(); textoT = -Infinity; listaT = -Infinity;
    pedir(); pintarLista(); pintarFiltro();
  }
  const filtro = document.createElement("dialog"); filtro.id = "mapa-filtro"; filtro.className = "panel-j5"; filtro.setAttribute("aria-labelledby", "mapa-filtro-titulo");
  {
    const cab = document.createElement("header"), h2 = document.createElement("h2"), x = boton("", tr("mapa.filtro.cerrar")); h2.id = "mapa-filtro-titulo"; h2.textContent = tr("mapa.filtro");
    x.className = "cerrar"; x.innerHTML = icono("x", 18); x.addEventListener("click", () => filtro.close()); cab.append(h2, x);
    const cuerpo = document.createElement("div"); cuerpo.className = "cuerpo";
    const ayuda = document.createElement("p"); ayuda.className = "nota"; ayuda.textContent = tr("mapa.filtro.ayuda");
    const ul = document.createElement("ul"); ul.className = "filtro"; ul.setAttribute("aria-labelledby", h2.id);
    cuerpo.append(ayuda, ul); filtro.append(cab, cuerpo); document.body.appendChild(filtro);
    for (const t of ["pointerdown", "wheel", "keydown"]) filtro.addEventListener(t, (e) => e.stopPropagation()); // a panel's touches and keys are its own (the browser still closes it on Escape)
  }
  const listaFiltro = filtro.querySelector("ul.filtro") as HTMLUListElement;
  let filtroFirma = "", filtroVolver: Element | null = null;
  const insigniaHtml = (tipo: string): string => {
    const ti = reg.tipo(tipo), c = tinta(ti.color);
    return ti.icono && icono(ti.icono, 14) ? `<span class="insignia" style="background:${c};color:${BYN ? "#fff" : luz(ti.color) > 0.6 ? TINTA : "#fff"}">${icono(ti.icono, 14)}</span>` : `<span class="punto" style="background:${c}"></span>`; // people: a dot
  };
  function pintarFiltro(): void {
    const grupos = agrupar(todos, capas);
    const firma = JSON.stringify(grupos.map((g) => [g.id, g.activa, g.items.map((m) => [m.id, m.nombre, m.tipo, destino?.id === m.id])]));
    if (firma === filtroFirma) return;
    filtroFirma = firma;
    const antes = document.activeElement instanceof HTMLElement && listaFiltro.contains(document.activeElement) ? document.activeElement.dataset.foco ?? "" : "";
    listaFiltro.replaceChildren();
    if (!grupos.length) { const li = document.createElement("li"); li.className = "vacio"; li.textContent = tr("mapa.filtro.vacio"); listaFiltro.append(li); return; }
    for (const g of grupos) {
      const li = document.createElement("li"), cab = document.createElement("label"), cb = document.createElement("input"), nom = document.createElement("span"), cuenta = document.createElement("span");
      li.className = "grupo"; li.dataset.capa = g.id; li.dataset.activa = String(g.activa);
      cb.type = "checkbox"; cb.checked = g.activa; cb.dataset.capa = g.id; cb.dataset.foco = `capa:${g.id}`;
      const nombreCapa = tr(`mapa.capa.${g.id}`);
      cb.setAttribute("aria-label", tr("mapa.filtro.mostrar").replace("{tipo}", nombreCapa));
      cb.addEventListener("change", () => ponerCapa(g.id, cb.checked));
      nom.className = "nombre"; nom.textContent = nombreCapa; cuenta.className = "cuenta"; cuenta.textContent = String(g.total);
      cab.className = "cabeza"; cab.append(cb, nom, cuenta); li.append(cab);
      if (g.activa) { // a switched-off group is collapsed: only its heading and its count
        const ul = document.createElement("ul"); ul.className = "items";
        for (const m of g.items) {
          const fila = document.createElement("li"), ver = boton(""), fijar = boton("");
          ver.className = "ver"; ver.dataset.foco = `ver:${m.id}`; ver.innerHTML = insigniaHtml(m.tipo); const rotulo = document.createElement("span"); rotulo.textContent = m.nombre; ver.append(rotulo);
          ver.addEventListener("click", () => irAlPunto(m));
          fijar.className = "fijar ic"; fijar.dataset.foco = `fijar:${m.id}`; fijar.innerHTML = icono("push-pin", 16);
          const es = destino?.id === m.id, et = es ? tx("Remove destination", "Quitar destino") : tr("mapa.filtro.fijar").replace("{nombre}", m.nombre); fijar.setAttribute("aria-label", et); fijar.title = et; fijar.setAttribute("aria-pressed", String(es));
          fijar.addEventListener("click", () => { marcarDestino(m); });
          fila.append(ver, fijar); ul.append(fila);
        }
        li.append(ul);
      }
      listaFiltro.append(li);
    }
    if (antes) [...listaFiltro.querySelectorAll<HTMLElement>("[data-foco]")].find((e) => e.dataset.foco === antes)?.focus({ preventScroll: true }); // a rebuild keeps your place
  }
  /** A click in the list: show it on the big map (opening it if need be), centred and picked. */
  function irAlPunto(m: Marcador): void {
    filtro.close();
    if (!panel.abierto) panel.abrir();
    elegir({ id: m.id === "destino" && destino ? destino.id : m.id, nombre: m.nombre, tipo: m.tipo, x: m.x, z: m.z, detalle: m.detalle }, true);
    gv.escala = Math.max(gv.escala, 3); pedir();
  }
  function abrirFiltro(desde?: Element | null): void {
    if (filtro.open) return;
    filtroVolver = desde ?? document.activeElement; filtroFirma = ""; pintarFiltro();
    filtro.showModal();
  }
  filtro.addEventListener("close", () => { const v = filtroVolver; filtroVolver = null; if (v instanceof HTMLElement && v.isConnected) v.focus({ preventScroll: true }); });
  gFiltro.addEventListener("click", () => abrirFiltro(gFiltro));

  // pan (drag), zoom (wheel, pinch, buttons, keys), pick (click or tap)
  const arrastre = new Map<number, { x: number; y: number }>();
  let movido = 0, pinza = 0;
  const punto = (e: PointerEvent | WheelEvent) => { const r = gCanvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
  // QA 2026-11-11 (Pablo): the farthest zoom-out is the one where the whole space fits on screen, never smaller
  function escalaMinima(): number {
    const caja = imagen && Number.isFinite(imagen.x0) && imagen.x1 > imagen.x0 && imagen.z1 > imagen.z0
      ? [{ x: imagen.x0, z: imagen.z0 }, { x: imagen.x1, z: imagen.z1 }]
      : [...puntos, ...(yo ? [yo] : [])];
    const fit = caja.length ? encuadre(caja, gv.ancho, gv.alto, 24, 0.05, 40) : null;
    return fit ? Math.max(0.05, fit.escala) : 0.3;
  }
  function zoomEn(factor: number, px = gv.ancho / 2, py = gv.alto / 2): void {
    const w = desproyectar(gv, px, py);
    gv.escala = Math.min(40, Math.max(escalaMinima(), gv.escala * factor));
    gv.cx = w.x - (px - gv.ancho / 2) / gv.escala; gv.cz = w.z - (py - gv.alto / 2) / gv.escala;
    pedir();
  }
  gCanvas.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    gCanvas.setPointerCapture(e.pointerId);
    arrastre.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (arrastre.size === 1) movido = 0;
    if (arrastre.size === 2) { const [a, b] = [...arrastre.values()]; pinza = Math.hypot(a.x - b.x, a.y - b.y); movido = 99; }
  });
  gCanvas.addEventListener("pointermove", (e) => {
    const antes = arrastre.get(e.pointerId);
    if (!antes) return;
    e.stopPropagation();
    if (arrastre.size === 1) {
      const dx = e.clientX - antes.x, dy = e.clientY - antes.y;
      movido += Math.abs(dx) + Math.abs(dy);
      gv.cx -= dx / gv.escala; gv.cz -= dy / gv.escala;
      arrastre.set(e.pointerId, { x: e.clientX, y: e.clientY }); pedir();
    } else if (arrastre.size === 2) {
      arrastre.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...arrastre.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = gCanvas.getBoundingClientRect();
      if (pinza > 0 && d > 0) zoomEn(d / pinza, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinza = d;
    }
  });
  const soltar = (e: PointerEvent) => {
    if (!arrastre.has(e.pointerId)) return;
    arrastre.delete(e.pointerId);
    if (arrastre.size === 0 && movido < 6 && e.type === "pointerup") {
      const p = punto(e);
      let mejor: Marcador | null = null, d2 = 16 * 16;
      for (const m of ultimos) {
        if (m.tipo === "tu") continue;
        const q = proyectar(gv, m.x, m.z), d = (q.px - p.px) ** 2 + (q.py - p.py) ** 2;
        if (d < d2) { d2 = d; mejor = m; }
      }
      if (mejor) elegir({ id: mejor.id === "destino" && destino ? destino.id : mejor.id, nombre: mejor.nombre, tipo: mejor.tipo, x: mejor.x, z: mejor.z, detalle: mejor.detalle });
      else { const w = desproyectar(gv, p.px, p.py), x = Math.round(w.x * 10) / 10, z = Math.round(w.z * 10) / 10; elegir({ id: `punto:${x},${z}`, nombre: tx("Chosen point", "Punto elegido"), tipo: "lugar", x, z }); }
    }
    if (arrastre.size < 2) pinza = 0;
  };
  gCanvas.addEventListener("pointerup", soltar); gCanvas.addEventListener("pointercancel", soltar);
  gCanvas.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); const p = punto(e); zoomEn(Math.exp(-(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * 0.0015), p.px, p.py); }, { passive: false });
  gCanvas.addEventListener("keydown", (e) => {
    const paso = 80 / gv.escala, centrar = () => { if (yo) { gv.cx = yo.x; gv.cz = yo.z; } };
    // arrows by position, + − 0 by the character (a Spanish keyboard has «+» where others have «]»)
    const k: Record<string, () => void> = {
      ArrowLeft: () => { gv.cx -= paso; }, ArrowRight: () => { gv.cx += paso; }, ArrowUp: () => { gv.cz -= paso; }, ArrowDown: () => { gv.cz += paso; },
      "+": () => zoomEn(1.25), "-": () => zoomEn(0.8), "0": centrar, Home: centrar,
    };
    const f = k[e.code] ?? (e.key.length === 1 ? k[e.key] : undefined);
    if (!f) return;
    e.preventDefault(); e.stopPropagation(); f(); pedir(); // the map's keys never walk you nor move the camera
  });
  gMas.addEventListener("click", () => zoomEn(1.25));
  gMenos.addEventListener("click", () => zoomEn(0.8));
  gCentro.addEventListener("click", () => { if (yo) { gv.cx = yo.x; gv.cz = yo.z; pedir(); } });
  if (typeof ResizeObserver === "function") new ResizeObserver(() => { if (panel.abierto && lg.ajustar()) pedir(); }).observe(zonaLienzo);

  // ---------- the clock: 5 looks per second; draws only what changed ----------
  let vueltas = 0, ocultas = 0;
  setInterval(() => {
    const xr = h.view.vr.active || h.view.ar.state !== "off";
    if (mini.hidden !== xr) mini.hidden = xr; // hidden in XR (a wrist panel comes later)
    if (xr || document.hidden) { ocultas++; return; }
    mirar();
    if (!yo) return;
    vueltas++;
    const ahora = performance.now();
    const r = reunir(fuentes); todos = r.marcadores; fallos = r.fallos; refiltrar();
    if (destino) {
      const d = Math.hypot(destino.x - yo.x, destino.z - yo.z);
      destino.lejos ||= d > LLEGADA_M + 2;
      if (destino.lejos && d < LLEGADA_M) quitarDestino("llegada");
    }
    const v = h.view.cenitalVersion?.() ?? 0, c = h.view.mapaCorte?.() ?? 0;
    if (v !== huellasV || c !== corte) {
      if (c !== corte) imagenV = NaN; // U14: another cut is another picture
      huellasV = v; corte = c; huellas = h.view.huellas?.() ?? []; huellasBajas = bajoElCorte(huellas, corte); vCambioT = ahora;
      limMini.forzar(); limGrande.forzar();
    }
    // U14: a cut world's minimap shows the zone's picture: made the first time, then only when the zone changed (at
    // most every IMAGEN_MS). Never in XR: this clock returns above while it lasts. E4: and only once the zone has stood
    // still for ESTABLE_MS (or waited ESPERA_MAX_MS): reading the picture back waits for the GPU (≈0,2-0,4 s of a
    // frozen page in software GL), and while the models arrive the zone changes every look — the TRG26 template made
    // two pictures on entering, the first without its models; now one.
    // Map v2.2: a painted world's minimap wants the picture too (not only a cut world's): made once the zone stands still, then
    // again when it changed, but not more than every IMAGEN_PINTADA_MS while the big map is closed (cool phones)
    if ((corte > 0 || (pintado && (!imagen || ahora - imagenT >= IMAGEN_PINTADA_MS))) && v !== imagenV) {
      if (Number.isNaN(pedidaT)) pedidaT = ahora;
      if (ahora - vCambioT >= ESTABLE_MS || ahora - pedidaT >= ESPERA_MAX_MS) { pedidaT = NaN; void generarImagen(false); }
    }
    if (lm.ajustar()) limMini.forzar();
    const vm = vistaMini();
    if (limMini.debe(ahora, `${firma(vm, ultimos, alBordeDe)}|${huellasV}|${imagenes}`)) pintarMini(vm, ultimos);
    if (ahora - textoT >= TEXTO_MS) { textoT = ahora; textoMini(ultimos); }
    if (filtro.open) pintarFiltro(); // the filter list follows the world while it is open (it rebuilds only when its content changed)
    if (panel.abierto) {
      if (limGrande.debe(ahora, `${firma(gv, ultimos, alBordeDe)}|${huellasV}|${imagenes}`)) pintarGrande();
      if (ahora - listaT >= LISTA_MS) { listaT = ahora; pintarLista(); }
      if (v !== imagenV && corte <= 0) void generarImagen(false);
    }
  }, PASO_MS);

  return {
    registro: reg,
    /** Add or change a kind of marker (an adventure's own). */
    registrar: (id: string, t: Parameters<typeof reg.registrar>[1]): void => { reg.registrar(id, t); fichasV = NaN; limMini.forzar(); limGrande.forzar(); },
    /** Draw cards of a role as a kind (E4: the cards are re-read: they are no longer rebuilt every second). */
    rol: (role: string, tipo: string): void => { reg.rol(role, tipo); fichasV = NaN; limMini.forzar(); limGrande.forzar(); },
    /** Add (or replace) a source of markers: a function returning [{ id, tipo, nombre, x, z, detalle? }]. */
    fuente(id: string, f: Fuente): void { fuentes.set(id, f); limMini.forzar(); },
    quitarFuente(id: string): void { fuentes.delete(id); limMini.forzar(); },
    /** What the map knows right now (for checks and agents): markers, counts by kind, sources that failed. */
    marcadores: (): readonly Marcador[] => ultimos,
    contar: () => contar(ultimos),
    /** Map v2: counts by kind of everything the sources gave, shown or not; and the layers (switch one: the maps and the list follow at once). */
    contarTodos: () => contar(todos),
    capas: { estado: (): Capas => ({ ...capas }), poner: (id: string, si: boolean): void => ponerCapa(id, si), ids: (): string[] => CAPAS.map((c) => c.id) },
    fallos: () => fallos,
    /** Counts by kind at the last draw of each map, and how often each drew (redraw rate). */
    dibujado: () => ({ mini: { ...dibujado.mini }, grande: { ...dibujado.grande } }),
    stats: () => ({ mini: limMini.stats, grande: limGrande.stats, imagenes, vueltas, ocultas, corte }),
    /** C2: go back to where you were before the last «Ir» (false when there is nowhere to go back to). */
    volver, puedeVolver: () => origenViaje !== null,
    /** MIS-257: walk to a marker (or a place of your own) by yourself, as the map's «Ir» does; false when it cannot start. */
    irAndando, andandoTermino,
    /** Rediseño v2 (the VR menu's «Mapa»): go to a marker as the map's own «Ir» does, and whether trips are allowed now. */
    ir: (m: { id: string; nombre: string; x: number; z: number }): void => irA(m), puedeIr: (): boolean => !!h.teletransporte?.activo(),
    abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), abierto: () => panel.abierto,
    /** The zone's picture: how it was made, what it cost, whether it has something in it (U14: where it was cut and how
     * many segments the cut gave). */
    imagen: () => (imagen ? { modo: imagen.modo, ms: imagen.ms, partes: imagen.partes, px: imagen.px, conCosas: imagen.conCosas, x0: imagen.x0, z0: imagen.z0, x1: imagen.x1, z1: imagen.z1, error: imagen.error,
      corte: imagen.corte, seccion: (imagen.seccion?.length ?? 0) / 4, cristal: (imagen.cristal?.length ?? 0) / 4 } : null),
    /** The colour of the zone's picture at a world point ([r, g, b] 0-255), for checks (north must be up). */
    muestra(x: number, z: number): number[] | null {
      if (!imagen) return null;
      const px = Math.floor(((x - imagen.x0) / (imagen.x1 - imagen.x0)) * imagen.px), py = Math.floor(((z - imagen.z0) / (imagen.z1 - imagen.z0)) * imagen.px);
      if (px < 0 || py < 0 || px >= imagen.px || py >= imagen.px) return null;
      const i = (py * imagen.px + px) * 4;
      return [imagen.rgba[i], imagen.rgba[i + 1], imagen.rgba[i + 2]];
    },
    destino: () => (destino ? { id: destino.id, nombre: destino.nombre, x: destino.x, z: destino.z } : null),
    /** Mark a marker (by id) as your destination; again = clear it. N13: or a place of your own ({ id, nombre, x, z }):
     * a photo's link leads you to where the photo was made. */
    marcarDestino(id: string | { id: string; nombre: string; x: number; z: number }): boolean {
      const m = typeof id === "string" ? todos.find((x) => x.id === id) : id;
      if (!m) return false; marcarDestino(m); return true;
    },
    quitarDestino: () => quitarDestino("quitado"),
    /** ux2-barra: the minimap's own state (zoom = index into the radii; gira = turns with the camera) and its controls. */
    minimapa: { girar(si: boolean) { ponerGiro(si); }, zoom(i: number) { ponerZoom(i); }, recentrar: recentrarMini, estado: () => ({ zoom, gira, radio: RADIOS[zoom], recentrados }) },
  };
}
