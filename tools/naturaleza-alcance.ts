// naturaleza-alcance: how far AHEAD of a walking player the grass already stands, per device tier, with the REAL grass piece (no browser).
// Walks a camera along +x at SPEED m/s for SEG seconds at 60 fps, calling hierba.actualizar() each frame like the page does, and reports
// (a) CPU ms per frame of that call (mean / p99 / max: the cost the frame budget `presupuestoMs` guards), (b) grass tufts that rasterise
// (scale > 0 after the shader's distance fade) in the band AHEAD..AHEAD+8 m in front of the camera, as tufts per m² while walking and with the
// ring fully filled (the ceiling), (c) the farthest distance at which the live density in front is still ≥ 0.1 tuft/m², (d) tufts and triangles sent.
// Run: node tools/naturaleza-alcance.ts [semilla] [velocidad m/s] [adelante m]    (CPU only; says nothing about GPU time).
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearHierba, CERCA_MARCA, FLOR_MARCA } from "../packages/render/src/naturaleza/hierba.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const semilla = Number(process.argv[2] ?? 1234), VEL = Number(process.argv[3] ?? 5.5), ADELANTE = Number(process.argv[4] ?? 30), SEG = 12, FPS = 60, BANDA = 8;
const paso = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const pct = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/** Tufts that rasterise something, per distance ring ahead of the camera (x grows): [d, d+w) in front, within ±40° of the walking direction. */
function densidadAdelante(h: ReturnType<typeof crearHierba>, cfgRadio: number, cerca: { radio: number } | undefined, cam: THREE.Vector3, d0: number, ancho: number): number {
  const g = h.mallas[0].geometry as THREE.InstancedBufferGeometry, pos = g.getAttribute("iPos").array as Float32Array, col = g.getAttribute("iCol").array as Float32Array;
  let n = 0; const TAU = Math.PI * 2;
  for (let i = 0; i < pos.length / 4; i++) {
    let esc = col[i * 4 + 3]; if (esc <= 0) continue;
    const c = esc >= CERCA_MARCA / 2; if (c) esc -= CERCA_MARCA;
    if (esc >= FLOR_MARCA / 2) continue;                       // tufts only
    const dx = pos[i * 4] - cam.x, dz = pos[i * 4 + 2] - cam.z, d = Math.hypot(dx, dz);
    if (d < d0 || d >= d0 + ancho || dx <= 0 || Math.abs(dz) > Math.tan(0.7) * dx) continue;
    const R = c ? cerca!.radio : cfgRadio, q = 1 - paso(R * 0.7, R, d), rnd = pos[i * 4 + 3] / TAU;
    if (Math.min(1, Math.max(0, (q - rnd * 0.8) * 5)) > 0) n++;
  }
  const area = ancho * (2 * d0 + ancho) * 0.5 * (2 * 0.7); // annular sector of half-angle 0.7 rad (±40°)
  return n / area;
}

const filas: string[] = [];
for (const nivel of ["A", "B", "C", "D"] as Nivel[]) {
  const terreno = crearTerreno({ semilla, nivel });
  const viento = { vientoU: uniform(new THREE.Vector3(2, 0, 1)) };
  const camara = new THREE.Object3D(); camara.position.set(0, 1.7, 0);
  const hierba = crearHierba(viento, terreno, { semilla, nivel, empujaCamara: false });
  hierba.llenarTodo(camara);
  const R = hierba.config.radio, cerca = hierba.config.cerca;
  const ms: number[] = [], dens: number[] = [], pend: number[] = [];
  for (let f = 0; f < SEG * FPS; f++) {
    camara.position.x = VEL * f / FPS;
    const t0 = performance.now(); hierba.actualizar(camara, f / FPS); ms.push(performance.now() - t0);
    if (f % 30 === 29) { dens.push(densidadAdelante(hierba, R, cerca, camara.position, ADELANTE, BANDA)); pend.push(hierba.estadisticas().pendientes); }
  }
  const caminando = dens.slice(2).reduce((s, v) => s + v, 0) / (dens.length - 2);
  const pendMax = Math.max(...pend);
  hierba.llenarTodo(camara);
  const techo = densidadAdelante(hierba, R, cerca, camara.position, ADELANTE, BANDA);
  // farthest distance ahead with live density ≥ 0.1 tuft/m² (ring completely filled, camera standing)
  let alcance = 0; for (let d = 4; d < 90; d += 4) { if (densidadAdelante(hierba, R, cerca, camara.position, d, 4) >= 0.1) alcance = d + 4; }
  const e = hierba.estadisticas();
  filas.push(`${nivel} | radio ${R} m, celda ${hierba.config.celda} | frame ms mean ${(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(3)} p99 ${pct(ms, 0.99).toFixed(3)} max ${Math.max(...ms).toFixed(3)} (presupuesto ${hierba.config.presupuestoMs}) | cola máx ${pendMax} celdas | a ${ADELANTE}-${ADELANTE + BANDA} m delante: ${caminando.toFixed(3)} tufts/m² andando, ${techo.toFixed(3)} parado | alcance (≥0,1/m²) ${alcance} m | tufts vivos ${e.tuftsVivos}, enviados ${e.triangulosEnviados / 3} tufts = ${e.triangulosEnviados} triángulos, 1 llamada (+ flores en la misma) | ${hierba.bytes} B`);
  hierba.dispose(); terreno.dispose();
}
console.log(`semilla ${semilla}, ${VEL} m/s, ${SEG} s a ${FPS} fps\n` + filas.join("\n"));
process.exit(0);
