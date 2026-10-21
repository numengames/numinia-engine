// ia-llamar S12/S13: the bridge's tools for being called — `llamadas`, `esperar_llamada` (≤ 25 s), the «atenta» report (feature `ia`, 90 s), `gesto` and
// «En tu burbuja» in `mirar`. Three layers: (1) the mailbox alone, with a fake clock and fake timers; (2) the gesture table against the world's real
// list; (3) the real bridge over an in-memory world with the real chat, ia, burbuja, llamar and gestos features, a person calling it with `/ada …`, and the
// same bridge in a world that has no `llamar` (the old behaviour). No network, no model.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { MARCA_IA } from "../packages/instance/src/identidad.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { loopbackPair } from "../packages/net/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import type { Msg, ServerPart } from "../packages/feature/src/index.ts";
import { PuenteMundo } from "../packages/agent/src/mcp-mundo.ts";
import { GESTOS_IA, TIPOS_GESTO } from "../packages/agent/src/gesto-ia.ts";
import { MOVIMIENTOS, GESTOS } from "../features/gestos/movimientos.ts";
import { BUZON_MAX, BUZON_TTL_MS, BuzonLlamadas, ESPERA_LLAMADA_MAX_S } from "../packages/agent/src/buzon-llamadas.ts";
import { ATENTA_S, ATENTA_TICKS, ia as iaFeature } from "../features/ia/feature.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import gestosServer from "../features/gestos/server.ts";
import iaServer from "../features/ia/server.ts";
import burbujaServer from "../features/burbuja/server.ts";
import { crearLlamar } from "../features/llamar/server.ts";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const llamada = (o: Partial<Msg> = {}): Msg => ({ ia: 1, quien: 7, nombre: "Luis", texto: "¿me ayudas?", modo: "nombre", t: 100, ...o });
const entra = (quien: number, nombre = "Ana", esIA = false, distanciaDm = 25): Msg => ({ ia: 1, quien, nombre, distanciaDm, esIA });

// ---------- (1) the mailbox ----------

test("mailbox: a call waits unread, is handed over once, and the last 20 of the last 10 minutes are kept", () => {
  let t = 1_000_000;
  const b = new BuzonLlamadas(() => t);
  assert.deepEqual(b.leer(), { llamadas: [], entradas: [] });
  b.llamada(llamada({ texto: "primera", modo: "barra" }));
  b.llamada(llamada({ quien: 8, nombre: "Ana", texto: "segunda", modo: "boton" }));
  assert.equal(b.hay(), true);
  assert.deepEqual(b.pendientes().llamadas.map((x) => [x.n, x.quien, x.nombre, x.texto, x.modo]), [[1, 7, "Luis", "primera", "barra"], [2, 8, "Ana", "segunda", "boton"]]);
  const leidas = b.leer();
  assert.equal(leidas.llamadas.length, 2);
  assert.deepEqual(b.leer().llamadas, [], "read once");
  assert.equal(b.hay(), false);
  // a mode the server does not know falls back to «nombre»; a text that is not text is empty
  b.llamada({ ia: 1, quien: 9, nombre: "X", texto: 5, modo: "grito", t: 1 });
  const [rara] = b.leer().llamadas;
  assert.deepEqual([rara.modo, rara.texto], ["nombre", "5"]);
  // at most 20
  for (let i = 0; i < 25; i++) b.llamada(llamada({ texto: `l${i}` }));
  assert.equal(b.llamadas.length, BUZON_MAX);
  assert.equal(b.pendientes().llamadas[0].texto, "l5", "the oldest were pushed out");
  // at most 10 minutes
  t += BUZON_TTL_MS - 1000;
  assert.equal(b.pendientes().llamadas.length, BUZON_MAX);
  t += 2000;
  assert.equal(b.pendientes().llamadas.length, 0, "older than 10 minutes: gone");
});

test("mailbox: bubble entries are news that wake a wait, an exit is not; a blinking edge is one entry; who is inside is kept", () => {
  const b = new BuzonLlamadas(() => 0);
  b.entra(entra(5, "Ana"));
  b.entra(entra(5, "Ana"));
  b.entra(entra(6, "Bot", true, 40));
  assert.equal(b.pendientes().entradas.length, 2);
  assert.deepEqual([...b.dentro.keys()], [5, 6]);
  assert.deepEqual(b.dentro.get(6), { nombre: "Bot", esIA: true, distanciaDm: 40 });
  b.leer();
  b.sale({ ia: 1, quien: 5, nombre: "Ana", esIA: false });
  assert.deepEqual([...b.dentro.keys()], [6]);
  assert.equal(b.hay(), false, "leaving is not news");
  b.reiniciarBurbuja();
  assert.equal(b.dentro.size, 0);
});

test("mailbox: esperar returns at once when something is waiting, ends at the time given (never above 25 s), and a call or an entry ends it early", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const b = new BuzonLlamadas();
  // nothing: runs out
  let fin: string | null = null;
  void b.esperar(10).then((f) => { fin = f; });
  t.mock.timers.tick(9_999); await Promise.resolve();
  assert.equal(fin, null, "still waiting at 9.999 s");
  t.mock.timers.tick(1); await Promise.resolve();
  assert.equal(fin, "tiempo");
  // too long, too short, odd: bounded to 1..25
  fin = null; void b.esperar(99).then((f) => { fin = f; });
  t.mock.timers.tick(ESPERA_LLAMADA_MAX_S * 1000 - 1); await Promise.resolve();
  assert.equal(fin, null);
  t.mock.timers.tick(1); await Promise.resolve();
  assert.equal(fin, "tiempo", "99 s was cut to 25");
  fin = null; void b.esperar(0).then((f) => { fin = f; });
  t.mock.timers.tick(1000); await Promise.resolve();
  assert.equal(fin, "tiempo", "0 s is at least 1 s");
  // a call during the wait ends it at once, and the timer is gone
  fin = null; void b.esperar(25).then((f) => { fin = f; });
  t.mock.timers.tick(3000); await Promise.resolve();
  assert.equal(fin, null);
  b.llamada(llamada()); await Promise.resolve();
  assert.equal(fin, "novedad");
  // already something unread: no waiting at all
  assert.equal(await b.esperar(25), "novedad");
  b.leer();
  // a bubble entry wakes it too; an exit does not
  fin = null; void b.esperar(25).then((f) => { fin = f; });
  b.sale({ ia: 1, quien: 5 }); t.mock.timers.tick(1000); await Promise.resolve();
  assert.equal(fin, null);
  b.entra(entra(5)); await Promise.resolve();
  assert.equal(fin, "novedad");
  b.leer();
  // two waits at once both end; stopping ends a wait and refuses new ones
  const dos: string[] = [];
  void b.esperar(25).then((f) => dos.push(f)); void b.esperar(25).then((f) => dos.push(f));
  b.llamada(llamada()); await Promise.resolve();
  assert.deepEqual(dos, ["novedad", "novedad"]);
  b.leer();
  fin = null; void b.esperar(25).then((f) => { fin = f; });
  b.parar(); await Promise.resolve();
  assert.equal(fin, "parada");
  assert.equal(await b.esperar(25), "parada");
});

// ---------- (2) the gestures ----------

test("gesto: the four types exist, each plays a move that is in the world's list, and the ones without a clip of their own say so and stop by themselves", () => {
  assert.deepEqual([...TIPOS_GESTO], ["saludar", "asentir", "pensar", "señalar"]);
  const ids = new Set(MOVIMIENTOS.map((m) => m.id));
  for (const tipo of TIPOS_GESTO) {
    const g = GESTOS_IA[tipo];
    assert.ok(ids.has(g.movimiento) && GESTOS.includes(g.movimiento), `${tipo} → «${g.movimiento}» is not a move of features/gestos/movimientos.ts`);
    assert.ok(g.como.length > 10);
    if (!g.propio && MOVIMIENTOS.find((m) => m.id === g.movimiento)!.modo !== "una") assert.ok((g.paraS ?? 0) > 0, `${tipo}: a looping move must be stopped`);
  }
  assert.equal(GESTOS_IA.saludar.propio, true);
  assert.equal(MOVIMIENTOS.find((m) => m.id === GESTOS_IA.saludar.movimiento)!.dice, "¡Hola!");
});

// ---------- (3) the bridge in a world ----------

const SUB = `ia-a_${"0f".repeat(16)}`;
type Mundo = Awaited<ReturnType<typeof montar>>;

/** An in-memory world with `partes`, an organization-mode bridge (a fake numinia.com pass) named `nombre`, and people who can join. */
async function montar(o: { partes: ServerPart[]; nombre?: string; estado?: "activa" | "dormida" }) {
  const nombre = o.nombre ?? "Ada", estado = o.estado ?? "activa";
  const PASE = `cabecera.${b64({ kind: "agent", state: estado })}.firma`;
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: o.partes, identitySign: signer("una-clave-de-invitados-larga"),
    credencial: (_e, pase) => (pase === PASE ? { id: SUB, nombre: `${nombre}${MARCA_IA}`, ia: true } : null) });
  const motor = setInterval(() => inst.tick(), 10);
  let cerrar = (_: { code: number; reason: string }) => {};
  const abrir = () => {
    const [servidor, cliente] = loopbackPair();
    inst.connect(servidor, 0);
    const bombeo = setInterval(() => cliente.flush(), 10);
    return { get sentBytes() { return cliente.sentBytes; }, send: (b: Uint8Array, r: boolean) => cliente.send(b, r), onMessage: (f: (b: Uint8Array) => void) => cliente.onMessage(f),
      opened: Promise.resolve(), closed: new Promise<{ code: number; reason: string }>((ok) => { cerrar = ok; }), close: () => { clearInterval(bombeo); cerrar({ code: 1000, reason: "" }); } };
  };
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ nombre: "La Torre" })) as typeof fetch;
  const lineas: string[] = [];
  const puente = new PuenteMundo({ url: "wss://torre.numinia.world/ws", id: "ada", pedirPase: async () => ({ ok: true as const, pase: PASE, exp: Math.floor(Date.now() / 1000) + 600 }), mundo: "torre", abrir, log: (l) => lineas.push(l) });
  puente.arrancar();
  const fin = Date.now() + 8000;
  while (!(puente.cuerpo?.nombre && puente.cuerpo.dentro() && puente.ficha) && Date.now() < fin) await espera(20);
  assert.ok(puente.cuerpo?.dentro(), lineas.join("\n"));
  const ai = puente.cuerpo!.entidad;
  const poner = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  poner(ai, 0, 0);
  const cierres: (() => void)[] = [];
  /** A person standing at (x, z) with a chat and a spy on the gestures it sees. */
  const persona = async (x: number, z: number) => {
    const t = inst.join(1 + cierres.length), chat = crearCliente(), gestos: Msg[] = [];
    const s = new ClientSession(t, { features: [chat.part], identity: keeper() });
    s.features.tap((f, e, m) => { if (f === "gestos" && e === "hecho") gestos.push({ ...m }); });
    const bombeo = setInterval(() => { t.flush(); s.tick(0, 0); }, 10);
    cierres.push(() => clearInterval(bombeo));
    const hasta = Date.now() + 4000;
    while ((s.entity < 0 || !s.who) && Date.now() < hasta) await espera(10);
    poner(s.entity, x, z);
    await espera(250);
    return { s, chat, gestos, e: s.entity, nombre: s.who!.nombre };
  };
  const herr = (n: string) => puente.herramientas().find((h) => h.name === n)!;
  const usar = async (n: string, a: Record<string, unknown> = {}) => String(await herr(n).ejecutar(a));
  const publica = () => new Map(inst.features.allState()).get(`ia:${ai}`) ?? null;
  /** Waits until the bridge has received `n` calls in all. */
  const llamadasRecibidas = async (n: number) => { for (let i = 0; i < 60 && puente.buzon.llamadas.length < n; i++) await espera(50); };
  const cerrarTodo = () => { for (const c of cierres) c(); puente.parar(); clearInterval(motor); globalThis.fetch = fetchReal; };
  return { inst, puente, ai, persona, herr, usar, publica, lineas, cerrarTodo, poner, llamadasRecibidas };
}
const mundoCompleto = (estado?: "activa" | "dormida", nombre?: string) => montar({ partes: [chatServer, gestosServer, iaServer, burbujaServer, crearLlamar().part], estado, nombre });
const entradasSinLeer = (m: Mundo) => m.puente.buzon.pendientes().entradas.length;

test("S12: `llamadas` and `esperar_llamada` are in the bridge's list with plain-word descriptions and a 1..25 s limit", async () => {
  const m = await mundoCompleto();
  try {
    const nombres = m.puente.herramientas().map((h) => h.name);
    assert.deepEqual(nombres.slice(-3), ["llamadas", "esperar_llamada", "gesto"]);
    const e = m.herr("esperar_llamada");
    assert.deepEqual(e.inputSchema.properties.segundos, { type: "integer", minimum: 1, maximum: 25, description: e.inputSchema.properties.segundos.description });
    assert.deepEqual(e.inputSchema.required, []);
    assert.match(e.description, /25 segundos/);
    assert.match(m.herr("llamadas").description, /una sola vez/);
  } finally { m.cerrarTodo(); }
});

test("S12: a person calls with /ada → `esperar_llamada` returns at once with who, how and what; `llamadas` then has nothing new (each call is read once)", { timeout: 30_000 }, async () => {
  const m = await mundoCompleto();
  try {
    const luis = await m.persona(2, 0);
    m.puente.buzon.leer(); // the entry of the person into the bubble is not what this test is about
    assert.equal(await m.usar("llamadas"), "No tienes llamadas sin leer.");
    const espera1 = m.usar("esperar_llamada", { segundos: 20 }); // not awaited: the person calls meanwhile
    await espera(200);
    assert.deepEqual(luis.chat.chat.decir("/ada ¿me ayudas con la mesa?"), { ok: true });
    const t0 = Date.now();
    const texto = await espera1;
    assert.ok(Date.now() - t0 < 3000, "it came back as soon as the call arrived, not at 20 s");
    assert.match(texto, /Te llaman: 1 llamada\(s\) sin leer/);
    assert.match(texto, /<material fiable="no">[\s\S]*«[^»]+» te llama con \/tu-nombre \(solo lo ves tú\): «¿me ayudas con la mesa\?»[\s\S]*<\/material>/);
    assert.match(texto, /Para contestar usa «decir»/);
    assert.ok(texto.indexOf("¿me ayudas") > texto.indexOf("<material"), "the person's words are inside the fence");
    assert.equal(texto.split("</material>").length, 2);
    assert.equal(await m.usar("llamadas"), "No tienes llamadas sin leer.", "already read");
    // a second call, read with `llamadas` this time
    for (let i = 0; i < 210; i++) m.inst.tick(); // the server's clock: one call every 10 s (200 ticks) per person
    luis.chat.chat.decir("/ada otra cosa");
    await m.llamadasRecibidas(2);
    const otra = await m.usar("llamadas");
    assert.match(otra, /otra cosa/);
    assert.match(otra, /hace [0-9]+ s/);
    assert.equal(await m.usar("llamadas"), "No tienes llamadas sin leer.");
  } finally { m.cerrarTodo(); }
});

test("S12: a person who walks into the bubble wakes `esperar_llamada` with a flagged entry (not a call); it does not block another tool; nothing → empty at the time given", { timeout: 30_000 }, async () => {
  const m = await mundoCompleto();
  try {
    const ana = await m.persona(50, 50); // far: outside
    m.puente.buzon.leer(); // whatever came before
    // empty at the time given (1 s), meanwhile `mirar` answers (the wait blocks nothing else)
    const t0 = Date.now(), vacia = m.usar("esperar_llamada", { segundos: 1 });
    const mirando = await m.usar("mirar");
    assert.ok(Date.now() - t0 < 900 && /^Eres «Ada · IA»/.test(mirando), "mirar answered while the wait was still going");
    assert.match(await vacia, /^Nadie te ha llamado en estos 1 s\. Vuelve a llamar a «esperar_llamada»/);
    // someone comes in
    const espera2 = m.usar("esperar_llamada", { segundos: 20 });
    await espera(100);
    m.poner(ana.e, 1.5, 0);
    const texto = await espera2;
    assert.match(texto, /Han entrado en tu burbuja: 1 \(no es una llamada/);
    assert.match(texto, new RegExp(`«[^»]+» ha entrado en tu burbuja, a [0-9.]+ m`));
    assert.doesNotMatch(texto, /Te llaman/);
    assert.equal(entradasSinLeer(m), 0, "handed over once");
  } finally { m.cerrarTodo(); }
});

test("S12: «atenta» — the bridge reports on every `llamadas` / `esperar_llamada` (at most one every 5 s), the card says true for 90 s, then false; a person's report does nothing", { timeout: 30_000 }, async () => {
  const m = await mundoCompleto();
  try {
    const luis = await m.persona(2, 0);
    assert.equal(m.publica()?.atenta, false, "false until the brain uses the tools");
    const hechos: string[] = [];
    const hacer = m.puente.cuerpo!.hacer.bind(m.puente.cuerpo!);
    m.puente.cuerpo!.hacer = (f: string, v: string, msg: Msg) => { if (f === "ia") hechos.push(v); return hacer(f, v, msg); };
    for (let i = 0; i < 5; i++) await m.usar("llamadas");
    assert.deepEqual(hechos, ["atenta"], "five calls in a row → one report (rate-limited)");
    await espera(150);
    assert.equal(m.publica()?.atenta, true);
    assert.equal(luis.s.features.stateOf("ia").get(String(m.ai))?.atenta, true, "the pages read it from the public card");
    // an `esperar_llamada` that runs out also reports, at its start
    await m.usar("esperar_llamada", { segundos: 1 });
    // 60 s later: still attentive; 90 s after the last report: not
    for (let i = 0; i < 60 * 20; i++) m.inst.tick();
    assert.equal(m.publica()?.atenta, true, "at 60 s");
    for (let i = 0; i < 40 * 20; i++) m.inst.tick();
    assert.equal(m.publica()?.atenta, false, "after 90 s without a report");
    assert.ok(ATENTA_TICKS === ATENTA_S * 20 && ATENTA_S === 90);
    // using the tool again makes it attentive again
    await espera(5100);
    await m.usar("llamadas"); await espera(150);
    assert.equal(m.publica()?.atenta, true);
    // a person sending it changes nothing and gets no entry
    const tarjetas = () => JSON.stringify([...m.inst.features.allState()].filter(([k]) => k.startsWith("ia:")));
    const antes = tarjetas();
    assert.equal(luis.s.features.send("ia", "atenta", {}).ok, true);
    await espera(150);
    assert.equal(tarjetas(), antes);
    assert.ok(iaFeature.intents?.atenta, "the intent is declared");
  } finally { m.cerrarTodo(); }
});

test("S12: asleep, a call from the world lets it answer; the bridge's own name detection is off in a world that has `llamar`, on in one that does not", { timeout: 40_000 }, async () => {
  // a name the server does not look for (under 3 letters) but the old detection did: «Al»
  const nuevo = await mundoCompleto("dormida", "Al");
  try {
    const luis = await nuevo.persona(2, 0);
    await usarFalla(nuevo, "No hay ninguna llamada: solo hablo si me llaman");
    luis.chat.chat.decir("hola Al, ¿estás?");
    await espera(400);
    await usarFalla(nuevo, "the server's rule decides: «Al» is too short to be found in the chat, and the bridge no longer guesses");
    luis.chat.chat.decir("/al ¿estás?"); // `/name` is unambiguous: the server delivers it
    await nuevo.llamadasRecibidas(1);
    assert.match(await nuevo.usar("decir", { texto: "Aquí estoy" }), /^Dicho/);
  } finally { nuevo.cerrarTodo(); }
  // an old world: no feature `llamar` (and no `ia`, `burbuja`): the old behaviour, untouched
  const viejo = await montar({ partes: [chatServer], estado: "dormida", nombre: "Al" });
  try {
    const luis = await viejo.persona(2, 0);
    await usarFalla(viejo, "Estoy dormida");
    luis.chat.chat.decir("hola Al, ¿estás?");
    await espera(400);
    assert.match(await viejo.usar("decir", { texto: "Aquí estoy" }), /^Dicho/, "its own name in the chat lets it speak, as before");
    const l = await viejo.usar("llamadas");
    assert.match(l, /aún no entrega llamadas/);
    const t0 = Date.now();
    assert.match(await viejo.usar("esperar_llamada", { segundos: 25 }), /aún no entrega llamadas/);
    assert.ok(Date.now() - t0 < 500, "it does not make the brain wait for something that cannot come");
    assert.match(await viejo.usar("mirar"), /Eres «Al · IA»/);
    assert.doesNotMatch(await viejo.usar("mirar"), /En tu burbuja/, "no bubble feature: no line about it");
    assert.equal(viejo.puente.cuerpo!.hacer("ia", "atenta", {}).ok, false, "the old world refuses the report, nothing breaks");
  } finally { viejo.cerrarTodo(); }
});

/** `decir` refused because it is asleep and nobody called it. */
async function usarFalla(m: Mundo, porque: string): Promise<void> {
  await assert.rejects(m.usar("decir", { texto: "hola" }), /dormida|llaman/, porque);
}

test("S13: `mirar` adds «En tu burbuja» (who is inside, from the bubble events; names inside the fence); leaving removes them", { timeout: 30_000 }, async () => {
  const m = await mundoCompleto();
  try {
    assert.match(await m.usar("mirar"), /En tu burbuja: nadie\./);
    const ana = await m.persona(1.5, 0);
    for (let i = 0; i < 40 && m.puente.buzon.dentro.size === 0; i++) await espera(50);
    const dentro = await m.usar("mirar");
    assert.match(dentro, /En tu burbuja: 1 \(sus nombres van en el material\)\./);
    const abre = dentro.indexOf("<material"), cierra = dentro.lastIndexOf("</material>");
    assert.match(dentro.slice(abre, cierra), /- en tu burbuja «[^»]+» a [0-9.]+ m/);
    assert.doesNotMatch(dentro.slice(0, abre), new RegExp(ana.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the person's name is only inside the fence");
    m.poner(ana.e, 50, 50);
    for (let i = 0; i < 60 && m.puente.buzon.dentro.size > 0; i++) await espera(50);
    assert.match(await m.usar("mirar"), /En tu burbuja: nadie\./);
  } finally { m.cerrarTodo(); }
});

test("S13: `gesto` plays the move of its type, everyone near sees it; the types without a clip of their own say so and stop by themselves; bad type is refused", { timeout: 30_000 }, async () => {
  const m = await mundoCompleto();
  try {
    const luis = await m.persona(2, 0);
    const r = await m.usar("gesto", { tipo: "saludar" });
    assert.match(r, /^Hecho: saludar — saludas con la mano\./);
    assert.doesNotMatch(r, /aún no tiene/);
    await espera(300);
    assert.deepEqual(luis.gestos.map((g) => [g.quien, g.gesto]), [[m.ai, "saludar"]]);
    luis.gestos.length = 0;
    await espera(1100); // the world allows one move a second
    const a = await m.usar("gesto", { tipo: "asentir" });
    assert.match(a, /^Hecho: asentir — /);
    assert.match(a, /aún no tiene un movimiento propio/);
    await espera(300);
    assert.deepEqual(luis.gestos.map((g) => g.gesto), ["hablar"]);
    await espera(GESTOS_IA.asentir.paraS! * 1000 + 300);
    assert.deepEqual(luis.gestos.map((g) => g.gesto), ["hablar", "parar"], "it ends by itself");
    // a new gesture cancels the pending «parar» of the old one
    luis.gestos.length = 0;
    await m.usar("gesto", { tipo: "pensar" });
    await espera(1100);
    await m.usar("gesto", { tipo: "señalar" });
    await espera(GESTOS_IA.pensar.paraS! * 1000 + 300);
    assert.deepEqual(luis.gestos.map((g) => g.gesto), ["agacharse", "usar"], "señalar is not cut by the old «parar»");
    await assert.rejects(m.herr("gesto").ejecutar({ tipo: "bailar" }), /Ese gesto no existe: elige uno de saludar, asentir, pensar, señalar/);
    assert.deepEqual(m.herr("gesto").inputSchema.properties.tipo.enum, ["saludar", "asentir", "pensar", "señalar"]);
  } finally { m.cerrarTodo(); }
});

test("S13: `gesto` in a world without the feature `gestos` says so", { timeout: 20_000 }, async () => {
  const m = await montar({ partes: [chatServer] });
  try {
    await assert.rejects(m.usar("gesto", { tipo: "saludar" }), /no tiene gestos/);
  } finally { m.cerrarTodo(); }
});
