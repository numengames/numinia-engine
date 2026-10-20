// D-041 historia C («cable sin JSON»): a cable as a sentence with blanks. Pure parts function + the options builder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { huecosDeCable, opcionesEspera, receptorNuevo, textoEspera, ESPERAS_S, CONTEXTO_VACIO } from "../features/disparadores/cable-huecos.ts";
import type { Parte, ContextoCable } from "../features/disparadores/cable-huecos.ts";
import { contextoDelCable } from "../features/disparadores/cable-contexto.ts";
import { FRASES, IDIOMAS } from "../features/disparadores/cable-frase.ts";
import { ACCIONES, RECEPTORES_MAX, TIPOS } from "../features/disparadores/feature.ts";
import { leerReceptor } from "../features/disparadores/server.ts";

const CTX: ContextoCable = {
  objetos: [{ valor: "Farola", texto: "Farola" }, { valor: "Puerta", texto: "Puerta" }],
  movedores: [{ valor: "lift", texto: "Ascensor (lift)" }],
  misiones: [{ valor: "tutorial", texto: "Primeros pasos (tutorial)" }],
  sonidos: [{ valor: "campana", texto: "campana" }, { valor: "puerta", texto: "puerta" }],
};
const huecos = (partes: Parte[]) => partes.flatMap((p) => ("hueco" in p ? [p] : []));
const texto = (partes: Parte[]) => partes.filter((p): p is { texto: string } => "texto" in p).map((p) => p.texto).join("");
const todos = (c: ReturnType<typeof huecosDeCable>) => [...huecos(c.cuando), ...c.acciones.flatMap(huecos), ...huecos(c.espera)];

test("cable-huecos: the example sentence has its slots in reading order and the full sentence for a screen reader", () => {
  const c = huecosDeCable({ nombre: "Botón rojo", tipo: "boton", cooldown: 5, unSoloUso: false, receptores: [{ accion: "muestra", objeto: "Farola" }] }, "es", CTX);
  assert.deepEqual(todos(c).map((h) => h.hueco), ["tipo", "nombre", "accion", "objeto", "espera", "unSoloUso"]);
  assert.equal(texto(c.cuando), "Cuando  ,"); // «Cuando [tipo] [nombre],»
  assert.equal(c.fin, ".");
  assert.equal(c.frase, "Cuando alguien pulse “Botón rojo”, muestra “Farola”. Espera 5 s.");
  const tipo = huecos(c.cuando)[0]!;
  assert.deepEqual(tipo.control === "select" && tipo.opciones!.map((o) => o.valor), [...TIPOS], "only the three kinds");
  const accion = huecos(c.acciones[0]!)[0]!;
  assert.equal(accion.control, "select");
  assert.deepEqual(accion.opciones!.map((o) => o.valor), [...ACCIONES], "only the eight actions");
  assert.equal(accion.valor, "muestra");
  const objeto = huecos(c.acciones[0]!)[1]!;
  assert.deepEqual(objeto.opciones, CTX.objetos, "the object comes from the world's list");
  assert.equal(objeto.valor, "Farola");
});

test("cable-huecos: every kind x every action x es/en gives named, labelled slots of the right control; texts come from the language file", () => {
  const esperados: Record<string, string[]> = {
    muestra: ["accion", "objeto"], oculta: ["accion", "objeto"], mueve: ["accion", "objeto"], teletransporta: ["accion", "x", "y", "z", "aqui"],
    da_paso: ["accion", "paso", "mision"], abre_enlace: ["accion", "enlace"], suena: ["accion", "sonido"], vuelve_a_seguro: ["accion"],
  };
  for (const tipo of TIPOS) for (const accion of ACCIONES) for (const idioma of IDIOMAS) {
    const c = huecosDeCable({ nombre: "N", tipo, senal: "s", cooldown: 0, receptores: [receptorNuevo(accion, CTX, { x: 1, y: 2, z: 3 })] }, idioma, CTX);
    const nombres = c.acciones[0]!.flatMap((p) => ("hueco" in p ? [p.hueco] : [])).sort();
    assert.deepEqual(nombres, [...esperados[accion]!].sort(), `${tipo} x ${accion} x ${idioma}`);
    for (const h of todos(c)) assert.ok(h.etiqueta && !/\{/.test(h.etiqueta), `label of ${h.hueco} (${idioma})`);
    assert.deepEqual(huecos(c.cuando).map((h) => h.hueco), tipo === "senal" ? ["tipo", "senal"] : ["tipo", "nombre"]);
    const sel = c.acciones[0]!.find((p): p is Extract<Parte, { hueco: string }> => "hueco" in p && p.hueco === "accion")!;
    assert.equal(sel.opciones!.find((o) => o.valor === accion)!.texto, FRASES[idioma][`opcion.${accion}`]);
    // the receiver the editor starts with is a valid one for the server's own reader (except what needs a free choice)
    if (accion !== "abre_enlace") // the link starts as «https://», to be completed: the server refuses it until then
       assert.equal(typeof leerReceptor(receptorNuevo(accion, CTX, { x: 1, y: 2, z: 3 })), "object", `${accion} starts valid`);
  }
});

test("cable-huecos: only valid values are selectable; free text only for name, signal, https link (and a quest when the world lists none)", () => {
  const c = huecosDeCable({ tipo: "boton", receptores: [{ accion: "mueve", objeto: "lift" }, { accion: "da_paso", mision: "tutorial", paso: 2 }, { accion: "abre_enlace", enlace: "https://numinia.org" }, { accion: "suena", sonido: "campana" }] }, "es", CTX);
  const por = Object.fromEntries(c.acciones.flatMap(huecos).filter((h) => h.hueco !== "accion").map((h) => [h.hueco, h]));
  assert.deepEqual(por.objeto!.opciones, CTX.movedores, "«mueve» chooses among the world's movers, not objects");
  assert.equal(por.mision!.control, "select"); assert.deepEqual(por.mision!.opciones, CTX.misiones);
  assert.deepEqual(por.sonido!.opciones, CTX.sonidos);
  assert.equal(por.enlace!.control, "texto"); assert.equal(por.paso!.control, "numero"); assert.equal(por.paso!.valor, "2");
  const sinMisiones = huecosDeCable({ tipo: "boton", receptores: [{ accion: "da_paso", mision: "x", paso: 1 }] }, "es", CONTEXTO_VACIO);
  assert.equal(huecos(sinMisiones.acciones[0]!).find((h) => h.hueco === "mision")!.control, "texto");
  // a thing the cable names that is no longer in the world still shows (so saving does not silently change it)
  const viejo = huecosDeCable({ tipo: "boton", receptores: [{ accion: "muestra", objeto: "Borrado" }] }, "es", CTX);
  const ops = huecos(viejo.acciones[0]!).find((h) => h.hueco === "objeto")!.opciones!;
  assert.equal(ops[0]!.valor, "Borrado"); assert.equal(ops.length, CTX.objetos.length + 1);
  // an empty world says so instead of an empty select
  assert.deepEqual(huecos(huecosDeCable({ tipo: "boton", receptores: [{ accion: "muestra", objeto: "" }] }, "es", CONTEXTO_VACIO).acciones[0]!).find((h) => h.hueco === "objeto")!.opciones, [{ valor: "", texto: "(no hay ninguno)" }]);
});

test("cable-huecos: the wait offers 0,1,2,5,10,30,60,300 s plus the current value when it is something else, sorted; clamped to 0..3600", () => {
  assert.deepEqual(ESPERAS_S, [0, 1, 2, 5, 10, 30, 60, 300]);
  assert.deepEqual(opcionesEspera(5).map((o) => o.valor), ESPERAS_S.map(String));
  assert.deepEqual(opcionesEspera(7).map((o) => o.valor), ["0", "1", "2", "5", "7", "10", "30", "60", "300"]);
  assert.deepEqual(opcionesEspera(999999).map((o) => o.valor).slice(-2), ["300", "3600"]);
  assert.deepEqual(opcionesEspera(-4).map((o) => o.valor), ESPERAS_S.map(String));
  assert.equal(textoEspera(0), "sin espera"); assert.equal(textoEspera(5), "5 s"); assert.equal(textoEspera(300), "5 min"); assert.equal(textoEspera(300, "en"), "5 min"); assert.equal(textoEspera(0, "en"), "no wait");
  assert.equal(huecos(huecosDeCable({ tipo: "boton", cooldown: 7, receptores: [] }, "es", CTX).espera).find((h) => h.hueco === "espera")!.valor, "7");
});

test("cable-huecos: several actions, the cap, odd input never throws, one use is a checkbox", () => {
  const rs = Array.from({ length: 12 }, () => ({ accion: "vuelve_a_seguro" }));
  const c = huecosDeCable({ tipo: "zona", nombre: "Z", unSoloUso: true, receptores: rs }, "es", CTX);
  assert.equal(c.acciones.length, RECEPTORES_MAX); assert.equal(c.maxAcciones, RECEPTORES_MAX);
  assert.equal(texto(c.acciones[1]!).startsWith("y "), true, "the second action is joined by «y»");
  assert.deepEqual(c.acciones.map((a) => huecos(a)[0]!.receptor), [0, 1, 2, 3, 4, 5, 6, 7]);
  const caja = huecos(c.espera).find((h) => h.hueco === "unSoloUso")!;
  assert.equal(caja.control, "casilla"); assert.equal(caja.valor, "1"); assert.ok(caja.visible);
  for (const raro of [null, undefined, 3, "x", [], { tipo: 7, receptores: "no" }, { receptores: [null, 5, { accion: "rara" }] }]) {
    const r = huecosDeCable(raro as never, "zz", CTX);
    assert.ok(r.cuando.length && Array.isArray(r.acciones));
  }
  // an unknown action shows a «choose…» select so the person must pick a real one
  const rara = huecos(huecosDeCable({ tipo: "boton", receptores: [{ accion: "rara" }] }, "es", CTX).acciones[0]!)[0]!;
  assert.equal(rara.valor, ""); assert.equal(rara.opciones![0]!.valor, "");
});

test("cable-huecos: pure (same input, same output, input not changed) and no word of its own", () => {
  const entrada = { nombre: "N", tipo: "boton", cooldown: 5, receptores: [{ accion: "muestra", objeto: "Farola" }] };
  const copia = JSON.stringify(entrada);
  assert.deepEqual(huecosDeCable(entrada, "es", CTX), huecosDeCable(entrada, "es", CTX));
  assert.equal(JSON.stringify(entrada), copia);
  const en = huecosDeCable(entrada, "en", CTX);
  assert.equal(en.frase, "When someone presses “N”, it shows “Farola”. Waits 5 s.");
  assert.equal(texto(en.cuando), "When  ,"); // the English template, not Spanish words
});

test("cable-huecos: language files keep the same keys and the same {parameters} for the new editor texts", () => {
  const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  assert.deepEqual(Object.keys(FRASES.en).sort(), Object.keys(FRASES.es).sort());
  for (const k of Object.keys(FRASES.es) as (keyof typeof FRASES.es)[]) assert.equal(params(FRASES.en[k]), params(FRASES.es[k]), k);
  for (const a of ACCIONES) { assert.ok(FRASES.es[`editor.${a}`] && FRASES.es[`opcion.${a}`] && FRASES.en[`opcion.${a}`], a); }
});

test("cable-contexto: options come from the world's lists, named things by name, no duplicates, no looping beds or footsteps", () => {
  const c = contextoDelCable({
    objetos: [{ id: "f1", nombre: "Farola" }, { id: "f2", nombre: "Farola" }, { id: "f3", nombre: "" }, { id: "f4" }],
    movedores: [{ id: "lift", nombre: "Ascensor" }, { id: "p2" }],
    misiones: [{ id: "tutorial", titulo: "Primeros pasos" }],
    sonidos: { casa: { campana: "x", exito: "y" }, sonidos: { puerta: { bus: "efectos" }, "pasos-hierba": { bus: "pasos-propios" }, ambiente: { bus: "ambiente", bucle: true }, "ui-pulsar": { bus: "interfaz" } } },
  });
  assert.deepEqual(c.objetos.map((o) => o.valor).sort(), ["Farola", "f3", "f4"].sort());
  assert.deepEqual(c.movedores, [{ valor: "lift", texto: "Ascensor (lift)" }, { valor: "p2", texto: "p2" }]);
  assert.deepEqual(c.misiones, [{ valor: "tutorial", texto: "Primeros pasos (tutorial)" }]);
  assert.deepEqual(c.sonidos.map((o) => o.valor), ["campana", "exito", "puerta", "ui-pulsar"]);
  assert.deepEqual(contextoDelCable({ objetos: [], movedores: [], misiones: [], sonidos: null }), CONTEXTO_VACIO);
});
