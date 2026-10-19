// S6s: la máquina de pasos (pura): cuándo suena un paso, un salto y un aterrizaje.
import test from "node:test";
import assert from "node:assert/strict";
import { crearPasos, ZANCADA, AIRE_MIN_S } from "../apps/plaza/sonidos.ts";

const DT = 0.05;
test("quieto no suena", () => {
  const p = crearPasos();
  for (let i = 0; i < 40; i++) assert.deepEqual(p({ y: 0, speed: 0, grounded: true }, DT), []);
});

test("caminando a 4 m/s suena un paso cada zancada (≈ 2,9 por segundo)", () => {
  const p = crearPasos(); let n = 0;
  for (let i = 0; i < 20; i++) n += p({ y: 0, speed: 4, grounded: true }, DT).length; // 1 s
  assert.ok(n === 2 || n === 3, `${n} pasos en 1 s a 4 m/s (zancada ${ZANCADA.camina} m)`);
});

test("corriendo la zancada es mayor pero el ritmo es mayor", () => {
  const p = crearPasos(); let n = 0;
  for (let i = 0; i < 20; i++) n += p({ y: 0, speed: 8, grounded: true }, DT).length;
  assert.ok(n >= 4 && n <= 5, `${n}`);
});

test("el salto suena al despegar y el aterrizaje al caer tras un rato en el aire", () => {
  const p = crearPasos();
  p({ y: 0, speed: 0, grounded: true }, DT);
  assert.deepEqual(p({ y: 0.3, speed: 0, grounded: false }, DT), ["salto"]);
  let t = DT;
  while (t < AIRE_MIN_S + DT) { assert.deepEqual(p({ y: 1, speed: 0, grounded: false }, DT), []); t += DT; }
  assert.deepEqual(p({ y: 0, speed: 0, grounded: true }, DT), ["aterrizaje"]);
});

test("bajar un escalón (poco aire) no es un golpe y caerse de un borde no es un salto", () => {
  const p = crearPasos();
  p({ y: 1, speed: 4, grounded: true }, DT);
  assert.deepEqual(p({ y: 0.9, speed: 4, grounded: false }, DT), []); // cae, no sube: sin «salto»
  assert.ok(!p({ y: 0.6, speed: 4, grounded: true }, DT).includes("aterrizaje"));
});
