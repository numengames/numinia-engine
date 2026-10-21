// La Bolsa galáctica on the page, the pure part (apps/plaza/bolsa-rejilla.ts): objects → 42 slots + 4 equipment slots,
// stacking, order, a full bag, colours and type lines, the keyboard over the grid, drag targets, the «new item» flash.
// The server's rule (42 slots, refusals, pages in S4) is tested in inventario.test.ts and pesca-inventario.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOLSA_HUECOS, dar, equipar, nuevoInventario } from "../features/inventario/reglas.ts";
import { FORMAS_EQUIPO, ICONO_TIPO, accionDe, colorDe, cuentaTexto, destinoDeSoltar, etiquetaHueco, lineaTipo, lineaValor, mover, nombreConCuenta, novedades, plano } from "../apps/plaza/bolsa-rejilla.ts";
import type { Objeto } from "../apps/plaza/bolsa-rejilla.ts";
import { pathsIcono } from "../apps/plaza/iconos.ts";

const obj = (o: Partial<Objeto> & { id: string }): Objeto => ({ tipo: "reliquia", clase: "r", nombre: o.id, icono: "", color: "", valor: 0, n: 1, portado: false, ...o });
const carpa = obj({ id: "o1", tipo: "captura", clase: "carpa", nombre: "Carpa", icono: "fish", color: "plateada", valor: 1, n: 3 });

test("plano: the bag is always exactly 42 sockets (the server's number), occupied ones first in arrival order, empty ones after", () => {
  assert.equal(BOLSA_HUECOS, 42);
  const vacio = plano([]);
  assert.deepEqual([vacio.bolsa.length, vacio.equipo.length, vacio.ocupados, vacio.llena], [42, 4, 0, false]);
  assert.ok(vacio.bolsa.every((x) => x === null) && vacio.equipo.every((x) => x === null));
  const p = plano([carpa, obj({ id: "o2", tipo: "arma" }), obj({ id: "o3", tipo: "token", clase: "semilla", color: "verde", n: 2 })]);
  assert.deepEqual(p.bolsa.slice(0, 4).map((x) => x?.id ?? null), ["o1", "o2", "o3", null]);
  assert.deepEqual([p.ocupados, p.huecos, p.llena, cuentaTexto(p)], [3, 42, false, "3 / 42"]);
});

test("plano: a stack is one slot (the count rides on it); carried things sit in the 4 equipment slots (weapon first) and take no bag slot", () => {
  const llevadas = [obj({ id: "o5", tipo: "reliquia", portado: true }), obj({ id: "o6", tipo: "arma", portado: true }), obj({ id: "o7", tipo: "reliquia", portado: true }), obj({ id: "o8", tipo: "reliquia", portado: true })];
  const p = plano([carpa, ...llevadas, obj({ id: "o9", tipo: "reliquia" })]);
  assert.deepEqual(p.equipo.map((x) => x?.id), ["o6", "o5", "o7", "o8"], "weapon, then the three relics in order");
  assert.deepEqual(FORMAS_EQUIPO, ["arma", "reliquia", "reliquia", "reliquia"]);
  assert.deepEqual(p.bolsa.slice(0, 3).map((x) => x?.id ?? null), ["o1", "o9", null]);
  assert.equal(p.ocupados, 2, "carried things use no slot");
  assert.equal(p.bolsa.find((x) => x?.id === "o1")!.n, 3);
  // a thing put back returns to the place it had in the order
  const vuelta = plano([obj({ id: "o5", tipo: "reliquia" }), carpa]);
  assert.deepEqual(vuelta.bolsa.slice(0, 2).map((x) => x?.id), ["o5", "o1"]);
});

test("plano: a full bag has no empty socket and never draws a 43rd; the server's own inventory through the same rules fills exactly 42", () => {
  const inv = nuevoInventario();
  for (let i = 0; i < BOLSA_HUECOS + 5; i++) dar(inv, { tipo: "reliquia", clase: `r${i}`, nombre: `Reliquia ${i}` });
  assert.equal(inv.objetos.length, BOLSA_HUECOS, "the server refused the rest");
  for (const o of inv.objetos.slice(0, 2)) equipar(inv, o.id);
  const p = plano(inv.objetos as Objeto[]);
  assert.deepEqual([p.ocupados, p.llena, p.bolsa.length, p.bolsa.every((x) => x !== null || p.ocupados < 42)], [40, false, 42, true]);
  const llena = plano(Array.from({ length: 50 }, (_, i) => obj({ id: `o${i + 1}` })));
  assert.deepEqual([llena.bolsa.length, llena.ocupados, llena.llena, llena.bolsa.every((x) => x !== null)], [42, 42, true, true], "cut at the server's number");
  assert.equal(cuentaTexto(llena), "42 / 42");
  assert.equal(plano([], 12).bolsa.length, 12, "the server may say another number (lista.huecos)");
});

test("every icon the grid can ask for exists in the house table, and the type default is never empty", () => {
  for (const n of [...Object.values(ICONO_TIPO), "sword", "sparkle"]) assert.ok(pathsIcono(n).length > 0, `${n} is a house icon`);
});

test("colours, type lines, names and values: the rarity is never the colour alone", () => {
  assert.deepEqual([colorDe(carpa), colorDe({ tipo: "captura", color: "azul" }), colorDe({ tipo: "captura", color: "dorada" })], ["#c3ceda", "#5aa2ff", "#ffc247"]);
  assert.notEqual(colorDe({ tipo: "arma", color: "" }), colorDe({ tipo: "reliquia", color: "" }));
  assert.equal(colorDe({ tipo: "token", color: "roja" }), "#ff6b64");
  assert.deepEqual([lineaTipo(carpa), lineaTipo({ ...carpa, color: "azul" }), lineaTipo({ ...carpa, color: "dorada" })], ["pez · común", "pez · rara", "pez · legendaria"]);
  assert.equal(lineaTipo(obj({ id: "a", tipo: "arma" })), "arma");
  assert.equal(lineaTipo(obj({ id: "s", tipo: "token", clase: "semilla", color: "verde" })), "semilla · verde");
  assert.equal(nombreConCuenta(carpa), "Carpa × 3");
  assert.equal(nombreConCuenta({ ...carpa, n: 1 }), "Carpa × 1", "a fish always shows its count");
  assert.equal(nombreConCuenta(obj({ id: "x", nombre: "Hoja" })), "Hoja");
  assert.equal(lineaValor(carpa), "Valor 1 cada uno · 3 en total");
  assert.equal(lineaValor(obj({ id: "s", tipo: "token", clase: "semilla", valor: 2, n: 2 })), "4 puntos de Prestigio");
  assert.equal(lineaValor(obj({ id: "a", tipo: "arma", portado: true })), "Lo llevas contigo");
  assert.equal(etiquetaHueco(carpa, 0, "bolsa"), "Carpa × 3, pez · común");
  assert.equal(etiquetaHueco(null, 4, "bolsa"), "Hueco 5 de la Bolsa: vacío");
  assert.equal(etiquetaHueco(null, 0, "equipo"), "Arma: vacío");
  assert.equal(etiquetaHueco(null, 2, "equipo"), "Reliquia 2: vacío");
  assert.equal(etiquetaHueco(obj({ id: "a", nombre: "Hoja", tipo: "arma", portado: true }), 0, "equipo"), "Hoja, arma, contigo");
});

test("buttons and drag targets: only weapons and relics move, only between the bag and the equipment", () => {
  const arma = obj({ id: "a", tipo: "arma" }), llevada = obj({ id: "b", tipo: "reliquia", portado: true });
  assert.deepEqual([accionDe(arma), accionDe(llevada), accionDe(carpa)], ["Llevar", "Guardar", null]);
  assert.equal(destinoDeSoltar(arma, "equipo"), "equipar");
  assert.equal(destinoDeSoltar(llevada, "bolsa"), "desequipar");
  assert.equal(destinoDeSoltar(arma, "bolsa"), null, "already in the bag");
  assert.equal(destinoDeSoltar(llevada, "equipo"), null, "already carried");
  assert.equal(destinoDeSoltar(carpa, "equipo"), null, "a fish is never carried");
  assert.equal(destinoDeSoltar(arma, null), null, "dropped on nothing");
});

test("keyboard: arrows walk the 6-row grid (7 columns), Down from the equipment enters the bag, Up from the first row goes back; nothing wraps", () => {
  const H = BOLSA_HUECOS;
  assert.deepEqual(mover("bolsa", 0, "ArrowRight", 7), { zona: "bolsa", i: 1 });
  assert.deepEqual(mover("bolsa", 0, "ArrowLeft", 7), { zona: "bolsa", i: 0 });
  assert.deepEqual(mover("bolsa", 3, "ArrowDown", 7), { zona: "bolsa", i: 10 });
  assert.deepEqual(mover("bolsa", 41, "ArrowDown", 7), { zona: "bolsa", i: 41 }, "the last row stays");
  assert.deepEqual(mover("bolsa", 10, "ArrowUp", 7), { zona: "bolsa", i: 3 });
  assert.deepEqual(mover("bolsa", 5, "ArrowUp", 7), { zona: "equipo", i: 3 }, "from the first row up to the equipment (4 slots)");
  assert.deepEqual(mover("bolsa", 2, "ArrowUp", 7), { zona: "equipo", i: 2 });
  assert.deepEqual(mover("equipo", 2, "ArrowDown", 7), { zona: "bolsa", i: 2 });
  assert.deepEqual(mover("equipo", 3, "ArrowRight", 7), { zona: "equipo", i: 3 });
  assert.deepEqual(mover("equipo", 1, "ArrowUp", 7), { zona: "equipo", i: 1 });
  assert.deepEqual([mover("bolsa", 20, "Home", 7), mover("bolsa", 20, "End", 7)], [{ zona: "bolsa", i: 0 }, { zona: "bolsa", i: H - 1 }]);
  assert.deepEqual(mover("bolsa", 20, "ArrowDown", 6), { zona: "bolsa", i: 26 }, "a phone: 6 columns");
  assert.equal(mover("bolsa", 0, "a", 7), null, "other keys are not ours");
  // every slot of the grid is reachable from the first one with arrows alone
  const vistos = new Set<number>(); let i = 0;
  for (let k = 0; k < 100 && !vistos.has(i); k++) { vistos.add(i); const n = mover("bolsa", i, "ArrowRight", 7)!; i = n.i; }
  assert.equal(vistos.size, H);
});

test("novedades: only a new slot or a stack that grew flashes, once; reopening the panel flashes nothing", () => {
  const antes = new Map<string, number>();
  assert.deepEqual([...novedades(antes, [{ id: "o1", n: 1 }])], ["o1"]);
  assert.deepEqual([...novedades(antes, [{ id: "o1", n: 1 }])], [], "nothing changed");
  assert.deepEqual([...novedades(antes, [{ id: "o1", n: 2 }, { id: "o2", n: 1 }])].sort(), ["o1", "o2"]);
  assert.deepEqual([...novedades(antes, [{ id: "o2", n: 1 }])], [], "a drop flashes nothing");
});
