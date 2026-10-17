// pesca (3D, lazy chunk, v2): a fishing spot you can see and understand — a pond with a shaded water surface, an earth
// bank with stones and reeds, a boardwalk of planks into the water and a «Pesca» sign —, the rod, line and float of
// everyone fishing near you, and the fish you land: it jumps out of the water, flies along the line into the angler's
// right hand and hangs there a few seconds (everyone near sees it, with the label the page puts over the head).
// Procedural, no .glb. Water = ONE draw call: the engine's stylised water (agua-estilo.ts: flat shallow/deep bands,
// shore foam, stepped fresnel toward the horizon, caustics/streaks by tier) plus two pale rings of ripples (float
// landing, bite, jump); no texture, no reflection render-target (phones). Per spot: 7 draw calls (water, bank, stones, reeds, boardwalk,
// sign, its text); per angler: 3 (rod, line, float); per landed fish: 1 (body, tail, fins and eyes merged, vertex
// colours by species). The page's chunk (apps/plaza/pesca.ts) loads this with the first spot.
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { materialDeAgua as aguaEstilo, geometriaDeAgua } from "./agua-estilo.ts";
import type { LuzAgua } from "./agua-estilo.ts";
import { detalleAgua, OLAS_DESDE_M } from "./calidad.ts";
import type { DetalleAgua } from "./calidad.ts";

export type Sitio3D = { id: string; x: number; y: number; z: number; radio: number };
export type Flotador3D = { quien: number; x: number; y: number; z: number };
export type Captura3D = { quien: number; pez: string; cm: number; rareza: string; desde: number };
export type Fase = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";
export type Estado3D = { fase: Fase; desde: number; tension: number; progreso: number; arrancada: "no" | "aviso" | "si" };
export type Quien = number | "self";
export type Ayudas = { world: THREE.Group; posicionDe: (quien: Quien) => THREE.Vector3 | null; manoDe?: (quien: Quien, out: THREE.Vector3) => THREE.Vector3 | null; orientar?: (quien: Quien, rumbo: number | undefined) => void;
  /** N2: the scene's light for the water and the water detail of this tier (without them: the house light, tier C's detail). */
  agua?: { luz: LuzAgua; detalle: () => DetalleAgua } };

const PUNTOS = 24, LARGO_CANA = 2.0, ALTO_MANO = 1.05, LADO_MANO = 0.32, LANZAMIENTO_MS = 900;
/** The fish's flight from the water to the hand (ms) and how far an angler may step before the fish is put away (m). */
export const SALTO_MS = 1300, PASO_SUELTA_M = 0.6;
const sag = (dist: number, tension: number) => dist * 0.085 * (1 - tension * 0.85);
/** Body colour by species (the table's names); unknown fish are silver. */
const COLORES: Record<string, number> = { Carpa: 0xb8863a, Trucha: 0x6f9a5a, Lucio: 0x5e7a3c };
const hex = (c: number) => new THREE.Color(c);

/** Where a spot's boardwalk and sign go: toward the plaza's centre (the origin), so you walk onto it from the square. */
export function trazaDeSitio(s: { x: number; z: number; radio: number }): { R: number; dir: THREE.Vector2; pantalan: { x: number; z: number }; rumbo: number } {
  const R = Math.max(2, s.radio * 0.85);
  const d = Math.hypot(s.x, s.z);
  const dir = d > 1 ? new THREE.Vector2(-s.x / d, -s.z / d) : new THREE.Vector2(0, 1);
  return { R, dir, pantalan: { x: s.x + dir.x * R * 0.7, z: s.z + dir.y * R * 0.7 }, rumbo: Math.atan2(-dir.x, -dir.y) };
}

/** Merge non-indexed geometries that all carry position, normal and color into one (one draw call). */
function fundir(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const g of partes) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...(n.getAttribute("position").array as Float32Array)); nor.push(...(n.getAttribute("normal").array as Float32Array)); col.push(...(n.getAttribute("color").array as Float32Array));
    if (n !== g) n.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}
/** Paint a geometry one colour (optionally darker on top / lighter below, by the normal's y), placed with a matrix. */
function pieza(g: THREE.BufferGeometry, color: THREE.Color, m?: THREE.Matrix4, sombra = 0): THREE.BufferGeometry {
  const n = g.getAttribute("position").count, c = new Float32Array(n * 3), nor = g.getAttribute("normal");
  for (let i = 0; i < n; i++) { const k = sombra ? 1 - sombra * 0.5 * (nor.getY(i) + 1) : 1; c[i * 3] = color.r * k; c[i * 3 + 1] = color.g * k; c[i * 3 + 2] = color.b * k; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  if (m) g.applyMatrix4(m);
  return g;
}
/** A flat triangle (a fin, a tail blade) from three points, both faces lit (DoubleSide material). */
function aleta(a: [number, number, number], b: [number, number, number], c: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}
const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
/** A small deterministic sequence (stones and reeds look the same for everyone, no Math.random). */
const semilla = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** One fish, 1 m long along +x (head at +0.5), 1 draw call; scale it by the size. */
export function geometriaDePez(especie: string): THREE.BufferGeometry {
  const cuerpo = hex(COLORES[especie] ?? 0x9aa5b1), oscuro = cuerpo.clone().multiplyScalar(0.72), ojo = hex(0x111111), brillo = hex(0xf2f2f2);
  const partes = [
    pieza(new THREE.SphereGeometry(0.5, 12, 8), cuerpo, M(0, 0, 0, 0, 0, 0, 1, 0.36, 0.22), 0.45),
    pieza(new THREE.SphereGeometry(0.5, 12, 8), cuerpo.clone().multiplyScalar(1.25), M(0.02, -0.03, 0, 0, 0, 0, 0.9, 0.3, 0.2), 0),
    pieza(aleta([-0.48, 0, 0], [-0.78, 0.2, 0], [-0.78, -0.2, 0]), oscuro),            // tail
    pieza(aleta([-0.12, 0.16, 0], [0.18, 0.18, 0], [0.22, 0.12, 0]), oscuro),          // dorsal fin
    pieza(aleta([0.15, -0.05, 0.1], [-0.05, -0.08, 0.2], [0.05, -0.14, 0.12]), oscuro), // pectoral fins
    pieza(aleta([0.15, -0.05, -0.1], [-0.05, -0.08, -0.2], [0.05, -0.14, -0.12]), oscuro),
    pieza(new THREE.SphereGeometry(0.045, 6, 4), brillo, M(0.33, 0.05, 0.09)), pieza(new THREE.SphereGeometry(0.028, 6, 4), ojo, M(0.35, 0.05, 0.105)),
    pieza(new THREE.SphereGeometry(0.045, 6, 4), brillo, M(0.33, 0.05, -0.09)), pieza(new THREE.SphereGeometry(0.028, 6, 4), ojo, M(0.35, 0.05, -0.105)),
  ];
  return fundir(partes);
}

type Angler = { grupo: THREE.Group; cana: THREE.Mesh; sedal: THREE.Line; flotador: THREE.Group; destino: THREE.Vector3; quien: Quien; nacido: number; pos: Float32Array; cayo: boolean };
type Pez3D = { grupo: THREE.Group; malla: THREE.Mesh; quien: Quien; desde: number; origen: THREE.Vector3; donde: THREE.Vector3; largo: number; guardado: boolean };
type Onda = { value: THREE.Vector4 };
type Estanque = { grupo: THREE.Group; agua: THREE.Mesh; ondas: [Onda, Onda]; turno: number; s: Sitio3D; pantalan: { x: number; z: number }; rumbo: number };

export function crearPesca(h: Ayudas) {
  const canaGeo = new THREE.CylinderGeometry(0.018, 0.045, LARGO_CANA, 6); canaGeo.translate(0, LARGO_CANA / 2, 0); // base at the origin, tip up +y
  const canaMat = new THREE.MeshStandardMaterial({ color: 0x9a6b3a, roughness: 0.75 });
  const sedalMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.85 });
  const rojo = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.5 }), blanco = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
  const bolaGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const pezMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
  const pezGeos = new Map<string, THREE.BufferGeometry>();
  const tierraMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const maderaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const tiempo = uniform(0);
  const anglers = new Map<Quien, Angler>();
  const ultimoFlotador = new Map<Quien, THREE.Vector3>(); // where the float was when the angler stopped (the fish jumps from there)
  const peces = new Map<Quien, Pez3D>();
  const estanques = new Map<string, Estanque>();
  const caras = new Set<Quien>(); // whose body we turned toward the water
  let self = -1, estado: Estado3D = { fase: "nada", desde: 0, tension: 0, progreso: 0, arrancada: "no" };
  let mordisqueoEn = 0, arrancadaVista: Estado3D["arrancada"] = "no";
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tip = new THREE.Vector3(), q = new THREE.Quaternion();

  // ---- the water: one node material per pond (each pond has its own ripple uniforms), rebuilt when the tier changes ----
  const detalle = (): DetalleAgua => h.agua?.detalle() ?? detalleAgua("C", "simple");
  let detalleVisto = JSON.stringify(detalle());
  const AGUA_ESTANQUE = 0x2a8a96;
  const materialDeAgua = (R: number, ondas: [Onda, Onda]) => aguaEstilo({ color: AGUA_ESTANQUE, forma: { tipo: "circulo", radio: R }, detalle: detalle(), tiempo: tiempo as unknown as { value: number }, luz: h.agua?.luz, ondas, bordeOculto: 0.2 }, OLAS_DESDE_M);

  function nuevoEstanque(s: Sitio3D): Estanque {
    const { R, dir, pantalan, rumbo } = trazaDeSitio(s);
    const grupo = new THREE.Group(); grupo.name = `pesca:${s.id}`;
    const ondas: [Onda, Onda] = [uniform(new THREE.Vector4(0, 0, -99, 0)) as unknown as Onda, uniform(new THREE.Vector4(0, 0, -99, 0)) as unknown as Onda];
    const agua = new THREE.Mesh(geometriaDeAgua({ tipo: "circulo", radio: R }, detalle(), OLAS_DESDE_M), materialDeAgua(R, ondas));
    agua.position.y = 0.02; agua.receiveShadow = true; agua.userData.sinSombra = true; agua.name = "agua"; grupo.add(agua);
    // the bank: an earth ring rising from the water's edge and falling back to the ground
    const perfil = [new THREE.Vector2(R - 0.2, 0), new THREE.Vector2(R + 0.15, 0.1), new THREE.Vector2(R + 0.75, 0.14), new THREE.Vector2(R + 1.4, 0.01)];
    const orilla = new THREE.Mesh(pieza(new THREE.LatheGeometry(perfil, 36), hex(0x6b5a3e), undefined, 0.2), tierraMat); orilla.receiveShadow = true; grupo.add(orilla);
    // stones along the bank and three clumps of reeds, each one draw call
    const piedras: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) { const a = semilla(i) * Math.PI * 2, r = R + 0.2 + semilla(i + 50) * 0.7, t = 0.1 + semilla(i + 100) * 0.14; piedras.push(pieza(new THREE.DodecahedronGeometry(t, 0), hex(0x8a8f94).multiplyScalar(0.8 + semilla(i + 150) * 0.4), M(Math.cos(a) * r, 0.08 + t * 0.4, Math.sin(a) * r, semilla(i + 200) * 3, semilla(i + 250) * 3, 0, 1, 0.7, 1))); }
    grupo.add(new THREE.Mesh(fundir(piedras), tierraMat));
    const juncos: THREE.BufferGeometry[] = [];
    for (let c = 0; c < 3; c++) {
      const a = Math.atan2(dir.y, dir.x) + Math.PI + (c - 1) * 1.1; // across the pond from the boardwalk
      const cx = Math.cos(a) * (R - 0.1), cz = Math.sin(a) * (R - 0.1);
      for (let i = 0; i < 6; i++) { const k = c * 6 + i, alto = 0.8 + semilla(k + 300) * 0.5, x = cx + (semilla(k + 400) - 0.5) * 0.6, z = cz + (semilla(k + 500) - 0.5) * 0.6; juncos.push(pieza(new THREE.CylinderGeometry(0.012, 0.02, alto, 4), hex(0x4f7a3a), M(x, alto / 2, z, (semilla(k + 600) - 0.5) * 0.3, 0, (semilla(k + 700) - 0.5) * 0.3))); if (i % 2 === 0) juncos.push(pieza(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 5), hex(0x5a3a22), M(x, alto - 0.05, z))); }
    }
    grupo.add(new THREE.Mesh(fundir(juncos), tierraMat));
    // the boardwalk: planks over the water from the bank to a third of the way in, two beams, four bollards; walkable at ground level
    const tablas: THREE.BufferGeometry[] = [];
    const desde = R * 0.38, hasta = R + 1.2, ancho = 1.5, ry = Math.atan2(dir.x, dir.y); // planks run along `dir`
    for (let d = desde; d < hasta; d += 0.34) tablas.push(pieza(new THREE.BoxGeometry(ancho, 0.05, 0.3), hex(0x8b6a44).multiplyScalar(0.85 + semilla(Math.round(d * 10)) * 0.3), M(dir.x * (d + 0.15), 0.065, dir.y * (d + 0.15), 0, ry, 0)));
    for (const lado of [-1, 1]) {
      tablas.push(pieza(new THREE.BoxGeometry(0.12, 0.08, hasta - desde), hex(0x5a3f28), M(dir.x * (desde + hasta) / 2 - dir.y * lado * (ancho / 2 - 0.1), 0.03, dir.y * (desde + hasta) / 2 + dir.x * lado * (ancho / 2 - 0.1), 0, ry, 0)));
      for (const d of [desde + 0.1, R + 0.3]) tablas.push(pieza(new THREE.BoxGeometry(0.14, 0.7, 0.14), hex(0x4a3320), M(dir.x * d - dir.y * lado * (ancho / 2 + 0.03), 0.3, dir.y * d + dir.x * lado * (ancho / 2 + 0.03), 0, ry, 0)));
    }
    grupo.add(new THREE.Mesh(fundir(tablas), maderaMat));
    // the sign «Pesca» beside the boardwalk's start, facing whoever comes from the square
    const sx = dir.x * (hasta - 0.2) - dir.y * (ancho / 2 + 0.6), sz = dir.y * (hasta - 0.2) + dir.x * (ancho / 2 + 0.6);
    const cartel = new THREE.Mesh(fundir([pieza(new THREE.BoxGeometry(0.09, 1.7, 0.09), hex(0x5a3f28), M(sx, 0.85, sz)), pieza(new THREE.BoxGeometry(1.0, 0.4, 0.06), hex(0x8b6a44), M(sx, 1.45, sz, 0, ry, 0))]), maderaMat);
    cartel.castShadow = true; grupo.add(cartel);
    const lienzo = document.createElement("canvas"); lienzo.width = 256; lienzo.height = 96;
    const ctx = lienzo.getContext("2d")!; ctx.fillStyle = "#f3e7c9"; ctx.fillRect(0, 0, 256, 96); ctx.fillStyle = "#3a2a1a"; ctx.font = "bold 58px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("Pesca", 128, 50);
    const tex = new THREE.CanvasTexture(lienzo); tex.colorSpace = THREE.SRGBColorSpace;
    const texto = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.33), new THREE.MeshBasicMaterial({ map: tex }));
    texto.position.set(sx + dir.x * 0.035, 1.45, sz + dir.y * 0.035); texto.rotation.y = ry; grupo.add(texto);
    grupo.position.set(s.x, s.y, s.z);
    h.world.add(grupo);
    return { grupo, agua, ondas, turno: 0, s, pantalan, rumbo };
  }
  const quitarEstanque = (e: Estanque) => { h.world.remove(e.grupo); e.grupo.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mt = m.material as THREE.Material & { map?: THREE.Texture }; if (mt !== tierraMat && mt !== maderaMat) { mt.map?.dispose(); mt.dispose(); } } }); };
  /** A ripple on the pond nearest to (x, z): the float landing, the bite, the fish jumping. */
  function ondear(x: number, z: number, fuerza: number): void {
    let mejor: Estanque | null = null, md = Infinity;
    for (const e of estanques.values()) { const d = Math.hypot(e.s.x - x, e.s.z - z); if (d < md) { md = d; mejor = e; } }
    if (!mejor || md > mejor.s.radio * 2) return;
    mejor.ondas[mejor.turno++ % 2].value.set(x, z, tiempo.value, fuerza);
  }

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
    return { grupo, cana, sedal, flotador, destino: destino.clone(), quien, nacido: performance.now(), pos, cayo: false };
  };
  const quitar = (a: Angler) => { h.world.remove(a.grupo); a.sedal.geometry.dispose(); ultimoFlotador.set(a.quien, a.flotador.position.clone()); };
  const nuevoPez = (c: Captura3D, quien: Quien, origen: THREE.Vector3): Pez3D => {
    let g = pezGeos.get(c.pez); if (!g) { g = geometriaDePez(c.pez); pezGeos.set(c.pez, g); }
    const largo = Math.max(0.12, c.cm / 100);
    const malla = new THREE.Mesh(g, pezMat); malla.scale.setScalar(largo); malla.castShadow = true;
    const grupo = new THREE.Group(); grupo.add(malla); grupo.position.copy(origen); h.world.add(grupo);
    return { grupo, malla, quien, desde: performance.now(), origen: origen.clone(), donde: new THREE.Vector3(NaN, 0, 0), largo, guardado: false };
  };
  const quitarPez = (p: Pez3D) => { h.world.remove(p.grupo); };
  /** The right hand of an angler: the avatar's bone when it wears one, else beside the capsule, at hand height. */
  let manoReal = false; // whether my own hand was the avatar's bone in the last frame (for checks)
  function mano(quien: Quien, p: THREE.Vector3, haciaX: number, haciaZ: number, out: THREE.Vector3): THREE.Vector3 {
    const real = h.manoDe?.(quien, out);
    if (quien === "self") manoReal = !!real;
    if (real) return real;
    const d = Math.hypot(haciaX, haciaZ) || 1;
    return out.set(p.x + (-haciaZ / d) * LADO_MANO, p.y - 0.85 + ALTO_MANO, p.z + (haciaX / d) * LADO_MANO);
  }
  const mirar = (quien: Quien, x: number, z: number) => { const p = h.posicionDe(quien); if (!p) return; h.orientar?.(quien, Math.atan2(x - p.x, z - p.z)); caras.add(quien); };
  const dejarDeMirar = (quien: Quien) => { if (caras.delete(quien)) h.orientar?.(quien, undefined); };

  return {
    /** The fishing spots this page knows: a pond, its bank, boardwalk and sign at each. */
    sitios(lista: Sitio3D[]): void {
      const vivos = new Set(lista.map((s) => s.id));
      for (const [id, e] of estanques) if (!vivos.has(id)) { quitarEstanque(e); estanques.delete(id); }
      for (const s of lista) {
        let e = estanques.get(s.id);
        if (e && (e.s.x !== s.x || e.s.z !== s.z || e.s.radio !== s.radio)) { quitarEstanque(e); e = undefined; }
        if (!e) { e = nuevoEstanque(s); estanques.set(s.id, e); }
        e.grupo.position.set(s.x, s.y, s.z);
      }
    },
    /** Where to stand to fish at a spot (on the boardwalk) and which way the water is; null if the spot is unknown. */
    sitio(id: string): { x: number; z: number; radio: number; pantalan: { x: number; z: number }; rumbo: number } | null {
      const e = estanques.get(id); return e ? { x: e.s.x, z: e.s.z, radio: e.s.radio, pantalan: e.pantalan, rumbo: e.rumbo } : null;
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
        mirar(quien, f.x, f.z);
      }
      for (const [k, a] of anglers) if (!vivos.has(k)) { quitar(a); anglers.delete(k); if (!peces.has(k)) dejarDeMirar(k); }
    },
    /** v2: the fish just landed near you: each jumps out of its pond and goes to its angler's hand for a while. */
    capturas(lista: Captura3D[], yo: number): void {
      self = yo;
      const vivos = new Set<Quien>();
      for (const c of lista) {
        const quien: Quien = c.quien === yo ? "self" : c.quien;
        vivos.add(quien);
        if (peces.has(quien)) continue;
        const p = h.posicionDe(quien); if (!p) continue;
        const origen = ultimoFlotador.get(quien) ?? tmp.set(p.x, p.y - 0.85, p.z + 1);
        origen.y = Math.max(origen.y, p.y - 0.85) + 0.02;
        peces.set(quien, nuevoPez(c, quien, origen));
        ondear(origen.x, origen.z, 1.2);
      }
      for (const [k, p] of peces) if (!vivos.has(k)) { quitarPez(p); peces.delete(k); if (!anglers.has(k)) dejarDeMirar(k); }
    },
    /** My own phase (the server's): the float dips, sinks and comes in accordingly; others' floats just bob. */
    estado(e: Estado3D): void {
      const mio = anglers.get("self");
      if (e.fase === "mordisqueo" && estado.fase !== "mordisqueo") { mordisqueoEn = performance.now(); if (mio) ondear(mio.flotador.position.x, mio.flotador.position.z, 0.35); }
      if (mio && e.fase === "picada" && estado.fase !== "picada") ondear(mio.flotador.position.x, mio.flotador.position.z, 1);
      estado = { ...e };
    },
    actualizar(dt: number): void {
      const now = performance.now();
      tiempo.value += Math.min(0.1, dt);
      const det = JSON.stringify(detalle()); // the tier or the water choice changed (settings, entering VR): new water shader
      if (det !== detalleVisto) { detalleVisto = det; for (const e of estanques.values()) { const viejo = e.agua.material as THREE.Material; e.agua.material = materialDeAgua(trazaDeSitio(e.s).R, e.ondas); viejo.dispose(); } }
      for (const a of anglers.values()) {
        const p = h.posicionDe(a.quien);
        a.grupo.visible = !!p;
        if (!p) continue;
        const mio = a.quien === "self";
        const fase = mio ? estado.fase : "espera", tension = mio && fase === "pelea" ? estado.tension / 100 : 0.1, progreso = mio && fase === "pelea" ? estado.progreso / 100 : 0;
        // the rod: in the right hand (the avatar's, or beside the capsule), pointed at the float, lowered by tension
        const dX = a.destino.x - p.x, dZ = a.destino.z - p.z;
        const m = mano(a.quien, p, dX, dZ, tmp);
        a.cana.position.copy(m);
        const haciaX = a.destino.x - m.x, haciaZ = a.destino.z - m.z, hd = Math.hypot(haciaX, haciaZ) || 1;
        const pitch = THREE.MathUtils.lerp(0.95, 0.45, tension); // radians from vertical: 55° up at rest, 25° when the line is tight
        tip.set((haciaX / hd) * Math.sin(pitch), Math.cos(pitch), (haciaZ / hd) * Math.sin(pitch));
        a.cana.quaternion.copy(q.setFromUnitVectors(up, tip));
        tip.multiplyScalar(LARGO_CANA).add(m); // the tip, where the line starts
        // the float: a cast arc for the first second (a ripple when it lands), then bobbing; mine dips, sinks and comes in
        const t = (now - a.nacido) / LANZAMIENTO_MS;
        const f = a.flotador.position;
        if (t < 1) { f.lerpVectors(tip, a.destino, t); f.y += Math.sin(t * Math.PI) * 1.6; }
        else {
          if (!a.cayo) { a.cayo = true; ondear(a.destino.x, a.destino.z, 0.8); }
          const cerca = mio ? THREE.MathUtils.lerp(0, 0.75, progreso) : 0; // the fight brings it toward the angler
          f.set(THREE.MathUtils.lerp(a.destino.x, m.x, cerca), a.destino.y, THREE.MathUtils.lerp(a.destino.z, m.z, cerca));
          let y = Math.sin(now / 700 + a.nacido) * 0.025;
          if (fase === "mordisqueo") { const k = (now - mordisqueoEn) / 450; if (k < 1) y -= Math.sin(k * Math.PI) * 0.12; }
          else if (fase === "picada") y -= 0.35 + Math.sin(now / 60) * 0.05;
          else if (fase === "pelea") { y -= 0.25; if (estado.arrancada !== "no") { f.x += Math.sin(now / 45) * 0.08; f.z += Math.cos(now / 55) * 0.08; } }
          f.y += y;
          if (mio && fase === "pelea" && estado.arrancada === "si" && arrancadaVista !== "si") ondear(f.x, f.z, 0.6);
        }
        if (mio) arrancadaVista = estado.arrancada;
        // the line: 24 points from the tip to the float, sagging in the middle with the slack
        const s = sag(tip.distanceTo(f), tension), pos = a.pos;
        for (let i = 0; i < PUNTOS; i++) {
          const k = i / (PUNTOS - 1);
          pos[i * 3] = tip.x + (f.x - tip.x) * k; pos[i * 3 + 1] = tip.y + (f.y - tip.y) * k - Math.sin(k * Math.PI) * s; pos[i * 3 + 2] = tip.z + (f.z - tip.z) * k;
        }
        (a.sedal.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      }
      // the landed fish: a jump out of the water along an arc to the hand (SALTO_MS), then hanging from it, head up,
      // swaying; put away once the angler walks (PASO_SUELTA_M) or the page forgets it (capturas)
      for (const pz of peces.values()) {
        const p = h.posicionDe(pz.quien);
        pz.grupo.visible = !!p && !pz.guardado;
        if (!p || pz.guardado) continue;
        if (Number.isNaN(pz.donde.x)) pz.donde.copy(p);
        if (Math.hypot(p.x - pz.donde.x, p.z - pz.donde.z) > PASO_SUELTA_M) { pz.guardado = true; pz.grupo.visible = false; continue; }
        const m = mano(pz.quien, p, pz.origen.x - p.x, pz.origen.z - p.z, tmp);
        const k = Math.min(1, (now - pz.desde) / SALTO_MS);
        if (k < 1) {
          // a quadratic arc: water → apex above the middle → hand; the body points along the flight and wags
          const ap = tmp2.lerpVectors(pz.origen, m, 0.45); ap.y += 1.1 + pz.largo;
          const u = 1 - k;
          const x = u * u * pz.origen.x + 2 * u * k * ap.x + k * k * m.x, y = u * u * pz.origen.y + 2 * u * k * ap.y + k * k * m.y, z = u * u * pz.origen.z + 2 * u * k * ap.z + k * k * m.z;
          const vx = 2 * u * (ap.x - pz.origen.x) + 2 * k * (m.x - ap.x), vy = 2 * u * (ap.y - pz.origen.y) + 2 * k * (m.y - ap.y), vz = 2 * u * (ap.z - pz.origen.z) + 2 * k * (m.z - ap.z);
          pz.grupo.position.set(x, y, z);
          pz.grupo.quaternion.copy(q.setFromUnitVectors(tmp2.set(1, 0, 0), tip.set(vx, vy, vz).normalize()));
          pz.malla.rotation.y = Math.sin(now / 55) * 0.35; pz.malla.position.set(0, 0, 0);
        } else {
          pz.grupo.position.copy(m);
          pz.grupo.rotation.set(0, Math.atan2(pz.origen.x - p.x, pz.origen.z - p.z) + Math.PI / 2, Math.PI / 2 + Math.sin(now / 900) * 0.08); // head at the hand, tail down
          pz.malla.rotation.y = Math.sin(now / 160) * 0.08 * Math.exp(-(now - pz.desde - SALTO_MS) / 1500);
          pz.malla.position.set(-0.45, 0, 0).multiplyScalar(pz.largo);
        }
      }
    },
    /** True while someone fishes, a fish flies or hangs, or a ripple still spreads — keeps the frame loop awake. */
    ocupado: (): boolean => anglers.size > 0 || [...peces.values()].some((p) => !p.guardado) || [...estanques.values()].some((e) => e.ondas.some((o) => tiempo.value - o.value.z < 4)),
    contar: () => ({ pescadores: anglers.size, sitios: estanques.size, peces: [...peces.values()].filter((p) => p.grupo.visible).length, enMano: [...peces.values()].filter((p) => p.grupo.visible && performance.now() - p.desde >= SALTO_MS).map((p) => (p.quien === "self" ? self : p.quien)), manoReal, cargado: true }),
  };
}
