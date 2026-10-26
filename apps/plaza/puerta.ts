// t_45ef2f70 (second step): a «puerta» (façade) is the small stand-in a page piece leaves in the entry chunk while its
// real code waits for the first frame. Callers keep the same object from the first line; calls that need the real
// piece are queued and replayed in order when its chunk lands (`despues`), or load it right away (`cargarYa`: the
// person pressed something that needs it). The chunk is asked for through `alPrimerCuadro`, so it never competes with
// the first frame; a failed load is retried on the next `cargarYa`.
import { alPrimerCuadro } from "./primer-cuadro.ts";

export type Puerta<T> = {
  /** The real piece, or null while its chunk has not landed. */
  real(): T | null;
  /** Run `f` with the real piece: now if it is here, else when it lands (in call order). Errors in `f` do not stop the others. */
  despues(f: (t: T) => void): void;
  /** Ask for the chunk now (idempotent); resolves with the real piece. */
  cargarYa(): Promise<T>;
};

export function crearPuerta<T>(cargar: () => Promise<T>, nombre: string): Puerta<T> {
  let real: T | null = null, promesa: Promise<T> | null = null;
  const cola: Array<(t: T) => void> = [];
  const seguro = (f: (t: T) => void, t: T): void => { try { f(t); } catch (e) { console.warn(`[puerta ${nombre}]`, e); } };
  const cargarYa = (): Promise<T> => {
    if (!promesa) {
      promesa = cargar().then((t) => { real = t; for (const f of cola.splice(0)) seguro(f, t); return t; }, (e) => { promesa = null; console.warn(`[puerta ${nombre}] no se pudo cargar`, e); throw e; });
    }
    return promesa;
  };
  alPrimerCuadro(() => cargarYa().catch(() => {}));
  return {
    real: () => real,
    despues(f) { if (real) seguro(f, real); else cola.push(f); },
    cargarYa,
  };
}
