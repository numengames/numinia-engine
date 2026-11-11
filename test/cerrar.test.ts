// One close control everywhere (Pablo, 2026-11-11): X + «Close» (+ an Esc key cap), never «Close (J)» / «Close (Esc)»
// variants; and Escape with nothing on top leaves build mode (cajones.ts queCierraEscape → "salir").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { hayAlgoAbierto, rotuloCerrar } from "../apps/plaza/cerrar.ts";
import { queCierraEscape } from "../apps/plaza/cajones.ts";

const PLAZA = new URL("../apps/plaza/", import.meta.url);

test("no panel writes its own «Close (…)» label: they all go through cerrar.ts", () => {
  const malos: string[] = [];
  for (const f of readdirSync(PLAZA).filter((x) => x.endsWith(".ts"))) {
    readFileSync(new URL(f, PLAZA), "utf8").split("\n").forEach((l, i) => { if (/["`]Close \((?:Esc|[A-Z])\)["`]/.test(l)) malos.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(malos, []);
  assert.equal(rotuloCerrar(), "Close");
});

test("something open on screen owns Escape; inside the builder's own panel it does not count", () => {
  const visible = (tagName: string, dentro = false) => ({ tagName, dentro, checkVisibility: () => true, getClientRects: () => [1] });
  const doc = (xs: unknown[]) => ({ querySelectorAll: () => xs }) as unknown as Document;
  const panel = { contains: (x: { dentro: boolean }) => x.dentro } as unknown as Element;
  assert.equal(hayAlgoAbierto(panel, doc([])), false);
  assert.equal(hayAlgoAbierto(panel, doc([visible("BUTTON", true)])), false);
  assert.equal(hayAlgoAbierto(panel, doc([visible("BUTTON")])), true);
  assert.equal(hayAlgoAbierto(panel, doc([visible("DIALOG")])), true);
  assert.equal(hayAlgoAbierto(panel, doc([{ tagName: "BUTTON", checkVisibility: () => false }])), false);
});

test("with nothing left to undo, Escape leaves build mode", () => {
  assert.equal(queCierraEscape({ fantasma: false, agarre: false, cajon: "", seleccion: "" }), "salir");
});
