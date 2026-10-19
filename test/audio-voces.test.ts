// S3 · el pool de voces espacializadas: el tope del aparato, la virtualización (apartar, no matar), el HRTF racionado,
// las variantes con la semilla del servidor, el cooldown, la trampa de `refDistance = 0` y la limpieza de nodos.
// Todo con un `AudioContext` de mentira (igual que test/audio-nucleo.test.ts): en Node no hay Web Audio, y lo que
// importa aquí es la FORMA del grafo, QUIÉN suena y CON QUÉ panner, no el sonido.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearNucleo } from "../packages/render/src/audio/nucleo.ts";
import {
  crearVoces, VOCES_MAX, HRTF_MAX, DISTANCIA, CONO_OMNI, FACTOR_DISTANCIA, PRIORIDAD_DEF, COOLDOWN_DEF_MS,
  AIRE_HZ, SIN_ROBO, azarDe, elegirVariante, efectivaDe, huella,
} from "../packages/render/src/audio/voces.ts";

type Param = { value: number; objetivos: [number, number][]; setTargetAtTime(v: number, t: number, tau: number): void; setValueAtTime(v: number, t: number): void };
const param = (v = 1): Param => ({
  value: v, objetivos: [],
  setTargetAtTime(x, _t, tau) { this.value = x; this.objetivos.push([x, tau]); },
  setValueAtTime(x) { this.value = x; },
});

type Nodo = { tipo: string; sueltas: number; connect(d: unknown): unknown; disconnect(): void } & Record<string, unknown>;
type Arranque = { nodo: Nodo; cuando: number; desde: number };

/** Un `AudioContext` de mentira que apunta cada nodo, cada conexión, cada arranque y cada desconexión. */
function falso(opciones: { oyenteViejo?: boolean } = {}) {
  const conexiones: [unknown, unknown][] = [];
  const nodos: Nodo[] = [];
  const arranques: Arranque[] = [];
  const decodificados: ArrayBuffer[] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}): Nodo => {
    const n = { tipo, sueltas: 0, connect(d: unknown) { conexiones.push([n, d]); return d; }, disconnect() { n.sueltas++; }, ...extra } as Nodo;
    nodos.push(n);
    return n;
  };
  const oyente = opciones.oyenteViejo
    ? { puesto: [] as number[][], setPosition(x: number, y: number, z: number) { this.puesto.push([x, y, z]); }, setOrientation(...v: number[]) { this.puesto.push(v); } }
    : Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map((k) => [k, param(0)]));
  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    destination: { tipo: "destino" },
    listener: oyente,
    createGain: () => nodo("gain", { gain: param(1) }),
    createBiquadFilter: () => nodo("filtro", { type: "", frequency: param(350), Q: param(1) }),
    createPanner: () => nodo("panner", {
      panningModel: "equalpower", distanceModel: "inverse", refDistance: 1, maxDistance: 10000, rolloffFactor: 1,
      coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 0,
      positionX: param(0), positionY: param(0), positionZ: param(0),
    }),
    createBufferSource: () => {
      const n = nodo("fuente", {
        buffer: null, loop: false, playbackRate: param(1), onended: null, parado: 0,
        start(cuando = 0, desde = 0) { arranques.push({ nodo: n, cuando, desde }); },
        stop() { (n as unknown as { parado: number }).parado++; },
      });
      return n;
    },
    createMediaElementSource: (m: unknown) => nodo("medio", { medio: m }),
    createDynamicsCompressor: () => nodo("limitador", { threshold: param(0), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    decodeAudioData: async (datos: ArrayBuffer) => { decodificados.push(datos); return buf(1, `decodificado-${decodificados.length}`); },
    suspend() { ctx.state = "suspended"; return Promise.resolve(); },
    resume() { ctx.state = "running"; return Promise.resolve(); },
    addEventListener() {},
  };
  return { ctx, conexiones, nodos, arranques, decodificados, crear: () => ctx as unknown as AudioContext };
}

/** Un `AudioBuffer` de mentira con identidad, para saber qué variante salió. */
const buf = (duracion = 10, nombre = "x") => ({ duration: duracion, length: Math.round(duracion * 48000), numberOfChannels: 1, sampleRate: 48000, nombre }) as unknown as AudioBuffer;

function banco(opciones: { nivel?: "A" | "B" | "C" | "D"; traer?: (uri: string) => Promise<ArrayBuffer | null>; oyenteViejo?: boolean } = {}) {
  const f = falso({ oyenteViejo: opciones.oyenteViejo });
  const nucleo = crearNucleo({ crear: f.crear, hayGesto: () => true, trasGesto: (fn) => fn(), enCadaGesto: () => {}, visibilidad: () => false });
  const medios: { uri: string; tocado: number; parado: number }[] = [];
  const v = crearVoces({
    nucleo, nivel: opciones.nivel ?? "A",
    traer: opciones.traer ?? (async () => new ArrayBuffer(8)),
    medio: (uri: string) => {
      const m = { uri, tocado: 0, parado: 0, loop: false, src: uri, play() { m.tocado++; return Promise.resolve(); }, pause() { m.parado++; } };
      medios.push(m as never);
      return m as unknown as HTMLMediaElement;
    },
    azar: () => 0.5,
  });
  return { ...f, nucleo, v, medios, avanzar: (s: number) => { f.ctx.currentTime += s; } };
}

const fuentesDe = (b: ReturnType<typeof banco>) => b.nodos.filter((n) => n.tipo === "fuente");

test("la cadena de una voz es fuente → gain → lowpass → panner → bus, con los defectos del emisor", () => {
  const b = banco();
  b.v.oyente({ x: 0, y: 0, z: 0 });
  const voz = b.v.reproducir({ id: "golpe", buffer: buf(), posicion: { x: 3, y: 0, z: 0 } });
  assert.ok(voz && voz.real(), "debería estar sonando de verdad");
  const fuente = fuentesDe(b)[0], gain = b.nodos.find((n) => n.tipo === "gain" && b.conexiones.some(([de, a]) => de === fuente && a === n))!;
  const filtro = b.nodos.find((n) => n.tipo === "filtro")!, panner = b.nodos.find((n) => n.tipo === "panner")!;
  assert.ok(b.conexiones.some(([de, a]) => de === fuente && a === gain), "la fuente entra en su propio gain");
  assert.ok(b.conexiones.some(([de, a]) => de === gain && a === filtro), "el gain entra en el lowpass (aire y oclusión, S11)");
  assert.ok(b.conexiones.some(([de, a]) => de === filtro && a === panner), "el lowpass entra en el panner");
  assert.ok(b.conexiones.some(([de, a]) => de === panner && a === b.nucleo.bus("efectos")), "el panner entra en el bus del núcleo");
  assert.equal(filtro.type, "lowpass");
  assert.equal((filtro.frequency as Param).value, AIRE_HZ, "nace transparente: el aire solo tiene que bajarlo");
  assert.equal(panner.distanceModel, DISTANCIA.distanceModel);
  assert.equal(panner.refDistance, 1); assert.equal(panner.maxDistance, 40); assert.equal(panner.rolloffFactor, 3);
  assert.equal((panner.positionX as Param).value, 3, "la voz está donde está la cosa");
  // el cono por defecto es omnidireccional, y del mundo llega en RADIANES: el panner los quiere en grados
  assert.equal(panner.coneInnerAngle, 360); assert.equal(panner.coneOuterAngle, 360);
  const b2 = banco();
  b2.v.reproducir({ id: "altavoz", buffer: buf(), posicion: { x: 0, y: 0, z: 0 }, cono: { interior: Math.PI / 2, exterior: Math.PI, gananciaExterior: 0.1 } });
  const p2 = b2.nodos.find((n) => n.tipo === "panner")!;
  assert.equal(Math.round(p2.coneInnerAngle as number), 90); assert.equal(Math.round(p2.coneOuterAngle as number), 180);
  assert.equal(p2.coneOuterGain, 0.1);
  assert.deepEqual([CONO_OMNI.interior, CONO_OMNI.exterior], [2 * Math.PI, 2 * Math.PI], "el omni del diseño va en radianes");
});

test("el tope de voces del aparato se respeta: lo que no cabe espera, no suena de más", () => {
  const b = banco({ nivel: "D" });
  b.v.oyente({ x: 0, y: 0, z: 0 });
  assert.equal(b.v.estado().tope, VOCES_MAX.D);
  for (let i = 0; i < 7; i++) b.v.reproducir({ id: `pisada-${i}`, buffer: buf(), posicion: { x: 0, y: 0, z: 0 }, cooldown: 0 });
  const e = b.v.estado();
  assert.equal(e.reales, 4, "en D suenan cuatro, ni una más (limits.json audio_sources)");
  assert.equal(e.virtuales, 3, "las otras tres están apartadas, no muertas");
  b.v.nivel("A");
  assert.equal(b.v.estado().reales, 7, "al subir el nivel entran todas sin volver a dispararlas");
});

test("la de menor prioridad efectiva se virtualiza, y vuelve por donde iba cuando hay hueco", () => {
  const b = banco({ nivel: "D" });
  b.v.oyente({ x: 0, y: 0, z: 0 });
  // tres cerca y con prioridad normal; una lejísimos: la distancia le resta prioridad (Priority Distance Factor)
  const cerca = [0, 1, 2].map((i) => b.v.reproducir({ id: `cerca-${i}`, buffer: buf(), posicion: { x: 1, y: 0, z: 0 } })!);
  const lejos = b.v.reproducir({ id: "lejos", buffer: buf(), posicion: { x: 40, y: 0, z: 0 } })!;
  assert.ok(lejos.real() && cerca.every((v) => v.real()), "con cuatro justas, las cuatro suenan");
  assert.ok(lejos.efectiva() < cerca[0].efectiva(), "la lejana vale menos: 50 − 10·(40/40)");
  assert.equal(Math.round(lejos.efectiva()), PRIORIDAD_DEF - FACTOR_DISTANCIA);

  b.avanzar(0.5);
  const quinta = b.v.reproducir({ id: "importante", buffer: buf(), posicion: { x: 1, y: 0, z: 0 }, prioridad: 90 })!;
  assert.ok(quinta.real(), "la importante entra");
  assert.equal(lejos.real(), false, "la de menor prioridad efectiva es la que se aparta");
  assert.equal(b.v.estado().reales, 4);
  const paradas = fuentesDe(b).filter((n) => (n.parado as number) > 0);
  assert.equal(paradas.length, 1, "se paró UNA fuente: la apartada (no se mató ninguna otra)");

  b.avanzar(1);
  quinta.parar();
  assert.equal(lejos.real(), true, "al quedar hueco, la apartada vuelve sola");
  const vuelta = b.arranques[b.arranques.length - 1];
  assert.ok(Math.abs(vuelta.desde - 0.5) < 1e-6, `vuelve desde donde se quedó (0,5 s), no desde el principio: ${vuelta.desde}`);
});

test("la música y el ambiente no se roban nunca: volver «desde el tiempo transcurrido» no es sample-accurate", () => {
  const b = banco({ nivel: "D" });
  b.v.oyente({ x: 0, y: 0, z: 0 });
  assert.deepEqual([...SIN_ROBO], ["musica", "ambiente"]);
  const musica = b.v.reproducir({ id: "tema", buffer: buf(60), bus: "musica", loop: true })!;
  const ambiente = b.v.reproducir({ id: "lluvia", buffer: buf(30), bus: "ambiente", loop: true })!;
  for (let i = 0; i < 6; i++) b.v.reproducir({ id: `grito-${i}`, buffer: buf(), posicion: { x: 0, y: 0, z: 0 }, prioridad: 100, cooldown: 0 });
  assert.ok(musica.real() && ambiente.real(), "ni con seis efectos de prioridad 100 se calla la música");
  assert.equal(b.v.estado().reales, 4, "el tope sigue siendo el tope: los efectos se reparten los dos sitios que quedan");
});

test("la misma semilla elige la misma variante (y el mismo tono) en dos clientes distintos", () => {
  const variantes = [{ buffer: buf(10, "a"), peso: 1 }, { buffer: buf(10, "b"), peso: 1 }, { buffer: buf(10, "c"), peso: 2 }];
  const salidas = new Set<string>();
  for (const semilla of [1, 2, 3, 7, 11, 42, 99, 12345, 999983]) {
    const pide = (b: ReturnType<typeof banco>) => {
      b.v.reproducir({ id: "pez", variantes, semilla, posicion: { x: 0, y: 0, z: 0 }, variacion: { tono: 0.1, volumen: 0.2 }, cooldown: 0 });
      const f = fuentesDe(b)[0];
      return { nombre: (f.buffer as unknown as { nombre: string }).nombre, tono: (f.playbackRate as Param).value };
    };
    const uno = pide(banco()), otro = pide(banco());
    assert.deepEqual(uno, otro, `con semilla ${semilla} los dos clientes tienen que oír lo mismo`);
    salidas.add(uno.nombre);
  }
  assert.ok(salidas.size >= 2, `la elección tiene que variar con la semilla, salieron ${[...salidas]}`);
  // y sin semilla del servidor no es determinista a propósito (sonido local): la puerta es la semilla
  assert.equal(azarDe(5, "pez")(), azarDe(5, "pez")(), "el generador es puro");
  assert.notEqual(azarDe(5, "pez")(), azarDe(5, "rana")(), "el nombre del sonido entra en la semilla");
  assert.equal(elegirVariante([{ peso: 1 }, { peso: 3 }], 0.9), 1, "los pesos pesan");
  assert.equal(elegirVariante([{ peso: 1 }, { peso: 3 }], 0), 0);
  assert.equal(huella("pez"), huella("pez"));
});

test("sin semilla (lo local, mis pasos) nunca suena la misma grabación dos veces seguidas", () => {
  const b = banco();
  const variantes = [{ buffer: buf(1, "a") }, { buffer: buf(1, "b") }, { buffer: buf(1, "c") }];
  const oidas: string[] = [];
  for (let i = 0; i < 60; i++) {
    const antes = fuentesDe(b).length;
    b.v.reproducir({ id: "pasos", variantes, cooldown: 0 });
    const f = fuentesDe(b);
    if (f.length > antes) oidas.push((f.at(-1)!.buffer as unknown as { nombre: string }).nombre); // solo las que sonaron de verdad
  }
  assert.ok(oidas.length >= 20, `${oidas.length} sonaron`);
  oidas.forEach((n, i) => { if (i) assert.notEqual(n, oidas[i - 1], `«${n}» dos veces seguidas en ${i}`); });
  assert.ok(new Set(oidas).size >= 2, "y no se queda en una"); // el banco de pruebas fija el azar: en la página salen las tres
});

test("el cooldown por id descarta las repeticiones: veinte disparos juntos no revientan la mezcla", () => {
  const b = banco();
  b.v.oyente({ x: 0, y: 0, z: 0 });
  const primera = b.v.reproducir({ id: "dardo", buffer: buf(), posicion: { x: 0, y: 0, z: 0 } });
  assert.ok(primera, "la primera suena");
  const repes = [];
  for (let i = 0; i < 19; i++) repes.push(b.v.reproducir({ id: "dardo", buffer: buf(), posicion: { x: 0, y: 0, z: 0 } }));
  assert.ok(repes.every((x) => x === null), "las otras diecinueve se descartan en el acto");
  assert.equal(b.v.estado().descartadas, 19);
  assert.equal(b.v.estado().reales, 1);
  b.avanzar(COOLDOWN_DEF_MS / 1000 + 0.001);
  assert.ok(b.v.reproducir({ id: "dardo", buffer: buf(), posicion: { x: 0, y: 0, z: 0 } }), "pasado el cooldown vuelve a sonar");
  // `cooldown: 0` lo desactiva (una ráfaga que SÍ se quiere oír entera), y cada sonido tiene el suyo
  const c = banco();
  for (let i = 0; i < 5; i++) c.v.reproducir({ id: "lluvia-gota", buffer: buf(), posicion: { x: 0, y: 0, z: 0 }, cooldown: 0 });
  assert.equal(c.v.estado().reales, 5);
});

test("refDistance 0 se corrige y se avisa: con `inverse` la ganancia sería 0 para siempre (trampa del spec)", () => {
  const b = banco();
  const voz = b.v.reproducir({ id: "fuente", buffer: buf(), posicion: { x: 1, y: 0, z: 0 }, distancia: { refDistance: 0 } });
  assert.ok(voz);
  const panner = b.nodos.find((n) => n.tipo === "panner")!;
  assert.equal(panner.refDistance, DISTANCIA.refDistance, "se pone en 1, que es el defecto del spec");
  const avisos = b.v.estado().avisos;
  assert.ok(avisos.some((a) => a.includes("refDistance")), `tenía que avisar, y dijo: ${avisos.join(" · ")}`);
  // negativo y NaN, igual; y `maxDistance` nunca por debajo de `refDistance`
  const c = banco();
  c.v.reproducir({ id: "mala", buffer: buf(), posicion: { x: 0, y: 0, z: 0 }, distancia: { refDistance: -3, maxDistance: 0.5 } });
  const p2 = c.nodos.find((n) => n.tipo === "panner")!;
  assert.equal(p2.refDistance, 1); assert.equal(p2.maxDistance, 1);
  assert.equal(c.v.estado().avisos.length >= 1, true);
});

test("el HRTF se raciona: solo las N más cercanas lo llevan, y el cambio no da clic", () => {
  const b = banco({ nivel: "A" });
  b.v.oyente({ x: 0, y: 0, z: 0 });
  const total = HRTF_MAX.A + 2;
  const vs = [];
  for (let i = 0; i < total; i++) vs.push({ d: i + 1, voz: b.v.reproducir({ id: `v-${i}`, buffer: buf(), posicion: { x: i + 1, y: 0, z: 0 } })! });
  const e = b.v.estado();
  assert.equal(e.reales, total, "en A caben las 26");
  assert.equal(e.topeHrtf, HRTF_MAX.A);
  assert.equal(e.hrtf, HRTF_MAX.A, "exactamente 24 con HRTF, ni una más");
  for (const { d, voz } of vs) assert.equal(voz.panning(), d <= HRTF_MAX.A ? "HRTF" : "equalpower", `la que está a ${d} m`);

  // al alejarse la cabeza, la que entra cambia de panner bajando la ganancia 8 ms antes (sin clic)
  const lejana = vs[total - 1];
  b.v.mover(lejana.voz.id, { x: 0.5, y: 0, z: 0 });
  assert.equal(lejana.voz.panning(), "HRTF", "la que ahora es la más cercana sí lo lleva");
  assert.equal(b.v.estado().hrtf, HRTF_MAX.A, "y el total no se mueve");
  const gains = b.nodos.filter((n) => n.tipo === "gain" && (n.gain as Param).objetivos.length >= 2);
  assert.ok(gains.length >= 1, "conmutar el panner pasa por una rampa de bajada y otra de subida");
  for (const g of gains) assert.ok((g.gain as Param).objetivos.some(([v]) => v === 0), "la bajada llega a 0 antes de cambiar");
});

test("parar y pararTodo limpian los nodos de verdad: Web Audio no tiene dispose()", () => {
  const b = banco();
  b.v.oyente({ x: 0, y: 0, z: 0 });
  b.v.reproducir({ id: "campana", buffer: buf(), posicion: { x: 1, y: 0, z: 0 } });
  b.v.reproducir({ id: "campana", buffer: buf(), posicion: { x: 2, y: 0, z: 0 }, cooldown: 0 });
  b.v.reproducir({ id: "puerta", buffer: buf(), posicion: { x: 3, y: 0, z: 0 } });
  assert.equal(b.v.estado().reales, 3);
  b.v.parar("campana");
  assert.equal(b.v.estado().sonando.length, 1, "parar(id) se lleva TODAS las voces de ese id");
  assert.equal(b.v.estado().sonando[0].id, "puerta");
  const sueltos = b.nodos.filter((n) => ["gain", "filtro", "panner", "fuente"].includes(n.tipo) && n.sueltas > 0);
  assert.ok(sueltos.filter((n) => n.tipo === "panner").length === 2, "los dos panner de las campanas, desconectados");
  assert.ok(sueltos.filter((n) => n.tipo === "filtro").length === 2);
  assert.ok(fuentesDe(b).filter((n) => (n.parado as number) > 0).length === 2, "y sus fuentes paradas");
  b.v.pararTodo();
  assert.deepEqual(b.v.estado().sonando, []);
  assert.equal(b.nodos.filter((n) => n.tipo === "panner" && n.sueltas === 0).length, 0, "no queda ni un panner colgando del bus");
});

test("la caché descodifica una vez por URI, con la copia del buffer que pide `AudioLoader`", async () => {
  const datos = new ArrayBuffer(16);
  let traidas = 0;
  const b = banco({ traer: async () => { traidas++; return datos; } });
  const uno = await b.v.cargar("sonidos/pez.opus");
  const otro = await b.v.cargar("sonidos/pez.opus");
  assert.ok(uno && uno === otro, "la segunda vez sale de la caché");
  assert.equal(traidas, 1);
  assert.equal(b.decodificados.length, 1);
  assert.notEqual(b.decodificados[0], datos, "se le pasa una COPIA: decodeAudioData detacha el ArrayBuffer");
  assert.equal(b.decodificados[0].byteLength, 16);
  assert.ok(b.v.estado().memoria > 0, "la memoria descodificada se contabiliza (hay tope)");
  // un disparo por uri suena en cuanto llega el fichero, sin perderse
  const voz = b.v.reproducir({ id: "pez", uri: "sonidos/otro.opus", posicion: { x: 0, y: 0, z: 0 } })!;
  assert.equal(voz.real(), false, "mientras descarga no suena…");
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(voz.real(), true, "…y en cuanto está el buffer, entra en el reparto");
});

test("si el navegador frena la cama antes del primer clic (Firefox), arranca en el siguiente gesto", async () => {
  const f = falso();
  const nucleo = crearNucleo({ crear: f.crear, hayGesto: () => true, trasGesto: (fn) => fn(), enCadaGesto: () => {}, visibilidad: () => false });
  const gestos: (() => void)[] = [];
  let permitido = false, tocado = 0;
  const v = crearVoces({
    nucleo, nivel: "A", traer: async () => new ArrayBuffer(8), azar: () => 0.5,
    enCadaGesto: (fn) => gestos.push(fn),
    medio: (uri) => ({ uri, loop: false, src: uri, pause() {}, play() { if (!permitido) return Promise.reject(new Error("NotAllowedError")); tocado++; return Promise.resolve(); } }) as unknown as HTMLMediaElement,
  });
  v.cama({ id: "colchon", uri: "a.opus", bus: "ambiente" });
  await new Promise((r) => setImmediate(r));
  assert.equal(tocado, 0, "sin gesto, el navegador no deja");
  permitido = true;
  for (const g of gestos) g();
  assert.equal(tocado, 1, "al primer clic, suena");
  for (const g of gestos) g();
  assert.equal(tocado, 1, "y no se vuelve a pedir");
});

test("una cama larga va por MediaElementAudioSourceNode: no se descodifica a memoria", () => {
  const b = banco();
  const cama = b.v.cama({ id: "cama-bosque", uri: "sonidos/bosque.opus", bus: "ambiente" });
  assert.ok(cama && cama.real());
  assert.equal(b.decodificados.length, 0, "una cama de varios minutos no se mete en RAM como PCM");
  assert.equal(b.nodos.filter((n) => n.tipo === "medio").length, 1);
  assert.equal(b.medios[0].tocado, 1);
  b.v.parar("cama-bosque");
  assert.equal(b.medios[0].parado, 1, "y al pararla, el elemento se para de verdad");
  assert.deepEqual(b.v.estado().sonando, []);
});

test("el oyente escribe en el `AudioListener`: los nueve parámetros donde existen, y la API vieja donde no", () => {
  const b = banco();
  b.v.oyente({ x: 2, y: 1.6, z: -3 }, { x: 0, y: 0, z: -2 }, { x: 0, y: 3, z: 0 });
  const l = b.ctx.listener as unknown as Record<string, Param>;
  assert.deepEqual([l.positionX.value, l.positionY.value, l.positionZ.value], [2, 1.6, -3]);
  assert.deepEqual([l.forwardX.value, l.forwardY.value, l.forwardZ.value], [0, 0, -1], "la orientación se normaliza");
  assert.deepEqual([l.upX.value, l.upY.value, l.upZ.value], [0, 1, 0]);
  const c = banco({ oyenteViejo: true });
  c.v.oyente({ x: 5, y: 0, z: 0 });
  const viejo = c.ctx.listener as unknown as { puesto: number[][] };
  assert.deepEqual(viejo.puesto[0], [5, 0, 0], "sin positionX se usa setPosition");
  assert.deepEqual(viejo.puesto[1], [0, 0, -1, 0, 1, 0], "y setOrientation");
  // mover la cabeza cambia las distancias, y con ellas quién suena (nadie más lo tiene que recalcular)
  const d = banco({ nivel: "D" });
  d.v.oyente({ x: 0, y: 0, z: 0 });
  const aqui = [0, 1, 2, 3].map((i) => d.v.reproducir({ id: `a-${i}`, buffer: buf(), posicion: { x: 1, y: 0, z: 0 }, cooldown: 0 })!);
  const alla = d.v.reproducir({ id: "alla", buffer: buf(), posicion: { x: 39, y: 0, z: 0 } })!;
  assert.equal(alla.real(), false, "de lejos no cabe");
  d.v.oyente({ x: 39, y: 0, z: 0 });
  assert.equal(alla.real(), true, "al acercarse la cabeza, la de allá gana sitio");
  assert.equal(aqui.filter((v) => v.real()).length, 3);
});

test("los topes son los de limits.json, y la prioridad efectiva es la fórmula de Wwise", () => {
  const limites = JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")).limits as { axis: string; scope: string; key: string; value: unknown; state: string }[];
  const fila = (scope: string, key: string) => limites.find((l) => l.axis === "device" && l.scope === scope && l.key === key);
  for (const n of ["A", "B", "C", "D"] as const) {
    assert.equal(fila(n, "audio_sources")?.value, VOCES_MAX[n], `limits.json audio_sources ${n}`);
    const h = fila(n, "audio_hrtf_max");
    assert.equal(h?.value, HRTF_MAX[n], `limits.json audio_hrtf_max ${n}`);
    assert.equal(h?.state, "estimated", "nadie publica el coste de un panner HRTF: hasta medirlo en S12, estimado");
  }
  assert.equal(efectivaDe(50, 0, 40), 50, "pegado a ti, la prioridad entera");
  assert.equal(efectivaDe(50, 40, 40), 40, "a maxDistance, diez menos");
  assert.equal(efectivaDe(50, 100, 40), 40, "más lejos no resta más");
  assert.equal(efectivaDe(50, 20, 40), 45);
});

test("un navegador sin Web Audio no rompe nada: el pool entero se queda mudo y quieto", () => {
  const nucleo = crearNucleo({ crear: () => { throw new Error("no AudioContext here"); }, hayGesto: () => true, trasGesto: (f) => f(), enCadaGesto: () => {}, visibilidad: () => false });
  const v = crearVoces({ nucleo });
  assert.equal(v.reproducir({ id: "x", buffer: buf(), posicion: { x: 0, y: 0, z: 0 } }), null);
  assert.equal(v.cama({ uri: "x.opus" }), null);
  v.parar("x"); v.pararTodo(); v.mover("x", { x: 1, y: 1, z: 1 }); v.oyente({ x: 0, y: 0, z: 0 }); v.nivel("C"); // nada de esto puede lanzar
  assert.deepEqual(v.estado().sonando, []);
  assert.equal(v.estado().nivel, "C");
});
