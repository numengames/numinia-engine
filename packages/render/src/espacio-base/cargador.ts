// espacio-base (H2): the lazy door, the same recipe as naturaleza/cargador.ts. The page's start bundle holds ONLY this file (type-only imports, no three):
// the piece (espacio-base.ts + mesh + material + sky) is a separate chunk fetched by `import()` the first time a world hands over espacio-base data.
// A world without espacio-base.json never calls `aplicar` with data, so it downloads zero bytes of it.
import type * as THREE from "three/webgpu";
import type { HEspacioBase, EspacioBaseDatos, EspacioBase, EstadisticasEspacioBase } from "./espacio-base.ts";

export function crearEspacioBasePerezoso(h: HEspacioBase) {
  let real: EspacioBase | null = null, cargando: Promise<EspacioBase> | null = null;
  const traer = () => (cargando ??= import("./espacio-base.ts").then((m) => (real = m.crearEspacioBase(h))));
  return {
    /** Data → load the piece (once) and apply; nothing/garbage while never loaded → nothing happens (and nothing is fetched). */
    async aplicar(datos: EspacioBaseDatos | null | undefined): Promise<void> {
      if (!real && (typeof datos !== "object" || datos === null)) return;
      await (real ?? (await traer())).aplicar(datos);
    },
    actualizar(dt: number): void { real?.actualizar(dt); },
    /** Before the piece has loaded: only `{ activa: false }`. */
    estadisticas: (): Partial<EstadisticasEspacioBase> => real?.estadisticas() ?? { activa: false },
    dispose(): void { real?.dispose(); },
    get activa(): boolean { return real?.activa ?? false; },
    alturaEn: (x: number, z: number): number | null => real?.alturaEn(x, z) ?? null,
    get grupo(): THREE.Group | null { return real?.grupo ?? null; },
  };
}
export type EspacioBasePerezoso = ReturnType<typeof crearEspacioBasePerezoso>;
