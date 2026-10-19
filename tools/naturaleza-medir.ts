// naturaleza-medir (N4): counts what the whole nature piece draws from the spawn on each device tier, with the REAL pieces
// (terrain N1 + scatter + trees N2 + grass N3 + fauna F4 at three hours of the day), no browser: triangles sent to the GPU (what renderer.info.render.triangles
// counts), triangles live, draw calls, bytes and the CPU ms of building. Run: node tools/naturaleza-medir.ts [semilla] [paleta]
// Judges each tier against PRESUPUESTO_NATURALEZA (the brief's hard limits) and exits 1 when one is broken.
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearArboles } from "../packages/render/src/naturaleza/arboles.ts";
import { crearHierba } from "../packages/render/src/naturaleza/hierba.ts";
import { esparcirArboles } from "../packages/render/src/naturaleza/esparcir.ts";
import type { Paleta } from "../packages/render/src/naturaleza/esparcir.ts";
import { crearFauna } from "../packages/render/src/naturaleza/fauna.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
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
  const tope = PRESUPUESTO_NATURALEZA[nivel];
  // F4: the fauna at noon (butterflies + birds), at dusk (twilight species) and at midnight (fireflies, owls); the world is judged by its WORST hour
  let peor = { tris: 0, llamadas: 0, hora: 12 }, detalle = "";
  const hierbaMax = eh.triangulosEnviados;
  for (const hora of [12, 19, 0]) {
    const fauna = crearFauna({ semilla, nivel, densidad: 1, especies: "", vientoU: viento.vientoU, camara, escena: new THREE.Group(), hora: () => hora, tabla: FAUNA_CASA, alturaEn: terreno.alturaEn, zonaEn: terreno.zonaEn });
    fauna.llenarTodo(camara, 3);
    const ef = fauna.estadisticas();
    const tris = terreno.triangulos + ea.triangulos + hierbaMax + ef.triangulos, llamadas = 1 + ea.llamadas + eh.dibujos + 1 + ef.llamadas;
    detalle += ` | h${hora}: fauna ${ef.triangulos} tris/${ef.llamadas} calls (${ef.mariposas}b ${ef.luciernagas}f ${ef.pajaros}p; pools full ${ef.triangulosPeor}) => ${tris} tris, ${llamadas} calls`;
    if (tris > peor.tris || llamadas > peor.llamadas) peor = { tris: Math.max(tris, peor.tris), llamadas: Math.max(llamadas, peor.llamadas), hora };
    fauna.dispose();
  }
  const bien = peor.tris <= tope.triangulos && peor.llamadas <= tope.llamadas;
  if (!bien) rojo = true;
  filas.push(`${nivel} | terrain ${terreno.triangulos} | trees ${ea.triangulos} (${puntos.length} planted, ${ea.arboles} drawn: ${ea.cerca.join("/")} near + ${ea.lejos} far; ${ea.llamadas} calls) | grass sent ${eh.triangulosEnviados} (${eh.dibujos} calls) | WORST ${peor.tris} / ${tope.triangulos} tris | ${peor.llamadas} / ${tope.llamadas} calls | build ms: terrain ${(t1 - t0).toFixed(0)} scatter ${(t2 - t1).toFixed(0)} trees ${(t3 - t2).toFixed(0)} grass ${(t4 - t3).toFixed(0)} | ${bien ? "OK" : "OVER BUDGET"}${detalle}`);
  hierba.dispose(); arboles.dispose(); terreno.dispose();
}
console.log(filas.join("\n"));
process.exit(rojo ? 1 : 0);
