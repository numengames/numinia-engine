// orbe-ia (t_466efdb8): a «thinking» orb over every AI the server marks `pensando` (called, not answered yet; ≤ 45 s). The server decides, the page
// hands over a yes/no per avatar. Cost: ONE InstancedMesh (one quad, one shared texture painted once) for ALL orbs = one draw call, only the
// `max()` nearest within ORBE_VISTO_HASTA_M, none on tier D, nothing made until the first orb is wanted, no per-frame work when nobody thinks.
// Reduced motion: the orb stands still (no turn, no breathing) and the page draws one frame per change instead of every frame.
import * as THREE from "three/webgpu";
import type { Nivel } from "./calidad.ts";
import { ORBE_DIAMETRO_M, ORBE_SOBRE_ROTULO_M, ORBE_TEXTURA_PX, ORBE_VISTO_HASTA_M, ORBES_PC, escalaOrbe, fotogramaOrbe, orbeDibuja, puntosPintados } from "./orbe-ia-forma.ts";

export type Target = number | "self";

export function createOrbesIA(o: {
  world: THREE.Object3D;
  cuerpo: (t: Target) => THREE.Object3D | undefined;
  visible: (t: Target) => boolean;
  /** World y of the top of the name plate and bubble of this avatar (nombres.above). */
  encima: (t: Target, c: THREE.Object3D) => number;
  camera: THREE.Camera;
  max: () => number;
  nivel: () => Nivel;
}) {
  const vivas = new Set<Target>();
  let malla: THREE.InstancedMesh | null = null;
  let quieto = false, pendiente = false, dibujadas = 0;
  const cam = new THREE.Vector3(), qCam = new THREE.Quaternion(), qGiro = new THREE.Quaternion(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3(), m4 = new THREE.Matrix4(), eje = new THREE.Vector3(0, 0, 1);

  const textura = (): THREE.Texture => {
    const px = ORBE_TEXTURA_PX, c = document.createElement("canvas");
    c.width = c.height = px;
    const g = c.getContext("2d")!;
    const halo = g.createRadialGradient(px / 2, px / 2, px * 0.05, px / 2, px / 2, px * 0.5);
    halo.addColorStop(0, "rgba(180,225,255,.30)"); halo.addColorStop(0.7, "rgba(120,190,255,.10)"); halo.addColorStop(1, "rgba(120,190,255,0)");
    g.fillStyle = halo; g.fillRect(0, 0, px, px);
    for (const p of puntosPintados()) { g.fillStyle = `rgba(235,246,255,${p.luz.toFixed(2)})`; g.beginPath(); g.arc(p.x * px, p.y * px, Math.max(1, p.r * px), 0, Math.PI * 2); g.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return t;
  };
  const hacer = (): THREE.InstancedMesh => {
    const mat = new THREE.MeshBasicMaterial({ map: textura(), transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, ORBES_PC);
    m.name = "orbes-ia"; m.userData.sinSombra = true; m.renderOrder = 10; m.frustumCulled = false; m.count = 0; m.visible = false;
    o.world.add(m);
    return m;
  };

  return {
    /** This avatar is an AI that is thinking now (`true`) or is not any more / is gone (`false`). */
    poner(t: Target, si: boolean): void {
      pendiente = true;
      if (!si) { vivas.delete(t); return; }
      vivas.add(t);
      malla ??= hacer();
    },
    /** «Menos movimiento»: the orbs stand still. */
    quieto(si: boolean): void { quieto = si; pendiente = true; },
    /** Once per frame, after the avatars moved. Nothing to do when nobody thinks. */
    update(now: number): void {
      pendiente = false;
      if (!malla) return;
      if (vivas.size === 0 || !orbeDibuja(o.nivel())) { malla.count = 0; malla.visible = false; dibujadas = 0; return; }
      o.camera.getWorldPosition(cam); o.camera.getWorldQuaternion(qCam);
      const cerca: { t: Target; c: THREE.Object3D; d: number }[] = [];
      for (const t of vivas) {
        const c = o.cuerpo(t);
        if (!c || !o.visible(t)) continue;
        const d = Math.hypot(c.position.x - cam.x, c.position.y - cam.y, c.position.z - cam.z);
        if (d <= ORBE_VISTO_HASTA_M) cerca.push({ t, c, d });
      }
      cerca.sort((a, b) => a.d - b.d);
      const n = Math.min(cerca.length, Math.max(0, Math.floor(o.max())), ORBES_PC);
      for (let i = 0; i < n; i++) {
        const { c, d } = cerca[i]!;
        const f = fotogramaOrbe(now, quieto, i * 1.7);
        pos.set(c.position.x, o.encima(cerca[i]!.t, c) + ORBE_SOBRE_ROTULO_M + (ORBE_DIAMETRO_M * escalaOrbe(d)) / 2, c.position.z);
        qGiro.setFromAxisAngle(eje, f.giro); q.copy(qCam).multiply(qGiro); // faces whoever looks, turns in the plane of the screen
        esc.setScalar(ORBE_DIAMETRO_M * escalaOrbe(d) * f.escala);
        malla.setMatrixAt(i, m4.compose(pos, q, esc));
      }
      malla.count = n; malla.visible = n > 0; dibujadas = n;
      malla.instanceMatrix.needsUpdate = true;
    },
    /** The page must draw another frame: a change not placed yet, or an orb that moves. */
    busy(): boolean { return pendiente || (vivas.size > 0 && !quieto && orbeDibuja(o.nivel())); },
    /** For checks: who thinks, how many orbs are drawn now, and that they all share one mesh (one draw call). */
    lista(): { pensando: Target[]; dibujadas: number; mallas: number; quieto: boolean } { return { pensando: [...vivas], dibujadas, mallas: malla ? 1 : 0, quieto }; },
  };
}
