// dardos in VR, v14: how close a hand gesture is to a professional dart throw (features/dardos/gesto.ts), and the help it earns
// (lanzamiento.ts). The board stands at the origin facing +z (normal toward the thrower), as in dardos-vr.test.ts.
// The synthetic gestures follow the shape the papers describe: backswing toward the face, a straight forward swing that is still
// speeding up when the dart is let go, ~5.5 m/s at the release (PMC5414278 §5.1); the bad ones break one thing each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { valorarGesto, ayudaDe, consejo, AYUDA_MAX, PESOS } from "../features/dardos/gesto.ts";
import { lanzamiento, ayudar, velocidadDe } from "../features/dardos/lanzamiento.ts";
import type { Cara, Muestra, V3 } from "../features/dardos/lanzamiento.ts";
import { FUERZA_IDEAL, zonaDe } from "../features/dardos/feature.ts";
import { aterrizaje, azarDe } from "../features/dardos/server.ts";

const CARA: Cara = { c: [0, 2, 0], n: [0, 0, 1], r: [1, 0, 0], m: 0.408 };
const START: V3 = [0, 2, 2.6];
const DT = 11;

type Opc = { atras?: number; atrasMs?: number; vPico?: number; acelMs?: number; lateral?: number; arriba?: number; freno?: number; temblor?: number };
/** A hand gesture sampled every 11 ms ending at the release (`fin`): backswing, then a forward swing speeding up linearly to vPico,
 *  `freno` = fraction of vPico lost in the last 60 ms (a flick that stops before the release), `lateral` = sideways m/s, `temblor` = sideways wobble (m). */
function gesto(o: Opc = {}): { m: Muestra[]; fin: number } {
  const { atras = 0.2, atrasMs = 300, vPico = 5.5, acelMs = 150, lateral = 0, arriba = 0, freno = 0, temblor = 0 } = o;
  const m: Muestra[] = [];
  let z = START[2], x = START[0], y = START[1], t = 0;
  const pasos = (ms: number, f: (u: number, ms: number) => void) => { for (let k = 0; k < Math.round(ms / DT); k++) { t += DT; f((k + 1) / Math.round(ms / DT), DT / 1000); m.push({ t, x, y, z }); } };
  m.push({ t: 0, x, y, z });
  pasos(150, () => {}); // at rest
  if (atras > 0) { let prev = 0; pasos(atrasMs, (u) => { const s = 0.5 - 0.5 * Math.cos(Math.PI * u); z += (s - prev) * atras; prev = s; }); }
  pasos(acelMs, (u, dt) => { const v = vPico * u; z -= v * dt; x += lateral * u * dt; y += arriba * u * dt; x += temblor * Math.sin(t / 9) * 0.1; });
  if (freno > 0) pasos(60, (u, dt) => { const v = vPico * (1 - freno * u); z -= v * dt; });
  return { m, fin: t };
}
const puntos = (o?: Opc) => { const g = gesto(o); return valorarGesto(CARA, g.m, g.fin); };

test("the sample gesture itself moves the way it says (a 5.5 m/s forward swing at the release)", () => {
  const g = gesto(); const v = velocidadDe(g.m, g.fin, 60)!;
  assert.ok(v[2] < -4.5 && v[2] > -5.6, `vz ${v[2]}`);
});

test("a professional-like gesture scores high on all four parts", () => {
  const g = puntos();
  assert.ok(g.puntos >= 0.85, `${JSON.stringify(g)}`);
  assert.ok(g.partes.recta >= 0.95 && g.partes.aceleracion >= 0.95 && g.partes.velocidad === 1 && g.partes.retroceso === 1, JSON.stringify(g.partes));
  assert.equal(consejo(g), null, "nothing to advise on a pro throw");
});

test("each flaw lowers the part it belongs to and the total", () => {
  const pro = puntos().puntos;
  const lado = puntos({ lateral: 2.2 }); // ~22° off the board's axis, sideways
  assert.ok(lado.partes.recta < 0.3 && lado.puntos < pro - 0.2, JSON.stringify(lado));
  const frena = puntos({ freno: 0.7 }); // the hand stopped before the release
  assert.ok(frena.partes.aceleracion < 0.5 && frena.puntos < pro - 0.1, JSON.stringify(frena));
  const lento = puntos({ vPico: 1.8 });
  assert.ok(lento.partes.velocidad < 0.2 && lento.puntos < pro - 0.15, JSON.stringify(lento));
  const bestia = puntos({ vPico: 14 });
  assert.ok(bestia.partes.velocidad < 0.1, JSON.stringify(bestia));
  const sinAtras = puntos({ atras: 0 });
  assert.equal(sinAtras.partes.retroceso, 0); assert.ok(Math.abs(pro - sinAtras.puntos - PESOS.retroceso) < 0.02, `${pro} vs ${sinAtras.puntos}`);
  const tiembla = puntos({ temblor: 0.8 });
  assert.ok(tiembla.partes.recta < 0.5, JSON.stringify(tiembla));
});

test("the advice names the worst part", () => {
  assert.equal(consejo(puntos({ lateral: 3 })), "recta");
  assert.equal(consejo(puntos({ vPico: 1.7, atras: 0.2 })), "velocidad");
  assert.equal(consejo(puntos({ atras: 0, vPico: 5.5, freno: 0.8 })), "aceleracion");
});

test("too few samples, or a still hand: score 0, never NaN", () => {
  assert.equal(valorarGesto(CARA, [], 0).puntos, 0);
  assert.equal(valorarGesto(CARA, [{ t: 0, x: 0, y: 0, z: 0 }, { t: 10, x: 0, y: 0, z: 0 }], 10).puntos, 0);
  const quieta: Muestra[] = []; for (let i = 0; i < 30; i++) quieta.push({ t: i * 11, x: 0, y: 2, z: 2.6 });
  const g = valorarGesto(CARA, quieta, 319); assert.ok(Number.isFinite(g.puntos)); assert.ok(g.puntos < 0.3, `${g.puntos}`);
  assert.equal(valorarGesto(CARA, [{ t: 0, x: NaN, y: 0, z: 0 }, ...quieta], 319).puntos >= 0, true);
});

test("a gesture moving AWAY from the board scores nothing for straightness", () => {
  const g = gesto({ vPico: 5 }); const atras = g.m.map((s, i) => ({ ...s, z: START[2] + (START[2] - s.z) }));
  assert.equal(valorarGesto(CARA, atras, g.fin).partes.recta, 0);
});

test("the board turned: straightness is read against ITS axis, not the world's z", () => {
  const lado: Cara = { c: [10, 2, 0], n: [1, 0, 0], r: [0, 0, -1], m: 0.408 };
  const g = gesto(); const girado = g.m.map((s) => ({ t: s.t, x: 10 + (s.z - 0), y: s.y, z: -s.x })); // the same swing, now along -x toward the board at x = 10
  const a = valorarGesto(lado, girado.map((s) => ({ ...s, x: s.x })), g.fin);
  assert.ok(a.puntos >= 0.85, JSON.stringify(a));
  assert.ok(valorarGesto(CARA, girado, g.fin).partes.recta < 0.2, "the same samples against the wrong board are sideways");
});

test("help grows with the score, linearly, and never reaches 1", () => {
  assert.equal(ayudaDe(0), 0); assert.equal(ayudaDe(1), AYUDA_MAX); assert.ok(AYUDA_MAX < 1);
  assert.ok(ayudaDe(0.3) < ayudaDe(0.6) && ayudaDe(0.6) < ayudaDe(0.9));
  assert.ok(Math.abs(ayudaDe(0.5) - AYUDA_MAX / 2) < 1e-9);
  assert.equal(ayudaDe(5), AYUDA_MAX); assert.equal(ayudaDe(-1), 0);
  // and the gestures order the way the help does: pro > flawed > a flail
  const pro = puntos().puntos, regular = puntos({ lateral: 1.0, atras: 0.05, freno: 0.2 }).puntos, mal = puntos({ lateral: 3.5, atras: 0, freno: 0.8, vPico: 2 }).puntos;
  assert.ok(pro > regular && regular > mal, `${pro} > ${regular} > ${mal}`);
  assert.ok(ayudaDe(pro) > ayudaDe(regular) && ayudaDe(regular) > ayudaDe(mal));
});

test("ayudar: 0 changes nothing; the farther the aim, the more it is pulled in; the strength goes to the ideal", () => {
  assert.deepEqual(ayudar(0.7, -0.4, 0.9, 0), { x: 0.7, y: -0.4, fuerza: 0.9 });
  const cerca = ayudar(0.1, 0, 0.65, 0.6), lejos = ayudar(1.2, 0, 0.65, 0.6);
  assert.ok(Math.abs(cerca.x - 0.1) < 0.01, "an aim at the bull's eye is barely touched");
  assert.ok(lejos.x < 1.2 * 0.5, `${lejos.x}: a far aim is pulled well in`);
  const f = ayudar(0, 0, 0.95, 0.6).fuerza; assert.ok(Math.abs(f - (0.95 + (FUERZA_IDEAL - 0.95) * 0.6)) < 1e-9);
  const sube = ayudar(0, 0, 0.3, 0.6).fuerza; assert.ok(sube > 0.3 && sube < FUERZA_IDEAL);
  const dir = ayudar(-0.8, 0.6, 0.65, 0.6); assert.ok(dir.x < 0 && dir.y > 0, "the direction is kept");
});

test("lanzamiento with help: sent = pulled raw, the raw reading is kept, ayuda 0 is the old behaviour", () => {
  const v: V3 = [0.9, 0.5, -5.5];
  const sin = lanzamiento(CARA, START, v), con = lanzamiento(CARA, START, v, 0.6);
  assert.ok(sin.tipo === "tiro" && con.tipo === "tiro"); if (sin.tipo !== "tiro" || con.tipo !== "tiro") return;
  assert.equal(sin.ayuda, 0); assert.deepEqual({ x: sin.x, y: sin.y, fuerza: sin.fuerza }, sin.crudo);
  assert.deepEqual(con.crudo, sin.crudo, "help never changes what the hand did");
  assert.ok(Math.hypot(con.x, con.y) < Math.hypot(sin.x, sin.y), "closer to the middle");
  assert.ok(Math.abs(con.fuerza - FUERZA_IDEAL) < Math.abs(sin.fuerza - FUERZA_IDEAL), "closer to the ideal strength");
  assert.equal(con.ayuda, 0.6);
  assert.equal(lanzamiento(CARA, START, v, NaN).tipo === "tiro" && (lanzamiento(CARA, START, v, NaN) as { ayuda: number }).ayuda, 0, "NaN help is no help");
  assert.equal((lanzamiento(CARA, START, v, 7) as { ayuda: number }).ayuda, 1, "help is clamped to 1");
  assert.deepEqual(lanzamiento(CARA, START, v, 0.6).tipo, "tiro");
  assert.deepEqual(lanzamiento(CARA, START, [0, 0, 0.1], 0.6), { tipo: "suelta", motivo: "lento" }, "help never makes a non-throw a throw");
});

test("end to end through the server's physics: a pro gesture lands closer to the middle than the same swing flawed", () => {
  // The same aim error and strength overshoot (hand 6.8 m/s, a bit high and to the right), thrown with ayuda of a pro gesture and with none.
  const v: V3 = [0.8, 0.45, -6.8];
  const z = zonaDe("vr"), sinA = lanzamiento(CARA, START, v, 0), conA = lanzamiento(CARA, START, v, ayudaDe(puntos().puntos));
  assert.ok(sinA.tipo === "tiro" && conA.tipo === "tiro"); if (sinA.tipo !== "tiro" || conA.tipo !== "tiro") return;
  // average the landing's distance from the middle over many tremor draws
  const media = (t: typeof sinA) => { let s = 0, n = 0; for (let i = 0; i < 400; i++) { const l = aterrizaje(t.x, t.y, t.fuerza, azarDe(i, 17), z); s += Math.hypot(l.x, l.y); n++; } return s / n; };
  const a = media(sinA), b = media(conA);
  assert.ok(b < a * 0.8, `help lands closer: ${b.toFixed(3)} vs ${a.toFixed(3)} radii`);
});
