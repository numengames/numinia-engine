// MIS-224: the house plaza keeps only objects with a reason. Every pillar and every example thing says what it is for, and the
// pillars the quest names stand where the quest says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { HITOS_PLAZA } from "../packages/render/src/hitos-plaza.ts";

const raiz = new URL("../", import.meta.url);
const json = (f: string) => JSON.parse(readFileSync(new URL(f, raiz), "utf8"));
const cosas = readdirSync(new URL("aventuras/ejemplo/cosas/", raiz)).filter((f) => f.endsWith(".json")).map((f) => json(`aventuras/ejemplo/cosas/${f}`));

test("every pillar of the plaza has a name and a one-line purpose; no pillar without a reason is left", () => {
  assert.ok(HITOS_PLAZA.length >= 1 && HITOS_PLAZA.length <= 4, "a handful, not a ring of 24");
  for (const h of HITOS_PLAZA) { assert.ok(h.nombre.length > 2 && h.proposito.length > 20 && !h.proposito.includes("\n"), h.id); }
  assert.equal(new Set(HITOS_PLAZA.map((h) => h.id)).size, HITOS_PLAZA.length);
  assert.equal(new Set(HITOS_PLAZA.map((h) => `${h.x},${h.z}`)).size, HITOS_PLAZA.length, "no two on the same spot");
  const src = readFileSync(new URL("packages/render/src/index.ts", raiz), "utf8");
  assert.ok(!/i < 24/.test(src) && src.includes("HITOS_PLAZA"), "index.ts builds the pillars from the table, not a ring of filler");
});

test("the pillars stand where the example quest and Bruno send you", () => {
  const dorado = HITOS_PLAZA.find((h) => h.id === "pilar-dorado")!, rojo = HITOS_PLAZA.find((h) => h.id === "pilar-rojo")!;
  const paso = json("aventuras/ejemplo/misiones/primeros-pasos.json").pasos.find((p: { id: string }) => p.id === "pilar");
  assert.ok(Math.hypot(paso.x - dorado.x, paso.z - dorado.z) <= paso.radio, "the quest's «pilar» step reaches the gold pillar");
  const caja = cosas.find((c) => c.id === "caja-de-bruno");
  assert.ok(Math.hypot(caja.posicion.x - rojo.x, caja.posicion.z - rojo.z) <= 6, "Bruno's box lies by the red pillar");
  assert.equal(dorado.color, 0xd9a441); assert.equal(rojo.color, 0xc0605b); // «dorado» and «rojo» in the quest's words
});

test("every example thing has a name and a purpose in its notas", () => {
  assert.ok(cosas.length >= 3);
  for (const c of cosas) { assert.ok(c.nombre, c.id); assert.match(c.notas, /^Propósito: .{20,}/, c.id); }
});
