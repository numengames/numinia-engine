// R6.7 (naturaleza): biomechanical fauna in the house language. Every butterfly / firefly colour comes from paleta.ts (fauna.json mirrors it), the epic
// «relé» tint is far from coral, the wings are deep (not pastel), the eyes are lenses in a brass rim, the fireflies are crystal teardrops, and the
// triangle caps did not grow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COLORES_FAUNA, CASA, RAREZA, FAUNA_R67 } from "../packages/render/src/naturaleza/paleta.ts";
import { geometriaMariposa, trianglesMariposa, TRIANGULOS_LUCIERNAGA, sdLagrima, LAGRIMA } from "../packages/render/src/naturaleza/mariposas.ts";
import { geometriaAve } from "../packages/render/src/naturaleza/aves.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import { FAUNA_POR_NIVEL } from "../packages/relieve/src/fauna.ts";

const crudo = JSON.parse(readFileSync(new URL("../features/naturaleza/fauna.json", import.meta.url), "utf8"));
function lab(c: number): [number, number, number] {
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = lin((c >> 16) & 255), g = lin((c >> 8) & 255), b = lin(c & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a: number, b: number) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const insectos = FAUNA_CASA.especies.filter((e) => e.grupo !== "pajaro");

test("no raw hex: every butterfly and firefly colour of fauna.json is the paleta.ts mix of COLORES_FAUNA; the fauna sources carry no colour literal", () => {
  assert.equal(insectos.length, 24);
  for (const e of crudo.especies.filter((x: { grupo: string }) => x.grupo !== "pajaro")) {
    const c = COLORES_FAUNA[e.id];
    assert.ok(c, `${e.id}: missing in COLORES_FAUNA (paleta.ts)`);
    for (const k of ["cuerpo", "ala", "luz", "circuito"] as const) assert.equal(e.colores[k], hex(c[k]), `${e.id}.${k}: fauna.json must copy paleta.ts (run the sync, never hand-pick a hex)`);
  }
  for (const f of ["mariposas.ts", "aves.ts", "fauna.ts"]) {
    const src = readFileSync(new URL(`../packages/render/src/naturaleza/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /0x[0-9a-fA-F]{6}\b|["'`]#[0-9a-fA-F]{6}["'`]/, `${f}: colours only from paleta.ts`);
  }
});

test("the epic tint is clearly not coral: every epic breed's light is ≥ 40 ΔE from coral (the old «relé» pink was 33.5) and nearer the rarity scale's Épica", () => {
  const epicas = insectos.filter((e) => e.rareza === "epica");
  assert.ok(epicas.length >= 4);
  for (const e of epicas) {
    assert.ok(dE(e.colores.luz, CASA.coral) >= 40, `${e.id}: ΔE to coral ${dE(e.colores.luz, CASA.coral).toFixed(1)}`);
    assert.ok(dE(e.colores.luz, RAREZA.epica) < dE(e.colores.luz, CASA.coral), `${e.id}: nearer Épica than coral`);
  }
  assert.ok(dE(0xf69694, CASA.coral) < 40, "the threshold does catch the old pink");
  const rele = FAUNA_CASA.especies.find((e) => e.id === "luciernaga-rele")!;
  assert.equal(rele.colores.luz, FAUNA_R67.epicaOrquidea);
});

test("butterfly wings are deep, not pastel: every fill has chroma ≥ 18 and lightness ≤ 75 (Lab)", () => {
  for (const e of insectos.filter((x) => x.grupo === "mariposa")) {
    const [L, a, b] = lab(e.colores.ala), C = Math.hypot(a, b);
    assert.ok(C >= 18 && L <= 75, `${e.id}: ${hex(e.colores.ala)} L ${L.toFixed(0)} C ${C.toFixed(0)}`);
  }
  // the old cuarzo (#d1bbde, L 79) and lente (#9bb5ad, C 9) wings would fail
  assert.ok(lab(0xd1bbde)[0] > 75 && Math.hypot(lab(0x9bb5ad)[1], lab(0x9bb5ad)[2]) < 18);
});

test("triangle caps did not grow: butterfly 24 / 19 (R3 30 / 20) with the eyes, firefly still 2, the fuller tier pools are cheaper than before", () => {
  assert.ok(trianglesMariposa(true) <= 30 && trianglesMariposa(false) <= 20, `${trianglesMariposa(true)} / ${trianglesMariposa(false)}`);
  assert.equal(TRIANGULOS_LUCIERNAGA, 2);
  for (const n of ["A", "B", "C", "D"] as const) {
    const L = FAUNA_POR_NIVEL[n].enVista, ahora = L.mariposa * trianglesMariposa(n !== "D") + L.luciernaga * 2, antes = L.mariposa * (n !== "D" ? 30 : 20) + L.luciernaga * 2;
    assert.ok(ahora <= antes, `${n}: ${ahora} > ${antes}`);
  }
});

test("eyes: two equilateral eye triangles per butterfly whose `bord` reads 1/1/1 at the centre (the lens) and 3 at the corners (the body tone); wing frames on the panel edges only", () => {
  for (const det of [true, false]) {
    const g = geometriaMariposa(det), al = g.getAttribute("aleta"), bd = g.getAttribute("bord"), n = al.count / 3;
    const ojos = Array.from({ length: n }, (_, t) => t).filter((t) => al.getX(t * 3) === 8);
    assert.equal(ojos.length, 2);
    for (const t of ojos) {
      const c = [0, 1, 2].map((k) => [bd.getX(t * 3 + k), bd.getY(t * 3 + k), bd.getZ(t * 3 + k)]);
      const centro = [0, 1, 2].map((j) => (c[0][j] + c[1][j] + c[2][j]) / 3);
      for (const v of centro) assert.ok(Math.abs(v - 1) < 1e-4, "the incentre is 1 on all three edges");
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(c[k][k] - 3) < 1e-4);
      const xs = [0, 1, 2].map((k) => g.getAttribute("position").getX(t * 3 + k));
      assert.ok(Math.abs(xs.reduce((p, q) => p + q) / 3) > 0.08, "on the side of the head, not in the middle");
    }
    // framed triangles: the 8 wing panels (some edge below the threshold); everything else carries no frame
    const conMarco = Array.from({ length: n }, (_, t) => t).filter((t) => al.getX(t * 3) !== 8 && [0, 1, 2].some((k) => Math.min(bd.getX(t * 3 + k), bd.getY(t * 3 + k), bd.getZ(t * 3 + k)) < 1));
    assert.equal(conMarco.length, 8);
    assert.ok(conMarco.every((t) => al.getX(t * 3) === 1), "only wing panels are framed");
  }
});

test("fireflies are crystal teardrops: pointed tip above a round bulb, the core inside, the quad corners outside (soft halo, no disc)", () => {
  const { cy, h, rb } = LAGRIMA;
  assert.ok(sdLagrima(0, cy) < -0.3 && sdLagrima(0, cy + h - 0.05) < 0 && sdLagrima(0, cy + h + 0.08) > 0, "inside from bulb to tip");
  const ancho = (y: number) => { let x = 0; while (sdLagrima(x, y) < 0) x += 0.001; return x; };
  assert.ok(ancho(cy + h * 0.7) < ancho(cy) * 0.5, "narrows to a point: not a disc");
  assert.ok(Math.abs(ancho(cy) - rb) < 0.01);
  for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) assert.ok(sdLagrima(x, y) > 0.3, "the quad corners are far outside");
});

test("birds: brass beak (plate) and turquoise eye lenses (pl 3), same triangle count", () => {
  const g = geometriaAve().geometria, k = g.getAttribute("aK"), n = k.count;
  const ojos = Array.from({ length: n }, (_, i) => k.getW(i)).filter((w) => w === 3).length;
  assert.equal(ojos, 6, "two eye triangles");
  assert.equal(geometriaAve().triangulos, 39);
});
