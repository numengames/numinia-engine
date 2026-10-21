// burbujas — server part (v1). The server owns who is inside which bubble: once per tick it works out, from where each person
// stands, the (at most one) bubble they are in — the nearest centre when two overlap — and hands the voice relay a table it reads
// per frame in O(1) (`api.vozBurbujas`). The relay (packages/instance) is the only place that decides who hears whom; this piece
// never touches a frame of voice, so nothing is recorded, decoded or stored here, and a world with no bubbles (no file, or the
// switch off) hands the relay `null`: the voice is exactly what it always was. People inside are published as `p:<entidad>`
// entries (every page draws the icon in «Gente»), and each person is told once, only to them, when they enter or leave.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { NO_PUEDE, guardarEnMundo, puedeInterruptor, vigilarPermiso } from "../interruptor.ts";
import type { EntornoMundo } from "../interruptor.ts";
import { burbujas, BURBUJAS_MAX, FUERA, MODOS, RADIO_DEFECTO, RADIO_MAX, RADIO_MIN } from "./feature.ts";
import type { Modo } from "./feature.ts";

export type Burbuja = { id: string; x: number; y: number; z: number; radio: number; modo: Modo; etiqueta: string };
export type Opciones = { burbujas?: Burbuja[]; activa?: boolean };
export const FICHERO = "burbujas.json", ESQUEMA = "numinia-engine/burbujas@1";
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const num = (v: unknown): number | null => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;
const minuscula = (t: string): string => (t ? t[0].toLowerCase() + t.slice(1) : t);

/** `entorno/burbujas.json` (numinia-engine/burbujas@1): { activa?, burbujas: [{ id?, x, y?, z, radio?, modo?, etiqueta? }] }. Each wrong bubble is left out with its reason. */
export function leerBurbujas(crudo: unknown): { valor: Opciones; problemas: string[] } | null {
  if (crudo === undefined || crudo === null) return null;
  const o = (typeof crudo === "object" ? crudo : {}) as Record<string, unknown>, problemas: string[] = [];
  if (typeof crudo !== "object" || Array.isArray(crudo)) problemas.push("burbujas.json debe ser un objeto { activa, burbujas }");
  if (o.burbujas !== undefined && !Array.isArray(o.burbujas)) problemas.push("burbujas: debe ser una lista de { id, x, y, z, radio, modo, etiqueta }");
  const lista: Burbuja[] = [], vistos = new Set<string>();
  let sobran = 0;
  (Array.isArray(o.burbujas) ? o.burbujas : []).forEach((b, i) => {
    const t = (b ?? {}) as Record<string, unknown>, x = num(t.x), z = num(t.z);
    if (x === null || z === null) { problemas.push(`burbujas[${i}]: x y z en metros`); return; }
    if (lista.length >= BURBUJAS_MAX) { if (!sobran++) problemas.push(`burbujas: como mucho ${BURBUJAS_MAX} (las demás no se usan)`); return; }
    const id = t.id === undefined ? `b${i + 1}` : String(t.id);
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) { problemas.push(`burbujas[${i}]: id «${cortar(id, 20)}» no vale (1–16 letras, cifras, - o _)`); return; }
    if (vistos.has(id)) { problemas.push(`burbujas[${i}]: el id «${id}» está repetido`); return; }
    const r = t.radio === undefined ? RADIO_DEFECTO : num(t.radio);
    if (r === null || r < RADIO_MIN || r > RADIO_MAX) { problemas.push(`burbujas[${i}]: radio entre ${RADIO_MIN} y ${RADIO_MAX} m`); return; }
    if (t.modo !== undefined && !(MODOS as readonly string[]).includes(String(t.modo))) { problemas.push(`burbujas[${i}]: modo «${cortar(String(t.modo), 16)}» no vale (${MODOS.join(" o ")}); se usa aislada`); }
    vistos.add(id);
    const y = num(t.y);
    lista.push({ id, x, z, y: y === null ? 0 : Math.max(-100, Math.min(500, y)), radio: r, modo: t.modo === "abierta" ? "abierta" : "aislada", etiqueta: cortar(typeof t.etiqueta === "string" && t.etiqueta.trim() ? t.etiqueta : `Burbuja ${lista.length + 1}`, 40) });
  });
  return { valor: { activa: o.activa !== false, burbujas: lista }, problemas };
}

/** Which bubble holds this point (an index into `lista`) or FUERA: horizontally within the radius and vertically within one radius; two overlapping → the nearest centre. Pure. */
export function burbujaEn(lista: readonly Burbuja[], x: number, y: number, z: number): number {
  let mejor = FUERA, d2 = Infinity;
  for (let i = 0; i < lista.length; i++) {
    const b = lista[i], dx = x - b.x, dz = z - b.z, dy = y - b.y, h = dx * dx + dz * dz;
    if (h > b.radio * b.radio || Math.abs(dy) > b.radio) continue;
    if (h < d2) { d2 = h; mejor = i; }
  }
  return mejor;
}

export const crearBurbujas = (opts: Opciones | null = null, io?: EntornoMundo) => serverPart(burbujas, (api: ServerApi) => {
  // a world without burbujas.json has none (off, cost 0); with it, the bubbles are on unless it says `activa: false`. Without a folder
  // to write, what the switch changed lives in the server's store, so it survives a restart
  const guardado = io?.escribir ? undefined : api.store.get("estado") as Partial<Opciones> | undefined;
  let encendido = guardado?.activa ?? (opts !== null && opts.activa !== false);
  let lista: Burbuja[] = guardado?.burbujas ?? opts?.burbujas ?? [];
  const guardar = (cambios: Record<string, unknown>): string => {
    const r = guardarEnMundo(io, FICHERO, ESQUEMA, cambios, api.log);
    if (r === "sin carpeta") { api.store.set("estado", { activa: encendido, burbujas: lista, ...cambios }); return ""; }
    return r;
  };
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  /** The table the relay reads: entity → bubble index, FUERA when none. Allocated only while the piece is on. */
  let tabla: Int16Array | null = null;
  const vista = { de: (e: number): number => (tabla && e >= 0 && e < tabla.length ? tabla[e] : FUERA), abierta: (b: number): boolean => lista[b]?.modo === "abierta" };
  const estaba = new Map<number, number>(); // who is told to be inside, and in which bubble (the last thing said)

  const montar = () => {
    for (const b of lista) api.state.set(`b:${b.id}`, { etiqueta: b.etiqueta, x: b.x, y: b.y, z: b.z, radio: b.radio, modo: b.modo, burbuja: "" });
    tabla = new Int16Array(65536).fill(FUERA);
    api.vozBurbujas(vista);
    for (const e of api.players()) calcular(e);
  };
  const desmontar = () => {
    api.vozBurbujas(null); tabla = null;
    for (const k of api.state.keys()) api.state.delete(k);
    for (const e of [...estaba.keys()]) salir(e, false);
    estaba.clear();
  };
  const aviso = (b: Burbuja) => b.modo === "abierta"
    ? `En ${b.etiqueta}: te oyen los de ${minuscula(b.etiqueta)} y quien esté cerca.`
    : `En ${b.etiqueta}: solo te oyen los de ${minuscula(b.etiqueta)}.`;
  const entrar = (e: number, i: number) => {
    const b = lista[i];
    api.state.set(`p:${e}`, { etiqueta: "", x: 0, y: 0, z: 0, radio: 0, modo: b.modo, burbuja: b.id });
    estaba.set(e, i);
    api.emit("dentro", { burbuja: b.id, etiqueta: b.etiqueta, modo: b.modo, aviso: aviso(b) }, { to: e });
  };
  const salir = (e: number, decir: boolean) => {
    const i = estaba.get(e);
    if (i === undefined) return;
    estaba.delete(e);
    api.state.delete(`p:${e}`);
    if (decir) { const b = lista[i]; api.emit("dentro", { burbuja: "", etiqueta: b?.etiqueta ?? "", modo: b?.modo ?? "aislada", aviso: `Has salido de ${b?.etiqueta ?? "la burbuja"}: vuelves a oír a quien tienes cerca.` }, { to: e }); }
  };
  /** One person: work out their bubble from where they stand and say it if it changed. */
  function calcular(e: number): void {
    if (!tabla) return;
    const p = api.position(e), i = p ? burbujaEn(lista, p.x, p.y, p.z) : FUERA;
    tabla[e] = i;
    const antes = estaba.get(e) ?? FUERA;
    if (i === antes) return;
    if (antes !== FUERA) salir(e, i === FUERA);
    if (i !== FUERA) entrar(e, i);
  }

  /** The switch (Entorno panel): who directs or rules turns the bubbles on or off for the whole world. */
  const encender = (e: number, activa: boolean) => {
    if (!puedeInterruptor(api, e)) return rechazar(e, NO_PUEDE);
    if (activa === encendido) return rechazar(e, activa ? "Las burbujas de voz ya están encendidas." : "Las burbujas de voz ya están apagadas.");
    if (activa) {
      let nuevas = lista;
      if (!nuevas.length) { // first time, no places defined: one of 3.5 m where whoever turns it on stands, kept in burbujas.json
        const p = api.position(e);
        if (!p) return;
        nuevas = [{ id: "b1", x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100, radio: RADIO_DEFECTO, modo: "aislada", etiqueta: "Burbuja 1" }];
      }
      const fallo = guardar({ activa: true, burbujas: nuevas });
      if (fallo) return rechazar(e, fallo);
      lista = nuevas; encendido = true; montar();
      api.log(`[burbujas] ${nombreDe(e)} enciende las burbujas de voz: ${lista.length} sitio(s)`);
    } else {
      const fallo = guardar({ activa: false });
      if (fallo) return rechazar(e, fallo);
      encendido = false;
      desmontar();
      api.log(`[burbujas] ${nombreDe(e)} apaga las burbujas de voz (los sitios se guardan)`);
    }
  };
  api.on("encender", (e, m) => encender(e, m.activa === true));
  vigilarPermiso(api);

  if (encendido && lista.length) { montar(); api.log(`burbujas: ${lista.length} burbuja(s) de voz`); }
  else if (encendido) encendido = false; // «activa» with no bubble to hold: nothing to do (the switch makes one)

  api.onJoin((e) => { calcular(e); });
  api.onLeave((e) => { if (tabla) tabla[e] = FUERA; salir(e, false); });
  api.onTick(() => { if (!tabla) return; for (const e of api.players()) calcular(e); });
});

export default crearBurbujas();
