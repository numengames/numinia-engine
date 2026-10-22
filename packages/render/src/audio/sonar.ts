// S6f · LA PUERTA ÚNICA del sonido. Una sola función para hacer sonar algo, con la regla que decidió Pablo el 19-10:
//
//   **cuando existe el fichero de un id, GANA EL FICHERO; la receta queda de respaldo.**
//
// Había dos trabajos hechos en paralelo: el núcleo de audio con su catálogo de 27 ficheros CC0 (S1–S6) y el sonido
// esquemático sintetizado con sus 47 recetas DSP (S6s). Esto los funde, y lo que queda es:
//
//   sonar(id, opciones)
//     ├─ el id tiene fichero en el catálogo  → `sonidos.ts` lo toca por `voces.ts` (su bus, prioridad y cooldown)
//     ├─ no tiene fichero, pero hay receta   → se genera el buffer UNA vez, se GUARDA, y se toca por `voces.ts`
//     └─ no hay ninguna de las dos           → se avisa UNA vez y no suena nada; la página no se rompe
//
// Lo importante: el `AudioBuffer` de una receta entra por el MISMO pool de voces que un fichero. No hay un camino
// paralelo. Así el tope del aparato (4–32 voces), la virtualización por prioridad-distancia, el HRTF racionado, el
// cooldown y el ducking valen igual para los dos — que era justo lo que el sintetizador por su cuenta no tenía.
//
// EL CATÁLOGO ES LA ÚNICA LISTA DE VERDAD, también para lo sintetizado: una receta sin fila en el catálogo suena con
// los valores de la receta, pero los ids sin fichero (`salto`, `dano`, `moneda`, `pesca-mordisqueo`, `pesca-picada`, `ui-abrir`,
// `ui-cerrar`) tienen su fila SIN FICHERO (`"fuente": "receta"`), con su bus, su prioridad, su cooldown y su texto
// accesible. El día que uno consiga un fichero CC0, se le añade el fichero y gana el fichero sin tocar una línea.
//
// EL REMUESTREO: las recetas son a 22.050 Hz y el `AudioContext` de un navegador suele ir a 48.000. No hace falta
// resamplear a mano: un `AudioBuffer` creado a 22.050 Hz lo remuestrea el propio navegador al tocarlo, y lo hace mejor
// que nosotros. Se crea a `SR` y se deja. `remuestrear()` está por si un navegador se niega a crear un buffer a esa
// frecuencia (`createBuffer` lanza si la frecuencia está fuera de su rango): entonces se interpola a mano.
//
// EL AMBIENTE. Dos cosas distintas, y las dos apagadas de serie:
//   - el COLCHÓN: un fichero CC0 de verdad (`ambiente-numinia`, 113 s) que suena como CAMA ÚNICA EN BUCLE por
//     streaming (`MediaElementAudioSourceNode`), NUNCA descodificado (serían ~46 MB de RAM). Solo si el mundo lo pide
//     en su `ficha.json` (`audio.ambiente`), con ganancia ×0,042 por defecto — el nivel que quiso su autor — y con el
//     deslizador de «ambiente» del jugador por encima: a cero, no arranca.
//   - las CAMAS Y CAPAS SINTETIZADAS (`bed-*`, `capa-*` y todo lo del bus `ambiente` de `sintesis.ts`): APAGADAS por
//     defecto, por decisión de Pablo. Solo suenan las que un mundo nombre en `audio.ambiente_sintetizado`.
import { audio, BUSES, type Bus, type Nucleo } from "./nucleo.ts";
import { crearVoces, type Voces, type Voz } from "./voces.ts";
import { crearSonidos, sonidos as sonidosDePagina, type Sonidos, type SonidoTabla } from "./sonidos.ts";
import { generar as generarReceta, RECETAS, SR, type Sonido as Receta } from "./sintesis.ts";

// ───────────────────────── lo que se puede tocar desde fuera ─────────────────────────

/** Cuántas variantes distintas se generan de una receta. Cada una es otra semilla: otro crujido, otra tirada de dados.
 *  Cuatro es el equilibrio entre «no suena a bucle» y «no hay que guardar veinte buffers de lo mismo». */
export const VARIANTES_RECETA = 4;
/** Tope de memoria de los buffers sintetizados guardados (PCM float32 a 22,05 kHz: ~88 kB por segundo). */
export const MEMORIA_RECETAS = 4 * 1024 * 1024;
/** La ganancia por defecto del colchón de ambiente: ×0,2 = −14 dB sobre un fichero subido a −23 LUFS (≈ −37 LUFS:
 *  debajo de todo, pero se oye). El nivel del original (×0,042, −50,6 LUFS) no se oía en unos auriculares (Pablo,
 *  2026-10-19). El director del mundo puede cambiarlo (`ficha.json` → `audio.ambiente_ganancia`) y el deslizador del
 *  jugador manda por encima. */
export const AMBIENTE_GANANCIA_DEF = 0.2;
/** Lo más que un mundo puede subir el colchón: ×4 (+12 dB sobre un fichero de −23 LUFS). */
export const AMBIENTE_GANANCIA_MAX = 4;
/** El bus de las camas y capas de ambiente: lo que suene aquí por receta está apagado salvo que un mundo lo pida. */
export const BUS_AMBIENTE: Bus = "ambiente";

/** Los materiales con sonido de paso que hay en el catálogo. */
export const MATERIALES = ["piedra", "madera", "metal", "hierba", "arena", "nieve", "agua"] as const;
export type Material = (typeof MATERIALES)[number];
/** Cuando el motor no sabe de qué es el suelo, los pasos suenan a piedra (que es lo que había antes de la fusión). */
export const MATERIAL_DEF: Material = "piedra";
/** El id del catálogo de los pasos de cada material. */
export const PASO_DE: Readonly<Record<Material, string>> = {
  piedra: "pasos-piedra", madera: "pasos-madera", metal: "pasos-metal", hierba: "pasos-hierba", arena: "pasos-arena", nieve: "pasos-nieve", agua: "pasos-agua",
};
/** El tipo de suelo de la ZONA (`entorno@1`: hierba, tierra, arena, roca, nieve, liso) → material de los pasos.
 *  Esto es lo más que el motor sabe hoy del suelo: es por zona, no por superficie, así que un tablado de madera sobre
 *  una zona de roca sigue sonando a piedra. Eso es la historia S8 del diseño (materiales por superficie), pendiente. */
export const MATERIAL_DE_SUELO: Readonly<Record<string, Material>> = {
  hierba: "hierba", cesped: "hierba", prado: "hierba",
  // arena and tierra step on sand, nieve on snow (Galatea, 2026-10-22: they all stepped on stone, and grass played the sand takes)
  arena: "arena", tierra: "arena", playa: "arena", nieve: "nieve",
  roca: "piedra", piedra: "piedra", liso: "piedra", baldosa: "piedra",
  madera: "madera", tablado: "madera",
  metal: "metal", rejilla: "metal",
  agua: "agua", charco: "agua",
};

/** El material de los pasos para un tipo de suelo de zona. Lo que no conoce, piedra: nunca se queda callado. */
export const materialDeSuelo = (tipo: string | null | undefined): Material =>
  (tipo && MATERIAL_DE_SUELO[String(tipo).toLowerCase()]) || MATERIAL_DEF;

/** ¿Es este bus el del ambiente? Lo que suene por RECETA en este bus está apagado salvo que un mundo lo pida. */
export const esAmbienteSintetizado = (bus: Bus | undefined): boolean => bus === BUS_AMBIENTE;

export type Opciones = {
  /** La semilla del SERVIDOR: con la misma, todas las páginas eligen la misma variante y el mismo tono. */
  semilla?: number;
  /** Fuerza una variante concreta (pruebas, y la página de oír las recetas). Manda sobre la semilla. */
  variante?: number;
  /** Dónde suena. `null` o sin decir nada = en la cabeza, sin panner (la interfaz, los avisos, mis propios pasos). */
  donde?: { x: number; y: number; z: number } | null;
  gain?: number;
  /** Factor de velocidad base (1 = tal cual). La variación de la semilla se multiplica encima. */
  tono?: number;
  /** Fuerza el bus. Sin esto, el del catálogo; y si no hay fila, el de la receta. */
  bus?: Bus;
  bucle?: boolean;
  /** ms; `0` = sin cooldown. Sin decir nada, el del catálogo. */
  cooldown?: number;
};

/** Lo que un mundo pide del ambiente (`ficha.json` → `audio`). Todo opcional: lo que no se dice, no suena. */
export type PeticionAmbiente = {
  /** El id del catálogo que suena como cama única en bucle por streaming. `null` o sin decir nada: ningún colchón. */
  id?: string | null;
  /** Su volumen (×). Sin decir nada, `AMBIENTE_GANANCIA_DEF`. A 0, no arranca. */
  ganancia?: number;
  /** Las camas y capas SINTETIZADAS que este mundo enciende por nombre. Sin decir nada, ninguna. */
  sintetizado?: readonly string[];
};

export type FuenteId = "fichero" | "receta" | "nada";

export type EstadoPuerta = {
  /** Cuántos disparos salieron por fichero y cuántos por receta: el reparto real de la regla, en vivo. */
  ficheros: number;
  recetas: number;
  fallados: number;
  /** Buffers sintetizados guardados y lo que ocupan. */
  guardados: number;
  memoria: number;
  /** El colchón que suena ahora, o null. */
  colchon: { id: string; ganancia: number } | null;
  /** Las camas y capas sintetizadas que este mundo ha encendido (de serie, ninguna). */
  sintetizado: readonly string[];
  avisos: readonly string[];
};

export type Puerta = {
  /** Hacer sonar un id. `false` = no sonó (no hay fichero ni receta, el cooldown lo cortó, el pool estaba lleno, o es
   *  una cama sintetizada que este mundo no ha encendido). Nunca lanza. */
  sonar(id: string, o?: Opciones): boolean;
  /** Un paso con el material que toque. Sin material, piedra. */
  paso(material?: Material, o?: Opciones): boolean;
  /** De dónde saldría este id: del fichero, de la receta, o de nada. */
  fuenteDe(id: string): FuenteId;
  /** Lo que el mundo pide del ambiente. Enciende o apaga el colchón y las camas sintetizadas. Devuelve si el colchón
   *  quedó sonando. Llamarlo otra vez con otra cosa cambia lo que suena (R-1: una línea lo enciende o lo cambia). */
  ambiente(p?: PeticionAmbiente): boolean;
  /** Para todo lo de un id (y el colchón con su propio id). */
  parar(id: string): void;
  /** Tira los buffers guardados (cuando el mundo cambia y ya no hacen falta). */
  olvidar(): void;
  estado(): EstadoPuerta;
};

export type HechurasPuerta = {
  nucleo?: Nucleo;
  voces?: Voces;
  sonidos?: Sonidos;
  /** De dónde sale el PCM de una receta (en las pruebas, de mentira; en el motor, `sintesis.ts`). */
  generar?: (id: string, variante: number) => { datos: Float32Array; sr?: number } | null;
  /** Qué recetas hay (en las pruebas, otras). */
  recetas?: Readonly<Record<string, { bus: Bus; bucle?: boolean }>>;
  avisar?: (m: string) => void;
};

const AVISOS_MAX = 24;

/** Interpolación lineal de `datos` de `de` Hz a `a` Hz. Solo para la red: lo normal es dejar que lo haga el navegador,
 *  que interpola mucho mejor. Mantiene la duración (más muestras, el mismo tiempo). */
export function remuestrear(datos: Float32Array, de: number, a: number): Float32Array {
  if (de === a || !Number.isFinite(de) || !Number.isFinite(a) || de <= 0 || a <= 0) return datos;
  const n = Math.max(1, Math.round((datos.length * a) / de));
  const out = new Float32Array(n);
  const paso = (datos.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * paso, j = Math.floor(x), f = x - j;
    const a0 = datos[Math.min(j, datos.length - 1)], a1 = datos[Math.min(j + 1, datos.length - 1)];
    out[i] = a0 + (a1 - a0) * f;
  }
  return out;
}

/** El mismo FNV-1a de `voces.ts`, para que la variante de una receta se elija IGUAL que la de un fichero: dos páginas
 *  con la misma semilla tienen que oír la misma cosa, venga de donde venga. */
function huella(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const varianteDe = (id: string, semilla: number | undefined, cuantas: number): number => {
  if (cuantas <= 1) return 0;
  const s = Number.isFinite(semilla) ? (semilla as number) : huella(id) ^ Math.floor(Math.random() * 0xffffffff);
  // xorshift de una vuelta: mezcla lo bastante para que semillas seguidas no caigan siempre en la misma variante
  let x = (huella(id) ^ (s >>> 0)) >>> 0;
  x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
  return x % cuantas;
};

/** La puerta. Sin hechuras usa el núcleo, el pool y el catálogo de la página, y las recetas de `sintesis.ts`. */
export function crearPuerta(h: HechurasPuerta = {}): Puerta {
  const nucleo = h.nucleo ?? (audio() as Nucleo);
  const voces = h.voces ?? crearVoces({ nucleo });
  const cat = h.sonidos ?? sonidosDePagina() ?? crearSonidos({ nucleo, voces });
  const recetas = h.recetas ?? (RECETAS as Readonly<Record<string, { bus: Bus; bucle?: boolean }>>);
  const generar = h.generar ?? ((id, v) => generarReceta(id, v) as Receta | null);
  const avisos: string[] = [];
  const dichos = new Set<string>();
  const avisar = (m: string): void => {
    if (avisos.length < AVISOS_MAX) avisos.push(m);
    (h.avisar ?? ((x: string) => console.warn(`[sonar] ${x}`)))(m);
  };
  /** Un aviso que solo se dice una vez por clave: un id que no existe se dispara mil veces en un bucle de juego. */
  const unaVez = (clave: string, m: string): void => { if (!dichos.has(clave)) { dichos.add(clave); avisar(m); } };

  const guardados = new Map<string, AudioBuffer>();
  let memoria = 0;
  let ficheros = 0, recetasTocadas = 0, fallados = 0;
  let colchon: { id: string; ganancia: number; voz: Voz } | null = null;
  let sintetizado: string[] = [];

  const fila = (id: string): SonidoTabla | null => { try { return cat.fila(id); } catch { return null; } };
  const hayFichero = (f: SonidoTabla | null): boolean => !!f && f.fuente === "fichero" && f.variantes.length > 0;

  const fuenteDe = (id: string): FuenteId => {
    if (hayFichero(fila(id))) return "fichero";
    return recetas[id] ? "receta" : "nada";
  };

  /** El `AudioBuffer` de una receta, generado UNA vez y guardado por id#variante. `null` si no se pudo. */
  function bufferDe(id: string, v: number): AudioBuffer | null {
    const clave = `${id}#${v}`;
    const ya = guardados.get(clave);
    if (ya) return ya;
    let s: { datos: Float32Array; sr?: number } | null = null;
    try { s = generar(id, v); } catch (e) { unaVez(`gen:${id}`, `«${id}»: la receta falló (${(e as Error)?.message ?? e})`); return null; }
    if (!s || !s.datos?.length) return null;
    const ctx = nucleo.ctx();
    if (!ctx) return null;
    const sr = s.sr && s.sr > 0 ? s.sr : SR;
    let datos = s.datos, hz = sr;
    let buf: AudioBuffer;
    try {
      // a su propia frecuencia: el navegador remuestrea al tocarlo, y lo hace mejor que una interpolación lineal
      buf = ctx.createBuffer(1, datos.length, hz);
    } catch {
      // la red: algún navegador no acepta un buffer a 22.050 Hz. Entonces se interpola a mano a la del contexto.
      hz = ctx.sampleRate || 48000;
      datos = remuestrear(s.datos, sr, hz);
      try { buf = ctx.createBuffer(1, datos.length, hz); } catch (e) { unaVez(`buf:${id}`, `«${id}»: no se pudo crear el buffer (${(e as Error)?.message ?? e})`); return null; }
    }
    try { buf.copyToChannel(datos, 0); } catch { buf.getChannelData(0).set(datos); }
    if (memoria + datos.length * 4 > MEMORIA_RECETAS) {
      // la más vieja fuera: un mundo que toca cien recetas no se come la memoria del aparato
      const vieja = guardados.keys().next();
      if (!vieja.done) { const b = guardados.get(vieja.value)!; memoria -= b.length * 4; guardados.delete(vieja.value); }
    }
    guardados.set(clave, buf);
    memoria += datos.length * 4;
    return buf;
  }

  function sonar(id: string, o: Opciones = {}): boolean {
    if (!id) return false;
    const f = fila(id);

    // ── (a) el fichero gana ──
    if (hayFichero(f)) {
      const ok = cat.suena({ id, semilla: o.semilla, donde: o.donde ?? null, gain: o.gain, tono: o.tono, bucle: o.bucle });
      if (ok) ficheros++; else fallados++;
      return ok;
    }

    // ── (b) la receta, de respaldo ──
    const rc = recetas[id];
    if (!rc) {
      fallados++;
      unaVez(`no:${id}`, `«${id}»: ni fichero en el catálogo ni receta en sintesis.ts; no suena nada`);
      return false;
    }
    const bus = o.bus ?? f?.bus ?? rc.bus;
    // las camas y capas SINTETIZADAS están apagadas de serie (decisión de Pablo): solo las que el mundo nombre
    if (esAmbienteSintetizado(bus) && !sintetizado.includes(id)) {
      unaVez(`amb:${id}`, `«${id}» es una cama sintetizada y está apagado de serie: el mundo tiene que pedirlo en ficha.json → audio.ambiente_sintetizado`);
      return false;
    }
    const v = Number.isInteger(o.variante) ? (o.variante as number) % VARIANTES_RECETA : varianteDe(id, o.semilla, VARIANTES_RECETA);
    const buf = bufferDe(id, v);
    if (!buf) { fallados++; return false; }
    const voz = voces.reproducir({
      id, buffer: buf, bus,
      posicion: o.donde ?? null,
      gain: o.gain,
      tono: o.tono,
      loop: o.bucle ?? rc.bucle ?? false,
      prioridad: f?.prioridad,
      cooldown: o.cooldown ?? f?.cooldown_ms,
      semilla: o.semilla,
    });
    if (voz) recetasTocadas++; else fallados++;
    return !!voz;
  }

  const paso = (material: Material = MATERIAL_DEF, o: Opciones = {}): boolean =>
    sonar(PASO_DE[material] ?? PASO_DE[MATERIAL_DEF], { gain: 0.14, ...o });

  function ambiente(p: PeticionAmbiente = {}): boolean {
    // las camas sintetizadas: solo las que este mundo nombre, y solo si de verdad son recetas de ambiente
    const pedidas = (p.sintetizado ?? []).filter((id) => {
      const rc = recetas[id];
      if (!rc) { unaVez(`amb-no:${id}`, `el mundo pide la cama sintetizada «${id}», que no existe`); return false; }
      return true;
    });
    sintetizado = [...new Set(pedidas)];

    // el colchón
    const id = p.id ?? null;
    const g = Math.min(AMBIENTE_GANANCIA_MAX, Math.max(0, Number.isFinite(p.ganancia) ? (p.ganancia as number) : AMBIENTE_GANANCIA_DEF));
    if (colchon && (colchon.id !== id || colchon.ganancia !== g)) { colchon.voz.parar(); colchon = null; }
    if (!id || g <= 0) return false;
    if (colchon) return true;
    // el deslizador del jugador manda por encima: a cero, el colchón no arranca (ni se descarga)
    const vol = nucleo.estado().volumen[BUS_AMBIENTE];
    if (!(vol > 0)) return false;
    const f = fila(id);
    if (!hayFichero(f) || !f!.bucle) {
      avisar(`«${id}» no puede ser el colchón de ambiente: hace falta una fila del catálogo con fichero y «bucle»`);
      return false;
    }
    const uri = cat.uri(id, 0);
    if (!uri) { avisar(`«${id}»: el catálogo no da la URL de su fichero`); return false; }
    // CAMA, no buffer: `voces.cama` lo toca por `MediaElementAudioSourceNode` y NUNCA lo descodifica (113 s estéreo
    // en PCM float32 a 48 kHz serían ~46 MB de RAM, por un sonido que nadie escucha a propósito).
    const voz = voces.cama({ id, uri, bus: BUS_AMBIENTE, gain: g, posicion: null, loop: true });
    if (!voz) { avisar(`«${id}»: el colchón no pudo arrancar`); return false; }
    colchon = { id, ganancia: g, voz };
    return true;
  }

  return {
    sonar, paso, fuenteDe, ambiente,
    parar(id) { if (colchon?.id === id) { colchon.voz.parar(); colchon = null; } voces.parar(id); },
    olvidar() { guardados.clear(); memoria = 0; },
    estado: () => ({
      ficheros, recetas: recetasTocadas, fallados,
      guardados: guardados.size, memoria,
      colchon: colchon ? { id: colchon.id, ganancia: colchon.ganancia } : null,
      sintetizado: [...sintetizado],
      avisos: [...avisos],
    }),
  };
}

// ───────────────────────── la puerta de ESTA página ─────────────────────────

let unica: Puerta | null = null;
/** La puerta de esta página (la construye al primer uso). Es lo que llama todo el motor para hacer sonar algo. */
export const puerta = (): Puerta => (unica ??= crearPuerta());
/** Pone la puerta de la página (`apps/plaza/main.ts` al arrancar, y las pruebas). Devuelve la que queda. */
export const ponerPuerta = (p: Puerta): Puerta => (unica = p);

/** El atajo de toda la vida: `sonar("ui-pulsar")`. */
export const sonar = (id: string, o?: Opciones): boolean => puerta().sonar(id, o);

/** Los buses que existen, re-exportados para quien solo importe esta puerta. */
export { BUSES };
