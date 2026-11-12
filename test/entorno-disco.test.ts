// suelo.forma «disco» + suelo.radio: the file format only (the drawing is checked in the browser, see the changeset). Without `forma`, nothing changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarEntorno, porDefecto } from "../features/entorno/esquema.ts";

test("entorno@1: suelo.forma disco + radio come through as flat fields; without them the ground stays a plane", () => {
  const r = validarEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "liso", color: "#000000", forma: "disco", radio: 70 } });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.value.sueloForma, "disco"); assert.equal(r.value.sueloRadio, 70); }
  const d = porDefecto();
  assert.equal(d.sueloForma, "plano");
  assert.equal(d.sueloRadio, 0);
  const sin = validarEntorno({ schema: "numinia-engine/entorno@1", suelo: { tipo: "liso" } });
  assert.equal(sin.ok && sin.value.sueloForma, "plano");
});

test("entorno@1: a wrong suelo.forma or radio is reported with its path", () => {
  const r = validarEntorno({ schema: "numinia-engine/entorno@1", suelo: { forma: "cubo", radio: -3 } });
  assert.equal(r.ok, false);
  const rutas = !r.ok ? r.issues.map((i) => i.path) : [];
  assert.ok(rutas.includes("entorno.suelo.forma") && rutas.includes("entorno.suelo.radio"), rutas.join(", "));
});
