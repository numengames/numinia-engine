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
import { crearDisparadores, leerDisparador, leerDisparadores, leerReceptor, serializarDisparadores } from "../features/disparadores/server.ts";
import { crearCliente as clienteDisparadores, tapa } from "../features/disparadores/client.ts";
import { crearObjetos } from "../features/objetos/server.ts";
// S6: la acción «suena» del cable ya no la resuelve el cable: la oye la pieza `sonido`, que busca el nombre en el
// catálogo de la casa (los siete avisos de siempre siguen valiendo) y manda `sonido.suena` con su fichero y su texto.
import { crearSonido } from "../features/sonido/server.ts";
import { crearCliente as clienteSonido } from "../features/sonido/client.ts";
import { crearCliente as clienteObjetos } from "../features/objetos/client.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearSuelo } from "../features/suelo/server.ts";
import { crearMovedores } from "../features/movedores/server.ts";
import { crearCliente as clienteMovedores } from "../features/movedores/client.ts";
import type { MovedorFichero } from "../features/movedores/feature.ts";
import { crearCerradura } from "../features/cerradura/server.ts";
import { crearCliente as clienteCerradura } from "../features/cerradura/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";
import limits from "../limits.json" with { type: "json" };

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const BOTON = { id: "rojo", nombre: "Botón rojo", tipo: "boton", x: 12, z: 0, frase: "E: pulsar", cooldown: 1, receptores: [{ accion: "muestra", objeto: "Farola" }] };
const ZONA = { id: "umbral", nombre: "Umbral", tipo: "zona", x: -20, z: 0, radio: 3, un_solo_uso: true, receptores: [{ accion: "oculta", objeto: "Farola" }, { accion: "teletransporta", x: 1, y: 0, z: 2 }] };

function mundo(n: number, lista: unknown[] = [BOTON, ZONA], opts: { puede?: (e: number) => boolean; escribir?: (disparadores: ReturnType<typeof leerDisparadores>["disparadores"]) => void } = {}) {
  const log: string[] = [];
  const leido = leerDisparadores({ disparadores: lista });
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearObjetos(), crearDisparadores({ disparadores: leido.disparadores, escribir: opts.escribir })], log: (l) => log.push(l), identitySign: sign, puede: (_w, accion, e) => accion === "construir" && (opts.puede ? opts.puede(e) : true) });
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
  assert.deepEqual(leerReceptor({ accion: "vuelve_a_seguro" }), { accion: "vuelve_a_seguro" });
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

test("D-041 zone: entering fires once per entry, one use only spends it, and its receivers (oculta, teletransporta) both run", () => {
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
  // D-041 historia 3: the zone's other receiver, `teletransporta`, really moves whoever entered
  assert.equal(eventos(a.s, "disparadores", "teletransportado").length, 1, "the receiver `teletransporta` really moved a");
  const ta = eventos(a.s, "disparadores", "teletransportado").at(-1)!.msg;
  assert.ok(Math.abs(Number(ta.x) - 1) <= 2 && Math.abs(Number(ta.z) - 2) <= 2, `landed near (1, 2): got (${ta.x}, ${ta.z})`);
  assert.equal(eventos(b.s, "disparadores", "teletransportado").length, 0, "only the one who entered is moved");
  // leave and come back: spent
  place(a.s.entity, 0, 0); pump(2); place(a.s.entity, -20, 0); pump(3);
  assert.equal(z().usos, 1, "one use only");
  assert.equal(eventos(a.s, "disparadores", "rechazado").length, 0, "a zone never nags");
});

test("D-041: the cable's bookkeeping never touches the simulation (same fingerprint with and without it, a trigger that only shows/hides an object)", () => {
  const con = mundo(2, [BOTON]), sin = (() => { const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer], identitySign: sign }); const ts = [inst.join(0), inst.join(1)]; return { inst, pump: (n = 2) => { for (let i = 0; i < n; i++) { for (const t of ts) t.flush(); inst.tick(); for (const t of ts) t.flush(); } }, place: (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); } }; })();
  con.pump(3); sin.pump(3);
  con.place(con.pages[0].s.entity, 12.5, 0.5); sin.place(con.pages[0].s.entity, 12.5, 0.5); con.pump(2); sin.pump(2);
  con.pages[0].d.pulsar("rojo"); con.pump(4); sin.pump(4);
  con.place(con.pages[0].s.entity, -20, 0); sin.place(con.pages[0].s.entity, -20, 0); con.pump(4); sin.pump(4);
  assert.equal(con.inst.hash(), sin.inst.hash());
});

test("D-041 historia 4: da_paso starts and jumps a mission, abre_enlace asks the presser, suena reaches who is near, vuelve_a_seguro asks the instance", () => {
  const MIS = {
    formato: "mision@1", id: "m1", titulo: "Prueba", descripcion: "d",
    textos: { aceptada: "Vamos", completada: "Fin" },
    pasos: [
      { id: "p0", tipo: "llega_a", texto: "Paso 1", x: 0, z: 0, lugar: "aquí" },
      { id: "p1", tipo: "llega_a", texto: "Paso 2", x: 0, z: 0, lugar: "aquí" },
    ],
  };
  const leido = leerDisparadores({
    disparadores: [{
      id: "cable", nombre: "Cable", tipo: "boton", x: 0, z: 0, receptores: [
        { accion: "da_paso", mision: "m1", paso: 2 },
        { accion: "abre_enlace", enlace: "https://numen.games" },
        { accion: "suena", sonido: "campana" },
        { accion: "vuelve_a_seguro" },
      ],
    }],
  });
  const inst = new Instance({
    seed: 1, capacity: 8, k: 50, snapshotEvery: 2,
    features: [
      chatServer,
      ...crearMisiones({ aventura: { misiones: [{ fichero: "m1.json", texto: JSON.stringify(MIS) }], pnj: [], cosas: [] } }),
      crearSuelo({ minimo: -500 }),
      crearDisparadores({ disparadores: leido.disparadores }),
      crearSonido(),
    ],
    identitySign: sign,
  });
  const t = inst.join(0);
  inst.sim.tf.cols.x[t.id ?? 0] = fx(0); inst.sim.tf.cols.z[t.id ?? 0] = fx(0); // next to the button (default spawn is far off)
  const d = clienteDisparadores(), son = clienteSonido();
  const s = new ClientSession(t, { identity: keeper(), features: [...d.parts, son.part], view: { label() {}, bounce() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0 }) } });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(3);
  assert.ok(d.disparadores.pulsar("cable").ok); pump(3);
  // da_paso: a mission with no prior progress is taken and jumped straight to its last step (so it completes)
  assert.equal(eventos(s, "misiones", "aceptada").length, 1, "da_paso takes the quest first");
  assert.equal(eventos(s, "misiones", "completada").length, 1, "paso 2 of a 2-step quest completes it");
  // abre_enlace: only the presser is asked (never a broadcast)
  assert.equal(eventos(s, "disparadores", "enlace").length, 1);
  assert.equal(eventos(s, "disparadores", "enlace").at(-1)?.msg.enlace, "https://numen.games");
  // suena (S6): the sound piece owns it now — the house name «campana» resolves to its catalogue id, with its seed
  // and its accessible text, and reaches whoever is near. The cable itself no longer emits any sound event.
  assert.equal(eventos(s, "disparadores", "sonido").length, 0, "el cable ya no resuelve «suena» por su cuenta");
  const son2 = eventos(s, "sonido", "suena");
  assert.equal(son2.length, 1);
  assert.equal(son2.at(-1)?.msg.sonido, "ui-cuenta-atras"); // «campana» es el nombre de casa; el fichero es ui-cuenta-atras
  assert.ok(Number(son2.at(-1)?.msg.semilla) >= 0, "el servidor manda la semilla");
  assert.ok(String(son2.at(-1)?.msg.texto).length > 3, "y el texto para quien no oye");
  // vuelve_a_seguro: the instance answered without throwing (suelo narrates it even without sueloMinimo)
  assert.doesNotThrow(() => d.disparadores.pulsar("cable"));
});

test("D-041 historias 5-6: the page sees a trigger's receivers (JSON in the state, not a secret) and a builder edits them live", () => {
  const { pages: [a], pump } = mundo(1, [BOTON]);
  pump(3);
  const d = () => a.d.lista().find((x) => x.id === "rojo")!;
  assert.deepEqual(d().receptores, [{ accion: "muestra", objeto: "Farola" }], "the state already carries the wired receivers");
  const r = a.d.editarReceptores("rojo", [{ accion: "suena", sonido: "din" }, { accion: "vuelve_a_seguro" }]);
  assert.ok(r.ok, JSON.stringify(r));
  pump(3);
  assert.deepEqual(d().receptores, [{ accion: "suena", sonido: "din" }, { accion: "vuelve_a_seguro" }], "everyone sees the new wiring at once");
  assert.equal(eventos(a.s, "disparadores", "editado").length, 1, "the editor is told it was done");
});

test("D-041 historias 5-6: editing receivers is refused to anyone who may not build, for a trigger that does not exist, or for a bad receiver", () => {
  let puedeConstruir = true;
  const { pages: [a], pump } = mundo(1, [BOTON], { puede: () => puedeConstruir });
  pump(3);
  const antes = a.d.lista().find((x) => x.id === "rojo")!.receptores;
  // a bad receiver (unknown accion): the whole edit is refused, nothing changes
  assert.ok(a.d.editarReceptores("rojo", [{ accion: "explota" }]).ok, "the client only validates the message's own shape"); pump(3);
  assert.match(String(eventos(a.s, "disparadores", "rechazado").at(-1)?.msg.motivo), /accion «explota»/);
  assert.deepEqual(a.d.lista().find((x) => x.id === "rojo")!.receptores, antes, "a bad receiver drops the whole edit");
  // an id that is not wired
  a.d.editarReceptores("no-existe", [{ accion: "suena", sonido: "din" }]); pump(3);
  assert.match(String(eventos(a.s, "disparadores", "rechazado").at(-1)?.msg.motivo), /No hay ningún disparador/);
  // nobody may build in this instance: even a well-formed edit is refused
  puedeConstruir = false;
  a.d.editarReceptores("rojo", [{ accion: "suena", sonido: "din" }]); pump(3);
  assert.match(String(eventos(a.s, "disparadores", "rechazado").at(-1)?.msg.motivo), /No puedes construir/);
  assert.deepEqual(a.d.lista().find((x) => x.id === "rojo")!.receptores, antes, "refused: the wiring did not change");
  assert.equal(eventos(a.s, "disparadores", "editado").length, 0, "nothing was ever accepted in this test");
});

test("D-041 historias 5-6: an accepted edit rewrites disparadores.json on disk, in the shape leerDisparadores reads back", () => {
  const escrituras: ReturnType<typeof leerDisparadores>["disparadores"][] = [];
  const { pages: [a], pump } = mundo(1, [BOTON], { escribir: (ds) => escrituras.push(ds) });
  pump(3);
  a.d.editarReceptores("rojo", [{ accion: "oculta", objeto: "Farola" }]); pump(3);
  assert.equal(eventos(a.s, "disparadores", "editado").length, 1, "the edit was accepted");
  assert.equal(escrituras.length, 1, "one write per accepted edit");
  const crudo = serializarDisparadores(escrituras[0]);
  const releido = leerDisparadores(crudo);
  assert.equal(releido.problemas.length, 0, releido.problemas.join("; "));
  assert.deepEqual(releido.disparadores.find((d) => d.id === "rojo")?.receptores, [{ accion: "oculta", objeto: "Farola" }]);
});

test("D-041 h5: leerDisparador accepts tipo «senal» (needs a senal name, not x/z) and leerReceptor accepts «mueve»", () => {
  assert.match(String(leerDisparador({ id: "s1", tipo: "senal", receptores: [{ accion: "mueve", objeto: "plat1" }] })), /senal/);
  const ok = leerDisparador({ id: "s1", tipo: "senal", senal: "puerta-llega", receptores: [{ accion: "mueve", objeto: "plat1" }] });
  assert.equal(typeof ok, "object"); assert.deepEqual((ok as { senal: string }).senal, "puerta-llega");
  assert.match(String(leerReceptor({ accion: "mueve" })), /mueve.*objeto/);
  assert.deepEqual(leerReceptor({ accion: "mueve", objeto: "plat1" }), { accion: "mueve", objeto: "plat1" });
});

test("D-041 h5: the receiver «mueve» drives an interruptor movedor from a button, with no distance check", () => {
  const PUERTA: MovedorFichero = { id: "puerta1", nombre: "Puerta", modelo: "hash", tipo: "interruptor", ax: 0, ay: 0, az: 10, arx: 0, ary: 0, arz: 0, bx: 2, by: 0, bz: 10, brx: 0, bry: 0, brz: 0, sx: 1, sy: 1, sz: 1, duracion: 1, espera: 0, radio: 2.5, evento: "", empiezaEn: "a" };
  const BOTON_MUEVE = { id: "palanca", nombre: "Palanca", tipo: "boton", x: 0, z: 0, receptores: [{ accion: "mueve", objeto: "puerta1" }] };
  const leido = leerDisparadores({ disparadores: [BOTON_MUEVE] });
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer, crearMovedores({ movedores: [PUERTA] }), crearDisparadores({ disparadores: leido.disparadores })], log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0);
  inst.sim.tf.cols.x[t.id ?? 0] = fx(0); inst.sim.tf.cols.z[t.id ?? 0] = fx(0); // next to the button; the movedor itself is 10 m away
  const d = clienteDisparadores(), m = clienteMovedores();
  const s = new ClientSession(t, { identity: keeper(), features: [...d.parts, ...m.parts], view: { label() {}, bounce() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0 }) } });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(3);
  assert.equal(m.movedores.uno("puerta1")!.marcha, false);
  assert.ok(d.disparadores.pulsar("palanca").ok); pump(3);
  assert.equal(m.movedores.uno("puerta1")!.marcha, true, "mueve moved it even though the player never went near the movedor (only near the button)");
  pump(20); // duracion = 1 s
  assert.equal(m.movedores.uno("puerta1")!.lado, "b");
});

test("D-041 h5: a lock that opens fires the cable's «senal» (cerradura.abierta.evento), which runs its receiver", () => {
  const SENAL_DISP = { id: "s-abre", nombre: "Al abrir", tipo: "senal", senal: "cofre-abierto", receptores: [{ accion: "suena", sonido: "campana" }] };
  const leido = leerDisparadores({ disparadores: [SENAL_DISP] });
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer, crearCerradura(), crearDisparadores({ disparadores: leido.disparadores }), crearSonido()], log: (l) => log.push(l), identitySign: sign, puede: () => true });
  const t = inst.join(0);
  const dCli = clienteDisparadores(), cCli = clienteCerradura(), sCli = clienteSonido();
  const s = new ClientSession(t, { identity: keeper(), features: [...dCli.parts, cCli.part, sCli.part] });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(2);
  cCli.cerradura.poner({ id: "cofre", metodo: "codigo", codigo: "1234", nombre: "Cofre", x: 0, z: 0, evento: "cofre-abierto" }); pump(2);
  cCli.cerradura.abrir("cofre", "1234"); pump(3);
  assert.equal(cCli.cerradura.estado.ultimaAbierta, "cofre");
  // S6: el receptor del disparador por señal suena, y lo que llega es el fichero del catálogo (campana → cuenta atrás)
  assert.equal(eventos(s, "sonido", "suena").length, 1, "the senal disparador fired its own receiver (suena)");
  assert.equal(eventos(s, "sonido", "suena").at(-1)?.msg.sonido, "ui-cuenta-atras");
});

test("D-041 h5: a movedor's arrival fires the cable's «senal» (movedores.llegada.evento)", () => {
  const PLAT: MovedorFichero = { id: "plat1", nombre: "Plataforma", modelo: "hash", tipo: "vaiven", ax: 0, ay: 0, az: 0, arx: 0, ary: 0, arz: 0, bx: 0, by: 2, bz: 0, brx: 0, bry: 0, brz: 0, sx: 1, sy: 1, sz: 1, duracion: 0.2, espera: 0, radio: 2.5, evento: "plat-llega", empiezaEn: "a" };
  const SENAL_DISP = { id: "s-llega", nombre: "Al llegar", tipo: "senal", senal: "plat-llega", un_solo_uso: true, receptores: [{ accion: "suena", sonido: "paso" }] };
  const leido = leerDisparadores({ disparadores: [SENAL_DISP] });
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [chatServer, crearMovedores({ movedores: [PLAT] }), crearDisparadores({ disparadores: leido.disparadores }), crearSonido()], log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0);
  const dCli = clienteDisparadores(), sCli = clienteSonido();
  const s = new ClientSession(t, { identity: keeper(), features: [...dCli.parts, sCli.part] });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(10); // vaiven rides A→B on its own (duracion 0.2 s = 4 ticks)
  assert.equal(eventos(s, "sonido", "suena").length, 1, "the movedor's own arrival rang the cable, no button or zone involved");
  assert.equal(eventos(s, "sonido", "suena").at(-1)?.msg.sonido, "ui-pulsar"); // S6: «paso» es el nombre de casa; el fichero es ui-pulsar
});
