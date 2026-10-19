// R5.1: the nature's shade fill (packages/render/src/naturaleza/relleno.ts). The fill gives back the ambient that three's Lambert
// materials miss (they ignore scene.environment): it must be palette-only, follow the hour (dim at night, zero without ambient) and be
// wired on the terrain (+ baked Residuos) and both tree materials, without adding lights, meshes or triangles.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { RELLENO, CASA, VERDES, mezcla } from "../packages/render/src/naturaleza/paleta.ts";
import { fuerzaRelleno, actualizarRelleno, GANANCIA_RELLENO } from "../packages/render/src/naturaleza/relleno.ts";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearArboles } from "../packages/render/src/naturaleza/arboles.ts";
import { esparcirArboles } from "../packages/render/src/naturaleza/esparcir.ts";

test("R5.1 fill colours are mixes of house tokens (cool sea-green below, warm sand above)", () => {
  assert.equal(RELLENO.abajo, mezcla(CASA.verdemar, VERDES.verdin, 0.3));
  assert.equal(RELLENO.arriba, mezcla(CASA.arena, CASA.arenaVelada, 0.35));
  const c = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const [r, g, b] = c(RELLENO.abajo);
  assert.ok(g > r && b > r, "the shade below is cool (green/blue over red)");
  const [r2, , b2] = c(RELLENO.arriba);
  assert.ok(r2 > b2, "the fill above is warm");
});

test("R5.1 fill strength follows the engine's ambient: zero without it, dim at night, full by day", () => {
  const dia = new THREE.Color(0xbcd6ee), noche = new THREE.Color(0x33456e); // entorno.ts day sky-ambient and night tint
  assert.equal(fuerzaRelleno(0, true, dia), 0);
  const kDia = fuerzaRelleno(0.4, true, dia), kNoche = fuerzaRelleno(0.4 * 0.28, true, noche);
  assert.ok(Math.abs(kDia - 0.4 * GANANCIA_RELLENO.conEntorno) < 1e-6, `day fill ${kDia}`);
  assert.ok(kNoche < kDia * 0.05, `night fill ${kNoche} must be a small fraction of the day's ${kDia}`);
  assert.ok(fuerzaRelleno(0.4, false, dia) < kDia, "without the HDR environment the hemisphere is stronger: a smaller lift");
  assert.ok(fuerzaRelleno(0.4, true, new THREE.Color(10, 10, 10)) <= kDia + 1e-9, "a very bright sky never pushes the fill above the day's");
});

test("R5.1 terrain and both tree materials carry the fill; no new light, mesh or triangle", () => {
  const escena = new THREE.Scene(), grupo = new THREE.Group(); escena.add(grupo);
  const t = crearTerreno({ semilla: 1234, nivel: "A", escena: grupo });
  const mt = t.malla.material as THREE.MeshLambertNodeMaterial;
  assert.ok(mt.isMeshLambertNodeMaterial && mt.emissiveNode, "terrain: Lambert node material with the fill as emissive");
  assert.equal(mt.flatShading, true); assert.equal(mt.vertexColors, true);
  const puntos = esparcirArboles(t, { semilla: 1234, tamano: 200, plaza: 12, densidad: 1, nivel: "A", paleta: "verano", estanque: t.estanque });
  const a = crearArboles({ vientoU: uniform(new THREE.Vector3()) as never, nivel: "A", camara: new THREE.Object3D() }, puntos);
  grupo.add(a.grupo);
  let mallas = 0;
  a.grupo.traverse((o) => { if ((o as THREE.Mesh).isMesh) { mallas++; assert.ok(((o as THREE.Mesh).material as THREE.MeshLambertNodeMaterial).emissiveNode, `${o.name} carries the fill`); } });
  assert.ok(mallas > 0);
  let luces = 0; escena.traverse((o) => { if ((o as THREE.Light).isLight) luces++; });
  assert.equal(luces, 0, "the nature adds no light");
  actualizarRelleno(grupo); // a scene without environment or hemisphere: must not throw
  a.dispose(); t.dispose();
});
