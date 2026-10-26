// S1 · el núcleo del motor de audio: UN grafo, ocho buses, un limitador y el ducking de la conversación.
// Todo con un `AudioContext` de mentira (como test/misiones-cofre.test.ts): en Node no hay Web Audio, y lo que
// importa aquí es la FORMA del grafo (quién cuelga de quién) y CUÁNDO suena, no el sonido.
import test from "node:test";
import assert from "node:assert/strict";
import { crearNucleo, BUSES, dB, SUELO, LIMITADOR, DUCK_DB, DUCK_ATAQUE_S, DUCK_RECUPERA_S, INMUNES } from "../packages/render/src/audio/nucleo.ts";

type Param = { value: number; objetivos: [number, number][]; setTargetAtTime(v: number, t: number, tau: number): void };
const param = (v = 1): Param => ({ value: v, objetivos: [], setTargetAtTime(x, _t, tau) { this.value = x; this.objetivos.push([x, tau]); } });

/** Un `AudioContext` de mentira que apunta cada nodo, cada conexión y cada suspend/resume. */
function falso() {
  const conexiones: [unknown, unknown][] = [];
  const nodos: { tipo: string; gain?: Param }[] = [];
  const llamadas: string[] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}) => {
    const n = { tipo, connect(d: unknown) { conexiones.push([n, d]); return d; }, disconnect() {}, ...extra };
    nodos.push(n as never);
    return n;
  };
  let creados = 0;
  const ctx = {
    state: "suspended" as AudioContextState,
    currentTime: 0,
    destination: { tipo: "destino" },
    createGain: () => nodo("gain", { gain: param(1) }),
    createDynamicsCompressor: () => nodo("limitador", { threshold: param(0), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    suspend() { llamadas.push("suspend"); ctx.state = "suspended"; return Promise.resolve(); },
    resume() { llamadas.push("resume"); ctx.state = "running"; return Promise.resolve(); },
    addEventListener() {},
  };
  return { ctx, conexiones, nodos, llamadas, crear: () => { creados++; return ctx as unknown as AudioContext; }, veces: () => creados };
}

/** Un núcleo con el gesto, la visibilidad y el contexto en la mano, para poder empujarlos desde la prueba. */
function banco(gestoYa = true) {
  const f = falso();
  let gesto = gestoYa;
  const esperando: (() => void)[] = [], cada: (() => void)[] = [];
  let avisarOculta: ((o: boolean) => void) | null = null;
  const n = crearNucleo({
    crear: f.crear,
    hayGesto: () => gesto,
    trasGesto: (fn) => { if (gesto) fn(); else esperando.push(fn); },
    enCadaGesto: (fn) => { cada.push(fn); },
    visibilidad: (fn) => { avisarOculta = fn; return false; },
  });
  return { ...f, n, gesto: () => { gesto = true; for (const fn of esperando.splice(0)) fn(); for (const fn of cada) fn(); }, ocultar: (o: boolean) => avisarOculta?.(o) };
}

const bus = (b: ReturnType<typeof banco>, nombre: (typeof BUSES)[number]) => b.n.bus(nombre)!;
const vcaDe = (b: ReturnType<typeof banco>, nombre: (typeof BUSES)[number]) => b.conexiones.find(([de]) => de === bus(b, nombre))![1] as { tipo: string; gain: Param };

test("el grafo se construye UNA sola vez, por perezoso que sea el motor", () => {
  const b = banco();
  assert.equal(b.veces(), 0, "nadie pidió sonar todavía: ni un AudioContext");
  b.n.bus("musica"); b.n.bus("efectos"); b.n.ctx(); b.n.ctx();
  assert.equal(b.veces(), 1, "un solo AudioContext para toda la página");
  assert.equal(b.n.bus("musica"), b.n.bus("musica"), "el mismo bus siempre, no uno nuevo por llamada");
  assert.equal(b.nodos.filter((x) => x.tipo === "limitador").length, 1);
  assert.equal(b.nodos.filter((x) => x.tipo === "gain").length, BUSES.length * 2 + 1, "un bus y un VCA por cada uno de los ocho, y el nodo del modo mono (V6)");
});

test("los ocho buses existen y acaban en el limitador, y el limitador en la salida", () => {
  const b = banco();
  assert.deepEqual([...BUSES], ["master", "musica", "ambiente", "efectos", "interfaz", "voz-gente", "voz-lector", "pasos-propios"]);
  for (const nombre of BUSES) assert.ok(bus(b, nombre), `falta el bus ${nombre}`);
  const lim = b.nodos.find((x) => x.tipo === "limitador")! as unknown as Record<string, Param>;
  assert.equal(lim.threshold.value, LIMITADOR.threshold); assert.equal(lim.knee.value, LIMITADOR.knee);
  assert.equal(lim.ratio.value, LIMITADOR.ratio); assert.equal(lim.attack.value, LIMITADOR.attack); assert.equal(lim.release.value, LIMITADOR.release);
  assert.ok(b.conexiones.some(([de, a]) => de === lim && a === b.ctx.destination), "el limitador es lo último antes de la salida");
  const master = bus(b, "master"), vcaMaster = vcaDe(b, "master");
  const aMono = b.conexiones.find(([de]) => de === vcaMaster)![1];
  assert.ok(b.conexiones.some(([de, a]) => de === aMono && a === lim), "el máster entra en el limitador (pasando por el nodo del modo mono, V6)");
  for (const nombre of BUSES) {
    if (nombre === "master") continue;
    assert.ok(b.conexiones.some(([de, a]) => de === vcaDe(b, nombre) && a === master), `${nombre} no cuelga del máster`);
  }
});

test("el volumen de un bus es lo que pide la persona en «Sonido» (y los cuatro deslizadores llegan)", () => {
  const b = banco();
  b.n.bus("master");
  b.n.aplicarAjustes((id) => ({ "sonido.general": 50, "sonido.musica": 20, "sonido.efectos": 70, "sonido.voz": 90 })[id]);
  assert.equal(vcaDe(b, "master").gain.value, 0.5);
  assert.equal(vcaDe(b, "musica").gain.value, 0.2);
  assert.equal(vcaDe(b, "efectos").gain.value, 0.7);
  assert.equal(vcaDe(b, "voz-gente").gain.value, 0.9);
  b.n.volumen("musica", 0);
  assert.equal(vcaDe(b, "musica").gain.value, 0, "la música sí se puede apagar del todo");
  b.n.volumen("musica", 7);
  assert.equal(vcaDe(b, "musica").gain.value, 1, "fuera de 0–1 se recorta");
  // un id sin grupo («efectos» en vez de «sonido.efectos») era el fallo de misiones.ts y pesca.ts: ahora no cuela
  const c = banco();
  c.n.bus("master");
  c.n.aplicarAjustes((id) => (id === "efectos" ? 0 : undefined));
  assert.equal(vcaDe(c, "efectos").gain.value, 0.8, "sin lectura válida se queda en el valor por defecto, no en silencio");
});

test("el ducking baja música, ambiente y efectos, y no toca ni la interfaz ni las voces", () => {
  const b = banco();
  b.n.bus("master");
  const antes = Object.fromEntries(BUSES.map((x) => [x, bus(b, x).gain.value]));
  b.n.duck(true);
  assert.equal(bus(b, "musica").gain.value, dB(-9));
  assert.equal(bus(b, "ambiente").gain.value, dB(-6));
  assert.equal(bus(b, "efectos").gain.value, dB(-3));
  for (const nombre of INMUNES) assert.equal(bus(b, nombre).gain.value, antes[nombre], `${nombre} no se duckea nunca`);
  assert.equal(bus(b, "pasos-propios").gain.value, antes["pasos-propios"], "tus pasos no son conversación");
  assert.equal(b.n.estado().duck, true);
  for (const nombre of Object.keys(DUCK_DB)) assert.ok(bus(b, nombre as never).gain.objetivos.some(([, tau]) => tau === DUCK_ATAQUE_S), "entra en 80 ms");
  b.n.duck(false);
  for (const nombre of Object.keys(DUCK_DB)) {
    assert.equal(bus(b, nombre as never).gain.value, 1, `${nombre} vuelve entero`);
    assert.ok(bus(b, nombre as never).gain.objetivos.some(([, tau]) => tau === DUCK_RECUPERA_S), "y sale en 600 ms, más despacio");
  }
  assert.equal(b.n.estado().duck, false);
});

test("accesibilidad: los avisos y las voces tienen suelo mínimo, pásese quien se pase con el deslizador", () => {
  const b = banco();
  b.n.bus("master");
  for (const nombre of INMUNES) {
    b.n.volumen(nombre, 0);
    assert.equal(vcaDe(b, nombre).gain.value, SUELO, `${nombre} a 0 se queda en el suelo: un aviso se tiene que oír`);
  }
  b.n.volumen("efectos", 0);
  assert.equal(vcaDe(b, "efectos").gain.value, 0, "los efectos no son información: esos sí se callan del todo");
  b.n.volumen("interfaz", 0.5);
  assert.equal(vcaDe(b, "interfaz").gain.value, 0.5, "por encima del suelo manda la persona");
});

test("antes del primer gesto no suena nada: el contexto nace suspendido y despierta al tocar", () => {
  const b = banco(false);
  b.n.bus("musica");
  assert.equal(b.ctx.state, "suspended");
  assert.equal(b.n.listo(), false, "nada puede sonar todavía");
  assert.ok(!b.llamadas.includes("resume"), "nadie reanudó a escondidas");
  assert.equal(b.n.estado().gesto, false);
  b.gesto();
  assert.equal(b.ctx.state, "running");
  assert.equal(b.n.listo(), true);
});

test("la pestaña oculta suspende el grafo; al volver, sigue sonando", () => {
  const b = banco();
  b.n.bus("musica");
  assert.equal(b.ctx.state, "running");
  b.ocultar(true);
  assert.equal(b.ctx.state, "suspended", "móvil frío: una pestaña que no se ve no suena");
  assert.deepEqual(b.n.estado().pausas, ["pagina"]);
  b.ocultar(false);
  assert.equal(b.ctx.state, "running");
  assert.deepEqual(b.n.estado().pausas, []);
});

test("salir de la sesión XR duerme el grafo, y el siguiente gesto lo despierta solo", () => {
  const b = banco();
  b.n.bus("musica");
  b.n.siesta();
  assert.equal(b.ctx.state, "suspended");
  assert.deepEqual(b.n.estado().pausas, [], "no es una pausa que dure: es una siesta");
  b.gesto();
  assert.equal(b.ctx.state, "running", "un clic después de salir de VR y el mundo vuelve a sonar");
});

test("v10: con el micrófono abierto salir de VR no duerme el grafo; al cerrarlo, la siesta pedida se cumple", () => {
  const b = banco();
  b.n.bus("musica");
  b.n.despertar("microfono", true);
  b.n.siesta();
  assert.equal(b.ctx.state, "running", "su captura corre en este contexto: dormirlo corta lo que dices y lo que oyes");
  b.n.despertar("microfono", false);
  assert.equal(b.ctx.state, "suspended", "soltada la última razón, la siesta que se pidió entretanto ocurre (batería)");
  b.gesto();
  assert.equal(b.ctx.state, "running", "y el siguiente gesto lo despierta como siempre");
});

test("v10: dos razones para despertar; la siesta espera a la última, y soltar sin siesta pedida no duerme nada", () => {
  const b = banco();
  b.n.bus("musica");
  b.n.despertar("microfono", true); b.n.despertar("voz-oida", true);
  b.n.siesta();
  b.n.despertar("microfono", false);
  assert.equal(b.ctx.state, "running", "queda una razón");
  b.n.despertar("voz-oida", false);
  assert.equal(b.ctx.state, "suspended");
  b.gesto();
  b.n.despertar("microfono", true); b.n.despertar("microfono", false); // nadie pidió siesta: no hay nada que cumplir
  assert.equal(b.ctx.state, "running");
  b.n.despertar("nunca-pedida", false); // soltar una razón desconocida no lanza
});

test("un navegador sin Web Audio no rompe nada: el motor sigue, mudo", () => {
  const n = crearNucleo({ crear: () => { throw new Error("no AudioContext here"); }, hayGesto: () => true, trasGesto: (f) => f(), enCadaGesto: () => {}, visibilidad: () => false });
  assert.equal(n.ctx(), null);
  assert.equal(n.bus("musica"), null);
  assert.equal(n.listo(), false);
  n.volumen("musica", 0.5); n.duck(true); n.siesta(); n.pausar(true); // nada de esto puede lanzar
  assert.equal(n.estado().contexto, "sin-audio");
  assert.equal(n.estado().volumen.musica, 0.5, "lo que pidió la persona se recuerda igual");
});

test("salir de VR: si el navegador rechaza `suspend()`/`resume()` no queda una promesa rechazada sin atender", async () => {
  const b = banco(true);
  const sinAtender: unknown[] = [];
  const oir = (r: unknown) => { sinAtender.push(r); };
  process.on("unhandledRejection", oir);
  try {
    b.n.ctx();
    // un contexto cerrado o interrumpido: ambas promesas se rechazan (a veces sin motivo)
    b.ctx.suspend = () => Promise.reject(undefined) as never;
    b.ctx.resume = () => Promise.reject(undefined) as never;
    b.ctx.state = "running" as AudioContextState;
    b.n.siesta();
    b.ctx.state = "suspended" as AudioContextState;
    b.n.pausar(true); b.n.pausar(false);
    b.n.despertar("voz", true); b.n.siesta(); b.n.despertar("voz", false);
    await new Promise((ok) => setTimeout(ok, 20));
  } finally { process.off("unhandledRejection", oir); }
  assert.deepEqual(sinAtender, [], "ninguna promesa de audio queda sin atender");
});
