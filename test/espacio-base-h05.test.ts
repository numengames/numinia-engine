// H5 · the Logo Khepri is born with the espacio base: planted ONCE as an ordinary object of the world (so the builder can move, rename or delete it),
// never again on a restart, never when `objeto` is null, never in a world with things of its own or without espacio-base. Headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerEspacioBase } from "../features/espaciobase/esquema.ts";
import { LOGO } from "../features/espaciobase/logo.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import biblioteca from "../features/objetos/biblioteca.json" with { type: "json" };
import { ClientSession } from "../packages/client/src/index.ts";
import { crearCliente } from "../features/objetos/client.ts";
import type { ClientPart } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { RADIO_MESETA } from "../packages/relieve/src/espacio-base.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const LOGO_SHA = biblioteca.modelos.find((m) => m.id === "logo-khepri")!.modelo;
const arranque = (mundo: Record<string, unknown>, storage?: FileStorage) => {
  const partes = conMundo(funciones, ((f: string) => mundo[f]) as never, () => {});
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes, storage });
  inst.tick(); inst.tick();
  return { inst, cosas: () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([, v]) => v as Record<string, unknown>) };
};

test("schema: `objeto` defaults to the Logo Khepri, null means none, a wrong value says how to fix it", () => {
  const r = leerEspacioBase({}); assert.ok(r.ok && r.value.objeto === "logo-khepri");
  const n = leerEspacioBase({ objeto: null }); assert.ok(n.ok && n.value.objeto === null);
  for (const mal of [{ objeto: 3 }, { objeto: "../x.glb" }, { objeto: "" }]) { const m = leerEspacioBase(mal); assert.equal(m.ok, false); if (!m.ok) assert.match(m.issues[0].message, /biblioteca/); }
});

test("the logo's licence and the numbers of its placement (measured from the glTF itself)", () => {
  const m = biblioteca.modelos.find((x) => x.id === "logo-khepri")!;
  assert.equal(m.licencia, "CC0-1.0"); assert.match(m.fuente, /numinia\.com\/es\/archive\/ndg-019d3e75/);
  const d = readFileSync(join(ROOT, m.fichero)), n = d.readUInt32LE(12), j = JSON.parse(d.subarray(20, 20 + n).toString());
  const nodo = j.nodes[0], a = j.accessors.find((c: { min?: number[] }) => c.min), [qx, , , qw] = nodo.rotation;
  assert.ok(Math.abs(qx - Math.SQRT1_2) < 1e-5 && Math.abs(qw - Math.SQRT1_2) < 1e-5, "+90° about X");
  const [sx, sy, sz] = nodo.scale, [tx, ty] = nodo.translation;
  // after scale then +90° about X: x = sx·px + tx; y = −sz·pz + ty; z = sy·py + tz
  const x0 = sx * a.min[0] + tx, x1 = sx * a.max[0] + tx, y0 = -sz * a.max[2] + ty, y1 = -sz * a.min[2] + ty;
  const ancho = (x1 - x0) * LOGO.escala!, bajo = y0 * LOGO.escala! + LOGO.y;
  assert.ok(Math.abs(ancho - 2.5) < 0.1, `about 2.5 m wide: ${ancho}`);
  assert.ok(Math.abs(bajo) < 0.02, `its lowest point rests on the ground: ${bajo}`);
  assert.ok(Math.hypot(LOGO.x, LOGO.z) + ancho / 2 < RADIO_MESETA, "inside the flat plateau");
  assert.equal(y1 > y0, true);
});

test("born once: an espacio base world has the logo as an ordinary object, 8 m ahead and on the ground; a restart does not duplicate it", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h05-"));
  const s1 = new FileStorage(dir), w1 = arranque({ "espacio-base.json": { agentes: 0 } }, s1);
  assert.equal(w1.cosas().length, 1);
  const o = w1.cosas()[0];
  assert.equal(o.modelo, LOGO_SHA); assert.equal(o.nombre, "Logo Khepri"); assert.equal(o.decorado, false);
  assert.equal(o.x, 0); assert.equal(o.z, -8); assert.equal(o.fijado, false);
  await s1.flush();
  const w2 = arranque({ "espacio-base.json": { agentes: 0 } }, new FileStorage(dir));
  assert.equal(w2.cosas().length, 1, "restart: not duplicated");
});

/** A world on disk with a builder's page (the objects feature's own client), to delete and place like a real builder does. */
function conConstructor(mundo: Record<string, unknown>, storage: FileStorage) {
  const partes = conMundo(funciones, ((f: string) => mundo[f]) as never, () => {});
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes, storage, puede: (_w, accion) => accion === "construir" });
  const t = inst.join(0), cli = crearCliente();
  const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0, ry: 0 }) } as never });
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  const ids = () => [...inst.features.allState()].filter(([k]) => k.startsWith("objetos:")).map(([k]) => k.slice("objetos:".length));
  return { inst, s, cli, pump, ids };
}

test("a builder who deleted the logo does not get it back on restart", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h05-")), s1 = new FileStorage(dir);
  const w1 = conConstructor({ "espacio-base.json": { agentes: 0 } }, s1);
  assert.equal(w1.ids().length, 1);
  assert.equal(w1.cli.constructor.borrarId(w1.ids()[0]).ok, true); w1.pump();
  assert.equal(w1.ids().length, 0, "deleted");
  await s1.flush();
  const w2 = conConstructor({ "espacio-base.json": { agentes: 0 } }, new FileStorage(dir));
  assert.equal(w2.ids().length, 0, "not recreated");
});

test("a world that already has things of its own never gets the logo (it is marked, not planted)", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "h05-")), s1 = new FileStorage(dir);
  const w1 = conConstructor({}, s1);               // the world as it was: no espacio base, a builder places something of its own
  w1.cli.constructor.colocar("robot"); w1.pump();
  assert.equal(w1.ids().length, 1);
  await s1.flush();
  const w2 = conConstructor({ "espacio-base.json": {} }, new FileStorage(dir)); // the owner turns the espacio base on later
  assert.equal(w2.ids().length, 1, "only its own thing");
  assert.equal(w2.s.features.stateOf("objetos").get(w2.ids()[0])?.nombre, "Robot");
});

test("`objeto: null` plants nothing; a world without espacio-base is unchanged; espacio-base off plants nothing", () => {
  assert.equal(arranque({ "espacio-base.json": { objeto: null, agentes: 0 } }).cosas().length, 0);
  assert.equal(arranque({}).cosas().length, 0);
  assert.equal(arranque({ "espacio-base.json": { activa: false } }).cosas().length, 0);
});
