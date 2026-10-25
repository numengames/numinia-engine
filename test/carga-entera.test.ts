// C (lote «primera vez»): the loading screen covers until the world within view is whole. Pure pieces here (the count, the report's
// shape, the wiring); the browser leg that measures the real hide time is tools/e2e-piernas/carga-entera.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contarPiezas, LEJOS_M } from "../packages/render/src/carga-orden.ts";
import type { PiezaCarga } from "../packages/render/src/carga-orden.ts";
import { limpiar, SHAPES } from "../packages/server/src/sesiones.ts";

const pieza = (o: Partial<PiezaCarga> & { key: string }): PiezaCarga => ({ distancia2: 100, loaded: false, failed: false, ...o });
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("contarPiezas: solo cuenta lo que está a la vista (sala y cerca); lo lejano que el bombeo aplaza no", () => {
  const cosas = [
    pieza({ key: "a", loaded: true }),
    pieza({ key: "b" }),                                                   // near, still loading
    pieza({ key: "sala", sala: true, distancia2: (LEJOS_M * 3) ** 2 }),    // the room counts wherever its origin is
    pieza({ key: "lejos", distancia2: (LEJOS_M + 1) ** 2 }),               // far: deferred on purpose
    pieza({ key: "justo", distancia2: LEJOS_M ** 2, loaded: true }),       // exactly at the edge: near
  ];
  assert.deepEqual(contarPiezas(cosas), { total: 4, listas: 2, fallidas: 0 });
});

test("contarPiezas: una pieza fallida cuenta como lista (no atrapa al jugador); sonidos, ocultas y vistas previas no cuentan", () => {
  const cosas = [
    pieza({ key: "mala", failed: true }),
    pieza({ key: "~previa" }),
    pieza({ key: "s", kind: "sonido" }),
    pieza({ key: "o", hidden: true }),
    pieza({ key: "i", kind: "imagen", loaded: true }),
  ];
  assert.deepEqual(contarPiezas(cosas), { total: 2, listas: 2, fallidas: 1 });
  assert.deepEqual(contarPiezas(cosas, true), { total: 3, listas: 2, fallidas: 1 }, "al construir se ven las ocultas, y se esperan");
  assert.deepEqual(contarPiezas([]), { total: 0, listas: 0, fallidas: 0 });
});

test("contarPiezas: al cargarse todas lo cercano, quedan 0 pendientes aunque lo lejano siga esperando", () => {
  const cosas = [pieza({ key: "a" }), pieza({ key: "b" }), pieza({ key: "lejos", distancia2: (LEJOS_M * 2) ** 2 })];
  const antes = contarPiezas(cosas); assert.equal(antes.total - antes.listas, 2);
  cosas[0].loaded = true; cosas[1].loaded = true;
  const despues = contarPiezas(cosas); assert.equal(despues.total - despues.listas, 0);
});

test("el informe «carga» guarda cuándo se quitó la pantalla, cuántas piezas quedaban y si fue el tope; lo demás se descarta", () => {
  const out = limpiar(SHAPES.carga, { ocultaMs: 4210.4, msDesdeWelcome: 3000, piezas: 146, pendientes: 0, tope: false, hack: "x", k: "carga" });
  assert.deepEqual(out, { ocultaMs: 4210.4, msDesdeWelcome: 3000, piezas: 146, pendientes: 0, tope: false });
  assert.deepEqual(limpiar(SHAPES.carga, { pendientes: -1, piezas: 1.5, tope: "sí" }), {}, "negativos, decimales y texto no pasan");
  assert.ok(JSON.stringify({ k: "carga", ...out }).length < 120, "cabe de sobra en un REPORT");
});

test("cableado: la página oculta con estadoCarga + cargaMundo, el tope dice que saltó, y las texturas suben con los shaders", () => {
  const main = src("apps/plaza/main.ts"), vista = src("packages/render/src/index.ts");
  assert.match(main, /estadoCarga\(\{[^}]*piezasPendientes: piezasPendientes\(mundo\)/, "main.ts pasa las piezas pendientes");
  assert.match(main, /view\.cargaMundo\(\)/);
  assert.match(main, /mundoRecibido: session\.stats\.snapshots > 0/, "espera al primer snapshot, que viene tras la ráfaga de cosas del welcome");
  assert.match(main, /console\.warn\(`\[carga\] the cap/, "el tope se dice en el log");
  assert.match(main, /session\.report\(\{ k: "carga"/, "…y en las métricas");
  assert.match(vista, /renderer\.initTexture\(t\)/, "las texturas suben antes de enseñar el modelo");
  assert.match(vista, /compilar: \(g\) => \{ subirTexturas\(/, "…en la misma tarea que sus shaders");
  assert.doesNotMatch(main, /puedeOcultar/, "main.ts ya no usa la regla vieja");
});
