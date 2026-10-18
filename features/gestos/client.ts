// gestos — client part: how a move looks and how the page asks for one. The page's wheel (apps/plaza/rueda.ts) and any
// helper call `gestosDePagina.hacer(id)`; the server answers to everyone within 30 m (you too) and each page plays the
// move on that avatar's VRM (view.movimiento). Where no VRM can play it (capsules, ?sinavatares), a label and a hop.
// H is still «bailar» on its own; G (tap) waves and G held opens the wheel (both in rueda.ts: a tap is only known on release).
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { gestos } from "./feature.ts";
import { GRUPOS, MOVIMIENTOS, PARAR, movimiento } from "./movimientos.ts";
import type { Movimiento } from "./movimientos.ts";

export const DURACION_MS = 2000; // the label over a capsule
type Res = { ok: true } | { ok: false; why: string };

/** One per page (tests make one per client). */
export function crearGestos(reloj: () => number = () => performance.now()) {
  let api: ClientApi | null = null;
  // the page's copy of the server's pace (1 a second, 3 in a burst), so the wheel can say «wait» instead of nothing
  let fichas = 3, antes = -1;
  const oyentes: ((quien: number, m: Movimiento | null) => void)[] = [];
  const enCurso = new Map<number, string>(); // who is making which move, as far as this page knows (for checks)

  function pedir(a: ClientApi | null, id: string): Res {
    if (id !== PARAR && !movimiento(id)) return { ok: false, why: `No conozco el movimiento «${id}».` };
    const t = reloj();
    if (antes >= 0) fichas = Math.min(3, fichas + (t - antes) / 1000);
    antes = t;
    if (fichas < 1) return { ok: false, why: "Espera un momento: un movimiento por segundo." };
    const r = a?.send("hacer", { gesto: id }) ?? { ok: false as const, why: "la página aún no ha arrancado" };
    if (r.ok) fichas -= 1;
    return r;
  }

  const pagina = {
    lista: MOVIMIENTOS, grupos: GRUPOS, movimiento,
    /** Ask for a move (or PARAR). Refused, with the reason, when unknown, too fast or before the catalog arrives. */
    hacer(id: string): Res { return pedir(api, id); },
    parar(): Res { return pagina.hacer(PARAR); },
    /** Someone near (or you) started a move, or stopped (null). */
    alHacer(fn: (quien: number, m: Movimiento | null) => void): void { oyentes.push(fn); },
    /** The move this page last heard of for `quien` (it may have ended since by walking). */
    deQuien: (quien: number): string | null => enCurso.get(quien) ?? null,
    /** Set by the page: opens the wheel (the touch button and the «movimientos» action use it). */
    abrirRueda: null as null | (() => void),
  };

  const part = clientPart(gestos, (a) => {
    api = a;
    a.on("hecho", (msg) => {
      const quien = Number(msg.quien), id = String(msg.gesto);
      const mov = movimiento(id) ?? null;
      if (mov) enCurso.set(quien, id); else enCurso.delete(quien);
      const jugado = a.view.movimiento?.(quien, mov) ?? false;
      if (mov?.dice) a.view.label(quien, mov.dice, DURACION_MS);
      else if (mov && !jugado) a.view.label(quien, mov.etiqueta, DURACION_MS);
      if (mov && !jugado && mov.viva && mov.modo === "bucle") a.view.bounce(quien, DURACION_MS); // a capsule's dance hops
      for (const fn of oyentes) fn(quien, mov);
    });
    a.action({ id: "saludar", label: "Saludar", describe: "Saluda a quien esté cerca (G)", run: () => pedir(a, "saludar") });
    a.action({ id: "bailar", label: "Bailar", key: "KeyH", describe: "Baila hasta que andes", run: () => pedir(a, "bailar") });
    a.action({ id: "movimientos", label: "Movimientos", describe: "La rueda de movimientos (mantén G)", run: () => pagina.abrirRueda?.() });
  });
  return { part, gestos: pagina };
}

const pagina = crearGestos();
export const gestosDePagina = pagina.gestos;
export default pagina.part;
