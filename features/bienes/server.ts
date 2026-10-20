// bienes — server part (N10). The keeper of who owns what in this world. It hears the misiones feature's server-only
// event `concedido` (an «objeto» reward granted ONCE per quest and guest) and turns it into a good: an id unique in this
// world (HMAC of quest|reward|guest with the world's secret: the same grant always names the same good, nobody can guess
// another's), a receipt signed by the world (api.recibo, Ed25519) and one store record `b:<id>`. Then it tells its owner
// («Es tuyo: …») and sends the good to every tab of theirs. On entering, each guest gets their inventory. The route
// POST /bienes/comprobar checks any receipt (this world's or another's) and says what it is — never adds it: without a
// shared identity (the guest / passkey / numinia.com account decision, INTERFAZ-Y-MODS §13) a receipt from elsewhere
// proves the good is real, not that the person showing it is its owner.
// No secret (MOTOR_SECRET) = no receipts = no goods: the grant is still recorded by misiones (npm run concesiones).
// v2 (N18): wearing a good (intent `llevar` → shared state `p:<entity>`, so every page draws it on that avatar; what you
// wear is kept per guest, `l:<guest>`, and put back on when you come back); a per-owner index (`d:<guest>` pages of up to
// 100 store keys) so entering costs your goods, not the world's; and bringing a receipt from ANOTHER world (intent
// `traer`, in pieces): checked always; it becomes a good here (`f:<24 hex of its fingerprint>`, «de otro mundo») only
// when the world trusts its signer — the world's file `<aventura>/bienes/confianza.json` (empty by default). A trusted
// receipt is a bearer proof here: the first guest who brings it holds it, nobody else can (one receipt, one person).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { bienes, partir, DONDE } from "./feature.ts";
import type { Donde } from "./feature.ts";

export const PREFIJO_BIEN = "b:", PREFIJO_AJENO = "f:", PREFIJO_INDICE = "d:", PREFIJO_PUESTO = "l:", PREFIJO_LLEVA = "p:";
/** Store keys per index page (100 × ≈ 29 bytes ≈ 2.9 kB, under the store's 4,096 per key). */
export const INDICE_PAGINA = 100;
/** The index's version, kept under `i`: a world from before it gets indexed once, on start. */
const INDICE_VERSION = 1;
/** One good as the store keeps it (≈ 1.3 kB with its receipt; the store allows 4,096 per key). `ajeno` = brought from
 * another world this one trusts (its receipt was signed there). */
export type Bien = { id: string; recibo: string; dueno: string; objeto: string; nombre: string; descripcion: string; modelo: string; licencia: string; mundo: string; mision: string; instante: string; ajeno?: boolean };
/** A signer this world trusts (its file `bienes/confianza.json`). */
export type Confiado = { emisor: string; nombre: string };

const s = (v: unknown): string => (typeof v === "string" ? v : "");
/** The record read back (null = not a good: damaged or written by something else). */
export function leerBien(v: unknown): Bien | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (![o.id, o.recibo, o.dueno, o.objeto, o.nombre, o.mundo, o.mision, o.instante].every((x) => typeof x === "string" && x)) return null;
  return { id: s(o.id), recibo: s(o.recibo), dueno: s(o.dueno), objeto: s(o.objeto), nombre: s(o.nombre), descripcion: s(o.descripcion), modelo: s(o.modelo), licencia: s(o.licencia), mundo: s(o.mundo), mision: s(o.mision), instante: s(o.instante), ...(o.ajeno === true ? { ajeno: true } : {}) };
}

/** `confianza@1`: `{ "formato": "confianza@1", "emisores": [{ "emisor": "ed25519:<43>", "nombre": "…", "nota": "…" }] }`
 * (a bare list of «ed25519:…» texts is read too). Returns the trusted signers and what was wrong (never throws). */
export function leerConfianza(texto: string): { emisores: Confiado[]; problemas: string[] } {
  const problemas: string[] = [], emisores: Confiado[] = [];
  let o: unknown;
  try { o = JSON.parse(texto); } catch { return { emisores, problemas: ["no es JSON"] }; }
  const lista = Array.isArray(o) ? o : o && typeof o === "object" ? (o as { emisores?: unknown }).emisores : undefined;
  if (!Array.isArray(lista)) return { emisores, problemas: ["falta «emisores»: una lista (vacía = no confía en nadie)"] };
  if (!Array.isArray(o) && (o as { formato?: unknown }).formato !== "confianza@1") problemas.push("«formato» debería ser \"confianza@1\"");
  lista.forEach((e, i) => {
    const emisor = typeof e === "string" ? e : e && typeof e === "object" ? s((e as { emisor?: unknown }).emisor) : "";
    if (!/^ed25519:[A-Za-z0-9_-]{43}$/.test(emisor)) { problemas.push(`emisores[${i}]: «emisor» debe ser «ed25519:» y 43 letras (la clave pública del mundo que firma)`); return; }
    emisores.push({ emisor, nombre: typeof e === "object" && e ? s((e as { nombre?: unknown }).nombre).slice(0, 60) : "" });
  });
  return { emisores, problemas };
}

/** `confianza` only for tests: the world's file is `<aventura>/bienes/confianza.json` (api.aventura("bienes")). */
export const crearBienes = (o: { confianza?: () => { fichero: string; texto: string }[] } = {}) => serverPart(bienes, (api: ServerApi) => {
  const suyos = (id: string) => api.players().filter((e) => api.who(e)?.id === id);

  // ---- the per-owner index: d:<guest>, d:<guest>~2, … (lists of store keys) ----
  const pagina = (g: string, n: number) => (n === 1 ? PREFIJO_INDICE + g : `${PREFIJO_INDICE}${g}~${n}`);
  const claves = (g: string): string[] => {
    const out: string[] = [];
    for (let n = 1; ; n++) { const v = api.store.get(pagina(g, n)); if (!Array.isArray(v)) break; for (const k of v) if (typeof k === "string") out.push(k); }
    return out;
  };
  const indexar = (g: string, k: string): boolean => {
    let n = 1;
    for (; ; n++) {
      const v = api.store.get(pagina(g, n));
      if (!Array.isArray(v)) break;
      if (v.includes(k)) return true;
      if (v.length < INDICE_PAGINA) return api.store.set(pagina(g, n), [...v, k]);
    }
    return api.store.set(pagina(g, n), [k]);
  };
  if (api.store.get("i") !== INDICE_VERSION) { // a world from before the index (N10): one pass, once
    let n = 0;
    for (const k of api.store.keys()) { if (!k.startsWith(PREFIJO_BIEN) && !k.startsWith(PREFIJO_AJENO)) continue; const b = leerBien(api.store.get(k)); if (b && indexar(b.dueno, k)) n++; }
    api.store.set("i", INDICE_VERSION);
    if (n) api.log(`índice por dueño: ${n} bienes indexados (una vez)`);
  }
  const deQuien = (g: string): Bien[] => claves(g).map((k) => leerBien(api.store.get(k))).filter((b): b is Bien => !!b && b.dueno === g)
    .sort((a, b) => a.instante.localeCompare(b.instante) || a.id.localeCompare(b.id));
  /** One of `g`'s goods by its id (from here or brought), or null. */
  const bienDe = (g: string, id: string): Bien | null => {
    if (!/^[0-9a-f]{24}$/.test(id)) return null;
    for (const p of [PREFIJO_BIEN, PREFIJO_AJENO]) { const b = leerBien(api.store.get(p + id)); if (b && b.dueno === g) return b; }
    return null;
  };

  const verse = (b: Bien) => !!b.modelo && api.activo(b.modelo);
  const enviar = (to: number, b: Bien) => api.emit("bien", { id: b.id, ajeno: !!b.ajeno, verse: verse(b), objeto: b.objeto, nombre: b.nombre, descripcion: b.descripcion, modelo: b.modelo, licencia: b.licencia, mundo: b.mundo, mision: b.mision, instante: b.instante, ...partir(b.recibo) }, { to });
  const inventario = (to: number) => {
    const w = api.who(to);
    const l = w ? deQuien(w.id) : [];
    api.emit("inventario", { n: l.length, emisor: api.emisor() }, { to });
    for (const b of l) enviar(to, b);
  };

  // ---- wearing: p:<entity> for every page; l:<guest> to put it back on next time ----
  const ponerA = (e: number, b: Bien, donde: Donde) => api.state.set(PREFIJO_LLEVA + e, { ent: e, modelo: b.modelo, donde, nombre: b.nombre });
  const aviso = (to: number, texto: string) => { api.emit("aviso", { texto }, { to }); };
  const puesto = (g: string): { b: Bien; donde: Donde } | null => {
    const v = api.store.get(PREFIJO_PUESTO + g) as { id?: unknown; donde?: unknown } | undefined;
    const b = v ? bienDe(g, s(v.id)) : null;
    return b && verse(b) && (DONDE as readonly string[]).includes(s(v!.donde)) ? { b, donde: s(v!.donde) as Donde } : null;
  };
  api.on("llevar", (from, m) => {
    const w = api.who(from);
    if (!w) return;
    const donde = s(m.donde);
    if (!donde) { api.store.delete(PREFIJO_PUESTO + w.id); for (const e of suyos(w.id)) api.state.delete(PREFIJO_LLEVA + e); return; }
    const b = bienDe(w.id, s(m.id));
    if (!b) return aviso(from, "Ese objeto no es tuyo en este mundo.");
    if (!verse(b)) return aviso(from, `«${b.nombre}» no tiene modelo 3D en este mundo: no se puede llevar puesto.`);
    api.store.set(PREFIJO_PUESTO + w.id, { id: b.id, donde });
    for (const e of suyos(w.id)) ponerA(e, b, donde as Donde);
  });

  // ---- a receipt from another world: in pieces, checked, and yours here only if this world trusts its signer ----
  const trozos = new Map<number, { partes: number; t: string[] }>();
  const confianza = (): Map<string, Confiado> => {
    const f = (o.confianza ?? (() => api.aventura("bienes")))().find((x) => /(^|\/)confianza\.json$/.test(x.fichero));
    if (!f) return new Map();
    const c = leerConfianza(f.texto);
    if (c.problemas.length) api.log(`bienes/confianza.json: ${c.problemas.join("; ")}`);
    return new Map(c.emisores.map((e) => [e.emisor, e]));
  };
  const traer = (from: number, g: string, token: string) => {
    const res = (r: { ok?: boolean; nombre?: string; mundo?: string; confia?: boolean; dado?: boolean; motivo: string }) =>
      api.emit("traido", { ok: false, nombre: "", mundo: "", confia: false, dado: false, ...r }, { to: from });
    const v = api.verificarRecibo(token);
    if (!v.ok) return res({ motivo: `Ese recibo no vale: ${v.motivo}.` });
    const r = v.recibo, n = r.objeto.nombre, base = { ok: true, nombre: n, mundo: r.mundo };
    if (v.nuestro) return res({ ...base, confia: true, dado: r.dueno === g, motivo: r.dueno === g ? `«${n}» ya es tuyo: lo firmó este mundo y está en tu inventario.` : `«${n}» lo firmó este mundo, pero es de otro invitado: no pasa a ser tuyo.` });
    const de = confianza().get(r.emisor);
    if (!de) return res({ ...base, motivo: `Auténtico: «${n}», del mundo ${r.mundo}. Este mundo no confía en quien lo firmó: lo ves como «de otro mundo», pero aquí no es tuyo.` });
    const k = PREFIJO_AJENO + v.huella.slice(0, 24), ya = leerBien(api.store.get(k));
    if (ya) return res({ ...base, confia: true, dado: ya.dueno === g, motivo: ya.dueno === g ? `«${n}» ya estaba en tu inventario.` : `«${n}» ya lo trajo otra persona a este mundo: un recibo vale para una sola persona.` });
    const b: Bien = { id: k.slice(2), recibo: token, dueno: g, objeto: r.objeto.id, nombre: n, descripcion: r.objeto.descripcion, modelo: r.objeto.modelo, licencia: r.objeto.licencia, mundo: r.mundo, mision: r.mision, instante: r.instante, ajeno: true };
    if (!api.store.set(k, b) || !indexar(g, k)) { api.store.delete(k); api.log(`no pude guardar «${n}» traído por ${g}`); return res({ ...base, confia: true, motivo: "No pude guardarlo en este mundo (almacén lleno)." }); }
    api.log(`«${n}» de ${r.mundo} (firmado por ${de.nombre || r.emisor.slice(0, 20)}…, en quien este mundo confía) pasa a ser de ${g} aquí`);
    for (const e of suyos(g)) enviar(e, b);
    return res({ ...base, confia: true, dado: true, motivo: `«${n}», del mundo ${de.nombre || r.mundo}: este mundo confía en quien lo firmó, así que aquí también es tuyo.` });
  };
  api.on("traer", (from, m) => {
    const w = api.who(from);
    if (!w) return;
    const partes = Number(m.partes), parte = Number(m.parte);
    if (!(parte < partes)) return;
    let b = trozos.get(from);
    if (parte === 0 || !b || b.partes !== partes) { b = { partes, t: [] }; trozos.set(from, b); }
    b.t[parte] = s(m.t);
    for (let i = 0; i < partes; i++) if (b.t[i] === undefined) return;
    trozos.delete(from);
    traer(from, w.id, b.t.join(""));
  });

  api.listen("misiones", "concedido", (m) => {
    const jugador = s(m.jugador), mision = s(m.mision), objeto = s(m.objeto);
    if (!jugador || !mision || !objeto) return false;
    const id = api.sign(`bien|${mision}|${objeto}|${jugador}`);
    if (!id) { api.log(`«${s(m.nombre)}» para ${jugador}: sin MOTOR_SECRET no hay recibo, así que no hay bien (la concesión sí está apuntada)`); return false; }
    const k = PREFIJO_BIEN + id;
    if (api.store.get(k) !== undefined) return true; // already given (the grant is once; this is the belt to its braces)
    const datos = { id, objeto: { id: objeto, nombre: s(m.nombre), descripcion: s(m.descripcion), modelo: s(m.modelo), licencia: s(m.licencia) }, dueno: jugador, mision, instante: s(m.instante) || new Date().toISOString() };
    const recibo = api.recibo(datos);
    if (!recibo) { api.log(`no pude firmar el recibo de «${datos.objeto.nombre}» para ${jugador}`); return false; }
    const v = api.verificarRecibo(recibo);
    const b: Bien = { id, recibo, dueno: jugador, objeto, nombre: datos.objeto.nombre, descripcion: datos.objeto.descripcion, modelo: datos.objeto.modelo, licencia: datos.objeto.licencia, mundo: v.ok ? v.recibo.mundo : "", mision, instante: datos.instante };
    if (!api.store.set(k, b)) { api.log(`no pude guardar «${b.nombre}» de ${jugador}`); return false; }
    if (!indexar(jugador, k)) api.log(`no pude apuntar «${b.nombre}» en el índice de ${jugador}`);
    for (const e of suyos(jugador)) { api.emit("recibido", { nombre: b.nombre }, { to: e }); enviar(e, b); }
    return true;
  });

  // identidad/i1: a guest's first pass. Each good's `dueno` becomes `sub` (the receipt keeps naming the guest: it is the
  // signed proof of the grant), the index pages are rebuilt under `sub`, what was worn follows if `sub` wore nothing.
  api.onAdoptar((invitado, sub) => {
    for (const k of claves(invitado)) { const b = leerBien(api.store.get(k)); if (b && b.dueno === invitado && api.store.set(k, { ...b, dueno: sub })) indexar(sub, k); }
    for (let n = 1; api.store.get(pagina(invitado, n)) !== undefined; n++) api.store.delete(pagina(invitado, n));
    const puesto = api.store.get(PREFIJO_PUESTO + invitado);
    if (puesto !== undefined) { if (api.store.get(PREFIJO_PUESTO + sub) === undefined) api.store.set(PREFIJO_PUESTO + sub, puesto); api.store.delete(PREFIJO_PUESTO + invitado); }
  });
  api.onIdentify((e, w) => {
    inventario(e);
    const p = puesto(w.id);
    if (p) ponerA(e, p.b, p.donde);
  });
  api.onLeave((e) => { trozos.delete(e); if (api.state.get(PREFIJO_LLEVA + e)) api.state.delete(PREFIJO_LLEVA + e); });
  api.on("ver", (from) => inventario(from));
  /** Tools and other worlds: is this receipt real? (body = the bare «nb1.…» or a downloaded recibo-….json). Says what the
   * good is and whether THIS world signed it; never who owns it. */
  api.route("POST", "/bienes/comprobar", (req) => {
    let token = req.body.trim();
    if (!token.startsWith("nb1.")) { try { const o = JSON.parse(token) as { recibo?: unknown }; token = typeof o?.recibo === "string" ? o.recibo.trim() : ""; } catch { token = ""; } }
    const v = api.verificarRecibo(token);
    if (!v.ok) return { status: 422, type: "json", body: { ok: false, motivo: v.motivo } };
    const r = v.recibo;
    return { type: "json", body: { ok: true, nuestro: v.nuestro, confiado: !v.nuestro && confianza().has(r.emisor), nombre: r.objeto.nombre, objeto: r.objeto.id, mundo: r.mundo, mision: r.mision, instante: r.instante, emisor: r.emisor, huella: v.huella } };
  });
});

export default crearBienes();
