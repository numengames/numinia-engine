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

// B5 + C: the screen waits for the ground and for every piece of the world within view
import { puedeOcultar, estadoCarga, sueloPendiente, piezasPendientes, textoPiezas, TOPE_CARGA_MS } from "../apps/plaza/carga.ts";
const base = { welcome: true, mundoRecibido: true, primerCuadro: true, sueloPendiente: false, piezasPendientes: 0, msDesdeWelcome: 500 };
test("B5: sin suelo ni piezas se oculta con el primer cuadro tras welcome, como antes", () => {
  const sp = sueloPendiente({ pideNaturaleza: false, pideBase: false, naturalezaLista: false, baseLista: false });
  assert.equal(sp, false);
  assert.equal(puedeOcultar({ ...base, sueloPendiente: sp, msDesdeWelcome: 10 }), true);
  assert.equal(puedeOcultar({ ...base, welcome: false, msDesdeWelcome: 0 }), false);
});
test("B5: base o naturaleza pendientes mantienen la pantalla", () => {
  assert.equal(sueloPendiente({ pideNaturaleza: false, pideBase: true, naturalezaLista: false, baseLista: false }), true);
  assert.equal(sueloPendiente({ pideNaturaleza: true, pideBase: false, naturalezaLista: false, baseLista: true }), true);
  assert.equal(sueloPendiente({ pideNaturaleza: true, pideBase: true, naturalezaLista: true, baseLista: false }), true);
  assert.equal(sueloPendiente({ pideNaturaleza: true, pideBase: true, naturalezaLista: true, baseLista: true }), false);
  assert.equal(puedeOcultar({ ...base, sueloPendiente: true }), false);
});
test("B5: suelo aplicado pero sin cuadro dibujado después, aún no; con cuadro, sí", () => {
  assert.equal(puedeOcultar({ ...base, primerCuadro: false }), false);
  assert.equal(puedeOcultar(base), true);
});
test("C: con una sola pieza del mundo a la vista sin lista (modelo, texturas o shaders) la pantalla sigue", () => {
  assert.equal(puedeOcultar({ ...base, piezasPendientes: 1 }), false);
  assert.equal(puedeOcultar({ ...base, piezasPendientes: 37, msDesdeWelcome: 20000 }), false, "20 s: el tope de antes (15 s) ya no la suelta");
  assert.equal(puedeOcultar({ ...base, piezasPendientes: 0 }), true);
  assert.equal(estadoCarga({ ...base, piezasPendientes: 1 }), "esperando");
  assert.equal(estadoCarga(base), "listo");
});
test("C: piezas listas pero suelo pendiente, o sin cuadro dibujado: tampoco (las tres cosas a la vez)", () => {
  assert.equal(puedeOcultar({ ...base, sueloPendiente: true, piezasPendientes: 0 }), false);
  assert.equal(puedeOcultar({ ...base, primerCuadro: false, piezasPendientes: 0 }), false);
  assert.equal(puedeOcultar({ ...base, welcome: false, piezasPendientes: 0 }), false, "sin welcome nunca");
});
test("C: el welcome llega antes que las cosas del mundo: sin el primer snapshot (tras toda la ráfaga) con 0 piezas contadas no se oculta", () => {
  assert.equal(puedeOcultar({ ...base, mundoRecibido: false, piezasPendientes: 0 }), false, "0 piezas porque aún no han llegado, no porque no haya");
  assert.equal(estadoCarga({ ...base, mundoRecibido: false }), "esperando");
  assert.equal(puedeOcultar({ ...base, mundoRecibido: true, piezasPendientes: 0 }), true);
  assert.equal(estadoCarga({ ...base, mundoRecibido: false, msDesdeWelcome: TOPE_CARGA_MS }), "tope", "…y si el mundo nunca llega, el tope");
});
test("C: el tope sube a 45 s, suelta con el mundo a medias y lo dice (estado «tope», no «listo»)", () => {
  assert.equal(TOPE_CARGA_MS, 45000);
  const a_medias = { ...base, piezasPendientes: 5, sueloPendiente: true, primerCuadro: false };
  assert.equal(puedeOcultar({ ...a_medias, msDesdeWelcome: TOPE_CARGA_MS }), true);
  assert.equal(estadoCarga({ ...a_medias, msDesdeWelcome: TOPE_CARGA_MS }), "tope");
  assert.equal(puedeOcultar({ ...a_medias, msDesdeWelcome: TOPE_CARGA_MS - 1 }), false);
  assert.equal(puedeOcultar({ ...a_medias, msDesdeWelcome: 100, topeMs: 50 }), true);
  assert.equal(puedeOcultar({ ...a_medias, welcome: false, msDesdeWelcome: 99999 }), false);
  assert.equal(estadoCarga({ ...base, msDesdeWelcome: TOPE_CARGA_MS + 1 }), "listo", "mundo entero pasado el tope: es «listo», no «tope»");
});
test("C: piezasPendientes y textoPiezas", () => {
  assert.equal(piezasPendientes(null), 0); assert.equal(piezasPendientes(undefined), 0);
  assert.equal(piezasPendientes({ listas: 3, total: 10 }), 7);
  assert.equal(piezasPendientes({ listas: 12, total: 10 }), 0, "nunca negativo");
  assert.equal(textoPiezas(null), ""); assert.equal(textoPiezas({ listas: 0, total: 0 }), "");
  assert.equal(textoPiezas({ listas: 120, total: 146 }), "120 de 146 piezas");
  assert.equal(textoPiezas({ listas: 1, total: 1 }), "1 de 1 pieza");
  assert.equal(textoPiezas({ listas: 9, total: 4 }), "4 de 4 piezas", "acotado");
});
