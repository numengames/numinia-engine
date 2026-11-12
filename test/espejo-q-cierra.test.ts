// E opens the card of a mirrored thing (project, board, card: any type, no per-zone code), Q closes it, and that Q never reaches the
// microphone toggle (voz.ts listens on the window, bubble phase).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cierraConQ, cerrarConQ } from "../apps/plaza/espejo.ts";

type Ev = { code: string; repeat?: boolean; ctrlKey?: boolean; parado: boolean; evitado: boolean; preventDefault(): void; stopImmediatePropagation(): void };
const ev = (code: string, extra: Partial<Ev> = {}): Ev => ({ code, parado: false, evitado: false, preventDefault() { this.evitado = true; }, stopImmediatePropagation() { this.parado = true; }, ...extra });

test("cierraConQ: only a plain Q, and only while the card is open", () => {
  assert.equal(cierraConQ({ code: "KeyQ" }, true), true);
  assert.equal(cierraConQ({ code: "KeyQ" }, false), false);
  assert.equal(cierraConQ({ code: "KeyE" }, true), false);
  assert.equal(cierraConQ({ code: "KeyQ", ctrlKey: true }, true), false);
});

test("Q closes the open card and is swallowed (the microphone never sees it); closed, Q goes on", () => {
  let oyente: ((e: unknown) => void) | undefined, captura: unknown;
  const doc = { addEventListener: (t: string, f: (e: unknown) => void, c?: unknown) => { if (t === "keydown") { oyente = f; captura = c; } } } as unknown as Document;
  let abierta = true, cierres = 0;
  cerrarConQ(doc, () => abierta, () => { cierres++; abierta = false; }, () => false);
  assert.equal(captura, true, "capture phase: runs before the window's bubble listeners");
  const q1 = ev("KeyQ"); oyente!(q1);
  assert.equal(cierres, 1); assert.equal(q1.parado, true, "swallowed: voz.ts does not toggle the microphone"); assert.equal(q1.evitado, true);
  const q2 = ev("KeyQ"); oyente!(q2);
  assert.equal(cierres, 1); assert.equal(q2.parado, false, "card closed: Q is untouched");
  abierta = true;
  const q3 = ev("KeyQ", { repeat: true }); oyente!(q3);
  assert.equal(cierres, 1, "auto-repeat does not close twice"); assert.equal(q3.parado, true);
});

test("typing in a text box: Q is a letter", () => {
  let oyente: ((e: unknown) => void) | undefined;
  const doc = { addEventListener: (_t: string, f: (e: unknown) => void) => { oyente = f; } } as unknown as Document;
  let cierres = 0;
  cerrarConQ(doc, () => true, () => { cierres++; }, () => true);
  const q = ev("KeyQ"); oyente!(q);
  assert.equal(cierres, 0); assert.equal(q.parado, false);
});
