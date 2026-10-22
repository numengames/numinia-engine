// web — declaration (N17, motor-vr t_e089ae2b; Pablo: «una página web dentro del mundo, como Hyperfy»). A web screen
// (pantalla web) is a panel of the world that shows a real web page. On a computer and a phone the page draws it as an
// iframe placed in 3D over the panel (CSS3D: the same trick Hyperfy and three.js' CSS3DRenderer use), so it is read,
// scrolled and clicked like any page. Inside VR there is no DOM in the headset's picture (WebXR draws only WebGL), so
// the panel shows a preview (its title, its site and a short text) and a button «Abrir fuera de VR», which leaves VR
// and offers the page in a tab of its own. Nothing pretends: a site that refuses to be framed (X-Frame-Options or CSP
// frame-ancestors, e.g. numinia.org today) is shown as that same card with an «Abrir» link on every device.
// Safety: only sites on the world's allow-list (entorno/web.json `dominios`, travels in the world's zip), https only
// (plain http only for this machine, 127.0.0.1/localhost, for tests), never the engine's own origin; the iframe is
// sandboxed with no camera, microphone, geolocation or top navigation; only owners and the Game Director put or take
// screens (the action `dirigir` = STD-052 manage-rituals, which owners hold too).
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Longest address a screen takes (bytes). */
export const URL_MAX = 300;
/** Longest title (what a screen reader says) and text of the preview card. */
export const TITULO_MAX = 60;
export const TEXTO_MAX = 200;
/** Most screens one world holds (each page draws an iframe only for the ones near it). */
export const PANTALLAS_MAX = 24;
/** Most domains on a world's allow-list. */
export const DOMINIOS_MAX = 32;
/** Longest one domain of the allow-list takes (host, optional :port). DNS allows up to 253 + a port. */
export const DOMINIO_TXT_MAX = 260;
/** A screen's size in metres (its width; its height follows `alto`). */
export const ANCHO_M = { min: 0.5, max: 12, defecto: 3.2 } as const;
export const ALTO_M = { min: 0.3, max: 8, defecto: 1.8 } as const;
/** What the server learnt about whether the site lets itself be framed: «?» not checked (or unreachable), «si»
 * nothing forbids it, «no» X-Frame-Options or frame-ancestors forbid it, or the raw frame-ancestors source list (only
 * the page knows its own origin, so the page decides with `dejaEnmarcar`). */
export const MARCO_MAX = 200;

const POS = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 1.6 } as const;
const GIRO = { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 } as const;
const ID = { kind: "text", maxBytes: 16 } as const;
const URL_F = { kind: "text", maxBytes: URL_MAX } as const;
const TITULO = { kind: "text", maxBytes: TITULO_MAX } as const;
const TEXTO = { kind: "text", maxBytes: TEXTO_MAX, default: "" } as const;
const ANCHO = { kind: "fixed", min: ANCHO_M.min, max: ANCHO_M.max, step: 0.01, default: ANCHO_M.defecto } as const;
const ALTO = { kind: "fixed", min: ALTO_M.min, max: ALTO_M.max, step: 0.01, default: ALTO_M.defecto } as const;
const DOMINIO = { kind: "text", maxBytes: DOMINIO_TXT_MAX } as const;

export const web = defineFeature({
  id: "web",
  version: 2,
  level: "base",
  describe: "Pantallas web: un panel del mundo que muestra una página web de verdad. En ordenador y móvil se lee y se pulsa dentro del mundo; en VR muestra una vista previa y un botón para abrirla fuera. Solo sitios de la lista del mundo; solo los dueños y quien dirige ponen o quitan pantallas, y añaden o quitan dominios de la lista en caliente.",
  store: { describe: "Dominios añadidos a la lista de sitios permitidos desde dentro del mundo (N17 corte 2): clave = firma del dominio (api.sign), valor = el dominio normalizado. No incluye los de entorno/web.json (esos no se quitan desde aquí)." },
  state: {
    describe: "Una entrada por pantalla (clave = su id). url = la página (https; sitios de la lista del mundo); titulo = lo que dice el lector de pantalla; texto = la vista previa (VR, o si el sitio no se deja enmarcar); x, y (centro), z en metros y ry en grados (hacia dónde mira); ancho × alto en metros; marco = lo que el servidor sabe de si el sitio se deja mostrar dentro de otra página («?», «si», «no» o la lista frame-ancestors del sitio); fichero = viene de entorno/web.json (no se quita desde el mundo); inicio = si la dirección es un vídeo de YouTube, el instante (segundos desde 1970) en que se puso: cada página lo reproduce ya avanzado esos segundos, para que todos vean más o menos lo mismo.",
    fields: { url: URL_F, titulo: TITULO, texto: TEXTO, x: POS, y: Y, z: POS, ry: GIRO, ancho: ANCHO, alto: ALTO, marco: { kind: "text", maxBytes: MARCO_MAX, default: "?" }, fichero: { kind: "bool", default: false }, inicio: { kind: "text", maxBytes: 12, default: "" } },
    card: { role: "pantalla", name: "{titulo}", description: "Pantalla web: {url}", at: ["x", "z"] },
    persist: true,
  },
  intents: {
    poner: {
      describe: "Poner una pantalla web (o cambiar la que tiene ese id): la página (https, de un sitio de la lista del mundo), su título, un texto de vista previa, dónde (x, y del centro, z; ry = hacia dónde mira, grados) y su tamaño (ancho × alto, m). id vacío = una nueva. Solo dueños y quien dirige.",
      spoken: "poner una pantalla web",
      fields: { id: { kind: "text", maxBytes: 16, default: "" }, url: URL_F, titulo: TITULO, texto: TEXTO, x: POS, y: Y, z: POS, ry: GIRO, ancho: ANCHO, alto: ALTO },
      rate: { perSecond: 2, burst: 4 },
    },
    quitar: { describe: "Quitar una pantalla web del mundo (las de entorno/web.json no: se quitan del fichero). Solo dueños y quien dirige.", spoken: "quitar una pantalla web", fields: { id: ID }, rate: { perSecond: 2, burst: 4 } },
    dominioPoner: {
      describe: "Añadir un dominio a la lista de sitios permitidos de este mundo, en caliente (sin tocar entorno/web.json ni reiniciar el servidor). Hasta DOMINIOS_MAX dominios en total entre el fichero y los añadidos aquí; persiste como las pantallas puestas (S4). Solo dueños y quien dirige.",
      spoken: "añadir un dominio permitido",
      fields: { dominio: DOMINIO },
      rate: { perSecond: 1, burst: 3 },
    },
    dominioQuitar: {
      describe: "Quitar un dominio añadido en caliente desde el mundo (los de entorno/web.json no se quitan así: se quitan del fichero). Solo dueños y quien dirige.",
      spoken: "quitar un dominio permitido",
      fields: { dominio: DOMINIO },
      rate: { perSecond: 1, burst: 3 },
    },
  },
  events: {
    permiso: { describe: "Si puedes poner y quitar pantallas web aquí (llega al entrar, al identificarte y cuando cambian tus roles).", fields: { poner: { kind: "bool" } }, announce: "silent" },
    hecho: { describe: "Tu pantalla se puso o se quitó.", fields: { id: ID, accion: { kind: "enum", values: ["poner", "quitar"] } }, announce: { text: "Pantalla web: hecho", sound: "suave", importance: 1 } },
    rechazado: { describe: "Lo que pediste con las pantallas web no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 200 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    aviso: { describe: "Para el chat (solo en el servidor): la respuesta a una orden /web, solo para quien la escribió.", fields: { quien: { kind: "int", min: 0, max: 1_000_000 }, texto: { kind: "text", maxBytes: 300 } }, announce: "silent" },
    dominioHecho: { describe: "Un dominio se añadió o se quitó de la lista de sitios permitidos, en caliente.", fields: { dominio: DOMINIO, accion: { kind: "enum", values: ["poner", "quitar"] } }, announce: { text: "Dominio permitido: {accion} {dominio}", sound: "suave", importance: 1 } },
  },
});

/** Loopback hosts: the only ones plain http is allowed for (a page served on this machine, e.g. in tests). */
const LOCAL = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** A domain of the allow-list, normalised: lowercase host, optional port («127.0.0.1:8123»), no scheme, no path.
 * «*.ejemplo.org» is not a thing: a domain covers its subdomains already. null = not a domain. */
export function normalizarDominio(d: unknown): string | null {
  const s = String(d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^(\[::1\]|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*)(:[0-9]{1,5})?$/.test(s) ? s : null;
}

/** Is this address allowed on a screen of a world with this allow-list? Returns the reason it is not, or "" when it
 * is. https only (http only for loopback hosts); no user:password; the host must be a listed domain or a subdomain
 * of one (a listed entry with a port matches only that host and port). */
export function motivoUrl(url: string, dominios: readonly string[]): string {
  let u: URL;
  try { u = new URL(url); } catch { return "Esa dirección no es una URL completa (empieza por https://)."; }
  if (url.length > URL_MAX) return `La dirección es demasiado larga (más de ${URL_MAX} caracteres).`;
  if (u.username || u.password) return "La dirección no puede llevar usuario ni contraseña.";
  const host = u.hostname.toLowerCase(), local = LOCAL.has(host);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return "Solo páginas https (http solo para esta misma máquina, en pruebas).";
  const conPuerto = u.port ? `${host}:${u.port}` : host;
  // the youtube family counts as one site: «youtube.com» on the list also lets youtu.be and the no-cookie player (what the page really embeds)
  const familia = VIDEO_HOSTS.includes(host) && dominios.includes("youtube.com");
  const ok = familia || dominios.some((d) => d.includes(":") ? d === conPuerto : host === d || host.endsWith(`.${d}`));
  if (!ok) return dominios.length ? `${host} no está en la lista de sitios de este mundo (${dominios.slice(0, 6).join(", ")}${dominios.length > 6 ? "…" : ""}). Se añade en entorno/web.json.` : "Este mundo no tiene lista de sitios web: quien lo administra la pone en entorno/web.json («dominios»).";
  return "";
}

/** Video screens (Pablo 22-10, «la pieza de compartir vídeo en un espacio»): a screen whose address is a YouTube video.
 * The server stamps `inicio` (epoch seconds) when the video is put; every page draws the player already that many
 * seconds in, so everybody sees about the same moment (as close as their clocks agree: seconds, not frames).
 * Muted at the start (browsers only autoplay muted); the person unmutes with a tap on the player. */
export const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"];
/** The 11-character id of a YouTube video address (watch?v=, youtu.be/, /embed/, /shorts/, /live/), or null. */
export function videoDe(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !VIDEO_HOSTS.includes(host)) return null;
  const id = host === "youtu.be" ? u.pathname.split("/")[1] : u.pathname === "/watch" ? u.searchParams.get("v") : /^\/(embed|shorts|live)\/([^/]+)/.exec(u.pathname)?.[2];
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
/** The player's address for a video that started `inicio` (epoch s) and is now `ahora` (epoch s): muted autoplay, no related videos. */
export function urlVideo(id: string, inicio: number, ahora: number): string {
  const start = Math.max(0, Math.min(86400, Math.floor(ahora - inicio)));
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&start=${start}`;
}

/** What the server keeps of a site's answer about framing (see MARCO_MAX). `xfo` = X-Frame-Options, `csp` =
 * Content-Security-Policy (both may be null). */
export function resumirMarco(xfo: string | null, csp: string | null): string {
  const x = (xfo ?? "").trim().toLowerCase();
  if (x === "deny" || x === "sameorigin" || x.startsWith("allow-from")) return "no"; // allow-from is obsolete: browsers treat it as a refusal or ignore it — refuse
  const fa = (csp ?? "").split(",").flatMap((p) => p.split(";")).map((d) => d.trim()).find((d) => /^frame-ancestors(\s|$)/i.test(d));
  if (!fa) return "si";
  const fuentes = fa.split(/\s+/).slice(1).filter(Boolean);
  if (!fuentes.length || fuentes.includes("'none'")) return "no";
  if (fuentes.includes("*")) return "si";
  const ajenas = fuentes.filter((f) => f !== "'self'");
  if (!ajenas.length) return "no"; // only itself
  return ajenas.join(" ").slice(0, MARCO_MAX);
}

/** May a page at `origen` (e.g. «https://mundo.ejemplo.org») show the site inside an iframe, given `marco`? «?» = we
 * do not know: try (if the site refuses, the browser shows its own error inside the panel, and «Abrir» stays). */
export function dejaEnmarcar(marco: string, origen: string): boolean {
  if (marco === "si" || marco === "?" || marco === "") return true;
  if (marco === "no") return false;
  let o: URL;
  try { o = new URL(origen); } catch { return false; }
  return marco.split(/\s+/).some((f) => {
    const m = /^(?:(https?):\/\/)?(\*\.)?([a-z0-9.-]+|\[::1\])(?::(\d+|\*))?\/?$/i.exec(f);
    if (!m) return f === `${o.protocol.replace(":", "")}:` || f === o.protocol; // «https:» = any https origin
    const [, esquema, comodin, host, puerto] = m;
    if (esquema && `${esquema}:` !== o.protocol) return false;
    if (!esquema && o.protocol !== "https:" && o.protocol !== "http:") return false;
    const h = o.hostname.toLowerCase(), hh = host.toLowerCase();
    if (comodin ? !h.endsWith(`.${hh}`) : h !== hh) return false;
    if (puerto && puerto !== "*" && puerto !== (o.port || (o.protocol === "https:" ? "443" : "80"))) return false;
    return true;
  });
}

/** What entorno/web.json says (numinia-engine/web@1): the allow-list and the screens the world ships. */
export type PantallaFichero = { id: string; url: string; titulo: string; texto?: string; x: number; y?: number; z: number; ry?: number; ancho?: number; alto?: number };
export type WebMundo = { dominios: string[]; pantallas: PantallaFichero[] };
export type Problema = { path: string; message: string };

/** Read entorno/web.json. Wrong entries are left out and said (path + how to fix); the rest is used. */
export function leerWebMundo(crudo: unknown): { valor: WebMundo; problemas: Problema[] } {
  const problemas: Problema[] = [], valor: WebMundo = { dominios: [], pantallas: [] };
  if (crudo === undefined || crudo === null) return { valor, problemas };
  const o = crudo as { schema?: unknown; dominios?: unknown; pantallas?: unknown };
  if (typeof crudo !== "object" || Array.isArray(crudo)) return { valor, problemas: [{ path: "web", message: "web.json es un objeto: { \"schema\": \"numinia-engine/web@1\", \"dominios\": [\"numinia.org\"], \"pantallas\": [] }" }] };
  if (o.schema !== undefined && o.schema !== "numinia-engine/web@1") problemas.push({ path: "web.schema", message: "el esquema es \"numinia-engine/web@1\"" });
  if (o.dominios !== undefined && !Array.isArray(o.dominios)) problemas.push({ path: "web.dominios", message: "una lista de dominios: [\"numinia.org\"]" });
  for (const [i, d] of (Array.isArray(o.dominios) ? o.dominios : []).entries()) {
    const n = normalizarDominio(d);
    if (!n) problemas.push({ path: `web.dominios[${i}]`, message: `«${String(d).slice(0, 60)}» no es un dominio (así: numinia.org, o 127.0.0.1:8123 para pruebas)` });
    else if (valor.dominios.length >= DOMINIOS_MAX) { problemas.push({ path: `web.dominios[${i}]`, message: `como mucho ${DOMINIOS_MAX} dominios` }); break; }
    else if (!valor.dominios.includes(n)) valor.dominios.push(n);
  }
  if (o.pantallas !== undefined && !Array.isArray(o.pantallas)) problemas.push({ path: "web.pantallas", message: "una lista de pantallas: [{ \"id\", \"url\", \"titulo\", \"x\", \"z\" }]" });
  const vistos = new Set<string>();
  for (const [i, p] of (Array.isArray(o.pantallas) ? o.pantallas : []).entries()) {
    const path = `web.pantallas[${i}]`, e = p as Record<string, unknown>;
    if (!e || typeof e !== "object") { problemas.push({ path, message: "cada pantalla es un objeto" }); continue; }
    const id = String(e.id ?? "");
    if (!/^[a-z0-9-]{1,16}$/.test(id) || vistos.has(id)) { problemas.push({ path: `${path}.id`, message: "un id único de 1 a 16 letras minúsculas, cifras o guiones" }); continue; }
    const url = String(e.url ?? ""), motivo = motivoUrl(url, valor.dominios);
    if (motivo) { problemas.push({ path: `${path}.url`, message: motivo }); continue; }
    const titulo = String(e.titulo ?? "").trim();
    if (!titulo || new TextEncoder().encode(titulo).length > TITULO_MAX) { problemas.push({ path: `${path}.titulo`, message: `un título de 1 a ${TITULO_MAX} bytes (lo que dice el lector de pantalla)` }); continue; }
    const num = (k: string) => typeof e[k] === "number" && Number.isFinite(e[k]);
    if (!num("x") || !num("z")) { problemas.push({ path, message: "x y z en metros (números)" }); continue; }
    vistos.add(id);
    valor.pantallas.push({ id, url, titulo, texto: typeof e.texto === "string" ? e.texto : "", x: Number(e.x), y: num("y") ? Number(e.y) : undefined, z: Number(e.z), ry: num("ry") ? Number(e.ry) : undefined, ancho: num("ancho") ? Number(e.ancho) : undefined, alto: num("alto") ? Number(e.alto) : undefined });
    if (valor.pantallas.length >= PANTALLAS_MAX) break;
  }
  return { valor, problemas };
}
