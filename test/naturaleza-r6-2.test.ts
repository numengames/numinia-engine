// R6.2 (naturaleza): the ground reads in three bands — water (fresh moss, verdigris, the pale dry stream bed), colony garden
// (light parchment) and anthracite moor (dark and golden) — and the grass follows them. Pure functions + the built mesh, no GPU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearTerreno, franjasEn, alturaEn, zonaEn, estanqueDe } from "../packages/render/src/naturaleza/terreno.ts";
import { tuftsDeCelda } from "../packages/render/src/naturaleza/hierba.ts";
import type { Fuente } from "../packages/render/src/naturaleza/hierba.ts";
import { HIERBA_POR_NIVEL } from "../packages/render/src/naturaleza/niveles.ts";

const S = 1234;
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // linear (the mesh stores linear colour)
const banda = (x: number, z: number, h: number) => { const f = franjasEn(S, x, z, h); return f.lecho > 0.7 ? "lecho" : f.agua > 0.75 ? "agua" : f.paramo > 0.75 ? "paramo" : f.jardin > 0.75 ? "jardin" : null; };

test("R6.2: the bands are soft weights that sum to 1, deterministic; the plaza is garden; the bed leaves the pond and runs far", () => {
  let lejos = 0;
  const e = estanqueDe(S);
  for (let x = -96; x <= 96; x += 4) for (let z = -96; z <= 96; z += 4) {
    const h = alturaEn(S, x, z), f = franjasEn(S, x, z, h), g = franjasEn(S, x, z, h);
    assert.deepEqual(f, g);
    assert.ok(Math.abs(f.agua + f.paramo + f.jardin - 1) < 1e-9 && f.lecho >= 0 && f.lecho <= f.agua + 1e-9, `${x},${z}`);
    if (Math.hypot(x, z) < 12) assert.ok(f.paramo === 0 && f.lecho === 0, "plaza stays garden");
    if (f.lecho > 0.8 && Math.hypot(x - e.x, z - e.z) > e.radio + 40) lejos++;
  }
  assert.ok(lejos >= 15, `the bed reaches 40 m past the pond at ${lejos} sample points`);
});

test("R6.2: zone colour ordering on the built ground — moor darker than garden, bed lighter than garden, water greener than garden", () => {
  const t = crearTerreno({ semilla: S, nivel: "A", residuos: false }), col = t.malla.geometry.attributes.color, pos = t.malla.geometry.attributes.position;
  const acc: Record<string, { l: number; verde: number; n: number }> = {};
  for (let k = 0; k < col.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    if (Math.abs(x) > 80 || Math.abs(z) > 80 || y < 0) continue;
    const b = banda(x, z, y); if (!b) continue;
    const r = col.getX(k), g = col.getY(k), bl = col.getZ(k), a = (acc[b] ??= { l: 0, verde: 0, n: 0 });
    a.l += lum(r, g, bl); a.verde += g - (r + bl) / 2; a.n++;
  }
  t.dispose();
  for (const b of ["lecho", "agua", "paramo", "jardin"]) assert.ok(acc[b]?.n > 20, `${b}: ${acc[b]?.n} vertices`);
  const m = (b: string) => acc[b].l / acc[b].n, v = (b: string) => acc[b].verde / acc[b].n;
  assert.ok(m("paramo") < m("jardin") * 0.5, `moor ${m("paramo").toFixed(3)} vs garden ${m("jardin").toFixed(3)}`);
  assert.ok(m("lecho") > m("jardin") * 1.15, `bed ${m("lecho").toFixed(3)} vs garden ${m("jardin").toFixed(3)}`);
  assert.ok(v("agua") > v("jardin") + 0.02, `water green ${v("agua").toFixed(3)} vs garden ${v("jardin").toFixed(3)}`);
});

test("R6.2: grass follows the bands — none on the bed, thinner and darker-gold on the moor, fresher by the water", () => {
  const t = crearTerreno({ semilla: S, nivel: "D", residuos: false });
  const f: Fuente = { alturaEn: t.alturaEn, zonaEn: t.zonaEn, franjaEn: t.franjaEn }, n = HIERBA_POR_NIVEL.A;
  const acc: Record<string, { l: number; verde: number; n: number; cand: number }> = {};
  for (let cx = -14; cx <= 14; cx += 2) for (let cz = -14; cz <= 14; cz += 2) {
    const x0 = (cx + 0.5) * n.celda, z0 = (cz + 0.5) * n.celda, h0 = t.alturaEn(x0, z0);
    if (zonaEn(S, x0, z0) !== "prado") continue;
    const b0 = banda(x0, z0, h0);
    for (const p of tuftsDeCelda(S, cx, cz, f, n)) {
      const fr = t.franjaEn(p.x, p.z, p.y);
      assert.ok(fr.lecho < 0.56, `a tuft on the dry bed at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      const b = banda(p.x, p.z, p.y); if (!b || b === "lecho") continue;
      const a = (acc[b] ??= { l: 0, verde: 0, n: 0, cand: 0 }); a.l += lum(p.r, p.g, p.b); a.verde += p.g - (p.r + p.b) / 2; a.n++;
    }
    if (b0 && b0 !== "lecho") (acc[b0] ??= { l: 0, verde: 0, n: 0, cand: 0 }).cand++;
  }
  t.dispose();
  const m = (b: string) => acc[b].l / acc[b].n, v = (b: string) => acc[b].verde / acc[b].n, d = (b: string) => acc[b].n / Math.max(1, acc[b].cand);
  for (const b of ["agua", "paramo", "jardin"]) assert.ok(acc[b]?.n > 10, `${b}: ${acc[b]?.n} tufts`);
  assert.ok(m("paramo") < m("jardin"), `moor tufts ${m("paramo").toFixed(3)} vs garden ${m("jardin").toFixed(3)}`);
  assert.ok(v("agua") > v("jardin") && v("agua") > v("paramo"), `water tufts are the greenest (${v("agua").toFixed(3)})`);
  assert.ok(d("paramo") < d("jardin") * 0.75, `moor density ${d("paramo").toFixed(1)} vs garden ${d("jardin").toFixed(1)} tufts per cell`);
});

test("R6.2: no raw hex — the band colours are named mixes of house tokens; terreno.ts and hierba.ts carry no colour hex", () => {
  const raiz = new URL("../packages/render/src/naturaleza/", import.meta.url);
  const pal = readFileSync(new URL("paleta.ts", raiz), "utf8"), bloque = pal.slice(pal.indexOf("export const FRANJAS"), pal.indexOf("} as const;", pal.indexOf("export const FRANJAS")));
  assert.ok(bloque.length > 200 && !/0x[0-9a-f]/i.test(bloque), "FRANJAS is built only from tokens with mezcla()");
  for (const f of ["terreno.ts", "hierba.ts"]) {
    const hex = readFileSync(new URL(f, raiz), "utf8").match(/0x[0-9a-f]{6}\b/gi) ?? [];
    assert.deepEqual(hex.filter((h) => h.toLowerCase() !== "0xbcd6ee"), [], `${f}: only the caller's fog default may be a literal`); // 0xbcd6ee: default fog when the caller passes none (not a ground colour)
  }
});
