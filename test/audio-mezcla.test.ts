// V6 · la mezcla: un sonido a la derecha suena a la derecha (y gira con la cabeza), el modo mono lo iguala, los
// volúmenes de «Sonido» mandan (también el de avisos, aparte) y la baliza simple repite más seguido cuanto más cerca.
// Con un `AudioContext` de mentira: se comprueba la forma del grafo y las cuentas, no cómo suena.
import test from "node:test";
import assert from "node:assert/strict";
import { ladoDe, gananciasEstereo, intervaloBaliza, BALIZA_MAX_S, BALIZA_MIN_S, busDeGrupo, esGrupoSonido, type PoseOido } from "../packages/render/src/audio/mezcla.ts";
import { crearBaliza, LLEGADA_M, SONIDO_BALIZA } from "../packages/render/src/audio/baliza.ts";
import { crearNucleo, AJUSTE_DE, AJUSTE_MONO, SUELO } from "../packages/render/src/audio/nucleo.ts";
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";
import { montarBalizaSonora } from "../apps/plaza/baliza-sonora.ts";

/** Cabeza en el origen mirando a −z (el defecto de Web Audio) con «arriba» = +y. */
const mirandoAlNorte: PoseOido = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
/** La misma cabeza girada `g` radianes a la izquierda (yaw positivo = a la izquierda, como en three.js). */
const girada = (g: number): PoseOido => ({ ...mirandoAlNorte, fx: -Math.sin(g), fz: -Math.cos(g) });
const dec = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("un sonido a la derecha cae a la derecha; a la izquierda, a la izquierda; delante o detrás, en medio", () => {
  assert.ok(ladoDe(mirandoAlNorte, { x: 5, y: 1.6, z: 0 }) > 0.99, "+x es la derecha de quien mira a −z");
  assert.ok(ladoDe(mirandoAlNorte, { x: -5, y: 1.6, z: 0 }) < -0.99);
  dec(ladoDe(mirandoAlNorte, { x: 0, y: 1.6, z: -5 }), 0);
  dec(ladoDe(mirandoAlNorte, { x: 0, y: 1.6, z: 5 }), 0);
  assert.equal(ladoDe(mirandoAlNorte, { x: 0, y: 1.6, z: 0 }), 0, "dentro de la cabeza no hay lado");
  const g = gananciasEstereo(ladoDe(mirandoAlNorte, { x: 5, y: 1.6, z: 0 }), false);
  assert.ok(g.der > 0.99 && g.izq < 0.02, "a la derecha suena por el oído derecho");
});

test("el sonido sigue a la CABEZA: girarla 90° a la izquierda pasa lo de la derecha a estar detrás, y 180° lo cambia de lado", () => {
  const fuente = { x: 5, y: 1.6, z: 0 };
  dec(ladoDe(girada(Math.PI / 2), fuente), 0);                  // ahora mira a −x: la fuente queda detrás
  assert.ok(ladoDe(girada(Math.PI), fuente) < -0.99, "de espaldas, lo que estaba a la derecha está a la izquierda");
});

test("modo mono: los dos oídos reciben lo mismo, esté el sonido donde esté", () => {
  for (const lado of [-1, -0.4, 0, 0.7, 1]) {
    const m = gananciasEstereo(lado, true);
    dec(m.izq, m.der);
    dec(m.izq ** 2 + m.der ** 2, 1);                               // la misma potencia que en estéreo
    const e = gananciasEstereo(lado, false);
    dec(e.izq ** 2 + e.der ** 2, 1);
  }
  const e = gananciasEstereo(0.8, false);
  assert.ok(e.der > e.izq, "sin mono, el lado se nota");
});

// ---- el núcleo: mono y volumen de avisos ----
type Param = { value: number; setTargetAtTime(v: number): void };
const param = (v = 1): Param => ({ value: v, setTargetAtTime(x) { this.value = x; } });
function banco() {
  const conexiones: [unknown, unknown][] = [], nodos: Record<string, unknown>[] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}) => { const n: Record<string, unknown> = { tipo, connect(d: unknown) { conexiones.push([n, d]); return d; }, disconnect() {}, ...extra }; nodos.push(n); return n; };
  const ctx = { state: "running", currentTime: 0, destination: { tipo: "destino" }, createGain: () => nodo("gain", { gain: param(1), channelCount: 2, channelCountMode: "max", channelInterpretation: "speakers" }), createDynamicsCompressor: () => nodo("limitador", { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }), suspend() { return Promise.resolve(); }, resume() { return Promise.resolve(); }, addEventListener() {} };
  const n = crearNucleo({ crear: () => ctx as never, hayGesto: () => true, trasGesto: (f) => f(), enCadaGesto: () => {}, visibilidad: () => false });
  return { n, conexiones, nodos };
}
const delMaster = (b: ReturnType<typeof banco>) => { const lim = b.nodos.find((x) => x.tipo === "limitador")!; return b.conexiones.find(([, a]) => a === lim)![0] as Record<string, unknown>; };

test("V6 mono: el máster pasa por un nodo de un solo canal fijo antes del limitador; al quitarlo vuelve el estéreo", () => {
  const b = banco(); b.n.ctx();
  const m = delMaster(b);
  assert.equal(m.channelCount, 2); assert.equal(m.channelCountMode, "max"); assert.equal(b.n.estado().mono, false);
  b.n.aplicarAjustes((id) => (id === AJUSTE_MONO ? true : undefined));
  assert.equal(m.channelCount, 1); assert.equal(m.channelCountMode, "explicit"); assert.equal(m.channelInterpretation, "speakers"); assert.equal(b.n.estado().mono, true);
  b.n.aplicarAjustes((id) => (id === AJUSTE_MONO ? false : undefined));
  assert.equal(m.channelCount, 2); assert.equal(m.channelCountMode, "max"); assert.equal(b.n.estado().mono, false);
});

test("V6 mono pedido ANTES de que exista el grafo se aplica al construirlo", () => {
  const b = banco();
  b.n.mono(true);
  assert.equal(b.nodos.length, 0, "pedirlo no construye el grafo");
  b.n.ctx();
  assert.equal(delMaster(b).channelCount, 1);
});

test("V6 avisos: la interfaz tiene su propio deslizador (no el de efectos), con el suelo de accesibilidad", () => {
  assert.equal(AJUSTE_DE.interfaz, "sonido.avisos");
  assert.notEqual(AJUSTE_DE.interfaz, AJUSTE_DE.efectos);
  const b = banco(); b.n.ctx();
  b.n.aplicarAjustes((id) => ({ "sonido.efectos": 0, "sonido.avisos": 50, "sonido.musica": 30 } as Record<string, number>)[id]);
  const v = b.n.estado().volumen;
  assert.equal(v.efectos, 0, "los efectos bajados a 0 no se llevan los avisos");
  assert.equal(v.interfaz, 0.5);
  assert.equal(v.musica, 0.3, "los volúmenes de ajustes mandan");
  b.n.aplicarAjustes((id) => (id === "sonido.avisos" ? 0 : undefined));
  assert.equal(b.n.estado().volumen.interfaz, SUELO, "un aviso a 0 no se calla del todo");
});

test("los ajustes de V6 están declarados: avisos (deslizador), mono y baliza (apagados de serie)", () => {
  const por = (id: string) => AJUSTES_MOTOR.find((a) => a.grupo === "sonido" && a.id === id) as unknown as Record<string, unknown>;
  assert.equal(por("avisos").tipo, "numero"); assert.equal(por("avisos").defecto, 100);
  assert.equal(por("mono").tipo, "bool"); assert.equal(por("mono").defecto, false);
  assert.equal(por("baliza").tipo, "bool"); assert.equal(por("baliza").defecto, false);
  assert.equal(AJUSTE_MONO, "sonido.mono");
});

// ---- la baliza simple ----
test("la baliza repite más seguido cuanto más cerca, y se apaga al llegar", () => {
  assert.equal(intervaloBaliza(1000), BALIZA_MAX_S); assert.equal(intervaloBaliza(0), BALIZA_MIN_S);
  assert.ok(intervaloBaliza(10) < intervaloBaliza(30));
  let t = 0, oido = { x: 0, y: 1.6, z: 0 };
  const sonadas: { id: string; donde: { x: number; y: number; z: number } }[] = [];
  const b = crearBaliza({ sonar: (id, donde) => { sonadas.push({ id, donde }); return true; }, oido: () => oido, ahora: () => t });
  assert.equal(b.pulso(), false, "sin baliza no suena");
  b.poner(30, 0, 60_000);
  assert.equal(b.pulso(), true, "suena en cuanto se pone"); assert.equal(sonadas[0].id, SONIDO_BALIZA);
  assert.deepEqual(sonadas[0].donde, { x: 30, y: 1.5, z: 0 }, "fijo en el destino, no en ti");
  t += 500; assert.equal(b.pulso(), false, "lejos va despacio");
  t += 2000; assert.equal(b.pulso(), true);
  oido = { x: 25, y: 1.6, z: 0 }; t += 1000;
  assert.equal(b.pulso(), true, "más cerca, más seguido: a 5 m basta un segundo");
  oido = { x: 29, y: 1.6, z: 0 }; t += 600;
  assert.equal(b.pulso(), false, `a menos de ${LLEGADA_M} m has llegado: se apaga`); assert.equal(b.activa(), false);
  b.poner(30, 0, 1000); t += 2000; assert.equal(b.pulso(), false, "caduca con la luz"); assert.equal(b.activa(), false);
});

test("la baliza de luz (view.beacon) suena además solo si «Baliza sonora» está encendida", () => {
  const luces: string[] = []; const sonadas: string[] = [];
  const mk = (on: boolean) => {
    const view = { beacon: (x: number, z: number, texto: string) => { luces.push(texto); }, oyente: () => ({ pose: () => ({ x: 0, y: 1.6, z: 0 }) }) };
    const b = montarBalizaSonora(view, (id) => (id === "sonido.baliza" ? on : undefined), { sonar: (id) => { sonadas.push(id); return true; }, ahora: () => 0 });
    return { view, b };
  };
  const apagada = mk(false); apagada.view.beacon(20, 0, "una", 5000);
  assert.deepEqual(luces, ["una"]); assert.equal(sonadas.length, 0, "apagada: solo la luz de siempre"); assert.equal(apagada.b.activa(), false);
  const encendida = mk(true); encendida.view.beacon(20, 0, "dos", 5000);
  assert.deepEqual(luces, ["una", "dos"], "la luz sigue saliendo"); assert.deepEqual(sonadas, [SONIDO_BALIZA]); assert.equal(encendida.b.activa(), true);
  encendida.b.quitar();
});

test("H5 · grupos del sonido del mundo: música, efectos y ambiente; lo demás no es un grupo", () => {
  assert.equal(busDeGrupo("musica"), "musica"); assert.equal(busDeGrupo("efectos"), "efectos"); assert.equal(busDeGrupo("ambiente"), "ambiente");
  assert.equal(busDeGrupo("interfaz"), null, "un sonido del mundo no se cuela en el bus de los avisos");
  assert.equal(busDeGrupo(undefined), null); assert.equal(esGrupoSonido("voz-gente"), false);
});
