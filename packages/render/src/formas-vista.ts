// formas-vista: the always-present face of the flat shapes (formas-planas.ts). The real code is fetched with the first shape that arrives, so a world
// that mirrors nothing never downloads it (the same recipe as pesca-vista.ts).
import type * as THREE from "three/webgpu";
import type { FormaPlana } from "./formas-planas.ts";

export type { FormaPlana };
type Real = ReturnType<typeof import("./formas-planas.ts")["crearFormas"]>;

export function vistaFormas(h: { world: THREE.Object3D }) {
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  const pedidas = new Map<string, FormaPlana>(); // what was asked, so shapes asked before the chunk arrives are drawn when it does
  const cargar = () => (carga ??= import("./formas-planas.ts").then((m) => {
    real = m.crearFormas(h);
    for (const [k, f] of pedidas) real.poner(k, f);
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[formas] no se pudieron cargar: ${fallo}`); }));
  return {
    poner(key: string, f: FormaPlana | null): void {
      if (f) pedidas.set(key, f); else pedidas.delete(key);
      if (real) real.poner(key, f); else if (f) void cargar();
    },
    actualizar(): void { real?.actualizar(); },
    ocupado(): boolean { return real ? real.ocupado() : pedidas.size > 0 && !fallo; },
    cuantas(): number { return real?.cuantas() ?? 0; },
    claves(): string[] { return real?.claves() ?? []; },
  };
}
