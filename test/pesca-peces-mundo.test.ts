// pesca: a world brings its OWN fish in pesca.json (`peces`). It REPLACES the house table (features/pesca/peces.json) for that
// world; the name and the colour reach the page (captura / fin → «¡Pescado!», the label, the fish in the hand); a pesca.json
// without `peces` behaves as always; a wrong `peces` refuses the whole file with a message (the house pond and fish stay).
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
import { crearPesca, HZ } from "../features/pesca/server.ts";
import { crearCliente } from "../features/pesca/client.ts";
import { leerPeces, ESQUEMA, LUCHA_POR_RAREZA, PECES_MAX, NOMBRE_MAX } from "../features/pesca/esquema.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import tabla from "../features/pesca/peces.json" with { type: "json" };

const CASA = (tabla as { peces: { nombre: string }[] }).peces.map((p) => p.nombre);
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper & { token: string | null } => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
const LAGO = { id: "lago", nombre: "Lago", x: 10, y: 0, z: 0, radio: 3 };
// two common fish (the sensible angler of these tests lands a common one in 8-25 s), each with its brand colour
const MERLIN = { id: "pez-merlin", nombre: "Pez Merlín", rareza: "comun", peso: 1, cm: [30, 50], color: "#3758e9" };
const RAMA = { id: "rama-legal", nombre: "Rama Legal", rareza: "comun", peso: 1, cm: [25, 45], color: "#2E7D32" };
const DEL_MUNDO = [MERLIN.nombre, RAMA.nombre];
const FICHA = (peces: unknown, resto: Record<string, unknown> = {}) => ({ schema: ESQUEMA, sitios: [LAGO], peces, ...resto });

/** A directory with a pesca.json, read the way the server reads a world (`leerMundo`), and the pesca part `conMundo` builds from it. */
function delMundo(pesca: unknown) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "mundo-peces-"));
  if (pesca !== undefined) writeFileSync(join(dir, "pesca.json"), JSON.stringify(pesca));
  const log: string[] = [], leer = leerMundo(dir, (l) => log.push(l));
  const parte = conMundo(funciones, leer, (l) => log.push(l)).find((p) => p.feature.id === "pesca")!;
  return { parte, log, casa: funciones.find((p) => p.feature.id === "pesca")! };
}

/** A headless pond with the given pesca part and one angler (A) plus a neighbour (B) a few metres away. */
function estanque(parte: ReturnType<typeof crearPesca>, x = 8) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [parte], log: () => {}, identitySign: sign });
  const pages = [0, 1].map((i) => {
    const eventos: { event: string; msg: Record<string, unknown> }[] = [];
    const t = inst.join(i), cli = crearCliente((event, msg) => eventos.push({ event, msg })), k = keeper();
    const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {} } });
    return { t, s, p: cli.pesca, eventos };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, px: number, pz: number) => { inst.sim.tf.cols.x[e] = fx(px); inst.sim.tf.cols.z[e] = fx(pz); };
  const evs = (c: (typeof pages)[number], ev: string) => c.eventos.filter((e) => e.event === ev).map((e) => e.msg);
  pump(2); place(pages[0].s.entity, x, 0); place(pages[1].s.entity, x + 4, 2); pump(12);
  const hasta = (fase: string, max: number) => { let n = 0; while (pages[0].p.estado().fase !== fase && n < max) { pump(); n++; } return n; };
  return { inst, pages, pump, evs, hasta };
}
type Estanque = ReturnType<typeof estanque>;
/** Cast, hook and fight like a sensible angler until the cycle ends. */
function pescar(W: Estanque) {
  const A = W.pages[0];
  A.p.lanzar(); W.pump(); W.hasta("picada", 300); W.pump(4);
  A.p.recoger(true);
  let n = 0;
  while (A.p.estado().fase !== "nada" && n++ < 60 * HZ) {
    const e = A.p.estado();
    if (e.fase === "pelea") { if (e.tension > 65 && e.recogiendo) A.p.recoger(false); else if (e.tension < 35 && !e.recogiendo) A.p.recoger(true); }
    W.pump();
  }
}

test("pesca peces: a valid list is read into the engine's shape; what a fish does not say it gets from the house fish of its rarity; colours are upper-cased", () => {
  const r = leerPeces(FICHA([MERLIN, { id: "trucha-x", nombre: "Trucha X", rareza: "rara", peso: 3, cm: [20, 40], fuerza: 1.1, aguante: 9, arrancadas: [2, 3] }, { id: "lucio-x", nombre: "Lucio X", rareza: "legendaria", peso: 0.5, cm: [50, 90] }]));
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  const [a, b, c] = r.ok ? r.value : [];
  assert.deepEqual(a, { id: "pez-merlin", nombre: "Pez Merlín", rareza: "comun", peso: 1, cm: [30, 50], color: "#3758E9", ...LUCHA_POR_RAREZA.comun });
  assert.deepEqual([b.fuerza, b.aguante, b.arrancadas, b.heft], [1.1, 9, [2, 3], LUCHA_POR_RAREZA.rara.heft], "its own numbers win, the rest comes from the rare house fish");
  assert.deepEqual([c.fuerza, c.heft, c.aguante, c.arrancadas], [LUCHA_POR_RAREZA.legendaria.fuerza, LUCHA_POR_RAREZA.legendaria.heft, LUCHA_POR_RAREZA.legendaria.aguante, LUCHA_POR_RAREZA.legendaria.arrancadas]);
  assert.equal("color" in c, false, "no colour said = none carried (the page uses its own)");
  // the house table itself reads back unchanged: same shape in both
  const casa = leerPeces({ peces: (tabla as { peces: unknown[] }).peces });
  assert.ok(casa.ok && casa.value.length === 3 && casa.value.every((p, i) => p.id === (tabla as { peces: { id: string }[] }).peces[i].id));
});

test("pesca peces: a wrong list is refused with a Spanish message that says where and how to fix it (unknown keys, caps, names, ids, numbers)", () => {
  const largo = "Pez ".repeat(9).trim(); // 35 characters
  const casos: [string, unknown, RegExp][] = [
    ["clave desconocida en un pez", FICHA([{ ...MERLIN, brillo: 3 }]), /pesca\.peces\[0\]\.brillo: clave desconocida/],
    ["clave desconocida en el fichero", FICHA([MERLIN], { extra: "x" }), /pesca\.extra: clave desconocida/],
    ["notas que no es texto", FICHA([MERLIN], { notas: 3 }), /pesca\.notas: un texto/],
    ["schema ajeno", FICHA([MERLIN], { schema: "numinia-engine/otra@1" }), /pesca\.schema: debe ser "numinia-engine\/pesca@1"/],
    ["no es una lista", FICHA("carpa"), /pesca\.peces: una lista de peces/],
    ["lista vacía", FICHA([]), /pesca\.peces: la lista está vacía/],
    [`más de ${PECES_MAX}`, FICHA(Array.from({ length: PECES_MAX + 1 }, (_, i) => ({ ...MERLIN, id: `p${i}` }))), /como mucho 40 peces \(hay 41\)/],
    ["un pez que no es objeto", FICHA([7]), /pesca\.peces\[0\]: un objeto/],
    [`nombre de más de ${NOMBRE_MAX} caracteres`, FICHA([{ ...MERLIN, nombre: largo }]), /pesca\.peces\[0\]\.nombre: como mucho 32 caracteres \(tiene 35\)/],
    ["nombre de más de 40 bytes", FICHA([{ ...MERLIN, nombre: "ñ".repeat(21) }]), /nombre: ocupa más de 40 bytes/],
    ["nombre vacío", FICHA([{ ...MERLIN, nombre: "  " }]), /nombre: el nombre que ve/],
    ["id con mayúsculas", FICHA([{ ...MERLIN, id: "Pez Merlín" }]), /id: de 1 a 32 caracteres/],
    ["id repetido", FICHA([MERLIN, { ...RAMA, id: MERLIN.id }]), /peces\[1\]\.id: «pez-merlin» está repetido/],
    ["rareza ajena", FICHA([{ ...MERLIN, rareza: "epica" }]), /rareza: una de: comun, rara, legendaria/],
    ["peso cero", FICHA([{ ...MERLIN, peso: 0 }]), /peso: un número entre/],
    ["cm al revés", FICHA([{ ...MERLIN, cm: [50, 30] }]), /cm: \[mínimo, máximo\]/],
    ["cm sin máximo", FICHA([{ ...MERLIN, cm: [30] }]), /cm: \[mínimo, máximo\]/],
    ["color sin almohadilla", FICHA([{ ...MERLIN, color: "3758E9" }]), /color: un color en hexadecimal/],
    ["fuerza fuera de rango", FICHA([{ ...MERLIN, fuerza: 9 }]), /fuerza: un número entre/],
    ["aguante en texto", FICHA([{ ...MERLIN, aguante: "mucho" }]), /aguante: segundos/],
    ["arrancadas al revés", FICHA([{ ...MERLIN, arrancadas: [6, 2] }]), /arrancadas: \[mínimo, máximo\]/],
  ];
  for (const [que, ficha, esperado] of casos) {
    const r = leerPeces(ficha);
    assert.equal(r.ok, false, `${que}: debe rechazarse`);
    assert.match(!r.ok ? r.issues.map((i) => `${i.path}: ${i.message}`).join("; ") : "", esperado, que);
  }
  assert.equal(leerPeces([1, 2]).ok, false, "el fichero no es un objeto");
  assert.ok(leerPeces(FICHA([MERLIN], { notas: "Un estanque en la plaza." })).ok, "`notas` (un texto para quien edite) se admite y no se lee");
  // exactly at the caps is fine
  const justo = leerPeces(FICHA(Array.from({ length: PECES_MAX }, (_, i) => ({ ...MERLIN, id: `p${i}`, nombre: "x".repeat(NOMBRE_MAX) }))));
  assert.ok(justo.ok && justo.value.length === PECES_MAX, "40 peces de 32 caracteres caben");
});

test("pesca peces: through MUNDO_DIR the world's fish replace the house table — only the world's names come out of the water, with their colour", () => {
  const { parte, log, casa } = delMundo(FICHA([MERLIN, RAMA]));
  assert.deepEqual(log, [], "a valid file is read quietly");
  assert.notEqual(parte, casa, "the world's own pesca part, not the house one");
  const W = estanque(parte as ReturnType<typeof crearPesca>);
  const [A, B] = W.pages;
  assert.equal(A.p.sitios()[0]?.id, "lago", "the file's spot is still used");
  // sample the table: hook many fish and let each go (the name arrives with `pelea`)
  const vistos = new Set<string>();
  for (let i = 0; i < 12; i++) {
    A.p.lanzar(); W.pump(); W.hasta("picada", 300); W.pump(2); A.p.recoger(true); W.pump(2);
    vistos.add(String(W.evs(A, "pelea").at(-1)?.pez)); A.p.soltar(); W.pump(2);
  }
  assert.deepEqual([...vistos].filter((n) => !DEL_MUNDO.includes(n)), [], `ningún pez de la casa: ${[...vistos].join(", ")}`);
  assert.equal(vistos.size, 2, "both fish of the world come out");
  // land one: name, rarity, cm and colour reach the angler (captura), the neighbour (fin) and both pages' state
  pescar(W);
  const c = W.evs(A, "captura").at(-1)!;
  assert.ok(c, `escape: ${JSON.stringify(W.evs(A, "escape").at(-1))}`);
  const pez = [MERLIN, RAMA].find((p) => p.nombre === c.pez)!;
  assert.ok(pez, `a world fish: ${c.pez}`);
  assert.equal(c.color, pez.color.toUpperCase());
  assert.deepEqual(W.evs(B, "fin").at(-1), { quien: A.s.entity, sitio: "lago", resultado: "captura", pez: pez.nombre, cm: Number(c.cm), rareza: "comun", color: pez.color.toUpperCase() });
  assert.equal(A.p.estado().ultimo?.color, pez.color.toUpperCase(), "the «¡Pescado!» panel reads it from here");
  assert.equal(A.p.estado().ultimo?.pez, pez.nombre);
  assert.match(A.p.estado().aviso, new RegExp(`^Has pescado: ${pez.nombre}`));
  for (const P of [A, B]) assert.deepEqual([P.p.capturas()[0]?.pez, P.p.capturas()[0]?.color], [pez.nombre, pez.color.toUpperCase()], "the fish in the hand is drawn in its own colour");
  assert.equal(A.p.estado().cesta.mejor, pez.nombre, "the basket keeps the world's fish");
});

test("pesca peces: without `peces` nothing changes — the house fish, no colour, the house part when the file has no spots either", () => {
  // a pesca.json with only spots: swapped part (its own spots) but the HOUSE fish and no colour on the wire
  const solo = delMundo({ sitios: [LAGO] });
  assert.deepEqual(solo.log, []);
  const W = estanque(solo.parte as ReturnType<typeof crearPesca>);
  pescar(W);
  const c = W.evs(W.pages[0], "captura").at(-1)!;
  assert.ok(c && CASA.includes(String(c.pez)), `a house fish: ${c?.pez}`);
  assert.equal(c.color, "");
  assert.equal(W.pages[0].p.capturas()[0]?.color, "");
  // no file at all, or the old wrong shape: the house part itself, untouched, as before
  const sin = delMundo(undefined);
  assert.equal(sin.parte, sin.casa);
  const mal = delMundo({ spots: ["mal escrito"] });
  assert.equal(mal.parte, mal.casa);
  assert.match(mal.log.join(" "), /pesca\.json no tiene una lista "sitios"/);
  // the notes some worlds keep in the file are not read when there is no `peces` (the old leniency stays)
  assert.equal(delMundo({ schema: ESQUEMA, sitios: [LAGO], notas: "un estanque en la plaza" }).log.length, 0);
});

test("pesca peces: a wrong `peces` refuses the whole pesca.json with every issue in the log, and the world keeps the house pond and fish", () => {
  const { parte, log, casa } = delMundo(FICHA([{ ...MERLIN, nombre: "Pez ".repeat(9) }, { ...RAMA, rareza: "epica" }, { ...RAMA, id: "otro", brillo: 1 }]));
  assert.equal(parte, casa, "the house part, untouched");
  assert.equal(log.length, 1);
  assert.match(log[0], /^\[mundo\] pesca\.json no se usa \(estanque y peces de la casa\): /);
  assert.match(log[0], /peces\[0\]\.nombre: como mucho 32 caracteres/);
  assert.match(log[0], /peces\[1\]\.rareza: una de: comun, rara, legendaria/);
  assert.match(log[0], /peces\[2\]\.brillo: clave desconocida/);
  assert.doesNotMatch(log[0], /sitios/, "one message only: no second complaint about the spots");
});

test("pesca peces: `peces` without `sitios` is a valid file — the world's fish in the house pond; a `sitios` that is not a list is still said", () => {
  const a = delMundo({ schema: ESQUEMA, peces: [MERLIN] });
  assert.deepEqual(a.log, [], "spots are optional when the file brings fish");
  assert.notEqual(a.parte, a.casa);
  const W = estanque(a.parte as ReturnType<typeof crearPesca>);
  assert.equal(W.pages[0].p.sitios()[0]?.id, "estanque", "the house pond");
  const b = delMundo({ peces: [MERLIN], sitios: "el estanque" });
  assert.match(b.log.join(" "), /pesca\.json no tiene una lista "sitios" \(uso el estanque de la casa\)/);
  assert.notEqual(b.parte, b.casa, "the fish still count");
});
