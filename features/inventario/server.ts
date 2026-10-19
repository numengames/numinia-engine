// inventario — server part (Y1). Per guest, on S4: the Reserva lives in `api.store` under `i:<quien.id>` and is sent
// whole to its owner (every tab of the same guest) on identify and after each change. Objects enter through one
// door: any feature emits its own `otorga` event with scope "server" ({ quien: entity, tipo, clase, nombre, color?,
// icono?, valor?, n? }) and this part hears it (`api.listen`) — misiones does it when a quest's reward is a
// Semilla. Deterministic: no clock, no randomness; ids come from a per-person counter (reglas.ts).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { inventario } from "./feature.ts";
import { dar, desequipar, equipar, leerInventario, nuevoInventario, quitar } from "./reglas.ts";
import type { Color, Entrega, Inventario, Objeto, Tipo } from "./reglas.ts";

/** Who hands objects over today. A feature not on this server is logged by `listen` and simply never heard. */
export const DONANTES: [feature: string, event: string][] = [["misiones", "otorga"]];

export const crearInventario = (opts: { donantes?: [string, string][] } = {}) => serverPart(inventario, (api: ServerApi) => {
  const cache = new Map<string, Inventario>();   // "g:<guest>" (saved) or "e<entity>" (no identity: memory only)
  const claveDe = new Map<number, string>();      // entity -> its key (who() is gone by onLeave)

  const clave = (e: number) => { const w = api.who(e); const k = w ? `g:${w.id}` : `e${e}`; claveDe.set(e, k); return k; };
  const inv = (e: number): Inventario => {
    const k = clave(e);
    let i = cache.get(k);
    if (!i) { i = k.startsWith("g:") ? leerInventario(api.store.get(`i:${k.slice(2)}`)) : nuevoInventario(); cache.set(k, i); }
    return i;
  };
  const guardar = (e: number, i: Inventario) => { const w = api.who(e); if (w && !api.store.set(`i:${w.id}`, i)) api.log(`inventario: no pude guardar el de ${w.id}`); };
  /** Every connection of the same guest (two tabs share the Reserva); just this one without identity. */
  const suyos = (e: number): number[] => { const k = claveDe.get(e) ?? clave(e); return k.startsWith("g:") ? api.players().filter((x) => claveDe.get(x) === k) : [e]; };

  const objetoMsg = (o: Objeto): Msg => ({ id: o.id, tipo: o.tipo, clase: o.clase, nombre: o.nombre, icono: o.icono, color: o.color, valor: o.valor, n: o.n, portado: o.portado });
  const enviar = (e: number) => {
    const i = inv(e);
    for (const x of suyos(e)) {
      api.emit("lista", { total: i.objetos.length }, { to: x });
      for (const o of i.objetos) api.emit("objeto", objetoMsg(o), { to: x });
    }
  };
  const rechazar = (e: number, motivo: string) => api.emit("rechazado", { motivo }, { to: e });
  const tras = (e: number, i: Inventario) => { guardar(e, i); enviar(e); };

  /** The door: give `entrega` to the person behind `e`. Returns what happened (tests and other donors read it). */
  const otorgar = (e: number, entrega: Entrega) => {
    const i = inv(e), r = dar(i, entrega);
    if (!r.ok) { api.log(`inventario: no pude dar ${entrega.nombre}: ${r.motivo}`); rechazar(e, r.motivo); return r; }
    guardar(e, i);
    for (const x of suyos(e)) api.emit("recibido", { id: r.objeto.id, nombre: r.objeto.nombre, n: r.objeto.n }, { to: x });
    enviar(e);
    return r;
  };

  for (const [f, ev] of opts.donantes ?? DONANTES) {
    api.listen(f, ev, (m) => {
      const e = Number(m.quien);
      if (!Number.isInteger(e) || !api.players().includes(e)) return;
      otorgar(e, { tipo: String(m.tipo) as Tipo, clase: String(m.clase ?? ""), nombre: String(m.nombre ?? ""), icono: typeof m.icono === "string" ? m.icono : "", color: (typeof m.color === "string" ? m.color : "") as Color, valor: typeof m.valor === "number" ? m.valor : undefined, n: typeof m.n === "number" ? m.n : 1 });
      return true;
    });
  }

  api.onIdentify((e) => { clave(e); enviar(e); });
  // identidad/i1: a guest's first pass. The two Reservas join: the guest's objects come after sub's, renumbered (ids are
  // o<serie> per person, so they would collide); the memory cache follows so an open tab of `sub` does not undo it.
  api.onAdoptar((invitado, sub) => {
    const mio = leerInventario(api.store.get(`i:${invitado}`)), suyo = cache.get(`g:${sub}`) ?? leerInventario(api.store.get(`i:${sub}`));
    if (!mio.objetos.length) { api.store.delete(`i:${invitado}`); return; }
    for (const o of mio.objetos) suyo.objetos.push({ ...o, id: `o${++suyo.serie}` });
    const junto = leerInventario(suyo); // the limits hold (an over-full Reserva keeps the oldest; a stack keeps its size)
    if (!api.store.set(`i:${sub}`, junto)) { api.log(`inventario: no pude juntar la Reserva de ${invitado} en ${sub}`); return; }
    cache.set(`g:${sub}`, junto); cache.delete(`g:${invitado}`); api.store.delete(`i:${invitado}`);
    for (const x of api.players()) if (claveDe.get(x) === `g:${sub}`) enviar(x);
  });
  api.onLeave((e) => { const k = claveDe.get(e); claveDe.delete(e); if (k && !k.startsWith("g:")) cache.delete(k); else if (k && ![...claveDe.values()].includes(k)) cache.delete(k); });

  api.on("equipar", (e, m) => { const i = inv(e), r = equipar(i, String(m.id)); if (!r.ok) return rechazar(e, r.motivo); tras(e, i); });
  api.on("desequipar", (e, m) => { const i = inv(e), r = desequipar(i, String(m.id)); if (!r.ok) return rechazar(e, r.motivo); tras(e, i); });
  api.on("soltar", (e, m) => { const i = inv(e), r = quitar(i, String(m.id), Number(m.n) || undefined); if (!r.ok) return rechazar(e, r.motivo); tras(e, i); });
});

export default crearInventario();
