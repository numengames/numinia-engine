// R5.3: the engine's landmark pillars (index.ts: 24 gold/blue/red/green boxes) wear the house palette and sit on the relief only
// while a world has the nature on; switching it off puts them back exactly; a world without nature never touches them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { HITOS, CASA, MAQUINA, mezcla } from "../packages/render/src/naturaleza/paleta.ts";
import { vestirHitos, HUNDIDO } from "../packages/render/src/naturaleza/hitos.ts";
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

test("R5.3 HITOS are mixes of house tokens, muted (no primary colour), same order as the engine's", () => {
  assert.equal(HITOS.length, MOTOR.length);
  assert.equal(HITOS[0], mezcla(MAQUINA.laton, CASA.bronce, 0.3), "the gold pillar of the example quest stays brass");
  // chroma (max − min channel): every post is calmer than the toy colour it replaces and none is loud
  const croma = (c: number) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
  HITOS.forEach((c, i) => { assert.ok(croma(c) < croma(MOTOR[i]), `0x${c.toString(16)} calmer than 0x${MOTOR[i].toString(16)}`); assert.ok(croma(c) <= 0.42, `0x${c.toString(16)} chroma ${croma(c).toFixed(2)}`); });
  const sinComentarios = fuente("packages/render/src/naturaleza/hitos.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.deepEqual(sinComentarios.match(/0x[0-9a-f]+/gi) ?? [], [], "no raw hex in hitos.ts");
});

test("R5.3 vestirHitos: palette colours, seated on the relief below the lowest corner, undo restores everything", () => {
  const ps = pilares(), alto = (x: number, z: number) => 0.05 * x + 0.03 * z + 2;
  ps[3].visible = false; // the environment's hitos:false must survive
  const deshacer = vestirHitos(ps, alto);
  ps.forEach((p, i) => {
    const m = p.material as THREE.MeshStandardMaterial;
    assert.equal(m.color.getHex(), HITOS[i % 4]);
    const { x, z } = p.position, bajo = Math.min(alto(x - 0.5, z - 0.5), alto(x + 0.5, z - 0.5), alto(x - 0.5, z + 0.5), alto(x + 0.5, z + 0.5));
    assert.ok(Math.abs(p.position.y - (bajo + 1.5 - HUNDIDO)) < 1e-9, "base sunk HUNDIDO below the lowest corner: never floats");
    assert.ok(m.metalness > 0 && m.roughness < 1);
  });
  assert.equal(ps[3].visible, false, "visibility untouched");
  deshacer();
  ps.forEach((p, i) => {
    const m = p.material as THREE.MeshStandardMaterial;
    assert.equal(m.color.getHex(), MOTOR[i % 4]); assert.equal(p.position.y, 1.5); assert.equal(m.metalness, 0); assert.equal(m.roughness, 1);
  });
});

test("R5.3 the nature piece dresses the pillars while on and gives them back when off; index.ts hands them over", async () => {
  const padre = new THREE.Group(), ground = new THREE.Mesh(), camara = new THREE.PerspectiveCamera(), ps = pilares();
  const n = crearNaturaleza({ padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => "D", camara, yo: () => null, niebla: () => 0xbcd6ee, hitos: () => ps });
  await n.aplicar({ semilla: 7, fauna: false });
  ps.forEach((p, i) => assert.equal((p.material as THREE.MeshStandardMaterial).color.getHex(), HITOS[i % 4]));
  const t = n.terreno!;
  assert.ok(Math.abs(ps[0].position.y - t.alturaEn(ps[0].position.x, ps[0].position.z) - (1.5 - HUNDIDO)) < 1.5, "seated on the terrain");
  await n.aplicar({ activa: false });
  ps.forEach((p, i) => { assert.equal((p.material as THREE.MeshStandardMaterial).color.getHex(), MOTOR[i % 4]); assert.equal(p.position.y, 1.5); });
  n.dispose();
  assert.match(fuente("packages/render/src/index.ts"), /crearNaturalezaPerezosa\(\{[^\n]*hitos: \(\) => hitos/, "index.ts passes its pillars to the nature piece");
});
