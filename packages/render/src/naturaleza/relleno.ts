// relleno (naturaleza R5.1): the shade fill of the nature's Lambert materials (terrain + baked Residuos, trees). No light, no
// pass, no draw call, no triangle: one emissive term per material and two shared colour uniforms set once per frame.
//
// WHY: three r186's MeshLambert(Node)Material ignores `scene.environment` (only the Standard/Physical materials read it), while
// entorno.ts treats that environment as THE ambient when the HDR light is on and lowers the hemisphere to 0.3 (≈ 0.1 of the
// albedo after Lambert's 1/π). So every face the sun does not reach — undersides of ruins and rocks, the back of branches, the
// ground under a shadow — kept 3–4 % of its colour and read pure black. This gives back the ambient the nature misses.
//
// COPIED / CHANGED: the idea is a baked hemisphere light (three's HemisphereLight: mix(ground, sky, n·up × ½ + ½)) and the
// stylised «shade colour» of Zelda BotW-like toon shading (the shaded side is a cool hue, never black). Changed: the colours
// come from paleta.ts (`RELLENO`: cool sea-green below, warm sand above), the weight is the FLAT facet's normal (facets stay
// readable), and its strength follows the engine's own ambient scalars (`scene.environmentIntensity`, which the hour already
// dims, × the hemisphere colour's brightness, which the hour lerps to night blue): at night it fades with the garden.
import * as THREE from "three/webgpu";
import { uniform, vec3, dot, mix, clamp, normalFlat, transformNormalToView, diffuseColor } from "three/tsl";
import { RELLENO } from "./paleta.ts";

type N = ReturnType<typeof import("three/tsl").float>;
type V3N = ReturnType<typeof vec3>;

/** Fill strength by day when the HDR environment is on (the nature misses all of it), and when it is off (the hemisphere is at 0.9 then: a smaller lift). Tuned on photos r5-1-*. */
export const GANANCIA_RELLENO = { conEntorno: 0.55, sinEntorno: 0.3 } as const;
/** Linear luminance of the engine's default day sky-ambient (entorno.ts `ambienteCielo` 0xbcd6ee): the fill is full at or above it. */
const LUM_DIA = 0.62;

const cielo = new THREE.Color(RELLENO.arriba), suelo = new THREE.Color(RELLENO.abajo); // linear (ColorManagement converts the sRGB hex)
const arribaU = uniform(new THREE.Color(0, 0, 0)), abajoU = uniform(new THREE.Color(0, 0, 0));

/**
 * The emissive node of a nature material: the material's own diffuse colour × the fill colour of its facet's orientation.
 * `arriba` (0 down … 1 up) overrides the weight (default: the flat facet's normal against the world's up, in view space).
 */
export function nodoRelleno(arriba?: N): V3N {
  const w = arriba ?? (clamp(dot(normalFlat as unknown as V3N, transformNormalToView(vec3(0, 1, 0)) as unknown as V3N).mul(0.5).add(0.5), 0, 1) as unknown as N);
  return (diffuseColor as unknown as { rgb: V3N }).rgb.mul(mix(abajoU as unknown as V3N, arribaU as unknown as V3N, w)) as unknown as V3N;
}

/** Pure: the fill strength from the engine's ambient numbers (tests pin it: 0 without ambient, dim at night, never above day). */
export function fuerzaRelleno(entornoIntensidad: number, conEntorno: boolean, hemiColor: { r: number; g: number; b: number } | null): number {
  const lum = hemiColor ? 0.2126 * hemiColor.r + 0.7152 * hemiColor.g + 0.0722 * hemiColor.b : LUM_DIA;
  const noche = Math.min(1, Math.max(0, lum / LUM_DIA));
  return Math.max(0, entornoIntensidad) * (conEntorno ? GANANCIA_RELLENO.conEntorno : GANANCIA_RELLENO.sinEntorno) * noche;
}

let escenaVista: THREE.Object3D | null = null, hemi: THREE.HemisphereLight | null = null;
/** Once per frame (two colour writes): read the scene's ambient numbers from wherever `desde` hangs and set the fill uniforms. */
export function actualizarRelleno(desde: THREE.Object3D): void {
  let raiz = desde; while (raiz.parent) raiz = raiz.parent;
  if (raiz !== escenaVista) { // the scene changed (first frame, or a rebuild): find its hemisphere once
    escenaVista = raiz; hemi = null;
    raiz.traverse((o) => { if (!hemi && (o as THREE.HemisphereLight).isHemisphereLight) hemi = o as THREE.HemisphereLight; });
  }
  const s = raiz as THREE.Scene, k = s.isScene ? fuerzaRelleno(s.environmentIntensity ?? 0, !!s.environment, hemi ? (hemi as THREE.HemisphereLight).color : null) : 0;
  (arribaU.value as THREE.Color).copy(cielo).multiplyScalar(k);
  (abajoU.value as THREE.Color).copy(suelo).multiplyScalar(k);
}
