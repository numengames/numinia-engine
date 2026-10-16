// pesca (3D, lazy chunk): the rod, the line and the float of everyone fishing near you, and a small pond disc at each
// fishing spot. Procedural, no .glb: a tapered rod (one cylinder + grip) held by the angler and pointed at the float, a
// line of 24 points sagging with tension (bridge-mind/tideline casting.js, MIT: sag = dist · 0.085 · (1 − tension · 0.85)),
// a two-colour float that bobs, dips on a nibble, sinks on the bite and comes in during the fight. Three draw calls per
// angler (rod, line, float) and one per spot. The page's chunk (apps/plaza/pesca.ts) loads this with the first spot.
import * as THREE from "three/webgpu";

export type Sitio3D = { id: string; x: number; y: number; z: number; radio: number };
export type Flotador3D = { quien: number; x: number; y: number; z: number };
export type Fase = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";
export type Estado3D = { fase: Fase; desde: number; tension: number; progreso: number; arrancada: "no" | "aviso" | "si" };
export type Quien = number | "self";

const PUNTOS = 24, LARGO_CANA = 2.0, ALTO_MANO = 1.05, LADO_MANO = 0.32, LANZAMIENTO_MS = 900;
const sag = (dist: number, tension: number) => dist * 0.085 * (1 - tension * 0.85);

type Angler = { grupo: THREE.Group; cana: THREE.Mesh; sedal: THREE.Line; flotador: THREE.Group; destino: THREE.Vector3; quien: Quien; nacido: number; pos: Float32Array };

export function crearPesca(h: { world: THREE.Group; posicionDe: (quien: Quien) => THREE.Vector3 | null }) {
  const canaGeo = new THREE.CylinderGeometry(0.018, 0.045, LARGO_CANA, 6); canaGeo.translate(0, LARGO_CANA / 2, 0); // base at the origin, tip up +y
  const canaMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3a, roughness: 0.75 });
  const sedalMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.85 });
  const rojo = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 }), blanco = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  const bolaGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const aguaMat = new THREE.MeshStandardMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.1 });
  const anglers = new Map<Quien, Angler>();
  const estanques = new Map<string, THREE.Mesh>();
  let self = -1, estado: Estado3D = { fase: "nada", desde: 0, tension: 0, progreso: 0, arrancada: "no" };
  let mordisqueoEn = 0;
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tip = new THREE.Vector3(), q = new THREE.Quaternion();

  const nuevo = (quien: Quien, destino: THREE.Vector3): Angler => {
    const grupo = new THREE.Group();
    const cana = new THREE.Mesh(canaGeo, canaMat); cana.castShadow = false; grupo.add(cana);
    const pos = new Float32Array(PUNTOS * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sedal = new THREE.Line(geo, sedalMat); sedal.frustumCulled = false; grupo.add(sedal);
    const flotador = new THREE.Group();
    const arriba = new THREE.Mesh(bolaGeo, rojo); arriba.scale.set(1, 0.6, 1); arriba.position.y = 0.06; flotador.add(arriba);
    const abajo = new THREE.Mesh(bolaGeo, blanco); abajo.scale.set(1, 0.6, 1); abajo.position.y = -0.03; flotador.add(abajo);
    const palito = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.25, 4), blanco); palito.position.y = 0.2; flotador.add(palito);
    grupo.add(flotador);
    h.world.add(grupo);
    return { grupo, cana, sedal, flotador, destino: destino.clone(), quien, nacido: performance.now(), pos };
  };
  const quitar = (a: Angler) => { h.world.remove(a.grupo); a.sedal.geometry.dispose(); };

  return {
    /** The fishing spots this page knows: a pond disc at each (the water element, if the builder put one, draws over it). */
    sitios(lista: Sitio3D[]): void {
      const vivos = new Set(lista.map((s) => s.id));
      for (const [id, m] of estanques) if (!vivos.has(id)) { h.world.remove(m); m.geometry.dispose(); estanques.delete(id); }
      for (const s of lista) {
        let m = estanques.get(s.id);
        if (!m) { // smaller than the reach: you fish from the shore
          m = new THREE.Mesh(new THREE.CircleGeometry(Math.max(1.5, s.radio * 0.55), 28), aguaMat); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.userData.sinSombra = true; h.world.add(m); estanques.set(s.id, m);
        }
        m.position.set(s.x, s.y + 0.02, s.z);
      }
    },
    /** Who fishes where now (yourself included). `yo` = my entity, so my own rod follows "self". */
    flotadores(lista: Flotador3D[], yo: number): void {
      self = yo;
      const vivos = new Set<Quien>();
      for (const f of lista) {
        const quien: Quien = f.quien === yo ? "self" : f.quien;
        vivos.add(quien);
        const d = tmp.set(f.x, f.y, f.z);
        const a = anglers.get(quien);
        if (!a) anglers.set(quien, nuevo(quien, d)); else a.destino.copy(d);
      }
      for (const [k, a] of anglers) if (!vivos.has(k)) { quitar(a); anglers.delete(k); }
    },
    /** My own phase (the server's): the float dips, sinks and comes in accordingly; others' floats just bob. */
    estado(e: Estado3D): void {
      if (e.fase === "mordisqueo" && estado.fase !== "mordisqueo") mordisqueoEn = performance.now();
      estado = { ...e };
    },
    actualizar(_dt: number): void {
      const now = performance.now();
      for (const a of anglers.values()) {
        const p = h.posicionDe(a.quien);
        a.grupo.visible = !!p;
        if (!p) continue;
        const mio = a.quien === "self";
        const fase = mio ? estado.fase : "espera", tension = mio && fase === "pelea" ? estado.tension / 100 : 0.1, progreso = mio && fase === "pelea" ? estado.progreso / 100 : 0;
        // the rod: in the right hand (beside the body, so it shows from behind), pointed at the float, lowered by tension
        const dX = a.destino.x - p.x, dZ = a.destino.z - p.z, dist = Math.hypot(dX, dZ) || 1;
        const mano = tmp.set(p.x + (-dZ / dist) * LADO_MANO, p.y - 0.85 + ALTO_MANO, p.z + (dX / dist) * LADO_MANO);
        a.cana.position.copy(mano);
        const haciaX = a.destino.x - mano.x, haciaZ = a.destino.z - mano.z, hd = Math.hypot(haciaX, haciaZ) || 1;
        const pitch = THREE.MathUtils.lerp(0.95, 0.45, tension); // radians from vertical: 55° up at rest, 25° when the line is tight
        tip.set((haciaX / hd) * Math.sin(pitch), Math.cos(pitch), (haciaZ / hd) * Math.sin(pitch));
        a.cana.quaternion.copy(q.setFromUnitVectors(up, tip));
        tip.multiplyScalar(LARGO_CANA).add(mano); // the tip, where the line starts
        // the float: a cast arc for the first second, then bobbing; mine dips, sinks and comes in
        const t = (now - a.nacido) / LANZAMIENTO_MS;
        const f = a.flotador.position;
        if (t < 1) { f.lerpVectors(tip, a.destino, t); f.y += Math.sin(t * Math.PI) * 1.6; }
        else {
          const cerca = mio ? THREE.MathUtils.lerp(0, 0.75, progreso) : 0; // the fight brings it toward the angler
          f.set(THREE.MathUtils.lerp(a.destino.x, mano.x, cerca), a.destino.y, THREE.MathUtils.lerp(a.destino.z, mano.z, cerca));
          let y = Math.sin(now / 700 + a.nacido) * 0.025;
          if (fase === "mordisqueo") { const k = (now - mordisqueoEn) / 450; if (k < 1) y -= Math.sin(k * Math.PI) * 0.12; }
          else if (fase === "picada") y -= 0.35 + Math.sin(now / 60) * 0.05;
          else if (fase === "pelea") { y -= 0.25; if (estado.arrancada !== "no") { f.x += Math.sin(now / 45) * 0.08; f.z += Math.cos(now / 55) * 0.08; } }
          f.y += y;
        }
        // the line: 24 points from the tip to the float, sagging in the middle with the slack
        const s = sag(tip.distanceTo(f), tension), pos = a.pos;
        for (let i = 0; i < PUNTOS; i++) {
          const k = i / (PUNTOS - 1);
          pos[i * 3] = tip.x + (f.x - tip.x) * k; pos[i * 3 + 1] = tip.y + (f.y - tip.y) * k - Math.sin(k * Math.PI) * s; pos[i * 3 + 2] = tip.z + (f.z - tip.z) * k;
        }
        (a.sedal.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      }
    },
    /** True while someone fishes (the float moves) — keeps the frame loop awake. */
    ocupado: (): boolean => anglers.size > 0,
    contar: () => ({ pescadores: anglers.size, sitios: estanques.size, cargado: true }),
  };
}
