// condiciones/c2 — the server's gate for the conditions of entry. The text is condiciones.ts's (C1); this file decides who has
// accepted it and keeps what they accepted. The Instance asks it (instance/src/index.ts, `puertaCerrada`): until a person has
// accepted EVERY mandatory `norma` of the current version they stay where they arrived and their chat, voice and feature
// messages (build, play) are ignored. A `datos` point never closes the gate (EDPB 05/2020 §39, GDPR 7.4): the validator
// refuses it as mandatory and here only the norms are asked.
//   · a layer is accepted as a block, by its version: `versiones: { casa: "2026-10" }`; a layer with no mandatory norma asks nothing;
//   · data points are accepted one by one: `datos: ["informe"]` = exactly the ones ticked (a later message replaces the list);
//   · an old version, an unknown layer or an unknown/`norma` id in `datos` is ignored: never kept, never opens the gate;
//   · kept by who (the guest id; a numinia.com person's id): the feature's store `a:<id>` (datos/condiciones.json(l), so it
//     travels with the world and moves to the person on their first pass like every `…:<guest>` key); a world with no features
//     (bare tests) keeps it in memory. Only built when the gate is on: a world with it off has no new feature and no new bytes.
//   · the record: { v: { layer: version }, d: [ids], en: ISO UTC, h?, t? }. c6 (a layer goes up a version): `h` = { layer: { point id: short
//     hash of titulo+texto+obligatorio+tipo } } of what the person accepted, `t` = the same for the titles (cut to 60, only to say «antes: …»).
//     With them the offer says, per layer, which points are `nuevos`, `cambiados` and `quitados` and the page asks ONLY that; a record with
//     no `h` (c2's, or one too big to keep) is asked everything as before. A data permission given for a point that did not change stays
//     given (it was not asked again); if the point changed the permission is gone and it is asked again, empty (informed consent).
import { defineFeature, serverPart } from "../../feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../feature/src/index.ts";
import { createHash } from "node:crypto";
import type { Aceptacion, CondicionesCambios, CondicionesMensaje } from "../../net/src/index.ts";
import type { PuertaCondiciones, Who } from "../../instance/src/index.ts";
import type { Capa, Condiciones, Punto } from "./condiciones.ts";

/** c6: the short fingerprint of what a point SAYS (title, text, mandatory or not, kind): 40 bits of SHA-256. The id is the key, not part of it. */
export const huellaPunto = (p: Pick<Punto, "titulo" | "texto" | "obligatorio" | "tipo">): string =>
  createHash("sha256").update(JSON.stringify([p.titulo, p.texto, p.obligatorio, p.tipo])).digest("hex").slice(0, 10);
const TITULO_ANTES_MAX = 60, REGISTRO_MAX = 3900; // under STORE_VALUE_MAX (4096): a record that does not fit loses `t`, then `h`, never the acceptance

export const condicionesFeature = defineFeature({
  id: "condiciones",
  version: 1,
  level: "base",
  describe: "Condiciones de entrada del mundo: guarda qué versión de cada capa y qué permisos de datos aceptó cada persona (a:<id>). Sin mensajes propios: viajan en CONDICIONES/ACEPTAR.",
  store: { describe: "Por persona (a:<id>): la versión de cada capa de condiciones que aceptó, los permisos de datos que marcó y cuándo (UTC)." },
});

type PorPunto = Record<string, Record<string, string>>;
type Registro = { v: Record<string, string>; d: string[]; en: string; h?: PorPunto; t?: PorPunto };
const registroValido = (x: unknown): x is Registro => {
  const r = x as Registro | null;
  return !!r && typeof r === "object" && !!r.v && typeof r.v === "object" && Array.isArray(r.d) && typeof r.en === "string";
};
/** One layer's `h` or `t` of a record, only if it is a plain object (anything else = not there). */
const deCapa = (m: PorPunto | undefined, capa: string): Record<string, string> | undefined => {
  const x = m?.[capa];
  return x && typeof x === "object" && !Array.isArray(x) ? x : undefined;
};
const tiene = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export type OpcionesPuerta = { condiciones: Condiciones; activa: boolean; log?: (l: string) => void; ahora?: () => number };

/** The gate for these conditions. `part` is the feature that keeps the acceptances (add it to the server's features only when `activa`). */
export function crearPuertaCondiciones(o: OpcionesPuerta): PuertaCondiciones & { part: ServerPart; registro(id: string): Registro | null; poner(c: Condiciones): void } {
  const { activa } = o, ahora = o.ahora ?? Date.now;
  let api: ServerApi | null = null;
  const memoria = new Map<string, Registro>(); // no feature store (a bare world): lost on restart
  // the layers whose mandatory norms must be accepted, and the data points that can be ticked. condiciones/w4: `poner` swaps the
  // text (the community published a new version) and these are derived again; whoever is already inside stays inside (Instance.admitido)
  let condiciones = o.condiciones, piden: Condiciones["capas"] = [], datosIds = new Set<string>(), versionDe = new Map<string, string>();
  const derivar = (): void => {
    piden = condiciones.capas.filter((c) => c.puntos.some((p) => p.obligatorio && p.tipo === "norma"));
    datosIds = new Set(condiciones.capas.flatMap((c) => c.puntos.filter((p) => p.tipo === "datos").map((p) => p.id)));
    versionDe = new Map(condiciones.capas.map((c) => [c.capa as string, c.version]));
  };
  derivar();

  const registro = (id: string): Registro | null => {
    const r = api?.store.get(`a:${id}`);
    return registroValido(r) ? r : memoria.get(id) ?? null;
  };
  const faltan = (id: string | undefined): string[] => {
    const r = id ? registro(id) : null;
    return piden.filter((c) => r?.v[c.capa] !== c.version).map((c) => c.capa);
  };
  /** c6: what changed in this layer since the version the person accepted. Nothing (undefined) when they never accepted this layer,
   * accepted this very version, or the record has no fingerprints (c2's): then the page asks everything. */
  const cambiosDe = (r: Registro | null, c: Capa): CondicionesCambios | undefined => {
    const desde = r?.v[c.capa], h = deCapa(r?.h, c.capa);
    if (!r || desde === undefined || desde === c.version || !h) return undefined;
    const nuevos: string[] = [], cambiados: string[] = [], vigentes = new Set(c.puntos.map((p) => p.id));
    for (const p of c.puntos) { if (!tiene(h, p.id)) nuevos.push(p.id); else if (h[p.id] !== huellaPunto(p)) cambiados.push(p.id); }
    const quitados = Object.keys(h).filter((id) => !vigentes.has(id));
    const t = deCapa(r.t, c.capa), antes: Record<string, string> = {};
    for (const id of [...cambiados, ...quitados]) if (t && typeof t[id] === "string") antes[id] = t[id];
    return { desde, nuevos, cambiados, quitados, ...(Object.keys(antes).length ? { antes } : {}) };
  };
  const estado = (who: Who | null, conCapas: boolean): CondicionesMensaje => {
    const r = who ? registro(who.id) : null, f = faltan(who?.id);
    return {
      formato: "condiciones-estado@1", puerta: activa, abierta: !activa || f.length === 0, faltan: f,
      aceptado: r ? { versiones: { ...r.v }, datos: [...r.d], en: r.en } : null,
      ...(conCapas ? { capas: condiciones.capas.map((c) => {
        const cambios = cambiosDe(r, c);
        return { capa: c.capa, ...(c.nombre ? { nombre: c.nombre } : {}), version: c.version, puntos: c.puntos.map((p) => ({ ...p })), ...(cambios ? { cambios } : {}) };
      }) } : {}),
    };
  };
  /** c6: the data permissions already given that this acceptance did NOT ask again: the point is in a layer the person is returning to
   * (they accepted another version of it, fingerprints kept) and did not change (same fingerprint). A changed point is not here: its
   * permission is gone and it is asked again, empty. A layer at the very version accepted is not «returning»: a message about it replaces
   * the list as in c2 (a page that did not show it carries the permissions it keeps: apps/plaza/condiciones-logica.ts, `aceptacion`). */
  const conservados = (antes: Registro | null): string[] => {
    if (!antes) return [];
    const ids: string[] = [];
    for (const c of condiciones.capas) {
      const desde = antes.v[c.capa], h = deCapa(antes.h, c.capa);
      if (desde === undefined || desde === c.version || !h) continue;
      for (const p of c.puntos) if (p.tipo === "datos" && antes.d.includes(p.id) && tiene(h, p.id) && h[p.id] === huellaPunto(p)) ids.push(p.id);
    }
    return ids;
  };
  const aceptar = (who: Who, a: Aceptacion): CondicionesMensaje => {
    const antes = registro(who.id);
    const v = { ...(antes?.v ?? {}) };
    const h: PorPunto = {}, t: PorPunto = {};
    for (const capa of Object.keys(antes?.h ?? {})) { const y = deCapa(antes?.h, capa); if (y) h[capa] = { ...y }; }
    for (const capa of Object.keys(antes?.t ?? {})) { const y = deCapa(antes?.t, capa); if (y) t[capa] = { ...y }; }
    const quedan = conservados(antes);
    for (const c of condiciones.capas) {
      if (!tiene(a.versiones, c.capa) || a.versiones[c.capa] !== c.version) continue; // only the current text counts
      v[c.capa] = c.version;
      h[c.capa] = Object.fromEntries(c.puntos.map((p) => [p.id, huellaPunto(p)]));
      t[c.capa] = Object.fromEntries(c.puntos.map((p) => [p.id, p.titulo.slice(0, TITULO_ANTES_MAX)]));
    }
    const d = [...new Set([...a.datos.filter((id) => datosIds.has(id)), ...quedan])]; // the ticked data points that exist (norms and unknown ids are not data) + the ones not asked again
    let nuevo: Registro = { v, d, en: new Date(ahora()).toISOString(), h, t };
    const bytes = (x: Registro) => new TextEncoder().encode(JSON.stringify(x)).length;
    if (bytes(nuevo) > REGISTRO_MAX) nuevo = { v, d, en: nuevo.en, h };
    if (bytes(nuevo) > REGISTRO_MAX) nuevo = { v, d, en: nuevo.en };
    if (api?.store.set(`a:${who.id}`, nuevo)) memoria.delete(who.id);
    else { memoria.set(who.id, nuevo); if (api) o.log?.(`[condiciones] no he podido guardar la aceptación de ${who.id}: vale mientras el servidor siga encendido`); }
    return estado(who, false);
  };

  const part = serverPart(condicionesFeature, (a) => { api = a; });
  const poner = (c: Condiciones): void => { condiciones = c; derivar(); }; // condiciones/w4: the text for whoever arrives (or asks) from now on
  return { activa, abierta: (who) => faltan(who.id).length === 0, estado, aceptar, part, registro, poner };
}
