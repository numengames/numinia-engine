// ia-llamar S11: «Hablar con ella» on the page — the pure parts. Which bubbles you are inside and which AI the E prompt offers, the "lo lee su cerebro"
// notice remembered once per browser, the words (same keys in every language), the card's light («Escuchando ahora» / «No escucha ahora»),
// the text that goes in the intent (one clean line, ≤ 190 bytes, refused when longer) and the page's accessor. The look and the whole loop are
// checked in the browser leg (screenshots in work/ia-organizacion/capturas/llamar/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearDentro, avisoAceptado, aceptarAviso, CLAVE_AVISO } from "../apps/plaza/llamar-nucleo.ts";
import { luzEscucha, promptHablar, textos, IDIOMAS } from "../apps/plaza/gente-ia.ts";
import { es } from "../apps/plaza/gente-ia-es.ts";
import { crearLlamarPagina, leerCfg, prepararTexto } from "../features/llamar/client.ts";
import { crearBurbujaPagina } from "../features/burbuja/client.ts";
import cliente from "../features/cliente.ts";
import { TEXTO_MAX } from "../features/llamar/feature.ts";
import type { IAPublica } from "../features/ia/feature.ts";

const ACTIVA: IAPublica = { estado: "activa", responde: { comunidad: "La Torre", nombre: "Ana" }, puede: { construir: true }, atenta: false };

test("bubbles you are inside: enter, leave, the AI going away; the name loses the « · IA» mark", () => {
  const d = crearDentro();
  assert.deepEqual(d.lista(), []);
  d.entra(7, "Ada · IA"); d.entra(3, "Bea");
  assert.deepEqual(d.lista(), [{ ia: 3, nombre: "Bea" }, { ia: 7, nombre: "Ada" }], "by entity");
  assert.equal(d.esta(7), true); assert.equal(d.nombre(7), "Ada");
  d.sale(7); assert.equal(d.esta(7), false);
  d.quita(3); assert.deepEqual(d.lista(), []);
  d.sale(99); d.quita(99); // leaving a bubble you were never in changes nothing
  d.entra(5, ""); assert.equal(d.nombre(5), "una IA", "a name that did not arrive reads as «una IA»");
});

test("the E prompt offers the nearest AI you are inside that takes calls by button; none when none does", () => {
  const d = crearDentro();
  d.entra(1, "Ada"); d.entra(2, "Bea"); d.entra(3, "Cora");
  const dist: Record<number, number | null> = { 1: 3.5, 2: 1.2, 3: null };
  assert.deepEqual(d.elegir(() => true, (i) => dist[i]), { ia: 2, nombre: "Bea", distancia: 1.2 });
  assert.deepEqual(d.elegir((i) => i !== 2, (i) => dist[i]), { ia: 1, nombre: "Ada", distancia: 3.5 }, "Bea has the button off: the next one");
  assert.deepEqual(d.elegir((i) => i === 3, (i) => dist[i]), { ia: 3, nombre: "Cora", distancia: 0 }, "an unknown distance is offered as 0, not Infinity");
  assert.equal(d.elegir(() => false, () => 1), null);
  assert.equal(crearDentro().elegir(() => true, () => 1), null, "inside no bubble: no prompt");
});

test("the notice «lo lee su cerebro» is asked once per browser, and a browser with no storage asks again", () => {
  const m = new Map<string, string>();
  const almacen = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  assert.equal(avisoAceptado(almacen), false);
  aceptarAviso(almacen);
  assert.equal(m.get(CLAVE_AVISO), "1");
  assert.equal(avisoAceptado(almacen), true);
  assert.equal(avisoAceptado(null), false); aceptarAviso(null);
  const roto = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(avisoAceptado(roto), false); aceptarAviso(roto); // a browser that refuses storage: never a crash
});

test("words: the notice says who reads it and who sees the answer; every language has the same keys", () => {
  assert.equal(es.avisoPrevio, "Lo que le digas lo lee su cerebro (la empresa de esa IA) fuera del mundo, y su respuesta la ven quienes estén cerca.");
  assert.equal(es.hablar, "Hablar con ella");
  for (const [idioma, t] of Object.entries(IDIOMAS)) assert.deepEqual(Object.keys(t).sort(), Object.keys(es).sort(), `${idioma}: same keys as es`);
  assert.equal(textos("ja").hablar, "Hablar con ella", "ja, ko and pt-br are pending: Spanish");
  assert.equal(promptHablar("Ada · IA"), "hablar con Ada");
  assert.equal(promptHablar("Ada", "pt-br"), "hablar con Ada");
});

test("the card's light: listening when the brain used its listening tools less than 90 s ago, else not listening", () => {
  assert.deepEqual(luzEscucha({ ...ACTIVA, atenta: true }), { escucha: true, texto: "Escuchando ahora" });
  assert.deepEqual(luzEscucha(ACTIVA), { escucha: false, texto: "No escucha ahora" });
  assert.deepEqual(luzEscucha({ ...ACTIVA, estado: "dormida", atenta: true }), { escucha: true, texto: "Escuchando ahora" }, "asleep or not, the light says what the brain does");
});

test("the text of a call: one clean line, at most 190 bytes, refused (never cut) when longer", () => {
  assert.deepEqual(prepararTexto("  hola,\n¿me   oyes?  "), { texto: "hola, ¿me oyes?", bytes: 16, largo: false });
  assert.deepEqual(prepararTexto(""), { texto: "", bytes: 0, largo: false });
  assert.equal(prepararTexto("a\u0000b\u202eC").texto, "a b C", "control and direction characters become spaces");
  assert.equal(prepararTexto("x".repeat(TEXTO_MAX)).largo, false);
  const largo = prepararTexto("x".repeat(TEXTO_MAX + 1));
  assert.equal(largo.largo, true); assert.equal(largo.bytes, TEXTO_MAX + 1);
  assert.equal(prepararTexto("ñ".repeat(100)).largo, true, "bytes, not letters: 100 ñ are 200 bytes");
  assert.equal(prepararTexto("ñ".repeat(95)).largo, false);
});

test("the AI's way of being called as the world says it: odd values read as the house default", () => {
  assert.deepEqual(leerCfg(undefined), { nombre: true, barra: true, boton: true, dentro: true, frase: "" });
  assert.deepEqual(leerCfg({ nombre: false, boton: "no", frase: 5 }), { nombre: false, barra: true, boton: true, dentro: true, frase: "" });
  assert.deepEqual(leerCfg({ boton: false, dentro: false, frase: "agente, responde" }), { nombre: true, barra: true, boton: false, dentro: false, frase: "agente, responde" });
});

test("page accessor: reads the state, asks `llamar {ia, texto}` and refuses too long a text before sending", () => {
  const pagina = crearLlamarPagina();
  assert.equal(pagina.de(4), null, "before the part is set up");
  assert.equal(pagina.puedeBoton(4), false);
  assert.deepEqual(pagina.llamar(4, "hola"), { ok: false, why: "la página aún no ha arrancado" });
  const estado = new Map<string, Record<string, unknown>>([["4", { nombre: true, barra: true, boton: true, dentro: true, frase: "" }], ["5", { boton: false }]]);
  const enviados: [string, Record<string, unknown>][] = [];
  pagina.part.setup({
    id: "llamar", on: () => {}, send: (i, m) => { enviados.push([i, m as never]); return { ok: true }; }, action: () => {}, self: () => 0, view: {} as never,
    state: { get: (k) => estado.get(k) as never, keys: () => [...estado.keys()], onChange: () => {} },
  });
  assert.equal(pagina.puedeBoton(4), true);
  assert.equal(pagina.puedeBoton(5), false, "its keeper switched the button off");
  assert.equal(pagina.puedeBoton(9), false, "not an AI");
  assert.deepEqual(pagina.llamar(4, " hola, ¿me oyes? "), { ok: true });
  assert.deepEqual(enviados, [["llamar", { ia: 4, texto: "hola, ¿me oyes?" }]]);
  const r = pagina.llamar(4, "x".repeat(300));
  assert.equal(r.ok, false); assert.match((r as { why: string }).why, /190/);
  assert.equal(enviados.length, 1, "nothing sent");
});

test("the page knows the part, and `sales` reaches the bubble's accessor (the prompt goes when you leave)", () => {
  assert.ok(cliente.some((p) => p.feature.id === "llamar"), "in features/cliente.ts");
  const pagina = crearBurbujaPagina();
  const eventos = new Map<string, (m: Record<string, unknown>) => void>();
  pagina.part.setup({
    id: "burbuja", on: (e, f) => { eventos.set(e, f as never); }, send: () => ({ ok: true }), action: () => {}, self: () => 0, view: {} as never,
    state: { get: () => undefined, keys: () => [], onChange: () => {} },
  });
  const salidas: [number, string][] = [];
  pagina.alSalir((ia, n) => salidas.push([ia, n]));
  eventos.get("sales")!({ ia: 5, nombre: "Ada" }); eventos.get("sales")!({ ia: "x" }); eventos.get("sales")!({ ia: 6 });
  assert.deepEqual(salidas, [[5, "Ada"], [6, ""]]);
  pagina.alSalir(() => { throw new Error("a page's listener must not stop the rest"); });
  eventos.get("sales")!({ ia: 7, nombre: "Z" });
  assert.equal(salidas.length, 3);
});
