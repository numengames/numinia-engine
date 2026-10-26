// lucha — server part (v1, L1 + L2 trozo 1). The server owns the fight: it places the creatures (a world's lucha.json or
// the house default), checks reach with the engine's `within`, keeps one cooldown per player as «the tick it may hit
// again» (no counter ticks down), rolls damage with the engine's seeded PRNG (core rngNext — never Math.random, never
// Date), lowers coherence in the shared state, dissolves the creature at 0 (it stops being solid: the simulation
// rebuilds its boxes from the state, as with objetos) and invokes it again REAPARICION_S later. No work when nothing
// changes: the tick hook only looks at the (usually empty) lists of dissolved creatures and fallen players and returns.
// MIS-245: a creature whose sheet has a `conducta` (bestiario.ts) walks too: every MOVER_CADA_TICKS ticks, while someone is near, it
// steps towards the nearest person inside its sight and its leash (persecucion.ts, pure), strikes them on its own cooldown when in
// reach (the same `contraatacar` as the strike-back: `jugadorHerido`, `jugadorCaido`) and walks home when nobody is left; a world
// pins one with `fija: true` in lucha.json. The server decides every step and every blow; the page only draws. Every blow a player lands, it strikes back: the player's own life,
// kept in server memory only (no shared state, no HUD yet: that is L2's next story), goes down by the same roll. At 0
// the player falls (`caido`): `golpear` and `habilidad` are refused until REAPARICION_JUGADOR_TICKS pass, then they come
// back whole. Two independent paths down, one way back each: the creature's strike-back (life → caído → jugadorVuelve) and,
// only where the world turns pvp on, the Estado ladder (estados.ts: Aletargado → `reaparece` on the last safe spot). A person
// at Colapsado or worse strikes nothing (creature or person); a fallen person strikes nothing. `habilidad` (Eclipse Mnémico
// kit, habilidades.ts) provokes the same strike-back through the same function (`contraatacar`) when the creature survives
// it; if the ability dissolves the creature (Discontinuidad deals 55, a creature has 50) nothing strikes back.
import { rngNext } from "../../packages/core/src/index.ts";
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import type { Pvp } from "./estados.ts";
import { crearEscalera, NIVEL_COLAPSADO, NIVEL_ALETARGADO, ESCALERA, INCAPACITADO_S, pvpEntre } from "./estados.ts";
import { lucha, ALCANCE_PVP_M, DANO_BASE, DANO_VAR, ENFRIAMIENTO_TICKS, REAPARICION_S, VER_M, VIDA_JUGADOR_MAX, REAPARICION_JUGADOR_TICKS } from "./feature.ts";
import { BESTIARIO } from "./bestiario.ts";
import { ECLIPSE, CRITICO_PCT, CRITICO_X, cargaTras, ticksDe } from "./habilidades.ts";
import { MOVER_CADA_TICKS, NIVEL_MAX_M, pasoDeCriatura } from "./persecucion.ts";

/** The server's tick rate (Hz): cooldown and return are counted in ticks of it. */
export const HZ = 20;
export type Criatura = { id: string; especie: string; x: number; z: number; y?: number; nombre?: string; reaparicion?: number; /** true = it never walks (a world pins it where it is). */ fija?: boolean };
/** The default creature of a world without its own lucha.json: south-east of the plaza (+z is south), away from the pond (18, −14). */
export const CRIATURAS_DEFECTO: Criatura[] = [
  { id: "guardian-1", especie: "guardian-crisalida", x: 24, z: 10, y: 0 },
  { id: "residuo-1", especie: "residuo-del-velo", x: 30, z: 2, y: 0 },        // MIS-245: the small one, to learn to fight
  { id: "umbrilego-1", especie: "umbrilego", x: -28, z: 18, y: 0 },
  { id: "desgarraforma-1", especie: "desgarraformas", x: -24, z: -22, y: 0 },
];

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
/** Does this ability roll a critical? CRITICO_PCT % from the engine's PRNG (pure given the state; tests use it). */
export const tirarCritico = (rng: Uint32Array): boolean => rngNext(rng) % 100 < CRITICO_PCT;
/** One blow's damage from the engine's PRNG: DANO_BASE..DANO_BASE+DANO_VAR−1 (pure; tests use it). */
export const tirarDano = (rng: Uint32Array): number => DANO_BASE + (rngNext(rng) % DANO_VAR);

export const crearLucha = (opts: { criaturas?: Criatura[]; semilla?: number; pvp?: boolean | Pvp } = {}) => serverPart(lucha, (api: ServerApi) => {
  const rng = new Uint32Array([(opts.semilla ?? 0x10c4a) >>> 0]);
  const criaturas = new Map<string, Criatura>();
  const puedeDesde = new Map<number, number>();   // player → first tick a blow counts again
  const pvp: Pvp = typeof opts.pvp === "object" ? opts.pvp : { mundo: opts.pvp === true, zonas: [] }; // off unless the world turns it on (entorno.json pvp / zonasPvp)
  const escalera = crearEscalera();                // the players' Estado ladder (server-owned, estados.ts)
  const reaparecen = new Map<number, number>();    // Aletargado player → tick the server puts them back on their last safe spot
  const vuelven = new Map<string, number>();       // dissolved creature → tick it returns
  const vida = new Map<number, number>();          // player → life left (server memory only, L2 trozo 1)
  const caidos = new Map<number, number>();        // fallen player → tick they come back whole

  const donde = new Map<string, { x: number; z: number }>();   // creature → where it stands now (its home is the `criaturas` entry; only a walker ever differs)
  const golpeaDesde = new Map<string, number>();               // creature → first tick its next blow may land
  const caminan = new Set<string>();                           // the creatures that may walk (a sheet with `conducta`, not pinned): the tick looks at these only
  const lista = (opts.criaturas ?? CRIATURAS_DEFECTO).filter((c) => /^[a-z0-9-]{1,30}$/.test(String(c.id)) && Number.isFinite(c.x) && Number.isFinite(c.z));
  for (const c of lista) {
    const v = valorDe(c);
    if (!v) { api.log(`lucha: la criatura «${c.id}» es de una especie que no está en el bestiario («${c.especie}») y no se pone`); continue; }
    if (api.state.set(`c:${c.id}`, v, { at: { x: c.x, z: c.z } })) { criaturas.set(`c:${c.id}`, c); if (BESTIARIO[c.especie]?.conducta && c.fija !== true) caminan.add(`c:${c.id}`); } else api.log(`lucha: la criatura «${c.id}» no cabe en el esquema y no se pone`);
  }
  api.log(`lucha: ${criaturas.size} criatura(s)`);

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: e }); };
  const aqui = (key: string) => donde.get(key) ?? criaturas.get(key)!;
  const poner = (key: string, v: Msg) => { const c = aqui(key); api.state.set(key, v, { at: { x: c.x, z: c.z } }); };
  const cerca = (key: string) => { const c = aqui(key); return { near: { x: c.x, z: c.z }, radius: VER_M }; };

  const carga = new Map<number, number>();         // player → Carga (0..100), lost on leaving
  const habDesde = new Map<string, number>();      // `player:ability` → first tick it may be used again
  api.onLeave((e) => { puedeDesde.delete(e); escalera.reiniciar(e); reaparecen.delete(e); vida.delete(e); caidos.delete(e); carga.delete(e); for (const k of [...habDesde.keys()]) if (k.startsWith(`${e}:`)) habDesde.delete(k); });

  /** A person on the Estado ladder at Colapsado or worse «only reacts» (estados.ts): they strike no creature either. Never true without PVP. */
  const colapsado = (e: number): boolean => escalera.size > 0 && escalera.nivel(e, api.tick()) >= NIVEL_COLAPSADO;

  /** PVP blow (`objetivo: p:<entidad>`): the server decides if PVP is on, reach, cooldown and the rung; no damage number. */
  const golpearPersona = (e: number, m: Msg) => {
    const otro = Number(String(m.objetivo).slice(2)), t = api.tick();
    if (!Number.isInteger(otro) || otro === e || !api.players().includes(otro)) return rechazar(e, "Ahí no hay nadie a quien golpear.");
    if (t < (puedeDesde.get(e) ?? 0)) return;
    if (escalera.nivel(e, t) >= NIVEL_COLAPSADO) return rechazar(e, "Estás colapsado: no puedes golpear.");
    if (escalera.nivel(otro, t) >= NIVEL_ALETARGADO) return rechazar(e, "Esa persona ya está aletargada.");
    if (api.leyendoNormas(otro)) return rechazar(e, "Esa persona está leyendo las normas: ahora no se la puede golpear.");   // condiciones/c5: inside the bubble nobody touches you
    const a = api.position(e), b = api.position(otro);
    if (!a || !b) return rechazar(e, "Ahí no hay nadie a quien golpear.");
    if (!pvpEntre(pvp, a, b)) return rechazar(e, "Aquí no se lucha entre personas.");   // the SERVER's flag, world and zone; the page cannot argue
    if (Math.hypot(a.x - b.x, a.z - b.z) > ALCANCE_PVP_M) return api.emit("aire", { objetivo: String(m.objetivo) }, { to: e });
    puedeDesde.set(e, t + ENFRIAMIENTO_TICKS);
    const n = escalera.subir(otro, t);
    api.emit("estado", { objetivo: `p:${otro}`, estado: ESCALERA[n], de: e }, { near: { x: b.x, z: b.z }, radius: VER_M });
    if (n >= NIVEL_ALETARGADO) {                                  // «dying»: still for a while, then back on a safe spot; nothing of theirs is touched
      api.ordenar(otro, { quieto: INCAPACITADO_S });
      reaparecen.set(otro, t + INCAPACITADO_S * HZ);
    }
  };

  /** The creature's strike-back: the ONE path both `golpear` and `habilidad` take. Lowers the player's life by `dano`
   *  (server memory only), tells them (`jugadorHerido`) and, at 0, fells them (`jugadorCaido`) until REAPARICION_JUGADOR_TICKS pass. */
  const contraatacar = (e: number, t: number, dano: number) => {
    const vidaDespues = Math.max(0, (vida.get(e) ?? VIDA_JUGADOR_MAX) - dano);
    vida.set(e, vidaDespues);
    api.emit("jugadorHerido", { dano, vida: vidaDespues }, { to: e });
    if (vidaDespues === 0) {
      caidos.set(e, t + REAPARICION_JUGADOR_TICKS);
      api.emit("jugadorCaido", {}, { to: e });
    }
  };

  api.on("golpear", (e, m) => {
    if (caidos.has(e)) return rechazar(e, "Estás caído: espera a recuperarte.");   // #145: a fallen player strikes nobody
    if (/^p:/.test(String(m.objetivo))) return golpearPersona(e, m);
    if (colapsado(e)) return rechazar(e, "Estás colapsado: no puedes golpear.");
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
    } else {
      poner(key, { ...v, coherencia: 0, modo: "disuelta", solido: false });
      api.emit("golpe", { objetivo: key, de: e, dano, queda: 0 }, cerca(key));
      api.emit("disuelta", { objetivo: key, de: e }, cerca(key));
      const s = criaturas.get(key)!.reaparicion ?? REAPARICION_S;
      if (s > 0) vuelven.set(key, t + Math.round(s * HZ));
    }
    contraatacar(e, t, dano);                                      // L2 trozo 1: the creature strikes back with the same roll
  });

  // An ability: same reach/dissolution rules as `golpear`, plus its own cooldown and the player's Carga. Damage is the table's.
  api.on("habilidad", (e, m) => {
    if (caidos.has(e)) return rechazar(e, "Estás caído: espera a recuperarte.");   // same rule as `golpear` (#145)
    if (colapsado(e)) return rechazar(e, "Estás colapsado: no puedes golpear.");
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
    rng[0] = (rng[0] ^ Math.imul(t + 1, 0x9e3779b1)) >>> 0;        // same mix as `golpear`: same inputs, same crits (replayable)
    const critico = tirarCritico(rng), dano = h.dano * (critico ? CRITICO_X : 1), queda = Math.max(0, Number(v.coherencia) - dano);
    if (queda > 0) {
      poner(key, { ...v, coherencia: queda, modo: "alerta" });
      api.emit("habilidad", { objetivo: key, de: e, cual, dano, queda, critico }, cerca(key));
      if (critico) api.emit("critico", { objetivo: key, de: e, dano }, cerca(key));
      contraatacar(e, t, tirarDano(rng));                          // the creature that survives strikes back, with ITS roll (not the ability's 55)
      return;
    }
    poner(key, { ...v, coherencia: 0, modo: "disuelta", solido: false });
    api.emit("habilidad", { objetivo: key, de: e, cual, dano, queda: 0, critico }, cerca(key));
    if (critico) api.emit("critico", { objetivo: key, de: e, dano }, cerca(key));
    api.emit("disuelta", { objetivo: key, de: e }, cerca(key));
    const s = criaturas.get(key)!.reaparicion ?? REAPARICION_S;
    if (s > 0) vuelven.set(key, t + Math.round(s * HZ));                  // a creature the ability dissolves does NOT strike back: it is gone
  });

  /** MIS-245: one step of every walker that is standing (not dissolved). Costs a look at the (few) walkers and, for each,
   *  a sphere query; nothing is written unless it moved or changed mode. */
  const caminar = (t: number) => {
    for (const key of caminan) {
      const v = api.state.get(key), c = criaturas.get(key), f = BESTIARIO[c?.especie ?? ""], k = f?.conducta;
      if (!v || !c || !k || v.modo === "disuelta") continue;
      const aca = aqui(key), y = c.y ?? 0;
      const gente = api.overlapSphere(aca.x, y, aca.z, k.vision + 1).filter((e) => !caidos.has(e) && !api.leyendoNormas(e) && !(escalera.size > 0 && escalera.nivel(e, t) >= NIVEL_ALETARGADO)).flatMap((e) => {
        const p = api.position(e);
        return p && Math.abs(p.y - y) <= NIVEL_MAX_M ? [{ entidad: e, x: p.x, z: p.z }] : [];
      });
      const paso = pasoDeCriatura(aca, c, k, gente, MOVER_CADA_TICKS / HZ);
      const movio = paso.x !== aca.x || paso.z !== aca.z;
      if (movio || paso.modo !== v.modo) {
        donde.set(key, { x: paso.x, z: paso.z });
        const w = valorDe({ ...c, x: paso.x, z: paso.z })!;                        // its box moves with it (the simulation rebuilds the solids)
        poner(key, { ...v, x: w.x, z: w.z, bx0: w.bx0, bz0: w.bz0, bx1: w.bx1, bz1: w.bz1, modo: paso.modo });
      }
      if (paso.alcanza && paso.objetivo !== null && t >= (golpeaDesde.get(key) ?? 0)) {
        golpeaDesde.set(key, t + k.enfriamiento);
        rng[0] = (rng[0] ^ Math.imul(t + 1, 0x9e3779b1)) >>> 0;                    // same mix as `golpear`: same inputs, same blows (replayable)
        const dano = k.dano + (rngNext(rng) % k.variacion);
        api.emit("ataca", { objetivo: key, a: paso.objetivo, dano }, cerca(key));
        contraatacar(paso.objetivo, t, dano);
      }
    }
  };

  api.onTick((t) => {
    if (reaparecen.size > 0) {
      for (const [e, en] of reaparecen) {
        if (t < en) continue;
        reaparecen.delete(e);
        if (!api.position(e)) continue;                            // gone meanwhile (onLeave already forgot it)
        if (!api.volverASeguro(e)) api.log(`lucha: ${e} reaparece donde está: no hay un sitio seguro al que volver`);
        escalera.reiniciar(e);                                     // back to ninguno either way: items, avatar and name stay as they were
        const p = api.position(e);
        api.emit("reaparece", { objetivo: `p:${e}` }, p ? { near: { x: p.x, z: p.z }, radius: VER_M } : { to: e });
      }
    }
    if (vuelven.size > 0) for (const [key, en] of vuelven) {
      if (t < en) continue;
      vuelven.delete(key);
      donde.delete(key); golpeaDesde.delete(key);                   // it comes back at home
      const v = valorDe(criaturas.get(key)!);
      if (!v) continue;
      poner(key, v);
      api.emit("vuelve", { objetivo: key }, cerca(key));
    }
    if (caminan.size > 0 && t % MOVER_CADA_TICKS === 0) caminar(t);
    if (caidos.size > 0) for (const [e, en] of caidos) {
      if (t < en) continue;
      caidos.delete(e);
      vida.set(e, VIDA_JUGADOR_MAX);
      api.emit("jugadorVuelve", {}, { to: e });
    }
  });
});

export default crearLucha();
