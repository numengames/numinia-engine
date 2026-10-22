// inventario — server part (Y1). Per guest, on S4: the Reserva lives in `api.store` under `i:<quien.id>` and is sent
// whole to its owner (every tab of the same guest) on identify and after each change. Objects enter through one
// door: any feature emits its own `otorga` event with scope "server" ({ quien: entity, tipo, clase, nombre, color?,
// icono?, valor?, n? }) and this part hears it (`api.listen`) — misiones does it when a quest's reward is a
// Semilla, pesca when a fish is landed (tipo «captura»). Deterministic: no clock, no randomness; ids come from a per-person counter (reglas.ts).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { inventario } from "./feature.ts";
import { BOLSA_HUECOS, PAGINAS_MAX, dar, desequipar, equipar, juntar, leerInventario, nuevoInventario, quitar, trocear } from "./reglas.ts";
import type { Color, Entrega, Inventario, Objeto, Tipo } from "./reglas.ts";

/** Who hands objects over today. A feature not on this server is logged by `listen` and simply never heard. */
export const DONANTES: [feature: string, event: string][] = [["misiones", "otorga"], ["pesca", "otorga"]];

export const crearInventario = (opts: { donantes?: [string, string][] } = {}) => serverPart(inventario, (api: ServerApi) => {
  const cache = new Map<string, Inventario>();   // "g:<guest>" (saved) or "e<entity>" (no identity: memory only)
  const claveDe = new Map<number, string>();      // entity -> its key (who() is gone by onLeave)

  const llave = (id: string, j: number) => (j ? `i:${id}:${j}` : `i:${id}`);
  const leerGuardado = (id: string): Inventario => juntar((j) => api.store.get(llave(id, j)));
  /** The Bolsa is stored in pages (reglas.ts: PAGINA) because S4 keeps 4,096 bytes per key; the pages that are no longer needed go away. */
  const escribir = (id: string, i: Inventario): boolean => {
    const paginas = trocear(i);
    for (let j = 0; j < paginas.length; j++) if (!api.store.set(llave(id, j), paginas[j])) return false;
    for (let j = paginas.length; j < PAGINAS_MAX; j++) if (api.store.get(llave(id, j)) !== undefined) api.store.delete(llave(id, j));
    return true;
  };
  const borrar = (id: string) => { for (let j = 0; j < PAGINAS_MAX; j++) api.store.delete(llave(id, j)); };

  const clave = (e: number) => { const w = api.who(e); const k = w ? `g:${w.id}` : `e${e}`; claveDe.set(e, k); return k; };
  const inv = (e: number): Inventario => {
    const k = clave(e);
    let i = cache.get(k);
    if (!i) { i = k.startsWith("g:") ? leerGuardado(k.slice(2)) : nuevoInventario(); cache.set(k, i); }
    return i;
  };
  const guardar = (e: number, i: Inventario) => { const w = api.who(e); if (w && !escribir(w.id, i)) api.log(`inventario: no pude guardar el de ${w.id}`); };
  /** Every connection of the same guest (two tabs share the Reserva); just this one without identity. */
  const suyos = (e: number): number[] => { const k = claveDe.get(e) ?? clave(e); return k.startsWith("g:") ? api.players().filter((x) => claveDe.get(x) === k) : [e]; };

  const objetoMsg = (o: Objeto): Msg => ({ id: o.id, tipo: o.tipo, clase: o.clase, nombre: o.nombre, icono: o.icono, color: o.color, valor: o.valor, n: o.n, portado: o.portado });
  const enviar = (e: number) => {
    const i = inv(e);
    for (const x of suyos(e)) {
      api.emit("lista", { total: i.objetos.length, huecos: BOLSA_HUECOS }, { to: x });
      for (const o of i.objetos) api.emit("objeto", objetoMsg(o), { to: x });
    }
  };
  const rechazar = (e: number, motivo: string, llena = false) => api.emit("rechazado", { motivo, llena }, { to: e });
  const tras = (e: number, i: Inventario) => { guardar(e, i); enviar(e); };

  /** The door: give `entrega` to the person behind `e`. Returns what happened (tests and other donors read it). */
  const otorgar = (e: number, entrega: Entrega) => {
    const i = inv(e), r = dar(i, entrega);
    if (!r.ok) { api.log(`inventario: no pude dar ${entrega.nombre}: ${r.motivo}`); rechazar(e, r.motivo, r.llena === true); return r; }
    guardar(e, i);
    for (const x of suyos(e)) api.emit("recibido", { id: r.objeto.id, nombre: r.objeto.nombre, n: r.objeto.n }, { to: x });
    enviar(e);
    return r;
  };

  for (const [f, ev] of opts.donantes ?? DONANTES) {
    api.listen(f, ev, (m) => {
      const e = Number(m.quien);
      if (!Number.isInteger(e) || !api.players().includes(e)) return;
      const r = otorgar(e, { tipo: String(m.tipo) as Tipo, clase: String(m.clase ?? ""), nombre: String(m.nombre ?? ""), icono: typeof m.icono === "string" ? m.icono : "", color: (typeof m.color === "string" ? m.color : "") as Color, valor: typeof m.valor === "number" ? m.valor : undefined, n: typeof m.n === "number" ? m.n : 1 });
      return r.ok; // «handled» = it is in the Reserva (a full Bolsa says no: the donor can tell its player)
    });
  }

  api.onIdentify((e) => { clave(e); enviar(e); });
  // identidad/i1: a guest's first pass. The two Reservas join: the guest's objects come after sub's, renumbered (ids are
  // o<serie> per person, so they would collide); the memory cache follows so an open tab of `sub` does not undo it.
  api.onAdoptar((invitado, sub) => {
    const mio = leerGuardado(invitado), suyo = cache.get(`g:${sub}`) ?? leerGuardado(sub);
    if (!mio.objetos.length) { borrar(invitado); return; }
    for (const o of mio.objetos) suyo.objetos.push({ ...o, id: `o${++suyo.serie}` });
    const antes = suyo.objetos.length, junto = leerInventario(suyo);
    if (junto.objetos.length < antes) api.log(`inventario: la Bolsa de ${sub} no tiene hueco para ${antes - junto.objetos.length} objeto(s) de ${invitado}`); // the limits hold (an over-full Bolsa keeps the oldest; a stack keeps its size)
    if (!escribir(sub, junto)) { api.log(`inventario: no pude juntar la Reserva de ${invitado} en ${sub}`); return; }
    cache.set(`g:${sub}`, junto); cache.delete(`g:${invitado}`); borrar(invitado);
    for (const x of api.players()) if (claveDe.get(x) === `g:${sub}`) enviar(x);
  });
  api.onLeave((e) => { const k = claveDe.get(e); claveDe.delete(e); if (k && !k.startsWith("g:")) cache.delete(k); else if (k && ![...claveDe.values()].includes(k)) cache.delete(k); });

  api.on("equipar", (e, m) => { const i = inv(e), r = equipar(i, String(m.id)); if (!r.ok) return rechazar(e, r.motivo); tras(e, i); });
  api.on("desequipar", (e, m) => { const i = inv(e), r = desequipar(i, String(m.id)); if (!r.ok) return rechazar(e, r.motivo, r.llena === true); tras(e, i); });
  api.on("soltar", (e, m) => { const i = inv(e), r = quitar(i, String(m.id), Number(m.n) || undefined); if (!r.ok) return rechazar(e, r.motivo); tras(e, i); });
});

export default crearInventario();
