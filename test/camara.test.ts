import { test } from "node:test";
import assert from "node:assert/strict";
import { crearOrbita, haciaMundo, zonaMuertaRadial, rayo, barrido, CAMARA, type Pose } from "../packages/render/src/camara-orbita.ts";

const G = Math.PI / 180;
const pies = { x: 0, y: 0, z: 0 };
const pose = (): Pose => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, dentro: false });
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
/** settle the drawn pose (≤ 5 s of 60 Hz frames); returns how many frames it moved */
const asentar = (o: ReturnType<typeof crearOrbita>) => { let n = 0; while (o.paso(1 / 60) && n < 300) n++; return n; };

test("movement turns with the camera: W at yaw 0 = -z (tools/e2e.mjs), at 90° left = -x; D at 90° = -z", () => {
  assert.deepEqual(haciaMundo(0, -1, 0), [0, -1]);
  const [wx, wz] = haciaMundo(0, -1, Math.PI / 2);
  near(wx, -1); near(wz, 0);
  const [dx, dz] = haciaMundo(1, 0, Math.PI / 2);
  near(dx, 0); near(dz, -1);
  // two keys: shortened before turning, so int8 axes never clip the direction; a half-pushed stick stays half
  const [x2, z2] = haciaMundo(1, -1, 30 * G);
  near(Math.hypot(x2, z2), 1);
  near(Math.hypot(...haciaMundo(0.3, 0.4, 1.234)), 0.5);
});

test("the starting camera is the old one: 5.2 m over the eye, 9 m back, looking 30° down along -z", () => {
  const o = crearOrbita(), p = o.pose(pies, pose());
  near(p.x, 0); near(p.y, CAMARA.ojo + 5.2, 1e-3); near(p.z, 9.007, 1e-3);
  near(p.fx, 0); near(p.fy, -0.5); near(p.fz, -Math.sqrt(3) / 2);
  assert.equal(p.dentro, false);
  assert.equal(o.quieta(), true); // nothing to animate: the page may rest
});

test("orbit: yaw is free, pitch stays within ±80° in play mode", () => {
  const o = crearOrbita();
  o.orbitar(1, 10);
  assert.equal(o.meta.yaw, 1);
  near(o.meta.pitch, 80 * G);
  o.orbitar(0, -10);
  near(o.meta.pitch, -80 * G);
});

test("wheel zoom in play mode: 1.5–20 m, one more step in = first person, one step out = 1.5 m", () => {
  const o = crearOrbita();
  for (let i = 0; i < 50; i++) o.acercar(1.2);
  near(o.meta.dist, 20);
  for (let i = 0; i < 50; i++) o.acercar(1 / 1.2);
  near(o.meta.dist, 0);
  asentar(o);
  const p = o.pose(pies, pose());
  assert.equal(p.dentro, true);
  near(p.y, CAMARA.ojo); // the eye
  o.acercar(1.2);
  near(o.meta.dist, CAMARA.juego.cerca);
  asentar(o);
  assert.equal(o.pose(pies, pose()).dentro, false);
});

test("the drawn pose chases the wanted one smoothly and then stops exactly (no work when still)", () => {
  const o = crearOrbita();
  o.acercar(0.5);
  assert.equal(o.quieta(), false);
  assert.ok(o.paso(1 / 60));
  const half = o.ahora.dist;
  assert.ok(half < 10.4 && half > 5.2, `${half}`);
  const n = asentar(o);
  assert.ok(n > 5 && n < 120, `settled in ${n} frames`);
  assert.equal(o.quieta(), true);
  assert.equal(o.paso(1 / 60), false);
});

test("never under the ground: looking up from low brings the camera closer", () => {
  const o = crearOrbita();
  o.orbitar(0, -70 * G); // pitch -40°
  asentar(o);
  const p = o.pose(pies, pose());
  assert.ok(p.y >= CAMARA.suelo - 1e-9, `${p.y}`);
});

test("build mode: free pivot, frame() moves it, zoom up to 80 m, leaving it returns to the avatar", () => {
  const o = crearOrbita();
  assert.equal(o.encuadrar({ x: 5, y: 1, z: -5 }, 1, pies, 60), false); // play mode: the camera belongs to the avatar
  o.cambiarModo("construir");
  assert.equal(o.modo, "construir");
  assert.equal(o.encuadrar({ x: 5, y: 1, z: -5 }, 1, pies, 60), true);
  asentar(o);
  const piv = o.pivote(pies);
  near(piv.x, 5, 1e-3); near(piv.y, 1, 1e-3); near(piv.z, -5, 1e-3);
  near(o.ahora.dist, 2.4, 1e-3); // radius / sin(30°) × 1.2
  for (let i = 0; i < 80; i++) o.acercar(1.2);
  near(o.meta.dist, 80);
  for (let i = 0; i < 80; i++) o.acercar(1 / 1.2);
  near(o.meta.dist, CAMARA.construir.cerca); // never first person while building
  o.cambiarModo("juego");
  asentar(o);
  const back = o.pivote(pies);
  near(back.x, 0, 1e-3); near(back.y, CAMARA.ojo, 1e-3); near(back.z, 0, 1e-3);
  near(o.ahora.dist, 10.4, 1e-3); // the play distance from before building
});

test("build mode: zoom toward the cursor keeps the point under it still", () => {
  const o = crearOrbita();
  o.cambiarModo("construir");
  asentar(o);
  const nx = 0.4, ny = -0.3, fov = 60, aspect = 1.6;
  const P = o.puntoBajo(nx, ny, fov, aspect, pies, 1000)!;
  assert.ok(P && Math.abs(P.y) < 1e-9);
  o.acercarHacia(0.7, P, pies);
  asentar(o);
  // the ray through the same screen point still hits P
  const c = o.pose(pies, pose()), r = rayo(nx, ny, fov, aspect, o.ahora.yaw, o.ahora.pitch);
  const t = -c.y / r.y;
  near(c.x + r.x * t, P.x, 1e-2); near(c.z + r.z * t, P.z, 1e-2);
  near(o.ahora.dist, 10.4 * 0.7, 1e-2);
});

test("build mode: panning moves the pivot along the screen; play mode ignores it", () => {
  const o = crearOrbita();
  o.panear(1, 0, pies);
  assert.equal(o.meta.ox, 0);
  o.cambiarModo("construir");
  o.panear(2, 0, pies); // to the right of a camera at yaw 0 = +x
  near(o.meta.ox, 2); near(o.meta.oy, 0); near(o.meta.oz, 0);
  o.panear(0, -100, pies); // never under the ground
  assert.ok(CAMARA.ojo + o.meta.oy >= CAMARA.suelo - 1e-9);
});

test("V toggles first person and back; reset returns behind the avatar the short way round", () => {
  const o = crearOrbita();
  o.alternarVista();
  assert.equal(o.meta.dist, 0);
  o.alternarVista();
  near(o.meta.dist, 10.4);
  o.orbitar(3, 0.3);
  asentar(o);
  o.reiniciar();
  asentar(o);
  near(Math.atan2(Math.sin(o.ahora.yaw), Math.cos(o.ahora.yaw)), 0, 1e-3);
  near(o.ahora.pitch, 30 * G, 1e-3);
});

test("the ray through the screen centre is the camera's forward", () => {
  const r = rayo(0, 0, 60, 1.5, 0.7, 0.2);
  near(r.x, -Math.sin(0.7) * Math.cos(0.2)); near(r.y, -Math.sin(0.2)); near(r.z, -Math.cos(0.7) * Math.cos(0.2));
});

// ---- N1b: the camera follows your height and does not go through solid things ----

test("N1b: the pivot follows the feet's height (a jump, a tower floor) a little behind, then rests on it", () => {
  const o = crearOrbita(), alto = { x: 0, y: 1.5, z: 0 };
  o.seguir(0); asentar(o);
  o.seguir(1.5);                           // the top of a jump
  o.paso(1 / 60);
  const p1 = o.pose(alto, pose());
  assert.ok(p1.y > CAMARA.ojo + 5.2 && p1.y < CAMARA.ojo + 5.2 + 1.5, `a little behind: ${p1.y}`);
  asentar(o);
  near(o.pose(alto, pose()).y, 1.5 + CAMARA.ojo + 5.2, 1e-2);  // then exactly over the new height
  assert.equal(o.quieta(), true);           // and the page may rest again
  o.seguir(12); o.paso(1 / 60);             // a teleport to a tower's top (more than saltoAltura): taken at once
  near(o.pivote({ x: 0, y: 12, z: 0 }).y, 12 + CAMARA.ojo, 1e-9);
});

test("N1b: a sphere swept against boxes stops at the first face, grown by its radius; a box holding the start is ignored", () => {
  const caja = [-1, 0, 4, 1, 3, 5];         // a wall 4 m behind (+z)
  near(barrido({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, 10, 0.2, caja), 3.8);
  near(barrido({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, 3, 0.2, caja), 3);       // farther than max: max
  near(barrido({ x: 5, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, 10, 0.2, caja), 10);     // beside it: free
  near(barrido({ x: 0, y: 1.6, z: 4.5 }, { x: 0, y: 0, z: 1 }, 10, 0.2, caja), 10);   // starting inside: ignored
});

test("N1b: in play mode a wall behind you pulls the camera in at once, and it eases back out when the wall goes", () => {
  const o = crearOrbita();
  o.orbitar(0, -30 * G);                    // level camera, 10.4 m behind along +z
  asentar(o);
  const pared = new Float32Array([-3, 0, 4, 3, 6, 4.5]);
  o.paredes(pared);
  const p = o.pose(pies, pose());
  near(p.z, 4 - CAMARA.choque.radio, 1e-6); // in front of the wall on the very first frame
  asentar(o);
  assert.equal(o.quieta(), true);           // held against the wall, nothing to animate: the page may rest
  o.paredes([]);
  o.pose(pies, pose());                     // the frame that finds the way clear
  o.paso(1 / 60);
  const p2 = o.pose(pies, pose());
  assert.ok(p2.z > 3.8 && p2.z < 10.4, `easing out: ${p2.z}`);
  asentar(o); o.pose(pies, pose()); asentar(o);
  near(o.pose(pies, pose()).z, 10.4, 1e-2);
  assert.equal(o.quieta(), true);
});

test("N1b: zooming in past a wall does not snap the camera into your head; build mode ignores walls", () => {
  const o = crearOrbita();
  o.orbitar(0, -30 * G); asentar(o);
  o.paredes(new Float32Array([-3, 0, 4, 3, 6, 4.5]));
  o.pose(pies, pose());
  o.acercar(0.25);                          // 10.4 → 2.6 m: nearer than the wall
  for (let i = 0; i < 300; i++) { o.paso(1 / 60); const z = o.pose(pies, pose()).z; assert.ok(z >= 2.6 - 1e-3 && z <= 3.8 + 1e-6, `z ${z}`); }
  o.cambiarModo("construir"); asentar(o);
  assert.ok(o.pose(pies, pose()).z > 4.5, "the editor camera flies through walls");
});

test("the stick's dead zone is a circle: nothing inside, direction kept outside, 1 at the rim", () => {
  assert.deepEqual(zonaMuertaRadial(0.1, 0.1, 0.15), [0, 0]);   // 0.141 long: inside
  assert.deepEqual(zonaMuertaRadial(0, 0, 0.15), [0, 0]);
  // a diagonal push keeps its angle (per-axis zones bent it toward the axes)
  const [x, y] = zonaMuertaRadial(0.3, 0.4, 0.15);               // length 0.5 → (0.5-0.15)/0.85
  near(Math.hypot(x, y), 0.35 / 0.85); near(x / y, 0.75);
  // an axis under the old per-axis 0.15 but with the other axis pushed still counts
  assert.ok(zonaMuertaRadial(0.1, 0.9, 0.15)[0] > 0);
  // full travel, even a corner of the square gate, is 1 at most
  near(Math.hypot(...zonaMuertaRadial(1, 0, 0.15)), 1); near(Math.hypot(...zonaMuertaRadial(1, 1, 0.15)), 1);
  // zone 0 = raw; a silly zone is capped, never divides by zero
  assert.deepEqual(zonaMuertaRadial(0.5, 0, 0), [0.5, 0]);
  assert.ok(Number.isFinite(zonaMuertaRadial(1, 0, 5)[0]));
});
