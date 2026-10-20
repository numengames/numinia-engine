// C1: a world reads its conditions of entry from aventura/condiciones.json; none = the house example; broken = log + house.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONDICIONES_CASA, leerCondiciones } from "../packages/server/src/condiciones.ts";

const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cond-"));
const punto = (id: string, obligatorio: boolean) => ({ id, titulo: id, texto: `texto ${id}`, obligatorio });
const bueno = {
  formato: "condiciones@1",
  capas: [
    { capa: "casa", version: "1", puntos: [punto("uso", true)] },
    { capa: "comunidad", version: "2026-10", puntos: [punto("normas", true), punto("avisos", false)] },
  ],
};

test("no file or no folder: the house example, no problems", () => {
  for (const dir of [null, tmp()]) {
    const r = leerCondiciones(dir);
    assert.equal(r.condiciones, CONDICIONES_CASA); assert.equal(r.deFichero, false); assert.deepEqual(r.problemas, []);
  }
  assert.ok(CONDICIONES_CASA.capas[0].puntos.some((p) => p.obligatorio), "the example has a mandatory point");
});

test("a file: both layers in order, points kept with their mandatory flag", () => {
  const d = tmp(); writeFileSync(join(d, "condiciones.json"), JSON.stringify(bueno));
  const r = leerCondiciones(d);
  assert.ok(r.deFichero); assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.condiciones.capas.map((c) => c.capa), ["casa", "comunidad"]);
  assert.deepEqual(r.condiciones.capas[1].puntos.map((p) => [p.id, p.obligatorio]), [["normas", true], ["avisos", false]]);
});

test("broken file (bad JSON, wrong order, repeated id, missing flag): the house example plus the reason", () => {
  const casos: [string, string, string][] = [
    ["{no json", "", "JSON roto"],
    [JSON.stringify({ ...bueno, capas: [bueno.capas[1], bueno.capas[0]] }), "", "el orden es"],
    [JSON.stringify({ ...bueno, capas: [{ capa: "casa", version: "1", puntos: [punto("a", true), punto("a", false)] }] }), "", "repetido"],
    [JSON.stringify({ ...bueno, capas: [{ capa: "casa", version: "1", puntos: [{ id: "a", titulo: "t", texto: "x" }] }] }), "", "obligatorio"],
    [JSON.stringify({ formato: "otro@1" }), "", "formato"],
  ];
  for (const [texto, , frag] of casos) {
    const d = tmp(); writeFileSync(join(d, "condiciones.json"), texto);
    const r = leerCondiciones(d);
    assert.equal(r.condiciones, CONDICIONES_CASA, frag); assert.equal(r.deFichero, false);
    assert.ok(r.problemas.some((p) => p.includes(frag)), `${frag}: ${r.problemas.join("|")}`);
  }
});
