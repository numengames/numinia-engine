// U2: the layers of capas.ts — who owns Escape / back / B. (The DOM side — the keyboard listener, the menu — is in tools/e2e-piernas/menu.mjs.)
import test from "node:test";
import assert from "node:assert/strict";
import { RANGO, registrar, arriba, abiertas, cerrarArriba, escribeTexto } from "../apps/plaza/capas.ts";

function capa(id: string, rango: number) { const c = { id, rango, esta: false, abierta: () => c.esta, cerrar: () => { c.esta = false; } }; registrar(c); return c; }

test("the layer on top is the one of highest rank; equal ranks close last-opened first", () => {
  const menu = capa("t-menu", RANGO.menu), modo = capa("t-modo", RANGO.modo), panel = capa("t-panel", RANGO.panel), panel2 = capa("t-panel2", RANGO.panel), chat = capa("t-chat", RANGO.escribir);
  assert.equal(arriba(), null);
  menu.esta = true; assert.equal(arriba()?.id, "t-menu");
  modo.esta = true; assert.equal(arriba()?.id, "t-modo", "a mode sits above the menu");
  panel.esta = true; assert.equal(arriba()?.id, "t-panel");
  panel2.esta = true; assert.equal(arriba()?.id, "t-panel2", "same rank: the last opened first");
  chat.esta = true; assert.equal(arriba()?.id, "t-chat", "typing is above the panels");
  assert.deepEqual(abiertas(), ["t-chat", "t-panel2", "t-panel", "t-modo", "t-menu"]);
  const cierres: string[] = [];
  while (arriba()) { cierres.push(arriba()!.id); cerrarArriba(); }
  assert.deepEqual(cierres, ["t-chat", "t-panel2", "t-panel", "t-modo", "t-menu"]);
  assert.equal(cerrarArriba(), false, "no layer open: the router opens the menu instead");
});

test("a layer id is registered once", () => {
  capa("t-unica", RANGO.panel);
  assert.throws(() => registrar({ id: "t-unica", rango: 1, abierta: () => false, cerrar() {} }), /ya está registrada/);
});

test("only real text boxes count as typing (a range or a select inside a panel does not trap Escape)", () => {
  const caja = (tagName: string, type = "") => ({ tagName, type, isContentEditable: false }) as unknown as EventTarget;
  assert.equal(escribeTexto(caja("INPUT", "text")), true);
  assert.equal(escribeTexto(caja("INPUT", "number")), true);
  assert.equal(escribeTexto(caja("TEXTAREA")), true);
  assert.equal(escribeTexto(caja("INPUT", "range")), false);
  assert.equal(escribeTexto(caja("INPUT", "checkbox")), false);
  assert.equal(escribeTexto(caja("SELECT")), false);
  assert.equal(escribeTexto(null), false);
});
