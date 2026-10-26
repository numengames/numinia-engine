// pincel (J18b, MIS-222 t_1b395abe; MENU-MUNECA-Y-PINTURA-VR.md §3.2, story 4 of §3.7, first slice): the brush as pure numbers. It takes the
// tip of the brush frame after frame while the trigger is down and keeps only the CONTROL POINTS (what is saved, Open Brush style): a
// point when the tip has moved ≥ 1.5 cm, or the line turned more than 10° and it moved at least 3 mm. At 600 points the stroke is
// full (the caller closes it and starts another). On release `terminar()` gives the `trazo@1` file text (points relative to the
// stroke's centre, mm and 2-decimal pressure) and where the centre is in the world; the same checker the server uses
// (`comprobarTrazo`) is what the tests run it through. No DOM, no three.js, no network: the hand input and the upload are on top of this.
import { TRAZO, TRAZO_SCHEMA } from "../../packages/net/src/ficheros.ts";
import type { Trazo } from "../../packages/net/src/ficheros.ts";

export const PASO_MIN_M = 0.015;       // a new control point after this much movement…
export const GIRO_MIN_GRADOS = 10;     // …or after this much turn of the line (once it moved at least GIRO_PASO_MIN_M)
export const GIRO_PASO_MIN_M = 0.003;
/** The three thicknesses of the palette (design §3.1): 0.5 / 1.5 / 4 cm. */
export const GROSORES_M = [0.005, 0.015, 0.04] as const;

export type Punta = { x: number; y: number; z: number; presion?: number };
export type Opciones = { color: number; grosor: number };
export type Resultado = "primero" | "añadido" | "igual" | "lleno";
export type Hecho = { fichero: string; bytes: number; centro: { x: number; y: number; z: number }; puntos: number };

const mm = (v: number): number => Math.round(v * 1000) / 1000;
const cm2 = (v: number): number => Math.round(v * 100) / 100;
const limitar = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Does this choice of colour and thickness make a valid stroke? (the palette has 8 colours; the thickness is clamped to the server's cap). */
export function opcionesValidas(o: Opciones): Opciones | null {
  if (!Number.isInteger(o.color) || o.color < 0 || o.color >= TRAZO.colores || !Number.isFinite(o.grosor)) return null;
  return { color: o.color, grosor: limitar(o.grosor, TRAZO.grosorMin, TRAZO.grosorMax) };
}

export function crearPincel(opciones: Opciones) {
  const op = opcionesValidas(opciones);
  if (!op) throw new Error(`pincel: color 0–${TRAZO.colores - 1} y grosor en metros (${TRAZO.grosorMin}–${TRAZO.grosorMax})`);
  const pts: { x: number; y: number; z: number; p: number }[] = [];
  let ultimo: { x: number; y: number; z: number } | null = null; // the tip at the last frame (for the 3 mm / turn rule)
  const ang = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }): number => {
    const u = [b.x - a.x, b.y - a.y, b.z - a.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
    const lu = Math.hypot(u[0]!, u[1]!, u[2]!), lv = Math.hypot(v[0]!, v[1]!, v[2]!);
    if (lu < 1e-9 || lv < 1e-9) return 0;
    return (Math.acos(limitar((u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (lu * lv), -1, 1)) * 180) / Math.PI;
  };
  return {
    opciones: op,
    /** How many control points so far. */
    get puntos(): number { return pts.length; },
    get lleno(): boolean { return pts.length >= TRAZO.puntosMax; },
    /** The brush tip this frame (world metres) with the trigger's pressure 0–1 (omitted: 1, a tracked hand has none). Cheap: O(1) per call. */
    mover(punta: Punta): Resultado {
      if (!Number.isFinite(punta.x) || !Number.isFinite(punta.y) || !Number.isFinite(punta.z)) return "igual";
      if (pts.length >= TRAZO.puntosMax) return "lleno";
      const p = limitar(punta.presion ?? 1, 0, 1), cur = { x: punta.x, y: punta.y, z: punta.z };
      if (pts.length === 0) { pts.push({ ...cur, p }); ultimo = cur; return "primero"; }
      const ult = pts[pts.length - 1]!, d = Math.hypot(cur.x - ult.x, cur.y - ult.y, cur.z - ult.z);
      let guardar = d >= PASO_MIN_M - 1e-9; // (the epsilon: 15 × 1 mm adds up to 14.9999… in floats)
      if (!guardar && d >= GIRO_PASO_MIN_M && pts.length >= 2) guardar = ang(pts[pts.length - 2]!, ult, cur) > GIRO_MIN_GRADOS;
      ultimo = cur;
      if (!guardar) return "igual";
      pts.push({ ...cur, p });
      return pts.length >= TRAZO.puntosMax ? "lleno" : "añadido";
    },
    /** Close the stroke at the tip's last place (so the line ends where the hand let go) and write the file, or null when it is too short to be a line. */
    terminar(): Hecho | null {
      if (ultimo && pts.length >= 1 && pts.length < TRAZO.puntosMax) {
        const f = pts[pts.length - 1]!;
        if (Math.hypot(ultimo.x - f.x, ultimo.y - f.y, ultimo.z - f.z) >= GIRO_PASO_MIN_M) pts.push({ ...ultimo, p: f.p });
      }
      if (pts.length < TRAZO.puntosMin) return null;
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), zs = pts.map((q) => q.z);
      const centro = { x: mm((Math.min(...xs) + Math.max(...xs)) / 2), y: mm((Math.min(...ys) + Math.max(...ys)) / 2), z: mm((Math.min(...zs) + Math.max(...zs)) / 2) };
      const puntos = pts.map((q): [number, number, number, number] => [mm(q.x - centro.x), mm(q.y - centro.y), mm(q.z - centro.z), cm2(q.p)]);
      // a stroke wider than the server's reach (100 m from its centre) cannot be saved: the caller is told with null
      if (puntos.some((q) => Math.abs(q[0]) > TRAZO.coordMax || Math.abs(q[1]) > TRAZO.coordMax || Math.abs(q[2]) > TRAZO.coordMax)) return null;
      const t: Trazo = { schema: TRAZO_SCHEMA, pincel: "tubo", color: op.color, grosor: op.grosor, puntos };
      const fichero = JSON.stringify(t);
      const bytes = new TextEncoder().encode(fichero).length;
      if (bytes > TRAZO.bytesMax) return null;
      return { fichero, bytes, centro, puntos: puntos.length };
    },
    /** Throw the stroke away (B cancels). */
    cancelar(): void { pts.length = 0; ultimo = null; },
  };
}
export type Pincel = ReturnType<typeof crearPincel>;
