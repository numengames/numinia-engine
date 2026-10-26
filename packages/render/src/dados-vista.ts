// dados-vista: the always-present face of the 3D dice (lote 8 mesa). The real code (dados-3d.ts: geometry, numerals, the
// fall) is fetched with the first roll that has a model to draw, so a world without dice, or a phone or a headset (story 2),
// never downloads it. The fall itself is a pure function of the roll (dados-caida.ts): this only draws it.
import type { Tirada3D, Visto } from "./dados-3d.ts";
import { tiene3D } from "./dados-caida.ts";
import type * as THREE from "three/webgpu";

type Real = ReturnType<typeof import("./dados-3d.ts")["crearDados3D"]>;
export type AyudasVista = { world: THREE.Object3D; /** false = do not draw dice at all (phone, VR, AR): the card and the label still say the roll. */ permitido: () => boolean };

export function vistaDados(h: AyudasVista) {
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  let pendiente: Tirada3D | null = null; // a roll that arrived while the chunk loads: drawn the moment it is here (the fall starts then)
  const cargar = () => (carga ??= import("./dados-3d.ts").then((m) => {
    real = m.crearDados3D({ world: h.world });
    if (pendiente) { real.tirar(pendiente); pendiente = null; }
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[dados] no se pudo cargar los dados 3D: ${fallo}`); }));
  return {
    /** Draw a roll the server numbered, falling into `bandeja`. Returns false when nothing is drawn (no model for these dice, not allowed here). */
    tirar(t: Tirada3D): boolean {
      if (!tiene3D(t.caras) || !t.valores.length || !h.permitido()) return false;
      if (real) return real.tirar(t) > 0;
      pendiente = t; cargar(); return true;
    },
    quitar(sitio: string): void { if (pendiente?.sitio === sitio) pendiente = null; real?.quitar(sitio); },
    actualizar(dt: number): void { real?.actualizar(dt); },
    ocupado(): boolean { return real ? real.ocupado() : !!pendiente && !fallo; },
    contar(): Visto[] { return real?.contar() ?? []; },
  };
}
