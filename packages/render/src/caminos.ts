// caminos: thin glowing strips on the floor with a pulse of light running along them, from the plaza to each workshop (entorno.json
// `caminos`). ONE mesh and ONE draw call for every path of the world; the pulse is a single animation in the shader (a time uniform,
// no per-frame CPU work beyond that scalar). Additive, no depth write, no shadows, no raycast. Tier A animates, only while the player
// is near a path; B, C and D draw the strip with the pulse frozen (so a still page stays still: phones stay cool). Builds nothing
// until a world declares paths. Policy and geometry: caminos-politica.ts.
import * as THREE from "three/webgpu";
import { uniform, attribute, float, fract, smoothstep, abs, mix, clamp } from "three/tsl";
import type { Nivel } from "./calidad.ts";
import { decodificarCaminos, detalleCaminos, geometriaCaminos, cercaDeCamino, PULSO_CADA_M, PULSO_VEL } from "./caminos-politica.ts";
import type { Camino } from "./caminos-politica.ts";

const COLOR_DEFECTO = 0x7fe8ff;

export function crearCaminos(h: { padre: THREE.Object3D; nivel: () => Nivel; yo: () => { x: number; z: number } | null }) {
  let malla: THREE.Mesh | null = null, caminos: Camino[] = [], clave = "";
  const uT = uniform(0), uColor = uniform(new THREE.Color(COLOR_DEFECTO)), uPulsos = uniform(1);
  let t = 0, nivelPuesto: Nivel | null = null, mat: THREE.MeshBasicNodeMaterial | null = null;

  function material(): THREE.MeshBasicNodeMaterial {
    if (mat) return mat;
    const a = attribute("a", "vec2"), along = a.x, across = a.y;
    // a soft line across, brightest in the middle; a train of pulses running along (fract of metres/spacing − time)
    const borde = float(1).sub(smoothstep(0.35, 1, abs(across)));
    const fase = fract(along.div(PULSO_CADA_M).sub(uT.mul(PULSO_VEL / PULSO_CADA_M)));
    const cola = fase.mul(fase).mul(fase); // bright head at the front, a long soft tail behind it
    const brillo = mix(float(0.4), clamp(cola.add(0.12), 0, 1), uPulsos);
    mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    mat.colorNode = uColor.mul(brillo.mul(1.2));
    mat.opacityNode = borde.mul(clamp(brillo, 0, 1)).mul(0.85);
    return mat;
  }

  function quitar(): void {
    if (!malla) return;
    h.padre.remove(malla); malla.geometry.dispose(); malla = null;
  }
  function construir(): void {
    quitar();
    if (!caminos.length) return;
    const d = detalleCaminos(h.nivel()), g = geometriaCaminos(caminos, d.ancho);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(g.posicion, 3));
    geo.setAttribute("a", new THREE.BufferAttribute(g.a, 2));
    geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
    uPulsos.value = d.pulsos ? 1 : 0;
    malla = new THREE.Mesh(geo, material());
    malla.name = "caminos"; malla.frustumCulled = false; malla.renderOrder = 2; malla.raycast = () => {};
    malla.userData.sinSombra = true;
    h.padre.add(malla);
    nivelPuesto = h.nivel();
    if (!d.animado) uT.value = 0.35 * PULSO_CADA_M / PULSO_VEL; // frozen: a pleasant fixed phase
  }

  function ocupado(): boolean { const y = h.yo(); return !!malla && detalleCaminos(h.nivel()).animado && (!y || cercaDeCamino(caminos, y.x, y.z)); }

  return {
    /** The environment's flat fields (`caminos`, `caminosColor`): rebuilt only when they changed. */
    aplicar(v: Record<string, unknown>): void {
      const c = typeof v.caminosColor === "number" ? v.caminosColor : COLOR_DEFECTO, k = `${String(v.caminos ?? "")}|${c}`;
      if (k === clave && nivelPuesto === h.nivel()) return;
      clave = k; caminos = decodificarCaminos(v.caminos); uColor.value.setHex(c);
      construir();
    },
    /** Every frame (s): advance the pulse; only the animated tier moves, and only near a path. */
    actualizar(dt: number): void {
      if (!malla) return;
      if (nivelPuesto !== h.nivel()) { construir(); return; }
      if (detalleCaminos(h.nivel()).animado && ocupado()) t += Math.min(0.1, Math.max(0, dt)), uT.value = t % 1000;
    },
    /** Keep drawing frames: animated tier, the player near a path. */
    ocupado,
    estado: () => ({ caminos: caminos.length, dibujados: malla ? 1 : 0, animado: !!malla && detalleCaminos(h.nivel()).animado, color: `#${uColor.value.getHexString()}` }),
  };
}
export type Caminos = ReturnType<typeof crearCaminos>;
