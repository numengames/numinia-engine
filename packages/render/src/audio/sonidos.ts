// S6 · el catálogo de sonidos, en la página. Esto es la mano que TOCA lo que el servidor decidió: se trae una vez la
// tabla de la casa (`GET /sonidos.json`, la que sirve `features/sonido`), elige opus o m4a según lo que mida este
// navegador, y se lo pasa a `voces.ts` con la SEMILLA del servidor — así todas las páginas eligen la misma variante y
// la misma variación de tono en el mismo instante.
//
// Lo que NO hace, a propósito:
//  - no decide qué suena (eso es del servidor: `features/sonido/server.ts`),
//  - no mete ni un byte de audio en el paquete de arranque: la tabla se descarga y los ficheros se piden por su
//    sha256 a `GET /a/<sha256>.opus`, con un año de caché e `immutable` (`packages/server/src/activos.ts`),
//  - no espacializa un aviso: un sonido sin `donde` va SIN panner (en la cabeza), que es lo que pide la interfaz.
//
// Por qué dos formatos: Opus a 40 kbps es la mitad de bytes que el AAC equivalente, y lo mide Chrome, Firefox, Edge y
// Safari 17.5+ en macOS; el `.m4a` es el respaldo para Safari viejo y para iOS, donde `.opus` en contenedor Ogg
// todavía no se mide. Se elige UNA vez por página con `canPlayType`, no por fichero.
import { audio } from "./nucleo.ts";
import type { Bus, Nucleo } from "./nucleo.ts";
import { crearVoces } from "./voces.ts";
import type { Variante as VarianteVoz, Voces, Voz } from "./voces.ts";

/** Una variante como viene en la tabla de la página: su URL por contenido y su peso (a más peso, más veces sale). */
export type VarianteTabla = { url: string; respaldo: string; peso: number };
/** De dónde sale el sonido de un id: de un FICHERO CC0 del catálogo, o de una RECETA de `sintesis.ts` (sin fichero).
 *  La regla de la fusión (Pablo, 19-10): cuando existe el fichero de un id, **gana el fichero** y la receta queda de
 *  respaldo; una fila `receta` es una fila del catálogo sin fichero, que solo trae bus, prioridad, cooldown y texto. */
export type FuenteTabla = "fichero" | "receta";
export type SonidoTabla = { bus: Bus; prioridad: number; cooldown_ms: number; texto: string; bucle: boolean; fuente: FuenteTabla; variantes: VarianteTabla[] };
/** `GET /sonidos.json`: los siete avisos de la casa (nombre → id) y los ids con sus variantes. */
export type Tabla = { schema?: string; casa: Record<string, string>; sonidos: Record<string, SonidoTabla> };

export const RUTA_TABLA = "/sonidos.json";
/** Variación por defecto de un sonido del catálogo: ±4 % de tono y ±2 dB, para que doce golpes no suenen a bucle. */
export const VARIACION = { tono: 0.04, volumen: 0.12 } as const;

export type Peticion = { id: string; semilla?: number; donde?: { x: number; y: number; z: number } | null; texto?: string; gain?: number; tono?: number; bucle?: boolean };

export type Sonidos = {
  /** ¿Está la tabla? Hasta que esté, `suena` devuelve false y quien llama se queda con su respaldo. */
  listo(): boolean;
  /** Trae la tabla una vez (si ya está, no la vuelve a pedir). Nunca lanza: devuelve si la tiene. */
  cargar(): Promise<boolean>;
  /** Mete la tabla a mano (pruebas, o un mundo que la sirve de otro sitio). */
  poner(t: unknown): boolean;
  tabla(): Tabla | null;
  /** El id del catálogo de uno de los siete avisos de la casa («exito», «aviso», …), o null. */
  casa(nombre: string): string | null;
  /** La fila del catálogo de este id (bus, prioridad, cooldown, texto, de dónde sale), o null si no está. */
  fila(id: string): SonidoTabla | null;
  /** La URL de la variante `i` de un id CON FICHERO, en el formato que mide este navegador (null si no hay). */
  uri(id: string, i?: number): string | null;
  /** Toca lo que el SERVIDOR decidió, **por fichero**. `donde` null = en la cabeza, sin panner. false = no pudo (sin
   *  tabla, sin audio, id desconocido, una fila sin fichero, o el cooldown lo cortó): quien llama se queda con su
   *  respaldo — y el respaldo es la receta, por la puerta única de `sonar.ts`. */
  suena(p: Peticion): boolean;
  /** Descodifica ya los ficheros de unos ids (los avisos, al primer gesto de la persona) para que el primero no
   *  llegue tarde. Devuelve cuántos buffers quedaron en la caché. */
  precargar(ids: readonly string[]): Promise<number>;
  estado(): { tabla: boolean; ids: number; formato: "opus" | "m4a"; tocados: number; fallados: number; avisos: readonly string[] };
};

export type HechurasSonidos = {
  nucleo?: Nucleo;
  voces?: Voces;
  /** De dónde sale la tabla (en las pruebas, sin red). */
  traer?: (ruta: string) => Promise<unknown>;
  /** ¿Mide este navegador este tipo? (en las pruebas, a mano). */
  puede?: (mime: string) => boolean;
  /** Qué ruta pedir (un mundo puede servirla con prefijo). */
  ruta?: string;
};

const AVISOS_MAX = 24;

/** Lee la tabla con desconfianza: lo que no encaje se queda fuera y se dice, pero nunca tira la página. */
export function leerTabla(crudo: unknown, avisar: (m: string) => void = () => {}): Tabla | null {
  const o = (crudo ?? null) as Record<string, unknown> | null;
  if (!o || typeof o !== "object") { avisar("la tabla de sonidos no es un objeto"); return null; }
  const fuente = (o.sonidos ?? null) as Record<string, unknown> | null;
  if (!fuente || typeof fuente !== "object") { avisar("la tabla de sonidos no trae «sonidos»"); return null; }
  const sonidos: Record<string, SonidoTabla> = {};
  for (const [id, v] of Object.entries(fuente)) {
    const s = (v ?? {}) as Record<string, unknown>;
    const esReceta = String(s.fuente ?? "fichero") === "receta";
    const vs = Array.isArray(s.variantes) ? s.variantes : [];
    const variantes: VarianteTabla[] = [];
    for (const x of vs) {
      const w = (x ?? {}) as Record<string, unknown>;
      const url = String(w.url ?? ""), respaldo = String(w.respaldo ?? "");
      if (!url.startsWith("/a/")) { avisar(`«${id}»: una variante sin URL de activo: fuera`); continue; }
      variantes.push({ url, respaldo: respaldo.startsWith("/a/") ? respaldo : url, peso: Number(w.peso) > 0 ? Number(w.peso) : 1 });
    }
    // una fila `receta` NO tiene fichero a propósito: es la fila del catálogo de un sonido que hace el motor con una
    // receta de `sintesis.ts`. Sin esta excepción el catálogo dejaría de ser la única lista de verdad (los seis ids
    // nuevos — salto, dano, moneda, pesca-picada, ui-abrir, ui-cerrar — no tendrían dónde declarar su bus ni su texto).
    if (!variantes.length && !esReceta) { avisar(`«${id}» no tiene ninguna variante que suene: fuera`); continue; }
    sonidos[id] = {
      bus: (String(s.bus ?? "efectos") as Bus),
      prioridad: Number(s.prioridad) >= 0 ? Number(s.prioridad) : 50,
      cooldown_ms: Number(s.cooldown_ms) >= 0 ? Number(s.cooldown_ms) : 50,
      texto: String(s.texto ?? ""),
      bucle: s.bucle === true,
      fuente: esReceta || !variantes.length ? "receta" : "fichero",
      variantes,
    };
  }
  const casa: Record<string, string> = {};
  for (const [n, id] of Object.entries((o.casa ?? {}) as Record<string, unknown>)) {
    if (sonidos[String(id)]) casa[n] = String(id);
    else avisar(`el aviso «${n}» apunta a «${String(id)}», que no está en la tabla: se queda con su pitido`);
  }
  return { schema: typeof o.schema === "string" ? o.schema : undefined, casa, sonidos };
}

export function crearSonidos(h: HechurasSonidos = {}): Sonidos {
  const nucleo = h.nucleo ?? audio();
  const voces = h.voces ?? crearVoces({ nucleo });
  const ruta = h.ruta ?? RUTA_TABLA;
  const avisos: string[] = [];
  const avisar = (m: string): void => { if (avisos.length < AVISOS_MAX) { avisos.push(m); console.warn(`[sonidos] ${m}`); } };

  // opus o m4a, UNA vez por página. `canPlayType` devuelve "", "maybe" o "probably": "maybe" ya vale.
  const puede = h.puede ?? ((mime: string): boolean => {
    try {
      const a = typeof document !== "undefined" ? document.createElement("audio") : null;
      return !!a?.canPlayType?.(mime);
    } catch { return false; }
  });
  const formato: "opus" | "m4a" = puede('audio/ogg; codecs="opus"') ? "opus" : "m4a";

  const traer = h.traer ?? (async (r: string): Promise<unknown> => {
    const res = await fetch(r, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  });

  let tabla: Tabla | null = null;
  let pidiendo: Promise<boolean> | null = null;
  let tocados = 0, fallados = 0;

  const poner = (crudo: unknown): boolean => {
    const t = leerTabla(crudo, avisar);
    if (!t) return false;
    tabla = t;
    return true;
  };

  const cargar = (): Promise<boolean> => {
    if (tabla) return Promise.resolve(true);
    pidiendo ??= traer(ruta)
      .then((c) => poner(c))
      .catch((e: unknown) => { avisar(`no pude traer ${ruta} (${String(e)}): los avisos se quedan con su pitido`); return false; })
      .finally(() => { pidiendo = null; });
    return pidiendo;
  };

  const urlsDe = (s: SonidoTabla): VarianteVoz[] =>
    s.variantes.map((v) => ({ uri: formato === "opus" ? v.url : v.respaldo, peso: v.peso }));

  const suena = (p: Peticion): boolean => {
    const s = tabla?.sonidos[p.id];
    if (!s) { fallados++; if (tabla) avisar(`«${p.id}» no está en el catálogo: no suena (y nada se rompe)`); return false; }
    // una fila `receta` no tiene fichero: no es un fallo, es que este id lo hace la receta. Lo resuelve `sonar.ts`.
    if (s.fuente !== "fichero" || !s.variantes.length) return false;
    let v: Voz | null = null;
    try {
      v = voces.reproducir({
        id: p.id,
        bus: s.bus,
        prioridad: s.prioridad,
        cooldown: s.cooldown_ms,
        loop: p.bucle ?? s.bucle,
        // sin `donde` no hay panner: el aviso va en la cabeza, igual en los dos oídos (XAUR: los avisos no se buscan)
        posicion: p.donde ?? null,
        variantes: urlsDe(s),
        semilla: p.semilla,
        gain: p.gain,
        tono: p.tono,
        variacion: VARIACION,
      });
    } catch (e) { avisar(`«${p.id}» no se deja tocar (${String(e)})`); }
    if (v) tocados++; else fallados++;
    return !!v;
  };

  return {
    listo: () => !!tabla,
    cargar,
    poner,
    tabla: () => tabla,
    casa: (nombre) => tabla?.casa[nombre] ?? null,
    fila: (id) => tabla?.sonidos[id] ?? null,
    uri: (id, i = 0) => {
      const s = tabla?.sonidos[id];
      const v = s?.variantes[i];
      if (!s || !v) return null;
      return formato === "opus" ? v.url : v.respaldo;
    },
    suena,
    precargar: async (ids) => {
      if (!tabla) return 0;
      let n = 0;
      for (const id of ids) {
        const s = tabla.sonidos[id];
        if (!s) continue;
        for (const v of urlsDe(s)) {
          if (!v.uri) continue;
          try { if (await voces.cargar(v.uri)) n++; } catch { /* un fichero que no baja no estropea los demás */ }
        }
      }
      return n;
    },
    estado: () => ({ tabla: !!tabla, ids: tabla ? Object.keys(tabla.sonidos).length : 0, formato, tocados, fallados, avisos: [...avisos] }),
  };
}

let unico: Sonidos | null = null;
/** El catálogo de la página (uno por página, como el núcleo de audio). */
export const sonidos = (): Sonidos => (unico ??= crearSonidos());
/** La página pone el suyo (con la ruta del SERVIDOR, que no siempre es su propio origen) antes de dibujar nada. */
export const ponerSonidos = (s: Sonidos): Sonidos => (unico = s);
/** Solo para las pruebas: olvidar el de esta página. */
export const olvidarSonidos = (): void => { unico = null; };
