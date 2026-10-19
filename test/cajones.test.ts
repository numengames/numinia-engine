// ux2-dock: the builder is a row of icons and ONE drawer at a time (apps/plaza/cajones.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACCIONES_DOCK, alTocarlo, alternarCajon, CAJONES, esArrastre, filtrarBiblioteca, iconoDePieza, queCierraEscape, tamanoUniforme, TECLAS_TARJETA } from "../apps/plaza/cajones.ts";
import { icono } from "../apps/plaza/iconos.ts";
const existe = (ic: string) => icono(ic) !== "";

test("the dock: Añadir · Cable · Entorno · Precisión · Inspector · Ayuda, each with a house icon and a tooltip", () => {
  assert.deepEqual(CAJONES.map(([id]) => id), ["anadir", "cable", "entorno", "precision", "inspector", "ayuda"]);
  assert.deepEqual(CAJONES.map(([, ic]) => ic), ["plus", "lightning", "sun", "ruler", "eye", "question"]);
  for (const [id, ic, titulo, tip] of CAJONES) {
    assert.ok(existe(ic), `${id}: icon ${ic}`);
    assert.ok(tip.startsWith(`${titulo}:`), `${id}: the tooltip starts with the title`);
  }
  for (const [ic, tip] of Object.values(ACCIONES_DOCK)) { assert.ok(existe(ic), ic); assert.match(tip, /\(.+\)$/, "undo, redo and leave say their key"); }
});

test("one drawer at a time: its icon opens it, pressing it again closes it, another one replaces it", () => {
  assert.equal(alternarCajon("", "anadir"), "anadir");
  assert.equal(alternarCajon("anadir", "anadir"), "");
  assert.equal(alternarCajon("anadir", "entorno"), "entorno");
  assert.equal(alternarCajon("entorno", "cable"), "cable");
});

test("Escape undoes the most transient thing first: the piece in hand, grab mode, the drawer, the selection", () => {
  const s = { fantasma: true, agarre: true, cajon: "anadir" as const, seleccion: "o1" };
  assert.equal(queCierraEscape(s), "fantasma");
  assert.equal(queCierraEscape({ ...s, fantasma: false }), "agarre");
  assert.equal(queCierraEscape({ ...s, fantasma: false, agarre: false }), "cajon");
  assert.equal(queCierraEscape({ fantasma: false, agarre: false, cajon: "", seleccion: "o1" }), "seleccion");
  assert.equal(queCierraEscape({ fantasma: false, agarre: false, cajon: "", seleccion: "" }), "");
});

test("the library search: name or id, no accents, no case; empty = everything", () => {
  const lib = [{ id: "farolillo", nombre: "Farolillo" }, { id: "loma", nombre: "Loma de césped" }, { id: "bloque", nombre: "Bloque" }];
  assert.equal(filtrarBiblioteca(lib, "").length, 3);
  assert.deepEqual(filtrarBiblioteca(lib, "CESPED").map((m) => m.id), ["loma"]);
  assert.deepEqual(filtrarBiblioteca(lib, "  faro ").map((m) => m.id), ["farolillo"]);
  assert.deepEqual(filtrarBiblioteca(lib, "zzz"), []);
});

test("every piece of the house library has an icon that exists; unknown pieces are a package", () => {
  const lib = JSON.parse(readFileSync(new URL("../features/objetos/biblioteca.json", import.meta.url), "utf8")) as { modelos: { id: string }[] };
  for (const m of lib.modelos) assert.ok(existe(iconoDePieza(m.id)), m.id);
  assert.equal(iconoDePieza("lo-que-sea"), "package");
});

test("a press is a click up to 6 px of travel; further it is a drag into the world", () => {
  assert.equal(esArrastre(3, 4), false);
  assert.equal(esArrastre(6, 0), false);
  assert.equal(esArrastre(5, 5), true);
});

test("the card: the real keys of the handles, one size when uniform, and what touching it does", () => {
  assert.match(TECLAS_TARJETA, /G mover · R girar · 4 escala/);
  assert.equal(tamanoUniforme(2, 2, 2), "2");
  assert.equal(tamanoUniforme(1, 2, 1), "");
  assert.equal(alTocarlo({}, []), "");
  assert.equal(alTocarlo({ enlace: "https://numinia.com/x" }, []), "Abre numinia.com");
  assert.equal(alTocarlo({ enlace: "https://numinia.com/x" }, ["Botón → abre puerta"]), "Abre numinia.com · Dispara 1 cable");
  assert.equal(alTocarlo({}, ["a", "b"]), "Dispara 2 cables");
});

test("the builder has no key of its own for a drawer: B is the battery mode and N the minimap's", () => {
  const src = readFileSync(new URL("../apps/plaza/constructor.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /case "KeyB"/);
  assert.doesNotMatch(src, /case "KeyN"/);
});
