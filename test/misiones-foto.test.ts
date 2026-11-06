// P10: the step `foto` — a photo of the engine's camera counts for a quest when a corner (a sphere) is in the shot. The geometry (pure),
// the format (good and bad), the machine (one step per quest, the nearest, `fotos_erroneas`, persistence, "without the new fields nothing
// changes") and the whole thing over the real plug with a collision mesh (the server decides; a wall hides the corner; the camera's leash;
// one photo a second).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { setMesh, buildBvh, quantizeTriangles } from "../packages/sim/src/index.ts";
import { CAMARA } from "../packages/render/src/camara-orbita.ts";
import { cargarAventura, leerMision, TIPOS_PASO } from "../features/misiones/formato.ts";
import type { Aventura, Fichero } from "../features/misiones/formato.ts";
import { aceptar, cuentaDe, fotografiar, leerProgreso, nuevoProgreso, pasosFoto, registrar } from "../features/misiones/maquina.ts";
import type { Progreso } from "../features/misiones/maquina.ts";
import { enEncuadre, pideFoto, FOTO_ALCANCE_M, FOTO_CAMARA_MAX_M, FOTO_DISTANCIA_M, FOTO_LEJOS_M, FOTO_MARGEN_M, FOTO_OJO_M, poseInvalida } from "../features/misiones/foto.ts";
import type { EsferaFoto, PoseFoto } from "../features/misiones/foto.ts";
import { misiones as misionesDecl } from "../features/misiones/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const da = (mision: string) => ({ entradas: [{ nodo: "pide" }], nodos: { pide: { texto: "¿Nos ayuda?", opciones: [{ texto: "Acepto.", accion: { tipo: "dar_mision", mision } }, adios] } } });
const jefa = { formato: "pnj@1", id: "jefa", nombre: "Jefa", posicion: { x: 0, z: 0 }, dialogo: da("rincones") };
// two corners 10 and 14 m north of the origin (z = -10, z = -14), the quest asks for both, in order; a second quest wants the near one too
const RINCONES = {
  formato: "mision@1", id: "rincones", titulo: "Los rincones", descripcion: "Fotografíe los rincones.", pistas: false,
  pasos: [
    { id: "cerca", grupo: "rincones", tipo: "foto", texto: "Fotografíe la fuente", objetivo: { x: 0, y: 1, z: -10, radio: 1 }, distancia: 12 },
    { id: "lejos", grupo: "rincones", tipo: "foto", texto: "Fotografíe el arco", objetivo: { x: 6, y: 1, z: -14, radio: 1 }, distancia: 20 },
    { id: "informe", tipo: "habla_con", texto: "Informe a la jefa", pnj: "jefa" },
  ],
};
type Doc = { id: string; [campo: string]: unknown };
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = (misiones: Doc[] = [RINCONES]) => ({ misiones: ficheros("misiones", misiones), pnj: ficheros("pnj", [jefa]), cosas: [] });
const cargar = (misiones?: Doc[]): Aventura => { const r = cargarAventura(aventura(misiones)); assert.deepEqual(r.issues, []); return r.aventura; };
const quien = (r: { ok: boolean; issues?: { path: string; message: string }[] }) => (r.ok ? [] : (r.issues ?? []).map((i) => `${i.path}: ${i.message}`));

// a camera at (0, 1.6, 0) looking north (-z), 60° vertical, 16:9
const NORTE: PoseFoto = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1, fov: 60, aspecto: 16 / 9 };
const esfera = (x: number, y: number, z: number, radio = 1): EsferaFoto => ({ x, y, z, radio });

// ---------- the geometry ----------
test("geometry: in front and in the frustum ⇒ the distance; behind, outside the fov, too far, a bad pose ⇒ null / a message", () => {
  const d = enEncuadre(NORTE, esfera(0, 1.6, -10), 12)!;
  assert.ok(Math.abs(d - 10) < 1e-9, "dead ahead, 10 m");
  assert.equal(enEncuadre(NORTE, esfera(0, 1.6, 10)), null, "behind the camera");
  assert.equal(enEncuadre(NORTE, esfera(0, 1.6, -10), 9), null, "farther than the step's distancia");
  assert.equal(enEncuadre(NORTE, esfera(0, 1.6, -10)), null, `the default is ${FOTO_DISTANCIA_M} m`);
  assert.ok(enEncuadre(NORTE, esfera(0, 1.6, -5)));
  // vertical half-fov 30°: at 10 m ahead the frame reaches ±5.77 m up; 16:9 ⇒ ±10.26 m to the side
  assert.ok(enEncuadre(NORTE, esfera(0, 1.6 + 5, -10), 20));
  assert.equal(enEncuadre(NORTE, esfera(0, 1.6 + 6.5, -10), 20), null, "over the top edge");
  assert.ok(enEncuadre(NORTE, esfera(9, 1.6, -10), 20));
  assert.equal(enEncuadre(NORTE, esfera(11, 1.6, -10), 20), null, "past the side edge: the aspect counts");
  assert.equal(enEncuadre({ ...NORTE, aspecto: 0.5 }, esfera(9, 1.6, -10), 20), null, "a portrait photo sees less of the side");
  assert.equal(enEncuadre({ ...NORTE, fov: 20 }, esfera(0, 1.6 + 5, -10), 20), null, "a tighter lens misses it");
  // looking east: the right-hand side of the frame is south
  const este: PoseFoto = { ...NORTE, fx: 1, fz: 0 };
  assert.ok(enEncuadre(este, esfera(7, 1.6, 0)));
  assert.equal(enEncuadre(este, esfera(0, 1.6, -7)), null, "north is 90° off");
  // straight down, or a non-unit direction, still works
  assert.ok(enEncuadre({ ...NORTE, fx: 0, fy: -1, fz: 0 }, esfera(0, -3, 0), 20));
  assert.ok(enEncuadre({ ...NORTE, fz: -1.05 }, esfera(0, 1.6, -7)), "the length is normalised");
  assert.equal(poseInvalida(NORTE), null);
  assert.match(poseInvalida({ ...NORTE, x: NaN }) ?? "", /incompleta/);
  assert.match(poseInvalida({ ...NORTE, fz: 0 }) ?? "", /dirección/);
  assert.match(poseInvalida({ ...NORTE, fov: 170 }) ?? "", /encuadre/);
});

test("the camera's leash is pinned to the photo camera's own numbers (features/ may not import render, this test may)", () => {
  assert.equal(FOTO_ALCANCE_M, CAMARA.foto.alcance);
  assert.equal(FOTO_LEJOS_M, CAMARA.foto.lejos);
  assert.equal(FOTO_OJO_M, CAMARA.ojo);
  assert.equal(FOTO_CAMARA_MAX_M, FOTO_ALCANCE_M + FOTO_LEJOS_M + FOTO_MARGEN_M);
});

// ---------- the format ----------
test("formats: the step `foto` reads; each mistake says where and how to fix it; the enum grew at the end", () => {
  assert.equal(TIPOS_PASO.at(-1), "foto");
  assert.deepEqual(misionesDecl.issues, []);
  const A = cargar();
  const s = A.misiones.get("rincones")!.pasos[0];
  assert.ok(s.tipo === "foto" && s.objetivo.radio === 1 && s.distancia === 12);
  const sin = leerMision({ ...RINCONES, pasos: [{ id: "f", tipo: "foto", texto: "t", objetivo: { x: 1, y: 0, z: 2, radio: 2 } }] });
  assert.ok(sin.ok);
  if (sin.ok) assert.equal("distancia" in sin.value.pasos[0], false, "no distancia: the key is absent (the default is the machine's)");
  const paso = (x: object) => leerMision({ ...RINCONES, pasos: [{ id: "f", tipo: "foto", texto: "t", ...x }] });
  const buenoOb = { x: 1, y: 0, z: 2, radio: 1 };
  assert.ok(quien(paso({})).some((m) => m.startsWith("pasos[0].objetivo:") && /radio/.test(m)), "objetivo is required and the message shows an example");
  assert.ok(quien(paso({ objetivo: "aquí" })).some((m) => m.startsWith("pasos[0].objetivo:")));
  assert.ok(quien(paso({ objetivo: { x: 1, y: 0, z: 2 } })).some((m) => m.startsWith("pasos[0].objetivo.radio:")));
  assert.ok(quien(paso({ objetivo: { ...buenoOb, radio: 0 } })).some((m) => m.startsWith("pasos[0].objetivo.radio:")));
  assert.ok(quien(paso({ objetivo: { ...buenoOb, x: 1e9 } })).some((m) => m.startsWith("pasos[0].objetivo.x:")));
  assert.ok(quien(paso({ objetivo: { ...buenoOb, color: 1 } })).some((m) => m.startsWith("pasos[0].objetivo.color:") || m.startsWith("pasos[0].objetivo:")));
  assert.ok(quien(paso({ objetivo: buenoOb, distancia: 0 })).some((m) => m.startsWith("pasos[0].distancia:")));
  assert.ok(quien(paso({ objetivo: buenoOb, distancia: 61 })).some((m) => m.startsWith("pasos[0].distancia:")));
  assert.ok(quien(paso({ objetivo: buenoOb, cosas: ["a"] })).some((m) => m.startsWith("pasos[0].cosas:")), "a field of another kind of step is refused");
});

// ---------- the machine ----------
function conRincones(extra: Doc[] = []): { A: Aventura; p: Progreso } {
  const A = cargar([RINCONES, ...extra]), p = nuevoProgreso();
  assert.ok(aceptar(p, A.misiones.get("rincones")!, A, 0).ok);
  return { A, p };
}
const libre = () => false;
const mira = (x: number, z: number, hacia: "norte" | "sur" = "norte"): PoseFoto => ({ ...NORTE, x, z, fz: hacia === "norte" ? -1 : 1 });

test("machine: the photo completes a `foto` step only when the corner is in the shot; a miss counts fotos_erroneas; order is the file's", () => {
  const { A, p } = conRincones();
  assert.equal(cuentaDe(p, "rincones").fotos_erroneas ?? 0, 0);
  // looking south: nothing in the frame ⇒ one wrong photo
  let r = fotografiar(p, A, mira(0, 0, "sur"), 0, libre);
  assert.deepEqual([r.hechos.length, r.erroneas], [0, ["rincones"]]);
  assert.equal(cuentaDe(p, "rincones").fotos_erroneas, 1);
  assert.equal(p.activas.rincones.paso, 0);
  // looking north: the near corner (z -10) is in the shot; the far one (6, -14) is beyond its sight? It is 15.2 m off, step distancia 20 ⇒ also in the frame
  // but a step still blocked behind the first one is not to do yet: only the block's first step is asked
  assert.deepEqual(pasosFoto(p, A, 0).map((x) => x.paso), [0, 1], "the two foto steps are one block (no habla_con between them)");
  r = fotografiar(p, A, NORTE, 0, libre);
  assert.deepEqual(r.erroneas, []);
  assert.equal(r.hechos.length > 0, true);
  // one photo completes AT MOST ONE step of a quest: the nearest corner
  const hechos = p.activas.rincones.hechos ?? [];
  assert.equal(JSON.stringify(hechos).includes("cerca"), true);
  assert.equal(JSON.stringify(hechos).includes("lejos"), false, "the far one waits for its own photo");
  assert.equal(cuentaDe(p, "rincones").fotos_erroneas, 1, "a good photo does not count as wrong");
  // the second photo: the near step is done, so the far corner alone is asked; looking at the near corner only is a miss now
  r = fotografiar(p, A, mira(0, -2, "norte"), 0, libre); // from z -2 the far corner is 12.6 m ahead, 6 m to the side: in the shot ⇒ done
  assert.deepEqual(r.erroneas, []);
  assert.deepEqual(pasosFoto(p, A, 0), [], "both photographed; the next step talks");
  // outside a block with `foto` steps a photo does nothing at all (not even a count)
  const antes = JSON.stringify(p);
  r = fotografiar(p, A, NORTE, 0, libre);
  assert.deepEqual([r.hechos, r.erroneas], [[], []]);
  assert.equal(JSON.stringify(p), antes);
});

test("machine: a wall (tapado) hides the nearest corner and the next one in the frame takes the photo; all hidden ⇒ a wrong photo", () => {
  const { A, p } = conRincones();
  const tapaCerca = (o: EsferaFoto) => o.z === -10;
  let r = fotografiar(p, A, NORTE, 0, tapaCerca);
  assert.deepEqual(r.erroneas, []);
  assert.ok(JSON.stringify(p.activas.rincones.hechos ?? []).includes("lejos"), "the far one was the one seen");
  const { A: B, p: q } = conRincones();
  r = fotografiar(q, B, NORTE, 0, () => true);
  assert.deepEqual(r.erroneas, ["rincones"]);
  assert.equal(cuentaDe(q, "rincones").fotos_erroneas, 1);
  assert.deepEqual(pasosFoto(q, B, 0).map((x) => x.paso), [0, 1], "nothing was done");
});

test("machine: the counter survives saving, is reset by a new attempt, and a quest without a `foto` step never gets the key", () => {
  const { A, p } = conRincones();
  fotografiar(p, A, mira(0, 0, "sur"), 0, libre);
  const json = JSON.stringify(p);
  assert.ok(json.includes("fotos_erroneas"));
  const q = leerProgreso(JSON.parse(json));
  assert.equal(JSON.stringify(q), json, "reading and saving it again gives the same text");
  assert.equal(cuentaDe(q, "rincones").fotos_erroneas, 1);
  // abandon and accept again: new attempt, counters at zero
  const m = A.misiones.get("rincones")!;
  delete p.activas.rincones; // the book's own abandon is exercised in misiones.test.ts; here only the restart of the counters
  assert.ok(aceptar(p, m, A, 0).ok);
  assert.equal(cuentaDe(p, "rincones").fotos_erroneas ?? 0, 0);
  // a quest that never photographs: nothing new on disk
  const otra = { ...RINCONES, id: "charla", pasos: [{ id: "h", tipo: "habla_con", texto: "t", pnj: "jefa" }] };
  const B = cargar([RINCONES, otra]), z = nuevoProgreso();
  aceptar(z, B.misiones.get("charla")!, B, 0);
  registrar(z, B, { tipo: "foto", elegidos: [], ahora: 0 });
  fotografiar(z, B, NORTE, 0, libre);
  assert.equal(JSON.stringify(z).includes("fotos_erroneas"), false);
  assert.equal(JSON.stringify(z).includes("cuenta"), false);
});

// ---------- over the real plug ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const T0 = Date.parse("2026-10-17T12:00:00Z");
function plaza(paredes = false) {
  let reloj = T0;
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura(), reloj: () => reloj }), log: () => {}, identitySign: sign, now: () => reloj });
  if (paredes) { // a wall across z = -6, 40 m wide and 6 m tall: it hides both corners from the origin (a flat vertical quad, two triangles)
    const q = quantizeTriangles(new Float32Array([-20, 0, -6, 20, 0, -6, 20, 6, -6, -20, 0, -6, 20, 6, -6, -20, 6, -6]));
    setMesh(inst.sim, buildBvh(q));
  }
  type Pagina = { s: ClientSession; t: ReturnType<Instance["join"]>; m: ReturnType<typeof crearCliente>["misiones"] };
  const paginas: Pagina[] = [];
  const abrir = (k: Keeper = keeper()): Pagina => {
    const t = inst.join(paginas.length), cli = crearCliente();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place() {}, tag() {}, marcador() {} } });
    const p = { s, t, m: cli.misiones };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const eventos = (p: Pagina, nombre: string) => p.s.features.log.filter((e) => e.feature === "misiones" && e.event === nombre);
  const empezar = (p: Pagina) => { ir(p, 1, 0); p.m.hablar("jefa"); pump(2); p.m.elegir(1); pump(3); p.m.adios(); pump(2); };
  const pasar = (ms: number) => { reloj += ms; pump(Math.ceil(ms / 50)); }; // the clock and the sim's ticks (20 Hz) move together: the intent's own bucket (2/s, burst 3) refills
  return { inst, abrir, pump, ir, eventos, empezar, pasar };
}
const pose = (p: PoseFoto) => ({ x: p.x, y: p.y, z: p.z, fx: p.fx, fy: p.fy, fz: p.fz, fov: p.fov, aspecto: p.aspecto });

test("over the plug: the page asks only while a step photographs; the server decides; a miss is counted silently; the whole quest finishes", () => {
  const W = plaza(), a = W.abrir();
  W.pump(3);
  assert.equal(pideFoto(a.m.libro()), false, "no quest yet: no step asks for a photo (the photo chunk sends nothing)");
  W.empezar(a);
  W.ir(a, 0, 0);
  assert.equal(pideFoto(a.m.libro()), true);
  assert.equal(a.m.libro()[0].cuenta?.fotos_erroneas, 0, "a quest that photographs shows its counter, zero included");
  assert.deepEqual(a.m.libro()[0].lista.filter((s) => s.tipo === "foto").length, 2);
  // a miss (looking south)
  assert.ok(a.m.foto(pose(mira(0, 0, "sur"))).ok); W.pump(3);
  assert.equal(a.m.libro()[0].cuenta?.fotos_erroneas, 1);
  assert.equal(a.m.libro()[0].paso, 0);
  // the server does not hear a second photo inside a second
  assert.ok(a.m.foto(pose(NORTE)).ok); W.pump(3);
  assert.equal(a.m.libro()[0].lista.filter((s) => s.tipo === "foto" && s.hecho).length, 0, "too soon: looked at by nobody");
  W.pasar(1100);
  assert.ok(a.m.foto(pose(NORTE)).ok); W.pump(3);
  assert.equal(a.m.libro()[0].lista.filter((s) => s.tipo === "foto" && s.hecho).length, 1, "the near corner");
  W.pasar(1100);
  assert.ok(a.m.foto(pose(mira(0, -2))).ok); W.pump(3);
  assert.equal(pideFoto(a.m.libro()), false, "both done: the page stops sending poses");
  assert.equal(a.m.libro()[0].cuenta?.fotos_erroneas, 1);
  W.ir(a, 1, 0); a.m.hablar("jefa"); W.pump(3); a.m.adios(); W.pump(3);
  assert.equal(a.m.libro()[0].estado, "hecha");
});

test("over the plug: the camera must be near the player (the server's own copy), and a wall between the eye and the corner hides it", () => {
  const W = plaza(true), a = W.abrir();
  W.pump(3);
  W.empezar(a);
  W.ir(a, 0, 0);
  // a camera 40 m away from where the server has the player: refused, nothing counted
  W.pasar(1100);
  a.m.foto(pose(mira(0, -40, "norte"))); W.pump(3);
  assert.equal(a.m.libro()[0].cuenta?.fotos_erroneas, 0, "refused before it counts for anything");
  // the wall (z = -6) stands between the origin and the corners (z = -10, -14): a good frame, a hidden corner ⇒ a wrong photo
  W.pasar(1100);
  a.m.foto(pose(NORTE)); W.pump(3);
  assert.equal(a.m.libro()[0].cuenta?.fotos_erroneas, 1);
  assert.equal(a.m.libro()[0].lista.filter((s) => s.tipo === "foto" && s.hecho).length, 0);
  // from the other side of the wall the line is clear
  W.ir(a, 0, -8);
  W.pasar(1100);
  a.m.foto(pose(mira(0, -8))); W.pump(3);
  assert.equal(a.m.libro()[0].lista.filter((s) => s.tipo === "foto" && s.hecho).length, 1);
  assert.equal(a.m.libro()[0].cuenta?.fotos_erroneas, 1);
});

test("without the new fields nothing changes: a world with no `foto` step never sends or saves anything new", () => {
  const A = cargar([{ ...RINCONES, pasos: [{ id: "h", tipo: "habla_con", texto: "t", pnj: "jefa" }] }]);
  const p = nuevoProgreso();
  aceptar(p, A.misiones.get("rincones")!, A, 0);
  const r = fotografiar(p, A, NORTE, 0, libre);
  assert.deepEqual([r.hechos, r.erroneas], [[], []]);
  assert.equal(JSON.stringify(p).includes("fotos"), false);
});
