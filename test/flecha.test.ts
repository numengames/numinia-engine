// T3: which button the guide arrow points at (the pure part of apps/plaza/flecha.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { objetivoDeFlecha, padreDeBoton } from "../apps/plaza/flecha-logica.ts";

const ve = (...ids: string[]) => (id: string) => ids.includes(id);

test("the named button is on screen: it is the target", () => {
  assert.equal(objetivoDeFlecha("construir", ve("construir", "mas")), "construir");
  assert.equal(objetivoDeFlecha("dock-anadir", ve("construir", "dock-anadir", "dock-cable")), "dock-anadir");
  assert.equal(objetivoDeFlecha("cable-nuevo", ve("construir", "dock-cable", "cable-nuevo")), "cable-nuevo");
});
test("a dock button with the Construir panel closed: point at Construir", () => {
  assert.equal(objetivoDeFlecha("dock-anadir", ve("construir")), "construir");
  assert.equal(objetivoDeFlecha("dock-cable", ve("construir")), "construir");
});
test("cable-nuevo with the Cable drawer closed: point at the dock's Cable button; panel closed: Construir", () => {
  assert.equal(objetivoDeFlecha("cable-nuevo", ve("construir", "dock-cable")), "dock-cable");
  assert.equal(objetivoDeFlecha("cable-nuevo", ve("construir")), "construir");
});
test("nothing leads there: no arrow", () => {
  assert.equal(objetivoDeFlecha("dock-anadir", ve()), "");
  assert.equal(objetivoDeFlecha("cable-nuevo", ve("otro")), "");
  assert.equal(objetivoDeFlecha("", ve("construir")), "");
  assert.equal(objetivoDeFlecha("cable-probar", ve("construir")), "");
});
test("a phone keeps Construir inside «…»: point at mas", () => {
  assert.equal(objetivoDeFlecha("construir", ve("mas")), "mas");
  assert.equal(objetivoDeFlecha("dock-anadir", ve("mas")), "mas");
  assert.equal(objetivoDeFlecha("cable-nuevo", ve("mas")), "mas");
});
test("the chain ends (no loops) and parents are what the page has", () => {
  assert.equal(padreDeBoton("mas"), "");
  assert.equal(padreDeBoton("dock-cable"), "construir");
  assert.equal(padreDeBoton("cable-nuevo"), "dock-cable");
});
