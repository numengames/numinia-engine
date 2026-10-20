// H2 · espacio base: the world's switch (espacio-base.json), the pure mesh (triangles per tier, plateau), the collision mesh following alturaBase, and
// «a world without the file is identical». Headless: no GPU (the pixels are checked by the photos, see the report).
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerEspacioBase, DEFECTOS, ESQUEMA } from "../features/espaciobase/esquema.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { alturaBase, spawnBase, RADIO_MESETA } from "../packages/relieve/src/espacio-base.ts";
import { construirMalla, CELDAS_POR_NIVEL, LINEAS_TOPE, LADO_MUNDO, LLAMADAS, TIPO } from "../packages/render/src/espacio-base/malla.ts";
import { DEFECTOS_ESPACIO_BASE, normalizar } from "../packages/render/src/espacio-base/espacio-base.ts";
import { fx, FX_ONE } from "../packages/core/src/index.ts";
import { rayBvh } from "../packages/sim/src/index.ts";
import clientes from "../features/cliente.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { terrenoMalla, terrenoDelEstado, TAMANO_ESPACIO_BASE, claveTerreno } from "../packages/sim/src/terreno-malla.ts";
import { ESPACIO_BASE } from "../packages/render/src/naturaleza/paleta.ts";

test("esquema: defaults, valid file, and every wrong value says how to fix it", () => {
  assert.deepEqual(leerEspacioBase({}), { ok: true, value: DEFECTOS });
  assert.deepEqual(leerEspacioBase({ schema: ESQUEMA, activa: true, semilla: 7 }), { ok: true, value: { activa: true, semilla: 7 } });
  for (const mal of [[], null, 3, { semilla: -1 }, { semilla: 1.5 }, { modo: "noche" }, { activa: "si" }, { arboles: 3 }, { schema: "x" }]) {
    const r = leerEspacioBase(mal); assert.equal(r.ok, false, JSON.stringify(mal));
    if (!r.ok) assert.ok(r.issues.length > 0 && r.issues.every((i) => i.message.length > 10));
  }
});
test("the page's defaults are the schema's", () => { assert.deepEqual(DEFECTOS_ESPACIO_BASE, DEFECTOS); assert.deepEqual(normalizar({}), DEFECTOS); });

test("activation: the file turns the feature on; without it, nothing is published; a wrong file is logged and not used; nature wins if both", () => {
  const publica = (leer: (f: string) => unknown, log: string[] = []) => {
    const partes = conMundo(funciones, leer as never, (l) => log.push(l));
    const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes });
    return new Map(inst.features.allState()).get("espacio-base:mundo");
  };
  assert.equal(publica(() => undefined), undefined);
  assert.deepEqual(publica((f) => (f === "espacio-base.json" ? { semilla: 5 } : undefined)), { activa: true, semilla: 5 });
  const log: string[] = [];
  assert.equal(publica((f) => (f === "espacio-base.json" ? { semilla: "x" } : undefined), log), undefined);
  assert.ok(log.some((l) => l.includes("espacio-base.json no se usa")));
  const log2: string[] = [];
  assert.equal(publica((f) => (f === "espacio-base.json" || f === "naturaleza.json" ? {} : undefined), log2), undefined);
  assert.ok(log2.some((l) => l.includes("se usa la naturaleza")));
});

test("a world WITHOUT the file has the same features, state and flat ground as before", () => {
  const a = conMundo(funciones, () => undefined, () => {}), b = funciones;
  assert.deepEqual(a.map((p) => p.feature.id), b.map((p) => p.feature.id));
  const ids = a.map((p) => p.feature.id); assert.ok(ids.includes("espacio-base"));
  assert.equal(terrenoDelEstado(new Map()), null);
});

test("mesh: ONE draw call, a few thousand lines inside the tier caps, Uint16 indices, plateau flat at 0, built in milliseconds", () => {
  assert.equal(LLAMADAS, 1); assert.equal(LADO_MUNDO, TAMANO_ESPACIO_BASE);
  const lineas: Record<string, number> = {}, vert: Record<string, number> = {};
  for (const nv of ["A", "B", "C", "D"] as const) {
    const t0 = performance.now(), m = construirMalla(1234, nv), ms = performance.now() - t0;
    lineas[nv] = m.lineas; vert[nv] = m.vertices;
    assert.ok(m.indice instanceof Uint16Array && m.vertices <= 65535); assert.equal(m.indice.length, m.lineas * 2);
    assert.ok(m.lineas <= LINEAS_TOPE[nv], `${nv}: ${m.lineas} > ${LINEAS_TOPE[nv]}`); assert.ok(ms < 250, `${nv} ${ms} ms`);
    assert.equal(m.porTipo.red, 2 * CELDAS_POR_NIVEL[nv] * (CELDAS_POR_NIVEL[nv] + 1));
    assert.ok(m.porTipo.curva > 0 && m.porTipo.anillo > 0 && m.porTipo.acentos > 0, nv);
    for (const i of m.indice) assert.ok(i < m.vertices);
  }
  assert.ok(lineas.A > lineas.B && lineas.B > lineas.C && lineas.C > lineas.D, "fewer lines on lower tiers");
  assert.ok(lineas.D <= 1200, "D is the bare minimum");
  console.log("lineas por nivel", JSON.stringify(lineas), "vertices", JSON.stringify(vert));
  const m = construirMalla(1234, "A");
  for (let v = 0; v < m.vertices; v++) {
    if (m.tipo[v] !== TIPO.red) continue;
    const x = m.posicion[v * 3], y = m.posicion[v * 3 + 1], z = m.posicion[v * 3 + 2];
    assert.equal(y, Math.fround(alturaBase(1234, x, z)));
    if (Math.hypot(x, z) < RADIO_MESETA - 7) assert.equal(y, 0);
  }
  assert.ok(m.hmax > 10 && m.hmin < 0);
  assert.equal(alturaBase(1234, spawnBase().x, spawnBase().z), 0);
  assert.deepEqual(Array.from(construirMalla(1234, "C").indice), Array.from(construirMalla(1234, "C").indice), "deterministic");
});

test("colours come from the palette tokens only", () => {
  const todos = [ESPACIO_BASE.noche.suelo, ESPACIO_BASE.dia.suelo, ESPACIO_BASE.lineaDia.baja, ESPACIO_BASE.linea.baja, ESPACIO_BASE.linea.alta, ESPACIO_BASE.linea.hendidura, ESPACIO_BASE.curva, ...Object.values(ESPACIO_BASE.acentos)];
  assert.equal(ESPACIO_BASE.linea.baja, 0x018ea1); assert.equal(ESPACIO_BASE.linea.alta, 0xa6dad5); assert.equal(ESPACIO_BASE.linea.hendidura, 0xf35059);
  assert.equal(ESPACIO_BASE.dia.suelo, 0xf9ebdc); assert.equal(ESPACIO_BASE.curva, 0xefa517); assert.equal(ESPACIO_BASE.acentos.morado, 0xa98be0); assert.equal(ESPACIO_BASE.acentos.verde, 0x8fc46b);
  assert.ok(todos.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff));
});

test("collision: the espacio base's mesh is alturaBase; real instance: people are born on the plateau and walk without floating or sinking", async () => {
  const estado = new Map<string, Record<string, unknown>>([["espacio-base:mundo", { activa: true, semilla: 1234 }]]);
  const m = terrenoDelEstado(estado); assert.ok(m && m.base);
  const T = terrenoMalla(m!);
  assert.notEqual(claveTerreno(m!), claveTerreno({ ...m!, base: false }));
  assert.equal(T.celdas, 100);
  const U = FX_ONE, alto = (x: number, z: number) => { const h = rayBvh(T.bvh, Math.round(x * U), 80 * U, Math.round(z * U), 0, -U, 0, 200 * U); return h ? h.y / U : NaN; };
  assert.equal(alto(0, 0), 0);
  for (const [x, z] of [[10, 5], [-20, 20], [60, 0], [120, -80], [-150, 33], [-100, -100]]) assert.ok(Math.abs(alto(x, z) - alturaBase(1234, x, z)) < 1.2, `${x},${z}: ${alto(x, z)} vs ${alturaBase(1234, x, z)}`); // quantised 4 m cells: bilinear gap, plateau exact
  assert.equal(terrenoDelEstado(new Map([["espacio-base:mundo", { activa: false }]])), null);
  const partes = conMundo(funciones, ((f: string) => (f === "espacio-base.json" ? { semilla: 1234 } : undefined)) as never, () => {});
  const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: partes });
  const t = inst.join(0); const sesion = new ClientSession(t, { features: clientes, view: new Proxy({}, { get: () => () => {} }) as never });
  const pump = (n = 1, mx = 0, mz = 0) => { for (let k = 0; k < n; k++) { t.flush(); sesion.tick(mx, mz, 0); t.flush(); inst.tick(); t.flush(); } };
  pump(3); await new Promise((r) => setTimeout(r, 50)); pump(2);
  assert.ok(inst.sim.mesh, "collision mesh set from espacio-base:mundo");
  const e = sesion.entity, X = () => inst.sim.tf.cols.x[e] / U, Y = () => inst.sim.tf.cols.y[e] / U, Z = () => inst.sim.tf.cols.z[e] / U;
  assert.ok(Math.hypot(X(), Z()) <= 3 * Math.SQRT2 + 0.1 && Y() === 0, `born on the plateau at ${X()},${Z()},${Y()}`);
  let peor = 0;
  for (let k = 0; k < 40; k++) { pump(25, 127, 40); peor = Math.max(peor, Math.abs(Y() - alto(X(), Z()))); }
  assert.ok(Math.hypot(X(), Z()) > RADIO_MESETA - 2, `walked out of the plateau (${X()},${Z()})`);
  assert.ok(peor < 0.3, `never floats or sinks: ${peor}`);
});

test("a world with espacio-base.json and no entorno.json is born at night; with its own entorno.json, the world's own clock rules", () => {
  const hora = (leer: (f: string) => unknown) => {
    const inst = new Instance({ seed: 7, capacity: 4, k: 50, snapshotEvery: 2, features: conMundo(funciones, leer as never, () => {}) });
    const z = new Map(inst.features.allState()).get("entorno:zona") as Record<string, unknown> | undefined;
    return { hora: z?.hora, solHora: z?.solHora, solAltura: z?.solAltura };
  };
  const base = (f: string) => (f === "espacio-base.json" ? {} : undefined);
  const noche = hora(base); assert.equal(noche.solHora, true); assert.ok(Number(noche.solAltura) < -6, JSON.stringify(noche));
  const dia = hora((f) => (f === "entorno.json" ? { hora: { valor: 12, mueveElSol: true } } : base(f))); assert.ok(Number(dia.solAltura) > 30, JSON.stringify(dia));
  const sin = hora(() => undefined); assert.notEqual(sin.solHora, true, "a world without the piece keeps the house's entorno");
});
