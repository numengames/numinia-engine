// naturaleza (N4b): the lazy door. The page's start bundle holds ONLY this file (type-only imports, no three): the piece itself
// (naturaleza.ts + terrain, trees, grass, water, palettes) is a separate chunk fetched by `import()` the first time a world hands
// over naturaleza data. A world without naturaleza.json never calls `aplicar` with data, so it downloads zero nature bytes.
// The server already validated the data (features/naturaleza/esquema.ts); here only a cheap `typeof` check.
import type * as THREE from "three/webgpu";
import type { HNaturaleza, NaturalezaDatos, Naturaleza, EstadisticasNaturaleza } from "./naturaleza.ts";

/**
 * F4: the world's hour of day (0–24) for the fauna, from the environment data the sky is built from (entorno.ts keeps the last data).
 * The sky follows `hora` only when `solHora` is true (the server then also moves the sun); in that case `hora` IS the clock.
 * Otherwise the author set the sun by hand: read the hour off the sun (altitude + side) with the inverse of features/entorno `solDeHora`,
 * where altitude = 65·sin(π(h−6)/12) and bearing = 15°·(h−12): high sun → noon, below the horizon → midnight, low → 6.5 h or 19 h by side.
 */
export function horaDeEntorno(d: Record<string, unknown> | null | undefined): number {
  if (!d) return 12;
  const n = (v: unknown, x: number) => (typeof v === "number" && Number.isFinite(v) ? v : x);
  if (d.solHora === true && typeof d.hora === "number" && Number.isFinite(d.hora)) return ((d.hora % 24) + 24) % 24;
  const alt = n(d.solAltura, 45), rumbo = n(d.solRumbo, 30);
  if (alt > 12) return 12;
  if (alt <= -6) return 0;
  const h = 12 + rumbo / 15;
  return alt > 3 ? (h < 12 ? 8 : 17) : h < 12 ? 6.5 : 19;
}

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
    get fauna() { return real?.fauna ?? null; },
    /** F4: the page's composition root says where the fauna table comes from (a lazy `import()`, so the table is fetched only with the fauna). */
    tablaFauna(f: HNaturaleza["tablaFauna"]): void { h.tablaFauna = f; },
  };
}
export type NaturalezaPerezosa = ReturnType<typeof crearNaturalezaPerezosa>;
