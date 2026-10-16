// pesca-vista: the always-present face of fishing (v1). The real code (rod, line, float, pond disc: pesca.ts) is fetched
// with the first fishing spot or float that arrives, so a world without fishing never downloads it.
import type * as THREE from "three/webgpu";
import type { Sitio3D, Flotador3D, Estado3D, Quien } from "./pesca.ts";

type Real = ReturnType<typeof import("./pesca.ts")["crearPesca"]>;

export function vistaPesca(h: { world: THREE.Group; posicionDe: (quien: Quien) => THREE.Vector3 | null }) {
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  let sitios: Sitio3D[] = [], flotadores: Flotador3D[] = [], yo = -1, estado: Estado3D | null = null;
  const cargar = () => (carga ??= import("./pesca.ts").then((m) => {
    real = m.crearPesca(h);
    real.sitios(sitios); real.flotadores(flotadores, yo); if (estado) real.estado(estado);
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[pesca] no se pudo cargar: ${fallo}`); }));
  return {
    sitios(lista: Sitio3D[]): void { sitios = lista; if (real) real.sitios(lista); else if (lista.length) cargar(); },
    flotadores(lista: Flotador3D[], self: number): void { flotadores = lista; yo = self; if (real) real.flotadores(lista, self); else if (lista.length) cargar(); },
    estado(e: Estado3D): void { estado = e; real?.estado(e); },
    actualizar(dt: number): void { real?.actualizar(dt); },
    ocupado(): boolean { return real ? real.ocupado() : (sitios.length > 0 || flotadores.length > 0) && !fallo && !!carga; },
    contar() { return real?.contar() ?? { pescadores: 0, sitios: 0, cargado: false }; },
  };
}
