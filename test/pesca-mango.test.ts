// pesca en VR: el mango (zona de agarre generosa con histéresis), la forma de la caña y las instrucciones por fase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGARRE_ENTRA_M, AGARRE_SALE_M, radioAgarre, geometriaCana, LARGO_CANA, MANGO_M } from "../packages/render/src/cana.ts";

test("el radio de agarre es más generoso que el hover de Meta (0,20 m) y tiene histéresis", () => {
  assert.ok(AGARRE_ENTRA_M >= 0.3, "entrar al menos a 0,30 m");
  assert.ok(AGARRE_SALE_M > AGARRE_ENTRA_M, "una vez resaltada, se pierde más lejos");
  assert.equal(radioAgarre(false), AGARRE_ENTRA_M);
  assert.equal(radioAgarre(true), AGARRE_SALE_M);
});

test("la caña es una sola malla con colores y llega hasta LARGO_CANA", () => {
  const g = geometriaCana();
  g.computeBoundingBox();
  assert.ok(g.getAttribute("color"), "colores por vértice (una llamada de dibujo)");
  assert.ok(g.boundingBox!.max.y > LARGO_CANA * 0.9 && g.boundingBox!.max.y < LARGO_CANA * 1.1);
  assert.ok(MANGO_M < 0.4);
});

import { instruccion, INSTRUCCION, envolver } from "../features/pesca/instrucciones.ts";

test("una instrucción por fase, con las palabras de la historia", () => {
  const base = { tension: 10, arrancada: "no" as const };
  assert.equal(instruccion({ ...base, fase: "nada" }), "Lanza con un golpe de muñeca hacia delante");
  assert.equal(instruccion({ ...base, fase: "espera" }), "Espera a que pique");
  assert.equal(instruccion({ ...base, fase: "mordisqueo" }), "No tires todavía");
  assert.equal(instruccion({ ...base, fase: "picada" }), "¡TIRÓN hacia arriba ahora!");
  assert.equal(instruccion({ ...base, fase: "pelea" }), "Mantén el gatillo para recoger; suelta si tensa mucho");
  assert.equal(instruccion({ ...base, fase: "nada", capturado: true }), "Agarre otra vez para dejar la caña");
});

test("en la pelea, si tensa mucho o el pez arranca, dice que sueltes", () => {
  assert.equal(instruccion({ fase: "pelea", tension: 85, arrancada: "no" }), INSTRUCCION.tensa);
  assert.equal(instruccion({ fase: "pelea", tension: 20, arrancada: "aviso" }), INSTRUCCION.tensa);
});

test("envolver parte la frase larga en líneas cortas sin perder palabras", () => {
  const l = envolver(INSTRUCCION.pelea, 22);
  assert.ok(l.length <= 3 && l.every((x) => x.length <= 22), JSON.stringify(l));
  assert.equal(l.join(" "), INSTRUCCION.pelea);
});
