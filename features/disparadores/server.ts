// disparadores — server part (v1, D-041). The server owns the cable: it reads the world's triggers (already checked
// line by line by `leerDisparadores`), watches who enters each zone every tick, checks the reach of each press
// (api.within), counts cooldowns in ticks and «one use only», tells whoever is near (`disparado`) and emits one
// server-only `accion` per receiver so the owning feature acts (`api.listen("disparadores", "accion", …)`). No page decides.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { disparadores, ACCIONES, CERCA_M, COOLDOWN_MAX_S, DISPARADORES_MAX, RECEPTORES_MAX, TICK_HZ } from "./feature.ts";
import type { Accion } from "./feature.ts";

export type Receptor =
  | { accion: "muestra" | "oculta"; objeto: string }
  | { accion: "teletransporta"; x: number; y: number; z: number }
  | { accion: "da_paso"; mision: string; paso: number }
  | { accion: "abre_enlace"; enlace: string }
  | { accion: "suena"; sonido: string }
  | { accion: "vuelve_a_seguro" };
export type Disparador = { id: string; nombre: string; tipo: "zona" | "boton"; x: number; y: number; z: number; radio: number; alcance: number; frase: string; cooldown: number; unSoloUso: boolean; receptores: Receptor[] };
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,15}$/;
const MISION_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const entre = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

/** One receiver's line, checked (or why it is left out). Only the six actions of the ficha; anything else is a new piece. */
export function leerReceptor(r: unknown): Receptor | string {
  const o = (r ?? {}) as Record<string, unknown>;
  const accion = String(o.accion ?? "");
  if (!(ACCIONES as readonly string[]).includes(accion)) return `accion «${accion.slice(0, 24)}»: una de ${ACCIONES.join(", ")}`;
  switch (accion as Accion) {
    case "muestra": case "oculta": {
      const objeto = cortar(String(o.objeto ?? ""), 60);
      return objeto ? { accion, objeto } : `${accion}: falta «objeto» (el id o el nombre del objeto)`;
    }
    case "teletransporta":
      if (!Number.isFinite(Number(o.x)) || !Number.isFinite(Number(o.z))) return "teletransporta: x y z en metros";
      return { accion, x: entre(o.x, -2000, 2000, 0), y: entre(o.y, -100, 500, 0), z: entre(o.z, -2000, 2000, 0) };
    case "da_paso":
      if (!MISION_RE.test(String(o.mision))) return "da_paso: «mision» debe ser el id de una misión (minúsculas, cifras, guiones)";
      return { accion, mision: String(o.mision), paso: Math.round(entre(o.paso, 0, 999, 0)) };
    case "abre_enlace": {
      const enlace = String(o.enlace ?? "");
      if (!/^https:\/\/[^\s]{1,190}$/.test(enlace)) return "abre_enlace: «enlace» debe empezar por https:// (hasta 200 caracteres)";
      return { accion, enlace };
    }
    case "suena": {
      const sonido = String(o.sonido ?? "");
      if (!/^[a-z0-9_-]{1,32}$/.test(sonido)) return "suena: «sonido» es un nombre corto (minúsculas, cifras, guiones)";
      return { accion, sonido };
    }
    case "vuelve_a_seguro":
      return { accion };
  }
}

/** A trigger's line as read from the world's file, checked (or why it is left out). A bad receiver drops the whole
 * trigger: half a cable is worse than none, and the log says which line. */
export function leerDisparador(d: unknown): Disparador | string {
  const o = (d ?? {}) as Record<string, unknown>;
  if (!ID_RE.test(String(o.id))) return `id «${String(o.id).slice(0, 16)}»: minúsculas, cifras y guiones, hasta 16`;
  const tipo = String(o.tipo ?? "");
  if (tipo !== "zona" && tipo !== "boton") return `«${o.id}»: tipo debe ser «zona» o «boton»`;
  if (!Number.isFinite(Number(o.x)) || !Number.isFinite(Number(o.z))) return `«${o.id}»: x y z en metros`;
  if (!Array.isArray(o.receptores) || o.receptores.length === 0) return `«${o.id}»: necesita una lista «receptores» con al menos uno`;
  if (o.receptores.length > RECEPTORES_MAX) return `«${o.id}»: más de ${RECEPTORES_MAX} receptores`;
  const receptores: Receptor[] = [];
  for (const [i, r] of o.receptores.entries()) {
    const leido = leerReceptor(r);
    if (typeof leido === "string") return `«${o.id}»: receptor ${i + 1}: ${leido}`;
    receptores.push(leido);
  }
  const nombre = cortar(String(o.nombre || (tipo === "zona" ? "Zona" : "Botón")), 60) || "Disparador";
  return {
    id: String(o.id), nombre, tipo, x: Number(o.x), z: Number(o.z), y: entre(o.y, -100, 500, 0),
    radio: tipo === "zona" ? entre(o.radio, 0.5, 64, 3) : 0.5,
    alcance: tipo === "boton" ? entre(o.radio, 1, 16, 2) : 0,
    frase: tipo === "boton" ? cortar(String(o.frase || `pulsar ${nombre}`), 60) || `pulsar ${nombre}` : "",
    cooldown: Math.round(entre(o.cooldown, 0, COOLDOWN_MAX_S, 0)),
    unSoloUso: o.un_solo_uso === true,
    receptores,
  };
}

/** The whole file (numinia-engine/disparadores@1: `{ "disparadores": [...] }`): what stays and why each line left. */
export function leerDisparadores(crudo: unknown): { disparadores: Disparador[]; problemas: string[] } {
  const problemas: string[] = [], out: Disparador[] = [];
  const lista = (crudo as { disparadores?: unknown } | null | undefined)?.disparadores;
  if (!Array.isArray(lista)) return { disparadores: [], problemas: [`disparadores.json no tiene una lista "disparadores" (no pongo ninguno): ${JSON.stringify(crudo).slice(0, 160)}`] };
  const vistos = new Set<string>();
  for (const l of lista) {
    const d = leerDisparador(l);
    if (typeof d === "string") { problemas.push(`${d}: no se pone`); continue; }
    if (vistos.has(d.id)) { problemas.push(`«${d.id}»: id repetido: no se pone`); continue; }
    if (out.length >= DISPARADORES_MAX) { problemas.push(`«${d.id}»: más de ${DISPARADORES_MAX} disparadores: no se pone`); continue; }
    vistos.add(d.id); out.push(d);
  }
  return { disparadores: out, problemas };
}

export const crearDisparadores = (opts: { disparadores?: Disparador[] } = {}) => serverPart(disparadores, (api: ServerApi) => {
  const lista = new Map<string, Disparador>();
  const listos = new Map<string, number>();        // trigger → tick at which its cooldown ends
  const dentro = new Map<string, Set<number>>();   // zone → who is inside now
  const agotados = new Set<string>();
  for (const d of opts.disparadores ?? []) {
    const v: Msg = { nombre: d.nombre, tipo: d.tipo, x: d.x, y: d.y, z: d.z, radio: d.radio, alcance: d.alcance, frase: d.frase, cooldown: d.cooldown, unSoloUso: d.unSoloUso, usos: 0, enEspera: false, agotado: false };
    if (api.state.set(d.id, v, { at: { x: d.x, z: d.z } })) { lista.set(d.id, d); if (d.tipo === "zona") dentro.set(d.id, new Set()); }
    else api.log(`disparadores: «${d.id}» no cabe en el esquema y no se pone`);
  }
  if (lista.size) api.log(`disparadores: ${lista.size} disparador(es)`);
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const poner = (d: Disparador, cambio: Msg) => { const v = api.state.get(d.id); if (v) api.state.set(d.id, { ...v, ...cambio }, { at: { x: d.x, z: d.z } }); };

  /** Fire a trigger for `quien` (null = nobody; pages get 0). Returns false (and tells a presser why) when it may not fire now. */
  const disparar = (d: Disparador, quien: number | null): boolean => {
    const v = api.state.get(d.id);
    if (!v) return false;
    if (agotados.has(d.id)) { if (quien !== null && d.tipo === "boton") rechazar(quien, `${d.nombre} ya se usó.`); return false; }
    const listo = listos.get(d.id);
    if (listo !== undefined && api.tick() < listo) { if (quien !== null && d.tipo === "boton") rechazar(quien, `Todavía no: ${d.nombre} espera ${Math.ceil((listo - api.tick()) / TICK_HZ)} s.`); return false; }
    const n = Number(v.usos) + 1;
    const agotado = d.unSoloUso;
    if (agotado) agotados.add(d.id);
    if (d.cooldown > 0 && !agotado) listos.set(d.id, api.tick() + d.cooldown * TICK_HZ);
    poner(d, { usos: n, enEspera: d.cooldown > 0 && !agotado, agotado, alcance: agotado ? 0 : d.alcance });
    const texto = cortar(quien !== null ? `${nombreDe(quien)} ${d.tipo === "zona" ? "entra en" : "pulsa"} ${d.nombre}` : `${d.nombre} salta`, 120);
    const q = quien ?? 0;
    api.emit("disparado", { quien: q, disparador: d.id, nombre: d.nombre, n, texto }, { near: { x: d.x, z: d.z }, radius: CERCA_M });
    api.emit("senal", { quien: q, disparador: d.id, nombre: d.nombre, tipo: d.tipo }, "server");
    for (const r of d.receptores) {
      const base: Msg = { quien: q, disparador: d.id, accion: r.accion, objeto: "", x: 0, y: 0, z: 0, mision: "", paso: 0, enlace: "", sonido: "" };
      const oidos = api.emit("accion", { ...base, ...r }, "server");
      if (!oidos) api.log(`[disparadores] «${d.id}»: nadie hace «${r.accion}» en este servidor`);
    }
    api.log(`[disparadores] ${texto} (${n})`);
    return true;
  };

  api.on("pulsar", (e, m) => {
    const id = String(m.disparador ?? ""), d = lista.get(id);
    if (!d || d.tipo !== "boton") return rechazar(e, `No hay ningún botón «${cortar(id, 16)}».`);
    if (!api.within(e, id)) return rechazar(e, `Acércate a ${d.nombre} para pulsarlo.`);
    disparar(d, e);
  });

  api.onLeave((e) => { for (const s of dentro.values()) s.delete(e); });

  api.onTick((t) => {
    // cooldowns that end: say so in the state (the page can show «listo» again)
    for (const [id, cuando] of listos) if (t >= cuando) { listos.delete(id); const d = lista.get(id); if (d) poner(d, { enEspera: false }); }
    if (!dentro.size) return;
    const gente = api.players();
    for (const [id, s] of dentro) {
      const d = lista.get(id)!;
      const r2 = d.radio * d.radio;
      for (const e of gente) {
        const p = api.position(e);
        const esta = !!p && (p.x - d.x) ** 2 + (p.z - d.z) ** 2 <= r2 && Math.abs(p.y - d.y) <= 3;
        if (esta && !s.has(e)) { s.add(e); disparar(d, e); }
        else if (!esta && s.has(e)) s.delete(e);
      }
    }
  });

  // D-041 historias 3-4: the cable's own receivers (no other feature owns moving someone or sounding a note);
  // `da_paso` goes to features/misiones instead, with its own api.listen there. A receiver here is server-only
  // (quien = 0 would mean nobody in particular; today every firing names a real entity).
  api.listen("disparadores", "accion", (m) => {
    const quien = Number(m.quien);
    switch (String(m.accion)) {
      case "teletransporta": {
        const donde = api.teletransportar(quien, { x: Number(m.x), y: Number(m.y), z: Number(m.z) }, { radios: [0, 1, 2], caida: 1 });
        if (donde) api.emit("teletransportado", { quien, x: donde.x, y: donde.y, z: donde.z }, { to: quien });
        else api.log(`[disparadores] teletransporta: sin sitio libre cerca de (${m.x}, ${m.y}, ${m.z})`);
        return true;
      }
      case "vuelve_a_seguro":
        api.volverASeguro(quien);
        return true;
      case "suena": {
        const d = lista.get(String(m.disparador));
        api.emit("sonido", { sonido: String(m.sonido).slice(0, 32) }, { near: { x: d?.x ?? 0, z: d?.z ?? 0 }, radius: CERCA_M });
        return true;
      }
      case "abre_enlace":
        api.emit("enlace", { quien, enlace: String(m.enlace) }, { to: quien });
        return true;
      default:
        return false;
    }
  });
});

export default crearDisparadores();
