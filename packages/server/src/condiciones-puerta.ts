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
//   · the record: { v: { layer: version }, d: [ids], en: ISO UTC }. The older versions a person accepted are kept (c6 shows only what changed).
import { defineFeature, serverPart } from "../../feature/src/index.ts";
import type { ServerApi, ServerPart } from "../../feature/src/index.ts";
import type { Aceptacion, CondicionesMensaje } from "../../net/src/index.ts";
import type { PuertaCondiciones, Who } from "../../instance/src/index.ts";
import type { Condiciones } from "./condiciones.ts";

export const condicionesFeature = defineFeature({
  id: "condiciones",
  version: 1,
  level: "base",
  describe: "Condiciones de entrada del mundo: guarda qué versión de cada capa y qué permisos de datos aceptó cada persona (a:<id>). Sin mensajes propios: viajan en CONDICIONES/ACEPTAR.",
  store: { describe: "Por persona (a:<id>): la versión de cada capa de condiciones que aceptó, los permisos de datos que marcó y cuándo (UTC)." },
});

type Registro = { v: Record<string, string>; d: string[]; en: string };
const registroValido = (x: unknown): x is Registro => {
  const r = x as Registro | null;
  return !!r && typeof r === "object" && !!r.v && typeof r.v === "object" && Array.isArray(r.d) && typeof r.en === "string";
};

export type OpcionesPuerta = { condiciones: Condiciones; activa: boolean; log?: (l: string) => void; ahora?: () => number };

/** The gate for these conditions. `part` is the feature that keeps the acceptances (add it to the server's features only when `activa`). */
export function crearPuertaCondiciones(o: OpcionesPuerta): PuertaCondiciones & { part: ServerPart; registro(id: string): Registro | null } {
  const { condiciones, activa } = o, ahora = o.ahora ?? Date.now;
  let api: ServerApi | null = null;
  const memoria = new Map<string, Registro>(); // no feature store (a bare world): lost on restart
  // the layers whose mandatory norms must be accepted, and the data points that can be ticked
  const piden = condiciones.capas.filter((c) => c.puntos.some((p) => p.obligatorio && p.tipo === "norma"));
  const datosIds = new Set(condiciones.capas.flatMap((c) => c.puntos.filter((p) => p.tipo === "datos").map((p) => p.id)));
  const versionDe = new Map(condiciones.capas.map((c) => [c.capa as string, c.version]));

  const registro = (id: string): Registro | null => {
    const r = api?.store.get(`a:${id}`);
    return registroValido(r) ? r : memoria.get(id) ?? null;
  };
  const faltan = (id: string | undefined): string[] => {
    const r = id ? registro(id) : null;
    return piden.filter((c) => r?.v[c.capa] !== c.version).map((c) => c.capa);
  };
  const estado = (who: Who | null, conCapas: boolean): CondicionesMensaje => {
    const r = who ? registro(who.id) : null, f = faltan(who?.id);
    return {
      formato: "condiciones-estado@1", puerta: activa, abierta: !activa || f.length === 0, faltan: f,
      aceptado: r ? { versiones: { ...r.v }, datos: [...r.d], en: r.en } : null,
      ...(conCapas ? { capas: condiciones.capas.map((c) => ({ capa: c.capa, ...(c.nombre ? { nombre: c.nombre } : {}), version: c.version, puntos: c.puntos.map((p) => ({ ...p })) })) } : {}),
    };
  };
  const aceptar = (who: Who, a: Aceptacion): CondicionesMensaje => {
    const antes = registro(who.id);
    const v = { ...(antes?.v ?? {}) };
    for (const [capa, version] of Object.entries(a.versiones)) if (versionDe.get(capa) === version) v[capa] = version; // only the current text counts
    const d = [...new Set(a.datos.filter((id) => datosIds.has(id)))]; // exactly the ticked data points; norms and unknown ids are not data
    const nuevo: Registro = { v, d, en: new Date(ahora()).toISOString() };
    if (api?.store.set(`a:${who.id}`, nuevo)) memoria.delete(who.id);
    else { memoria.set(who.id, nuevo); if (api) o.log?.(`[condiciones] no he podido guardar la aceptación de ${who.id}: vale mientras el servidor siga encendido`); }
    return estado(who, false);
  };

  const part = serverPart(condicionesFeature, (a) => { api = a; });
  return { activa, abierta: (who) => faltan(who.id).length === 0, estado, aceptar, part, registro };
}
