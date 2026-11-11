// «Watch full screen»: the decision without a browser (apps/plaza/pantalla-completa-logica.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pantallaParaVer, FRENTE_GRADOS } from "../apps/plaza/pantalla-completa-logica.ts";

const escenario = { key: "escenario", x: 0, y: 3, z: -10 };       // seat at the origin looks to -z (yaw 180)
const silla = { x: 0, z: 0, mira: 180 };

test("seated, a live screen in front within 30 m → offered", () => {
  assert.equal(pantallaParaVer(silla, [escenario])?.key, "escenario");
  assert.equal(pantallaParaVer({ ...silla, mira: 180 + FRENTE_GRADOS - 5 }, [escenario])?.key, "escenario"); // a little off-axis is fine
});

test("not seated, nothing live, behind, beside, too far, or in VR → not offered", () => {
  assert.equal(pantallaParaVer(null, [escenario]), null);                                  // standing
  assert.equal(pantallaParaVer(silla, []), null);                                          // the screen shows nothing
  assert.equal(pantallaParaVer({ ...silla, mira: 0 }, [escenario]), null);                 // screen behind the seat
  assert.equal(pantallaParaVer({ ...silla, mira: 270 }, [escenario]), null);               // screen to the side
  assert.equal(pantallaParaVer(silla, [{ ...escenario, z: -31 }]), null);                  // beyond 30 m
  assert.equal(pantallaParaVer(silla, [{ ...escenario, z: -30 }])?.key, "escenario");      // the limit is inclusive
  assert.equal(pantallaParaVer(silla, [escenario], { vr: true }), null);                   // immersive session: no DOM full screen
});

test("several screens: the nearest one in front wins; one behind is ignored", () => {
  const cerca = { key: "cerca", x: 1, y: 2, z: -4 }, detras = { key: "detras", x: 0, y: 2, z: 2 };
  assert.equal(pantallaParaVer(silla, [escenario, detras, cerca])?.key, "cerca");
});
