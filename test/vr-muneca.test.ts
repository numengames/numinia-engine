// v1 «la muñeca se ve»: (1) the watch gesture with real geometry — back of the hand towards the eyes opens it, the palm
// towards the eyes (Meta's system gesture) never does, a hanging hand never does, a hand at the chest never does — and
// (2) the first-time notice «Gira la muñeca y mírate el reloj» as pure logic (once per device, ~6 s or until the menu
// opens, waits for the entry bubble), its texts in es/en with the same keys, and its letters' size.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { ABRIR, CERRAR, inicio, paso, cumpleAbrir, normalDorsoLocal, type EstadoGesto } from "../packages/render/src/muneca-gesto.ts";
import { medirReloj, type ManoMenu } from "../packages/render/src/muneca.ts";
import {
  AVISO, avisoInicio, avisoPaso, gradosDePx, marcarVisto, textoAviso, yaVisto, type EntradaAviso, type EstadoAviso,
} from "../packages/render/src/muneca-aviso.ts";
import { TEXTOS_VR, idiomaVR, textoVR } from "../packages/render/src/textos-vr/index.ts";
import { es } from "../packages/render/src/textos-vr/es.ts";
import { en } from "../packages/render/src/textos-vr/en.ts";

// a canvas the panels can draw on without a browser (the texture is never uploaded here)
const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined), set: () => true }) });
(globalThis as { document?: unknown }).document ??= { createElement: lienzoFalso };

// ── the gesture, from real positions ────────────────────────────────────────────────────────────────────────────
const OJO = new THREE.Vector3(0, 1.6, 0);
const MIRA_RECTO = new THREE.Vector3(0, 0, -1);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The menu hand with its wrist at `p`, its BACK facing `haciaDonde` (a vector). controller = grip (back −X on the left), hand = wrist joint (back +Y). */
function manoCon(p: THREE.Vector3, haciaDonde: THREE.Vector3, esMano: boolean): ManoMenu {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...normalDorsoLocal("izq", esMano)), haciaDonde.clone().normalize());
  return { posicion: p, rotacion: q, esMano, lado: "izq" };
}
/** Hold the pose for `ms` (frames every 50 ms) and say whether the watch ended up open. */
function sostener(m: ManoMenu, mira: THREE.Vector3, ms: number, desde: EstadoGesto = inicio()): boolean {
  let e = desde;
  for (let t = 0; t <= ms; t += 50) e = paso(e, medirReloj(OJO, mira, m), 1000 + t);
  return e.abierto;
}
const haciaOjos = (p: THREE.Vector3) => OJO.clone().sub(p);

for (const esMano of [false, true]) {
  const que = esMano ? "tracked hand" : "controller";
  test(`gesture (${que}): the BACK of the hand towards the eyes, like a watch, opens it within ABRIR.ms + a frame`, () => {
    const p = V(-0.12, 1.35, -0.4); // ~34° below the line of sight, in front of the left shoulder, ~0.5 m away
    const m = manoCon(p, haciaOjos(p), esMano);
    assert.equal(cumpleAbrir(medirReloj(OJO, MIRA_RECTO, m)), true);
    assert.equal(sostener(m, MIRA_RECTO, ABRIR.ms + 50), true);
    assert.equal(sostener(m, MIRA_RECTO, ABRIR.ms - 60), false, "a shorter glance does not");
  });
  test(`gesture (${que}): the PALM towards the eyes (Meta's system gesture) never opens it`, () => {
    const p = V(-0.12, 1.35, -0.4);
    const m = manoCon(p, haciaOjos(p).negate(), esMano); // the back faces away: the palm faces the eyes
    const med = medirReloj(OJO, MIRA_RECTO, m);
    assert.ok(med.dorso < -0.95, `dorso ${med.dorso}`);
    assert.equal(sostener(m, MIRA_RECTO, 5000), false);
    // also with the palm only a little turned: still the palm side
    const casi = manoCon(p, haciaOjos(p).applyAxisAngle(V(0, 1, 0), (150 * Math.PI) / 180), esMano);
    assert.equal(sostener(casi, MIRA_RECTO, 5000), false, "150° off the eyes is not a watch");
  });
  test(`gesture (${que}): a hand hanging at your side never opens it, whichever way its back faces`, () => {
    const p = V(-0.25, 0.85, -0.05); // 0.75 m below the eyes, beside the hip
    for (const hacia of [haciaOjos(p), V(-1, 0, 0), V(0, 0, -1), V(1, 0, 0)]) {
      const m = manoCon(p, hacia, esMano);
      assert.equal(sostener(m, MIRA_RECTO, 5000), false);
    }
  });
  test(`gesture (${que}): a hand held low at the chest, back up, is outside the cone and stays closed`, () => {
    const p = V(-0.2, 1.1, -0.35); // 0.5 below the eyes, 0.35 ahead: ~55° under the line of sight
    const m = manoCon(p, V(0, 1, 0), esMano);
    const med = medirReloj(OJO, MIRA_RECTO, m);
    assert.ok(med.anguloGrados > ABRIR.conoGrados, `ángulo ${med.anguloGrados}`);
    assert.equal(sostener(m, MIRA_RECTO, 5000), false);
  });
  test(`gesture (${que}): the glance down that v1 makes easier — the wrist 40° under the head's direction — now opens`, () => {
    const d = V(-0.05, -Math.sin((40 * Math.PI) / 180), -Math.cos((40 * Math.PI) / 180)); // 40° below the gaze
    const p = OJO.clone().addScaledVector(d.normalize(), 0.4);
    const m = manoCon(p, haciaOjos(p), esMano);
    assert.ok(medirReloj(OJO, MIRA_RECTO, m).anguloGrados > 35, "the old 35° cone would have missed it");
    assert.equal(sostener(m, MIRA_RECTO, ABRIR.ms + 50), true);
  });
}

test("gesture: it closes by itself when the hand drops, with the hysteresis wider than the opening", () => {
  assert.ok(ABRIR.ms <= 200 && ABRIR.conoGrados >= 45, "v1 numbers: 200 ms, 45°");
  assert.ok(CERRAR.conoGrados >= ABRIR.conoGrados + 10 && CERRAR.dorso < ABRIR.dorso);
  const p = V(-0.12, 1.35, -0.4);
  const abierto = paso(paso(inicio(), medirReloj(OJO, MIRA_RECTO, manoCon(p, haciaOjos(p), false)), 0), medirReloj(OJO, MIRA_RECTO, manoCon(p, haciaOjos(p), false)), ABRIR.ms);
  assert.equal(abierto.abierto, true);
  assert.equal(sostener(manoCon(V(-0.25, 0.85, -0.05), V(0, 1, 0), false), MIRA_RECTO, 1500, abierto), false);
});

// ── the first-time notice, as logic ─────────────────────────────────────────────────────────────────────────────
const calma: EntradaAviso = { bloqueado: false, menuAbierto: false };
/** Run the state machine over `[desde, hasta]` every 100 ms; returns the final state and the frames on which it showed / began. */
function correr(e: EstadoAviso, en: EntradaAviso | ((t: number) => EntradaAviso), desde: number, hasta: number) {
  let mostrado = 0, empieza = 0, mostrandoAlFinal = false;
  for (let t = desde; t <= hasta; t += 100) {
    const r = avisoPaso(e, typeof en === "function" ? en(t) : en, t);
    e = r.estado; if (r.mostrar) mostrado++; if (r.empieza) empieza++; mostrandoAlFinal = r.mostrar;
  }
  return { e, mostrado, empieza, mostrandoAlFinal };
}

test("notice: the first entry shows it after the calm wait, for about AVISO.ms, once", () => {
  const r = correr(avisoInicio(false), calma, 0, AVISO.esperaMs + AVISO.ms + 2000);
  assert.equal(r.empieza, 1);
  assert.equal(r.e.fase, "hecho");
  assert.ok(Math.abs(r.mostrado * 100 - AVISO.ms) <= 200, `shown ${r.mostrado * 100} ms`);
  assert.equal(r.mostrandoAlFinal, false);
  const antes = correr(avisoInicio(false), calma, 0, AVISO.esperaMs - 100);
  assert.equal(antes.mostrado, 0, "not before the wait");
  assert.ok(AVISO.ms >= 5000 && AVISO.ms <= 7000, "about 6 s");
});
test("notice: it ends the moment the menu opens, and a notice already done never comes back", () => {
  const r = correr(avisoInicio(false), (t) => ({ bloqueado: false, menuAbierto: t >= AVISO.esperaMs + 2000 }), 0, AVISO.esperaMs + 5000);
  assert.equal(r.e.fase, "hecho");
  assert.ok(r.mostrado * 100 <= 2100, `shown ${r.mostrado * 100} ms`);
  assert.equal(r.empieza, 1);
  const ya = correr(r.e, calma, 0, 20000);
  assert.equal(ya.mostrado, 0);
  assert.equal(avisoPaso(avisoInicio(false), { bloqueado: false, menuAbierto: true }, 0).mostrar, false, "menu already open: nothing to tell");
});
test("notice: while the entry bubble is up it waits (and its calm timer restarts), and it steps aside if the bubble comes up while shown", () => {
  const r = correr(avisoInicio(false), { bloqueado: true, menuAbierto: false }, 0, 60000);
  assert.equal(r.mostrado, 0);
  assert.equal(r.e.fase, "espera");
  // the bubble closes at t = 10 s: the notice comes AVISO.esperaMs later, not at once
  const s = correr(avisoInicio(false), (t) => ({ bloqueado: t < 10000, menuAbierto: false }), 0, 10000 + AVISO.esperaMs - 200);
  assert.equal(s.mostrado, 0);
  assert.equal(correr(s.e, calma, 10000 + AVISO.esperaMs - 100, 10000 + AVISO.esperaMs + 200).empieza, 1);
  const visible = correr(avisoInicio(false), calma, 0, AVISO.esperaMs + 500);
  assert.equal(visible.mostrandoAlFinal, true);
  assert.equal(avisoPaso(visible.e, { bloqueado: true, menuAbierto: false }, 5000).mostrar, false);
});
test("notice: «seen» is per device (storage) — written when it first shows, so the second entry has none; an unreadable storage counts as seen", () => {
  const datos = new Map<string, string>();
  const almacen = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) };
  assert.equal(yaVisto(almacen), false);
  assert.equal(avisoInicio(yaVisto(almacen)).fase, "espera");
  marcarVisto(almacen);
  assert.equal(datos.get(AVISO.clave), "1");
  assert.equal(yaVisto(almacen), true);
  assert.equal(avisoInicio(yaVisto(almacen)).fase, "hecho");
  const roto = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(yaVisto(roto), true);
  assert.doesNotThrow(() => marcarVisto(roto));
  assert.equal(yaVisto(null), true);
});

// ── texts and letter size ───────────────────────────────────────────────────────────────────────────────────────
test("notice texts: es and en have the same keys, the sentence is the brief's, unknown languages fall back to Spanish", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  assert.deepEqual(Object.keys(TEXTOS_VR).sort(), ["en", "es"]);
  for (const k of Object.keys(es) as (keyof typeof es)[]) assert.ok(es[k].length > 0 && en[k].length > 0 && en[k] !== es[k], k);
  assert.equal(textoAviso("es"), "Gira la muñeca y mírate el reloj: ahí está el menú");
  assert.match(textoAviso("en-GB"), /wrist/i);
  for (const raro of ["", "ja", "pt-BR", "ko", null, undefined, "xx-YY"]) assert.equal(textoAviso(raro), es.avisoMuneca, String(raro));
  assert.equal(idiomaVR("EN_us"), "en");
  assert.equal(textoVR("noExiste" as never, "en"), "", "an unknown key never throws");
});
test("notice: letters are at least 1.2° (Meta) — they are about 2.4°", () => {
  assert.ok(gradosDePx(AVISO.letraPx) >= 1.2, `${gradosDePx(AVISO.letraPx)}°`);
  assert.ok(gradosDePx(AVISO.letraPx) >= 2);
  assert.ok(gradosDePx(52) > gradosDePx(26));
});

// ── the picture: enters twice, sees it once ─────────────────────────────────────────────────────────────────────
test("notice (createAviso): first entry shows it on the camera and writes «seen»; the second entry has none", async () => {
  const { createAviso } = await import("../packages/render/src/muneca-aviso-vr.ts");
  const datos = new Map<string, string>();
  const almacen = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v) };
  const camara = new THREE.Object3D();
  let reloj = 0;
  const a = createAviso({ camera: camara, almacen: () => almacen, idioma: () => "es", ahora: () => reloj });
  const frame = (en: EntradaAviso, ms: number) => { reloj += ms; a.update(en, reloj); };
  a.nueva();
  assert.equal(camara.children.length, 1, "armed: the panel rides on the camera");
  for (let i = 0; i < 20; i++) frame(calma, 100); // 2 s > the calm wait
  assert.equal(a.visible, true);
  assert.equal(datos.get(AVISO.clave), "1");
  assert.equal(a.diagnostico().texto, es.avisoMuneca);
  for (let i = 0; i < 80; i++) frame(calma, 100); // 8 s more: over AVISO.ms
  assert.equal(a.visible, false);
  assert.equal(camara.children.length, 0, "taken off the camera when done");
  a.cerrar();
  a.nueva(); // second entry, same device
  assert.equal(camara.children.length, 0, "not even armed");
  for (let i = 0; i < 200; i++) frame(calma, 100);
  assert.equal(a.visible, false);
  assert.equal(a.diagnostico().vistas, 1);
  // a third device-less case: the menu opening ends it early
  datos.clear();
  a.nueva();
  for (let i = 0; i < 25; i++) frame(calma, 100);
  assert.equal(a.visible, true);
  for (let i = 0; i < 6; i++) frame({ bloqueado: false, menuAbierto: true }, 100);
  assert.equal(a.visible, false, "faded out once the menu opened");
});
