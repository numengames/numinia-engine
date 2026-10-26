// T1: actions in the session log — what the page sends (apps/plaza/acciones-informe.ts): fixed ids, no free text, no spam.
import test from "node:test";
import assert from "node:assert/strict";
import { crearAcciones, expresionDeDados, MIN_ENTRE_MS, ESPERA_AJUSTE_MS } from "../apps/plaza/acciones-informe.ts";
import { ACCIONES } from "../packages/server/src/sesiones.ts";

function banco() {
  let t = 1_000; const enviados: Record<string, unknown>[] = []; const tareas: { fn: () => void; en: number; id: number }[] = []; let ids = 0;
  const a = crearAcciones({ ahora: () => t, esperar: (fn, ms) => { const id = ++ids; tareas.push({ fn, en: t + ms, id }); return id; }, cancelar: (id) => { const i = tareas.findIndex((x) => x.id === id); if (i >= 0) tareas.splice(i, 1); } });
  a.conectar((r) => { enviados.push(r); });
  return { a, enviados, avanzar: (ms: number) => { t += ms; for (const x of tareas.filter((y) => y.en <= t)) { tareas.splice(tareas.indexOf(x), 1); x.fn(); } } };
}

test("dice expressions: a real one is kept, free text becomes «otra»", () => {
  for (const e of ["2d6", "1D20", "d100", "1d20+3", "3d6-1"]) assert.equal(expresionDeDados(e), e.toLowerCase());
  for (const e of ["hola Ana", "", undefined, "2d6; drop", "d6".repeat(20)]) assert.equal(expresionDeDados(e), "otra");
});

test("each action goes out as {k:'accion', que, …} with only the allowed keys; the same one twice in a blink is one", () => {
  const { a, enviados, avanzar } = banco();
  assert.equal(a.registrar("dados", { detalle: "2d6", activo: true }), true);
  assert.equal(a.registrar("dados", { detalle: "2d6" }), false, "inside MIN_ENTRE_MS");
  assert.equal(a.registrar("foto"), true, "another action is not held back");
  avanzar(MIN_ENTRE_MS);
  assert.equal(a.registrar("dados", { detalle: "1d20" }), true);
  assert.equal(a.registrar("salto-manos", { detalle: "x".repeat(200), valor: NaN, nombre: "Ana" } as never), true);
  assert.deepEqual(enviados, [
    { k: "accion", que: "dados", detalle: "2d6", activo: true },
    { k: "accion", que: "foto" },
    { k: "accion", que: "dados", detalle: "1d20" },
    { k: "accion", que: "salto-manos", detalle: "x".repeat(32) },
  ]);
});

test("a setting that is dragged reports once, with the value it rests at", () => {
  const { a, enviados, avanzar } = banco();
  for (const v of [110, 120, 140, 150]) { a.ajuste("velocidad-vr", { valor: v }); avanzar(100); }
  assert.deepEqual(enviados, []);
  avanzar(ESPERA_AJUSTE_MS);
  assert.deepEqual(enviados, [{ k: "accion", que: "velocidad-vr", valor: 150 }]);
});

test("without a sink, or with a sink that throws, the game goes on", () => {
  const sola = crearAcciones();
  assert.equal(sola.registrar("foto"), false);
  const rota = crearAcciones(); rota.conectar(() => { throw new Error("sin red"); });
  assert.equal(rota.registrar("foto"), false);
});

test("the page's ids are the server's ids", () => {
  const { a, enviados, avanzar } = banco();
  for (const que of ACCIONES) { a.registrar(que); avanzar(MIN_ENTRE_MS); }
  assert.deepEqual(enviados.map((e) => e.que), [...ACCIONES]);
});
