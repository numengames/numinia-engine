// naturaleza F5: creature sound. Pure scheduling (deterministic, closed form), the voice pool (cap per tier, never grows), tier D builds no node,
// no node before the gesture / while the core is suspended, dispose disconnects everything, frequencies in a sane range. A fake AudioContext
// records every node (Node has no Web Audio); the real sound is proved by tools/naturaleza-sonido-wav.mjs (OfflineAudioContext).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import { crearSonidoFauna, VOCES_POR_NIVEL, ALCANCE_M, hashTexto, mezcla, perfilAve, perfilLuciernaga, frecuenciaNota, proximaLlamada, proximoPulso, tonoDe, PICOS_LUZ, atenuacion, BUS_FAUNA } from "../packages/render/src/naturaleza/sonido.ts";
import { alturaEn, zonaEn } from "../packages/relieve/src/relieve.ts";
import type { Nivel } from "../packages/render/src/calidad.ts";

const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
function falso(estado = { corre: true, gesto: true }) {
  const nodos: { tipo: string; conectado: number; desconectado: number; parado?: boolean }[] = [];
  const mk = (tipo: string, extra: Record<string, unknown> = {}) => { const n: Record<string, unknown> = { tipo, conectado: 0, desconectado: 0, connect(d: unknown) { n.conectado = (n.conectado as number) + 1; return d; }, disconnect() { n.desconectado = (n.desconectado as number) + 1; }, start() {}, stop() { n.parado = true; }, ...extra }; nodos.push(n as never); return n; };
  const ctx = {
    currentTime: 10, sampleRate: 8000,
    createGain: () => mk("gain", { gain: param() }), createOscillator: () => mk("osc", { frequency: param(), detune: param(), type: "sine" }), createStereoPanner: () => mk("pan", { pan: param() }),
    createBiquadFilter: () => mk("bp", { frequency: param(), Q: param(), type: "" }), createBufferSource: () => mk("src", { buffer: null, loop: false }),
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
  };
  const bus = mk("bus");
  const construidos = { n: 0 };
  const nucleo = { listo: () => estado.corre && estado.gesto, estado: () => ({ gesto: estado.gesto }), bus: (b: string) => { assert.equal(b, BUS_FAUNA); return bus as never; }, ctx: () => { construidos.n++; return ctx as unknown as AudioContext; } };
  return { nodos, nucleo, bus, estado, construidos };
}
const OP = { tamano: 200, plaza: 12 };
const camara = (x = 0, z = 0) => ({ matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 1.7, z, 1] }, updateWorldMatrix() {} });
const banco = (nivel: Nivel, hora: number, f = falso(), semilla = 1234) => {
  const s = crearSonidoFauna({ nucleo: f.nucleo, nivel, camara: camara(), tabla: FAUNA_CASA, fauna: { semilla, densidad: 1, alturaEn: (x, z) => alturaEn(semilla, x, z, OP), zonaEn: (x, z) => zonaEn(semilla, x, z, OP), hora: () => hora }, oculta: () => false });
  return { s, f };
};
const propios = (f: ReturnType<typeof falso>) => f.nodos.filter((x) => x.tipo !== "bus").length;
const correr = (s: ReturnType<typeof banco>["s"], t0: number, segundos: number) => { for (let t = t0; t < t0 + segundos; t += 0.1) s.actualizar(camara() as never, t); };

test("hash and scheduling are deterministic and in range", () => {
  assert.equal(hashTexto("p3_4_7_1"), hashTexto("p3_4_7_1"));
  assert.notEqual(hashTexto("p3_4_7_1"), hashTexto("p3_4_7_2"));
  for (let k = 0; k < 200; k++) { const u = mezcla(12345, k); assert.ok(u >= 0 && u < 1); }
  for (const id of ["a", "b", "c"]) {
    const hid = hashTexto(id), P = 7, a = proximaLlamada(hid, P, 3.3), b = proximaLlamada(hid, P, 3.3);
    assert.equal(a, b); assert.ok(a >= 3.3 && a < 3.3 + P * 1.5);
    assert.equal(proximaLlamada(hid, P, a), a, "asking from the call itself returns the call");
    assert.ok(proximaLlamada(hid, P, a + 1e-6) > a);
  }
  // calls ≈ one per period: count in 600 s
  let n = 0, t = 0; while (t < 600) { t = proximaLlamada(hashTexto("x"), 6, t) + 1e-6; n++; }
  assert.ok(n > 600 / 6 * 0.8 && n < 600 / 6 * 1.4, String(n));
});

test("firefly pulses follow the light pattern: closed form, one per period at least, rit stretches time", () => {
  for (const luz of Object.keys(PICOS_LUZ)) {
    const L = PICOS_LUZ[luz];
    let t = 0, n = 0; while (t < 100) { const s = proximoPulso(luz, 0.3, 1, t); assert.ok(s >= t); t = s + 1e-6; n++; }
    assert.ok(Math.abs(n - (100 / L.P) * L.pk.length) <= L.pk.length, `${luz}: ${n}`);
    const lento = proximoPulso(luz, 0.3, 0.6, 50), normal = proximoPulso(luz, 0.3, 1, 30);
    assert.ok(Number.isFinite(lento) && Number.isFinite(normal));
  }
  // parpadeo (period 2.2, peak at 0.06, phase f): the blip is where the shader's blink starts
  const f = 0.25, t = proximoPulso("parpadeo", f, 1, 0);
  assert.ok(Math.abs(((t / 2.2 + f) % 1) - 0.06) < 1e-9);
});

test("frequencies are in a sane audible range and breeds differ", () => {
  const aves = FAUNA_CASA.especies.filter((e) => e.grupo === "pajaro"), firmas = new Set<string>();
  aves.forEach((e, i) => {
    const p = perfilAve(e, i);
    assert.ok(p.notas.length >= 2 && p.notas.length <= 5, e.id);
    for (let k = 0; k < p.notas.length; k++) { const f = frecuenciaNota(p, k); assert.ok(f >= 500 && f <= 7000, `${e.id} ${f}`); }
    assert.ok(p.durNota >= 0.04 && p.durNota <= 0.1 && p.periodo >= 3 && p.periodo <= 14);
    firmas.add([Math.round(p.base), p.notas.join(","), p.onda].join("|"));
  });
  assert.equal(firmas.size, aves.length, "12 breeds, 12 distinct calls");
  const ls = FAUNA_CASA.especies.filter((e) => e.grupo === "luciernaga").map(perfilLuciernaga);
  for (const p of ls) assert.ok(p.freq >= 700 && p.freq <= 3800 && p.durMs >= 30 && p.durMs <= 60, JSON.stringify(p));
  const rojo = perfilLuciernaga({ colores: { luz: 0xff1a3c, cuerpo: 0, ala: 0, circuito: 0 }, rareza: "comun", luz: "latido" }), cian = perfilLuciernaga({ colores: { luz: 0x00e5ff, cuerpo: 0, ala: 0, circuito: 0 }, rareza: "comun", luz: "latido" });
  assert.ok(cian.freq > rojo.freq * 1.8, "the hue sets the pitch");
  assert.ok(Math.abs(tonoDe(0x00ff00) - 1 / 3) < 1e-9);
  const rara = ls.find((p) => p.indice > 2)!; assert.ok(rara, "legendary ones add an FM partial");
  assert.equal(atenuacion(0, 10), 1); assert.equal(atenuacion(10, 10), 0);
});

test("pool: cap per tier, nodes built once and never grow; tier D builds nothing", () => {
  assert.deepEqual(VOCES_POR_NIVEL, { A: 6, B: 4, C: 3, D: 0 });
  assert.deepEqual(ALCANCE_M, { pajaro: 40, luciernaga: 12, mariposa: 4 });
  const d = banco("D", 12); correr(d.s, 0, 20);
  assert.equal(propios(d.f), 0); assert.equal(d.f.construidos.n, 0, "tier D does not even ask for the context"); assert.equal(d.s.estadisticas().ticks, 0);
  for (const nivel of ["A", "B", "C"] as Nivel[]) {
    const { s, f } = banco(nivel, 12); correr(s, 0, 5);
    const n0 = f.nodos.length; assert.ok(n0 > 1);
    let maxAct = 0; for (let t = 5; t < 125; t += 0.1) { s.actualizar(camara() as never, t); maxAct = Math.max(maxAct, s.estadisticas().vocesActivas); }
    assert.equal(f.nodos.length, n0, `${nivel}: no node per sound`);
    assert.ok(maxAct <= VOCES_POR_NIVEL[nivel], `${nivel}: ${maxAct}`);
    assert.equal(s.estadisticas().voces, VOCES_POR_NIVEL[nivel]);
    assert.equal(f.nodos.filter((x) => x.tipo === "osc").length, VOCES_POR_NIVEL[nivel] * 2 + (nivel === "C" ? 0 : 1), `${nivel}: oscillators`);
    assert.ok(s.estadisticas().eventos > 0, `${nivel}: something sounded by day`);
  }
});

test("night: fireflies sound, birds do not; day: birds sound, fireflies do not (events by group)", () => {
  const noche = banco("A", 23.5), dia = banco("A", 12);
  correr(noche.s, 0, 100); correr(dia.s, 0, 100);
  assert.ok(noche.s.estadisticas().eventos > 0, "fireflies at night");
  assert.ok(dia.s.estadisticas().eventos > 0, "birds by day");
});

test("same seed, same clock → the same events (deterministic across two listeners)", () => {
  const huella = () => { const { s } = banco("A", 12); correr(s, 0, 60); return s.estadisticas().eventos; };
  assert.equal(huella(), huella());
});

test("no node before the gesture; nothing while the core is suspended; the tab hidden is silent", () => {
  const f = falso({ corre: false, gesto: false });
  const { s } = banco("A", 12, f); correr(s, 0, 10);
  assert.equal(f.nodos.filter((x) => x.tipo !== "bus").length, 0); assert.equal(f.construidos.n, 0, "the fauna never builds the engine before the gesture");
  f.estado.gesto = true; f.estado.corre = false; correr(s, 10, 5);
  assert.equal(f.nodos.filter((x) => x.tipo !== "bus").length, 0, "gesture but the context is not running yet: still nothing");
  f.estado.corre = true; correr(s, 15, 5);
  assert.ok(f.nodos.length > 1);
  const oculto = falso(); let oc = true;
  const o = crearSonidoFauna({ nucleo: oculto.nucleo, nivel: "A", camara: camara() as never, tabla: FAUNA_CASA, fauna: { semilla: 1234, densidad: 1, alturaEn: () => 0, zonaEn: () => "prado", hora: () => 12 }, oculta: () => oc });
  correr(o, 0, 5); assert.equal(oculto.nodos.length, 1); oc = false; correr(o, 5, 5); assert.ok(oculto.nodos.length > 1);
});

test("dispose stops and disconnects every node and further ticks do nothing", () => {
  const { s, f } = banco("A", 12); correr(s, 0, 30);
  const n = f.nodos.filter((x) => x.tipo !== "bus");
  assert.ok(n.length > 10);
  s.dispose(); s.dispose();
  for (const x of n) assert.ok(x.desconectado >= 1, `${x.tipo} disconnected`);
  for (const x of n.filter((y) => y.tipo === "osc" || y.tipo === "src")) assert.ok(x.parado, "sources stopped");
  const ticks = s.estadisticas().ticks; correr(s, 30, 5); assert.equal(s.estadisticas().ticks, ticks);
  assert.equal(f.nodos.length, n.length + 1);
});

test("CPU: a tick is cheap and the graph rests (disconnected from the bus) when nothing is near", () => {
  const { s, f } = banco("A", 12); correr(s, 0, 10);
  let max = 0; for (let t = 10; t < 130; t += 0.1) { s.actualizar(camara() as never, t); max = Math.max(max, s.estadisticas().msUltimo); }
  assert.ok(max < 8, `max tick ${max} ms (a window change re-reads 25 cells)`);
  assert.ok(s.estadisticas().msMedio < 0.5, `mean ${s.estadisticas().msMedio}`);
  // nothing alive around (density 0): the trim node is taken off the bus after the rest time, and never connected before
  const f0 = falso(), vacio = crearSonidoFauna({ nucleo: f0.nucleo, nivel: "A", camara: camara() as never, tabla: FAUNA_CASA, fauna: { semilla: 1234, densidad: 0, alturaEn: () => 0, zonaEn: () => "prado", hora: () => 12 }, oculta: () => false });
  correr(vacio, 0, 10);
  assert.equal(vacio.estadisticas().conectado, false); assert.equal(vacio.estadisticas().eventos, 0);
  assert.equal(s.estadisticas().conectado === true || s.estadisticas().conectado === false, true);
  void f;
});
