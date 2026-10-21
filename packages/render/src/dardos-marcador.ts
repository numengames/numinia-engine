// dardos in VR, the scoreboard beside the board: what it says (pure) and how it is painted (plain canvas, like diana.ts:
// WebXR draws no DOM). One panel for the player of THIS page — a solo turn («Te toca · 2 dardos», then «Turno acabado»
// and a button for the next one) or a duel (names, points, whose turn: «Te toca» / «Le toca a X», and «Pasar turno» /
// «Empezar» when those can be pressed). A duel's rows come from the same `panelDe` as the wall board and the plaza sign.
// No three here: unit tests run it without a screen (test/dardos-marcador.test.ts). The 3D plane, the ray and the
// press are in dardos-vr.ts. Everything is drawn in letters big enough for 3 m: see LETRA_PX / `letraGrados`.
import { panelDe } from "./dardos-duelo.ts";
import type { DueloV } from "./dardos-duelo.ts";

export type SoloV = {
  /** The board of my turn, «» when I am not in one. */
  sitio: string; dardos: number; tirada: number;
  ultimo: { texto: string; puntos: number } | null;
  /** How my last turn ended (the panel keeps saying it for FIN_VISIBLE_MS). */
  fin: { dardos: number; puntos: number; cuando: number } | null;
};
export type Boton = "empezar" | "cambiar" | "otra";
/** The label of each button. «Pasar turno» is the duel's `cambiar`; «Otro turno» starts a new solo turn. */
export const TEXTO_BOTON: Record<Boton, string> = { empezar: "Empezar", cambiar: "Pasar turno", otra: "Otro turno" };
export type MarcadorV = {
  fase: "solo" | "fin-solo" | "espera" | "juego" | "fin";
  titulo: string;
  filas: { nombre: string; puntos: number; turno: boolean; yo: boolean; fuera?: boolean }[];
  /** A line under the rows (the last dart of a solo turn), or «». */
  nota: string;
  pie: string;
  tono: "bien" | "mal" | "neutro";
  boton: Boton | null;
};
/** A solo turn is 3 darts (features/dardos DARDOS_TURNO; test/dardos-marcador.test.ts checks both agree). */
export const DARDOS_POR_TURNO = 3;
/** After a solo turn the panel stays this long (ms) with «Turno acabado» and its button. */
export const FIN_VISIBLE_MS = 90000;

const MAX_NOMBRE = 10;
const corta = (s: string, n = MAX_NOMBRE): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const dardosTexto = (n: number): string => `${n} dardo${n === 1 ? "" : "s"}`;

/** My last dart's line, only while this turn has thrown one (`ultimo` outlives its turn in the controller). */
const notaDe = (s: SoloV): string => (s.dardos > 0 && s.ultimo ? s.ultimo.texto : "");

/** What the panel shows for this player, or null (nothing to say: it hides). `ahora` in ms, same clock as `fin.cuando`. */
export function marcadorDe(o: { solo: SoloV; duelo: DueloV | null; rondas: number; ahora: number }): MarcadorV | null {
  const { solo, duelo: d, rondas, ahora } = o;
  const quedan = Math.max(0, DARDOS_POR_TURNO - solo.dardos);
  if (d && d.yo) {
    const p = panelDe(d, rondas);
    if (p.fase === "nada") return null;
    const filas = p.filas.map((f) => ({ ...f, nombre: corta(f.nombre) }));
    if (p.fase === "fin") return { fase: "fin", titulo: "Fin de la partida", filas, nota: "", pie: corta(p.pie, 20), tono: p.tono, boton: null };
    if (p.fase === "espera") return { fase: "espera", titulo: "Dardos", filas, nota: "", pie: p.boton === "empezar" ? "Pulsa Empezar" : "Esperando rival", tono: "neutro", boton: p.boton === "empezar" ? "empezar" : null };
    const eq = d.equipos && d.equipos.length ? d.equipos : [d.a, ...(d.b ? [d.b] : [])];
    const quien = eq.find((j) => j.entity === d.turnoDe);
    const mio = d.miTurno;
    const pie = mio ? (d.retirando ? "Pasa el turno" : `Te toca · ${dardosTexto(quedan || DARDOS_POR_TURNO)}`) : `Le toca a ${corta(quien ? quien.nombre : "tu rival")}`;
    // the host's «cambiar» is a button only once the visit is over (3 darts): until then you throw
    return { fase: "juego", titulo: p.ronda || "Dardos", filas, nota: notaDe(solo), pie: corta(pie, 22), tono: mio ? "bien" : "neutro", boton: p.boton === "cambiar" ? "cambiar" : null };
  }
  if (solo.sitio) {
    const fila = { nombre: "Tú", puntos: solo.tirada, turno: true, yo: true };
    return { fase: "solo", titulo: "Dardos", filas: [fila], nota: notaDe(solo), pie: quedan > 0 ? `Te toca · ${dardosTexto(quedan)}` : "Último dardo tirado", tono: "bien", boton: null };
  }
  if (solo.fin && ahora - solo.fin.cuando <= FIN_VISIBLE_MS) {
    const f = solo.fin;
    return { fase: "fin-solo", titulo: "Dardos", filas: [{ nombre: "Tú", puntos: f.puntos, turno: false, yo: true }], nota: solo.ultimo ? solo.ultimo.texto : "", pie: "Turno acabado", tono: "neutro", boton: "otra" };
  }
  return null;
}
/** Which board hangs the panel and what it says, from what the page knows: my solo turn (`estado`), my match, the last board I threw at. */
export function marcadorPara(o: { solo: SoloV; duelo: DueloV | null; sitios: { id: string; rondas?: number }[]; ultimoSitio: string; ahora: number }): { sitio: string; marcador: MarcadorV | null } {
  const sitio = o.duelo?.yo ? (o.duelo.sitio || o.solo.sitio) : o.solo.sitio || o.ultimoSitio;
  if (!sitio) return { sitio: "", marcador: null };
  const rondas = o.sitios.find((s) => s.id === sitio)?.rondas ?? 3;
  const marcador = marcadorDe({ solo: o.solo, duelo: o.duelo, rondas, ahora: o.ahora });
  return { sitio: marcador ? sitio : "", marcador };
}
/** A key that changes exactly when the panel must be repainted. */
export const claveMarcador = (m: MarcadorV | null): string => JSON.stringify(m);

// ---- layout (canvas px; PX_POR_M px per metre of the plane) ----
export const ANCHO_PX = 768, PX_POR_M = 640;
export const ANCHO_M = ANCHO_PX / PX_POR_M; // 1.2 m
/** The smallest letter drawn (px). Cap height is ~0.72 of it: 58 px → 6.5 cm → 1.25° at 3 m (the brief asks ≥ 1.2° at 2-3 m). */
export const LETRA_PX = 58;
/** Visual angle (degrees) of a letter of `px` canvas pixels (cap height) seen from `m` metres. */
export const letraGrados = (px: number, m: number): number => (2 * Math.atan(((px * 0.72) / PX_POR_M) / (2 * m)) * 180) / Math.PI;
const MARGEN = 24, FILA_PX = 76, BOTON_ALTO = 96;
const yTitulo = 48, yFilas = 128;
/** Where each part sits for a panel with `n` rows, a note line or not, a button or not; and the total canvas height. */
export function disposicion(m: MarcadorV): { filas: number; nota: number | null; pie: number; boton: { x: number; y: number; w: number; h: number } | null; alto: number } {
  let y = yFilas + Math.max(1, m.filas.length) * FILA_PX - 14;
  const filas = y;
  let nota: number | null = null;
  if (m.nota) { nota = y + 14; y += 66; }
  const pie = y + 14; y += 70;
  const boton = m.boton ? { x: MARGEN, y: y + 6, w: ANCHO_PX - 2 * MARGEN, h: BOTON_ALTO } : null;
  return { filas, nota, pie, boton, alto: Math.round((boton ? boton.y + boton.h : y) + MARGEN) };
}
/** A point of the canvas (px) inside the panel's button? */
export function enBoton(m: MarcadorV | null, x: number, y: number): boolean {
  const b = m ? disposicion(m).boton : null;
  return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
const TONO = { bien: "#9fe8a8", mal: "#ff8a80", neutro: "#d7dee6" } as const;

/** Paint the panel at the top of `ctx`'s canvas (ANCHO_PX wide, `disposicion().alto` tall). `encima`: the ray is on the button. */
export function pintarMarcador(ctx: CanvasRenderingContext2D, m: MarcadorV, encima = false): void {
  const L = disposicion(m);
  ctx.clearRect(0, 0, ANCHO_PX, 800);
  ctx.fillStyle = "rgba(14,18,24,.94)"; ctx.beginPath(); ctx.roundRect(0, 0, ANCHO_PX, L.alto, 28); ctx.fill();
  ctx.strokeStyle = m.fase === "juego" || m.fase === "solo" ? "#ffd27a" : "#5f6c79"; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(3, 3, ANCHO_PX - 6, L.alto - 6, 26); ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#c9d3dc"; ctx.font = `700 ${LETRA_PX}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.fillText(m.titulo, ANCHO_PX / 2, yTitulo);
  m.filas.forEach((f, i) => {
    const y = yFilas + i * FILA_PX + 22;
    if (f.turno) { ctx.fillStyle = "rgba(255,210,122,.22)"; ctx.beginPath(); ctx.roundRect(12, y - 36, ANCHO_PX - 24, 70, 14); ctx.fill(); }
    ctx.fillStyle = f.fuera ? "#7f8993" : f.turno ? "#ffd27a" : "#eef2f6"; ctx.font = `${f.turno ? 800 : 700} 62px system-ui, sans-serif`;
    ctx.textAlign = "left"; ctx.fillText(`${f.turno && m.fase !== "solo" ? "▶ " : ""}${f.nombre}`, MARGEN, y);
    ctx.textAlign = "right"; ctx.fillText(String(f.puntos), ANCHO_PX - MARGEN - 4, y);
  });
  ctx.textAlign = "center";
  if (L.nota !== null) { ctx.fillStyle = "#ffd27a"; ctx.font = `700 ${LETRA_PX}px system-ui, sans-serif`; ctx.fillText(m.nota, ANCHO_PX / 2, L.nota + 26); }
  ctx.fillStyle = TONO[m.tono]; ctx.font = `800 ${LETRA_PX}px system-ui, sans-serif`; ctx.fillText(m.pie, ANCHO_PX / 2, L.pie + 26);
  if (L.boton && m.boton) {
    const b = L.boton;
    ctx.fillStyle = encima ? "#fff2c4" : "#ffd27a"; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill();
    ctx.lineWidth = encima ? 8 : 0; ctx.strokeStyle = "#ffffff"; if (encima) ctx.stroke();
    ctx.fillStyle = "#1b1f24"; ctx.font = `800 ${LETRA_PX + 6}px system-ui, sans-serif`; ctx.fillText(TEXTO_BOTON[m.boton], ANCHO_PX / 2, b.y + b.h / 2 + 2);
  }
}
