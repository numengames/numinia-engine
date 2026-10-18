// t_5cff4f06: the corner button that leaves the world for the city, with no browser (apps/plaza/ciudad-logica.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { urlCiudad } from "../apps/plaza/ciudad-logica.ts";

test("urlCiudad: an absolute http(s) ciudadUrl passes through unchanged", () => {
  assert.equal(urlCiudad({ ciudadUrl: "https://numinia.com" }), "https://numinia.com");
  assert.equal(urlCiudad({ ciudadUrl: "http://localhost:4000/mundo" }), "http://localhost:4000/mundo");
});

test("urlCiudad: no field, an empty one or a non-http(s) scheme → null (no button)", () => {
  assert.equal(urlCiudad({}), null);
  assert.equal(urlCiudad({ ciudadUrl: "" }), null);
  assert.equal(urlCiudad({ ciudadUrl: "   " }), null);
  assert.equal(urlCiudad({ ciudadUrl: 7 }), null);
  assert.equal(urlCiudad({ ciudadUrl: "javascript:alert(1)" }), null);
  assert.equal(urlCiudad({ ciudadUrl: "not a url" }), null);
});

test("urlCiudad: never throws on a strange input", () => {
  assert.equal(urlCiudad(null), null);
  assert.equal(urlCiudad(undefined), null);
  assert.equal(urlCiudad("https://numinia.com"), null); // a string, not the settings object
});
