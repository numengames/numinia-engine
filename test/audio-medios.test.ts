// S4 · los medios del mundo en el grafo de audio. Con un `AudioContext` de mentira (como test/audio-nucleo.test.ts):
// en Node no hay Web Audio, y lo que importa es la FORMA del grafo (de qué bus cuelga cada cosa, qué panner tiene y
// con qué defectos), CUÁNDO suena (el reloj de pared, la pausa por distancia) y que sin Web Audio el mundo siga.
// El núcleo y el pool son los de verdad: así la prueba comprueba la cadena entera, no una maqueta.
import test from "node:test";
import assert from "node:assert/strict";
import { crearNucleo, type Bus } from "../packages/render/src/audio/nucleo.ts";
import { crearVoces } from "../packages/render/src/audio/voces.ts";
import { conectar } from "../packages/render/src/audio/oyente.ts";
import {
  cargarSonido, cargarVideo, ponerGrafo, volumenEn, instanteDePared, desfase, necesitaSincro, fijarRelojMundo, ahoraMundo, desfasesDeVideos, VIDEO_SINCRO_S,
  distanciaDeSonido, busDeSonido, radioDeSonido, RADIO_SONIDO_MAX, CAMA_S, EMISOR, type Grafo, type Opciones,
} from "../packages/render/src/medios.ts";

// ——— el laboratorio ———————————————————————————————————————————————————————————————————————

type Param = { value: number; setValueAtTime(v: number, t: number): void; setTargetAtTime(v: number, t: number, tau: number): void };
const param = (v = 1): Param => ({ value: v, setValueAtTime(x) { this.value = x; }, setTargetAtTime(x) { this.value = x; } });

type Nodo = { tipo: string; sale: Nodo[]; [k: string]: unknown };
function falso(durBuffer = 5) {
  const nodos: Nodo[] = [];
  const arranques: { nodo: Nodo; cuando: number; desde: number }[] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}): Nodo => {
    const n: Nodo = {
      tipo, sale: [],
      connect(d: Nodo) { (n.sale as Nodo[]).push(d); return d; },
      disconnect() { (n.sale as Nodo[]).length = 0; },
      ...extra,
    };
    nodos.push(n);
    return n;
  };
  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: 48000,
    destination: nodo("destino"),
    listener: {},
    createGain: () => nodo("gain", { gain: param(1) }),
    createBiquadFilter: () => nodo("filtro", { type: "", frequency: param(350), Q: param(1) }),
    createPanner: () => nodo("panner", { panningModel: "equalpower", distanceModel: "inverse", refDistance: 1, maxDistance: 10000, rolloffFactor: 1, coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 0, positionX: param(0), positionY: param(0), positionZ: param(0) }),
    createBufferSource: () => {
      const n = nodo("fuente", {
        buffer: null, loop: false, playbackRate: param(1), onended: null,
        start(cuando = 0, desde = 0) { arranques.push({ nodo: n, cuando, desde }); },
        stop() {},
      });
      return n;
    },
    createMediaElementSource: (el: unknown) => nodo("medio", { elemento: el }),
    createDynamicsCompressor: () => nodo("limitador", { threshold: param(0), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    decodeAudioData: async () => ({ length: 48000 * durBuffer, duration: durBuffer, numberOfChannels: 1, sampleRate: 48000 }) as unknown as AudioBuffer,
    suspend() { ctx.state = "suspended"; return Promise.resolve(); },
    resume() { ctx.state = "running"; return Promise.resolve(); },
    addEventListener() {},
  };
  return { ctx, nodos, arranques };
}

/** Un `<audio>`/`<video>` de mentira: dice su duración cuando se le pide y apunta cada play/pause. */
function elemento(dur = 300) {
  const oyentes = new Map<string, ((e?: unknown) => void)[]>();
  const el = {
    src: "", crossOrigin: "", preload: "", loop: false, muted: false, volume: 1, playsInline: true,
    autoplay: false, srcObject: null as unknown, currentTime: 0, paused: true, duration: dur,
    videoWidth: 1920, videoHeight: 1080, error: null as unknown,
    play() { el.paused = false; return Promise.resolve(); },
    pause() { el.paused = true; },
    load() {},
    setAttribute() {}, removeAttribute(n: string) { if (n === "src") el.src = ""; },
    addEventListener(t: string, fn: (e?: unknown) => void) { (oyentes.get(t) ?? oyentes.set(t, []).get(t)!).push(fn); },
    removeEventListener() {},
    disparar(t: string) { for (const fn of oyentes.get(t) ?? []) fn(); },
  };
  return el;
}

/** El grafo de verdad (núcleo + pool) sobre el contexto de mentira. */
function banco(nivelPequeno = false, durBuffer = 5) {
  const f = falso(durBuffer);
  const nucleo = crearNucleo({ crear: () => f.ctx as unknown as AudioContext, hayGesto: () => true, trasGesto: (fn) => fn(), enCadaGesto: () => {}, visibilidad: () => false });
  const voces = crearVoces({ nucleo, nivel: nivelPequeno ? "D" : "A", traer: async () => new ArrayBuffer(64), medio: () => elemento() as unknown as HTMLMediaElement });
  const grafo: Grafo = { nucleo, voces, conectar };
  ponerGrafo(grafo);
  return { ...f, nucleo, voces, grafo };
}

const cosa = (x = 0, y = 0, z = 0, escala = 1) => {
  const g = { position: { x, y, z }, scale: { x: escala, y: escala, z: escala }, visible: true } as never;
  return g as unknown as import("three/webgpu").Object3D;
};
const OPC = (p: Partial<Opciones> = {}): Opciones => ({ hidden: false, volume: 1, reach: "burbuja", radius: 8, ...p });
const esperar = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** El panner de la única voz del pool, y el bus del que cuelga (siguiendo las conexiones de verdad). */
function cadena(b: ReturnType<typeof banco>) {
  const panner = b.nodos.filter((n) => n.tipo === "panner").at(-1);
  if (!panner) return null;
  const bus = (panner.sale as Nodo[])[0];
  const entra = b.nodos.filter((n) => (n.sale as Nodo[]).includes(panner));
  return { panner, bus, entra };
}
const busNodo = (b: ReturnType<typeof banco>, nombre: Bus) => b.nucleo.bus(nombre) as unknown as Nodo;

// ——— el reloj de pared, en frío ——————————————————————————————————————————————————————————

test("S4: el reloj de pared es el mismo para todos, y el umbral sigue siendo 0,6 s", () => {
  // misma hora de pared ⇒ mismo instante del bucle, sin importar cuándo entró cada uno
  assert.equal(instanteDePared(10, 123_456_000), instanteDePared(10, 123_456_000));
  assert.equal(instanteDePared(10, 1_000_000_000), 0, "mil millones de ms son 1e6 s: múltiplo exacto de 10 s");
  assert.equal(Number(instanteDePared(10, 1_000_003_400).toFixed(6)), 3.4);
  assert.equal(instanteDePared(0, 1_000), 0, "sin duración no hay instante");
  // el desfase cuenta la vuelta del bucle: 9,9 s y 0,1 s están a 0,2 s, no a 9,8
  assert.equal(Number(desfase(9.9, 10, 1_000_000_100).toFixed(6)), 0.2);
  assert.equal(necesitaSincro(0.1, 10, 1_000_000_000), false, "0,1 s de desvío no se salta");
  assert.equal(necesitaSincro(2, 10, 1_000_000_000), true, "2 s sí");
  assert.equal(necesitaSincro(9.9, 10, 1_000_000_100), false, "a un pelo del final NO se salta (dar la vuelta se oiría)");
  assert.equal(necesitaSincro(0, 0.5, 1_000_000_300), false, "un bucle más corto que el umbral nunca se resincroniza");
});

test("S4: el radio de un sonido es su escala, con tope de 50 m; el volumen del mundo es el `gain` del emisor", () => {
  assert.equal(radioDeSonido(3), 3);
  assert.equal(radioDeSonido(0), 0.05, "suelo de 5 cm");
  assert.equal(radioDeSonido(900), RADIO_SONIDO_MAX, "el tope de 50 m de constructor.ts vale también aquí");
  assert.equal(radioDeSonido(NaN), 0.05);
  // compatibilidad de datos: `volume` se sigue leyendo igual, y es la ganancia
  assert.equal(volumenEn(0, 8, { volume: 0.4, reach: "burbuja" }), 0.4);
  assert.equal(volumenEn(100, 8, { volume: 1, reach: "todos" }), 1);
});

test("S4: las distancias del panner son las del diseño, y `refDistance: 0` se corrige a 1 con aviso", () => {
  const d = distanciaDeSonido(12, { reach: "burbuja" });
  assert.equal(d.distanceModel, "inverse");
  assert.equal(d.refDistance, 1);
  assert.equal(d.maxDistance, 12, "`maxDistance` ES el radio de la cosa");
  assert.equal(d.rolloffFactor, 3);
  assert.equal(EMISOR.rolloffFactor, 3);
  // `reach` más ancho que la burbuja: la distancia NO atenúa (en `inverse`, rolloff 0 = ganancia 1 siempre)
  assert.equal(distanciaDeSonido(12, { reach: "zona" }).rolloffFactor, 0);
  assert.equal(distanciaDeSonido(12, { reach: "todos" }).rolloffFactor, 0);
  // trampa de la especificación: con refDistance 0 el modelo inverse deja la fuente muda PARA SIEMPRE
  const avisos: string[] = [];
  const z = distanciaDeSonido(12, { reach: "burbuja", refDistance: 0 }, (m) => avisos.push(m));
  assert.equal(z.refDistance, 1);
  assert.match(avisos.join(" "), /muda/);
  assert.equal(distanciaDeSonido(3, { reach: "burbuja", refDistance: 5 }).maxDistance, 5, "nunca por debajo de refDistance");
  // el bus: lo que diga la cosa; si no dice nada, ambiente la cama y efectos lo puntual
  assert.equal(busDeSonido(OPC(), true), "ambiente");
  assert.equal(busDeSonido(OPC(), false), "efectos");
  assert.equal(busDeSonido(OPC({ bus: "musica" }), true), "musica");
});

// ——— el sonido del mundo en el grafo ——————————————————————————————————————————————————————

test("S4: un sonido corto del mundo cuelga de su bus y pasa por un panner (no por `a.volume`)", async () => {
  const b = banco();
  const m = cargarSonido("s.mp3", () => false, { medio: () => elemento(3) as unknown as HTMLMediaElement, ahora: () => 1_000_000_000, monotono: () => 0 });
  m.actualizar(cosa(2, 1, -3, 4), { x: 0, y: 1.6, z: 0 }, OPC({ volume: 0.5 }));
  await esperar(); await esperar(); await esperar();
  m.actualizar(cosa(2, 1, -3, 4), { x: 0, y: 1.6, z: 0 }, OPC({ volume: 0.5 }));
  await esperar(); await esperar();

  const c = cadena(b);
  assert.ok(c, "no se construyó ninguna cadena de voz");
  assert.equal(c!.bus, busNodo(b, "efectos"), "un sonido corto es un efecto y cuelga del bus «efectos»");
  assert.equal(c!.panner.distanceModel, "inverse");
  assert.equal(c!.panner.refDistance, 1);
  assert.equal(c!.panner.maxDistance, 4, "`maxDistance` = el radio de la cosa (su escala)");
  assert.equal(c!.panner.rolloffFactor, 3);
  assert.equal((c!.panner.positionX as Param).value, 2, "la fuente está DONDE ESTÁ LA COSA: izquierda y derecha ya existen");
  assert.equal((c!.panner.positionZ as Param).value, -3);
  // la cadena del diseño: fuente → gain → lowpass → panner → bus
  const filtro = c!.entra.find((n) => n.tipo === "filtro");
  assert.ok(filtro, "falta el lowpass de aire/oclusión antes del panner");
  assert.ok(b.nodos.some((n) => n.tipo === "gain" && (n.sale as Nodo[]).includes(filtro!)), "falta la ganancia propia de la voz");
  assert.equal(b.voces.estado().reales, 1);
  assert.ok(m.sonando());
  // ni un `HTMLAudioElement` sonando: el camino viejo no se usa cuando hay Web Audio
  assert.equal(b.voces.estado().avisos.filter((a) => /Web Audio/.test(a)).length, 0);
  m.soltar();
});

test("S4: dos clientes con el mismo reloj arrancan el mismo sonido en el mismo instante", async () => {
  const reloj = () => 1_000_003_400;          // 3,4 s dentro de un bucle de 5 s
  const hacer = async () => {
    const b = banco();
    const m = cargarSonido("corto.mp3", () => false, { medio: () => elemento(5) as unknown as HTMLMediaElement, ahora: reloj, monotono: () => 0 });
    for (let i = 0; i < 3; i++) { m.actualizar(cosa(0, 0, 0, 10), { x: 0, y: 0, z: 0 }, OPC()); await esperar(); }
    return b;
  };
  const uno = await hacer(), otro = await hacer();
  assert.equal(uno.arranques.length, 1); assert.equal(otro.arranques.length, 1);
  assert.equal(uno.arranques[0].desde, instanteDePared(5, reloj()));
  assert.equal(uno.arranques[0].desde, otro.arranques[0].desde, "los dos entran por el mismo segundo del bucle");
  assert.equal(Number(uno.arranques[0].desde.toFixed(6)), 3.4, "1 000 003,4 s dentro de un bucle de 5 s son 3,4 s");
  assert.ok((uno.nodos.find((n) => n.tipo === "fuente") as { loop: boolean }).loop, "y en bucle, como siempre");
});

test("S4: a más de `radio` no suena, y al volver sí (pausa por distancia, sin descodificar de más)", async () => {
  const b = banco();
  const m = cargarSonido("s.mp3", () => false, { medio: () => elemento(4) as unknown as HTMLMediaElement, ahora: () => 1_000_000_000, monotono: () => 0 });
  const g = cosa(0, 0, 0, 6);
  for (let i = 0; i < 3; i++) { m.actualizar(g, { x: 0, y: 0, z: 0 }, OPC()); await esperar(); }
  assert.equal(b.voces.estado().reales, 1, "dentro de la burbuja suena");
  m.actualizar(g, { x: 0, y: 0, z: 20 }, OPC());
  assert.equal(b.voces.estado().reales, 0, "a 20 m de una burbuja de 6 m no suena nada");
  assert.equal(m.sonando(), false);
  m.actualizar(g, { x: 0, y: 0, z: 1 }, OPC());
  await esperar();
  assert.equal(b.voces.estado().reales, 1, "al volver, vuelve a sonar");
  assert.ok(m.sonando());
  m.soltar();
  assert.equal(b.voces.estado().reales, 0, "soltar la cosa suelta la voz: Web Audio no tiene `dispose()`");
});

test("S4: `reach: todos` no atenúa por distancia y el volumen 0 calla la cosa", async () => {
  const b = banco();
  const m = cargarSonido("todos.mp3", () => false, { medio: () => elemento(4) as unknown as HTMLMediaElement, ahora: () => 1_000_000_000, monotono: () => 0 });
  const g = cosa(0, 0, 0, 3);
  for (let i = 0; i < 3; i++) { m.actualizar(g, { x: 0, y: 0, z: 500 }, OPC({ reach: "todos" })); await esperar(); }
  assert.equal(b.voces.estado().reales, 1, "a 500 m, con alcance «todos», se sigue oyendo");
  assert.equal(cadena(b)!.panner.rolloffFactor, 0, "y la distancia no le quita ni un decibelio");
  // el volumen del mundo a 0 sí la calla (es el `gain` del emisor)
  m.actualizar(g, { x: 0, y: 0, z: 500 }, OPC({ reach: "todos", volume: 0 }));
  assert.equal(b.voces.estado().reales, 0);
  m.soltar();
});

test("S4: un bucle LARGO es una cama: streaming por `MediaElementAudioSourceNode` al bus ambiente, no 39 MB de PCM", async () => {
  const b = banco();
  const el = elemento(600);                   // diez minutos de ambiente
  const m = cargarSonido("cama.ogg", () => false, { medio: () => el as unknown as HTMLMediaElement, ahora: () => 1_000_003_400, monotono: () => 0 });
  for (let i = 0; i < 3; i++) { m.actualizar(cosa(0, 0, 0, 12), { x: 0, y: 0, z: 0 }, OPC()); await esperar(); }

  const fuente = b.nodos.find((n) => n.tipo === "medio");
  assert.ok(fuente, "una cama tiene que entrar por MediaElementAudioSourceNode");
  assert.equal(fuente!.elemento, el, "y por el MISMO elemento con el que se midió la duración: no se descarga dos veces");
  assert.equal(cadena(b)!.bus, busNodo(b, "ambiente"), "una cama es el ambiente del sitio");
  assert.equal(b.nodos.filter((n) => n.tipo === "fuente").length, 0, "ni un AudioBufferSourceNode: nada se descodifica");
  assert.equal(b.voces.estado().memoria, 0, "y la caché de buffers sigue vacía");
  assert.equal(el.paused, false, "y está sonando");
  assert.equal(Number(el.currentTime.toFixed(6)), Number(instanteDePared(600, 1_000_003_400).toFixed(6)), "entrando por el segundo del reloj de pared, no por el principio");
  assert.equal(Number(el.currentTime.toFixed(3)), 403.4);
  assert.ok(CAMA_S > 0 && CAMA_S < 600);
  m.soltar();
});

test("S4: la cama se vuelve a pegar al reloj compartido cada diez segundos, con el umbral de siempre", async () => {
  const b = banco();
  const el = elemento(100);
  let reloj = 1_000_000_000, mono = 0;
  const m = cargarSonido("cama.ogg", () => false, { medio: () => el as unknown as HTMLMediaElement, ahora: () => reloj, monotono: () => mono });
  for (let i = 0; i < 3; i++) { m.actualizar(cosa(0, 0, 0, 12), { x: 0, y: 0, z: 0 }, OPC()); await esperar(); }
  assert.equal(el.currentTime, 0);
  // un desvío pequeño no se toca ni al pasar los diez segundos
  el.currentTime = 0.3; mono = 11_000; reloj = 1_000_000_000;
  m.actualizar(cosa(0, 0, 0, 12), { x: 0, y: 0, z: 0 }, OPC());
  assert.equal(el.currentTime, 0.3, "0,3 s de desvío está por debajo del umbral: no se salta");
  // uno grande sí, pero solo cuando toca mirar
  el.currentTime = 50; mono = 15_000;
  m.actualizar(cosa(0, 0, 0, 12), { x: 0, y: 0, z: 0 }, OPC());
  assert.equal(el.currentTime, 50, "antes de los diez segundos no se mira");
  mono = 22_000;
  m.actualizar(cosa(0, 0, 0, 12), { x: 0, y: 0, z: 0 }, OPC());
  assert.equal(el.currentTime, 0, "pasados los diez, vuelve al instante del mundo");
  assert.equal(b.voces.estado().reales, 1);
  m.soltar();
});

test("S4: sin Web Audio el mundo no se rompe: se usa el camino viejo con volumen escalar por distancia", async () => {
  ponerGrafo(null);                            // este navegador no da `AudioContext`
  const sonando: { volume: number; paused: boolean }[] = [];
  const viejo = globalThis.Audio;
  (globalThis as { Audio?: unknown }).Audio = class { 
    src = ""; crossOrigin = ""; loop = false; preload = ""; volume = 1; paused = true; currentTime = 0; duration = 4; error = null;
    constructor() { sonando.push(this as never); }
    addEventListener() {} removeAttribute() {} load() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  try {
    const m = cargarSonido("s.mp3", () => false, { ahora: () => 1_000_000_000, monotono: () => 0 });
    await esperar(); await esperar();
    const g = cosa(0, 0, 0, 10);
    m.actualizar(g, { x: 0, y: 0, z: 0 }, OPC({ volume: 1 }));
    assert.equal(sonando.length, 1, "un HTMLAudioElement, como siempre");
    assert.equal(sonando[0].paused, false);
    assert.equal(sonando[0].volume, 1, "dentro de la meseta del 80 %, volumen entero");
    m.actualizar(g, { x: 0, y: 0, z: 9 }, OPC({ volume: 1 }));
    assert.equal(sonando[0].volume, volumenEn(9, 10, { volume: 1, reach: "burbuja" }), "y la caída lineal del borde sigue ahí");
    m.actualizar(g, { x: 0, y: 0, z: 30 }, OPC({ volume: 1 }));
    assert.equal(sonando[0].paused, true, "fuera del radio se para, igual que antes");
    assert.ok(m.sonando() === false);
    m.soltar();
  } finally { (globalThis as { Audio?: unknown }).Audio = viejo; }
});

test("salir de VR: un oyente sin posición finita (NaN) no le pone a `volume` un valor no finito (TypeError del navegador)", async () => {
  // el navegador lanza «The provided double value is non-finite» si se le da NaN a `HTMLMediaElement.volume`
  assert.equal(volumenEn(NaN, 8, { volume: 1, reach: "burbuja" }), 0, "sin saber dónde estás, dentro de la burbuja no suena");
  assert.equal(volumenEn(2, 8, { volume: NaN, reach: "burbuja" }), 0, "un volumen del mundo roto tampoco");
  assert.equal(volumenEn(NaN, 8, { volume: 0.5, reach: "todos" }), 0.5, "para todos no depende de la distancia");
  ponerGrafo(null);
  const sonando: { paused: boolean; _v: number }[] = [];
  const viejo = globalThis.Audio;
  (globalThis as { Audio?: unknown }).Audio = class {
    src = ""; crossOrigin = ""; loop = false; preload = ""; paused = true; currentTime = 0; duration = 4; error = null; _v = 1;
    get volume() { return this._v; }
    set volume(x: number) { if (!Number.isFinite(x)) throw new TypeError("Failed to set the 'volume' property on 'HTMLMediaElement': The provided double value is non-finite."); this._v = x; }
    constructor() { sonando.push(this as never); }
    addEventListener() {} removeAttribute() {} load() {}
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  try {
    const m = cargarSonido("s.mp3", () => false, { ahora: () => 1_000_000_000, monotono: () => 0 });
    await esperar(); await esperar();
    const g = cosa(0, 0, 0, 10);
    m.actualizar(g, { x: 0, y: 0, z: 0 }, OPC({ volume: 1 }));
    assert.doesNotThrow(() => m.actualizar(g, { x: NaN, y: NaN, z: NaN }, OPC({ volume: 1 })), "el oyente sin posición no rompe el cuadro");
    assert.doesNotThrow(() => m.actualizar(g, { x: 0, y: 0, z: 0 }, OPC({ volume: NaN })));
    assert.ok(Number.isFinite(sonando[0]._v));
    m.soltar();
  } finally { (globalThis as { Audio?: unknown }).Audio = viejo; }
});

// ——— el vídeo en el mezclador ——————————————————————————————————————————————————————————————

/** El `<video>` necesita un `document`: se le da uno de mentira solo mientras dure la prueba. El elemento avisa de
 *  su duración en el siguiente tic, como haría un navegador de verdad. */
function docFalso() {
  const creados: ReturnType<typeof elemento>[] = [];
  const antes = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement() {
      const el = elemento(300);
      setTimeout(() => el.disparar("loadedmetadata"), 0);
      creados.push(el);
      return el;
    },
    head: { appendChild() {} }, addEventListener() {}, hidden: false,
  };
  return { creados, quitar: () => { (globalThis as { document?: unknown }).document = antes; } };
}

test("S4: el audio del vídeo entra en el mezclador, se duckea con la voz y mi volumen es MÍO", async () => {
  const b = banco();
  const doc = docFalso();
  try {
    const m = await cargarVideo("p.mp4", () => false, { trasGesto: (fn) => fn() });
    const el = doc.creados[0];
    const g = cosa(5, 2, 0, 1);
    m.actualizar(g, { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10 }));
    await esperar(); await esperar();
    m.actualizar(g, { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10 }));

    const fuente = b.nodos.find((n) => n.tipo === "medio");
    assert.ok(fuente, "el vídeo tiene que entrar por MediaElementAudioSourceNode");
    assert.equal(fuente!.elemento, el);
    const c = cadena(b)!;
    assert.equal(c.bus, busNodo(b, "musica"), "el vídeo va al bus «musica»: así se duckea y lo mueve el deslizador");
    assert.equal(c.panner.maxDistance, 10, "y se espacializa con la burbuja del vídeo");
    assert.equal(el.muted, false, "una vez en el grafo el elemento no va mudo: el volumen lo hace la ganancia");

    const ganancia = b.nodos.find((n) => n.tipo === "gain" && (n.sale as Nodo[]).includes(c.panner))!;
    assert.equal((ganancia.gain as Param).value, 1);

    // mi volumen y mi silencio: sobre la ganancia del grafo, nunca sobre el reloj compartido ni el servidor
    m.controlVideo!.fijarVolumen(0.25);
    m.actualizar(g, { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10 }));
    assert.equal((ganancia.gain as Param).value, 0.25);
    assert.equal(m.controlVideo!.silenciado(), false);
    m.controlVideo!.alternarSilencio();
    assert.equal(m.controlVideo!.silenciado(), true);
    m.actualizar(g, { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10 }));
    assert.equal((ganancia.gain as Param).value, 0, "silenciar es MÍO y calla el vídeo de verdad");
    assert.equal(el.paused, false, "pero el vídeo sigue en el reloj compartido: los demás lo siguen oyendo");
    m.controlVideo!.alternarSilencio();

    // ducking: alguien habla y la música (y con ella el vídeo) baja 9 dB sin que el vídeo haga nada
    const busMusica = busNodo(b, "musica");
    const antesDuck = (busMusica.gain as Param).value;
    b.nucleo.duck(true);
    assert.ok((busMusica.gain as Param).value < antesDuck, "el vídeo se duckea porque cuelga del bus, no porque lo sepa");
    assert.equal(Number((busMusica.gain as Param).value.toFixed(4)), Number((10 ** (-9 / 20)).toFixed(4)));
    b.nucleo.duck(false);
    assert.equal((busMusica.gain as Param).value, antesDuck);

    // el deslizador de «Sonido» llega al vídeo por el mismo camino
    b.nucleo.aplicarAjustes((id) => (id === "sonido.musica" ? 10 : undefined));
    const vca = b.nodos.find((n) => n.tipo === "gain" && (n.sale as Nodo[]).includes(busNodo(b, "master")) && n !== busMusica);
    assert.ok(vca, "cada bus tiene su VCA");
    m.soltar();
  } finally { doc.quitar(); }
});

test("S4: el vídeo lejos de su burbuja se para (móvil frío) y pausar sigue siendo solo para mí", async () => {
  banco();
  const doc = docFalso();
  try {
    const m = await cargarVideo("p.mp4", () => false, { trasGesto: (fn) => fn() });
    const el = doc.creados[0];
    const g = cosa(0, 0, 0, 1);
    m.actualizar(g, { x: 0, y: 0, z: 0 }, OPC({ radius: 8 }));
    await esperar();
    assert.equal(el.paused, false);
    m.actualizar(g, { x: 0, y: 0, z: 100 }, OPC({ radius: 8 }));
    assert.equal(el.paused, true, "a 100 m de una burbuja de 8 m (tope 40 + radio) el vídeo no se descodifica");
    m.actualizar(g, { x: 0, y: 0, z: 0 }, OPC({ radius: 8 }));
    assert.equal(el.paused, false);
    m.controlVideo!.alternarPausa();
    assert.equal(m.controlVideo!.pausado(), true);
    assert.equal(el.paused, true, "pausar es solo para mí: el reloj de pared sigue corriendo para todos");
    m.soltar();
  } finally { doc.quitar(); }
});

test("S4: el oyente lo pone `audio/oyente.ts`; sin oyente (nadie situado) un sonido de burbuja no suena", async () => {
  const b = banco();
  const m = cargarSonido("s.mp3", () => false, { medio: () => elemento(3) as unknown as HTMLMediaElement, ahora: () => 1_000_000_000, monotono: () => 0 });
  for (let i = 0; i < 3; i++) { m.actualizar(cosa(0, 0, 0, 5), null, OPC()); await esperar(); }
  assert.equal(b.voces.estado().reales, 0, "sin saber de dónde oyes, una burbuja no puede saber si estás dentro");
  for (let i = 0; i < 3; i++) { m.actualizar(cosa(0, 0, 0, 5), { x: 0, y: 1.6, z: 0 }, OPC()); await esperar(); }
  assert.equal(b.voces.estado().reales, 1);
  m.soltar();
  // y el pool escribe el oyente en el `AudioListener` del único contexto, con orientación (eso es lo que faltaba)
  assert.ok(b.ctx.listener, "el oyente del motor es el del único AudioContext");
});
// ——— H5: el grupo del sonido; M18: el reloj del servidor ———————————————————————————————————

test("H5: el grupo de una cosa (música, efectos, ambiente) manda sobre el bus por defecto, y su deslizador la baja", async () => {
  const b = banco();
  // un sonido corto sería «efectos»; la cosa dice «musica» y va al bus música
  const m = cargarSonido("corto.ogg", () => false, { medio: () => elemento(2) as unknown as HTMLMediaElement, ahora: () => 1_000_000_000, monotono: () => 0 });
  await esperar(); await esperar();
  m.actualizar(cosa(0, 0, 0, 12), { x: 0, y: 0, z: 0 }, OPC({ bus: "musica" })); await esperar();
  assert.equal(cadena(b)!.bus, busNodo(b, "musica"), "grupo música: cuelga del bus música aunque sea corto");
  m.soltar();
  // lo mismo con un vídeo que dice «efectos» (por defecto sería música)
  const doc = docFalso();
  try {
    const v = await cargarVideo("p.mp4", () => false, { trasGesto: (fn) => fn() });
    const g = cosa(5, 2, 0, 1);
    v.actualizar(g, { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10, bus: "efectos" })); await esperar(); await esperar();
    v.actualizar(g, { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10, bus: "efectos" }));
    assert.equal(cadena(b)!.bus, busNodo(b, "efectos"), "un vídeo del grupo efectos va al bus efectos");
    v.soltar();
  } finally { doc.quitar(); }
  // el deslizador de música baja el bus música (y solo ese)
  const musica = busNodo(b, "musica"), efectos = busNodo(b, "efectos");
  b.nucleo.aplicarAjustes((id) => ({ "sonido.musica": 20, "sonido.efectos": 90 } as Record<string, number>)[id]);
  const vcaDe = (bus: Nodo) => b.nodos.find((n) => n.tipo === "gain" && (bus.sale as Nodo[]).includes(n))!;
  assert.ok(vcaDe(musica) && vcaDe(efectos));
  const e = b.nucleo.estado().volumen;
  assert.equal(e.musica, 0.2, "el grupo música sigue a su volumen");
  assert.equal(e.efectos, 0.9, "y el de efectos al suyo");
});

test("M18: dos páginas con la hora del ordenador distinta ven el mismo segundo con el reloj del servidor; sin él, no", async () => {
  banco();
  const doc = docFalso();
  const dateNow = Date.now;
  try {
    const servidor = 5_000_000;                      // ms de reloj del servidor (los mismos para todos)
    // dos «ordenadores»: sus relojes de pared difieren en 7 s
    const abrir = async (pared: number, relojServ: (() => number | null) | null) => {
      Date.now = () => pared; fijarRelojMundo(relojServ);
      const v = await cargarVideo("p.mp4", () => false, { trasGesto: (fn) => fn() });
      const el = doc.creados.at(-1)!;
      v.actualizar(cosa(5, 2, 0, 1), { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10 })); await esperar();
      v.actualizar(cosa(5, 2, 0, 1), { x: 0, y: 1.6, z: 0 }, OPC({ radius: 10 }));
      return { v, el };
    };
    // SIN reloj del servidor: cada una va por su Date.now y se separan los 7 s
    const a0 = await abrir(1_000_000_000, null), b0 = await abrir(1_000_007_000, null);
    assert.equal(Math.round(Math.abs(a0.el.currentTime - b0.el.currentTime)), 7, "con el reloj de cada ordenador, 7 s de diferencia");
    a0.v.soltar(); b0.v.soltar();
    // CON el del servidor: el mismo segundo, da igual lo que diga cada ordenador
    const A = await abrir(1_000_000_000, () => servidor), B = await abrir(1_000_007_000, () => servidor);
    const debe = instanteDePared(300, servidor);
    assert.ok(Math.abs(A.el.currentTime - debe) < 1e-6 && Math.abs(B.el.currentTime - debe) < 1e-6, "las dos en el segundo del servidor");
    assert.ok(Math.abs(A.el.currentTime - B.el.currentTime) < 0.5, "a menos de 0,5 s una de otra");
    // pasan 60 s del servidor: las dos siguen (el elemento avanza solo; aquí avanzamos lo que avanzaría)
    const t60 = servidor + 60_000;
    A.el.currentTime += 60; B.el.currentTime += 60.08;                      // B se ha ido 80 ms (jitter de decodificación)
    Date.now = () => 1_000_000_000 + 60_000; fijarRelojMundo(() => t60);
    const medidos = desfasesDeVideos(t60);
    assert.equal(medidos.length, 2);
    assert.ok(Math.max(...medidos) < 0.5, `desfase medido tras 60 s: ${Math.max(...medidos).toFixed(3)} s`);
    assert.ok(Math.abs(A.el.currentTime - B.el.currentTime) < 0.5);
    // la TERCERA entra tarde (a los 60 s) y se alinea: arranca en el segundo del servidor, no en el principio
    const C = await abrir(1_000_999_000, () => t60);
    assert.ok(Math.abs(C.el.currentTime - instanteDePared(300, t60)) < 1e-6, "quien entra tarde ve el mismo segundo");
    assert.ok(Math.abs(C.el.currentTime - A.el.currentTime) < 0.5, "y queda a menos de 0,5 s de las otras");
    assert.equal(desfasesDeVideos(t60).length, 3);
    assert.ok(VIDEO_SINCRO_S <= 0.25, "cada vídeo salta si se desvía más de 0,25 s: dos juntas no pasan de 0,5 s");
    A.v.soltar(); B.v.soltar(); C.v.soltar();
    assert.equal(desfasesDeVideos(t60).length, 0, "un vídeo soltado deja de contar");
  } finally { Date.now = dateNow; fijarRelojMundo(null); doc.quitar(); }
});

test("M18: el reloj del mundo cae a Date.now si la fuente no tiene hora (antes del primer snapshot) y vuelve al instante", () => {
  const dateNow = Date.now;
  try {
    Date.now = () => 123_456;
    fijarRelojMundo(() => null); assert.equal(ahoraMundo(), 123_456, "sin hora del servidor, la del ordenador");
    fijarRelojMundo(() => 9_000); assert.equal(ahoraMundo(), 9_000, "con ella, la suya");
    fijarRelojMundo(() => Number.NaN); assert.equal(ahoraMundo(), 123_456, "una hora rota no se usa");
    fijarRelojMundo(null); assert.equal(ahoraMundo(), 123_456);
  } finally { Date.now = dateNow; fijarRelojMundo(null); }
});
