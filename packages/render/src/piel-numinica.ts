// piel-numinica (t_8217ffea, N1): the look of your hands in VR — the avatar's own skin colour with Numinia's lights running over it
// as thin circuit traces (not a skeleton, not a plain glove). One small canvas texture, painted once, shared by every hand material:
// the traces go in the EMISSIVE map, so they glow in any light, and the base colour stays the avatar's (flesh, bone or steel).
// No extra draw call, no extra mesh: only the hands' materials get an emissive map (manos.ts) and the hand geometry gets UVs.
import * as THREE from "three/webgpu";
import { trazosCircuito } from "./cuerpo-vr.ts";

/** The house's warm light (the same gold as the rays and the labels). */
export const LUZ_NUMINIA = 0xffd27a;
const TAM = 128;
let textura: THREE.CanvasTexture | null | undefined;

/** The circuit texture (black with gold traces), or null where there is no canvas (tests, a worker). Made on first use. */
export function texturaCircuitos(): THREE.Texture | null {
  if (textura !== undefined) return textura;
  textura = null;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas"); c.width = c.height = TAM;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#000"; g.fillRect(0, 0, TAM, TAM);
  const { segmentos, nodos } = trazosCircuito(0x4e554d, TAM);
  g.strokeStyle = "#fff"; g.lineWidth = 2; g.lineCap = "round";
  g.beginPath(); for (const [x0, y0, x1, y1] of segmentos) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke();
  g.fillStyle = "#fff"; for (const [x, y] of nodos) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (textura = t);
}

/** Makes a hand material glow with the circuits (a no-op without the texture). Changes no cost: same mesh, same draw call. */
export function conLuces<M extends THREE.MeshStandardMaterial>(mat: M): M {
  const t = texturaCircuitos();
  if (!t) return mat;
  mat.emissive.setHex(LUZ_NUMINIA); mat.emissiveMap = t; mat.emissiveIntensity = 1.1; // manos.ts `piel(null)` turns it to 0
  return mat;
}
