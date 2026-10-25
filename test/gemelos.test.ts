// H6 «imagen en el mundo con su gemelo HTML»: every named picture placed in the world is also a list item for the screen reader and for
// agents («Imagen «X», a 5 m, delante a la izquierda»), nearest first; decoration is left out; a link is a real button only if it can open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firmaGemelos, gemelosDe, GEMELOS_MAX } from "../apps/plaza/gemelos.ts";
import { enlaceAbrible } from "../apps/plaza/enlaces.ts";

const img = (id: string, x: number, z: number, o: Record<string, unknown> = {}) => ({ id, tipo: "imagen", nombre: `Cartel ${id}`, decorado: false, x, z, ...o });
const yo = { x: 0, z: 0 };

test("named pictures only: decoration, hidden ones, unnamed ones and other kinds of thing are not in the twin", () => {
  const g = gemelosDe([img("a", 0, -5), img("b", 1, 1, { decorado: true }), img("c", 2, 2, { oculto: true }), img("d", 3, 3, { nombre: "  " }), { id: "m", tipo: "modelo", nombre: "Silla", x: 1, z: 1 }, { id: "n", nombre: "Sin tipo", x: 1, z: 1 }], yo, 0);
  assert.deepEqual(g.map((x) => x.id), ["a"]);
});

test("the sentence: name, distance and side for whoever faces `yaw`; under 1 m it is «a menos de 1 m» without a side", () => {
  const [a] = gemelosDe([img("a", 0, -5)], yo, 0);
  assert.equal(a.texto, "Imagen «Cartel a», a 5 m, delante");
  const [b] = gemelosDe([img("a", 0, -5)], yo, Math.PI); // turned round: it is behind
  assert.match(b.texto, /detrás$/);
  const [c] = gemelosDe([img("a", -5, 0)], yo, 0);
  assert.match(c.texto, /a tu izquierda$/);
  const [d] = gemelosDe([img("a", 0.3, 0.2)], yo, 0);
  assert.equal(d.texto, "Imagen «Cartel a», a menos de 1 m"); assert.equal(d.lado, "aquí mismo");
});

test("nearest first, ties by id, at most GEMELOS_MAX", () => {
  const g = gemelosDe([img("z", 0, -9), img("b", 0, -3), img("a", 0, -3), img("m", 0, -6)], yo, 0);
  assert.deepEqual(g.map((x) => x.id), ["a", "b", "m", "z"]);
  const muchas = Array.from({ length: GEMELOS_MAX + 20 }, (_, i) => img(`i${String(i).padStart(3, "0")}`, 0, -(i + 2)));
  assert.equal(gemelosDe(muchas, yo, 0).length, GEMELOS_MAX);
  assert.equal(gemelosDe(muchas, yo, 0)[0].id, "i000");
});

test("a link is a button only if it can be opened (https, or http to this machine); otherwise the picture is listed without it", () => {
  const g = gemelosDe([img("a", 0, -2, { enlace: "https://numinia.com/x" }), img("b", 0, -3, { enlace: "javascript:alert(1)" }), img("c", 0, -4)], yo, 0, enlaceAbrible);
  assert.deepEqual(g.map((x) => x.enlace), ["https://numinia.com/x", null, null]);
});

test("the signature changes only when the words or the link change (so the page rewrites nothing while you stand still)", () => {
  const f1 = firmaGemelos(gemelosDe([img("a", 0, -5)], yo, 0)), f2 = firmaGemelos(gemelosDe([img("a", 0, -5)], yo, 0));
  assert.equal(f1, f2);
  assert.notEqual(f1, firmaGemelos(gemelosDe([img("a", 0, -5)], { x: 0, z: 2 }, 0)), "7 m now");
  assert.notEqual(f1, firmaGemelos(gemelosDe([img("a", 0, -5, { enlace: "https://numinia.com" })], yo, 0)));
  assert.notEqual(f1, firmaGemelos(gemelosDe([img("a", 0, -5, { nombre: "Otro" })], yo, 0)));
  assert.equal(gemelosDe([img("a", Number.NaN, 0)], yo, 0).length, 0, "a broken position is skipped, never thrown");
});
