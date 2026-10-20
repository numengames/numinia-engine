// espacio-base · material (H2): ONE unlit line material for the whole mesh. The look lives here and costs almost nothing: the colour of a line is picked per
// pixel of a line (a 1-px line, so a few thousand pixels) from two things the geometry carries — its height (positionWorld.y) and its `tipo` attribute
// (malla.ts) — and from ONE uniform, the engine's own day factor (entorno `diaU`: 0 night … 1 day, the one the sky already follows). There is no texture,
// no halo pass and no second draw: the glow of the approved prototype is deliberately left out (cheap by default; Pablo: «no debe pesar nada»).
//
// NIGHT: Turquesa → Verdemar with height, Coral in the clefts; contours and ring Ámbar; accents coral / ámbar / morado / verde.
// DAY (the same mechanism, only the colours change, no geometry rebuilt): Turquesa profundo lines on the arena ground, Ámbar tostado at height and for
// contours/ring. The world's far edge melts into the sky's ground colour (the line colour mixes to it over the last 46 m); the scene's fog does the rest.
// NOT vec3(new THREE.Color(h)) (black on the GPU): constants go through uniform(Color).
import * as THREE from "three/webgpu";
import { uniform, float, mix, positionWorld, attribute, smoothstep, abs, max, clamp, select } from "three/tsl";
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
