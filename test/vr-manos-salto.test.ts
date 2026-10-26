// MIS-200 card t_8d0bc2dd (lote vr-2, «manos»): jump with the hands = both wrists flicked up at once. salto-manos.ts is
// pure: recorded wrist samples in, a boolean out; the same gesture is then driven through createManos with fake joints
// (takeSalto). The wiring in vr.ts is read from source; the behaviour in the IWER leg tools/e2e-piernas/manos-salto.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";
import { createManos } from "../packages/render/src/manos.ts";
import { crearSaltoManos, SALTO_SUBE_MS, SALTO_RECARGA_MS, SALTO_ESPERA_MS, SALTO_MAX_MS, SALTO_HUECO_MS } from "../packages/render/src/salto-manos.ts";
import { LINEAS_MANDOS } from "../apps/plaza/xr-mandos.ts";

const VR = readFileSync(new URL("../packages/render/src/vr.ts", import.meta.url), "utf8");

// a fake session: two hands, no browser
function montar() {
  const scene = new THREE.Scene();
  const grupos = [0, 1].map(() => new THREE.Group());
  const manos = [0, 1].map(() => new THREE.Group());
  const renderer = { xr: { getController: (i: number) => grupos[i], getControllerGrip: () => new THREE.Group(), getHand: (i: number) => manos[i] } };
  const m = createManos({ renderer: renderer as never, objetos: () => [], paneles: () => [] } as never);
  m.montar(scene);
  const conectar = (i: number, handedness: "left" | "right") =>
    grupos[i].dispatchEvent({ type: "connected", data: { handedness, gamepad: { buttons: [], axes: [] }, hand: {}, targetRayMode: "tracked-pointer" } } as never);
  return { m, grupos, manos, conectar };
}

// ── card 2: the gesture, as a pure function over recorded wrist samples ─────────────────────────────────────────
const HZ = 72, DT = 1000 / HZ;
/** Minimum-jerk rise of `alto` m over `dur` ms starting at `t0`: the shape of a real flick (peak speed 1.875·alto/dur). */
const sube = (t: number, t0: number, dur: number, alto: number) => { const u = Math.min(1, Math.max(0, (t - t0) / dur)); return alto * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5); };
/** Feed `y(t)` of each hand at 72 Hz for `ms`; returns the instants (ms) at which a jump fired. */
function grabar(ms: number, yi: (t: number) => number | null, yd: (t: number) => number | null, det = crearSaltoManos(), desde = 0): number[] {
  const out: number[] = [];
  for (let t = desde; t <= desde + ms; t += DT) if (det.muestra(t, yi(t), yd(t))) out.push(Math.round(t));
  return out;
}
const reposo = (y: number) => () => y + 0.0015 * Math.sin(Date.now()); // sub-centimetre tracker jitter

test("salto: las dos manos suben rápido a la vez → 1 salto", () => {
  const f = (t: number) => 1.0 + sube(t, 500, 200, 0.4);
  const saltos = grabar(2000, f, f);
  assert.equal(saltos.length, 1);
  assert.ok(saltos[0] >= 500 && saltos[0] <= 720, `salta durante el golpe (${saltos[0]} ms)`);
});

test("salto: las dos manos con 60 ms de diferencia siguen contando como a la vez", () => {
  const saltos = grabar(2000, (t) => 1.0 + sube(t, 500, 200, 0.4), (t) => 1.1 + sube(t, 560, 200, 0.4));
  assert.equal(saltos.length, 1);
});

test("salto: una sola mano sacudida → 0 (la otra quieta, o la otra ausente)", () => {
  assert.equal(grabar(2000, (t) => 1.0 + sube(t, 500, 200, 0.5), reposo(1.0)).length, 0, "la otra quieta");
  assert.equal(grabar(2000, (t) => 1.0 + sube(t, 500, 200, 0.5), () => null).length, 0, "la otra no se ve");
  assert.equal(grabar(2000, (t) => 1.0 + sube(t, 500, 200, 0.5), (t) => 1.0 - sube(t, 500, 200, 0.2)).length, 0, "la otra baja");
});

test("salto: subir despacio las dos manos → 0", () => {
  const lenta = (t: number) => 0.9 + sube(t, 300, 1100, 0.5); // 0.5 m in 1.1 s: ~0.85 m/s peak
  assert.equal(grabar(2500, lenta, lenta).length, 0);
  const media = (t: number) => 0.9 + sube(t, 300, 600, 0.45); // 0.45 m in 0.6 s: 1.4 m/s peak, still under the threshold
  assert.equal(grabar(2500, media, media).length, 0);
});

test("salto: bajar los brazos rápido → 0 (y tampoco salta al subirlos despacio antes)", () => {
  const baja = (t: number) => 1.5 - sube(t, 500, 200, 0.5);
  assert.equal(grabar(2000, () => 1.5, () => 1.5).length, 0);
  assert.equal(grabar(2000, baja, baja).length, 0);
});

test("salto: mantener las manos arriba no repite, y bajar y volver a sacudir sí salta otra vez (histéresis)", () => {
  // up at 0.5 s, held for 3 s with jitter (no repeat), down slowly, flick again at 6 s
  const f = (t: number) => 1.0 + sube(t, 500, 200, 0.4) - sube(t, 3800, 1200, 0.4) + sube(t, 6000, 200, 0.4);
  const jit = (t: number) => f(t) + 0.002 * Math.sin(t / 7);
  const saltos = grabar(8000, jit, jit);
  assert.equal(saltos.length, 2, `dos sacudidas separadas = dos saltos (${saltos})`);
  assert.ok(saltos[0] < 800 && saltos[1] >= 6000 && saltos[1] < 6300);
});

test("salto: dos sacudidas pegadas (rebote de los brazos) → 1 salto por la espera mínima", () => {
  const f = (t: number) => 1.0 + sube(t, 500, 150, 0.3) - sube(t, 640, 70, 0.3) + sube(t, 720, 110, 0.3);
  const saltos = grabar(2000, f, f);
  assert.equal(saltos.length, 1, `rebote = ${saltos}`);
  assert.ok(SALTO_ESPERA_MS >= 300);
});

test("salto: un hueso que se teletransporta (más de SALTO_MAX_MS entre dos muestras) reinicia la lectura y no es un salto", () => {
  const det = crearSaltoManos();
  grabar(300, () => 1.0, () => 1.0, det);
  // both wrists jump 0.5 m in one frame and then stay: no flick, however large the window average looks
  let n = 0;
  for (let t = 300; t <= 1500; t += DT) if (det.muestra(t, 1.5, 1.5)) n++;
  assert.equal(n, 0);
  assert.ok(SALTO_MAX_MS > SALTO_SUBE_MS);
  // and a real flick afterwards still works
  const f = (t: number) => 1.5 + sube(t, 2000, 200, 0.4);
  assert.equal(grabar(1000, f, f, det, 1500).length, 1);
});

test("salto: con fotogramas muy espaciados (atasco) no se lee un gesto, y al volver la cadencia normal sí", () => {
  const det = crearSaltoManos();
  const f = (t: number) => 1.0 + sube(t, 500, 200, 0.4);
  let n = 0;
  for (let t = 0; t <= 1500; t += 4 * SALTO_HUECO_MS) if (det.muestra(t, f(t), f(t))) n++; // one frame every 600 ms across the whole flick
  assert.equal(n, 0, "a flick seen at 1.6 fps is not read");
  const g = (t: number) => 1.4 + sube(t, 3000, 200, 0.4);
  assert.equal(grabar(1500, g, g, det, 2200).length, 1, "back to 72 Hz, the next flick jumps");
});

test("salto: una mano que desaparece reinicia la lectura y no deja el gesto a medias", () => {
  const det = crearSaltoManos();
  const f = (t: number) => 1.0 + sube(t, 500, 200, 0.4);
  // right hand untracked until the flick is over, then back, high and still: nothing fires
  const saltos = grabar(2000, f, (t) => (t < 900 ? null : f(t)), det);
  assert.equal(saltos.length, 0);
});

test("salto: las constantes tienen el orden que pide la histéresis", () => {
  assert.ok(SALTO_RECARGA_MS < SALTO_SUBE_MS, "recargar con menos velocidad que la que dispara");
});

// ── card 2 through the hands module: fake tracked hands with a wrist joint each ─────────────────────────────────
function montarConMunecas() {
  const f = montar();
  const munecas = f.manos.map(() => { const w = new THREE.Object3D(); return w; });
  f.manos.forEach((h, i) => { (h as unknown as { joints: Record<string, THREE.Object3D> }).joints = { wrist: munecas[i] }; h.add(munecas[i]); });
  f.conectar(0, "left"); f.conectar(1, "right");
  return { ...f, munecas };
}
function sacudir(f: ReturnType<typeof montarConMunecas>, yi: (t: number) => number, yd: (t: number) => number, ms = 1800): number {
  let n = 0;
  for (let t = 0; t <= ms; t += DT) { f.munecas[0].position.y = yi(t); f.munecas[1].position.y = yd(t); f.m.update(null, t); if (f.m.takeSalto()) n++; }
  return n;
}

test("manos: dos manos con seguimiento sacudidas arriba piden 1 salto; takeSalto lo entrega una sola vez", () => {
  const f = montarConMunecas();
  const g = (t: number) => 1.0 + sube(t, 400, 200, 0.4);
  const eventos: string[] = []; f.m.on((e) => { eventos.push(e.tipo); });
  assert.equal(sacudir(f, g, g), 1);
  assert.equal(f.m.takeSalto(), false);
  assert.deepEqual(eventos, ["salto"], "the page hears the gesture once (session log)");
});

test("manos: una mano sola, o una mano ocupada (reloj, caña, dardo) → 0", () => {
  const g = (t: number) => 1.0 + sube(t, 400, 200, 0.4);
  const una = montarConMunecas();
  assert.equal(sacudir(una, g, () => 1.0), 0, "una sola mano");
  const ocupada = montarConMunecas();
  ocupada.m.ocupar("reloj", (l) => l === "izq");
  assert.equal(sacudir(ocupada, g, g), 0, "la mano del reloj está ocupada: ni el reloj ni la caña saltan");
});

test("manos: dos mandos sacudidos no saltan (tienen A/X; solo las manos con seguimiento)", () => {
  const f = montar();
  f.grupos.forEach((g, i) => { g.dispatchEvent({ type: "connected", data: { handedness: i ? "right" : "left", gamepad: { buttons: [], axes: [] }, targetRayMode: "tracked-pointer" } } as never); });
  const grips = [0, 1].map(() => new THREE.Group());
  let n = 0;
  for (let t = 0; t <= 1800; t += DT) { grips.forEach((gr) => { gr.position.y = 1.0 + sube(t, 400, 200, 0.4); }); f.m.update(null, t); if (f.m.takeSalto()) n++; }
  assert.equal(n, 0);
});

test("manos: la altura se lee en el marco de la plataforma — subir toda la plataforma (un salto del avatar) no es un gesto", () => {
  const f = montarConMunecas();
  const padre = new THREE.Group(); const hijo = f.m.raiz.parent!; padre.add(hijo.parent === padre ? new THREE.Group() : new THREE.Group()); void hijo;
  // the rig carrying the hands rises 1 m in 150 ms (the avatar jumped): the wrists stay put in the rig's frame
  const rig = new THREE.Group(); f.m.raiz.parent!.remove(f.m.raiz); rig.add(f.m.raiz); f.m.montar(rig);
  let n = 0;
  for (let t = 0; t <= 1800; t += DT) { rig.position.y = sube(t, 400, 150, 1.0); rig.updateMatrixWorld(true); f.munecas.forEach((w) => { w.position.y = 1.0; }); f.m.update(null, t); if (f.m.takeSalto()) n++; }
  assert.equal(n, 0);
});

test("la hoja de mandos de VR dice cómo saltar sin mandos", () => {
  const l = LINEAS_MANDOS.find((x) => /^Manos:/.test(x));
  assert.ok(l && /salt/i.test(l), l);
});

test("vr.ts: el gesto de salto pide el salto de A/X, y no con menú, burbuja o diálogo delante", () => {
  assert.match(VR, /h\.manos\?\.takeSalto\?\.\(\)\) \{ if \(visible && !enPanel && !menu\.abierto && !\(dialogo && dialogoMalla\.visible\)\) jumpWanted = true; \}/);
});
