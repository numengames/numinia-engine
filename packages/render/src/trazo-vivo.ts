// J18b story 4, second slice (MIS-222 t_1b395abe): the stroke being painted, live under the hand. ONE mesh, ONE draw call, buffers allocated for the
// worst stroke (600 points × 8 sides, ≈ 115 kB) and rewritten only where the tube grew (trazo-tubo.ts `crearTuboVivo`, the same generator as the
// world's stroke: what you see under your hand is what the others get). The brush-tip marker (an octahedron in the paint colour) rides in the
// same buffer, so «in paint mode» is 1 draw call and «painting» is still that same 1. Only YOU see this mesh: the world's copy arrives by the
// state once the stroke is saved (trazo.ts); until it does, the finished live mesh stays on as a «ghost» (so the line never blinks out between
// letting go and the server's answer) and is dropped a moment after the save is answered. Lazy: nothing of this is fetched until someone paints.
import * as THREE from "three/webgpu";
import { INDICES_PUNTA, crearTuboVivo, type TuboVivo } from "./trazo-tubo.ts";
import { materialDe } from "./trazo.ts";

/** How long a finished stroke stays drawn after its save was answered (ms): the file must be fetched and the world's tube built. */
export const FANTASMA_MS = 700;
/** …and when the save is never answered (a stroke the caller did not wait for). */
export const FANTASMA_SIN_RESPUESTA_MS = 3000;

/** The tip marker's radius for a brush this wide (m): a little more than the line itself, never a dot too small to find nor a ball in the way. */
const radioPunta = (grosor: number): number => Math.max(0.006, Math.min(0.02, (grosor / 2) * 1.3));

type Vivo = { tubo: TuboVivo; geo: THREE.BufferGeometry; malla: THREE.Mesh; color: number; grosor: number };
type Fantasma = { malla: THREE.Mesh; geo: THREE.BufferGeometry; hasta: number };

export function crearTrazoVivo(o: { world: THREE.Object3D }) {
  let vivo: Vivo | null = null, pintando = false, sucio = false, punta: [number, number, number] | null = null;
  const fantasmas: Fantasma[] = [];

  function nuevo(color: number, grosor: number): Vivo {
    const tubo = crearTuboVivo(grosor), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(tubo.posiciones, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(tubo.normales, 3));
    geo.setIndex(new THREE.BufferAttribute(tubo.indices, 1));
    const malla = new THREE.Mesh(geo, materialDe(color));
    malla.frustumCulled = false; // it moves with the hand, a few centimetres from the eyes: never worth a bounding-sphere refit
    malla.userData.sinSombra = true; malla.visible = false; malla.name = "trazo-vivo";
    o.world.add(malla);
    return { tubo, geo, malla, color, grosor };
  }
  const aseguro = (color: number, grosor: number): Vivo => {
    if (vivo && (vivo.color !== color || vivo.grosor !== grosor)) { if (pintando) return vivo; quitar(vivo); vivo = null; }
    return (vivo ??= nuevo(color, grosor));
  };
  function quitar(v: { malla: THREE.Mesh; geo: THREE.BufferGeometry }): void { o.world.remove(v.malla); v.geo.dispose(); }

  /** Upload only what changed, and set what to draw. */
  function sincronizar(): void {
    if (!vivo || !sucio) return;
    sucio = false;
    const { tubo, geo } = vivo, pos = geo.getAttribute("position") as THREE.BufferAttribute, nor = geo.getAttribute("normal") as THREE.BufferAttribute, ind = geo.getIndex()!;
    const c = tubo.cambios();
    pos.clearUpdateRanges(); nor.clearUpdateRanges(); ind.clearUpdateRanges();
    for (const [a, b] of c.vertices) { pos.addUpdateRange(a * 3, (b - a) * 3); nor.addUpdateRange(a * 3, (b - a) * 3); }
    if (c.indices) ind.addUpdateRange(c.indices[0], c.indices[1] - c.indices[0]);
    if (c.vertices.length) { pos.needsUpdate = true; nor.needsUpdate = true; }
    if (c.indices) ind.needsUpdate = true;
    const d = tubo.dibujo(true);
    geo.setDrawRange(d.inicio, d.cuenta);
    vivo.malla.visible = d.cuenta > 0;
  }

  return {
    /** Paint mode with no stroke yet: just the tip marker in the colour about to be used (null: nothing at all). */
    marcar(p: readonly number[] | null, color = 0, grosor = 0.015): void {
      punta = p ? [p[0]!, p[1]!, p[2]!] : null;
      if (!punta && !vivo) return;
      const v = aseguro(color, grosor);
      v.tubo.marcar(punta, radioPunta(v.grosor)); sucio = true;
    },
    /** A stroke begins (a new one while another was frozen is fine: the old one stays on as a ghost). */
    empezar(color: number, grosor: number): void {
      pintando = false; const v = aseguro(color, grosor); pintando = true;
      v.tubo.reiniciar(); sucio = true;
    },
    /** A control point of the stroke being painted (the same ones the brush keeps and saves). */
    anadir(q: readonly number[]): void { if (vivo && pintando) { vivo.tubo.anadir(q); sucio = true; } },
    /** Where the hand is now (the tip marker with it): the tube reaches it between control points. */
    seguir(q: readonly number[]): void {
      if (!vivo) return;
      punta = [q[0]!, q[1]!, q[2]!];
      if (pintando) vivo.tubo.seguir(q);
      vivo.tubo.marcar(punta, radioPunta(vivo.grosor)); sucio = true;
    },
    /** The hand let go: the tube stays drawn as a ghost until the save is answered (+ FANTASMA_MS), then goes (the world's copy takes its place). */
    terminar(guardado?: Promise<unknown>): void {
      const v = vivo; if (!v || !pintando) return;
      pintando = false; sincronizar();
      const f: Fantasma = { malla: v.malla, geo: v.geo, hasta: performance.now() + FANTASMA_SIN_RESPUESTA_MS };
      const d = v.tubo.dibujo(false); f.geo.setDrawRange(d.inicio, d.cuenta); f.malla.visible = d.cuenta > 0; // without the tip marker
      fantasmas.push(f); vivo = null;
      if (guardado) void guardado.then(() => { f.hasta = performance.now() + FANTASMA_MS; }, () => { f.hasta = 0; });
      if (punta) { const v2 = aseguro(v.color, v.grosor); v2.tubo.marcar(punta, radioPunta(v2.grosor)); sucio = true; }
    },
    /** B: the stroke in progress is thrown away at once (the tip marker stays while paint mode does). */
    cancelar(): void { if (!vivo) return; pintando = false; vivo.tubo.reiniciar(); vivo.tubo.marcar(punta, radioPunta(vivo.grosor)); sucio = true; },
    /** Leaving paint mode: no marker, no stroke in progress (ghosts finish their own time). */
    apagar(): void { pintando = false; punta = null; if (vivo) { quitar(vivo); vivo = null; } sucio = false; },
    /** Every frame, after the page moved the brush: upload what changed, drop the ghosts whose time is up. */
    actualizar(ahora = performance.now()): void {
      sincronizar();
      for (let i = fantasmas.length - 1; i >= 0; i--) if (ahora >= fantasmas[i]!.hasta) { quitar(fantasmas[i]!); fantasmas.splice(i, 1); }
    },
    /** For checks: is something drawn, how many triangles, how many ghosts, how many draw calls this costs (1 for the live mesh + 1 per ghost). */
    contar(): { visible: boolean; pintando: boolean; triangulos: number; anillos: number; puntos: number; fantasmas: number; llamadas: number } {
      const t = vivo?.tubo, vis = !!vivo?.malla.visible;
      return { visible: vis, pintando, triangulos: t?.triangulos ?? 0, anillos: t?.anillos ?? 0, puntos: t?.puntos ?? 0, fantasmas: fantasmas.length, llamadas: (vis ? 1 : 0) + fantasmas.filter((f) => f.malla.visible).length };
    },
    /** For the tip marker's size in checks. */
    indicesPunta: INDICES_PUNTA,
  };
}
export type TrazoVivo = ReturnType<typeof crearTrazoVivo>;
