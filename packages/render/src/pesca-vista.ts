// pesca-vista: the always-present face of fishing (v2). The real code (pond, boardwalk, sign, rod, line, float, the
// landed fish: pesca.ts) is fetched with the first fishing spot or float that arrives, so a world without fishing
// never downloads it.
import type * as THREE from "three/webgpu";
import type { Sitio3D, Flotador3D, Captura3D, Estado3D, Ayudas } from "./pesca.ts";

type Real = ReturnType<typeof import("./pesca.ts")["crearPesca"]>;
const NADA = { pescadores: 0, sitios: 0, peces: 0, enMano: [] as number[], manoReal: false, cargado: false };

export function vistaPesca(h: Ayudas) {
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  let sitios: Sitio3D[] = [], flotadores: Flotador3D[] = [], capturas: Captura3D[] = [], yo = -1, estado: Estado3D | null = null;
  const cargar = () => (carga ??= import("./pesca.ts").then((m) => {
    real = m.crearPesca(h);
    real.sitios(sitios); real.flotadores(flotadores, yo); real.capturas(capturas, yo); if (estado) real.estado(estado);
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[pesca] no se pudo cargar: ${fallo}`); }));
  return {
    sitios(lista: Sitio3D[]): void { sitios = lista; if (real) real.sitios(lista); else if (lista.length) cargar(); },
    /** Where to stand at a spot (its boardwalk) and which way the water is; null until the chunk is here. */
    sitio(id: string): ReturnType<Real["sitio"]> { return real?.sitio(id) ?? null; },
    flotadores(lista: Flotador3D[], self: number): void { flotadores = lista; yo = self; if (real) real.flotadores(lista, self); else if (lista.length) cargar(); },
    /** v2: the fish landed near you (yours included), each held in its angler's hand for a while. */
    capturas(lista: Captura3D[], self: number): void { capturas = lista; yo = self; if (real) real.capturas(lista, self); else if (lista.length) cargar(); },
    estado(e: Estado3D): void { estado = e; real?.estado(e); },
    actualizar(dt: number): void { real?.actualizar(dt); },
    ocupado(): boolean { return real ? real.ocupado() : (sitios.length > 0 || flotadores.length > 0 || capturas.length > 0) && !fallo && !!carga; },
    contar(): typeof NADA { return real?.contar() ?? NADA; },
  };
}
