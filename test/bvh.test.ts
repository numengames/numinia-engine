// M6 stories 3 and 4: the integer BVH and the ray against it (packages/sim/src/bvh.ts), and the mesh as ground.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fx, FX_ONE, hex } from "../packages/core/src/index.ts";
import { buildBvh, rayBvh, bvhFingerprint, quantizeTriangles, BVH_LEAF, NODE_STRIDE, TRI_STRIDE } from "../packages/sim/src/bvh.ts";
import { createSim, spawnAvatar, step, setMesh, groundHeight, STEP_UP } from "../packages/sim/src/index.ts";
import { terrainTriangles } from "./bvh-malla.ts";

const U = 64; // 1/64 m units per metre
/** A horizontal square (two triangles) at height `y` metres from -s..s, wound so the normal points up. */
const floor = (y: number, s = 10): number[] => [
  -s * U, y * U, -s * U, s * U, y * U, s * U, s * U, y * U, -s * U,
  -s * U, y * U, -s * U, -s * U, y * U, s * U, s * U, y * U, s * U,
];
const down = (b: ReturnType<typeof buildBvh>, x: number, y: number, z: number, max = 100) => rayBvh(b, fx(x), fx(y), fx(z), 0, -FX_ONE, 0, fx(max));

test("bvh: a ray down onto a floor gives the point, an upward normal and the distance", () => {
  const b = buildBvh(new Int32Array(floor(2)));
  assert.equal(b.count, 2);
  const h = down(b, 1, 5, 1.5);
  assert.ok(h);
  assert.deepEqual([h.x, h.y, h.z, h.t], [fx(1), fx(2), fx(1.5), fx(3)]);
  assert.deepEqual([h.nx, h.ny, h.nz], [0, FX_ONE, 0]);
  assert.ok(h.tri === 0 || h.tri === 1);
  // from below the normal faces the ray (down)
  const up = rayBvh(b, fx(1), fx(0), fx(1), 0, FX_ONE, 0, fx(100));
  assert.ok(up);
  assert.deepEqual([up.y, up.ny, up.t], [fx(2), -FX_ONE, fx(2)]);
});

test("bvh: misses outside the floor, beyond max, and when looking away", () => {
  const b = buildBvh(new Int32Array(floor(2)));
  assert.equal(down(b, 11, 5, 0), null);
  assert.equal(down(b, 0, 5, 0, 2.5), null);
  assert.equal(rayBvh(b, fx(0), fx(5), fx(0), 0, FX_ONE, 0, fx(100)), null);
  assert.equal(rayBvh(buildBvh(new Int32Array(0)), 0, fx(5), 0, 0, -FX_ONE, 0, fx(100)), null);
});

test("bvh: a wall hit along +x and a 45° slope give the right normals", () => {
  // wall at x = 3, from z -5..5, y 0..4
  const wall = new Int32Array([3 * U, 0, -5 * U, 3 * U, 4 * U, 5 * U, 3 * U, 0, 5 * U, 3 * U, 0, -5 * U, 3 * U, 4 * U, -5 * U, 3 * U, 4 * U, 5 * U]);
  const w = rayBvh(buildBvh(wall), fx(0), fx(1), fx(0), FX_ONE, 0, 0, fx(10));
  assert.ok(w);
  assert.deepEqual([w.x, w.y, w.z, w.t, w.nx, w.ny, w.nz], [fx(3), fx(1), 0, fx(3), -FX_ONE, 0, 0]);
  // slope y = x over z -5..5, x 0..8
  const slope = new Int32Array([0, 0, -5 * U, 8 * U, 8 * U, 5 * U, 8 * U, 8 * U, -5 * U, 0, 0, -5 * U, 0, 0, 5 * U, 8 * U, 8 * U, 5 * U]);
  const s = down(buildBvh(slope), 2, 10, 1);
  assert.ok(s);
  assert.equal(s.y, fx(2));
  assert.ok(Math.abs(s.nx + 46341) <= 1 && Math.abs(s.ny - 46341) <= 1 && s.nz === 0, `normal ${s.nx} ${s.ny} ${s.nz}`);
});

test("bvh: the nearest of several triangles wins, whatever the order", () => {
  const tris = new Int32Array([...floor(2), ...floor(4), ...floor(-1)]);
  const b = buildBvh(tris);
  const h = down(b, 0.5, 10, -0.5);
  assert.ok(h);
  assert.equal(h.y, fx(4));
  assert.ok(h.tri === 2 || h.tri === 3);
  const h2 = down(b, 0.5, 3, -0.5);
  assert.ok(h2 && h2.y === fx(2));
  const h3 = down(b, 0.5, 1, -0.5);
  assert.ok(h3 && h3.y === fx(-1));
});

test("bvh: the tree agrees with a brute-force scan on random rays over a terrain", () => {
  const tris = terrainTriangles(20, 40); // 800 triangles
  const b = buildBvh(tris);
  const singles: ReturnType<typeof buildBvh>[] = [];
  for (let t = 0; t < b.count; t++) singles.push(buildBvh(tris.slice(t * TRI_STRIDE, (t + 1) * TRI_STRIDE)));
  const r = new Uint32Array([99]);
  const next = () => { let t = (r[0] = (r[0] + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; };
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    const ox = (next() % fx(44)) - fx(22), oy = fx(3) + (next() % fx(4)), oz = (next() % fx(44)) - fx(22);
    const dx = (next() % 40000) - 20000, dz = (next() % 40000) - 20000, dy = -(next() % 60000) - 5536;
    const a = rayBvh(b, ox, oy, oz, dx, dy, dz, fx(60));
    let best: ReturnType<typeof rayBvh> = null;
    for (const s of singles) { const h = rayBvh(s, ox, oy, oz, dx, dy, dz, fx(60)); if (h && (!best || h.t < best.t)) best = h; }
    if (best) hits++;
    assert.deepEqual(a && { t: a.t, y: a.y }, best && { t: best.t, y: best.y }, `ray ${i}`);
  }
  assert.ok(hits > 30, `only ${hits} hits`);
});

test("bvh: 50k triangles build under 100 ms, leaves of ≤ 8, every triangle once, stable fingerprint", () => {
  const tris = terrainTriangles(158, 200); // 49,928 triangles
  let best = Infinity, b = buildBvh(tris);
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); b = buildBvh(tris); best = Math.min(best, performance.now() - t0); }
  assert.ok(best < 100, `build took ${best.toFixed(1)} ms`);
  console.log(`bvh: ${b.count} triangles built in ${best.toFixed(1)} ms (best of 3), ${b.nodeCount} nodes`);
  const seen = new Uint8Array(b.count);
  let maxLeaf = 0, leaves = 0;
  for (let n = 0; n < b.nodeCount; n++) {
    const o = n * NODE_STRIDE, cnt = b.nodes[o + 7];
    if (cnt === 0) continue;
    leaves++; maxLeaf = Math.max(maxLeaf, cnt);
    for (let k = 0; k < cnt; k++) seen[b.idx[b.nodes[o + 6] + k]]++;
  }
  assert.ok(maxLeaf <= BVH_LEAF, `a leaf holds ${maxLeaf}`);
  assert.ok(seen.every((c) => c === 1), "every triangle in exactly one leaf");
  assert.ok(leaves > b.count / BVH_LEAF);
  assert.equal(hex(bvhFingerprint(b)), hex(bvhFingerprint(buildBvh(tris))));
  assert.equal(hex(bvhFingerprint(buildBvh(terrainTriangles(20, 40)))), "e88b38d3"); // pinned: changing the build is a format change
  // the terrain as ground: a ray down anywhere inside lands on it
  const h = down(b, 12.3, 10, -40.7);
  assert.ok(h && h.y > fx(-1) && h.y < fx(1.2), `terrain height ${h?.y}`);
});

test("bvh: quantizeTriangles rounds metres to 1/64 and follows indices", () => {
  const q = quantizeTriangles([0, 0, 0, 1.0001, 0.5, 0, 0, 0, 2.03125], [2, 1, 0]);
  assert.deepEqual([...q], [0, 0, 130, 64, 32, 0, 0, 0, 0]);
});

test("sim: a mesh is ground — standing, falling onto it, a step up counts, a ledge over STEP_UP does not", () => {
  const s = createSim(2, 1);
  assert.equal(groundHeight(fx(1), fx(1), s, fx(5)), 0);
  setMesh(s, buildBvh(new Int32Array([...floor(2), ...floor(2.25, 1)]))); // a 25 cm step on the 2 m floor
  assert.equal(groundHeight(fx(5), fx(5), s, fx(5)), fx(2));
  assert.equal(groundHeight(fx(0.5), fx(0.5), s, fx(2)), fx(2.25));  // the step, 0.25 ≤ STEP_UP
  assert.equal(groundHeight(fx(5), fx(5), s, fx(1)), 0);              // a metre under the floor: nothing within STEP_UP
  assert.ok(STEP_UP >= fx(0.25));
  const e = spawnAvatar(s, 0);
  s.tf.cols.x[e] = fx(5); s.tf.cols.z[e] = fx(5); s.tf.cols.y[e] = fx(6);
  for (let t = 0; t < 60; t++) step(s, new Int32Array([e, 0, 0, 0]));
  assert.equal(s.tf.cols.y[e], fx(2));
  assert.equal(s.mo.cols.vy[e], 0);
  setMesh(s, null);
  assert.equal(groundHeight(fx(5), fx(5), s, fx(5)), 0);
});

const PW = new URL("../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const browserHere = existsSync(PW) && existsSync(CHROME);

test("bvh: the browser builds the same tree (same fingerprint) and the same ray hit as Node", { skip: !browserHere && "no chromium here (CI): e2e runs it" }, async () => {
  const { rolldown } = await import("rolldown");
  const entry = new URL("./bvh-malla.ts", import.meta.url).pathname;
  const bundle = await rolldown({ input: entry, platform: "browser" });
  const { output } = await bundle.generate({ format: "iife", name: "M" });
  await bundle.close();
  const tris = terrainTriangles(158, 200);
  const b = buildBvh(tris);
  const nodeFp = hex(bvhFingerprint(b));
  const ray = [fx(12.3), fx(10), fx(-40.7), 20000, -60000, -7000, fx(80)] as const;
  const hit = rayBvh(b, ...ray);
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "bvh-"));
  const html = join(dir, "i.html");
  writeFileSync(html, `<script>${output[0].code.replace(/<\/script/g, "<\\/script")}</script>`);
  const { chromium } = createRequire(import.meta.url)(PW);
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await browser.newPage();
    await page.goto("file://" + html);
    const r = await page.evaluate((ray: readonly number[]) => {
      const M = (globalThis as unknown as { M: { terrainTriangles: typeof terrainTriangles; buildBvh: typeof buildBvh; bvhFingerprint: typeof bvhFingerprint; rayBvh: typeof rayBvh } }).M;
      const b = M.buildBvh(M.terrainTriangles(158, 200));
      const t0 = performance.now(); M.buildBvh(M.terrainTriangles(158, 200)); const ms = performance.now() - t0;
      const fp = (M.bvhFingerprint(b) >>> 0).toString(16).padStart(8, "0");
      return { fp, ms, hit: M.rayBvh(b, ray[0], ray[1], ray[2], ray[3], ray[4], ray[5], ray[6]) };
    }, ray);
    assert.equal(r.fp, nodeFp);
    assert.deepEqual(r.hit, hit);
    assert.ok(r.ms < 400, `browser build ${r.ms.toFixed(1)} ms`);
  } finally { await browser.close(); rmSync(dir, { recursive: true, force: true }); }
});
