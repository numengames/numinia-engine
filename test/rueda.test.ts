// J7b: the movement wheel — its arithmetic (packages/client/src/rueda.ts), the closed list of moves
// (features/gestos/movimientos.ts), the clips they need in the house library, how a move plays and ends on an avatar
// (packages/render/src/avatares-politica.ts) and the moves over the wire (features/gestos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { MovimientoVista } from "../packages/feature/src/index.ts";
import { PORCIONES, ZONA_MUERTA_PX, alternarFavorito, anillos, centroDe, esToque, leerFavoritos, porcionDe, siguiente, trazoDe } from "../packages/client/src/rueda.ts";
import { ESPERA_CARGA_MS, empezarMovimiento, movimientoOcupa, pasoDeMovimiento } from "../packages/render/src/avatares-politica.ts";
import { CLIPS_DE_MOVIMIENTOS, FAVORITOS_INICIALES, GESTOS, GRUPOS, MOVIMIENTOS, PARAR, movimiento } from "../features/gestos/movimientos.ts";
import gestosServer from "../features/gestos/server.ts";
import { crearGestos } from "../features/gestos/client.ts";

test("J7b wheel: a direction picks its slice (0 at the top, clockwise); the dead zone and nonsense pick nothing", () => {
  assert.equal(PORCIONES, 8);
  assert.equal(porcionDe(0, -100), 0);    // up
  assert.equal(porcionDe(100, -100), 1);  // up-right
  assert.equal(porcionDe(100, 0), 2);     // right
  assert.equal(porcionDe(100, 100), 3);
  assert.equal(porcionDe(0, 100), 4);     // down (screen y grows down)
  assert.equal(porcionDe(-100, 100), 5);
  assert.equal(porcionDe(-100, 0), 6);    // left
  assert.equal(porcionDe(-100, -100), 7);
  // the borders: ±22.5° around each centre belongs to it
  const at = (deg: number) => porcionDe(Math.sin((deg * Math.PI) / 180) * 80, -Math.cos((deg * Math.PI) / 180) * 80);
  assert.equal(at(22), 0); assert.equal(at(23), 1); assert.equal(at(-22), 0); assert.equal(at(-23), 7); assert.equal(at(359), 0);
  assert.equal(porcionDe(5, 5), -1, "a still hand picks nothing");
  assert.equal(porcionDe(0, -(ZONA_MUERTA_PX - 1)), -1);
  assert.equal(porcionDe(0, -ZONA_MUERTA_PX), 0);
  assert.equal(porcionDe(NaN, 3), -1);
  assert.equal(porcionDe(0.3, 0, 0.5), -1, "a stick barely pushed");
  assert.equal(porcionDe(0.8, 0, 0.5), 2);
  // drawing: label centres on the circle, one closed path per slice
  assert.deepEqual(centroDe(0, 100), { x: 0, y: -100 });
  assert.deepEqual(centroDe(2, 100), { x: 100, y: 0 });
  assert.match(trazoDe(3, 200, 90, 196), /^M [\d.]+ [\d.]+ A 196 196 0 0 1 [\d. ]+ L [\d. ]+ A 90 90 0 0 0 [\d. ]+ Z$/);
});

test("J7b wheel: arrows skip empty slices and wrap; lists split into rings of eight; G tapped vs held", () => {
  const llenas = (i: number) => i !== 2 && i !== 3;
  assert.equal(siguiente(1, 1, llenas), 4);
  assert.equal(siguiente(7, 1, llenas), 0);
  assert.equal(siguiente(0, -1, llenas), 7);
  assert.equal(siguiente(-1, 1, llenas), 0, "nothing marked: the first");
  assert.equal(siguiente(-1, -1, llenas), 7, "nothing marked, backwards: the last");
  assert.equal(siguiente(0, 1, () => false), -1);
  const r = anillos([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(r.length, 2);
  assert.deepEqual(r[1], [9, 10, null, null, null, null, null, null]);
  assert.equal(esToque(1000, 1150), true);
  assert.equal(esToque(1000, 1300), false);
});

test("J7b favourites: what is saved is checked (unknown, repeated, broken → empty or the defaults), put in and taken out", () => {
  const ids = ["a", "b", "c", "d"];
  assert.deepEqual(leerFavoritos(null, ids, ["a", "b"]), ["a", "b", null, null, null, null, null, null]);
  assert.deepEqual(leerFavoritos("{roto", ids, ["a"]), ["a", null, null, null, null, null, null, null]);
  assert.deepEqual(leerFavoritos("\"a\"", ids, ["b"]), ["b", null, null, null, null, null, null, null]);
  assert.deepEqual(leerFavoritos(JSON.stringify(["c", "volar", "c", null, 7, "a"]), ids, ["a"]), ["c", null, null, null, null, "a", null, null]);
  assert.equal(leerFavoritos(JSON.stringify(Array(20).fill("a")), ids, []).length, 8, "never more than eight");
  let f = leerFavoritos(null, ids, ["a"]);
  let r = alternarFavorito(f, "b");
  assert.deepEqual([r.puesto, r.favs[1]], [true, "b"]);
  r = alternarFavorito(r.favs, "a");
  assert.deepEqual([r.puesto, r.favs[0]], [false, null]);
  f = ["a", "b", "c", "d", "a", "b", "c", "d"];
  assert.equal(alternarFavorito(f, "x").lleno, true);
  // the real list: the defaults are eight real moves
  assert.deepEqual(leerFavoritos(null, GESTOS, FAVORITOS_INICIALES), [...FAVORITOS_INICIALES]);
  assert.equal(FAVORITOS_INICIALES.length, 8);
});

test("J7b the moves: unique ids, at most eight a group, every clip in the house library (CC0, by sha256), « parar » last", () => {
  const ids = MOVIMIENTOS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 25, `${ids.length} moves`);
  assert.deepEqual(GESTOS, [...ids, PARAR]);
  for (const g of GRUPOS) { const n = MOVIMIENTOS.filter((m) => m.grupo === g.id).length; assert.ok(n >= 1 && n <= 8, `${g.id}: ${n}`); }
  for (const m of MOVIMIENTOS) {
    assert.match(m.id, /^[a-z][a-z-]{1,23}$/);
    assert.ok(m.nombre && m.describe && m.etiqueta, m.id);
    assert.ok(m.clips.length >= 1 && m.hastaS > 0, m.id);
    assert.ok(["una", "bucle", "quedarse"].includes(m.modo), m.id);
  }
  const cat = JSON.parse(readFileSync("activos/avatares/catalogo.json", "utf8"));
  const lic = readFileSync("activos/animaciones/LICENCIAS.md", "utf8");
  for (const c of CLIPS_DE_MOVIMIENTOS) {
    const a = cat.animaciones[c];
    assert.ok(a, `${c} missing from catalogo.json — rerun tools/vrma/convertir.mjs and node tools/avatares-catalogo.ts`);
    assert.ok(existsSync(a.fichero) && a.duracion > 0, c);
    assert.ok(a.bytes < 300_000, `${c}: ${a.bytes} bytes (a move is fetched when someone plays it: keep it small)`);
    assert.ok(lic.includes(`\`${c}.vrma\``), `LICENCIAS.md must list ${c}.vrma`);
  }
  // nothing in the library that no one plays (bytes in the repo and the image for nothing)
  const usados = new Set([...CLIPS_DE_MOVIMIENTOS, "quieto", "andar", "trotar", "correr", "saltar"]);
  assert.deepEqual(Object.keys(cat.animaciones).filter((c) => !usados.has(c)), []);
});

const M = (o: Partial<MovimientoVista> = {}): MovimientoVista => ({ id: "x", clips: ["a"], modo: "una", hastaS: 30, viva: true, ...o });
const DUR: Record<string, number> = { a: 1, entra: 0.5, sigue: 2 };
const dur = (c: string) => DUR[c];

test("J7b on an avatar: waits for its files, plays the lead-in then the loop, ends by itself, by walking or by time", () => {
  const todo = () => true;
  let e = empezarMovimiento(M({ clips: ["entra", "sigue"], modo: "bucle", hastaS: 60, viva: false }), 0);
  assert.deepEqual(pasoDeMovimiento(e, 100, "quieto", dur, () => false), { fin: false, esperar: true }, "files still coming");
  let p = pasoDeMovimiento(e, 200, "quieto", dur, todo);
  assert.equal(e.desde, 200, "the clock starts when the files are there");
  assert.ok(!p.fin && !p.esperar && p.clip === "entra" && !p.bucle && p.tramo === 0);
  p = pasoDeMovimiento(e, 200 + 600, "quieto", dur, todo);
  assert.ok(!p.fin && !p.esperar && p.clip === "sigue" && p.bucle && p.tramo === 1);
  assert.equal(movimientoOcupa(e, 200 + 600, dur), true, "the lead-in keeps drawing");
  assert.equal(movimientoOcupa(e, 200 + 2000, dur), false, "a calm loop draws at the idle rate (cold phones)");
  assert.ok(!pasoDeMovimiento(e, 200 + 59_000, "quieto", dur, todo).fin);
  assert.ok(pasoDeMovimiento(e, 200 + 61_000, "quieto", dur, todo).fin, "a loop nobody stops ends");
  e = empezarMovimiento(M({ clips: ["entra", "sigue"], modo: "bucle" }), 0);
  assert.ok(pasoDeMovimiento(e, 300, "andar", dur, todo).fin, "walking ends it");
  assert.ok(pasoDeMovimiento(e, 300, "saltar", dur, todo).fin, "jumping too");
  // once, then over; held: the last pose stays until time runs out
  e = empezarMovimiento(M(), 0);
  assert.ok(!pasoDeMovimiento(e, 0, "quieto", dur, todo).fin);
  assert.ok(!pasoDeMovimiento(e, 900, "quieto", dur, todo).fin);
  assert.ok(pasoDeMovimiento(e, 1100, "quieto", dur, todo).fin);
  e = empezarMovimiento(M({ modo: "quedarse", hastaS: 300, viva: false }), 0);
  p = pasoDeMovimiento(e, 0, "quieto", dur, todo);
  p = pasoDeMovimiento(e, 5000, "quieto", dur, todo);
  assert.ok(!p.fin && !p.esperar && p.clip === "a" && !p.bucle && p.mantener);
  // files that never come: dropped, never frozen
  e = empezarMovimiento(M(), 0);
  assert.ok(pasoDeMovimiento(e, ESPERA_CARGA_MS + 1, "quieto", dur, () => false).fin);
  // each start is a new series (the same move picked again restarts it)
  assert.notEqual(empezarMovimiento(M(), 0).serie, empezarMovimiento(M(), 0).serie);
});

function world(n: number) {
  const inst = new Instance({ seed: 3, capacity: 8, k: 50, snapshotEvery: 2, features: [gestosServer], log: () => {} });
  const clients = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i);
    const seen: string[] = [];
    const g = crearGestos(() => 0);
    const vrm = new Set<number>();
    const s = new ClientSession(t, { features: [g.part], view: {
      label: (e, text) => seen.push(`label ${e} ${text}`), bounce: (e) => seen.push(`bounce ${e}`),
      movimiento: (e, m) => { seen.push(`mov ${e} ${m?.id ?? "parar"}`); return vrm.has(e); },
    } });
    return { t, s, g: g.gestos, seen, vrm };
  });
  const pump = (ticks = 1) => { for (let k = 0; k < ticks; k++) { for (const c of clients) c.t.flush(); inst.tick(); for (const c of clients) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, clients, pump, place };
}

test("J7b over the wire: a move reaches whoever is within 30 m; a VRM plays it, a capsule gets a label; « parar »; the list is closed", () => {
  const W = world(3);
  const [A, B, C] = W.clients;
  W.pump(); W.place(A.s.entity, 0, 0); W.place(B.s.entity, 12, 0); W.place(C.s.entity, 90, 0);
  B.vrm.add(A.s.entity); // B draws A as a VRM; A draws itself as a capsule (no catalog in this test)
  assert.equal(A.g.hacer("sentarse").ok, true);
  W.pump(2);
  assert.ok(B.seen.includes(`mov ${A.s.entity} sentarse`));
  assert.ok(!B.seen.some((l) => l.startsWith("label")), "B plays it: no label");
  assert.ok(A.seen.includes(`label ${A.s.entity} Sentarse`), "no VRM: the label");
  assert.deepEqual(C.seen, [], "90 m away: nothing");
  assert.equal(B.g.deQuien(A.s.entity), "sentarse");
  // the page's own pace says «wait» before the server drops it (1 a second, 3 in a burst; this clock stands still)
  assert.equal(A.g.hacer("parar").ok, true);
  assert.equal(A.g.hacer("bailar").ok, true);
  const r = A.g.hacer("bailar");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.why, /Espera/);
  W.pump(2);
  assert.ok(B.seen.includes(`mov ${A.s.entity} parar`));
  assert.ok(A.seen.includes(`bounce ${A.s.entity}`), "a dance hops on a capsule");
  assert.equal(B.g.deQuien(A.s.entity), "bailar");
  // closed list: the page refuses, and so does the server (an old or hand-made client)
  const no = B.g.hacer("volar");
  assert.equal(no.ok, false);
  assert.equal(B.s.features.send("gestos", "hacer", { gesto: "volar" }).ok, false);
  assert.equal(movimiento("volar"), undefined);
});
