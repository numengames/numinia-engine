// Rediseño v2 (story E): how the VR watch and menu are painted (canvas 2D → texture). Only canvas calls, no three.js.
// Theme «Nocturno» (apps/plaza/tema.css): ground #14110F at 90 %, lines #3A332D, action turquoise #017C8D, text #F9EBDC
// (soft #C4B5A6), states green/amber/red as the computer's chips; font Geist when the page loaded it. Icons are the
// house's Phosphor paths (viewBox 256) handed over by the page (apps/plaza/iconos.ts → `pathsIcono`), filled as Path2D:
// never redrawn by hand here.

export const COLOR = {
  fondo: "rgba(20,17,15,0.9)", fondoSolido: "#14110F", linea: "#3A332D", accion: "#017C8D", accionEncima: "#018EA1",
  foco: "#018EA1", texto: "#F9EBDC", suave: "#C4B5A6", tenue: "#8C7F73", fila: "rgba(249,235,220,0.05)", filaEncima: "rgba(249,235,220,0.12)",
  ok: "#8FC46B", aviso: "#EFA517", mal: "#D33440", verdemar: "#A6DAD5",
} as const;
export const FUENTE = "Geist, system-ui, -apple-system, 'Segoe UI', sans-serif";

/** The Phosphor paths of an icon by name ([] = unknown: nothing is drawn). */
export type PathsIcono = (nombre: string) => readonly string[];

export function rectRedondo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}

/** The panel's ground: 90 % «Nocturno», a 2 px line, 24 px corners. */
export function fondoPanel(g: CanvasRenderingContext2D, w: number, h: number, radio = 24): void {
  g.clearRect(0, 0, w, h);
  rectRedondo(g, 1, 1, w - 2, h - 2, radio);
  g.fillStyle = COLOR.fondo; g.fill();
  g.lineWidth = 2; g.strokeStyle = COLOR.linea; g.stroke();
}

const cache = new Map<string, Path2D>();
/** An icon filled in a box of side `s` centred on (cx, cy). */
export function icono(g: CanvasRenderingContext2D, paths: PathsIcono | undefined, nombre: string, cx: number, cy: number, s: number, color: string): void {
  const ds = paths?.(nombre) ?? [];
  if (!ds.length || typeof Path2D === "undefined") return;
  g.save();
  g.translate(cx - s / 2, cy - s / 2); g.scale(s / 256, s / 256);
  g.fillStyle = color;
  for (const d of ds) { let p = cache.get(d); if (!p) cache.set(d, (p = new Path2D(d))); g.fill(p); }
  g.restore();
}

/** Wrap text into lines that fit `ancho` px at the current font (a word is only cut when alone it is wider). */
export function envolverPx(g: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const out: string[] = []; let l = "";
  for (const w of texto.split(/\s+/).filter(Boolean)) {
    const prueba = l ? l + " " + w : w;
    if (g.measureText(prueba).width <= ancho || !l) l = prueba; else { out.push(l); l = w; }
  }
  if (l) out.push(l);
  return out;
}
/** One line cut with «…» to fit `ancho` px. */
export function recortar(g: CanvasRenderingContext2D, texto: string, ancho: number): string {
  if (g.measureText(texto).width <= ancho) return texto;
  let t = texto;
  while (t.length > 1 && g.measureText(t + "…").width > ancho) t = t.slice(0, -1);
  return t + "…";
}

export type EstiloBoton = "accion" | "normal" | "desactivado";
/** A button: rounded 12 px; «accion» = turquoise fill; «normal» = a faint ground and a line; highlighted when `encima`. */
export function boton(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, texto: string, o: { estilo?: EstiloBoton; encima?: boolean; icono?: string; paths?: PathsIcono; tam?: number } = {}): void {
  const estilo = o.estilo ?? "normal", encima = !!o.encima && estilo !== "desactivado";
  rectRedondo(g, r.x, r.y, r.w, r.h, 12);
  g.fillStyle = estilo === "accion" ? (encima ? COLOR.accionEncima : COLOR.accion) : encima ? COLOR.filaEncima : COLOR.fila; g.fill();
  g.lineWidth = encima ? 3 : 2; g.strokeStyle = encima ? COLOR.texto : estilo === "accion" ? COLOR.accion : COLOR.linea; g.stroke();
  const color = estilo === "desactivado" ? COLOR.tenue : COLOR.texto, tam = o.tam ?? 34;
  g.font = `600 ${tam}px ${FUENTE}`; g.textBaseline = "middle";
  const ic = o.icono ? tam * 1.15 : 0, hueco = o.icono && texto ? 14 : 0, ancho = ic + hueco + (texto ? g.measureText(texto).width : 0);
  let x = r.x + (r.w - ancho) / 2;
  if (o.icono) { icono(g, o.paths, o.icono, x + ic / 2, r.y + r.h / 2, ic, color); x += ic + hueco; }
  if (texto) { g.fillStyle = color; g.textAlign = "left"; g.fillText(recortar(g, texto, r.w - 24 - ic - hueco), x, r.y + r.h / 2 + 1); }
}

/** A chip («Estable», «Confundido»…): a rounded pill with a dot, coloured by its tone. Returns its width. */
export function chip(g: CanvasRenderingContext2D, x: number, y: number, texto: string, tono: "ok" | "aviso" | "mal"): number {
  g.font = `600 28px ${FUENTE}`;
  const w = g.measureText(texto).width + 64, h = 48, c = COLOR[tono];
  rectRedondo(g, x, y, w, h, h / 2);
  g.fillStyle = "rgba(249,235,220,0.06)"; g.fill(); g.lineWidth = 2; g.strokeStyle = c; g.stroke();
  g.beginPath(); g.arc(x + 26, y + h / 2, 7, 0, Math.PI * 2); g.fillStyle = c; g.fill();
  g.fillStyle = c; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(texto, x + 42, y + h / 2 + 1);
  return w;
}
