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
// F4: the fauna (butterflies, fireflies, birds: fauna.ts) is a SECOND lazy door: it is imported only when `fauna` is on, and changing only
// `faunaDensidad`/`faunaEspecies` (or the switch) rebuilds just the fauna, never the terrain, trees or grass.
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import type { Nivel } from "../calidad.ts";
import type { TablaFauna } from "../../../relieve/src/fauna.ts";
import { ESTACIONES, COLOR_ESTANQUE } from "./paleta.ts";
import type { Estacion } from "./paleta.ts";
import { HIERBA_POR_NIVEL } from "./niveles.ts";
import { actualizarRelleno } from "./relleno.ts";
import { ocultarHitos } from "./hitos.ts";

/** What the page receives from features/naturaleza (flat, validated on the server). Every field optional: defaults below. */
export type NaturalezaDatos = {
  activa?: boolean; semilla?: number; tamano?: number; plaza?: number; arboles?: number; hierba?: number; estanque?: boolean;
  /** The world's season (paleta.ts ESTACIONES: verano, otono, primavera). `paleta` is its legacy name; R5.2 also reads `estacion` (wins). */
  paleta?: string; estacion?: string;
  /** F1: the fauna switch, its density 0–1 and the allow-list of species ids joined by commas ("" = all). */
  fauna?: boolean; faunaDensidad?: number; faunaEspecies?: string;
};
/** `paleta` = the world's season (kept under its N4 name: it is the field the server state travels with). */
export type NaturalezaNormal = { activa: boolean; semilla: number; tamano: number; plaza: number; arboles: number; hierba: number; estanque: boolean; paleta: Estacion; fauna: boolean; faunaDensidad: number; faunaEspecies: string };
/** Defaults: kept equal to features/naturaleza/esquema.ts `DEFECTOS` (a test compares them). */
export const DEFECTOS_NATURALEZA: NaturalezaNormal = { activa: true, semilla: 1234, tamano: 200, plaza: 12, arboles: 1, hierba: 1, estanque: true, paleta: "verano", fauna: true, faunaDensidad: 1, faunaEspecies: "" };

/** R5.2: the season a world asks for: `estacion` (new key) or the legacy `paleta` (same values); anything else = summer. */
export function estacionDeDatos(d: { estacion?: unknown; paleta?: unknown }): Estacion {
  const e = d.estacion ?? d.paleta;
  return typeof e === "string" && (Object.keys(ESTACIONES) as string[]).includes(e) ? (e as Estacion) : "verano";
}

const num = (v: unknown, d: number, a: number, b: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
/** Clamp whatever arrives into a usable set (the server already validated; this keeps the page safe against a newer/older server). */
export function normalizar(d: NaturalezaDatos): NaturalezaNormal {
  const D = DEFECTOS_NATURALEZA;
  return {
    activa: d.activa !== false, semilla: Math.round(num(d.semilla, D.semilla, 0, 2147483647)), tamano: Math.round(num(d.tamano, D.tamano, 100, 400)), plaza: Math.round(num(d.plaza, D.plaza, 4, 40)),
    arboles: num(d.arboles, D.arboles, 0, 1), hierba: num(d.hierba, D.hierba, 0, 1), estanque: d.estanque !== false,
    paleta: estacionDeDatos(d),
    fauna: d.fauna !== false, faunaDensidad: num(d.faunaDensidad, D.faunaDensidad, 0, 1), faunaEspecies: typeof d.faunaEspecies === "string" ? d.faunaEspecies.slice(0, 512) : "",
  };
}

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
  /** F4: the world's hour of day 0–24 (the same clock the sky uses; see index.ts). Absent = noon. */
  hora?: () => number;
  /** F4: the fauna table (F1). Absent = no fauna (the page's composition root hands over the house table, lazily). */
  tablaFauna?: () => Promise<TablaFauna>;
  /** F5: the audio core (audio/nucleo.ts `audio()`), lazily. Absent = the fauna is silent. The sound module is a third lazy door: not fetched on tier D. */
  nucleo?: () => import("./sonido.ts").HSonido["nucleo"];
  /** R6.1: the engine's landmark pillars (index.ts). Hidden while the nature is on (hitos.ts: no draw calls); off = back as the environment wants them. Absent = untouched. */
  hitos?: () => Iterable<THREE.Object3D>;
};

type Real = {
  arboles: import("./arboles.ts").Arboles; hierba: import("./hierba.ts").Hierba; terreno: import("./terreno.ts").Terreno;
  agua: { malla: THREE.Mesh; t: { value: number } } | null; grupo: THREE.Group; nivel: Nivel; datos: NaturalezaNormal; fauna: import("./fauna.ts").Fauna | null; sonido: import("./sonido.ts").SonidoFauna | null; claveFauna: string; msFauna: number;
  puntos: readonly import("./arboles.ts").PuntoArbol[]; groundVisible: boolean; msConstruir: number;
  /** R6.1: shows the landmark pillars again (as the environment wants them). */
  mostrarHitos: (() => void) | null;
};
export type EstadisticasNaturaleza = {
  activa: boolean; nivel: Nivel | null; clave: string;
  triangulos: { terreno: number; arboles: number; hierba: number; hierbaVivos: number; fauna: number; total: number }; llamadas: { terreno: number; arboles: number; hierba: number; agua: number; fauna: number; total: number };
  arboles: number; msConstruir: number; /** F4: build time of the fauna alone (ms), 0 = off. */ msFauna: number;
  /** F4: what the fauna shows right now (null = off). `triangulosPeor` = every pool full. */
  fauna: import("./fauna.ts").EstadisticasFauna | null;
};

const SIN_EMPUJAR: readonly never[] = [];
export function crearNaturaleza(h: HNaturaleza) {
  const empuja: { x: number; y: number; z: number }[] = [];
  let real: Real | null = null, clave = "", ticket = 0, ticketSonido = 0, reloj = 0, ultimos: NaturalezaDatos | null = null;
  const cargar = () => Promise.all([import("./terreno.ts"), import("./arboles.ts"), import("./hierba.ts"), import("./esparcir.ts"), import("../agua-estilo.ts")]);

  /** Pure data → the part of the key that the fauna alone owns. */
  const claveDeFauna = (d: NaturalezaNormal) => JSON.stringify([d.fauna, d.faunaDensidad, d.faunaEspecies]);
  const claveBase = (d: NaturalezaNormal, nivel: Nivel) => JSON.stringify([{ ...d, fauna: 0, faunaDensidad: 0, faunaEspecies: "" }, nivel]);

  /** Fauna only: remove the old one and, when wanted, build the new one. Terrain, trees and grass are not touched. */
  function ponerFauna(F: typeof import("./fauna.ts") | null, tabla: TablaFauna | null, d: NaturalezaNormal): void {
    if (!real) return;
    real.fauna?.dispose(); real.fauna = null; real.sonido?.dispose(); real.sonido = null;
    real.datos = d; real.claveFauna = claveDeFauna(d); real.msFauna = 0;
    if (!F || !tabla) return;
    const t0 = performance.now();
    real.fauna = F.crearFauna({ semilla: d.semilla, nivel: real.nivel, densidad: d.faunaDensidad, especies: d.faunaEspecies, vientoU: h.vientoU, camara: h.camara, escena: real.grupo, hora: h.hora ?? (() => 12), tabla, turnos: real.nivel !== "A", alturaEn: real.terreno.alturaEn, zonaEn: real.terreno.zonaEn });
    real.fauna.llenarTodo(h.camara, reloj);
    if (h.nucleo && real.nivel !== "D") { // F5: the creatures' sound, a lazy chunk of its own; it builds no node until the shared gesture
      const r = real, mi = ticketSonido = ++ticketSonido;
      void import("./sonido.ts").then((S) => {
        if (real !== r || r.fauna === null || mi !== ticketSonido || r.sonido) return;
        r.sonido = S.crearSonidoFauna({ nucleo: h.nucleo!(), nivel: r.nivel, camara: h.camara, tabla, fauna: { semilla: d.semilla, densidad: d.faunaDensidad, especies: d.faunaEspecies ? d.faunaEspecies.split(",").map((x) => x.trim()).filter(Boolean) : undefined, alturaEn: r.terreno.alturaEn, zonaEn: r.terreno.zonaEn, hora: h.hora ?? (() => 12) } });
      });
    }
    real.msFauna = Math.round((performance.now() - t0) * 10) / 10;
  }
  /** The fauna wants a table and a non-zero density; only then is its chunk fetched. */
  const quiereFauna = (d: NaturalezaNormal) => d.fauna && d.faunaDensidad > 0 && !!h.tablaFauna;
  async function traerFauna(d: NaturalezaNormal): Promise<[typeof import("./fauna.ts"), TablaFauna] | null> {
    if (!quiereFauna(d)) return null;
    return Promise.all([import("./fauna.ts"), h.tablaFauna!()]);
  }

  function desmontar(): void {
    if (!real) return;
    real.fauna?.dispose(); real.sonido?.dispose(); ticketSonido++;
    real.hierba.dispose(); real.arboles.dispose(); real.terreno.dispose();
    if (real.agua) { real.agua.malla.geometry.dispose(); (real.agua.malla.material as THREE.Material).dispose(); }
    real.grupo.removeFromParent();
    h.ground.visible = real.groundVisible;          // the flat ground comes back exactly as it was
    real.mostrarHitos?.();                          // R6.1: and so do the engine's landmark pillars
    real = null;
  }

  function construir(m: Awaited<ReturnType<typeof cargar>>, d: NaturalezaNormal, nivel: Nivel): Real {
    const [T, A, H, E, AG] = m, t0 = performance.now();
    const estacion = d.paleta, grupo = new THREE.Group(); grupo.name = "naturaleza";
    // R5.2: every colour comes from paleta.ts: the season picks the meadow/grass/leaf sets (ESTACIONES), the pond wears COLOR_ESTANQUE at every tier
    const terreno = T.crearTerreno({ semilla: d.semilla, nivel, tamano: d.tamano, plaza: d.plaza, niebla: h.niebla(), escena: grupo, sinEstanque: !d.estanque, estacion, recibeSombra: nivel === "A", aguaPlana: nivel === "D" ? COLOR_ESTANQUE : undefined });
    terreno.malla.userData.mapa = "suelo";
    const puntos = E.esparcirArboles(terreno, { semilla: d.semilla, tamano: d.tamano, plaza: d.plaza, densidad: d.arboles, nivel, paleta: estacion, estanque: d.estanque ? terreno.estanque : null });
    const arboles = A.crearArboles({ vientoU: h.vientoU as never, nivel, camara: h.camara }, puntos);
    grupo.add(arboles.grupo);
    const hierba = H.crearHierba({ vientoU: h.vientoU, nivel }, { alturaEn: terreno.alturaEn, zonaEn: terreno.zonaEn, franjaEn: terreno.franjaEn, estacion },
      { semilla: d.semilla, nivel, escena: grupo, empujaCamara: false, tabla: d.hierba >= 1 ? undefined : { tuftsMax: Math.max(40, Math.round(HIERBA_POR_NIVEL[nivel].tuftsMax * d.hierba)) } });
    let agua: Real["agua"] = null;
    if (d.estanque && nivel !== "D") { // N6: on tier D the pond is painted into the terrain mesh (one draw call less)
      const t = uniform(0) as unknown as { value: number }, r = terreno.estanque.radio * 1.2, forma = { tipo: "circulo" as const, radio: r };
      const detalle = (h.detalleAgua?.() ?? { olas: 0, espuma: false, lineas: false, caustica: false, destellos: false }) as never;
      const mat = AG.materialDeAgua({ color: COLOR_ESTANQUE, forma, detalle, tiempo: t, luz: h.aguaLuz as never, bordeOculto: r * 0.12 }, 12);
      const malla = new THREE.Mesh(AG.geometriaDeAgua(forma, detalle, 12), mat);
      malla.position.set(terreno.estanque.x, terreno.estanque.nivel, terreno.estanque.z);
      malla.name = "agua-naturaleza"; malla.userData.sinSombra = true; malla.frustumCulled = true; malla.matrixAutoUpdate = false; malla.updateMatrix();
      grupo.add(malla); agua = { malla, t };
    }
    h.padre.add(grupo);
    const groundVisible = h.ground.visible; h.ground.visible = false;
    const mostrarHitos = h.hitos ? ocultarHitos(h.hitos()) : null; // R6.1: no toy boxes on the meadow (hidden, not recoloured)
    const p = h.camara.position;
    hierba.llenarTodo(h.camara);                      // fill the ring now (a one-off cost at the load), not over the first frames
    arboles.repartir(p.x, p.y, p.z);
    return { arboles, hierba, terreno, agua, grupo, nivel, datos: d, fauna: null, sonido: null, claveFauna: claveDeFauna(d), msFauna: 0, puntos, groundVisible, mostrarHitos, msConstruir: Math.round((performance.now() - t0) * 10) / 10 };
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
    // F4: only the fauna's numbers changed on a world that is already built → rebuild just the fauna
    if (real && claveBase(real.datos, real.nivel) === claveBase(d, nivel)) {
      const f = await traerFauna(d);
      if (mi !== ticket) return;
      ponerFauna(f?.[0] ?? null, f?.[1] ?? null, d);
      return;
    }
    const [m, f] = await Promise.all([cargar(), traerFauna(d)]);
    if (mi !== ticket) return;                        // a newer call came in while the modules loaded
    desmontar();
    real = construir(m, d, nivel);
    ponerFauna(f?.[0] ?? null, f?.[1] ?? null, d);
  }

  /** Once per frame (cheap when off: one null check). */
  function actualizar(dt: number): void {
    if (!real) return;
    if (h.nivel() !== real.nivel) { void aplicar(ultimos); return; } // the device tier changed (VR in/out): rebuild for the new one
    reloj += dt;
    actualizarRelleno(real.grupo); // R5.1: the shade fill follows the hour and the world's ambient (two colour writes)
    const yo = h.yo();
    real.arboles.actualizar(reloj);
    real.hierba.actualizar(h.camara, reloj, yo ? (empuja[0] = yo, empuja) : SIN_EMPUJAR); // F4 audit: no array per frame
    if (real.agua) real.agua.t.value = reloj;
    real.fauna?.actualizar(h.camara, reloj);
    real.sonido?.actualizar(h.camara, reloj);  // F5: returns at once except every ~0.1 s
  }

  function estadisticas(): EstadisticasNaturaleza {
    if (!real) return { activa: false, nivel: null, clave, triangulos: { terreno: 0, arboles: 0, hierba: 0, hierbaVivos: 0, fauna: 0, total: 0 }, llamadas: { terreno: 0, arboles: 0, hierba: 0, agua: 0, fauna: 0, total: 0 }, arboles: 0, msConstruir: 0, msFauna: 0, fauna: null };
    const ea = real.arboles.estadisticas(), eh = real.hierba.estadisticas();
    const tris = { terreno: real.terreno.triangulos, arboles: ea.triangulos, hierba: eh.triangulosEnviados, hierbaVivos: eh.triangulosVivos, fauna: 0, total: 0 }, ef = real.fauna?.estadisticas() ?? null;
    tris.fauna = ef?.triangulos ?? 0; tris.total = tris.terreno + tris.arboles + tris.hierba + tris.fauna;
    const ll = { terreno: 1, arboles: ea.llamadas, hierba: eh.dibujos, agua: real.agua ? 1 : 0, fauna: ef?.llamadas ?? 0, total: 0 };
    ll.total = ll.terreno + ll.arboles + ll.hierba + ll.agua + ll.fauna;
    return { activa: true, nivel: real.nivel, clave, triangulos: tris, llamadas: ll, arboles: real.puntos.length, msConstruir: real.msConstruir, msFauna: real.msFauna, fauna: ef };
  }

  return {
    aplicar, actualizar, estadisticas, dispose: () => { ticket++; clave = ""; desmontar(); },
    get activa(): boolean { return real !== null; },
    /** The terrain's pure functions (height, zone) and pond, for walking, collision (N5) and tests; null while off. */
    get terreno(): import("./terreno.ts").Terreno | null { return real?.terreno ?? null; },
    get arboles(): readonly import("./arboles.ts").PuntoArbol[] { return real?.puntos ?? []; },
    get grupo(): THREE.Group | null { return real?.grupo ?? null; },
    /** F4: the live fauna (insectos, aves) for tests and photos; null while off. */
    get fauna(): import("./fauna.ts").Fauna | null { return real?.fauna ?? null; },
    /** F5: the live creature sound (null while off, on tier D, or before its chunk arrives). */
    get sonido(): import("./sonido.ts").SonidoFauna | null { return real?.sonido ?? null; },
  };
}
export type Naturaleza = ReturnType<typeof crearNaturaleza>;
