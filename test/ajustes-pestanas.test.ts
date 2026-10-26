// MIS-239: the settings window is one card with tabs; on a phone the tabs become folded sections (apps/plaza/ajustes-pestanas.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANCHO_ACORDEON, categoriaInicial, categoriaTrasPulsar, categoriaVisible, modoAjustes, pestanaSiguiente } from "../apps/plaza/ajustes-pestanas.ts";

test("tabs on a wide screen, folded sections at 700 px and under or on a phone/tablet profile", () => {
  assert.equal(modoAjustes(1280, "escritorio"), "pestanas");
  assert.equal(modoAjustes(ANCHO_ACORDEON + 1, ""), "pestanas");
  assert.equal(modoAjustes(ANCHO_ACORDEON, ""), "acordeon");
  assert.equal(modoAjustes(360, "movil-vertical"), "acordeon");
  assert.equal(modoAjustes(1024, "movil-horizontal"), "acordeon", "a tablet profile folds even when wide");
  assert.equal(ANCHO_ACORDEON, 700, "the same number as the @media in tema.css");
  assert.match(readFileSync(new URL("../apps/plaza/tema.css", import.meta.url), "utf8"), /@media \(max-width: 700px\)/);
});

test("changing tab: a tab press always opens its category; a folded heading pressed twice folds it, another replaces it", () => {
  assert.equal(categoriaTrasPulsar("pestanas", "graficos", "sonido"), "sonido");
  assert.equal(categoriaTrasPulsar("pestanas", "sonido", "sonido"), "sonido", "a tab never leaves the card empty");
  assert.equal(categoriaTrasPulsar("acordeon", "", "sonido"), "sonido");
  assert.equal(categoriaTrasPulsar("acordeon", "sonido", "sonido"), "");
  assert.equal(categoriaTrasPulsar("acordeon", "sonido", "graficos"), "graficos", "one section open at a time");
});

test("the category shown on opening: tabs always have one (the first with settings), folded sections start folded", () => {
  const hay = ["juego", "graficos", "sonido"];
  assert.equal(categoriaInicial("pestanas", hay, ""), "juego");
  assert.equal(categoriaInicial("pestanas", hay, "sonido"), "sonido");
  assert.equal(categoriaInicial("pestanas", hay, "cuenta"), "juego", "a category that lost its settings falls back");
  assert.equal(categoriaInicial("acordeon", hay, ""), "");
  assert.equal(categoriaInicial("acordeon", hay, "sonido"), "sonido", "turning a tablet keeps what was open");
  assert.equal(categoriaInicial("acordeon", hay, "cuenta"), "");
  assert.equal(categoriaInicial("pestanas", [], ""), "");
});

test("arrow keys move between tabs (wrapping), Home/End jump, other keys are not ours", () => {
  const ids = ["juego", "interfaz", "graficos"];
  assert.equal(pestanaSiguiente(ids, "juego", "ArrowDown"), "interfaz");
  assert.equal(pestanaSiguiente(ids, "graficos", "ArrowDown"), "juego");
  assert.equal(pestanaSiguiente(ids, "juego", "ArrowUp"), "graficos");
  assert.equal(pestanaSiguiente(ids, "interfaz", "ArrowRight"), "graficos");
  assert.equal(pestanaSiguiente(ids, "interfaz", "ArrowLeft"), "juego");
  assert.equal(pestanaSiguiente(ids, "graficos", "Home"), "juego");
  assert.equal(pestanaSiguiente(ids, "juego", "End"), "graficos");
  assert.equal(pestanaSiguiente(ids, "juego", "Enter"), null);
  assert.equal(pestanaSiguiente([], "juego", "ArrowDown"), null);
});

test("a search shows every category with a match; otherwise only the open one", () => {
  assert.equal(categoriaVisible("sonido", "graficos", false), false);
  assert.equal(categoriaVisible("graficos", "graficos", false), true);
  assert.equal(categoriaVisible("sonido", "graficos", true), true);
  assert.equal(categoriaVisible("sonido", "", false), false, "a fully folded accordion shows no settings");
});

test("no setting is lost: every registry group lands in one of the card's categories", async () => {
  const fuente = readFileSync(new URL("../apps/plaza/menu-ajustes-ui.ts", import.meta.url), "utf8");
  const ids = [...fuente.matchAll(/\{ id: "(\w+)", nombre: "[^"]+", icono: "[\w-]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["juego", "interfaz", "controles", "graficos", "sonido", "accesibilidad", "cuenta"]);
  const { AJUSTES_MOTOR } = await import("../packages/client/src/ajustes.ts");
  const mapa = fuente.match(/categoriaDe = \(grupo: string\): string => \((\{[^}]+\})/)![1];
  const grupos = new Set((AJUSTES_MOTOR as { grupo: string }[]).map((s) => s.grupo));
  for (const g of grupos) assert.ok(new RegExp(`\\b${g}: "`).test(mapa), `group ${g} has its category (else it falls under «Juego», still reachable)`);
  for (const c of new Set([...mapa.matchAll(/: "(\w+)"/g)].map((m) => m[1]))) assert.ok(ids.includes(c), `category ${c} exists`);
});
