// MIS-222 t_1b395abe · J18b story 6 (MENU-MUNECA-Y-PINTURA-VR.md §3.7 #6): the SERVER's stroke caps. 40 live strokes per person, 300.000 stroke
// triangles per world (points × 16), decided in objetos `colocar`/`duplicar` from the points of the file the server holds (api.trazoPuntos),
// never from what a page says. Headless over the in-memory transport; the real file reader is checked on a real server at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRAZO, TRAZO_SCHEMA } from "../packages/net/src/ficheros.ts";
import { TRAZOS } from "../features/objetos/feature.ts";
import { TRAZOS_TRIANGULOS_MAX } from "../packages/render/src/trazo.ts";
import type { ClientPart, PlacedObject } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { signer } from "../packages/server/src/secret.ts";
import { emitir, today } from "../packages/instance/src/identidad.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";

const sha = (c: string) => c.repeat(64);
const CORTO = sha("a"), LARGO = sha("b"), AUSENTE = sha("e"); // 10 points · 600 points · a file the server cannot read
const PUNTOS: Record<string, number> = { [CORTO]: 10, [LARGO]: 600 };

function mundo() {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: () => {}, puede: (_w, a) => a === "construir",
    activo: (h, e) => e === "trazo" && (h === AUSENTE || h in PUNTOS), trazoPuntos: (h) => PUNTOS[h] ?? null });
  const gente: { s: ClientSession; b: ReturnType<typeof crearCliente>["constructor"]; drawn: Map<string, PlacedObject> }[] = [];
  const t: ReturnType<Instance["join"]>[] = [];
  const entra = (id: string) => {
    const tr = inst.join(t.length), cli = crearCliente(), drawn = new Map<string, PlacedObject>();
    (inst as unknown as { byEntity: { who?: { id: string; nombre: string } }[] }).byEntity[t.length].who = { id, nombre: id }; // as if it had shown its guest token
    const s = new ClientSession(tr, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
    t.push(tr); gente.push({ s, b: cli.constructor, drawn });
    pump(3);
    return gente[gente.length - 1];
  };
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { for (const x of t) x.flush(); inst.tick(); for (const x of t) x.flush(); } };
  return { entra, pump };
}
type Persona = ReturnType<ReturnType<typeof mundo>["entra"]>;
const pinta = (p: Persona, modelo: string, pump?: (n?: number) => void) => { p.s.features.send("objetos", "colocar", { modelo, x: 1, y: 1.2, z: 2, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" }); pump?.(6); };  // 6 ticks (> 5): an intent is 4 a second (DEFAULT_RATE), 20 ticks a second

test("the caps are the ones limits.json publishes, and the page and the server agree on the world's triangles", () => {
  const lim = (JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")) as { limits: { key: string; value: number }[] }).limits;
  const v = (k: string) => lim.find((x) => x.key === k)?.value;
  assert.equal(v("strokes_per_builder"), TRAZOS.porConstructor); assert.equal(TRAZOS.porConstructor, 40);
  assert.equal(v("stroke_world_triangles_server"), TRAZOS.triangulosMundo); assert.equal(v("stroke_world_triangles_max"), TRAZOS_TRIANGULOS_MAX);
  assert.equal(TRAZOS.triangulosMundo, TRAZOS_TRIANGULOS_MAX, "what the server lets in is what the client dares to draw");
  assert.equal(TRAZOS.puntosMax, TRAZO.puntosMax, "features cannot import net: the two numbers are kept equal here");
  assert.equal(TRAZO.puntosMax * TRAZOS.triangulosPorPunto, 9600, "the biggest stroke: stroke_triangles_max");
});

test("the 41st stroke of one person is refused; the others can still paint; deleting or undoing one gives the place back", () => {
  const { entra, pump } = mundo(), ana = entra("ana"), luis = entra("luis");
  for (let i = 0; i < TRAZOS.porConstructor; i++) pinta(ana, CORTO, pump);
  pump(4);
  assert.equal(ana.drawn.size, 40, `rechazo: ${ana.b.estado.ultimoRechazo}`);
  pinta(ana, CORTO, pump); pump();
  assert.equal(ana.drawn.size, 40); assert.match(ana.b.estado.ultimoRechazo, /Tienes 40 trazos: borra o deshaz alguno/);
  pinta(luis, CORTO, pump); pump();
  assert.equal(luis.drawn.size, 41, "the cap is per person: Luis paints his own (ultimoRechazo: " + luis.b.estado.ultimoRechazo + ")");
  ana.b.deshacer(); pump();
  assert.equal(ana.drawn.size, 40, "undo took one of Ana's away");
  pinta(ana, CORTO, pump); pump();
  assert.equal(ana.drawn.size, 41, "and gave her the place back");
});

test("duplicating a stroke counts as a new one for whoever duplicates it", () => {
  const { entra, pump } = mundo(), ana = entra("ana");
  for (let i = 0; i < TRAZOS.porConstructor; i++) pinta(ana, CORTO, pump);
  pump(4);
  const id = [...ana.drawn.keys()][0];
  ana.s.features.send("objetos", "duplicar", { id }); pump();
  assert.equal(ana.drawn.size, 40); assert.match(ana.b.estado.ultimoRechazo, /Tienes 40 trazos/);
});

test("the world's triangles: 31 full strokes fit (31 × 9.600 = 297.600), the 32nd is refused with the same words the page uses", () => {
  const { entra, pump } = mundo(), gente = Array.from({ length: 4 }, (_, i) => entra(`p${i}`));
  for (let i = 0; i < 31; i++) { pinta(gente[i % 4], LARGO, pump); }
  pump(6);
  assert.equal(gente[0].drawn.size, 31, `rechazo: ${gente[0].b.estado.ultimoRechazo}`);
  pinta(gente[1], LARGO, pump); pump();
  assert.equal(gente[0].drawn.size, 31); assert.match(gente[1].b.estado.ultimoRechazo, /El mundo ya tiene todos los trazos que caben: borra alguno/);
  pinta(gente[2], CORTO, pump); pump();
  assert.equal(gente[0].drawn.size, 32, "a small stroke still fits in what is left (2.400 triangles)");
});

test("a stroke whose file the server cannot read counts as a full one (600 points), never as a free one", () => {
  const { entra, pump } = mundo(), gente = Array.from({ length: 4 }, (_, i) => entra(`p${i}`));
  for (let i = 0; i < 31; i++) pinta(gente[i % 4], LARGO, pump);
  pump(6);
  pinta(gente[0], AUSENTE, pump); pump();
  assert.equal(gente[0].drawn.size, 31); assert.match(gente[0].b.estado.ultimoRechazo, /El mundo ya tiene/);
});

test("over a real server: the points come from the file on disk, not from the page", async () => {
  const BILLETE = emitir(signer("una-clave-de-prueba-larga"), "abcdefgh2345", today());
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "trazos-topes-"));
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, secret: "una-clave-de-prueba-larga", construir: "todos", subidas: dir, features: [crearObjetos()], log: () => {} });
  const trazo = (n: number) => new TextEncoder().encode(JSON.stringify({ schema: TRAZO_SCHEMA, pincel: "tubo", color: 1, grosor: 0.02, puntos: Array.from({ length: n }, (_, i) => [Math.round(i * 0.5) / 1000, 0.001, -0.001, 0.5]) }));
  try {
    const b = trazo(37), h = createHash("sha256").update(b).digest("hex");
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/a/${h}.trazo`, { method: "PUT", body: b, headers: { authorization: `Bearer ${BILLETE}`, "x-nombre-fichero": "trazo.trazo" } })).status, 201);
    const { Activos } = await import("../packages/server/src/activos.ts");
    const act = new Activos(null, dir, () => {});
    assert.equal(act.trazoPuntos(h), 37); assert.equal(act.trazoPuntos("0".repeat(64)), null, "not here");
  } finally { await srv.close(); }
});
