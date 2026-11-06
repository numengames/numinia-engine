// centro-mundo (P15): where a placed model really is and how big, for the ring that marks it: the sphere that holds its box in the world,
// so it follows what is drawn (place, turn, scale, a moved parent). A piece whose origin is not its middle (the v4 kitchen's knife, board and
// vegetables: origin at the board) is ringed round what it is. Undefined while the model has nothing to measure.
import { Box3, Sphere, type Object3D } from "three/webgpu";

const caja = new Box3(), esfera = new Sphere();
export function medidaEnMundo(modelo: Object3D): { x: number; y: number; z: number; r: number } | undefined {
  modelo.updateWorldMatrix(true, true);
  if (caja.setFromObject(modelo).isEmpty()) return undefined;
  const { center: { x, y, z }, radius: r } = caja.getBoundingSphere(esfera);
  return { x, y, z, r };
}
