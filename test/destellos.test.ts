// V7 flash limiter: pure, injected clock; never more than 3 flashes start in any one-second window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearLimitadorDestellos, DESTELLOS_POR_S_MAX, VENTANA_MS } from "../packages/feature/src/destellos.ts";

test("destellos: the rule is WCAG 2.3.1 (3 per second)", () => {
  assert.equal(DESTELLOS_POR_S_MAX, 3);
  assert.equal(VENTANA_MS, 1000);
});

test("destellos: a burst lets 3 through, then waits for the window to slide", () => {
  const t = { now: 0 };
  const l = crearLimitadorDestellos(() => t.now);
  const r: boolean[] = [];
  for (let i = 0; i < 6; i++) { t.now = i * 10; r.push(l.pedir()); }
  assert.deepEqual(r, [true, true, true, false, false, false]);
  assert.equal(l.enVentana(), 3);
  t.now = 999; assert.equal(l.pedir(), false, "the first flash is still inside the window");
  t.now = 1000; assert.equal(l.pedir(), true, "the first one left the window");
  t.now = 1005; assert.equal(l.pedir(), false, "10 and 20 are still inside, with 1000 that is 3");
  t.now = 1010; assert.equal(l.pedir(), true);
  t.now = 1011; assert.equal(l.pedir(), false);
});

test("destellos: in ANY 1 s window of a long steady ask there are at most 3 flashes", () => {
  const t = { now: 0 };
  const l = crearLimitadorDestellos(() => t.now);
  const ok: number[] = [];
  for (let ms = 0; ms < 20000; ms += 7) { t.now = ms; if (l.pedir()) ok.push(ms); }
  for (let i = 0; i + DESTELLOS_POR_S_MAX < ok.length; i++) assert.ok(ok[i + DESTELLOS_POR_S_MAX]! - ok[i]! >= VENTANA_MS, `window at ${ok[i]}`);
  assert.ok(ok.length >= 50, `${ok.length} flashes in 20 s: it still lets 3 per second through`);
});

test("destellos: puede() does not count; a refused ask is not counted", () => {
  const t = { now: 0 };
  const l = crearLimitadorDestellos(() => t.now);
  for (let i = 0; i < 10; i++) assert.equal(l.puede(), true);
  assert.equal(l.enVentana(), 0);
  l.pedir(); l.pedir(); l.pedir();
  assert.equal(l.puede(), false);
  for (let i = 0; i < 10; i++) l.pedir();
  assert.equal(l.enVentana(), 3);
});

test("destellos: a caller may be stricter, never looser; a clock going back does not block", () => {
  const t = { now: 5000 };
  const estricto = crearLimitadorDestellos(() => t.now, 1);
  assert.deepEqual([estricto.pedir(), estricto.pedir()], [true, false]);
  const flojo = crearLimitadorDestellos(() => t.now, 50);
  assert.equal([1, 2, 3, 4, 5].filter(() => flojo.pedir()).length, 3);
  const nan = crearLimitadorDestellos(() => t.now, NaN);
  assert.equal([1, 2, 3, 4].filter(() => nan.pedir()).length, 3);
  t.now = 100;                                    // the clock went back
  assert.equal(flojo.pedir(), true);
});

test("destellos: two askers sharing one limiter cannot add up past 3 per second", () => {
  const t = { now: 0 };
  const l = crearLimitadorDestellos(() => t.now);
  let n = 0;
  for (let i = 0; i < 20; i++) { t.now = i * 30; if (l.pedir()) n++; if (l.pedir()) n++; }   // two features asking at once
  assert.equal(n, 3);
});
