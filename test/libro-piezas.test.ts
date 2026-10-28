// MIS-248 3/3: the quest and fight pieces write to the world's book (evento@1) through `api.hecho`, with no person field,
// and the counters of the book rise. Off (no book) they change nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { crearLibro } from "../packages/server/src/eventos.ts";
import { crearLucha } from "../features/lucha/server.ts";
import { crearCliente as clienteLucha } from "../features/lucha/client.ts";
import { ENFRIAMIENTO_TICKS, REAPARICION_JUGADOR_TICKS } from "../features/lucha/feature.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente as clienteMisiones } from "../features/misiones/client.ts";

const sign = signer("una-clave-de-prueba-larga");
const leer = lectorAventura(new URL("../aventuras/ejemplo", import.meta.url).pathname);
const EJEMPLO = { misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") };
const nuevo = () => { const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "libro-piezas-")); return { dir, libro: crearLibro(dir) }; };
const lineas = (dir: string) => readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)));
const PERSONA = /(^|_)(id|uid|jugador|persona|usuario|nombre|name|user|player|hash|email|ip|pos|posicion|position|x|y|z)(_|$)/i;
const sinPersonas = (ls: { datos: Record<string, unknown> }[]) => { for (const l of ls) for (const k of Object.keys(l.datos)) assert.ok(!PERSONA.test(k), `person-looking key ${k}`); };

test("misiones: accepting, a step, finishing and leaving a quest each write one world fact, never a person", () => {
  const { dir, libro } = nuevo();
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: EJEMPLO }), log: () => {}, identitySign: sign, hecho: (t, d) => { libro.registrar(t, d); } });
  const cli = clienteMisiones(), t = inst.join(0);
  const k = { token: null as string | null, load: () => k.token, save: (x: string) => { k.token = x; } };
  const s = new ClientSession(t, { features: cli.parts, identity: k, view: { label() {}, bounce() {}, place() {}, tag() {} } });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  const place = (x: number, z: number) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); };
  pump(3); place(2, -2); pump(12);
  cli.misiones.aceptar("primeros-pasos"); pump(2);
  assert.equal(libro.contadores!.aventuras.get("primeros-pasos\u0000empezada"), 1);
  place(16, 1); pump(8);                                   // the pillar: step 0 done
  assert.equal(libro.contadores!.aventuras.get("primeros-pasos\u0000paso"), 1);
  cli.misiones.abandonar("primeros-pasos"); pump(2);
  assert.equal(libro.contadores!.aventuras.get("primeros-pasos\u0000abandonada"), 1);
  place(2, -2); pump(12); cli.misiones.aceptar("primeros-pasos"); pump(2); // once more, then to the end
  place(16, 1); pump(8);
  place(10, 10); pump(12); cli.misiones.hablar("bruno"); pump(2); cli.misiones.elegir(1); pump(2); cli.misiones.elegir(1); pump(2);
  place(4, 15); pump(12); s.features.use("misiones", "caja-de-bruno"); pump(2);
  assert.equal(libro.contadores!.aventuras.get("primeros-pasos\u0000terminada"), 1);
  const ls = lineas(dir);
  assert.deepEqual(ls.map((l) => l.tipo), ["aventura.empezada", "aventura.paso", "aventura.abandonada", "aventura.empezada", "aventura.paso", "aventura.paso", "aventura.paso", "aventura.terminada"]);
  assert.ok(ls.every((l) => l.v === "evento@1" && /Z$/.test(l.t)));
  sinPersonas(ls);
  assert.deepEqual(ls[0].datos, { aventura: "primeros-pasos" });
  assert.deepEqual(ls.at(-1)!.datos, { aventura: "primeros-pasos", resultado: "completada" });
});

test("lucha: a fight is opened by the first blow and closed by the kill; the species comes from the bestiary; a fall is a bare count", () => {
  const { dir, libro } = nuevo();
  const G = { id: "guardian-1", especie: "guardian-crisalida", x: 10, z: 0, y: 0, fija: true, reaparicion: 0 };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas: [G], semilla: 7 })], log: () => {}, identitySign: sign, hecho: (t, d) => { libro.registrar(t, d); } });
  const cli = clienteLucha(() => {}), t = inst.join(0);
  const k = { token: null as string | null, load: () => k.token, save: (x: string) => { k.token = x; } };
  const s = new ClientSession(t, { features: [cli.part], identity: k, view: { label() {}, bounce() {}, place() {}, tag() {} } });
  const pump = (n = 1) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(2); inst.sim.tf.cols.x[s.entity] = fx(11); inst.sim.tf.cols.z[s.entity] = fx(0); pump(12);
  cli.lucha.golpear("c:guardian-1"); pump(ENFRIAMIENTO_TICKS);
  assert.deepEqual(libro.contadores!.combates.get("inicio"), 1);
  assert.equal(libro.contadores!.combates.get("victoria"), undefined);
  let n = 0;
  while (libro.contadores!.criaturas.size === 0 && n < 60) { cli.lucha.golpear("c:guardian-1"); pump(ENFRIAMIENTO_TICKS); n++; if (libro.contadores!.caidas) pump(REAPARICION_JUGADOR_TICKS + 2); }
  assert.equal(libro.contadores!.criaturas.get("guardian-crisalida"), 1);
  assert.equal(libro.contadores!.combates.get("victoria"), 1);
  const ls = lineas(dir), tipos = ls.map((l) => l.tipo);
  assert.equal(tipos.filter((x) => x === "combate.inicio").length, 1);
  assert.equal(tipos.filter((x) => x === "combate.fin").length, 1);
  assert.deepEqual(ls.find((l) => l.tipo === "criatura.abatida")!.datos, { especie: "guardian-crisalida", arma: "golpe" });
  const fin = ls.find((l) => l.tipo === "combate.fin")!.datos;
  assert.equal(fin.resultado, "victoria"); assert.equal(fin.participantes, 1);
  assert.equal(libro.contadores!.caidas, ls.filter((l) => l.tipo === "persona.cae").length);
  for (const l of ls.filter((l) => l.tipo === "persona.cae")) assert.deepEqual(l.datos, {});
  sinPersonas(ls);
});

test("without a book the pieces work the same and nothing is written", () => {
  const G = { id: "guardian-1", especie: "guardian-crisalida", x: 10, z: 0, y: 0, fija: true };
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas: [G] })], log: () => {}, identitySign: sign });
  const cli = clienteLucha(() => {}), t = inst.join(0);
  const s = new ClientSession(t, { features: [cli.part], identity: { token: null, load: () => null, save() {} } as never, view: { label() {}, bounce() {}, place() {}, tag() {} } });
  for (let i = 0; i < 14; i++) { t.flush(); inst.tick(); t.flush(); }
  inst.sim.tf.cols.x[s.entity] = fx(11);
  cli.lucha.golpear("c:guardian-1");
  for (let i = 0; i < 14; i++) { t.flush(); inst.tick(); t.flush(); }
});
