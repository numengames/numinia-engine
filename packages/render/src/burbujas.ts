// burbujas (ia-llamar S9): the action bubble of every AI drawn in the world, in its four shapes (sphere, dome, cylinder, box), exactly
// where the server's `dentro` (features/burbuja/feature.ts) says people count as inside. Same trick as aros.ts / pompas.ts, kept cheap:
// ONE unit geometry per shape (a fill and an edge, made the first time that shape is drawn), scaled per bubble; flat unlit translucent
// materials SHARED by level of visibility (a few in all: opacity is quantised, see burbujas-politica.ts), no shader of our own, no
// second pass. At most `max()` bubbles are drawn at once (the nearest to the player), pooled by shape; a bubble that leaves or is
// `nunca` goes back to the pool; a world without AIs makes nothing at all (no geometry, no material, no mesh, nothing to update).
// What is drawn is decided in burbujas-politica.ts (pure, tested alone); this file only owns the three.js objects.
import * as THREE from "three/webgpu";
import { BURBUJA_COLOR, BURBUJA_COLOR_DORMIDA, DESTELLO_MS, colocacion, destello, distanciaAlBorde, elegir, intensidad, nivelDe, opacidadBorde, opacidadRelleno } from "./burbujas-politica.ts";
import type { Config, Forma } from "./burbujas-politica.ts";

export type Target = number | "self";
const PIES_M = 0.85;   // an avatar's centre is this high over its feet (nombres.ts `top`, aros.ts)
const SEG = 40;        // segments of a drawn circle

type Unidad = { relleno: THREE.BufferGeometry; borde: THREE.BufferGeometry };
type Pieza = { forma: Forma; grupo: THREE.Group; relleno: THREE.Mesh; borde: THREE.LineSegments; nivel: number; dormida: boolean };

/** A circle of radius 1 (or an arc of it) as a polyline, in the plane picked by `eje` (the axis it turns around), from angle `a0` to `a1`; `y` = its offset along that axis. */
function arco(eje: "x" | "y" | "z", a0: number, a1: number, y = 0): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(2, Math.round(SEG * (a1 - a0) / (2 * Math.PI)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n), c = Math.cos(a), s = Math.sin(a);
    pts.push(eje === "y" ? new THREE.Vector3(c, y, s) : eje === "x" ? new THREE.Vector3(y, c, s) : new THREE.Vector3(c, s, y));
  }
  return pts;
}
/**
 * Line segments from polylines. Each segment also carries `lineDistance` = how far along its polyline it starts/ends, so the sleeping
 * bubble's dashes (LineDashedMaterial) run on unbroken along a ring instead of restarting at every segment; a plain line material ignores it.
 */
function lineas(polis: THREE.Vector3[][]): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [], dist: number[] = [];
  for (const poli of polis) {
    let acc = 0;
    for (let i = 0; i + 1 < poli.length; i++) { const l = poli[i].distanceTo(poli[i + 1]); pts.push(poli[i], poli[i + 1]); dist.push(acc, acc + l); acc += l; }
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  g.setAttribute("lineDistance", new THREE.BufferAttribute(new Float32Array(dist), 1));
  return g;
}
const TAU = 2 * Math.PI;

/** The unit shape of each form: a fill and an edge, radius 1 (the cylinder and the box: height 1; the box: side 2). */
function crearUnidad(forma: Forma): Unidad {
  switch (forma) {
    case "esfera": return {
      relleno: new THREE.SphereGeometry(1, 32, 20),
      borde: lineas([arco("y", 0, TAU), arco("x", 0, TAU), arco("z", 0, TAU)]),   // three great circles
    };
    case "cupula": return {
      relleno: new THREE.SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2),
      borde: lineas([arco("y", 0, TAU), arco("x", 0, Math.PI), arco("z", 0, Math.PI)]),   // the circle on the floor and two arcs over the top
    };
    case "cilindro": {
      const verticales = [0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2; return [new THREE.Vector3(Math.cos(a), -0.5, Math.sin(a)), new THREE.Vector3(Math.cos(a), 0.5, Math.sin(a))]; });
      return { relleno: new THREE.CylinderGeometry(1, 1, 1, SEG, 1, false), borde: lineas([arco("y", 0, TAU, 0.5), arco("y", 0, TAU, -0.5), ...verticales]) };
    }
    default: {
      const g = new THREE.BoxGeometry(2, 1, 2), e = new THREE.EdgesGeometry(g), p = e.getAttribute("position");
      const polis: THREE.Vector3[][] = [];
      for (let i = 0; i + 1 < p.count; i += 2) polis.push([new THREE.Vector3().fromBufferAttribute(p, i), new THREE.Vector3().fromBufferAttribute(p, i + 1)]);
      e.dispose();
      return { relleno: g, borde: lineas(polis) };
    }
  }
}

export function createBurbujas(o: {
  world: THREE.Object3D;
  avatarOf: (t: Target) => THREE.Object3D | undefined;
  /** The local player's feet, or null (before the first position). */
  yo: () => { x: number; y: number; z: number } | null;
  max: () => number;
}) {
  const unidades = new Map<Forma, Unidad>();                                // shared geometries, made when a shape is first drawn
  const rellenos = new Map<string, THREE.MeshBasicMaterial>();             // shared, by (asleep, level)
  const bordes = new Map<string, THREE.LineBasicMaterial>();
  const vivas = new Map<Target, { cfg: Config; dormida: boolean }>();       // AIs with a bubble now
  const entradas = new Map<Target, number>();                               // when the local player last entered this AI's bubble (the flash)
  const mallas = new Map<Target, Pieza>();                                  // bubbles on screen now (a subset of vivas, at most max())
  const libres = new Map<Forma, Pieza[]>();                                 // the pool, by shape
  let pendiente = false;                                                    // something changed and has not been placed yet (the power policy must draw one more frame)

  const unidad = (f: Forma): Unidad => { let u = unidades.get(f); if (!u) { u = crearUnidad(f); unidades.set(f, u); } return u; };
  const matRelleno = (dormida: boolean, nivel: number): THREE.MeshBasicMaterial => {
    const k = `${dormida ? 1 : 0}:${nivel}`; let m = rellenos.get(k);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: dormida ? BURBUJA_COLOR_DORMIDA : BURBUJA_COLOR, transparent: true, opacity: opacidadRelleno(nivel), depthWrite: false, side: THREE.DoubleSide }); rellenos.set(k, m); }
    return m;
  };
  const matBorde = (dormida: boolean, nivel: number): THREE.LineBasicMaterial => {
    const k = `${dormida ? 1 : 0}:${nivel}`; let m = bordes.get(k);
    if (!m) {
      const op = opacidadBorde(nivel);
      m = dormida
        ? new THREE.LineDashedMaterial({ color: BURBUJA_COLOR_DORMIDA, transparent: true, opacity: op, depthWrite: false, dashSize: 0.05, gapSize: 0.05 })   // «apagada (línea discontinua)»
        : new THREE.LineBasicMaterial({ color: BURBUJA_COLOR, transparent: true, opacity: op, depthWrite: false });
      bordes.set(k, m);
    }
    return m;
  };
  const tomar = (f: Forma, nivel: number, dormida: boolean): Pieza => {
    const p = libres.get(f)?.pop() ?? (() => {
      const u = unidad(f);
      const relleno = new THREE.Mesh(u.relleno, matRelleno(dormida, nivel)), borde = new THREE.LineSegments(u.borde, matBorde(dormida, nivel));
      relleno.renderOrder = 8; borde.renderOrder = 8;
      relleno.userData.sinSombra = true;   // entorno.ts marks every world mesh as shadow caster/receiver: a bubble's shadow would black out the AI inside it and the floor under it
      const grupo = new THREE.Group(); grupo.add(relleno, borde);
      return { forma: f, grupo, relleno, borde, nivel: -1, dormida: false } as Pieza;
    })();
    p.nivel = -1;   // the next placement sets the materials (a pooled piece may carry another level)
    o.world.add(p.grupo);
    return p;
  };
  const soltar = (t: Target): void => {
    const p = mallas.get(t); if (!p) return;
    o.world.remove(p.grupo); mallas.delete(t);
    let l = libres.get(p.forma); if (!l) { l = []; libres.set(p.forma, l); }
    l.push(p);
  };
  const flashDe = (t: Target, now: number): number => { const e = entradas.get(t); return destello(e === undefined ? null : now - e); };

  return {
    /** This AI has a bubble (`cfg`; `dormida` = asleep: dim and dashed) or no longer (`null`: it goes back to the pool). */
    poner(t: Target, cfg: Config | null, dormida = false): void {
      pendiente = true;
      if (cfg === null) { vivas.delete(t); entradas.delete(t); soltar(t); return; }
      const antes = vivas.get(t);
      vivas.set(t, { cfg, dormida });
      if (antes && antes.cfg.forma !== cfg.forma) soltar(t);   // another shape needs another mesh
    },
    /** This AI falls asleep (`true`) or wakes (`false`); nothing if it has no bubble. */
    dormida(t: Target, si: boolean): void { const v = vivas.get(t); if (v && v.dormida !== si) { v.dormida = si; pendiente = true; } },
    /** The local player has just entered this AI's bubble (`entras`): a short flash, unless the keeper chose never to show it. */
    destellar(t: Target, now: number): void { const v = vivas.get(t); if (!v || v.cfg.visible === "nunca") return; entradas.set(t, now); pendiente = true; },
    /** Follow the avatars and the player: the nearest `max()` bubbles that have something to show are drawn. Called once per frame; nothing to do without AIs. */
    update(now: number): void {
      pendiente = false;
      if (vivas.size === 0) return;
      const yo = o.yo();
      const cand: { id: number; dist: number }[] = [];
      const datos = new Map<number, { t: Target; fx: number; fy: number; fz: number; i: number }>();
      let n = 0;
      for (const [t, v] of vivas) {
        const a = o.avatarOf(t);
        if (!a || v.cfg.visible === "nunca") { soltar(t); continue; }
        const fx = a.position.x, fy = a.position.y - PIES_M, fz = a.position.z;
        // before the first position of the player there is nothing to measure: «siempre» shows, «al-acercarte» waits
        const d = yo ? distanciaAlBorde(v.cfg.forma, v.cfg.radio, { x: fx, y: fy, z: fz }, yo) : v.cfg.visible === "siempre" ? 0 : Infinity;
        const i = intensidad(v.cfg.visible, d, v.dormida, flashDe(t, now));
        if (nivelDe(i) === 0) { soltar(t); continue; }
        const id = n++;
        cand.push({ id, dist: d + (yo ? Math.hypot(fx - yo.x, fz - yo.z) * 1e-3 : 0) });
        datos.set(id, { t, fx, fy, fz, i });
      }
      const elegidas = new Set(elegir(cand, o.max()));
      for (const [id, d] of datos) {
        if (!elegidas.has(id)) { soltar(d.t); continue; }
        const v = vivas.get(d.t)!;
        let p = mallas.get(d.t);
        if (!p) { p = tomar(v.cfg.forma, nivelDe(d.i), v.dormida); mallas.set(d.t, p); }
        const c = colocacion(v.cfg.forma, v.cfg.radio);
        p.grupo.position.set(d.fx, d.fy + c.dy, d.fz);
        p.grupo.scale.set(c.sx, c.sy, c.sz);
        const nivel = nivelDe(d.i);
        if (nivel !== p.nivel || v.dormida !== p.dormida) {
          p.relleno.material = matRelleno(v.dormida, nivel); p.borde.material = matBorde(v.dormida, nivel);
          p.nivel = nivel; p.dormida = v.dormida;
        }
      }
    },
    /** A change is waiting to be drawn, or a flash is playing: the power policy must draw one more frame. A bubble that stands still asks for nothing. */
    busy(now = performance.now()): boolean {
      if (pendiente) return true;
      for (const e of entradas.values()) if (now - e < DESTELLO_MS) return true;
      return false;
    },
    /** For checks: who has a bubble, what shape, whether it is drawn now and at which level. */
    lista(): { target: Target; forma: Forma; radio: number; visible: string; dormida: boolean; drawn: boolean; nivel: number }[] {
      return [...vivas].map(([target, v]) => ({ target, forma: v.cfg.forma, radio: v.cfg.radio, visible: v.cfg.visible, dormida: v.dormida, drawn: mallas.has(target), nivel: mallas.get(target)?.nivel ?? 0 }));
    },
    compartidos(): { geometrias: number; materiales: number; mallas: number; libres: number } {
      let l = 0; for (const a of libres.values()) l += a.length;
      return { geometrias: unidades.size * 2, materiales: rellenos.size + bordes.size, mallas: mallas.size, libres: l };
    },
  };
}
