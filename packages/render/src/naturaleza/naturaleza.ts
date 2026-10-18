// naturaleza (N4): the ONE piece that turns the low-poly nature on. A world brings `naturaleza.json` (`naturaleza@1`, validated
// by features/naturaleza/esquema.ts); the page calls `aplicar(datos)` and this builds terrain (N1) + trees (N2) + grass (N3) +
// the pond's water as one set that shares a budget, hides the flat ground only while it is on, and tears everything down again
// (geometry, materials, the ground back) when it is switched off. Without a file nothing is built and nothing is loaded: the
// heavy modules are imported on the first `aplicar` that asks for it (the page's size before the first draw does not grow).
//
// NOTHING NEW IS DRAWN WHEN IT IS OFF: no object is created in the constructor. Draw calls when on (measured, see
// docs/NATURALEZA.md N4): terrain 1 + trees ≤ 5 + grass ≤ 2 + water 1.
//
// COPIED / CHANGED / COMBINED: this file only wires the three finished pieces (terreno.ts, arboles.ts, hierba.ts), the stylised
// water (agua-estilo.ts) and the engine's wind uniform (`vientoU`, entorno.ts); the scatter is esparcir.ts. What it adds: one
// switch, one shared seed, palettes (meadow + leaves only), idempotent `aplicar`, a rebuild when the device tier changes.
import * as THREE from "three/webgpu";
import type { Nivel } from "../calidad.ts";
import type { Paleta } from "./esparcir.ts";
import { HIERBA_POR_NIVEL } from "./niveles.ts";

/** What the page receives from features/naturaleza (flat, validated on the server). Every field optional: defaults below. */
export type NaturalezaDatos = {
  activa?: boolean; semilla?: number; tamano?: number; plaza?: number; arboles?: number; hierba?: number; estanque?: boolean; paleta?: string;
};
export type NaturalezaNormal = { activa: boolean; semilla: number; tamano: number; plaza: number; arboles: number; hierba: number; estanque: boolean; paleta: Paleta };
/** Defaults: kept equal to features/naturaleza/esquema.ts `DEFECTOS` (a test compares them). */
export const DEFECTOS_NATURALEZA: NaturalezaNormal = { activa: true, semilla: 1234, tamano: 200, plaza: 12, arboles: 1, hierba: 1, estanque: true, paleta: "verano" };

const num = (v: unknown, d: number, a: number, b: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
/** Clamp whatever arrives into a usable set (the server already validated; this keeps the page safe against a newer/older server). */
export function normalizar(d: NaturalezaDatos): NaturalezaNormal {
  const D = DEFECTOS_NATURALEZA;
  return {
    activa: d.activa !== false, semilla: Math.round(num(d.semilla, D.semilla, 0, 2147483647)), tamano: Math.round(num(d.tamano, D.tamano, 100, 400)), plaza: Math.round(num(d.plaza, D.plaza, 4, 40)),
    arboles: num(d.arboles, D.arboles, 0, 1), hierba: num(d.hierba, D.hierba, 0, 1), estanque: d.estanque !== false,
    paleta: d.paleta === "otono" || d.paleta === "primavera" ? d.paleta : "verano",
  };
}

/** Meadow and forest-floor colours per palette (hex). Leaves change through esparcir.ts (`VARIANTE_POR_PALETA`: which trees wear their second colour set). */
export const COLORES_PALETA: Record<Paleta, { terreno: { prado?: number; bosque?: number }; hierba: { prado?: number; bosque?: number; seco?: number } }> = {
  verano: { terreno: {}, hierba: {} },
  primavera: { terreno: { prado: 0xa9d46a, bosque: 0x5a9a4a }, hierba: { prado: 0xa9d46a, bosque: 0x5a9a4a, seco: 0xd8dd88 } },
  otono: { terreno: { prado: 0xc2ae54, bosque: 0x8a7a38 }, hierba: { prado: 0xc2ae54, bosque: 0x8f8a3a, seco: 0xb9803a } },
};

export type HNaturaleza = {
  /** Where the nature group goes (the engine's `world` group). */
  padre: THREE.Object3D;
  /** The flat ground: hidden while the nature is on, shown again when it goes off. */
  ground: THREE.Object3D;
  /** The engine's wind (entorno.ts `vientoU`). */
  vientoU: unknown;
  /** The device tier right now (entorno.nivel). */
  nivel: () => Nivel;
  camara: THREE.Object3D;
  /** The local player's feet (the grass bends away from them) or null. */
  yo: () => { x: number; y: number; z: number } | null;
  /** The fog colour (hex) the terrain's border fades to. */
  niebla: () => number;
  /** entorno.ts `aguaLuz` and `detalleAgua(nivel, agua)`: what the pond's water reads. */
  aguaLuz?: unknown;
  detalleAgua?: () => unknown;
};

type Real = {
  arboles: import("./arboles.ts").Arboles; hierba: import("./hierba.ts").Hierba; terreno: import("./terreno.ts").Terreno;
  agua: { malla: THREE.Mesh; t: { value: number } } | null; grupo: THREE.Group; nivel: Nivel; datos: NaturalezaNormal;
  puntos: readonly import("./arboles.ts").PuntoArbol[]; groundVisible: boolean; msConstruir: number;
};
export type EstadisticasNaturaleza = {
  activa: boolean; nivel: Nivel | null; clave: string;
  triangulos: { terreno: number; arboles: number; hierba: number; hierbaVivos: number; total: number }; llamadas: { terreno: number; arboles: number; hierba: number; agua: number; total: number };
  arboles: number; msConstruir: number;
};

export function crearNaturaleza(h: HNaturaleza) {
  let real: Real | null = null, clave = "", ticket = 0, reloj = 0, ultimos: NaturalezaDatos | null = null;
  const cargar = () => Promise.all([import("./terreno.ts"), import("./arboles.ts"), import("./hierba.ts"), import("./esparcir.ts"), import("../agua-estilo.ts"), import("three/tsl")]);

  function desmontar(): void {
    if (!real) return;
    real.hierba.dispose(); real.arboles.dispose(); real.terreno.dispose();
    if (real.agua) { real.agua.malla.geometry.dispose(); (real.agua.malla.material as THREE.Material).dispose(); }
    real.grupo.removeFromParent();
    h.ground.visible = real.groundVisible;          // the flat ground comes back exactly as it was
    real = null;
  }

  function construir(m: Awaited<ReturnType<typeof cargar>>, d: NaturalezaNormal, nivel: Nivel): Real {
    const [T, A, H, E, AG, TSL] = m, t0 = performance.now();
    const pal = COLORES_PALETA[d.paleta], grupo = new THREE.Group(); grupo.name = "naturaleza";
    const terreno = T.crearTerreno({ semilla: d.semilla, nivel, tamano: d.tamano, plaza: d.plaza, niebla: h.niebla(), escena: grupo, sinEstanque: !d.estanque, colores: pal.terreno, recibeSombra: nivel === "A" });
    terreno.malla.userData.mapa = "suelo";
    const puntos = E.esparcirArboles(terreno, { semilla: d.semilla, tamano: d.tamano, plaza: d.plaza, densidad: d.arboles, nivel, paleta: d.paleta, estanque: d.estanque ? terreno.estanque : null });
    const arboles = A.crearArboles({ vientoU: h.vientoU as never, nivel, camara: h.camara }, puntos);
    grupo.add(arboles.grupo);
    const hierba = H.crearHierba({ vientoU: h.vientoU, nivel }, { alturaEn: terreno.alturaEn, zonaEn: terreno.zonaEn, colores: pal.hierba },
      { semilla: d.semilla, nivel, escena: grupo, empujaCamara: false, tabla: d.hierba >= 1 ? undefined : { tuftsMax: Math.max(40, Math.round(HIERBA_POR_NIVEL[nivel].tuftsMax * d.hierba)) } });
    let agua: Real["agua"] = null;
    if (d.estanque) {
      const t = TSL.uniform(0) as unknown as { value: number }, r = terreno.estanque.radio * 1.2, forma = { tipo: "circulo" as const, radio: r };
      const detalle = (h.detalleAgua?.() ?? { olas: 0, espuma: false, lineas: false, caustica: false, destellos: false }) as never;
      const mat = AG.materialDeAgua({ color: 0x2f6f8f, forma, detalle, tiempo: t, luz: h.aguaLuz as never, bordeOculto: r * 0.12 }, 12);
      const malla = new THREE.Mesh(AG.geometriaDeAgua(forma, detalle, 12), mat);
      malla.position.set(terreno.estanque.x, terreno.estanque.nivel, terreno.estanque.z);
      malla.name = "agua-naturaleza"; malla.userData.sinSombra = true; malla.frustumCulled = true; malla.matrixAutoUpdate = false; malla.updateMatrix();
      grupo.add(malla); agua = { malla, t };
    }
    h.padre.add(grupo);
    const groundVisible = h.ground.visible; h.ground.visible = false;
    const p = h.camara.position;
    hierba.llenarTodo(h.camara);                      // fill the ring now (a one-off cost at the load), not over the first frames
    arboles.repartir(p.x, p.y, p.z);
    return { arboles, hierba, terreno, agua, grupo, nivel, datos: d, puntos, groundVisible, msConstruir: Math.round((performance.now() - t0) * 10) / 10 };
  }

  /** Switch the nature on, change it or switch it off. Idempotent: the same data on the same tier does nothing. Async only the first time (modules load). */
  async function aplicar(datos: NaturalezaDatos | null | undefined): Promise<void> {
    ultimos = datos ?? null;
    const d = datos ? normalizar(datos) : null, nivel = h.nivel();
    const nueva = d && d.activa ? JSON.stringify([d, nivel]) : "";
    if (nueva === clave) return;
    clave = nueva;
    const mi = ++ticket;
    if (!d || !d.activa) { desmontar(); return; }
    const m = await cargar();
    if (mi !== ticket) return;                        // a newer call came in while the modules loaded
    desmontar();
    real = construir(m, d, nivel);
  }

  /** Once per frame (cheap when off: one null check). */
  function actualizar(dt: number): void {
    if (!real) return;
    if (h.nivel() !== real.nivel) { void aplicar(ultimos); return; } // the device tier changed (VR in/out): rebuild for the new one
    reloj += dt;
    const yo = h.yo();
    real.arboles.actualizar(reloj);
    real.hierba.actualizar(h.camara, reloj, yo ? [yo] : []);
    if (real.agua) real.agua.t.value = reloj;
  }

  function estadisticas(): EstadisticasNaturaleza {
    if (!real) return { activa: false, nivel: null, clave, triangulos: { terreno: 0, arboles: 0, hierba: 0, hierbaVivos: 0, total: 0 }, llamadas: { terreno: 0, arboles: 0, hierba: 0, agua: 0, total: 0 }, arboles: 0, msConstruir: 0 };
    const ea = real.arboles.estadisticas(), eh = real.hierba.estadisticas();
    const tris = { terreno: real.terreno.triangulos, arboles: ea.triangulos, hierba: eh.triangulosEnviados, hierbaVivos: eh.triangulosVivos, total: 0 };
    tris.total = tris.terreno + tris.arboles + tris.hierba;
    const ll = { terreno: 1, arboles: ea.llamadas, hierba: eh.dibujos, agua: real.agua ? 1 : 0, total: 0 };
    ll.total = ll.terreno + ll.arboles + ll.hierba + ll.agua;
    return { activa: true, nivel: real.nivel, clave, triangulos: tris, llamadas: ll, arboles: real.puntos.length, msConstruir: real.msConstruir };
  }

  return {
    aplicar, actualizar, estadisticas, dispose: () => { ticket++; clave = ""; desmontar(); },
    get activa(): boolean { return real !== null; },
    /** The terrain's pure functions (height, zone) and pond, for walking, collision (N5) and tests; null while off. */
    get terreno(): import("./terreno.ts").Terreno | null { return real?.terreno ?? null; },
    get arboles(): readonly import("./arboles.ts").PuntoArbol[] { return real?.puntos ?? []; },
    get grupo(): THREE.Group | null { return real?.grupo ?? null; },
  };
}
export type Naturaleza = ReturnType<typeof crearNaturaleza>;
