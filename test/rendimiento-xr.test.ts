// MIS-200 (t_febc1fc2): «Rendimiento en gafas» → what is asked of three's XRManager and of the session. Fake renderer, no GPU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aplicarRendimiento, multiviewDisponible, normalizarRendimiento, pedirFrecuencia, RENDIMIENTO_DEFECTO } from "../packages/render/src/rendimiento-xr.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";

const falso = (gpu = false, flag: boolean | null = false) => {
  const llamadas: [string, unknown][] = [];
  const xr: Record<string, unknown> = { setFoveation: (v: number) => llamadas.push(["fov", v]), setFramebufferScaleFactor: (v: number) => llamadas.push(["escala", v]) };
  if (flag !== null) xr._useMultiviewIfPossible = flag;
  return { r: { xr, backend: { isWebGPUBackend: gpu } } as never, xr, llamadas };
};

test("defaults equal what three does today (foveation 1, scale 1, no multiview) and the settings declare the same", () => {
  assert.deepEqual(RENDIMIENTO_DEFECTO, { foveacion: 1, escala: 1, multiview: false });
  const d = (id: string) => AJUSTES_MOTOR.find((a) => a.grupo === "graficos" && a.id === id)!;
  assert.equal(d("foveacionVR").defecto, "1");
  assert.equal(d("escalaVR").defecto, "1");
  assert.equal(d("multiviewVR").defecto, false);
});

test("aplicarRendimiento: foveation and scale go to the XR manager, multiview to its flag (WebGL)", () => {
  const f = falso();
  const c = aplicarRendimiento(f.r, { foveacion: 0.5, escala: 0.8, multiview: true });
  assert.deepEqual(f.llamadas, [["fov", 0.5], ["escala", 0.8]]);
  assert.equal(f.xr._useMultiviewIfPossible, true);
  assert.deepEqual(c, { foveacion: 0.5, escala: 0.8, multiview: true });
});

test("aplicarRendimiento: untouched settings reproduce today's calls and leave multiview off", () => {
  const f = falso();
  aplicarRendimiento(f.r, {});
  assert.deepEqual(f.llamadas, [["fov", 1], ["escala", 1]]);
  assert.equal(f.xr._useMultiviewIfPossible, false);
});

test("multiview is never forced on a WebGPU backend or when three lost the flag", () => {
  const g = falso(true);
  aplicarRendimiento(g.r, { multiview: true });
  assert.equal(g.xr._useMultiviewIfPossible, false);
  const sinFlag = falso(false, null);
  assert.equal(multiviewDisponible(sinFlag.r), false);
  aplicarRendimiento(sinFlag.r, { multiview: true });
  assert.equal("_useMultiviewIfPossible" in sinFlag.xr, false);
});

test("normalizarRendimiento: stored strings and stray numbers land on an allowed step", () => {
  assert.deepEqual(normalizarRendimiento({ foveacion: "0.5", escala: "0.8", multiview: true }), { foveacion: 0.5, escala: 0.8, multiview: true });
  assert.deepEqual(normalizarRendimiento({ foveacion: 0.4, escala: 0.95, multiview: "yes" }), { foveacion: 0.5, escala: 1, multiview: false });
  assert.deepEqual(normalizarRendimiento({ foveacion: "x", escala: undefined }), RENDIMIENTO_DEFECTO);
});

test("pedirFrecuencia: asks 72 Hz only when the session lists it; Pico (no list, no method) is harmless", async () => {
  const pedidos: number[] = [];
  assert.equal(await pedirFrecuencia({ supportedFrameRates: new Float32Array([72, 90, 120]), updateTargetFrameRate: async (hz) => { pedidos.push(hz); } }), true);
  assert.deepEqual(pedidos, [72]);
  assert.equal(await pedirFrecuencia({ supportedFrameRates: new Float32Array([90, 120]), updateTargetFrameRate: async (hz) => { pedidos.push(hz); } }), false);
  assert.equal(await pedirFrecuencia({ supportedFrameRates: null }), false);
  assert.equal(await pedirFrecuencia({}), false);
  assert.equal(await pedirFrecuencia({ supportedFrameRates: [72], updateTargetFrameRate: async () => { throw new Error("no"); } }), false);
  assert.deepEqual(pedidos, [72]);
});

test("the installed three still has the flag we set and still reads it where the WebGL projection layer is made", () => {
  const src = readFileSync(new URL("../node_modules/three/src/renderers/common/XRManager.js", import.meta.url), "utf8");
  assert.match(src, /this\._useMultiviewIfPossible = multiview/);
  assert.match(src, /this\._useMultiviewIfPossible && renderer\.hasFeature\( 'OVR_multiview2' \)/);
});
