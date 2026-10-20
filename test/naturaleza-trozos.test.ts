// E02 · trozos (RT1): the terrain lattice in ~64 m chunks with two detail rings, ONE draw call (index ranges), CDLOD-style morph.
// Checks: off = the single mesh untouched; on = the same triangles when every chunk is fine; coarse chunks cover their area;
// after any camera move the drawn (morphed) surface has no crack across chunk borders and a coarse chunk shows exactly what its
// fully morphed fine version showed (no pop); triangles never exceed the single mesh; props follow the coarse ground.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearTerreno, CELDAS_TERRENO } from "../packages/render/src/naturaleza/terreno.ts";
import { partir, factorRelevo, RELEVO, celdasPorTrozo, gruesoEn, alturaGruesaEn, distanciaATrozo, TROZOS_DEFECTO } from "../packages/render/src/naturaleza/trozos.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const S = 1234, NIVELES: Nivel[] = ["A", "B", "C", "D"], T = TROZOS_DEFECTO;
type Geo = { attributes: Record<string, { array: ArrayLike<number> }>; index: { array: ArrayLike<number>; count: number }; drawRange: { start: number; count: number } };
const geo = (t: ReturnType<typeof crearTerreno>) => t.malla.geometry as unknown as Geo;
const tris = (a: ArrayLike<number>, from: number, to: number) => { const out: string[] = []; for (let i = from; i < to; i += 3) out.push(`${a[i]},${a[i + 1]},${a[i + 2]}`); return out.sort(); };

test("E02: celdasPorTrozo is even and close to 64 m on every tier; chunks tile the lattice", () => {
  for (const n of NIVELES) {
    const c = CELDAS_TERRENO[n], paso = 200 / c, k = celdasPorTrozo(paso, 64), p = partir({ n: c, tam: 200 });
    assert.equal(k % 2, 0); assert.ok(Math.abs(k * paso - 64) <= paso, `${n}: ${k} cells = ${(k * paso).toFixed(1)} m`);
    assert.equal(p.trozos.reduce((s, t) => s + t.fino.length, 0), 6 * c * c, `${n}: fine ranges = the whole lattice`);
    for (const t of p.trozos) assert.equal(t.grueso.length * 4, t.fino.length, `${n}: a coarse chunk has a quarter of the triangles`);
  }
});

test("E02: factorRelevo is 0 inside 0.6 R and exactly 1 from 0.95 R (fine vertices beside a coarse chunk are fully morphed)", () => {
  assert.equal(factorRelevo(0, 64), 0); assert.equal(factorRelevo(RELEVO[0] * 64, 64), 0);
  assert.equal(factorRelevo(RELEVO[1] * 64, 64), 1); assert.equal(factorRelevo(64, 64), 1); assert.equal(factorRelevo(500, 64), 1);
  const m = factorRelevo(0.775 * 64, 64); assert.ok(m > 0.4 && m < 0.6);
});

test("E02: off = single mesh (no grueso attribute, draw range untouched); on + every chunk fine = the same triangles, same index.count", () => {
  for (const n of NIVELES) {
    const off = crearTerreno({ semilla: S, nivel: n, aguaPlana: n === "D" ? 1 : undefined }), on = crearTerreno({ semilla: S, nivel: n, aguaPlana: n === "D" ? 1 : undefined, trozos: T });
    const a = geo(off), b = geo(on);
    assert.equal(off.trozos, null); assert.equal(a.attributes.grueso, undefined);
    assert.equal(a.index.count, b.index.count, `${n}: index.count`);
    assert.deepEqual(Array.from(a.attributes.position.array), Array.from(b.attributes.position.array), `${n}: vertices untouched`);
    assert.deepEqual(tris(a.index.array, 0, a.index.count), tris(b.index.array, 0, b.drawRange.count), `${n}: same triangles before the first update`);
    assert.equal(on.triangulos, off.triangulos, `${n}: the budget figure (worst case) does not move`);
  }
});

// ---- CPU twin of the drawn surface: morph every lattice vertex by camera distance, then point-locate in the drawn triangles (xz)
function superficie(t: ReturnType<typeof crearTerreno>, nivel: Nivel, cx: number, cz: number) {
  const g = geo(t), P = g.attributes.position.array, G = g.attributes.grueso.array, I = g.index.array, cnt = g.drawRange.count;
  const y = (k: number) => { const m = factorRelevo(Math.hypot(P[k * 3] - cx, P[k * 3 + 2] - cz), T.radioDetalle); return P[k * 3 + 1] + (G[k * 4] - P[k * 3 + 1]) * m; };
  const lista: number[][] = [], nv = CELDAS_TERRENO[nivel] + 1; // lattice triangles only (the loose props are not ground)
  for (let i = 0; i < cnt; i += 3) { if (I[i] >= nv * nv || I[i + 1] >= nv * nv || I[i + 2] >= nv * nv) continue; lista.push([I[i], I[i + 1], I[i + 2]]); }
  return (x: number, z: number): number[] => {
    const hs: number[] = [];
    for (const [a, b, c] of lista) {
      const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], qx = P[c * 3], qz = P[c * 3 + 2];
      const det = (bz - qz) * (ax - qx) + (qx - bx) * (az - qz);
      const l1 = ((bz - qz) * (x - qx) + (qx - bx) * (z - qz)) / det, l2 = ((qz - az) * (x - qx) + (ax - qx) * (z - qz)) / det, l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) hs.push(l1 * y(a) + l2 * y(b) + l3 * y(c));
    }
    return hs;
  };
}

test("E02: no cracks — across every chunk border the drawn, morphed surface has one height, for cameras all over the map", () => {
  for (const n of NIVELES) {
    const t = crearTerreno({ semilla: S, nivel: n, residuos: false, trozos: T });
    const p = partir({ n: CELDAS_TERRENO[n], tam: 200 }), lineas = [...new Set(p.trozos.flatMap((q) => [q.x0, q.x1]))].filter((v) => Math.abs(v) < 99.9);
    let mixtos = 0;
    for (const [cx, cz] of [[14, 0], [0, -14], [-60, 40], [85, 85], [-90, -10]]) {
      t.trozos!.actualizar(cx, cz);
      const st = t.trozos!.estadisticas(); if (st.finos && st.gruesos) mixtos++;
      const h = superficie(t, n, cx, cz);
      for (const L of lineas) for (let s = -99.3; s < 99.3; s += 1.37) for (const [x, z] of [[L, s], [s, L]]) {
        const hs = h(x, z);
        assert.ok(hs.length >= 1, `${n}: hole at (${x.toFixed(2)}, ${z.toFixed(2)})`);
        const lo = Math.min(...hs), hi = Math.max(...hs);
        assert.ok(hi - lo < 1e-4, `${n} cam (${cx},${cz}): crack ${(hi - lo).toFixed(5)} m at (${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    assert.ok(mixtos >= 3, `${n}: the cameras must mix fine and coarse chunks (${mixtos})`);
  }
});

test("E02: no pop — inside a coarse chunk the fully morphed fine surface equals the coarse one", () => {
  for (const n of NIVELES) {
    const c = CELDAS_TERRENO[n], fino = crearTerreno({ semilla: S, nivel: n, residuos: false, trozos: { lado: 64, radioDetalle: 1e6 } });
    const grueso = crearTerreno({ semilla: S, nivel: n, residuos: false, trozos: T });
    fino.trozos!.actualizar(0, 0); grueso.trozos!.actualizar(1e4, 1e4); // every chunk fine / every chunk coarse
    assert.equal(grueso.trozos!.estadisticas().finos, 0);
    // fine mesh morphed as if the camera were far (factor 1): read the grueso heights directly through a camera at infinity
    const hf = superficie(fino, n, 1e7, 1e7), hg = superficie(grueso, n, 1e7, 1e7);
    for (let x = -97.1; x < 97; x += 3.3) for (let z = -96.7; z < 97; z += 4.1) {
      const a = hf(x, z), b = hg(x, z);
      assert.ok(a.length && b.length);
      assert.ok(Math.abs(a[0] - b[0]) < 1e-4, `${n}: (${x.toFixed(1)}, ${z.toFixed(1)}) fine→coarse ${a[0]} vs ${b[0]}`);
    }
    // and the coarse surface is the pure alturaGruesaEn over the lattice heights
    const H = new Float32Array((c + 1) ** 2), P = geo(grueso).attributes.position.array; for (let k = 0; k < H.length; k++) H[k] = P[k * 3 + 1];
    for (let x = -95.3; x < 95; x += 7.7) assert.ok(Math.abs(hg(x, 13.1)[0] - alturaGruesaEn(H, c, 200, x, 13.1)) < 1e-4);
  }
});

test("E02: chunks never draw more than the single mesh; around the plaza the coarse ring saves triangles (A, C, D); switching is rare", () => {
  for (const n of NIVELES) {
    const t = crearTerreno({ semilla: S, nivel: n, aguaPlana: n === "D" ? 1 : undefined, trozos: T });
    let cambios = 0, minimo = Infinity, gruesos = 0;
    for (let i = 0; i < 240; i++) {
      const a = (i / 240) * Math.PI * 2; if (t.trozos!.actualizar(Math.cos(a) * 14, Math.sin(a) * 14)) cambios++;
      const e = t.trozos!.estadisticas(); minimo = Math.min(minimo, e.triangulos); gruesos = Math.max(gruesos, e.gruesos);
      assert.ok(e.triangulos <= t.triangulos, `${n}: ${e.triangulos} ≤ ${t.triangulos}`);
    }
    // B: 3 × 3 chunks of 66.7 m on a 200 m world — from the plaza every chunk is within 64 m, so all stay fine (nothing to save here)
    if (n === "B") assert.equal(gruesos, 0); else assert.ok(gruesos > 0 && minimo < t.triangulos, `${n}: some chunk turns coarse on the lap`);
    assert.ok(cambios <= 12, `${n}: ${cambios} index uploads over one bench lap`);
  }
});

test("E02: loose props (Residuos, flora, skirt) follow the coarse ground; the painted pond stays flat", () => {
  const t = crearTerreno({ semilla: S, nivel: "D", aguaPlana: 1, trozos: T }), g = geo(t), P = g.attributes.position.array, G = g.attributes.grueso.array;
  const c = CELDAS_TERRENO.D, nv = c + 1, H = new Float32Array(nv * nv); for (let k = 0; k < H.length; k++) H[k] = P[k * 3 + 1];
  const pond0 = nv * nv + 8 * c * 3;
  for (let k = pond0; k < pond0 + 14 * 3; k++) assert.equal(G[k * 4], P[k * 3 + 1], "pond flat");
  let movidos = 0;
  for (let k = pond0 + 14 * 3; k < P.length / 3; k++) if (Math.abs(G[k * 4] - P[k * 3 + 1]) > 1e-3) movidos++;
  assert.ok(movidos > 0, "some prop vertex sits where the coarse ground differs");
  // the lattice: even vertices keep their height, odd ones get the coarse mean
  const hG = gruesoEn(H, c, 1);
  for (let k = 0; k < nv * nv; k++) assert.equal(G[k * 4], hG[k]);
  assert.equal(hG[0], H[0]); assert.equal(hG[1], Math.fround((H[0] + H[2]) / 2));
});

test("E02: distanciaATrozo is 0 inside and Euclidean outside", () => {
  const p = partir({ n: 34, tam: 200 }), t = p.trozos[0];
  assert.equal(distanciaATrozo(t, t.x0 + 1, t.z0 + 1), 0);
  assert.ok(Math.abs(distanciaATrozo(t, t.x1 + 3, t.z1 + 4) - 5) < 1e-9);
});
