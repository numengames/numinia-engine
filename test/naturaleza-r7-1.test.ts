// R7.1: the nature's atmosphere (entorno.ts `atmosfera`: a 4-stop sky dome shared with a gradient + height fog node, Khronos Neutral tone) is on
// only while the nature piece is on and the world's own sky, fog and tone come back exactly on teardown; its colours come from paleta.ts; the
// D-057 triangle budget (draw calls unchanged).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { crearEntorno } from "../packages/render/src/entorno.ts";
import type { Atmosfera } from "../packages/render/src/entorno.ts";
import { crearNaturaleza } from "../packages/render/src/naturaleza/naturaleza.ts";
import { atmosferaNaturaleza, BRUMA } from "../packages/render/src/naturaleza/atmosfera.ts";
import { ATMOSFERA, NOCHE } from "../packages/render/src/naturaleza/paleta.ts";
import { PRESUPUESTO_NATURALEZA } from "../packages/render/src/naturaleza/niveles.ts";
import { NIVEL_AGUA } from "../packages/render/src/naturaleza/terreno.ts";

/** The environment with a stand-in renderer (no GPU in node): what aplicar() writes is all we read. */
function banco(nivelMovil = false) {
  const renderer = { shadowMap: { enabled: false }, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1, xr: { isPresenting: false } };
  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  const hemi = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
  const e = crearEntorno({ renderer: renderer as never, scene, world, camera: new THREE.PerspectiveCamera(), hemi, sun, ground, grid: new THREE.Object3D(), hitos: [], aparato: { mobile: nivelMovil }, fichero: (x) => x, foco: () => null });
  return { e, renderer, scene, world };
}
const MUNDO = { cielo: "atmosfera", tono: "agx", solAltura: 40, solRumbo: 30, nieblaLejos: 0 };
const domoDe = (w: THREE.Object3D) => w.children.find((o) => o.name === "cielo-degradado") as THREE.Mesh | undefined;

test("R7.1 budget (D-057): triangles A 100 k · B 60 k · C 35 k · D 12 k, draw calls unchanged, every share fits its total", () => {
  assert.deepEqual((["A", "B", "C", "D"] as const).map((n) => PRESUPUESTO_NATURALEZA[n].triangulos), [100000, 60000, 35000, 12000]);
  assert.deepEqual((["A", "B", "C", "D"] as const).map((n) => PRESUPUESTO_NATURALEZA[n].llamadas), [8, 7, 6, 5]);
});

test("R7.1 palette: the sky/fog colours live in paleta.ts ATMOSFERA (mezclas of house tokens) and read as the zone moods; the profile hands them over untouched", () => {
  const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const [hr, hg, hb] = rgb(ATMOSFERA.dia.horizonte), [cr, , cb] = rgb(ATMOSFERA.dia.cenit);
  assert.ok(Math.min(hr, hg, hb) > 185 && Math.max(hr, hg, hb) - Math.min(hr, hg, hb) < 30, "day horizon = light parchment, not saturated");
  assert.ok(cb > cr + 40 && cb < 200, "zenith: a muted blue-green, not a saturated physical blue");
  for (const k of ["cenit", "alto", "horizonte", "suelo"] as const) assert.ok(Math.max(...rgb(ATMOSFERA.noche[k])) < 70, `night ${k}: a dark warm garden night`);
  const [br, bg] = rgb(ATMOSFERA.bruma); assert.ok(bg > br + 30, "the hollows' haze by the water is verdigris/moss");
  assert.equal(ATMOSFERA.noche.suelo, NOCHE.sombra);
  const a = atmosferaNaturaleza(NIVEL_AGUA);
  assert.deepEqual(a.dia, ATMOSFERA.dia); assert.deepEqual(a.noche, ATMOSFERA.noche);
  assert.equal(a.bruma.color, ATMOSFERA.bruma); assert.equal(a.bruma.altura, NIVEL_AGUA + BRUMA.sobreAgua);
  assert.equal(a.tono, "neutro");
});

test("R7.1 entorno: the atmosphere swaps tone (Neutral), fog (node, sky-coloured horizon) and sky (4-stop dome, live on A), and the undo restores the world's own", () => {
  const { e, renderer, scene, world } = banco();
  e.aplicar(MUNDO);
  assert.equal(e.nivel, "A");
  assert.equal(renderer.toneMapping, THREE.AgXToneMapping);
  assert.equal(scene.fog, null, "the world brings no fog");
  assert.ok(!scene.fogNode);
  const domo = domoDe(world) ?? null, matMundo = (domo ?? { material: null }).material; // the SkyMesh is still loading: the plain dome stands in
  const quitar = e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA));
  assert.equal(renderer.toneMapping, THREE.NeutralToneMapping, "Khronos PBR Neutral while the nature is on");
  assert.ok(scene.fogNode, "the drawn fog is the gradient + height node");
  assert.ok(scene.fog instanceof THREE.Fog, "scene.fog still carries distances and the horizon colour for the water, the terrain border and the far-cull");
  assert.equal((scene.fog as THREE.Fog).near, 20); assert.equal((scene.fog as THREE.Fog).far, 170);
  const est = e.estado();
  assert.equal(est.modoCielo, "degradado", "tier A: the dome is drawn live (in place of the live SkyMesh: same one draw)");
  assert.equal(est.atmosfera?.tono, "neutro");
  assert.equal(est.niebla?.color, est.atmosfera?.horizonte, "fog and sky share the horizon colour");
  const domoAtm = domoDe(world);
  assert.ok(domoAtm && domoAtm.material !== matMundo, "the dome wears the 4-stop material");
  assert.equal(world.children.filter((o) => (o as THREE.Mesh).isMesh && /cielo/.test(o.name)).length, 1, "exactly one sky mesh: no new draw call");
  quitar();
  assert.equal(renderer.toneMapping, THREE.AgXToneMapping, "the world's tone is back");
  assert.ok(!scene.fogNode); assert.equal(scene.fog, null, "the world's (absent) fog is back");
  assert.equal(e.estado().atmosfera, null);
  if (domoAtm && matMundo) assert.equal(domoAtm.material, matMundo, "the dome's own 2-stop material is back");
  quitar(); // a second undo is harmless
  assert.equal(renderer.toneMapping, THREE.AgXToneMapping);
});

test("R7.1 entorno: a nearer world fog wins, a farther one is brought in; tiers B–D bake the dome into the cube (no live dome); the hour darkens the stops", () => {
  const { e, scene, world } = banco();
  e.aplicar({ ...MUNDO, nieblaCerca: 10, nieblaLejos: 120 });
  e.atmosfera(atmosferaNaturaleza(NIVEL_AGUA));
  assert.equal((scene.fog as THREE.Fog).near, 10); assert.equal((scene.fog as THREE.Fog).far, 120);
  e.aplicar({ ...MUNDO, nieblaCerca: 90, nieblaLejos: 390 }); // the house default: brought in to the terrain
  assert.equal((scene.fog as THREE.Fog).near, 20); assert.equal((scene.fog as THREE.Fog).far, 170);
  e.simularNivel("B");
  assert.equal(e.estado().modoCielo, "horneado", "Quest/phones: the cheap baked path, as today");
  assert.equal(domoDe(world), undefined, "no live dome on B");
  const dia = e.estado().niebla!.color;
  e.aplicar({ ...MUNDO, nieblaLejos: 120, solHora: true, solAltura: -20 });
  const noche = e.estado().niebla!.color;
  const luz = (h: string) => { const c = new THREE.Color(h); return c.r + c.g + c.b; };
  assert.ok(luz(noche) < luz(dia) * 0.4, `night horizon ${noche} must be far darker than day ${dia}`);
});

test("R7.1 piece: the nature asks for the atmosphere once when it builds and gives it back when it goes off; without the hook nothing changes", async () => {
  const padre = new THREE.Group(), ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial());
  padre.add(ground);
  const camara = new THREE.PerspectiveCamera(); camara.position.set(0, 1.7, 0);
  const pedidas: Atmosfera[] = []; let devueltas = 0;
  const n = crearNaturaleza({ padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => "D", camara, yo: () => null, niebla: () => 0xc9d8e4,
    atmosfera: (a) => { pedidas.push(a); return () => { devueltas++; }; } });
  await n.aplicar({ semilla: 5, fauna: false });
  assert.equal(pedidas.length, 1); assert.equal(devueltas, 0);
  assert.equal(pedidas[0].tono, "neutro");
  await n.aplicar({ activa: false });
  assert.equal(devueltas, 1, "teardown restores the world's sky, fog and tone");
  n.dispose();
  assert.equal(devueltas, 1);
});
