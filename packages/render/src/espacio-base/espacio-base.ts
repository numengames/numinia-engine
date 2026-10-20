// espacio-base (H2): the ONE piece that turns the «espacio base» on. A world brings `espacio-base.json` (`espacio-base@1`, validated by
// features/espaciobase/esquema.ts); the page calls `aplicar(datos)` and this builds the ground (one indexed mesh, one draw call, one material: material.ts),
// hides the flat ground and the engine's landmark pillars while it is on, lays the night atmosphere (atmosfera.ts → entorno.atmosfera) and tears all of it
// down again when it is switched off. The world is EMPTY on purpose: no grass, trees or fauna. Without a file nothing is built and nothing is loaded:
// the heavy modules are imported on the first `aplicar` that asks (cargador.ts), so the page's size before the first draw does not grow.
//
// COPIED / CHANGED: the structure (idempotent `aplicar`, key by data + tier, rebuild when the tier changes, lazy door, ground hidden/restored, hitos hidden/
// restored, atmosphere undo) is render/naturaleza/naturaleza.ts's, with none of its trees, grass, water or fauna. The ground height is `alturaBase`
// (relieve/espacio-base.ts H1), the same function the collision mesh uses (sim/terreno-malla.ts), so the avatar stands on what is drawn.
import * as THREE from "three/webgpu";
import type { Nivel } from "../calidad.ts";
import type { Atmosfera } from "../entorno.ts";
import { alturaBase } from "../../../relieve/src/espacio-base.ts";
import { ocultarHitos } from "../naturaleza/hitos.ts";
import { atmosferaEspacioBase } from "./atmosfera.ts";
import { construirMalla, LLAMADAS } from "./malla.ts";
import type { Malla } from "./malla.ts";
import { crearMaterialBase, crearMaterialPuntos } from "./material.ts";

/** What the page receives from features/espaciobase (flat, validated on the server). Every field optional: defaults below. */
export type EspacioBaseDatos = { activa?: boolean; semilla?: number };
export type EspacioBaseNormal = { activa: boolean; semilla: number };
/** Defaults: kept equal to features/espaciobase/esquema.ts `DEFECTOS` (a test compares them). */
export const DEFECTOS_ESPACIO_BASE: EspacioBaseNormal = { activa: true, semilla: 1234 };
/** Clamp whatever arrives into a usable set (the server already validated; this keeps the page safe against a newer/older server). */
export function normalizar(d: EspacioBaseDatos): EspacioBaseNormal {
  const D = DEFECTOS_ESPACIO_BASE;
  return {
    activa: d.activa !== false,
    semilla: typeof d.semilla === "number" && Number.isFinite(d.semilla) ? Math.min(2147483647, Math.max(0, Math.round(d.semilla))) : D.semilla,
  };
}

export type HEspacioBase = {
  /** Where the group goes (the engine's `world` group). */
  padre: THREE.Object3D;
  /** The flat ground: hidden while the espacio base is on, shown again when it goes off. */
  ground: THREE.Object3D;
  /** The device tier right now (entorno.nivel). */
  nivel: () => Nivel;
  /** The engine's landmark pillars (index.ts): hidden while on (naturaleza/hitos.ts). Absent = untouched. */
  hitos?: () => Iterable<THREE.Object3D>;
  /** entorno.diaU: the engine's day factor (uniform 0 night … 1 day) the colours follow. */
  dia: Parameters<typeof crearMaterialBase>[0];
  /** entorno.ts `atmosfera`: lays the night sky + fog over the world's while on; returns the undo. Absent = the world's own look. */
  atmosfera?: (a: Atmosfera) => () => void;
};

type Real = { grupo: THREE.Group; malla: THREE.LineSegments; puntos: THREE.Mesh; nivel: Nivel; datos: EspacioBaseNormal; m: Malla; hmin: number; hmax: number; groundVisible: boolean; mostrarHitos: (() => void) | null; quitarAtmosfera: (() => void) | null; msConstruir: number };
export type EstadisticasEspacioBase = { activa: boolean; nivel: Nivel | null; clave: string; lineas: number; vertices: number; llamadas: number; msConstruir: number; hmin: number; hmax: number };

export function crearEspacioBase(h: HEspacioBase) {
  let real: Real | null = null, clave = "", ticket = 0, ultimos: EspacioBaseDatos | null = null;

  function desmontar(): void {
    if (!real) return;
    for (const o of [real.malla, real.puntos]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    real.grupo.removeFromParent();
    h.ground.visible = real.groundVisible;  // the flat ground comes back exactly as it was
    real.mostrarHitos?.();                  // and so do the landmark pillars
    real.quitarAtmosfera?.();               // and the world's own sky, fog and tone
    real = null;
  }

  function construir(d: EspacioBaseNormal, nivel: Nivel): Real {
    const t0 = performance.now();
    const quitarAtmosfera = h.atmosfera ? h.atmosfera(atmosferaEspacioBase()) : null;
    const m = construirMalla(d.semilla, nivel);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.posicion, 3));
    g.setAttribute("tipo", new THREE.BufferAttribute(m.tipo, 1));
    g.setIndex(new THREE.BufferAttribute(m.indice, 1));
    g.computeBoundingSphere();
    const malla = new THREE.LineSegments(g, crearMaterialBase(h.dia));
    malla.name = "espacio-base"; malla.userData.mapa = "suelo"; malla.userData.sinSombra = true;
    malla.frustumCulled = false; malla.matrixAutoUpdate = false; malla.updateMatrix(); // one object that is almost always in view: no per-frame culling
    const gp = new THREE.BufferGeometry(), P = m.puntos; // the accents' dots: one mesh of tiny camera-facing quads (the second and last draw call)
    gp.setAttribute("position", new THREE.BufferAttribute(P.posicion, 3)); gp.setAttribute("esquina", new THREE.BufferAttribute(P.esquina, 2)); gp.setAttribute("tipo", new THREE.BufferAttribute(P.tipo, 1)); gp.setIndex(new THREE.BufferAttribute(P.indice, 1));
    const puntos = new THREE.Mesh(gp, crearMaterialPuntos(h.dia));
    puntos.name = "espacio-base-puntos"; puntos.userData.sinSombra = true; puntos.frustumCulled = false; puntos.matrixAutoUpdate = false; puntos.updateMatrix(); puntos.renderOrder = 1;
    const grupo = new THREE.Group(); grupo.name = "espacio-base"; grupo.add(malla, puntos);
    h.padre.add(grupo);
    const groundVisible = h.ground.visible; h.ground.visible = false;
    const mostrarHitos = h.hitos ? ocultarHitos(h.hitos()) : null;
    return { grupo, malla, puntos, nivel, datos: d, m, hmin: m.hmin, hmax: m.hmax, groundVisible, mostrarHitos, quitarAtmosfera, msConstruir: Math.round((performance.now() - t0) * 10) / 10 };
  }

  /** Switch the espacio base on, change it or switch it off. Idempotent: the same data on the same tier does nothing. */
  async function aplicar(datos: EspacioBaseDatos | null | undefined): Promise<void> {
    ultimos = datos ?? null;
    const d = datos ? normalizar(datos) : null, nivel = h.nivel();
    const nueva = d && d.activa ? JSON.stringify([d, nivel]) : "";
    if (nueva === clave) return;
    clave = nueva;
    ++ticket;
    desmontar();
    if (d && d.activa) real = construir(d, nivel);
  }

  /** Once per frame: only notices a change of tier (cheap when off: one null check). The mesh itself never moves. */
  function actualizar(_dt: number): void {
    if (real && h.nivel() !== real.nivel) void aplicar(ultimos);
  }

  function estadisticas(): EstadisticasEspacioBase {
    if (!real) return { activa: false, nivel: null, clave, lineas: 0, vertices: 0, llamadas: 0, msConstruir: 0, hmin: 0, hmax: 0 };
    return { activa: true, nivel: real.nivel, clave, lineas: real.m.lineas, vertices: real.m.vertices, llamadas: LLAMADAS, msConstruir: real.msConstruir, hmin: real.hmin, hmax: real.hmax };
  }

  return {
    aplicar, actualizar, estadisticas, dispose: () => { ticket++; clave = ""; desmontar(); },
    get activa(): boolean { return real !== null; },
    /** The ground's height at a point (the very function the collision uses); null while off. For walking tests and photos. */
    alturaEn: (x: number, z: number): number | null => (real ? alturaBase(real.datos.semilla, x, z) : null),
    get grupo(): THREE.Group | null { return real?.grupo ?? null; },
  };
}
export type EspacioBase = ReturnType<typeof crearEspacioBase>;
