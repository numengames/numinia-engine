// U26: the two decisions of apps/plaza/pulsaciones.ts (the DOM half is checked by eye in the captures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { debeVibrar, restoPulsado, PULSADO_MIN_MS, VIBRAR_MS } from "../apps/plaza/pulsaciones.ts";

test("U26: only a finger vibrates, only while the setting is not off, only once the page may vibrate", () => {
  assert.equal(debeVibrar({ tipo: "touch", ajuste: true }), true);
  assert.equal(debeVibrar({ tipo: "touch", ajuste: undefined }), true, "no setting declared (it was hidden) and vibrate() exists: still a tick");
  assert.equal(debeVibrar({ tipo: "touch", ajuste: false }), false, "the person turned it off");
  assert.equal(debeVibrar({ tipo: "mouse", ajuste: true }), false, "a mouse never vibrates");
  assert.equal(debeVibrar({ tipo: "pen", ajuste: true }), false);
  assert.equal(debeVibrar({ tipo: "touch", ajuste: true, activado: false }), false, "before the first tap the browser would block it");
  assert.equal(debeVibrar({ tipo: "touch", ajuste: true, activado: true }), true);
  assert.equal(VIBRAR_MS, 10);
});

test("U26: a quick tap keeps the pressed look for the minimum; a long press lets go at once", () => {
  assert.equal(restoPulsado(1000, 1030), PULSADO_MIN_MS - 30);
  assert.equal(restoPulsado(1000, 1000 + PULSADO_MIN_MS), 0);
  assert.equal(restoPulsado(1000, 1500), 0);
  assert.equal(restoPulsado(1000, 990), PULSADO_MIN_MS, "a clock that goes back never gives more than the minimum");
});
