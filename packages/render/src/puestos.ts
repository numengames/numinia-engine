// puestos (N18): what people WEAR — one of their goods (features/bienes: a .glb by its sha256) in the right hand or on
// the head — drawn on their avatar, for everyone who sees them. The server decides who wears what (state `p:<entity>`);
// this only draws it: on the VRM's bone when the person wears a VRM (avatares.ts), else beside / on top of the capsule.
// Every model is scaled to a size a hand or a head carries (TAMANO_M) whatever its file says, hangs from the hand by its
// top (a lantern by its handle) and sits on the head by its base. One copy per wearer; the file is loaded once.
import * as THREE from "three/webgpu";

export type Donde = "mano" | "cabeza";
export type Quien = number | "self";
/** The biggest side of a worn thing (m); a weapon in the hand is a long thing. */
export const TAMANO_M: Record<Donde, number> = { mano: 0.3, cabeza: 0.26 };
export const TAMANO_ARMA_M = 0.7;
/** Without a VRM: the capsule's centre is 0.85 m over the feet (index.ts); the hand hangs 0.42 m to the right, 0.95 m up. */
const CAPSULA_CENTRO = 0.85, MANO_LADO = 0.42, MANO_ALTO = 0.95, CABEZA_ALTO = 1.72, SOBRE_CIMA = 0.01;

export type AyudasPuestos = {
  world: THREE.Object3D;
  /** A fresh copy of a model by its sha256 (rejects when it cannot be loaded). */
  cargar: (model: string) => Promise<THREE.Object3D>;
  /** The capsule that anchors this person (null = not drawn here: far, gone). */
  cuerpo: (q: Quien) => THREE.Object3D | null;
  /** Is this person's body drawn now (yours hides in first person)? */
  visible: (q: Quien) => boolean;
  /** Where it goes when the person wears a VRM — the right hand's bone, the top of the head — else null. */
  hueso: (q: Quien, donde: Donde, out: THREE.Vector3) => THREE.Vector3 | null;
  /** Where the person faces (three's rotation.y), when known. */
  rumbo: (q: Quien) => number | undefined;
};

/** `arma`: the inventory's weapon (t_31e1f7ea), a second slot per person next to the good they wear; it hangs from the hand like a good but is longer. */
type Puesto = { q: Quien; arma: boolean; model: string; donde: Donde; nombre: string; grupo: THREE.Group; cargado: boolean; fallo: boolean; copia?: THREE.Object3D };
const clave = (q: Quien, arma: boolean): string => `${q}${arma ? "#arma" : ""}`;

/** Wrap a loaded copy so that its anchor (top centre for a hand, bottom centre for a head) is at the origin and its
 * biggest side measures TAMANO_M[donde]. */
export function ajustar(copia: THREE.Object3D, donde: Donde, arma = false): THREE.Group {
  const g = new THREE.Group();
  copia.removeFromParent(); copia.scale.set(1, 1, 1); copia.position.set(0, 0, 0); // re-fitting a copy already worn elsewhere
  g.add(copia);
  copia.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(copia), tam = caja.getSize(new THREE.Vector3()), centro = caja.getCenter(new THREE.Vector3());
  const lado = Math.max(tam.x, tam.y, tam.z) || 1, k = (arma ? TAMANO_ARMA_M : TAMANO_M[donde]) / lado;
  copia.scale.multiplyScalar(k);
  copia.position.set(-centro.x * k, -(donde === "mano" ? caja.max.y : caja.min.y) * k, -centro.z * k);
  copia.traverse((o) => { o.frustumCulled = true; });
  return g;
}

export function crearPuestos(h: AyudasPuestos) {
  const puestos = new Map<string, Puesto>();
  const v = new THREE.Vector3();
  const quitar = (q: Quien, arma = false) => { const k = clave(q, arma), p = puestos.get(k); if (p) { p.grupo.parent?.remove(p.grupo); puestos.delete(k); } };
  return {
    /** Put a model in this person's hand or on their head (`null` takes it off). Same model and place = nothing to do. */
    poner(q: Quien, p: { model: string; donde: Donde; nombre?: string } | null, ranura?: "arma"): void {
      const arma = ranura === "arma", ya = puestos.get(clave(q, arma));
      if (!p) { quitar(q, arma); return; }
      if (ya && ya.model === p.model && ya.donde === p.donde) return;
      if (ya && ya.model === p.model && ya.copia) { // same thing, another place: re-fit the copy already here (no reload)
        ya.grupo.clear(); ya.grupo.add(ajustar(ya.copia, p.donde, arma)); ya.donde = p.donde; return;
      }
      quitar(q, arma);
      const grupo = new THREE.Group(); grupo.name = `puesto:${clave(q, arma)}`; grupo.visible = false;
      const nuevo: Puesto = { q, arma, model: p.model, donde: p.donde, nombre: p.nombre ?? "", grupo, cargado: false, fallo: false };
      puestos.set(clave(q, arma), nuevo); h.world.add(grupo);
      h.cargar(p.model).then((copia) => {
        if (puestos.get(clave(q, arma)) !== nuevo) return; // taken off (or changed) while it loaded
        nuevo.copia = copia; grupo.add(ajustar(copia, nuevo.donde, arma)); nuevo.cargado = true;
      }, (e) => { nuevo.fallo = true; console.warn(`[puestos] no se pudo cargar ${p.model}: ${(e as Error)?.message ?? e}`); });
    },
    /** Every frame, after the avatars moved: follow each wearer's hand or head. */
    actualizar(): void {
      const armados = new Set<Quien>(); // who holds a weapon (drawn): their good in the hand waits, so the two never overlap in one hand
      for (const p of puestos.values()) if (p.arma && p.cargado) armados.add(p.q);
      for (const p of puestos.values()) {
        const q = p.q, c = p.cargado ? h.cuerpo(q) : null;
        if (!p.arma && p.donde === "mano" && armados.has(q)) { p.grupo.visible = false; continue; }
        if (!c || !h.visible(q)) { p.grupo.visible = false; continue; }
        const rumbo = h.rumbo(q) ?? 0, hueso = h.hueso(q, p.donde, v);
        if (hueso) p.grupo.position.copy(hueso).add(v.set(0, p.donde === "cabeza" ? SOBRE_CIMA : -0.02, 0));
        else {
          const pies = c.position.y - CAPSULA_CENTRO;
          if (p.donde === "cabeza") p.grupo.position.set(c.position.x, pies + CABEZA_ALTO, c.position.z);
          else p.grupo.position.set(c.position.x - Math.cos(rumbo) * MANO_LADO, pies + MANO_ALTO, c.position.z + Math.sin(rumbo) * MANO_LADO); // the right hand of someone facing `rumbo`
        }
        p.grupo.rotation.set(0, rumbo, 0);
        p.grupo.visible = true;
      }
    },
    /** For checks: who wears what, whether its model loaded and whether it is drawn this frame. */
    estado(): Record<string, { model: string; donde: Donde; cargado: boolean; fallo: boolean; dibujado: boolean; y: number }> {
      return Object.fromEntries([...puestos].map(([q, p]) => [String(q), { model: p.model, donde: p.donde, cargado: p.cargado, fallo: p.fallo, dibujado: p.grupo.visible, y: Math.round(p.grupo.position.y * 100) / 100 }]));
    },
  };
}
