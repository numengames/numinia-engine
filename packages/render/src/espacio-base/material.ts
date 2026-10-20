// espacio-base · material (H2): ONE unlit line material for the whole mesh. The look lives here and costs almost nothing: the colour of a line is picked per
// pixel of a line (a 1-px line, so a few thousand pixels) from two things the geometry carries — its height (positionWorld.y) and its `tipo` attribute
// (malla.ts) — and from ONE uniform, the engine's own day factor (entorno `diaU`: 0 night … 1 day, the one the sky already follows). There is no texture,
// no halo pass: the lines get no glow (1-px lines cannot glow without extra geometry or a screen pass; Pablo: «no debe pesar nada»). The ONLY second draw is the accents' dots (crearMaterialPuntos, below).
//
// NIGHT: Turquesa → Verdemar with height, Coral in the clefts; contours and ring Ámbar; accents coral / ámbar / morado / verde.
// DAY (the same mechanism, only the colours change, no geometry rebuilt): Turquesa profundo lines on the arena ground, Ámbar tostado at height and for
// contours/ring. The world's far edge melts into the sky's ground colour (the line colour mixes to it over the last 46 m); the scene's fog does the rest.
// NOT vec3(new THREE.Color(h)) (black on the GPU): constants go through uniform(Color).
import * as THREE from "three/webgpu";
import { uniform, float, vec3, mix, positionWorld, positionLocal, attribute, smoothstep, abs, max, clamp, select, length, cameraPosition, cameraViewMatrix } from "three/tsl";
import { ESPACIO_BASE } from "../naturaleza/paleta.ts";
import { TIPO } from "./malla.ts";

export const BORDE_DESDE = 154, BORDE_HASTA = 198; // |x|,|z| (m) where the lines melt into the ground colour

type Nodo = ReturnType<typeof float>;
export function crearMaterialBase(dia: Nodo): THREE.LineBasicNodeMaterial {
  const col = (h: number) => uniform(new THREE.Color(h));
  const E = ESPACIO_BASE, N = E.linea, D = E.lineaDia;
  const y = positionWorld.y, tipo = attribute("tipo", "float");
  const alto = clamp(y.div(30), 0, 1), hondo = clamp(y.negate().div(12), 0, 1);
  const noche = mix(mix(col(N.baja), col(N.alta), alto), col(N.hendidura), hondo);
  const diaC = mix(mix(col(D.baja), col(D.alta), alto), col(D.hendidura), hondo);
  const es = (t: number) => abs(tipo.sub(t)).lessThan(0.5);
  // each kind: [night, day]
  const por = (t: number, n: Nodo, d: Nodo) => ({ es: es(t), color: mix(n, d, dia) });
  const curva = por(TIPO.curva, col(E.curva), col(E.curvaDia)), anillo = por(TIPO.anillo, col(E.anillo), col(E.curvaDia));
  const acento = (t: number, h: number) => por(t, col(h), col(E.acentosDia[h] ?? h));
  const coral = acento(TIPO.coral, E.acentos.coral), ambar = acento(TIPO.ambar, E.acentos.ambar), morado = acento(TIPO.morado, E.acentos.morado), verde = acento(TIPO.verde, E.acentos.verde);
  let c: Nodo = mix(noche, diaC, dia);
  for (const k of [curva, anillo]) c = select(k.es, k.color, c) as Nodo;
  for (const k of [coral, ambar, morado, verde]) c = select(k.es, k.color.mul(1.35), c) as Nodo; // the accents shine a little more
  const sueloC = mix(col(E.noche.suelo), col(E.dia.suelo), dia);
  const borde = float(1).sub(smoothstep(BORDE_DESDE, BORDE_HASTA, max(abs(positionWorld.x), abs(positionWorld.z))));
  const m = new THREE.LineBasicNodeMaterial();
  m.colorNode = mix(sueloC, c.mul(mix(float(0.9), float(1.0), dia)), borde);
  m.name = "espacio-base";
  return m;
}

/** The accents' dots (the second and last draw call): camera-facing quads at the ticks' tips, sized by distance (world size grows with distance so the dot keeps a
 *  readable ~7 px from far away and shrinks only when close), a bright core and a soft halo, the same colours and the same `dia` uniform as the lines. No texture. */
export const PUNTO = { px: 0.0115, min: 0.28, max: 6 };
export function crearMaterialPuntos(dia: Nodo): THREE.MeshBasicNodeMaterial {
  const col = (h: number) => uniform(new THREE.Color(h));
  const E = ESPACIO_BASE, tipo = attribute("tipo", "float"), esq = attribute("esquina", "vec2");
  const de = (t: number, h: number) => ({ es: abs(tipo.sub(t)).lessThan(0.5), color: mix(col(h), col(E.acentosDia[h] ?? h), dia) });
  let c: Nodo = col(E.acentos.verde) as Nodo;
  c = mix(col(E.acentos.verde), col(E.acentosDia[E.acentos.verde] ?? E.acentos.verde), dia) as Nodo;
  for (const [t, h] of [[TIPO.coral, E.acentos.coral], [TIPO.ambar, E.acentos.ambar], [TIPO.morado, E.acentos.morado]] as const) { const k = de(t, h); c = select(k.es, k.color, c) as Nodo; }
  const m = new THREE.MeshBasicNodeMaterial();
  const lejos = length(positionLocal.sub(cameraPosition)), tam = clamp(lejos.mul(PUNTO.px), PUNTO.min, PUNTO.max);
  const dir = (c: "x" | "y") => vec3(cameraViewMatrix.element(0)[c], cameraViewMatrix.element(1)[c], cameraViewMatrix.element(2)[c]); // a row of the view matrix = the camera's right / up in the world
  m.positionNode = positionLocal.add(dir("x").mul(esq.x).add(dir("y").mul(esq.y)).mul(tam));
  const r = length(esq), nucleo = float(1).sub(smoothstep(0.3, 0.55, r)), halo = float(1).sub(smoothstep(0.55, 1.0, r));
  m.colorNode = mix(c, float(1), nucleo.mul(mix(float(0.55), float(0.0), dia)));
  const borde = float(1).sub(smoothstep(BORDE_DESDE, BORDE_HASTA, max(abs(positionLocal.x), abs(positionLocal.z)))); // the dots melt into the horizon like the lines (no fog: far dots stay readable)
  m.opacityNode = max(nucleo, halo.mul(mix(float(0.3), float(0.18), dia))).mul(borde);
  m.fog = false;
  m.transparent = true; m.depthWrite = false;
  m.name = "espacio-base-puntos";
  return m;
}
