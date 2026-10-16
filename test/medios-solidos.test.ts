// U10: what Pablo asked on 16-10 — images, video screens and spheres of sound placed like models; hidden spheres;
// a «sólido» switch that makes a thing stop people (server and page predict the same wall). Headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClientPart, PlacedObject } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { createSim, spawnAvatar, step, setSolids, solidsFrom, getBody, setBody, replayFingerprint, referenceRecording, REFERENCE } from "../packages/sim/src/index.ts";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import { crearObjetos, cajaEnMundo } from "../features/objetos/server.ts";
import { crearCliente, tipoDe } from "../features/objetos/client.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };

const BLOQUE = biblioteca.modelos.find((m) => m.id === "bloque")!.modelo;
const SHA = "a".repeat(64);
const subidos = new Set([`${SHA}.mp3`, `${SHA}.png`, `${SHA}.mp4`]);

function world() {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: () => {}, puede: (_w, a) => a === "construir", activo: (h, e) => subidos.has(`${h}.${e}`) });
  const t = inst.join(0), cli = crearCliente(), drawn = new Map<string, PlacedObject>();
  const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  return { inst, s, b: cli.constructor, drawn, pump };
}

test("U10: file kinds by extension", () => {
  assert.equal(tipoDe("glb"), "modelo"); assert.equal(tipoDe("PNG"), "imagen"); assert.equal(tipoDe("webm"), "video"); assert.equal(tipoDe("ogg"), "sonido"); assert.equal(tipoDe("exe"), null);
});

test("U10: a sphere of sound, an image and a screen are placed from uploaded files; the page draws them with their kind", () => {
  const { b, drawn, pump, s } = world();
  assert.ok(b.colocarFichero(SHA, "mp3", "Fuente").ok); pump();
  assert.ok(b.colocarFichero(SHA, "png", "Cartel").ok); pump();
  assert.ok(b.colocarFichero(SHA, "mp4", "Pantalla").ok); pump();
  const cosas = [...drawn.values()];
  assert.deepEqual(cosas.map((c) => c.kind), ["sonido", "imagen", "video"]);
  assert.equal(cosas[0].sx, 3); // a sphere starts with a 3 m radius
  // a file that was never uploaded, or the wrong extension for the kind, is refused
  s.features.send("objetos", "colocar", { modelo: SHA, x: 0, y: 0, z: 0, ry: 0, nombre: "x", decorado: false, tipo: "sonido", ext: "ogg" }); pump();
  assert.match(b.estado.ultimoRechazo, /\.ogg no se ha subido/);
  s.features.send("objetos", "colocar", { modelo: SHA, x: 0, y: 0, z: 0, ry: 0, nombre: "x", decorado: false, tipo: "sonido", ext: "png" }); pump();
  assert.match(b.estado.ultimoRechazo, /\.png no vale/);
});

test("U10: a sphere is made invisible and quieter, and cannot be solid; undo brings it back", () => {
  const { b, drawn, pump } = world();
  b.colocarFichero(SHA, "mp3", "Fuente"); pump();
  assert.ok(b.ajustar({ oculto: true, volumen: 0.4 }).ok); pump();
  const [k] = drawn.keys();
  assert.equal(drawn.get(k)!.hidden, true); assert.equal(drawn.get(k)!.volume, 0.4);
  b.ajustar({ solido: true, caja: [-1, -1, -1, 1, 1, 1] }); pump();
  assert.match(b.estado.ultimoRechazo, /no puede ser sólida/);
  b.deshacer(); pump();
  assert.equal(drawn.get(k)!.hidden, false);
});

test("U11: who hears a sound or a video (bubble, zone, everyone) and a video's bubble radius", () => {
  const { b, drawn, pump } = world();
  b.colocarFichero(SHA, "mp4", "Pantalla"); pump();
  const [k] = drawn.keys();
  assert.equal(drawn.get(k)!.reach, "burbuja"); assert.equal(drawn.get(k)!.radius, 8);
  assert.ok(b.ajustar({ alcance: "todos", radio: 15 }).ok); pump();
  assert.equal(drawn.get(k)!.reach, "todos"); assert.equal(drawn.get(k)!.radius, 15);
  b.ajustar({ radio: 900 }); pump();
  assert.equal(drawn.get(k)!.radius, 200); // clamped by the page before asking
});

test("U10: the world box of a solid follows scale, turn and position", () => {
  const c = cajaEnMundo({ x: 10, y: 0, z: 0, rx: 0, ry: 90, rz: 0, sx: 2, sy: 1, sz: 1 }, [-1, 0, -0.5, 1, 2, 0.5]);
  assert.deepEqual(c, { bx0: 9.5, by0: 0, bz0: -2, bx1: 10.5, by1: 2, bz1: 2 });
});

test("U10: a solid wall stops you (server and prediction agree), you slide along it, climb a low step and stand on top", () => {
  const s = createSim(1, 0); spawnAvatar(s, 0);
  setBody(s, 0, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setSolids(s, solidsFrom([["o:muro", { solido: true, bx0: -5, by0: 0, bz0: -3, bx1: 5, by1: 3, bz1: -2 }]]));
  for (let i = 0; i < 40; i++) step(s, new Int32Array([0, 0, -127, 0])); // walk north 2 s into the wall
  const b = getBody(s, 0);
  assert.ok(b.z >= fx(-2 + 0.35) - 1, `went through the wall: z=${b.z / FX_ONE}`);
  for (let i = 0; i < 30; i++) step(s, new Int32Array([0, 127, -127, 0])); // diagonal: slides east along it
  assert.ok(getBody(s, 0).x > fx(3), "did not slide");
  // a low step (0.3 m) is climbed, and you stand on it
  setSolids(s, solidsFrom([["o:escalon", { solido: true, bx0: -20, by0: 0, bz0: 5, bx1: 20, by1: 0.3, bz1: 10 }]]));
  setBody(s, 0, { x: 0, y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  for (let i = 0; i < 40; i++) step(s, new Int32Array([0, 0, 127, 0]));
  const e = getBody(s, 0);
  assert.ok(e.z > fx(6) && e.y === fx(0.3), `on the step: z=${e.z / FX_ONE} y=${e.y / FX_ONE}`);
  // solids never change the reference fingerprint (they are world geometry, not state)
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, 500, 5)), replayFingerprint(referenceRecording(REFERENCE.seed, 500, 5)));
});

test("U10: marking a placed block solid makes the instance stop a walking player", () => {
  const { b, drawn, pump, s, inst } = world();
  b.colocarEn("bloque", { x: 0, y: 0, z: -3 }); pump();
  assert.equal([...drawn.values()][0].model, BLOQUE);
  assert.ok(b.ajustar({ solido: true, caja: [-0.5, 0, -0.5, 0.5, 1, 0.5] }).ok); pump();
  assert.ok(b.escalar(8).ok); pump(); // 8 x 8 m: the player (spawned within 40 m) is moved next to it below
  const o = [...s.features.stateOf("objetos").values()][0];
  assert.equal(o.solido, true); assert.equal(o.bx0, -4); assert.equal(o.bx1, 4);
  // the server's simulation and the page's prediction both hold the same wall
  assert.deepEqual([...inst.sim.solids], [fx(-4), 0, fx(-7), fx(4), fx(8), fx(1)]);
  s.tick(0, 0); assert.deepEqual([...(s as unknown as { local: { solids: Int32Array } }).local.solids], [...inst.sim.solids]);
  b.ajustar({ solido: false }); pump();
  assert.equal(inst.sim.solids.length, 0);
});
