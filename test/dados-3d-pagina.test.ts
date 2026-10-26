// Lote 8 (mesa), t_95245cf0 story 1: from the server's roll to the picture, without a browser. A tower may say where its tray is
// (bandeja*); two pages near it hear the SAME numbered roll and, from it alone, work out the SAME flight that ends with the
// server's value face up. A hidden roll, a roll with no tower and dice with no model draw nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import chatServer from "../features/chat/server.ts";
import { crearDados } from "../features/dados/server.ts";
import { crearCliente } from "../features/dados/client.ts";
import { dados as decl } from "../features/dados/feature.ts";
import { aTirada3D, bandejaDe, carasDe } from "../apps/plaza/dados.ts";
import { planTirada, poseEn, caraArriba, girar, normalDe } from "../packages/render/src/dados-caida.ts";

const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const secuencia = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };
// the mesa-rol tower: its tray is in front of it, 0.89 m up, 0.8 × 0.6 m
const TORRE = { id: "engranajes", nombre: "La torre de engranajes", x: 3.08, y: 0, z: 0, radio: 2.2, dados: "3d6", bandeja: { dx: 0.4, dz: 0.62, alto: 0.89, ancho: 0.8, fondo: 0.6 } };
const SIN_BANDEJA = { id: "llana", nombre: "Torre llana", x: -5, z: 1, radio: 2.5, dados: "1d20" };

function mundo(azar?: () => number) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearDados({ torres: [TORRE, SIN_BANDEJA], azar })], log: () => {}, identitySign: sign });
  const pages = [0, 1].map((i) => { const t = inst.join(i), cli = crearCliente(); return { t, s: new ClientSession(t, { identity: keeper(), features: cli.parts }), d: cli.dados }; });
  const pump = (n = 2) => { for (let i = 0; i < n; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  pump(3);
  pages.forEach((p, i) => place(p.s.entity, 3 + i * 0.5, 0.5));
  pump(4);
  return { inst, pages, pump, place };
}

test("a tower's tray travels in its state (and a tower that says nothing has the default patch); the page turns it into world metres", () => {
  assert.deepEqual(decl.issues, []);
  const w = mundo();
  const torres = w.pages[1].d.torres();
  const t = torres.find((x) => x.id === "engranajes")!;
  assert.deepEqual([t.bandejaDx, t.bandejaDz, t.bandejaAlto, t.bandejaAncho, t.bandejaFondo].map((v) => Math.round(v! * 100) / 100), [0.4, 0.62, 0.89, 0.8, 0.6]);
  assert.deepEqual(bandejaDe(t), { x: 3.48, y: 0.89, z: 0.62, ancho: 0.8, fondo: 0.6 });
  // the llana tower is 8 m away: out of the area of interest here, so check its default from the server's own list
  assert.deepEqual(bandejaDe({ x: -5, y: 0, z: 1 }), { x: -5, y: 0, z: 1, ancho: 0.8, fondo: 0.6 });
  assert.equal(carasDe("3d6"), 6); assert.equal(carasDe("1d20"), 20); assert.equal(carasDe("2d6+1"), 6); assert.equal(carasDe(""), 0);
});

test("two pages near the tower hear the same numbered roll and draw the same flight, ending with the server's value face up", () => {
  const w = mundo(secuencia(5, 0, 3));          // 3d6 → 6, 1, 4
  const [a, b] = w.pages;
  assert.ok(a.d.tirar("3d6", "engranajes").ok); w.pump(4);
  const ta = a.d.ultima()!, tb = b.d.ultima()!;
  assert.deepEqual(ta.valores, [6, 1, 4]); assert.deepEqual(tb.valores, [6, 1, 4]); assert.equal(ta.n, tb.n, "the same roll number");
  const ea = aTirada3D(ta, a.d.torres())!, eb = aTirada3D(tb, b.d.torres())!;
  assert.ok(ea && eb);
  assert.deepEqual(ea, eb, "what each page hands its 3D view is identical");
  const pa = planTirada(ea), pb = planTirada(eb);
  assert.equal(pa.length, 3);
  for (const t of [0, 0.3, 0.8, 1.2]) assert.deepEqual(pa.map((p) => poseEn(p, t)), pb.map((p) => poseEn(p, t)), `pose at ${t}s is the same on both screens`);
  pa.forEach((p, i) => {
    const f = poseEn(p, 99), v = ta.valores[i];
    assert.equal(caraArriba(6, f.q), v, `die ${i}: the face up reads ${v}`);
    const arriba = girar(f.q, normalDe(6, v)!); assert.ok(Math.abs(arriba[1] - 1) < 1e-9);
    // it lies on the tower's tray: x 3.08+0.4 ± 0.4, z 0.62 ± 0.3, 0.89 up
    assert.ok(Math.abs(f.x - 3.48) <= 0.4 && Math.abs(f.z - 0.62) <= 0.3 && f.y > 0.89, `inside the tray (${f.x.toFixed(2)}, ${f.y.toFixed(2)}, ${f.z.toFixed(2)})`);
  });
  // the next roll lands elsewhere and replaces this one
  assert.ok(a.d.tirar("3d6", "engranajes").ok); w.pump(4);
  assert.notEqual(a.d.ultima()!.n, ta.n);
});

test("nothing to draw: a hidden roll, a roll with no tower, dice without a model", () => {
  const w = mundo(secuencia(7, 3, 9));
  const [a, b] = w.pages;
  assert.ok(a.d.tirar("2d6", "engranajes", true).ok); w.pump(4);
  assert.equal(aTirada3D(b.d.ultima()!, b.d.torres()), null, "the others see THAT you rolled, never the values: no dice");
  assert.ok(a.d.tirar("1d20", "").ok); w.pump(4);
  assert.equal(aTirada3D(a.d.ultima()!, a.d.torres()), null, "no tower, no tray");
  assert.ok(a.d.tirar("1d100", "engranajes").ok); w.pump(4);
  const t100 = aTirada3D(a.d.ultima()!, a.d.torres());
  assert.ok(t100 && t100.caras === 100); assert.deepEqual(planTirada(t100), [], "d100 comes in story 3: the card and the label still say it");
});
