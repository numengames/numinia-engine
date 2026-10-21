// ia-visible S5: the green ring on the floor under every AI (packages/render/src/aros.ts) and the sleeping AI's hollow diamond on the
// map. Headless: the pool's behaviour (what is made, what is reused, what the cap drops) and the pure style. The look is checked in the browser leg.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { createAros, ARO_SOBRE_SUELO_M } from "../packages/render/src/aros.ts";
import { estiloAro, escalaAro, arosMax, AROS_MOVIL, AROS_PC, ARO_CRECE_MAX } from "../packages/render/src/ia-marca.ts";
import { crearRegistro, firma, quienDeAgente } from "../packages/client/src/mapa.ts";
import type { Vista, Marcador } from "../packages/client/src/mapa.ts";

/** A world with avatars (capsule centres 0.85 m over the feet) and a camera at the origin looking along -z. */
function mundo(max = 24) {
  const world = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  const avatares = new Map<number, THREE.Object3D>();
  const ponerAvatar = (t: number, x: number, z: number, y = 0.85) => { let a = avatares.get(t); if (!a) { a = new THREE.Object3D(); avatares.set(t, a); } a.position.set(x, y, z); return a; };
  let tope = max;
  const A = createAros({ world, avatarOf: (t) => avatares.get(t), camera, max: () => tope });
  return { world, camera, avatares, ponerAvatar, A, tope: (n: number) => { tope = n; } };
}
const anillos = (w: THREE.Object3D) => w.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];

test("a world without AIs makes nothing: no geometry, no material, no mesh, nothing to draw", () => {
  const m = mundo();
  m.ponerAvatar(1, 3, -4);
  m.A.update(); m.A.update();
  assert.deepEqual(m.A.compartidos(), { geometrias: 0, materiales: 0, mallas: 0, libres: 0 });
  assert.equal(m.world.children.length, 0);
  assert.equal(m.A.busy(), false);
  assert.deepEqual(m.A.lista(), []);
});

test("an AI gets a ring on the floor under its feet, which follows it; a person next to it gets none", () => {
  const m = mundo();
  m.ponerAvatar(1, 0, -3); m.ponerAvatar(2, 2, -5); // 1 = a person, 2 = an AI
  m.A.poner(2, "activa"); m.A.update();
  const r = anillos(m.world);
  assert.equal(r.length, 1);
  assert.ok(Math.abs(r[0].position.y - ARO_SOBRE_SUELO_M) < 1e-9, "feet = centre − 0.85; a hair over the floor");
  assert.equal(r[0].position.x, 2); assert.equal(r[0].position.z, -5);
  m.ponerAvatar(2, 4, -7, 1.85); m.A.update(); // it walks, and climbs a metre
  assert.equal(r[0].position.x, 4); assert.ok(Math.abs(r[0].position.y - 1.03) < 1e-9);
  assert.deepEqual(m.A.lista(), [{ target: 2, estado: "activa", drawn: true }]);
});

test("every ring shares ONE geometry and one material per state; the pool never makes more meshes than the cap", () => {
  const m = mundo(3);
  for (let i = 1; i <= 6; i++) { m.ponerAvatar(i, i, -5 - i); m.A.poner(i, i % 2 ? "activa" : "dormida"); }
  m.A.update();
  const c = m.A.compartidos();
  assert.equal(c.geometrias, 1);
  assert.ok(c.materiales <= 2);
  assert.equal(c.mallas, 3, "only the cap is drawn");
  const g = new Set(anillos(m.world).map((x) => x.geometry));
  assert.equal(g.size, 1);
});

test("over the cap the nearest AIs keep their ring; when one leaves its mesh goes back to the pool and is reused", () => {
  const m = mundo(2);
  m.ponerAvatar(1, 0, -20); m.ponerAvatar(2, 0, -5); m.ponerAvatar(3, 0, -9);
  for (const t of [1, 2, 3]) m.A.poner(t, "activa");
  m.A.update();
  assert.deepEqual(m.A.lista().filter((x) => x.drawn).map((x) => x.target).sort(), [2, 3]);
  m.A.poner(2, null); m.A.update();
  assert.deepEqual(m.A.lista().filter((x) => x.drawn).map((x) => x.target).sort(), [1, 3], "the freed place goes to the next nearest");
  const hechas = new Set(anillos(m.world)); // the same two meshes serve: the pool made no third one
  assert.equal(hechas.size, 2);
  assert.equal(m.A.compartidos().libres, 0);
  m.A.poner(1, null); m.A.poner(3, null); m.A.update();
  assert.equal(anillos(m.world).length, 0, "no AI, no ring on screen");
  assert.equal(m.A.compartidos().libres, 2, "both meshes wait in the pool");
});

test("a smaller cap (a phone) drops the farthest rings at once", () => {
  const m = mundo(24);
  for (let i = 1; i <= 5; i++) { m.ponerAvatar(i, 0, -i * 3); m.A.poner(i, "activa"); }
  m.A.update(); assert.equal(m.A.compartidos().mallas, 5);
  m.tope(2); m.A.update();
  assert.deepEqual(m.A.lista().filter((x) => x.drawn).map((x) => x.target).sort(), [1, 2]);
  assert.ok(arosMax(true) < arosMax(false));
  assert.equal(arosMax(true), AROS_MOVIL); assert.equal(arosMax(false), AROS_PC);
});

test("the state changes the ring in place (asleep is fainter); an AI whose body is not in sight has no ring until it is", () => {
  const m = mundo();
  m.ponerAvatar(1, 0, -4); m.A.poner(1, "activa"); m.A.update();
  const r = anillos(m.world)[0], op = (r.material as THREE.MeshBasicMaterial).opacity;
  m.A.poner(1, "dormida"); m.A.update();
  assert.ok((r.material as THREE.MeshBasicMaterial).opacity < op);
  assert.equal(anillos(m.world).length, 1, "the same mesh, a different material");
  m.avatares.delete(1); m.A.update();
  assert.equal(anillos(m.world).length, 0);
  assert.equal(m.A.lista()[0].drawn, false);
  m.ponerAvatar(1, 0, -4); m.A.update();
  assert.equal(anillos(m.world).length, 1, "it comes back with its body");
});

test("a change asks for one more frame (power policy); a ring that stands still asks for nothing", () => {
  const m = mundo();
  m.ponerAvatar(1, 0, -4);
  assert.equal(m.A.busy(), false);
  m.A.poner(1, "activa"); assert.equal(m.A.busy(), true);
  m.A.update(); assert.equal(m.A.busy(), false);
  m.A.update(); assert.equal(m.A.busy(), false);
});

test("ring style: bright and the map's green when active, fainter when asleep; far rings grow up to ×3", () => {
  const a = estiloAro("activa"), d = estiloAro("dormida");
  assert.equal(a.color, 0x14897a);
  assert.ok(a.opacidad > d.opacidad && d.opacidad > 0);
  assert.equal(escalaAro(2), 1); assert.equal(escalaAro(16), 2); assert.equal(escalaAro(500), ARO_CRECE_MAX);
});

test("map: a sleeping AI is the same green but a hollow diamond; the picture's key changes when it falls asleep", () => {
  const r = crearRegistro();
  const act = r.tipo("agente"), dor = r.tipo("agente-dormida");
  assert.equal(dor.color, act.color);
  assert.equal(act.forma, "rombo"); assert.equal(dor.forma, "rombo-hueco");
  assert.ok(dor.enLista);
  const v: Vista = { cx: 0, cz: 0, escala: 2, giro: 0, ancho: 100, alto: 100 };
  const una = (tipo: string): Marcador[] => [{ id: "p2", tipo, nombre: "Ada · IA", x: 3, z: 3 }];
  assert.notEqual(firma(v, una("agente")), firma(v, una("agente-dormida")), "the minimap repaints when the state changes");
});

test("map: a click on an AI's diamond (active or asleep) names the entity whose card opens; nothing else does", () => {
  assert.equal(quienDeAgente({ id: "p7", tipo: "agente" }), 7);
  assert.equal(quienDeAgente({ id: "p12", tipo: "agente-dormida" }), 12);
  assert.equal(quienDeAgente({ id: "p7", tipo: "persona" }), null, "a person's dot opens no AI card");
  assert.equal(quienDeAgente({ id: "c:objetos:7", tipo: "agente" }), null, "an id that is not an entity");
  assert.equal(quienDeAgente({ id: "punto:1,2", tipo: "lugar" }), null);
  assert.equal(quienDeAgente(null), null);
  assert.equal(quienDeAgente(undefined), null);
});
