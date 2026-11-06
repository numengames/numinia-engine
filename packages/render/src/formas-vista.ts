// formas-vista: the always-present face of the flat shapes (formas-planas.ts). The real code is fetched with the first shape that arrives, so a world
// that mirrors nothing never downloads it (the same recipe as pesca-vista.ts).
import type * as THREE from "three/webgpu";
import type { FormaPlana } from "./formas-planas.ts";

export type { FormaPlana };
type Real = ReturnType<typeof import("./formas-planas.ts")["crearFormas"]>;

export function vistaFormas(h: { world: THREE.Object3D }) {
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  const pedidas = new Map<string, FormaPlana>(); // what was asked, so shapes asked before the chunk arrives are drawn when it does
  // M6: estante / tableta / tablero / guia live in formas-extra.ts, a chunk of their own fetched when the first of them is asked for
  const EXTRA = new Set(["estante", "tableta", "tablero", "guia"]), esExtra = (f: FormaPlana | null): boolean => !!f && EXTRA.has(f.forma);
  let extraListo = false, cargaExtra: Promise<void> | null = null;
  const pintarPedidas = () => { if (!real) return; for (const [k, f] of pedidas) if (extraListo || !EXTRA.has(f.forma)) real.poner(k, f); };
  const cargar = () => (carga ??= import("./formas-planas.ts").then((m) => {
    real = m.crearFormas(h);
    pintarPedidas();
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[formas] no se pudieron cargar: ${fallo}`); }));
  const cargarExtra = () => (cargaExtra ??= Promise.all([cargar(), import("./formas-extra.ts")]).then(([, x]) => { if (!real) return; real.registrar(x.HACER_EXTRA); extraListo = true; pintarPedidas(); }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[formas] no se pudieron cargar las formas extra: ${fallo}`); }));
  return {
    poner(key: string, f: FormaPlana | null): void {
      if (f) pedidas.set(key, f); else pedidas.delete(key);
      if (esExtra(f)) { if (real && extraListo) real.poner(key, f); else void cargarExtra(); return; }
      if (real) real.poner(key, f); else if (f) void cargar();
    },
    mover(key: string, x: number, z: number, rumbo: number): void { const p = pedidas.get(key); if (p) pedidas.set(key, { ...p, x, z, rumbo }); real?.mover(key, x, z, rumbo); },
    actualizar(): void { real?.actualizar(); },
    ocupado(): boolean { return real ? real.ocupado() : pedidas.size > 0 && !fallo; },
    cuantas(): number { return real?.cuantas() ?? 0; },
    claves(): string[] { return real?.claves() ?? []; },
    /** Where (and with what state and way) a shape was last asked for (checks and tools). */
    donde(key: string): { x: number; z: number; rumbo?: number; estado: string; forma: string } | null { const p = pedidas.get(key); return p ? { x: p.x, z: p.z, rumbo: p.rumbo, estado: p.estado, forma: p.forma } : null; },
  };
}
