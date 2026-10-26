// J18b story 2–3 (MIS-222 t_1b395abe): an `objetos` thing of kind «trazo» (a `/a/<sha>.trazo` file, trazo@1) drawn as a tube. The same
// generator as the brush will use (trazo-tubo.ts). Flat colour, one shared material per palette colour (PRI-008, a draw call each, no
// texture). COST: a world may draw at most `TRAZOS_TRIANGULOS_MAX` stroke triangles at once (limits.json `stroke_world_triangles_max`):
// the strokes nearest to the person load first (the loader's own order), the one that would pass the cap is refused with a reason.
import * as THREE from "three/webgpu";
import type { Medio } from "./medios.ts";
import { PALETA_TRAZO, tuboDe } from "./trazo-tubo.ts";

/** The most stroke triangles drawn at once (all strokes of the world together). 300 000 = ~31 full strokes or ~150 of 200 points (design §3.4). */
export const TRAZOS_TRIANGULOS_MAX = 300_000;
const NO_CABE = "el mundo ya tiene todos los trazos que caben: borra alguno";

let dibujados = 0;
/** Stroke triangles drawn right now (all strokes of this page). */
export const trianguloTrazosDibujados = (): number => dibujados;

const materiales = new Map<number, THREE.MeshStandardMaterial>();
export const materialDe = (c: number): THREE.MeshStandardMaterial => {
  let m = materiales.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: PALETA_TRAZO[c] ?? PALETA_TRAZO[0], roughness: 0.85, metalness: 0 }); materiales.set(c, m); }
  return m;
};

/** A parsed stroke (already checked by the server when it was uploaded; this reads it again with no trust: anything odd → an error, never a throw into the frame loop). */
export function leerTrazo(texto: string): { color: number; grosor: number; puntos: number[][] } {
  const v = JSON.parse(texto) as { color?: unknown; grosor?: unknown; puntos?: unknown };
  if (!Array.isArray(v.puntos) || v.puntos.length < 2 || v.puntos.length > 600) throw new Error("trazo sin puntos válidos");
  if (!Number.isInteger(v.color) || (v.color as number) < 0 || (v.color as number) > 7) throw new Error("trazo con color fuera de la paleta");
  if (typeof v.grosor !== "number" || !(v.grosor >= 0.003 && v.grosor <= 0.06)) throw new Error("trazo con grosor fuera de tope");
  const puntos = (v.puntos as unknown[]).map((q) => { if (!Array.isArray(q) || q.length !== 4 || !q.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("trazo con un punto roto"); return q as number[]; });
  return { color: v.color as number, grosor: v.grosor, puntos };
}

/** The mesh of one stroke, as a medium of its slot (medios.ts' shape): `soltar` gives its triangles back to the cap. */
export function trazoDe(texto: string, lejos = false): Medio {
  const t = leerTrazo(texto), tubo = tuboDe(t, { lejos });
  if (!tubo.triangulos) throw new Error("trazo sin tramo que dibujar");
  if (dibujados + tubo.triangulos > TRAZOS_TRIANGULOS_MAX) throw new Error(NO_CABE);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(tubo.posiciones, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(tubo.normales, 3));
  geo.setIndex(new THREE.BufferAttribute(tubo.indices, 1)); geo.computeBoundingSphere();
  const malla = new THREE.Mesh(geo, materialDe(t.color));
  malla.userData.sinSombra = true; // a thin line in the air: no shadow cost
  dibujados += tubo.triangulos;
  let vivo = true;
  return { obj: malla, actualizar() {}, sonando: () => false, soltar() { if (!vivo) return; vivo = false; dibujados -= tubo.triangulos; geo.dispose(); } };
}

/** Download a `.trazo` and draw it. */
export async function cargarTrazo(url: string): Promise<Medio> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo leer el trazo (${r.status})`);
  return trazoDe(await r.text());
}
