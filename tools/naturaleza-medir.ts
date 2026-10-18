// naturaleza-medir (N4): counts what the whole nature piece draws from the spawn on each device tier, with the REAL pieces
// (terrain N1 + scatter + trees N2 + grass N3), no browser: triangles sent to the GPU (what renderer.info.render.triangles
// counts), triangles live, draw calls, bytes and the CPU ms of building. Run: node tools/naturaleza-medir.ts [semilla] [paleta]
// Judges each tier against PRESUPUESTO_NATURALEZA (the brief's hard limits) and exits 1 when one is broken.
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearArboles } from "../packages/render/src/naturaleza/arboles.ts";
import { crearHierba } from "../packages/render/src/naturaleza/hierba.ts";
import { esparcirArboles } from "../packages/render/src/naturaleza/esparcir.ts";
import type { Paleta } from "../packages/render/src/naturaleza/esparcir.ts";
import { PRESUPUESTO_NATURALEZA } from "../packages/render/src/naturaleza/niveles.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const semilla = Number(process.argv[2] ?? 1234), paleta = (process.argv[3] ?? "verano") as Paleta;
let rojo = false;
const filas: string[] = [];
for (const nivel of ["A", "B", "C", "D"] as Nivel[]) {
  const t0 = performance.now();
  const terreno = crearTerreno({ semilla, nivel });
  const t1 = performance.now();
  const puntos = esparcirArboles(terreno, { semilla, tamano: 200, plaza: 12, densidad: 1, nivel, paleta, estanque: terreno.estanque });
  const t2 = performance.now();
  const viento = { vientoU: uniform(new THREE.Vector3(2, 0, 1)) };
  const camara = new THREE.Object3D(); camara.position.set(0, 1.7, 0);  // the spawn
  const arboles = crearArboles({ ...viento, nivel, camara }, puntos);
  arboles.repartir(0, 1.7, 0);
  const t3 = performance.now();
  const hierba = crearHierba(viento, terreno, { semilla, nivel, empujaCamara: false });
  hierba.llenarTodo(camara);
  const t4 = performance.now();
  const ea = arboles.estadisticas(), eh = hierba.estadisticas();
  const tris = terreno.triangulos + ea.triangulos + eh.triangulosEnviados;
  const llamadas = 1 + ea.llamadas + eh.dibujos + 1; // terrain + trees + grass + the pond's water
  const tope = PRESUPUESTO_NATURALEZA[nivel];
  const bien = tris <= tope.triangulos && llamadas <= tope.llamadas;
  if (!bien) rojo = true;
  const zonas: Record<string, number> = {};
  filas.push(`${nivel} | terrain ${terreno.triangulos} | trees ${ea.triangulos} (${puntos.length} planted, ${ea.arboles} drawn: ${ea.cerca.join("/")} near + ${ea.lejos} far) | grass sent ${eh.triangulosEnviados} (live ${eh.triangulosVivos}) | TOTAL ${tris} / ${tope.triangulos} | calls ${llamadas} / ${tope.llamadas} | build ms: terrain ${(t1 - t0).toFixed(0)} scatter ${(t2 - t1).toFixed(0)} trees ${(t3 - t2).toFixed(0)} grass ${(t4 - t3).toFixed(0)} | ${bien ? "OK" : "OVER BUDGET"}`);
  void zonas;
  hierba.dispose(); arboles.dispose(); terreno.dispose();
}
console.log(filas.join("\n"));
process.exit(rojo ? 1 : 0);
