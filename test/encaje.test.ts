// M22c: encaje (snap entre objetos) — la geometría pura (sin three.js), packages/render/src/encaje.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seEnfrentan, desplazamientoEncaje, mejorEncaje, guiaEncaje } from "../packages/render/src/encaje.ts";
import type { Caja3 } from "../packages/render/src/encaje.ts";

const caja = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Caja3 => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

test("seEnfrentan: solo si se solapan en los dos ejes que no son el elegido", () => {
  const a = caja(0, 0, 0, 1, 1, 1);
  assert.equal(seEnfrentan(a, caja(1.1, 0, 0, 2, 1, 1), 0), true, "misma altura/profundidad: se enfrentan en X");
  assert.equal(seEnfrentan(a, caja(1.1, 5, 5, 2, 6, 6), 0), false, "muy arriba/al lado: no se enfrentan aunque estén cerca en X");
});

test("desplazamientoEncaje: hueco pequeño -> encaja cara con cara; hueco grande -> null", () => {
  const a = caja(0, 0, 0, 1, 1, 1);
  const vecinoCerca = caja(1.1, 0, 0, 2, 1, 1); // 0.1 m de hueco en X
  assert.ok(Math.abs(desplazamientoEncaje(a, vecinoCerca, 0, 0.25)! - 0.1) < 1e-9, "mueve 0.1 para tocar la cara");
  const vecinoLejos = caja(2, 0, 0, 3, 1, 1); // 1 m de hueco: más que el umbral
  assert.equal(desplazamientoEncaje(a, vecinoLejos, 0, 0.25), null);
  // por el otro lado (yo estoy encima del vecino en ese eje)
  const vecinoDebajo = caja(-1.05, 0, 0, -0.05, 1, 1); // 0.05 m de hueco por debajo
  assert.ok(Math.abs(desplazamientoEncaje(a, vecinoDebajo, 0, 0.25)! - (-0.05)) < 1e-9);
});

test("mejorEncaje: entre varios candidatos, el hueco más pequeño gana; ninguno a mano -> null", () => {
  const a = caja(0, 0, 0, 1, 1, 1);
  const lejos = caja(10, 0, 0, 11, 1, 1);
  const cerca08 = caja(1.08, 0, 0, 2, 1, 1);
  const cerca02 = caja(1.02, 0, 0, 2, 1, 1);
  const d = mejorEncaje(a, [lejos, cerca08, cerca02], 0, 0.25);
  assert.ok(d !== null && Math.abs(d - 0.02) < 1e-9, "el candidato con menos hueco gana");
  assert.equal(mejorEncaje(a, [lejos], 0, 0.25), null);
});

test("guiaEncaje (lote4): beyond the snap but within the guide's reach it announces the jump; within the snap it says «encaja»; far away null", () => {
  const a = caja(0, 0, 0, 1, 1, 1);
  const vecino = (hueco: number) => caja(1 + hueco, 0, 0, 2 + hueco, 1, 1);
  const lejos = guiaEncaje(a, [vecino(0.5)], 0)!;                       // 0.5 m of gap: past the 0.25 snap, inside the 0.6 guide
  assert.equal(lejos.encaja, false);
  assert.ok(Math.abs(lejos.falta - 0.5) < 1e-9 && Math.abs(lejos.desplazamiento - 0.5) < 1e-9, JSON.stringify(lejos));
  const cerca = guiaEncaje(a, [vecino(0.1)], 0)!;
  assert.equal(cerca.encaja, true, "within 25 cm the snap takes it");
  assert.equal(guiaEncaje(a, [vecino(0)], 0)!.falta, 0, "touching: nothing left");
  assert.equal(guiaEncaje(a, [vecino(0.7)], 0), null, "farther than the guide's reach: no ghost");
  assert.equal(guiaEncaje(a, [caja(1.5, 5, 5, 2.5, 6, 6)], 0), null, "not facing: no ghost");
  assert.equal(mejorEncaje(a, [vecino(0.5)], 0, 0.25), null, "mejorEncaje (the snap) is unchanged: 0.5 m is out of its reach");
});
