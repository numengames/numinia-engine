// baculo v1: the Director's staff, headless (in-memory world, pages pumped by 20 Hz ticks, the world's roles for real).
// Take it, pass it, drop it, drop off, two staffs, the cap, who may change how many, that holding it is what lets a person
// direct (and nothing more), that an AI never holds it, that a world without baculos.json does not change, and that a world
// whose ONLY change is baculos.json shows the staff (R-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { emitirAgente, today } from "../packages/instance/src/identidad.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { crearDados } from "../features/dados/server.ts";
import { crearCliente as crearClienteDados } from "../features/dados/client.ts";
import { crearDirector } from "../features/director/server.ts";
import { crearCliente as crearDirectorCliente } from "../features/director/client.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { baculo, CANTIDAD_MAX, GRACIA_S, LIBRE, MODELO_BACULO, RESERVADO } from "../features/baculo/feature.ts";
import { crearBaculo, leerBaculos } from "../features/baculo/server.ts";
import { crearCliente, pedestal, flotando } from "../features/baculo/client.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { ACCION_PERMISO, plantilla, tiene, acceso } from "../packages/server/src/roles.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };

const sign = signer("una-clave-de-prueba-larga"), agentes = signer("otra-clave-de-agentes-larga");
const ADMIN = "codigo-de-administracion-largo";
const SITIO = { x: 10, y: 0, z: 0 };
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const llavero = (token: string): GuestKeeper => ({ load: () => token, save: () => {} });

/** A headless world: n people (each with chat, the staff and the director's page), the world's roles, an environment. */
function mundo(n: number, o: { cantidad?: number; sitios?: { x: number; z: number; y?: number }[]; sinBaculos?: boolean; ia?: boolean } = {}) {
  const log: string[] = [];
  const reloj = { ms: Date.parse("2026-10-21T22:00:00Z") };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const bac = crearBaculo(o.sinBaculos ? null : { cantidad: o.cantidad, sitios: o.sitios ?? [SITIO] });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "hierba" } }), crearDirector({ escenas: [] }), bac, roles.part], log: (l) => log.push(l), identitySign: sign, puede: (who, accion) => roles.puede(who, accion), ...(o.ia ? { agentes: { sign: agentes, nombre: (id: string) => (id === "lia" ? "Lía" : null) } } : {}) });
  const entrar = (i: number, llave: GuestKeeper = keeper()) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms), b = crearCliente(), d = crearDirectorCliente();
    const llevados = new Map<number, string>(), lugares: string[] = [], rech: string[] = [];
    const s = new ClientSession(t, { features: [c.part, b.parts[0], d.part], identity: llave, view: { label() {}, bounce() {}, lleva: (e, p) => { if (p) llevados.set(e, p.nombre ?? ""); else llevados.delete(e); }, place: (k, p) => { lugares.push(`${k}:${p ? "puesto" : "quitado"}`); } } });
    s.features.tap((f, e, m) => { if (f === "baculo" && e === "rechazado") rech.push(String(m.motivo)); });
    return { t, s, chat: c.chat, baculo: b.baculo, dj: d.director, llevados, lugares, rech };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const nombre = (p: { s: ClientSession }) => inst.who(p.s.entity)!.nombre;
  const avisos = (p: (typeof gente)[number]) => p.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto);
  const ultimo = (p: (typeof gente)[number]) => avisos(p).at(-1) ?? "";
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  /** Who holds each staff, as the SERVER says (not a page): [key, holder entity]. */
  const portadores = () => Object.fromEntries(inst.features.stateOf?.("baculo") ?? []);
  return { inst, gente, pump, poner, nombre, ultimo, avisos, decir, log, roles, entrar, reloj, portadores };
}
const portador = (p: { baculo: ReturnType<typeof crearCliente>["baculo"] }, k = "b1") => p.baculo.lista().find((b) => b.id === k)?.portador;

test("baculo: the declaration meets the plug's rules, is in both lists, and its model is the house's (sha256 in the library)", () => {
  assert.deepEqual(baculo.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "baculo"));
  assert.ok(paginas.some((f) => f.feature.id === "baculo"));
  const m = biblioteca.modelos.find((x) => x.id === "baculo")!;
  assert.equal(m.modelo, MODELO_BACULO);
  assert.equal(m.licencia, "CC0-1.0");
  const bytes = readFileSync(m.fichero);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), MODELO_BACULO, "node tools/hacer-baculo.mjs is deterministic");
  // low-poly: ≤ 300 triangles, one mesh, one flat colour (STD-023)
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
  assert.equal(json.meshes.length, 1);
  assert.equal(json.materials.length, 1);
  assert.ok(json.accessors[2].count / 3 <= 300, `${json.accessors[2].count / 3} triangles`);
  assert.deepEqual(json.materials[0].pbrMetallicRoughness.baseColorFactor.slice(0, 3), [0.937, 0.647, 0.09], "the house amber");
});

test("baculo: the staff is a LOAN of `dirigir`, not a role: the permission it lends is the one Moderación already holds", () => {
  assert.equal(ACCION_PERMISO.dirigir, "manage-rituals");
  assert.equal(ACCION_PERMISO.mandar, "administrator");
  const r = plantilla(false);
  assert.equal(tiene(acceso(r, null), "dirigir"), false);
  assert.equal(tiene(acceso(r, null), "mandar"), false);
  assert.deepEqual(r.map((x) => x.nombre), ["Administración", "Moderación", "@todos"], "no role was added");
});

test("baculo.json: a wrong line is left out with its reason; the rest is used", () => {
  assert.equal(leerBaculos(undefined), null, "no file, no staff");
  assert.deepEqual(leerBaculos({ cantidad: 2, sitios: [{ x: 1, z: 2 }, { x: 3, y: 1, z: 4 }] }), { valor: { activa: true, cantidad: 2, sitios: [{ x: 1, z: 2, y: 0 }, { x: 3, z: 4, y: 1 }] }, problemas: [] });
  const ko = leerBaculos({ cantidad: 9, sitios: [{ x: 1 }, { x: 5, z: 5 }] })!;
  assert.equal(ko.valor.cantidad, 1);
  assert.deepEqual(ko.valor.sitios, [{ x: 5, z: 5, y: 0 }]);
  assert.match(ko.problemas.join("\n"), /sitios\[0\].*x y z/);
  assert.match(ko.problemas.join("\n"), /cantidad: un entero de 1 a 5/);
  assert.deepEqual(leerBaculos({})!.valor, { activa: true, cantidad: 1, sitios: [] }, "an empty file = one staff at the default spot");
  assert.ok(leerBaculos("hola")!.problemas.length);
});

test("baculo: take it, direct, pass it, the other directs and the first no longer does, drop it (the server decides every step)", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.poner(A, 10, 0.5); W.poner(B, 11, 1); W.poner(C, 40, 40);
  W.pump(3);
  assert.equal(portador(A), LIBRE);
  assert.ok(A.lugares.some((l) => l.startsWith("baculo:b1:pedestal:puesto")) && A.lugares.some((l) => l === "baculo:b1:puesto"), "the pedestal and the staff are drawn");
  // before: nobody directs
  for (const p of [A, B]) { assert.equal(p.dj.estado.puede, false); }
  W.decir(A, "/narrar hola");
  assert.match(W.ultimo(A), /Gestionar rituales/);
  // A takes it (E beside it)
  assert.deepEqual(A.baculo.coger("b1"), { ok: true });
  W.pump(3);
  assert.equal(portador(B), A.s.entity, "everyone sees A holds it");
  assert.equal(A.dj.estado.puede, true, "holding it lends `dirigir`");
  assert.equal(B.dj.estado.puede, false);
  assert.ok(B.llevados.get(A.s.entity), "B draws the staff in A's hand (view.lleva)");
  W.decir(A, "/narrar Cae la noche.");
  assert.deepEqual(B.dj.estado.narraciones.at(-1)?.texto, "Cae la noche.");
  assert.match(W.log.join("\n"), /\[baculo\] .* coge Báculo del Director: ahora dirige/, "it is written in the world's log");
  assert.equal(portador(B), A.s.entity);
  // B cannot take it nor take it from A, and holding one stops a second
  assert.deepEqual(B.baculo.coger("b1"), { ok: true }); W.pump(3);
  assert.equal(portador(B), A.s.entity, "it is A's");
  assert.equal(B.dj.estado.puede, false);
  // pass it to B (within 6 m)
  W.decir(A, `/baculo pasar ${W.nombre(B)}`);
  W.pump(3);
  assert.equal(portador(C), B.s.entity, "now B holds it");
  assert.equal(A.dj.estado.puede, false, "A no longer directs");
  assert.equal(B.dj.estado.puede, true);
  W.decir(A, "/narrar sigo yo");
  assert.match(W.ultimo(A), /Gestionar rituales/);
  assert.equal(A.llevados.get(A.s.entity), undefined, "nothing in A's hand any more");
  W.decir(B, "/narrar Ahora dirijo yo.");
  assert.equal(C.dj.estado.narraciones.at(-1)?.texto, "Ahora dirijo yo.");
  // C is 40 m away: B cannot hand it to them; and nobody else is a name
  W.decir(B, `/baculo pasar ${W.nombre(C)}`);
  assert.match(B.rech.at(-1)!, /está lejos/);
  W.decir(B, "/baculo pasar Nadie");
  assert.match(B.rech.at(-1)!, /No veo a nadie llamado/);
  assert.equal(portador(C), B.s.entity);
  // B drops it: back on its pedestal, and B stops directing
  W.decir(B, "/baculo soltar");
  assert.equal(portador(C), LIBRE);
  assert.equal(B.dj.estado.puede, false);
  assert.equal(C.baculo.lista()[0].x, SITIO.x, "it is back where it was");
  W.decir(B, "/baculo soltar");
  assert.match(B.rech.at(-1)!, /No llevas ningún báculo/);
});

test("baculo: far from it you cannot take it; the intent `pasar` with no name goes to the nearest person in reach", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.poner(A, 30, 30); W.poner(B, 10, 1); W.poner(C, 14, 0);
  W.pump(3);
  A.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(A), LIBRE, "too far");
  assert.match(A.rech.join("\n"), /Acércate/);
  B.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(A), B.s.entity);
  assert.deepEqual(B.baculo.pasar(""), { ok: true }); W.pump(3);
  assert.equal(portador(A), C.s.entity, "C was the only one within 6 m of B");
  assert.equal(B.dj.estado.puede, false);
  assert.equal(C.dj.estado.puede, true);
});

test("baculo: one staff per person; two staffs; the owner picks how many (1–5), lowering sends the extras home", () => {
  const W = mundo(3, { cantidad: 2, sitios: [{ x: 10, z: 0 }, { x: 10, z: 3 }] });
  const [A, B, C] = W.gente;
  W.pump(3);
  assert.deepEqual(A.baculo.lista().map((b) => b.id), ["b1", "b2"]);
  assert.deepEqual(A.baculo.lista().map((b) => b.nombre), ["Báculo del Director 1", "Báculo del Director 2"]);
  W.poner(A, 10, 1.5); W.poner(B, 10, 2); W.poner(C, 10, 1.5);
  W.pump(3);
  A.baculo.coger("b1"); W.pump(3);
  A.baculo.coger("b2"); W.pump(3);
  assert.equal(portador(A, "b1"), A.s.entity);
  assert.equal(portador(A, "b2"), LIBRE, "one person, one staff");
  assert.match(A.rech.join("\n"), /una persona, un báculo/);
  B.baculo.coger("b2"); W.pump(3);
  assert.equal(portador(A, "b2"), B.s.entity, "two staffs, two people directing");
  assert.equal(A.dj.estado.puede && B.dj.estado.puede, true);
  // C rules by owner code; A (a director) does not rule the world
  W.decir(A, "/baculos 4");
  assert.match(A.rech.at(-1)!, /Solo quien manda/);
  assert.equal(A.baculo.lista().length, 2);
  W.decir(C, `/dueño ${ADMIN}`);
  W.decir(C, "/baculos 4");
  W.pump(3);
  assert.equal(A.baculo.lista().length, 4);
  W.decir(C, `/baculos ${CANTIDAD_MAX + 1}`);
  assert.match(C.rech.at(-1)!, /Entre 1 y 5/);
  assert.equal(A.baculo.lista().length, 4);
  W.decir(C, "/baculos 0");
  assert.equal(A.baculo.lista().length, 4);
  // B holds b2; lowering to 1 sends b2 home and B stops directing; A (b1) goes on
  W.decir(C, "/baculos 1");
  W.pump(3);
  assert.deepEqual(A.baculo.lista().map((b) => b.id), ["b1"]);
  assert.equal(B.dj.estado.puede, false, "the extra staff is gone and so is its loan");
  assert.equal(A.dj.estado.puede, true);
  assert.equal(portador(A, "b1"), A.s.entity);
  assert.equal(W.inst.features.storeOf?.("baculo", "cantidad") ?? 1, 1);
});

test("baculo: /baculos <n> and /baculo recuperar are only for who rules the world (administrator or owner), and recuperar takes it from the holder", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.poner(A, 10, 1); W.poner(B, 11, 1); W.poner(C, 12, 1);
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, `/dar ${W.nombre(B)} Moderación`);     // Moderación directs, but does not rule
  W.pump(3);
  assert.equal(B.dj.estado.puede, true, "a moderator directs without any staff");
  C.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(A), C.s.entity);
  W.decir(B, "/baculo recuperar");
  assert.match(B.rech.at(-1)!, /Solo quien manda/);
  W.decir(B, "/baculos 3");
  assert.match(B.rech.at(-1)!, /Solo quien manda/);
  assert.equal(portador(A), C.s.entity);
  assert.equal(B.baculo.lista().length, 1);
  // the owner recalls it: C lets go and stops directing; the moderator keeps directing by role
  W.decir(A, "/baculo recuperar");
  W.pump(3);
  assert.equal(portador(A), LIBRE);
  assert.equal(C.dj.estado.puede, false);
  assert.equal(B.dj.estado.puede, true, "what a role already let you direct still stands");
  W.decir(A, "/baculo recuperar");
  assert.match(A.rech.at(-1)!, /ya en su sitio/);
  // taking and dropping the staff does not take a moderator's role away
  B.baculo.coger("b1"); W.pump(3);
  assert.equal(B.dj.estado.puede, true);
  W.decir(B, "/baculo soltar");
  assert.equal(B.dj.estado.puede, true, "dropping the staff leaves the role's `dirigir` alone");
});

test("baculo: leaving keeps it GRACIA_S seconds for you; coming back in time keeps it; otherwise it goes home and the loan ends", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3);
  W.poner(A, 10, 1); W.poner(B, 11, 1);
  W.pump(3);
  A.baculo.coger("b1"); W.pump(3);
  assert.equal(A.dj.estado.puede, true);
  const e = A.s.entity;
  W.inst.disconnect(e);
  W.pump(5);
  assert.equal(portador(B), RESERVADO, "reserved to who dropped off, nobody else can take it");
  B.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(B), RESERVADO);
  assert.match(B.rech.join("\n"), /reservado unos segundos/);
  // the grace runs out
  W.pump(GRACIA_S * TICK_HZ);
  assert.equal(portador(B), LIBRE, "back on its pedestal");
  assert.match(W.log.join("\n"), /se acabó la gracia/);
  B.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(B), B.s.entity, "free again");
});

test("baculo: coming back within the grace gives it back (same person, new connection)", () => {
  const W = mundo(0);
  const llave = keeper();
  const A = W.entrar(0, llave); const B = W.entrar(1);
  W.gente.push(A, B);
  W.pump(3);
  W.poner(A, 10, 1); W.poner(B, 11, 1);
  W.pump(3);
  A.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(B), A.s.entity);
  W.inst.disconnect(A.s.entity);
  W.gente.splice(W.gente.indexOf(A), 1);
  W.pump(2 * TICK_HZ);
  assert.equal(portador(B), RESERVADO);
  assert.equal(B.dj.estado.puede, false);
  const A2 = W.entrar(2, llave); W.gente.push(A2);
  W.pump(6);
  W.poner(A2, 10, 1);
  W.pump(3);
  assert.equal(portador(B), A2.s.entity, "the same person comes back and it is theirs again");
  assert.equal(A2.dj.estado.puede, true);
});

test("baculo: a moderator who throws someone out (or bans them) takes the staff from them at once", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.poner(A, 10, 1); W.poner(B, 11, 1); W.poner(C, 12, 1);
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  B.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(A), B.s.entity);
  W.decir(A, `/echar ${W.nombre(B)}`);
  W.pump(3);
  assert.equal(portador(A), LIBRE, "back on its pedestal, not held for B");
  assert.equal(C.baculo.lista()[0].portador, LIBRE);
  assert.match(W.log.join("\n"), /\[baculo\] Báculo del Director vuelve a su sitio/);
  assert.equal(W.inst.who(B.s.entity), null, "B was sent out");
  C.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(A), C.s.entity);
  W.decir(A, `/vetar ${W.nombre(C)} molesta`);
  W.pump(3);
  assert.equal(portador(A), LIBRE);
});

test("baculo: an AI never holds it (not even beside it), and cannot be handed it", () => {
  const W = mundo(2, { ia: true });
  const [A] = W.gente;
  const lia = W.entrar(5, llavero(emitirAgente(agentes, "lia", today())));
  W.gente.push(lia);
  W.pump(4);
  assert.equal(W.inst.who(lia.s.entity)?.id, "ia-lia");
  W.poner(A, 10, 1); W.poner(lia, 11, 1);
  W.pump(3);
  lia.baculo.coger("b1"); W.pump(3);
  assert.equal(portador(A), LIBRE, "an AI does not take it");
  assert.match(lia.rech.join("\n"), /Una IA no coge el báculo/);
  assert.equal(lia.dj.estado.puede, false);
  A.baculo.coger("b1"); W.pump(3);
  assert.deepEqual(A.baculo.pasar("Lía"), { ok: true }); W.pump(3);
  assert.equal(portador(A), A.s.entity, "A keeps it");
  assert.match(A.rech.join("\n"), /Una IA no coge el báculo|está lejos|no puede llevarlo/);
  assert.equal(lia.dj.estado.puede, false);
});

test("baculo: a world without baculos.json does not change — same simulation fingerprint, no state, no staff, nothing for pages to draw", () => {
  const sinElla = (con: boolean) => {
    const log: string[] = [];
    const leer = (_f: string) => undefined;
    const lista = conMundo(con ? funciones : funciones.filter((f) => f.feature.id !== "baculo"), leer, (l) => log.push(l));
    const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
    const t = inst.join(0), s = new ClientSession(t, { identity: keeper(), features: paginas });
    for (let i = 0; i < 40; i++) { t.flush(); inst.tick(); t.flush(); }
    return { hash: inst.hash(), keys: s.features.stateKeys?.("baculo") ?? [], log };
  };
  const con = sinElla(true), sin = sinElla(false);
  assert.equal(con.hash, sin.hash, "the staff's piece on the list leaves the simulation fingerprint alone");
  assert.deepEqual(con.keys, []);
  assert.deepEqual(con.log.filter((l) => /baculo:/i.test(l)), [], "and has nothing to announce");
});

test("baculo (R-1): a world whose ONLY change is baculos.json shows the staff, on its pedestal, where the file says", () => {
  const ficheros: Record<string, unknown> = { "baculos.json": { cantidad: 2, sitios: [{ x: 4, y: 0, z: 6 }, { x: -3, z: 6 }] } };
  const log: string[] = [];
  const lista = conMundo(funciones, (f) => ficheros[f], (l) => log.push(l));
  const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0), vistas: string[] = [];
  const s = new ClientSession(t, { identity: keeper(), features: paginas, view: { label() {}, bounce() {}, place: (k, p) => { if (p) vistas.push(`${k}@${p.x},${p.z}`); } } });
  for (let i = 0; i < 40; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.match(log.join("\n"), /baculo: 2 báculo\(s\) en 2 sitio\(s\)/);
  assert.ok(vistas.includes("baculo:b1:pedestal@4,6") && vistas.includes("baculo:b1@4,6"), vistas.join(" "));
  assert.ok(vistas.includes("baculo:b2:pedestal@-3,6"));
  void s;
  // a wrong file is left out line by line and said
  ficheros["baculos.json"] = { cantidad: 7, sitios: [{ x: "a" }] };
  const log2: string[] = [];
  conMundo(funciones, (f) => ficheros[f], (l) => log2.push(l));
  assert.match(log2.join("\n"), /baculos\.json: sitios\[0\]/);
});

test("baculo: what a page draws (pure): the pedestal stands on the ground, the staff floats over it", () => {
  const v = { hx: 4, hy: 1, hz: 6, modelo: MODELO_BACULO };
  assert.equal(pedestal(v).y, 1 + 0.45);
  assert.equal(flotando(v).y > pedestal(v).y + 0.45, true);
  assert.equal(flotando({ ...v, modelo: "" }).model.length, 64, "no model on this server: a plain rod, never nothing");
});

// ---- the switch (Pablo, 2026-10-21): every piece is on/off from the Entorno panel; the server decides who and keeps the state in the world ----
type Archivos = Map<string, unknown>;
function mundoInterruptor(n: number, archivos: Archivos = new Map(), o: { iniciales?: Record<string, unknown> } = {}) {
  for (const [k, v] of Object.entries(o.iniciales ?? {})) archivos.set(k, v);
  const log: string[] = [], reloj = { ms: Date.parse("2026-10-21T22:00:00Z") };
  const io = { leer: (f: string) => archivos.get(f), escribir: (f: string, d: unknown) => { archivos.set(f, JSON.parse(JSON.stringify(d))); } };
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const crudoB = archivos.get("baculos.json") as { cantidad?: number; sitios?: unknown } | undefined, crudoD = archivos.get("dados.json") as { activa?: boolean; torres?: never[] } | undefined;
  const bac = crearBaculo(crudoB ? leerBaculos(crudoB)!.valor : null, io);
  const dad = crearDados({ torres: crudoD?.torres, activa: crudoD !== undefined && crudoD.activa !== false, io, azar: () => 0 });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "hierba" } }), crearDirector({ escenas: [] }), bac, dad, roles.part], log: (l) => log.push(l), identitySign: sign, puede: (who, accion) => roles.puede(who, accion) });
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms), b = crearCliente(), d = crearClienteDados(), dj = crearDirectorCliente(), rech: string[] = [];
    const s = new ClientSession(t, { features: [c.part, b.parts[0], d.parts[0], dj.part], identity: keeper(), view: { label() {}, bounce() {}, lleva() {}, place() {} } });
    s.features.tap((f, e, m) => { if ((f === "baculo" || f === "dados") && e === "rechazado") rech.push(String(m.motivo)); });
    return { t, s, chat: c.chat, baculo: b.baculo, dados: d.dados, dj: dj.director, rech };
  });
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); };
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  return { inst, gente, pump, poner, decir, log, archivos, roles, nombre: (p: { s: ClientSession }) => inst.who(p.s.entity)!.nombre };
}

test("interruptor: a world with no files has both pieces OFF at cost 0 (same fingerprint, no state, /tirar says it is off)", () => {
  const W = mundoInterruptor(1);
  const [A] = W.gente;
  W.pump(4);
  assert.equal(A.baculo.lista().length, 0);
  assert.equal(A.dados.torres().length, 0);
  assert.equal(A.dados.interruptor.activa(), false);
  assert.equal(W.archivos.size, 0, "nothing written");
  W.decir(A, "/tirar 2d6");
  assert.match(A.rech.at(-1)!, /Los dados están apagados/);
  W.decir(A, "/baculo soltar");
  assert.match(A.rech.at(-1)!, /apagados/);
  const base = (con: boolean) => {
    const inst = new Instance({ seed: 9, capacity: 8, k: 50, snapshotEvery: 2, features: con ? [crearBaculo(null), crearDados({ activa: false })] : [], identitySign: sign });
    const t = inst.join(0); for (let i = 0; i < 30; i++) { t.flush(); inst.tick(); t.flush(); } return inst.hash();
  };
  assert.equal(base(true), base(false), "off = the simulation fingerprint is untouched");
});

test("interruptor: who may flip — a person with no `dirigir` is refused (and is told nothing to show); the owner, a moderator and the holder of the staff may", () => {
  const W = mundoInterruptor(4);
  const [A, B, C, D] = W.gente;
  W.pump(4);
  for (const p of W.gente) { assert.equal(p.baculo.interruptor.estado.puede, false); assert.equal(p.dados.interruptor.estado.puede, false); }
  assert.deepEqual(B.baculo.interruptor.poner(true), { ok: true }); W.pump(3);
  assert.match(B.rech.at(-1)!, /Encender o apagar una pieza/);
  assert.deepEqual(B.dados.interruptor.poner(true), { ok: true }); W.pump(3);
  assert.equal(B.dados.interruptor.activa(), false);
  assert.equal(W.archivos.size, 0, "nothing was written");
  // the owner may; so may a moderator (by role)
  W.decir(A, `/dueño ${ADMIN}`); W.pump(3);
  assert.equal(A.baculo.interruptor.estado.puede, true);
  assert.equal(B.baculo.interruptor.estado.puede, false);
  W.decir(A, `/dar ${W.nombre(C)} Moderación`); W.pump(3);
  assert.equal(C.dados.interruptor.estado.puede, true, "a moderator (manage-rituals by role)");
  W.poner(A, 10, 0); W.poner(B, 11, 0); W.poner(C, 20, 20); W.poner(D, 30, 30);
  assert.deepEqual(A.baculo.interruptor.poner(true), { ok: true }); W.pump(4);
  assert.equal(A.baculo.lista().length, 1);
  // the holder of the staff may, with no role; when they drop it, they may not
  B.baculo.coger("b1"); W.pump(3);
  const pos = B.baculo.lista()[0];
  assert.equal(pos.portador, B.s.entity);
  assert.equal(B.baculo.interruptor.estado.puede, true, "holding the staff lends `dirigir`, and so the switch");
  assert.equal(D.baculo.interruptor.estado.puede, false);
  assert.deepEqual(B.dados.interruptor.poner(true), { ok: true }); W.pump(4);
  assert.equal(D.dados.interruptor.activa(), true, "the holder turned the dice on for everyone");
  W.decir(B, "/baculo soltar"); W.pump(3);
  assert.equal(B.baculo.interruptor.estado.puede, false);
  assert.deepEqual(B.dados.interruptor.poner(false), { ok: true }); W.pump(3);
  assert.equal(D.dados.interruptor.activa(), true, "refused: they no longer direct");
});

test("interruptor báculo: first time with no places, the staff and its pedestal appear beside who turns it on and baculos.json is written; off sends the held staff home", () => {
  const W = mundoInterruptor(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.decir(A, `/dueño ${ADMIN}`);
  W.poner(A, 20, 5); W.poner(B, 21, 5);
  W.pump(3);
  assert.deepEqual(A.baculo.interruptor.poner(true), { ok: true }); W.pump(4);
  const escrito = W.archivos.get("baculos.json") as { schema: string; activa: boolean; cantidad: number; sitios: { x: number; z: number }[] };
  assert.equal(escrito.schema, "numinia-engine/baculos@1");
  assert.equal(escrito.activa, true);
  assert.deepEqual(escrito.sitios, [{ x: 21.5, z: 5, y: 0 }], "beside who turned it on");
  const b = B.baculo.lista()[0];
  assert.deepEqual([b.hx, b.hz, b.portador], [21.5, 5, LIBRE]);
  // B takes it, then A turns it off: B's staff goes home, nobody directs, the places stay in the file
  B.baculo.coger("b1"); W.pump(3);
  assert.equal(B.dj.estado.puede, true);
  assert.deepEqual(A.baculo.interruptor.poner(false), { ok: true }); W.pump(4);
  assert.equal(B.baculo.lista().length, 0, "gone");
  assert.equal(B.dj.estado.puede, false, "the loan ended with the staff in B's hand");
  const apagado = W.archivos.get("baculos.json") as { activa: boolean; sitios: unknown[] };
  assert.equal(apagado.activa, false);
  assert.equal(apagado.sitios.length, 1, "the places are kept");
  assert.match(W.log.join("\n"), /apaga los báculos/);
  // back on: the same place, no new one
  assert.deepEqual(A.baculo.interruptor.poner(true), { ok: true }); W.pump(4);
  assert.deepEqual([B.baculo.lista()[0].hx, B.baculo.lista()[0].portador], [21.5, LIBRE]);
  assert.equal((W.archivos.get("baculos.json") as { sitios: unknown[] }).sitios.length, 1);
  assert.deepEqual(A.baculo.interruptor.poner(true), { ok: true }); W.pump(3);
  assert.match(A.rech.at(-1)!, /ya están encendidos/);
});

test("interruptor dados: first time, a tower beside who turns it on and dados.json written; off removes towers and /tirar; a saved tower's rolls do not change", () => {
  const W = mundoInterruptor(2);
  const [A, B] = W.gente;
  W.pump(4);
  W.decir(A, `/dueño ${ADMIN}`);
  W.poner(A, 20, 5); W.poner(B, 21, 5);
  assert.deepEqual(A.dados.interruptor.poner(true), { ok: true }); W.pump(4);
  const escrito = W.archivos.get("dados.json") as { activa: boolean; torres: { id: string; x: number; z: number; dados: string }[] };
  assert.equal(escrito.activa, true);
  assert.deepEqual([escrito.torres[0].x, escrito.torres[0].z, escrito.torres[0].dados], [21.5, 5, "1d20"]);
  assert.equal(B.dados.torres().length, 1);
  assert.equal(B.dados.interruptor.activa(), true, "everyone is told");
  W.decir(B, "/tirar 2d6");
  assert.equal(B.dados.ultima()?.dados, "2d6", "rolling works while on");
  assert.deepEqual(A.dados.interruptor.poner(false), { ok: true }); W.pump(4);
  assert.equal(B.dados.torres().length, 0);
  assert.equal(B.dados.interruptor.activa(), false);
  W.decir(B, "/tirar 2d6");
  assert.match(B.rech.at(-1)!, /Los dados están apagados/);
  const off = W.archivos.get("dados.json") as { activa: boolean; torres: unknown[] };
  assert.equal(off.activa, false); assert.deepEqual(off.torres, escrito.torres, "the towers are kept exactly");
  assert.deepEqual(A.dados.interruptor.poner(true), { ok: true }); W.pump(4);
  assert.equal(B.dados.torres()[0].dados, "1d20", "the tower's own dice are as they were");
  assert.deepEqual((W.archivos.get("dados.json") as { torres: unknown[] }).torres, escrito.torres);
});

test("interruptor: the state survives a restart (from the files), and an existing world with towers and no `activa` is still ON", () => {
  const W = mundoInterruptor(2);
  const [A] = W.gente;
  W.pump(4);
  W.decir(A, `/dueño ${ADMIN}`); W.poner(A, 0, 0);
  A.baculo.interruptor.poner(true); A.dados.interruptor.poner(true); W.pump(4);
  A.baculo.interruptor.poner(false); W.pump(3);
  const archivos = W.archivos;
  const R = mundoInterruptor(1, archivos); // restart: new server, same folder
  R.pump(4);
  assert.equal(R.gente[0].baculo.lista().length, 0, "the staff was off");
  assert.equal(R.gente[0].dados.torres().length, 1, "the dice were on");
  assert.equal(R.gente[0].dados.interruptor.activa(), true);
  // a world made before the switch: a dados.json with towers and no `activa` = on; no baculos.json = off
  const viejo = mundoInterruptor(1, new Map(), { iniciales: { "dados.json": { torres: [{ id: "mesa", nombre: "Mesa", x: 1, z: 1 }] } } });
  viejo.pump(4);
  assert.equal(viejo.gente[0].dados.torres().length, 1);
  assert.equal(viejo.gente[0].baculo.lista().length, 0);
});

test("interruptor: without a folder to write (no files), the switch lasts through a restart by the server's store; a broken file is not overwritten", () => {
  const roto = new Map<string, unknown>([["baculos.json", "esto no es un objeto"]]);
  const io = { leer: (f: string) => roto.get(f), escribir: (f: string, d: unknown) => { roto.set(f, d); } };
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer, crearEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "hierba" } }), crearBaculo(null, io)], log: (l) => log.push(l), identitySign: sign, puede: () => true });
  const t = inst.join(0), c = crearCliente(), s = new ClientSession(t, { features: [c.parts[0]], identity: keeper() });
  for (let i = 0; i < 6; i++) { t.flush(); inst.tick(); t.flush(); }
  c.baculo.interruptor.poner(true);
  for (let i = 0; i < 6; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.equal(c.baculo.lista().length, 0, "refused");
  assert.equal(roto.get("baculos.json"), "esto no es un objeto", "kept verbatim");
  assert.match(c.baculo.interruptor.estado.ultimoRechazo, /baculos\.json no es un objeto JSON/);
  void s;
});
