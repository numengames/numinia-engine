// espejo/origenes — which web addresses a document thing may open in the in-world viewer (mundo-hermes M6). Pure: no DOM, no engine.
// The server checks it when a document is published and the page checks it AGAIN before it sets an iframe's `src`: the page never trusts the server,
// the server never trusts the source. (No work at import time: the start bundle must be able to drop this file when no world shows documents.) The rule is an allowlist of ORIGINS written by the world's owner in espejo.json (`documentos.origenes`);
// the default is the local docs server of Hermes. An address passes only if ALL of this holds:
//   · it is plain text with no spaces or control characters, at most 300 bytes;
//   · it parses as a URL whose scheme is http: or https: (never javascript:, data:, file:, blob:, about:, ws:…);
//   · its host is a plain name, an IPv4 or a bracketed IPv6 (no wildcards or symbols);
//   · it has no user or password (`http://127.0.0.1@evil.com/` is a login for evil.com, not 127.0.0.1);
//   · it is written in canonical form — it starts with exactly the origin the URL parser computes — so `http://2130706433:8791/`, `http://0x7f.1:8791/`,
//     `http://[::ffff:127.0.0.1]:8791/` or `http:\\127.0.0.1` never pass by being «the same host in disguise»; the owner lists the form he means;
//   · that origin is in the list (exact scheme, host and port).
export const ORIGEN_DEFECTO = "http://127.0.0.1:8791";
export const MAX_URL_BYTES = 300;
export const MAX_ORIGENES = 8;

export type Veredicto = { ok: true; url: string; origen: string } | { ok: false; why: string };
const MAL = /[\s\u0000-\u001f\u007f\\]/;

/** Parse an address and say its origin when it is plain http(s) in canonical form without credentials. Pure; never throws. */
export function leerDireccion(texto: unknown): Veredicto {
  if (typeof texto !== "string" || !texto) return { ok: false, why: "la dirección está vacía" };
  if (new TextEncoder().encode(texto).length > MAX_URL_BYTES) return { ok: false, why: `la dirección pasa de ${MAX_URL_BYTES} bytes` };
  if (MAL.test(texto)) return { ok: false, why: "la dirección lleva espacios, barras invertidas o caracteres de control" };
  let u: URL;
  try { u = new URL(texto); } catch { return { ok: false, why: "la dirección no se entiende" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, why: `solo se abre http o https (no «${u.protocol}»)` };
  if (!/^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*|\[[0-9a-f:.]+\])$/.test(u.hostname)) return { ok: false, why: "el nombre del equipo lleva caracteres que no son de un nombre de equipo (comodines, símbolos)" };
  if (u.username || u.password) return { ok: false, why: "la dirección lleva usuario o contraseña" };
  if (!(texto === u.origin || texto.startsWith(`${u.origin}/`) || texto.startsWith(`${u.origin}?`) || texto.startsWith(`${u.origin}#`))) return { ok: false, why: `la dirección no está escrita en su forma normal (empieza por ${u.origin})` };
  return { ok: true, url: u.href, origen: u.origin };
}

/** An origin as the owner writes it in the list: scheme://host[:port] and nothing else. */
export function leerOrigen(texto: unknown): Veredicto {
  const v = leerDireccion(texto);
  if (!v.ok) return v;
  if (texto !== v.origen) return { ok: false, why: `un origen es solo esquema, equipo y puerto, sin ruta (use ${v.origen})` };
  return v;
}

/** May this address be opened in the viewer? `propio` = the origin of the page itself (a viewer from the world's own origin could reach the world: never). */
export function direccionPermitida(texto: unknown, origenes: readonly string[], propio?: string): Veredicto {
  const v = leerDireccion(texto);
  if (!v.ok) return v;
  if (propio && v.origen === propio) return { ok: false, why: "el visor no abre páginas del propio mundo" };
  if (!origenes.includes(v.origen)) return { ok: false, why: `el origen ${v.origen} no está en la lista de este mundo (documentos.origenes)` };
  return v;
}
