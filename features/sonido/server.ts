// sonido — server part (S6). El servidor manda: elige el id, la SEMILLA y el sitio, y manda un solo evento `suena`
// a quien toca. Todas las páginas reciben la misma semilla, así que todas eligen la misma variante y la misma
// variación de tono en el mismo instante (`azarDe` en packages/render/src/audio/voces.ts). Nadie pide un sonido
// desde su página: esta pieza no tiene ninguna intención.
//
// Lectura validada al arrancar: `leerCatalogo` comprueba la forma de cada línea del catálogo y, con la puerta que da
// el motor (`api.activo(sha256, "opus")`: ¿está ese fichero en este servidor?), que cada variante EXISTE de verdad
// con ese sha256. Lo que no cuadra se queda fuera con un aviso claro en el registro y un evento `faltan` para las
// funciones del servidor; el mundo sigue sonando con los demás. Nunca se cae.
//
// La comprobación byte a byte (sha256 recalculado sobre el fichero) la hace `test/sonidos.test.ts`, que sí puede
// leer el disco: una función del motor no importa nada de fuera del repo (tools/layers.json).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi, ServerPart } from "../../packages/feature/src/index.ts";
import { sonido, BUSES_SONIDO, COOLDOWN_MAX_MS, ID_SONIDO_RE, OYE_M, PRIORIDAD_MAX, SONIDOS_MAX, VARIANTES_MAX } from "./feature.ts";
import type { BusSonido } from "./feature.ts";
import catalogoCrudo from "./catalogo.json" with { type: "json" };

export type Variante = { fichero: string; sha256: string; bytes: number; peso: number; respaldo: string; respaldo_sha256: string; respaldo_bytes: number };
/** De dónde sale un id: de un FICHERO CC0 de la biblioteca, o de una RECETA de `packages/render/src/audio/sintesis.ts`
 *  (sin fichero: el motor lo sintetiza en el cliente). La regla de Pablo (19-10): cuando existe el fichero, **gana el
 *  fichero** y la receta queda de respaldo. Una fila `receta` existe para que el catálogo siga siendo la ÚNICA lista de
 *  verdad: ahí declara su bus, su prioridad, su cooldown y su texto accesible, igual que los demás. */
export type FuenteSonido = "fichero" | "receta";
/** Licencia que lleva una fila `receta`: no hay fichero de nadie, la receta es código del motor. */
export const LICENCIA_RECETA = "propia";
export type Sonido = {
  id: string; uso: string; bus: BusSonido; lote: string; prioridad: number; cooldown_ms: number; texto: string;
  duracion_s: number; bucle: boolean; licencia: string; autor: string[]; fuente: string[]; variantes: Variante[];
  /** `"receta"` = esta fila no tiene fichero a propósito. */
  fuente_tipo: FuenteSonido;
};
/** El catálogo ya leído: los ids que de verdad se pueden tocar, los siete avisos de la casa y lo que quedó fuera. */
export type Catalogo = { sonidos: Map<string, Sonido>; casa: Record<string, string>; problemas: string[] };

/** Lo que un mundo (o otra función) le pide a la pieza. `donde` null = en la cabeza, sin espacializar (la interfaz y
 *  los avisos). `para` = solo esa persona; sin ella, quien esté a `radio` (OYE_M por defecto) de `donde`, y si
 *  tampoco hay `donde`, todo el mundo. `semilla` solo se pasa para repetir algo a propósito (pruebas). */
export type Suena = (id: string, o?: { donde?: { x: number; y: number; z: number } | null; para?: number; semilla?: number; radio?: number }) => boolean;

const HEX64 = /^[0-9a-f]{64}$/;
const entre = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const texto = (t: unknown, max: number) => String(t ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Una variante, comprobada por su FORMA (que el fichero esté de verdad en este servidor lo mira `comprobarFicheros`). */
export function leerVariante(v: unknown): Variante | string {
  const o = (v ?? {}) as Record<string, unknown>;
  const fichero = String(o.fichero ?? "");
  if (!/^activos\/sonidos\/[a-z0-9_-]+\/[a-z0-9_.-]+\.opus$/.test(fichero)) return `fichero «${fichero.slice(0, 60)}»: los sonidos de la casa viven en activos/sonidos/<id>/<nombre>.opus`;
  const sha = String(o.sha256 ?? "");
  if (!HEX64.test(sha)) return `${fichero}: sha256 debe ser 64 caracteres hexadecimales`;
  const respaldo = String(o.respaldo ?? ""), respaldoSha = String(o.respaldo_sha256 ?? "");
  if (!respaldo.endsWith(".m4a") || !HEX64.test(respaldoSha)) return `${fichero}: falta el respaldo .m4a con su sha256 (Safari todavía no mide con .opus)`;
  return {
    fichero, sha256: sha, bytes: Math.max(0, Math.round(entre(o.bytes, 0, 1e9, 0))),
    peso: entre(o.peso, 0.001, 1000, 1),
    respaldo, respaldo_sha256: respaldoSha, respaldo_bytes: Math.max(0, Math.round(entre(o.respaldo_bytes, 0, 1e9, 0))),
  };
}

/** Un id del catálogo, comprobado (o por qué se queda fuera). Una variante mala no tira el id: tira esa variante y lo
 *  dice; un id sin ninguna variante que suene sí se queda fuera (no hay nada que tocar). */
export function leerSonido(s: unknown): { sonido: Sonido; problemas: string[] } | string {
  const o = (s ?? {}) as Record<string, unknown>;
  const id = String(o.id ?? "");
  if (!ID_SONIDO_RE.test(id)) return `id «${id.slice(0, 32)}»: minúsculas, cifras, guiones y rayas bajas, hasta 32`;
  const bus = String(o.bus ?? "");
  if (!(BUSES_SONIDO as readonly string[]).includes(bus)) return `«${id}»: bus debe ser uno de los ocho del núcleo (${BUSES_SONIDO.join(", ")})`;
  if (bus === "master") return `«${id}»: nada suena directamente en el máster (es la suma de los otros siete)`;
  const t = texto(o.texto, 120);
  if (!t) return `«${id}»: falta «texto» — todo sonido que importa lleva el suyo para quien no oye (XAUR, WCAG 2.2)`;
  // `"fuente": "receta"` marca una fila SIN fichero: el motor la sintetiza (`sintesis.ts`). Las demás filas traen en
  // `fuente` la lista de enlaces de atribución, y entonces esto es un array.
  const esReceta = o.fuente === "receta";
  const licencia = String(o.licencia ?? "");
  if (esReceta) {
    if (licencia !== LICENCIA_RECETA) return `«${id}»: una fila «receta» no tiene fichero de nadie, así que su licencia es «${LICENCIA_RECETA}» (la receta es código del motor), no «${licencia.slice(0, 32)}»`;
    if (Array.isArray(o.variantes) && o.variantes.length) return `«${id}»: una fila «receta» no lleva variantes (si ya tiene fichero, quita «fuente»: el fichero gana)`;
    return {
      sonido: {
        id, uso: texto(o.uso, 120), bus: bus as BusSonido, lote: texto(o.lote, 16),
        prioridad: Math.round(entre(o.prioridad, 0, PRIORIDAD_MAX, 50)),
        cooldown_ms: Math.round(entre(o.cooldown_ms, 0, COOLDOWN_MAX_MS, 50)),
        texto: t, duracion_s: entre(o.duracion_s, 0, 600, 0), bucle: o.bucle === true,
        licencia: LICENCIA_RECETA, autor: [], fuente: ["receta"], variantes: [], fuente_tipo: "receta",
      },
      problemas: [],
    };
  }
  if (licencia !== "CC0-1.0") return `«${id}»: licencia «${licencia.slice(0, 32)}»: en la biblioteca de la casa solo entra CC0-1.0 (docs/SABER.md §3.3)`;
  if (!Array.isArray(o.variantes) || o.variantes.length === 0) return `«${id}»: necesita al menos una variante`;
  if (o.variantes.length > VARIANTES_MAX) return `«${id}»: más de ${VARIANTES_MAX} variantes`;
  const variantes: Variante[] = [], problemas: string[] = [];
  for (const v of o.variantes) {
    const leida = leerVariante(v);
    if (typeof leida === "string") { problemas.push(`«${id}»: ${leida}: esa variante no suena`); continue; }
    variantes.push(leida);
  }
  if (!variantes.length) return `«${id}»: ninguna de sus ${o.variantes.length} variante(s) está bien escrita: no suena (${problemas[0] ?? "sin detalle"})`;
  return {
    sonido: {
      id, uso: texto(o.uso, 120), bus: bus as BusSonido, lote: texto(o.lote, 16),
      prioridad: Math.round(entre(o.prioridad, 0, PRIORIDAD_MAX, 50)),
      cooldown_ms: Math.round(entre(o.cooldown_ms, 0, COOLDOWN_MAX_MS, 50)),
      texto: t, duracion_s: entre(o.duracion_s, 0, 600, 0), bucle: o.bucle === true,
      licencia: "CC0-1.0",
      autor: (Array.isArray(o.autor) ? o.autor : []).map((a) => texto(a, 80)).filter(Boolean),
      fuente: (Array.isArray(o.fuente) ? o.fuente : []).map((a) => texto(a, 200)).filter(Boolean),
      variantes,
      fuente_tipo: "fichero",
    },
    problemas,
  };
}

/** El catálogo entero (`numinia-engine/sonidos@1`): lo que se queda y por qué se fue cada cosa. Nunca lanza. */
export function leerCatalogo(crudo: unknown): Catalogo {
  const problemas: string[] = [], sonidos = new Map<string, Sonido>();
  const o = (crudo ?? {}) as Record<string, unknown>;
  if (String(o.schema ?? "") !== "numinia-engine/sonidos@1") problemas.push(`catalogo.json: schema «${String(o.schema).slice(0, 40)}» no es «numinia-engine/sonidos@1»: lo leo igual, pero puede no encajar`);
  const lista = o.sonidos;
  if (!Array.isArray(lista)) return { sonidos, casa: {}, problemas: [...problemas, "catalogo.json no tiene una lista «sonidos»: no hay ningún sonido de la casa"] };
  for (const l of lista) {
    const leido = leerSonido(l);
    if (typeof leido === "string") { problemas.push(`${leido}`); continue; }
    if (sonidos.has(leido.sonido.id)) { problemas.push(`«${leido.sonido.id}»: id repetido: se queda el primero`); continue; }
    if (sonidos.size >= SONIDOS_MAX) { problemas.push(`«${leido.sonido.id}»: más de ${SONIDOS_MAX} sonidos: no entra`); continue; }
    problemas.push(...leido.problemas);
    sonidos.set(leido.sonido.id, leido.sonido);
  }
  // los siete avisos de la casa (SOUNDS de packages/feature) y el fichero de cada uno: un nombre que apunta a un id
  // que no está se queda fuera, y la página se queda con su respaldo sintetizado para ese aviso
  const casa: Record<string, string> = {};
  for (const [nombre, id] of Object.entries((o.casa ?? {}) as Record<string, unknown>)) {
    const destino = String(id);
    if (!sonidos.has(destino)) { problemas.push(`casa.${nombre} → «${destino.slice(0, 32)}»: ese id no está en el catálogo: ese aviso se queda con su pitido de respaldo`); continue; }
    casa[texto(nombre, 32)] = destino;
  }
  return { sonidos, casa, problemas };
}

/** Segunda vuelta, la que de verdad mira el disco: ¿está en ESTE servidor el fichero de cada variante, con ese
 *  sha256? (`api.activo` es la puerta del motor: `GET /a/<sha256>.opus`). Lo que no esté se cae con un aviso claro y
 *  el resto sigue sonando. Si NO aparece ni uno, este servidor no tiene índice de activos (una prueba, `npm run
 *  describe`): entonces no se quita nada y se dice una sola vez — mejor un catálogo entero sin comprobar que un
 *  mundo muerto. Devuelve los avisos; muta el catálogo. */
export function comprobarFicheros(c: Catalogo, hay: (sha256: string, ext: string) => boolean): string[] {
  let total = 0, estan = 0;
  // las filas `receta` no tienen fichero que comprobar: se saltan sin contarlas (si no, un catálogo de solo recetas
  // parecería «servidor sin índice de activos»).
  for (const s of c.sonidos.values()) for (const v of s.variantes) { total++; if (hay(v.sha256, "opus")) estan++; }
  if (!total) return [];
  if (!estan) return [`este servidor no tiene índice de activos: no puedo comprobar los ${total} fichero(s) del catálogo (si es un servidor de verdad, falta activos/sonidos/: node tools/sonidos-catalogo.ts)`];
  const problemas: string[] = [];
  for (const [id, s] of [...c.sonidos]) {
    if (s.fuente_tipo === "receta") continue;
    const buenas = s.variantes.filter((v) => {
      if (hay(v.sha256, "opus")) return true;
      problemas.push(`«${id}» → ${v.fichero}: no hay ningún ${v.sha256.slice(0, 12)}….opus en este servidor (¿cambió el fichero sin rehacer el catálogo? node tools/sonidos-catalogo.ts): esa variante no suena`);
      return false;
    });
    if (buenas.length === s.variantes.length) continue;
    if (!buenas.length) {
      problemas.push(`«${id}»: ninguno de sus ficheros está aquí: ese sonido no suena (el mundo sigue con los demás)`);
      c.sonidos.delete(id);
      continue;
    }
    c.sonidos.set(id, { ...s, variantes: buenas });
  }
  for (const [nombre, id] of Object.entries(c.casa)) {
    if (c.sonidos.has(id)) continue;
    problemas.push(`casa.${nombre} → «${id}»: ese sonido se quedó fuera: ese aviso vuelve a su pitido de respaldo`);
    delete c.casa[nombre];
  }
  return problemas;
}

/** La tabla que se lleva la página: solo lo que hace falta para tocar (sin sha256 sueltos, sin licencias, sin pesos
 *  de fichero). Se sirve en `GET /sonidos.json` y se cachea: así el catálogo entero (52 kB) NUNCA entra en el
 *  paquete de arranque, que es lo que mide `tools/tamano.mjs`. */
export function tablaDePagina(c: Catalogo): Record<string, unknown> {
  const sonidos: Record<string, unknown> = {};
  for (const s of c.sonidos.values()) {
    sonidos[s.id] = {
      bus: s.bus, prioridad: s.prioridad, cooldown_ms: s.cooldown_ms, texto: s.texto, bucle: s.bucle,
      fuente: s.fuente_tipo,
      variantes: s.variantes.map((v) => ({ url: `/a/${v.sha256}.opus`, respaldo: `/a/${v.respaldo_sha256}.m4a`, peso: v.peso })),
    };
  }
  return { schema: "numinia-engine/sonidos-pagina@1", casa: c.casa, sonidos };
}

export const crearSonido = (opts: {
  catalogo?: unknown;
  /** Se le pasa la puerta `suena` a quien compone el servidor (una aventura, una prueba, otra pieza). */
  alArrancar?: (suena: Suena) => void;
} = {}): ServerPart => serverPart(sonido, (api: ServerApi) => {
  const cat = leerCatalogo(opts.catalogo ?? catalogoCrudo);
  const problemas = [...cat.problemas, ...comprobarFicheros(cat, (sha, ext) => api.activo(sha, ext))];
  for (const p of problemas) api.log(p);
  api.log(`catálogo: ${cat.sonidos.size} sonido(s), ${[...cat.sonidos.values()].reduce((a, s) => a + s.variantes.length, 0)} variante(s)${problemas.length ? `, ${problemas.length} aviso(s)` : ""}`);

  // una semilla por disparo: no hace falta que sea secreta, solo que sea LA MISMA en todas las páginas — y lo es
  // porque viaja dentro del evento. xorshift32 sobre el tick, para que dos disparos del mismo tick no se repitan.
  let s = 0x9e3779b9;
  const semillaNueva = (): number => {
    s = (s ^ ((api.tick() + 1) * 2654435761)) >>> 0;
    s ^= (s << 13) >>> 0; s >>>= 0; s ^= s >>> 17; s ^= (s << 5) >>> 0; s >>>= 0;
    return s >>> 0;
  };

  const suena: Suena = (id, o = {}) => {
    // un mundo puede pedir el id del catálogo («ui-campana») o el nombre del aviso de la casa («campana»): los siete
    // nombres de siempre siguen valiendo, así el cable que ya existía suena igual pero con fichero.
    const pedido = String(id);
    const s2 = cat.sonidos.get(pedido) ?? (cat.casa[pedido] ? cat.sonidos.get(cat.casa[pedido]) : undefined);
    if (!s2) { api.log(`«${pedido.slice(0, 32)}» no está en el catálogo: no suena (y el mundo sigue)`); return false; }
    const donde = o.donde ?? null;
    // ojo: la entidad 0 es una persona de verdad (la primera que entra). Solo `para` SIN decir nada significa
    // «todos»; `para: 0` es esa persona y nadie más.
    const para = o.para === undefined || o.para === null ? null : Math.max(0, Math.round(entre(o.para, 0, 65535, 0)));
    const msg: Msg = {
      sonido: s2.id,
      semilla: o.semilla !== undefined ? Math.abs(Math.floor(o.semilla)) % 4_294_967_296 : semillaNueva(),
      x: donde ? entre(donde.x, -2000, 2000, 0) : 0,
      y: donde ? entre(donde.y, -100, 500, 0) : 0,
      z: donde ? entre(donde.z, -2000, 2000, 0) : 0,
      espacial: !!donde,
      quien: para ?? 0,
      texto: s2.texto,
    };
    if (para !== null) api.emit("suena", msg, { to: para });
    else if (donde) api.emit("suena", msg, { near: { x: msg.x as number, z: msg.z as number }, radius: Math.max(1, entre(o.radio, 1, 2000, OYE_M)) });
    else api.emit("suena", msg, "all");
    return true;
  };
  opts.alArrancar?.(suena);

  // La tabla para las páginas: UNA descarga, cacheable, y fuera del paquete de arranque. Aquí está la razón de que
  // el catálogo entero (con licencias, autores y pesos de fichero) no viaje nunca: la página solo necesita id →
  // variantes por su sha256, bus, prioridad, cooldown y texto. Media hora de caché: el catálogo no cambia mientras
  // el motor vive, y si cambia, cambia también el sha256 de cada fichero (que se pide a /a/ con un año).
  const tabla = tablaDePagina(cat);
  // la tabla es pública (como los ficheros /a/): `cors` deja leerla a la página de dev, que vive en otro puerto
  api.route("GET", "/sonidos.json", () => ({ status: 200, type: "json", cache: "public, max-age=1800", cors: true, body: tabla }));

  api.onJoin(() => {
    if (problemas.length) api.emit("faltan", { cuantos: problemas.length, motivo: texto(problemas[0], 200) }, "server");
  });

  // R-1: el cable del mundo (D-041). El receptor `suena` de un disparador ya existía en el esquema de
  // `features/disparadores`, pero lo resolvía el propio cable con un pitido fijo de la casa. Desde S6 lo resuelve
  // esta pieza: busca el nombre en el catálogo (vale el id, «golpe-material», o el nombre del aviso de la casa,
  // «campana»), decide la semilla y manda el fichero con su texto accesible. Un receptor, un dueño.
  api.listen("disparadores", "accion", (m) => {
    if (String(m.accion) !== "suena") return false;
    const x = Number(m.x), z = Number(m.z);
    // el cable manda x/y/z a 0 en una acción `suena` (su sitio es el del disparador, que ya conoce el servidor del
    // cable): si vienen a 0 y el sonido es de interfaz, va en la cabeza; si no, al sitio que diga el mensaje
    const id = String(m.sonido ?? "");
    const s3 = cat.sonidos.get(id) ?? (cat.casa[id] ? cat.sonidos.get(cat.casa[id]) : undefined);
    const enLaCabeza = !s3 || s3.bus === "interfaz";
    return suena(id, { donde: enLaCabeza ? null : { x: Number.isFinite(x) ? x : 0, y: Number(m.y) || 0, z: Number.isFinite(z) ? z : 0 } });
  });

  // ──────────────── S6f · REPARTO DE AUTORIDAD: lo COMPARTIDO lo manda el servidor ────────────────
  // Decisión D-048: el servidor manda en lo compartido. Un sonido que varias personas tienen que oír igual (una
  // puerta, una tirada de dados, un dardo que da en la diana) NO lo puede disparar cada página por su cuenta: cada
  // una elegiría su variante y su tono, y quien está al lado oiría otra cosa — o nada, si su página no vio el cambio.
  // Así que lo decide aquí el servidor, con su semilla, y lo manda a quien esté cerca.
  //
  // Esta pieza NO toca las otras funciones: se ASOMA a los eventos que ya emiten (`api.listen`), que es el camino que
  // ya existía. Una función nueva que quiera sonar no tiene que saber nada de sonido: emite su evento y se le añade
  // aquí una línea (R-1).
  //
  // Lo local (mis pasos, mi salto, mi aterrizaje) NO pasa por aquí: es de cada quien, se oye
  // en la cabeza, y mandarlo por la red sería ruido y retardo para nada.
  const dondeDe = (quien: unknown): { x: number; y: number; z: number } | null => {
    const e = Number(quien);
    if (!Number.isFinite(e) || e < 0) return null;
    return api.position(Math.round(e));
  };

  // la puerta: `quien` es quien la abrió o cerró, y está justo al lado, así que su sitio es el de la puerta. Cuando
  // una puerta se cierra sola el evento no dice dónde está (no trae x/z): ese cierre se queda sin sonido, apuntado en
  // docs/BACKLOG.md.
  api.listen("puertas", "cambio", (m) => {
    const donde = dondeDe(m.quien);
    if (!donde) return false;
    return suena("puerta", { donde });
  });
  // los dados: la tirada es de quien la tira, y la oyen los de alrededor
  api.listen("dados", "tirada", (m) => {
    const donde = dondeDe(m.quien);
    return donde ? suena("dados", { donde }) : false;
  });
  // el dardo: al salir y al llegar. El evento trae la cara de la diana, no su sitio en el mundo, así que los dos
  // suenan donde está quien tira (que es donde se oye el lanzamiento; el impacto queda un poco adelantado).
  api.listen("dardos", "dardo", (m) => {
    const donde = dondeDe(m.quien);
    if (!donde) return false;
    suena("dardo-lanzar", { donde });
    // «fuera» es un dardo que no se clavó: no hay impacto en la diana, solo el silbido de la tirada
    return String(m.anillo) === "fuera" ? true : suena("dardo-impacto", { donde });
  });
  // la pesca: el pez cobrado lo oyen los de alrededor (el lanzamiento y el chapuzón son tuyos, van en tu página)
  api.listen("pesca", "fin", (m) => {
    if (String(m.resultado) !== "captura") return false;
    const donde = dondeDe(m.quien);
    return donde ? suena("pesca-cobrar", { donde }) : false;
  });
  // el teletransporte: suena DONDE APARECE la persona, para todos los que estén allí (incluida ella)
  api.listen("teletransporte", "llega", (m) => {
    const x = Number(m.x), y = Number(m.y), z = Number(m.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return suena("teleport", { donde: { x, y: Number.isFinite(y) ? y : 0, z } });
  });
});

export default crearSonido();
