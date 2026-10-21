// dardos v4: the power bar's straight-throw window (ZONA_FUERZA, one number per way of throwing, decided by the server),
// the landing with a dead zone, the PC bar's release word and the hand sway. All pure maths; the last test sends the real verb.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { dardos, FUERZA_IDEAL, VIAS, ZONA_FUERZA, zonaDe, desvioFuerza } from "../features/dardos/feature.ts";
import { crearDardos, aterrizaje, azarDe, TEMBLOR, CAIDA, SUBIDA, ABRE_FUERTE, ABRE_FLOJO } from "../features/dardos/server.ts";
import { etiquetaSuelta, amplitudVaiven, amplitudTrasSoltar, vaivenDe, patronDe, VAIVEN_REPOSO, VAIVEN_FIRME, VAIVEN_MAX, VAIVEN_VEL_MAX, PASO, PASO_FINO, TECLAS_APUNTAR } from "../features/dardos/barra.ts";
import { ZONA_AR, CICLO_S, IDEAL, crearDianaAR } from "../packages/render/src/dardos.ts";
import { RADIO_M, PINTADA } from "../packages/render/src/diana.ts";
import * as THREE from "three/webgpu";

const cerca = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("ZONA_FUERZA: one exported table, narrow for a mouse/keyboard and wider for a flick or a hand; the AR bar draws the same number", () => {
  assert.deepEqual({ ...ZONA_FUERZA }, { raton: 0.04, teclado: 0.04, tactil: 0.07, vr: 0.06, ar: 0.06 });
  assert.deepEqual([...VIAS], Object.keys(ZONA_FUERZA));
  assert.equal(zonaDe(undefined), ZONA_FUERZA.raton, "a client of v3 sends no `via`: it is the mouse's"); assert.equal(zonaDe("hackeado"), ZONA_FUERZA.raton);
  assert.equal(zonaDe("tactil"), 0.07);
  assert.equal(ZONA_AR, ZONA_FUERZA.ar, "packages/render/src/dardos.ts default = the server's number for AR"); assert.equal(IDEAL, FUERZA_IDEAL);
  // ±0.04 of a 1.1 s ramp = ±44 ms: wide enough to be skill, narrow enough not to be rhythm
  cerca(ZONA_FUERZA.raton * CICLO_S * 1000, 44);
  const v = dardos.intents.lanzar.fields.via as { kind: string; values: readonly string[]; default: string };
  assert.deepEqual([v.kind, [...v.values], v.default], ["enum", [...VIAS], "raton"]);
  assert.equal(dardos.version, 6); assert.deepEqual(dardos.issues, []);
});

test("desvioFuerza: 0.69 is exactly 0.04 away (no float dust), and strength is clamped to 0-1", () => {
  assert.equal(desvioFuerza(0.69), 0.04); assert.equal(desvioFuerza(0.61), -0.04); assert.equal(desvioFuerza(2), 0.35); assert.equal(desvioFuerza(-1), -0.65);
});

test("aterrizaje: inside the window nothing drops and nothing scatters beyond the tremor; outside, only the part beyond the window pays", () => {
  for (const via of VIAS) {
    const z = ZONA_FUERZA[via];
    // dead zone: the whole window (edges included) lands where you aimed when the tremor is 0 …
    for (const f of [FUERZA_IDEAL - z, FUERZA_IDEAL - z / 2, FUERZA_IDEAL, FUERZA_IDEAL + z / 2, FUERZA_IDEAL + z]) assert.deepEqual(aterrizaje(0.1, 0.5, Math.round(f * 1000) / 1000, [0, 0], z), { x: 0.1, y: 0.5 }, `${via} ${f}`);
    // … and with any tremor it stays within TEMBLOR
    for (let t = 0; t < 200; t++) for (const f of [FUERZA_IDEAL - z, FUERZA_IDEAL + z]) { const p = aterrizaje(0, 0, Math.round(f * 1000) / 1000, azarDe(t, 9, 1), z); assert.ok(Math.hypot(p.x, p.y) <= TEMBLOR + 0.001, `${via} ${f}`); }
  }
  // under: drops CAIDA per unit beyond the window (u = [0, 0] → no scatter), by the mouse's window
  cerca(aterrizaje(0, 0, 0.45, [0, 0], 0.04).y, -(0.2 - 0.04) * CAIDA, 0.0006);
  // over: climbs SUBIDA per unit beyond
  cerca(aterrizaje(0, 0, 0.95, [0, 0], 0.04).y, (0.3 - 0.04) * SUBIDA, 0.0006);
  // scatter beyond the window grows with ABRE_FUERTE / ABRE_FLOJO (u = [0.25, 1]: straight up by the full radius)
  const arriba = (f: number, z: number) => aterrizaje(0, 0, f, [0.25, 1], z).y;
  cerca(arriba(0.95, 0.04), (0.3 - 0.04) * SUBIDA + TEMBLOR + (0.3 - 0.04) * ABRE_FUERTE, 0.0006);
  cerca(arriba(0.45, 0.04), -(0.2 - 0.04) * CAIDA + TEMBLOR + (0.2 - 0.04) * ABRE_FLOJO, 0.0006);
  // harder to be strong than weak: the same distance over scatters more than under
  assert.ok(ABRE_FUERTE > ABRE_FLOJO && CAIDA > SUBIDA);
  // the window is the device's: 0.57 is 0.08 under: the mouse pays 0.04, the phone (±0.07) only 0.01
  const cae = (z: number) => -aterrizaje(0, 0, 0.57, [0, 0], z).y;
  assert.ok(cae(ZONA_FUERZA.raton) > 3 * cae(ZONA_FUERZA.tactil) && cae(ZONA_FUERZA.tactil) > 0);
  // a call without the window argument is the mouse's (old callers)
  assert.deepEqual(aterrizaje(0, 0, 0.57, [0.1, 0.5]), aterrizaje(0, 0, 0.57, [0.1, 0.5], ZONA_FUERZA.raton));
});

test("aterrizaje: a perfect throw is worth it — most land in the double bull aiming at the eye, and a straight T20 aim stays in the treble more often than a bad strength", () => {
  let ojo = 0, buenaT = 0, flojaT = 0; const N = 600;
  for (let t = 0; t < N; t++) {
    const u = azarDe(t, 5, 2, 11);
    const p = aterrizaje(0, 0, FUERZA_IDEAL, u); if (Math.hypot(p.x, p.y) <= 0.0747) ojo++;
    const a = aterrizaje(0, 0.605, FUERZA_IDEAL, u), b = aterrizaje(0, 0.605, 0.45, u);
    if (Math.abs(a.y - 0.605) < 0.0235 && Math.abs(a.x) < 0.05) buenaT++; if (Math.abs(b.y - 0.605) < 0.0235 && Math.abs(b.x) < 0.05) flojaT++;
  }
  assert.ok(ojo / N > 0.8 && ojo / N < 0.93, `diana ${ojo}/${N}`);
  assert.ok(buenaT > 10 * Math.max(1, flojaT), `${buenaT} vs ${flojaT}`);
});

test("etiquetaSuelta: PERFECTO in the window, CASI up to twice its width, then FLOJO ↓ / FUERTE ↑ by the side (words, not only colour)", () => {
  const z = ZONA_FUERZA.raton;
  const ES = (f: number, zona = z) => etiquetaSuelta(f, zona).etiqueta;
  assert.equal(ES(0.65), "PERFECTO"); assert.equal(ES(0.69), "PERFECTO", "the edge is inside"); assert.equal(ES(0.61), "PERFECTO");
  assert.equal(ES(0.691), "CASI"); assert.equal(ES(0.609), "CASI"); assert.equal(ES(0.73), "CASI", "twice the width is still CASI"); assert.equal(ES(0.57), "CASI");
  assert.equal(ES(0.731), "FUERTE ↑"); assert.equal(ES(1), "FUERTE ↑"); assert.equal(ES(0.569), "FLOJO ↓"); assert.equal(ES(0), "FLOJO ↓");
  assert.equal(etiquetaSuelta(0.8, z).clase, "fuerte"); assert.equal(etiquetaSuelta(0.2, z).clase, "flojo"); assert.equal(etiquetaSuelta(0.65, z).clase, "perfecto"); assert.equal(etiquetaSuelta(0.7, z).clase, "casi");
  assert.equal(ES(0.69, ZONA_FUERZA.tactil), "PERFECTO"); assert.equal(ES(0.72, ZONA_FUERZA.tactil), "PERFECTO"); assert.equal(ES(0.73, ZONA_FUERZA.tactil), "CASI");
  // the word is born from the strength as it is SENT (3 decimals): 0.6900001 is the edge, not past it
  assert.equal(ES(0.6900001), "PERFECTO");
});

test("etiquetaSuelta agrees with the server on every strength: PERFECTO ⇔ the landing is exactly where you aimed (no tremor)", () => {
  for (const via of VIAS) {
    const z = ZONA_FUERZA[via];
    for (let i = 0; i <= 1000; i++) {
      const f = i / 1000, perfecto = etiquetaSuelta(f, z).etiqueta === "PERFECTO";
      const p = aterrizaje(0, 0, f, [0, 0], z), centrado = p.x === 0 && p.y === 0;
      assert.equal(perfecto, centrado, `${via} f=${f} ${JSON.stringify(p)}`);
      const e = etiquetaSuelta(f, z); assert.equal(e.etiqueta === "FLOJO ↓", e.delta < -2 * z - 1e-9); assert.equal(e.etiqueta === "FUERTE ↑", e.delta > 2 * z + 1e-9);
    }
  }
});

test("sway: calm on the press, firm for the first second, then it drifts up to the maximum; it eases back after the release", () => {
  cerca(amplitudVaiven(0), VAIVEN_REPOSO); cerca(amplitudVaiven(0.3), VAIVEN_FIRME); cerca(amplitudVaiven(1.0), VAIVEN_FIRME);
  assert.ok(amplitudVaiven(0.1) < VAIVEN_REPOSO && amplitudVaiven(0.1) > VAIVEN_FIRME, "settling");
  cerca(amplitudVaiven(2.2), VAIVEN_MAX); cerca(amplitudVaiven(5), VAIVEN_MAX);
  for (let s = 1; s < 2.2; s += 0.05) assert.ok(amplitudVaiven(s + 0.05) >= amplitudVaiven(s), "drift only grows");
  assert.ok(amplitudVaiven(1.485) < 0.035, "the second pass through the window (1.485 s) is still manageable");
  assert.ok(amplitudVaiven(2.9) === VAIVEN_MAX, "the third (2.9 s) is not");
  cerca(amplitudTrasSoltar(0.05, 0), 0.05); cerca(amplitudTrasSoltar(0.05, 10), VAIVEN_REPOSO); cerca(amplitudTrasSoltar(0.012, 10), VAIVEN_REPOSO);
});

test("sway: a pattern per dart (the same dart number, the same pattern), and the crosshair never moves faster than VAIVEN_VEL_MAX", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(patronDe), [0, 1, 2, 0, 1, 2]); assert.equal(patronDe(0), 0);
  const A = vaivenDe(3.3, 1, 0.03), B = vaivenDe(3.3, 2, 0.03), C = vaivenDe(3.3, 3, 0.03);
  assert.notDeepEqual(A, B); assert.notDeepEqual(B, C); assert.deepEqual(vaivenDe(3.3, 1, 0.03), vaivenDe(3.3, 4, 0.03), "dart 4 repeats dart 1's pattern");
  assert.deepEqual(vaivenDe(3.3, 2, 0.03), vaivenDe(3.3, 2, 0.03));
  { const q = vaivenDe(1, 1, 0); assert.equal(Math.abs(q.x) + Math.abs(q.y), 0, "amplitude 0 = no sway"); }
  let peor = 0;
  for (const n of [1, 2, 3]) for (let t0 = 0; t0 < 12; t0 += 0.43) {
    let ant: { x: number; y: number } | null = null; const dt = 0.002;
    for (let k = 0; k <= 4000; k++) { // press, hold 4 s (calm, drift), release, ease back
      const s = k * dt, mantiene = s <= 4, amp = mantiene ? amplitudVaiven(s) : amplitudTrasSoltar(amplitudVaiven(4), s - 4);
      const p = vaivenDe(t0 + s, n, amp);
      if (ant) peor = Math.max(peor, Math.hypot(p.x - ant.x, p.y - ant.y) / dt);
      ant = p;
    }
  }
  assert.ok(peor <= VAIVEN_VEL_MAX, `${peor.toFixed(3)} radii/s`);
  assert.ok(peor > 0.03, "…but it does move");
});

test("keyboard: arrows and WASD aim, Shift is the fine step", () => {
  assert.deepEqual([TECLAS_APUNTAR.ArrowLeft, TECLAS_APUNTAR.KeyA], [[-1, 0], [-1, 0]]); assert.deepEqual([TECLAS_APUNTAR.ArrowRight, TECLAS_APUNTAR.KeyD], [[1, 0], [1, 0]]);
  assert.deepEqual([TECLAS_APUNTAR.ArrowUp, TECLAS_APUNTAR.KeyW], [[0, 1], [0, 1]]); assert.deepEqual([TECLAS_APUNTAR.ArrowDown, TECLAS_APUNTAR.KeyS], [[0, -1], [0, -1]]);
  assert.equal(Object.keys(TECLAS_APUNTAR).length, 8); assert.ok(PASO_FINO < PASO && PASO_FINO > 0);
});

test("`lanzar` carries `via`: every way is accepted, none is the mouse's, and the same throw lands the same for `raton` and for nothing", () => {
  const sign = signer("una-clave-de-prueba-larga");
  const run = (via?: string, f = 0.5) => {
    const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearDardos({ sitios: [{ id: "diana", nombre: "Diana", x: 10, z: 0, y: 0, radio: 3 }] })], log: () => {}, identitySign: sign });
    const t = inst.join(0), eventos: Record<string, unknown>[] = [];
    const s = new ClientSession(t, { identity: { load: () => null, save: () => {} } });
    s.features.tap((feature, event, msg) => { if (feature === "dardos") eventos.push({ event, ...msg }); });
    const pump = (n = 1) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
    pump(2); inst.sim.tf.cols.x[s.entity] = fx(8); inst.sim.tf.cols.z[s.entity] = fx(0); pump(4);
    const r = s.features.send("dardos", "lanzar", { sitio: "diana", x: 0, y: 0, fuerza: f, ...(via ? { via } : {}) }); pump(3);
    return { r, d: eventos.filter((e) => e.event === "dardo").map((e) => [e.x, e.y]), rechazos: eventos.filter((e) => e.event === "rechazado") };
  };
  for (const via of VIAS) { const o = run(via); assert.equal(o.r.ok, true, via); assert.equal(o.d.length, 1, via); }
  assert.deepEqual(run().d, run("raton").d, "no `via` = raton");
  assert.deepEqual(run().d, run("teclado").d, "teclado has the same window as raton");
  assert.notDeepEqual(run(undefined, 0.55).d, run("tactil", 0.55).d, "a wider window changes what 0.55 does");
  assert.equal(run("nave-espacial").d.length, 0, "an unknown way is refused by the schema, not guessed");
});

test("AR wall bar: the gold window is the server's ZONA_FUERZA.ar tall (centred on FUERZA_IDEAL), with a white border and two notches", () => {
  // the board's texture needs a 2D canvas: a stub whose every call does nothing is enough for the geometry
  const noop: unknown = new Proxy(function () {}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : noop), apply: () => noop, set: () => true });
  (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
  try {
    const j = crearDianaAR({ alLanzar() {}, zona: ZONA_FUERZA.ar });
    assert.equal(j.estado().zona, ZONA_FUERZA.ar); assert.equal(crearDianaAR({ alLanzar() {} }).estado().zona, ZONA_FUERZA.ar, "default = the table's AR window");
    j.root.updateMatrixWorld(true);
    const hex = (o: THREE.Object3D) => ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHexString();
    const planos = j.root.children.flatMap((c) => c.children).flatMap((c) => c.children).filter((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === "PlaneGeometry") as THREE.Mesh[];
    const caja = (o: THREE.Object3D) => { const b = new THREE.Box3().setFromObject(o), s = new THREE.Vector3(); b.getSize(s); return { s, c: b.getCenter(new THREE.Vector3()) }; };
    const banda = planos.find((o) => hex(o) === "ffd27a")!, track = planos.find((o) => hex(o) === "0b0e12")!, borde = planos.filter((o) => hex(o) === "ffffff");
    const alto = RADIO_M * PINTADA * 2;
    cerca(caja(banda).s.y, 2 * ZONA_FUERZA.ar * alto, 1e-6);
    assert.ok(caja(banda).s.y > 0.04, "at least 4 cm tall: you can see it on a wall");
    cerca(caja(banda).c.y - caja(track).c.y, alto * (FUERZA_IDEAL - 0.5) , 1e-6);
    assert.ok(borde.some((o) => caja(o).s.y > caja(banda).s.y && Math.abs(caja(o).c.y - caja(banda).c.y) < 1e-6), "a white border around the window");
    const notas = j.root.children.flatMap((c) => c.children).flatMap((c) => c.children).filter((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === "CircleGeometry" && Math.abs(caja(o).c.y - caja(banda).c.y) < 1e-6);
    assert.equal(notas.length, 2, "two notches, one each side");
  } finally { delete (globalThis as { document?: unknown }).document; }
});
