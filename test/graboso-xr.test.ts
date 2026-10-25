// graboso in XR (MIS-200 t_40a65495): inside a headset session the engine's canvas gets no frames, so the recorder must film
// the mirror canvas of one eye; outside XR it films the engine's canvas and never touches the mirror.
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirFuente } from "../apps/plaza/graboso.ts";
import { pasarPixeles, ESPEJO } from "../packages/render/src/espejo-xr.ts";

const canvas = (n: string) => ({ n }) as unknown as HTMLCanvasElement;
function espejoFalso() {
  const lienzo = canvas("espejo"), llamadas: string[] = [];
  return { lienzo, llamadas, espejo: { async encender() { llamadas.push("encender"); return lienzo; }, apagar() { llamadas.push("apagar"); } } };
}

test("flat page: the recorder films the engine's canvas and the mirror is never switched on", async () => {
  const principal = canvas("principal"), { espejo, llamadas } = espejoFalso();
  const f = await elegirFuente(principal, { presentando: () => false, espejo });
  assert.equal(f.fuente, principal);
  assert.equal(f.espejo, false);
  assert.deepEqual(llamadas, []);
});

test("no XR hook at all (an old caller): the engine's canvas", async () => {
  const principal = canvas("principal");
  assert.equal((await elegirFuente(principal)).fuente, principal);
});

test("inside an XR session: the recorder films the mirror canvas", async () => {
  const principal = canvas("principal"), { espejo, lienzo, llamadas } = espejoFalso();
  const f = await elegirFuente(principal, { presentando: () => true, espejo });
  assert.equal(f.fuente, lienzo);
  assert.equal(f.espejo, true);
  assert.deepEqual(llamadas, ["encender"]);
});

test("the mirror's pixels: bottom-up rows are flipped, alpha is opaque, linear → sRGB", () => {
  const ancho = 2, alto = 2, d = new Uint8Array(ancho * alto * 4), o = new Uint8ClampedArray(ancho * alto * 4);
  d.set([255, 0, 0, 0], 0); d.set([0, 255, 0, 0], 4);      // GL row 0 = the BOTTOM of the picture
  d.set([0, 0, 255, 0], 8); d.set([128, 128, 128, 0], 12); // GL row 1 = the top
  pasarPixeles(d, ancho, alto, true, o);
  assert.deepEqual([...o.slice(0, 3)], [0, 0, 255]);        // top-left is the GL top row
  assert.deepEqual([...o.slice(8, 11)], [255, 0, 0]);       // bottom-left
  assert.ok(o[4] > 128 && o[4] < 200, "mid grey brightens in sRGB");
  assert.ok([3, 7, 11, 15].every((i) => o[i] === 255));
  const w = new Uint8ClampedArray(ancho * alto * 4); pasarPixeles(d, ancho, alto, false, w);
  assert.deepEqual([...w.slice(0, 3)], [255, 0, 0]);        // WebGPU: top row first
});

test("the mirror is modest: at most 960×540 and 30 fps", () => {
  assert.ok(ESPEJO.ancho * ESPEJO.alto <= 960 * 540);
  assert.ok(ESPEJO.cuadrosPorS <= 30);
});
