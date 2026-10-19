// R5.3 → R6.1: the engine's landmark pillars (index.ts: 24 gold/blue/red/green boxes) are hidden while a world has the nature on
// (no draw calls; R5.3 recoloured them, Pablo wants them gone); switching it off gives them back exactly as the environment wants
// them; a world without nature never touches them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { ocultarHitos, estaOculto } from "../packages/render/src/naturaleza/hitos.ts";
import { crearNaturaleza } from "../packages/render/src/naturaleza/naturaleza.ts";

const fuente = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const MOTOR = [0xd9a441, 0x5b8cc0, 0xc0605b, 0x6ea86a];

/** The same 24 pillars index.ts builds (fixed positions, the engine's toy palette). */
function pilares(): THREE.Mesh[] {
  const geo = new THREE.BoxGeometry(1, 3, 1), out: THREE.Mesh[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 18 + (i % 3) * 9;
    const p = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: MOTOR[i % 4] }));
    p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r); out.push(p);
  }
  return out;
}
/** What the renderer would draw: visible meshes passing the camera's layer test (the renderer's projectObject rule). */
const dibujados = (ps: THREE.Object3D[]) => { const cam = new THREE.Camera(); return ps.filter((p) => p.visible && p.layers.test(cam.layers)).length; };
/** The look must be the engine's untouched: colour, metal, roughness, height. */
const intactos = (ps: THREE.Mesh[]) => ps.forEach((p, i) => {
  const m = p.material as THREE.MeshStandardMaterial;
  assert.equal(m.color.getHex(), MOTOR[i % 4]); assert.equal(m.metalness, 0); assert.equal(m.roughness, 1); assert.equal(p.position.y, 1.5);
});

test("R6.1 ocultarHitos: hidden (nothing drawn), look untouched, undo shows them again as plain properties", () => {
  const ps = pilares();
  const mostrar = ocultarHitos(ps);
  assert.equal(dibujados(ps), 0, "no pillar reaches the renderer");
  ps.forEach((p) => assert.ok(estaOculto(p)));
  intactos(ps);
  ocultarHitos(ps)(); // a second hide (and its undo) does not steal them from the first
  assert.equal(dibujados(ps), 0);
  mostrar();
  assert.equal(dibujados(ps), 24);
  ps.forEach((p) => { assert.ok(!estaOculto(p)); assert.equal(Object.getOwnPropertyDescriptor(p, "visible")?.writable, true, "plain own property again"); });
  intactos(ps);
});

test("R6.1 the environment's hitos:true/false while hidden is remembered, never shown, and wins on the undo", () => {
  const ps = pilares();
  ps[3].visible = false; // the environment's hitos:false before the nature came
  let mostrar = ocultarHitos(ps);
  mostrar();
  assert.equal(ps[3].visible, false, "a pillar the environment hid stays hidden");
  assert.equal(dibujados(ps), 23);
  mostrar = ocultarHitos(ps);
  for (const p of ps) p.visible = true; // entorno.ts re-applies (tier/quality change) with hitos:true
  assert.equal(dibujados(ps), 0, "still hidden while the nature is on");
  mostrar();
  assert.equal(dibujados(ps), 24, "the latest wish of the environment comes back");
  mostrar = ocultarHitos(ps);
  for (const p of ps) p.visible = false; // the world switches hitos:false while the nature is on
  mostrar();
  assert.equal(dibujados(ps), 0);
});

test("R6.1 the nature piece hides the pillars while on, rebuilds keep them hidden, off gives them back; index.ts hands them over", async () => {
  const padre = new THREE.Group(), ground = new THREE.Mesh(), camara = new THREE.PerspectiveCamera(), ps = pilares();
  let nivel: "C" | "D" = "D";
  const n = crearNaturaleza({ padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => nivel, camara, yo: () => null, niebla: () => 0xbcd6ee, hitos: () => ps });
  await n.aplicar({ semilla: 7, fauna: false });
  assert.equal(dibujados(ps), 0, "no pillar drawn in a nature world");
  intactos(ps);
  nivel = "C"; await n.aplicar({ semilla: 8, fauna: false }); // rebuilt (other data): undo + hide again
  assert.equal(dibujados(ps), 0);
  await n.aplicar({ activa: false });
  assert.equal(dibujados(ps), 24, "back when the nature goes off");
  ps.forEach((p) => assert.ok(!estaOculto(p)));
  intactos(ps);
  n.dispose();
  assert.match(fuente("packages/render/src/index.ts"), /crearNaturalezaPerezosa\(\{[^\n]*hitos: \(\) => hitos/, "index.ts passes its pillars to the nature piece");
  const sinComentarios = fuente("packages/render/src/naturaleza/hitos.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.deepEqual(sinComentarios.match(/0x[0-9a-f]+/gi) ?? [], [], "no raw hex in hitos.ts");
  assert.doesNotMatch(fuente("packages/render/src/naturaleza/paleta.ts"), /export const HITOS/, "the R5.3 pillar mixes are gone");
});

test("R6.1 a world without nature never touches the pillars", () => {
  const ps = pilares();
  const n = crearNaturaleza({ padre: new THREE.Group(), ground: new THREE.Mesh(), vientoU: uniform(new THREE.Vector3()), nivel: () => "D", camara: new THREE.PerspectiveCamera(), yo: () => null, niebla: () => 0, hitos: () => ps });
  assert.equal(dibujados(ps), 24); intactos(ps);
  n.dispose();
  assert.equal(dibujados(ps), 24);
});
