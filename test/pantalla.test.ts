// M18 (trozo 2): «Compartir pantalla», the decisions without a browser (apps/plaza/pantalla-logica.ts): which screen of the
// world gets your share (the nearest within 30 m), where sharing is possible at all, and what the page says.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pantallaMasCercana, sePuedeCompartir, fraseInicio, PANTALLA_CERCA_M } from "../apps/plaza/pantalla-logica.ts";

const pantallas = [
  { key: "lejos", x: 100, y: 1.2, z: 0 },
  { key: "media", x: 10, y: 1.2, z: 10 },
  { key: "cerca", x: 3, y: 1.2, z: -4 },
];

test("pantallaMasCercana: the nearest screen within 30 m, by horizontal distance", () => {
  assert.equal(PANTALLA_CERCA_M, 30);
  assert.equal(pantallaMasCercana({ x: 0, z: 0 }, pantallas)?.key, "cerca");
  assert.equal(pantallaMasCercana({ x: 12, y: 50, z: 12 }, pantallas)?.key, "media"); // height does not count
  assert.equal(pantallaMasCercana({ x: 90, z: 0 }, pantallas)?.key, "lejos");
});

test("pantallaMasCercana: none within reach → null; the limit is inclusive; ties keep the first", () => {
  assert.equal(pantallaMasCercana({ x: 50, z: 50 }, pantallas), null);
  assert.equal(pantallaMasCercana({ x: 0, z: 0 }, []), null);
  assert.equal(pantallaMasCercana({ x: 0, z: 0 }, [{ key: "justo", x: 30, y: 0, z: 0 }])?.key, "justo");
  assert.equal(pantallaMasCercana({ x: 0, z: 0 }, [{ key: "pasa", x: 30.01, y: 0, z: 0 }]), null);
  assert.equal(pantallaMasCercana({ x: 0, z: 0 }, [{ key: "a", x: 5, y: 0, z: 0 }, { key: "b", x: -5, y: 0, z: 0 }])?.key, "a");
  assert.equal(pantallaMasCercana({ x: 0, z: 0 }, pantallas, 2), null); // a smaller reach
});

test("sePuedeCompartir: getDisplayMedia must exist (desktop, iOS 27) and the page must be https or localhost", () => {
  const con = { mediaDevices: { getDisplayMedia() {} } };
  assert.equal(sePuedeCompartir(con, { protocol: "https:", hostname: "mundo.numinia.com" }), true);
  assert.equal(sePuedeCompartir(con, { protocol: "http:", hostname: "localhost" }), true);
  assert.equal(sePuedeCompartir(con, { protocol: "http:", hostname: "127.0.0.1" }), true);
  assert.equal(sePuedeCompartir(con, { protocol: "http:", hostname: "192.168.1.20" }), false); // the LAN without https
  assert.equal(sePuedeCompartir({ mediaDevices: {} }, { protocol: "https:", hostname: "x" }), false); // Android Chrome, Quest Browser
  assert.equal(sePuedeCompartir({}, { protocol: "https:", hostname: "x" }), false);
  assert.equal(sePuedeCompartir(undefined, { protocol: "https:", hostname: "x" }), false);
});

test("fraseInicio: says where your screen went, and that only you see it for now", () => {
  assert.equal(fraseInicio("Cine"), "Compartiendo tu pantalla en «Cine» (solo la ves tú por ahora).");
  assert.match(fraseInicio(null), /^No hay ninguna pantalla cerca: la ves en una ventana/);
});
