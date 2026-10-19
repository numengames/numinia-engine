// Dev-only test page of the «materia de bloques» spike (materia.html). A Residuo-sized shape (≈1.4 m) made of the dice
// mix, assembling and crumbling over a plain floor, plus renderer.info measured with and without the piece.
// URL: nivel=A|B|C, metodo=relleno|pegados|separados, forma=esfera|columna|arco, p=0..1 (fixed) , modo=junta|deshace,
// webgl=1 (force the WebGL2 backend, as the Quest), piezas=N (N pieces side by side, for the cost table).
import * as THREE from "three/webgpu";
import { crearMateria } from "../../packages/render/src/materia.ts";
import { muestrear, cuantos, lado, areaForma, MEZCLA, BLOQUES_PIEZA } from "../../packages/render/src/materia-politica.ts";
import type { Forma, Metodo } from "../../packages/render/src/materia-politica.ts";
import type { Nivel } from "../../packages/render/src/calidad.ts";

const q = new URLSearchParams(location.search);
const nivel = (q.get("nivel") ?? "A") as Nivel;
const metodo = (q.get("metodo") ?? "relleno") as Metodo;
const piezas = Math.max(1, Number(q.get("piezas") ?? 1));
const FORMAS: Record<string, Forma> = {
  esfera: { tipo: "esfera", radio: 0.7 },
  columna: { tipo: "columna", radio: 0.35, alto: 1.4 },
  arco: { tipo: "arco", ancho: 1.4, alto: 1.4, grueso: 0.28 },
};
const forma = FORMAS[q.get("forma") ?? "esfera"] ?? FORMAS.esfera;
// «lleno» = the tier's full count (for the cost table); otherwise as many 10 cm blocks as the surface wants
const n = q.get("lleno") ? BLOQUES_PIEZA[nivel] : cuantos(areaForma(forma), nivel);
const muestra = muestrear(forma, n, 7);

const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: q.get("webgl") === "1" });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
await renderer.init();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d3138);
scene.fog = new THREE.Fog(0x1d3138, 8, 30);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 100);
camera.position.set(0, 1.6, 4.6);
camera.lookAt(0, 0.9, 0);
scene.add(new THREE.HemisphereLight(0xf9ebdc, 0x2f4a4f, 2.2));
const suelo = new THREE.Mesh(new THREE.CircleGeometry(6, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertNodeMaterial({ color: 0x3c5a55 }));
scene.add(suelo);

const lista = Array.from({ length: piezas }, (_, k) => {
  const m = crearMateria({ muestra, nivel, lado: lado(muestra.area, muestra.n), metodo, semilla: 1 + k });
  m.objeto.position.x = (k - (piezas - 1) / 2) * 1.8;
  scene.add(m.objeto);
  return m;
});
if (piezas > 1) camera.position.set(0, 2.2, 3 + piezas * 1.3);

const fijo = q.get("p");
const ponerModo = (m: "junta" | "deshace") => lista.forEach((x) => x.modo(m));
ponerModo(q.get("modo") === "deshace" ? "deshace" : "junta");
const info = document.getElementById("info")!;
const medidas: { con?: { calls: number; tris: number }; sin?: { calls: number; tris: number } } = {};
const medir = () => ({ calls: renderer.info.render.drawCalls, tris: renderer.info.render.triangles });

let t0 = performance.now(), ultimo = t0, frames = 0;
renderer.setAnimationLoop(() => {
  const ahora = performance.now(), dt = (ahora - ultimo) / 1000;
  ultimo = ahora; frames++;
  let p: number;
  if (fijo !== null) p = Number(fijo);
  else {
    // loop of 9 s: assemble 3 s, hold 1.5 s, crumble 3 s, pause 1.5 s
    const c = ((ahora - t0) / 1000) % 9;
    if (c < 3) { ponerModo("junta"); p = c / 3; } else if (c < 4.5) p = 1; else if (c < 7.5) { ponerModo("deshace"); p = 1 - (c - 4.5) / 3; } else p = 0;
  }
  for (const m of lista) { m.progreso(p); m.avanzar(dt); }
  // one frame without the pieces, then with them: the difference is what the layer adds
  const conPiezas = frames !== 3;
  for (const m of lista) m.objeto.visible = conPiezas;
  renderer.render(scene, camera);
  if (frames === 3) medidas.sin = medir(); else if (frames > 3) medidas.con = medir();
  const e = lista[0].estado();
  info.textContent = `nivel ${nivel} · ${metodo} · ${renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2"} · ${piezas} pieza(s)\n` +
    `partículas ${muestra.n} (${e.opacas} opacas + ${e.translucidas} translúcidas) · p ${p.toFixed(2)}\n` +
    `mezcla ${Object.entries(MEZCLA[nivel]).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(" ")}\n` +
    (medidas.con && medidas.sin ? `añade: ${medidas.con.calls - medidas.sin.calls} llamadas · ${medidas.con.tris - medidas.sin.tris} triángulos` : "");
});
(window as any).__materia = { medidas, estado: () => lista.map((m) => m.estado()), backend: () => (renderer.backend.isWebGPUBackend ? "WebGPU" : "WebGL2"), frames: () => frames };
