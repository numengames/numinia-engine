// U14 (6): a thing that looks used for you (cosa@1 apariencia.usada), a reward granted and recorded once, and the
// organizers' read-out (npm run concesiones). The format (usada valid / invalid / absent); the record over the real plug
// — the TRG26 quest completed: one record with the right fields; the chest pressed again, a second tab, two tabs of one
// guest and two guests at the same moment, a reconnection, a restart, a repeatable quest done twice: still exactly one
// record each; a page without identity: none —; the CLI on a temp world folder prints the expected CSV and writes
// nothing; and the page's look of a thing per player (pure, then over the plug: A sees the chest open, B beside it closed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import type { StorageOp } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { celda, COLUMNAS, enCsv, leerConcesion, leerConcesiones } from "../packages/server/src/concesiones.ts";
import { cargarAventura, leerCosa, leerPnj } from "../features/misiones/formato.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { misiones as misionesDecl } from "../features/misiones/feature.ts";
import { claveConcesion, concesion } from "../features/misiones/concesion.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { aspectoCosa, crearCliente, usadasDe } from "../features/misiones/client.ts";
import type { MisionVista, PasoVista } from "../features/misiones/client.ts";
import { ACORDE_COMPLETADA, BANNER_MS, insigniasDe, NOTAS_EXITO, sonarCompletada } from "../apps/plaza/misiones.ts";

const CLI = fileURLToPath(new URL("../packages/server/src/concesiones.ts", import.meta.url));
const CERRADO = "c".repeat(64), ABIERTO = "a".repeat(64);
const SELLO = { tipo: "insignia", id: "sello-artifice", nombre: "Sello del Artífice · TRG26" };

// ---------- the TRG26 quest in small (as misiones-marcas.test.ts), with its reward and the chest's two looks ----------
const G = "Piezas reunidas";
const VUELO = {
  formato: "mision@1", id: "vuelo", titulo: "El vuelo del Maestro", descripcion: "Reúne las tres piezas y llévaselas a Leonardo.",
  pasos: [
    { id: "bastidor", tipo: "recibe", texto: "Recoge el bastidor de Cosimo", pnj: "cosimo", cosa: "bastidor", grupo: G },
    { id: "telas", tipo: "recibe", texto: "Recoge las telas de Bianca", pnj: "bianca", cosa: "telas", grupo: G },
    { id: "plano", tipo: "recibe", texto: "Recoge el plano de Artemisia", pnj: "artemisia", cosa: "plano", grupo: G },
    { id: "entrega", tipo: "entrega", texto: "Entrega las tres piezas a Leonardo", pnj: "leonardo", cosas: ["bastidor", "telas", "plano"] },
    { id: "cofre", tipo: "usa", texto: "Abre el cofre", cosa: "cofre" },
  ],
  recompensas: [SELLO], textos: { completada: "Leonardo ha volado gracias a ti." },
};
/** A repeatable quest with a reward: its record keeps the FIRST completion only. */
const FUENTE = { formato: "mision@1", id: "fuente", titulo: "Agua para la bottega", descripcion: "Llena el cubo en la fuente.", pasos: [{ id: "agua", tipo: "usa", texto: "Llena el cubo", cosa: "fuente" }], recompensas: [{ tipo: "insignia", id: "aguador", nombre: "Aguador" }], repetible: true };
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const persona = (id: string, x: number, z: number, dialogo: unknown) => ({ formato: "pnj@1", id, nombre: id[0].toUpperCase() + id.slice(1), posicion: { x, z }, dialogo });
const charla = (texto: string) => ({ entradas: [{ nodo: "hola" }], nodos: { hola: { texto, opciones: [adios] } } });
const da = (mision: string) => ({ entradas: [{ si: { mision, estado: "disponible" }, nodo: "pide" }, { nodo: "hola" }], nodos: { pide: { texto: "¿Nos ayudas?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision } }] }, hola: { texto: "Hola.", opciones: [adios] } } });
const PNJ = [
  persona("pietro", 0, 0, da("vuelo")),
  persona("cosimo", 10, 0, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "bastidor" }, nodo: "da" }, { nodo: "hola" }], nodos: { da: { texto: "Aquí tienes el bastidor.", opciones: [{ texto: "Recibir bastidor", accion: { tipo: "avanzar_paso", mision: "vuelo" } }] }, hola: { texto: "Sin madera firme, nada vuela.", opciones: [adios] } } }),
  persona("bianca", -10, 0, charla("Llévale estas telas al maestro.")),
  persona("artemisia", 0, 10, charla("Aquí tienes el plano.")),
  persona("leonardo", 0, -10, { entradas: [{ si: { mision: "vuelo", estado: "activa", paso: "entrega" }, nodo: "listo" }, { nodo: "antes" }], nodos: { listo: { texto: "¡Magnífico!", opciones: [{ texto: "Entregar piezas", accion: { tipo: "entregar", mision: "vuelo" } }] }, antes: { texto: "Aún faltan piezas.", opciones: [adios] } } }),
  persona("nonna", 20, 0, da("fuente")),
];
const cosa = (id: string, x: number, z: number, apariencia?: unknown) => ({ formato: "cosa@1", id, nombre: id, posicion: { x, z }, aviso: `usar ${id}`, ...(apariencia ? { apariencia } : {}) });
const COSAS = [cosa("bastidor", 11, 1), cosa("telas", -11, 1), cosa("plano", 1, 11), cosa("cofre", 2, -12, { modelo: CERRADO, usada: { modelo: ABIERTO } }), cosa("fuente", 21, 1)];
type Doc = { id: string; [campo: string]: unknown };
const ficheros = (dir: string, xs: Doc[]): Fichero[] => xs.map((x) => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) }));
const aventura = () => ({ misiones: ficheros("misiones", [VUELO, FUENTE]), pnj: ficheros("pnj", PNJ), cosas: ficheros("cosas", COSAS) });

test("formats: cosa@1 apariencia.usada — valid (its escala, or the thing's), absent, each mistake said where; a person has none; the wire (misiones v5) carries it", () => {
  const base = { formato: "cosa@1", id: "cofre", nombre: "Cofre", posicion: { x: 0, z: 0 }, aviso: "abrir el cofre" };
  const ok = leerCosa({ ...base, apariencia: { modelo: CERRADO, escala: 0.8, usada: { modelo: ABIERTO, escala: 1.2 } } });
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.deepEqual(ok.value.apariencia, { modelo: CERRADO, escala: 0.8, color: "", usada: { modelo: ABIERTO, escala: 1.2 } });
  const suya = leerCosa({ ...base, apariencia: { modelo: CERRADO, escala: 0.8, usada: { modelo: ABIERTO } } });
  assert.ok(suya.ok && suya.value.apariencia.usada?.escala === 0.8, "no escala: the thing's own (the open chest as big as the closed one)");
  const sin = leerCosa({ ...base, apariencia: { modelo: CERRADO } });
  assert.ok(sin.ok && !("usada" in sin.value.apariencia), "absent: nothing (it looks the same for everyone)");
  const sinApariencia = leerCosa(base);
  assert.ok(sinApariencia.ok && sinApariencia.value.apariencia.usada === undefined);
  const mal = (usada: unknown) => { const r = leerCosa({ ...base, apariencia: { modelo: CERRADO, usada } }); assert.ok(!r.ok, JSON.stringify(usada)); return r.issues; };
  assert.ok(mal("abierto").some((i) => i.path === "apariencia.usada" && /un objeto/.test(i.message)));
  assert.ok(mal({}).some((i) => i.path === "apariencia.usada.modelo" && /sha256/.test(i.message)));
  assert.ok(mal({ modelo: "cofre-abierto.glb" }).some((i) => i.path === "apariencia.usada.modelo"));
  assert.ok(mal({ modelo: ABIERTO, escala: 0 }).some((i) => i.path === "apariencia.usada.escala" && /entre 0.05 y 50/.test(i.message)));
  assert.ok(mal({ modelo: ABIERTO, color: "#ff0000" }).some((i) => i.path === "apariencia.usada.color" && /aquí van: modelo, escala/.test(i.message)));
  const p = leerPnj({ formato: "pnj@1", id: "leo", nombre: "Leo", posicion: { x: 0, z: 0 }, apariencia: { usada: { modelo: ABIERTO } }, dialogo: { entradas: [{ nodo: "h" }], nodos: { h: { texto: "Hola.", opciones: [] } } } });
  assert.ok(!p.ok && p.issues.some((i) => i.path === "apariencia.usada"), "a person has no used look");
  const r = cargarAventura(aventura());
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.aventura.cosas.get("cofre")?.apariencia.usada, { modelo: ABIERTO, escala: 1 });
  assert.deepEqual(misionesDecl.issues, []);
  assert.ok(misionesDecl.version >= 5, "v5 brought the used look");
  assert.deepEqual(misionesDecl.state!.fields.modeloUsada, { kind: "text", maxBytes: 64, default: "" });
  assert.deepEqual(misionesDecl.state!.fields.escalaUsada, { kind: "fixed", min: 0.05, max: 50, step: 0.01, default: 1 });
});

test("the record's shape: key c:<quest>:<guest> (cut at the store's 64 bytes), who, name, quest, reward ids, instant, «concedida»; small", () => {
  const m = cargarAventura(aventura()).aventura.misiones.get("vuelo")!;
  assert.equal(claveConcesion("vuelo", "abcdefghijkl"), "c:vuelo:abcdefghijkl");
  const largo = claveConcesion("m".repeat(32), `p_${"f".repeat(32)}`);
  assert.equal(largo.length, 64);
  assert.ok(largo.startsWith(`c:${"m".repeat(32)}:p_fff`), "what is left of a pass id still tells people apart");
  assert.deepEqual(concesion(m, { id: "abcdefghijkl", nombre: "Invitado IJKL" }, "2026-10-17T12:00:00.000Z"), { jugador: "abcdefghijkl", nombre: "Invitado IJKL", mision: "vuelo", recompensas: ["sello-artifice"], instante: "2026-10-17T12:00:00.000Z", estado: "concedida" });
  const peor = concesion({ ...m, id: "m".repeat(32), recompensas: Array.from({ length: 8 }, (_, i) => ({ tipo: "insignia" as const, id: `${"r".repeat(30)}-${i}`, nombre: "x" })) }, { id: `ia-a_${"f".repeat(32)}`, nombre: "ñ".repeat(60) }, new Date().toISOString());
  assert.ok(new TextEncoder().encode(peor.nombre).length <= 60, "the name cut to 60 bytes");
  assert.ok(new TextEncoder().encode(JSON.stringify(peor)).length < 1024, "the biggest record is far under the store's 4,096 bytes");
  assert.deepEqual(leerConcesion(peor), peor, "the read-out understands what the feature writes");
  for (const raro of [null, "hola", [], { jugador: "x" }, { ...peor, recompensas: "sello" }, { ...peor, instante: 5 }]) assert.equal(leerConcesion(raro), null, JSON.stringify(raro));
});

// ---------- over the real plug: server + pages ----------
const sign = signer("una-clave-de-prueba-larga");
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };
/** A FileStorage that also counts every write of a grant (a `c:` key of the misiones store): «never twice» means one write. */
class Contada extends FileStorage {
  concesiones: StorageOp[] = [];
  record(feature: string, version: number, op: StorageOp): void {
    if (feature === "misiones" && (op.op === "k" || op.op === "kd") && op.key.startsWith("c:")) this.concesiones.push(op);
    super.record(feature, version, op);
  }
}
type Pagina = { s: ClientSession; m: ReturnType<typeof crearCliente>["misiones"]; t: ReturnType<Instance["join"]>; lugares: [string, string][]; eventos: Record<string, number> };
function mundo(storage?: FileStorage) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: aventura() }), log: () => {}, identitySign: sign, storage, now: () => Date.parse("2026-10-17T12:00:00Z") });
  const paginas: Pagina[] = [];
  let n = 0;
  const abrir = (k?: Keeper): Pagina => {
    const t = inst.join(n++), cli = crearCliente(), lugares: [string, string][] = [], eventos: Record<string, number> = {};
    const s = new ClientSession(t, { features: cli.parts, ...(k ? { identity: k } : {}), view: { label() {}, bounce() {}, tag() {}, place: (key, o) => { lugares.push([key, o?.model ?? ""]); } } });
    s.features.tap((f, ev) => { if (f === "misiones") eventos[ev] = (eventos[ev] ?? 0) + 1; }); // features.log keeps only the last 32
    const p = { s, m: cli.misiones, t, lugares, eventos };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const cerrar = (p: Pagina) => { inst.disconnect(p.s.entity); paginas.splice(paginas.indexOf(p), 1); pump(2); };
  const ir = (p: Pagina, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  /** Accept «El vuelo del Maestro», get the three pieces, deliver them, and stand by the chest (its step is now). */
  const hastaElCofre = (p: Pagina) => {
    ir(p, 1, 0); p.m.hablar("pietro"); pump(2); p.m.elegir(1); pump(3);
    ir(p, 9, 0); p.m.hablar("cosimo"); pump(2); p.m.elegir(1); pump(3);
    ir(p, -9, 0); p.m.hablar("bianca"); pump(2); p.m.adios(); pump(2);
    ir(p, 0, 9); p.m.hablar("artemisia"); pump(2); p.m.adios(); pump(2);
    ir(p, 0, -9); p.m.hablar("leonardo"); pump(2); p.m.elegir(1); pump(3);
    ir(p, 2, -11);
    assert.equal(p.m.libro().find((m) => m.id === "vuelo")?.paso, 4, "on the chest step");
  };
  const fuente = (p: Pagina) => { tomarFuente(p); ir(p, 21, 0); p.m.usar("fuente"); pump(3); };
  const tomarFuente = (p: Pagina) => { ir(p, 19, 0); p.m.hablar("nonna"); pump(2); p.m.elegir(1); pump(3); };
  return { abrir, cerrar, pump, ir, hastaElCofre, fuente, tomarFuente };
}
const estadoDe = (p: Pagina, id: string) => p.m.libro().find((m) => m.id === id)?.estado;
const deQuien = (st: Contada, jugador: string) => st.concesiones.filter((o) => o.op === "k" && (o.value as { jugador?: string }).jugador === jugador);
const nuevaCarpeta = (n: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `${n}-`));

test("the grant over the real plug: ONE record with the right fields; pressed again, a second tab, two tabs and two guests at the same moment, a reconnection, a restart: still one each; no identity: none", async () => {
  const dir = nuevaCarpeta("concesiones");
  const st = new Contada(dir), W = mundo(st);
  const kA = keeper(), kB = keeper(), kC = keeper(), kD = keeper();
  const a = W.abrir(kA), sinNadie = W.abrir(); // the second page never says who it is (a bot, an agent without a ticket)
  W.pump(3);
  assert.ok(a.s.who && !sinNadie.s.who);
  W.hastaElCofre(a);
  assert.equal(st.concesiones.length, 0, "nothing before the quest completes");
  const t0 = Date.now();
  a.m.usar("cofre"); W.pump(3);
  const t1 = Date.now();
  assert.equal(estadoDe(a, "vuelo"), "hecha");
  assert.equal(st.concesiones.length, 1);
  const [op] = st.concesiones as Extract<StorageOp, { op: "k" }>[];
  assert.equal(op.key, `c:vuelo:${a.s.who!.id}`);
  const v = op.value as Record<string, string>;
  assert.deepEqual({ ...v, instante: "…" }, { jugador: a.s.who!.id, nombre: a.s.who!.nombre, mision: "vuelo", recompensas: ["sello-artifice"], instante: "…", estado: "concedida" });
  assert.match(v.instante, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, "ISO 8601, UTC");
  assert.ok(Date.parse(v.instante) >= t0 && Date.parse(v.instante) <= t1, "the moment it was opened");
  // the same guest presses again, then from a second tab: refused, nothing written
  a.m.usar("cofre"); W.pump(3);
  assert.match(a.m.estado.ultimoRechazo, /no te hace falta/);
  const a2 = W.abrir(kA); W.pump(3);
  assert.equal(a2.s.who?.id, a.s.who?.id);
  assert.equal(estadoDe(a2, "vuelo"), "hecha", "the second tab has the same book");
  W.ir(a2, 2, -11); a2.m.usar("cofre"); W.pump(3);
  assert.equal(st.concesiones.length, 1);
  // reconnecting: both tabs closed, the same browser comes back
  W.cerrar(a); W.cerrar(a2);
  const a3 = W.abrir(kA); W.pump(3);
  assert.equal(a3.s.who?.id, a.s.who?.id);
  W.ir(a3, 2, -11); a3.m.usar("cofre"); W.pump(3);
  assert.equal(estadoDe(a3, "vuelo"), "hecha");
  assert.equal(st.concesiones.length, 1, "reconnected: still one");
  // B: two tabs at the chest press in the SAME tick
  const b = W.abrir(kB), b2 = W.abrir(kB); W.pump(3);
  W.hastaElCofre(b); W.ir(b2, 2, -11);
  b.m.usar("cofre"); b2.m.usar("cofre"); W.pump(3);
  assert.equal(deQuien(st, b.s.who!.id).length, 1, "two tabs of one guest at once: one record");
  // C and D, two guests, in the same tick
  const c = W.abrir(kC), d = W.abrir(kD); W.pump(3);
  W.hastaElCofre(c); W.hastaElCofre(d);
  c.m.usar("cofre"); d.m.usar("cofre"); W.pump(3);
  for (const p of [c, d]) { assert.equal(estadoDe(p, "vuelo"), "hecha"); assert.equal(deQuien(st, p.s.who!.id).length, 1); }
  // the page without identity completes it too (its book lives in memory): no record
  W.hastaElCofre(sinNadie); sinNadie.m.usar("cofre"); W.pump(3);
  assert.equal(estadoDe(sinNadie, "vuelo"), "hecha");
  assert.deepEqual(st.concesiones.map((o) => (o as { value: { jugador: string } }).value.jugador).sort(), [a, b, c, d].map((p) => p.s.who!.id).sort(), "one each, none without identity");
  assert.ok(st.concesiones.every((o) => o.op === "k"), "never deleted");
  // a restart over the same folder: the records come back as they were; A pressing again writes nothing
  await st.flush();
  const antes = leerConcesiones(dir)!;
  assert.equal(antes.filas.length, 4);
  const st2 = new Contada(dir), W2 = mundo(st2);
  const a4 = W2.abrir(kA); W2.pump(3);
  assert.equal(estadoDe(a4, "vuelo"), "hecha", "the book came back (I1 + S4)");
  W2.ir(a4, 2, -11); a4.m.usar("cofre"); W2.pump(3);
  assert.match(a4.m.estado.ultimoRechazo, /no te hace falta/);
  assert.equal(st2.concesiones.length, 0, "after a restart: nothing written again");
  await st2.flush();
  assert.deepEqual(leerConcesiones(dir)!.filas, antes.filas, "the same records, the same instants");
});

test("a repeatable quest records only its FIRST completion (the instant of the first time)", async () => {
  const st = new Contada(nuevaCarpeta("concesiones-repe")), W = mundo(st);
  const p = W.abrir(keeper()); W.pump(3);
  W.fuente(p);
  assert.equal(estadoDe(p, "fuente"), "hecha");
  const primera = deQuien(st, p.s.who!.id);
  assert.equal(primera.length, 1);
  await new Promise((r) => setTimeout(r, 5)); // a later instant, if it were written again
  W.fuente(p); // offered again (repetible), done again
  assert.equal(p.eventos.completada, 2, "completed twice");
  assert.equal(p.m.libro().filter((m) => m.id === "fuente").length, 1);
  assert.deepEqual(deQuien(st, p.s.who!.id), primera, "no second write: the first completion stays");
});

// ---------- the organizers' read-out ----------
/** Every file under a folder with its size and modification time: the CLI must leave it exactly as it was. */
const huella = (d: string): string[] => readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const f = join(e.parentPath, e.name), s = statSync(f); return `${f} ${s.size} ${s.mtimeMs}`; }).sort();
const sinMundo = () => { const env = { ...process.env }; delete env.MOTOR_MUNDO; return env; };
const correr = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: sinMundo() });

test("the CSV: RFC 4180 quoting, a name never taken for a formula, several rewards in one cell", () => {
  assert.equal(celda("Invitado ABCD"), "Invitado ABCD");
  assert.equal(celda("Ana, la de Lyon"), "\"Ana, la de Lyon\"");
  assert.equal(celda("di \"hola\""), "\"di \"\"hola\"\"\"");
  assert.equal(celda("dos\nlíneas"), "\"dos\nlíneas\"");
  for (const f of ["=HYPERLINK(1)", "+1", "-1", "@SUM(A1)"]) assert.equal(celda(f), `'${f}`);
  assert.equal(enCsv([]), `${COLUMNAS.join(",")}\n`);
  assert.equal(enCsv([{ jugador: "abcdefghijkl", nombre: "=Ana, «la»", mision: "vuelo", recompensas: ["sello-artifice", "extra"], instante: "2026-10-17T12:00:00.000Z", estado: "concedida" }]),
    "jugador,nombre,mision,recompensas,instante,estado\nabcdefghijkl,\"'=Ana, «la»\",vuelo,sello-artifice;extra,2026-10-17T12:00:00.000Z,concedida\n");
});

test("the organizers' read-out: `npm run concesiones -- <world folder> [quest]` prints the CSV oldest first, filters one quest, reads a running world's files and writes nothing", async () => {
  const raiz = nuevaCarpeta("mundo-concesiones"), datos = join(raiz, "datos");
  mkdirSync(datos);
  const st = new FileStorage(datos), W = mundo(st);
  const a = W.abrir(keeper()), b = W.abrir(keeper()); W.pump(3);
  const espera = () => new Promise((r) => setTimeout(r, 3)); // three different instants (ms), so «oldest first» is a fact
  W.hastaElCofre(a); a.m.usar("cofre"); W.pump(3);
  await espera(); W.fuente(b);
  await espera(); W.hastaElCofre(b); b.m.usar("cofre"); W.pump(3);
  await st.flush();
  const l = leerConcesiones(raiz)!;
  assert.equal(l.donde, datos);
  assert.deepEqual(l.filas.map((f) => [f.jugador, f.mision]), [[a.s.who!.id, "vuelo"], [b.s.who!.id, "fuente"], [b.s.who!.id, "vuelo"]], "oldest first");
  const antes = huella(raiz);
  const r = correr(raiz);
  assert.equal(r.status, 0, r.stderr);
  const lineas = r.stdout.trimEnd().split("\n");
  assert.equal(lineas[0], "jugador,nombre,mision,recompensas,instante,estado");
  assert.equal(lineas.length, 4);
  assert.equal(lineas[1], `${a.s.who!.id},${a.s.who!.nombre},vuelo,sello-artifice,${l.filas[0].instante},concedida`);
  assert.equal(lineas[2], `${b.s.who!.id},${b.s.who!.nombre},fuente,aguador,${l.filas[1].instante},concedida`);
  assert.equal(r.stdout, enCsv(l.filas));
  assert.match(r.stderr, /^3 concesiones en .*datos\n$/);
  const una = correr(raiz, "vuelo");
  assert.equal(una.status, 0);
  assert.deepEqual(una.stdout.trimEnd().split("\n").slice(1).map((x) => x.split(",")[2]), ["vuelo", "vuelo"]);
  assert.match(una.stderr, /2 concesiones de «vuelo»/);
  assert.equal(correr(datos).stdout, r.stdout, "a DATOS_DIR works too (.run/datos)");
  assert.equal(correr().status, 2, "no folder: how to use it");
  const nada = correr(join(raiz, "no-existe"));
  assert.equal(nada.status, 1);
  assert.match(nada.stderr, /no hay datos de un mundo/);
  assert.deepEqual(huella(raiz), antes, "read-only: not a byte, not a date changed");
  // a running server appends every second: a line half written at the end is left out, the rest reads the same
  appendFileSync(join(datos, "misiones.jsonl"), "{\"t\":\"2026-10-17T12:00:00Z\",\"v\":5,\"op\":\"k\",\"key\":\"c:vuelo:zzzz");
  assert.deepEqual(leerConcesiones(raiz)!.filas, l.filas);
  // after a compaction the grants are in the snapshot, newer ones in the journal; something else under c: is skipped
  const otra = join(nuevaCarpeta("mundo-foto"), "datos");
  mkdirSync(otra);
  const [g1, g2] = l.filas;
  writeFileSync(join(otra, "misiones.json"), JSON.stringify({ schema: "numinia-engine/datos@1", feature: "misiones", version: 5, state: [], store: [[`c:vuelo:${g1.jugador}`, g1], ["p:x", { v: 1 }], ["c:roto:x", "hola"]] }));
  writeFileSync(join(otra, "misiones.jsonl"), `${JSON.stringify({ t: "x", v: 5, op: "k", key: `c:fuente:${g2.jugador}`, value: g2 })}\n{"roto\n`);
  const f = leerConcesiones(join(otra, ".."))!;
  assert.deepEqual(f.filas, [g1, g2]);
  assert.deepEqual([f.raras, f.rotas], [1, 1]);
});

// ---------- the page: the look of a thing per player, the banner's words and chord ----------
const paso = (n: number, tipo: string, que: string, hecho: boolean): PasoVista => ({ n, texto: `${tipo} ${que}`, tipo, hecho, x: 0, z: 0, donde: "", que, grupo: "" });
const vista = (estado: "activa" | "hecha", lista: PasoVista[], id = "vuelo"): MisionVista => ({ id, titulo: id, descripcion: "", estado, paso: 0, pasos: lista.length, seguida: false, recompensa: "", lista });
const trg = (hechos: number[], estado: "activa" | "hecha" = "activa") => vista(estado, [["recibe", "bastidor"], ["recibe", "telas"], ["recibe", "plano"], ["entrega", "leonardo"], ["usa", "cofre"]].map(([t, q], n) => paso(n, t, q, hechos.includes(n))));

test("the look of a quest thing per player (pure): from THEIR book — a done usa/coge step → the used model; nothing used, or no used look: as before", () => {
  assert.deepEqual([...usadasDe([trg([0, 1, 2, 3])])], [], "the chest still to open; the pieces given and delivered are not «used»");
  assert.deepEqual([...usadasDe([trg([0, 1, 2, 3, 4], "hecha")])], ["cofre"]);
  assert.deepEqual([...usadasDe([vista("activa", [paso(0, "coge", "caja", true), paso(1, "usa", "pozo", false)], "otra")])], ["caja"], "a coge done in an active quest counts");
  assert.deepEqual([...usadasDe([])], []);
  const cofre = { nombre: "Cofre", x: 2, z: -12, y: 0, escala: 1, modelo: CERRADO, modeloUsada: ABIERTO, escalaUsada: 1.1, color: "" };
  assert.equal(aspectoCosa(cofre).model, CERRADO, "by default (no book yet, or a page without identity): as everyone sees it");
  assert.deepEqual([aspectoCosa(cofre, true).model, aspectoCosa(cofre, true).sx, aspectoCosa(cofre, true).x], [ABIERTO, 1.1, 2]);
  assert.equal(aspectoCosa({ ...cofre, modeloUsada: "" }, true).model, CERRADO, "no used look: the same for whoever used it");
  assert.match(aspectoCosa({ ...cofre, modelo: "", modeloUsada: "" }).model, /^[0-9a-f]{64}$/, "no model at all: the house block");
  const deA = usadasDe([trg([0, 1, 2, 3, 4], "hecha")]), deB = usadasDe([trg([0])]);
  assert.deepEqual([aspectoCosa(cofre, deA.has("cofre")).model, aspectoCosa(cofre, deB.has("cofre")).model], [ABIERTO, CERRADO], "two players, two looks");
});

test("over the plug: A opens the chest — open for A (and its second tab), closed for B beside it, whose page never redraws it; a book resent redraws nothing; B then opens its own", () => {
  const W = mundo();
  const kA = keeper();
  const a = W.abrir(kA), b = W.abrir(keeper()); W.pump(3);
  const delCofre = (p: Pagina) => p.lugares.filter(([k]) => k === "misiones:cofre");
  const ultimo = (p: Pagina) => delCofre(p).at(-1)?.[1];
  assert.deepEqual([ultimo(a), ultimo(b)], [CERRADO, CERRADO]);
  W.hastaElCofre(a); W.ir(b, 3, -11);
  const vecesB = delCofre(b).length;
  a.m.usar("cofre"); W.pump(3);
  assert.equal(ultimo(a), ABIERTO);
  assert.deepEqual(a.m.usadas(), ["cofre"]);
  assert.deepEqual([ultimo(b), b.m.usadas(), delCofre(b).length], [CERRADO, [], vecesB], "B: closed, and its page did not even draw it again");
  const vecesA = delCofre(a).length, librosA = a.eventos.libro;
  W.fuente(a); // accepting and finishing another quest resends A's book twice, in many messages
  assert.ok(a.eventos.libro >= librosA + 2, "the book did arrive again");
  assert.equal(delCofre(a).length, vecesA, "a book arriving again does not flip the chest");
  const a2 = W.abrir(kA); W.pump(3);
  assert.equal(ultimo(a2), ABIERTO, "a second tab (or a reconnection) of A: open as soon as its book has arrived");
  // B did the repeatable quest and took it again (one id, active and done: it comes twice in the book), then opens its own
  W.fuente(b); W.tomarFuente(b);
  assert.equal(b.m.libro().find((m) => m.id === "fuente")?.estado, "activa");
  W.hastaElCofre(b); b.m.usar("cofre"); W.pump(3);
  assert.equal(ultimo(b), ABIERTO, "nothing stopped B from opening its own");
});

test("«Misión completada»: the reward names for the banner, ~4 s, and a short chord after the step's three notes (Web Audio, at the effects volume)", () => {
  assert.deepEqual(insigniasDe("Insignia «Sello del Artífice · TRG26»"), ["Sello del Artífice · TRG26"]);
  assert.deepEqual(insigniasDe("Insignia «Aguador», Insignia «Sello»"), ["Aguador", "Sello"]);
  assert.deepEqual(insigniasDe("Un recuerdo"), ["Un recuerdo"]);
  assert.deepEqual(insigniasDe(""), []);
  assert.ok(BANNER_MS >= 3000 && BANNER_MS <= 5000);
  const finExito = Math.max(...NOTAS_EXITO.map(([, t0]) => t0));
  assert.ok(ACORDE_COMPLETADA.length === 4 && ACORDE_COMPLETADA.every(([, t0]) => t0 > finExito), "a chord of four, after the three notes begin");
  let osciladores = 0;
  const g = { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d: unknown) => d };
  const ctx = { state: "running", currentTime: 0, destination: {}, createGain: () => g, createOscillator: () => { osciladores++; return { type: "", frequency: { value: 0 }, connect: () => g, start() {}, stop() {} }; } } as unknown as AudioContext;
  // S1: the ids carry their group («sonido.efectos»); with a bare «efectos» the slider did nothing (fixed in S1)
  assert.equal(sonarCompletada(() => ctx, (id) => (id === "sonido.efectos" ? 60 : 80)), true);
  assert.equal(osciladores, 4);
  assert.equal(sonarCompletada(() => ctx, (id) => (id === "sonido.efectos" ? 0 : 80)), false, "effects at 0: silent");
  assert.equal(sonarCompletada(() => ctx, (id) => (id === "efectos" ? 0 : 80)), true, "a group-less id is not a volume: it must not silence anything");
  osciladores = 0;
  // with the audio core's «interfaz» bus the person's volume is the graph's VCA: it is not applied twice here
  const bus = { gain: { value: 1 } } as unknown as AudioNode;
  assert.equal(sonarCompletada(() => ctx, () => 0, () => bus), true, "through the bus, the slider lives in the graph");
  assert.equal(osciladores, 4);
  assert.equal(sonarCompletada(() => null, () => 80), false, "no audio: the banner still says it");
});
