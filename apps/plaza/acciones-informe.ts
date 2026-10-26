// Actions in the session log (T1): the few things a player does that no other record shows — a dice roll, a photo, letting
// go of what a hand carries, a jump with the hands, your own body in VR on/off, the VR walking speed. Each goes through
// the page's one report path (`session.report`, so «Enviar el informe de la sesión» off silences it) as
// `{ k: "accion", que, detalle?, valor?, activo? }`, and the server keeps it in sesiones-<day>.jsonl (packages/server/src/sesiones.ts).
// Nothing personal: `que` is a fixed id, `detalle` a fixed word or a dice expression like «2d6», `valor` a number, `activo` an on/off.
// Two guards against spam: the same action twice within MIN_ENTRE_MS is one (a held key, a bouncing arm), and a setting that is
// dragged (the VR speed slider) reports once it has rested ESPERA_AJUSTE_MS, with the value it stopped at.

export type Que = "dados" | "foto" | "soltar" | "salto-manos" | "cuerpo-vr" | "velocidad-vr";
export type Datos = { detalle?: string; valor?: number; activo?: boolean };
export type Sumidero = (r: Record<string, unknown>) => unknown;

export const MIN_ENTRE_MS = 250;
export const ESPERA_AJUSTE_MS = 800;

const EXPRESION = /^\d{0,3}d\d{1,3}([+-]\d{1,3})?$/i;
/** A dice expression as the server rolls it («2d6», «1d20+3»), or «otra»: free text never goes into the log. */
export const expresionDeDados = (e: unknown): string => { const t = String(e ?? "").trim().toLowerCase(); return EXPRESION.test(t) ? t : "otra"; };

export type Hechuras = { ahora?: () => number; esperar?: (fn: () => void, ms: number) => unknown; cancelar?: (id: unknown) => void };

export function crearAcciones(h: Hechuras = {}) {
  const ahora = h.ahora ?? (() => Date.now());
  const esperar = h.esperar ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelar = h.cancelar ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let sumidero: Sumidero | null = null;
  const ultima = new Map<Que, number>(), pendiente = new Map<Que, unknown>();
  const limpio = (d: Datos): Datos => ({
    ...(typeof d.detalle === "string" && d.detalle ? { detalle: d.detalle.slice(0, 32) } : {}),
    ...(typeof d.valor === "number" && Number.isFinite(d.valor) ? { valor: d.valor } : {}),
    ...(typeof d.activo === "boolean" ? { activo: d.activo } : {}),
  });
  const enviar = (que: Que, d: Datos): boolean => {
    if (!sumidero) return false;
    const t = ahora(), antes = ultima.get(que);
    if (antes !== undefined && t - antes < MIN_ENTRE_MS) return false;
    ultima.set(que, t);
    try { sumidero({ k: "accion", que, ...limpio(d) }); return true; } catch { return false; } // the log never breaks the game
  };
  return {
    /** Where reports go (the page: `(r) => session.report(r)`, read at call time so the privacy switch applies). */
    conectar(f: Sumidero | null): void { sumidero = f; },
    /** One action, now. Returns false when it was dropped (no sink, or the same action a moment ago). */
    registrar(que: Que, d: Datos = {}): boolean { return enviar(que, d); },
    /** A setting being dragged: only the value it rests at is reported. */
    ajuste(que: Que, d: Datos): void {
      const p = pendiente.get(que); if (p !== undefined) cancelar(p);
      pendiente.set(que, esperar(() => { pendiente.delete(que); enviar(que, d); }, ESPERA_AJUSTE_MS));
    },
  };
}

/** The page's one instance. */
export const acciones = crearAcciones();
