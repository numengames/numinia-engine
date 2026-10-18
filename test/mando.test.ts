// N5: the gamepad's layout and state machine (packages/client/src/mando.ts) with fake readings, no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCIONES, ayudaMando, botonDe, BOTON, crearMando, DISTRIBUCION, etiquetaAccion, familia, filasMando, nombreBoton } from "../packages/client/src/mando.ts";
import type { Lectura } from "../packages/client/src/mando.ts";

const lectura = (botones: number[] = [], ejes: number[] = [0, 0, 0, 0]): Lectura => {
  const b = Array.from({ length: 17 }, () => false);
  for (const i of botones) b[i] = true;
  return { botones: b, ejes };
};
const teclas = (o: ReturnType<ReturnType<typeof crearMando>["leer"]>) => o.filter((x) => x.tipo === "tecla").map((x) => `${x.tipo === "tecla" && x.abajo ? "+" : "-"}${x.tipo === "tecla" ? x.tecla : ""}`);

test("the brand comes from the id string; unknown pads get plain names", () => {
  assert.equal(familia("Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)"), "xbox");
  assert.equal(familia("054c-0ce6-DualSense Wireless Controller"), "playstation");
  assert.equal(familia("Nintendo Switch Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"), "nintendo");
  assert.equal(familia("Logitech Wheel"), "generico");
  assert.equal(familia(undefined), "generico");
  assert.equal(nombreBoton("xbox", BOTON.abajo), "A");
  assert.equal(nombreBoton("playstation", BOTON.abajo), "✕");
  assert.equal(nombreBoton("nintendo", BOTON.abajo), "B", "the bottom button of a Switch pad is called B: position, not name");
  assert.equal(nombreBoton("xbox", 99), "Botón 99");
});

test("every action has a button, one button per action, and the keys exist", () => {
  const vistas = new Set<string>();
  for (const a of Object.values(DISTRIBUCION)) { assert.ok(!vistas.has(a), `${a} twice`); vistas.add(a); assert.ok(ACCIONES[a].tecla); }
  assert.deepEqual([...vistas].sort(), Object.keys(ACCIONES).sort());
  assert.equal(botonDe("saltar"), 0);
  assert.equal(etiquetaAccion("xbox", "usar"), "X");
  assert.equal(etiquetaAccion("playstation", "usar"), "□");
  const reservados = new Set<number>([BOTON.LB, BOTON.RB, BOTON.L3]); // zoom and sprint are not in the table
  for (const i of Object.keys(DISTRIBUCION)) assert.ok(!reservados.has(Number(i)));
  assert.ok(filasMando("xbox").some((f) => f.boton === "A" && f.que === "saltar"));
  assert.match(ayudaMando("xbox"), /^Mando: .*A saltar.*X hablar o coger.*Menú ajustes/);
});

test("world: a press is a key down and up on the edge, never repeated while held", () => {
  const m = crearMando();
  assert.deepEqual(m.leer(lectura([BOTON.abajo]), "mundo", 0), [], "a button already held when the pad appears is not a press");
  assert.deepEqual(teclas(m.leer(lectura(), "mundo", 16)), []);
  assert.deepEqual(teclas(m.leer(lectura([BOTON.abajo]), "mundo", 32)), ["+Space", "-Space"]);
  assert.deepEqual(teclas(m.leer(lectura([BOTON.abajo]), "mundo", 48)), [], "held: nothing more");
  m.leer(lectura(), "mundo", 64);
  assert.deepEqual(teclas(m.leer(lectura([BOTON.izquierda]), "mundo", 80)), ["+KeyE", "-KeyE"]);
  assert.deepEqual(teclas(m.leer(lectura([BOTON.menu, BOTON.cruzArriba]), "mundo", 96)), ["+KeyO", "-KeyO", "+KeyJ", "-KeyJ"]);
});

test("world: L3 latches the sprint, a second press or a still stick lets it go", () => {
  const m = crearMando();
  m.leer(lectura(), "mundo", 0);
  assert.deepEqual(teclas(m.leer(lectura([BOTON.L3], [0, -1, 0, 0]), "mundo", 16)), ["+ShiftLeft"]);
  assert.equal(m.corre, true);
  assert.deepEqual(teclas(m.leer(lectura([], [0, -1, 0, 0]), "mundo", 500)), [], "still running while the stick is pushed");
  assert.deepEqual(teclas(m.leer(lectura(), "mundo", 600)), [], "the stick has just been let go: wait a moment");
  assert.deepEqual(teclas(m.leer(lectura(), "mundo", 800)), ["-ShiftLeft"]);
  assert.equal(m.corre, false);
  m.leer(lectura([BOTON.L3], [0, -1, 0, 0]), "mundo", 900);
  assert.deepEqual(teclas(m.leer(lectura([], [0, -1, 0, 0]), "mundo", 916)), []);
  assert.deepEqual(teclas(m.leer(lectura([BOTON.L3], [0, -1, 0, 0]), "mundo", 932)), ["-ShiftLeft"], "a second press stops it");
});

test("a panel opening or a box taking the keys releases the sprint and stops world actions", () => {
  const m = crearMando();
  m.leer(lectura(), "mundo", 0);
  m.leer(lectura([BOTON.L3], [0, -1, 0, 0]), "mundo", 16);
  assert.deepEqual(teclas(m.leer(lectura([], [0, -1, 0, 0]), "menu", 32)), ["-ShiftLeft"]);
  assert.deepEqual(m.leer(lectura([BOTON.abajo]), "texto", 48), [], "typing: A does not jump");
  assert.deepEqual(teclas(m.leer(lectura([BOTON.derecha]), "texto", 64)), ["+Escape", "-Escape"], "B gets out of the box");
});

test("menu: A presses, B and Menu close, the d-pad and the stick move, the stick repeats while held", () => {
  const m = crearMando();
  m.leer(lectura(), "menu", 0);
  assert.deepEqual(m.leer(lectura([BOTON.abajo]), "menu", 16), [{ tipo: "pulsar" }]);
  m.leer(lectura(), "menu", 32);
  assert.deepEqual(m.leer(lectura([BOTON.derecha]), "menu", 48), [{ tipo: "cerrar" }]);
  m.leer(lectura(), "menu", 64);
  assert.deepEqual(m.leer(lectura([BOTON.menu]), "menu", 80), [{ tipo: "cerrar" }]);
  m.leer(lectura(), "menu", 96);
  assert.deepEqual(m.leer(lectura([BOTON.cruzAbajo]), "menu", 112), [{ tipo: "vertical", paso: 1 }]);
  m.leer(lectura(), "menu", 128);
  assert.deepEqual(m.leer(lectura([BOTON.cruzIzquierda]), "menu", 144), [{ tipo: "lateral", paso: -1 }]);
  m.leer(lectura(), "menu", 160);
  const abajo = [0, 0.9, 0, 0];
  assert.deepEqual(m.leer(lectura([], abajo), "menu", 200), [{ tipo: "vertical", paso: 1 }], "first push moves at once");
  assert.deepEqual(m.leer(lectura([], abajo), "menu", 300), [], "then waits");
  assert.deepEqual(m.leer(lectura([], abajo), "menu", 620), [{ tipo: "vertical", paso: 1 }], "then repeats");
  assert.deepEqual(m.leer(lectura([], abajo), "menu", 680), [], "not every frame");
  assert.deepEqual(m.leer(lectura([], abajo), "menu", 760), [{ tipo: "vertical", paso: 1 }]);
  m.leer(lectura(), "menu", 780);
  assert.deepEqual(m.leer(lectura([], [0.9, 0, 0, 0]), "menu", 800), [{ tipo: "lateral", paso: 1 }]);
});

test("olvidar releases the sprint and ignores what is held on return", () => {
  const m = crearMando();
  m.leer(lectura(), "mundo", 0);
  m.leer(lectura([BOTON.L3], [0, -1, 0, 0]), "mundo", 16);
  assert.deepEqual(teclas(m.olvidar()), ["-ShiftLeft"]);
  assert.deepEqual(m.leer(lectura([BOTON.abajo]), "mundo", 1000), [], "held on return: not a press");
});

test("tocado: a press or a stick well off centre; drift does not count", () => {
  const m = crearMando();
  assert.equal(m.tocado(lectura([BOTON.abajo])), true);
  assert.equal(m.tocado(lectura([], [0.8, 0, 0, 0])), true);
  assert.equal(m.tocado(lectura([], [0.08, -0.12, 0.1, 0])), false);
});
