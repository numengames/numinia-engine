// manifiesto (M16, page side): the zone's manifest — every file with its sha256, size and class — and a store of files by hash.
// The page reads /manifiesto.json once; a model it asks for is looked up there: if the browser already holds the bytes under
// that sha256 (Cache API) they are used and nothing is downloaded; if not, they are downloaded, CHECKED against the sha256 (a
// file that does not match is refused, not drawn) and kept. A server with no manifest (or a file it does not list) is not
// an error: the model loads as it always did.
//
// The store works on bytes and takes `fetch` and `caches` as arguments, so test/manifiesto.test.ts runs it in node.

export type Clase = "arranque" | "fondo" | "perezoso";
export type FicheroManifiesto = { ruta: string; sha256: string; bytes: number; clase: Clase; tipo: string; copias?: number; lods?: number; de?: string; nivel?: number };
export type Manifiesto = { schema: string; zona: string; origenes: string[]; total: { ficheros: number; bytes: number }; clases: Record<Clase, { ficheros: number; bytes: number }>; ficheros: FicheroManifiesto[] };

export const ESQUEMA = "numinia-engine/manifiesto@1";
/** The Cache API cache the files live in; the key is the sha256 (never the url: the same bytes at another origin are the same file). */
export const NOMBRE_CACHE = "numinia-activos-v1";
const CLAVE = (sha: string): string => `https://activos.invalid/${sha}`;

/** Reads and checks the shape of a manifest; null if it is not one. */
export function leerManifiesto(x: unknown): Manifiesto | null {
  const m = x as Manifiesto | null;
  if (!m || m.schema !== ESQUEMA || !Array.isArray(m.ficheros)) return null;
  const buenos = m.ficheros.filter((f) => f && typeof f.ruta === "string" && /^[0-9a-f]{64}$/.test(f.sha256) && Number.isFinite(f.bytes));
  return { ...m, ficheros: buenos };
}

/** sha256 of some bytes, hex (Web Crypto: in a page it needs a secure context, in node it is global). */
export async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type CacheLike = { match(k: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | undefined>; put(k: string, r: unknown): Promise<void> };
export type CachesLike = { open(n: string): Promise<CacheLike> };

export class HashFalso extends Error {
  readonly ruta: string; readonly esperado: string; readonly obtenido: string;
  constructor(ruta: string, esperado: string, obtenido: string) { super(`${ruta}: el sha256 no coincide con el del manifiesto (${obtenido.slice(0, 12)}… en vez de ${esperado.slice(0, 12)}…)`); this.ruta = ruta; this.esperado = esperado; this.obtenido = obtenido; }
}

export type Estadisticas = { desdeCache: number; descargados: number; bytesDescargados: number; bytesDeCache: number; rechazados: number };

export type OpcionesTienda = {
  /** Where the manifest and the files live (the world server's origin, no trailing slash; "" = same origin). */
  origen: string;
  fetch?: typeof fetch;
  caches?: CachesLike | null;
  /** Called after each file it hands over (the loading screen's byte count). */
  alAvanzar?: (e: Estadisticas, total: number) => void;
};

export type Tienda = {
  /** The manifest (null while it is not here, or if the server has none). */
  manifiesto(): Manifiesto | null;
  listo: Promise<Manifiesto | null>;
  /** How many levels of detail exist for a model (its sha256). */
  lods(sha: string): number;
  /** The bytes of a file by its url (`/a/<sha256>.glb` as assetUrl makes it), or null when this store does not manage it. Throws HashFalso. */
  leer(url: string): Promise<ArrayBuffer | null>;
  estadisticas(): Estadisticas;
  /** Bytes of the files needed to play / to finish, from the manifest (0 when there is none). */
  totales(): { arranque: number; fondo: number; perezoso: number };
};

export function crearTienda(o: OpcionesTienda): Tienda {
  const pedir = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const est: Estadisticas = { desdeCache: 0, descargados: 0, bytesDescargados: 0, bytesDeCache: 0, rechazados: 0 };
  let manifiesto: Manifiesto | null = null;
  const porRuta = new Map<string, FicheroManifiesto>();
  const listo = pedir(`${o.origen}/manifiesto.json`, { cache: "no-cache" } as RequestInit)
    .then((r) => (r.ok ? r.json() : null)).then(leerManifiesto).catch(() => null)
    .then((m) => { manifiesto = m; for (const f of m?.ficheros ?? []) porRuta.set(f.ruta, f); return m; });
  let cache: Promise<CacheLike | null> | null = null;
  const abrir = (): Promise<CacheLike | null> => (cache ??= (o.caches ? o.caches.open(NOMBRE_CACHE).catch(() => null) : Promise.resolve(null)));
  const rutaDe = (url: string): string => { try { return new URL(url, "http://x").pathname; } catch { return url; } };
  const pedidos = new Map<string, Promise<ArrayBuffer | null>>(); // two copies of one model asked together: one download
  return {
    manifiesto: () => manifiesto,
    listo,
    lods: (sha) => porRuta.get(`/a/${sha}.glb`)?.lods ?? 0,
    estadisticas: () => ({ ...est }),
    totales: () => ({ arranque: manifiesto?.clases.arranque.bytes ?? 0, fondo: manifiesto?.clases.fondo.bytes ?? 0, perezoso: manifiesto?.clases.perezoso.bytes ?? 0 }),
    async leer(url) {
      await listo;
      const f = porRuta.get(rutaDe(url));
      if (!f) return null;
      const ya = pedidos.get(f.sha256);
      if (ya) return ya.then((b) => (b ? b.slice(0) : b));
      const p = (async () => {
        const c = await abrir();
        const guardado = await c?.match(CLAVE(f.sha256)).catch(() => undefined);
        if (guardado) { const b = await guardado.arrayBuffer(); est.desdeCache++; est.bytesDeCache += b.byteLength; return b; }
        const r = await pedir(url);
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        const b = await r.arrayBuffer();
        const h = await sha256(b);
        if (h !== f.sha256) { est.rechazados++; throw new HashFalso(f.ruta, f.sha256, h); }
        est.descargados++; est.bytesDescargados += b.byteLength;
        await c?.put(CLAVE(f.sha256), new Response(b.slice(0))).catch(() => {});
        return b;
      })();
      pedidos.set(f.sha256, p);
      p.catch(() => pedidos.delete(f.sha256)).finally(() => { setTimeout(() => pedidos.delete(f.sha256), 0); o.alAvanzar?.({ ...est }, manifiesto?.total.bytes ?? 0); });
      return p.then((b) => (b ? b.slice(0) : b));
    },
  };
}
