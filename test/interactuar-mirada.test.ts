// P15: the «E: …» prompt names the thing the player LOOKS at, only while it is in reach, and marks it in the world.
// Pure choice (apps/plaza/interactuar-mirada.ts), the ring's placement (marcaDe), the page piece with a stub DOM
// (montarInteraccion: appears in reach, leaves with the reach, nothing changes with nothing near) and that
// features.reachable hands the page where each thing is (`at`) and what it is (`role`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirMirada, anguloA, difAngulo, MIRADA_MAX_RAD, EMPATE_RAD, type Candidato } from "../apps/plaza/interactuar-mirada.ts";
import { montarInteraccion, marcaDe } from "../apps/plaza/interactuar.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import chatServer from "../features/chat/server.ts";
import { crearCogibles } from "../features/cogibles/server.ts";
import { crearCliente as clienteCogibles } from "../features/cogibles/client.ts";

const G = Math.PI / 180;
const cand = (key: string, x: number, z: number, desde = { x: 0, z: 0 }): Candidato => ({ feature: "f", key, distance: Math.hypot(x - desde.x, z - desde.z), at: { x, z } });
// the player stands at the origin; yaw 0 looks along −z, + turns left (camara-orbita.ts), so «left» is −x and «right» is +x
const mira = (yaw: number) => ({ x: 0, z: 0, yaw });

test("P15 anguloA: ahead is 0, left/right 90°, behind 180°, no place = null, standing on it = 0", () => {
  assert.ok(Math.abs(anguloA(cand("a", 0, -2), mira(0))!) < 1e-9);
  assert.ok(Math.abs(anguloA(cand("a", -2, 0), mira(0))! - 90 * G) < 1e-9, "−x is to the left of a camera along −z");
  assert.ok(Math.abs(anguloA(cand("a", 2, 0), mira(0))! - 90 * G) < 1e-9);
  assert.ok(Math.abs(anguloA(cand("a", 0, 2), mira(0))! - 180 * G) < 1e-9);
  assert.ok(Math.abs(anguloA(cand("a", -2, 0), mira(90 * G))!) < 1e-9, "turning left 90° now faces −x");
  assert.equal(anguloA({ feature: "f", key: "x", distance: 1 }, mira(0)), null);
  assert.equal(anguloA(cand("a", 0.1, 0.1), mira(2)), 0);
  assert.ok(Math.abs(difAngulo(179 * G, -179 * G) - 2 * G) < 1e-9, "the short way round");
});

test("P15 elegirMirada: of two in reach the one in front wins, even if the other is nearer", () => {
  const cerca = cand("cerca", 0.9, 0.3), delante = cand("delante", 0, -1.4);   // `cerca` is behind-right, `delante` straight ahead
  assert.equal(elegirMirada([cerca, delante], mira(0))!.key, "delante");
  assert.equal(elegirMirada([delante, cerca], mira(0))!.key, "delante", "order of the list does not matter");
  // turn to the other one and the choice follows the look
  assert.equal(elegirMirada([cerca, delante], mira(-100 * G))!.key, "cerca");
});

test("P15 elegirMirada: on a table with several things, each one is chosen by looking at it", () => {
  // glass, phone and footprint a hand apart, 1 m ahead of the player
  const vaso = cand("vaso", -0.35, -1), movil = cand("movil", 0.0, -1), pisada = cand("pisada", 0.4, -1.2);
  const todos = [vaso, movil, pisada];
  const haciaA = (c: Candidato) => Math.atan2(-c.at!.x, -c.at!.z);
  for (const c of todos) assert.equal(elegirMirada(todos, mira(haciaA(c)))!.key, c.key, `looking at ${c.key} offers ${c.key}`);
});

test("P15 elegirMirada: a tie in angle goes to the nearest", () => {
  const lejos = cand("lejos", 0, -1.6), cerca = cand("cerca", 0, -0.6);          // the same bearing
  assert.equal(elegirMirada([lejos, cerca], mira(0))!.key, "cerca");
  const casi = cand("casi", -Math.tan(EMPATE_RAD * 0.5) * 1.6, -1.6);            // within the tie width of «lejos»
  assert.equal(elegirMirada([casi, cerca], mira(0))!.key, "cerca", "angles within 3° count as equal");
});

test("P15 elegirMirada: nobody ahead = the nearest of all, as before (the prompt is never taken from someone who aims badly)", () => {
  const a = cand("a", 1.4, 0), b = cand("b", 0, 1.0), c = cand("c", -0.8, 0.9);  // all at the sides or behind a camera looking along −z
  for (const x of [a, b, c]) assert.ok(anguloA(x, mira(0))! > MIRADA_MAX_RAD);
  assert.equal(elegirMirada([a, b, c], mira(0))!.key, "b", "b is 1.0 m away, a 1.4 m, c 1.2 m");
  assert.equal(elegirMirada([], mira(0)), null);
});

test("P15 elegirMirada: things without a known place never beat one that is in front, and win when nobody is", () => {
  const silla = { feature: "asiento", key: "s", distance: 0.5 }, vaso = cand("vaso", 0, -1.2);
  assert.equal(elegirMirada([silla, vaso], mira(0))!.key, "vaso");
  assert.equal(elegirMirada([silla, vaso], mira(180 * G))!.key, "s", "looking away from the glass: the nearest, the seat");
});

test("P15 elegirMirada: stickiness — the previous choice stays while the new one is hardly better", () => {
  const izq = cand("izq", -0.5, -1), der = cand("der", 0.5, -1);                   // ±26.6° from straight ahead
  const hacia = (c: Candidato) => Math.atan2(-c.at!.x, -c.at!.z);
  const casiCentro = mira(0.5 * (hacia(izq) + hacia(der)) + 1 * G);               // 1° past the middle
  assert.equal(elegirMirada([izq, der], casiCentro, null)!.key, hacia(izq) > hacia(der) ? "izq" : "der");
  const primero = elegirMirada([izq, der], mira(hacia(izq)), null)!;
  assert.equal(primero.key, "izq");
  assert.equal(elegirMirada([izq, der], casiCentro, primero)!.key, "izq", "kept: not worse by more than 4°");
  assert.equal(elegirMirada([izq, der], mira(hacia(der)), primero)!.key, "der", "clearly looking at the other one: it changes");
  // nobody ahead: the previous stays unless the other is 15 cm nearer
  const a = cand("a", 1.0, 1.0), b = cand("b", 1.0, 0.9);
  assert.equal(elegirMirada([a, b], mira(0), { feature: "f", key: "a" })!.key, "a");
  assert.equal(elegirMirada([a, b], mira(0), null)!.key, "b");
});

test("P15 marcaDe: a person is circled at the chest, a thing just over its base; no place = no ring", () => {
  const base = { feature: "f", key: "k", intent: "i", prompt: "p", name: "n", distance: 1 };
  assert.deepEqual(marcaDe({ ...base, role: "persona", at: { x: 3, z: 4 } }, 0.03), { x: 3, y: 1.03, z: 4, r: 0.55 });
  assert.deepEqual(marcaDe({ ...base, role: "objeto", at: { x: 3, z: 4, y: 0.75 } }, 0), { x: 3, y: 0.9, z: 4, r: 0.2 }, "a shelf's own y wins over the player's feet");
  assert.equal(marcaDe({ ...base }, 0), null);
});

// ---- the page piece, with a stub DOM -------------------------------------------------------------------------------------------
type Cosa = { key: string; x: number; z: number; r: number; role?: string };
function montarFalso(cosas: Cosa[], yo: { x: number; z: number; yaw: number }) {
  const g = globalThis as Record<string, unknown>, viejo = { document: g.document, addEventListener: g.addEventListener, setInterval: g.setInterval };
  const tics: (() => void)[] = [];
  const hijo = () => ({ hidden: false, textContent: "", setAttribute() {}, className: "" });
  g.document = { createElement: hijo, getElementById: () => null };
  g.addEventListener = () => {};
  g.setInterval = (f: () => void) => { tics.push(f); return 0; };
  const boton = { hidden: true, children: [] as unknown[], replaceChildren(...c: unknown[]) { this.children = c; }, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} }, style: { setProperty() {}, removeProperty() {} } };
  const marcas: unknown[] = [];
  const reachable = (x: number, z: number) => cosas.filter((c) => Math.hypot(c.x - x, c.z - z) <= c.r)
    .map((c) => ({ feature: "f", key: c.key, intent: "usar", prompt: `usar ${c.key}`, name: c.key, distance: Math.hypot(c.x - x, c.z - z), role: c.role ?? "objeto", at: { x: c.x, z: c.z } }));
  let consultas = 0;
  const i = montarInteraccion({
    session: { entity: 1, selfPosition: () => ({ x: yo.x, y: 0, z: yo.z }), features: { reachable: (x: number, z: number) => { consultas++; return reachable(x, z); }, use: () => ({ ok: true }) } },
    view: { renderer: { domElement: { addEventListener() {} } as unknown as HTMLElement }, cam: { yaw: () => yo.yaw }, marcar: (p: unknown) => marcas.push(p) },
    boton: boton as unknown as HTMLButtonElement, ofrece: () => true, ocupado: () => false,
  });
  const restaurar = () => { g.document = viejo.document; g.addEventListener = viejo.addEventListener; g.setInterval = viejo.setInterval; };
  return { i, boton, marcas, restaurar, mirar: () => tics.forEach((f) => f()), consultas: () => consultas, tics };
}

test("P15 page: the prompt appears inside the radius, names the thing looked at, and is gone the moment you step out", () => {
  const yo = { x: 0, z: 0, yaw: 0 };
  const W = montarFalso([{ key: "vaso", x: 0, z: -1.0, r: 1.1 }, { key: "movil", x: -0.9, z: -0.3, r: 1.1 }], yo);
  try {
    W.i.mirar();
    assert.equal(W.boton.hidden, false);
    assert.equal(W.i.actual()?.key, "vaso", "straight ahead, though the phone is nearer");
    assert.ok(W.marcas.length === 1 && (W.marcas[0] as { x: number }).x === 0, "ring over the glass");
    yo.yaw = 70 * G;                                                              // turn left toward the phone
    W.i.mirar();
    assert.equal(W.i.actual()?.key, "movil");
    assert.equal((W.marcas.at(-1) as { x: number }).x, -0.9, "the ring moved with the choice");
    yo.x = 0; yo.z = 3;                                                          // walk away: out of both radii
    W.i.mirar();
    assert.equal(W.boton.hidden, true, "no prompt out of reach");
    assert.equal(W.i.actual(), null);
    assert.equal(W.marcas.at(-1), null, "and no ring");
  } finally { W.restaurar(); }
});

test("P15 page: the limit is the radius itself (no slack on the page: the server's 1.5 m margin is only for the server)", () => {
  const yo = { x: 0, z: 1.09, yaw: 0 };
  const W = montarFalso([{ key: "vaso", x: 0, z: 0, r: 1.1 }], yo);
  try {
    W.i.mirar(); assert.equal(W.i.actual()?.key, "vaso");
    yo.z = 1.11; W.i.mirar(); assert.equal(W.i.actual(), null, "1.11 m > 1.1 m: gone");
    assert.equal(W.boton.hidden, true);
  } finally { W.restaurar(); }
});

test("P15 page: with nothing near nothing changes — no ring call, button stays hidden, however often it looks", () => {
  const yo = { x: 50, z: 50, yaw: 0 };
  const W = montarFalso([{ key: "vaso", x: 0, z: 0, r: 1.1 }], yo);
  try {
    for (let n = 0; n < 25; n++) { yo.yaw += 0.3; W.mirar(); }
    assert.equal(W.marcas.length, 0, "the view is never asked to mark anything");
    assert.equal(W.boton.hidden, true);
    assert.equal(W.i.actual(), null);
    assert.equal(W.tics.length >= 1, true);
  } finally { W.restaurar(); }
});

// ---- features.reachable hands the page the place and the role ----------------------------------------------------------------------
test("P15 reachable(): every offer carries where the thing is (`at`) and its card's role", () => {
  const sign = signer("una-clave-de-prueba-larga");
  const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: [chatServer, crearCogibles({ cosas: [{ id: "caja", nombre: "Caja", x: 3, z: -2 }] })], log: () => {}, identitySign: sign });
  const c = clienteCogibles();
  const s = new ClientSession(inst.join(0), { identity: keeper(), features: [...c.parts], view: { label() {}, bounce() {}, place() {}, lleva() {} } });
  for (let i = 0; i < 2; i++) { s.t.flush?.(); inst.tick(); s.t.flush?.(); }
  const r = s.features.reachable(3, -2).find((x) => x.feature === "cogibles");
  assert.ok(r, "the box is in reach");
  assert.equal(r.role, "objeto");
  assert.equal(r.at?.x, 3); assert.equal(r.at?.z, -2);
  assert.deepEqual(s.features.reachable(40, 40), [], "far away: nothing offered");
});

// ---- the ring in the world (packages/render/src/marca-mirada.ts): one mesh, made late, reused, asks for frames only when it changes --------
import * as THREE from "three/webgpu";
import { createMarcaMirada } from "../packages/render/src/marca-mirada.ts";

test("P15 marca-mirada: nothing is made until something is offered; one mesh is reused; the same place twice asks for nothing", () => {
  const world = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  const M = createMarcaMirada({ world, camera });
  M.update(); M.poner(null); M.update();
  assert.equal(world.children.length, 0, "a world where nothing is near makes nothing");
  assert.equal(M.busy(), false);
  assert.deepEqual(M.estado(), { visible: false, x: 0, y: 0, z: 0, r: 0, mallas: 0 });
  M.poner({ x: 1, y: 2, z: 3, r: 0.2 });
  assert.equal(M.busy(), true, "a change: the power policy must draw one more frame");
  camera.quaternion.setFromEuler(new THREE.Euler(0, 1, 0));
  M.update();
  assert.equal(M.busy(), false);
  assert.equal(world.children.length, 1);
  const malla = world.children[0] as THREE.Mesh;
  assert.ok(malla.quaternion.equals(camera.quaternion), "it faces the camera");
  assert.deepEqual(M.estado(), { visible: true, x: 1, y: 2, z: 3, r: 0.2, mallas: 1 });
  M.poner({ x: 1, y: 2, z: 3, r: 0.2 });
  assert.equal(M.busy(), false, "same place again: nothing to draw");
  M.poner({ x: 5, y: 2, z: 3, r: 0.55 });                     // another thing: the same mesh moves
  M.update();
  assert.equal(world.children.length, 1); assert.equal(malla.position.x, 5); assert.equal(malla.scale.x, 0.55);
  const geo = malla.geometry, mat = malla.material;
  M.poner(null); assert.equal(M.busy(), true); M.update();
  assert.equal(M.estado().visible, false);
  M.poner(null); assert.equal(M.busy(), false, "already gone: nothing to draw");
  M.poner({ x: 0, y: 0, z: 0, r: 0.2 });
  assert.equal(world.children.length, 1); assert.equal(malla.geometry, geo); assert.equal(malla.material, mat, "geometry and material are reused");
});
