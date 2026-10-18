// teletransporte (N16): the light that takes someone and leaves them («rayo» of Star Trek: wrapped in turquoise light,
// digitising, never organic). One shell the size of a body (an open cylinder, additive, no depth write) whose glowing
// part shrinks with the look's mask (teletransporte-politica.ts: the same formulas, tested), a beam for look 1, and
// a handful of sparks rising (one instanced sprite). Cheap on purpose: a light costs 2–3 draw calls for 1.4 s, only
// where someone travels, never for the whole plaza; at most LUCES_MAX by tier (B = Quest in XR: 3, fewer sparks, fewer
// sides); tier D draws none (the person just goes and comes). The body itself is hidden from the leaving cut to the
// arriving cut (index.ts `antesDelCuadro`, the same per-frame hiding the fog uses), so nobody sees it slide across.
import * as THREE from "three/webgpu";
import { uniform, uv, float, floor, abs, hash, smoothstep, step, mix, vec3, instanceIndex, sin, cos, clamp, color } from "three/tsl";
import type { Nivel } from "./calidad.ts";
import { DURACION_S, BLOQUES, LUCES_MAX, CHISPAS, TURQUESA, VERDEMAR, CORTE_SALE, CORTE_LLEGA, OCULTO_MAX_S, brillo, umbral, varianteDe } from "./teletransporte-politica.ts";

export type Clave = number | "self";
export type Luz = { tipo: "sale" | "llega"; x: number; y: number; z: number; variante: number; clave: Clave };

type Hueco = { grupo: THREE.Group; haz: THREE.Mesh; chispas: THREE.Sprite; uS: ReturnType<typeof uniform>; uB: ReturnType<typeof uniform>; uV: ReturnType<typeof uniform>; uT: ReturnType<typeof uniform>; t: number; tipo: "sale" | "llega"; libre: boolean };

export function crearTeletransporte(h: { world: THREE.Object3D; nivel: () => Nivel }) {
  const huecos: Hueco[] = [];
  const ocultos = new Map<Clave, { desde: number; hasta: number }>();
  let reloj = 0, lanzadas = 0, saltadas = 0;
  let geoCuerpo: THREE.CylinderGeometry | null = null, geoHaz: THREE.CylinderGeometry | null = null, lados = 0;

  function nuevoHueco(nivel: Nivel): Hueco {
    const n = nivel === "B" ? 10 : 16;
    if (!geoCuerpo || lados !== n) { lados = n; geoCuerpo = new THREE.CylinderGeometry(0.5, 0.5, 2, n, 1, true); geoCuerpo.translate(0, 1, 0); geoHaz = new THREE.CylinderGeometry(0.32, 0.5, 6, n, 1, true); geoHaz.translate(0, 3, 0); }
    const uS = uniform(0), uB = uniform(0), uV = uniform(0), uT = uniform(0);
    const u = uv().x, v = uv().y;
    // the looks' masks (teletransporte-politica.visible), with a soft bright edge where the body is being taken
    const m0 = float(1).sub(smoothstep(float(0.5).mul(float(1).sub(uS)).sub(0.04), float(0.5).mul(float(1).sub(uS)), abs(v.sub(0.5))));
    const m1 = smoothstep(uS, uS.add(0.04), v);
    const bloque = hash(floor(u.mul(BLOQUES[0])).add(floor(v.mul(BLOQUES[1])).mul(BLOQUES[0])).add(7));
    const m2 = step(uS, bloque);
    const mascara = uV.equal(0).select(m0, uV.equal(1).select(m1, m2));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    mat.colorNode = mix(color(TURQUESA), color(VERDEMAR), v);
    mat.opacityNode = clamp(mascara.mul(uB).mul(0.85), 0, 1);
    const cuerpo = new THREE.Mesh(geoCuerpo, mat);
    const matHaz = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    matHaz.colorNode = color(VERDEMAR);
    matHaz.opacityNode = float(1).sub(v).mul(uB).mul(0.45);
    const haz = new THREE.Mesh(geoHaz!, matHaz);
    // sparks: born on the shell, rising and fading (hash of the index: no per-spark work on the CPU)
    const N = CHISPAS[nivel] || 1, i = float(instanceIndex);
    const ang = hash(i.add(1)).mul(Math.PI * 2), alto = hash(i.add(2)).mul(1.8), vel = hash(i.add(3)).mul(0.9).add(0.6);
    const matC = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    matC.positionNode = vec3(cos(ang).mul(0.45), alto.add(uT.mul(vel)), sin(ang).mul(0.45));
    matC.scaleNode = float(0.05).mul(uB);
    matC.colorNode = color(VERDEMAR);
    matC.opacityNode = uB;
    const chispas = new THREE.Sprite(matC);
    chispas.count = N; chispas.frustumCulled = false; chispas.raycast = () => {};
    for (const o of [cuerpo, haz, chispas]) { o.userData.sinSombra = true; o.renderOrder = 3; o.raycast = () => {}; }
    cuerpo.frustumCulled = false; haz.frustumCulled = false;
    const grupo = new THREE.Group();
    grupo.name = "teletransporte";
    grupo.add(cuerpo, haz, chispas);
    grupo.visible = false;
    h.world.add(grupo);
    return { grupo, haz, chispas, uS, uB, uV, uT, t: 0, tipo: "sale", libre: true };
  }

  return {
    /** A light here (from the server's `sale` / `llega`). Tier D, or every light busy: no light, the body still hides. */
    lanzar(l: Luz): void {
      const T = DURACION_S;
      if (l.tipo === "sale") ocultos.set(l.clave, { desde: reloj + CORTE_SALE * T, hasta: reloj + CORTE_SALE * T + OCULTO_MAX_S });
      else { const o = ocultos.get(l.clave); ocultos.set(l.clave, { desde: o ? Math.min(o.desde, reloj) : reloj, hasta: reloj + CORTE_LLEGA * T }); }
      const nivel = h.nivel(), max = LUCES_MAX[nivel];
      if (!max || ![l.x, l.y, l.z].every(Number.isFinite)) { saltadas++; return; }
      let hu = huecos.find((x) => x.libre);
      if (!hu) { if (huecos.length >= max) { saltadas++; return; } hu = nuevoHueco(nivel); huecos.push(hu); }
      hu.libre = false; hu.t = 0; hu.tipo = l.tipo;
      const v = varianteDe(l.variante);
      hu.uV.value = v; hu.haz.visible = v === 1;
      hu.grupo.position.set(l.x, l.y, l.z); hu.grupo.visible = true;
      lanzadas++;
    },
    /** Every frame (s): move the lights on, free the finished ones, forget the old hidings. */
    actualizar(dt: number): void {
      reloj += Math.min(0.1, Math.max(0, dt));
      for (const hu of huecos) {
        if (hu.libre) continue;
        hu.t += dt / DURACION_S;
        if (hu.t >= 1) { hu.libre = true; hu.grupo.visible = false; continue; }
        hu.uS.value = umbral(hu.t, hu.tipo); hu.uB.value = brillo(hu.t); hu.uT.value = hu.t * DURACION_S;
      }
      for (const [k, o] of ocultos) if (reloj >= o.hasta) ocultos.delete(k);
    },
    /** Whose body is not drawn this frame (between the leaving and the arriving cut). */
    *ocultos(): Iterable<Clave> { for (const [k, o] of ocultos) if (reloj >= o.desde && reloj < o.hasta) yield k; },
    /** A light is on (keep drawing frames). */
    ocupado: (): boolean => ocultos.size > 0 || huecos.some((x) => !x.libre),
    /** For checks: lights on now, lights shown and skipped since the start, bodies hidden now. */
    estado: () => ({ activas: huecos.filter((x) => !x.libre).length, lanzadas, saltadas, ocultos: [...ocultos.keys()].filter((k) => { const o = ocultos.get(k)!; return reloj >= o.desde && reloj < o.hasta; }).length, max: LUCES_MAX[h.nivel()] }),
  };
}
export type Teletransportes = ReturnType<typeof crearTeletransporte>;
