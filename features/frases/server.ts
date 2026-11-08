// frases — server part (Y29). The server decides: it checks the id is on the list, applies the pace (one a second,
// three in a row, as the near chat) and tells whoever is within 20 m (the speaker too) THE ID, never text. It honours the
// roles' silence and block (the same events the chat hears). The list is published as state, once, for pages and agents.
import { serverPart } from "../../packages/feature/src/index.ts";
import { frases, CERCA_M, NOMBRE_MAX, RITMO } from "./feature.ts";
import { LISTA, textoDe } from "./frases.ts";

const TICKS_POR_SEGUNDO = 20; // the sim's TICK_HZ (features import only core, schema, feature and the plug)
const RARO = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const nombreLimpio = (t: string): string => {
  const una = String(t ?? "").toWellFormed().replace(RARO, " ").replace(/\s+/g, " ").trim();
  let out = "", n = 0;
  for (const ch of una) { const b = new TextEncoder().encode(ch).length; if (n + b > NOMBRE_MAX) break; out += ch; n += b; }
  return out.trim();
};

export default serverPart(frases, (api) => {
  const fichas = new Map<number, { t: number; tick: number }>(); // entity -> tokens and the tick they were counted
  const callados = new Map<number, number>();        // entity -> tick until which it is silenced (the roles' «silencio»)
  const bloqueados = new Map<number, Set<number>>(); // listener -> speakers it does not read (the roles' «bloqueo»)
  const nombresPropios = new Map<number, string>();  // entity -> name chosen with /nombre

  for (const f of LISTA.frases) api.state.set(f.id, { orden: f.orden, grupo: f.grupo, en: f.en, es: f.es });

  const rechazar = (to: number, motivo: string) => { api.emit("rechazado", { motivo }, { to }); };
  const nombreDe = (e: number): string => nombresPropios.get(e) ?? (nombreLimpio(api.who(e)?.nombre ?? "") || `Person ${e}`);
  const tomar = (e: number): boolean => {
    const now = api.tick();
    let b = fichas.get(e);
    if (!b) fichas.set(e, (b = { t: RITMO.burst, tick: now }));
    b.t = Math.min(RITMO.burst, b.t + ((now - b.tick) * RITMO.perSecond) / TICKS_POR_SEGUNDO); b.tick = now;
    if (b.t < 1) return false;
    b.t -= 1;
    return true;
  };

  api.on("frase", (from, msg) => {
    const id = String(msg.id ?? "");
    if (textoDe(id, "en") === null) { rechazar(from, `Unknown phrase «${id.slice(0, 24)}». Pick one of the ${LISTA.frases.length} ids on the cards of «frases» (hello, thanks, help…).`); return; }
    const hasta = callados.get(from);
    if (hasta !== undefined && api.tick() < hasta) { rechazar(from, "You are silenced for now: nobody reads you."); return; }
    if (!tomar(from)) { rechazar(from, "Too fast: wait a second and try again."); return; }
    const except: number[] = [];
    for (const [p, s] of bloqueados) if (s.has(from)) except.push(p);
    api.emit("dicha", { quien: from, nombre: nombreDe(from), frase: id }, { near: from, radius: CERCA_M, except });
  });

  api.listen("roles", "bloqueo", (m) => {
    const p = Number(m.quien), h = Number(m.a);
    if (Number(m.si)) { let s = bloqueados.get(p); if (!s) bloqueados.set(p, (s = new Set())); s.add(h); }
    else { const s = bloqueados.get(p); if (s) { s.delete(h); if (!s.size) bloqueados.delete(p); } }
    return true;
  });
  api.listen("roles", "silencio", (m) => {
    const e = Number(m.quien), s = Number(m.segundos);
    if (s > 0) callados.set(e, api.tick() + s * TICKS_POR_SEGUNDO); else callados.delete(e);
    return true;
  });
  api.listen("roles", "nombreCambiado", (m) => {
    const n = nombreLimpio(String(m.nombre ?? ""));
    if (n) nombresPropios.set(Number(m.quien), n);
    return true;
  });
  api.onLeave((e) => {
    fichas.delete(e); callados.delete(e); bloqueados.delete(e); nombresPropios.delete(e);
    for (const s of bloqueados.values()) s.delete(e);
  });
});
