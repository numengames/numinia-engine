// M4: the character HUD — what it draws from what reaches the page, and that the frame is in the table and the markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerHud, claseDePaso } from "../apps/plaza/hud-personaje.ts";
import { MARCOS_PLAZA, validarMarcos, marcosVisibles, cajaDe } from "../packages/client/src/densidad.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("without a source nothing is invented: Estado, Carga and Aliento are «Próximamente» (null)", () => {
  assert.deepEqual(leerHud({}), { nombre: "Tú", estado: null, carga: null, aliento: null });
  assert.equal(leerHud({ nombre: " Siroco " }).nombre, "Siroco");
});
test("with a source: the ladder index, the load and the breath, clamped", () => {
  assert.equal(leerHud({ estado: { actual: () => undefined } }).estado, -1, "a source that says nothing = Estable");
  assert.equal(leerHud({ estado: { actual: () => "Colapsado" } }).estado, 2);
  assert.equal(leerHud({ estado: { actual: () => "raro" } }).estado, -1);
  assert.deepEqual(leerHud({ carga: { actual: () => ({ valor: 64, max: 100 }) } }).carga, { valor: 64, max: 100, pct: 64 });
  assert.equal(leerHud({ carga: { actual: () => ({ valor: 150, max: 100 }) } }).carga!.pct, 100);
  assert.equal(leerHud({ carga: { actual: () => ({ valor: 5, max: 0 }) } }).carga, null);
  assert.equal(leerHud({ aliento: { actual: () => 78.4 } }).aliento!.pct, 78);
  assert.equal(leerHud({ aliento: { actual: () => NaN } }).aliento, null);
});
test("the steps' colour: lit up to the current one, amber for the first two, red for the last two", () => {
  assert.equal(claseDePaso(0, -1), "");
  assert.equal(claseDePaso(0, 0), "w");
  assert.equal(claseDePaso(1, 0), "");
  assert.equal(claseDePaso(1, 2), "w");
  assert.equal(claseDePaso(2, 2), "r");
});
test("the frame is in the table (movable and hideable by Editar interfaz) and in the page", () => {
  assert.deepEqual(validarMarcos(MARCOS_PLAZA), []);
  const m = MARCOS_PLAZA.find((x) => x.id === "hud.personaje")!;
  assert.ok(m && m.selector === "#hud-personaje" && m.cristal);
  assert.equal(cajaDe(m, "normal")!.ancla, "arriba-izquierda");
  assert.ok(!marcosVisibles("minimo").includes("hud.personaje") && marcosVisibles("normal").includes("hud.personaje"));
  assert.ok(leer("apps/plaza/index.html").includes('id="hud-personaje"'));
  assert.ok(leer("apps/plaza/marcos.ts").includes("montarHudPersonaje"));
  assert.ok(!/numinia/i.test(leer("apps/plaza/hud-personaje.ts").replace(/__numinia/g, "").replace(/Numinia[^\n]*/g, "")), "no brand in the UI text");
});
