// dardos v3 (teams) as the page sees it: the controller's `equipos`, `puedeEmpezar`, `puedeCambiar`, `retirando`, and what the
// panel (3D wall board, plaza sign, HUD line) says for 3 and 4 teams. Headless, three real clients in one world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FUERZA_IDEAL } from "../features/dardos/feature.ts";
import { crearDardos } from "../features/dardos/server.ts";
import { crearCliente } from "../features/dardos/client.ts";
import { panelDe, enBoton, rectBoton, pintarPanel, PANEL_PX, puedeLanzar } from "../packages/render/src/dardos-duelo.ts";
import { lineaDuelo } from "../apps/plaza/dardos-duelo.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = () => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

function mundo(n: number) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: [{ id: "mesa", nombre: "Mesa", x: 10, z: 0, y: 0, radio: 3, duelo: true, remoto: true, equipos: 4, rondas: 1 }] })], log: () => {}, identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => { const t = inst.join(i), cli = crearCliente(); return { t, s: new ClientSession(t, { identity: keeper(), features: cli.parts }), d: cli.dardos }; });
  const pump = (k = 1) => { for (let i = 0; i < k; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  pump(2); pages.forEach((c, i) => { inst.sim.tf.cols.x[c.s.entity] = fx(500 + 3 * i); inst.sim.tf.cols.z[c.s.entity] = fx(0); }); pump(12);
  return { pages, pump };
}

test("equipos vista: three teams — who may press «Empezar» and «Cambiar», the rows, the footer and the button of the panel", () => {
  const W = mundo(3); const [A, B, C] = W.pages;
  A.d.jugar("mesa", "pared"); W.pump(3);
  assert.deepEqual([A.d.duelo()!.puedeEmpezar, A.d.duelo()!.equipos.length], [false, 1], "alone: nothing to start");
  B.d.jugar("mesa", "pared"); C.d.jugar("mesa", "pared"); W.pump(3);
  assert.deepEqual([A.d.duelo()!.puedeEmpezar, B.d.duelo()!.puedeEmpezar, A.d.duelo()!.equipos.length, A.d.duelo()!.maxEquipos], [true, false, 3, 4]);
  assert.equal(B.d.empezar().ok, true); W.pump(2); assert.match(B.d.estado().aviso, /Solo el anfitrión/);
  let p = panelDe(A.d.duelo(), 1);
  assert.deepEqual([p.fase, p.filas.length, p.boton, p.pie], ["espera", 3, "empezar", "Pulsa Empezar"]);
  assert.equal(panelDe(B.d.duelo(), 1).pie, "Esperando al anfitrión…"); assert.equal(panelDe(B.d.duelo(), 1).boton, null);
  assert.equal(lineaDuelo(A.d.duelo(), 1).includes("Pulsa Empezar"), true);
  assert.equal(A.d.empezar().ok, true); W.pump(3);
  assert.deepEqual([A.d.duelo()!.turnoEq, A.d.duelo()!.miTurno, puedeLanzar(A.d.duelo(), true), A.d.duelo()!.puedeCambiar, panelDe(A.d.duelo(), 1).boton], [1, true, true, true, null], "before the third dart there is no button");
  for (let i = 0; i < 3; i++) { A.d.lanzar(0, 0.6, FUERZA_IDEAL, "mesa"); W.pump(3); }
  const d = A.d.duelo()!; p = panelDe(d, 1);
  assert.deepEqual([d.retirando, puedeLanzar(d, true), p.boton, p.pie, p.filas.map((f) => f.turno)], [true, false, "cambiar", "Retira los dardos y pulsa Cambiar", [true, false, false]]);
  assert.equal(panelDe(B.d.duelo(), 1).boton, null); assert.match(panelDe(B.d.duelo(), 1).pie, /retira los dardos/);
  assert.equal(p.filas.reduce((s, f) => s + f.puntos, 0), d.yoPuntos, "the three rows are on the panel with the right points");
  assert.equal(A.d.cambiar().ok, true); W.pump(3);
  assert.deepEqual([B.d.duelo()!.miTurno, panelDe(C.d.duelo(), 1).filas.map((f) => f.turno)], [true, [false, true, false]]);
});

test("equipos vista: the button's rectangle is inside the canvas for 2, 3 and 4 rows, and a click in it counts (a click outside does not)", () => {
  for (const n of [2, 3, 4]) {
    const r = rectBoton(n); assert.ok(r.y >= 56 + n * 30 - 20 && r.y + r.h <= PANEL_PX.h, `${n} rows: the button fits the canvas`);
    const p = { fase: "juego" as const, ronda: "", pie: "", tono: "neutro" as const, boton: "cambiar" as const, filas: Array.from({ length: n }, () => ({ nombre: "x", puntos: 0, turno: false, yo: false })) };
    assert.equal(enBoton(p, r.x + r.w / 2, r.y + r.h / 2), true); assert.equal(enBoton(p, r.x + r.w / 2, 10), false); assert.equal(enBoton({ ...p, boton: null }, r.x + 5, r.y + 5), false);
  }
  // painting 4 rows and a button must not throw and must write both the rows and the label
  const textos: string[] = [];
  const ctx = new Proxy({}, { get: (_t, k) => (k === "fillText" ? (t: string) => textos.push(t) : () => {}), set: () => true }) as unknown as CanvasRenderingContext2D;
  pintarPanel(ctx, { fase: "juego", ronda: "Ronda 1/2", pie: "x", tono: "bien", boton: "cambiar", filas: ["A", "B", "C", "D"].map((n, i) => ({ nombre: n, puntos: i, turno: i === 1, yo: false })) }, true);
  assert.ok(["A", "B", "C", "D"].every((n) => textos.some((t) => t.includes(n))) && textos.includes("Cambiar turno"));
});
