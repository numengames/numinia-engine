// R6.5 (naturaleza): the lore's minor flora baked into the terrain mesh: pure/deterministic, zone placement, triangle caps per tier, no raw hex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { construirFlora, FLORA_POR_NIVEL, ZONAS_PLANTA, TIPOS_PLANTA, MARGEN_PLAZA_FLORA, MARGEN_ESTANQUE_FLORA } from "../packages/render/src/naturaleza/flora.ts";
import { crearTerreno, CELDAS_TERRENO, triangulosDeTerreno, alturaEn, zonaEn, estanqueDe, NIVEL_AGUA } from "../packages/render/src/naturaleza/terreno.ts";
import { RESIDUOS_POR_NIVEL } from "../packages/render/src/naturaleza/residuos.ts";
import { PRESUPUESTO_NATURALEZA } from "../packages/render/src/naturaleza/niveles.ts";
import { FLORA, SENAL } from "../packages/render/src/naturaleza/paleta.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const NIVELES: Nivel[] = ["A", "B", "C", "D"], S = 1234, SEMILLAS = [S, 7, 99, 31337, 2024];
const op = { tamano: 200, plaza: 12 };
const hacer = (nivel: Nivel, semilla = S, extra: { maxTriangulos?: number } = {}) =>
  construirFlora(semilla, { nivel, tamano: 200, plaza: 12, estanque: estanqueDe(semilla, 200), ...extra }, (x, z) => alturaEn(semilla, x, z, op), (x, z) => zonaEn(semilla, x, z, op));

test("pure and deterministic: same seed, same bytes; another seed, other plants", () => {
  const a = hacer("A"), b = hacer("A"), c = hacer("A", 99);
  assert.deepEqual(a.plantas, b.plantas);
  assert.deepEqual(Array.from(a.posiciones), Array.from(b.posiciones));
  assert.deepEqual(Array.from(a.colores), Array.from(b.colores));
  assert.notDeepEqual(a.plantas, c.plantas);
});

test("zones: cactus and glass spines only on the moor, heather and saffron only in the garden; nothing in the plaza, the pond, the shore or under water", () => {
  for (const semilla of SEMILLAS) {
    const e = estanqueDe(semilla, 200), f = hacer("A", semilla, { maxTriangulos: 4000 });
    assert.ok(f.plantas.length > 10, `seed ${semilla}: ${f.plantas.length} plants`);
    for (const p of f.plantas) {
      const z = zonaEn(semilla, p.x, p.z, op);
      assert.equal(z, p.zona);
      assert.ok(ZONAS_PLANTA[p.tipo].includes(z), `seed ${semilla}: ${p.tipo} in ${z}`);
      assert.ok(Math.hypot(p.x, p.z) >= 12 + MARGEN_PLAZA_FLORA, `seed ${semilla}: ${p.tipo} in the plaza`);
      assert.ok(Math.hypot(p.x - e.x, p.z - e.z) >= e.radio * 1.25 + MARGEN_ESTANQUE_FLORA, `seed ${semilla}: ${p.tipo} in the pond`);
      assert.ok(p.y > NIVEL_AGUA, `seed ${semilla}: ${p.tipo} under water`);
    }
    assert.ok(!f.plantas.some((p) => ["cactus", "espinas"].includes(p.tipo) && p.zona !== "roca"));
    assert.ok(!f.plantas.some((p) => ["brezo", "azafran"].includes(p.tipo) && !["prado", "bosque"].includes(p.zona)));
  }
  assert.deepEqual([...ZONAS_PLANTA.cactus], ["roca"]);
  assert.deepEqual([...ZONAS_PLANTA.espinas], ["roca"]);
});

test("every kind appears, sized to read by silhouette at 8 m (cactus 1–2.5 m), each plant a lean mesh", () => {
  const vistos = new Map<string, number[]>();
  for (const semilla of SEMILLAS) for (const p of hacer("A", semilla, { maxTriangulos: 4000 }).plantas) { const l = vistos.get(p.tipo) ?? []; l.push(p.alto); vistos.set(p.tipo, l); assert.ok(p.triangulos >= 9 && p.triangulos <= 100, `${p.tipo}: ${p.triangulos} triangles`); }
  assert.deepEqual([...vistos.keys()].sort(), [...TIPOS_PLANTA].sort());
  const cac = vistos.get("cactus")!;
  assert.ok(Math.min(...cac) >= 0.8 && Math.max(...cac) <= 2.5 * 1.15 + 0.01 && Math.max(...cac) >= 1.8, `cactus heights ${Math.min(...cac).toFixed(2)}–${Math.max(...cac).toFixed(2)}`);
  for (const k of ["espinas", "brezo", "azafran", "cardo"]) assert.ok(Math.max(...vistos.get(k)!) >= 0.5, `${k} too small to read at 8 m`);
});

test("tier A shows both bands near the spawn: a moor group and a garden group", () => {
  const f = hacer("A");
  assert.ok(f.plantas.some((p) => p.tipo === "cactus") && f.plantas.some((p) => p.tipo === "brezo"));
  for (const n of NIVELES) assert.ok(hacer(n).plantas.some((p) => p.tipo === "cactus"), `${n}: no cactus`);
});

test("triangle caps per tier: flora fits its cap, the terrain bakes exactly it, and terrain + Residuos + flora stay inside the terrain's share; zero new draw calls", () => {
  for (const n of NIVELES) {
    for (const semilla of SEMILLAS) assert.ok(hacer(n, semilla).triangulos <= FLORA_POR_NIVEL[n], `${n}/${semilla}`);
    const f = hacer(n), t = crearTerreno({ semilla: S, nivel: n, aguaPlana: n === "D" ? 1 : undefined });
    assert.equal(f.posiciones.length, f.triangulos * 9); assert.equal(f.colores.length, f.triangulos * 9);
    // the terrain stands the plants on its drawn facets and keeps them off the Residuos, so its count may differ a little from the bare call
    assert.ok(t.flora.triangulos > 0 && t.flora.triangulos <= FLORA_POR_NIVEL[n], `${n}: terrain bakes ${t.flora.triangulos}`);
    assert.equal(t.triangulos, triangulosDeTerreno(CELDAS_TERRENO[n], n === "D") + t.residuos.triangulos + t.flora.triangulos);
    assert.ok(triangulosDeTerreno(CELDAS_TERRENO[n], n === "D") + RESIDUOS_POR_NIVEL[n] + FLORA_POR_NIVEL[n] <= PRESUPUESTO_NATURALEZA[n].reparto.terreno, `${n}: worst terrain over its share`);
    let mallas = 0; t.malla.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) mallas++; });
    assert.equal(mallas, 1, "still one mesh, one draw call");
    const sin = crearTerreno({ semilla: S, nivel: n, flora: false, aguaPlana: n === "D" ? 1 : undefined });
    assert.equal(sin.flora.triangulos, 0); assert.equal(t.triangulos - sin.triangulos, t.flora.triangulos);
    const bare = crearTerreno({ semilla: S, nivel: n, residuos: false });
    assert.equal(bare.flora.triangulos, 0, "residuos: false is still the bare terrain"); bare.dispose();
    t.dispose(); sin.dispose();
  }
  assert.ok(hacer("A").triangulos > 400, "tier A is not empty");
});

test("no raw hex: flora.ts takes every colour from paleta.ts, and the R6.5 block of paleta.ts only mixes tokens", () => {
  const src = readFileSync(new URL("../packages/render/src/naturaleza/flora.ts", import.meta.url), "utf8");
  assert.equal(src.match(/0x[0-9a-f]{3,}/gi), null, "flora.ts carries a raw hex");
  assert.ok(!/#[0-9a-f]{6}\b/i.test(src));
  const pal = readFileSync(new URL("../packages/render/src/naturaleza/paleta.ts", import.meta.url), "utf8"), bloque = pal.slice(pal.indexOf("// R6.5"));
  assert.ok(bloque.includes("export const FLORA"), "the R6.5 block sits at the end of paleta.ts");
  assert.equal(bloque.match(/0x[0-9a-f]{3,}/gi), null, "the R6.5 block carries a raw hex");
  // the only saturated accent is the turquoise signal dot, a few triangles per cactus
  const f = hacer("A"), [tr, tg, tb] = [SENAL.turquesa >> 16, (SENAL.turquesa >> 8) & 255, SENAL.turquesa & 255].map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  let led = 0;
  for (let i = 0; i < f.colores.length; i += 9) if (Math.abs(f.colores[i] - tr) < 1e-6 && Math.abs(f.colores[i + 1] - tg) < 1e-6 && Math.abs(f.colores[i + 2] - tb) < 1e-6) led++;
  assert.equal(led, f.plantas.filter((p) => p.tipo === "cactus").length * 3, "one 3-triangle turquoise dot per cactus");
  assert.ok(Object.values(FLORA).every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff));
});
