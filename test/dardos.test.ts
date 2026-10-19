// dardos v1: a turn of three darts, headless (in-memory world, pages pumped by 20 Hz ticks). The page sends where it
// aimed and how hard; the server bends the throw (drop, climb, scatter, a tick-hashed tremor) and scores it. Bare pages
// use `features.send` straight (the path a rogue client would take); one test uses the real client part.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { leerMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import { dardos, FUERZA_IDEAL, TURNO_INACTIVO_S } from "../features/dardos/feature.ts";
import { crearDardos, sectorDe, resolverTiro, polar, aterrizaje, azarDe, textoDe, rumboHaciaElCentro, ANILLOS, SECTORES, HZ, TEMBLOR, SITIOS_DEFECTO } from "../features/dardos/server.ts";
import { crearCliente } from "../features/dardos/client.ts";
import { ANILLOS_DIANA, SECTORES_DIANA, caraAPixel, pixelACara } from "../packages/render/src/diana.ts";
import { rayoEnCara, potenciaDe } from "../packages/render/src/dardos.ts";
import * as THREE from "three/webgpu";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const SITIO = { id: "diana", nombre: "Diana", x: 10, z: 0, y: 0, radio: 3 };
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

function mundo(n = 2, opts: { sinDardos?: boolean; cliente?: boolean } = {}) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: opts.sinDardos ? [] : [crearDardos({ sitios: [SITIO] })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), k = keeper();
    const cli = opts.cliente ? crearCliente() : null;
    const s = new ClientSession(t, { identity: k, ...(cli ? { features: cli.parts } : {}) });
    s.features.tap((feature, event, msg) => { if (feature === "dardos") eventos.push({ event, msg }); });
    return { t, s, eventos, k, cli };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((x) => x.event === ev).map((x) => x.msg);
  const lanzar = (c: (typeof pages)[number], x = 0, y = 0, fuerza = FUERZA_IDEAL, sitio = "diana") => c.s.features.send("dardos", "lanzar", { sitio, x, y, fuerza });
  const jugar = (c: (typeof pages)[number], sitio = "diana") => c.s.features.send("dardos", "jugar", { sitio });
  const salir = (c: (typeof pages)[number]) => c.s.features.send("dardos", "salir", {});
  return { inst, pages, pump, place, evs, lanzar, jugar, salir, log };
}

test("dardos: the declaration meets the plug's rules, is in both lists, and the painter uses the scorer's numbers", () => {
  assert.deepEqual(dardos.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "dardos"));
  assert.ok(paginas.some((f) => f.feature.id === "dardos"));
  assert.equal(new Set(SECTORES).size, 20);
  assert.deepEqual({ ...ANILLOS }, { ...ANILLOS_DIANA }, "packages/render/src/diana.ts paints the same rings the server scores");
  assert.deepEqual([...SECTORES], [...SECTORES_DIANA]);
  const [px, py] = caraAPixel(0.3, -0.5, 512); const [x, y] = pixelACara(px, py, 512);
  assert.ok(Math.abs(x - 0.3) < 1e-9 && Math.abs(y + 0.5) < 1e-9, "face ↔ pixel round trip");
});

test("sectorDe / resolverTiro: every sector at its centre and edge, every ring boundary", () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(sectorDe(i * 18), SECTORES[i]);
    assert.equal(sectorDe(i * 18 + 8.99), SECTORES[i]);
    assert.equal(sectorDe(i * 18 + 9), SECTORES[(i + 1) % 20]);
  }
  assert.deepEqual(resolverTiro(0, 0), { sector: 0, anillo: "dobleBull", multiplicador: 1, puntos: 50 });
  assert.deepEqual(resolverTiro(0, ANILLOS.dobleBull + 0.0001), { sector: 0, anillo: "bull", multiplicador: 1, puntos: 25 });
  assert.deepEqual(resolverTiro(0, ANILLOS.tripleIn), { sector: 20, anillo: "triple", multiplicador: 3, puntos: 60 });
  assert.deepEqual(resolverTiro(0, ANILLOS.tripleOut + 0.001), { sector: 20, anillo: "simple", multiplicador: 1, puntos: 20 });
  assert.deepEqual(resolverTiro(0, ANILLOS.dobleIn), { sector: 20, anillo: "doble", multiplicador: 2, puntos: 40 });
  assert.deepEqual(resolverTiro(0, ANILLOS.dobleOut + 0.0001), { sector: 20, anillo: "fuera", multiplicador: 0, puntos: 0 });
});

test("polar / aterrizaje / textoDe: the face's geometry and how a throw is bent", () => {
  assert.deepEqual(polar(0, 1), { angulo: 0, radio: 1 });          // straight up: sector 20
  assert.equal(Math.round(polar(1, 0).angulo), 90);                 // right: sector 6
  assert.equal(sectorDe(polar(1, 0).angulo), 6);
  assert.equal(sectorDe(polar(0, -1).angulo), 3);                   // down: sector 3
  assert.equal(sectorDe(polar(-1, 0).angulo), 11);                  // left: sector 11
  // the ideal strength with no tremor lands exactly where you aimed
  assert.deepEqual(aterrizaje(0.2, 0.6, FUERZA_IDEAL, [0, 0]), { x: 0.2, y: 0.6 });
  // weak drops (a lot), hard climbs (a little)
  assert.ok(aterrizaje(0, 0, 0.2, [0, 0]).y < -0.6);
  const fuerte = aterrizaje(0, 0, 1, [0.25, 0]).y; assert.ok(fuerte > 0.15 && fuerte < 0.3);
  // at the ideal strength the tremor never moves a dart more than TEMBLOR
  for (let t = 0; t < 400; t++) { const p = aterrizaje(0, 0, FUERZA_IDEAL, azarDe(t, 3, 1, 7)); assert.ok(Math.hypot(p.x, p.y) <= TEMBLOR + 0.001); }
  // and it is spread: aiming at the eye with a perfect throw is NOT 50 every time, but a bull (25+) almost always
  let eye = 0, bull = 0; for (let t = 0; t < 400; t++) { const p = aterrizaje(0, 0, FUERZA_IDEAL, azarDe(t, 3, 1, 7)); const r = Math.hypot(p.x, p.y); if (r <= ANILLOS.dobleBull) eye++; if (r <= ANILLOS.bull) bull++; }
  assert.ok(eye > 40 && eye < 200, `diana ${eye}/400`); assert.equal(bull, 400);
  assert.deepEqual(azarDe(5, 6, 7), azarDe(5, 6, 7)); assert.notDeepEqual(azarDe(5, 6, 7), azarDe(6, 6, 7));
  assert.equal(textoDe({ sector: 20, anillo: "triple", puntos: 60 }), "Triple 20 · 60");
  assert.equal(textoDe({ sector: 0, anillo: "dobleBull", puntos: 50 }), "¡Diana! · 50");
  assert.equal(Math.round(rumboHaciaElCentro(SITIOS_DEFECTO[0].x, SITIOS_DEFECTO[0].z)), 132, "the house board faces the plaza");
});

test("dardos: a full turn — three `lanzar`, three `dardo` (also to whoever is near), `fin`, the scoreboard grows, the board frees", () => {
  const W = mundo(2);
  const [A, B] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 12, 2); W.pump(12);
  assert.ok(A.s.who && B.s.who);
  assert.deepEqual(W.evs(A, "marcador").at(-1), { dardos: 0, puntos: 0, mejorDardo: 0, mejorTirada: 0, dianas: 0 });
  assert.equal(W.jugar(A).ok, true); W.pump(2);
  assert.equal(W.evs(A, "turno").length, 1);
  assert.equal(A.s.features.stateOf("dardos").get("diana")?.ocupado, true);
  for (let n = 1; n <= 3; n++) { assert.equal(W.lanzar(A, 0, 0.605).ok, true); W.pump(3); } // aim: treble 20
  const ds = W.evs(A, "dardo");
  assert.equal(ds.length, 3);
  let suma = 0;
  for (const [i, d] of ds.entries()) {
    assert.equal(d.numero, i + 1);
    const p = polar(Number(d.x), Number(d.y)), r = resolverTiro(p.angulo, p.radio); // the score is the landing's
    assert.equal(d.puntos, r.puntos); assert.equal(d.anillo, r.anillo);
    assert.ok(Math.hypot(Number(d.x), Number(d.y) - 0.605) <= TEMBLOR + 0.01, "a perfect throw lands within the tremor");
    suma += Number(d.puntos); assert.equal(d.tirada, suma);
  }
  assert.deepEqual(W.evs(A, "fin").at(-1), { quien: A.s.entity, sitio: "diana", dardos: 3, puntos: suma });
  assert.equal(W.evs(B, "dardo").length, 3, "whoever is near sees the darts land");
  assert.equal(W.evs(B, "fin").length, 1, "…and the turn end (to take them out of the board)");
  assert.equal(W.evs(B, "turno").length, 0);
  const m = W.evs(A, "marcador").at(-1)!;
  assert.deepEqual(m, { dardos: 3, puntos: suma, mejorDardo: Math.max(...ds.map((d) => Number(d.puntos))), mejorTirada: suma, dianas: ds.filter((d) => d.anillo === "dobleBull").length });
  assert.equal(A.s.features.stateOf("dardos").get("diana")?.ocupado, false);
  // a `lanzar` without `jugar` starts the next turn on its own
  W.lanzar(A, 0, 0, 0.1); W.pump(2);
  assert.equal(W.evs(A, "turno").length, 2);
  assert.ok(Number(W.evs(A, "dardo").at(-1)!.y) < -0.6, "a weak throw drops");
});

test("dardos: rejections — far away, unknown board, someone else's turn; `salir` keeps what was thrown", () => {
  const W = mundo(2);
  const [A, B] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 40, 0); W.pump(2);
  W.lanzar(B); W.pump();
  assert.match(String(W.evs(B, "rechazado").at(-1)?.motivo), /Acércate/);
  W.jugar(B, "no-existe"); W.pump();
  assert.match(String(W.evs(B, "rechazado").at(-1)?.motivo), /No hay ninguna diana/);
  W.lanzar(A); W.pump();
  W.place(B.s.entity, 9, 1); W.pump(2);
  W.jugar(B); W.pump();
  assert.match(String(W.evs(B, "rechazado").at(-1)?.motivo), /ya tira alguien/);
  W.salir(A); W.pump();
  assert.deepEqual(W.evs(A, "fin").at(-1), { quien: A.s.entity, sitio: "diana", dardos: 1, puntos: Number(W.evs(A, "dardo")[0].puntos) });
  W.salir(A); W.pump();
  assert.match(String(W.evs(A, "rechazado").at(-1)?.motivo), /No estás tirando/);
  W.jugar(B); W.pump();
  assert.equal(W.evs(B, "turno").length, 1, "the board is free once A left");
});

test("dardos: walking away, leaving and a minute idle all close the turn", () => {
  { const W = mundo(1); const [A] = W.pages; W.pump(2); W.place(A.s.entity, 8, 0); W.pump(2); W.jugar(A); W.pump(); W.place(A.s.entity, 60, 0); W.pump(12); assert.equal(W.evs(A, "fin").length, 1); }
  { const W = mundo(2); const [A, B] = W.pages; W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 9, 1); W.pump(2); W.jugar(A); W.pump(); W.inst.disconnect(A.s.entity); W.pump(); assert.equal(B.s.features.stateOf("dardos").get("diana")?.ocupado, false); }
  { const W = mundo(1); const [A] = W.pages; W.pump(2); W.place(A.s.entity, 8, 0); W.pump(2); W.jugar(A); W.pump(); W.pump(TURNO_INACTIVO_S * HZ - 20); assert.equal(W.evs(A, "fin").length, 0); W.pump(40); assert.equal(W.evs(A, "fin").length, 1); }
});

test("dardos: deterministic — the same throws on the same ticks land on the same spots in two worlds", () => {
  const run = () => { const W = mundo(1); const [A] = W.pages; W.pump(2); W.place(A.s.entity, 8, 0); W.pump(4); for (const [x, y, f] of [[0, 0, 0.65], [0.3, 0.4, 0.8], [-0.5, 0.1, 0.5]]) { W.lanzar(A, x, y, f); W.pump(5); } return W.evs(A, "dardo").map((d) => [d.x, d.y, d.puntos]); };
  assert.deepEqual(run(), run());
});

test("dardos: the page's controller follows the turn and the darts in the board (and takes other people's out at their `fin`)", () => {
  const W = mundo(2, { cliente: true });
  const [A, B] = W.pages;
  W.pump(2); W.place(A.s.entity, 8, 0); W.place(B.s.entity, 11, 1); W.pump(12);
  const a = A.cli!.dardos, b = B.cli!.dardos;
  assert.equal(a.sitios()[0]?.id, "diana"); assert.equal(a.sitios()[0]?.rumbo, rumboHaciaElCentro(10, 0));
  assert.equal(a.ofrece("dardos", "diana"), true);
  assert.equal(a.jugar().ok, true); W.pump(2);
  assert.equal(a.tirando(), true); assert.equal(a.ofrece("dardos", "diana"), false);
  a.lanzar(0, 0, 0.65); W.pump(3); a.lanzar(0.1, 0.2, 0.7); W.pump(3);
  assert.equal(a.estado().dardos, 2); assert.equal(a.clavados("diana").length, 2); assert.equal(b.clavados("diana").length, 2);
  assert.equal(a.estado().tirada, a.clavados().reduce((s, d) => s + d.puntos, 0));
  a.lanzar(-0.2, 0.1, 0.6); W.pump(3);
  assert.equal(a.tirando(), false); assert.equal(a.estado().fin?.dardos, 3); assert.equal(a.estado().marcador.dardos, 3);
  assert.equal(b.clavados().length, 0, "B takes A's darts out when A's turn ends");
  assert.equal(a.clavados().length, 3, "A still sees its own for a few seconds");
});

test("dardos: the simulation never notices (same fingerprint with or without the feature running)", () => {
  const W = mundo(2), plain = mundo(2, { sinDardos: true });
  W.pump(2); plain.pump(2);
  W.place(W.pages[0].s.entity, 8, 0); plain.place(0, 8, 0);
  W.pump(12); plain.pump(12);
  W.lanzar(W.pages[0]); W.pump(); plain.pump();
  assert.equal(W.evs(W.pages[0], "dardo").length, 1);
  assert.equal(W.inst.hash(), plain.inst.hash());
});

test("MUNDO_DIR: dardos.json with valid JSON but no `sitios` array logs why and keeps the house board; a good one is used", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-dardos-"));
  writeFileSync(join(dir, "dardos.json"), JSON.stringify({ spots: ["mal escrito"] }));
  const log: string[] = [];
  const partes = conMundo(funciones, leerMundo(dir, (l) => log.push(l)), (l) => log.push(l));
  assert.match(log.join(" "), /dardos\.json no tiene una lista "sitios"/);
  assert.equal(partes.find((p) => p.feature.id === "dardos"), funciones.find((p) => p.feature.id === "dardos"));
  writeFileSync(join(dir, "dardos.json"), JSON.stringify({ sitios: [{ id: "taberna", nombre: "Diana de la taberna", x: 3, z: 4, rumbo: 90 }] }));
  const otras = conMundo(funciones, leerMundo(dir, () => {}), () => {});
  assert.notEqual(otras.find((p) => p.feature.id === "dardos"), funciones.find((p) => p.feature.id === "dardos"));
});

// ---- VR (motor-vr t_5f6ff048): darts had no controller/hand throw in immersive-vr (only PC, phone and AR) — a
// trigger near the board opened the turn (via the generic interact) and then nothing threw a dart. `rayoEnCara`
// (the plaza board's ray math, shared with the AR wall) and `dardos-vr.ts` (a physical throw with the hand; see
// test/dardos-vr.test.ts) now cover it. ----

test("rayoEnCara: a ray straight at the face's centre lands at (0, 0); offset rays scale by the board's real radius", () => {
  const cara = new THREE.Matrix4(); // identity: the face's own space is the world here
  assert.deepEqual(rayoEnCara(cara.clone().invert(), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)), { x: 0, y: 0 });
  // RADIO_M (packages/render/src/diana.ts) = 0.17 m: a ray 0.17 m to the right of the centre lands at x = 1 (the double's outer edge)
  const p = rayoEnCara(cara.clone().invert(), new THREE.Vector3(0.17, 0, 1), new THREE.Vector3(0, 0, -1))!;
  assert.ok(Math.abs(p.x - 1) < 1e-6 && p.y === 0, JSON.stringify(p));
  // a wild throw clamps to the board's [-3, 3] radii (client.lanzar clamps the same way): never "too far"
  const lejos = rayoEnCara(cara.clone().invert(), new THREE.Vector3(5, 0, 1), new THREE.Vector3(0, 0, -1))!;
  assert.equal(lejos.x, 3);
  // parallel to the face, or pointing away from it: no throw (null), not a wrong one
  assert.equal(rayoEnCara(cara.clone().invert(), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)), null);
  assert.equal(rayoEnCara(cara.clone().invert(), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)), null);
});
