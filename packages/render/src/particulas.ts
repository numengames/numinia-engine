// particulas (H8): GPU particles, one instanced draw call per emitter, no per-particle work on the CPU. Each particle
// i lives in cycles of P seconds: its age, its random values (hash of i and the cycle), where it starts (shape), how
// it moves (velocity, spread, gravity or buoyancy, the wind uniform, a slow wander) and how it looks over its life
// (size, colour and alpha curves of 4 keys, curvas.ts) are computed in the vertex shader from one time uniform that
// the CPU advances only while the emitter is near and on screen (frozen otherwise: cold phones).
import * as THREE from "three/webgpu";
import { uniform, instanceIndex, float, vec3, hash, floor, mix, clamp, sin, cos, sqrt, uv, smoothstep, length, varying, normalize } from "three/tsl";
import { curva4, color4 } from "./curvas.ts";
import type { Curva, CurvaColor, Curva4 } from "./curvas.ts";

export type EmisorDef = {
  forma: "punto" | "esfera" | "cono" | "caja";
  radio?: number;                       // esfera / cono: radius of the base (m)
  caja?: [number, number, number];      // caja: size (m)
  ritmo: number;                        // particles per second (continuous)
  rafaga?: { cada: number };            // burst: all of them together every `cada` s
  vida: [number, number];               // s, min..max
  velocidad: [number, number, number];  // m/s at birth
  dispersion: number;                   // m/s, random, any direction
  tamano: Curva; tamanoMax: number;     // size over life (× tamanoMax, m)
  giro: [number, number];               // rad/s, min..max
  color: CurvaColor; alfa: Curva;       // over life
  mezcla: "aditiva" | "normal";
  gravedad: number;                     // m/s², up positive (smoke and flames rise)
  viento: number;                       // 0..1: how much the wind pushes it
  vagar?: number;                       // m: a slow sideways wander (dust, smoke)
  suave?: number;                       // 0..1: soft edge of each particle's disc
};

const TAU = Math.PI * 2;
type Nodo = ReturnType<typeof float>;
/** The 4-key curve as shader math (the same formula as curvas.evaluar4). */
function curvaNodo(c: Curva4, a: Nodo): Nodo {
  let v: Nodo = float(c.v[0]);
  for (let i = 0; i < 3; i++) {
    const dv = c.v[i + 1] - c.v[i];
    if (dv === 0) continue;
    v = v.add(clamp(a.sub(c.t[i]).div(Math.max(1e-4, c.t[i + 1] - c.t[i])), 0, 1).mul(dv)) as Nodo;
  }
  return v;
}

/** How many particles this definition keeps alive (rate × longest life), before the tier's caps. */
export const pide = (def: EmisorDef): number => Math.max(1, Math.ceil(def.ritmo * def.vida[1]));

export function crearEmisor(def: EmisorDef, cuantas: number, viento: ReturnType<typeof uniform>) {
  const N = Math.max(1, cuantas | 0);
  const P = def.rafaga ? Math.max(def.rafaga.cada, def.vida[1]) : Math.max(def.vida[1], N / Math.max(0.001, def.ritmo));
  // N, P and the box are uniforms, not constants: every emitter of a kind compiles to the same shader
  const uN = uniform(N), uP = uniform(P), uCaja = uniform(new THREE.Vector3(...(def.caja ?? [1, 1, 1])));
  const uT = uniform(P * 2);            // seconds (starts past one period so nobody is unborn)
  const uTinte = uniform(new THREE.Color(1, 1, 1));
  const uEscala = uniform(1);           // the element's size
  const i = float(instanceIndex);
  const tt = def.rafaga ? uT : uT.sub(i.div(uN).mul(uP));
  const ciclo = floor(tt.div(uP));
  const edad = tt.sub(ciclo.mul(uP));
  const semilla = i.add(ciclo.mul(uN)).mul(8);
  const r = (k: number) => hash(semilla.add(k));
  const vida = mix(def.vida[0], def.vida[1], r(0));
  const a = edad.div(vida);
  const vivo = a.lessThanEqual(1).select(1, 0);
  // where it is born (local metres, scaled by the element's size)
  let p0;
  if (def.forma === "esfera") p0 = normalize(vec3(r(1).sub(0.5), r(2).sub(0.5), r(3).sub(0.5))).mul(r(4).mul(def.radio ?? 0.5));
  else if (def.forma === "caja") p0 = vec3(r(1).sub(0.5), r(2), r(3).sub(0.5)).mul(uCaja);
  else if (def.forma === "cono") { const ang = r(1).mul(TAU), rad = sqrt(r(2)).mul(def.radio ?? 0.3); p0 = vec3(cos(ang).mul(rad), 0, sin(ang).mul(rad)); }
  else p0 = vec3(0, 0, 0);
  const v0 = vec3(def.velocidad[0], def.velocidad[1], def.velocidad[2]).add(vec3(r(5).sub(0.5), r(6).sub(0.5), r(7).sub(0.5)).mul(2 * def.dispersion));
  let pos = p0.mul(uEscala).add(v0.mul(uEscala).mul(edad)).add(vec3(0, edad.mul(edad).mul(0.5 * def.gravedad).mul(uEscala), 0));
  if (def.viento) pos = pos.add(viento.mul(edad).mul(def.viento));
  if (def.vagar) pos = pos.add(vec3(sin(edad.mul(1.3).add(r(1).mul(TAU))), 0, cos(edad.mul(1.1).add(r(2).mul(TAU)))).mul(a.mul(def.vagar)));
  const tam = curva4(def.tamano), alf = curva4(def.alfa), [cr, cg, cb] = color4(def.color);
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: true, blending: def.mezcla === "aditiva" ? THREE.AdditiveBlending : THREE.NormalBlending });
  mat.positionNode = pos;
  mat.scaleNode = curvaNodo(tam, a).mul(def.tamanoMax).mul(uEscala).mul(vivo);
  mat.rotationNode = mix(def.giro[0], def.giro[1], r(3)).mul(edad).add(r(4).mul(TAU));
  const av = varying(a);
  mat.colorNode = vec3(curvaNodo(cr, av), curvaNodo(cg, av), curvaNodo(cb, av)).mul(uTinte);
  const borde = def.suave ?? 0.6;
  mat.opacityNode = clamp(curvaNodo(alf, av), 0, 1).mul(smoothstep(1, 1 - borde, length(uv().sub(0.5)).mul(2)));
  const objeto = new THREE.Sprite(mat);
  objeto.count = N;
  objeto.frustumCulled = false;           // the emitter decides (elementos.ts tests its sphere)
  objeto.raycast = () => {};              // particles are not clickable
  objeto.userData.sinSombra = true;
  objeto.renderOrder = 2;
  return {
    objeto, cuantas: N,
    /** Advance its clock (only while near and on screen). Wraps every 1000 periods, seamlessly. */
    avanzar(dt: number): void { uT.value += dt; if (uT.value > P * 1002) uT.value -= P * 1000; },
    tinte(c: number): void { uTinte.value.setHex(c); },
    escala(s: number): void { uEscala.value = s; },
    /** The box a «caja» emitter is born in (m), e.g. the dust's area. */
    caja(x: number, y: number, z: number): void { uCaja.value.set(x, y, z); },
    dispose(): void { mat.dispose(); },
  };
}
export type Emisor = ReturnType<typeof crearEmisor>;
