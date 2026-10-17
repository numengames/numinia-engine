// dardos — client part (v1). Keeps THIS player's turn as the server tells it (which board, darts thrown, the turn's
// points, the last dart) and, for every board near you, the darts stuck in it right now (anyone's: they stay until that
// turn ends), plus your scoreboard. One small controller for the page (apps/plaza/dardos.ts: the throwing view on a
// flat screen, the board on your wall in AR) and for agents. It only asks: the server decides where each dart lands.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { dardos as decl, DARDOS_TURNO, FUERZA_IDEAL } from "./feature.ts";

export { DARDOS_TURNO, FUERZA_IDEAL };
export type Anillo = "dobleBull" | "bull" | "simple" | "triple" | "doble" | "fuera";
export type Dardo = { quien: number; sitio: string; numero: number; x: number; y: number; sector: number; anillo: Anillo; puntos: number; tirada: number; texto: string; cuando: number };
export type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; rumbo: number; ocupado: boolean };
export type Estado = {
  sitio: string;              // the board of my turn ("" = not throwing)
  dardos: number;             // darts thrown in this turn (0-3)
  tirada: number;             // the turn's points so far
  ultimo: Dardo | null;       // my last dart (stays after the turn ends, for the result line)
  fin: { dardos: number; puntos: number; cuando: number } | null; // how my last turn ended
  aviso: string;              // the last rejection
  marcador: { dardos: number; puntos: number; mejorDardo: number; mejorTirada: number; dianas: number };
};
export type Que = "estado" | "sitios" | "clavados";
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función dardos no está en este servidor" };
const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const r3 = (v: number) => Math.round(v * 1000) / 1000; // Q16.16 on the wire: 0.12 arrives as 0.11999…

/** One per page (tests make one per client). `dardos` is what the page and an agent call; `espia` sees every event (tests). */
export function crearCliente(espia?: (event: string, msg: Msg) => void) {
  let A: ClientApi | null = null;
  const e: Estado = { sitio: "", dardos: 0, tirada: 0, ultimo: null, fin: null, aviso: "", marcador: { dardos: 0, puntos: 0, mejorDardo: 0, mejorTirada: 0, dianas: 0 } };
  const clavados = new Map<number, Dardo[]>(); // thrower → their darts in the board now
  const oyentes = new Set<(que: Que) => void>();
  const avisar = (que: Que) => { for (const fn of oyentes) fn(que); };
  let quitar: ReturnType<typeof setTimeout> | null = null;

  const dardos = {
    estado: (): Readonly<Estado> => e,
    /** True while this page has a turn going. */
    tirando: (): boolean => e.sitio !== "",
    /** The boards this page knows (state entries within reach of the area of interest). */
    sitios: (): Sitio[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Sitio) : []),
    /** The darts stuck in boards near you right now (yours included), oldest first. */
    clavados: (sitio?: string): Dardo[] => [...clavados.values()].flat().filter((d) => !sitio || d.sitio === sitio),
    /** J4: offer the «E: tirar dardos» prompt only while this page is not throwing already. */
    ofrece: (feature: string, _key: string): boolean => feature !== "dardos" || e.sitio === "",
    jugar: (sitio?: string): Res => {
      if (!A) return SIN;
      const id = sitio ?? dardos.sitios().find((s) => !s.ocupado)?.id;
      if (!id) return { ok: false, why: "no hay ninguna diana cerca" };
      return A.send("jugar", { sitio: id });
    },
    /** Throw: aim (x, y) on the face in board radii, strength 0-1. Without a turn the server starts one. */
    lanzar: (x: number, y: number, fuerza: number, sitio?: string): Res => {
      if (!A) return SIN;
      const id = sitio ?? (e.sitio || dardos.sitios()[0]?.id);
      if (!id) return { ok: false, why: "no hay ninguna diana cerca" };
      const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
      return A.send("lanzar", { sitio: id, x: r3(c(x, -3, 3)), y: r3(c(y, -3, 3)), fuerza: r3(c(fuerza, 0, 1)) });
    },
    salir: (): Res => (A ? (e.sitio ? A.send("salir", {}) : { ok: false, why: "no estás tirando" }) : SIN),
    alCambiar: (fn: (que: Que) => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (raw) => {
    const api: ClientApi = espia ? { ...raw, on: (ev, fn) => raw.on(ev, (m) => { espia(ev, m); fn(m); }) } : raw;
    A = api;
    api.state.onChange(() => avisar("sitios"));
    api.on("turno", (m) => {
      if (quitar) { clearTimeout(quitar); quitar = null; }
      e.sitio = String(m.sitio); e.dardos = 0; e.tirada = 0; e.fin = null; e.aviso = "";
      clavados.delete(api.self()); // a new turn: my old darts come out of the board
      avisar("estado"); avisar("clavados");
    });
    api.on("dardo", (m) => {
      const d: Dardo = { quien: Number(m.quien), sitio: String(m.sitio), numero: Number(m.numero), x: r3(Number(m.x)), y: r3(Number(m.y)), sector: Number(m.sector), anillo: m.anillo as Anillo, puntos: Number(m.puntos), tirada: Number(m.tirada), texto: String(m.texto), cuando: ahora() };
      const l = d.numero === 1 ? [] : (clavados.get(d.quien) ?? []);
      l.push(d); clavados.set(d.quien, l);
      if (d.quien === api.self()) { e.dardos = d.numero; e.tirada = d.tirada; e.ultimo = d; if (d.puntos >= 50) api.view.bounce(api.self(), 900); }
      avisar("clavados"); if (d.quien === api.self()) avisar("estado");
    });
    api.on("fin", (m) => {
      const quien = Number(m.quien);
      if (quien === api.self()) {
        e.sitio = ""; e.fin = { dardos: Number(m.dardos), puntos: Number(m.puntos), cuando: ahora() };
        // my darts stay in the board a few seconds so I can look at them, then come out (another turn takes them at once)
        if (quitar) clearTimeout(quitar);
        quitar = setTimeout(() => { quitar = null; if (!e.sitio) { clavados.delete(quien); avisar("clavados"); } }, 6000);
        avisar("estado");
      } else { clavados.delete(quien); avisar("clavados"); }
    });
    api.on("marcador", (m) => { e.marcador = { dardos: Number(m.dardos), puntos: Number(m.puntos), mejorDardo: Number(m.mejorDardo), mejorTirada: Number(m.mejorTirada), dianas: Number(m.dianas) }; avisar("estado"); });
    api.on("rechazado", (m) => { e.aviso = String(m.motivo); avisar("estado"); });
  });

  return { parts: [parte], dardos };
}

const pagina = crearCliente();
export const dardos = pagina.dardos;
export default pagina.parts[0];
