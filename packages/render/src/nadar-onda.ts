// nadar-onda — agua/nadar: the ring that spreads on the water where someone crosses the shore. A LAZY chunk: index.ts imports it the first time an avatar
// crosses a shore with the world's `nadar` switch on, so a world without the switch never downloads it. Cheap for phones: one flat ring geometry shared by a
// pool of 6 basic (unlit) materials, no shader, no texture; each ring grows and fades by `ondaEn` (avatares-politica.ts, pure and tested) and hides itself.
import * as THREE from "three/webgpu";
import { ondaEn } from "./avatares-politica.ts";

const POZA = 6;

export function crearOndas(world: THREE.Object3D) {
  const geo = new THREE.RingGeometry(0.88, 1, 28); // radius 1: scaled by the ring's growth
  const anillos = Array.from({ length: POZA }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8f6f2, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.name = "onda-nadar"; m.userData.sinSombra = true; m.renderOrder = 3;
    world.add(m);
    return { m, t: -1 };
  });
  let siguiente = 0;
  return {
    /** A ring at (x, nivel, z): into the water (`entra`) or out of it (smaller and fainter). */
    lanzar(x: number, nivel: number, z: number, entra: boolean): void {
      const a = anillos[siguiente++ % POZA];
      a.t = 0; a.m.position.set(x, nivel + 0.03, z); a.m.userData.fuerza = entra ? 1 : 0.6; a.m.visible = true;
    },
    actualizar(dt: number): void {
      for (const a of anillos) {
        if (a.t < 0) continue;
        a.t += dt;
        const o = ondaEn(a.t);
        if (!o) { a.t = -1; a.m.visible = false; continue; }
        const f = a.m.userData.fuerza as number;
        a.m.scale.setScalar(o.radio * f); (a.m.material as THREE.MeshBasicMaterial).opacity = o.opacidad * f;
      }
    },
    /** Rings alive now (tests, the probe). */
    vivos: (): number => anillos.filter((a) => a.t >= 0).length,
    dispose(): void { for (const a of anillos) { a.m.removeFromParent(); (a.m.material as THREE.Material).dispose(); } geo.dispose(); },
  };
}
export type Ondas = ReturnType<typeof crearOndas>;
