// hacer-graboso (MIS-247, t_af05726f): writes activos/graboso/graboso-cabeza.glb, the fine head of the Graboso (the relic that records,
// M18b): an electronic bear — round skull, two round ears with a dark inside, a muzzle with a nose and a small smile, two eyes with a
// glint, two cheek screws, an antenna with a lamp on top. Own work, CC0, no texture, ONE material in the file (the engine draws each node
// with its own look: `concha` the cloud shell, `rasgos` the dark parts, `piloto` the red lamp that beats while it records). The face looks
// toward -z (where the camera looks), 0.2 m of radius, origin at the centre of the skull, like the head it replaces (graboso.ts RADIO_M).
// Budget (set before modelling): < 2.000 triangles, 1 material, < 70 kB. Deterministic: same bytes every run (rounded floats, fixed order,
// no clock), so the sha256 written in packages/render/src/graboso.ts (MODELO_SHA) never moves unless this file changes.
// Run: node tools/hacer-graboso.mjs [--sin-escribir]     prints triangles, bytes and sha256
import { Document, NodeIO } from "@gltf-transform/core";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const R = 0.2;
const r5 = (v) => Math.round(v * 1e5) / 1e5; // the same floats on every machine
const partes = { concha: { pos: [], nor: [], uv: [], col: [], idx: [] }, rasgos: { pos: [], nor: [], uv: [], col: [], idx: [] }, piloto: { pos: [], nor: [], uv: [], col: [], idx: [] } };

/** An ellipsoid (UV sphere) with radii (rx, ry, rz) at (cx, cy, cz); `lon` meridians, `lat` rings; normals from the gradient. */
function elipsoide(nodo, [cx, cy, cz], [rx, ry, rz], lon, lat, color, opts = {}) {
  const p = partes[nodo], base = p.pos.length / 3, giro = opts.giroZ ?? 0, cg = Math.cos(giro), sg = Math.sin(giro);
  for (let j = 0; j <= lat; j++) {
    const th = (Math.PI * j) / lat, y = Math.cos(th), s = Math.sin(th);
    for (let i = 0; i <= lon; i++) {
      const ph = (2 * Math.PI * i) / lon, x = s * Math.cos(ph), z = s * Math.sin(ph);
      let px = rx * x, py = ry * y, pz = rz * z, nx = x / rx, ny = y / ry, nz = z / rz;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      if (giro) { [px, py] = [px * cg - py * sg, px * sg + py * cg]; [nx, ny] = [nx * cg - ny * sg, nx * sg + ny * cg]; }
      p.pos.push(r5(cx + px), r5(cy + py), r5(cz + pz)); p.nor.push(r5(nx), r5(ny), r5(nz));
      p.uv.push(r5(i / lon), r5(j / lat)); p.col.push(...color, 1);
    }
  }
  for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
    const a = base + j * (lon + 1) + i, b = a + lon + 1;
    if (j !== 0) p.idx.push(a, a + 1, b);        // counter-clockwise seen from outside; the pole rows keep one triangle only
    if (j !== lat - 1) p.idx.push(a + 1, b + 1, b);
  }
}
/** A closed cylinder along y from y0 to y1, radius r, `n` sides. */
function cilindro(nodo, cx, y0, y1, cz, r, n, color) {
  const p = partes[nodo];
  let base = p.pos.length / 3;
  for (let i = 0; i <= n; i++) { // the wall
    const a = (2 * Math.PI * i) / n, x = Math.cos(a), z = Math.sin(a);
    for (const y of [y0, y1]) { p.pos.push(r5(cx + r * x), r5(y), r5(cz + r * z)); p.nor.push(r5(x), 0, r5(z)); p.uv.push(r5(i / n), y === y0 ? 0 : 1); p.col.push(...color, 1); }
  }
  for (let i = 0; i < n; i++) { const a = base + i * 2; p.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  for (const [y, ny] of [[y0, -1], [y1, 1]]) { // the two lids
    base = p.pos.length / 3;
    p.pos.push(r5(cx), r5(y), r5(cz)); p.nor.push(0, ny, 0); p.uv.push(0.5, 0.5); p.col.push(...color, 1);
    for (let i = 0; i <= n; i++) { const a = (2 * Math.PI * i) / n; p.pos.push(r5(cx + r * Math.cos(a)), r5(y), r5(cz + r * Math.sin(a))); p.nor.push(0, ny, 0); p.uv.push(0.5, 0.5); p.col.push(...color, 1); }
    for (let i = 0; i < n; i++) ny > 0 ? p.idx.push(base, base + i + 2, base + i + 1) : p.idx.push(base, base + i + 1, base + i + 2);
  }
}

const CREMA = [0.92, 0.95, 1], OSCURO = [0.106, 0.141, 0.188], ROJO = [0.88, 0.19, 0.19], BRILLO = [1, 1, 1];
// the shell: skull (a little wider than tall), two round ears, the muzzle — one node, drawn as the cloud
elipsoide("concha", [0, 0, 0], [R * 1.04, R * 0.96, R], 20, 14, CREMA);
for (const l of [-1, 1]) elipsoide("concha", [l * R * 0.72, R * 0.8, R * 0.02], [R * 0.4, R * 0.4, R * 0.2], 10, 6, CREMA);
elipsoide("concha", [0, -R * 0.28, -R * 0.84], [R * 0.46, R * 0.36, R * 0.34], 12, 8, CREMA);
// the dark parts: ear insides, eyes, glints, nose, smile, cheek screws, antenna
for (const l of [-1, 1]) elipsoide("rasgos", [l * R * 0.72, R * 0.8, -R * 0.15], [R * 0.24, R * 0.24, R * 0.07], 8, 5, OSCURO);
for (const l of [-1, 1]) elipsoide("rasgos", [l * R * 0.4, R * 0.2, -R * 0.88], [R * 0.115, R * 0.14, R * 0.08], 8, 6, OSCURO);
for (const l of [-1, 1]) elipsoide("rasgos", [l * R * 0.37, R * 0.27, -R * 0.94], [R * 0.035, R * 0.035, R * 0.03], 6, 4, BRILLO);
elipsoide("rasgos", [0, -R * 0.16, -R * 1.17], [R * 0.15, R * 0.1, R * 0.09], 8, 6, OSCURO);
for (let i = -2; i <= 2; i++) { // the smile: five small beads on an arc under the nose
  const a = (i * 0.32), x = R * 0.2 * Math.sin(a), y = -R * 0.5 + R * 0.06 * (1 - Math.cos(a * 1.6)) * 3, z = -R * (1.05 - 0.04 * Math.abs(i));
  elipsoide("rasgos", [x, y, z], [R * 0.035, R * 0.03, R * 0.03], 6, 4, OSCURO);
}
for (const l of [-1, 1]) elipsoide("rasgos", [l * R * 0.84, -R * 0.1, -R * 0.5], [R * 0.06, R * 0.06, R * 0.04], 8, 4, OSCURO);
cilindro("rasgos", 0, R * 0.9, R * 1.55, 0, 0.008, 8, OSCURO);
elipsoide("rasgos", [0, R * 0.9, 0], [R * 0.09, R * 0.05, R * 0.09], 8, 4, OSCURO); // the antenna's foot
// the lamp
elipsoide("piloto", [0, R * 1.68, 0], [0.03, 0.03, 0.03], 10, 6, ROJO);

const doc = new Document();
doc.getRoot().getAsset().generator = "numinia-engine tools/hacer-graboso.mjs";
doc.getRoot().getAsset().copyright = "CC0 1.0 — own work of the Numinia engine";
const buf = doc.createBuffer();
const mat = doc.createMaterial("graboso").setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
const escena = doc.createScene("graboso"); const raiz = doc.createNode("graboso"); escena.addChild(raiz);
let triangulos = 0;
for (const [nombre, p] of Object.entries(partes)) {
  const acc = (tipo, arr, ctor) => doc.createAccessor().setType(tipo).setArray(new ctor(arr)).setBuffer(buf);
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute("POSITION", acc("VEC3", p.pos, Float32Array)).setAttribute("NORMAL", acc("VEC3", p.nor, Float32Array))
    .setAttribute("TEXCOORD_0", acc("VEC2", p.uv, Float32Array)).setAttribute("COLOR_0", acc("VEC4", p.col.map((v) => Math.round(v * 255)), Uint8Array).setNormalized(true))
    .setIndices(acc("SCALAR", p.idx, Uint16Array));
  triangulos += p.idx.length / 3;
  raiz.addChild(doc.createNode(nombre).setMesh(doc.createMesh(nombre).addPrimitive(prim)));
}
const bytes = Buffer.from(await new NodeIO().writeBinary(doc));
const sha = createHash("sha256").update(bytes).digest("hex");
console.log(JSON.stringify({ triangulos, bytes: bytes.length, materiales: 1, sha256: sha }));
if (!process.argv.includes("--sin-escribir")) {
  const dir = join(fileURLToPath(import.meta.url), "../../activos/graboso");
  mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "graboso-cabeza.glb"), bytes);
}
if (triangulos >= 2000) { console.error("over the 2.000-triangle budget"); process.exit(1); }
