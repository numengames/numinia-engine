// centro-mundo (P15): where the middle of a placed model really is, for the ring that marks it: the middle of its box in the world, so it
// follows what is drawn (place, turn, scale, a moved parent). A piece whose origin is not its middle (the v4 kitchen's knife, board and
// vegetables: origin at the board) is ringed round what it is. Undefined while the model has nothing to measure.
import { Box3, Vector3, type Object3D } from "three/webgpu";

const caja = new Box3(), medio = new Vector3();
export function centroEnMundo(modelo: Object3D): { x: number; y: number; z: number } | undefined {
  modelo.updateWorldMatrix(true, true);
  if (caja.setFromObject(modelo).isEmpty()) return undefined;
  const { x, y, z } = caja.getCenter(medio);
  return { x, y, z };
}
