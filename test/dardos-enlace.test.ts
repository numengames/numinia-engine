// dardos enlazados (E1): a page of ANY world plays the remote board of another one (the Alchemist Tower) from its AR wall.
// Here, headless: the setting (what a world's dardos.json says), the link's state machine, and the server side — a «visita de enlace»
// is no avatar for anybody, hears only the darts, cannot walk, and still plays the `remoto` board like anyone (the gate of the
// conditions of entry included). The two-server, two-browser run is tools/e2e-piernas/dardos-enlace.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { MSG, FUNCIONES_DE_ENLACE, direccionDeEnlace, esVisitaDeEnlace, encodeInput } from "../packages/net/src/index.ts";
import { crearPuertaCondiciones } from "../packages/server/src/condiciones-puerta.ts";
import type { Condiciones } from "../packages/server/src/condiciones.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { FUERZA_IDEAL } from "../features/dardos/feature.ts";
import { crearDardos } from "../features/dardos/server.ts";
import type { Sitio } from "../features/dardos/server.ts";
import { ENLACE_DARDOS, ajusteDeEstado, anfitrionDe, claveInvitado, direccionDeEstado, enlaceVigente, leerEnlace, leerServidor, limpiarNombreMundo } from "../features/dardos/enlace.ts";
import { enlaceDardosDelMundo } from "../features/mundo.ts";
import { crearEnlaceDardos, estadoEnlace } from "../apps/plaza/dardos-enlace.ts";
import type { Hechos } from "../apps/plaza/dardos-enlace.ts";
import { etiquetaPared } from "../packages/render/src/dardos-duelo-plaza.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the setting

test("enlace: the house link is one constant; a world's dardos.json may change it, turn it off, or say nothing", () => {
  assert.deepEqual({ ...ENLACE_DARDOS }, { servidor: "wss://alchemiststower.numinia.com/ws", diana: "torre", nombre: "la Torre de los Alquimistas" });
  assert.throws(() => { (ENLACE_DARDOS as { diana: string }).diana = "otra"; }, "frozen: nobody edits the house link by accident");
  for (const crudo of [undefined, null, {}, { sitios: [] }, { enlace: undefined }, { enlace: true }]) {
    const r = leerEnlace(crudo); assert.equal(r.ok, true); assert.equal(r.origen, "casa"); assert.deepEqual(r.value, { ...ENLACE_DARDOS });
  }
  const off = leerEnlace({ enlace: false }); assert.deepEqual([off.ok, off.value, off.origen], [true, null, "apagado"]);
  const otro = leerEnlace({ enlace: { servidor: "ws://127.0.0.1:8913/ws", diana: "torre-2" } });
  assert.deepEqual([otro.ok, otro.origen, otro.value], [true, "mundo", { servidor: "ws://127.0.0.1:8913/ws", diana: "torre-2" }], "another server does not inherit the Tower's name");
  const media = leerEnlace({ enlace: { diana: "mesa" } }); assert.deepEqual(media.value, { servidor: ENLACE_DARDOS.servidor, diana: "mesa", nombre: ENLACE_DARDOS.nombre }, "a part left out is the house's");
  const conNombre = leerEnlace({ enlace: { servidor: "ws://127.0.0.1:8913/ws", diana: "torre", nombre: "  el  Mirador " } });
  assert.deepEqual(conNombre.value, { servidor: "ws://127.0.0.1:8913/ws", diana: "torre", nombre: "el Mirador" }, "`nombre` is allowed and tidied");
});

test("enlace: a wrong `enlace` is said with its path and the house link stays (a typo never turns the feature off)", () => {
  const malos: [unknown, string][] = [
    [{ enlace: "torre" }, "enlace"], [{ enlace: [] }, "enlace"], [{ enlace: 3 }, "enlace"],
    [{ enlace: { servidor: "https://x.example/ws" } }, "enlace.servidor"], [{ enlace: { servidor: "wss://" } }, "enlace.servidor"],
    [{ enlace: { servidor: "wss://u:p@x.example/ws" } }, "enlace.servidor"], [{ enlace: { servidor: "wss://x.example/ws?a=1" } }, "enlace.servidor"],
    [{ enlace: { servidor: 7 } }, "enlace.servidor"], [{ enlace: { diana: "Torre Grande" } }, "enlace.diana"], [{ enlace: { diana: "" } }, "enlace.diana"],
    [{ enlace: { diana: "a".repeat(17) } }, "enlace.diana"], [{ enlace: { diana: 5 } }, "enlace.diana"], [{ enlace: { extra: 1 } }, "enlace.extra"],
    [{ enlace: { nombre: "" } }, "enlace.nombre"], [{ enlace: { nombre: 7 } }, "enlace.nombre"], [{ enlace: { nombre: "x".repeat(61) } }, "enlace.nombre"], [{ enlace: { nombre: "a\u0007b" } }, "enlace.nombre"],
  ];
  for (const [crudo, path] of malos) {
    const r = leerEnlace(crudo);
    assert.equal(r.ok, false, JSON.stringify(crudo));
    assert.ok(!r.ok && r.issues.some((i) => i.path === path), `${JSON.stringify(crudo)} → ${path}`);
    assert.ok(r.value && r.value.servidor.startsWith("ws"), "falls back to a usable link");
  }
  // the world loader says it in the log, with the file's name, and returns the link that stays
  const log: string[] = [];
  const v = enlaceDardosDelMundo((f) => (f === "dardos.json" ? { enlace: { servidor: "http://no" } } : undefined), (l) => log.push(l));
  assert.deepEqual(v, { ...ENLACE_DARDOS });
  assert.match(log.join("\n"), /dardos\.json: enlace\.servidor: debe ser una dirección ws:\/\/ o wss:\/\//);
  assert.deepEqual(enlaceDardosDelMundo(() => undefined), { ...ENLACE_DARDOS });
  assert.equal(enlaceDardosDelMundo(() => ({ enlace: false })), null);
});

test("enlace: servers and hosts — only ws/wss with a host; the guest token is kept per host", () => {
  assert.equal(leerServidor("wss://alchemiststower.numinia.com/ws")?.host, "alchemiststower.numinia.com");
  assert.equal(leerServidor("ws://127.0.0.1:8913/ws")?.host, "127.0.0.1:8913");
  for (const x of ["", "alchemiststower.numinia.com", "javascript:alert(1)", "http://x/ws", "wss://x/ws#a", 5, null, "wss://" + "a".repeat(250) + ".com/ws"]) assert.equal(leerServidor(x), null, String(x));
  assert.equal(anfitrionDe("WSS://Alchemiststower.Numinia.com/ws"), "alchemiststower.numinia.com");
  assert.equal(claveInvitado("wss://alchemiststower.numinia.com/ws"), "numinia.invitado@alchemiststower.numinia.com");
  assert.notEqual(claveInvitado("ws://127.0.0.1:8913/ws"), claveInvitado("ws://127.0.0.1:8914/ws"), "two servers on one machine are two guests");
  assert.equal(direccionDeEnlace("wss://t.example/ws"), "wss://t.example/ws?enlace=dardos");
  assert.equal(direccionDeEnlace("ws://127.0.0.1:8913/ws?x=1"), "ws://127.0.0.1:8913/ws?x=1&enlace=dardos");
  assert.deepEqual([esVisitaDeEnlace("/ws?enlace=dardos"), esVisitaDeEnlace("/?x=1&enlace=dardos"), esVisitaDeEnlace("/ws"), esVisitaDeEnlace("/ws?enlace=otro"), esVisitaDeEnlace(undefined)], [true, true, false, false, false]);
});

test("enlace: what a page does with the link — never to itself, never when it has its own AR board, off is off", () => {
  const torre = { servidor: "wss://alchemiststower.numinia.com/ws", diana: "torre" };
  const sin = [{ duelo: true }, { remoto: true }, {}];
  assert.deepEqual(enlaceVigente({ ajuste: torre, servidorActual: "wss://otro.example/ws", sitios: sin }), { enlace: torre, motivo: "ok" });
  assert.deepEqual(enlaceVigente({ ajuste: undefined, servidorActual: "wss://otro.example/ws", sitios: [] }).enlace, { ...ENLACE_DARDOS }, "an older server that says nothing: the house link");
  assert.equal(enlaceVigente({ ajuste: null, servidorActual: "wss://otro.example/ws", sitios: [] }).motivo, "apagado");
  assert.equal(enlaceVigente({ ajuste: torre, servidorActual: "wss://AlchemistsTower.numinia.com/ws", sitios: [] }).motivo, "mismo-servidor", "the Tower never links to itself");
  assert.equal(enlaceVigente({ ajuste: { ...torre, servidor: "ws://127.0.0.1:8913/ws" }, servidorActual: "ws://127.0.0.1:8913/ws?x=1", sitios: [] }).motivo, "mismo-servidor");
  assert.notEqual(enlaceVigente({ ajuste: { ...torre, servidor: "ws://127.0.0.1:8913/ws" }, servidorActual: "ws://127.0.0.1:8911/ws", sitios: [] }).motivo, "mismo-servidor", "same machine, another port: another world");
  assert.equal(enlaceVigente({ ajuste: torre, servidorActual: "wss://otro.example/ws", sitios: [{ duelo: true, remoto: true }] }).motivo, "diana-propia");
  assert.equal(enlaceVigente({ ajuste: { servidor: "mal", diana: "torre" }, servidorActual: "wss://o/ws", sitios: [] }).motivo, "invalido");
  // /status
  assert.equal(ajusteDeEstado(undefined), undefined);
  assert.equal(ajusteDeEstado(null), null); assert.equal(ajusteDeEstado(false), null); assert.equal(ajusteDeEstado({ servidor: "x" }), null);
  assert.deepEqual(ajusteDeEstado(torre), torre);
  assert.deepEqual(ajusteDeEstado({ ...torre, nombre: " la Torre " }), { ...torre, nombre: "la Torre" }, "the name travels in /status");
  assert.deepEqual(ajusteDeEstado({ ...torre, nombre: 5 }), torre, "a bad name is dropped, the link stays");
  assert.deepEqual(enlaceVigente({ ajuste: { ...torre, nombre: "la Torre" }, servidorActual: "wss://otro.example/ws", sitios: [] }).enlace, { ...torre, nombre: "la Torre" });
  // a world whose OWN darts are switched off has no boards (verSi hides them): it still offers the linked board — the link is about the other world's board
  assert.equal(enlaceVigente({ ajuste: torre, servidorActual: "wss://otro.example/ws", sitios: [] }).motivo, "ok", "own darts off → no own board → the link applies");
});

test("enlace: the address of the linked server's /status and its name", () => {
  assert.equal(direccionDeEstado("wss://alchemiststower.numinia.com/ws"), "https://alchemiststower.numinia.com/status");
  assert.equal(direccionDeEstado("ws://127.0.0.1:8913/ws"), "http://127.0.0.1:8913/status");
  assert.equal(direccionDeEstado("ws://127.0.0.1:8913/sub/ws"), "http://127.0.0.1:8913/sub/status");
  assert.equal(direccionDeEstado("http://x/ws"), null);
  assert.equal(limpiarNombreMundo("  Mundo   de Ana "), "Mundo de Ana"); assert.equal(limpiarNombreMundo(""), null); assert.equal(limpiarNombreMundo(null), null);
});

// ---------------------------------------------------------------- the state machine

test("estado del enlace: connecting → puerta/listo → jugando, and the ways out", () => {
  const h = (o: Partial<Hechos> = {}): Hechos => ({ fase: "abierta", identificado: true, condiciones: { puerta: false, abierta: true }, enPared: false, ...o });
  assert.equal(estadoEnlace(h({ fase: "nada" })), "cerrado");
  assert.equal(estadoEnlace(h({ fase: "cerrada" })), "cerrado");
  assert.equal(estadoEnlace(h({ fase: "fallo" })), "error");
  assert.equal(estadoEnlace(h({ fase: "abriendo" })), "conectando");
  assert.equal(estadoEnlace(h({ identificado: false })), "conectando");
  assert.equal(estadoEnlace(h({ condiciones: null })), "conectando", "it is not «listo» until we know whether the gate is shut");
  assert.equal(estadoEnlace(h({ condiciones: { puerta: true, abierta: false } })), "puerta");
  assert.equal(estadoEnlace(h({ condiciones: { puerta: true, abierta: true } })), "listo");
  assert.equal(estadoEnlace(h({ condiciones: { puerta: false, abierta: true } })), "listo");
  assert.equal(estadoEnlace(h({ enPared: true })), "jugando");
  assert.equal(estadoEnlace(h({ enPared: true, condiciones: { puerta: true, abierta: false } })), "puerta", "a shut gate wins over everything");
});

// ---------------------------------------------------------------- the server side

const SITIOS: Sitio[] = [{ id: "torre", nombre: "Diana de la Torre", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true, rondas: 1 }];
const COND: Condiciones = { formato: "condiciones@1", capas: [{ capa: "casa", version: "1", puntos: [{ id: "uso", titulo: "uso", texto: "texto", obligatorio: true, tipo: "norma" }] }] };

function torre(puertaActiva = false) {
  const puerta = crearPuertaCondiciones({ condiciones: COND, activa: puertaActiva, log: () => {}, ahora: () => Date.parse("2026-10-21T12:00:00Z") });
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, log: () => {}, identitySign: sign, features: [chatServer, crearDardos({ sitios: SITIOS }), ...(puertaActiva ? [puerta.part] : [])], ...(puertaActiva ? { condiciones: puerta } : {}) });
  const persona = (i: number, enlace?: readonly string[]) => {
    const t = inst.join(i, undefined, enlace), k = keeper(), chat = crearChat(() => Date.now());
    const s = new ClientSession(t, { features: [chat.part], identity: k, view: { label() {}, bounce() {} } });
    const ev: { event: string; msg: Record<string, unknown> }[] = [], evChat: string[] = [];
    s.features.tap((f, event, msg) => { if (f === "dardos") ev.push({ event, msg }); if (f === "chat") evChat.push(event); });
    return { t, s, ev, evChat, chat };
  };
  const pump = (n = 1, todos: ReturnType<typeof persona>[] = []) => { for (let i = 0; i < n; i++) { for (const c of todos) c.t.flush(); inst.tick(); for (const c of todos) c.t.flush(); } };
  return { inst, persona, pump, puerta };
}

test("visita de enlace: no avatar for anybody, no snapshots, hears only the darts — and plays the remote board", () => {
  const T = torre();
  const A = T.persona(0), V = T.persona(1, FUNCIONES_DE_ENLACE), todos = [A, V];
  T.pump(14, todos);
  assert.ok(A.s.entity >= 0 && V.s.entity >= 0 && V.s.who && A.s.who);
  assert.deepEqual(T.inst.visitasDeEnlace(), [V.s.entity], "the instance knows who is a visit");
  assert.equal(A.s.stats.visible, 0, "the person in the Tower does not see the visitor: no avatar");
  assert.equal(A.s.remotePositions().length, 0);
  assert.equal(V.s.stats.snapshots, 0, "the visit gets no snapshots (nothing of the world)");
  // the visit does not walk
  const antes = T.inst.sim.tf.cols.x[V.s.entity];
  V.t.send(encodeInput(1, 1, 0, 0), false); T.pump(5, todos);
  assert.equal(T.inst.sim.tf.cols.x[V.s.entity], antes, "an INPUT of a visit is thrown away");
  assert.ok((T.inst.conns.find((c) => c.entity === V.s.entity)?.bad ?? 0) >= 1);
  // …and does not speak aloud: what the Tower's chat says is never sent to it
  const a = A.s.features.send("chat", "decir", { texto: "hola torre", canal: "cerca" }); T.pump(6, todos);
  assert.equal(a.ok, true);
  assert.deepEqual(V.evChat, [], "the chat does not reach a visit");
  // the visit asks to join the board from a wall, from another world, with its name there
  const esperaDe = (x: typeof A) => x.s.features.stateOf("dardos").get("torre");
  assert.equal(esperaDe(V)?.remoto, true, "the visitor reads the shared state of the board");
  assert.equal(V.s.features.send("dardos", "jugar", { sitio: "torre", desde: "pared", mundo: "Plaza de Ana", nombre: "Ana" }).ok, true);
  T.pump(4, todos);
  const e = esperaDe(A)!;
  assert.deepEqual([e.espera, e.jugadores], [true, 1], "everybody reads that somebody waits");
  // a person at the board joins and they duel: the visitor throws from its wall, the person from the line
  T.inst.sim.tf.cols.x[A.s.entity] = 8 * 65536; T.inst.sim.tf.cols.z[A.s.entity] = 0; T.pump(12, todos);
  assert.equal(A.s.features.send("dardos", "jugar", { sitio: "torre" }).ok, true); T.pump(4, todos);
  const du = A.ev.filter((x) => x.event === "duelo").at(-1)?.msg;
  assert.deepEqual([du?.nombreA, du?.paredA, du?.mundoA, du?.mundoB], ["Ana", true, "Plaza de Ana", ""], "the sign of the Tower: Ana, on her wall, from her world");
  const dv = V.ev.filter((x) => x.event === "duelo").at(-1)?.msg;
  assert.deepEqual([dv?.ronda, dv?.a, dv?.b], [1, V.s.entity, A.s.entity], "the match began; the visitor (host) and the person");
  assert.equal(V.s.features.send("dardos", "lanzar", { sitio: "torre", x: 0, y: 0.605, fuerza: FUERZA_IDEAL, via: "ar" }).ok, true); T.pump(4, todos);
  assert.ok(V.ev.some((x) => x.event === "dardo"), "the visitor sees its dart land");
  assert.ok(A.ev.some((x) => x.event === "dardo" && x.msg.quien === V.s.entity), "the person sees the visitor's dart");
  // the visit never takes the Tower's population count
  assert.equal(T.inst.players().length, 2);
});

test("visita de enlace: it may only talk to the features it came for; a person on a normal connection is untouched", () => {
  const T = torre();
  const A = T.persona(0), V = T.persona(1, FUNCIONES_DE_ENLACE), todos = [A, V];
  T.pump(10, todos);
  const malos = T.inst.conns.find((c) => c.entity === V.s.entity)!.bad;
  V.s.features.send("chat", "decir", { texto: "hola", canal: "cerca" }); T.pump(4, todos);
  assert.equal(T.inst.conns.find((c) => c.entity === V.s.entity)!.bad, malos + 1, "chat from a visit is refused as a bad message");
  assert.equal(T.inst.conns.find((c) => c.entity === A.s.entity)!.enlace, undefined);
  // the person walks: a snapshot arrives
  assert.ok(A.s.stats.snapshots > 0);
});

test("visita de enlace: the gate of the conditions is the ordinary one — darts are ignored until the visitor accepts", async () => {
  const T = torre(true);
  const V = T.persona(0, FUNCIONES_DE_ENLACE), todos = [V];
  T.pump(10, todos);
  assert.deepEqual([V.s.condiciones?.puerta, V.s.condiciones?.abierta], [true, false], "readable on the linked connection");
  assert.deepEqual(V.s.condiciones?.faltan, ["casa"]);
  V.s.features.send("dardos", "jugar", { sitio: "torre", desde: "pared" }); T.pump(4, todos);
  assert.equal(V.s.features.stateOf("dardos").get("torre")?.espera, false, "ignored while the gate is shut");
  assert.equal(V.s.aceptar({ casa: "1" }, []), true); T.pump(4, todos);
  assert.equal(V.s.condiciones?.abierta, true);
  V.s.features.send("dardos", "jugar", { sitio: "torre", desde: "pared" }); T.pump(4, todos);
  assert.equal(V.s.features.stateOf("dardos").get("torre")?.espera, true, "once accepted it plays");
  // nobody is told a visit is «leyendo las normas» (it has no avatar to draw a bubble on)
  const P = T.persona(1), dos = [V, P]; T.pump(6, dos);
  assert.equal(P.s.leyendo.size, 0);
});

test("cliente del enlace: connects, finds the gate, accepts, hangs nothing without a view, and closes", async () => {
  const T = torre(true);
  const Q = T.persona(0); // a person walking the Tower, to be sure nothing leaks to them
  let ent = -1; const cola: { flush(): void }[] = [];
  const almacen = (() => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; })();
  const avisos: string[] = [];
  const link = crearEnlaceDardos({
    enlace: { servidor: "ws://127.0.0.1:8913/ws", diana: "torre" }, nombre: () => "Ana", mundo: () => "Plaza de Ana", almacen, avisar: (t) => avisos.push(t), esperaMs: 4000,
    abrir: (url) => {
      assert.equal(url, "ws://127.0.0.1:8913/ws?enlace=dardos", "the address says it is a darts visit");
      const t = T.inst.join(5, undefined, FUNCIONES_DE_ENLACE); cola.push(t); ent = T.inst.visitasDeEnlace().at(-1)!;
      return Object.assign(t, { opened: Promise.resolve(), closed: new Promise<{ code: number; reason: string }>(() => {}), close() { T.inst.disconnect(ent); } });
    },
  });
  assert.equal(link.estado(), "cerrado", "nothing opened until used");
  const motor = setInterval(() => { for (const c of [...cola, Q.t]) c.flush(); T.inst.tick(); for (const c of [...cola, Q.t]) c.flush(); }, 10);
  try {
    assert.equal(await link.conectar(), "puerta", "connected, the gate of the Tower is shut");
    const v = link.vista();
    assert.deepEqual([v.estado, v.condiciones?.puerta, v.condiciones?.abierta, v.condiciones?.faltan], ["puerta", true, false, ["casa"]]);
    assert.ok(v.yo?.id && v.yo.id !== Q.s.who?.id, "a guest of its own at that server");
    assert.ok([...almacen.m.keys()].every((k) => k === "numinia.invitado@127.0.0.1:8913"), "the token is kept per server host");
    assert.equal(link.dardos.sitios().length, 1);
    assert.equal(link.dardos.jugar("torre", "pared").ok, true);
    await sleep(120); assert.equal(link.dardos.sitios()[0]?.ocupado === false && !link.dardos.sitios()[0]?.espera, true, "the Tower ignores darts before the visitor accepts");
    const sinVista = await link.jugarEnPared(); assert.equal(sinVista.ok, false); assert.match(!sinVista.ok ? sinVista.why : "", /aceptar las normas/);
    assert.equal(link.aceptar({ casa: "1" }), true);
    for (let i = 0; i < 60 && link.estado() !== "listo"; i++) await sleep(20);
    assert.equal(link.estado(), "listo");
    assert.equal(Q.s.stats.visible, 0, "the person in the Tower sees nobody");
    assert.equal(T.inst.players().length, 2);
    const r = await link.jugarEnPared(); assert.equal(r.ok, false, "no view in this headless run"); assert.match(!r.ok ? r.why : "", /no puede abrir AR/);
    assert.equal(link.dardos.jugar("torre", "pared", "Plaza de Ana", "Ana").ok, true); await sleep(120);
    assert.equal(link.dardos.sitios()[0]?.espera, true);
    await link.cerrar();
    assert.equal(link.estado(), "cerrado");
    await sleep(60);
    assert.equal(T.inst.visitasDeEnlace().length, 0, "closing frees the entity");
    assert.equal(T.inst.players().length, 1);
    assert.equal(Q.s.features.stateOf("dardos").get("torre")?.espera, false, "its place at the board was freed with it");
    // it can be opened again with the same guest
    const id1 = v.yo?.id; assert.equal(await link.conectar(), "listo", "the Tower remembers that guest accepted"); assert.equal(link.vista().yo?.id, id1, "the same guest the second time");
    await link.cerrar();
  } finally { clearInterval(motor); }
});

test("cliente del enlace: the name people read is the one the linked server tells in /status, then the setting's, then the host", async () => {
  const pedidas: string[] = [];
  const nunca = (): never => { throw new Error("no socket in this test"); };
  const crear = (enlace: { servidor: string; diana: string; nombre?: string }, estadoDelServidor?: (u: string) => Promise<unknown>) =>
    crearEnlaceDardos({ enlace, nombre: () => "Ana", mundo: () => "x", almacen: { getItem: () => null, setItem() {} }, abrir: nunca, estadoDelServidor });
  const a = crear({ servidor: "ws://127.0.0.1:1/ws", diana: "torre", nombre: "la Torre de los Alquimistas" }, async (u) => { pedidas.push(u); return { nombre: "Torre de Prueba" }; });
  assert.equal(a.vista().nombre, "la Torre de los Alquimistas", "before connecting: the setting's name");
  let cambios = 0; a.alCambiar(() => { cambios++; });
  await a.conectar(); await sleep(20);
  assert.deepEqual(pedidas, ["http://127.0.0.1:1/status"], "asked once, at the /status of that same server");
  assert.equal(a.vista().nombreServidor, "Torre de Prueba");
  assert.equal(a.vista().nombre, "Torre de Prueba", "what the world's server says wins");
  assert.ok(cambios > 0, "the chooser is told to redraw");
  await a.conectar(); assert.equal(pedidas.length, 1, "one question per link");
  const b = crear({ servidor: "ws://127.0.0.1:2/ws", diana: "torre" }, async () => { throw new Error("sin /status"); });
  await b.conectar(); await sleep(20);
  assert.equal(b.vista().nombre, "127.0.0.1:2", "no /status, no setting's name: the host");
  const c = crear({ servidor: "ws://127.0.0.1:3/ws", diana: "torre" }, async () => ({ nombre: 5 }));
  await c.conectar(); await sleep(20);
  assert.equal(c.vista().nombre, "127.0.0.1:3", "a nonsense name is ignored");
  const d = crear({ servidor: "ws://127.0.0.1:4/ws", diana: "torre", nombre: "el Mirador" });
  await d.conectar(); assert.equal(d.vista().nombre, "el Mirador", "a test transport without a /status reader never asks");
});

test("cliente del enlace: an unreachable server is an error with a reason, and a silent one times out", async () => {
  const roto = crearEnlaceDardos({ enlace: { servidor: "ws://127.0.0.1:1/ws", diana: "torre" }, nombre: () => "Ana", mundo: () => "x", almacen: { getItem: () => null, setItem() {} },
    abrir: () => ({ send() {}, onMessage() {}, sentBytes: 0, opened: Promise.reject(new Error("no")), closed: new Promise(() => {}), close() {} } as never) });
  assert.equal(await roto.conectar(), "error"); assert.match(roto.vista().motivo, /no se pudo llegar a 127\.0\.0\.1:1/);
  const mudo = crearEnlaceDardos({ enlace: { servidor: "ws://127.0.0.1:2/ws", diana: "torre" }, nombre: () => "Ana", mundo: () => "x", almacen: { getItem: () => null, setItem() {} }, esperaMs: 80,
    abrir: () => ({ send() {}, onMessage() {}, sentBytes: 0, opened: Promise.resolve(), closed: new Promise(() => {}), close() {} } as never) });
  assert.equal(await mudo.conectar(), "error"); assert.match(mudo.vista().motivo, /no responde/);
  const cae = crearEnlaceDardos({ enlace: { servidor: "ws://127.0.0.1:3/ws", diana: "torre" }, nombre: () => "Ana", mundo: () => "x", almacen: { getItem: () => null, setItem() {} },
    abrir: () => ({ send() {}, onMessage() {}, sentBytes: 0, opened: Promise.resolve(), closed: Promise.resolve({ code: 4004, reason: "lleno 8/8" }), close() {} } as never) });
  assert.equal(await cae.conectar(), "error"); assert.match(cae.vista().motivo, /lleno/);
});

// ---------------------------------------------------------------- the sign

test("letrero: «En su pared (AR)» says «desde <mundo>» when the player came through a link", () => {
  const j = (pared: boolean, mundo?: string) => ({ entity: 3, nombre: "Ana", puntos: 0, pared, ...(mundo ? { mundo } : {}) });
  const d = (a: ReturnType<typeof j>, b: ReturnType<typeof j> | null) => ({ sitio: "torre", ronda: 0, turnoDe: 0, a, b, fin: null, equipos: [a, ...(b ? [b] : [])] } as never);
  assert.equal(etiquetaPared(d(j(false), null)), null);
  assert.equal(etiquetaPared(d(j(true), null)), "En su pared (AR)");
  assert.equal(etiquetaPared(d(j(true, "Plaza de Ana"), null)), "En su pared (AR) · desde Plaza de Ana");
  assert.equal(etiquetaPared(d(j(false), j(true, "Plaza de Ana"))), "En su pared (AR) · desde Plaza de Ana");
  void MSG;
});
