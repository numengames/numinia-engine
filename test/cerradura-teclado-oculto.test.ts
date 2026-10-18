// The keypad overlay must start hidden. Its inline `display` beats the `[hidden]` attribute, so a
// keypad that only flipped `hidden` stayed on screen from page load and covered the whole world
// (seen live on v0.11: «Abrir» and «Cerrar» did nothing and the player was stuck).
import { test } from "node:test";
import assert from "node:assert/strict";

type Fake = { style: Record<string, string>; hidden: boolean; children: Fake[]; append: (...c: Fake[]) => void; setAttribute: () => void; addEventListener: () => void; [k: string]: unknown };
const fake = (): Fake => {
  const el: Fake = { style: {}, hidden: false, children: [], append: (...c) => { el.children.push(...c); }, setAttribute: () => {}, addEventListener: () => {} };
  return el;
};
const body = fake();
(globalThis as Record<string, unknown>).document = { createElement: () => fake(), body };
(globalThis as Record<string, unknown>).addEventListener = () => {};

const { montarCerradura } = await import("../apps/plaza/cerradura.ts");

test("the lock keypad is hidden until a lock is used, and Cerrar hides it again", () => {
  const lock = { id: "puerta", metodo: "codigo" as const, abierta: false, nombre: "Puerta", x: 0, y: 0, z: 0 };
  const pagina = montarCerradura({ cerradura: { cerraduras: () => [lock], alCambiar: () => {}, estado: { ultimoRechazo: "" }, abrir: () => {} } as never });
  const capa = body.children.at(-1)!;
  assert.equal(capa.style.display, "none", "on page load the keypad must not cover the world");
  assert.equal(pagina.abrirTeclado("puerta").ok, true);
  assert.equal(capa.style.display, "grid");
  pagina.cerrarTeclado();
  assert.equal(capa.style.display, "none");
});
