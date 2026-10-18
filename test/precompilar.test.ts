// B3: shaders ready before a world's models show (packages/render/src/precompilar.ts) and the fog colour of an
// atmosphere sky worked out without reading the GPU back (packages/render/src/cielo-horizonte.ts). No GPU needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearPrecompilador, LOTE_PARALELO, LOTE_SIN_PARALELO, ESPERA_MAX_MS, type Grupo, type Nodo } from "../packages/render/src/precompilar.ts";
import { horizonteAtmosfera, colorCielo } from "../packages/render/src/cielo-horizonte.ts";

type Malla = Nodo & { nombre: string; frustumCulled: boolean };
const malla = (nombre: string, frustumCulled = true): Malla => ({ nombre, frustumCulled, isMesh: true, traverse(f) { f(this); } });
function grupo(): Grupo & { hijos: Nodo[] } {
  const g = { hijos: [] as Nodo[], traverse(f: (o: Nodo) => void) { f(g); for (const h of g.hijos) h.traverse(f); },
    add(...o: Nodo[]) { g.hijos.push(...o); }, remove(...o: Nodo[]) { g.hijos = g.hijos.filter((h) => !o.includes(h)); } };
  return g;
}
/** A fake scheduler: tasks run only when the test says so (one per call). */
function tareas() { const q: (() => void)[] = []; return { despues: (f: () => void) => { q.push(f); }, una: () => q.shift()?.(), n: () => q.length }; }
const vaciar = () => new Promise((ok) => setImmediate(ok));

test("B3: a model is shown only after its batch compiled, and never inside the task that queued it", async () => {
  const t = tareas(), vistos: string[] = [], compilados: string[][] = [];
  let terminar!: () => void;
  const p = crearPrecompilador({ despues: t.despues, grupo, paralelo: () => false,
    compilar: (g) => { compilados.push((g as unknown as { hijos: Malla[] }).hijos.map((h) => h.nombre)); return new Promise<void>((ok) => { terminar = ok; }); } });
  p.preparar([malla("banco")], () => vistos.push("banco"));
  assert.equal(compilados.length, 0, "nothing compiles in the caller's task");
  assert.equal(p.pendientes(), 1);
  t.una();
  assert.deepEqual(compilados, [["banco"]]);
  await vaciar();
  assert.deepEqual(vistos, [], "not shown while linking");
  terminar(); await vaciar();
  assert.deepEqual(vistos, ["banco"]);
  assert.equal(p.pendientes(), 0);
  assert.equal(p.estado().preparados, 1);
});

test("B3: without KHR_parallel_shader_compile one model per task; with it, batches of LOTE_PARALELO", async () => {
  for (const paralelo of [false, true]) {
    const t = tareas(), lotes: number[] = [];
    const p = crearPrecompilador({ despues: t.despues, grupo, paralelo: () => paralelo, compilar: (g) => { lotes.push((g as unknown as { hijos: Nodo[] }).hijos.length); return Promise.resolve(); } });
    let vistos = 0;
    for (let i = 0; i < 10; i++) p.preparar([malla(`m${i}`)], () => vistos++);
    while (t.n()) { t.una(); await vaciar(); }
    const n = paralelo ? LOTE_PARALELO : LOTE_SIN_PARALELO;
    assert.equal(vistos, 10);
    assert.deepEqual(lotes, Array.from({ length: Math.ceil(10 / n) }, (_, i) => Math.min(n, 10 - i * n)), `paralelo=${paralelo}`);
  }
});

test("B3: what the frustum would cull is compiled too, and its flag comes back as it was", () => {
  const t = tareas();
  const a = malla("detras", true), b = malla("siempre", false);
  let vistoDentro: boolean[] = [];
  const p = crearPrecompilador({ despues: t.despues, grupo, paralelo: () => true, compilar: () => { vistoDentro = [a.frustumCulled, b.frustumCulled]; return Promise.resolve(); } });
  p.preparar([a, b], () => {});
  t.una();
  assert.deepEqual(vistoDentro, [false, false]);
  assert.equal(a.frustumCulled, true); assert.equal(b.frustumCulled, false);
});

test("B3: a failed compile still shows the model (never lost), and so does one that never answers", async (c) => {
  const t = tareas(), vistos: string[] = [];
  const p = crearPrecompilador({ despues: t.despues, grupo, paralelo: () => false, compilar: () => { throw new Error("contexto perdido"); } });
  p.preparar([malla("a")], () => vistos.push("a"));
  t.una(); await vaciar();
  assert.deepEqual(vistos, ["a"]);
  assert.equal(p.estado().fallos, 1);
  c.mock.timers.enable({ apis: ["setTimeout"] });
  const q = crearPrecompilador({ despues: t.despues, grupo, paralelo: () => false, compilar: () => new Promise(() => {}) });
  q.preparar([malla("b")], () => vistos.push("b"));
  t.una(); await vaciar();
  assert.deepEqual(vistos, ["a"]);
  c.mock.timers.tick(ESPERA_MAX_MS); await vaciar();
  assert.deepEqual(vistos, ["a", "b"]);
  assert.equal(q.estado().sinEsperar, 1);
});

// The engine's fog «del cielo», as the GPU read it back before B3 (cliente-perfil/niebla-gpu.mjs on the plaza, origin/main
// 30da0fd, Chrome 151 + SwiftShader, 16 px half-float cube, mean of its four side faces' middle rows; linear RGB).
const GPU: { alt: number; rumbo: number; turb: number; nubes: number; rgb: [number, number, number] }[] = [
  { alt: 45, rumbo: 30, turb: 2, nubes: 0.3, rgb: [4.79399, 6.54140, 7.17365] },
  { alt: 10, rumbo: 120, turb: 2, nubes: 0.3, rgb: [2.13897, 1.63242, 1.17278] },
  { alt: 3, rumbo: -60, turb: 6, nubes: 0, rgb: [1.28847, 0.41494, 0.18775] },
  { alt: 60, rumbo: 200, turb: 10, nubes: 0.8, rgb: [3.92598, 5.75853, 6.95090] },
  { alt: 25, rumbo: 0, turb: 4, nubes: 0.5, rgb: [3.02778, 3.70538, 3.81577] },
  { alt: 7, rumbo: 90, turb: 2, nubes: 0, rgb: [1.10674, 0.70865, 0.54193] },
];
const solDe = (alt: number, rumbo: number) => { const a = alt * Math.PI / 180, r = rumbo * Math.PI / 180; return { x: Math.cos(a) * Math.sin(r), y: Math.sin(a), z: -Math.cos(a) * Math.cos(r) }; };

test("B3: the horizon colour worked out in JS matches what the GPU drew (within 1 %; measured ≤ 0.4 %)", () => {
  assert.ok(GPU.length >= 4, "reference colours present");
  for (const g of GPU) {
    const c = horizonteAtmosfera({ turbidez: g.turb, rayleigh: g.alt < 8 ? 2.5 : 1.5, mie: 0.005, mieG: 0.8, sol: solDe(g.alt, g.rumbo), nubes: g.nubes, densidad: 0.5, px: 16 });
    for (let k = 0; k < 3; k++) {
      const err = Math.abs(c[k] - g.rgb[k]) / Math.max(1e-3, g.rgb[k]);
      assert.ok(err < 0.01, `sol ${g.alt}°/${g.rumbo}° turbidez ${g.turb} nubes ${g.nubes}: canal ${k} JS ${c[k].toFixed(4)} GPU ${g.rgb[k].toFixed(4)} (${(err * 100).toFixed(1)} %)`);
    }
  }
});

test("B3: the sky colour is finite everywhere and brighter towards a low sun", () => {
  const p = { turbidez: 2, rayleigh: 2.5, mie: 0.005, mieG: 0.8, sol: solDe(5, 90), nubes: 0.3, densidad: 0.5 };
  for (const d of [[0, 1, 0], [1, 0, 0], [0, -1, 0], [0.7, 0.1, 0.7]] as [number, number, number][]) {
    const l = Math.hypot(...d); const c = colorCielo(p, [d[0] / l, d[1] / l, d[2] / l]);
    assert.ok(c.every(Number.isFinite), `finite at ${d}`);
  }
  const haciaSol = colorCielo(p, [0.995, 0.0998, 0]), contrario = colorCielo(p, [-0.995, 0.0998, 0]);
  assert.ok(haciaSol[0] > contrario[0], "towards the sun is brighter");
});
