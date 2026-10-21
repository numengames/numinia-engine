// suelo-compartido (B3): the espacio base and the nature can both be on at once, and both used to hide the flat ground, hide the landmark pillars and
// lay an atmosphere, then «restore» what they had found — so switching one off brought back what the other still meant to hide. This tiny module
// counts the holders: the FIRST one hides, the LAST one to leave restores. The base wins the atmosphere (it is the floor of everything).
//
// COPIED / CHANGED: `ocultarHitos` (naturaleza/hitos.ts) is reused per pillar; nothing in index.ts / entorno.ts changes (they hand the same `ground`,
// `hitos` and `atmosfera` to both pieces, which is what the keys below rely on).
import type * as THREE from "three/webgpu";
import type { Atmosfera } from "./entorno.ts";
import { ocultarHitos } from "./naturaleza/hitos.ts";

const suelos = new WeakMap<object, { n: number; visible: boolean }>();
/** Hide the flat ground; returns the release. Two holders → it stays hidden until both released (each release is idempotent). */
export function ocultarSuelo(ground: THREE.Object3D): () => void {
  let e = suelos.get(ground);
  if (!e) { e = { n: 0, visible: ground.visible }; suelos.set(ground, e); }
  if (e.n++ === 0) { e.visible = ground.visible; ground.visible = false; }
  let suelto = false;
  return () => {
    if (suelto) return; suelto = true;
    const q = suelos.get(ground); if (!q) return;
    if (--q.n <= 0) { ground.visible = q.visible; suelos.delete(ground); }
  };
}

const pilares = new WeakMap<object, { n: number; soltar: () => void }>();
/** Hide the landmark pillars; each pillar is released only when its last holder lets go. */
export function ocultarHitosCompartido(hitos: Iterable<THREE.Object3D>): () => void {
  const mios: THREE.Object3D[] = [];
  for (const o of hitos) {
    const e = pilares.get(o);
    if (e) e.n++; else pilares.set(o, { n: 1, soltar: ocultarHitos([o]) });
    mios.push(o);
  }
  let suelto = false;
  return () => {
    if (suelto) return; suelto = true;
    for (const o of mios) { const e = pilares.get(o); if (e && --e.n <= 0) { e.soltar(); pilares.delete(o); } }
  };
}

type Aplica = (a: Atmosfera) => () => void;
type Dueno = "base" | "naturaleza";
const atmosferas = new WeakMap<Aplica, { quieren: Map<Dueno, Atmosfera>; puesta: Atmosfera | null; deshacer: (() => void) | null }>();
/** Lay an atmosphere for `dueno`. The base's wins when both are on; when the winner leaves, the other one's is laid; when none is left the world's own returns. */
export function ponerAtmosfera(aplica: Aplica, dueno: Dueno, a: Atmosfera): () => void {
  let e = atmosferas.get(aplica);
  if (!e) { e = { quieren: new Map(), puesta: null, deshacer: null }; atmosferas.set(aplica, e); }
  const E = e;
  const resolver = () => {
    const gana = E.quieren.get("base") ?? E.quieren.get("naturaleza") ?? null;
    if (gana === E.puesta) return;
    if (gana) { E.deshacer = aplica(gana); E.puesta = gana; } // a new apply takes over from the old one (entorno.ts): no undo in between
    else { E.deshacer?.(); E.deshacer = null; E.puesta = null; }
  };
  E.quieren.set(dueno, a); resolver();
  return () => { if (E.quieren.get(dueno) === a) { E.quieren.delete(dueno); resolver(); } };
}
