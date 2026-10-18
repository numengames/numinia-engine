// dados v1: dice the server rolls, headless (in-memory world, pages pumped by 20 Hz ticks). The expression, the
// unbiased die, the same values for everyone near, the tower's last roll for who arrives later, hidden rolls (the others
// see THAT, never WHAT), the chat order and a world's dados.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { leerMundo } from "../packages/server/src/mundo.ts";
import { conMundo } from "../features/mundo.ts";
import chatServer from "../features/chat/server.ts";
import { dados, CERCA_M } from "../features/dados/feature.ts";
import { crearDados, leerExpresion, escribir, dado, tirar, frase, lecturaD6 } from "../features/dados/server.ts";
import { crearCliente } from "../features/dados/client.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";

const sign = signer("una-clave-de-prueba-larga");
const TORRE = { id: "torre", nombre: "Torre de dados", x: 3, z: 0, radio: 2.5, dados: "1d20" };
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
/** A fixed sequence of 32-bit numbers: the test knows every die. */
const secuencia = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

function mundo(n: number, azar?: () => number) {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [chatServer, crearDados({ torres: [TORRE], azar })], log: (l) => log.push(l), identitySign: sign });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), cli = crearCliente();
    const s = new ClientSession(t, { identity: keeper(), features: cli.parts });
    return { t, s, d: cli.dados };
  });
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, place, log };
}

test("dados: the declaration meets the plug's rules and is in both lists", () => {
  assert.deepEqual(dados.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "dados"));
  assert.ok(paginas.some((f) => f.feature.id === "dados"));
});

test("leerExpresion / escribir / frase: what a person types and reads", () => {
  assert.deepEqual(leerExpresion("2d6+1"), { cuantos: 2, caras: 6, mod: 1 });
  assert.deepEqual(leerExpresion(" d20 "), { cuantos: 1, caras: 20, mod: 0 });
  assert.deepEqual(leerExpresion("3D8 - 2"), { cuantos: 3, caras: 8, mod: -2 });
  assert.deepEqual(leerExpresion("2d"), { cuantos: 2, caras: 6, mod: 0 });
  assert.equal(escribir({ cuantos: 3, caras: 8, mod: -2 }), "3d8-2");
  assert.match(String(leerExpresion("11d6")), /De 1 a 10/);
  assert.match(String(leerExpresion("1d7")), /caras/);
  assert.match(String(leerExpresion("tres dados")), /No entiendo/);
  assert.equal(frase("Ana", { cuantos: 2, caras: 6, mod: 1 }, [4, 3], 8), "Ana tira 2d6+1: 4 · 3 +1 = 8");
  assert.equal(frase("Ana", { cuantos: 1, caras: 20, mod: 0 }, [20], 20), "Ana tira 1d20: 20 ¡crítico!");
  assert.equal(frase("Ana", { cuantos: 1, caras: 20, mod: 0 }, null, 0), "Ana tira 1d20 en secreto");
});

test("dado: uniform (no modulo bias: a draw over the last whole block is drawn again) and always in range", () => {
  // 2^32 % 6 = 4: the four highest values would favour faces 1-4; they must be thrown away
  assert.equal(dado(6, secuencia(4294967295, 0)), 1, "the top value is redrawn; 0 gives face 1");
  assert.equal(dado(6, secuencia(5)), 6);
  const cuenta = new Map<number, number>();
  for (let i = 0; i < 60000; i++) { const v = dado(6); cuenta.set(v, (cuenta.get(v) ?? 0) + 1); }
  assert.deepEqual([...cuenta.keys()].sort(), [1, 2, 3, 4, 5, 6]);
  for (const c of cuenta.values()) assert.ok(Math.abs(c - 10000) < 600, `each face ~1/6 of 60,000 (got ${c})`);
  const d20 = tirar({ cuantos: 10, caras: 20, mod: 0 });
  assert.ok(d20.valores.every((v) => v >= 1 && v <= 20) && d20.total === d20.valores.reduce((a, b) => a + b, 0));
});

test("a roll at the tower: the server decides, everyone near hears the SAME values, the tower keeps the last", () => {
  const { pages: [a, b, lejos], pump, place } = mundo(3, secuencia(3, 18)); // 1d20 → 4, then 19
  pump(3);
  place(a.s.entity, 3, 1.5); place(b.s.entity, -2, 0); place(lejos.s.entity, 3 + CERCA_M + 10, 0); pump(4);
  assert.deepEqual(a.d.torres().map((t) => [t.id, t.dados, t.ultima]), [["torre", "1d20", ""]]);
  assert.ok(a.d.tirar("", "torre").ok); pump(3);
  const ta = a.d.ultima()!, tb = b.d.ultima()!;
  assert.deepEqual([ta.n, ta.dados, ta.valores, ta.total, ta.mia], [1, "1d20", [4], 4, true]);
  assert.deepEqual([tb.n, tb.valores, tb.total, tb.mia], [1, [4], 4, false], "who sits at the table sees the same die");
  assert.equal(lejos.d.ultima(), null, "out of CERCA_M nobody is told");
  assert.match(a.d.torres()[0].ultima, /· 1d20 → 4 = 4$/);
  // «E: tirar los dados» (J4: the page sends only the tower's key) rolls the tower's own dice
  assert.ok(a.s.features.reachable(3, 1.5, 0).some((r) => r.feature === "dados" && r.prompt === "tirar los dados"));
  assert.ok(a.s.features.use("dados", "torre").ok); pump(3);
  assert.deepEqual([b.d.ultima()!.n, b.d.ultima()!.dados, b.d.ultima()!.total], [2, "1d20", 19]);
  // b is 5 m from the tower (radius 2.5): not at the tower — but anyone may roll where they stand
  assert.ok(b.d.tirar("2d6", "torre").ok); pump(3);
  assert.match(b.d.aviso(), /Acércate a Torre de dados/);
  assert.ok(b.d.tirar("2d6+1").ok); pump(3);
  assert.equal(a.d.ultima()!.n, 3); assert.equal(a.d.ultima()!.dados, "2d6+1"); assert.equal(a.d.ultima()!.sitio, "");
  assert.equal(a.d.ultima()!.total, a.d.ultima()!.valores.reduce((x, y) => x + y, 1));
  assert.ok(b.d.tirar("1d7").ok); pump(3);
  assert.match(b.d.aviso(), /caras/);
  assert.equal(a.d.tiradas().length, 3, "a wrong expression is not a roll");
});

test("a hidden roll: who rolls sees the values; the others near see that a roll happened, never what", () => {
  const { pages: [dj, jugador], pump, place } = mundo(2, secuencia(16));
  pump(3); place(dj.s.entity, 3, 1.5); place(jugador.s.entity, 0, 2); pump(4);
  assert.ok(dj.d.tirar("d20", "torre", true).ok); pump(3);
  assert.deepEqual([dj.d.ultima()!.valores, dj.d.ultima()!.total, dj.d.ultima()!.oculta], [[17], 17, true]);
  const visto = jugador.d.ultima()!;
  assert.deepEqual([visto.valores, visto.total, visto.oculta], [[], 0, true]);
  assert.match(visto.texto, /en secreto$/);
  assert.match(jugador.d.torres()[0].ultima, /en secreto$/, "the tower shows THAT, not WHAT");
  assert.ok(!jugador.d.torres()[0].ultima.includes("17"));
});

test("the chat: /tirar 2d6 rolls (at the tower when you are beside it), /tirar d20 oculta hides it", () => {
  const { pages: [a, b], pump, place } = mundo(2, secuencia(0, 1, 2));
  pump(3); place(a.s.entity, 3, 1.5); place(b.s.entity, 0, 2); pump(4);
  a.s.features.send("chat", "decir", { texto: "/tirar 2d6", alcance: "cerca" }); pump(3);
  assert.deepEqual([b.d.ultima()?.dados, b.d.ultima()?.valores, b.d.ultima()?.sitio], ["2d6", [1, 2], "torre"]);
  a.s.features.send("chat", "decir", { texto: "/tirar d20 oculta", alcance: "cerca" }); pump(3);
  assert.equal(b.d.ultima()!.oculta, true); assert.deepEqual(b.d.ultima()!.valores, []);
});

test("a world's dados.json: its towers; a wrong file is said in the log; no file = no tower", () => {
  const dir = mkdtempSync(join(tmpdir(), "dados-"));
  
  writeFileSync(join(dir, "dados.json"), JSON.stringify({ schema: "numinia-engine/dados@1", torres: [{ id: "engranajes", nombre: "La torre de engranajes", x: 3.7, z: 0, radio: 2.5, dados: "2d6" }] }));
  const log: string[] = [];
  const partes = conMundo(funciones, leerMundo(dir, (l) => log.push(l)), (l) => log.push(l));
  const inst = new Instance({ seed: 1, capacity: 4, k: 50, snapshotEvery: 2, features: partes, log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0), cli = crearCliente(), s = new ClientSession(t, { identity: keeper(), features: cli.parts });
  for (let i = 0; i < 4; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.deepEqual(cli.dados.torres().map((x) => [x.id, x.nombre, x.dados]), [["engranajes", "La torre de engranajes", "2d6"]]);
  void s;
  const mal = mkdtempSync(join(tmpdir(), "dados-"));
  
  writeFileSync(join(mal, "dados.json"), JSON.stringify({ torre: {} }));
  const l2: string[] = [];
  conMundo(funciones, leerMundo(mal, (l) => l2.push(l)), (l) => l2.push(l));
  assert.match(l2.join("\n"), /dados\.json no tiene una lista "torres"/);
});

test("lecturaD6: the house reading of a pool of d6 (manual 04) — and its table of odds, recomputed exactly", () => {
  assert.equal(lecturaD6([6, 1]).lectura, "éxito normal", "one 1 is free");
  assert.equal(lecturaD6([6, 1, 1]).lectura, "fracaso", "the second 1 cancels the 6 and itself; a 1 is left");
  assert.equal(lecturaD6([6, 6, 6, 2]).lectura, "éxito total");
  assert.equal(lecturaD6([3, 4]).lectura, "fallo sin consecuencias");
  assert.equal(lecturaD6([1, 4]).lectura, "fracaso");
  assert.equal(frase("Lía", { cuantos: 3, caras: 6, mod: 0 }, [6, 2, 1], 9), "Lía tira 3d6: 6 · 2 · 1 — éxito normal");
  // the manual's table (2D6 … 5D6: éxito total, normal, fallo normal, fracaso, in %), every outcome counted
  const TABLA: Record<number, number[]> = { 2: [0, 30.56, 44.44, 25], 3: [0.46, 40.28, 29.63, 29.63], 4: [1.62, 46.14, 19.75, 32.48], 5: [3.42, 49.0, 13.17, 34.41] };
  for (const [n, esperado] of Object.entries(TABLA)) {
    const k = Number(n), cuenta = { "éxito total": 0, "éxito normal": 0, "fallo sin consecuencias": 0, fracaso: 0 };
    for (let i = 0; i < 6 ** k; i++) { const v = Array.from({ length: k }, (_, j) => (Math.floor(i / 6 ** j) % 6) + 1); cuenta[lecturaD6(v).lectura]++; }
    const pct = Object.values(cuenta).map((c) => (100 * c) / 6 ** k);
    pct.forEach((p, j) => assert.ok(Math.abs(p - esperado[j]) < 0.05, `${k}D6 column ${j}: ${p.toFixed(2)} vs the manual's ${esperado[j]}`));
  }
});
