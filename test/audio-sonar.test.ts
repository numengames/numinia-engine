// S6f · LA PUERTA ÚNICA del sonido: «fichero gana, receta de respaldo». Lo que se prueba aquí es el reparto —
// quién suena por fichero, quién por receta, qué pasa cuando no hay ninguna de las dos — y que el buffer sintetizado
// entra por el MISMO pool de voces (con sus topes y su virtualización), no por un camino paralelo.
//
// Todo con un `AudioContext` de mentira (igual que test/audio-nucleo.test.ts y test/audio-voces.test.ts): en Node no
// hay Web Audio, y lo que importa es la FORMA del grafo y QUIÉN suena, no el sonido. **Nadie ha oído nada en un
// navegador**: estas pruebas no dicen que suene bien, dicen que suena quien tiene que sonar.
import test from "node:test";
import assert from "node:assert/strict";
import { crearNucleo } from "../packages/render/src/audio/nucleo.ts";
import { crearVoces, VOCES_MAX, type Voces } from "../packages/render/src/audio/voces.ts";
import { crearSonidos, type Sonidos } from "../packages/render/src/audio/sonidos.ts";
import {
  crearPuerta, remuestrear, AMBIENTE_GANANCIA_DEF, MATERIAL_DEF, MATERIAL_DE_SUELO, materialDeSuelo,
  PASO_DE, VARIANTES_RECETA, esAmbienteSintetizado,
} from "../packages/render/src/audio/sonar.ts";
import { RECETAS, SR } from "../packages/render/src/audio/sintesis.ts";
import { leerCatalogo, tablaDePagina } from "../features/sonido/server.ts";
import catalogo from "../features/sonido/catalogo.json" with { type: "json" };

type Param = { value: number; setTargetAtTime(v: number, t: number, tau: number): void; setValueAtTime(v: number, t: number): void };
const param = (v = 1): Param => ({ value: v, setTargetAtTime(x) { this.value = x; }, setValueAtTime(x) { this.value = x; } });

type Nodo = { tipo: string; connect(d: unknown): unknown; disconnect(): void } & Record<string, unknown>;

/** Un `AudioContext` de mentira con `createBuffer` (que el de voces no necesitaba): aquí sí, porque la receta se
 *  convierte en un `AudioBuffer`. `sampleRate` es 48.000, como un navegador de verdad: las recetas son a 22.050. */
function falso(hz = 48000) {
  const nodos: Nodo[] = [], arranques: Nodo[] = [], buffers: { canales: number; largo: number; hz: number }[] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}): Nodo => {
    const n = { tipo, connect(d: unknown) { return d; }, disconnect() {}, ...extra } as Nodo;
    nodos.push(n);
    return n;
  };
  const ctx = {
    state: "running" as AudioContextState,
    currentTime: 0,
    sampleRate: hz,
    destination: { tipo: "destino" },
    listener: Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map((k) => [k, param(0)])),
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
        start() { arranques.push(n); }, stop() { (n as unknown as { parado: number }).parado++; },
      });
      return n;
    },
    createBuffer: (canales: number, largo: number, hz2: number) => {
      buffers.push({ canales, largo, hz: hz2 });
      const datos = new Float32Array(largo);
      return { duration: largo / hz2, length: largo, numberOfChannels: canales, sampleRate: hz2, copyToChannel: (d: Float32Array) => datos.set(d.subarray(0, datos.length)), getChannelData: () => datos } as unknown as AudioBuffer;
    },
    createMediaElementSource: (m: unknown) => nodo("medio", { medio: m }),
    createDynamicsCompressor: () => nodo("limitador", { threshold: param(0), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    decodeAudioData: async () => ({ duration: 1, length: 48000, numberOfChannels: 1, sampleRate: 48000 }) as unknown as AudioBuffer,
    suspend() { ctx.state = "suspended"; return Promise.resolve(); },
    resume() { ctx.state = "running"; return Promise.resolve(); },
    addEventListener() {},
  };
  return { ctx, nodos, arranques, buffers, crear: () => ctx as unknown as AudioContext };
}

/** La tabla de la página SALE del catálogo de verdad: así la prueba no se separa nunca del fichero que se sirve. */
const tabla = () => tablaDePagina(leerCatalogo(catalogo));

/** Un banco con el núcleo, el pool de voces de verdad y el catálogo de verdad. `generados` cuenta cuántas veces se ha
 *  generado una receta: es lo que demuestra que el buffer se guarda. */
function banco(opciones: { hz?: number; tablaPuesta?: boolean; volumenAmbiente?: number; nivel?: "A" | "B" | "C" | "D" } = {}) {
  const f = falso(opciones.hz);
  const nucleo = crearNucleo({ crear: f.crear, hayGesto: () => true, trasGesto: (fn) => fn(), enCadaGesto: () => {}, visibilidad: () => false });
  const medios: { uri: string; loop: boolean; tocado: number; parado: number; gain?: number }[] = [];
  const voces = crearVoces({
    nucleo, nivel: opciones.nivel ?? "A",
    traer: async () => new ArrayBuffer(8),
    medio: (uri: string) => {
      const m = { uri, tocado: 0, parado: 0, loop: false, src: uri, play() { m.tocado++; return Promise.resolve(); }, pause() { m.parado++; } };
      medios.push(m as never);
      return m as unknown as HTMLMediaElement;
    },
    azar: () => 0.5,
  });
  const cat = crearSonidos({ nucleo, voces, traer: async () => tabla(), puede: () => true });
  if (opciones.tablaPuesta !== false) assert.ok(cat.poner(tabla()), "la tabla de la página se lee");
  if (opciones.volumenAmbiente !== undefined) nucleo.volumen("ambiente", opciones.volumenAmbiente);
  const avisos: string[] = [];
  let generados = 0;
  const p = crearPuerta({
    nucleo, voces, sonidos: cat,
    generar: (id, v) => { const s = RECETAS[id] ? { datos: new Float32Array(1024).fill(0.1 + v * 0.01) } : null; if (s) generados++; return s; },
    avisar: (m) => avisos.push(m),
  });
  return { ...f, nucleo, voces, cat, p, avisos, medios, generados: () => generados, avanzar: (s: number) => { f.ctx.currentTime += s; } };
}

const fuentes = (b: ReturnType<typeof banco>) => b.nodos.filter((n) => n.tipo === "fuente");
/** Cuántas voces SUENAN de verdad (el tope del aparato se mide aquí: las de más se virtualizan, no se matan). */
const reales = (b: ReturnType<typeof banco>) => b.voces.estado().reales;
/** Cuántas voces hay vivas en total: las que suenan más las apartadas. */
const vivas = (b: ReturnType<typeof banco>) => b.voces.estado().sonando.length;
const enBus = (b: ReturnType<typeof banco>, bus: string) => b.voces.estado().sonando.filter((v) => v.bus === bus).length;

// ———————————————————————————— 1. fichero gana, receta de respaldo ————————————————————————————

test("S6f: cuando un id tiene fichero Y receta, GANA EL FICHERO", () => {
  const b = banco();
  // `ui-pulsar` tiene las dos cosas: fila con fichero en el catálogo y receta en sintesis.ts
  assert.ok(b.cat.fila("ui-pulsar")?.variantes.length, "ui-pulsar tiene fichero en el catálogo");
  assert.ok(RECETAS["ui-pulsar"], "y receta en sintesis.ts");
  assert.equal(b.p.fuenteDe("ui-pulsar"), "fichero");
  assert.equal(b.p.sonar("ui-pulsar", { semilla: 7 }), true);
  assert.equal(b.p.estado().ficheros, 1, "salió por fichero");
  assert.equal(b.p.estado().recetas, 0, "la receta no se tocó");
  assert.equal(b.generados(), 0, "y no se generó ningún buffer: para eso está el fichero");
});

test("S6f: cuando un id NO tiene fichero, suena la receta — y por el mismo camino y el mismo bus", () => {
  const b = banco();
  // «salto» es una de las seis filas de receta: está en el catálogo, pero sin fichero
  const fila = b.cat.fila("salto");
  assert.ok(fila, "«salto» está en el catálogo");
  assert.equal(fila.fuente, "receta");
  assert.deepEqual(fila.variantes, []);
  assert.equal(b.p.fuenteDe("salto"), "receta");
  assert.equal(b.p.sonar("salto", { semilla: 11 }), true);
  assert.equal(b.p.estado().recetas, 1);
  assert.equal(b.p.estado().ficheros, 0);
  // el bus es el del CATÁLOGO (pasos-propios), no el de la receta: el catálogo es la lista de verdad
  assert.equal(fila.bus, "pasos-propios");
  assert.equal(enBus(b, "pasos-propios"), 1, "la voz está en el bus que dice el catálogo");
  assert.equal(fuentes(b).length, 1, "una fuente del pool: el mismo camino que un fichero, no uno paralelo");
});

test("S6f: un id que no tiene ni fichero ni receta avisa UNA vez y no rompe nada", () => {
  const b = banco();
  assert.equal(b.p.fuenteDe("no-existe-esto"), "nada");
  for (let i = 0; i < 5; i++) assert.equal(b.p.sonar("no-existe-esto"), false);
  assert.equal(b.p.estado().fallados, 5, "los cinco intentos fallaron");
  const suyos = b.avisos.filter((m) => m.includes("no-existe-esto"));
  assert.equal(suyos.length, 1, `avisó ${suyos.length} veces en vez de una: ${suyos.join(" | ")}`);
  assert.match(suyos[0], /ni fichero en el catálogo ni receta/);
  // y la página sigue viva: lo siguiente suena igual
  assert.equal(b.p.sonar("ui-pulsar"), true);
});

// ———————————————————————————— 2. el buffer de la receta se guarda ————————————————————————————

test("S6f: el buffer sintetizado se genera UNA vez para dos disparos del mismo id y variante", () => {
  const b = banco();
  assert.equal(b.p.sonar("salto", { semilla: 3, variante: 0, cooldown: 0 }), true);
  assert.equal(b.generados(), 1, "la primera vez sí se genera");
  assert.equal(b.p.sonar("salto", { semilla: 3, variante: 0, cooldown: 0 }), true);
  assert.equal(b.generados(), 1, "la segunda vez sale de la caché: NO se regenera en cada disparo");
  assert.equal(b.p.estado().guardados, 1, "un buffer guardado");
  // otra variante sí es otro buffer
  assert.equal(b.p.sonar("salto", { semilla: 3, variante: 1, cooldown: 0 }), true);
  assert.equal(b.generados(), 2);
  assert.equal(b.p.estado().guardados, 2);
});

test("S6f: el buffer de la receta se construye a 22.050 Hz (el navegador lo remuestrea a los 48.000 del contexto)", () => {
  const b = banco({ hz: 48000 });
  assert.equal(SR, 22050, "las recetas son a 22,05 kHz");
  assert.equal(b.ctx.sampleRate, 48000, "y el contexto va a 48 kHz");
  b.p.sonar("salto", { semilla: 1, variante: 0 });
  assert.deepEqual(b.buffers, [{ canales: 1, largo: 1024, hz: SR }], "mono, a la frecuencia de la receta");
});

test("S6f: el remuestreo a mano mantiene la duración (la red por si createBuffer no acepta 22,05 kHz)", () => {
  const d = new Float32Array([0, 1, 0, -1, 0, 1, 0, -1]);
  const a = remuestrear(d, 22050, 48000);
  assert.equal(a.length, Math.round((8 * 48000) / 22050), "más muestras, la misma duración");
  assert.equal(remuestrear(d, 22050, 22050), d, "a la misma frecuencia, el mismo array (sin tocar nada)");
  const b2 = remuestrear(d, 48000, 22050);
  assert.ok(b2.length < d.length, "hacia abajo, menos muestras");
  for (const x of a) assert.ok(x >= -1 && x <= 1, "la interpolación lineal no se sale de rango");
});

// ———————————————————————————— 3. el sintetizado entra en el POOL ————————————————————————————

test("S6f: el sintetizado respeta el tope de voces del aparato (entra en el pool, no por un camino paralelo)", () => {
  // nivel D = 4 voces como mucho. Un disparo por encima del tope no crea una fuente nueva.
  const b = banco({ nivel: "D" });
  const tope = VOCES_MAX.D;
  let sonaron = 0;
  for (let i = 0; i < tope + 6; i++) {
    // ids distintos para que ningún cooldown se cruce; todos de receta, todos en el bus «efectos»
    if (b.p.sonar("salto", { semilla: i, variante: i % VARIANTES_RECETA, cooldown: 0, donde: { x: i, y: 0, z: 0 }, bus: "efectos" })) sonaron++;
  }
  assert.ok(sonaron >= 1, "algo sonó");
  // el pool no mata: APARTA. Lo que el tope limita es cuántas suenan de verdad a la vez; las demás quedan
  // virtualizadas, sin nodo de audio, listas para volver si se acercan. Eso vale igual para fichero y para receta.
  assert.ok(reales(b) <= tope, `${reales(b)} voces suenan de verdad con un tope de ${tope}: el sintetizado se salta el pool`);
  assert.ok(vivas(b) > tope, "y las de más quedan apartadas, no muertas (virtualización)");
  assert.ok(fuentes(b).length <= tope + 1, `${fuentes(b).length} nodos de audio con un tope de ${tope}: una virtual no gasta nodo`);
});

test("S6f: dos páginas con la MISMA semilla eligen la misma variante por el camino de la receta", () => {
  const a = banco(), c = banco();
  const vistas: number[][] = [];
  for (const b of [a, c]) {
    const v: number[] = [];
    for (const semilla of [1, 2, 3, 99, 1234567]) {
      b.p.sonar("salto", { semilla, cooldown: 0 });
      // la variante se deduce de los buffers que se han generado: cada id#variante genera uno
      v.push(b.p.estado().guardados);
    }
    vistas.push(v);
  }
  assert.deepEqual(vistas[0], vistas[1], "con las mismas semillas, las mismas variantes (y por tanto los mismos buffers)");
  // y semillas distintas no dan siempre la misma: si no, no habría variantes
  const d = banco();
  const unas = new Set<number>();
  for (let s = 0; s < 40; s++) { d.p.sonar("salto", { semilla: s, cooldown: 0 }); unas.add(d.p.estado().guardados); }
  assert.ok(d.p.estado().guardados > 1, "cuarenta semillas no eligen todas la misma variante");
  assert.ok(d.p.estado().guardados <= VARIANTES_RECETA, `no más de ${VARIANTES_RECETA} variantes guardadas`);
});

// ———————————————————————————— 4. el colchón de ambiente ————————————————————————————

test("S6f: el colchón va por STREAMING y con ×0,2 por defecto", () => {
  const b = banco();
  assert.equal(AMBIENTE_GANANCIA_DEF, 0.2, "−14 dB: debajo de todo, pero se oye");
  assert.equal(b.p.ambiente({ id: "ambiente-numinia" }), true);
  assert.equal(b.p.estado().colchon?.id, "ambiente-numinia");
  assert.equal(b.p.estado().colchon?.ganancia, AMBIENTE_GANANCIA_DEF, "sin que el mundo diga nada, el que quiso su autor");
  // streaming = un MediaElementAudioSourceNode con su <audio>, NUNCA un AudioBuffer descodificado (serían ~46 MB)
  assert.equal(b.medios.length, 1, "un solo elemento de medios: la cama se toca por streaming");
  assert.equal(b.medios[0].loop, true, "y en bucle");
  assert.match(b.medios[0].uri, /^\/a\/[0-9a-f]{64}\.opus$/, "el fichero se pide por su sha256");
  assert.equal(b.nodos.filter((n) => n.tipo === "medio").length, 1);
  assert.equal(fuentes(b).length, 0, "ni una sola fuente de buffer: nada se descodificó");
  assert.equal(enBus(b, "ambiente"), 1, "y va por el bus «ambiente»");
});

test("S6f: el mundo puede cambiar la ganancia del colchón, dentro de un tope", () => {
  const b = banco();
  assert.equal(b.p.ambiente({ id: "ambiente-numinia", ganancia: 0.2 }), true);
  assert.equal(b.p.estado().colchon?.ganancia, 0.2);
  b.p.ambiente({ id: "ambiente-numinia", ganancia: 99 });
  assert.equal(b.p.estado().colchon?.ganancia, 4, "no más de ×4 (+12 dB sobre un fichero de −23 LUFS)");
  b.p.ambiente({ id: "ambiente-numinia", ganancia: 0 });
  assert.equal(b.p.estado().colchon, null, "a cero, no arranca");
});

test("S6f: el colchón NO suena si el mundo no lo pide, ni si el jugador tiene el ambiente a cero", () => {
  const b = banco();
  assert.equal(b.p.ambiente(), false, "sin `ambiente` en la ficha del mundo, nada");
  assert.equal(b.p.estado().colchon, null);
  assert.equal(b.p.ambiente({ id: null }), false);
  assert.equal(b.medios.length, 0, "no se pidió ni un byte del fichero");

  const c = banco({ volumenAmbiente: 0 });
  assert.equal(c.p.ambiente({ id: "ambiente-numinia" }), false, "con el deslizador de ambiente a cero, no arranca");
  assert.equal(c.medios.length, 0, "y tampoco se descarga nada");
  // y en cuanto el jugador lo sube, sí
  c.nucleo.volumen("ambiente", 0.5);
  assert.equal(c.p.ambiente({ id: "ambiente-numinia" }), true);
});

test("S6f: un colchón que no es una fila con fichero y bucle no suena, y lo dice", () => {
  const b = banco();
  assert.equal(b.p.ambiente({ id: "salto" }), false, "«salto» es una receta: no puede ser el colchón");
  assert.equal(b.p.ambiente({ id: "ui-pulsar" }), false, "«ui-pulsar» tiene fichero pero no es un bucle");
  assert.ok(b.avisos.some((m) => m.includes("salto")) && b.avisos.some((m) => m.includes("ui-pulsar")));
});

// ———————————————————————————— 5. las camas y capas sintetizadas, apagadas de serie ————————————————————————————

test("S6f: de serie, el ambiente SINTETIZADO no arranca (decisión de Pablo)", () => {
  const b = banco();
  const camas = Object.keys(RECETAS).filter((id) => esAmbienteSintetizado(RECETAS[id].bus));
  assert.ok(camas.length >= 6, `esperaba varias camas y capas de ambiente en sintesis.ts, encontré ${camas.length}`);
  for (const id of camas) {
    assert.equal(b.p.sonar(id, { semilla: 1, cooldown: 0 }), false, `«${id}» no debería sonar sin que un mundo lo pida`);
  }
  assert.equal(b.generados(), 0, "y no se generó ni un buffer");
  assert.equal(vivas(b), 0, "ni una voz");
  assert.ok(b.avisos.some((m) => /apagado de serie/.test(m)), "y se dice por qué");
});

test("S6f: una cama sintetizada suena SOLO si el mundo la enciende por su nombre (R-1: una línea)", () => {
  const b = banco();
  const cama = Object.keys(RECETAS).find((id) => esAmbienteSintetizado(RECETAS[id].bus) && RECETAS[id].bucle)!;
  assert.equal(b.p.sonar(cama, { semilla: 1 }), false);
  // el mundo la enciende (ficha.json → audio.ambiente_sintetizado)
  b.p.ambiente({ sintetizado: [cama] });
  assert.deepEqual(b.p.estado().sintetizado, [cama]);
  assert.equal(b.p.sonar(cama, { semilla: 1 }), true, "ahora sí");
  assert.equal(enBus(b, "ambiente"), 1);
  // y se apaga igual de fácil
  b.p.ambiente({});
  assert.deepEqual(b.p.estado().sintetizado, []);
  assert.equal(b.p.sonar(cama, { semilla: 2, cooldown: 0 }), false);
});

test("S6f: encender una cama NO enciende el colchón, ni al contrario", () => {
  const b = banco();
  const cama = Object.keys(RECETAS).find((id) => esAmbienteSintetizado(RECETAS[id].bus) && RECETAS[id].bucle)!;
  b.p.ambiente({ sintetizado: [cama] });
  assert.equal(b.p.estado().colchon, null, "una cama sintetizada no trae el colchón");
  assert.equal(b.medios.length, 0);
  b.p.ambiente({ id: "ambiente-numinia" });
  assert.deepEqual(b.p.estado().sintetizado, [], "y el colchón no enciende las camas sintetizadas");
});

// ———————————————————————————— 6. el material bajo los pies ————————————————————————————

test("S6f: el paso suena al material que toca, y a piedra cuando el motor no sabe de qué es el suelo", () => {
  const b = banco();
  assert.equal(MATERIAL_DEF, "piedra");
  assert.equal(b.p.paso(), true);
  assert.equal(b.p.estado().ficheros, 1, "los pasos de piedra tienen fichero en el catálogo");
  for (const m of ["piedra", "madera", "metal", "hierba", "agua"] as const) {
    assert.ok(b.cat.fila(PASO_DE[m]), `falta la fila de ${PASO_DE[m]} en el catálogo`);
  }
  // el suelo de ZONA de entorno@1 → material. No es una etiqueta por superficie: eso es S8, todavía pendiente.
  assert.equal(materialDeSuelo("roca"), "piedra");
  assert.equal(materialDeSuelo("hierba"), "hierba");
  assert.equal(materialDeSuelo("liso"), "piedra");
  assert.equal(materialDeSuelo(null), MATERIAL_DEF, "sin saberlo, piedra");
  assert.equal(materialDeSuelo("baldosa-de-marte"), MATERIAL_DEF, "un suelo que este motor no conoce, piedra");
  for (const tipo of Object.keys(MATERIAL_DE_SUELO)) assert.ok(PASO_DE[MATERIAL_DE_SUELO[tipo]], `${tipo} apunta a un material sin pasos`);
});

// ———————————————————————————— 7. el catálogo manda ————————————————————————————

test("S6f: los ids sin fichero están en el catálogo con bus, prioridad, cooldown y texto, y suenan por receta", () => {
  const b = banco();
  for (const id of ["salto", "dano", "moneda", "pesca-mordisqueo", "pesca-picada", "ui-abrir", "ui-cerrar"]) {
    const f = b.cat.fila(id);
    assert.ok(f, `«${id}» no está en el catálogo`);
    assert.equal(f.fuente, "receta");
    assert.ok(f.texto.length > 3, `«${id}» sin texto accesible`);
    assert.ok(f.prioridad >= 0 && f.prioridad <= 100);
    assert.ok(f.cooldown_ms >= 0);
    assert.ok(RECETAS[id], `«${id}» está en el catálogo pero no hay receta`);
    assert.equal(b.p.fuenteDe(id), "receta");
    assert.equal(b.p.sonar(id, { semilla: 5, cooldown: 0 }), true, `«${id}» no suena`);
  }
});

test("S6f: sin tabla del catálogo, la receta sigue sonando (y lo que solo tiene fichero, no)", () => {
  const b = banco({ tablaPuesta: false });
  assert.equal(b.cat.listo(), false);
  assert.equal(b.p.sonar("salto", { semilla: 1 }), true, "la receta no necesita el catálogo para sonar");
  assert.equal(b.p.estado().recetas, 1);
  // el colchón de ambiente es lo ÚNICO del catálogo que no tiene receta: sin tabla no hay de dónde sacarlo
  assert.ok(!RECETAS["ambiente-numinia"], "el colchón es un fichero y solo un fichero");
  assert.equal(b.p.sonar("ambiente-numinia", { semilla: 1 }), false);
});

test("S6f: las 47 recetas cubren los 27 ids del catálogo (menos el colchón): todos tienen respaldo", () => {
  const b = banco();
  const conF = Object.keys(b.cat.tabla()!.sonidos).filter((id) => b.cat.fila(id)!.fuente === "fichero");
  const sinReceta = conF.filter((id) => !RECETAS[id]);
  assert.deepEqual(sinReceta, ["ambiente-numinia"], "lo único sin receta de respaldo debería ser el colchón");
  for (const id of conF) if (RECETAS[id]) assert.equal(b.p.fuenteDe(id), "fichero", `«${id}»: tiene las dos y debe ganar el fichero`);
});

test("S6f: el cooldown del catálogo corta la repetición también por el camino de la receta", () => {
  const b = banco();
  const fila = b.cat.fila("ui-abrir")!;
  assert.ok(fila.cooldown_ms > 0);
  assert.equal(b.p.sonar("ui-abrir", { semilla: 1 }), true);
  assert.equal(b.p.sonar("ui-abrir", { semilla: 2 }), false, "dos veces en el mismo instante, no");
  b.avanzar(fila.cooldown_ms / 1000 + 0.01);
  assert.equal(b.p.sonar("ui-abrir", { semilla: 3 }), true, "pasado el cooldown, sí");
});
