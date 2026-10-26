// t_45ef2f70: the builder's façade. constructor.ts (the dock, the drawers, the card, the keys: ~13 kB gz) is not needed to
// draw the first frame, so main.ts mounts THIS instead: it hands out what other pieces need at once (the drawers' bodies
// and the card's slot, empty `div`s that the real builder adopts when it lands), keeps the «Construir» button hidden
// for whoever may not build, and queues what is asked of the builder until its chunk arrives after the first frame.
// A press on the button or on C before that loads the chunk right away and opens the builder when it is here.
import type { ConstructorUI, ExtraConstructor } from "./constructor.ts";
import { CAJONES } from "./cajones.ts";
import type { Cajon } from "./cajones.ts";
import { crearPuerta } from "./puerta.ts";
import { escribiendo } from "./escribiendo.ts";

type Res = { ok: true } | { ok: false; why: string };
type Args = Parameters<typeof import("./constructor.ts").montarConstructor>;

export function montarConstructorPuerta(c: Args[0], view: Args[1], boton: HTMLButtonElement, panel: HTMLElement, extra?: ExtraConstructor): ConstructorUI {
  const cuerpos = {} as Record<Cajon, HTMLElement>;
  for (const [id] of CAJONES) { const d = document.createElement("div"); d.className = "cuerpo"; cuerpos[id] = d; }
  const ranura = document.createElement("div"); ranura.className = "ranura";
  let quiereAbrir = false;
  const puerta = crearPuerta(async () => {
    const m = await import("./constructor.ts");
    quitar();
    const ui = m.montarConstructor(c, view, boton, panel, { ...extra, cuerpos, ranura });
    if (quiereAbrir) { quiereAbrir = false; boton.click(); } // the person pressed «Construir» (or C) while the chunk was on its way
    return ui;
  }, "constructor");
  // until then: the button shows for builders only (the real builder keeps this up afterwards)
  const verBoton = (): void => { if (boton.hidden === c.estado.puede) boton.hidden = !c.estado.puede; };
  verBoton();
  const sinOirEstado = c.escuchar(verBoton);
  const pulsar = (): void => { quiereAbrir = true; void puerta.cargarYa().catch(() => { quiereAbrir = false; }); };
  const alBoton = (e: MouseEvent): void => { e.stopImmediatePropagation(); pulsar(); if (e.detail > 0) boton.blur(); };
  const alTeclado = (e: KeyboardEvent): void => {
    if (escribiendo(e) || !c.estado.puede || e.code !== "KeyC" || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation(); pulsar();
  };
  boton.addEventListener("click", alBoton);
  addEventListener("keydown", alTeclado, { capture: true });
  function quitar(): void { sinOirEstado(); boton.removeEventListener("click", alBoton); removeEventListener("keydown", alTeclado, { capture: true }); }

  const puedeEditar = (id: string): boolean => c.estado.puede && !!c.objeto(id);
  return {
    alIr: (donde) => puerta.real()?.alIr(donde) ?? false, // the builder cannot be open before it exists: nothing to select
    puedeEditar,
    editar: (id) => { const r = puerta.real(); if (r) return r.editar(id); if (!puedeEditar(id)) return false; puerta.despues((u) => { u.editar(id); }); void puerta.cargarYa().catch(() => {}); return true; },
    irAObjeto: (id): Res => { const r = puerta.real(); if (r) return r.irAObjeto(id); if (!c.estado.puede) return { ok: false, why: "no tienes permiso para construir aquí" }; puerta.despues((u) => { u.irAObjeto(id); }); void puerta.cargarYa().catch(() => {}); return { ok: true }; },
    cajon: (id) => cuerpos[id], ranuraFicha: ranura,
    abrirCajon: (id) => { const r = puerta.real(); if (r) r.abrirCajon(id); else if (id) { puerta.despues((u) => u.abrirCajon(id)); void puerta.cargarYa().catch(() => {}); } },
    cajonAbierto: () => puerta.real()?.cajonAbierto() ?? "",
  };
}
