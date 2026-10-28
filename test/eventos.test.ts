import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearLibro, libroDeEntorno, TIPOS, MAX_DIA_BYTES } from "../packages/server/src/eventos.ts";

const dir = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "eventos-"));
const lineas = (f: string) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("a valid fact is written as evento@1 with a UTC t", () => {
  const d = dir(); const l = crearLibro(d, () => new Date("2026-10-28T10:00:00Z"));
  assert.equal(l.registrar("criatura.abatida", { zona: "bosque", especie: "lobo", arma: "arco" }), true);
  const [e] = lineas(join(d, "eventos-2026-10-28.jsonl"));
  assert.deepEqual(e, { v: "evento@1", t: "2026-10-28T10:00:00.000Z", tipo: "criatura.abatida", datos: { zona: "bosque", especie: "lobo", arma: "arco" } });
});

test("bad type, bad key, person-looking key and bad value are rejected without throwing", () => {
  const d = dir(); const l = crearLibro(d);
  assert.equal(l.registrar("otra.cosa", {}), false);
  assert.equal(l.registrar("__proto__", {}), false);
  assert.equal(l.registrar("persona.cae", { zona: "a", jugador: "u1" }), false);
  assert.equal(l.registrar("persona.cae", { zona: "a", id: "x" }), false);
  assert.equal(l.registrar("persona.cae", { zona: "a", posicion: 3 }), false);
  assert.equal(l.registrar("combate.fin", { arma: "x" }), false);          // key not allowed for this type
  assert.equal(l.registrar("combate.fin", { participantes: "Ana" }), false); // a count must be a whole number
  assert.equal(l.registrar("combate.fin", { participantes: 2.5 }), false);
  assert.equal(l.registrar("combate.fin", null as never), false);
  assert.equal(readdirSync(d).length, 0);
  assert.equal(l.stats.rechazados, 9);
});

test("rotates by UTC day", () => {
  const d = dir(); let ahora = new Date("2026-10-28T23:59:59Z"); const l = crearLibro(d, () => ahora);
  assert.equal(l.registrar("combate.inicio", { zona: "a", participantes: 3 }), true);
  ahora = new Date("2026-10-29T00:00:01Z");
  assert.equal(l.registrar("combate.fin", { zona: "a", resultado: "victoria", duracion_s: 12 }), true);
  assert.deepEqual(readdirSync(d).sort(), ["eventos-2026-10-28.jsonl", "eventos-2026-10-29.jsonl"]);
});

test("stops at the daily cap and counts what it drops", () => {
  const d = dir(); const l = crearLibro(d, () => new Date("2026-10-28T10:00:00Z"));
  writeFileSync(join(d, "eventos-2026-10-28.jsonl"), "x".repeat(MAX_DIA_BYTES - 10));
  assert.equal(l.registrar("persona.cae", { zona: "a" }), false);
  assert.equal(l.stats.descartados, 1);
  assert.equal(readFileSync(join(d, "eventos-2026-10-28.jsonl")).length, MAX_DIA_BYTES - 10);
});

test("no allowed key looks like a person, and files never hold a person field", () => {
  const persona = /(^|_)(id|uid|jugador|persona|usuario|nombre|name|user|player|hash|email|ip|pos|posicion|position|x|y|z)(_|$)/i;
  for (const [t, ks] of Object.entries(TIPOS)) for (const k of ks) assert.equal(persona.test(k), false, `${t}.${k}`);
  const d = dir(); const l = crearLibro(d, () => new Date("2026-10-28T10:00:00Z"));
  for (const [t, ks] of Object.entries(TIPOS)) {
    const datos: Record<string, unknown> = {};
    for (const k of ks) datos[k] = ["duracion_s", "participantes"].includes(k) ? 2 : "v";
    assert.equal(l.registrar(t, datos), true, t);
  }
  const txt = readFileSync(join(d, "eventos-2026-10-28.jsonl"), "utf8");
  for (const e of txt.trim().split("\n").map((x) => JSON.parse(x))) {
    assert.deepEqual(Object.keys(e), ["v", "t", "tipo", "datos"]);
    for (const k of Object.keys(e.datos)) assert.equal(persona.test(k), false);
  }
});

test("off by default; MOTOR_EVENTOS=si turns it on", () => {
  const d = dir();
  assert.equal(libroDeEntorno({}, d).registrar("persona.cae", { zona: "a" }), false);
  assert.equal(existsSync(join(d, "x")), false);
  assert.equal(readdirSync(d).length, 0);
  assert.equal(libroDeEntorno({ MOTOR_EVENTOS: "si" }, d).registrar("persona.cae", { zona: "a" }), true);
  assert.equal(readdirSync(d).length, 1);
});
