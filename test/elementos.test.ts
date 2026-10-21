// H4/H8: the elements (features/elementos) — water, fire, smoke and dust placed live by builders, reaching only who
// is near (J9), with a card for screen readers, saved across restarts (S4), and a world's own list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClientPart, Msg } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { elementos, ALCANCE_M, ELEMENTOS_MAX } from "../features/elementos/feature.ts";
import { crearElementos } from "../features/elementos/server.ts";
import { crearCliente } from "../features/elementos/client.ts";

function world(opts: { abierto: boolean; storage?: FileStorage; mundo?: unknown }) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearElementos(opts.mundo)], storage: opts.storage, puede: (_w, accion) => opts.abierto && accion === "construir" });
  const pages: { s: ClientSession; t: ReturnType<Instance["join"]>; c: ReturnType<typeof crearCliente>["elementos"]; dibujo: Map<string, Msg> }[] = [];
  const add = () => {
    const t = inst.join(pages.length), cli = crearCliente(), dibujo = new Map<string, Msg>();
    const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, here: () => ({ x: 0, y: 0, z: 0 }), elemento: (k, v) => { if (v) dibujo.set(k, v); else dibujo.delete(k); } } });
    pages.push({ s, t, c: cli.elementos, dibujo });
    return pages[pages.length - 1];
  };
  add(); add();
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump, add };
}

test("elementos: the declaration loads (card, reach, persistence)", () => {
  assert.equal(elementos.issues.length, 0, JSON.stringify(elementos.issues));
  assert.equal(elementos.state?.radius, ALCANCE_M);
  assert.equal(elementos.state?.persist, true);
});

test("closed world: nothing is placed and the builder hears why", () => {
  const { pages, pump } = world({ abierto: false });
  const [a, b] = pages;
  assert.ok(a.c.poner("fuego").ok);
  pump();
  assert.equal(b.dibujo.size, 0);
  assert.match(a.c.estado.ultimoRechazo, /construir/);
});

test("a builder places water and fire; the other page draws them, reads their cards; resize, move and remove", () => {
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  a.c.poner("agua"); pump();
  const agua = a.c.estado.seleccionado;
  a.c.poner("fuego", { x: 4, z: -2 }); pump();
  const fuego = a.c.estado.seleccionado;
  a.c.poner("polvo", { x: -6, z: 0 }); pump();
  assert.deepEqual([...b.dibujo.values()].map((v) => v.tipo).sort(), ["agua", "fuego", "polvo"]);
  const r2 = (n: unknown) => Math.round(Number(n) * 100) / 100;
  assert.deepEqual([b.dibujo.get(agua)?.x, b.dibujo.get(agua)?.z, b.dibujo.get(agua)?.ancho].map(r2), [0, -3, 6], "3 m in front, 6 m wide");
  const fichas = b.s.features.cards().filter((c) => c.feature === "elementos").map((c) => c.name).sort();
  assert.deepEqual(fichas, ["Estanque", "Hoguera"], "named for screen readers; dust is decoration (no card)");
  a.c.estado.seleccionado = agua;
  a.c.escalar(2); pump();
  assert.deepEqual([b.dibujo.get(agua)?.ancho, b.dibujo.get(agua)?.largo].map(r2), [12, 8]);
  a.c.estado.seleccionado = fuego;
  a.c.escalar(1.5); pump();
  a.c.desplazar(1, 0); pump(); // each change carries the whole element: one at a time (as clicks are)
  assert.deepEqual([b.dibujo.get(fuego)?.tamano, b.dibujo.get(fuego)?.x].map(r2), [1.5, 5]);
  a.c.cambiar({ nombre: "Fuego del campamento" }); pump();
  assert.ok(b.s.features.cards().some((c) => c.name === "Fuego del campamento"));
  a.c.quitar(); pump();
  assert.equal(b.dibujo.has(fuego), false);
  assert.equal(a.c.poner("lava").ok, false);
  a.c.quitar("e999"); pump();
  assert.match(a.c.estado.ultimoRechazo, /e999/);
});

test("J9: an element reaches only who is near (radius), and the zone has a limit", () => {
  const { pages, pump } = world({ abierto: true });
  const [a, b] = pages;
  a.c.poner("humo", { x: ALCANCE_M + 400, z: 0 }); pump(12);
  assert.equal(b.dibujo.size, 0, "far away: not sent");
  assert.equal(a.c.lista().length, 0);
  assert.ok(ELEMENTOS_MAX >= 100);
});

test("S4: elements survive a restart; a world's own list is placed once, on a fresh zone", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "elementos-"));
  const s1 = new FileStorage(dir);
  const w1 = world({ abierto: true, storage: s1 });
  w1.pages[0].c.poner("agua"); w1.pump();
  w1.pages[0].c.poner("fuego", { x: 2, z: 2 }); w1.pump();
  await s1.flush();
  const w2 = world({ abierto: true, storage: new FileStorage(dir), mundo: { elementos: [{ tipo: "humo", x: 1, z: 1 }] } });
  assert.deepEqual([...w2.pages[1].dibujo.values()].map((v) => v.tipo).sort(), ["agua", "fuego"], "saved ones come back; the world's list is not added to a zone with history");
  const w3 = world({ abierto: false, mundo: { schema: "numinia-engine/elementos@1", elementos: [{ tipo: "fuego", x: 1, z: 2, nombre: "Hoguera de la plaza" }, { tipo: "lava", x: 0, z: 0 }] } });
  const v = [...w3.pages[0].dibujo.values()];
  assert.deepEqual(v.map((e) => [e.tipo, Math.round(Number(e.x) * 100) / 100, Math.round(Number(e.z) * 100) / 100, e.nombre]), [["fuego", 1, 2, "Hoguera de la plaza"]]);
});

// B9 (D-086): the pond is a water element; `aguaHeredada` puts it where the nature had it.
import { estanqueHeredado } from "../features/naturaleza/server.ts";
import { crearNaturaleza } from "../features/naturaleza/server.ts";
import { DEFECTOS } from "../features/naturaleza/esquema.ts";
import { estanqueDe, NIVEL_AGUA } from "../packages/relieve/src/relieve.ts";

test("B9: estanqueHeredado agrees with estanqueDe for 3 seeds; no pond = null", () => {
  for (const semilla of [1, 1234, 98765]) {
    const e = estanqueDe(semilla, 200), h = estanqueHeredado({ semilla, tamano: 200, estanque: true })!;
    assert.deepEqual([h.x, h.z, h.y, h.ancho, h.largo], [e.x, e.z, NIVEL_AGUA, 2 * e.radio, 2 * e.radio]);
  }
  assert.equal(estanqueHeredado({ semilla: 1, tamano: 200, estanque: false }), null);
  assert.equal(estanqueHeredado(undefined), null);
});

function mundoConNaturaleza(abierto: boolean, estanque = true) {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearNaturaleza({ ...DEFECTOS, semilla: 77, estanque }), crearElementos()], puede: (_w, accion) => abierto && accion === "construir" });
  const t = inst.join(0), cli = crearCliente(), dibujo = new Map<string, Msg>();
  const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, here: () => ({ x: 0, y: 0, z: 0 }), elemento: (k, v) => { if (v) dibujo.set(k, v); else dibujo.delete(k); } } });
  const pump = (n = 3) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  return { c: cli.elementos, dibujo, pump, s };
}

test("B9: aguaHeredada creates the pond once, named Estanque, where the nature had it", () => {
  const { c, dibujo, pump } = mundoConNaturaleza(true);
  c.aguaHeredada(); pump();
  const e = estanqueDe(77, 200), v = dibujo.get("estanque-heredado");
  assert.ok(v, "the element exists");
  assert.equal(v.tipo, "agua"); assert.equal(v.nombre, "Estanque");
  assert.ok(Math.abs(Number(v.x) - e.x) < 0.01 && Math.abs(Number(v.z) - e.z) < 0.01 && Math.abs(Number(v.ancho) - 2 * e.radio) < 0.1);
  c.aguaHeredada(); pump();
  assert.equal(dibujo.size, 1, "second call does not duplicate");
  assert.match(c.estado.ultimoRechazo, /ya está puesto/);
});

test("B9: aguaHeredada without permission, or without a pond, does nothing", () => {
  const cerrado = mundoConNaturaleza(false);
  cerrado.c.aguaHeredada(); cerrado.pump();
  assert.equal(cerrado.dibujo.size, 0); assert.match(cerrado.c.estado.ultimoRechazo, /construir/);
  const sin = mundoConNaturaleza(true, false);
  sin.c.aguaHeredada(); sin.pump();
  assert.equal(sin.dibujo.size, 0); assert.match(sin.c.estado.ultimoRechazo, /no tiene estanque/);
});

test("B9: on the espacio base the inherited pond sits on the base's relief, not at NIVEL_AGUA", async () => {
  const { estanqueHeredado } = await import("../features/naturaleza/server.ts");
  const { alturaBase } = await import("../packages/relieve/src/espacio-base.ts");
  const e = estanqueHeredado({ semilla: 1234, tamano: 200, estanque: true, base: 42 });
  assert.ok(e); assert.equal(e.y, alturaBase(42, e.x, e.z) + 0.2);
  assert.equal(estanqueHeredado({ semilla: 1234, tamano: 200, estanque: true, base: -1 })?.y, -0.2);
});
