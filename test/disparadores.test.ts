// D-041 «el cable» (disparadores), stories 1-2 — headless (in-memory world, pages pumped by 20 Hz ticks). The server
// reads the world's disparadores.json line by line, watches zones, checks presses, counts cooldowns and «one use only»,
// and emits one server-only `accion` per receiver; features/objetos answers `muestra` / `oculta` end to end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import type { PlacedObject } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { disparadores, DISPARADORES_MAX, RECEPTORES_MAX, TICK_HZ } from "../features/disparadores/feature.ts";
import { crearDisparadores, leerDisparador, leerDisparadores, leerReceptor } from "../features/disparadores/server.ts";
import { crearCliente as clienteDisparadores, tapa } from "../features/disparadores/client.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente as clienteObjetos } from "../features/objetos/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";
import limits from "../limits.json" with { type: "json" };

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const BOTON = { id: "rojo", nombre: "Botón rojo", tipo: "boton", x: 12, z: 0, frase: "E: pulsar", cooldown: 1, receptores: [{ accion: "muestra", objeto: "Farola" }] };
const ZONA = { id: "umbral", nombre: "Umbral", tipo: "zona", x: -20, z: 0, radio: 3, un_solo_uso: true, receptores: [{ accion: "oculta", objeto: "Farola" }, { accion: "teletransporta", x: 1, y: 0, z: 2 }] };

function mundo(n: number, lista: unknown[] = [BOTON, ZONA]) {
  const log: string[] = [];
  const leido = leerDisparadores({ disparadores: lista });
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearObjetos(), crearDisparadores({ disparadores: leido.disparadores })], log: (l) => log.push(l), identitySign: sign, puede: (_w, accion) => accion === "construir" });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), d = clienteDisparadores(), o = clienteObjetos();
    const placed = new Map<string, PlacedObject | null>();
    const s = new ClientSession(t, { identity: keeper(), features: [...d.parts, o.part], view: { label() {}, bounce() {}, place: (k, x) => { placed.set(k, x); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
    return { t, s, d: d.disparadores, o: o.constructor, placed };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log, problemas: leido.problemas };
}
const eventos = (s: ClientSession, f: string, ev: string) => s.features.log.filter((l) => l.feature === f && l.event === ev);
const farola = (s: ClientSession) => { for (const [k, v] of s.features.stateOf("objetos")) if (v.nombre === "Farola") return { id: k, ...v }; return null; };

test("D-041: the declaration meets the plug's rules, is in both lists, and limits.json publishes the piece", () => {
  assert.deepEqual(disparadores.issues, []);
  assert.ok(funciones.some((x) => x.feature.id === "disparadores"), "in features/servidor.ts");
  assert.ok(paginas.some((x) => x.feature.id === "disparadores"), "in features/cliente.ts");
  assert.equal(disparadores.state?.card?.interact?.intent, "pulsar");
  const row = (limits as { features: { id: string; test?: string }[] }).features.find((c) => c.id === "cable_disparadores");
  assert.equal(row?.test, "test/disparadores.test.ts");
});

test("D-041: each line of disparadores.json is checked, and a bad one is left out with its reason", () => {
  assert.match(String(leerDisparador({ id: "Rojo!", tipo: "boton", x: 0, z: 0, receptores: [{ accion: "suena", sonido: "din" }] })), /minúsculas/);
  assert.match(String(leerDisparador({ id: "ok", tipo: "palanca", x: 0, z: 0, receptores: [] })), /tipo/);
  assert.match(String(leerDisparador({ id: "ok", tipo: "zona", x: "no", z: 0, receptores: [] })), /x y z/);
  assert.match(String(leerDisparador({ id: "ok", tipo: "zona", x: 0, z: 0 })), /receptores/);
  assert.match(String(leerDisparador({ id: "ok", tipo: "zona", x: 0, z: 0, receptores: [{ accion: "explota" }] })), /receptor 1: accion «explota»/);
  assert.match(String(leerDisparador({ id: "ok", tipo: "zona", x: 0, z: 0, receptores: Array.from({ length: RECEPTORES_MAX + 1 }, () => ({ accion: "suena", sonido: "din" })) })), /más de/);
  assert.match(String(leerReceptor({ accion: "abre_enlace", enlace: "http://x" })), /https/);
  assert.match(String(leerReceptor({ accion: "da_paso", mision: "La Misión" })), /mision/);
  assert.match(String(leerReceptor({ accion: "muestra" })), /objeto/);
  assert.deepEqual(leerReceptor({ accion: "teletransporta", x: 9999, z: 2 }), { accion: "teletransporta", x: 2000, y: 0, z: 2 });
  const d = leerDisparador({ id: "ok", tipo: "boton", x: 1, z: 2, radio: 99, cooldown: 99999, un_solo_uso: "sí", receptores: [{ accion: "suena", sonido: "din" }] });
  assert.ok(typeof d === "object");
  assert.deepEqual({ alcance: d.alcance, radio: d.radio, cooldown: d.cooldown, unSoloUso: d.unSoloUso, frase: d.frase }, { alcance: 16, radio: 0.5, cooldown: 3600, unSoloUso: false, frase: "pulsar Botón" });
  // the whole file: wrong shape, repeated ids, the cap
  assert.match(leerDisparadores({ nada: 1 }).problemas[0], /no tiene una lista "disparadores"/);
  const dos = leerDisparadores({ disparadores: [BOTON, BOTON, { id: "mal" }] });
  assert.equal(dos.disparadores.length, 1); assert.equal(dos.problemas.length, 2); assert.match(dos.problemas[0], /repetido/);
  const muchos = leerDisparadores({ disparadores: Array.from({ length: DISPARADORES_MAX + 1 }, (_, i) => ({ ...BOTON, id: `b${i}` })) });
  assert.equal(muchos.disparadores.length, DISPARADORES_MAX); assert.match(muchos.problemas[0], /más de/);
});

test("D-041: conMundo reads disparadores.json and logs every line left out; no file = no trigger", () => {
  const log: string[] = [];
  const partes = conMundo(funciones, (f) => (f === "disparadores.json" ? { disparadores: [BOTON, { id: "mal", tipo: "zona" }] } : undefined), (l) => log.push(l));
  assert.equal(partes.length, funciones.length);
  assert.ok(log.some((l) => /disparadores\.json: «mal»: x y z en metros: no se pone/.test(l)), log.join("\n"));
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: partes.filter((p) => p.feature.id === "disparadores"), log: (l) => log.push(l) });
  inst.tick();
  assert.ok(log.some((l) => /disparadores: 1 disparador/.test(l)), log.join("\n"));
  const log2: string[] = [];
  const sin = conMundo(funciones, () => undefined, (l) => log2.push(l));
  assert.equal(sin.find((p) => p.feature.id === "disparadores"), funciones.find((p) => p.feature.id === "disparadores"), "no file: the house part (no trigger)");
  assert.equal(log2.filter((l) => /disparadores/.test(l)).length, 0);
});

test("D-041 button: pressed from close by, refused from afar, cooldown says «todavía no», and its receiver shows the object", () => {
  const { pages: [a, b], pump, place, log } = mundo(2);
  pump(3);
  // a lamp the world's builder hid; the cable shows it
  assert.ok(a.o.colocar("bloque").ok); pump(2);
  const id = a.o.estado.seleccionado!;
  a.s.features.send("objetos", "nombrar", { id, nombre: "Farola", decorado: false }); pump(2);
  a.s.features.send("objetos", "ajustar", { id, oculto: true, volumen: 1, solido: false, bx0: 0, by0: 0, bz0: 0, bx1: 0, by1: 0, bz1: 0, alcance: "burbuja", radio: 8 }); pump(2);
  assert.equal(farola(b.s)?.oculto, true);
  place(a.s.entity, 12.5, 0.5); place(b.s.entity, 6, 2); pump(4);
  assert.equal(a.s.features.reachable(12.5, 0.5)[0]?.prompt, "E: pulsar", "the page offers the world's own phrase");
  assert.ok(b.d.pulsar("rojo").ok); pump(3);
  assert.match(String(eventos(b.s, "disparadores", "rechazado").at(-1)?.msg.motivo), /Acércate/);
  assert.equal(b.d.lista()[0].usos, 0, "b is 6 m away: nothing fired");
  assert.ok(a.s.features.use("disparadores", "rojo").ok, "the same path an agent takes"); pump(3);
  const bt = a.d.lista().find((d) => d.id === "rojo")!;
  assert.equal(bt.usos, 1); assert.equal(bt.enEspera, true);
  assert.equal(eventos(b.s, "disparadores", "disparado").length, 1, "b, near, hears it");
  assert.equal(eventos(b.s, "disparadores", "senal").length + eventos(b.s, "disparadores", "accion").length, 0, "server-only events never reach a page");
  assert.equal(farola(b.s)?.oculto, false, "the receiver `muestra` showed the lamp to everyone");
  assert.ok(a.placed.get(`disparadores:rojo`) && (a.placed.get("disparadores:rojo") as PlacedObject).y < tapa({ x: 12, y: 0, z: 0, enEspera: false, agotado: false }).y, "the cap sinks while waiting");
  assert.ok(a.d.pulsar("rojo").ok); pump(2);
  assert.match(String(eventos(a.s, "disparadores", "rechazado").at(-1)?.msg.motivo), /Todavía no/);
  assert.equal(a.d.lista().find((d) => d.id === "rojo")!.usos, 1);
  pump(TICK_HZ + 2);
  assert.equal(a.d.lista().find((d) => d.id === "rojo")!.enEspera, false, "cooldown over");
  assert.ok(a.d.pulsar("rojo").ok); pump(2);
  assert.equal(a.d.lista().find((d) => d.id === "rojo")!.usos, 2);
  assert.ok(log.some((l) => /\[disparadores\] .* pulsa Botón rojo \(1\)/.test(l)), log.join("\n"));
});

test("D-041 zone: entering fires once per entry, one use only spends it, a receiver nobody owns is logged", () => {
  const { pages: [a, b], pump, place, log } = mundo(2);
  pump(3);
  assert.ok(a.o.colocar("bloque").ok); pump(2);
  a.s.features.send("objetos", "nombrar", { id: a.o.estado.seleccionado!, nombre: "Farola", decorado: false }); pump(2);
  assert.equal(farola(b.s)?.oculto, false);
  assert.equal(a.s.features.reachable(-20, 0).length, 0, "a zone is never offered as «E:»");
  place(b.s.entity, -40, 0); place(a.s.entity, -19, 1); pump(3);
  const z = () => a.d.lista().find((d) => d.id === "umbral")!;
  assert.equal(z().usos, 1); assert.equal(z().agotado, true);
  assert.match(String(eventos(a.s, "disparadores", "disparado").at(-1)?.msg.texto), / entra en Umbral$/);
  assert.equal(eventos(b.s, "disparadores", "disparado").length, 1, "b, 20 m away, hears it (CERCA_M)");
  assert.equal(farola(b.s)?.oculto, true, "the receiver `oculta` hid the lamp");
  assert.ok(log.some((l) => /nadie hace «teletransporta»/.test(l)), "the receiver of a later story is said, not dropped");
  // leave and come back: spent
  place(a.s.entity, 0, 0); pump(2); place(a.s.entity, -20, 0); pump(3);
  assert.equal(z().usos, 1, "one use only");
  assert.equal(eventos(a.s, "disparadores", "rechazado").length, 0, "a zone never nags");
});

test("D-041: the simulation never hears of it (its fingerprint is the same with and without the cable)", () => {
  const con = mundo(2), sin = (() => { const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer], identitySign: sign }); const ts = [inst.join(0), inst.join(1)]; return { inst, pump: (n = 2) => { for (let i = 0; i < n; i++) { for (const t of ts) t.flush(); inst.tick(); for (const t of ts) t.flush(); } }, place: (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); } }; })();
  con.pump(3); sin.pump(3);
  con.place(con.pages[0].s.entity, 12.5, 0.5); sin.place(con.pages[0].s.entity, 12.5, 0.5); con.pump(2); sin.pump(2);
  con.pages[0].d.pulsar("rojo"); con.pump(4); sin.pump(4);
  con.place(con.pages[0].s.entity, -20, 0); sin.place(con.pages[0].s.entity, -20, 0); con.pump(4); sin.pump(4);
  assert.equal(con.inst.hash(), sin.inst.hash());
});
