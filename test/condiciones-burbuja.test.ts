// condiciones/c3 — the bubble of entry, the decisions without a browser (apps/plaza/condiciones-logica.ts) and the promise that a
// world with the gate OFF is untouched (apps/plaza/condiciones.ts reads no `document` until a bubble is asked for).
import { test } from "node:test";
import assert from "node:assert/strict";
import { aceptacion, marcasVacias, nombreDeCapa, pideBurbuja, planificar, porcentajeLeido, puedeSeguir, ROTULO_TODO, rotuloSinOpcional, todoMarcado } from "../apps/plaza/condiciones-logica.ts";
import { montarCondiciones } from "../apps/plaza/condiciones.ts";
import type { CondicionesCapa, CondicionesMensaje } from "../packages/net/src/index.ts";

const capas: CondicionesCapa[] = [
  { capa: "casa", nombre: "Casa de prueba", version: "1.0", puntos: [
    { id: "trato", titulo: "Trata bien a los demás", texto: "Sin acoso.", obligatorio: true, tipo: "norma" },
    { id: "obra", titulo: "Lo que construyes es tuyo", texto: "No subas cosas de otros.", obligatorio: true, tipo: "norma" },
    { id: "informe", titulo: "Informe de la sesión", texto: "Rendimiento de tu aparato.", obligatorio: false, tipo: "datos" } ] },
  { capa: "comunidad", version: "A", puntos: [
    { id: "turno", titulo: "Respeta el turno de palabra", texto: "En los encuentros.", obligatorio: true, tipo: "norma" },
    { id: "ia", titulo: "Que la IA me escuche", texto: "Para que conteste hablando.", obligatorio: false, tipo: "datos" },
    { id: "avisos", titulo: "Avisos", texto: "Te avisamos de los encuentros.", obligatorio: false, tipo: "datos" } ] },
];
const oferta = (o: Partial<CondicionesMensaje> = {}): CondicionesMensaje => ({ formato: "condiciones-estado@1", puerta: true, abierta: false, faltan: ["casa", "comunidad"], aceptado: null, capas, ...o });

test("pideBurbuja: only a gate that is on and still closed asks for the bubble", () => {
  assert.equal(pideBurbuja(oferta()), true);
  assert.equal(pideBurbuja(oferta({ abierta: true })), false, "let through: no bubble");
  assert.equal(pideBurbuja(oferta({ puerta: false, abierta: true })), false, "gate off: no bubble");
  assert.equal(pideBurbuja(oferta({ puerta: false, abierta: false })), false, "gate off never asks, whatever else is said");
  assert.equal(pideBurbuja(null), false);
});

test("planificar: one page per layer with norms, house first; the data permissions of ALL layers are the last step", () => {
  const p = planificar(capas);
  assert.deepEqual(p.map((x) => x.tipo), ["capa", "capa", "datos"]);
  assert.deepEqual(p.map((x) => (x.tipo === "capa" ? x.capa : "datos")), ["casa", "comunidad", "datos"]);
  const casa = p[0]; assert.ok(casa.tipo === "capa");
  assert.deepEqual(casa.normas.map((n) => n.id), ["trato", "obra"], "the data point is not a norm of the page");
  assert.equal(casa.exige, true);
  const datos = p[2]; assert.ok(datos.tipo === "datos");
  assert.deepEqual(datos.permisos.map((x) => `${x.capa}:${x.punto.id}`), ["casa:informe", "comunidad:ia", "comunidad:avisos"]);
});

test("planificar: no data point → no «Tus datos» step; a layer of only data has no norms page; no layers → no steps", () => {
  assert.deepEqual(planificar([capas[0].puntos.length ? { ...capas[0], puntos: capas[0].puntos.filter((x) => x.tipo === "norma") } : capas[0]]).map((x) => x.tipo), ["capa"]);
  const soloDatos: CondicionesCapa = { capa: "comunidad", version: "A", puntos: [capas[1].puntos[1]] };
  assert.deepEqual(planificar([capas[0], soloDatos]).map((x) => x.tipo), ["capa", "datos"]);
  assert.deepEqual(planificar([]), []);
  assert.deepEqual(planificar(undefined), []);
});

test("nombreDeCapa: the file's own name; else a plain word, never a brand", () => {
  assert.equal(nombreDeCapa({ capa: "casa", nombre: " Casa de prueba " }), "Casa de prueba");
  assert.equal(nombreDeCapa({ capa: "casa" }), "La casa");
  assert.equal(nombreDeCapa({ capa: "comunidad" }), "La comunidad");
});

test("puedeSeguir: a mandatory norm needs its box; «Tus datos» never needs anything (EDPB 05/2020 §39)", () => {
  const [casa, , datos] = planificar(capas);
  const m = marcasVacias();
  assert.equal(puedeSeguir(casa, m), false, "boxes start empty: nobody is accepted by default");
  assert.equal(puedeSeguir(datos, m), true, "data boxes empty, still free to go on");
  m.normas.casa = true;
  assert.equal(puedeSeguir(casa, m), true);
  const sinObligatorio = { ...casa, exige: false } as typeof casa;
  assert.equal(puedeSeguir(sinObligatorio, marcasVacias()), true);
});

test("todoMarcado: needs every mandatory layer box, nothing about data", () => {
  const p = planificar(capas), m = marcasVacias();
  assert.equal(todoMarcado(p, m), false);
  m.normas.casa = true; assert.equal(todoMarcado(p, m), false);
  m.normas.comunidad = true; assert.equal(todoMarcado(p, m), true);
});

test("aceptacion: every layer at its version; data = the ticked ones, all, or none — never ticked by itself", () => {
  const p = planificar(capas), m = marcasVacias();
  m.normas.casa = m.normas.comunidad = true;
  assert.deepEqual(aceptacion(p, m, "marcadas"), { versiones: { casa: "1.0", comunidad: "A" }, datos: [] }, "empty boxes = refuse all data");
  assert.deepEqual(aceptacion(p, m, "ninguna").datos, []);
  assert.deepEqual(aceptacion(p, m, "todo").datos, ["informe", "ia", "avisos"]);
  m.datos.add("ia");
  assert.deepEqual(aceptacion(p, m, "marcadas").datos, ["ia"]);
  assert.deepEqual(aceptacion(p, m, "ninguna").datos, [], "«sin lo opcional» refuses even what was ticked");
});

test("the two ways out of the last step: refusing says so, and it is as plain as accepting", () => {
  assert.equal(rotuloSinOpcional(0), "Entrar sin lo opcional");
  assert.equal(ROTULO_TODO, "Aceptar todo y entrar");
  assert.notEqual(rotuloSinOpcional(2), "Entrar sin lo opcional", "with boxes ticked the button says what it will do");
});

test("porcentajeLeido: from the scroll box; a box that fits whole is read", () => {
  assert.equal(porcentajeLeido(0, 100, 300), 0);
  assert.equal(porcentajeLeido(100, 100, 300), 50);
  assert.equal(porcentajeLeido(200, 100, 300), 100);
  assert.equal(porcentajeLeido(999, 100, 300), 100);
  assert.equal(porcentajeLeido(0, 100, 100), 100);
});

test("gate OFF: nothing is built, no element, no key listener, nobody is held (this runs with no `document` at all)", () => {
  assert.equal(typeof (globalThis as { document?: unknown }).document, "undefined");
  let pedido = 0;
  const s = { condiciones: null as CondicionesMensaje | null, onCondiciones: null as ((m: CondicionesMensaje) => void) | null, entity: 1, aceptar: () => true, pedirCondiciones: () => { pedido++; return true; } };
  const c = montarCondiciones({ session: s, mundo: () => "Mundo" });
  assert.equal(c.cerrada(), false);
  assert.equal(c.estado.activa, false);
  assert.equal(typeof s.onCondiciones, "function", "it listens, and that is all");
  s.onCondiciones!({ formato: "condiciones-estado@1", puerta: false, abierta: true, faltan: [], aceptado: null }); // a gate that is off may still answer when asked
  s.onCondiciones!({ formato: "condiciones-estado@1", puerta: false, abierta: false, faltan: ["casa"], aceptado: null, capas });
  s.onCondiciones!({ formato: "condiciones-estado@1", puerta: true, abierta: true, faltan: [], aceptado: null, capas });
  assert.equal(c.cerrada(), false);
  assert.equal(pedido, 0, "it asked the server for nothing");
});

test("gate OFF and a message already there at mount time: still nothing", () => {
  const s = { condiciones: { formato: "condiciones-estado@1", puerta: false, abierta: true, faltan: [], aceptado: null } as CondicionesMensaje, onCondiciones: null as ((m: CondicionesMensaje) => void) | null, entity: 1, aceptar: () => true, pedirCondiciones: () => true };
  assert.equal(montarCondiciones({ session: s, mundo: () => "" }).cerrada(), false);
});
