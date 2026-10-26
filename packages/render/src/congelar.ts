// congelar (lote13 t_f3f9e61a): stop three from recomposing the local matrix of nodes that never move on their own.
// three's renderer calls scene.updateMatrixWorld() every frame; a node with `matrixAutoUpdate` (the default) composes its local
// matrix from position/rotation/scale and flags its world matrix for recomputation EVERY frame, moved or not, and so does
// everything below it. A model that does not animate keeps the same local matrices for life, so its nodes are frozen once,
// right after they are placed: the node keeps being visited (cheap) but nothing is composed or multiplied unless a parent
// moves (a parent's world matrix change forces its children's, frozen or not: three's `force`).
// Measured (tools/medir-recorrido.mjs, TRG26 events world, 899 nodes, 886 with matrixAutoUpdate): the walk fell from 0.07 to ~0.015 ms
// when every node was frozen (upper bound) — a small, real win that grows with the node count of the world.
import type * as THREE from "three/webgpu";

/**
 * Freeze `raiz` and everything below it: bring each node's local matrix up to date, then stop recomposing it every frame.
 * Only for a subtree nothing animates or edits node by node: if someone changes a frozen node's position later, call
 * `descongelar` first (or `updateMatrix()` after). The group a thing moves by (`placeGroup`) is NOT frozen: its children follow it.
 * Returns how many nodes it froze (already frozen ones are skipped).
 */
export function congelarMatrices(raiz: THREE.Object3D): number {
  let n = 0;
  raiz.traverse((o) => {
    if (!o.matrixAutoUpdate) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    n++;
  });
  return n;
}

/** The way back: the subtree composes its matrices every frame again. */
export function descongelarMatrices(raiz: THREE.Object3D): number {
  let n = 0;
  raiz.traverse((o) => { if (!o.matrixAutoUpdate) { o.matrixAutoUpdate = true; n++; } });
  return n;
}
