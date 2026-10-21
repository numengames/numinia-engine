// v2 paridad: «Construir» in the VR menu. The text for each state (pure), and the builder's hands (constructor-xr.ts)
// only build once the mode is on: pressing «Construir → Empezar» turns it on, «Dejar de construir» or leaving VR off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esInvitado, vistaConstruirVR, TEXTO_INVITADO, TEXTO_SIN_PERMISO } from "../apps/plaza/construir-vr-logica.ts";
import { montarConstructorVR } from "../apps/plaza/constructor-xr.ts";
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
  const c = {
    estado: { puede: o.puede ?? true, seleccionado: "", seleccionados: [] as string[], ultimoRechazo: "", modo: "mover" },
    objeto: (id: string) => ({ id, nombre: "Bloque" }),
    seleccionar: (id: string) => { c.estado.seleccionado = id; return { ok: true as const }; },
    transformar: () => ({ ok: true as const }), duplicar: () => ({ ok: true as const }),
  };
  const view = {
    vr: { active: true, nota: () => {} },
    editor: { pickRayo: () => "obj1", puntoBajoRayo: () => ({ x: 0, y: 0, z: 0 }), dondeEsta: () => null, poner: () => {}, sostener: () => {} },
    manos: { rayoDe: () => ({ origen: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 0, z: -1 } }), entrada: (l: "izq" | "der") => ({ gatillo: gatillo[l], agarre: 0, mano: true }), vibrar: () => {} },
  };
  const m = montarConstructorVR(c as never, view as never);
  return { c, view, m, gatillo };
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
