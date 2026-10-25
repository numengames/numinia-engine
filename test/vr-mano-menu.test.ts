// MIS-200 card t_d5f5523a: the wrist menu's hand is a setting (vrManoMenu, default left, right on request), and the
// watch's hand is busy while the watch shows (t_41d8e44c's line), so a pinch in the air with it does not walk.
// The setting's shape is checked like the other VR rows; the walking is a fake session driving createManos (no browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { createManos, ANDAR_MS } from "../packages/render/src/manos.ts";
import { ladosDelMenu } from "../packages/render/src/mano-menu.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";
import { AJUSTES_VR } from "../apps/plaza/xr-menu.ts";

test("ladosDelMenu: the watch hand and the pressing hand are opposite, left by default", () => {
  assert.deepEqual(ladosDelMenu("izq"), { reloj: "izq", punta: "der" });
  assert.deepEqual(ladosDelMenu("der"), { reloj: "der", punta: "izq" });
});

test("el ajuste vrManoMenu: en Controles, solo en VR, izquierda por defecto, izquierda o derecha", () => {
  const a = AJUSTES_MOTOR.find((x) => x.id === "vrManoMenu");
  assert.ok(a, "the setting exists");
  assert.equal(a.grupo, "controles");
  assert.equal(a.tipo, "eleccion");
  assert.equal(a.defecto, "izq");
  assert.deepEqual((a.opciones ?? []).map((o) => o.valor), ["izq", "der"]);
  assert.deepEqual(a.requiere, ["xrVr"]);
  assert.equal(AJUSTES_MOTOR.filter((x) => x.id === "vrManoMenu").length, 1, "only one row with this id");
});

test("el ajuste aparece en los ajustes de VR del menú, justo tras la dirección al andar", () => {
  const i = AJUSTES_VR.indexOf("controles.vrManoMenu");
  assert.ok(i >= 0, "listed in the VR settings section");
  assert.equal(AJUSTES_VR[i - 1], "controles.modoMovimientoVR");
});

// ── a fake session: two hands, no browser ─────────────────────────────────────────────────────────────────────
function montar() {
  const scene = new THREE.Scene();
  const grupos = [0, 1].map(() => new THREE.Group());
  const manos = [0, 1].map(() => new THREE.Group());
  const renderer = { xr: { getController: (i: number) => grupos[i], getControllerGrip: () => new THREE.Group(), getHand: (i: number) => manos[i] } };
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [] } as never);
  m.montar(scene);
  // both hands are tracked hands (esMano), pointing +Z: away from anything, so the ray hits nothing and the pinch is «in the air»
  const conectar = (i: number, handedness: "left" | "right") => {
    grupos[i].dispatchEvent({ type: "connected", data: { handedness, gamepad: { buttons: [], axes: [] }, hand: {}, targetRayMode: "tracked-pointer" } } as never);
    grupos[i].rotation.set(0, Math.PI, 0);
  };
  return { m, grupos, conectar };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pinch in the air with hand `i`, hold for ANDAR_MS, and say what the hands module asks: the walk direction or null. */
async function pellizcarEnAire(f: ReturnType<typeof montar>, i: number): Promise<[number, number] | null> {
  f.m.update(null);
  f.grupos[i].dispatchEvent({ type: "selectstart" } as never);
  await esperar(ANDAR_MS + 40);
  f.m.update(null);
  return f.m.andar();
}

test("con el reloj visible, su mano no anda y la otra sí (la mano del reloj es izquierda)", async () => {
  const f = montar();
  f.conectar(0, "left"); f.conectar(1, "right");
  let relojVisible = true, lado = "izq";
  f.m.ocupar("reloj", (l) => relojVisible && l === lado); // what vr.ts registers
  assert.equal(await pellizcarEnAire(f, 0), null, "la mano del reloj no anda");
  f.grupos[0].dispatchEvent({ type: "selectend" } as never);
  const otra = await pellizcarEnAire(f, 1);
  assert.ok(otra && otra[1] > 0.9, "la otra mano anda hacia donde apunta");
});

test("con el ajuste en derecha, la mano derecha es la ocupada y la izquierda anda", async () => {
  const f = montar();
  f.conectar(0, "left"); f.conectar(1, "right");
  let relojVisible = true, lado = "der";
  f.m.ocupar("reloj", (l) => relojVisible && l === lado);
  assert.equal(await pellizcarEnAire(f, 1), null, "la mano derecha, con el reloj, no anda");
  const otra = await pellizcarEnAire(f, 0);
  assert.ok(otra && otra[1] > 0.9, "la izquierda anda");
});

test("sin reloj visible ninguna mano queda ocupada por él: las dos andan", async () => {
  const f = montar();
  f.conectar(0, "left"); f.conectar(1, "right");
  let relojVisible = false;
  f.m.ocupar("reloj", (l) => relojVisible && l === "izq");
  assert.ok(await pellizcarEnAire(f, 0), "la izquierda anda con el reloj escondido");
  f.grupos[0].dispatchEvent({ type: "selectend" } as never);
  assert.ok(await pellizcarEnAire(f, 1), "la derecha anda");
});
