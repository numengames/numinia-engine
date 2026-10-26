// t_159e18d2: the counter of shader pipelines linked inside a drawn frame (packages/render/src/compilaciones.ts) and the meter's
// «compilaciones tardías». No GPU: a fake backend stands in for three's WebGLBackend/WebGPUBackend.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contarCompiles, RECIENTES_MAX } from "../packages/render/src/compilaciones.ts";
import { crearMedidorVivo, lineaMedidor, lineaMedidorCorta } from "../packages/render/src/medidor-vivo.ts";

const ro = (nombre: string, material = "MeshStandardNodeMaterial") => ({ object: { name: nombre, parent: { name: "mundo", parent: { name: "escena" } } }, material: { type: material } });
function backendFalso() {
  const llamadas: unknown[][] = [];
  const b = { createRenderPipeline(renderObject: unknown, promises: unknown) { llamadas.push([renderObject, promises]); return "hecho"; } };
  return { b, llamadas };
}

test("pipelines made through compileAsync are «previas», never late", () => {
  const { b } = backendFalso(); const c = contarCompiles(b);
  c.cargaLista();
  b.createRenderPipeline(ro("a"), []); b.createRenderPipeline(ro("b"), []);
  const e = c.estado();
  assert.equal(e.previas, 2); assert.equal(e.tardias, 0); assert.equal(e.recientes.length, 0);
});

test("a draw's pipeline is counted by when it happens: before the first frame, under the loading screen, late", () => {
  const { b } = backendFalso(); const c = contarCompiles(b);
  b.createRenderPipeline(ro("x"), null);
  assert.deepEqual([c.estado().antesDelPrimerCuadro, c.estado().bajoLaCarga, c.estado().tardias], [1, 0, 0]);
  c.primerCuadro();
  b.createRenderPipeline(ro("y"), null);
  assert.deepEqual([c.estado().antesDelPrimerCuadro, c.estado().bajoLaCarga, c.estado().tardias], [1, 1, 0]);
  c.cargaLista();
  b.createRenderPipeline(ro("Ayuntamiento · puerta", "MeshBasicNodeMaterial"), null);
  const e = c.estado();
  assert.deepEqual([e.antesDelPrimerCuadro, e.bajoLaCarga, e.tardias], [1, 1, 1]);
  assert.equal(e.cargaLista, true);
  assert.equal(e.recientes.length, 1);
  assert.equal(e.recientes[0].objeto, "Ayuntamiento · puerta < mundo < escena");
  assert.equal(e.recientes[0].material, "MeshBasicNodeMaterial");
});

test("the wrapper still calls the real backend with the same arguments and returns its result", () => {
  const { b, llamadas } = backendFalso(); const c = contarCompiles(b);
  const r = ro("z"); const p: unknown[] = [];
  assert.equal(b.createRenderPipeline(r, p), "hecho");
  assert.equal(b.createRenderPipeline(r, null), "hecho");
  assert.equal(llamadas.length, 2); assert.equal(llamadas[0][1], p); assert.equal(llamadas[1][1], null);
  c.soltar();
  b.createRenderPipeline(r, null);
  assert.equal(c.estado().antesDelPrimerCuadro, 1); // released: no longer counted
});

test("an error in the real link still counts and still propagates", () => {
  const b = { createRenderPipeline() { throw new Error("link"); } }; const c = contarCompiles(b);
  c.cargaLista();
  assert.throws(() => b.createRenderPipeline(), /link/);
  assert.equal(c.estado().tardias, 1);
});

test("the late list keeps only the newest RECIENTES_MAX; reiniciarTardias zeroes late counters but not what was prepared", () => {
  const { b } = backendFalso(); const c = contarCompiles(b);
  c.cargaLista();
  b.createRenderPipeline(ro("p"), []);
  for (let i = 0; i < RECIENTES_MAX + 5; i++) b.createRenderPipeline(ro("o" + i), null);
  const e = c.estado();
  assert.equal(e.tardias, RECIENTES_MAX + 5); assert.equal(e.recientes.length, RECIENTES_MAX);
  assert.match(e.recientes.at(-1)!.objeto, /^o28 /);
  c.reiniciarTardias();
  const z = c.estado();
  assert.equal(z.tardias, 0); assert.equal(z.recientes.length, 0); assert.equal(z.previas, 1); assert.equal(z.cargaLista, true);
});

test("the meter carries the late compiles in its summary, its long line, and its short line only when there are some", () => {
  const m = crearMedidorVivo();
  for (let i = 0; i < 10; i++) m.cuadro({ dtMs: 11.1, llamadas: 50, programas: 100, compilesTardios: 0 });
  assert.equal(m.resumen().compilesTardios, 0);
  assert.match(lineaMedidor(m.resumen()), /compilaciones tardías 0$/);
  assert.doesNotMatch(lineaMedidorCorta(m.resumen()), /tardías/);
  m.cuadro({ dtMs: 11.1, llamadas: 50, programas: 101, compilesTardios: 3 });
  assert.equal(m.resumen().compilesTardios, 3);
  assert.match(lineaMedidorCorta(m.resumen()), /3 comp\. tardías$/);
});

// ---- the cause found in the Quest session: muros() rebuilt the hall's PointLight on every change of the world's data ----
test("the hall's light is the SAME object after the walls are rebuilt (a new light id re-keys every lit material); the scene is told only when the light set really changes", async () => {
  const g = new Proxy({}, { get: (_, k) => (k === "measureText" ? () => ({ width: 10 }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
  const antes = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
  try {
    const THREE = await import("three/webgpu");
    const { crearSalon } = await import("../packages/render/src/ancestros.ts");
    const { murosDelSalon } = await import("../features/ancestros/server.ts");
    const { SALON } = await import("../features/ancestros/feature.ts");
    const world = new THREE.Group(), cam = new THREE.PerspectiveCamera();
    let avisos = 0, quiere = true;
    const s = crearSalon({ world, camara: () => cam, luz: () => quiere, luzCambiada: () => { avisos++; } });
    const lista = () => murosDelSalon().map((m) => ({ id: m.id, x0: m.x0, y0: 0, z0: m.z0, x1: m.x1, y1: SALON.alto, z1: m.z1 }));
    const luzDe = () => world.children.filter((o) => (o as { isLight?: boolean }).isLight);
    s.muros(lista());
    assert.equal(luzDe().length, 1); assert.equal(avisos, 1, "made once: announced once");
    const primera = luzDe()[0];
    const otra = lista(); otra[0] = { ...otra[0], x1: otra[0].x1 + 1 };
    for (let i = 0; i < 3; i++) s.muros(i % 2 ? lista() : otra); // the data keeps changing
    assert.equal(luzDe().length, 1); assert.equal(luzDe()[0], primera, "same light: three has nothing to relink"); assert.equal(avisos, 1);
    quiere = false; s.actualizar(0.016, null);
    assert.equal(luzDe().length, 0); assert.equal(avisos, 2, "removed: announced");
    quiere = true; s.actualizar(0.016, null);
    assert.equal(luzDe().length, 1); assert.equal(avisos, 3, "back: announced");
    s.muros([]); assert.equal(luzDe().length, 0); assert.equal(avisos, 4);
  } finally { (globalThis as { document?: unknown }).document = antes; }
});

test("the session pulse reports the late compiles of each window (the new ones since the last window); absent when the page does not send them", async () => {
  const { medidorDeCuadros } = await import("../packages/render/src/sesion.ts");
  const m = medidorDeCuadros();
  m.cuadro(16, 1, 60, { programas: 30 });
  assert.ok(!("compilesTardios" in m.ventana()), "an old page sends none: absent");
  m.cuadro(16, 1, 60, { compilesTardios: 2 });
  m.cuadro(16, 1, 60, { compilesTardios: 5 });
  assert.equal(m.ventana().compilesTardios, 3, "5 now, 2 when the window opened (first value seen)");
  m.cuadro(16, 1, 60, { compilesTardios: 5 });
  assert.equal(m.ventana().compilesTardios, 0, "nothing new: reported as zero, not absent");
});
