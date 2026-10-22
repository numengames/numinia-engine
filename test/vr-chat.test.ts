// v7 (el chat en VR): the «Chat» section of the VR menu. The pure part (the last lines as the computer's list writes
// them, the six quick phrases, the layout and the letter sizes, picking the lines that fit) and the panel's behaviour
// with a fake canvas: the phrases are content buttons, pressing one runs the page's action, a closed chat is not sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { FRASES, MENSAJES_MAX, LINEAS_POR_MENSAJE, TEXTO, ultimosMensajes, textoDeMensaje, elegirLineas, disposicion, medidasChat, gradosDePx, type LineaChat } from "../packages/render/src/menu-chat.ts";
import { LIENZO, CONTENIDO, BOTON_MIN, idSeccion, idBoton, zonaDe, seccionDeId, SECCIONES, type Rect } from "../packages/render/src/menu-vr.ts";
import { createMenuInvocado, type Proveedor, type ContenidoChat } from "../packages/render/src/menu-invocado.ts";
import { seccion } from "../packages/render/src/menu-secciones.ts";
import { crearCliente } from "../features/chat/client.ts";

const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined), set: () => true }) });
(globalThis as { document?: unknown }).document ??= { createElement: lienzoFalso };

const L = (texto: string, o: Partial<LineaChat> = {}): LineaChat => ({ tipo: "cerca", nombre: "Ana", texto, tuyo: false, ...o });

test("the six quick phrases are the brief's, in reading order", () => {
  assert.deepEqual([...FRASES], ["¡Hola!", "Sí", "No", "Gracias", "Ven aquí", "Un momento"]);
  assert.ok(FRASES.length >= 4 && FRASES.length <= 6);
});
test("last messages: the last six, written as the computer's list writes them (Tú, zone, before, notices)", () => {
  const todas: LineaChat[] = Array.from({ length: 9 }, (_, i) => L(`m${i}`));
  const ult = ultimosMensajes(todas);
  assert.equal(ult.length, MENSAJES_MAX); assert.deepEqual(ult.map((m) => m.texto), ["m3", "m4", "m5", "m6", "m7", "m8"]);
  const m = ultimosMensajes([L("hola", { tuyo: true }), L("a todos", { tipo: "zona", nombre: "Luis" }), L("ayer", { tipo: "antes", nombre: "Eva" }), L("Estás en silencio", { tipo: "aviso", nombre: "" }), L("   ", {}), L("sin nombre", { nombre: "" })]);
  assert.deepEqual(m.map(textoDeMensaje), ["Tú: hola", "Luis (a la zona): a todos", "Eva (antes): ayer", "Estás en silencio", "Alguien: sin nombre"]);
  assert.deepEqual(m.map((x) => x.clase), ["yo", "otro", "otro", "aviso", "otro"]);
  assert.deepEqual(ultimosMensajes([]), []);
  assert.equal(ultimosMensajes([L("a\n\n  b\tc")])[0].texto, "a b c", "one clean line");
});
test("picking lines: the newest messages that fit, oldest first; the newest is always kept", () => {
  assert.deepEqual(elegirLineas([["a"], ["b", "c"], ["d"]], 4), [["a"], ["b", "c"], ["d"]]);
  assert.deepEqual(elegirLineas([["a"], ["b", "c"], ["d", "e"]], 4), [["b", "c"], ["d", "e"]], "the oldest gives way");
  assert.deepEqual(elegirLineas([["a"], ["b", "c", "d", "e", "f"]], 3), [["b", "c", "d"]], "a long newest one is cut, not dropped");
  assert.deepEqual(elegirLineas([], 3), []);
  assert.ok(MENSAJES_MAX * LINEAS_POR_MENSAJE >= disposicion().lineasCaben, "the box is not taller than six two-line messages");
});
test("layout: everything inside the content area, the buttons do not overlap and are big enough to hit with a ray", () => {
  const d = disposicion();
  const dentro = (r: Rect) => r.x >= CONTENIDO.x && r.y >= CONTENIDO.y && r.x + r.w <= CONTENIDO.x + CONTENIDO.w && r.y + r.h <= CONTENIDO.y + CONTENIDO.h && r.x + r.w <= LIENZO.w && r.y + r.h <= LIENZO.h;
  for (const r of [d.titulo, d.mensajes, d.nota, ...d.frases]) assert.ok(dentro(r), JSON.stringify(r));
  assert.equal(d.frases.length, FRASES.length);
  const cruza = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < d.frases.length; i++) {
    assert.ok(!cruza(d.frases[i], d.mensajes) && !cruza(d.frases[i], d.nota), `phrase ${i} over the messages or the footnote`);
    for (let j = i + 1; j < d.frases.length; j++) assert.ok(!cruza(d.frases[i], d.frases[j]), `phrases ${i} and ${j} overlap`);
  }
  assert.ok(!cruza(d.mensajes, d.nota) && !cruza(d.titulo, d.mensajes));
  assert.ok(d.lineasCaben >= 6, `room for ${d.lineasCaben} lines`);
  const { minBotonPx } = medidasChat(); assert.ok(minBotonPx >= BOTON_MIN, `a phrase button is ${minBotonPx} px`);
});
test("letters: messages and phrases are at least 1.2° tall at the menu's distance", () => {
  assert.ok(gradosDePx(TEXTO.mensaje) >= 1.2, `${gradosDePx(TEXTO.mensaje)}°`);
  assert.ok(gradosDePx(TEXTO.frase) >= 1.2);
  assert.ok(medidasChat().minLetraGrados >= 1.2);
});
test("the section is the computer's «Chat»: same id, icon and name, a row of the VR panel after Ajustes", () => {
  const s = seccion("chat");
  assert.deepEqual([s.id, s.icono, s.es, s.botones[0]], ["chat", "chat-circle", "Chat", "chat-boton"]);
  assert.ok(s.aparatos.includes("vr") && !s.sinVR);
  assert.equal(SECCIONES.at(-1), "chat"); assert.equal(seccionDeId(idSeccion(SECCIONES.length - 1)), "chat");
});

// ── the panel: phrases are buttons; pressing sends through the page's chat ────────────────────────────────────────
function panelDeChat(lineas: LineaChat[]) {
  const dicho: string[] = [], reloj = { t: 1000 };
  const m = createMenuInvocado({ scene: new THREE.Scene(), ahora: () => reloj.t, salir: () => {} });
  const contenido = (): ContenidoChat => ({ tipo: "chat", titulo: "Chat", mensajes: ultimosMensajes(lineas), vacio: "nada", frases: FRASES.map((texto) => ({ texto, accion: () => { dicho.push(texto); } })) });
  const proveedor: Proveedor = { contenido: (v) => (v === "chat" ? contenido() : { tipo: "lista", vacio: "", filas: [] }), desactivadas: () => new Set() };
  m.proveedor(proveedor);
  return { m, dicho, reloj, ojo: new THREE.Vector3(0, 1.6, 0), mira: new THREE.Vector3(0, 0, -1) };
}
test("panel: Chat lists the last lines and has one button per phrase; the ray's hit test finds each; pressing says it", () => {
  const { m, dicho, ojo, mira } = panelDeChat([L("hola"), L("qué tal", { tuyo: true })]);
  m.abrir(ojo, mira, "chat");
  const e = m.estado();
  assert.equal(e.vista, "chat"); assert.equal(e.contenido, "chat"); assert.deepEqual(e.filas, ["Ana: hola", "Tú: qué tal"]); assert.equal(e.botones, FRASES.length);
  const p = m.paneles()[0], d = disposicion();
  d.frases.forEach((r, i) => assert.equal(p.fila(new THREE.Vector2((r.x + r.w / 2) / LIENZO.w, 1 - (r.y + r.h / 2) / LIENZO.h)), idBoton(i), `phrase ${i}`));
  assert.equal(zonaDe(0.95, 0.05, d.frases), 0, "the empty corner is nothing");
  p.pulsar!(idBoton(4)); p.pulsar!(idBoton(0));
  assert.deepEqual(dicho, ["Ven aquí", "¡Hola!"], "each press runs the page's action once");
  assert.ok(m.zonaMundo(idBoton(5)), "each phrase has a place in the world (for the e2e)");
});
test("panel: a notice and a long message paint without breaking; an empty chat says so and still offers the phrases", () => {
  const { m, ojo, mira } = panelDeChat([L("x".repeat(190)), L("Estás en silencio 5 min más", { tipo: "aviso", nombre: "" })]);
  m.abrir(ojo, mira, "chat"); assert.equal(m.estado().botones, FRASES.length);
  const vacio = panelDeChat([]); vacio.m.abrir(vacio.ojo, vacio.mira, "chat");
  assert.deepEqual(vacio.m.estado().filas, []); assert.equal(vacio.m.estado().botones, FRASES.length);
});

// ── sending goes the computer's way: the chat client's own `decir` ────────────────────────────────────────────────
test("a phrase is sent with chat.decir(texto, «cerca»): the page's pace applies, a page that has not started refuses with a reason", () => {
  const reloj = { ms: 0 }, c = crearCliente(() => reloj.ms);
  const r = c.chat.decir(FRASES[0], "cerca");
  assert.equal(r.ok, false); assert.match((r as { why: string }).why, /aún no ha arrancado/, "nothing sent without the session: the reason is shown as a note");
  for (const f of FRASES) assert.ok(new TextEncoder().encode(f).length <= 200, `${f} fits the 200-byte limit`);
});
