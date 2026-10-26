// MIS-222 t_1b395abe · J18b story 4 (second slice): the hand that paints (apps/plaza/pintar-vr.ts) with fakes for the hands, the live tube and the
// saving: the trigger starts and ends a line, its pressure becomes the width, B throws the stroke away, the menu and a lost role stop it, a slip of
// the finger is not a line, and the press that chose the menu row does not start one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarPintarVR, presionDe, CIERRA, ABRE, NOTA_TIRADO, NOTA_DEJADO } from "../apps/plaza/pintar-vr.ts";
import { crearPincel } from "../apps/plaza/pincel.ts";
import { vistaPintarVR } from "../apps/plaza/construir-vr-logica.ts";

function montar(opt: { puede?: boolean } = {}) {
  const reg: string[] = [], notas: string[] = [];
  let mano: { x: number; y: number; z: number; gatillo: number; mano: boolean } | null = { x: 0, y: 1.2, z: 0, gatillo: 0, mano: false };
  const estado = { active: true, puede: opt.puede ?? true, menu: false };
  let atras: () => void = () => {}, cuadro: (dt: number) => void = () => {}, ocupada: (l: "izq" | "der") => boolean = () => false;
  // a real brush behind a fake sender, so «lleno» and «igual» come out as they do in the page
  let pincel: ReturnType<typeof crearPincel> | null = null, soltado: ((r: { ok: boolean; why?: string }) => void) | null = null;
  const pintar = {
    empezar: (op: { color: number; grosor: number }) => { reg.push(`empezar ${op.color} ${op.grosor}`); if (!estado.puede) return { ok: false as const, why: "no puedes" }; pincel = crearPincel(op); return { ok: true as const }; },
    punto: (p: { x: number; y: number; z: number; presion?: number }) => { if (!pincel) return { ok: false as const, why: "no" }; const r = pincel.mover(p); if (r === "lleno") { const op = pincel.opciones; reg.push("enviado-lleno"); pincel = crearPincel(op); pincel.mover(p); } return { ok: true as const, r }; },
    soltar: () => { reg.push(`soltar ${pincel?.puntos}`); pincel = null; return new Promise<{ ok: true } | { ok: false; why: string }>((ok) => { soltado = ok as never; }); },
    cancelar: () => { reg.push("cancelar"); pincel = null; },
    estado: () => ({ pintando: pincel !== null, puntos: pincel?.puntos ?? 0, trazos: 0, rechazados: 0, ultimo: "" }),
  };
  const vivo = {
    marcar: (p: readonly number[] | null) => { reg.push(p ? "marcar" : "marcar-nada"); }, empezar: (c: number, g: number) => reg.push(`v.empezar ${c} ${g}`), anadir: (q: readonly number[]) => reg.push(`v.anadir ${q[3]!.toFixed(2)}`),
    seguir: () => {}, terminar: (p?: Promise<unknown>) => reg.push(p ? "v.terminar+espera" : "v.terminar"), cancelar: () => reg.push("v.cancelar"), apagar: () => reg.push("v.apagar"),
  };
  const view = {
    vr: { get active() { return estado.active; }, nota: (t: string) => { notas.push(t); }, onAtras: (fn: () => void) => { atras = fn; }, menu: { get abierto() { return estado.menu; } } },
    manos: { pincel: () => mano, vibrar: () => { reg.push("vibra"); }, ocupar: (_n: string, fn: (l: "izq" | "der") => boolean) => { ocupada = fn; return () => {}; } },
    pincelVR: { cargar: async () => vivo, cadaCuadro: (fn: (dt: number) => void) => { cuadro = fn; return () => {}; } },
  };
  const p = montarPintarVR({ pintar: pintar as never, view: view as never, puede: () => estado.puede });
  const poner = (x: number, y: number, z: number, gatillo: number, esMano = false) => { mano = { x, y, z, gatillo, mano: esMano }; cuadro(0.011); };
  return { p, reg, notas, estado, poner, atras: () => atras(), ocupada: () => ocupada, quitarMano: () => { mano = null; cuadro(0.011); }, resolver: (r: { ok: boolean; why?: string }) => soltado?.(r) };
}
const espera = () => new Promise((r) => setTimeout(r, 5));

test("pressure: the trigger's travel above the opening level is the width (0.43 → 1 at the closing level…full), a hand's pinch is the neutral 0.5", () => {
  assert.equal(presionDe(ABRE, false), 0); assert.equal(presionDe(1, false), 1); assert.ok(Math.abs(presionDe(CIERRA, false) - (CIERRA - ABRE) / (1 - ABRE)) < 1e-9);
  assert.equal(presionDe(0, false), 0); assert.equal(presionDe(5, false), 1); assert.equal(presionDe(1, true), 0.5);
});

test("trigger held and the hand moving paints a line under the hand; letting go saves it; the right hand is held by the brush only while the mode is on", async () => {
  const t = montar();
  assert.equal(t.ocupada()("der"), false); assert.equal(t.p.entrar().ok, true); await espera();
  assert.equal(t.ocupada()("der"), true, "the right hand is the brush"); assert.equal(t.ocupada()("izq"), false, "the left keeps the watch and the menu");
  t.poner(0, 1.2, 0, 0.9); // the press that chose the menu row is still down: no line
  assert.equal(t.p.estado().pintando, false, "blocked until the trigger opens");
  t.poner(0, 1.2, 0, 0); t.poner(0, 1.2, 0, 0.7); // pressed again: the line begins
  assert.equal(t.p.estado().pintando, true);
  for (let i = 1; i <= 40; i++) t.poner(i * 0.005, 1.2, 0, 1);
  assert.ok(t.reg.filter((x) => x.startsWith("v.anadir")).length >= 12, "the live tube got the control points the brush kept");
  t.poner(0.2, 1.2, 0, 0.1); // let go
  assert.equal(t.p.estado().pintando, false);
  assert.ok(t.reg.includes("v.terminar+espera") && t.reg.some((x) => x.startsWith("soltar ")), "saved, and the live tube waits for the answer");
  assert.ok(!t.reg.includes("cancelar"));
  t.resolver({ ok: true }); await espera();
  assert.deepEqual(t.notas, []);
  t.p.salir(); assert.equal(t.ocupada()("der"), false, "the hand is free again");
});

test("a failed save says why in the headset; a refused start (no role) waits for the trigger to open", async () => {
  const t = montar();
  t.p.entrar(); t.poner(0, 1, 0, 0); t.poner(0, 1, 0, 1);
  for (let i = 1; i <= 10; i++) t.poner(i * 0.01, 1, 0, 1);
  t.poner(0.2, 1, 0, 0); t.resolver({ ok: false, why: "El mundo ya tiene todos los trazos que caben" }); await espera();
  assert.deepEqual(t.notas, ["No se pudo pintar: El mundo ya tiene todos los trazos que caben"]);
  const s = montar({ puede: false }); assert.equal(s.p.entrar().ok, false, "no permission: the mode does not start");
});

test("a slip of the finger (a tap that hardly moved) is dropped without a word; nothing is sent", async () => {
  const t = montar();
  t.p.entrar(); t.poner(0, 1, 0, 0); t.poner(0, 1, 0, 1); t.poner(0.002, 1, 0, 1); t.poner(0.002, 1, 0, 0);
  assert.ok(t.reg.includes("cancelar") && !t.reg.some((x) => x.startsWith("soltar ")), t.reg.join(","));
  assert.deepEqual(t.notas, []);
});

test("B with a line under the hand throws it away and the held trigger starts nothing new; B with the hand free leaves the mode", async () => {
  const t = montar();
  t.p.entrar(); await espera(); t.poner(0, 1, 0, 0); t.poner(0, 1, 0, 1); for (let i = 1; i <= 10; i++) t.poner(i * 0.01, 1, 0, 1);
  t.atras();
  assert.deepEqual(t.notas, [NOTA_TIRADO]); assert.ok(t.reg.includes("cancelar") && t.reg.includes("v.cancelar"));
  assert.equal(t.p.estado().modo, true, "still in the mode"); t.poner(0.5, 1, 0, 1); assert.equal(t.p.estado().pintando, false, "the trigger is still down: no new line");
  t.poner(0.5, 1, 0, 0); t.poner(0.5, 1, 0, 1); assert.equal(t.p.estado().pintando, true, "opened and pressed again: a new line");
  t.atras(); t.poner(0.5, 1, 0, 0); t.atras();
  assert.deepEqual(t.notas, [NOTA_TIRADO, NOTA_TIRADO, NOTA_DEJADO]); assert.equal(t.p.estado().modo, false);
});

test("the menu opening mid-line ends it (saved), the mode ends with VR or with the role, and a lost hand keeps what was painted", () => {
  const a = montar(); a.p.entrar(); a.poner(0, 1, 0, 0); a.poner(0, 1, 0, 1); for (let i = 1; i <= 10; i++) a.poner(i * 0.01, 1, 0, 1);
  a.estado.menu = true; a.poner(0.2, 1, 0, 1); assert.equal(a.p.estado().pintando, false); assert.ok(a.reg.some((x) => x.startsWith("soltar ")));
  const b = montar(); b.p.entrar(); b.poner(0, 1, 0, 0); b.poner(0, 1, 0, 1); for (let i = 1; i <= 10; i++) b.poner(i * 0.01, 1, 0, 1);
  b.estado.active = false; b.poner(0.2, 1, 0, 1);
  assert.equal(b.p.estado().modo, false); assert.ok(b.reg.includes("cancelar"), "VR ended mid-line: it cannot be saved");
  const c = montar(); c.p.entrar(); c.poner(0, 1, 0, 0); c.poner(0, 1, 0, 1); for (let i = 1; i <= 10; i++) c.poner(i * 0.01, 1, 0, 1);
  c.quitarMano(); assert.ok(c.reg.some((x) => x.startsWith("soltar ")), "tracking lost: the line so far is saved");
});

test("a 600-point line closes itself and the next one carries on at the same place; the live tube does the same", async () => {
  const t = montar(); t.p.entrar(); await espera(); t.poner(0, 1, 0, 0); t.poner(0, 1, 0, 1);
  for (let i = 1; i <= 700; i++) t.poner(Math.sin(i / 20) * 0.6, 1 + i * 0.002, Math.cos(i / 20) * 0.6, 1);
  assert.ok(t.reg.includes("enviado-lleno"), "the first stroke went at its 600th point"); assert.ok(t.reg.includes("v.terminar"));
  assert.equal(t.p.estado().pintando, true, "still painting the second one");
});

test("a tracked hand paints with its pinch at the neutral width", () => {
  const t = montar(); t.p.entrar(); t.poner(0, 1, 0, 0, true); t.poner(0, 1, 0, 1, true);
  for (let i = 1; i <= 8; i++) t.poner(i * 0.02, 1, 0, 1, true);
  assert.ok(t.reg.filter((x) => x.startsWith("v.anadir")).every((x) => x === "v.anadir 0.50"), t.reg.join(","));
});

test("the menu row: two states, Empezar / Dejar de pintar", () => {
  assert.equal(vistaPintarVR(false).boton, "Empezar"); assert.equal(vistaPintarVR(true).boton, "Dejar de pintar");
  assert.notEqual(vistaPintarVR(true).titulo, vistaPintarVR(false).titulo);
});
