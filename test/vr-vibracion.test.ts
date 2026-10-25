// MIS-200 card t_4038a8cd: the wrist menu buzzes once when the row under the ray changes and once on a press, and a
// tracked hand never buzzes (it has no motor). A fake session drives createManos: no browser, no headset.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { createManos } from "../packages/render/src/manos.ts";

type Pulso = { v: number; ms: number };

function montar() {
  const scene = new THREE.Scene();
  const pulsos: Record<string, Pulso[]> = { izq: [], der: [] };
  const grupos = [0, 1].map(() => new THREE.Group());
  const manos = [0, 1].map(() => new THREE.Group());
  const renderer = {
    xr: {
      getController: (i: number) => grupos[i],
      getControllerGrip: () => new THREE.Group(),
      getHand: (i: number) => manos[i],
    },
  };
  // a flat panel 1 m ahead; its rows split at the middle: upper half = row 1, lower half = row 2
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  malla.position.set(0, 0, -1);
  scene.add(malla);
  const pulsadas: number[] = [];
  const panel = {
    malla,
    fila: (uv: THREE.Vector2) => (uv.y > 1 ? 0 : uv.y > 0.5 ? 1 : 2),
    encima() {},
    pulsar(fila: number) { pulsadas.push(fila); },
  };
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [panel] } as never);
  m.montar(scene);
  const conectar = (i: number, handedness: "left" | "right", conMano: boolean) => {
    const pulse = (v: number, ms: number) => { pulsos[handedness === "left" ? "izq" : "der"].push({ v, ms }); };
    const gamepad = { buttons: [], axes: [], hapticActuators: [{ pulse }] };
    grupos[i].dispatchEvent({ type: "connected", data: { handedness, gamepad, hand: conMano ? {} : undefined, targetRayMode: "tracked-pointer" } } as never);
  };
  return { m, grupos, pulsos, pulsadas, conectar, scene };
}

test("cambiar de fila del menú vibra una vez (controlador), y mantenerse en la fila no vibra", () => {
  const { m, grupos, pulsos, conectar } = montar();
  conectar(0, "right", false);
  grupos[0].position.set(0, 0.2, 0); m.update(null); // uv.y 0.7 → fila 1
  assert.equal(pulsos.der.length, 1, "entrar en la fila 1 vibra una vez");
  m.update(null); m.update(null);
  assert.equal(pulsos.der.length, 1, "quedarse en la fila 1 no vibra");
  grupos[0].position.set(0, -0.2, 0); m.update(null); // uv.y 0.3 → fila 2
  assert.equal(pulsos.der.length, 2, "pasar a la fila 2 vibra");
  grupos[0].position.set(0, 0.9, 0); m.update(null); // fuera del panel: fila 0, sin vibrar
  assert.equal(pulsos.der.length, 2, "salir del panel no vibra");
});

test("pulsar sobre el menú vibra al pulsar (controlador)", () => {
  const { m, grupos, pulsos, pulsadas, conectar } = montar();
  conectar(0, "right", false);
  grupos[0].position.set(0, -0.2, 0); m.update(null);
  const antes = pulsos.der.length;
  grupos[0].dispatchEvent({ type: "selectstart" } as never);
  assert.deepEqual(pulsadas, [2], "la pulsación llega a la fila 2");
  assert.equal(pulsos.der.length, antes + 1, "y vibra una vez al pulsar");
});

test("con las manos (seguimiento) no hay vibración, ni al cambiar de fila ni al pulsar", () => {
  const { m, grupos, pulsos, pulsadas, conectar } = montar();
  conectar(1, "left", true);
  grupos[1].position.set(0, 0.2, 0); m.update(null);
  grupos[1].position.set(0, -0.2, 0); m.update(null);
  grupos[1].dispatchEvent({ type: "selectstart" } as never);
  assert.deepEqual(pulsadas, [2], "la pulsación sí llega al panel");
  assert.equal(pulsos.izq.length, 0, "la mano no vibra");
});
