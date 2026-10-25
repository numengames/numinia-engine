// Lote 5 · VR: «los PNJ solo se activan de cerca». The ray reaches 12 m; talking works within the person's radius. The hands' rules
// (montarXR) now offer a person / a quest thing to the ray only while it is in reach (`features.reachable`, what the E prompt uses).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAlcance } from "../apps/plaza/xr-alcance.ts";
import { montarXR } from "../apps/plaza/xr.ts";

test("crearAlcance: only what the list names; the list is asked once per interval, not per thing per frame", () => {
  let t = 0, preguntas = 0, cerca = [{ feature: "pnj", key: "alma" }];
  const a = crearAlcance({ leer: () => { preguntas++; return cerca; }, ahora: () => t, cadaMs: 100 });
  assert.equal(a("pnj", "alma"), true);
  assert.equal(a("pnj", "bruno"), false, "not in reach");
  assert.equal(a("misiones", "alma"), false, "same key, other feature");
  for (let i = 0; i < 50; i++) a("pnj", "alma");
  assert.equal(preguntas, 1, "one read for the whole interval");
  cerca = [{ feature: "pnj", key: "bruno" }]; t = 150;
  assert.equal(a("pnj", "bruno"), true, "next interval: the new list");
  assert.equal(a("pnj", "alma"), false, "walked away from Alma");
  assert.equal(preguntas, 2);
});

function montar(cerca: { feature: string; key: string }[], conAlcance = true) {
  let reglas: { agarrable?: (k: string) => boolean; apuntable?: (k: string) => boolean } = {};
  const view = {
    vr: { active: true, pagina: "mision" as const, dialogo() {}, nota() {}, onElegir() {}, onAtras() {} }, ar: { state: "off" },
    manos: { reglas: (r: typeof reglas) => { reglas = r; }, on() {}, vibrar() {} }, llevar() {}, llevando: () => ({}),
  };
  const misiones = { estado: { nota: "" }, libro: () => [], objetivos: () => [], dialogo: () => null, elegir: () => ({ ok: true as const }), adios: () => ({ ok: true as const }), usar: () => ({ ok: true as const }),
    ofrece: (_f: string, key: string) => key !== "apagada", alCambiar: () => () => {} };
  const session = conAlcance ? { selfPosition: () => ({ x: 0, y: 0, z: 0 }), features: { use: () => ({ ok: true as const }), reachable: () => cerca } } : { features: { use: () => ({ ok: true as const }) } };
  montarXR({ session, view, misiones, interaccion: { actual: () => null, usar: () => ({ ok: true }), mirar() {}, mantener: { empezar() {}, soltar() {} } } } as never);
  return reglas;
}

test("the hands' rules: a far person is not aimed at, a near one is; the same for a quest thing; a stub session keeps the old rule", () => {
  const r = montar([{ feature: "pnj", key: "alma" }, { feature: "misiones", key: "caja" }]);
  assert.equal(r.apuntable!("pnj:alma"), true, "Alma is in reach");
  assert.equal(r.apuntable!("pnj:bruno"), false, "Bruno is 12 m away: the ray does not stop on him and nothing is sent");
  assert.equal(r.apuntable!("misiones:caja"), true);
  assert.equal(r.apuntable!("misiones:otra"), false, "a quest thing out of reach");
  const r2 = montar([{ feature: "misiones", key: "apagada" }]);
  assert.equal(r2.apuntable!("misiones:apagada"), false, "reach alone is not enough: the thing must be on offer (ofrece)");
  const sinLista = montar([], false);
  assert.equal(sinLista.apuntable!("pnj:bruno"), true, "no reach list in the session: as before");
});
