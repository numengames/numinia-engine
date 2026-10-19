// naturaleza-auditar (F4): the optimisation audit of the whole nature piece, with the REAL pieces and no browser: per device tier, the
// start-up build time, the GPU buffer bytes (every attribute + index of every mesh), the number of meshes / materials, the bounding
// spheres of the instanced meshes, and 600 frames of `actualizar` with the camera standing still and walking: CPU ms per frame (p50/p95)
// and the heap garbage per frame (needs --expose-gc). Run: node --expose-gc tools/naturaleza-auditar.ts [semilla]
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearNaturaleza } from "../packages/render/src/naturaleza/naturaleza.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const semilla = Number(process.argv[2] ?? 1234), gc = (globalThis as { gc?: () => void }).gc;
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const filas: string[] = [];
for (const nivel of ["A", "B", "C", "D"] as Nivel[]) {
  const padre = new THREE.Group(), ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial()); padre.add(ground);
  const camara = new THREE.PerspectiveCamera(); camara.position.set(0, 1.7, 8);
  let hora = 19;
  const n = crearNaturaleza({ padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => nivel, camara, yo: () => ({ x: camara.position.x, y: 0, z: camara.position.z }), niebla: () => 0xc9d8e4, hora: () => hora, tablaFauna: async () => FAUNA_CASA });
  const t0 = performance.now(); await n.aplicar({ semilla }); const total = performance.now() - t0;
  const e = n.estadisticas();
  // bytes of every buffer, meshes, materials, culling
  let bytes = 0, mallas = 0, sinEsfera = 0; const mats = new Set<THREE.Material>(), porMalla: string[] = [];
  n.grupo!.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return; mallas++;
    const g = m.geometry; let b = 0;
    for (const a of Object.values(g.attributes)) b += (a as THREE.BufferAttribute).array.byteLength;
    if (g.index) b += g.index.array.byteLength; bytes += b; mats.add(m.material as THREE.Material);
    if ((m as THREE.InstancedMesh).isInstancedMesh || g.getAttribute("iA") || g.getAttribute("instanceMatrix")) if (!g.boundingSphere || !m.frustumCulled) sinEsfera++;
    porMalla.push(`${m.name || "?"}:${(b / 1024).toFixed(0)}k`);
  });
  for (const c of [1, 0]) { // static camera, then walking
    const dt = 1 / 60, ms: number[] = [];
    for (let i = 0; i < 60; i++) n.actualizar(dt); // warm
    gc?.(); const h0 = process.memoryUsage().heapUsed;
    for (let i = 0; i < 600; i++) {
      if (c === 0) { camara.position.x += 0.1; camara.position.z += 0.05; } // 6 m/s
      const a = performance.now(); n.actualizar(dt); ms.push(performance.now() - a);
    }
    const h1 = process.memoryUsage().heapUsed; gc?.();
    filas.push(`${nivel} ${c ? "still" : "walk "} | update p50 ${pct(ms, 0.5).toFixed(3)} p95 ${pct(ms, 0.95).toFixed(3)} max ${Math.max(...ms).toFixed(2)} ms | heap +${((h1 - h0) / 600).toFixed(0)} B/frame`);
  }
  filas.push(`${nivel} build | aplicar ${total.toFixed(0)} ms (modules + terrain + scatter + trees + grass + fauna; nature own ${e.msConstruir} + fauna ${e.msFauna} ms) | meshes ${mallas}, materials ${mats.size} | GPU buffers ${(bytes / 1024).toFixed(0)} KiB | instanced without sphere/culling: ${sinEsfera}`);
  if (process.env.DETALLE) filas.push("   " + porMalla.join(" "));
  n.dispose();
}
console.log(filas.join("\n"));
