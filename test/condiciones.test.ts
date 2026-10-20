// C1: a world reads its conditions of entry from aventura/condiciones.json; none = the house example; broken = log + house.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONDICIONES_CASA, leerCondiciones, validarCondiciones } from "../packages/server/src/condiciones.ts";

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

// ---------- c2: `tipo` ----------
const con = (...puntos: unknown[]) => ({ formato: "condiciones@1", capas: [{ capa: "casa", version: "1", puntos }] });
const pt = (o: object) => ({ id: "x", titulo: "x", texto: "x", obligatorio: false, ...o });

test("c2 tipo: «norma» is the default, «datos» is kept, anything else is a path-pointed error", () => {
  const r = validarCondiciones(con(pt({ id: "a" }), pt({ id: "b", tipo: "norma" }), pt({ id: "c", tipo: "datos" })));
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.value.capas[0].puntos.map((p) => p.tipo), ["norma", "norma", "datos"]);
  const mal = validarCondiciones(con(pt({ tipo: "otro" })));
  assert.ok(!mal.ok && mal.issues.some((i) => i.includes("tipo") && i.includes('"norma"') && i.includes('"datos"')), JSON.stringify(mal));
  assert.ok(!validarCondiciones(con(pt({ tipo: 3 }))).ok);
});

test("c2 tipo: a mandatory «datos» point is an error that says how to fix it; an optional one and a mandatory norma are fine", () => {
  const r = validarCondiciones(con(pt({ id: "informe", tipo: "datos", obligatorio: true })));
  assert.ok(!r.ok);
  const msg = !r.ok ? r.issues.join("\n") : "";
  assert.match(msg, /punto de datos nunca puede ser obligatorio/); assert.match(msg, /"obligatorio": false/); assert.match(msg, /"tipo": "norma"/);
  assert.match(msg, /capas\[0\]\.puntos\[0\]/, "with the path");
  assert.ok(validarCondiciones(con(pt({ tipo: "datos", obligatorio: false }))).ok);
  assert.ok(validarCondiciones(con(pt({ tipo: "norma", obligatorio: true }))).ok);
  // a broken file falls back to the house example and logs the fix
  const d = tmp(); writeFileSync(join(d, "condiciones.json"), JSON.stringify(con(pt({ tipo: "datos", obligatorio: true }))));
  const l = leerCondiciones(d);
  assert.equal(l.condiciones, CONDICIONES_CASA); assert.ok(l.problemas.some((p) => p.includes("nunca puede ser obligatorio")));
});

test("c2 tipo: the house example's «informe» is data and optional, its mandatory point a norma; `puerta` is optional and boolean", () => {
  const inf = CONDICIONES_CASA.capas.flatMap((c) => c.puntos).find((p) => p.id === "informe")!;
  assert.equal(inf.tipo, "datos"); assert.equal(inf.obligatorio, false);
  assert.ok(CONDICIONES_CASA.capas.flatMap((c) => c.puntos).filter((p) => p.obligatorio).every((p) => p.tipo === "norma"));
  assert.equal(CONDICIONES_CASA.puerta, undefined);
  const v = validarCondiciones({ ...con(pt({})), puerta: true });
  assert.ok(v.ok && v.value.puerta === true);
  assert.ok(!validarCondiciones({ ...con(pt({})), puerta: "si" }).ok);
});

test("c3: a layer may carry a `nombre` (what the bubble calls it); a bad one is refused with its path; none is fine", () => {
  const con = (nombre: unknown) => ({ ...bueno, capas: [{ ...bueno.capas[0], nombre }, bueno.capas[1]] });
  const ok = validarCondiciones(con("  Casa de prueba "));
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.capas[0].nombre, "Casa de prueba"); assert.equal(ok.value.capas[1].nombre, undefined, "no key = no name"); }
  for (const malo of ["", "   ", "x".repeat(61), 5, null]) {
    const r = validarCondiciones(con(malo));
    assert.ok(!r.ok && r.issues.some((i) => i.startsWith("capas[0].nombre")), `${JSON.stringify(malo)} is refused`);
  }
  assert.ok(validarCondiciones(bueno).ok);
});
