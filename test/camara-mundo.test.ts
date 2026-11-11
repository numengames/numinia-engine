// P1: the camera of the world — entorno.json `camara` + `aparicion.giro` (format, state, who may change it), the camera sphere against a
// MESH wall (not only boxes), the first-person start with its arrival heading, and the near plane. Without `camara` nothing changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { crearOrbita, yawDeGiro, CAMARA, type Pose, type SondaMalla } from "../packages/render/src/camara-orbita.ts";
import { createCamara } from "../packages/render/src/camara.ts";
import { buildBvh, barridoMalla, quantizeTriangles } from "../packages/sim/src/bvh.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { ClientPart, Msg } from "../packages/feature/src/index.ts";
import { ZONA } from "../features/entorno/feature.ts";
import { validarEntorno, aFichero, porDefecto, leerAparicion, leerCamara, ESQUEMA } from "../features/entorno/esquema.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { crearCliente } from "../features/entorno/client.ts";

// createCamara listens on the window for the click after a drag: a bare Node has none
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.addEventListener !== "function") g.addEventListener = () => {};
const pies = { x: 0, y: 0, z: 0 };
const pose = (): Pose => ({ x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, dentro: false });
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const asentar = (o: ReturnType<typeof crearOrbita>) => { let n = 0; while (o.paso(1 / 60) && n < 600) n++; return n; };

/** A wall of two triangles in the plane z = `z` (metres), x −6…6, y −1…5, as the GLB «malla» things give them (1/64 m). */
const pared = (z: number) => buildBvh(quantizeTriangles([-6, -1, z, 6, -1, z, 6, 5, z, -6, -1, z, 6, 5, z, -6, 5, z]));
/** The probe the page builds on the simulation's mesh. */
const sondaDe = (b: ReturnType<typeof buildBvh>): SondaMalla => (ox, oy, oz, dx, dy, dz, max, r, lx, ly, lz, ux, uy, uz) => barridoMalla(b, ox, oy, oz, dx, dy, dz, max, r, lx, ly, lz, ux, uy, uz);

// ---- the format -------------------------------------------------------------------------------------------------------------------

test("P1 format: camara {inicio, distanciaMax} and aparicion.giro — good values pass, bad ones say the path and how to fix it", () => {
  const ok = validarEntorno({ schema: ESQUEMA, camara: { inicio: "primera", distanciaMax: 2.5 }, aparicion: { x: 1, z: 2, radio: 3, giro: -90 } });
  assert.ok(ok.ok, JSON.stringify(!ok.ok && ok.issues));
  if (ok.ok) assert.deepEqual([ok.value.camaraInicio, ok.value.camaraMax, ok.value.llegadaGira, ok.value.llegadaGiro], ["primera", 2.5, true, -90]);
  assert.deepEqual(leerAparicion({ aparicion: { x: 1, z: 2, radio: 3, giro: 180 } }), { ok: true, value: { x: 1, z: 2, radio: 3, giro: 180 } });
  assert.deepEqual(leerAparicion({ aparicion: { x: 1, z: 2, radio: 3 } }), { ok: true, value: { x: 1, z: 2, radio: 3 } }, "no giro key = no giro in the value");
  assert.deepEqual(leerCamara({ camara: { inicio: "tercera" } }), { ok: true, value: { inicio: "tercera" } });
  assert.deepEqual(leerCamara({}), { ok: true, value: null });
  for (const [json, path] of [
    [{ camara: { inicio: "cenital" } }, "entorno.camara.inicio"],
    [{ camara: { inicio: 1 } }, "entorno.camara.inicio"],
    [{ camara: { distanciaMax: 0.5 } }, "entorno.camara.distanciaMax"],
    [{ camara: { distanciaMax: 21 } }, "entorno.camara.distanciaMax"],
    [{ camara: { distanciaMax: "2.5" } }, "entorno.camara.distanciaMax"],
    [{ camara: [] }, "entorno.camara"],
    [{ camara: "primera" }, "entorno.camara"],
    [{ aparicion: { x: 0, z: 0, radio: 3, giro: 181 } }, "entorno.aparicion.giro"],
    [{ aparicion: { x: 0, z: 0, radio: 3, giro: "norte" } }, "entorno.aparicion.giro"],
    [{ aparicion: { x: 0, z: 0, radio: 3, giro: NaN } }, "entorno.aparicion.giro"],
  ] as [Record<string, unknown>, string][]) {
    const r = validarEntorno({ schema: ESQUEMA, ...json });
    assert.equal(r.ok, false, JSON.stringify(json));
    const issue = !r.ok && r.issues.find((i) => i.path === path);
    assert.ok(issue, `${JSON.stringify(json)} must report ${path}: ${JSON.stringify(!r.ok && r.issues)}`);
    assert.match(issue ? issue.message : "", /[a-zñ]{4}/, "a message that says how to fix it");
  }
  // the giro message explains the compass in Spanish
  const g = leerAparicion({ aparicion: { x: 0, z: 0, radio: 3, giro: 999 } });
  assert.ok(!g.ok && /hacia \+z/.test(g.issues[0].message) && /hacia −z/.test(g.issues[0].message));
});

test("P1 format: a file without camara and without giro is the old file, byte for byte (flat state defaults, same file back)", () => {
  const base = porDefecto();
  assert.deepEqual([base.camaraInicio, base.camaraMax, base.llegadaGira, base.llegadaGiro], ["tercera", 0, false, 0]);
  const v = validarEntorno({ schema: ESQUEMA, aparicion: { x: 0, z: 0, radio: 5 } });
  assert.ok(v.ok);
  const fichero = aFichero(v.ok ? v.value : base);
  assert.equal("camara" in fichero, false, "the file gets no camara it did not have");
  assert.equal(JSON.stringify(aFichero(base)).includes("camara"), false);
  // and with a camara, it goes back to its place in the file
  const c = validarEntorno({ schema: ESQUEMA, camara: { inicio: "primera", distanciaMax: 2.5 } });
  assert.deepEqual(aFichero(c.ok ? c.value : base).camara, { inicio: "primera", distanciaMax: 2.5 });
});

// ---- the state, and who may change it ----------------------------------------------------------------------------------------------

function mundo(json: unknown) {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearEntorno(json)], log: () => {}, puede: () => true });
  const t = inst.join(0), cli = crearCliente(), vistos: Msg[] = [];
  const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, entorno: (v) => vistos.push(v) } });
  const pump = () => { for (let k = 0; k < 3; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  return { s, c: cli.ambiente, vistos, pump };
}

test("P1 state: the page gets the world's camera with the environment; a builder's change cannot move it (it is the file's)", () => {
  const w = mundo({ schema: ESQUEMA, camara: { inicio: "primera", distanciaMax: 2.5 }, aparicion: { x: 0, z: 0, radio: 3, giro: 90 } });
  const v = w.s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([v.camaraInicio, v.camaraMax, v.llegadaGira, v.llegadaGiro], ["primera", 2.5, true, 90]);
  assert.ok(w.vistos.length > 0 && w.vistos.at(-1)!.camaraInicio === "primera", "view.entorno gets them (the page turns the camera from there)");
  w.c.ajustar({ camaraInicio: "tercera", camaraMax: 15, llegadaGiro: -10, llegadaGira: false, hora: 7 }); w.pump();
  const despues = w.s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([despues.camaraInicio, despues.camaraMax, despues.llegadaGira, despues.llegadaGiro], ["primera", 2.5, true, 90], "the file's values stay");
  assert.equal(despues.hora, 7, "…while the rest of the environment still moves");
  w.c.preset("noche"); w.pump();
  assert.equal(w.s.features.stateOf("entorno").get(ZONA)!.camaraInicio, "primera", "a preset keeps it");
});

test("P1 state: a world without camara has the old defaults in its state", () => {
  const w = mundo({ schema: ESQUEMA });
  const v = w.s.features.stateOf("entorno").get(ZONA)!;
  assert.deepEqual([v.camaraInicio, v.camaraMax, v.llegadaGira], ["tercera", 0, false]);
});

// ---- collision with a mesh wall -----------------------------------------------------------------------------------------------------

test("P1 collision: barridoMalla stops the sphere r before a mesh wall (head-on and slanted), finds nothing without one, allocates nothing", () => {
  const b = pared(3);
  // straight at it, +z: the centre ray hits at 3, the sphere stops at 3 − r
  near(barridoMalla(b, 0, 1.7, 0, 0, 0, 1, 9, 0.2, 1, 0, 0, 0, 1, 0), 2.8, 0.01);
  // 30° up and back (the default view): still the sphere's face, not the centre's
  const d = [0, 0.5, Math.sqrt(3) / 2];
  const t = barridoMalla(b, 0, 1.7, 0, d[0], d[1], d[2], 9, 0.2, 1, 0, 0, 0, d[2], -d[1]);
  near(t * d[2], 2.8, 0.02);
  // wall farther than `max`: max comes back
  assert.equal(barridoMalla(b, 0, 1.7, 0, 0, 0, 1, 2, 0.2, 1, 0, 0, 0, 1, 0), 2);
  // wall behind the ray: nothing
  assert.equal(barridoMalla(b, 0, 1.7, 0, 0, 0, -1, 5, 0.2, 1, 0, 0, 0, 1, 0), 5);
  // no mesh / empty mesh: max
  assert.equal(barridoMalla(null, 0, 1.7, 0, 0, 0, 1, 5, 0.2, 1, 0, 0, 0, 1, 0), 5);
  assert.equal(barridoMalla(buildBvh(new Int32Array(0)), 0, 1.7, 0, 0, 0, 1, 5, 0.2, 1, 0, 0, 0, 1, 0), 5);
  // a jamb beside the centre ray: a narrow wall 0.15 m to the side of the line still stops the sphere (the side rays)
  const jamba = buildBvh(quantizeTriangles([0.15, -1, 3, 0.4, -1, 3, 0.4, 5, 3, 0.15, -1, 3, 0.4, 5, 3, 0.15, 5, 3]));
  const t2 = barridoMalla(jamba, 0, 1.7, 0, 0, 0, 1, 9, 0.2, 1, 0, 0, 0, 1, 0);
  assert.ok(t2 < 3.01 && t2 > 2.5, `the sphere (r 0.2) touches a jamb 0.15 m off the line: ${t2}`);
  // the same answer twice (module state is not carried between calls)
  assert.equal(barridoMalla(b, 0, 1.7, 0, 0, 0, 1, 9, 0.2, 1, 0, 0, 0, 1, 0), barridoMalla(b, 0, 1.7, 0, 0, 0, 1, 9, 0.2, 1, 0, 0, 0, 1, 0));
});

test("P1 collision: in play mode a mesh wall behind you pulls the camera in at once; without the probe it goes through (the old behaviour)", () => {
  const o = crearOrbita(); o.reiniciar();
  o.malla(sondaDe(pared(3))); o.mundo({ inicio: "tercera", max: 0, giro: null });
  const p = o.pose(pies, pose());
  assert.ok(p.z < 3 - CAMARA.choque.radio + 0.01, `the camera stays in front of the wall: z ${p.z}`);
  assert.ok(p.z > 1, "…but not glued to the player");
  asentar(o);
  assert.ok(o.pose(pies, pose()).z < 2.81, "and it stays there once settled");
  const sin = crearOrbita(), q = sin.pose(pies, pose());
  assert.ok(q.z > 3, `without the probe the camera is behind the wall, as it was: z ${q.z}`);
  // first person (dist 0): nothing to sweep, the camera is the eye
  const pp = crearOrbita(); pp.malla(sondaDe(pared(0.3))); pp.mundo({ inicio: "primera", max: 0, giro: null }); pp.llegar();
  const e = pp.pose(pies, pose());
  near(e.z, 0, 1e-6); assert.equal(e.dentro, true);
});

// ---- first person and the arrival's heading ---------------------------------------------------------------------------------------------------

test("P1 heading: yawDeGiro looks where a model with that giro faces (0 → +z, 90 → +x, 180 → −z, −90 → −x)", () => {
  for (const [giro, fx, fz] of [[0, 0, 1], [90, 1, 0], [180, 0, -1], [-90, -1, 0], [45, Math.SQRT1_2, Math.SQRT1_2]] as const) {
    const o = crearOrbita(); o.mundo({ inicio: "primera", max: 0, giro }); o.llegar();
    const p = o.pose(pies, pose());
    near(p.fx, fx, 1e-9); near(p.fz, fz, 1e-9); near(p.fy, 0, 1e-9);
  }
});

test("P1 arrival: «primera» starts level in first person, «tercera» with a giro keeps the old distance and only turns; no world = no change", () => {
  const a = crearOrbita(); a.mundo({ inicio: "primera", max: 0, giro: 90 }); a.llegar();
  assert.equal(a.quieta(), true, "the drawn pose jumped: nothing to animate");
  const p = a.pose(pies, pose());
  assert.equal(p.dentro, true); near(p.y, CAMARA.ojo, 1e-6); near(p.fx, 1, 1e-9);
  const b = crearOrbita(); b.mundo({ inicio: "tercera", max: 0, giro: 180 }); b.llegar();
  const q = b.pose(pies, pose());
  near(Math.hypot(q.x, q.z), CAMARA.inicio.dist * Math.sqrt(3) / 2, 0.01); near(q.y, CAMARA.ojo + CAMARA.inicio.dist / 2, 1e-3);
  assert.ok(q.fz < -0.8 && Math.abs(q.fx) < 1e-9, "looks to −z");
  const c = crearOrbita(), antes = JSON.stringify(c.pose(pies, pose()));
  c.llegar(); c.mundo(null); c.llegar();
  assert.equal(JSON.stringify(c.pose(pies, pose())), antes, "no world camera: the camera is untouched");
  const d = crearOrbita(); d.mundo({ inicio: "tercera", max: 0, giro: null }); d.llegar();
  assert.equal(JSON.stringify(d.pose(pies, pose())), antes, "«tercera», no giro, no cap: the old view");
});

test("P1 distanciaMax: the third-person camera never goes farther than the world says (zoom, V back from first person, reset), never nearer than 1.5 m", () => {
  const o = crearOrbita(); o.mundo({ inicio: "primera", max: 2.5, giro: null }); o.llegar();
  assert.equal(o.pose(pies, pose()).dentro, true);
  o.alternarVista(); asentar(o);
  const p = o.pose(pies, pose());
  assert.ok(Math.hypot(p.x, p.y - CAMARA.ojo, p.z) <= 2.5 + 1e-6, "V out of first person: at most 2.5 m");
  for (let i = 0; i < 20; i++) o.acercar(1.5); // wheel out
  asentar(o);
  const q = o.pose(pies, pose());
  assert.ok(Math.hypot(q.x, q.y - CAMARA.ojo, q.z) <= 2.5 + 1e-6, `wheel out stops at the cap: ${Math.hypot(q.x, q.y - CAMARA.ojo, q.z)}`);
  const w = crearOrbita(); w.mundo({ inicio: "tercera", max: 1, giro: null }); // below the near limit: the near limit wins
  for (let i = 0; i < 10; i++) w.acercar(1.5);
  asentar(w);
  const r = w.pose(pies, pose());
  assert.ok(Math.hypot(r.x, r.y - CAMARA.ojo, r.z) >= CAMARA.juego.cerca - 1e-6);
  // a world without a cap: 20 m as ever
  const s = crearOrbita(); s.mundo({ inicio: "tercera", max: 0, giro: null });
  for (let i = 0; i < 30; i++) s.acercar(1.5);
  asentar(s);
  assert.ok(Math.hypot(s.pose(pies, pose()).x, s.pose(pies, pose()).z) > 10);
});

// ---- the near plane, the arrival order, VR ------------------------------------------------------------------------------------------------------

test("P1 near plane: 0.05 m in first person (under the body), 0.1 m in third; VR gets the page's back", () => {
  const cam = new THREE.PerspectiveCamera(70, 1, CAMARA.planoCerca.tercera, 600);
  const dom = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), clientWidth: 800, clientHeight: 600, style: {}, ownerDocument: { addEventListener() {}, removeEventListener() {} } } as unknown as HTMLElement;
  const c = createCamara(cam, dom);
  c.mundo({ camaraInicio: "primera" }); c.llegar();
  c.update(1 / 60, pies);
  assert.equal(cam.near, CAMARA.planoCerca.primera);
  assert.ok(cam.near <= 0.05);
  // `update` eases with the real time between draws: give it a clock that runs 1/60 s a frame
  const real = performance.now.bind(performance); let reloj = real();
  performance.now = () => (reloj += 1000 / 60);
  try { c.alternarVista(); for (let i = 0; i < 300; i++) c.update(1 / 60, pies); } finally { performance.now = real; }
  assert.equal(cam.near, CAMARA.planoCerca.tercera);
  c.planoVR();
  assert.equal(cam.near, CAMARA.planoCerca.tercera, "in VR the page's near plane");
});

test("P1 order: the arrival waits for the world's camera when the welcome comes first, and works the other way round", () => {
  const mk = () => {
    const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 600);
    const dom = { addEventListener() {}, removeEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), clientWidth: 800, clientHeight: 600, style: {}, ownerDocument: { addEventListener() {}, removeEventListener() {} } } as unknown as HTMLElement;
    return { cam, c: createCamara(cam, dom) };
  };
  const a = mk(); a.c.llegar(); a.c.mundo({ camaraInicio: "primera", llegadaGira: true, llegadaGiro: 90 }); a.c.update(1 / 60, pies);
  const b = mk(); b.c.mundo({ camaraInicio: "primera", llegadaGira: true, llegadaGiro: 90 }); b.c.llegar(); b.c.update(1 / 60, pies);
  for (const x of [a, b]) { assert.equal(x.cam.near, 0.05); near(x.cam.rotation.y, yawDeGiro(90), 1e-9); }
  const dir = new THREE.Vector3(); a.cam.getWorldDirection(dir);
  near(dir.x, 1, 1e-6); near(dir.z, 0, 1e-6);
  // a world that says nothing, whatever the order: the camera as it was
  const n = mk(); n.c.mundo({ hora: 12 }); n.c.llegar(); n.c.update(1 / 60, pies);
  near(n.cam.rotation.y, 0, 1e-9); assert.equal(n.cam.near, 0.1);
});

test("P1 giro on spawn: the composition root hands the area with its giro to the instance; people still appear inside the area", async () => {
  const { aparicionDelMundo } = await import("../features/mundo.ts");
  const logs: string[] = [];
  const area = aparicionDelMundo(() => ({ schema: ESQUEMA, aparicion: { x: 10, z: -4, radio: 2, giro: 90 } }), (l) => logs.push(l));
  assert.deepEqual(area, { x: 10, z: -4, radio: 2, giro: 90 });
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [], log: () => {}, aparicion: area });
  const t = inst.join(0), s = new ClientSession(t, { features: [], view: { label() {}, bounce() {} } });
  for (let k = 0; k < 4; k++) { t.flush(); inst.tick(); t.flush(); }
  const me = s.selfPosition(1);
  assert.ok(Math.abs(me.x - 10) <= 2.01 && Math.abs(me.z + 4) <= 2.01, `inside the area: ${me.x}, ${me.z}`);
  // a wrong giro refuses the whole aparicion, logged, and the house square is used
  const mala = aparicionDelMundo(() => ({ schema: ESQUEMA, aparicion: { x: 10, z: -4, radio: 2, giro: 400 } }), (l) => logs.push(l));
  assert.equal(mala, null);
  assert.ok(logs.some((l) => /giro/.test(l)), logs.join("|"));
});
