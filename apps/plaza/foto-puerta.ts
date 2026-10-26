// t_45ef2f70 (third step): the photo mode's façade. foto.ts (the frame, filters, PNG, share, the link to a place: ~4 kB gz
// plus foto.css) is not needed to draw the first frame, so main.ts mounts THIS: the same object `montarFoto` always
// returned. The bar's «Foto» button is dressed here (icon, tooltip) and brings the chunk when pressed; the rest waits
// for the real mode, which lands after the first frame. The one thing that cannot wait is a photo's link (`#foto=…`):
// whoever opens one is led to the place at boot, so then the chunk is asked for at once, before the first frame.
import type { FotoOpts } from "./foto.ts";
import { crearPuerta } from "./puerta.ts";
import { icono } from "./iconos.ts";

type Real = ReturnType<typeof import("./foto.ts").montarFoto>;
export type FotoPuerta = Real;

export function montarFotoPuerta(o: FotoOpts, loc: { hash: string } = location): FotoPuerta {
  const enlace = loc.hash.includes("foto="); // the same test as foto-nucleo's tomarSitioDeLaDireccion
  o.boton.classList.add("solo-icono");
  o.boton.title = "Foto: la interfaz se esconde, encuadras y disparas";
  // constants only: a fixed house glyph and a fixed word
  o.boton.innerHTML = `${icono("camera")}<span class="solo-lector">Foto</span>`;
  const alClic = (): void => ya((r) => r.abrir());
  const puerta = crearPuerta<Real>(async () => {
    const m = await import("./foto.ts");
    o.boton.removeEventListener("click", alClic); // the real mode toggles from now on
    return m.montarFoto(o);
  }, "foto");
  o.boton.addEventListener("click", alClic);
  /** Queue and bring the mode now (the person pressed something that needs it). */
  const ya = (f: (r: Real) => void): void => { puerta.despues(f); void puerta.cargarYa().catch(() => {}); };
  if (enlace) void puerta.cargarYa().catch(() => {});
  /** The real mode's answer, or the pending one: a photo's link is on its way. */
  const aun = async (): Promise<Real> => puerta.cargarYa();

  return {
    activo: () => puerta.real()?.activo() ?? false,
    abrir: () => { const r = puerta.real(); if (r) return r.abrir(); ya((x) => { x.abrir(); }); return false; },
    cerrar: () => { puerta.real()?.cerrar(); },
    disparar: async () => (await aun()).disparar(),
    elegirFiltro: (id: string) => puerta.real()?.elegirFiltro(id) ?? id,
    marco: (on: boolean) => { puerta.despues((r) => r.marco(on)); },
    filtros: () => puerta.real()?.filtros() ?? [],
    enlace: () => puerta.real()?.enlace() ?? "",
    portadaSinNombres: () => puerta.real()?.portadaSinNombres() ?? false,
    ultima: () => puerta.real()?.ultima() ?? null,
    datos: async () => (await aun()).datos(),
    usarDePortada: async () => (await aun()).usarDePortada(),
    guia: () => puerta.real()?.guia() ?? (enlace ? ({ estado: "esperando" } as unknown as ReturnType<Real["guia"]>) : null),
  };
}
