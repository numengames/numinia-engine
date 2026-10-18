// cogibles — server part (v1, J4). The server owns who carries what: `coger` after `api.within` (nobody carrying it,
// you carrying nothing), `soltar` leaves it where you stand (the thing's `at` moves with it, so the area of interest
// follows), leaving the world drops it. While carried, its `radio` is 0 so no page offers «E: coger» on an empty floor.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { cogibles, CERCA_M, EN_MANOS_MAX, NADIE } from "./feature.ts";

export type Cosa = { id: string; nombre: string; x: number; z: number; y?: number; modelo?: string; escala?: number; radio?: number };
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,15}$/;
const SHA = /^[0-9a-f]{64}$/;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const entre = (v: unknown, min: number, max: number, def: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

export function leerCosa(c: unknown): Cosa | string {
  const o = (c ?? {}) as Record<string, unknown>;
  if (!ID_RE.test(String(o.id))) return `id «${String(o.id).slice(0, 16)}»: minúsculas, cifras y guiones, hasta 16`;
  if (!Number.isFinite(Number(o.x)) || !Number.isFinite(Number(o.z))) return `«${o.id}»: x y z en metros`;
  if (o.modelo !== undefined && o.modelo !== "" && !SHA.test(String(o.modelo))) return `«${o.id}»: modelo debe ser el sha256 de un .glb`;
  return { id: String(o.id), nombre: cortar(String(o.nombre || "Cosa"), 60) || "Cosa", x: Number(o.x), z: Number(o.z), y: entre(o.y, -100, 500, 0), modelo: o.modelo ? String(o.modelo) : "", escala: entre(o.escala, 0.05, 4, 0.4), radio: entre(o.radio, 1, 16, 2) };
}

export const crearCogibles = (opts: { cosas?: Cosa[] } = {}) => serverPart(cogibles, (api: ServerApi) => {
  const lista = new Map<string, Cosa>();
  for (const crudo of opts.cosas ?? []) {
    const c = leerCosa(crudo);
    if (typeof c === "string") { api.log(`cogibles: ${c}: no se pone`); continue; }
    if (c.modelo && !api.activo(c.modelo, "glb")) { api.log(`cogibles: «${c.id}»: este servidor no tiene el modelo ${c.modelo.slice(0, 12)}…: se dibuja la caja de la casa`); c.modelo = ""; }
    const v: Msg = { nombre: c.nombre, x: c.x, y: c.y, z: c.z, modelo: c.modelo ?? "", escala: c.escala, radio: c.radio, portador: NADIE };
    if (api.state.set(c.id, v, { at: { x: c.x, z: c.z } })) lista.set(c.id, c); else api.log(`cogibles: la cosa «${c.id}» no cabe en el esquema y no se pone`);
  }
  if (lista.size) api.log(`cogibles: ${lista.size} cosa(s) que se cogen`);
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const llevaDe = (e: number): string[] => [...lista.keys()].filter((k) => Number(api.state.get(k)?.portador) === e);

  api.on("coger", (e, m) => {
    const id = String(m.cosa ?? ""), c = lista.get(id), v = api.state.get(id);
    if (!c || !v) return rechazar(e, `No hay ninguna cosa «${cortar(id, 16)}».`);
    const portador = Number(v.portador);
    if (portador === e) return rechazar(e, `Ya llevas ${c.nombre}.`);
    if (portador !== NADIE) return rechazar(e, `${c.nombre} la lleva ${nombreDe(portador)}.`);
    if (llevaDe(e).length >= EN_MANOS_MAX) return rechazar(e, `Ya llevas algo: suéltalo antes (Q).`);
    if (!api.within(e, id)) return rechazar(e, `Acércate a ${c.nombre} para cogerla.`);
    const p = api.position(e) ?? { x: c.x, z: c.z };
    api.state.set(id, { ...v, portador: e, radio: 0, x: p.x, z: p.z }, { at: { x: p.x, z: p.z } });
    const texto = cortar(`${nombreDe(e)} coge ${c.nombre}`, 120);
    api.emit("cambio", { quien: e, cosa: id, nombre: c.nombre, que: "cogida", texto }, { near: { x: p.x, z: p.z }, radius: CERCA_M });
    api.log(`[cogibles] ${texto}`);
  });

  const soltar = (e: number, id: string, avisa: boolean): boolean => {
    const c = lista.get(id), v = api.state.get(id);
    if (!c || !v || Number(v.portador) !== e) return false;
    const p = api.position(e) ?? { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
    api.state.set(id, { ...v, portador: NADIE, radio: c.radio, x: p.x, y: Math.max(0, p.y ?? 0), z: p.z }, { at: { x: p.x, z: p.z } });
    const texto = cortar(`${nombreDe(e)} suelta ${c.nombre}`, 120);
    api.emit("cambio", { quien: e, cosa: id, nombre: c.nombre, que: "soltada", texto }, { near: { x: p.x, z: p.z }, radius: CERCA_M });
    if (avisa) api.log(`[cogibles] ${texto}`);
    return true;
  };

  api.on("soltar", (e, m) => {
    const pedida = String(m.cosa ?? ""), mias = llevaDe(e);
    const id = pedida || mias[0] || "";
    if (!id || !mias.includes(id)) return rechazar(e, pedida ? `No llevas «${cortar(pedida, 16)}».` : "No llevas nada.");
    soltar(e, id, true);
  });
  api.onLeave((e) => { for (const id of llevaDe(e)) soltar(e, id, false); });
  // the chat (any device with a keyboard, VR included): /soltar
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim().toLowerCase();
    if (texto !== "soltar" && !texto.startsWith("soltar ")) return false;
    const e = Number(m.quien), mias = llevaDe(e);
    if (!mias.length) rechazar(e, "No llevas nada."); else soltar(e, mias[0], true);
    return true;
  });
});

export default crearCogibles();
