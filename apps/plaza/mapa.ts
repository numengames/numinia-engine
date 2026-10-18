// The map (J5): a corner minimap and a big map (key M, «Mapa» button) over the zone seen from above, with waypoints
// («Marcar destino»: a column of light in the world and a marker on both maps) and an HTML twin: every marker is also
// a line of text (name, kind, distance and direction in words) with real buttons, for keyboards, screen readers and
// agents. Phones stay cool: the minimap is a 2D canvas redrawn only when what it shows changed, at most 5 times a
// second, and it never keeps the 3D page drawing (view.busy() does not know it exists).
// Markers come from sources (you, the people this page receives, the features' cards with `at`, the misiones contract,
// the waypoint, an adventure's own) and look as their kind says in a registry (packages/client/src/mapa.ts). Both are
// open: `__numinia.mapa.registrar(...)`, `.rol(...)`, `.fuente(...)`. Recipe: docs/entregas/mapa.md.
// U14: a world whose environment says `mapa.corte` (m) is drawn as a floor plan on both maps: the zone's picture cut at
// that height (view.cenital) as the minimap's background too, and the cut's walls and columns as lines over it. The
// picture is made when the minimap first needs it, then again only when the zone changes (at most every IMAGEN_MS),
// never in XR (this clock stops there); until it exists, the minimap draws only what stands under the cut.
import { proyectar, desproyectar, anguloFlecha, anguloBorde, yawDePaso, alBorde, enPalabras, crearLimitador, crearRegistro, reunir, contar, cercanos, firma, matrizImagen, segmentosEnVista } from "../../packages/client/src/mapa.ts";
import type { Vista, Marcador, Tipo, Fuente, Entrada } from "../../packages/client/src/mapa.ts";
import type { ImagenCenital, Huella } from "../../packages/render/src/index.ts";
import { bajoElCorte } from "../../packages/render/src/corte.ts";
import { MARCA_IA } from "../../packages/instance/src/identidad.ts";
import { crearDialogo, anunciar } from "./paneles.ts";
import "./mapa.css";

type Vec = { x: number; z: number };
type Ficha = { feature: string; key: string; role: string; name: string; description?: string; at?: Vec };
export type HostMapa = {
  session: { entity: number; selfPosition(alpha: number): Vec; remotePositions(): { id: number; x: number; z: number }[]; features: { cards(): Ficha[] }; who: { id: string; nombre: string } | null };
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
};

const PASO_MS = 200;               // the minimap looks 5 times a second; it draws only when the picture changed
const FICHAS_MS = 1000;            // the features' cards are re-read once a second (things rarely move)
const TEXTO_MS = 2000;             // the minimap's text twin, at most every 2 s
const LISTA_MS = 1000;             // the big map's list, at most once a second while open
const RADIOS = [15, 30, 60, 120];  // minimap zoom: metres from the centre to the edge
const LLEGADA_M = 2.5;             // a waypoint this close is reached (and cleared, with a notice)
const IMAGEN_MS = 5000;            // the zone's picture is regenerated at most every 5 s, only while the big map is open (U14: or, in a world cut with mapa.corte, when its minimap's zone changed)
const SUELO = "#b7c6ab";

/** Draw one marker shape centred at (x, y), half-size `s`, turned `ang` (arrows only). */
function forma(g: CanvasRenderingContext2D, t: Tipo, x: number, y: number, s: number, ang = 0): void {
  g.save(); g.translate(x, y);
  g.fillStyle = t.color; g.strokeStyle = "#fff"; g.lineWidth = 1.5;
  g.beginPath();
  switch (t.forma) {
    case "flecha": g.rotate(ang); g.moveTo(0, -s); g.lineTo(s * 0.75, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.75, s * 0.8); g.closePath(); break;
    case "cuadrado": g.rect(-s, -s, 2 * s, 2 * s); break;
    case "rombo": g.moveTo(0, -s * 1.2); g.lineTo(s, 0); g.lineTo(0, s * 1.2); g.lineTo(-s, 0); g.closePath(); break;
    case "triangulo": g.moveTo(0, -s * 1.1); g.lineTo(s, s * 0.8); g.lineTo(-s, s * 0.8); g.closePath(); break;
    case "estrella": for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.5 : s * 1.25, a = (i * Math.PI) / 5 - Math.PI / 2; if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); break;
    case "anillo": g.arc(0, 0, s, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = t.color; g.stroke(); g.beginPath(); g.arc(0, 0, s * 0.35, 0, Math.PI * 2); g.fill(); g.restore(); return;
    case "exclamacion": // U14 (4): «!» — a warm disc with the mark in ink
      g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = "#1d1406"; g.beginPath(); g.moveTo(-s * 0.2, -s * 0.66); g.lineTo(s * 0.2, -s * 0.66); g.lineTo(s * 0.11, s * 0.16); g.lineTo(-s * 0.11, s * 0.16); g.closePath();
      g.moveTo(s * 0.17, s * 0.45); g.arc(0, s * 0.45, s * 0.17, 0, Math.PI * 2); g.fill(); g.restore(); return;
    case "visto": // U14 (4): «✓» — a green disc with a white tick
      g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.48, s * 0.02); g.lineTo(-s * 0.12, s * 0.38); g.lineTo(s * 0.5, -s * 0.36);
      g.lineWidth = Math.max(1.5, s * 0.3); g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); g.restore(); return;
    default: g.arc(0, 0, s, 0, Math.PI * 2);
  }
  g.fill(); g.stroke(); g.restore();
}

/** Lines every `paso` metres, projected (they turn with the map). */
function rejilla(g: CanvasRenderingContext2D, v: Vista, paso: number): void {
  const alcance = Math.hypot(v.ancho, v.alto) / 2 / v.escala;
  if (paso * v.escala < 10) return;
  g.strokeStyle = "rgba(55,70,50,0.2)"; g.lineWidth = 1; g.beginPath();
  for (let k = Math.ceil((v.cx - alcance) / paso); k * paso <= v.cx + alcance; k++) { const a = proyectar(v, k * paso, v.cz - alcance), b = proyectar(v, k * paso, v.cz + alcance); g.moveTo(a.px, a.py); g.lineTo(b.px, b.py); }
  for (let k = Math.ceil((v.cz - alcance) / paso); k * paso <= v.cz + alcance; k++) { const a = proyectar(v, v.cx - alcance, k * paso), b = proyectar(v, v.cx + alcance, k * paso); g.moveTo(a.px, a.py); g.lineTo(b.px, b.py); }
  g.stroke();
}

function huella(g: CanvasRenderingContext2D, v: Vista, h: Huella): void {
  const p = [proyectar(v, h.x0, h.z0), proyectar(v, h.x1, h.z0), proyectar(v, h.x1, h.z1), proyectar(v, h.x0, h.z1)];
  g.fillStyle = h.color; g.beginPath(); g.moveTo(p[0].px, p[0].py);
  for (let i = 1; i < 4; i++) g.lineTo(p[i].px, p[i].py);
  g.closePath(); g.fill();
}

/** U14: the zone's picture under a view (turned with the minimap), the ground's colour beyond its edge. */
function imagenEnMapa(g: CanvasRenderingContext2D, v: Vista, img: ImagenCenital): void {
  g.fillStyle = img.fondo; g.fillRect(0, 0, v.ancho, v.alto);
  g.save(); g.transform(...matrizImagen(v, img)); g.imageSmoothingEnabled = true; g.drawImage(img.canvas, 0, 0); g.restore();
}

/** U14: a floor plan's cut over the picture — walls and columns in ink with a light edge (they read on dark floors and
 * light ones), glass in pale blue; only the segments in view (a few hundred on the minimap) are drawn. */
function corteEnMapa(g: CanvasRenderingContext2D, v: Vista, img: ImagenCenital, buf: { a: Float32Array }): void {
  const ancho = Math.max(1.25, Math.min(3, v.escala * 0.2));
  const trazar = (seg: Float32Array | undefined, estilos: [string, number][]) => {
    if (!seg?.length) return;
    if (buf.a.length < seg.length) buf.a = new Float32Array(seg.length);
    const n = segmentosEnVista(v, seg, buf.a), a = buf.a;
    if (!n) return;
    g.beginPath();
    for (let i = 0; i < n * 4; i += 4) { g.moveTo(a[i], a[i + 1]); g.lineTo(a[i + 2], a[i + 3]); }
    for (const [color, w] of estilos) { g.strokeStyle = color; g.lineWidth = w; g.stroke(); }
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
  const fuentes = new Map<string, Fuente>();
  let ultimos: Marcador[] = [], fallos: string[] = [];
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
  const nombreDe = (id: number): string => { const n = h.otros().chat?.nombres?.get?.(id); return typeof n === "string" && n ? n : `Persona ${id}`; };
  // AGW-007/J5: the server is the one that ever adds the IA marker to a name — a client that sees it may
  // trust it. Groups AI inhabitants and organization agents apart from people on the map and its list.
  const esIA = (nombre: string): boolean => nombre.endsWith(MARCA_IA);
  fuentes.set("tu", () => (yo ? [{ id: "tu", tipo: "tu", nombre: h.session.who?.nombre ?? "Tú", x: yo.x, z: yo.z, yaw: yawYo }] : []));
  fuentes.set("gente", () => h.session.remotePositions().map((r) => { const nombre = nombreDe(r.id); return { id: `p${r.id}`, tipo: esIA(nombre) ? "agente" : "persona", nombre, x: r.x, z: r.z }; }));
  // U14 (4): a person or a quest thing the server marks for you is drawn as «!» or «✓» (misiones.marcaDe), and a
  // person's trade goes next to the name in the list (misiones.oficioDe); re-read at once when the marks change
  fuentes.set("fichas", () => {
    const ahora = performance.now(), mis = h.otros().misiones, mk = mis?.marcas?.();
    if (ahora - fichasT >= FICHAS_MS || mk !== marcasAntes) {
      fichasT = ahora; marcasAntes = mk;
      fichas = [];
      for (const c of h.session.features.cards()) {
        if (!c.at) continue;
        const marca = mis?.marcaDe?.(c.feature, c.key), oficio = c.feature === "pnj" ? mis?.oficioDe?.(c.key) : "";
        fichas.push({ id: `c:${c.feature}:${c.key}`, tipo: marca === "!" ? "para-ti" : marca === "✓" ? "hecho" : reg.tipoDeRol(c.role), nombre: oficio ? `${c.name} (${oficio})` : c.name, x: c.at.x, z: c.at.z, ...(c.description ? { detalle: c.description } : {}) });
      }
    }
    return fichas;
  });
  // misiones (another branch): `objetivos()` → [{ mision, paso, nombre, x, z }]; absent = no objectives
  fuentes.set("misiones", () => {
    const o = h.otros().misiones?.objetivos?.();
    if (!Array.isArray(o)) return [];
    return o.map((m: { mision?: unknown; paso?: unknown; nombre?: unknown; x?: unknown; z?: unknown }) => ({ id: `m:${String(m.mision)}:${String(m.paso)}`, tipo: "objetivo", nombre: String(m.nombre ?? "Objetivo"), x: Number(m.x), z: Number(m.z), detalle: `Misión: ${String(m.mision ?? "")}` }));
  });
  let destino: { id: string; nombre: string; x: number; z: number; baliza: number; lejos: boolean } | null = null;
  fuentes.set("destino", () => (destino ? [{ id: "destino", tipo: "destino", nombre: destino.nombre, x: destino.x, z: destino.z }] : []));
  const alBordeDe = (tipo: string) => reg.tipo(tipo).alBorde;
  const porOrden = (ms: Marcador[]) => [...ms].sort((a, b) => reg.tipo(a.tipo).orden - reg.tipo(b.tipo).orden);

  // ---------- the waypoint ----------
  const limMini = crearLimitador(PASO_MS), limGrande = crearLimitador(PASO_MS);
  function marcarDestino(m: { id: string; nombre: string; x: number; z: number }): void {
    if (destino && destino.id === m.id) { quitarDestino("quitado"); return; }
    quitarDestino(null);
    const texto = `Destino: ${m.nombre}`;
    let baliza = -1;
    if (h.view.waypoint) baliza = h.view.waypoint(m.x, m.z, texto); else h.view.beacon(m.x, m.z, texto, 10 * 60_000);
    const d = yo ? Math.hypot(m.x - yo.x, m.z - yo.z) : Infinity;
    destino = { id: m.id, nombre: m.nombre, x: m.x, z: m.z, baliza, lejos: d > LLEGADA_M + 2 };
    anunciar(`Destino marcado: ${m.nombre}, ${yo ? enPalabras(m.x - yo.x, m.z - yo.z) : ""}.`);
    cambio();
  }
  function quitarDestino(motivo: "quitado" | "llegada" | null): void {
    if (!destino) return;
    if (destino.baliza >= 0) h.view.dropWaypoint?.(destino.baliza);
    const n = destino.nombre;
    destino = null;
    if (motivo === "quitado") anunciar(`Destino quitado: ${n}.`);
    if (motivo === "llegada") anunciar(`Has llegado: ${n}.`);
    cambio();
  }
  function cambio(): void { limMini.forzar(); limGrande.forzar(); listaT = -Infinity; pintarDetalle(); }

  // ---------- minimap (corner) ----------
  const mini = document.createElement("section");
  mini.id = "minimapa"; mini.setAttribute("aria-label", "Minimapa");
  const miniCanvas = document.createElement("canvas"); miniCanvas.setAttribute("aria-hidden", "true");
  const miniTexto = document.createElement("p"); miniTexto.className = "solo-lector"; miniTexto.id = "minimapa-texto";
  const fila = document.createElement("div"); fila.className = "botones";
  const bMenos = boton("−", "Alejar el minimapa"), bMas = boton("+", "Acercar el minimapa"), bGiro = boton("N", "Girar el minimapa con la cámara");
  bGiro.setAttribute("aria-pressed", "false");
  const bMapa = boton("Mapa"), bFicha = boton("Ficha");
  bMapa.title = "Mapa de la zona (M)"; bFicha.title = "Tu ficha (I)";
  fila.append(bMenos, bMas, bGiro, bMapa, bFicha);
  mini.append(miniCanvas, miniTexto, fila);
  document.body.appendChild(mini);
  // a touch here is not the walking joystick; a mouse click leaves no focus behind (Space must jump, not press «+»)
  mini.addEventListener("pointerdown", (e) => e.stopPropagation());
  fila.addEventListener("click", (e) => { if ((e as MouseEvent).detail > 0) (e.target as HTMLElement).blur?.(); });
  miniCanvas.addEventListener("click", () => panel.abrir());
  const lm = lienzo(miniCanvas);
  let zoom = 1, gira = false;
  bMenos.addEventListener("click", () => { zoom = Math.min(RADIOS.length - 1, zoom + 1); limMini.forzar(); });
  bMas.addEventListener("click", () => { zoom = Math.max(0, zoom - 1); limMini.forzar(); });
  bGiro.addEventListener("click", () => {
    gira = !gira;
    bGiro.setAttribute("aria-pressed", String(gira)); bGiro.textContent = gira ? "⟳" : "N";
    limMini.forzar(); textoT = -Infinity;
  });
  // on touch screens the features' buttons live in the bottom-right corner: sit to their left
  const acciones = document.getElementById("acciones");
  const sitio = () => { mini.style.right = acciones && acciones.childElementCount ? `${acciones.offsetWidth + 20}px` : ""; };
  if (acciones && typeof ResizeObserver === "function") new ResizeObserver(sitio).observe(acciones);
  sitio();

  let huellas: Huella[] = [], huellasBajas: Huella[] = [], huellasV = NaN, corte = 0;
  let imagen: ImagenCenital | null = null, imagenV = NaN, imagenT = -Infinity, generando = false, imagenes = 0;
  const bufMini = { a: new Float32Array(0) }, bufGrande = { a: new Float32Array(0) };
  const vistaMini = (): Vista => {
    const t = lm.ancho;
    return { cx: yo!.x, cz: yo!.z, escala: (t / 2 - 4) / RADIOS[zoom], giro: gira ? yawYo : 0, ancho: t, alto: t };
  };
  function pintarMini(v: Vista, ms: Marcador[]): void {
    const g = lm.g, t = lm.ancho, c = t / 2, r = c - 2;
    if (t < 8) return; // U20: hidden by the density dial (Mínimo) it has no size: draw nothing (and no negative radius)
    g.clearRect(0, 0, t, t);
    g.save(); g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.clip();
    if (corte > 0 && imagen && imagen.corte > 0) { // U14: the floor plan (picture + cut) instead of footprints
      imagenEnMapa(g, v, imagen);
      rejilla(g, v, 10);
      corteEnMapa(g, v, imagen, bufMini);
    } else {
      g.fillStyle = SUELO; g.fillRect(0, 0, t, t);
      rejilla(g, v, 10);
      for (const hu of corte > 0 ? huellasBajas : huellas) huella(g, v, hu);
    }
    const vistos: Record<string, number> = {};
    for (const m of porOrden(ms)) {
      const ti = reg.tipo(m.tipo);
      let p = proyectar(v, m.x, m.z);
      const b = alBorde(p.px, p.py, c, c, r - ti.tam - 2);
      let dibujo = ti, ang = m.tipo === "tu" ? anguloFlecha(v.giro, m.yaw ?? 0) : 0;
      if (b.fuera) {
        if (!ti.alBorde) continue;
        p = b; ang = anguloBorde(b.px, b.py, c, c); dibujo = { ...ti, forma: "flecha" }; // GPS-style: point the way, not just a pinned dot
      }
      forma(g, dibujo, p.px, p.py, b.fuera ? ti.tam * 0.8 : ti.tam, ang);
      vistos[m.tipo] = (vistos[m.tipo] ?? 0) + 1;
    }
    g.restore();
    g.strokeStyle = "rgba(20,24,30,0.85)"; g.lineWidth = 2.5; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
    const n = proyectar(v, v.cx, v.cz - 1000), dx = n.px - c, dy = n.py - c, l = Math.hypot(dx, dy) || 1;
    g.fillStyle = "#23303b"; g.font = "bold 12px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("N", c + (dx / l) * (r - 9), c + (dy / l) * (r - 9));
    dibujado.mini = vistos;
  }

  // the minimap's text twin (read in browse mode; not a live region: it never interrupts)
  let textoT = -Infinity, textoAntes = "";
  function textoMini(ms: Marcador[]): void {
    if (!yo) return;
    const n = contar(ms), partes: string[] = [];
    for (const [id, ti] of reg.tipos()) if (n[id] && ti.enLista) partes.push(`${n[id]} ${ti.nombre.toLowerCase()}`);
    const cerca = cercanos(ms, yo, reg, 3).map((e) => `${e.nombre} (${reg.tipo(e.tipo).nombre.toLowerCase()}), ${e.texto}`);
    const t = `Minimapa, ${gira ? "gira con la cámara" : "norte arriba"}, ${RADIOS[zoom]} m alrededor: ${partes.join(", ") || "nada cerca"}.` +
      (cerca.length ? ` Lo más cerca: ${cerca.join("; ")}.` : "") + (destino ? ` Destino: ${destino.nombre}, ${enPalabras(destino.x - yo.x, destino.z - yo.z)}.` : "") + " Pulsa M para el mapa y la lista.";
    if (t !== textoAntes) { miniTexto.textContent = t; textoAntes = t; }
  }

  // ---------- big map (dialog) ----------
  const panel = crearDialogo({ id: "mapa-grande", titulo: "Mapa de la zona", tecla: "KeyM", boton: bMapa, alAbrir: () => abrirGrande(), alCerrar: () => { arrastre.clear(); } });
  const zonaLienzo = document.createElement("div"); zonaLienzo.className = "lienzo";
  const gCanvas = document.createElement("canvas"); gCanvas.tabIndex = 0;
  gCanvas.setAttribute("role", "img");
  gCanvas.setAttribute("aria-label", "Mapa de la zona visto desde arriba, norte arriba. Flechas: mover el mapa; + y −: acercar y alejar; 0: centrar en ti. La misma información está en la lista.");
  const controles = document.createElement("div"); controles.className = "controles";
  const gMas = boton("+", "Acercar el mapa"), gMenos = boton("−", "Alejar el mapa"), gCentro = boton("◎", "Centrar el mapa en ti");
  controles.append(gMas, gMenos, gCentro);
  const estadoImagen = document.createElement("p"); estadoImagen.className = "estado-imagen";
  zonaLienzo.append(gCanvas, controles, estadoImagen);
  const lado = document.createElement("aside");
  const detalle = document.createElement("section"); detalle.className = "detalle"; detalle.setAttribute("aria-live", "polite"); detalle.setAttribute("aria-label", "Detalle");
  const hLista = document.createElement("h3"); hLista.id = "mapa-lista-titulo"; hLista.textContent = "Lo que hay cerca"; hLista.tabIndex = -1;
  const lista = document.createElement("ul"); lista.id = "mapa-lista"; lista.setAttribute("aria-labelledby", hLista.id);
  const hLeyenda = document.createElement("h3"); hLeyenda.textContent = "Leyenda";
  const leyenda = document.createElement("ul"); leyenda.className = "leyenda";
  lado.append(detalle, hLista, lista, hLeyenda, leyenda);
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
    pintarLeyenda(); listaT = -Infinity; limGrande.forzar();
    void generarImagen(true);
    pintarGrande(); pintarLista(); pintarDetalle();
  }
  async function generarImagen(alAbrir: boolean): Promise<void> {
    const v = h.view.cenitalVersion?.() ?? 0, ahora = performance.now();
    if (!h.view.cenital || generando || (imagen && v === imagenV) || (!alAbrir && ahora - imagenT < IMAGEN_MS)) return;
    generando = true; imagenT = ahora;
    estadoImagen.textContent = "Dibujando la zona desde arriba…";
    try {
      const img = await h.view.cenital({ px: h.view.power.mobile ? 256 : 512, incluir: yo ?? undefined });
      imagen = img; imagenV = v; imagenes++;
      estadoImagen.textContent = "";
      limMini.forzar(); limGrande.forzar();
      if (panel.abierto) pedir(); // a picture made for the minimap (U14) does not redraw a closed big map
    } catch (e) { estadoImagen.textContent = `No se pudo dibujar la zona: ${String((e as Error)?.message ?? e).slice(0, 80)}`; }
    finally { generando = false; }
  }
  function pintarGrande(): void {
    lg.ajustar();
    gv.ancho = lg.ancho; gv.alto = lg.alto;
    const g = lg.g;
    g.fillStyle = imagen?.fondo ?? SUELO; g.fillRect(0, 0, lg.ancho, lg.alto); // the ground goes on beyond the picture
    if (imagen) {
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
      forma(g, ti, p.px, p.py, ti.tam * k, m.tipo === "tu" ? anguloFlecha(0, m.yaw ?? 0) : 0);
      vistos[m.tipo] = (vistos[m.tipo] ?? 0) + 1;
    }
    if (elegido) { const p = proyectar(gv, elegido.x, elegido.z); g.strokeStyle = "#ffd27a"; g.lineWidth = 3; g.beginPath(); g.arc(p.px, p.py, 14, 0, Math.PI * 2); g.stroke(); }
    // scale bar: 10 m (or 50 m when far)
    const m10 = gv.escala >= 4 ? 10 : 50, w = m10 * gv.escala;
    g.fillStyle = "rgba(20,24,30,0.75)"; g.fillRect(10, gv.alto - 26, w + 40, 18);
    g.fillStyle = "#ffd27a"; g.fillRect(14, gv.alto - 18, w, 3);
    g.fillStyle = "#eef2f6"; g.font = "11px system-ui, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(`${m10} m`, w + 18, gv.alto - 17);
    dibujado.grande = vistos;
  }

  // details of what you picked (a marker, or a point of the map) with «Marcar destino»
  function pintarDetalle(): void {
    detalle.replaceChildren();
    if (!elegido) { const p = document.createElement("p"); p.textContent = "Elige algo en el mapa o en la lista para ver su detalle y marcarlo como destino."; detalle.append(p); return; }
    const t = document.createElement("h3"); t.textContent = elegido.nombre;
    const p = document.createElement("p");
    p.textContent = `${reg.tipo(elegido.tipo).nombre}${yo ? ` · ${enPalabras(elegido.x - yo.x, elegido.z - yo.z)}` : ""}${elegido.detalle ? ` · ${elegido.detalle}` : ""}`;
    const es = destino?.id === elegido.id;
    const b = boton(es ? "Quitar destino" : "Marcar destino");
    const e = elegido;
    b.addEventListener("click", () => marcarDestino(e));
    detalle.append(t, p, b);
  }
  function elegir(m: typeof elegido, centrar = false): void {
    elegido = m;
    if (m && centrar) { gv.cx = m.x; gv.cz = m.z; }
    pintarDetalle(); pedir();
  }

  // the HTML twin: nearest first, real buttons; rows are updated in place (focus never jumps), reordered only when
  // focus is outside the list
  let listaT = -Infinity;
  const filas = new Map<string, { li: HTMLLIElement; ver: HTMLButtonElement; marcar: HTMLButtonElement; e: Entrada }>();
  function pintarLista(): void {
    if (!yo) return;
    // the waypoint is listed only when it is a point of the map (a marker that is the destination already says so)
    const real = destino && ultimos.some((m) => m.id === destino!.id) ? "destino" : "";
    const entradas = cercanos(ultimos.filter((m) => m.id !== real), yo, reg, 50).map((e) => (e.id === "destino" && destino ? { ...e, id: destino.id } : e));
    const vivos = new Set(entradas.map((e) => e.id));
    const foco = lista.contains(document.activeElement);
    for (const [id, f] of filas) if (!vivos.has(id)) { if (f.li.contains(document.activeElement)) hLista.focus(); f.li.remove(); filas.delete(id); }
    for (const e of entradas) {
      let f = filas.get(e.id);
      if (!f) {
        const li = document.createElement("li"), ver = boton(""), marcar = boton("");
        ver.className = "ver"; marcar.className = "marcar";
        f = { li, ver, marcar, e };
        const fx = f;
        ver.addEventListener("click", () => elegir({ id: fx.e.id, nombre: fx.e.nombre, tipo: fx.e.tipo, x: fx.e.x, z: fx.e.z, detalle: fx.e.detalle }, true));
        marcar.addEventListener("click", () => marcarDestino(fx.e));
        li.append(ver, marcar); li.dataset.id = e.id;
        lista.appendChild(li); filas.set(e.id, f);
      }
      f.e = e;
      const texto = `${e.nombre} · ${reg.tipo(e.tipo).nombre.toLowerCase()} · ${e.texto}`;
      if (f.ver.textContent !== texto) f.ver.textContent = texto;
      const es = destino?.id === e.id, mt = es ? "Quitar destino" : "Marcar destino", ml = `${mt}: ${e.nombre}`;
      if (f.marcar.textContent !== mt) f.marcar.textContent = mt;
      if (f.marcar.getAttribute("aria-label") !== ml) f.marcar.setAttribute("aria-label", ml);
    }
    if (!foco) for (const e of entradas) lista.appendChild(filas.get(e.id)!.li); // nearest first (moving rows only when focus is elsewhere)
    if (!entradas.length && !lista.childElementCount) { const li = document.createElement("li"); li.textContent = "No hay nada cerca."; li.dataset.id = ""; lista.appendChild(li); }
    else for (const li of [...lista.children] as HTMLElement[]) if (li.dataset.id === "") li.remove();
  }
  function pintarLeyenda(): void {
    leyenda.replaceChildren();
    for (const [id, ti] of reg.tipos()) {
      if (id === "otro" && !ultimos.some((m) => m.tipo === "otro")) continue;
      const li = document.createElement("li"), c = document.createElement("canvas");
      c.width = c.height = 36; c.setAttribute("aria-hidden", "true");
      const g = c.getContext("2d")!; g.scale(2, 2); g.fillStyle = SUELO; g.fillRect(0, 0, 18, 18); forma(g, ti, 9, 9, 5);
      const s = document.createElement("span"); s.textContent = ti.nombre;
      li.append(c, s); leyenda.appendChild(li);
    }
  }

  // pan (drag), zoom (wheel, pinch, buttons, keys), pick (click or tap)
  const arrastre = new Map<number, { x: number; y: number }>();
  let movido = 0, pinza = 0;
  const punto = (e: PointerEvent | WheelEvent) => { const r = gCanvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; };
  function zoomEn(factor: number, px = gv.ancho / 2, py = gv.alto / 2): void {
    const w = desproyectar(gv, px, py);
    gv.escala = Math.min(40, Math.max(0.3, gv.escala * factor));
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
      else { const w = desproyectar(gv, p.px, p.py), x = Math.round(w.x * 10) / 10, z = Math.round(w.z * 10) / 10; elegir({ id: `punto:${x},${z}`, nombre: "Punto del mapa", tipo: "lugar", x, z }); }
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
    const r = reunir(fuentes); ultimos = r.marcadores; fallos = r.fallos;
    if (destino) {
      const d = Math.hypot(destino.x - yo.x, destino.z - yo.z);
      destino.lejos ||= d > LLEGADA_M + 2;
      if (destino.lejos && d < LLEGADA_M) quitarDestino("llegada");
    }
    const v = h.view.cenitalVersion?.() ?? 0, c = h.view.mapaCorte?.() ?? 0;
    if (v !== huellasV || c !== corte) {
      if (c !== corte) imagenV = NaN; // U14: another cut is another picture
      huellasV = v; corte = c; huellas = h.view.huellas?.() ?? []; huellasBajas = bajoElCorte(huellas, corte);
      limMini.forzar(); limGrande.forzar();
    }
    // U14: a cut world's minimap shows the zone's picture: made the first time, then only when the zone changed (at
    // most every IMAGEN_MS). Never in XR: this clock returns above while it lasts.
    if (corte > 0 && v !== imagenV) void generarImagen(false);
    if (lm.ajustar()) limMini.forzar();
    const vm = vistaMini();
    if (limMini.debe(ahora, `${firma(vm, ultimos, alBordeDe)}|${huellasV}|${imagenes}`)) pintarMini(vm, ultimos);
    if (ahora - textoT >= TEXTO_MS) { textoT = ahora; textoMini(ultimos); }
    if (panel.abierto) {
      if (limGrande.debe(ahora, `${firma(gv, ultimos, alBordeDe)}|${huellasV}|${imagenes}`)) pintarGrande();
      if (ahora - listaT >= LISTA_MS) { listaT = ahora; pintarLista(); }
      if (v !== imagenV && corte <= 0) void generarImagen(false);
    }
  }, PASO_MS);

  return {
    /** The «Ficha» button lives in the minimap's row (the player sheet takes it). */
    botonFicha: bFicha,
    registro: reg,
    /** Add or change a kind of marker (an adventure's own). */
    registrar: reg.registrar,
    /** Draw cards of a role as a kind. */
    rol: reg.rol,
    /** Add (or replace) a source of markers: a function returning [{ id, tipo, nombre, x, z, detalle? }]. */
    fuente(id: string, f: Fuente): void { fuentes.set(id, f); limMini.forzar(); },
    quitarFuente(id: string): void { fuentes.delete(id); limMini.forzar(); },
    /** What the map knows right now (for checks and agents): markers, counts by kind, sources that failed. */
    marcadores: (): readonly Marcador[] => ultimos,
    contar: () => contar(ultimos),
    fallos: () => fallos,
    /** Counts by kind at the last draw of each map, and how often each drew (redraw rate). */
    dibujado: () => ({ mini: { ...dibujado.mini }, grande: { ...dibujado.grande } }),
    stats: () => ({ mini: limMini.stats, grande: limGrande.stats, imagenes, vueltas, ocultas, corte }),
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
      const m = typeof id === "string" ? ultimos.find((x) => x.id === id) : id;
      if (!m) return false; marcarDestino(m); return true;
    },
    quitarDestino: () => quitarDestino("quitado"),
    minimapa: { girar(si: boolean) { if (si !== gira) bGiro.click(); }, zoom(i: number) { zoom = Math.max(0, Math.min(RADIOS.length - 1, i)); limMini.forzar(); } },
  };
}
