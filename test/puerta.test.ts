// ADR-080: the one door for an AI that lives outside the engine. Its file in the world (agente@1, a PUBLIC key), its
// signed a2 ticket (Ed25519, ± 2 min, once), what it may do (its role ∩ enter + build: never moderates) and the owner's
// /agente añadir|quitar from inside the world. Headless, over the in-memory transport; no model anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { emitirAgente, today, leerBillete2, MARCA_IA } from "../packages/instance/src/identidad.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import type { FeatureStorage, Saved, StorageOp, Msg } from "../packages/feature/src/index.ts";
import { Cuerpo } from "../packages/agent/src/index.ts";
import { clavePrivada, clavePublica, firmarBillete, nuevaPareja, textoClave } from "../packages/agent/src/llave.ts";
import { leerAgentes, validarAgente, pareceClavePrivada } from "../packages/server/src/aventura.ts";
import { crearPuerta } from "../packages/server/src/puerta.ts";
import { crearRoles, PERMISOS_IA } from "../packages/server/src/roles-mundo.ts";
import { plantilla } from "../packages/server/src/roles.ts";
import { CIERRE_ROLES } from "../packages/server/src/server.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import objetosCliente from "../features/objetos/client.ts";

class MemoryStorage implements FeatureStorage {
  readonly d = new Map<string, Saved>();
  load(f: string): Saved | null { return this.d.get(f) ?? null; }
  record(f: string, version: number, op: StorageOp): void {
    const s = this.d.get(f) ?? { version, state: [], store: [] };
    if (op.op === "k") s.store = [...s.store.filter(([k]) => k !== op.key), [op.key, op.value]];
    if (op.op === "kd") s.store = s.store.filter(([k]) => k !== op.key);
    if (op.op === "s") s.state = [...s.state.filter(([k]) => k !== op.key), [op.key, { value: op.value, at: op.at }]];
    if (op.op === "sd") s.state = s.state.filter(([k]) => k !== op.key);
    this.d.set(f, s);
  }
}

const sign = signer("una-clave-de-prueba-larga"), agentsSign = signer("otra-clave-de-agentes-larga");
const ADMIN = "codigo-de-administracion-largo";
const HOST = "mundo.prueba:8790";
const BLOQUE = (JSON.parse(readFileSync("features/objetos/biblioteca.json", "utf8")).modelos as { id: string; modelo: string }[]).find((m) => m.id === "bloque")!.modelo;
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const par = () => { const p = nuevaPareja(); return { ...p, privada: clavePrivada(p.privadaPem) }; };
const fichero = (id: string, clave: string, extra: Record<string, unknown> = {}) => ({ formato: "agente@1", id, nombre: "Hermes", responsable: "Pablo", clave, ...extra });

/** An adventure folder with these agents (and Lía as an inhabitant, for the clash). */
function aventura(agentes: Record<string, unknown>[]): string {
  const dir = mkdtempSync(join(tmpdir(), "puerta-"));
  mkdirSync(join(dir, "agentes")); mkdirSync(join(dir, "habitantes"));
  writeFileSync(join(dir, "habitantes", "lia.json"), readFileSync("aventuras/ejemplo/habitantes/lia.json"));
  for (const a of agentes) writeFileSync(join(dir, "agentes", `${String(a.id)}.json`), JSON.stringify(a));
  return dir;
}

/** A headless world with chat, objetos, the world's roles and the door; roles may be seeded (a «constructor» role). */
function mundo(o: { agentes: Record<string, unknown>[]; roles?: unknown; construir?: boolean }) {
  const log: string[] = [], cerradas: { e: number; motivo: string }[] = [];
  const reloj = { ms: Date.parse("2026-10-16T10:00:00Z") };
  const dir = aventura(o.agentes);
  const storage = new MemoryStorage();
  if (o.roles) storage.record("roles", 1, { op: "k", key: "roles", value: o.roles } as StorageOp);
  const puerta = crearPuerta({ aventura: dir, habitantes: () => new Set(["lia"]), ahora: () => reloj.ms, log: (l) => log.push(l) });
  puerta.leer();
  const roles = crearRoles({ construir: o.construir ?? false, admin: ADMIN, firmar: sign, puerta, cerrar: (e, motivo) => { cerradas.push({ e, motivo }); inst.disconnect(e); }, ahora: () => reloj.ms, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearObjetos(), roles.part], log: (l) => log.push(l), identitySign: sign, storage, now: () => reloj.ms,
    puede: (who, accion) => roles.puede(who, accion), agentes: { sign: agentsSign, nombre: (id) => (id === "lia" ? "Lía" : null) }, externos: { verificar: puerta.verificar } });
  const pumps: (() => void)[] = [];
  const persona = () => {
    const t = inst.join(0, HOST), c = crearCliente(() => reloj.ms);
    const s = new ClientSession(t, { features: [c.part, objetosCliente], identity: keeper(), view: { label() {}, bounce() {} } });
    pumps.push(() => t.flush());
    return { t, s, chat: c.chat };
  };
  const agente = (ticket: string, anfitrion = HOST) => {
    const t = inst.join(0, anfitrion), c = new Cuerpo(t, ticket), avisos: string[] = [], hechos: Msg[] = [], rechazos: string[] = [];
    c.s.features.tap((f, e, m) => {
      if (f === "chat" && e === "aviso") avisos.push(String(m.texto));
      if (f === "objetos" && e === "hecho") hechos.push(m);
      if (f === "objetos" && e === "rechazado") rechazos.push(String(m.motivo));
    });
    pumps.push(() => c.paso());
    return { t, c, avisos, hechos, rechazos };
  };
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const p of pumps) p(); inst.tick(); for (const p of pumps) p(); reloj.ms += 1000 / TICK_HZ; } };
  const ultimo = (p: { chat: { lineas: readonly { tipo: string; texto: string }[] } }) => p.chat.lineas.filter((l) => l.tipo === "aviso").at(-1)?.texto ?? "";
  const decir = (p: ReturnType<typeof persona>, texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  return { inst, roles, puerta, persona, agente, pump, ultimo, decir, log, cerradas, reloj, dir };
}

test("agente@1: a public key, a responsible person, a name without «IA»; private keys refused anywhere; unknown fields kept", () => {
  const { publica, privadaPem } = nuevaPareja();
  const ok = validarAgente({ ...fichero("hermes-pablo", publica, { rol: "constructor", presencia: "siempre", notas: "Hermes en el PC", futuro: 1 }) });
  assert.ok(ok.ok && ok.value.futuro === 1, "a newer engine's field is kept");
  assert.match(publica, /^ed25519:[A-Za-z0-9_-]{43}$/);
  assert.ok(clavePublica(publica));
  const mal = (o: Record<string, unknown>) => { const r = validarAgente(o, "agentes/x.json"); return r.ok ? [] : r.issues.map((i) => i.path); };
  assert.deepEqual(mal({ formato: "agente@2", id: "X", nombre: "Hermes · IA", clave: "abc", presencia: "nunca" }),
    ["agentes/x.json.formato", "agentes/x.json.id", "agentes/x.json.nombre", "agentes/x.json.responsable", "agentes/x.json.clave", "agentes/x.json.presencia"]);
  assert.deepEqual(mal(fichero("x1", privadaPem)), ["agentes/x.json.clave"], "a PEM private key in clave");
  const der = clavePrivada(privadaPem).export({ format: "der", type: "pkcs8" }).toString("base64");
  const semilla = Buffer.concat([Buffer.alloc(32, 7), Buffer.alloc(32, 9)]).toString("base64url");
  assert.ok(pareceClavePrivada(der) && pareceClavePrivada(semilla) && pareceClavePrivada("-----BEGIN PRIVATE KEY-----"));
  assert.ok(!pareceClavePrivada(publica), "a public key is not a private one");
  assert.deepEqual(mal(fichero("x1", semilla)), ["agentes/x.json.clave"], "a 64-byte seed + public key");
  assert.deepEqual(mal(fichero("x1", publica, { notas: `mi clave: ${der}` })), ["agentes/x.json.notas"], "a private key pasted in the notes");
  const spki = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  assert.deepEqual(mal(fichero("x1", spki)), ["agentes/x.json.clave"], "one text format only: ed25519:<raw 32 bytes>, not SPKI");
  // the folder: <id>.json, one id one kind of AI, no repeats
  const f = (n: string, o: unknown) => ({ fichero: `agentes/${n}`, texto: JSON.stringify(o) });
  const r = leerAgentes([f("hermes.json", fichero("hermes", publica)), f("otro.json", fichero("hermes2", publica)), f("lia.json", fichero("lia", publica)), { fichero: "agentes/roto.json", texto: "{" }], new Set(["lia"]));
  assert.deepEqual(r.agentes.map((a) => a.id), ["hermes"]);
  assert.equal(r.problemas.length, 3);
  assert.ok(r.problemas.some((p) => /ya es un habitante/.test(p)) && r.problemas.some((p) => /se llama agentes\/hermes2\.json/.test(p)));
});

test("a2 ticket: the listed key, this world, ± 2 min, once; anything else gets no identity and one log line without the ticket; a1 still works", () => {
  const A = par(), B = par();
  const W = mundo({ agentes: [fichero("hermes", A.publica)] });
  const billete = (o: { privada?: typeof A.privada; id?: string; mundo?: string; desfase?: number; nonce?: string } = {}) =>
    firmarBillete({ id: o.id ?? "hermes", privada: o.privada ?? A.privada, mundo: o.mundo ?? HOST, ahora: W.reloj.ms + (o.desfase ?? 0), nonce: o.nonce });
  const bueno = billete();
  assert.ok(leerBillete2(bueno) && bueno.length <= 200, "fits the identity request");
  const dentro = W.agente(bueno);
  const malos = [
    W.agente(billete({ privada: B.privada })),                  // another key
    W.agente(billete({ desfase: -3 * 60_000 })),                // too old
    W.agente(billete({ desfase: 3 * 60_000 })),                 // from the future
    W.agente(bueno),                                            // replayed
    W.agente(billete({ mundo: "otro.mundo" })),                 // made for another world
    W.agente(firmarBillete({ id: "nadie", privada: A.privada, mundo: HOST, ahora: W.reloj.ms })), // not listed
  ];
  const lia = W.agente(emitirAgente(agentsSign, "lia", today(W.reloj.ms)));
  W.pump(4);
  assert.deepEqual(W.inst.who(dentro.c.entidad), { id: "ia-hermes", nombre: `Hermes${MARCA_IA}`, ia: true });
  for (const m of malos) assert.equal(W.inst.who(m.c.entidad), null);
  assert.equal(lia.c.nombre, `Lía${MARCA_IA}`, "the inhabitants' a1 tickets are unchanged");
  const rechazos = W.log.filter((l) => l.includes("billete de agente de fuera rechazado"));
  assert.equal(rechazos.length, malos.length, rechazos.join("\n"));
  assert.ok(rechazos.some((l) => /ya usado/.test(l)) && rechazos.some((l) => /atrasado/.test(l)) && rechazos.some((l) => /no está en aventura\/agentes/.test(l)) && rechazos.some((l) => /otro mundo/.test(l)));
  assert.ok(!W.log.some((l) => l.includes(bueno.split(".")[4])), "the ticket's signature never reaches the log");
  // MOTOR_DOMINIO: the world's own name wins over whatever host the connection says
  const P = crearPuerta({ aventura: W.dir, dominios: ["motor.ejemplo.com"], ahora: () => W.reloj.ms, log: () => {} }); P.leer();
  assert.deepEqual(P.verificar(billete({ mundo: "motor.ejemplo.com" }), "otro.host"), { id: "hermes", nombre: "Hermes" });
  assert.equal(P.verificar(billete({ mundo: "otro.host" }), "otro.host"), null, "a relayed ticket for another world");
});

test("an AI's permissions = its role ∩ {enter, build}: «constructor» builds, without it it cannot place; it never moderates, manages, or downloads", () => {
  const A = par(), B = par(), C = par();
  const [admin, mod, todos] = plantilla(false);
  const conConstructor = [{ ...admin, posicion: 3 }, { ...mod, posicion: 2 }, { id: "constructor", nombre: "Constructor", color: null, posicion: 1, destacado: false, permisos: ["build-in-worlds"] }, todos];
  const W = mundo({ agentes: [fichero("obrera", A.publica, { rol: "constructor" }), fichero("mirona", B.publica), fichero("jefa", C.publica, { rol: "administracion" })], roles: conConstructor });
  const dueno = W.persona(), otra = W.persona();
  const obrera = W.agente(firmarBillete({ id: "obrera", privada: A.privada, mundo: HOST, ahora: W.reloj.ms }));
  const mirona = W.agente(firmarBillete({ id: "mirona", privada: B.privada, mundo: HOST, ahora: W.reloj.ms }));
  const jefa = W.agente(firmarBillete({ id: "jefa", privada: C.privada, mundo: HOST, ahora: W.reloj.ms }));
  W.pump(4);
  W.decir(dueno, `/dueño ${ADMIN}`);
  assert.ok(W.roles.puede(W.inst.who(obrera.c.entidad), "construir"));
  obrera.c.hacer("objetos", "colocar", { modelo: BLOQUE, x: 1, y: 0, z: 1, ry: 0, nombre: "", decorado: true });
  mirona.c.hacer("objetos", "colocar", { modelo: BLOQUE, x: 2, y: 0, z: 1, ry: 0, nombre: "", decorado: true });
  W.pump(4);
  assert.equal(obrera.hechos.length, 1, "the builder placed it");
  assert.equal(mirona.hechos.length, 0);
  assert.match(mirona.rechazos[0] ?? "", /No puedes construir/);
  // an administrator role gives an AI only enter + build
  const ia = W.inst.who(jefa.c.entidad);
  assert.deepEqual([...W.roles.acceso(ia!.id).permisos].sort(), [...PERMISOS_IA].sort());
  for (const accion of ["silenciar", "echar", "vetar", "roles", "ajustar", "descargar"]) assert.equal(W.roles.puede(ia, accion), false, accion);
  // and through the chat, the orders answer «no»
  const nombreOtra = W.inst.who(otra.s.entity)!.nombre;
  for (const orden of [`/silenciar ${nombreOtra}`, `/echar ${nombreOtra}`, `/dar ${nombreOtra} Moderación`, "/agente quitar obrera", `/dueño ${ADMIN}`]) {
    assert.ok(jefa.c.decir(orden).ok, orden); W.pump(TICK_HZ + 2);
  }
  assert.deepEqual(jefa.avisos.map((t) => t.slice(0, 40)), [
    "No tienes permiso para silenciar.", "No tienes permiso para echar.", "No tienes permiso para dar o quitar roles.", "No tienes permiso para cambiar los ajustes del", "Primero hace falta que el mundo sepa quién e",
  ].map((t) => t.slice(0, 40)));
  assert.equal(W.cerradas.length, 0, "nobody was taken out");
  assert.equal(W.roles.acceso(ia!.id).dueno, false);
});

test("members only: the world's outside agents get in, like its inhabitants", () => {
  const A = par();
  const W = mundo({ agentes: [fichero("hermes", A.publica)] });
  const dueno = W.persona();
  W.pump(3);
  W.decir(dueno, `/dueño ${ADMIN}`);
  W.decir(dueno, "/solo-miembros sí");
  const h = W.agente(firmarBillete({ id: "hermes", privada: A.privada, mundo: HOST, ahora: W.reloj.ms }));
  const visita = W.persona();
  W.pump(4);
  assert.equal(W.inst.who(h.c.entidad)?.id, "ia-hermes");
  assert.ok(!W.cerradas.some((c) => c.e === h.c.entidad));
  assert.ok(W.cerradas.some((c) => c.e === visita.s.entity), "a visitor stays out");
});

test("/agente añadir|quitar: only with manage-organization; writes the file (the owner answers for it), lets it in at once, and quitar takes it out", () => {
  const A = par();
  const W = mundo({ agentes: [] });
  const dueno = W.persona(), otro = W.persona();
  W.pump(3);
  const linea = `/agente añadir hermes Hermes de Pablo ${A.publica} constructor`;
  W.decir(otro, linea);
  assert.match(W.ultimo(otro), /No tienes permiso para cambiar los ajustes/);
  W.decir(dueno, `/dueño ${ADMIN}`);
  W.decir(dueno, `/agente añadir lia Lía ${A.publica}`);
  assert.match(W.ultimo(dueno), /es un habitante/);
  W.decir(dueno, `/agente añadir hermes Hermes de Pablo ${A.privadaPem.split("\n")[1]}`);
  assert.match(W.ultimo(dueno), /Escribe \/agente añadir/, "no public key on the line");
  W.decir(dueno, `/agente añadir hermes Hermes de Pablo ${A.publica} Moderación`);
  assert.match(W.ultimo(dueno), /Hecho: «Hermes de Pablo · IA» puede entrar/);
  const f = JSON.parse(readFileSync(join(W.dir, "agentes", "hermes.json"), "utf8"));
  assert.deepEqual({ ...f, clave: "-" }, { formato: "agente@1", id: "hermes", nombre: "Hermes de Pablo", responsable: W.inst.who(dueno.s.entity)!.nombre, clave: "-", rol: "moderacion", presencia: "a-demanda" });
  assert.equal(f.clave, A.publica);
  W.decir(dueno, `/agente añadir hermes Otro ${A.publica}`);
  assert.match(W.ultimo(dueno), /Ya hay un agente «hermes»/);
  W.decir(dueno, "/agente");
  assert.ok(dueno.chat.lineas.some((l) => /hermes \(«Hermes de Pablo · IA», rol moderacion\)/.test(l.texto)));
  // it enters at once (no restart) — and a role with moderation still gives an AI nothing but enter + build
  const h = W.agente(firmarBillete({ id: "hermes", privada: A.privada, mundo: HOST, ahora: W.reloj.ms }));
  W.pump(4);
  assert.equal(h.c.nombre, `Hermes de Pablo${MARCA_IA}`);
  assert.equal(W.roles.puede(W.inst.who(h.c.entidad), "silenciar"), false);
  W.decir(otro, "/agente quitar hermes");
  assert.match(W.ultimo(otro), /No tienes permiso/);
  W.decir(dueno, "/agente quitar lia");
  assert.match(W.ultimo(dueno), /es un habitante/);
  W.decir(dueno, "/agente quitar hermes");
  assert.match(W.ultimo(dueno), /ya no puede entrar/);
  assert.ok(!existsSync(join(W.dir, "agentes", "hermes.json")));
  assert.ok(h.avisos.some((t) => /ya no deja entrar a este agente/.test(t)), "told why, before the door closes");
  assert.ok(W.cerradas.some((c) => c.e === h.c.entidad), "closed (the server uses code 4003)");
  assert.equal(CIERRE_ROLES, 4003);
  const otraVez = W.agente(firmarBillete({ id: "hermes", privada: A.privada, mundo: HOST, ahora: W.reloj.ms }));
  W.pump(4);
  assert.equal(W.inst.who(otraVez.c.entidad), null, "removed = not listed any more");
  assert.equal(textoClave(A.privada), A.publica);
});
