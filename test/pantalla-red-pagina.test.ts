// M18 trozo 3: the page side of a shared screen, decisions without a browser (apps/plaza/pantalla-red-logica.ts). The WebCodecs path itself
// is proved in a real Chromium by tools/e2e-piernas/pantalla-red.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PANTALLA_MOTIVO, PANTALLA_LADO_MAX, PANTALLA_BYTES_S, PANTALLA_CLAVE_S } from "../packages/net/src/index.ts";
import { tamanoEmision, bitrateEmision, debeSaltar, pideClave, fraseFin, EsperaClave, PENDIENTE_MAX } from "../apps/plaza/pantalla-red-logica.ts";

test("pantalla page: size, bitrate, backpressure, key frames, sentences and the viewer's wait for a key frame", () => {
  assert.deepEqual(tamanoEmision(1920, 1080), { ancho: 1280, alto: 720 });
  assert.deepEqual(tamanoEmision(640, 480), { ancho: 640, alto: 480 });
  assert.deepEqual(tamanoEmision(3001, 1999), { ancho: 1280, alto: 852 });
  assert.deepEqual(tamanoEmision(1, 1), { ancho: 16, alto: 16 });
  const { ancho, alto } = tamanoEmision(5000, 5000);
  assert.ok(ancho <= PANTALLA_LADO_MAX && alto <= PANTALLA_LADO_MAX && ancho % 2 === 0 && alto % 2 === 0);
  assert.ok(bitrateEmision(1280, 720) / 8 < PANTALLA_BYTES_S, "the target bitrate fits the server's guard");
  assert.ok(bitrateEmision(16, 16) >= 200_000);
  assert.equal(debeSaltar(PENDIENTE_MAX + 1, 0), true);
  assert.equal(debeSaltar(0, 3), true);
  assert.equal(debeSaltar(1000, 1), false);
  assert.equal(pideClave(0, 0, false), true);
  assert.equal(pideClave(10, 100, false), false);
  assert.equal(pideClave(10, PANTALLA_CLAVE_S * 1000, false), true);
  assert.equal(pideClave(10, 100, true), true);
  assert.match(fraseFin(PANTALLA_MOTIVO.ocupada, "Cine", true)!, /Cine.*someone else/);
  assert.equal(fraseFin(PANTALLA_MOTIVO.fin, "Cine", true), null);
  assert.equal(fraseFin(PANTALLA_MOTIVO.fueraDeAlcance, "Cine", false), null);
  assert.match(fraseFin(PANTALLA_MOTIVO.seFue, "", false)!, /stopped sharing/);
  const espera = new EsperaClave();
  assert.equal(espera.admitir(false), false);
  assert.equal(espera.admitir(true), true);
  assert.equal(espera.admitir(false), true);
  espera.fallo();
  assert.equal(espera.admitir(false), false);
  assert.equal(espera.admitir(true), true);
});

