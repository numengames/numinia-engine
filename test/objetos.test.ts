// H1: things placed in the world (features/objetos) — headless over the in-memory transport, plus the HTTP side
// (/a/<sha256>) on a real server. Parity with Hyperfy2's blueprints + entities: docs/HYPERFY2-PARIDAD.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ServerRuntime, serverPart } from "../packages/feature/src/index.ts";
import type { ClientPart, PlacedObject, ServerPart } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { startServer } from "../packages/server/src/server.ts";
import { objetos, OBJETOS_MAX } from "../features/objetos/feature.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };

const ROOT = new URL("../", import.meta.url).pathname;
const BLOQUE = biblioteca.modelos.find((m) => m.id === "bloque")!.modelo;
const cerca = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-6;

/** One instance with the objetos feature; each page has its own builder (crearCliente) and records what it draws. */
function world(opts: { abierto: boolean; storage?: FileStorage; n?: number }) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: (l) => log.push(l), storage: opts.storage, puede: (_w, accion) => opts.abierto && accion === "construir" });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; b: ReturnType<typeof crearCliente>["constructor"]; drawn: Map<string, PlacedObject> }[] = [];
  const add = () => {
    const t = inst.join(pages.length), cli = crearCliente(), drawn = new Map<string, PlacedObject>();
    const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
    pages.push({ s, t, b: cli.constructor, drawn });
    return pages[pages.length - 1];
  };
  for (let i = 0; i < (opts.n ?? 2); i++) add();
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump, add, log };
}

test("the house library: every model's sha256 is its file's, and every licence is CC0", () => {
  for (const m of biblioteca.modelos) {
    const bytes = readFileSync(join(ROOT, m.fichero));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), m.modelo, `${m.fichero}: biblioteca.json dice otro sha256 (¿cambió el fichero? node tools/hacer-bloque.mjs es determinista)`);
    assert.equal(m.licencia, "CC0-1.0", m.fichero);
  }
  assert.ok(objetos.issues.length === 0, JSON.stringify(objetos.issues));
});

test("building closed: nothing is placed and the page hears why; the page knows it may not build", () => {
  const { pages, pump } = world({ abierto: false });
  const [a, b] = pages;
  assert.equal(a.b.estado.puede, false);
  assert.ok(a.b.colocar("bloque").ok); // the page asks; the server says no
  pump();
  assert.equal(a.s.features.stateOf("objetos").size, 0);
  assert.equal(b.drawn.size, 0);
  assert.match(a.b.estado.ultimoRechazo, /construir/);
  assert.match(a.s.features.announcements.at(-1)?.text ?? "", /cerrado a construir/); // V1: said to screen readers too
});

test("building open: place, everyone gets it (also who comes later); turn, move, pin, duplicate, delete and undo", () => {
  const { pages, pump, add } = world({ abierto: true });
  const [a, b] = pages;
  assert.equal(a.b.estado.puede, true);
  a.b.colocar("bloque"); pump();
  const id = a.b.estado.seleccionado;
  assert.ok(id, "the builder selects what it placed (event hecho)");
  const o = b.s.features.stateOf("objetos").get(id)!;
  assert.deepEqual({ modelo: o.modelo, x: o.x, z: o.z, nombre: o.nombre, decorado: o.decorado }, { modelo: BLOQUE, x: 0, z: -3, nombre: "Bloque", decorado: false });
  assert.equal(b.drawn.get(id)?.model, BLOQUE);                       // B draws it
  const c = add(); pump();
  assert.equal(c.drawn.get(id)?.model, BLOQUE, "who comes later gets the zone's list");
  a.b.girar(90); pump();
  assert.equal(b.drawn.get(id)?.ry, 90);
  a.b.girar(120); pump();
  assert.equal(b.drawn.get(id)?.ry, -150, "angles stay in (-180, 180]");
  a.b.fijar(); pump();
  a.b.desplazar(2, 0); pump();
  assert.match(a.b.estado.ultimoRechazo, /fijado/);
  assert.equal(b.drawn.get(id)?.x, 0, "a pinned thing does not move");
  a.b.fijar(); pump();
  for (let i = 0; i < 5; i++) { a.b.desplazar(1, 0); pump(); }         // a drag: five moves within a second
  assert.ok(cerca(b.drawn.get(id)?.x, 5));
  pump(25);                                                            // more than a second later: a new change
  a.b.escalar(2); pump();
  assert.ok(cerca(b.drawn.get(id)?.sx, 2) && cerca(b.drawn.get(id)?.sy, 2));
  a.b.duplicar(); pump();
  const copia = a.b.estado.seleccionado;
  assert.notEqual(copia, id);
  assert.ok(cerca(b.drawn.get(copia)?.x, 6), "the copy goes a metre to the side");
  a.b.borrar(); pump();
  assert.equal(b.drawn.has(copia), false);
  a.b.deshacer(); pump();                                              // the delete
  assert.ok(cerca(b.drawn.get(copia)?.x, 6));
  a.b.deshacer(); pump();                                              // the duplicate
  assert.equal(b.drawn.has(copia), false);
  a.b.deshacer(); pump();                                              // the scale
  assert.ok(cerca(b.drawn.get(id)?.sx, 1) && cerca(b.drawn.get(id)?.x, 5));
  a.b.deshacer(); pump();                                              // the drag: ONE undo for the five moves
  assert.ok(cerca(b.drawn.get(id)?.x, 0));
  // B cannot undo what A did: undo stacks are per builder
  b.b.deshacer(); pump();
  assert.match(b.b.estado.ultimoRechazo, /nada tuyo/);
});

test("names: a thing that is not decoration needs one; decoration is not listed for screen readers nor agents", () => {
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  a.s.features.send("objetos", "colocar", { modelo: BLOQUE, x: 1, z: 1, nombre: "", decorado: false }); pump();
  assert.match(a.b.estado.ultimoRechazo, /nombre/);
  assert.equal(b.drawn.size, 0);
  a.s.features.send("objetos", "colocar", { modelo: BLOQUE, x: 1, z: 1, nombre: "", decorado: true }); pump();
  a.s.features.send("objetos", "colocar", { modelo: BLOQUE, x: 4, z: 1, nombre: "Fuente de piedra", decorado: false }); pump();
  assert.equal(b.drawn.size, 2);
  const cards = b.s.features.cards().filter((c) => c.feature === "objetos");
  assert.deepEqual(cards.map((c) => [c.role, c.name, c.at]), [["objeto", "Fuente de piedra", { x: 4, z: 1 }]]);
  a.s.features.send("objetos", "colocar", { modelo: "f".repeat(64), x: 0, z: 0, nombre: "Nada", decorado: false }); pump();
  assert.match(a.b.estado.ultimoRechazo, /biblioteca/);
});

test("survives a restart (S4); who placed what stays on the server, never in what pages get", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "objetos-"));
  const s1 = new FileStorage(dir);
  const w1 = world({ abierto: true, storage: s1 });
  w1.pages[0].b.colocar("robot"); w1.pump();
  const id = w1.pages[0].b.estado.seleccionado;
  await s1.flush();
  const w2 = world({ abierto: true, storage: new FileStorage(dir) });
  const o = w2.pages[0].s.features.stateOf("objetos").get(id);
  assert.equal(o?.nombre, "Robot");
  assert.equal(w2.pages[0].drawn.get(id)?.animate, true);
  assert.equal("autor" in (o ?? {}), false, "pages never get who placed it");
  assert.match(readFileSync(join(dir, "objetos.jsonl"), "utf8"), new RegExp(`"a:${id}"`), "the server keeps the author in its store");
  w2.pages[0].b.colocar("bloque"); w2.pump();
  assert.notEqual(w2.pages[0].b.estado.seleccionado, id, "ids are never reused after a restart");
});

test(`joining a zone with ${OBJETOS_MAX} things: what it costs (limits.json objetos.*)`, () => {
  // the same declaration seeded straight into the state: what a page receives on entering
  const seed: ServerPart = serverPart(objetos, (api) => {
    for (let i = 0; i < OBJETOS_MAX; i++) api.state.set(`o${i.toString(36)}`, { modelo: BLOQUE, x: (i % 50) * 3 - 75, y: 0, z: Math.floor(i / 50) * 3 - 60, rx: 0, ry: (i * 7) % 360 - 180, rz: 0, sx: 1, sy: 1, sz: 1, nombre: i % 4 ? "" : `Bloque ${i}`, decorado: i % 4 !== 0, fijado: false, animar: true });
  });
  let bytes = 0, mensajes = 0, dentro: number[] = [];
  const rt = new ServerRuntime([seed], { players: () => dentro, position: () => ({ x: 0, z: 0 }), send: (_e, b) => { bytes += b.length; mensajes++; }, tick: () => 0, log: () => {} });
  dentro = [7]; bytes = 0; mensajes = 0;
  const t0 = performance.now();
  rt.join(7);
  const ms = performance.now() - t0;
  console.log(`[objetos] entrar en una zona con ${OBJETOS_MAX} objetos: ${(bytes / 1024).toFixed(1)} kB en ${mensajes} mensajes, ${ms.toFixed(1)} ms en el servidor`);
  assert.equal(mensajes, OBJETOS_MAX + 1); // the catalog + one STATE per thing
  assert.ok(bytes < 400 * 1024, `${bytes} bytes`);
  assert.ok(ms < 200, `${ms} ms`);
});

test("features cannot take /a/ (the files by their sha256 are the engine's)", () => {
  const log: string[] = [];
  const rt = new ServerRuntime([serverPart(objetos, (api) => api.route("GET", "/a/:x", () => ({ body: "no" })))], { players: () => [], position: () => null, send: () => {}, tick: () => 0, log: (l) => log.push(l) });
  assert.deepEqual(rt.routes(), []);
  assert.ok(log.some((l) => l.includes("/a/")), log.join("\n"));
});

test("server: /a/<sha256>.glb serves the house library (a year of cache, any origin); unknown is 404", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, features: [crearObjetos()] });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.port}/a/${BLOQUE}.glb`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "model/gltf-binary");
    assert.match(r.headers.get("cache-control") ?? "", /immutable/);
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
    assert.equal(createHash("sha256").update(new Uint8Array(await r.arrayBuffer())).digest("hex"), BLOQUE);
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/a/${"0".repeat(64)}.glb`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/a/${BLOQUE}.png`)).status, 404, "same hash, other kind: no");
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/a/../../package.json`)).status, 404);
  } finally { await srv.close(); }
});

test("a player with no identity (a bot, an agent today) builds as itself when building is open", () => {
  const { pages, pump } = world({ abierto: true, n: 1 });
  pages[0].s.features.send("objetos", "colocar", { modelo: BLOQUE, x: 10, z: 0, nombre: "Hito", decorado: false }); pump();
  assert.equal(pages[0].drawn.size, 1);
});

test("M22 redo: what you undid comes back (B sees it), a new change of yours ends it, and it is yours only", () => {
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  a.b.colocar("bloque"); pump();
  const id = a.b.estado.seleccionado;
  assert.ok(a.b.transformar(id, { x: 2, ry: 45 }).ok); pump();
  assert.ok(cerca(b.drawn.get(id)?.x, 2) && cerca(b.drawn.get(id)?.ry, 45));
  a.b.deshacer(); pump();
  assert.ok(cerca(b.drawn.get(id)?.x, 0) && cerca(b.drawn.get(id)?.ry, 0), "undo: back to where it was placed");
  assert.equal(a.s.features.log.at(-1)?.msg.accion, "deshacer");
  a.b.rehacer(); pump();
  assert.ok(cerca(b.drawn.get(id)?.x, 2) && cerca(b.drawn.get(id)?.ry, 45), "redo: the move again");
  assert.equal(a.s.features.log.at(-1)?.msg.accion, "rehacer");
  a.b.rehacer(); pump();
  assert.match(a.b.estado.ultimoRechazo, /nada tuyo que rehacer/);
  a.b.deshacer(); pump();                                              // undo works again after a redo
  assert.ok(cerca(b.drawn.get(id)?.x, 0));
  b.b.rehacer(); pump();
  assert.match(b.b.estado.ultimoRechazo, /nada tuyo que rehacer/, "B cannot redo what A undid");
  a.b.girar(90); pump();                                               // a new change by A
  a.b.rehacer(); pump();
  assert.match(a.b.estado.ultimoRechazo, /nada tuyo que rehacer/, "a new change empties the redo stack");
  assert.ok(cerca(b.drawn.get(id)?.x, 0) && cerca(b.drawn.get(id)?.ry, 90));
  // undo the placing itself, then redo it: the same thing comes back (same id, name), and goes away again
  a.b.deshacer(); a.b.deshacer(); pump(4);
  assert.equal(b.drawn.has(id), false);
  assert.equal(a.b.estado.seleccionado, "", "what is gone is not selected");
  a.b.rehacer(); pump();
  assert.equal(b.s.features.stateOf("objetos").get(id)?.nombre, "Bloque");
  assert.equal(a.b.estado.seleccionado, id, "redo selects what it brought back");
  a.b.deshacer(); pump();
  assert.equal(b.drawn.has(id), false);
});

test("M22 undo and redo respect pinned things (except the pin itself); closed building refuses redo", () => {
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  a.b.colocar("bloque"); pump();
  const id = a.b.estado.seleccionado;
  a.b.desplazar(3, 0); pump();
  b.b.seleccionar(id); b.b.fijar(); pump();                            // B pins what A moved
  a.b.deshacer(); pump();
  assert.match(a.b.estado.ultimoRechazo, /fijado/);
  assert.ok(cerca(b.drawn.get(id)?.x, 3), "a pinned thing does not move back");
  b.b.fijar(); pump();                                                 // B lets it go
  a.b.deshacer(); pump();                                              // A's move is still on A's stack
  assert.ok(cerca(b.drawn.get(id)?.x, 0));
  a.b.seleccionar(id); a.b.fijar(); pump();                            // A pins it; undoing the pin itself is allowed
  a.b.deshacer(); pump();
  assert.equal(b.s.features.stateOf("objetos").get(id)?.fijado, false);
  a.b.rehacer(); pump();
  assert.equal(b.s.features.stateOf("objetos").get(id)?.fijado, true);
  const cerrado = world({ abierto: false, n: 1 });
  cerrado.pages[0].b.rehacer(); cerrado.pump();
  assert.match(cerrado.pages[0].b.estado.ultimoRechazo, /construir/);
});

test("M22 builder API: select by id, transform within the limits, tools; everything goes through the server", () => {
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  const vistos: string[] = [];
  a.b.escuchar((q) => vistos.push(q));
  a.b.colocar("bloque"); pump();
  const id = a.b.estado.seleccionado;
  assert.ok(vistos.includes("seleccion") && vistos.includes("estado") && vistos.includes("hecho"));
  assert.equal(a.b.seleccionar("nada").ok, false);
  assert.ok(a.b.seleccionar("").ok);
  assert.equal(a.b.estado.seleccionado, "");
  assert.ok(a.b.seleccionar(id).ok);
  assert.ok(a.b.transformar(id, { y: 900, rx: 200, sx: 99, sz: 0.001 }).ok); pump();
  const o = b.s.features.stateOf("objetos").get(id)!;
  assert.deepEqual([o.y, o.rx, o.sx, o.sy, o.sz], [500, -160, 50, 1, 0.05], "clamped to LIMITES, turns wrapped to [-180, 180]");
  assert.equal(a.b.transformar(id, { w: 1 } as never).ok, false);
  assert.equal(a.b.transformar("nada", { x: 1 }).ok, false);
  assert.ok(a.b.colocarEn("robot", { x: 4.5, y: 1, z: -2 }, 270).ok); pump();
  const r = b.s.features.stateOf("objetos").get(a.b.estado.seleccionado)!;
  assert.deepEqual([r.x, r.y, r.z, r.ry, r.nombre], [4.5, 1, -2, -90, "Robot"]);
  assert.ok(a.b.modo("girar").ok);
  assert.equal(a.b.estado.modo, "girar");
  assert.equal(a.b.modo("volar").ok, false);
  assert.ok(vistos.includes("modo"));
});

test("M22 selection: the echo of a move keeps what you selected meanwhile; what you place or bring back is selected", () => {
  const { pages, pump } = world({ abierto: true });
  const [a] = pages;
  a.b.colocar("bloque"); pump();
  const uno = a.b.estado.seleccionado;
  a.b.colocar("robot"); pump();
  const dos = a.b.estado.seleccionado;
  assert.notEqual(uno, dos);
  assert.ok(a.b.transformar(uno, { x: 3 }).ok); pump();             // a drag's last move arrives after you clicked «dos»
  assert.equal(a.b.estado.seleccionado, dos, "the echo of a move does not steal the selection");
  a.b.deshacer(); pump();
  assert.equal(a.b.estado.seleccionado, uno, "undo selects what it touched");
});
