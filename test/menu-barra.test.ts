// ux2-barra: the top bar's drop-down menus (apps/plaza/menu-logica.ts, pure): keys move between the shown entries and
// wrap, a menu with nothing to show hides its button, the camera button's state, the help line as rows of keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { botonVisible, entradasVisibles, estadoCamara, filasDeAyuda, siguienteEntrada } from "../apps/plaza/menu-logica.ts";

test("arrows walk the shown entries only, and wrap; Home/End jump; other keys are not the menu's", () => {
  const vis = entradasVisibles([false, true, false, false]); // entry 1 hidden (e.g. «Volver a la ciudad» in a world without a city)
  assert.deepEqual(vis, [0, 2, 3]);
  assert.equal(siguienteEntrada(vis, -1, "ArrowDown"), 0, "nothing focused yet: the first");
  assert.equal(siguienteEntrada(vis, 0, "ArrowDown"), 2, "skips the hidden one");
  assert.equal(siguienteEntrada(vis, 3, "ArrowDown"), 0, "wraps to the top");
  assert.equal(siguienteEntrada(vis, 0, "ArrowUp"), 3, "wraps to the bottom");
  assert.equal(siguienteEntrada(vis, -1, "ArrowUp"), 3);
  assert.equal(siguienteEntrada(vis, 2, "Home"), 0);
  assert.equal(siguienteEntrada(vis, 0, "End"), 3);
  assert.equal(siguienteEntrada(vis, 0, "Enter"), null, "Enter clicks the entry itself (the browser does)");
  assert.equal(siguienteEntrada([], 0, "ArrowDown"), null, "an empty menu moves nothing");
});

test("a menu with every entry hidden hides its button (no dead button in the bar)", () => {
  assert.equal(botonVisible([true, true, true]), false, "XR: foto, grabar and compartir all hidden → no «Cámara»");
  assert.equal(botonVisible([true, false, true]), true);
  assert.equal(botonVisible([]), false);
});

test("the camera button says what runs behind it: recording first, then sharing", () => {
  assert.equal(estadoCamara({ grabando: false, compartiendo: false }), null);
  assert.equal(estadoCamara({ grabando: true, compartiendo: true }), "grabando");
  assert.equal(estadoCamara({ grabando: false, compartiendo: true }), "compartiendo");
});

test("«Teclas y ayuda» reads the help line into rows; notes without a key stay; repeats go", () => {
  const filas = filasDeAyuda("WASD: andar · Mayús: correr ·  · P: cámara (foto, grabar, compartir pantalla) · Compartir pantalla: solo en ordenador · solo una nota · WASD: andar");
  assert.deepEqual(filas, [
    { tecla: "WASD", que: "andar" }, { tecla: "Mayús", que: "correr" }, { tecla: "P", que: "cámara (foto, grabar, compartir pantalla)" },
    { tecla: "Compartir pantalla", que: "solo en ordenador" }, { tecla: "", que: "solo una nota" },
  ]);
  assert.deepEqual(filasDeAyuda(""), []);
});

test("the page's help line no longer gives P to two things, and names the camera, the bag and the menu", () => {
  const html = readFileSync(new URL("../apps/plaza/index.html", import.meta.url), "utf8");
  const ayuda = /<div id="help">([^<]*)<\/div>/.exec(html)?.[1] ?? "";
  const filas = filasDeAyuda(ayuda);
  assert.equal(filas.filter((f) => f.tecla === "P").length, 1, "one P");
  assert.ok(filas.some((f) => f.tecla === "P" && /cámara/.test(f.que)));
  assert.ok(filas.some((f) => f.tecla === "R" && /bolsa/.test(f.que)));
  assert.ok(filas.some((f) => f.tecla === "K" && /grabar/.test(f.que)));
  const pantalla = readFileSync(new URL("../apps/plaza/pantalla.ts", import.meta.url), "utf8");
  assert.ok(!/"KeyP"/.test(pantalla), "compartir pantalla has no key of its own (P opens «Cámara»)");
  const foto = readFileSync(new URL("../apps/plaza/foto.ts", import.meta.url), "utf8");
  assert.ok(!/if \(!activo\) \{\s*if \(e\.code === "KeyP"/.test(foto), "photo mode does not open on P by itself");
});
