// H12b: bloom, AO and soft shadows exist on level A only; a cost gate drops the passes if the machine cannot hold the target.
// Pure parts here (packages/render/src/calidad.ts, posproceso-politica.ts) and the settings that offer them; the drawing is
// checked in a browser by tools/e2e-piernas/posproceso.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acotarEfectos, efectosPermitidos, EFECTOS_APAGADOS, RADIO_SOMBRA, capacidades } from "../packages/render/src/calidad.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";
import { crearPuerta, pasadasExtra, TOPE_MS, VENTANA, CALENTAR } from "../packages/render/src/posproceso-politica.ts";
import { crearAjustes } from "../packages/client/src/ajustes.ts";
import { crearCapacidades } from "../packages/client/src/capacidades.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";

const TODO = { bloom: true, ao: true, sombraSuave: true };

test("tiers: effects are allowed on A only; B, C and D get them off whatever is asked", () => {
  assert.equal(efectosPermitidos("A"), true);
  for (const n of ["B", "C", "D"] as Nivel[]) {
    assert.equal(efectosPermitidos(n), false, n);
    assert.deepEqual(acotarEfectos(n, { ...EFECTOS_APAGADOS }, TODO), EFECTOS_APAGADOS, `${n}: asking changes nothing`);
    assert.deepEqual(acotarEfectos(n, TODO, {}), EFECTOS_APAGADOS, `${n}: even what was on is dropped (entering VR is B)`);
  }
});

test("effects start off, a wish is merged one effect at a time and junk is ignored", () => {
  let e = acotarEfectos("A", { ...EFECTOS_APAGADOS }, {});
  assert.deepEqual(e, EFECTOS_APAGADOS, "off by default, also on A");
  e = acotarEfectos("A", e, { bloom: true });
  assert.deepEqual(e, { bloom: true, ao: false, sombraSuave: false });
  e = acotarEfectos("A", e, { ao: true, bloom: "si" as unknown as boolean });
  assert.deepEqual(e, { bloom: true, ao: true, sombraSuave: false }, "a non-boolean is not a wish");
  e = acotarEfectos("A", e, { bloom: false });
  assert.deepEqual(e, { bloom: false, ao: true, sombraSuave: false });
});

test("capacidades(): only A says it can offer the effects' state; shadow radius is wider when soft", () => {
  assert.ok(RADIO_SOMBRA.suave > RADIO_SOMBRA.duro);
  assert.equal(RADIO_SOMBRA.duro, 1, "1 is three's default radius");
  assert.equal(pasadasExtra({ bloom: false, ao: false }), 0);
  assert.equal(pasadasExtra({ bloom: true, ao: false }), 1);
  assert.equal(pasadasExtra({ bloom: true, ao: true }), 3, "AO costs a depth+normal pre-pass and the AO pass; bloom one more");
  assert.equal(capacidades("A").nivel, "A");
});

test("cost gate: fast frames keep the effects, slow ones switch them off once, a freeze or the warm-up does not count", () => {
  const llenar = (g: ReturnType<typeof crearPuerta>, dt: number, n: number, tope?: number) => { let r = "sigue"; for (let i = 0; i < n; i++) r = g.alDibujar(dt, tope); return r; };
  const rapido = crearPuerta();
  assert.equal(llenar(rapido, 16.7, CALENTAR + VENTANA * 3), "sigue", "60 fps holds");
  const lento = crearPuerta();
  assert.equal(llenar(lento, 40, CALENTAR + VENTANA - 1), "sigue", "a window is not full yet");
  assert.equal(lento.alDibujar(40), "apagar", "25 fps over a full window: off");
  assert.ok(lento.media() > TOPE_MS);
  // warm-up: the compile of the passes (a huge first frame) is not measured
  const frio = crearPuerta();
  for (let i = 0; i < CALENTAR; i++) frio.alDibujar(900);
  assert.equal(llenar(frio, 16, VENTANA * 2), "sigue", "the first frames pay for the shaders");
  // one stall in a good window does not trip it (a frame counts at most 250 ms: 250/90 = 2.8 ms of average)
  const parada = crearPuerta();
  llenar(parada, 16, CALENTAR);
  parada.alDibujar(5000);
  assert.equal(llenar(parada, 16, VENTANA), "sigue");
  // the cap follows the target: a 30 fps cap (battery) gets 41.7 ms before the gate calls it slow
  const treinta = crearPuerta();
  assert.equal(llenar(treinta, 33, CALENTAR + VENTANA * 2, 1.25 * 1000 / 30), "sigue");
  // junk is ignored
  const raro = crearPuerta();
  assert.equal(llenar(raro, NaN, 500), "sigue"); assert.equal(llenar(raro, -3, 500), "sigue");
  // after a restart the warm-up counts again
  lento.reiniciar();
  assert.equal(llenar(lento, 40, CALENTAR + VENTANA - 1), "sigue");
});

test("settings: the three effects are offered only where the environment says it has them, off by default", () => {
  const caps = (efectos: boolean) => crearCapacidades({ entorno: true, "entorno.sombras": true, "entorno.agua": true, "entorno.particulas": true, "entorno.hdr": true, "entorno.efectos": efectos } as never, { nivel: efectos ? "A" : "C" });
  const guardado = { leer: () => null, escribir: () => {} };
  const ids = ["graficos.bloom", "graficos.ao", "graficos.sombraSuave"];
  const conA = crearAjustes({ capacidades: caps(true), guardado, mundo: null as never, registro: () => {} }); conA.declarar(AJUSTES_MOTOR);
  const sinA = crearAjustes({ capacidades: caps(false), guardado, mundo: null as never, registro: () => {} }); sinA.declarar(AJUSTES_MOTOR);
  const visibles = (a: typeof conA) => a.grupos().find((g) => g.id === "graficos")!.ajustes.filter((x) => ids.includes(x.id) && x.visible).map((x) => x.id);
  assert.deepEqual(visibles(conA), ids);
  assert.deepEqual(visibles(sinA), [], "a phone is not offered them");
  for (const id of ids) assert.equal(conA.get(id), false, `${id} starts off`);
  // a tick turns one on, the listener hears it (the page then asks the render, which clamps by tier)
  let visto: unknown = null;
  conA.alAplicar("graficos.bloom", (v) => { visto = v; });
  conA.set("graficos.bloom", true);
  assert.equal(visto, true);
});
