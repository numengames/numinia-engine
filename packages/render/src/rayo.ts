// rayo (MIS-229, t_2bb3461e): the beam of a beacon, made special. Rules and numbers: rayo-politica.ts (pure, tested).
// What you see: the column (as before, gold, additive) with a slow swirl and soft bands of light climbing it; motes of light rising along
// it; a ground ring that breathes and sends a ripple outward, brighter as you come close; a gentle swell when you arrive and when a
// mission completes. Cost: the column and the ring are ONE mesh with ONE shader (merged geometry; same draw call as the old column);
// the motes are ONE instanced sprite (the single extra call per beacon); no texture, no per-frame work on the CPU beyond two uniforms.
// Tier D: the plain column of before (see index.ts). «Menos movimiento»: the clock stands at 0 (a still pose) and it never swells.
import * as THREE from "three/webgpu";
import { uniform, uv, float, vec3, instanceIndex, sin, cos, fract, hash, smoothstep, mix, clamp, exp, attribute, positionLocal, color } from "three/tsl";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Nivel } from "./calidad.ts";
import { ANILLO_M, COLUMNA_ALTO_M, DESTELLO_S, MOTAS, MOTA_ALTO_M, cerca, destello, paso, relojRayo, type Saludo } from "./rayo-politica.ts";

const ORO = 0xffd27a, BLANCO_ORO = 0xfff3cf;
/** One clock for every beam (seconds; 0 when still). */
const uReloj = uniform(0);

let geo: THREE.BufferGeometry | null = null;
/** Column + ring in one geometry (shared by every beam): `aAnillo` is 0 on the column and 1 on the ring. */
function geometria(): THREE.BufferGeometry {
  if (geo) return geo;
  const col = new THREE.CylinderGeometry(0.6, 0.6, COLUMNA_ALTO_M, 16, 1, true); col.translate(0, COLUMNA_ALTO_M / 2, 0);
  const aro = new THREE.CircleGeometry(ANILLO_M, 32); aro.rotateX(-Math.PI / 2); aro.translate(0, 0.06, 0);
  for (const [g, v] of [[col, 0], [aro, 1]] as const) g.setAttribute("aAnillo", new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count).fill(v), 1));
  geo = mergeGeometries([col, aro])!;
  geo.name = "rayo";
  return geo;
}

export type Rayo = {
  malla: THREE.Mesh;
  motas: THREE.Sprite;
  /** Once per frame: where the walker is (m from the foot of the beam, or null) and whether «menos movimiento» is on. */
  actualizar(ahora: number, distM: number | null, quieto: boolean): void;
  /** The swell, now (a mission completed). Ignored while still. */
  destellar(ahora: number): void;
  /** For checks. */
  estado(): { destello: number; cerca: number; motas: number };
};

export function crearRayo(nivel: Nivel): Rayo {
  const uDestello = uniform(0), uCerca = uniform(0), uDist = uniform(30);
  const deLejos = (m: number, tope: number) => clamp(uDist.div(m), 1, tope); // from afar the motes and the ring grow with the distance, so they still read
  const t = uReloj, v = uv().y, u = uv().x;
  const esAnillo = attribute("aAnillo", "float").greaterThan(0.5);

  // --- column: gold, a slow swirl, three soft bands climbing, brighter at the foot, melting at the top
  const alto = v.mul(COLUMNA_ALTO_M);
  const envolvente = mix(float(1.25), float(0.55), smoothstep(0, 0.35, v)).mul(float(1).sub(smoothstep(0.6, 1, v)));
  const banda = (k: number) => { const d = alto.sub(fract(t.mul(0.11).add(k / 3)).mul(COLUMNA_ALTO_M)).div(3.4); return exp(d.mul(d).negate()); };
  const bandas = banda(0).add(banda(1)).add(banda(2));
  const remolino = float(0.9).add(sin(u.mul(Math.PI * 8).add(t.mul(1.3)).add(alto.mul(0.2))).mul(0.1));
  const opCol = clamp(float(0.35).mul(envolvente).mul(remolino).mul(float(1).add(bandas.mul(2.2))).mul(float(1).add(uDestello.mul(1.6))), 0, 1);
  const colCol = mix(color(ORO), color(BLANCO_ORO), clamp(bandas.mul(0.7).add(uDestello.mul(0.6)), 0, 1));

  // --- ring: a rim that breathes, a soft glow inside, a ripple going out; brighter as you come close
  const r = uv().sub(0.5).length().mul(2);
  const respira = sin(t.mul(1.7)).mul(0.5).add(0.5);
  const borde = smoothstep(0.78, 0.9, r).mul(float(1).sub(smoothstep(0.92, 1, r)));
  const relleno = float(1).sub(smoothstep(0, 0.9, r)).mul(0.18);
  const ola = fract(t.mul(0.35)), dOla = r.sub(ola).div(0.07);
  const onda = exp(dOla.mul(dOla).negate()).mul(float(1).sub(ola)).mul(0.55);
  const presencia = float(0.65).add(uCerca.mul(0.9));
  const opAro = clamp(borde.mul(respira.mul(0.35).add(0.55)).add(relleno.mul(respira.mul(0.4).add(0.6))).add(onda).mul(presencia).mul(float(1).add(uDestello.mul(1.6))), 0, 1);
  const colAro = mix(color(ORO), color(BLANCO_ORO), clamp(borde.mul(0.5).add(uDestello.mul(0.6)), 0, 1));

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  mat.colorNode = esAnillo.select(colAro, colCol);
  mat.opacityNode = esAnillo.select(opAro, opCol);
  // the ring breathes (and widens with the swell); the column swells a little too
  mat.positionNode = positionLocal.mul(esAnillo.select(float(1).add(respira.mul(0.05)).add(uDestello.mul(0.8)).mul(deLejos(14, 2)), float(1).add(uDestello.mul(1))).mul(vec3(1, 0, 1)).add(vec3(0, 1, 0)));
  const malla = new THREE.Mesh(geometria(), mat);
  malla.name = "rayo";

  // --- motes: born inside the column, rising, swaying, melting at the top; ONE sprite, ONE draw call
  const N = Math.max(1, MOTAS[nivel]), i = float(instanceIndex);
  const ang = hash(i.add(1)).mul(Math.PI * 2).add(t.mul(hash(i.add(5)).sub(0.5).mul(1.2)));
  const radio = hash(i.add(2)).mul(0.5).add(0.08);
  const vida = fract(hash(i.add(4)).add(t.mul(hash(i.add(3)).mul(0.9).add(0.5)).div(MOTA_ALTO_M)));
  const matM = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  matM.positionNode = vec3(cos(ang).mul(radio), vida.mul(MOTA_ALTO_M).add(0.2), sin(ang).mul(radio));
  matM.scaleNode = hash(i.add(6)).mul(0.14).add(0.15).mul(deLejos(9, 3.2)).mul(float(1).add(uDestello.mul(0.8)));
  matM.colorNode = color(BLANCO_ORO);
  const disco = float(1).sub(smoothstep(0.05, 0.5, uv().sub(0.5).length()));
  const brillo = sin(t.mul(3).add(i.mul(5.1))).mul(0.3).add(0.7);
  matM.opacityNode = clamp(sin(vida.mul(Math.PI)).mul(brillo).mul(1.35).mul(disco).mul(float(0.6).add(uCerca.mul(0.4))).mul(float(1).add(uDestello.mul(0.8))), 0, 1);
  const motas = new THREE.Sprite(matM);
  motas.count = N; motas.frustumCulled = false; motas.renderOrder = 4; motas.name = "rayo-motas";
  malla.frustumCulled = false;
  for (const o of [malla, motas]) { o.userData.sinSombra = true; o.raycast = () => {}; }

  const saludo: Saludo = { saludado: false };
  let desde = -Infinity, valor = 0, cercaAhora = 0;
  return {
    malla, motas,
    actualizar(ahora, distM, quieto) {
      cercaAhora = distM === null ? 0 : cerca(distM);
      if (!quieto && distM !== null && paso(saludo, distM)) desde = ahora;
      valor = quieto ? 0 : destello((ahora - desde) / 1000);
      uCerca.value = cercaAhora; uDestello.value = valor; uDist.value = distM ?? 30;
    },
    destellar(ahora) { desde = ahora; },
    estado: () => ({ destello: valor, cerca: cercaAhora, motas: N }),
  };
}

/** Once per frame, before the beams: the shared clock (ms from performance.now; still → 0). */
export function relojDelRayo(ms: number, quieto: boolean): void { uReloj.value = relojRayo(ms, quieto); }
export { DESTELLO_S };
