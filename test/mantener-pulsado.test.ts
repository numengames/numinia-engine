// J4 «mantener pulsado»: a thing whose card sets `hold` (seconds) needs E / the mobile button / the VR trigger held
// that long before its intent fires; the pure math (apps/plaza/interactuar.ts fraccionMantenida) and that the three
// server features (puertas, botones, cogibles) declare it, and both pages (ClientSession) see the same value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fraccionMantenida } from "../apps/plaza/interactuar.ts";
import { puertas, MANTENER_S as MANTENER_PUERTA } from "../features/puertas/feature.ts";
import { botones, MANTENER_S as MANTENER_BOTON } from "../features/botones/feature.ts";
import { cogibles, MANTENER_S as MANTENER_COGIBLE } from "../features/cogibles/feature.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import chatServer from "../features/chat/server.ts";
import { crearPuertas } from "../features/puertas/server.ts";
import { crearCliente as clientePuertas } from "../features/puertas/client.ts";
import { crearBotones } from "../features/botones/server.ts";
import { crearCliente as clienteBotones } from "../features/botones/client.ts";
import { crearCogibles } from "../features/cogibles/server.ts";
import { crearCliente as clienteCogibles } from "../features/cogibles/client.ts";

test("J4 mantener-pulsado: fraccionMantenida is 0..1, instant (no hold) and clamped", () => {
  assert.equal(fraccionMantenida(0, 1000, undefined), 1); // no hold: always "done"
  assert.equal(fraccionMantenida(0, 1000, 0), 1);
  assert.equal(fraccionMantenida(0, 0, 2), 0); // just started
  assert.equal(fraccionMantenida(0, 1000, 2), 0.5); // half of 2 s
  assert.equal(fraccionMantenida(0, 5000, 2), 1); // never above 1
  assert.equal(fraccionMantenida(1000, 500, 2), 0); // never below 0 (a clock going backwards)
});

test("J4: puertas, botones and cogibles declare a hold duration on their card.interact", () => {
  assert.equal(puertas.state?.card?.interact?.hold, MANTENER_PUERTA);
  assert.equal(botones.state?.card?.interact?.hold, MANTENER_BOTON);
  assert.equal(cogibles.state?.card?.interact?.hold, MANTENER_COGIBLE);
  assert.ok(MANTENER_PUERTA > 0 && MANTENER_BOTON > 0 && MANTENER_COGIBLE > 0);
});

test("J4: reachable() carries `hold` to every page the same way (the other tab sees it too)", () => {
  const sign = signer("una-clave-de-prueba-larga");
  const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
  const inst = new Instance({
    seed: 1, capacity: 8, k: 50, snapshotEvery: 2,
    features: [chatServer, crearPuertas({ puertas: [{ id: "norte", nombre: "Puerta norte", x: 6, z: 0 }] }), crearBotones({ botones: [{ id: "rojo", nombre: "Botón rojo", x: 0, z: 0 }] }), crearCogibles({ cosas: [{ id: "caja", nombre: "Caja", x: 0, z: 0 }] })],
    log: () => {}, identitySign: sign,
  });
  const abrir = (i: number) => {
    const t = inst.join(i), p = clientePuertas(), b = clienteBotones(), c = clienteCogibles();
    return new ClientSession(t, { identity: keeper(), features: [...p.parts, ...b.parts, ...c.parts], view: { label() {}, bounce() {}, place() {}, lleva() {} } });
  };
  const s1 = abrir(0), s2 = abrir(1);
  for (let i = 0; i < 2; i++) { s1.t.flush(); s2.t.flush(); inst.tick(); s1.t.flush(); s2.t.flush(); }
  for (const s of [s1, s2]) {
    const porPuerta = s.features.reachable(6, 0).find((r) => r.feature === "puertas");
    const porBoton = s.features.reachable(0, 0).find((r) => r.feature === "botones");
    const porCaja = s.features.reachable(0, 0).find((r) => r.feature === "cogibles");
    assert.equal(porPuerta?.hold, MANTENER_PUERTA);
    assert.equal(porBoton?.hold, MANTENER_BOTON);
    assert.equal(porCaja?.hold, MANTENER_COGIBLE);
  }
});
