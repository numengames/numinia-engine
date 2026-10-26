// t_45ef2f70 (fourth step): the page's gate façade (apps/plaza/condiciones-puerta.ts). The bubble's chunk loads after the first
// frame (Pablo's decision of 26-10), so what must hold is: no play before accepting. While the server's offer says «puerta: true,
// abierta: false» and the real bubble is not up, `cerrada()` is true, a layer takes the pointer, keys are stopped before the
// world hears them, the chunk is asked for at once, and a failed load keeps the page held (fails closed). Gate off: nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarCondicionesPuerta, pideBurbujaPuerta } from "../apps/plaza/condiciones-puerta.ts";
import { pideBurbuja } from "../apps/plaza/condiciones-logica.ts";

type Oyente = (e: unknown) => void;
const oyentes = new Map<string, Oyente[]>();
const capa = { el: null as null | { id: string; removed: boolean; children: unknown[] } };
const g = globalThis as Record<string, unknown>;
g.addEventListener = (t: string, f: Oyente) => { oyentes.set(t, [...(oyentes.get(t) ?? []), f]); };
const el = (tag: string): Record<string, unknown> => ({ tag, style: {}, children: [] as unknown[], hidden: false, textContent: "", id: "", removed: false, setAttribute() {}, addEventListener() {}, append(...c: unknown[]) { (this.children as unknown[]).push(...c); }, remove() { this.removed = true; } });
g.document = { createElement: (t: string) => { const e = el(t); if (t === "div") capa.el = e as never; return e; }, body: { appendChild() {} } };

const oferta = { puerta: true, abierta: false, capas: [] } as never;
const sesion = (c: unknown) => ({ condiciones: c, onCondiciones: null as null | ((m: never) => void), entity: 1, aceptar: () => true, pedirCondiciones: () => true }) as never;
const evento = () => { const e = { parado: false, evitado: false, preventDefault() { this.evitado = true; }, stopImmediatePropagation() { this.parado = true; } }; return e; };
const teclas = (e: unknown) => { for (const f of oyentes.get("keydown") ?? []) f(e); };
const real = () => ({ cerrada: () => true, alCambiar() {}, estado: { activa: true, paso: 2 }, ir() {}, enviar() {}, salir() {}, marcarNorma() {}, marcarDato() {}, repetir: () => true, soltar() {} });

test("the façade's test for «a bubble is due» is the real one's, for every message", () => {
  for (const m of [null, undefined, { puerta: false, abierta: true }, { puerta: true, abierta: true }, { puerta: true, abierta: false }, { puerta: true }, { abierta: false }, {}]) {
    assert.equal(pideBurbujaPuerta(m as never), pideBurbuja(m as never));
  }
});

test("gate off: nothing is held, no layer, the chunk is not forced", () => {
  let pedido = 0; capa.el = null;
  const c = montarCondicionesPuerta({ session: sesion(null), mundo: () => "x" }, async () => { pedido++; return { montarCondiciones: real as never }; });
  assert.equal(c.cerrada(), false);
  const e = evento(); teclas(e);
  assert.equal(e.parado, false, "keys reach the world");
  assert.equal(capa.el, null);
  assert.equal(pedido, 0, "with the gate off the chunk waits for the first frame");
});

test("offer already there before the chunk: the page is closed at once, keys stopped, layer up, chunk asked for now", async () => {
  let pedido = 0, abrir!: () => void; capa.el = null;
  const espera = new Promise<void>((r) => { abrir = r; });
  const c = montarCondicionesPuerta({ session: sesion(oferta), mundo: () => "x" }, async () => { pedido++; await espera; return { montarCondiciones: real as never }; });
  assert.equal(c.cerrada(), true);
  assert.equal(c.estado.activa, true);
  const e = evento(); teclas(e);
  assert.equal(e.parado && e.evitado, true, "the key never reaches the world");
  assert.ok(capa.el, "a layer takes the pointer");
  assert.equal(pedido, 1);
  abrir(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(c.cerrada(), true, "the real bubble's own answer from now on");
  assert.equal(c.estado.paso, 2);
  assert.equal((capa.el as unknown as { removed: boolean }).removed, true, "the real bubble replaces the holding layer");
  const e2 = evento(); teclas(e2);
  assert.equal(e2.parado, false, "the real bubble guards its own keys");
});

test("the offer arrives after the façade: the page closes then; an open message releases it", () => {
  capa.el = null; const s = sesion(null) as unknown as { condiciones: unknown; onCondiciones: (m: unknown) => void };
  const c = montarCondicionesPuerta({ session: s as never, mundo: () => "x" }, () => new Promise(() => {}));
  assert.equal(c.cerrada(), false);
  s.condiciones = oferta; s.onCondiciones(oferta);
  assert.equal(c.cerrada(), true);
  s.condiciones = { puerta: true, abierta: true }; s.onCondiciones(s.condiciones);
  assert.equal(c.cerrada(), false);
});

test("the chunk cannot be fetched: the page stays closed, says so and can retry", async () => {
  capa.el = null; let n = 0;
  const c = montarCondicionesPuerta({ session: sesion(oferta), mundo: () => "x" }, async () => { n++; if (n === 1) throw new Error("red"); return { montarCondiciones: real as never }; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(c.cerrada(), true, "fails closed");
  const l = capa.el as unknown as { children: Array<{ hidden: boolean; textContent: string }> };
  assert.match(l.children[0].textContent, /No se han podido/);
  assert.equal(l.children[1].hidden, false, "«Reintentar» is offered");
});
