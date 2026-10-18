// Núcleo del motor de audio (S1): UN solo `AudioContext` y UN solo grafo para todo lo que suena en el mundo (medios,
// voz de la gente, avisos de la casa, música). Hasta hoy había tres caminos sin relación entre sí; a partir de aquí
// todos entran por los mismos ocho buses, con el volumen de la persona en su VCA y un limitador al final como red de
// seguridad. Este módulo NO reproduce nada: solo da el contexto y el nodo al que conectarse (el pool de voces es S3).
//
// Por qué vive en `packages/render`: el grafo es salida de navegador, igual que el dibujo, y `render` es el paquete que
// (por `tools/layers.json`) no puede importar ningún otro — así que es el único sitio desde el que `medios.ts` podrá
// conectarse al grafo en S4 sin romper la regla de capas; `apps/plaza` sí puede importar de aquí. El gesto compartido
// con los medios está en `../gesto.ts`.
//
// Lo copiado y transformado (ficha completa en work/motor-ar/sonido/DISENO-SONIDO.md §9):
//  - buses de grupo con propiedades acumulativas y VCA fuera del routing → Wwise / FMOD (solo conceptos: licencias
//    cerradas, ni una línea de su código). En Web Audio el VCA hay que materializarlo: es un `GainNode` por bus.
//  - ducking por bus → Auto-Ducking de Wwise, con recuperación de 600 ms en vez de 1 s (conversación social) y sin
//    side-chain, porque Web Audio no lo tiene: es automatización de `gain` con `setTargetAtTime`.
//  - limitador de salida → `DynamicsCompressorNode` con los valores del diseño (−3 / knee 0 / ratio 20 / 3 ms / 100 ms);
//    no es un limitador true-peak (el spec no garantiza lookahead): red de seguridad, no herramienta de mezcla.
// Accesibilidad primero: `interfaz`, `voz-gente` y `voz-lector` NUNCA se duckean y tienen suelo mínimo de volumen.
import { enCadaGesto, hayGesto, trasGesto } from "../gesto.ts";

/** Los ocho buses fijos del motor. Cada mundo activa lo que quiera: nadie puede añadir ni quitar buses. */
export const BUSES = ["master", "musica", "ambiente", "efectos", "interfaz", "voz-gente", "voz-lector", "pasos-propios"] as const;
export type Bus = (typeof BUSES)[number];

/** Decibelios a factor lineal de ganancia. */
export const dB = (d: number): number => 10 ** (d / 20);

/** Cuánto baja cada bus mientras alguien habla (dB). Los demás buses no se duckean. */
export const DUCK_DB: Readonly<Partial<Record<Bus, number>>> = { musica: -9, ambiente: -6, efectos: -3 };
/** Constante de tiempo de `setTargetAtTime` al empezar a duckear (s) y al recuperar (s). */
export const DUCK_ATAQUE_S = 0.08;
export const DUCK_RECUPERA_S = 0.6;
/** Buses de información: nunca se duckean y nunca se quedan por debajo de `SUELO` (accesibilidad). */
export const INMUNES: readonly Bus[] = ["interfaz", "voz-gente", "voz-lector"];
/** Suelo mínimo de volumen de los buses inmunes: un aviso o un lector de pantalla no se pueden apagar del todo. */
export const SUELO = 0.2;
/** Lo que se le pone al limitador del máster (diseño §3; los defectos del nodo son otros y hay que cambiarlos). */
export const LIMITADOR = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.1 } as const;
/** Cuánto tarda el volumen de un deslizador en llegar (s): corto, pero sin saltos audibles. */
const AJUSTE_S = 0.02;

/** Qué deslizador de «Sonido» manda en cada bus. Los buses sin deslizador propio van con el que más se les parece;
 *  cuando el menú tenga una fila por bus (una historia posterior) esta tabla es lo único que cambia. */
export const AJUSTE_DE: Readonly<Record<Bus, string>> = {
  master: "sonido.general",
  musica: "sonido.musica",
  ambiente: "sonido.efectos",
  efectos: "sonido.efectos",
  interfaz: "sonido.efectos",
  "voz-gente": "sonido.voz",
  "voz-lector": "sonido.voz",
  "pasos-propios": "sonido.efectos",
};
/** Valor por defecto de cada deslizador (packages/client/src/ajustes-motor.ts), en 0–100. */
const DEFECTO: Readonly<Record<string, number>> = { "sonido.general": 80, "sonido.musica": 60, "sonido.efectos": 80, "sonido.voz": 100 };

export type Estado = {
  /** `"sin-audio"` = este navegador no dio un `AudioContext` (o todavía no hizo falta construir el grafo). */
  contexto: AudioContextState | "sin-audio";
  /** ¿Está el grafo construido? */
  grafo: boolean;
  /** ¿Hubo ya un gesto de la persona? Sin él nada puede sonar. */
  gesto: boolean;
  /** ¿Está duckeado ahora mismo? */
  duck: boolean;
  /** Por qué está suspendido a propósito (pestaña oculta, salida de XR…). */
  pausas: readonly string[];
  /** Volumen 0–1 de cada bus (lo que pide la persona, ya con el suelo de accesibilidad aplicado). */
  volumen: Record<Bus, number>;
};

export type Nucleo = {
  /** ¿Se puede sonar ya? (grafo construido y contexto corriendo). */
  listo(): boolean;
  /** El único `AudioContext` del motor, construyendo el grafo si hace falta. `null` si el navegador no da audio. */
  ctx(): AudioContext | null;
  /** El nodo al que conectar lo que suene en ese bus (construye el grafo la primera vez). */
  bus(nombre: Bus): GainNode | null;
  /** Volumen que pide la persona, 0–1 (los buses inmunes no bajan de `SUELO`). */
  volumen(nombre: Bus, v: number): void;
  /** Leer los cuatro deslizadores de «Sonido» y ponerlos en los VCA. No construye el grafo por sí solo. */
  aplicarAjustes(leer: (id: string) => unknown): void;
  /** Alguien está hablando (o el lector de pantalla): baja música, ambiente y efectos. */
  duck(activo: boolean): void;
  /** Suspender a propósito mientras dure la razón (pestaña oculta). Con `false` vuelve si nada más lo impide. */
  pausar(activo: boolean, razon?: string): void;
  /** Suspender UNA vez, sin razón que dure: al salir de la sesión XR. El siguiente gesto lo despierta solo. */
  siesta(): void;
  estado(): Estado;
};

/** Lo que el núcleo necesita del mundo exterior; todo tiene su valor real y en las pruebas se sustituye. */
export type Hechuras = {
  crear?: () => AudioContext;
  trasGesto?: (fn: () => void) => void;
  enCadaGesto?: (fn: () => void) => void;
  hayGesto?: () => boolean;
  /** Avisar de que la pestaña se ocultó o volvió; devuelve si está oculta ahora. */
  visibilidad?: (fn: (oculta: boolean) => void) => boolean;
};

const recorta = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function crearNucleo(h: Hechuras = {}): Nucleo {
  const crear = h.crear ?? (() => new AudioContext({ latencyHint: "interactive" }));
  const esperarGesto = h.trasGesto ?? trasGesto;
  const cadaGesto = h.enCadaGesto ?? enCadaGesto;
  const gestoYa = h.hayGesto ?? hayGesto;

  let ctx: AudioContext | null = null, roto = false;
  const bus = new Map<Bus, GainNode>();      // donde se conecta lo que suena; aquí automatiza el ducking
  const vca = new Map<Bus, GainNode>();      // el deslizador de la persona (conceptualmente fuera del routing, FMOD)
  let limitador: DynamicsCompressorNode | null = null;
  const volumen = {} as Record<Bus, number>;
  for (const b of BUSES) volumen[b] = conSuelo(b, (DEFECTO[AJUSTE_DE[b]] ?? 100) / 100);
  let duckActivo = false;
  const pausas = new Set<string>();

  function conSuelo(b: Bus, v: number): number { return INMUNES.includes(b) ? Math.max(SUELO, recorta(v)) : recorta(v); }
  const ahora = (): number => ctx?.currentTime ?? 0;
  /** `setTargetAtTime` donde exista (a-rate, sin zipper noise); si no, el valor a secas. */
  function llevar(p: AudioParam | undefined, v: number, tau: number): void {
    if (!p) return;
    try { if (typeof p.setTargetAtTime === "function") p.setTargetAtTime(v, ahora(), tau); else p.value = v; }
    catch { try { p.value = v; } catch { /* un parámetro que no se deja: el resto del grafo sigue */ } }
  }

  function construir(): AudioContext | null {
    if (ctx || roto) return ctx;
    try { ctx = crear(); } catch { roto = true; return null; }
    const c = ctx;
    try {
      limitador = c.createDynamicsCompressor();
      limitador.threshold.value = LIMITADOR.threshold; limitador.knee.value = LIMITADOR.knee;
      limitador.ratio.value = LIMITADOR.ratio; limitador.attack.value = LIMITADOR.attack; limitador.release.value = LIMITADOR.release;
      limitador.connect(c.destination);
      for (const b of BUSES) {
        const g = c.createGain(), v = c.createGain();
        g.connect(v);
        bus.set(b, g); vca.set(b, v);
      }
      // los siete grupos cuelgan del bus máster; el máster cuelga del limitador y el limitador de la salida
      for (const b of BUSES) {
        if (b === "master") vca.get(b)!.connect(limitador);
        else vca.get(b)!.connect(bus.get("master")!);
      }
      for (const b of BUSES) { vca.get(b)!.gain.value = volumen[b]; bus.get(b)!.gain.value = duckDe(b); }
    } catch { roto = true; ctx = null; bus.clear(); vca.clear(); limitador = null; return null; }
    // nace suspendido mientras no haya habido un gesto: antes de eso no puede sonar nada (política de autoplay)
    if (!gestoYa()) { try { void c.suspend?.(); } catch { /* algunos navegadores ya lo dan suspendido */ } }
    esperarGesto(() => reanudar());
    cadaGesto(() => reanudar());  // un contexto suspendido (pestaña, XR, `interrupted` de iOS) vuelve al siguiente gesto
    try { c.addEventListener?.("statechange", () => { if (c.state === "interrupted") reanudar(); }); } catch { /* sin eventos aquí */ }
    if (pausas.size === 0 && gestoYa()) reanudar();
    return ctx;
  }

  function reanudar(): void {
    if (!ctx || pausas.size > 0 || !gestoYa()) return;
    if (ctx.state === "running") return;
    try { void ctx.resume?.(); } catch { /* no se pudo: el siguiente gesto lo reintenta */ }
  }

  const duckDe = (b: Bus): number => (duckActivo ? dB(DUCK_DB[b] ?? 0) : 1);

  const api: Nucleo = {
    listo(): boolean { return !!ctx && !!limitador && ctx.state === "running"; },
    ctx(): AudioContext | null { return construir(); },
    bus(nombre: Bus): GainNode | null { construir(); return bus.get(nombre) ?? null; },
    volumen(nombre: Bus, v: number): void {
      if (!BUSES.includes(nombre)) return;
      volumen[nombre] = conSuelo(nombre, v);
      llevar(vca.get(nombre)?.gain, volumen[nombre], AJUSTE_S); // si el grafo no existe aún, se aplica al construirlo
    },
    aplicarAjustes(leer: (id: string) => unknown): void {
      for (const b of BUSES) {
        const id = AJUSTE_DE[b], n = Number(leer(id) ?? DEFECTO[id] ?? 100);
        api.volumen(b, (Number.isFinite(n) ? n : (DEFECTO[id] ?? 100)) / 100);
      }
    },
    duck(activo: boolean): void {
      if (activo === duckActivo) return;
      duckActivo = activo;
      const tau = activo ? DUCK_ATAQUE_S : DUCK_RECUPERA_S;
      for (const b of BUSES) { if (DUCK_DB[b] !== undefined) llevar(bus.get(b)?.gain, duckDe(b), tau); }
    },
    pausar(activo: boolean, razon = "pagina"): void {
      if (activo) {
        pausas.add(razon);
        if (ctx) { try { void ctx.suspend?.(); } catch { /* ya suspendido */ } }
      } else { pausas.delete(razon); reanudar(); }
    },
    siesta(): void { if (ctx) { try { void ctx.suspend?.(); } catch { /* ya suspendido */ } } },
    estado(): Estado {
      return {
        contexto: ctx?.state ?? "sin-audio",
        grafo: !!limitador,
        gesto: gestoYa(),
        duck: duckActivo,
        pausas: [...pausas],
        volumen: { ...volumen },
      };
    },
  };

  // el móvil no se calienta y la pestaña oculta no suena: se suspende mientras no se ve
  const visibilidad = h.visibilidad ?? ((fn: (oculta: boolean) => void) => {
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") return false;
    document.addEventListener("visibilitychange", () => fn(document.hidden === true));
    return document.hidden === true;
  });
  if (visibilidad((oculta) => api.pausar(oculta, "pagina"))) pausas.add("pagina");

  return api;
}

let unico: Nucleo | null = null;
/** El núcleo de audio de esta página: uno y solo uno (el spec dice que un `AudioContext` es caro y basta con uno). */
export function audio(): Nucleo { return (unico ??= crearNucleo()); }
