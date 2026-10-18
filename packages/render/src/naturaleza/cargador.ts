// naturaleza (N4b): the lazy door. The page's start bundle holds ONLY this file (type-only imports, no three): the piece itself
// (naturaleza.ts + terrain, trees, grass, water, palettes) is a separate chunk fetched by `import()` the first time a world hands
// over naturaleza data. A world without naturaleza.json never calls `aplicar` with data, so it downloads zero nature bytes.
// The server already validated the data (features/naturaleza/esquema.ts); here only a cheap `typeof` check.
import type * as THREE from "three/webgpu";
import type { HNaturaleza, NaturalezaDatos, Naturaleza, EstadisticasNaturaleza } from "./naturaleza.ts";

export function crearNaturalezaPerezosa(h: HNaturaleza) {
  let real: Naturaleza | null = null, cargando: Promise<Naturaleza> | null = null;
  const traer = () => (cargando ??= import("./naturaleza.ts").then((m) => (real = m.crearNaturaleza(h))));
  return {
    /** Data → load the piece (once) and apply; nothing/garbage while never loaded → nothing happens (and nothing is fetched). */
    async aplicar(datos: NaturalezaDatos | null | undefined): Promise<void> {
      if (!real && (typeof datos !== "object" || datos === null)) return;
      await (real ?? (await traer())).aplicar(datos);
    },
    actualizar(dt: number): void { real?.actualizar(dt); },
    /** Before the piece has loaded: only `{ activa: false }` (the full shape comes with the chunk). */
    estadisticas: (): Partial<EstadisticasNaturaleza> => real?.estadisticas() ?? { activa: false },
    dispose(): void { real?.dispose(); },
    get activa(): boolean { return real?.activa ?? false; },
    get terreno() { return real?.terreno ?? null; },
    get arboles() { return real?.arboles ?? []; },
    get grupo(): THREE.Group | null { return real?.grupo ?? null; },
  };
}
export type NaturalezaPerezosa = ReturnType<typeof crearNaturalezaPerezosa>;
