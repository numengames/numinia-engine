// S3 · el pool de voces espacializadas: la pieza que de verdad hace sonar el mundo. Sobre el núcleo de S1 (un solo
// `AudioContext`, ocho buses) esto es lo que reproduce: cada disparo construye su cadena, se coloca en el espacio, y
// cuando hay más sonidos que los que el aparato aguanta se APARTAN los menos importantes en vez de matarlos.
//
// La cadena de una voz (diseño §3):
//   AudioBufferSourceNode → GainNode → BiquadFilterNode(lowpass) → PannerNode → bus del núcleo
// El lowpass nace transparente (`AIRE_HZ`): está puesto desde el principio porque la absorción del aire y la oclusión
// (S11) son exactamente ese filtro, y meterlo después obligaría a reconstruir el grafo de cada voz en caliente.
//
// Nada de `THREE.PositionalAudio`: su código FUERZA `panningModel = "HRTF"` (contra el defecto del spec), así que en
// Quest y en móvil no habría forma de ahorrar; y además su oyente, hijo de la cámara estéreo, salta entre ojo
// izquierdo y derecho cada fotograma y tartamudea en VR (three.js issue #20920, abierto). De three.js copiamos solo
// el PATRÓN de sacar la transformación: `updateMatrixWorld` → `decompose` → escribir los parámetros del panner; esa
// parte (quién llama a `oyente()` con la pose del visor) es S5. Aquí queda la función y su prueba, sin enganchar.
//
// Lo copiado y transformado (ficha completa en work/motor-ar/sonido/DISENO-SONIDO.md §9):
//  - límite de voces con virtualización, prioridad desplazada por distancia, cooldown por sonido → Wwise / FMOD
//    (SOLO conceptos: licencias cerradas, ni una línea de su código). Web Audio NO virtualiza voces: esto es código
//    nuestro. Al llegar al tope no se mata la voz: se para guardando el desplazamiento y se reanuda cuando hay hueco
//    (el «Play from elapsed time» de Wwise), porque matar voces se oye y virtualizar no.
//  - `variantes` con pesos → `MSFT_audio_emitter` (que KHR perdió), con la SEMILLA del servidor para que todos oigan
//    la misma variante: el servidor manda, el cliente solo mezcla.
//  - defectos del emisor (`inverse`, 40 m, rolloff 3) → Hyperfy v2, probados a escala humana (KHR dejaría
//    `maxDistance 0` = infinito y rolloff 1, inservible en un mundo de 40 m).
//  - `buffer.slice(0)` antes de `decodeAudioData` → `AudioLoader` de three.js: `decodeAudioData` DETACHA el
//    ArrayBuffer, así que sin la copia la caché se queda con un buffer vacío.
import { audio, type Bus, type Nucleo } from "./nucleo.ts";
import type { Nivel } from "../calidad.ts";

export type Punto = { x: number; y: number; z: number };

/** Voces reales a la vez por nivel de aparato (`limits.json` → `audio_sources`, hoy `estimated`). */
export const VOCES_MAX: Readonly<Record<Nivel, number>> = { A: 32, B: 16, C: 8, D: 4 };
/** De ellas, cuántas pueden ir con `panningModel: "HRTF"` (`limits.json` → `audio_hrtf_max`, hoy `estimated`).
 *  Se raciona porque el spec llama al HRTF «somewhat more costly than equalpower», tiene cola, cuesta ~5 ms de
 *  latencia (cuatro FFTConvolver de 512 por panner en Blink) y degrada a k-rate TODOS los parámetros del panner y
 *  del oyente. Las demás voces van en `equalpower`, que es el defecto del spec. */
export const HRTF_MAX: Readonly<Record<Nivel, number>> = { A: 24, B: 16, C: 12, D: 6 };

/** Defectos del emisor a escala de mundo (Hyperfy v2, no los de KHR ni los del spec). */
export const DISTANCIA = { distanceModel: "inverse" as DistanceModelType, refDistance: 1, maxDistance: 40, rolloffFactor: 3 } as const;
/** Cono omnidireccional, en RADIANES como en `KHR_audio_emitter` (el panner los quiere en grados: se convierte aquí). */
export const CONO_OMNI = { interior: 2 * Math.PI, exterior: 2 * Math.PI, gananciaExterior: 0 } as const;
/** Cuánta prioridad se pierde a `maxDistance` (Priority Distance Factor de Wwise, que usa −10 de defecto). */
export const FACTOR_DISTANCIA = 10;
/** Prioridad de un sonido cualquiera, 0–100 (como Wwise). Más alto = se aparta más tarde. */
export const PRIORIDAD_DEF = 50;
/** Lo que tiene que ganar una voz para robarle el sitio a otra: sin margen, dos voces iguales se relevarían sin parar. */
export const HISTERESIS = 1;
/** Margen en metros para quitarle el HRTF a una voz que ya lo tiene: evita el parpadeo en el límite de la lista. */
export const MARGEN_HRTF_M = 1;
/** Un mismo sonido no se dispara dos veces dentro de este rato (cooldown de FMOD): 20 disparos juntos no revientan
 *  la mezcla ni se suman en fase. Cada llamada puede pedir el suyo. */
export const COOLDOWN_DEF_MS = 50;
/** Los sonidos de hoy son PROVISIONALES (bibliotecas CC0 y recetas): mejor que se queden bajos que altos (Pablo,
 *  2026-10-19). Un solo mando, por bus, aplicado a cada voz: −10 dB a los efectos, la interfaz y mis pasos. Las voces
 *  de la gente y del lector, la música y el colchón no se tocan. Cuando lleguen los definitivos, esta tabla vuelve a 1. */
export const NIVEL_PROVISIONAL: Readonly<Partial<Record<Bus, number>>> = { efectos: 0.32, interfaz: 0.32, "pasos-propios": 0.32 };
/** Rampa cortísima para apagar y encender una voz sin clic (virtualizar, revivir, cambiar de panner). */
export const CLIC_S = 0.008;
/** Buses que NUNCA se roban ni se virtualizan: la música y el ambiente son continuos y volver «desde el tiempo
 *  transcurrido» no es sample-accurate (lo documenta Wwise), así que se oiría el salto. */
export const SIN_ROBO: readonly Bus[] = ["musica", "ambiente"];
/** El lowpass de cada voz nace transparente: aire y oclusión (S11) solo tienen que bajar esta frecuencia. */
export const AIRE_HZ = 22050;
/** Tope de memoria de la caché de `AudioBuffer` descodificados (PCM float: ~5,3 MB por minuto mono a 44,1 kHz). */
export const MEMORIA_MAX = 8 * 1024 * 1024;

/** Una variante del mismo sonido, con su peso (a más peso, más veces sale). */
export type Variante = { buffer?: AudioBuffer; uri?: string; peso?: number };

export type Peticion = {
  /** Nombre del sonido. Es el asa de `parar`/`mover` Y la clave del cooldown: varios disparos pueden compartirlo
   *  (20 dardos son 20 voces con el mismo `id`), y entonces `parar(id)` para todos. */
  id?: string;
  buffer?: AudioBuffer;
  uri?: string;
  posicion?: Punto | null;
  bus?: Bus;
  gain?: number;
  loop?: boolean;
  prioridad?: number;
  variantes?: readonly Variante[];
  /** Ángulos del cono en RADIANES (como `KHR_audio_emitter`). */
  cono?: { interior?: number; exterior?: number; gananciaExterior?: number };
  distancia?: { distanceModel?: DistanceModelType; refDistance?: number; maxDistance?: number; rolloffFactor?: number };
  /** La manda el SERVIDOR: con la misma semilla, todos los clientes eligen la misma variante y el mismo tono. */
  semilla?: number;
  /** ms; `0` = sin cooldown. Sin decir nada, `COOLDOWN_DEF_MS`. */
  cooldown?: number;
  /** Variación para que no suene a bucle: ±`tono` en factor de velocidad y ±`volumen` en ganancia (0–1 cada uno). */
  variacion?: { tono?: number; volumen?: number };
  /** Factor de velocidad BASE (1 = tal cual, 0,9 = un poco más grave). Lo pide quien llama; la variación de la
   *  semilla se multiplica encima. Se acota a 0,25–4. */
  tono?: number;
  /** Segundos desde los que empezar (`start(cuando, desplazamiento)`). Lo usa S4 para el reloj de pared: un bucle
   *  corto arranca justo en el instante que ya han oído los demás, no desde el principio. */
  desplazamiento?: number;
};

/** Una cama larga (ambiente, música): NO se descodifica a memoria, se toca por `MediaElementAudioSourceNode`. */
export type Cama = {
  id?: string; uri: string; bus?: Bus; gain?: number; posicion?: Punto | null; loop?: boolean;
  /** El elemento ya hecho, si quien llama lo tiene (S4 lo usa: su sonda de metadatos SE CONVIERTE en la cama, así
   *  que no se descarga dos veces). Sin él, se construye con la hechura `medio`. */
  medio?: HTMLMediaElement;
  /** Distancias del panner (una cama también se oye desde un sitio: la burbuja del mundo tiene su propio radio). */
  distancia?: Peticion["distancia"];
  /** Prioridad; las camas nacen con 100 (no se roban) y rara vez hace falta cambiarlo. */
  prioridad?: number;
};

export type Voz = {
  readonly id: string;
  /** Número de serie: distingue dos voces del mismo `id`. */
  readonly n: number;
  /** ¿Está sonando de verdad ahora (no virtualizada, no todavía descargando)? */
  real(): boolean;
  /** `"HRTF"` o `"equalpower"`, según sea de las más cercanas. */
  panning(): PanningModelType | null;
  /** Prioridad efectiva ahora mismo: `prioridad − 10·(d/maxDistance)`. */
  efectiva(): number;
  parar(): void;
};

export type EstadoVoces = {
  nivel: Nivel;
  tope: number;
  topeHrtf: number;
  reales: number;
  virtuales: number;
  cargando: number;
  hrtf: number;
  descartadas: number;
  memoria: number;
  avisos: readonly string[];
  sonando: readonly { id: string; n: number; bus: Bus; real: boolean; panning: PanningModelType | null; prioridad: number; efectiva: number; distancia: number }[];
};

export type Voces = {
  reproducir(p: Peticion): Voz | null;
  /** Una cama larga por streaming: nunca se descodifica y nunca se virtualiza. */
  cama(c: Cama): Voz | null;
  parar(id: string): void;
  pararTodo(): void;
  mover(id: string, posicion: Punto): void;
  /** El oyente. S5 lo engancha a la cámara y a la pose del visor; aquí solo escribe los parámetros. */
  oyente(posicion: Punto, delante?: Punto, arriba?: Punto): void;
  /** Nivel de aparato (A–D): de él salen el tope de voces y el de HRTF. */
  nivel(n: Nivel): void;
  /** Descodifica y guarda en caché un `AudioBuffer` por URI (con el `slice(0)` de `AudioLoader`). */
  cargar(uri: string): Promise<AudioBuffer | null>;
  estado(): EstadoVoces;
};

export type HechurasVoces = {
  nucleo?: Nucleo;
  nivel?: Nivel;
  /** De dónde salen los bytes de un `uri` (en las pruebas, sin red). */
  traer?: (uri: string) => Promise<ArrayBuffer | null>;
  /** El elemento `<audio>` de una cama (en las pruebas, de mentira). */
  medio?: (uri: string) => HTMLMediaElement;
  /** Semilla cuando el servidor no manda ninguna (sonidos puramente locales: la interfaz). */
  azar?: () => number;
};

// ——— azar determinista: la misma semilla, la misma variante en todos los clientes ———

/** FNV-1a de 32 bits: mete el nombre del sonido en la semilla, para que dos sonidos distintos del mismo evento no
 *  elijan siempre la misma variante. */
export function huella(t: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Un generador xorshift32 a partir de (semilla del servidor, nombre del sonido). Determinista y sin estado global:
 *  dos clientes con la misma semilla recorren exactamente la misma secuencia.
 *  Antes de empezar, la semilla pasa por el mezclador final de murmur3: xorshift32 es lineal sobre GF(2), así que dos
 *  semillas que se diferencian en un bit bajo (1000 y 1001) daban dos primeros números casi iguales — y como la
 *  variante se elige con los bits ALTOS, salía siempre la misma. Con el mezclador, un bit de diferencia cambia medio
 *  número. */
export function azarDe(semilla: number, id: string): () => number {
  let s = mezclar(((semilla >>> 0) ^ huella(id)) >>> 0);
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= (s << 13) >>> 0; s >>>= 0;
    s ^= s >>> 17;
    s ^= (s << 5) >>> 0; s >>>= 0;
    return s / 4294967296;
  };
}

/** El mezclador final de murmur3: reparte un bit de diferencia por los 32 (avalancha). */
export function mezclar(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Qué variante toca, con pesos (peso ausente o inválido = 1). Puro, para poder probarlo solo. */
export function elegirVariante(variantes: readonly Variante[], r: number): number {
  const pesos = variantes.map((v) => (Number.isFinite(v.peso) && (v.peso as number) > 0 ? (v.peso as number) : 1));
  const total = pesos.reduce((a, b) => a + b, 0);
  let x = Math.max(0, Math.min(1, r)) * total;
  for (let i = 0; i < pesos.length; i++) { x -= pesos[i]; if (x < 0) return i; }
  return pesos.length - 1;
}

/** Prioridad efectiva: la distancia resta hasta `FACTOR_DISTANCIA` a `maxDistance` (Priority Distance Factor). */
export function efectivaDe(prioridad: number, d: number, maxDistance: number): number {
  const max = maxDistance > 0 ? maxDistance : DISTANCIA.maxDistance;
  return prioridad - FACTOR_DISTANCIA * Math.max(0, Math.min(1, d / max));
}

const GRADOS = 180 / Math.PI;
const dist3 = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);

type Nodos = { g: GainNode; filtro: BiquadFilterNode; panner: PannerNode | null };
type Fuente = {
  n: number; id: string; bus: Bus; prioridad: number; loop: boolean; cama: boolean;
  posicion: Punto | null;
  dist: { distanceModel: DistanceModelType; refDistance: number; maxDistance: number; rolloffFactor: number };
  gain: number; tono: number;
  buffer: AudioBuffer | null; medio: HTMLMediaElement | null;
  nodos: Nodos | null; src: AudioBufferSourceNode | null;
  offset: number; tInicio: number;
  real: boolean; cargando: boolean; viva: boolean;
  panning: PanningModelType | null;
};

export function crearVoces(h: HechurasVoces = {}): Voces {
  const nucleo = h.nucleo ?? audio();
  const traer = h.traer ?? (async (uri: string) => {
    try { const r = await fetch(uri); return r.ok ? await r.arrayBuffer() : null; } catch { return null; }
  });
  const hacerMedio = h.medio ?? ((uri: string) => { const a = new Audio(uri); a.crossOrigin = "anonymous"; a.preload = "auto"; return a; });
  const azar = h.azar ?? Math.random;

  let nivel: Nivel = h.nivel ?? "A";
  const fuentes: Fuente[] = [];
  const cache = new Map<string, AudioBuffer>();
  const enVuelo = new Map<string, Promise<AudioBuffer | null>>();
  const cooldowns = new Map<string, number>();
  const ultimaVariante = new Map<string, number>();
  const avisos: string[] = [];
  const dichos = new Set<string>();
  let memoria = 0, serie = 0, descartadas = 0;
  let oido: Punto = { x: 0, y: 0, z: 0 };

  const ahora = () => nucleo.ctx()?.currentTime ?? 0;
  const tope = () => VOCES_MAX[nivel];
  const topeHrtf = () => Math.min(HRTF_MAX[nivel], VOCES_MAX[nivel]);

  function avisar(msg: string): void {
    if (avisos.length < 32) avisos.push(msg);
    if (!dichos.has(msg)) { dichos.add(msg); try { console.warn(`[audio] ${msg}`); } catch { /* sin consola */ } }
  }

  /** `setTargetAtTime` donde exista (a-rate, sin zipper noise); si no, `setValueAtTime`; si no, el valor a secas. */
  function llevar(p: AudioParam | undefined, v: number, tau = 0): void {
    if (!p) return;
    try {
      if (tau > 0 && typeof p.setTargetAtTime === "function") p.setTargetAtTime(v, ahora(), tau);
      else if (typeof p.setValueAtTime === "function") p.setValueAtTime(v, ahora());
      else p.value = v;
    } catch { try { p.value = v; } catch { /* un parámetro que no se deja: el resto sigue */ } }
  }

  const distanciaDe = (f: Fuente): number => (f.posicion ? dist3(f.posicion, oido) : 0);
  const efectiva = (f: Fuente): number => efectivaDe(f.prioridad, distanciaDe(f), f.dist.maxDistance);

  // ——— caché de buffers ———

  function guardar(uri: string, b: AudioBuffer): void {
    const bytes = (b.length || 0) * (b.numberOfChannels || 1) * 4;
    while (memoria + bytes > MEMORIA_MAX && cache.size > 0) {
      const viejo = cache.keys().next().value as string;   // Map conserva el orden de inserción: el más antiguo primero
      const b2 = cache.get(viejo)!;
      memoria -= (b2.length || 0) * (b2.numberOfChannels || 1) * 4;
      cache.delete(viejo);
      avisar(`la caché de sonidos llegó al tope (${(MEMORIA_MAX / 1048576).toFixed(0)} MB): suelto «${viejo}»`);
    }
    cache.set(uri, b);
    memoria += bytes;
  }

  async function cargar(uri: string): Promise<AudioBuffer | null> {
    const ya = cache.get(uri);
    if (ya) return ya;
    const vuelo = enVuelo.get(uri);
    if (vuelo) return vuelo;
    const p = (async (): Promise<AudioBuffer | null> => {
      const ctx = nucleo.ctx();
      if (!ctx) return null;
      const datos = await traer(uri);
      if (!datos) { avisar(`no pude traer «${uri}»`); return null; }
      try {
        // `decodeAudioData` DETACHA el ArrayBuffer que recibe: se le da una copia, como hace `AudioLoader` de three.js
        const b = await ctx.decodeAudioData(datos.slice(0));
        guardar(uri, b);
        return b;
      } catch { avisar(`no pude descodificar «${uri}»`); return null; }
    })();
    enVuelo.set(uri, p);
    try { return await p; } finally { enVuelo.delete(uri); }
  }

  // ——— la cadena de una voz ———

  function construir(f: Fuente): Nodos | null {
    const ctx = nucleo.ctx(), bus = nucleo.bus(f.bus);
    if (!ctx || !bus) return null;
    try {
      const g = ctx.createGain(), filtro = ctx.createBiquadFilter();
      g.gain.value = f.gain;
      filtro.type = "lowpass";
      llevar(filtro.frequency, AIRE_HZ);
      g.connect(filtro);
      // S6: una voz SIN posición va en la cabeza y NO lleva panner — los avisos y la interfaz suenan igual en los dos
      // oídos, y un `PannerNode` en (0,0,0) con el oyente ya movido (S5) los dejaría lejos o a un lado. Es la regla de
      // Meta: el emisor en el punto anatómico correcto; el de un aviso es la cabeza.
      if (!f.posicion) {
        filtro.connect(bus);
        return { g, filtro, panner: null };
      }
      const panner = ctx.createPanner();
      panner.panningModel = "equalpower";          // el defecto del spec; el HRTF se reparte en `repartirHrtf`
      panner.distanceModel = f.dist.distanceModel;
      panner.refDistance = f.dist.refDistance;
      panner.maxDistance = f.dist.maxDistance;
      panner.rolloffFactor = f.dist.rolloffFactor;
      filtro.connect(panner); panner.connect(bus);
      const n = { g, filtro, panner };
      colocar(f, n);
      return n;
    } catch { avisar("este navegador no deja construir la cadena de una voz"); return null; }
  }

  function colocar(f: Fuente, n: Nodos | null = f.nodos): void {
    const p = f.posicion;
    if (!n?.panner || !p) return;
    const pan = n.panner as PannerNode & { positionX?: AudioParam; setPosition?: (x: number, y: number, z: number) => void };
    try {
      if (pan.positionX) { llevar(pan.positionX, p.x); llevar((pan as unknown as { positionY: AudioParam }).positionY, p.y); llevar((pan as unknown as { positionZ: AudioParam }).positionZ, p.z); }
      else pan.setPosition?.(p.x, p.y, p.z);
    } catch { /* un panner que no se deja colocar sigue sonando en el centro */ }
  }

  function conPanning(f: Fuente, modelo: PanningModelType): void {
    if (!f.nodos?.panner || f.panning === modelo) return;
    // el HRTF tiene cola y latencia propia: cambiarlo a pelo da un clic. Se baja la voz 8 ms, se cambia y se sube.
    llevar(f.nodos.g.gain, 0, CLIC_S);
    try { f.nodos.panner.panningModel = modelo; } catch { return; }
    f.panning = modelo;
    llevar(f.nodos.g.gain, f.gain, CLIC_S);
  }

  function arrancar(f: Fuente): void {
    const ctx = nucleo.ctx();
    if (!ctx || !f.viva || f.real) return;
    if (!f.nodos) f.nodos = construir(f);
    if (!f.nodos) { f.viva = false; return; }
    if (f.cama) {
      const m = f.medio;
      if (!m) { f.viva = false; return; }
      f.real = true; f.cargando = false; f.tInicio = ahora();
      try { void m.play?.(); } catch { /* el gesto ya pasó; si no, el núcleo lo despierta */ }
      return;
    }
    if (!f.buffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = f.buffer;
      src.loop = f.loop;
      llevar(src.playbackRate, f.tono);
      src.connect(f.nodos.g);
      const dur = f.buffer.duration || 0;
      const desde = f.loop && dur > 0 ? f.offset % dur : f.offset;
      src.onended = () => { if (f.src === src && !f.loop) terminar(f); };
      src.start(0, Math.max(0, desde));          // «Play from elapsed time» de Wwise: no es sample-accurate, y se dice
      f.src = src; f.real = true; f.cargando = false; f.tInicio = ahora();
      llevar(f.nodos.g.gain, f.gain, CLIC_S);
    } catch { avisar(`no pude arrancar «${f.id}»`); f.viva = false; }
  }

  /** Apartar una voz: NO se mata, se para guardando por dónde iba, y vuelve cuando haya hueco. */
  function virtualizar(f: Fuente): void {
    if (!f.real || f.cama) return;
    f.offset += Math.max(0, (ahora() - f.tInicio) * f.tono);
    const dur = f.buffer?.duration ?? 0;
    if (!f.loop && dur > 0 && f.offset >= dur) { terminar(f); return; }   // se habría acabado sola: no hay nada que apartar
    if (f.nodos) llevar(f.nodos.g.gain, 0, CLIC_S);
    pararFuente(f);
    f.real = false;
  }

  function pararFuente(f: Fuente): void {
    const src = f.src;
    f.src = null;
    if (src) { try { src.onended = null; } catch { /* algunos no dejan */ } try { src.stop?.(); } catch { /* ya paró */ } try { src.disconnect?.(); } catch { /* ya suelto */ } }
    if (f.cama && f.medio) { try { f.medio.pause?.(); } catch { /* ya parado */ } }
  }

  /** Limpieza de verdad: Web Audio no tiene `dispose()`, así que si no se desconecta a mano queda colgando del bus. */
  function terminar(f: Fuente): void {
    f.viva = false; f.real = false; f.cargando = false;
    pararFuente(f);
    if (f.nodos) {
      for (const n of [f.nodos.g, f.nodos.filtro, f.nodos.panner]) { try { n?.disconnect?.(); } catch { /* ya suelto */ } }
      f.nodos = null;
    }
    if (f.cama && f.medio) { try { f.medio.src = ""; } catch { /* ya vacío */ } f.medio = null; }
    const i = fuentes.indexOf(f);
    if (i >= 0) fuentes.splice(i, 1);
  }

  // ——— el reparto: quién suena de verdad y quién va con HRTF ———

  /** Decide, con el tope del aparato, quién suena y quién espera; y reparte el HRTF entre las más cercanas. */
  function revisar(): void {
    const vivas = fuentes.filter((f) => f.viva && !f.cargando);
    const max = tope();
    // las que no se roban (música, ambiente, camas): ocupan sitio por orden de llegada y, una vez dentro, no salen
    const fijas = vivas.filter((f) => f.cama || SIN_ROBO.includes(f.bus));
    let sitio = max - fijas.filter((f) => f.real).length;
    for (const f of fijas) { if (!f.real && sitio > 0) { arrancar(f); if (f.real) sitio--; } }

    const orden = vivas.filter((f) => !fijas.includes(f)).sort((a, b) => efectiva(b) - efectiva(a) || a.n - b.n);
    const libres = Math.max(0, sitio);
    // histéresis en la frontera: la que entra tiene que ganarle por `HISTERESIS` a la que ya suena, o no se la releva
    // (dos voces casi iguales se estarían relevando sin parar, y eso se oye)
    for (let i = libres - 1, j = libres; i >= 0 && j < orden.length; i--, j++) {
      const entra = orden[i], queda = orden[j];
      if (!entra.real && queda.real && efectiva(entra) < efectiva(queda) + HISTERESIS) { orden[i] = queda; orden[j] = entra; }
      else break;
    }
    for (let i = libres; i < orden.length; i++) if (orden[i].real) virtualizar(orden[i]);
    for (let i = 0; i < libres && i < orden.length; i++) if (!orden[i].real && orden[i].viva) arrancar(orden[i]);
    repartirHrtf();
  }

  const contarReales = (): number => fuentes.filter((f) => f.real).length;

  /** HRTF solo para las N más cercanas; el resto, `equalpower`. Con margen para no parpadear en el límite. */
  function repartirHrtf(): void {
    const reales = fuentes.filter((f) => f.real && f.nodos?.panner).sort((a, b) => distanciaDe(a) - distanciaDe(b) || a.n - b.n);
    const n = Math.min(topeHrtf(), reales.length);
    const quiere = reales.slice(0, n);
    if (n > 0 && n < reales.length) {
      const dentro = quiere[n - 1], fuera = reales[n];
      // el que ya tenía HRTF no lo suelta por un palmo: solo si el de dentro le gana por más de MARGEN_HRTF_M
      if (fuera.panning === "HRTF" && dentro.panning !== "HRTF" && distanciaDe(fuera) - distanciaDe(dentro) < MARGEN_HRTF_M) {
        quiere[n - 1] = fuera; reales[n] = dentro;
      }
    }
    const conHrtf = new Set(quiere);
    for (const f of reales) conPanning(f, conHrtf.has(f) ? "HRTF" : "equalpower");
  }

  // ——— la puerta: reproducir ———

  function nuevaFuente(p: Peticion, id: string, bus: Bus, cama: boolean): Fuente {
    const d = p.distancia ?? {};
    let ref = num(d.refDistance, DISTANCIA.refDistance);
    if (!(ref > 0)) {
      // trampa real de la especificación: con `refDistance = 0` el modelo `inverse` da ganancia 0 SIEMPRE (§6.4)
      avisar(`«${id}» pedía refDistance ${d.refDistance}: con 0 el modelo inverse deja la voz muda para siempre. Lo pongo en ${DISTANCIA.refDistance}`);
      ref = DISTANCIA.refDistance;
    }
    const max = Math.max(ref, num(d.maxDistance, DISTANCIA.maxDistance));
    return {
      n: ++serie, id, bus, prioridad: num(p.prioridad, PRIORIDAD_DEF), loop: !!p.loop, cama,
      posicion: p.posicion ? { ...p.posicion } : null,
      dist: { distanceModel: d.distanceModel ?? DISTANCIA.distanceModel, refDistance: ref, maxDistance: max, rolloffFactor: Math.max(0, num(d.rolloffFactor, DISTANCIA.rolloffFactor)) },
      gain: Math.max(0, num(p.gain, 1)) * (cama ? 1 : NIVEL_PROVISIONAL[bus] ?? 1), tono: 1,
      buffer: null, medio: null, nodos: null, src: null,
      offset: Math.max(0, num(p.desplazamiento, 0)), tInicio: 0, real: false, cargando: false, viva: true, panning: null,
    };
  }

  function cono(f: Fuente, c: Peticion["cono"]): void {
    if (!f.nodos?.panner) return;          // una voz en la cabeza (sin panner) no tiene cono: suena omnidireccional
    const interior = num(c?.interior, CONO_OMNI.interior), exterior = num(c?.exterior, CONO_OMNI.exterior);
    try {
      // los datos del mundo van en radianes (KHR); el `PannerNode` los quiere en GRADOS: la conversión vive solo aquí
      f.nodos.panner.coneInnerAngle = interior * GRADOS;
      f.nodos.panner.coneOuterAngle = Math.max(interior, exterior) * GRADOS;
      f.nodos.panner.coneOuterGain = Math.max(0, Math.min(1, num(c?.gananciaExterior, CONO_OMNI.gananciaExterior)));
    } catch { /* un panner sin cono suena omnidireccional: no es grave */ }
  }

  function asa(f: Fuente): Voz {
    return {
      id: f.id, n: f.n,
      real: () => f.real,
      panning: () => f.panning,
      efectiva: () => efectiva(f),
      parar: () => { terminar(f); revisar(); },
    };
  }

  function reproducir(p: Peticion): Voz | null {
    const ctx = nucleo.ctx();
    if (!ctx) return null;                       // navegador sin Web Audio: el motor sigue, mudo (S1)
    const id = p.id ?? p.uri ?? "sonido";
    const bus: Bus = p.bus ?? "efectos";
    const cd = Math.max(0, num(p.cooldown, COOLDOWN_DEF_MS)) / 1000;
    const ultimo = cooldowns.get(id);
    if (cd > 0 && ultimo !== undefined && ahora() - ultimo < cd) { descartadas++; return null; }

    const semilla = Math.floor(num(p.semilla, Math.floor(azar() * 4294967296)));
    const r = azarDe(semilla, id);
    const variantes = p.variantes && p.variantes.length ? p.variantes : null;
    let iv = variantes ? elegirVariante(variantes, r()) : -1;
    // sin semilla del servidor (lo local: mis pasos) nunca la misma grabación dos veces seguidas: el oído caza la
    // repetición enseguida (el «efecto ametralladora»). Con semilla, manda la semilla: todos tienen que oír lo mismo.
    if (variantes && variantes.length > 1 && p.semilla === undefined && iv === ultimaVariante.get(id)) iv = (iv + 1 + Math.floor(r() * (variantes.length - 1))) % variantes.length;
    if (variantes) ultimaVariante.set(id, iv);
    const v = variantes ? variantes[iv] : null;
    const buffer = v?.buffer ?? p.buffer ?? null;
    const uri = v?.uri ?? p.uri ?? null;
    if (!buffer && !uri) { avisar(`«${id}» no trae ni buffer ni uri`); return null; }

    const f = nuevaFuente(p, id, bus, false);
    // variación de tono y volumen de la MISMA secuencia de la semilla: todos oyen la misma variante y el mismo tono
    const varTono = Math.max(0, Math.min(1, num(p.variacion?.tono, 0)));
    const varVol = Math.max(0, Math.min(1, num(p.variacion?.volumen, 0)));
    // `tono` es la base que pide quien llama (una puerta que se cierra suena un poco más grave que al abrirse);
    // la variación de la semilla se multiplica encima, así que las dos cosas conviven.
    const base = Math.max(0.25, Math.min(4, num(p.tono, 1)));
    f.tono = base;
    if (varTono > 0) f.tono = Math.max(0.25, base * (1 + (r() * 2 - 1) * varTono));
    if (varVol > 0) f.gain = Math.max(0, f.gain * (1 + (r() * 2 - 1) * varVol));
    f.buffer = buffer;
    fuentes.push(f);
    cooldowns.set(id, ahora());
    f.nodos = construir(f);
    if (!f.nodos) { terminar(f); return null; }
    cono(f, p.cono);

    if (!buffer && uri) {
      f.cargando = true;
      void cargar(uri).then((b) => {
        if (!f.viva) return;
        f.cargando = false;
        if (!b) { terminar(f); return; }
        f.buffer = b;
        revisar();                               // el disparo entra en el reparto cuando ya tiene con qué sonar
      });
      return asa(f);
    }
    revisar();
    return asa(f);
  }

  function cama(c: Cama): Voz | null {
    const ctx = nucleo.ctx(), bus = nucleo.bus(c.bus ?? "ambiente");
    if (!ctx || !bus) return null;
    const f = nuevaFuente({ id: c.id ?? c.uri, gain: c.gain, posicion: c.posicion, loop: c.loop ?? true, prioridad: num(c.prioridad, 100), distancia: c.distancia }, c.id ?? c.uri, c.bus ?? "ambiente", true);
    try {
      // quien llama puede traer su propio elemento (S4: la sonda de metadatos SE CONVIERTE en la cama)
      const m = c.medio ?? hacerMedio(c.uri);
      if (c.loop !== undefined || !c.medio) m.loop = f.loop;
      f.medio = m;
      f.nodos = construir(f);
      if (!f.nodos) { terminar(f); return null; }
      // las camas largas NO se descodifican a memoria (un minuto mono son ~5,3 MB de PCM): van por streaming
      const src = ctx.createMediaElementSource(m);
      src.connect(f.nodos.g);
    } catch { avisar(`no pude poner la cama «${c.uri}»`); terminar(f); return null; }
    fuentes.push(f);
    revisar();
    return asa(f);
  }

  const api: Voces = {
    reproducir,
    cama,
    parar(id: string): void {
      for (const f of fuentes.filter((x) => x.id === id)) terminar(f);
      revisar();
    },
    pararTodo(): void {
      for (const f of [...fuentes]) terminar(f);
      cooldowns.clear();
    },
    mover(id: string, posicion: Punto): void {
      for (const f of fuentes) if (f.id === id) { f.posicion = { ...posicion }; colocar(f); }
      revisar();
    },
    oyente(posicion: Punto, delante: Punto = { x: 0, y: 0, z: -1 }, arriba: Punto = { x: 0, y: 1, z: 0 }): void {
      oido = { ...posicion };
      const ctx = nucleo.ctx();
      const l = ctx?.listener as (AudioListener & { positionX?: AudioParam; setPosition?: (x: number, y: number, z: number) => void; setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void }) | undefined;
      if (l) {
        const u = (p: Punto): Punto => { const m = Math.hypot(p.x, p.y, p.z) || 1; return { x: p.x / m, y: p.y / m, z: p.z / m }; };
        const d = u(delante), a = u(arriba);
        try {
          if (l.positionX) {
            const P = l as unknown as Record<string, AudioParam>;
            llevar(P.positionX, posicion.x); llevar(P.positionY, posicion.y); llevar(P.positionZ, posicion.z);
            llevar(P.forwardX, d.x); llevar(P.forwardY, d.y); llevar(P.forwardZ, d.z);
            llevar(P.upX, a.x); llevar(P.upY, a.y); llevar(P.upZ, a.z);
          } else {
            // la API vieja (Safari y navegadores antiguos): dos llamadas, sin `AudioParam`
            l.setPosition?.(posicion.x, posicion.y, posicion.z);
            l.setOrientation?.(d.x, d.y, d.z, a.x, a.y, a.z);
          }
        } catch { avisar("este navegador no deja mover el oyente"); }
      }
      revisar();                                 // al moverse la cabeza cambian las distancias: y con ellas el reparto
    },
    nivel(n: Nivel): void { if (VOCES_MAX[n] !== undefined) { nivel = n; revisar(); } },
    cargar,
    estado(): EstadoVoces {
      return {
        nivel, tope: tope(), topeHrtf: topeHrtf(),
        reales: contarReales(),
        virtuales: fuentes.filter((f) => !f.real && !f.cargando).length,
        cargando: fuentes.filter((f) => f.cargando).length,
        hrtf: fuentes.filter((f) => f.real && f.panning === "HRTF").length,
        descartadas, memoria, avisos: [...avisos],
        sonando: fuentes.map((f) => ({ id: f.id, n: f.n, bus: f.bus, real: f.real, panning: f.panning, prioridad: f.prioridad, efectiva: efectiva(f), distancia: distanciaDe(f) })),
      };
    },
  };
  return api;
}

let unico: Voces | null = null;
/** El pool de voces de esta página: uno y solo uno, sobre el único `AudioContext` del motor. */
export function voces(): Voces { return (unico ??= crearVoces()); }
/** El oyente del motor. S5 lo llama con la cámara y con la pose del visor; hoy nadie lo llama todavía. */
export function oyente(posicion: Punto, delante?: Punto, arriba?: Punto): void { voces().oyente(posicion, delante, arriba); }
