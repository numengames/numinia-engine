// condiciones/c3 — the bubble of entry, the decisions without a browser (apps/plaza/condiciones-logica.ts) and the promise that a
// world with the gate OFF is untouched (apps/plaza/condiciones.ts reads no `document` until a bubble is asked for).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aceptacion, conservados, esVuelta, flechaVersion, lineaQuitado, marcasVacias, nombreDeCapa, pideBurbuja, planificar, porcentajeLeido, puedeSeguir, ROTULO_TODO, rotuloAcepto, rotuloSinOpcional,
  SUBTITULO_CAMBIOS, TITULO_CAMBIOS, todoMarcado,
} from "../apps/plaza/condiciones-logica.ts";
import { montarCondiciones } from "../apps/plaza/condiciones.ts";
import type { CondicionesAceptado, CondicionesCapa, CondicionesMensaje } from "../packages/net/src/index.ts";

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

// ---------- c6: the person is back and a layer went up a version ----------
const nueva = (id: string, titulo: string, tipo: "norma" | "datos" = "norma") => ({ id, titulo, texto: `texto de ${id}`, obligatorio: tipo === "norma", tipo });
/** The house is as the person accepted it (1.0); the community went 1.0 → 1.1: `fotos` changed, `viernes` is new, `ruido` is gone; of the data points `ia` is
 * unchanged, `avisos` changed and `sorteo` is new. */
const capasVuelta: CondicionesCapa[] = [
  { capa: "casa", nombre: "Casa de prueba", version: "1.0", puntos: capas[0].puntos },
  { capa: "comunidad", nombre: "Numen Games", version: "1.1",
    puntos: [nueva("turno", "Respeta el turno"), nueva("fotos", "No grabes ni retransmitas a otros sin pedírselo."), nueva("viernes", "Los viernes la plaza es solo para el encuentro."), nueva("ia", "Que la IA me escuche", "datos"), nueva("avisos", "Avisos y novedades", "datos"), nueva("sorteo", "El sorteo mensual", "datos")],
    cambios: { desde: "1.0", nuevos: ["viernes", "sorteo"], cambiados: ["fotos", "avisos"], quitados: ["ruido"], antes: { fotos: "No grabes a otros sin pedírselo.", avisos: "Avisos", ruido: "No hagas ruido de noche." } } },
];
const dados: CondicionesAceptado = { versiones: { casa: "1.0", comunidad: "1.0" }, datos: ["informe", "ia", "avisos"], en: "2026-10-20T12:00:00.000Z" };

test("c6 planificar: only the layer that changed has a page, only with the new and changed points; the removed ones in a line; the old title kept", () => {
  const p = planificar(capasVuelta, dados);
  assert.deepEqual(p.map((x) => x.tipo === "capa" ? x.capa : "datos"), ["comunidad", "datos"], "the house did not change: no page");
  const c = p[0]; assert.ok(c.tipo === "capa");
  assert.deepEqual(c.normas.map((n) => n.id), ["fotos", "viernes"], "the unchanged norm `turno` is not asked again; data points are not norms");
  assert.deepEqual(c.cambios!.etiquetas, { viernes: "nuevo", sorteo: "nuevo", fotos: "cambiado", avisos: "cambiado" });
  assert.equal(c.cambios!.desde, "1.0"); assert.equal(c.version, "1.1"); assert.equal(c.exige, true, "the version is still a mandatory acceptance");
  assert.deepEqual(c.cambios!.quitados, [{ id: "ruido", titulo: "No hagas ruido de noche." }]);
  assert.equal(c.cambios!.antes.fotos, "No grabes a otros sin pedírselo.");
  assert.equal(esVuelta(p), true); assert.equal(esVuelta(planificar(capas)), false, "a first visit is not a return");
});

test("c6 planificar: «Tus datos» holds only the new and the changed data points, tagged, and every box starts empty", () => {
  const d = planificar(capasVuelta, dados)[1]; assert.ok(d.tipo === "datos");
  assert.deepEqual(d.permisos.map((x) => [x.capa, x.punto.id, x.etiqueta]), [["comunidad", "avisos", "cambiado"], ["comunidad", "sorteo", "nuevo"]]);
  assert.equal(d.vuelve, true);
  assert.deepEqual([...marcasVacias().datos], [], "nothing ticked by itself");
});

test("c6 planificar: no new data point → no data step; a version that changed with the same text still has its box; a layer never accepted is asked in full", () => {
  const solo: CondicionesCapa[] = [{ capa: "comunidad", version: "1.1", puntos: [nueva("turno", "Respeta el turno")], cambios: { desde: "1.0", nuevos: [], cambiados: [], quitados: [] } }];
  const p = planificar(solo, { versiones: { comunidad: "1.0" }, datos: [], en: "" });
  assert.deepEqual(p.map((x) => x.tipo), ["capa"]); assert.ok(p[0].tipo === "capa" && p[0].normas.length === 0 && p[0].exige && !!p[0].cambios);
  // the world adds the community layer: the house one is as accepted (no page), the community one never was (all of it, no labels)
  const alta: CondicionesCapa[] = [{ ...capasVuelta[0], cambios: { desde: "0.9", nuevos: [], cambiados: ["trato"], quitados: [] } }, { ...capasVuelta[1], cambios: undefined }];
  const q = planificar(alta, { versiones: { casa: "0.9" }, datos: [], en: "" });
  assert.deepEqual(q.map((x) => x.tipo === "capa" ? `${x.capa}${x.cambios ? "*" : ""}` : "datos"), ["casa*", "comunidad", "datos"]);
  const full = q[1]; assert.ok(full.tipo === "capa"); assert.equal(full.normas.length, 6 - 3, "norms of the new layer, in full");
});

test("c6 conservados/aceptacion: the permissions given for what was not asked travel in ACEPTAR; the new and changed never do by themselves", () => {
  assert.deepEqual(conservados(capasVuelta, dados), ["informe", "ia"], "`informe` (the house layer, not shown) and `ia` (unchanged) stay; `avisos` changed: given up");
  assert.deepEqual(conservados(capas, dados), [], "a first visit (no `cambios`): nothing is carried");
  assert.deepEqual(conservados(capasVuelta, null), []);
  const casaDatos: CondicionesAceptado = { ...dados, datos: ["informe", "ia"] };
  assert.deepEqual(conservados([{ ...capasVuelta[0], puntos: capas[0].puntos }, capasVuelta[1]], casaDatos), ["informe", "ia"], "a layer not shown (same version accepted): what was given there stays given");
  const p = planificar(capasVuelta, dados), m = marcasVacias(); m.normas.comunidad = true;
  const gu = conservados(capasVuelta, dados);
  assert.deepEqual(aceptacion(p, m, "ninguna", gu), { versiones: { comunidad: "1.1" }, datos: ["informe", "ia"] }, "«sin lo opcional» refuses what is on screen, not what was not asked");
  assert.deepEqual(aceptacion(p, m, "marcadas", gu).datos, ["informe", "ia"], "boxes empty = new and changed permissions not given");
  m.datos.add("sorteo"); assert.deepEqual(aceptacion(p, m, "marcadas", gu).datos, ["sorteo", "informe", "ia"]);
  assert.deepEqual(aceptacion(p, m, "todo", gu).datos, ["avisos", "sorteo", "informe", "ia"]);
  assert.deepEqual(aceptacion(planificar(capas), marcasVacias(), "ninguna").datos, [], "a first visit: as before");
});

test("c6 words: the title, the box of the version, the arrow of versions and the line of a removed point", () => {
  assert.equal(TITULO_CAMBIOS, "Han cambiado las normas"); assert.match(SUBTITULO_CAMBIOS, /solo te enseñamos lo que ha cambiado/);
  assert.equal(flechaVersion("1.0", "1.1"), "v1.0 → v1.1");
  const c = planificar(capasVuelta, dados)[0]; assert.ok(c.tipo === "capa");
  assert.equal(rotuloAcepto(c), "Acepto la versión 1.1 de las normas de Numen Games");
  assert.equal(rotuloAcepto({ capa: "casa", propio: null, version: "2" }), "Acepto la versión 2 de las normas de la casa");
  assert.equal(rotuloAcepto({ capa: "comunidad", propio: null, version: "B" }), "Acepto la versión B de las normas de la comunidad");
  assert.deepEqual(lineaQuitado({ id: "ruido", titulo: "No hagas ruido." }), { tachado: "No hagas ruido.", nota: "ya no está" });
  assert.deepEqual(lineaQuitado({ id: "ruido", titulo: null }), { tachado: "ruido", nota: "ya no está" }, "no old title kept: the id");
  assert.equal(puedeSeguir(c, marcasVacias()), false, "the new version needs its box");
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
