// Lote 8 (mesa): a Director's scene can change the table's map. escena@1 `mapa` = the work (already uploaded) to put in a HOLE a
// builder made (objetos `hueco`); the director sends it to objetos by the server-only event `mapa`, objetos fills the hole with the same
// piece `rellenar` uses (fitted whole, never distorted). `obra: ""` empties it. Only who may direct puts a scene; a scene without
// `mapa` leaves the map alone; a hole that is not there / an image not uploaded is said in the log and nothing else changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClientPart, PlacedObject } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente } from "../features/objetos/client.ts";
import { crearDirector } from "../features/director/server.ts";
import { crearCliente as crearDirectorCliente } from "../features/director/client.ts";
import { leerEscena, cargarEscenas } from "../features/director/escena.ts";

const SHA = { cartel: "c".repeat(64), cripta: "a".repeat(64), bosque: "b".repeat(64), faltante: "9".repeat(64) };
const PX: Record<string, { ancho: number; alto: number }> = { [`${SHA.cartel}.png`]: { ancho: 768, alto: 512 }, [`${SHA.cripta}.png`]: { ancho: 3000, alto: 1000 }, [`${SHA.bosque}.jpg`]: { ancho: 1000, alto: 2000 } };
const esc = (nombre: string, mapa?: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ schema: "numinia-engine/escena@1", nombre, ...(mapa === undefined ? {} : { mapa }), ...extra });
const ESCENAS = [
  { fichero: "1-cripta.json", texto: esc("La cripta", { obra: `${SHA.cripta}.png`, titulo: "Planta de la cripta" }) },
  { fichero: "2-bosque.json", texto: esc("El bosque", { obra: `${SHA.bosque}.jpg`, titulo: "Sendas del bosque" }, { preset: "noche" }) },
  { fichero: "3-vacia.json", texto: esc("Sin mapa", { obra: "" }) },
  { fichero: "4-falta.json", texto: esc("Plano perdido", { obra: `${SHA.faltante}.png` }) },
  { fichero: "5-segunda.json", texto: esc("En el hueco B", { hueco: "Plano B", obra: `${SHA.cripta}.png` }) },
  { fichero: "6-solo-luz.json", texto: esc("Solo luz", undefined, { preset: "atardecer" }) },
];

test("escena@1 mapa: obra is <sha256>.<png|jpg|webp> (or \"\" to empty); hueco and titulo are optional; wrong ones say where; a map alone is a scene", () => {
  const ok = leerEscena("c.json", esc("C", { obra: `${SHA.cripta}.png`, titulo: " Planta ", hueco: " Plano A " }));
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value.mapa, { hueco: "Plano A", modelo: SHA.cripta, ext: "png", titulo: "Planta" });
  const vacio = leerEscena("v.json", esc("V", { obra: "" })); assert.ok(vacio.ok); if (vacio.ok) assert.deepEqual(vacio.value.mapa, { hueco: "", modelo: "", ext: "", titulo: "" });
  const sin = leerEscena("s.json", esc("S", undefined, { preset: "noche" })); assert.ok(sin.ok); if (sin.ok) assert.equal("mapa" in sin.value, false, "a scene without a map has none (and leaves the table's alone)");
  const mal = leerEscena("m.json", esc("M", { obra: "plano.png", titulo: "x".repeat(41), hueco: "h".repeat(65), otro: 1 }, { preset: "noche" }));
  assert.ok(!mal.ok);
  if (!mal.ok) assert.deepEqual(mal.issues.map((i) => i.path).sort(), ["escena.mapa.hueco", "escena.mapa.obra", "escena.mapa.otro", "escena.mapa.titulo"]);
  const gif = leerEscena("g.json", esc("G", { obra: `${SHA.cripta}.gif` })); assert.ok(!gif.ok && gif.issues.some((i) => i.path === "escena.mapa.obra" && /sha256/.test(i.message)));
  const sinObra = leerEscena("o.json", esc("O", { titulo: "x" })); assert.ok(!sinObra.ok && sinObra.issues.some((i) => i.path === "escena.mapa.obra"), "a map must say its obra (\"\" to empty)");
  const noObj = leerEscena("n.json", esc("N", "plano.png")); assert.ok(!noObj.ok && noObj.issues.some((i) => i.path === "escena.mapa"));
  const log: string[] = [];
  assert.equal(cargarEscenas([{ fichero: "m.json", texto: esc("M", { obra: "x" }) }], (l) => log.push(l)).length, 0);
  assert.match(log.join(), /escenas\/m\.json no se usa: escena\.mapa\.obra/);
});

function mesa(opts: { director?: boolean } = {}) {
  const log: string[] = [];
  const quien = opts.director ?? true;
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos(), crearDirector({ escenas: ESCENAS })], log: (l) => log.push(l),
    puede: (_w, a) => a === "construir" || (quien && a === "dirigir"), activo: (h, e) => `${h}.${e}` in PX, medidas: (h, e) => PX[`${h}.${e}`] ?? null });
  const mk = () => {
    const t = inst.join(0), cli = crearCliente(), dj = crearDirectorCliente(), drawn = new Map<string, PlacedObject>();
    const s = new ClientSession(t, { features: [cli.part as ClientPart, dj.part], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
    return { t, s, b: cli.constructor, dj: dj.director, drawn };
  };
  const a = mk();
  const pump = (n = 3) => { for (let k = 0; k < n; k++) { a.t.flush(); inst.tick(); a.t.flush(); } };
  pump();
  const obj = (id: string) => Object.fromEntries(Object.entries(a.b.objeto(id)!).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v]));
  /** The template's map: a card at the table, turned into a 2.2 × 1.5 m hole. */
  const hueco = (nombre = "El mapa de la mesa", marco: [number, number] = [2.2, 1.5], x = 3) => {
    assert.ok(a.b.colocarFichero(SHA.cartel, "png", nombre, { x, y: 1.1, z: -2 }).ok); pump();
    const id = a.b.lista().find((o) => o.nombre === nombre)!.id;
    assert.ok(a.b.hueco(id, marco[0], marco[1]).ok); pump(); return id;
  };
  const poner = (n: string) => { a.dj.escena(n); pump(); };
  return { inst, a, pump, obj, hueco, poner, log };
}

test("a scene with a map fills the table's hole (fitted whole, titled), the next one swaps it, an empty one brings the card back", () => {
  const w = mesa(), id = w.hueco();
  assert.equal(w.obj(id).modelo, SHA.cartel);
  w.poner("la cripta");
  let o = w.obj(id);
  assert.deepEqual([o.modelo, o.ext, o.huecoLleno, o.nombre], [SHA.cripta, "png", true, "Planta de la cripta"], "the hole shows the scene's plan under its title");
  assert.deepEqual([o.sx, o.x, o.y, o.z], [0.73, 3, 1.1, -2], "3000×1000 in a 2.2×1.5 frame: as wide as the frame (0.73 m tall), same place");
  assert.equal(w.a.drawn.get(id)!.model, SHA.cripta, "every page draws it");
  w.poner("el bosque");
  o = w.obj(id); assert.deepEqual([o.modelo, o.ext, o.sx, o.nombre], [SHA.bosque, "jpg", 1.5, "Sendas del bosque"], "a portrait as tall as the frame");
  w.poner("solo luz");
  assert.equal(w.obj(id).modelo, SHA.bosque, "a scene without a map leaves the table's as it is");
  w.poner("sin mapa");
  o = w.obj(id); assert.deepEqual([o.modelo, o.huecoLleno, o.nombre, o.sx], [SHA.cartel, false, "El mapa de la mesa", 1], "obra \"\": the card is back, with its name and size");
  w.poner("sin mapa"); assert.equal(w.obj(id).huecoLleno, false, "emptying an empty hole is nothing");
  assert.deepEqual(w.log.filter((l) => /escena trae un mapa|mapa de la escena/.test(l)), [], "no complaints on the happy path");
});

test("a scene's map is not a builder's undo step and does not make an object nobody built", () => {
  const w = mesa(), id = w.hueco(); const antes = w.a.b.lista().length;
  w.poner("la cripta");
  assert.equal(w.a.b.lista().length, antes);
  w.a.b.deshacer(); w.pump(); // undoes the builder's own last step (the hole), not the scene's map
  assert.equal(w.obj(id).huecoAncho, 0, "the builder's step went back; the scene did not pile a step of its own");
});

test("only who may direct puts the scene; and a scene cannot fill what is not a hole", () => {
  const w = mesa({ director: false }), id = w.hueco();
  w.poner("la cripta");
  assert.equal(w.obj(id).modelo, SHA.cartel, "no director: the map does not change");
  const v = mesa(); // a plain picture (not a hole) is never touched
  assert.ok(v.a.b.colocarFichero(SHA.cartel, "png", "Un cartel", { x: 0, y: 1, z: 0 }).ok); v.pump();
  const cartel = v.a.b.lista()[0].id;
  v.poner("la cripta");
  assert.equal(v.obj(cartel).modelo, SHA.cartel);
  assert.ok(v.log.some((l) => l.includes("no hay ningún hueco")), "the author reads why: " + v.log.join(" | "));
});

test("several holes: the scene says which by name or id; without it nothing is guessed; an image not uploaded changes nothing", () => {
  const w = mesa(), a = w.hueco("Plano A", [2, 1], 1), b = w.hueco("Plano B", [2, 1], 5);
  w.poner("la cripta");
  assert.deepEqual([w.obj(a).modelo, w.obj(b).modelo], [SHA.cartel, SHA.cartel], "two holes and no «hueco»: not guessed");
  assert.ok(w.log.some((l) => l.includes("hay 2 huecos") && l.includes('"hueco"')), w.log.join(" | "));
  w.poner("en el hueco b");
  assert.deepEqual([w.obj(a).modelo, w.obj(b).modelo, w.obj(b).huecoLleno], [SHA.cartel, SHA.cripta, true], "named: only Plano B");
  w.poner("plano perdido"); // names no hueco and its image is not on the server (the only filled hole stays)
  assert.equal(w.obj(b).modelo, SHA.cripta);
  assert.ok(w.log.some((l) => l.includes("hay 2 huecos")));
  const u = mesa(), id = u.hueco();
  u.poner("plano perdido");
  assert.equal(u.obj(id).modelo, SHA.cartel, "image not uploaded: the card stays");
  assert.ok(u.log.some((l) => l.includes(`[objetos] el mapa de la escena no se pone en «${id}»`) && l.includes("no se ha subido")), u.log.join(" | "));
});
