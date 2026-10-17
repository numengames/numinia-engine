// bienes — server part (N10). The keeper of who owns what in this world. It hears the misiones feature's server-only
// event `concedido` (an «objeto» reward granted ONCE per quest and guest) and turns it into a good: an id unique in this
// world (HMAC of quest|reward|guest with the world's secret: the same grant always names the same good, nobody can guess
// another's), a receipt signed by the world (api.recibo, Ed25519) and one store record `b:<id>`. Then it tells its owner
// («Es tuyo: …») and sends the good to every tab of theirs. On entering, each guest gets their inventory. The route
// POST /bienes/comprobar checks any receipt (this world's or another's) and says what it is — never adds it: without a
// shared identity (the guest / passkey / numinia.com account decision, INTERFAZ-Y-MODS §13) a receipt from elsewhere
// proves the good is real, not that the person showing it is its owner.
// No secret (MOTOR_SECRET) = no receipts = no goods: the grant is still recorded by misiones (npm run concesiones).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { bienes, partir } from "./feature.ts";

export const PREFIJO_BIEN = "b:";
/** One good as the store keeps it (≈ 1.3 kB with its receipt; the store allows 4,096 per key). */
export type Bien = { id: string; recibo: string; dueno: string; objeto: string; nombre: string; descripcion: string; modelo: string; licencia: string; mundo: string; mision: string; instante: string };

const s = (v: unknown): string => (typeof v === "string" ? v : "");
/** The record read back (null = not a good: damaged or written by something else). */
export function leerBien(v: unknown): Bien | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (![o.id, o.recibo, o.dueno, o.objeto, o.nombre, o.mundo, o.mision, o.instante].every((x) => typeof x === "string" && x)) return null;
  return { id: s(o.id), recibo: s(o.recibo), dueno: s(o.dueno), objeto: s(o.objeto), nombre: s(o.nombre), descripcion: s(o.descripcion), modelo: s(o.modelo), licencia: s(o.licencia), mundo: s(o.mundo), mision: s(o.mision), instante: s(o.instante) };
}

export const crearBienes = () => serverPart(bienes, (api: ServerApi) => {
  const suyos = (id: string) => api.players().filter((e) => api.who(e)?.id === id);
  const deQuien = (id: string): Bien[] => api.store.keys().filter((k) => k.startsWith(PREFIJO_BIEN)).map((k) => leerBien(api.store.get(k))).filter((b): b is Bien => !!b && b.dueno === id).sort((a, b) => a.instante.localeCompare(b.instante) || a.id.localeCompare(b.id));
  const enviar = (to: number, b: Bien) => api.emit("bien", { id: b.id, objeto: b.objeto, nombre: b.nombre, descripcion: b.descripcion, modelo: b.modelo, licencia: b.licencia, mundo: b.mundo, mision: b.mision, instante: b.instante, ...partir(b.recibo) }, { to });
  const inventario = (to: number) => {
    const w = api.who(to);
    const l = w ? deQuien(w.id) : [];
    api.emit("inventario", { n: l.length, emisor: api.emisor() }, { to });
    for (const b of l) enviar(to, b);
  };

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
    for (const e of suyos(jugador)) { api.emit("recibido", { nombre: b.nombre }, { to: e }); enviar(e, b); }
    return true;
  });

  api.onIdentify((e) => inventario(e));
  api.on("ver", (from) => inventario(from));
  /** Tools and other worlds: is this receipt real? (body = the bare «nb1.…» or a downloaded recibo-….json). Says what the
   * good is and whether THIS world signed it; never who owns it. */
  api.route("POST", "/bienes/comprobar", (req) => {
    let token = req.body.trim();
    if (!token.startsWith("nb1.")) { try { const o = JSON.parse(token) as { recibo?: unknown }; token = typeof o?.recibo === "string" ? o.recibo.trim() : ""; } catch { token = ""; } }
    const v = api.verificarRecibo(token);
    if (!v.ok) return { status: 422, type: "json", body: { ok: false, motivo: v.motivo } };
    const r = v.recibo;
    return { type: "json", body: { ok: true, nuestro: v.nuestro, nombre: r.objeto.nombre, objeto: r.objeto.id, mundo: r.mundo, mision: r.mision, instante: r.instante, emisor: r.emisor, huella: v.huella } };
  });
});

export default crearBienes();
