// fauna (F4): wires the electronic butterflies + fireflies (mariposas.ts, F2) and the birds (aves.ts, F3) to ONE nature world: the terrain's
// `alturaEn/zonaEn`, the engine's wind uniform, the device tier, the world hour and the F1 table. This file is the second lazy door of the nature
// chunk: naturaleza.ts imports it with `import()` only when the world's fauna is on, so a nature world with `fauna: { activa: false }` never
// fetches the two fauna modules (nor the table). It adds no look of its own and no per-frame work beyond the two `actualizar` calls.
// Draw calls when on: butterflies 1 + fireflies 1 (only while it is dark) + birds 1 = ≤ 3.
import type * as THREE from "three/webgpu";
import type { Nivel } from "../calidad.ts";
import type { TablaFauna } from "../../../relieve/src/fauna.ts";
import type { Zona } from "./terreno.ts";
import { crearInsectos } from "./mariposas.ts";
import { crearAves } from "./aves.ts";

export type OpcionesFauna = {
  semilla: number; nivel: Nivel; densidad: number;
  /** The allow-list joined by commas ("" = every breed of the table). */
  especies: string;
  vientoU: unknown; camara: THREE.Object3D; escena: THREE.Object3D;
  /** The world's hour of day, 0–24. */
  hora: () => number;
  tabla: TablaFauna;
  /** Butterflies and fireflies take turns (one insect draw call at a time): the tiers whose call budget has no room for both. Default: A only is false. */
  turnos?: boolean;
  alturaEn: (x: number, z: number) => number; zonaEn: (x: number, z: number) => Zona;
};
export type EstadisticasFauna = { llamadas: number; triangulos: number; triangulosPeor: number; mariposas: number; luciernagas: number; pajaros: number; msUltimo: number };

export function crearFauna(o: OpcionesFauna) {
  const lista = o.especies ? o.especies.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const fuente = { semilla: o.semilla, alturaEn: o.alturaEn, zonaEn: o.zonaEn };
  const h = { vientoU: o.vientoU, nivel: o.nivel, camara: o.camara, hora: o.hora, tabla: o.tabla };
  const insectos = crearInsectos(h, fuente, { escena: o.escena, densidad: o.densidad, especies: lista, turnos: o.turnos ?? o.nivel !== "A" });
  const aves = crearAves(h, fuente, { escena: o.escena, densidad: o.densidad, especies: lista });
  let ms = 0;
  return {
    insectos, aves,
    /** Once per frame, with the camera and the world clock (seconds). */
    actualizar(camara: THREE.Object3D, tReloj: number): void {
      const t0 = performance.now();
      insectos.actualizar(camara, tReloj); aves.actualizar(camara, tReloj);
      ms = performance.now() - t0;
    },
    /** Read every cell now (the loading moment), never per frame. */
    llenarTodo(camara: THREE.Object3D, tReloj: number): void { insectos.llenarTodo(camara, tReloj); aves.llenarTodo(camara, tReloj); },
    estadisticas(): EstadisticasFauna {
      const i = insectos.estadisticas(), a = aves.estadisticas();
      return {
        llamadas: i.dibujos + a.dibujos, triangulos: i.triangulosEnviados + a.triangulosEnviados,
        // the pools full: every butterfly slot, every firefly slot and every bird slot at once (the most the tier could ever send)
        triangulosPeor: insectos.config.capM * insectos.config.triMariposa + insectos.config.capL * insectos.config.triLuciernaga + a.triangulosPeor,
        mariposas: i.mariposas, luciernagas: i.luciernagas, pajaros: a.pajaros, msUltimo: ms,
      };
    },
    dispose(): void { insectos.dispose(); aves.dispose(); },
  };
}
export type Fauna = ReturnType<typeof crearFauna>;
