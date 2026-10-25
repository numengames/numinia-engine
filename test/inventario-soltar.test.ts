// «Soltar» a weapon or a relic asks first (apps/plaza/bolsa-soltar.ts): nothing is sent until the yes, cancelling keeps the object,
// tokens and catches go without asking. Against the real client controller and server rules, not only a stub.
import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { crearSoltar, pideConfirmar, preguntaSoltar } from "../apps/plaza/bolsa-soltar.ts";
import type { Objeto } from "../apps/plaza/bolsa-rejilla.ts";
import { dar, leerInventario, nuevoInventario, quitar } from "../features/inventario/reglas.ts";

const obj = (o: Partial<Objeto> & { id: string }): Objeto => ({ tipo: "reliquia", clase: "r", nombre: o.id, icono: "", color: "", valor: 0, n: 1, portado: false, ...o });
function montar() {
  const enviados: { id: string; n?: number }[] = [], avisos: string[] = [];
  let repintados = 0, rechazar: string | null = null;
  const s = crearSoltar((id, n) => { enviados.push({ id, n }); return rechazar ? { ok: false as const, why: rechazar } : { ok: true as const }; }, (t) => avisos.push(t), () => { repintados++; });
  return { s, enviados, avisos, repintados: () => repintados, rechazar: (why: string | null) => { rechazar = why; } };
}

test("only weapons and relics are asked about; the question is «¿Soltar X? Se perderá.»", () => {
  assert.equal(pideConfirmar(obj({ id: "a", tipo: "arma" })), true);
  assert.equal(pideConfirmar(obj({ id: "b", tipo: "reliquia" })), true);
  assert.equal(pideConfirmar(obj({ id: "c", tipo: "token" })), false);
  assert.equal(pideConfirmar(obj({ id: "d", tipo: "captura" })), false);
  assert.equal(preguntaSoltar(obj({ id: "x", nombre: "Espada de luz" })), "¿Soltar Espada de luz? Se perderá.");
});

test("a weapon or a relic: «Soltar» only opens the question — nothing is sent without the yes", () => {
  for (const tipo of ["arma", "reliquia"] as const) {
    const t = montar(), o = obj({ id: "o7", tipo, nombre: "Pieza", portado: true });
    assert.equal(t.s.pedir(o), "pregunta");
    assert.equal(t.s.pendiente?.id, "o7");
    assert.deepEqual(t.enviados, [], "no intent before the confirmation");
    assert.equal(t.repintados(), 1, "the card is redrawn with the question");
  }
});

test("«Cancelar» sends nothing and closes the question; a later «Sí» finds nothing to confirm", () => {
  const t = montar();
  t.s.pedir(obj({ id: "o1", tipo: "arma" }));
  t.s.cancelar();
  assert.equal(t.s.pendiente, null);
  assert.deepEqual(t.enviados, []);
  assert.equal(t.s.confirmar(), "nada");
  assert.deepEqual(t.enviados, [], "still nothing sent");
  t.s.cancelar(); // cancelling with no question open is harmless
  assert.equal(t.repintados(), 2);
});

test("a silent cancel (another object chosen, panel closed) does not ask for a redraw", () => {
  const t = montar();
  t.s.pedir(obj({ id: "o1", tipo: "arma" }));
  const antes = t.repintados();
  t.s.cancelar(true);
  assert.equal(t.s.pendiente, null);
  assert.equal(t.repintados(), antes);
  assert.deepEqual(t.enviados, []);
});

test("«Sí, soltar» sends exactly one soltar for the asked object (all of it), and the question is gone", () => {
  const t = montar();
  t.s.pedir(obj({ id: "o2", tipo: "reliquia" }));
  assert.equal(t.s.confirmar(), "enviado");
  assert.deepEqual(t.enviados, [{ id: "o2", n: 0 }]);
  assert.equal(t.s.pendiente, null);
  assert.equal(t.s.confirmar(), "nada", "a second yes sends nothing more");
  assert.equal(t.enviados.length, 1);
});

test("a refusal from the server is shown, not swallowed", () => {
  const t = montar();
  t.rechazar("no tienes ese objeto");
  t.s.pedir(obj({ id: "o3", tipo: "arma" }));
  assert.equal(t.s.confirmar(), "rechazado");
  assert.deepEqual(t.avisos, ["no tienes ese objeto"]);
});

test("tokens and catches go at once, with no question", () => {
  for (const tipo of ["token", "captura"] as const) {
    const t = montar();
    assert.equal(t.s.pedir(obj({ id: "o9", tipo, n: 4 })), "enviado");
    assert.deepEqual(t.enviados, [{ id: "o9", n: 0 }]);
    assert.equal(t.s.pendiente, null);
    assert.equal(t.repintados(), 0);
  }
});

test("end to end on the server's rules: cancelling keeps the relic in the Inventario, confirming removes it", () => {
  const inv = nuevoInventario();
  const r = dar(inv, { tipo: "reliquia", clase: "ojo", nombre: "Ojo de Alba" });
  assert.ok(r.ok);
  const id = inv.objetos[0].id;
  // a controller that really applies the server's `quitar`
  const s = crearSoltar((i, n) => { const q = quitar(inv, i, n || undefined); return q.ok ? { ok: true as const } : { ok: false as const, why: q.motivo }; }, () => {}, () => {});
  s.pedir(inv.objetos[0] as unknown as Objeto);
  assert.equal(inv.objetos.length, 1, "asked, not dropped");
  s.cancelar();
  assert.equal(leerInventario(inv).objetos.length, 1, "cancelled: the relic is still there");
  s.pedir(inv.objetos[0] as unknown as Objeto);
  assert.equal(s.confirmar(), "enviado");
  assert.equal(inv.objetos.some((o) => o.id === id), false, "confirmed: gone");
});

test("the panel goes through the guard: its only soltar call is the guard's, and there is no window.confirm (it does not exist in VR)", () => {
  const f = readFileSync(new URL("../apps/plaza/inventario.ts", import.meta.url), "utf8");
  assert.equal((f.match(/\bc\.soltar\(/g) ?? []).length, 1, "the controller's soltar( is called once: inside the guard");
  assert.match(f, /crearSoltar\(\(id, n\) => c\.soltar\(id, n\)/, "the controller's soltar is wired only inside crearSoltar");
  assert.doesNotMatch(f, /\bconfirm\(/);
});
