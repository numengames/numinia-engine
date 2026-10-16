// agua-normales: a tileable water normal map made here (own work, no licence question): a sum of waves with whole
// frequencies, so it wraps. Shared by the elements' water (elementos.ts) and the fishing pond (pesca.ts), both lazy.
import * as THREE from "three/webgpu";

/** A tileable water normal map made here (own work, no licence question): a sum of waves with whole frequencies. */
export function normalesDeAgua(lado = 128): THREE.DataTexture {
  const ondas: [number, number, number, number][] = [[1, 2, 0.5, 0.3], [3, -1, 0.35, 1.7], [-2, 3, 0.3, 4.1], [5, 4, 0.18, 2.2], [-6, 5, 0.12, 0.9], [7, -8, 0.08, 5.3], [11, 9, 0.05, 3.3], [-13, 12, 0.04, 1.1]];
  const datos = new Uint8Array(lado * lado * 4);
  for (let y = 0; y < lado; y++) for (let x = 0; x < lado; x++) {
    let dx = 0, dy = 0;
    for (const [fx, fy, a, f] of ondas) { const c = Math.cos(2 * Math.PI * ((fx * x) / lado + (fy * y) / lado) + f) * a * 2 * Math.PI; dx += c * fx / 8; dy += c * fy / 8; }
    const l = Math.hypot(dx, dy, 1), i = (y * lado + x) * 4;
    datos[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255); datos[i + 1] = Math.round(((-dy / l) * 0.5 + 0.5) * 255); datos[i + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255); datos[i + 3] = 255;
  }
  const t = new THREE.DataTexture(datos, lado, lado, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
