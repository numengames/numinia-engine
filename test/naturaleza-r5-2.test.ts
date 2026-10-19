// R5.2: the pond wears the palette's COLOR_ESTANQUE (tier A water and tier D painted pond alike) and the nature takes its colours from
// the world's season (`estacion`, legacy `paleta`) through paleta.ts ESTACIONES: naturaleza.ts holds no raw hex any more.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { uniform } from "three/tsl";
import { CASA, COLOR_ESTANQUE, mezcla } from "../packages/render/src/naturaleza/paleta.ts";
import { COLOR_ESTANQUE as COLOR_AGUA } from "../packages/render/src/agua-estilo.ts";
import { crearTerreno } from "../packages/render/src/naturaleza/terreno.ts";
import { crearNaturaleza, normalizar, estacionDeDatos } from "../packages/render/src/naturaleza/naturaleza.ts";
import { leerNaturaleza } from "../features/naturaleza/esquema.ts";

const fuente = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("R5.2 naturaleza.ts has no raw hex literal: every colour comes from paleta.ts", () => {
  const sinComentarios = fuente("packages/render/src/naturaleza/naturaleza.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.deepEqual(sinComentarios.match(/0x[0-9a-f]+/gi) ?? [], [], "no 0x literal left in naturaleza.ts");
  assert.match(sinComentarios, /materialDeAgua\(\{ color: COLOR_ESTANQUE/, "the tier A-C water wears COLOR_ESTANQUE");
  assert.match(sinComentarios, /aguaPlana: nivel === "D" \? COLOR_ESTANQUE/, "the tier D painted pond is switched on with COLOR_ESTANQUE");
});

test("R5.2 COLOR_ESTANQUE is a mix of house tokens: a muted deep turquoise, not the old saturated blue", () => {
  const linea = fuente("packages/render/src/naturaleza/paleta.ts").split("\n").find((l) => l.startsWith("export const COLOR_ESTANQUE"))!;
  assert.ok(linea && !/0x/i.test(linea) && /mezcla\(/.test(linea), "built with mezcla() of tokens, no hex");
  assert.equal(COLOR_ESTANQUE, mezcla(mezcla(CASA.turquesaProfundo, CASA.verdemar, 0.35), CASA.ceniza, 0.2));
  assert.equal(COLOR_AGUA, COLOR_ESTANQUE, "agua-estilo.ts re-exports the same colour");
  const c = new THREE.Color(COLOR_ESTANQUE), hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
  const r = (COLOR_ESTANQUE >> 16) & 255, g = (COLOR_ESTANQUE >> 8) & 255, b = COLOR_ESTANQUE & 255;
  assert.ok(g > r && b > r && Math.abs(g - b) < 16, `turquoise (green ≈ blue over red): ${COLOR_ESTANQUE.toString(16)}`);
  assert.ok((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b) < 0.55, "muted (the old #2f6f8f was 0.67)");
});

test("R5.2 the tier D painted pond is COLOR_ESTANQUE at the centre with a sea-green rim", () => {
  const t = crearTerreno({ semilla: 1234, nivel: "D", residuos: false, aguaPlana: COLOR_ESTANQUE }), col = t.malla.geometry.attributes.color, n = col.count;
  const centro = new THREE.Color(COLOR_ESTANQUE), borde = new THREE.Color(mezcla(COLOR_ESTANQUE, CASA.verdemar, 0.5));
  const igual = (k: number, c: THREE.Color) => Math.abs(col.getX(k) - c.r) < 1e-4 && Math.abs(col.getY(k) - c.g) < 1e-4 && Math.abs(col.getZ(k) - c.b) < 1e-4;
  assert.ok(igual(n - 3, centro), "the fan's centre vertex");
  assert.ok(igual(n - 1, borde) && igual(n - 2, borde), "the fan's rim vertices");
  t.dispose();
});

test("R5.2 the season: `estacion` (new) or `paleta` (legacy) in naturaleza.json, estacion wins; the page reads both", () => {
  const ok = (j: unknown) => { const r = leerNaturaleza(j); assert.ok(r.ok, JSON.stringify(r)); return r.value; };
  assert.equal(ok({ estacion: "otono" }).paleta, "otono");
  assert.equal(ok({ paleta: "primavera" }).paleta, "primavera", "old files keep working");
  assert.equal(ok({ paleta: "primavera", estacion: "otono" }).paleta, "otono");
  const mal = leerNaturaleza({ estacion: "invierno" });
  assert.ok(!mal.ok && mal.issues.some((i) => i.path === "naturaleza.estacion"));
  assert.equal(normalizar({ estacion: "otono" }).paleta, "otono");
  assert.equal(normalizar({ paleta: "primavera" }).paleta, "primavera");
  assert.equal(estacionDeDatos({ estacion: "toString" }), "verano", "only real seasons");
  assert.equal(estacionDeDatos({}), "verano");
});

test("R5.2 the piece hands the season to the terrain: its ground is ESTACIONES-coloured, the same as the legacy hex path", async () => {
  const otono = crearTerreno({ semilla: 5, nivel: "C", estacion: "otono", residuos: false }), legado = crearTerreno({ semilla: 5, nivel: "C", colores: { prado: 0xc2ae54 }, residuos: false });
  const verano = crearTerreno({ semilla: 5, nivel: "C", estacion: "verano", residuos: false });
  const a = otono.malla.geometry.attributes.color.array, b = legado.malla.geometry.attributes.color.array, v = verano.malla.geometry.attributes.color.array;
  assert.deepEqual(Array.from(a), Array.from(b), "estacion otono = the old autumn hex mapped to its season");
  assert.notDeepEqual(Array.from(a), Array.from(v));
  const padre = new THREE.Group(), ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial()); padre.add(ground);
  const camara = new THREE.PerspectiveCamera(); camara.position.set(0, 1.7, 0);
  const n = crearNaturaleza({ padre, ground, vientoU: uniform(new THREE.Vector3(2, 0, 1)), nivel: () => "C", camara, yo: () => null, niebla: () => 0xbcd6ee });
  await n.aplicar({ semilla: 5, estacion: "otono", estanque: true });
  const ca = n.terreno!.malla.geometry.attributes.color.array, k = (otono.malla.geometry.attributes.color.array as Float32Array).length;
  // the piece's terrain has the residuos baked in and the pond; the lattice's first vertices are what the season colours
  assert.deepEqual(Array.from(ca).slice(0, 300), Array.from(a).slice(0, 300), "same season colours as a direct estacion build");
  assert.ok(k > 300);
  n.dispose(); otono.dispose(); legado.dispose(); verano.dispose();
});
