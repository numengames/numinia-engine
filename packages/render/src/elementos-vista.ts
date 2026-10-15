// elementos-vista: the always-present face of the elements (H4/H8). The real code (particles, water, fire light:
// elementos.ts) is fetched with the first element that arrives, so a world without water or fire never downloads it.
import type * as THREE from "three/webgpu";
import type { Entorno } from "./entorno.ts";

type Datos = Record<string, unknown>;
export type Cuenta = { agua: number; fuego: number; humo: number; polvo: number; particulas: number; emisores: number; luces: number; animando: number; reflejos: number; cargado: boolean };
type Real = { poner(k: string, v: Datos | null): void; actualizar(dt: number): void; ocupado(): boolean; contar(): Cuenta };

export function vistaElementos(h: { renderer: THREE.WebGPURenderer; scene: THREE.Scene; world: THREE.Group; camera: THREE.PerspectiveCamera; entorno: Entorno }) {
  const pendientes = new Map<string, Datos | null>();
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  return {
    /** Put, change or take away (`null`) an element by its key (features/elementos fields, read by name). */
    poner(key: string, v: Datos | null): void {
      if (real) return real.poner(key, v);
      pendientes.set(key, v);
      carga ??= import("./elementos.ts").then((m) => {
        real = m.crearElementos(h);
        for (const [k, x] of pendientes) real.poner(k, x);
        pendientes.clear();
      }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[elementos] no se pudo cargar: ${fallo}`); });
    },
    actualizar(dt: number): void { real?.actualizar(dt); },
    /** True while something near and on screen moves (fire, water, dust) or the code is arriving. */
    ocupado(): boolean { return real ? real.ocupado() : pendientes.size > 0 && !fallo; },
    /** What is drawn now (for checks): elements by type, particles, emitters, fire lights, animating ones. */
    contar(): Cuenta { return real?.contar() ?? { agua: 0, fuego: 0, humo: 0, polvo: 0, particulas: 0, emisores: 0, luces: 0, animando: 0, reflejos: 0, cargado: false }; },
  };
}
