// condiciones/c6 — a layer goes up a version: whoever had accepted the old one is shown ONLY what changed. The server keeps, with the
// acceptance, a short fingerprint per point (condiciones-puerta.ts `huellaPunto`); the offer then says, per layer, which points are
// `nuevos`, `cambiados` and which ids were `quitados` (additive field `cambios` of condiciones-estado@1). A data permission survives a
// version if its point did not change, and is lost (asked again, empty) if it did. Headless, over the in-memory transport.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { decodeCondiciones, encodeCondiciones } from "../packages/net/src/index.ts";
import type { FeatureStorage, Saved, StorageOp } from "../packages/feature/src/index.ts";
import type { Capa, Condiciones } from "../packages/server/src/condiciones.ts";
import { crearPuertaCondiciones, huellaPunto } from "../packages/server/src/condiciones-puerta.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

class MemoryStorage implements FeatureStorage {
  readonly d = new Map<string, Saved>();
  load(f: string): Saved | null { return this.d.get(f) ?? null; }
  record(f: string, version: number, op: StorageOp): void {
    const s = this.d.get(f) ?? { version, state: [], store: [] };
    if (op.op === "k") s.store = [...s.store.filter(([k]) => k !== op.key), [op.key, op.value]];
    if (op.op === "kd") s.store = s.store.filter(([k]) => k !== op.key);
    this.d.set(f, s);
  }
}

type P = { id: string; titulo: string; texto: string; obligatorio?: boolean; tipo?: "norma" | "datos" };
const punto = (p: P) => ({ id: p.id, titulo: p.titulo, texto: p.texto, obligatorio: p.obligatorio ?? (p.tipo !== "datos"), tipo: p.tipo ?? ("norma" as const) });
const capa = (c: "casa" | "comunidad", version: string, puntos: P[], nombre?: string): Capa => ({ capa: c, ...(nombre ? { nombre } : {}), version, puntos: puntos.map(punto) });
const cond = (...capas: Capa[]): Condiciones => ({ formato: "condiciones@1", capas });

/** The community's layer at v1.0, and at v1.1: «grabar» changes its text, «viernes» is new, «ruido» is gone; the data points: `informe`
 * stays, `avisos` changes, `sorteo` is new. */
const COM_10 = (): Capa => capa("comunidad", "1.0", [
  { id: "turno", titulo: "Respeta el turno", texto: "En los encuentros, espera tu turno." },
  { id: "grabar", titulo: "No grabes a otros sin pedírselo.", texto: "Pídelo antes de grabar." },
  { id: "ruido", titulo: "No hagas ruido de noche.", texto: "Silencio de 23:00 a 07:00." },
  { id: "informe", titulo: "Informe de la sesión", texto: "Rendimiento de tu aparato.", tipo: "datos" },
  { id: "avisos", titulo: "Avisos", texto: "Te avisamos de los encuentros.", tipo: "datos" },
], "Numen Games");
const COM_11 = (): Capa => capa("comunidad", "1.1", [
  { id: "turno", titulo: "Respeta el turno", texto: "En los encuentros, espera tu turno." },
  { id: "grabar", titulo: "No grabes ni retransmitas a otros sin pedírselo.", texto: "Pídelo antes de grabar o retransmitir." },
  { id: "viernes", titulo: "Los viernes la plaza es solo para el encuentro.", texto: "A las 18:00 UTC." },
  { id: "informe", titulo: "Informe de la sesión", texto: "Rendimiento de tu aparato.", tipo: "datos" },
  { id: "avisos", titulo: "Avisos", texto: "Te avisamos de los encuentros y de las novedades.", tipo: "datos" },
  { id: "sorteo", titulo: "Entrar en el sorteo mensual", texto: "Usamos tu nombre para el sorteo.", tipo: "datos" },
], "Numen Games");
const CASA = (): Capa => capa("casa", "1.0", [{ id: "uso", titulo: "Condiciones de uso", texto: "Texto de la casa." }, { id: "informe-casa", titulo: "Informe de la casa", texto: "Anónimo.", tipo: "datos" }]);

/** A server boot over `storage` with these conditions, one person (the same guest card every time). */
function arrancar(c: Condiciones, storage: MemoryStorage, tarjeta: GuestKeeper) {
  const log: string[] = [];
  const puerta = crearPuertaCondiciones({ condiciones: c, activa: true, log: (l) => log.push(l), ahora: () => Date.parse("2026-10-20T12:00:00Z") });
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: sign, storage, features: [puerta.part], condiciones: puerta });
  const t = inst.join(0);
  const s = new ClientSession(t, { identity: tarjeta, view: { label() {}, bounce() {} } });
  const pump = (n = 3) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  const aceptar = (versiones: Record<string, string>, datos: string[] = []) => { assert.ok(s.aceptar(versiones, datos)); pump(2); };
  const pedir = () => { assert.ok(s.pedirCondiciones()); pump(2); return s.condiciones!; };
  return { inst, s, puerta, pump, aceptar, pedir, log, id: () => inst.who(s.entity)!.id };
}

test("huellaPunto: the title, the text, mandatory-or-not and the kind move it; the id does not; it is short", () => {
  const p = punto({ id: "a", titulo: "T", texto: "X" });
  assert.match(huellaPunto(p), /^[0-9a-f]{10}$/);
  assert.equal(huellaPunto(p), huellaPunto({ ...p, id: "otro" }));
  for (const otro of [{ ...p, titulo: "T2" }, { ...p, texto: "X2" }, { ...p, obligatorio: !p.obligatorio }, { ...p, tipo: "datos" as const }]) assert.notEqual(huellaPunto(otro), huellaPunto(p));
});

test("c6: accept v1.0, the file goes to v1.1 with 1 new and 1 changed norm → the offer marks those two (and the removed id), nothing else", () => {
  const storage = new MemoryStorage(), tarjeta = keeper();
  let M = arrancar(cond(CASA(), COM_10()), storage, tarjeta);
  assert.equal(M.s.condiciones!.capas!.every((c) => c.cambios === undefined), true, "a first visit: no `cambios` anywhere");
  M.aceptar({ casa: "1.0", comunidad: "1.0" }, ["informe", "avisos"]);
  assert.equal(M.s.condiciones!.abierta, true);
  // the community's file goes to 1.1 (the house stays at 1.0)
  M = arrancar(cond(CASA(), COM_11()), storage, tarjeta);
  const o = M.s.condiciones!;
  assert.equal(o.abierta, false); assert.deepEqual(o.faltan, ["comunidad"], "only the layer that changed holds the door");
  assert.equal(o.capas![0].cambios, undefined, "the house did not change: nothing to say");
  const c = o.capas![1].cambios!;
  assert.equal(c.desde, "1.0");
  assert.deepEqual(c.nuevos, ["viernes", "sorteo"]); assert.deepEqual(c.cambiados, ["grabar", "avisos"]); assert.deepEqual(c.quitados, ["ruido"]);
  assert.deepEqual(c.antes, { grabar: "No grabes a otros sin pedírselo.", avisos: "Avisos", ruido: "No hagas ruido de noche." }, "the previous titles, to show «antes → ahora»");
  assert.equal(o.capas![1].puntos.length, 6, "the offer still carries the whole text (a page that ignores `cambios` shows everything)");
  // accepting the new version opens the door
  M.aceptar({ comunidad: "1.1" });
  assert.equal(M.s.condiciones!.abierta, true); assert.deepEqual(M.s.condiciones!.aceptado!.versiones, { casa: "1.0", comunidad: "1.1" });
  // and what was accepted is now 1.1: a new visit with the same file has nothing to show
  M = arrancar(cond(CASA(), COM_11()), storage, tarjeta);
  assert.equal(M.s.condiciones!.abierta, true); assert.equal(M.pedir().capas!.every((x) => x.cambios === undefined), true);
});

test("c6: a data permission survives a version if its point did not change; it is lost, and asked again empty, if it did; a new one is empty", () => {
  const storage = new MemoryStorage(), tarjeta = keeper();
  let M = arrancar(cond(CASA(), COM_10()), storage, tarjeta);
  M.aceptar({ casa: "1.0", comunidad: "1.0" }, ["informe", "avisos", "informe-casa"]);
  M = arrancar(cond(CASA(), COM_11()), storage, tarjeta);
  // the page shows only the changed/new points of the community: `avisos` (changed) and `sorteo` (new), both empty. It sends nothing ticked
  // and carries the permission of the house layer it did not show (apps/plaza/condiciones-logica.ts): `informe-casa`. The server alone keeps
  // `informe`: unchanged point of the layer that went up.
  M.aceptar({ comunidad: "1.1" }, ["informe-casa"]);
  const d = M.s.condiciones!.aceptado!.datos;
  assert.ok(d.includes("informe"), "unchanged permission of the returning layer stays given");
  assert.ok(!d.includes("avisos"), "a changed data point loses its permission");
  assert.ok(!d.includes("sorteo"), "a new data point is not given by itself");
  assert.ok(d.includes("informe-casa"), "the house layer was not shown: what the page carries stays");
  // another person ticks the new one and the changed one
  const st2 = new MemoryStorage(), t2 = keeper();
  M = arrancar(cond(CASA(), COM_10()), st2, t2); M.aceptar({ casa: "1.0", comunidad: "1.0" }, ["informe", "avisos", "informe-casa"]);
  M = arrancar(cond(CASA(), COM_11()), st2, t2);
  M.aceptar({ comunidad: "1.1" }, ["sorteo", "avisos", "informe-casa"]);
  assert.deepEqual([...M.s.condiciones!.aceptado!.datos].sort(), ["avisos", "informe", "informe-casa", "sorteo"]);
  // refusing the changed one afterwards does not take away the unchanged permission the page never asked about
  M = arrancar(cond(CASA(), { ...COM_11(), version: "1.2", puntos: COM_11().puntos.map((p) => (p.id === "sorteo" ? { ...p, texto: "Otro texto." } : p)) }), st2, t2);
  assert.deepEqual(M.s.condiciones!.capas![1].cambios!.cambiados, ["sorteo"]);
  M.aceptar({ comunidad: "1.2" }, ["informe-casa"]);
  assert.deepEqual([...M.s.condiciones!.aceptado!.datos].sort(), ["avisos", "informe", "informe-casa"], "`sorteo` changed: given up; `avisos` and `informe` did not: still given");
});

test("c6: no fingerprints (an acceptance of c2), the very same version, or a layer never accepted → no `cambios`: everything is asked as before", () => {
  const storage = new MemoryStorage(), tarjeta = keeper();
  let M = arrancar(cond(COM_10()), storage, tarjeta);
  const id = M.id();
  M.aceptar({ comunidad: "1.0" }, ["avisos"]);
  const g = storage.d.get("condiciones")!, ranura = g.store.find(([k]) => k === `a:${id}`)!;
  const guardado = ranura[1] as { v: Record<string, string>; d: string[]; en: string; h?: unknown; t?: unknown };
  assert.ok(guardado.h && guardado.t, "a new acceptance keeps the fingerprints and the titles");
  // the same version again: nothing to say
  M = arrancar(cond(COM_10()), storage, tarjeta);
  assert.equal(M.pedir().capas![0].cambios, undefined);
  // c2's record (no fingerprints): the new version is asked in full
  storage.record("condiciones", 1, { op: "k", key: `a:${id}`, value: { v: guardado.v, d: guardado.d, en: guardado.en } });
  M = arrancar(cond(COM_11()), storage, tarjeta);
  assert.deepEqual(M.s.condiciones!.faltan, ["comunidad"]); assert.equal(M.s.condiciones!.capas![0].cambios, undefined, "an old acceptance: all of it");
  // a layer the person never accepted (the world adds a community layer): all of it, while the house layer they did accept is quiet
  const otra = new MemoryStorage(), t2 = keeper();
  M = arrancar(cond(CASA()), otra, t2); M.aceptar({ casa: "1.0" });
  M = arrancar(cond(CASA(), COM_10()), otra, t2);
  assert.deepEqual(M.s.condiciones!.faltan, ["comunidad"]); assert.deepEqual(M.s.condiciones!.capas!.map((c) => c.cambios), [undefined, undefined]);
});

test("c6: a version number that changes with the same text says so: `cambios` with nothing in it; a point that turns mandatory counts as changed", () => {
  const storage = new MemoryStorage(), tarjeta = keeper();
  let M = arrancar(cond(CASA()), storage, tarjeta); M.aceptar({ casa: "1.0" });
  M = arrancar(cond({ ...CASA(), version: "1.0.1" }), storage, tarjeta);
  assert.deepEqual(M.s.condiciones!.capas![0].cambios, { desde: "1.0", nuevos: [], cambiados: [], quitados: [] });
  const sinOblig = capa("casa", "2", [{ id: "uso", titulo: "Uso", texto: "x", obligatorio: false }, { id: "otra", titulo: "Otra", texto: "y" }]);
  const st = new MemoryStorage(), t = keeper();
  M = arrancar(cond(sinOblig), st, t); M.aceptar({ casa: "2" });
  M = arrancar(cond({ ...sinOblig, version: "3", puntos: sinOblig.puntos.map((p) => (p.id === "uso" ? { ...p, obligatorio: true } : p)) }), st, t);
  assert.deepEqual(M.s.condiciones!.capas![0].cambios!.cambiados, ["uso"], "optional → mandatory is a change");
});

test("c6: the record stays under the store's limit with 20 points of 120-character titles in two layers (the titles go first if it does not fit); the acceptance is never lost", () => {
  const largo = (c: "casa" | "comunidad", v: string, n: number) => capa(c, v, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, titulo: `Título ${i} `.padEnd(120, "x"), texto: `texto ${i}` })));
  const storage = new MemoryStorage(), tarjeta = keeper();
  let M = arrancar(cond(largo("casa", "1", 20), largo("comunidad", "1", 20)), storage, tarjeta);
  M.aceptar({ casa: "1", comunidad: "1" });
  assert.equal(M.log.some((l) => l.includes("no he podido guardar")), false, M.log.join("\n"));
  const r = JSON.stringify(storage.d.get("condiciones")!.store.find(([k]) => k === `a:${M.id()}`)![1]);
  assert.ok(new TextEncoder().encode(r).length <= 4096, `record is ${r.length} bytes`);
  M = arrancar(cond(largo("casa", "1", 20), { ...largo("comunidad", "2", 20), puntos: largo("comunidad", "2", 20).puntos.map((p, i) => (i === 3 ? { ...p, texto: "otro" } : p)) }), storage, tarjeta);
  assert.deepEqual(M.s.condiciones!.capas![1].cambios!.cambiados, ["p3"], "fingerprints survive even when the titles had to go");
});

test("c6 wire: `cambios` travels in the offer and an old reader that ignores it still reads the rest", () => {
  const m = { formato: "condiciones-estado@1" as const, puerta: true, abierta: false, faltan: ["comunidad"], aceptado: null,
    capas: [{ capa: "comunidad", version: "1.1", puntos: [], cambios: { desde: "1.0", nuevos: ["a"], cambiados: ["b"], quitados: ["c"], antes: { b: "antes" } } }] };
  assert.deepEqual(decodeCondiciones(encodeCondiciones(m)), m);
});
