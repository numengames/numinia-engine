// t_45ef2f70: the cable panel's façade. cable.ts (the builder's «Cable» drawer: the wiring as a sentence, ~8 kB gz with its
// phrases) only draws into the drawer's body, which the builder's façade already hands out, so it waits for the first
// frame. `refrescar` and `mostrar` are queued until it lands; «Mostrar» (the drawer opening on it) brings it at once.
import { crearPuerta } from "./puerta.ts";

type Opciones = Parameters<typeof import("./cable.ts").montarCable>[0];
type Real = ReturnType<typeof import("./cable.ts").montarCable>;

export function montarCablePuerta(o: Opciones): Real {
  const puerta = crearPuerta<Real>(async () => (await import("./cable.ts")).montarCable(o), "cable");
  return {
    refrescar: () => puerta.despues((r) => r.refrescar()),
    mostrar: () => { puerta.despues((r) => r.mostrar()); void puerta.cargarYa().catch(() => {}); },
  };
}
