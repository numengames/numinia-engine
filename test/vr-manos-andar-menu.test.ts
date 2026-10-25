// MIS-200 card t_41d8e44c (lote vr-2, «manos»): `manos.andar(excluida)` never walks with the hand that holds the open wrist
// menu (design §2.3), whichever hand the setting `vrManoMenu` picks; the other hand walks. A fake session drives
// createManos (no browser); the wiring in vr.ts is read from source (the behaviour is the IWER leg menu-vr.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { createManos, ANDAR_MS } from "../packages/render/src/manos.ts";
import { ladosDelMenu } from "../packages/render/src/mano-menu.ts";

const VR = readFileSync(new URL("../packages/render/src/vr.ts", import.meta.url), "utf8");

function montar() {
  const scene = new THREE.Scene();
  const grupos = [0, 1].map(() => new THREE.Group());
  const manos = [0, 1].map(() => new THREE.Group());
  const renderer = { xr: { getController: (i: number) => grupos[i], getControllerGrip: () => new THREE.Group(), getHand: (i: number) => manos[i] } };
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [] } as never);
  m.montar(scene);
  const conectar = (i: number, handedness: "left" | "right") => {
    grupos[i].dispatchEvent({ type: "connected", data: { handedness, gamepad: { buttons: [], axes: [] }, hand: {}, targetRayMode: "tracked-pointer" } } as never);
    grupos[i].rotation.set(0, Math.PI, 0); // pointing +Z: nothing there, so a pinch is «in the air»
  };
  return { m, grupos, manos, conectar };
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pellizcarEnAire(f: ReturnType<typeof montar>, i: number, excluida?: "izq" | "der" | null): Promise<[number, number] | null> {
  f.m.update(null);
  f.grupos[i].dispatchEvent({ type: "selectstart" } as never);
  await esperar(ANDAR_MS + 40);
  f.m.update(null);
  const r = f.m.andar(excluida);
  f.grupos[i].dispatchEvent({ type: "selectend" } as never);
  return r;
}

for (const ajuste of ["izq", "der"] as const) {
  test(`menú abierto, ajuste «${ajuste}»: andar ignora la mano del menú y la otra anda`, async () => {
    const { reloj } = ladosDelMenu(ajuste);
    const f = montar(); f.conectar(0, "left"); f.conectar(1, "right");
    const iMenu = reloj === "izq" ? 0 : 1, iOtra = 1 - iMenu;
    assert.equal(await pellizcarEnAire(f, iMenu, reloj), null, "la mano del menú, con el menú abierto, no mueve");
    const otra = await pellizcarEnAire(f, iOtra, reloj);
    assert.ok(otra && otra[1] > 0.9, "la otra mano anda hacia donde apunta");
  });
  test(`menú cerrado, ajuste «${ajuste}»: sin mano excluida las dos andan`, async () => {
    const { reloj } = ladosDelMenu(ajuste);
    const f = montar(); f.conectar(0, "left"); f.conectar(1, "right");
    assert.ok(await pellizcarEnAire(f, reloj === "izq" ? 0 : 1, null), "la mano del menú anda con el menú cerrado");
  });
}

test("andar(excluida): un pellizco empezado antes de abrir el menú deja de andar en cuanto se abre", async () => {
  const f = montar(); f.conectar(0, "left"); f.conectar(1, "right");
  f.m.update(null); f.grupos[0].dispatchEvent({ type: "selectstart" } as never);
  await esperar(ANDAR_MS + 40); f.m.update(null);
  assert.ok(f.m.andar(null), "andaba");
  assert.equal(f.m.andar("izq"), null, "el menú se abre en esa mano: ya no");
  f.grupos[0].dispatchEvent({ type: "selectend" } as never);
});

test("vr.ts: andar recibe la mano del reloj mientras el menú está abierto, y nada si no", () => {
  assert.match(VR, /h\.manos\?\.andar\?\.\(menu\.abierto \? LADO_RELOJ : null\)/);
});
