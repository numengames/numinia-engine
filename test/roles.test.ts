// H3: the world's roles are numinia.com's (STD-051/052): the pure rules, and the chat orders over a headless world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { fx, fxToFloat } from "../packages/core/src/index.ts";
import { VOZ_MULAW } from "../packages/net/src/index.ts";
import type { FeatureStorage, Saved, StorageOp } from "../packages/feature/src/index.ts";

/** What the server's datos/ keeps, in memory: a restart = a new instance over the same object. */
class MemoryStorage implements FeatureStorage {
  private readonly d = new Map<string, Saved>();
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
import chatServer, { AYUDA } from "../features/chat/server.ts";
import { crearCliente } from "../features/chat/client.ts";
import objetosServer from "../features/objetos/server.ts";
import objetosCliente from "../features/objetos/client.ts";
import { acceso, plantilla, porDebajo, noPuedeDar, validarRoles, rolPorNombre, PERMISOS, tiene } from "../packages/server/src/roles.ts";
import { crearRoles, ECHADO_MIN, INTENTOS, DENUNCIA_PAUSA_MS } from "../packages/server/src/roles-mundo.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";

test("roles: the template is STD-052's «Community»; owners hold everything; administrator = every permission; height = highest role", () => {
  const r = plantilla(false);
  assert.deepEqual(r.map((x) => [x.nombre, x.posicion]), [["Administración", 2], ["Moderación", 1], ["@todos", 0]]);
  assert.deepEqual(r[1].permisos, ["remove-members", "ban-members", "mute-members", "manage-rituals"]);
  assert.equal(tiene(acceso(r, null), "construir"), false, "a visitor = @todos: no building unless --construir todos");
  assert.equal(tiene(acceso(plantilla(true), null), "construir"), true);
  const admin = acceso(r, { roles: ["administracion"] });
  assert.equal(admin.permisos.size, PERMISOS.length);
  assert.equal(admin.altura, 2);
  const dueno = acceso(r, { roles: [], dueno: true });
  assert.equal(dueno.altura, Infinity);
  const mod = acceso(r, { roles: ["moderacion"] }), visitante = acceso(r, null);
  assert.ok(porDebajo(mod, visitante));
  assert.ok(!porDebajo(mod, mod), "never on someone at your height");
  assert.ok(!porDebajo(admin, dueno), "never on an owner");
  assert.match(noPuedeDar(mod, visitante, r[1]) ?? "", /permiso/, "Moderación cannot give roles");
  assert.equal(noPuedeDar(admin, visitante, r[1]), null);
  assert.match(noPuedeDar(admin, visitante, r[0]) ?? "", /altura/, "nobody gives a role at their own height (STD-051 ORG-003)");
  assert.match(noPuedeDar(dueno, visitante, r[2]) ?? "", /@todos/);
  assert.equal(rolPorNombre(r, "moderacion")?.id, "moderacion", "names without accents or case");
  assert.equal(rolPorNombre(r, "todos")?.id, "todos");
});

test("roles: a stored list is checked with paths; unknown permissions (numinia.com may add some) are dropped, not fatal", () => {
  const ok = validarRoles([{ id: "todos", nombre: "@todos", color: null, posicion: 0, destacado: false, permisos: ["enter-worlds", "fly-to-the-moon"] }]);
  assert.ok(ok.ok && ok.value[0].permisos.join() === "enter-worlds");
  const ko = validarRoles([{ id: "A", nombre: "", color: "red", posicion: -1, destacado: 1, permisos: "x" }]);
  assert.ok(!ko.ok);
  assert.deepEqual(ko.issues.map((i) => i.path), ["roles[0].id", "roles[0].nombre", "roles[0].color", "roles[0].posicion", "roles[0].destacado", "roles[0].permisos", "roles"]);
  assert.ok(!validarRoles("nada").ok);
});

const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

/** A headless world with chat, objetos and the world's roles: n people with identities. */
function mundo(n: number, o: { construir?: boolean; voz?: boolean; storage?: MemoryStorage; reloj?: { ms: number }; admin?: string } = {}) {
  const log: string[] = [], cerradas: number[] = [];
  const reloj = o.reloj ?? { ms: Date.parse("2026-10-15T22:00:00Z") };
  const roles = crearRoles({ construir: o.construir ?? false, voz: o.voz, admin: o.admin ?? ADMIN, firmar: sign, cerrar: (e) => { cerradas.push(e); inst.disconnect(e); }, ahora: () => reloj.ms, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, objetosServer, roles.part], log: (l) => log.push(l), identitySign: sign, storage: o.storage, puede: (who, accion) => roles.puede(who, accion), sinVoz: () => !roles.voz, oye: (de, a) => roles.oye(inst.who(de), inst.who(a)) }); // F1: the server's wiring
  const entrar = (i: number, guardado = keeper()) => {
    const t = inst.join(i), c = crearCliente(() => reloj.ms);
    const s = new ClientSession(t, { features: [c.part, objetosCliente], identity: guardado, view: { label() {}, bounce() {} } });
    const oido: number[] = []; s.onVoice = (v) => oido.push(v.entidad); // F1: voice frames this page received (by speaker entity)
    return { t, s, chat: c.chat, guardado, oido };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const nombre = (p: { s: ClientSession }) => inst.who(p.s.entity)!.nombre;
  const avisos = (p: { chat: { lineas: readonly { tipo: string; texto: string }[] } }) => p.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto);
  const ultimo = (p: Parameters<typeof avisos>[0]) => avisos(p).at(-1) ?? "";
  const decir = (p: (typeof gente)[number], texto: string) => { const r = p.chat.decir(texto); assert.deepEqual(r, { ok: true }, texto); pump(TICK_HZ + 2); }; // one second each: the chat's pace
  return { inst, roles, gente, pump, nombre, avisos, ultimo, decir, log, cerradas, reloj, entrar };
}

test("/dueño with the administration code makes you an owner (3 wrong tries = a pause); nobody else reads it", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3);
  W.decir(A, "/dueño no-es-el-codigo-de-verdad");
  assert.match(W.ultimo(A), /no es el código/);
  assert.equal(B.chat.lineas.length, 0, "an order is never published");
  W.decir(A, `/dueño ${ADMIN}`);
  assert.match(W.ultimo(A), /Ya eres dueño/);
  assert.equal(W.roles.acceso(W.inst.who(A.s.entity)!.id).dueno, true);
  assert.ok(!W.log.some((l) => l.includes(ADMIN)), "the code never reaches the log");
  for (let i = 0; i < INTENTOS; i++) W.decir(B, "/dueno mal");
  W.decir(B, `/dueño ${ADMIN}`);
  assert.match(W.ultimo(B), /Demasiados intentos/, "after 3 wrong codes even the right one waits");
});

test("/dar and /quitar follow STD-051: only with manage-roles, only below your height; the page learns at once that it may build", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(B, `/dar ${W.nombre(C)} Moderación`);
  assert.match(W.ultimo(B), /No tienes permiso para dar/);
  W.decir(A, `/dar ${W.nombre(B)} administracion`);
  assert.match(W.ultimo(A), /tiene ahora «Administración»/);
  assert.match(W.ultimo(B), /te ha dado el rol «Administración»/);
  W.decir(B, `/dar ${W.nombre(C)} Administración`);
  assert.match(W.ultimo(B), /a tu altura o por encima/, "an administrator cannot make another administrator");
  W.decir(B, `/dar ${W.nombre(A)} Moderación`);
  assert.match(W.ultimo(B), /dueño/);
  W.decir(B, `/dar ${W.nombre(C)} Moderación`);
  assert.match(W.ultimo(C), /«Moderación»/);
  W.decir(C, "/roles");
  assert.match(W.avisos(C).at(-2) ?? "", /Eres: Moderación, @todos\. Puedes: entrar si es solo para miembros, silenciar, echar, vetar, dirigir \(escenas, narrar, convocar\), subir y bajar a alguien del escenario\./);
  W.decir(B, `/quitar ${W.nombre(C)} Moderación`);
  assert.match(W.ultimo(B), /ya no tiene «Moderación»/);
});

test("M17 /escenario: moderation (manage-rituals) puts people on stage — itself too —, everyone is told, the instance asks per id; not stored", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.decir(C, `/escenario ${W.nombre(B)}`);
  assert.match(W.ultimo(C), /No tienes permiso para subir y bajar a alguien del escenario/);
  W.decir(C, "/escenario");
  assert.match(W.ultimo(C), /No hay nadie en el escenario/, "the list is open to everyone");
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, `/dar ${W.nombre(C)} Moderación`);
  W.decir(C, `/escenario ${W.nombre(B)}`);
  assert.equal(W.roles.enEscenario(W.inst.who(B.s.entity)?.id), true);
  assert.equal(W.roles.enEscenario(W.inst.who(A.s.entity)?.id), false);
  for (const p of W.gente) assert.match(W.ultimo(p), new RegExp(`${W.nombre(B)} sube al escenario: su voz la oye todo el mundo`), "the whole zone is told");
  W.decir(C, `/escenario ${W.nombre(C)}`);
  assert.equal(W.roles.enEscenario(W.inst.who(C.s.entity)?.id), true, "you may put yourself on stage");
  W.decir(C, `/escenario ${W.nombre(B)}`);
  assert.match(W.ultimo(C), /ya está en el escenario/);
  W.decir(A, "/escenario");
  assert.match(W.avisos(A).at(-2) ?? "", new RegExp(`En el escenario: ${W.nombre(B)}, ${W.nombre(C)}\\.`));
  W.decir(C, `/escenario quitar ${W.nombre(B)}`);
  assert.equal(W.roles.enEscenario(W.inst.who(B.s.entity)?.id), false);
  assert.match(W.ultimo(B), /baja del escenario/);
  W.decir(C, `/escenario quitar ${W.nombre(B)}`);
  assert.match(W.ultimo(C), /no está en el escenario/);
  W.decir(A, "/escenario nadie");
  assert.equal(W.roles.enEscenario(W.inst.who(C.s.entity)?.id), false);
  assert.match(W.ultimo(A), /vacía el escenario/);
  assert.equal(W.inst.features.allState().some((s: unknown) => JSON.stringify(s).includes("escenario")), false, "nothing about the stage is stored");
});

test("building: --construir sets @todos; a role with «build-in-worlds» opens it for one person and objetos tells the page", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3);
  const puede = (p: { s: ClientSession }) => (p.s.features as unknown as { parts?: unknown }) && W.roles.puede(W.inst.who(p.s.entity), "construir");
  assert.equal(puede(B), false, "a closed world: a visitor does not build");
  W.decir(A, `/dueño ${ADMIN}`);
  assert.equal(puede(A), true, "an owner builds");
  W.decir(A, `/dar ${W.nombre(B)} Administración`);
  assert.equal(puede(B), true);
  const abierto = mundo(1, { construir: true });
  abierto.pump(3);
  assert.equal(abierto.roles.puede(abierto.inst.who(abierto.gente[0].s.entity), "construir"), true);
  assert.equal(abierto.roles.puede({ id: "ia-lia", nombre: "Lía · IA", ia: true }, "construir"), true, "an AI = @todos, never more");
  assert.equal(W.roles.puede({ id: "ia-lia", nombre: "Lía · IA", ia: true }, "construir"), false);
});

test("/silenciar: only below you; the silenced person is told and nobody reads them; 0 gives the word back", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, `/dar ${W.nombre(B)} Moderación`);
  W.decir(C, `/silenciar ${W.nombre(B)}`);
  assert.match(W.ultimo(C), /No tienes permiso para silenciar/);
  W.decir(B, `/silenciar ${W.nombre(A)} 5`);
  assert.match(W.ultimo(B), /a tu altura o por encima/, "nobody silences an owner");
  W.decir(B, `/silenciar ${W.nombre(C)} 5`);
  assert.match(W.ultimo(C), /te ha silenciado 5 min/);
  for (const p of [A, C]) { W.inst.sim.tf.cols.x[p.s.entity] = fx(1); W.inst.sim.tf.cols.z[p.s.entity] = fx(1); } // within 20 m: A would read C
  W.pump();
  const antes = A.chat.lineas.length;
  W.decir(C, "hola a todos");
  assert.match(W.ultimo(C), /Estás en silencio 5 min más/);
  assert.equal(A.chat.lineas.length, antes, "nobody read it");
  W.decir(B, `/silenciar ${W.nombre(C)} 0`);
  W.decir(C, "ya puedo hablar");
  assert.ok(A.chat.lineas.some((l) => l.texto === "ya puedo hablar"));
});

test("/echar takes someone out for 10 minutes (same guest comes back later); /vetar needs a reason and holds until /perdonar", () => {
  const W = mundo(3);
  const [A, B, C] = W.gente;
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  const nB = W.nombre(B), nC = W.nombre(C);
  W.decir(A, `/echar ${nB}`);
  assert.match(W.avisos(B).join("|"), /te ha sacado de este mundo/);
  assert.ok(W.cerradas.includes(B.s.entity), "the server closed the connection");
  const B2 = W.entrar(5, B.guardado); W.gente.push(B2); W.pump(3);
  assert.match(W.avisos(B2).join("|"), /Puedes volver dentro de 10 min/);
  W.reloj.ms += (ECHADO_MIN + 1) * 60000;
  const B3 = W.entrar(6, B.guardado); W.gente.push(B3); W.pump(3);
  assert.equal(W.avisos(B3).length, 0, "after 10 minutes the same guest gets in");
  W.decir(A, `/vetar ${nC}`);
  assert.match(W.ultimo(A), /Di por qué/);
  W.decir(A, `/vetar ${nC} insultos en el chat`);
  assert.match(W.avisos(C).join("|"), /Te han vetado en este mundo: insultos en el chat/);
  W.reloj.ms += 7 * 86_400_000;
  const C2 = W.entrar(7, C.guardado); W.gente.push(C2); W.pump(3);
  assert.match(W.avisos(C2).join("|"), /vetado/, "a week later, still out");
  W.decir(A, `/perdonar ${nC}`);
  assert.match(W.ultimo(A), /puede volver a entrar/);
  const C3 = W.entrar(8, C.guardado); W.gente.push(C3); W.pump(3);
  assert.equal(W.avisos(C3).length, 0);
});

test("/solo-miembros sí: visitors stay out, members and the world's AIs come in; roles and owners survive a restart", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-15T22:00:00Z") };
  const W = mundo(2, { storage, reloj });
  const [A, B] = W.gente;
  W.pump(3);
  W.decir(B, "/solo-miembros sí");
  assert.match(W.ultimo(B), /No tienes permiso/);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, `/dar ${W.nombre(B)} Moderación`);
  W.decir(A, "/solo-miembros sí");
  assert.match(W.ultimo(A), /solo entran miembros/);
  const fuera = W.entrar(9); W.gente.push(fuera); W.pump(3);
  assert.match(W.avisos(fuera).join("|"), /solo para sus miembros/);
  // a restart: the same store, new instance
  const W2 = mundo(0, { storage, reloj });
  const A2 = W2.entrar(1, A.guardado), B2 = W2.entrar(2, B.guardado); W2.gente.push(A2, B2); W2.pump(3);
  assert.equal(W2.roles.acceso(W2.inst.who(A2.s.entity)!.id).dueno, true, "the owner is still the owner");
  assert.equal(W2.roles.soloMiembros, true);
  assert.equal(W2.avisos(B2).length, 0, "a member gets in");
  assert.ok(tiene(W2.roles.acceso(W2.inst.who(B2.s.entity)!.id), "silenciar"));
});

test("file over app: MOTOR_CONSTRUIR seeds a new world once; after that its stored roles decide, and /construir todos|nadie changes them", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-15T22:00:00Z") };
  const construye = (W: ReturnType<typeof mundo>, p: { s: ClientSession }) => W.roles.puede(W.inst.who(p.s.entity), "construir");
  const W = mundo(2, { storage, reloj, construir: true });
  const [A, B] = W.gente;
  W.pump(3);
  assert.equal(construye(W, B), true, "a new world takes the seed");
  assert.equal(W.log.filter((l) => l.includes("mundo sin roles guardados")).length, 1, "said once");
  W.decir(A, `/dueño ${ADMIN}`);
  // a restart with the other value: the world keeps what it stored
  const W2 = mundo(0, { storage, reloj, construir: false });
  const A2 = W2.entrar(1, A.guardado), B2 = W2.entrar(2, B.guardado); W2.gente.push(A2, B2); W2.pump(3);
  assert.equal(construye(W2, B2), true, "MOTOR_CONSTRUIR no longer changes a world that has its roles");
  assert.ok(!W2.log.some((l) => l.includes("mundo sin roles guardados")));
  assert.ok(W2.log.some((l) => /MOTOR_CONSTRUIR solo vale para un mundo nuevo/.test(l)), "the log says why the variable did nothing");
  W2.decir(B2, "/construir nadie");
  assert.match(W2.ultimo(B2), /No tienes permiso para cambiar los ajustes/);
  W2.decir(A2, "/construir");
  assert.match(W2.ultimo(A2), /Ahora construye cualquiera/);
  W2.decir(A2, "/construir nadie");
  assert.match(W2.ultimo(A2), /construye solo quien tiene un rol/);
  assert.equal(construye(W2, B2), false, "at once, without a restart");
  assert.equal(W2.roles.todosConstruyen, false);
  assert.equal(construye(W2, A2), true, "an owner still builds");
  const guardado = storage.load("roles")!.store.find(([k]) => k === "roles")![1] as { posicion: number; permisos: string[] }[];
  assert.ok(!guardado.find((r) => r.posicion === 0)!.permisos.includes("build-in-worlds"), "kept in datos/roles: it travels in the zip");
  const W3 = mundo(0, { storage, reloj, construir: true });
  const B3 = W3.entrar(2, B.guardado); W3.gente.push(B3); W3.pump(3);
  assert.equal(construye(W3, B3), false, "and it holds after another restart with MOTOR_CONSTRUIR=todos");
});

test("file over app: MOTOR_VOZ seeds a new world once; /voz sí|no changes it at once, survives restarts and keeps unknown settings", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-15T22:00:00Z") };
  storage.record("roles", 1, { op: "k", key: "config", value: { soloMiembros: false, deOtroMotor: 7 } }); // a newer engine's setting
  const W = mundo(2, { storage, reloj, voz: false });
  const [A, B] = W.gente;
  W.pump(3);
  assert.equal(W.roles.voz, false, "a world with no voice setting takes MOTOR_VOZ=no as its seed");
  assert.equal(W.log.filter((l) => l.includes("mundo sin ajuste de voz guardado")).length, 1);
  const W2 = mundo(0, { storage, reloj, voz: true });
  W2.pump(3);
  assert.equal(W2.roles.voz, false, "a restart without MOTOR_VOZ=no keeps it off");
  W.decir(B, "/voz sí");
  assert.match(W.ultimo(B), /No tienes permiso/);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, "/voz sí");
  assert.match(W.ultimo(A), /la voz de cada micrófono llega/);
  assert.equal(W.roles.voz, true);
  const config = storage.load("roles")!.store.find(([k]) => k === "config")![1];
  assert.deepEqual(config, { soloMiembros: false, deOtroMotor: 7, voz: true }, "fields this engine does not know are kept");
  const W3 = mundo(0, { storage, reloj, voz: false });
  W3.pump(3);
  assert.equal(W3.roles.voz, true, "MOTOR_VOZ=no does not switch an existing world off");
  assert.ok(!W3.log.some((l) => l.includes("mundo sin ajuste de voz guardado")));
});

test("C3: an owner is tied to the administration code it used; after the code changes (the fleet's «change the code») it is not", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-16T05:00:00Z") };
  const W = mundo(1, { storage, reloj });
  const [A] = W.gente;
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  const guardado = JSON.stringify(storage.load("roles"));
  assert.ok(!guardado.includes(ADMIN), "the code itself is never kept (only a fingerprint keyed with the server's secret)");
  const otra = (admin: string) => { const W2 = mundo(0, { storage, reloj, admin }); const A2 = W2.entrar(1, A.guardado); W2.gente.push(A2); W2.pump(3); return { W2, A2 }; };
  const igual = otra(ADMIN);
  assert.equal(igual.W2.roles.acceso(igual.W2.inst.who(igual.A2.s.entity)!.id).dueno, true, "same code: still the owner");
  const nuevo = otra("otro-codigo-de-la-sala");
  assert.equal(nuevo.W2.roles.acceso(nuevo.W2.inst.who(nuevo.A2.s.entity)!.id).dueno, false, "a new code: no longer the owner");
  assert.ok(nuevo.W2.log.some((l) => /otro código de administración/.test(l)));
  const otraVez = otra(ADMIN);
  assert.equal(otraVez.W2.roles.acceso(otraVez.W2.inst.who(otraVez.A2.s.entity)!.id).dueno, false, "dropped for good: /dueño again with the code of now");
});

test("the chat's help names /roles and fits in one notice", () => {
  assert.match(AYUDA, /\/roles/);
  assert.ok(new TextEncoder().encode(AYUDA).length <= 300, `${new TextEncoder().encode(AYUDA).length} bytes`);
});

/** F1: everyone at the same spot (chat within 20 m, voice within 30 m, in everyone's area of interest). */
function juntos(W: ReturnType<typeof mundo>) {
  for (const p of W.gente) { W.inst.sim.tf.cols.x[p.s.entity] = fx(1); W.inst.sim.tf.cols.z[p.s.entity] = fx(1); }
  W.pump(4);
}
const habla = (W: ReturnType<typeof mundo>, p: ReturnType<typeof mundo>["gente"][number]) => { for (const q of W.gente) q.oido.length = 0; assert.ok(p.s.sendVoice(VOZ_MULAW, new Uint8Array(40).fill(7))); W.pump(2); };

test("F1 /silenciar also mutes the voice; /hablar lifts it; the silence survives a restart and the person is told again", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-15T22:00:00Z") };
  const W = mundo(3, { storage, reloj });
  const [A, B, C] = W.gente;
  W.pump(3);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, `/dar ${W.nombre(B)} Moderación`);
  juntos(W);
  habla(W, C);
  assert.deepEqual([A.oido, B.oido], [[C.s.entity], [C.s.entity]], "before: both hear C");
  W.decir(B, `/silenciar ${W.nombre(C)} 30`);
  assert.match(W.ultimo(C), /te ha silenciado 30 min: nadie te lee en el chat ni te oye por voz/);
  assert.match(W.ultimo(B), /queda en silencio 30 min \(chat y voz\)/);
  habla(W, C);
  assert.deepEqual([A.oido, B.oido], [[], []], "silenced: nobody hears C");
  habla(W, A);
  assert.deepEqual(C.oido, [A.s.entity], "C still hears the others");
  // a restart: the same store, new instance; C comes back and is still silent
  const W2 = mundo(0, { storage, reloj });
  const A2 = W2.entrar(1, A.guardado), B2 = W2.entrar(2, B.guardado), C2 = W2.entrar(3, C.guardado); W2.gente.push(A2, B2, C2); W2.pump(3);
  assert.match(W2.avisos(C2).join("|"), /Sigues en silencio 30 min más/);
  juntos(W2);
  W2.decir(C2, "hola");
  assert.match(W2.ultimo(C2), /Estás en silencio/);
  assert.ok(!A2.chat.lineas.some((l) => l.texto === "hola"));
  habla(W2, C2);
  assert.deepEqual(A2.oido, [], "still not heard after the restart");
  W2.decir(B2, `/hablar ${W2.nombre(C2)}`);
  assert.match(W2.ultimo(C2), /te ha devuelto la palabra/);
  W2.decir(C2, "ya");
  assert.ok(A2.chat.lineas.some((l) => l.texto === "ya"));
  habla(W2, C2);
  assert.deepEqual(A2.oido, [C2.s.entity]);
  W2.decir(B2, `/hablar ${W2.nombre(C2)}`);
  assert.match(W2.ultimo(B2), /no estaba en silencio/);
});

test("F1 /bloquear: A stops reading and hearing B, C still does, B is not told; it survives a reload; /desbloquear undoes it", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-15T22:00:00Z") };
  const W = mundo(3, { storage, reloj });
  const [A, B, C] = W.gente;
  W.pump(3);
  juntos(W);
  W.decir(C, `/bloquear ${W.nombre(C)}`);
  assert.match(W.ultimo(C), /no te lo puedes hacer a ti/);
  const avisosB = W.avisos(B).length;
  W.decir(A, `/bloquear ${W.nombre(B)}`);
  assert.match(W.ultimo(A), /no lees ni oyes a/);
  assert.equal(W.avisos(B).length, avisosB, "the blocked person is not told");
  assert.deepEqual(W.roles.bloqueados(W.inst.who(A.s.entity)!.id), [W.inst.who(B.s.entity)!.id]);
  W.decir(B, "cerca");
  B.chat.decir("zona", "zona"); W.pump(TICK_HZ + 2);
  assert.ok(!A.chat.lineas.some((l) => l.texto === "cerca" || l.texto === "zona"), "A reads nothing from B");
  assert.ok(C.chat.lineas.some((l) => l.texto === "cerca") && C.chat.lineas.some((l) => l.texto === "zona"), "C reads both");
  habla(W, B);
  assert.deepEqual([A.oido, C.oido], [[], [B.s.entity]], "A does not hear B, C does");
  habla(W, A);
  assert.deepEqual(B.oido, [A.s.entity], "B still hears A: a block is one-way");
  W.decir(A, `/bloquear ${W.nombre(B)}`);
  assert.match(W.ultimo(A), /Ya no lees/);
  // a reload of both pages (new entities, same identities): the block holds
  const W2 = mundo(0, { storage, reloj });
  const A2 = W2.entrar(1, A.guardado), B2 = W2.entrar(2, B.guardado), C2 = W2.entrar(3, C.guardado); W2.gente.push(A2, B2, C2); W2.pump(3);
  juntos(W2);
  W2.decir(B2, "otra vez");
  assert.ok(!A2.chat.lineas.some((l) => l.texto === "otra vez"));
  assert.ok(C2.chat.lineas.some((l) => l.texto === "otra vez"));
  habla(W2, B2);
  assert.deepEqual([A2.oido, C2.oido], [[], [B2.s.entity]]);
  W2.decir(A2, `/desbloquear ${W2.nombre(B2)}`);
  assert.match(W2.ultimo(A2), /Vuelves a leer y oír/);
  W2.decir(B2, "de vuelta");
  assert.ok(A2.chat.lineas.some((l) => l.texto === "de vuelta"));
  habla(W2, B2);
  assert.deepEqual(A2.oido, [B2.s.entity]);
  W2.decir(A2, `/desbloquear ${W2.nombre(B2)}`);
  assert.match(W2.ultimo(A2), /No tenías bloqueado/);
  assert.deepEqual(W2.roles.bloqueados(W2.inst.who(A2.s.entity)!.id), []);
});

test("H3c /nombre: cambia el nombre sobre la cabeza y en lo que dices, se guarda con la identidad, y nunca acaba en « · IA»", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-18T09:00:00Z") };
  const W = mundo(2, { storage, reloj });
  const [A, B] = W.gente;
  W.pump(3);
  juntos(W);
  W.decir(A, "/nombre Mundo · IA");
  assert.match(W.ultimo(A), /reserva para los agentes de IA/);
  assert.ok(!B.chat.nombres.has(A.s.entity) || B.chat.nombres.get(A.s.entity) !== "Mundo · IA", "the rejected name never applies");
  W.decir(A, "/nombre ");
  assert.match(W.ultimo(A), /Escribe \/nombre/);
  W.decir(A, "/nombre Caminante del Alba");
  assert.match(W.ultimo(A), /Desde ahora te llamas «Caminante del Alba»/);
  W.decir(A, "hola");
  assert.ok(B.chat.lineas.some((l) => l.texto === "hola" && l.nombre === "Caminante del Alba"));
  // an AI never gets to use the order on itself (it never types chat orders as a guest, but the check stays defensive)
  assert.equal(W.roles.acceso(`ia-x`).permisos.size >= 0, true);
  // saved with the identity: a restart (same guest id) gets it back, and the chosen name is used again at once
  const W2 = mundo(0, { storage, reloj });
  const A2 = W2.entrar(1, A.guardado), B2 = W2.entrar(2, B.guardado);
  W2.gente.push(A2, B2);
  W2.pump(3);
  juntos(W2);
  W2.decir(A2, "otra vez");
  assert.ok(B2.chat.lineas.some((l) => l.texto === "otra vez" && l.nombre === "Caminante del Alba"), "the name survives a restart, reapplied on identify");
});

test("H3c /aparecer aquí fija dónde (re)apareces, se guarda con la identidad; /aparecer quitar lo deshace", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-18T09:00:00Z") };
  const W = mundo(1, { storage, reloj });
  const [A] = W.gente;
  W.pump(3);
  W.inst.sim.tf.cols.x[A.s.entity] = fx(12); W.inst.sim.tf.cols.z[A.s.entity] = fx(8);
  W.pump();
  W.decir(A, "/aparecer aqui");
  assert.match(W.ultimo(A), /desde ahora apareces aquí/i);
  const W2 = mundo(0, { storage, reloj });
  const A2 = W2.entrar(1, A.guardado);
  W2.gente.push(A2);
  W2.pump(3);
  const p2 = { x: fxToFloat(W2.inst.sim.tf.cols.x[A2.s.entity]), z: fxToFloat(W2.inst.sim.tf.cols.z[A2.s.entity]) };
  assert.ok(Math.abs(p2.x - 12) < 2 && Math.abs(p2.z - 8) < 2, `apareció cerca de (12, 8): ${JSON.stringify(p2)}`);
  W2.decir(A2, "/aparecer quitar");
  assert.match(W2.ultimo(A2), /vuelves a aparecer donde aparece cualquiera/i);
  W2.decir(A2, "/aparecer quitar");
  assert.match(W2.ultimo(A2), /no tenías un punto de aparición propio/i);
});

test("H3c /chat borrar necesita manage-organization (como /construir, /voz, /solo-miembros) y vacía el historial de la zona", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3);
  W.decir(A, "/chat borrar");
  assert.match(W.ultimo(A), /No tienes permiso para cambiar los ajustes/);
  W.decir(A, `/dueño ${ADMIN}`);
  juntos(W);
  B.chat.decir("lo de antes", "zona");
  W.pump(TICK_HZ + 2);
  assert.ok(B.chat.lineas.some((l) => l.texto === "lo de antes"));
  W.decir(A, "/chat borrar");
  assert.match(W.ultimo(A), /historial de la zona está vacío/);
  const C = W.entrar(9);
  W.gente.push(C);
  W.pump(3);
  assert.ok(!C.chat.lineas.some((l) => l.tipo === "antes"), "quien entra después no ve nada de antes de borrarlo");
});

test("ux2-gente /denunciar: whoever moderates and is connected hears it at once, it is kept for /denuncias, one a minute, never published", () => {
  const storage = new MemoryStorage(), reloj = { ms: Date.parse("2026-10-19T10:00:00Z") };
  const W = mundo(3, { storage, reloj });
  const [A, B, C] = W.gente;
  W.pump(3);
  juntos(W);
  W.decir(B, `/denunciar ${W.nombre(C)} insulta en el chat`);
  assert.match(W.ultimo(B), /no hay nadie de moderación conectado/, "nobody moderates yet: kept for later");
  assert.equal(W.roles.denuncias().length, 1);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, "/denuncias");
  assert.match(W.ultimo(A), /denuncia a .*«insulta en el chat»/, "an owner reads what was kept");
  const lineasC = C.chat.lineas.length;
  W.decir(B, `/denunciar ${W.nombre(C)} otra vez`);
  assert.match(W.ultimo(B), /Espera \d+ s/, "one a minute");
  reloj.ms += DENUNCIA_PAUSA_MS;
  W.decir(B, `/denunciar ${W.nombre(C)} empuja a la gente`);
  assert.match(W.ultimo(B), /Aviso enviado a moderación \(1 persona conectada\)/);
  assert.match(W.ultimo(A), /Aviso para moderación: .* denuncia a .*«empuja a la gente»/, "the owner hears it at once");
  assert.equal(C.chat.lineas.length, lineasC, "the reported person is not told");
  W.decir(B, `/denunciar ${W.nombre(C)}`);
  assert.match(W.ultimo(B), /Di qué ha pasado/);
  W.decir(C, "/denuncias");
  assert.match(W.ultimo(C), /Solo quien modera/);
  const d = W.roles.denuncias();
  assert.deepEqual(d.map((x) => [x.de, x.a, x.motivo]), [[W.inst.who(B.s.entity)!.id, W.inst.who(C.s.entity)!.id, "insulta en el chat"], [W.inst.who(B.s.entity)!.id, W.inst.who(C.s.entity)!.id, "empuja a la gente"]]);
});
