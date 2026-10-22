// v2 paridad: «Construir» in the VR menu. The text for each state (pure), and the builder's hands (constructor-xr.ts)
// only build once the mode is on: pressing «Construir → Empezar» turns it on, «Dejar de construir» or leaving VR off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esInvitado, vistaConstruirVR, TEXTO_INVITADO, TEXTO_SIN_PERMISO } from "../apps/plaza/construir-vr-logica.ts";
import { montarConstructorVR, NOTA_DEJADO } from "../apps/plaza/constructor-xr.ts";
import { nombreDe } from "../packages/instance/src/identidad.ts";

test("a guest without the role is told to come in with their name; a named person without it, to ask for the role", () => {
  const id = "abcdef0123456789";
  assert.equal(esInvitado({ id, nombre: nombreDe(id) }), true);
  assert.equal(esInvitado({ id, nombre: "Lía" }), false);
  assert.equal(esInvitado(null), false);
  assert.deepEqual(vistaConstruirVR({ puede: false, invitado: true, activo: false }), { tipo: "negado", texto: "Entra con tu nombre para construir" });
  assert.equal(TEXTO_INVITADO, "Entra con tu nombre para construir");
  assert.deepEqual(vistaConstruirVR({ puede: false, invitado: false, activo: false }), { tipo: "negado", texto: TEXTO_SIN_PERMISO });
});

test("with the role: «Empezar» first, «Dejar de construir» once it is on", () => {
  const a = vistaConstruirVR({ puede: true, invitado: true, activo: false });
  assert.equal(a.tipo, "listo"); assert.equal((a as { boton: string }).boton, "Empezar");
  const b = vistaConstruirVR({ puede: true, invitado: false, activo: true });
  assert.equal(b.tipo, "activo"); assert.equal((b as { boton: string }).boton, "Dejar de construir");
});

// ── the hands ──
function montar(o: { puede?: boolean } = {}) {
  const gatillo = { izq: 0, der: 0 };
  const apunta: { izq: string | null; der: string | null } = { izq: null, der: null }; // what each ray is on (a panel reads «panel:<fila>»)
  const atras: (() => void)[] = [], notas: string[] = [], fichas: (null | { titulo: string })[] = [];
  const c = {
    estado: { puede: o.puede ?? true, seleccionado: "", seleccionados: [] as string[], ultimoRechazo: "", modo: "mover" },
    objeto: (id: string) => ({ id, nombre: "Bloque" }),
    seleccionar: (id: string) => { c.estado.seleccionado = id; return { ok: true as const }; },
    transformar: () => ({ ok: true as const }), duplicar: () => ({ ok: true as const }),
  };
  const sostenidos: (string | null)[] = [];
  const view = {
    vr: { active: true, nota: (t: string) => { notas.push(t); }, ficha: (d: null | { titulo: string }) => { fichas.push(d); }, onAtras: (fn: () => void) => { atras.push(fn); } },
    editor: { pickRayo: () => "obj1", puntoBajoRayo: () => ({ x: 0, y: 0, z: 0 }), dondeEsta: () => ({ x: 0, y: 0, z: 0 }), poner: () => {}, sostener: (k: string | null) => { sostenidos.push(k); } },
    manos: { rayoDe: () => ({ origen: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 } }), entrada: (l: "izq" | "der") => ({ gatillo: gatillo[l], agarre: 0, mano: true }), vibrar: () => {}, estado: () => ({ izq: { apunta: apunta.izq }, der: { apunta: apunta.der } }) },
  };
  const m = montarConstructorVR(c as never, view as never);
  const atrasPulsado = () => { for (const f of atras) f(); };
  return { c, view, m, gatillo, apunta, atrasPulsado, notas, fichas, sostenidos };
}
const cuadros = () => new Promise((r) => setTimeout(r, 90));

test("the hands do nothing until the mode is on; «Empezar» turns it on and a trigger selects", async () => {
  const { c, m, gatillo } = montar();
  try {
    assert.equal(m.activo(), false);
    gatillo.der = 1; await cuadros(); gatillo.der = 0; await cuadros();
    assert.equal(c.estado.seleccionado, "", "not building yet: the trigger selects nothing");
    assert.deepEqual(m.entrar(), { ok: true }); assert.equal(m.activo(), true);
    gatillo.der = 1; await cuadros(); gatillo.der = 0; await cuadros();
    assert.equal(c.estado.seleccionado, "obj1", "building: the trigger selects what the ray points at");
    m.salir();
    assert.equal(m.activo(), false); assert.equal(c.estado.seleccionado, "", "«Dejar de construir» drops the selection");
    gatillo.der = 1; await cuadros(); gatillo.der = 0; await cuadros();
    assert.equal(c.estado.seleccionado, "", "off again");
  } finally { m.parar(); }
});

test("the mode is refused without the role or outside VR, and ends when you leave VR", async () => {
  const sin = montar({ puede: false });
  try { const r = sin.m.entrar(); assert.equal(r.ok, false); assert.match((r as { why: string }).why, /permiso/); assert.equal(sin.m.activo(), false); } finally { sin.m.parar(); }
  const fuera = montar(); fuera.view.vr.active = false;
  try { const r = fuera.m.entrar(); assert.equal(r.ok, false); assert.match((r as { why: string }).why, /dentro de VR/); } finally { fuera.m.parar(); }
  const a = montar();
  try { a.m.entrar(); assert.equal(a.m.activo(), true); a.view.vr.active = false; await cuadros(); assert.equal(a.m.activo(), false, "leaving VR ends it"); } finally { a.m.parar(); }
});

// ── v13: the way out of «Construir» in VR (Pablo's headset QA, 2026-10-22: «este no se sale del menú») ──
test("B (the headset's «back») leaves the mode in one press: lets go of what a hand holds, drops the selection and says so", async () => {
  const { c, m, gatillo, atrasPulsado, notas, sostenidos } = montar();
  try {
    m.entrar();
    gatillo.der = 1; await cuadros(); assert.equal(c.estado.seleccionado, "obj1", "the trigger selected it");
    await new Promise((r) => setTimeout(r, 260)); // past PRENSION_MS: it is held now
    assert.equal(m.cogido("der"), "obj1");
    atrasPulsado();
    assert.equal(m.activo(), false, "B leaves the mode");
    assert.equal(m.cogido("der"), null, "and lets go of what the hand holds");
    assert.equal(sostenidos.at(-1), null, "the editor is told to stop holding it");
    assert.equal(c.estado.seleccionado, "", "the card goes with the selection");
    assert.equal(notas.at(-1), NOTA_DEJADO);
    gatillo.der = 0; await cuadros();
    gatillo.der = 1; await cuadros(); gatillo.der = 0; await cuadros();
    assert.equal(c.estado.seleccionado, "", "the rays are the world's again: the trigger selects nothing");
    notas.length = 0; atrasPulsado(); assert.deepEqual(notas, [], "B outside the mode does nothing here (the dialogue's own «back» is another listener)");
  } finally { m.parar(); }
});

test("a ray on a panel (the VR menu, the watch, the card) is for the panel: the trigger does not select what is behind it", async () => {
  const { c, m, gatillo, apunta } = montar();
  try {
    m.entrar();
    apunta.der = "panel:10"; // the menu's «Tú», with a block behind it and nothing selected
    gatillo.der = 1; await cuadros(); gatillo.der = 0; await cuadros();
    assert.equal(c.estado.seleccionado, "", "nothing behind the menu is picked");
    apunta.der = null;
    gatillo.der = 1; await cuadros(); gatillo.der = 0; await cuadros();
    assert.equal(c.estado.seleccionado, "obj1", "off the panel it picks again");
  } finally { m.parar(); }
});

test("«Cerrar» with the other hand lets go of what the first one holds, and leaving VR drops the selection too", async () => {
  const { c, m, gatillo, view } = montar();
  try {
    m.entrar();
    gatillo.der = 1; await cuadros(); await new Promise((r) => setTimeout(r, 260));
    assert.equal(m.cogido("der"), "obj1");
    c.seleccionar(""); await cuadros(); // what «Cerrar» does
    assert.equal(m.cogido("der"), null, "the hold ends with the selection: no object stuck to the ray with the card gone");
    gatillo.der = 0; await cuadros();
    m.entrar(); c.seleccionar("obj1");
    view.vr.active = false; await cuadros();
    assert.equal(m.activo(), false); assert.equal(c.estado.seleccionado, "", "leaving VR leaves nothing selected behind");
  } finally { m.parar(); }
});
