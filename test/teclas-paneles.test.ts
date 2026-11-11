// keymap v1 (#353) left three panels on their old letters: the sheet opened with I, the bag with R and People with L, while the
// table said C, I and Tab (measured in a browser, 2026-11-11). A panel made with crearDialogo listens to `tecla` only when it
// has no `accion`; with one, the key in effect (Yours or Default) wins. So: every panel names its action, and the labels the page
// ships before any script runs say the Default of that action.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { crearTeclas, nombreTecla } from "../apps/plaza/teclas.ts";

const PLAZA = new URL("../apps/plaza/", import.meta.url);
const fuentes = readdirSync(PLAZA).filter((f) => f.endsWith(".ts")).map((f) => ({ f, texto: readFileSync(new URL(f, PLAZA), "utf8") }));

test("every panel made with crearDialogo opens with an action of the keymap, never a fixed letter", () => {
  const t = crearTeclas(null);
  const llamadas = fuentes.flatMap(({ f, texto }) => [...texto.matchAll(/crearDialogo\(\{([^\n]*)/g)].map((m) => ({ f, linea: m[1] })));
  assert.ok(llamadas.length >= 6, `found ${llamadas.length} panels`);
  for (const { f, linea } of llamadas) {
    const accion = /accion: "([a-zA-Z]+)"/.exec(linea)?.[1];
    assert.ok(accion, `${f}: crearDialogo without accion: ${linea.slice(0, 80)}`);
    assert.ok(t.accion(accion!), `${f}: «${accion}» is not an action of teclas.ts`);
    const tecla = /tecla: "([A-Za-z0-9]+)"/.exec(linea)?.[1];
    if (tecla) assert.equal(tecla, t.principal(accion!), `${f}: its fallback key ${tecla} is not the Default of «${accion}»`);
  }
});

test("the labels index.html shows before any script runs name the Default keys of the bag and the sheet", () => {
  const html = readFileSync(new URL("index.html", PLAZA), "utf8"), t = crearTeclas(null);
  const bolsa = nombreTecla(t.principal("bolsa")), ficha = nombreTecla(t.principal("ficha"));
  assert.match(html, new RegExp(`data-en="Bag \\(${bolsa}\\)" data-es="Bolsa \\(${bolsa}\\)"`));
  assert.match(html, new RegExp(`data-en-title="You \\(${ficha}\\)" data-es-title="Tú \\(${ficha}\\)"`));
});

test("no page text still names a key keymap v1 moved: «(R)» for the bag, «(C)» to build, «(I)» for the sheet", () => {
  for (const { f, texto } of fuentes) {
    for (const viejo of ["Bolsa (R)", "Reserva (R)", "construir (C)", "Tú (I)", "You (I)"]) assert.ok(!texto.includes(viejo), `${f} still says «${viejo}»`);
  }
});
