// H3: the world's roles are numinia.com's (STD-051/052): the pure rules, and the chat orders over a headless world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
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
import { crearRoles, ECHADO_MIN, INTENTOS } from "../packages/server/src/roles-mundo.ts";

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
function mundo(n: number, o: { construir?: boolean; storage?: MemoryStorage; reloj?: { ms: number } } = {}) {
  const log: string[] = [], cerradas: number[] = [];
  const reloj = o.reloj ?? { ms: Date.parse("2026-10-15T22:00:00Z") };
  const roles = crearRoles({ construir: o.construir ?? false, admin: ADMIN, cerrar: (e) => { cerradas.push(e); inst.disconnect(e); }, ahora: () => reloj.ms, log: (l) => log.push(l) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, objetosServer, roles.part], log: (l) => log.push(l), identitySign: sign, storage: o.storage, puede: (who, accion) => roles.puede(who, accion) });
  const entrar = (i: number, guardado = keeper()) => {
    const t = inst.join(i), c = crearCliente(() => reloj.ms);
    const s = new ClientSession(t, { features: [c.part, objetosCliente], identity: guardado, view: { label() {}, bounce() {} } });
    return { t, s, chat: c.chat, guardado };
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
  assert.match(W.avisos(C).at(-2) ?? "", /Eres: Moderación, @todos\. Puedes: entrar si es solo para miembros, silenciar, echar, vetar\./);
  W.decir(B, `/quitar ${W.nombre(C)} Moderación`);
  assert.match(W.ultimo(B), /ya no tiene «Moderación»/);
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

test("the chat's help names /roles and fits in one notice", () => {
  assert.match(AYUDA, /\/roles/);
  assert.ok(new TextEncoder().encode(AYUDA).length <= 300, `${new TextEncoder().encode(AYUDA).length} bytes`);
});
