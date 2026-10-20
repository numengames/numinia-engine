// Interruptor «Naturaleza» (R-1, «el fichero manda»): whoever may build in a world turns its nature on or off from inside it.
// Headless: real instance + real pages over loopback + the real world folder writer (packages/server/src/mundo.ts) on a temp
// dir. The server checks the same «construir» permission as the builder, rewrites only `activa` in naturaleza.json (atomic,
// every other key kept verbatim, a missing file created, a broken one never overwritten) and every page gets the new state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { leerMundo, escribirMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { naturaleza } from "../features/naturaleza/feature.ts";
import { conActiva, crearNaturaleza } from "../features/naturaleza/server.ts";
import { crearCliente } from "../features/naturaleza/client.ts";
import { ESQUEMA, DEFECTOS } from "../features/naturaleza/esquema.ts";

const carpeta = (fichero?: string) => {
  const dir = mkdtempSync(join(tmpdir(), "nat-interruptor-"));
  if (fichero !== undefined) writeFileSync(join(dir, "naturaleza.json"), fichero);
  return dir;
};

/** A world from its folder (as main.ts builds it), `n` pages; `puede(e)` = may this entity build. */
function mundo(dir: string, n: number, puede: (e: number) => boolean = () => true) {
  const log: string[] = [];
  const partes = conMundo(funciones, leerMundo(dir, (l) => log.push(l)), (l) => log.push(l), escribirMundo(dir, (l) => log.push(l)));
  const parte = partes.find((p) => p.feature.id === "naturaleza")!;
  const inst = new Instance({ seed: 3, capacity: 8, k: 50, snapshotEvery: 2, features: [parte], log: (l) => log.push(l), aparicion: { x: 0, z: 0, radio: 1 }, puede: (_w, accion, e) => accion === "construir" && puede(e) });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearCliente(), vistas: Record<string, unknown>[] = [];
    const s = new ClientSession(t, { features: [c.part], view: { label() {}, bounce() {}, naturaleza: (v: Record<string, unknown>) => vistas.push({ ...v }) } });
    return { t, s, nat: c.interruptor, vistas };
  });
  const pump = (ticks = 4) => { for (let i = 0; i < ticks; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump, log };
}
const eventos = (s: ClientSession, ev: string) => s.features.log.filter((l) => l.feature === "naturaleza" && l.event === ev);
const leer = (dir: string) => readFileSync(join(dir, "naturaleza.json"), "utf8");

test("interruptor: the declaration meets the plug's rules; conActiva keeps every key and only changes activa", () => {
  assert.deepEqual(naturaleza.issues, []);
  assert.deepEqual(conActiva(undefined, true), { schema: ESQUEMA, activa: true });
  const crudo = { schema: ESQUEMA, semilla: 7, activa: true, densidad: { arboles: 0.3 }, fauna: { especies: ["luciernaga-ambar"] } };
  const nuevo = conActiva(crudo, false)!;
  assert.deepEqual(Object.keys(nuevo), Object.keys(crudo), "same keys, same order");
  assert.deepEqual(nuevo, { ...crudo, activa: false });
  assert.equal(crudo.activa, true, "the input is not touched");
  assert.equal(conActiva([1], true), null);
  assert.equal(conActiva(null, true), null);
});

test("interruptor: a guest (no «construir») is refused; the file and every page stay as they were", () => {
  const original = `{ "schema": "${ESQUEMA}", "semilla": 42, "activa": true }\n`;
  const dir = carpeta(original);
  const { pages: [a, b], pump } = mundo(dir, 2, () => false);
  assert.equal(a.nat.activa(), true);
  const antes = a.vistas.length;
  assert.ok(a.nat.poner(false).ok, "the page only checks the message's shape");
  pump();
  assert.match(String(eventos(a.s, "rechazado").at(-1)?.msg.motivo), /permiso de construir/);
  assert.equal(leer(dir), original, "the file is byte for byte the same");
  assert.equal(a.nat.activa(), true); assert.equal(b.nat.activa(), true);
  assert.equal(a.vistas.length, antes, "no new state reached the view");
  assert.equal(eventos(b.s, "cambiado").length, 0);
});

test("interruptor: a builder turns it off; the file keeps every other key, is written atomically, and every page gets activa false", () => {
  const dir = carpeta(JSON.stringify({ schema: ESQUEMA, semilla: 77, tamano: 160, densidad: { arboles: 0.4, hierba: 0.25 }, estacion: "otono", fauna: { densidad: 0.5 } }));
  const { pages: [a, b], pump, log } = mundo(dir, 2);
  assert.equal(a.vistas.at(-1)?.activa, true, "no activa in the file = on");
  assert.match(log.join("\n"), /colisión del terreno lista/, "N5: the terrain collision is built while on");
  a.nat.poner(false); pump();
  const f = JSON.parse(leer(dir));
  assert.deepEqual(f, { schema: ESQUEMA, semilla: 77, tamano: 160, densidad: { arboles: 0.4, hierba: 0.25 }, estacion: "otono", fauna: { densidad: 0.5 }, activa: false });
  assert.deepEqual(readdirSync(dir), ["naturaleza.json"], "no temporary file left behind");
  for (const p of [a, b]) {
    assert.equal(p.nat.activa(), false);
    const v = p.vistas.at(-1)!;
    assert.deepEqual({ activa: v.activa, semilla: v.semilla, tamano: v.tamano, arboles: v.arboles, hierba: v.hierba, paleta: v.paleta, faunaDensidad: v.faunaDensidad }, { activa: false, semilla: 77, tamano: 160, arboles: 0.4, hierba: 0.25, paleta: "otono", faunaDensidad: 0.5 });
    assert.equal(eventos(p.s, "cambiado").at(-1)?.msg.estado, "apagada", "everyone is told");
  }
  // and back on: same file, activa true, pages rebuild with the same numbers
  b.nat.poner(true); pump();
  assert.equal(JSON.parse(leer(dir)).activa, true);
  assert.equal(a.vistas.at(-1)?.activa, true); assert.equal(a.vistas.at(-1)?.semilla, 77);
  assert.equal(eventos(a.s, "cambiado").at(-1)?.msg.estado, "encendida");
});

test("interruptor: a world without naturaleza.json publishes nothing (as before); switching on creates { schema, activa }", () => {
  const dir = carpeta();
  const { pages: [a, b], pump, log } = mundo(dir, 2);
  assert.equal(a.vistas.length, 0, "no file: the view is never called (the empty plaza looks exactly as before)");
  assert.equal(a.nat.activa(), false);
  assert.ok(!existsSync(join(dir, "naturaleza.json")));
  assert.doesNotMatch(log.join("\n"), /colisión del terreno/);
  a.nat.poner(true); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: true });
  for (const p of [a, b]) assert.deepEqual(p.vistas.at(-1), { ...DEFECTOS, activa: true });
  assert.match(log.join("\n"), /colisión del terreno lista/, "N5: the server walks the new hills too");
  // off again: the file stays (activa false), the pages tear down
  a.nat.poner(false); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: false });
  assert.equal(b.vistas.at(-1)?.activa, false);
});

test("interruptor: a world folder with no entorno/ yet (its zip brought none) gets it on the first switch", () => {
  const raiz = mkdtempSync(join(tmpdir(), "nat-sin-entorno-")), dir = join(raiz, "entorno");
  assert.ok(!existsSync(dir));
  const { pages: [a], pump } = mundo(dir, 1);
  a.nat.poner(true); pump();
  assert.deepEqual(JSON.parse(leer(dir)), { schema: ESQUEMA, activa: true });
  assert.equal(a.vistas.at(-1)?.activa, true);
  assert.deepEqual(eventos(a.s, "rechazado"), [], "no refusal");
});

test("interruptor: a broken or wrong file is never overwritten; the builder is told to fix it by hand", () => {
  const roto = "{ \"semilla\": 5, ";
  const d1 = carpeta(roto);
  const w1 = mundo(d1, 1);
  w1.pages[0].nat.poner(true); w1.pump();
  assert.match(String(eventos(w1.pages[0].s, "rechazado").at(-1)?.msg.motivo), /No he podido guardar/);
  assert.equal(leer(d1), roto, "the hand-written (broken) file is kept");
  assert.equal(w1.pages[0].vistas.length, 0);
  assert.deepEqual(readdirSync(d1), ["naturaleza.json"], "no temporary file left behind");

  const mal = JSON.stringify({ semilla: 5, arbolitos: 3 });
  const d2 = carpeta(mal);
  const w2 = mundo(d2, 1);
  w2.pages[0].nat.poner(true); w2.pump();
  assert.match(String(eventos(w2.pages[0].s, "rechazado").at(-1)?.msg.motivo), /naturaleza\.json tiene errores \(naturaleza\.arbolitos\)/);
  assert.equal(leer(d2), mal);
});

test("interruptor: without a world folder (the house part) the switch still works for this run, from the current state", () => {
  const log: string[] = [];
  const inst = new Instance({ seed: 3, capacity: 4, k: 50, snapshotEvery: 2, features: [crearNaturaleza({ ...DEFECTOS, semilla: 9 })], log: (l) => log.push(l), aparicion: { x: 0, z: 0, radio: 1 }, puede: () => true });
  const t = inst.join(0), c = crearCliente(), vistas: Record<string, unknown>[] = [];
  new ClientSession(t, { features: [c.part], view: { label() {}, bounce() {}, naturaleza: (v: Record<string, unknown>) => vistas.push({ ...v }) } });
  const pump = () => { for (let i = 0; i < 4; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  c.interruptor.poner(false); pump();
  assert.deepEqual(vistas.at(-1), { ...DEFECTOS, semilla: 9, activa: false });
  assert.match(log.join("\n"), /sin carpeta del mundo/);
});
