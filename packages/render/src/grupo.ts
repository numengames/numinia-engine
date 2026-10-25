// grupo (lote4, t_9ba70b26): turn or scale a multi-selection as ONE unit. The gizmo drives the primary; this works out
// where every other thing of the group must go so the whole group moves as a rigid body (turn) or grows around its
// centre (scale). Pure maths on plain numbers (three's Quaternion/Euler only for the composition), so node --test checks it.
//   «mover»  — the rest follow the primary's translation;
//   «girar»  — the group turns by the primary's turn around the CENTRE of the group (the mean of the positions at the
//              start); every thing's position orbits that centre and its orientation composes the same turn;
//   «escalar»— positions spread from the centre by the primary's scale ratio per axis and every scale is multiplied by it.
// The primary itself is returned too: in «girar»/«escalar» it moves around the centre like the others.
// Scaling a rotated thing by an uneven ratio is approximate (offsets stretch along the WORLD axes, own scales along their
// own): exact for the common even ratio.
import * as THREE from "three/webgpu";
import type { Donde } from "./gizmo.ts";

type Modo = "mover" | "girar" | "escalar";
const RAD = Math.PI / 180;
const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;
const r = (v: number, paso: number, dec: number) => Number((Math.round(v / paso) * paso).toFixed(dec));
const aQuat = (d: Pick<Donde, "rx" | "ry" | "rz">) => new THREE.Quaternion().setFromEuler(new THREE.Euler(d.rx * RAD, d.ry * RAD, d.rz * RAD, "YXZ"));

/** The group's centre: the mean of the positions. */
export function centroGrupo(inicio: ReadonlyMap<string, Donde>): { x: number; y: number; z: number } {
  let x = 0, y = 0, z = 0;
  for (const d of inicio.values()) { x += d.x; y += d.y; z += d.z; }
  const n = Math.max(1, inicio.size);
  return { x: x / n, y: y / n, z: z / n };
}

/** Every thing of the group where it must be now that `primario` went from `inicio.get(primario)` to `ahora`.
 * Values are rounded to the wire's steps (0.01 m, 0.1°, 0.01). */
export function transformarGrupo(inicio: ReadonlyMap<string, Donde>, primario: string, ahora: Donde, modo: Modo): Map<string, Donde> {
  const out = new Map<string, Donde>();
  const d0 = inicio.get(primario);
  if (!d0) return out;
  if (modo === "mover") {
    const dx = ahora.x - d0.x, dy = ahora.y - d0.y, dz = ahora.z - d0.z;
    for (const [id, d] of inicio) out.set(id, id === primario ? ahora : { ...d, x: r(d.x + dx, 0.01, 2), y: r(d.y + dy, 0.01, 2), z: r(d.z + dz, 0.01, 2) });
    return out;
  }
  const c = centroGrupo(inicio);
  const dq = aQuat(ahora).multiply(aQuat(d0).invert());            // the primary's turn, in the world frame
  const ratio = (a: number, b: number) => (Math.abs(b) < 1e-6 ? 1 : a / b);
  const k = modo === "escalar" ? [ratio(ahora.sx, d0.sx), ratio(ahora.sy, d0.sy), ratio(ahora.sz, d0.sz)] : [1, 1, 1];
  const e = new THREE.Euler(), v = new THREE.Vector3();
  for (const [id, d] of inicio) {
    v.set((d.x - c.x) * k[0], (d.y - c.y) * k[1], (d.z - c.z) * k[2]);
    if (modo === "girar") v.applyQuaternion(dq);
    const q = modo === "girar" ? dq.clone().multiply(aQuat(d)) : aQuat(d);
    e.setFromQuaternion(q, "YXZ");
    out.set(id, {
      x: r(c.x + v.x, 0.01, 2), y: r(c.y + v.y, 0.01, 2), z: r(c.z + v.z, 0.01, 2),
      rx: r(envolver(e.x / RAD), 0.1, 1), ry: r(envolver(e.y / RAD), 0.1, 1), rz: r(envolver(e.z / RAD), 0.1, 1),
      sx: r(d.sx * k[0], 0.01, 2), sy: r(d.sy * k[1], 0.01, 2), sz: r(d.sz * k[2], 0.01, 2),
    });
  }
  return out;
}
