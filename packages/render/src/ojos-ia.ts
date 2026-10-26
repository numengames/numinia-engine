// ojos-ia (t_5096d6f4, MIS-229): the eyes of an AI say how big the model behind it is. Two flat marks on the face of its avatar, in
// the colour AND the shape of its size step (the scale: features/ia/ojos.ts; the page hands over `{ color, forma }`, this never
// decides). Cost: one shared geometry per shape, one shared unlit material per colour, ONE mesh (two eyes) per AI, only for the
// `max()` nearest AIs within OJOS_VISTOS_HASTA_M; a world without AIs makes nothing. Placed like what people wear (puestos.ts):
// on the VRM's head when it wears one, else on the capsule; always facing where the avatar faces.
import * as THREE from "three/webgpu";
import { escalaOjos, geometriaOjos, OJOS_VISTOS_HASTA_M, type FormaOjo } from "./ojos-ia-forma.ts";

export type Target = number | "self";
export type OjosPuestos = { color: number; forma: FormaOjo };
/** Without a VRM: the capsule's centre is 0.85 m over the feet (index.ts), its radius 0.35 m: the eyes sit 0.55 m over the centre (head height), on the front of the capsule. */
const CAPSULA_ALTO = 0.55, CAPSULA_FRENTE = 0.36;
/** On a VRM: the head bone gives the TOP of the head; the eyes are about 11 cm under it and 10 cm in front of the middle of the head. */
const BAJO_CIMA = 0.115, ADELANTE = 0.1;

export function createOjosIA(o: {
  world: THREE.Object3D;
  /** The capsule that anchors this person (undefined = not drawn here: far, gone). */
  cuerpo: (t: Target) => THREE.Object3D | undefined;
  /** Is this person's body drawn now (yours hides in first person)? */
  visible: (t: Target) => boolean;
  /** The top of the head when the person wears a VRM, else null. */
  cabeza: (t: Target, out: THREE.Vector3) => THREE.Vector3 | null;
  /** Where the avatar faces (three's rotation.y), when known. */
  rumbo: (t: Target) => number | undefined;
  camera: THREE.Camera;
  max: () => number;
}) {
  const geos = new Map<FormaOjo, THREE.BufferGeometry>();
  const mats = new Map<number, THREE.MeshBasicMaterial>();
  const vivas = new Map<Target, OjosPuestos>();
  const mallas = new Map<Target, THREE.Mesh>();
  const libres: THREE.Mesh[] = [];
  const cam = new THREE.Vector3(), v = new THREE.Vector3();
  let pendiente = false;

  const geometria = (f: FormaOjo): THREE.BufferGeometry => {
    let g = geos.get(f);
    if (!g) { const d = geometriaOjos(f); g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(d.posiciones, 3)); g.setIndex(new THREE.BufferAttribute(d.indices, 1)); g.computeBoundingSphere(); geos.set(f, g); }
    return g;
  };
  const material = (c: number): THREE.MeshBasicMaterial => {
    let m = mats.get(c);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, toneMapped: false }); mats.set(c, m); }
    return m;
  };
  const tomar = (e: OjosPuestos): THREE.Mesh => {
    const m = libres.pop() ?? new THREE.Mesh(geometria(e.forma), material(e.color));
    m.geometry = geometria(e.forma); m.material = material(e.color);
    m.name = "ojos-ia"; m.userData.sinSombra = true; m.renderOrder = 8;
    o.world.add(m);
    return m;
  };
  const soltar = (t: Target) => { const m = mallas.get(t); if (!m) return; o.world.remove(m); libres.push(m); mallas.delete(t); };

  return {
    /** This avatar is an AI whose eyes look like this, or a person again / gone (`null`). */
    poner(t: Target, ojos: OjosPuestos | null): void {
      pendiente = true;
      if (ojos === null) { vivas.delete(t); soltar(t); return; }
      vivas.set(t, ojos);
      const m = mallas.get(t); if (m) { m.geometry = geometria(ojos.forma); m.material = material(ojos.color); }
    },
    /** Once per frame, after the avatars moved: put each near AI's eyes on its face. Nothing to do when there are no AIs. */
    update(): void {
      pendiente = false;
      if (vivas.size === 0) return;
      o.camera.getWorldPosition(cam);
      const cerca: { t: Target; c: THREE.Object3D; d: number }[] = [];
      for (const [t] of vivas) {
        const c = o.cuerpo(t);
        if (!c || !o.visible(t)) { soltar(t); continue; }
        const d = Math.hypot(c.position.x - cam.x, c.position.y - cam.y, c.position.z - cam.z);
        if (d > OJOS_VISTOS_HASTA_M) { soltar(t); continue; }
        cerca.push({ t, c, d });
      }
      cerca.sort((a, b) => a.d - b.d);
      const tope = Math.max(0, Math.floor(o.max()));
      cerca.forEach(({ t, c, d }, i) => {
        if (i >= tope) { soltar(t); return; }
        const e = vivas.get(t)!;
        const m = mallas.get(t) ?? (() => { const n = tomar(e); mallas.set(t, n); return n; })();
        const rumbo = o.rumbo(t) ?? 0, cabeza = o.cabeza(t, v), s = escalaOjos(d);
        const adelante = cabeza ? ADELANTE : CAPSULA_FRENTE, sx = Math.sin(rumbo), sz = Math.cos(rumbo);
        if (cabeza) m.position.set(cabeza.x + sx * adelante, cabeza.y - BAJO_CIMA, cabeza.z + sz * adelante);
        else m.position.set(c.position.x + sx * adelante, c.position.y + CAPSULA_ALTO, c.position.z + sz * adelante);
        m.rotation.set(0, rumbo, 0); // the mark's front (+z) is where the avatar faces
        m.scale.setScalar(s);
        m.visible = true;
      });
    },
    busy(): boolean { return pendiente; },
    /** For checks: who has eyes, whether drawn now, and how much the eyes share. */
    lista(): { target: Target; color: number; forma: FormaOjo; drawn: boolean }[] { return [...vivas].map(([target, e]) => ({ target, color: e.color, forma: e.forma, drawn: mallas.has(target) })); },
    compartidos(): { geometrias: number; materiales: number; mallas: number; libres: number } { return { geometrias: geos.size, materiales: mats.size, mallas: mallas.size, libres: libres.length }; },
  };
}
