// E04 · cielo analítico (cielo-analitico.ts + the entorno.ts hook + naturaleza/atmosfera.ts): the hour drives twilight, stars and moon; the
// colours are house mixes that read as the spec asks (luminous day, dark warm night); with the analytic sky the dome is drawn live and LAST on
// every tier (no cube bake on B–D), still ONE sky mesh (no new draw call), and the undo gives the world's own sky back.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { crearEntorno } from "../packages/render/src/entorno.ts";
import { cicloCielo, direccionLuna, cieloAnalitico, CIELO_ANALITICO } from "../packages/render/src/cielo-analitico.ts";
import { atmosferaNaturaleza, CIELO_NATURALEZA } from "../packages/render/src/naturaleza/atmosfera.ts";
import { ATMOSFERA, CIELO_E04 } from "../packages/render/src/naturaleza/paleta.ts";
import { NIVEL_AGUA } from "../packages/render/src/naturaleza/terreno.ts";

const S = (g: number) => Math.sin(g * Math.PI / 180);
const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function banco() {
  const renderer = { shadowMap: { enabled: false }, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1, xr: { isPresenting: false } };
  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  const e = crearEntorno({ renderer: renderer as never, scene, world, camera: new THREE.PerspectiveCamera(), hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(),
    ground: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial()), grid: new THREE.Object3D(), hitos: [], aparato: { mobile: false }, fichero: (x) => x, foco: () => null });
  return { e, scene, world };
}
const MUNDO = { cielo: "atmosfera", tono: "agx", solAltura: 40, solRumbo: 30, nieblaLejos: 0, solHora: true };
const cielos = (w: THREE.Object3D) => w.children.filter((o) => (o as THREE.Mesh).isMesh && /cielo/.test(o.name)) as THREE.Mesh[];

test("E04 hour: twilight peaks at the horizon, stars are faint by day (spec: «apenas perceptibles») and full at night, the moon only at night", () => {
  const dia = cicloCielo(S(60)), ocaso = cicloCielo(S(1)), noche = cicloCielo(S(-40));
  assert.equal(dia.ocaso, 0); assert.ok(ocaso.ocaso > 0.6, `twilight at 1°: ${ocaso.ocaso}`); assert.equal(noche.ocaso, 0);
  assert.ok(Math.abs(dia.estrellas - CIELO_ANALITICO.estrellasDeDia) < 1e-9, "by day the stars keep a faint share");
  assert.ok(dia.estrellas > 0 && dia.estrellas < 0.1);
  assert.equal(noche.estrellas, 1); assert.equal(noche.luna, 1); assert.equal(dia.luna, 0);
  const l = direccionLuna(new THREE.Vector3(1, 0.2, 0).normalize());
  assert.ok(Math.abs(l.length() - 1) < 1e-9); assert.ok(Math.abs(l.y - S(40)) < 1e-9, "40° up (entorno.ts night light)"); assert.ok(l.x < 0 && Math.abs(l.z) < 1e-9, "opposite the sun's bearing");
});

test("E04 palette: luminous ivory day horizon, pale turquoise upper sky, a bluer zenith, a dark warm night; halo amber → verdemar → violet", () => {
  const [hr, hg, hb] = rgb(CIELO_E04.dia.horizonte), [ar, ag, ab] = rgb(CIELO_E04.dia.alto), [cr, , cb] = rgb(CIELO_E04.dia.cenit);
  assert.ok(Math.min(hr, hg, hb) > 205 && Math.max(hr, hg, hb) - Math.min(hr, hg, hb) < 30, `day horizon: light ivory/nacre (${CIELO_E04.dia.horizonte.toString(16)})`);
  assert.ok(ag > ar + 20 && ab > ar + 20, "upper sky: pale turquoise");
  assert.ok(cb > cr + 50, "zenith: blue");
  const luz = (h: number) => rgb(h).reduce((a, b) => a + b, 0);
  assert.ok(luz(CIELO_E04.dia.horizonte) >= luz(ATMOSFERA.dia.horizonte) && luz(CIELO_E04.dia.cenit) > luz(ATMOSFERA.dia.cenit), "brighter than R7.1 (spec: «claro y luminoso»)");
  for (const k of ["cenit", "alto", "horizonte", "suelo"] as const) assert.ok(Math.max(...rgb(CIELO_E04.noche[k])) < 70, `night ${k}: dark`);
  const [dr, , db] = rgb(CIELO_E04.haloDentro), [fr, , fb] = rgb(CIELO_E04.haloFuera);
  assert.ok(dr > db && fb > fr, "a real halo: warm inside, blue/violet outside");
});

test("E04 profile: R7.1 stays the default; «analitico» brings its stops and ONE sky function (entorno builds its materials once)", () => {
  assert.equal(CIELO_NATURALEZA, "r71");
  const r71 = atmosferaNaturaleza(NIVEL_AGUA);
  assert.equal(r71.cielo, undefined); assert.deepEqual(r71.dia, ATMOSFERA.dia);
  const a = atmosferaNaturaleza(NIVEL_AGUA, "analitico"), b = atmosferaNaturaleza(NIVEL_AGUA, "analitico");
  assert.ok(a.cielo); assert.equal(a.cielo, b.cielo, "the same function object every time");
  assert.deepEqual(a.dia, CIELO_E04.dia); assert.deepEqual(a.noche, CIELO_E04.noche);
  assert.equal(a.velo, ATMOSFERA.velo, "the fog's veil (Pablo likes the fog) is untouched"); assert.deepEqual(a.niebla, r71.niebla); assert.deepEqual(a.bruma, r71.bruma);
});

test("E04 nodes: the sky function builds in node (dome colour, fog far stop, far-plane vertex)", () => {
  const u = { cenit: new THREE.Color(), alto: new THREE.Color(), horizonte: new THREE.Color(), suelo: new THREE.Color(), sol: new THREE.Color() };
  const { uniform, vec3 } = THREE.TSL;
  const n = cieloAnalitico({ ...Object.fromEntries(Object.entries(u).map(([k, c]) => [k, uniform(c)])), dia: uniform(1), solDir: uniform(new THREE.Vector3(0, 1, 0)) } as never);
  assert.ok(n.domo(vec3(0, 1, 0)) && n.lejos(vec3(1, 0, 0)) && n.vertice);
});

test("E04 entorno: the analytic dome is live on EVERY tier, drawn last and depth-tested at the far plane, one sky mesh; the undo restores R7.1/world", () => {
  const { e, scene, world } = banco();
  e.aplicar(MUNDO);
  e.simularNivel("B");
  const quitar = e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA, "analitico"));
  for (const nv of ["A", "B", "C", "D"] as const) {
    e.simularNivel(nv);
    assert.equal(e.estado().modoCielo, "degradado", `tier ${nv}: live dome, no cube bake`);
    const [domo, ...otros] = cielos(world);
    assert.ok(domo && otros.length === 0, `tier ${nv}: exactly one sky mesh (no new draw call)`);
    assert.equal(domo.renderOrder, 1000, "drawn after the opaque scene");
    const m = domo.material as THREE.MeshBasicNodeMaterial;
    assert.ok(m.vertexNode, "far-plane vertex"); assert.equal(m.depthTest, true); assert.equal(m.depthWrite, false);
  }
  assert.equal(e.estado().atmosfera?.cielo, "analitico");
  assert.ok(scene.fogNode, "the fog stays (Pablo likes it)");
  assert.equal((scene.fog as THREE.Fog).far, 170);
  const matAnalitico = cielos(world)[0].material;
  quitar();
  e.simularNivel("A");
  const r71 = e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA));
  const domo = cielos(world)[0];
  assert.equal(domo.renderOrder, -10, "R7.1: first, as before"); assert.notEqual(domo.material, matAnalitico);
  assert.ok(!(domo.material as THREE.MeshBasicNodeMaterial).vertexNode);
  e.simularNivel("B"); assert.equal(e.estado().modoCielo, "horneado", "R7.1 on B still bakes the cube");
  r71();
  assert.equal(e.estado().atmosfera, null);
  // the same analytic material comes back on a second lay (built once)
  e.simularNivel("A");
  const otra = e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA, "analitico"));
  assert.equal(cielos(world)[0].material, matAnalitico); otra();
});
