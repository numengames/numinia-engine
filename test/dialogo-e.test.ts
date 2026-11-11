// QA Simposio 2026-11-11: «E» answers the first option of an open conversation. The same key opens it («E: hablar con …»), so the
// two page listeners (montarInteraccion first, montarDialogo after, as in apps/plaza/main.ts) must not make ONE keypress both open the
// box and pick option 1. Real example adventure over the plug, the real misiones client and both page pieces on a stub DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";
import { montarInteraccion } from "../apps/plaza/interactuar.ts";
import { montarDialogo } from "../apps/plaza/dialogo.ts";

const leer = lectorAventura(new URL("../aventuras/ejemplo", import.meta.url).pathname);
const EJEMPLO = { misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") };
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

type Nodo = { hidden: boolean; textContent: string; className: string; id: string; type: string; dataset: Record<string, string>; style: { cssText: string }; children: Nodo[]; firstElementChild: Nodo | null;
  append(...n: Nodo[]): void; replaceChildren(...n: Nodo[]): void; setAttribute(): void; addEventListener(t: string, f: () => void): void; contains(): boolean; focus(): void; blur(): void; click(): void };
const nodo = (): Nodo => {
  const clics: (() => void)[] = [];
  const n: Nodo = { hidden: false, textContent: "", className: "", id: "", type: "", dataset: {}, style: { cssText: "" }, children: [], firstElementChild: null,
    append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; this.firstElementChild = c[0] ?? null; },
    setAttribute() {}, addEventListener(t, f) { if (t === "click") clics.push(f); }, contains: () => false, focus() {}, blur() {}, click() { for (const f of clics) f(); } };
  return n;
};

/** The page as main.ts wires it: interaction first, then the conversation box; `tecla` dispatches one keydown to the window listeners in registration order. */
async function pagina() {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: EJEMPLO }), log: () => {}, identitySign: signer("una-clave-de-prueba-larga"), now: () => Date.parse("2026-10-15T12:00:00Z") });
  const cli = crearCliente(), t = inst.join(0);
  const s = new ClientSession(t, { features: cli.parts, identity: keeper(), view: { label() {}, bounce() {}, place() {}, tag() {} } });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump(3);
  inst.sim.tf.cols.x[s.entity] = fx(2); inst.sim.tf.cols.z[s.entity] = fx(-2); pump(12); // next to Alma
  const m = cli.misiones, elegidas: number[] = [], usos: string[] = [];
  const g = globalThis as Record<string, unknown>, viejo = { document: g.document, addEventListener: g.addEventListener, setInterval: g.setInterval };
  const oyentes: ((e: unknown) => void)[] = [];
  g.document = { createElement: nodo, getElementById: () => null, activeElement: null };
  g.addEventListener = (t: string, f: (e: unknown) => void) => { if (t === "keydown") oyentes.push(f); };
  g.setInterval = () => 0;
  const boton = Object.assign(nodo(), { hidden: true, classList: { add() {}, remove() {} }, style: { setProperty() {}, removeProperty() {}, cssText: "" } });
  const caja = nodo(); caja.hidden = true;
  const sesion = { entity: s.entity, selfPosition: () => ({ x: 2, y: 0, z: -2 }), features: { reachable: s.features.reachable.bind(s.features), use: (f: string, k: string) => { usos.push(`${f}:${k}`); return s.features.use(f, k); } } };
  const i = montarInteraccion({ session: sesion, view: { renderer: { domElement: { addEventListener() {} } as unknown as HTMLElement }, marcar() {} }, boton: boton as unknown as HTMLButtonElement, ofrece: (f, k) => m.ofrece(f, k), ocupado: () => !!m.dialogo() });
  const ctl = { dialogo: () => m.dialogo(), elegir: (n: number) => { elegidas.push(n); return m.elegir(n); }, adios: () => m.adios(), estado: m.estado, alCambiar: m.alCambiar };
  montarDialogo(ctl as never, caja as unknown as HTMLElement, { renderer: { domElement: caja as unknown as HTMLElement } });
  m.alCambiar(() => i.mirar());
  i.mirar(); await new Promise((ok) => setTimeout(ok, 60)); i.mirar(); // the first look fetches the page piece for the prompt
  const tecla = (code: string, repeat = false) => { for (const f of oyentes) f({ code, repeat, ctrlKey: false, metaKey: false, altKey: false, target: null, preventDefault() {} }); };
  const restaurar = () => { g.document = viejo.document; g.addEventListener = viejo.addEventListener; g.setInterval = viejo.setInterval; };
  return { m, caja, opciones: () => caja.children[2].children, tecla, pump, elegidas, usos, restaurar, actual: () => i.actual() };
}

test("E next to a person opens the conversation and does NOT also answer option 1; a second, separate E does", async () => {
  const P = await pagina();
  try {
    assert.equal(P.actual()?.key, "alma", "the prompt «E: hablar» is up for Alma");
    assert.equal(P.caja.hidden, true);
    P.tecla("KeyE");                                   // ONE keypress: both window listeners run, in main.ts order
    assert.deepEqual(P.usos, ["pnj:alma"], "the interaction listener used the person");
    assert.deepEqual(P.elegidas, [], "the same keypress picked nothing");
    P.pump(2);                                         // the server's answer arrives (never in the same event turn as the key)
    assert.equal(P.m.dialogo()?.nombre, "Alma, la guía");
    assert.equal(P.caja.hidden, false, "the box is open");
    assert.deepEqual(P.elegidas, [], "still nothing picked after the box opened");
    assert.match(P.m.dialogo()?.texto ?? "", /./);
    const primera = P.m.dialogo()!.texto;
    assert.equal(P.opciones()[0].textContent.startsWith("E. "), true, `the first answer names its key: «${P.opciones()[0].textContent}»`);
    assert.equal(P.opciones()[1].textContent.startsWith("2. "), true);
    P.tecla("KeyE", true);                             // the key held down: auto-repeat never answers
    assert.deepEqual(P.elegidas, []);
    P.tecla("KeyE");                                   // a new press: option 1
    assert.deepEqual(P.elegidas, [1]);
    assert.deepEqual(P.usos, ["pnj:alma"], "and it did not use the person again (the box is open)");
    P.pump(2);
    assert.notEqual(P.m.dialogo()?.texto, primera, "the conversation moved on to the next line");
    assert.match(P.m.dialogo()?.texto ?? "", /pilar dorado/);
  } finally { P.restaurar(); }
});

test("the digits and Esc still work, and E with no box open only talks", async () => {
  const P = await pagina();
  try {
    P.tecla("Digit2");                                 // no box: nothing to answer
    assert.deepEqual(P.elegidas, []);
    P.tecla("KeyE"); P.pump(2);
    P.tecla("Digit1"); assert.deepEqual(P.elegidas, [1]); P.pump(2);
    P.tecla("Escape"); assert.equal(P.m.dialogo(), null, "Esc says goodbye");
    assert.equal(P.caja.hidden, true);
  } finally { P.restaurar(); }
});
