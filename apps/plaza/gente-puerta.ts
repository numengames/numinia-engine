// t_45ef2f70 (third step): «Gente»'s façade. gente.ts (the panel, the friends list, the AI sheets, the small card: ~7 kB gz
// plus gente-tarjeta.ts) is not needed to draw the first frame, so main.ts mounts THIS: the bar's «Gente» button (made
// here, at once, so the bar is whole from the first frame) and the same object `montarGente` always returned, whose calls
// wait for the real panel and run in order when it lands after the first frame. A press that needs it (the button, L, a
// click on someone in the world, «Ir» from the map) brings the chunk right away. Answers that need the real panel say
// «nothing yet» (closed, no friends, no card) until then.
import type { OpcionesGente } from "./gente.ts";
import { crearBotonGente } from "./gente-comun.ts";
import { crearPuerta } from "./puerta.ts";
import { escribiendo } from "./escribiendo.ts";

type Real = ReturnType<typeof import("./gente.ts").montarGente>;
export type GentePuerta = Real;

export function montarGentePuerta(o: OpcionesGente): GentePuerta {
  const boton = crearBotonGente(o.barra);
  boton.setAttribute("aria-haspopup", "dialog"); boton.setAttribute("aria-controls", "gente");
  boton.setAttribute("aria-expanded", "false"); boton.setAttribute("aria-keyshortcuts", "L");
  const alClic = (): void => ya((r) => r.abrir());
  const alTeclado = (e: KeyboardEvent): void => {
    if (e.repeat || e.code !== "KeyL" || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e)) return;
    e.preventDefault(); e.stopPropagation(); ya((r) => r.abrir());
  };
  const puerta = crearPuerta<Real>(async () => {
    const m = await import("./gente.ts");
    boton.removeEventListener("click", alClic); removeEventListener("keydown", alTeclado, { capture: true }); // the real panel listens from now on
    return m.montarGente({ ...o, boton });
  }, "gente");
  boton.addEventListener("click", alClic);
  addEventListener("keydown", alTeclado, { capture: true });
  const luego = (f: (r: Real) => void): void => puerta.despues(f);
  /** Queue and bring the panel now (the person pressed something that needs it). */
  const ya = (f: (r: Real) => void): void => { puerta.despues(f); void puerta.cargarYa().catch(() => {}); };

  return {
    abrir: () => ya((r) => r.abrir()),
    cerrar: () => { puerta.real()?.cerrar(); },
    get abierto() { return puerta.real()?.abierto ?? false; },
    elegir: (quien) => ya((r) => r.elegir(quien)),
    tarjeta: (quien) => { const r = puerta.real(); if (r) return r.tarjeta(quien); ya((x) => { x.tarjeta(quien); }); return true; }, // the click is the card's, even if it lands a moment later
    tarjetaAbierta: () => puerta.real()?.tarjetaAbierta() ?? null,
    cerrarTarjeta: () => { puerta.real()?.cerrarTarjeta(); },
    amigos: () => puerta.real()?.amigos() ?? [],
    pedir: () => luego((r) => r.pedir()),
  };
}
