// lucha — server part (v1, L1). The server owns the fight: it places the creatures (a world's lucha.json or the house
// default), checks reach with the engine's `within`, keeps one cooldown per player as «the tick it may hit again» (no
// counter ticks down), rolls damage with the engine's seeded PRNG (core rngNext — never Math.random, never Date), lowers
// coherence in the shared state, dissolves the creature at 0 (it stops being solid: the simulation rebuilds its boxes from
// the state, as with objetos) and invokes it again REAPARICION_S later. No work when nothing changes: the tick hook only
// looks at the (usually empty) list of dissolved creatures and returns. The creature does not move or strike yet (L3).
import { rngNext } from "../../packages/core/src/index.ts";
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { lucha, DANO_BASE, DANO_VAR, ENFRIAMIENTO_TICKS, REAPARICION_S, VER_M } from "./feature.ts";
import { BESTIARIO } from "./bestiario.ts";
import { ECLIPSE, cargaTras, ticksDe } from "./habilidades.ts";

/** The server's tick rate (Hz): cooldown and return are counted in ticks of it. */
export const HZ = 20;
export type Criatura = { id: string; especie: string; x: number; z: number; y?: number; nombre?: string; reaparicion?: number };
/** The default creature of a world without its own lucha.json: south-east of the plaza (+z is south), away from the pond (18, −14). */
export const CRIATURAS_DEFECTO: Criatura[] = [{ id: "guardian-1", especie: "guardian-crisalida", x: 24, z: 10, y: 0 }];

/** The shared-state value of a creature at full coherence, with its solid box from the sheet (pure; tests use it). */
export function valorDe(c: Criatura): Msg | null {
  const f = BESTIARIO[c.especie];
  if (!f) return null;
  const y = c.y ?? 0, { ancho, alto, largo } = f.caja, r = (n: number) => Math.round(n * 100) / 100; // the schema's step
  return {
    nombre: (c.nombre ?? f.nombre).slice(0, 60), especie: c.especie, x: c.x, y, z: c.z, radio: f.radio,
    coherencia: f.coherenciaMax, coherenciaMax: f.coherenciaMax, modo: "quieta", solido: true,
    bx0: r(c.x - ancho / 2), by0: y, bz0: r(c.z - largo / 2), bx1: r(c.x + ancho / 2), by1: r(y + alto), bz1: r(c.z + largo / 2),
    color: f.color,
  };
}
/** One blow's damage from the engine's PRNG: DANO_BASE..DANO_BASE+DANO_VAR−1 (pure; tests use it). */
export const tirarDano = (rng: Uint32Array): number => DANO_BASE + (rngNext(rng) % DANO_VAR);

export const crearLucha = (opts: { criaturas?: Criatura[]; semilla?: number } = {}) => serverPart(lucha, (api: ServerApi) => {
  const rng = new Uint32Array([(opts.semilla ?? 0x10c4a) >>> 0]);
  const criaturas = new Map<string, Criatura>();
  const puedeDesde = new Map<number, number>();   // player → first tick a blow counts again
  const vuelven = new Map<string, number>();      // dissolved creature → tick it returns

  const lista = (opts.criaturas ?? CRIATURAS_DEFECTO).filter((c) => /^[a-z0-9-]{1,30}$/.test(String(c.id)) && Number.isFinite(c.x) && Number.isFinite(c.z));
  for (const c of lista) {
    const v = valorDe(c);
    if (!v) { api.log(`lucha: la criatura «${c.id}» es de una especie que no está en el bestiario («${c.especie}») y no se pone`); continue; }
    if (api.state.set(`c:${c.id}`, v, { at: { x: c.x, z: c.z } })) criaturas.set(`c:${c.id}`, c); else api.log(`lucha: la criatura «${c.id}» no cabe en el esquema y no se pone`);
  }
  api.log(`lucha: ${criaturas.size} criatura(s)`);

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: e }); };
  const poner = (key: string, v: Msg) => { const c = criaturas.get(key)!; api.state.set(key, v, { at: { x: c.x, z: c.z } }); };
  const cerca = (key: string) => { const c = criaturas.get(key)!; return { near: { x: c.x, z: c.z }, radius: VER_M }; };

  const carga = new Map<number, number>();         // player → Carga (0..100), lost on leaving
  const habDesde = new Map<string, number>();      // `player:ability` → first tick it may be used again
  api.onLeave((e) => { puedeDesde.delete(e); carga.delete(e); for (const k of [...habDesde.keys()]) if (k.startsWith(`${e}:`)) habDesde.delete(k); });

  api.on("golpear", (e, m) => {
    const key = String(m.objetivo), v = api.state.get(key);
    if (!v || !criaturas.has(key)) return rechazar(e, `No hay ninguna criatura «${key}».`);
    const t = api.tick();
    if (t < (puedeDesde.get(e) ?? 0)) return;                       // too soon: the mouse repeats; no event, no flood
    if (v.modo === "disuelta") return rechazar(e, "Ahí ya no hay nada que golpear.");
    if (!api.within(e, key)) return api.emit("aire", { objetivo: key }, { to: e });
    puedeDesde.set(e, t + ENFRIAMIENTO_TICKS);
    rng[0] = (rng[0] ^ Math.imul(t + 1, 0x9e3779b1)) >>> 0;      // mix the tick in: same inputs, same blows (replayable)
    const dano = tirarDano(rng), queda = Math.max(0, Number(v.coherencia) - dano);
    if (queda > 0) {
      poner(key, { ...v, coherencia: queda, modo: "alerta" });
      api.emit("golpe", { objetivo: key, de: e, dano, queda }, cerca(key));
      return;
    }
    poner(key, { ...v, coherencia: 0, modo: "disuelta", solido: false });
    api.emit("golpe", { objetivo: key, de: e, dano, queda: 0 }, cerca(key));
    api.emit("disuelta", { objetivo: key, de: e }, cerca(key));
    const s = criaturas.get(key)!.reaparicion ?? REAPARICION_S;
    if (s > 0) vuelven.set(key, t + Math.round(s * HZ));
  });

  // An ability: same reach/dissolution rules as `golpear`, plus its own cooldown and the player's Carga. Damage is the table's.
  api.on("habilidad", (e, m) => {
    const key = String(m.objetivo), cual = String(m.cual), h = ECLIPSE[cual], v = api.state.get(key);
    if (!h) return rechazar(e, `No conozco la habilidad «${cual}».`);
    if (!v || !criaturas.has(key)) return rechazar(e, `No hay ninguna criatura «${key}».`);
    const t = api.tick(), clave = `${e}:${cual}`;
    if (t < (habDesde.get(clave) ?? 0)) return;                      // cooling down: silent, the mouse repeats
    if (v.modo === "disuelta") return rechazar(e, "Ahí ya no hay nada que golpear.");
    const c = carga.get(e) ?? 0;
    if (c < h.coste) return rechazar(e, `Te falta Carga para ${h.nombre} (${c}/${h.coste}).`);
    if (!api.within(e, key)) return api.emit("aire", { objetivo: key }, { to: e });
    habDesde.set(clave, t + ticksDe(h));
    const nueva = cargaTras(c, h);
    carga.set(e, nueva);
    api.emit("carga", { valor: nueva }, { to: e });
    const dano = h.dano, queda = Math.max(0, Number(v.coherencia) - dano);
    if (queda > 0) {
      poner(key, { ...v, coherencia: queda, modo: "alerta" });
      api.emit("habilidad", { objetivo: key, de: e, cual, dano, queda }, cerca(key));
      return;
    }
    poner(key, { ...v, coherencia: 0, modo: "disuelta", solido: false });
    api.emit("habilidad", { objetivo: key, de: e, cual, dano, queda: 0 }, cerca(key));
    api.emit("disuelta", { objetivo: key, de: e }, cerca(key));
    const s = criaturas.get(key)!.reaparicion ?? REAPARICION_S;
    if (s > 0) vuelven.set(key, t + Math.round(s * HZ));
  });

  api.onTick((t) => {
    if (vuelven.size === 0) return;                                // nothing dissolved: nothing to do
    for (const [key, en] of vuelven) {
      if (t < en) continue;
      vuelven.delete(key);
      const v = valorDe(criaturas.get(key)!);
      if (!v) continue;
      poner(key, v);
      api.emit("vuelve", { objetivo: key }, cerca(key));
    }
  });
});

export default crearLucha();
