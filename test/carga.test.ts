// MVL3 step 1: the 2D "Cargando" screen (moon + running dots, apps/plaza/index.html) fades out once
// main.ts calls carga.ocultar() after the first frame. ocultarCarga takes a narrow DOM-like shape so this
// runs under node --test without jsdom (the repo has none).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ocultarCarga } from "../apps/plaza/carga.ts";

function elementoFalso() {
  const clases: string[] = [];
  const escuchas: Record<string, () => void> = {};
  return {
    el: {
      hidden: false,
      classList: { add: (c: string) => clases.push(c) },
      addEventListener: (tipo: string, cb: () => void) => { escuchas[tipo] = cb; },
    },
    clases, escuchas,
  };
}

test("sin elemento (página sin la pantalla, por ejemplo en pruebas): no revienta", () => {
  assert.doesNotThrow(() => ocultarCarga(null));
});

test("ya oculta: una segunda llamada no vuelve a tocar las clases", () => {
  const { el, clases } = elementoFalso();
  el.hidden = true;
  ocultarCarga(el);
  assert.equal(clases.length, 0);
});

test("funde (añade .ida) y se oculta de verdad cuando acaba la transición CSS", () => {
  const { el, clases, escuchas } = elementoFalso();
  ocultarCarga(el, 700, () => {}); // sin temporizador: solo probamos el camino de transitionend
  assert.deepEqual(clases, ["ida"]);
  assert.equal(el.hidden, false); // todavía fundiendo, no tapa el canvas de golpe
  escuchas.transitionend();
  assert.equal(el.hidden, true);
});

test("si transitionend nunca llega (reduced-motion, pestaña nunca visible), el aviso de respaldo la oculta igual", () => {
  const { el, clases } = elementoFalso();
  let avisoGuardado: (() => void) | null = null;
  ocultarCarga(el, 700, (fn) => { avisoGuardado = fn; });
  assert.deepEqual(clases, ["ida"]);
  assert.equal(el.hidden, false);
  avisoGuardado!();
  assert.equal(el.hidden, true);
});

test("si transitionend y el respaldo llegan los dos, el segundo no hace nada (idempotente)", () => {
  const { el, escuchas } = elementoFalso();
  let avisoGuardado: (() => void) | null = null;
  ocultarCarga(el, 700, (fn) => { avisoGuardado = fn; });
  escuchas.transitionend();
  assert.equal(el.hidden, true);
  assert.doesNotThrow(() => avisoGuardado!());
  assert.equal(el.hidden, true);
});
