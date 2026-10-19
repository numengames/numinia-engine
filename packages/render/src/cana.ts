// pesca — the rod's shape and the grab radii (pure geometry: three only). One merged mesh with vertex colours = ONE draw
// call per rod (holder and hand copy it). Base at the origin, tip up +y; the hand grips at MANGO_M along it.
import * as THREE from "three/webgpu";

/** The rod is 2 m long; the handle sticks out behind the hand MANGO_M (m) and is GRIP_M long, so the palm sits in it. */
export const LARGO_CANA = 2.0, MANGO_M = 0.28, GRIP_M = 0.4;
/** Grab radius (m) from the handle: a hand closer than ENTRA takes it (and it glows); once it glows, it stays taken-able
 * until SALE (hysteresis, as the guide's hover 0.20/0.15 but wider: Pablo lost the rod with the old 0.30 flat). */
export const AGARRE_ENTRA_M = 0.32, AGARRE_SALE_M = 0.42;
export const radioAgarre = (yaCerca: boolean): number => (yaCerca ? AGARRE_SALE_M : AGARRE_ENTRA_M);

/** Paint a geometry one colour and place it. */
export function pintar(g: THREE.BufferGeometry, color: number, m?: THREE.Matrix4): THREE.BufferGeometry {
  const c = new THREE.Color(color), n = g.getAttribute("position").count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (m) g.applyMatrix4(m);
  return g;
}
/** Merge geometries carrying position, normal and colour into one non-indexed geometry. */
export function juntar(partes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const g of partes) {
    const n = g.index ? g.toNonIndexed() : g;
    for (const [dest, nombre] of [[pos, "position"], [nor, "normal"], [col, "color"]] as const) { const a = n.getAttribute(nombre).array as Float32Array; for (let i = 0; i < a.length; i++) dest.push(a[i]); }
    if (n !== g) n.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const en = (y: number) => new THREE.Matrix4().makeTranslation(0, y, 0);
const tramo = (r0: number, r1: number, y0: number, y1: number, color: number, lados = 8) => pintar(new THREE.CylinderGeometry(r1, r0, y1 - y0, lados), color, en((y0 + y1) / 2));

/** How far (m) the tip bends toward local -z (down, when the rod points forward-up in a hand). */
export const CURVA_M = 0.18;
const SEGMENTOS = 10;
/** Height of the blank's centre line at distance u (0..1) along it, and its offset toward -z. */
const desvio = (u: number) => -CURVA_M * u * u;
const MAT_ZM = (o: THREE.Vector3, q: THREE.Quaternion, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(o, q, new THREE.Vector3(sx, sy, sz));
const ROT_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
/** A ring around the blank at height y (axis along the blank's tangent there). */
function anillo(y: number, z: number, r: number, grosor: number, color: number, q: THREE.Quaternion): THREE.BufferGeometry {
  return pintar(new THREE.TorusGeometry(r, grosor, 5, 10), color, MAT_ZM(new THREE.Vector3(0, y, z), q.clone().multiply(ROT_X)));
}

/** The rod, steampunk + solarpunk: a honey-wood handle with brass bands and a mossy-green pommel, a brass reel with a
 * little solar cell and a crank, and a slightly curved blank in ten tapered segments with brass guides and a green bead
 * at the tip. One merged mesh, vertex colours: ONE draw call. Handle stays the brightest, fattest part (easy to see and grab). */
export function geometriaCana(): THREE.BufferGeometry {
  const MADERA = 0xd9a455, LATON = 0xc08a2e, LATON_CLARO = 0xe6b84f, VERDE = 0x4f9a52, COBRE = 0xa8622e, OSCURO = 0x3a2a1a, SOLAR = 0x2f5fa8;
  const partes: THREE.BufferGeometry[] = [
    // handle: pommel cap, honey-wood grip, three brass bands, guard collar
    pintar(new THREE.SphereGeometry(0.052, 8, 6), VERDE, en(0.0)),
    tramo(0.036, 0.04, 0.02, GRIP_M, MADERA, 10),
    tramo(0.043, 0.043, 0.07, 0.095, LATON_CLARO, 10), tramo(0.043, 0.043, 0.2, 0.225, LATON_CLARO, 10), tramo(0.043, 0.043, 0.33, 0.355, LATON_CLARO, 10),
    tramo(0.056, 0.05, GRIP_M - 0.03, GRIP_M + 0.025, LATON, 10),
  ];
  // reel: a brass drum on the side (+x) of the blank just above the handle, a solar cell on its face, a crank with a green knob
  const y0 = GRIP_M + 0.1, qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  partes.push(
    pintar(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12), LATON, MAT_ZM(new THREE.Vector3(0.08, y0, 0), qx)),
    pintar(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12), SOLAR, MAT_ZM(new THREE.Vector3(0.115, y0, 0), qx)),
    pintar(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 6), COBRE, MAT_ZM(new THREE.Vector3(0.04, y0, 0), qx)),
    pintar(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 4), OSCURO, MAT_ZM(new THREE.Vector3(0.14, y0 + 0.045, 0), new THREE.Quaternion())),
    pintar(new THREE.SphereGeometry(0.016, 5, 4), VERDE, en(0)).applyMatrix4(new THREE.Matrix4().makeTranslation(0.14, y0 + 0.095, 0)),
  );
  // the blank: tapered segments following the curve; brass guides at some joints
  const L = LARGO_CANA - GRIP_M, junta = (k: number) => GRIP_M + (L * k) / SEGMENTOS;
  for (let k = 0; k < SEGMENTOS; k++) {
    const ua = k / SEGMENTOS, ub = (k + 1) / SEGMENTOS, ya = junta(k), yb = junta(k + 1), za = desvio(ua), zb = desvio(ub);
    const ra = 0.017 - 0.012 * ua, rb = 0.017 - 0.012 * ub;
    const t = new THREE.Vector3(0, yb - ya, zb - za), largo = t.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().normalize());
    partes.push(pintar(new THREE.CylinderGeometry(rb, ra, largo, 6), k % 2 ? 0x8a5a2c : 0x6e4522, MAT_ZM(new THREE.Vector3(0, (ya + yb) / 2, (za + zb) / 2), q)));
    if (k % 3 === 1) partes.push(anillo(ya, za, ra + 0.012, 0.004, LATON_CLARO, q));
    if (k === 0) partes.push(tramo(0.025, 0.02, GRIP_M, GRIP_M + 0.06, COBRE, 8)); // copper ferrule where the blank leaves the handle
  }
  partes.push(pintar(new THREE.SphereGeometry(0.014, 6, 5), VERDE, new THREE.Matrix4().makeTranslation(0, LARGO_CANA, desvio(1)))); // the tip's bead
  return juntar(partes);
}
