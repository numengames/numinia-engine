// asiento — server part (v1). The server owns who sits where: `sentar` after `api.within` (a free seat, you sit in none, you are
// not reading the norms), `levantar` (yourself; or another person if you direct, may remove people or rule the world), leaving
// the world frees the seat at once, and the simulation's own stand-up (a stick, a jump, a push, being put somewhere) is seen
// with `api.sentado` and frees it too. Sitting = a recorded order of the simulation (`api.ordenar({ sentar })`, H2): the avatar
// is put on the seat, still, and a world with no seats never gives that order, so its fingerprint stays. Nothing is decided
// by a page; every change is written to the world's log.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { NO_PUEDE, guardarEnMundo, puedeInterruptor, vigilarPermiso } from "../interruptor.ts";
import type { EntornoMundo } from "../interruptor.ts";
import { asiento, ATRAS_M, COGER_M, ESPERA_TICKS, LIBRE, SITIOS_MAX } from "./feature.ts";

export type Sitio = { id: string; x: number; z: number; y: number; mira: number; etiqueta: string; dibujo: boolean };
export type Opciones = { sitios?: Sitio[]; activa?: boolean };
export const FICHERO = "asientos.json", ESQUEMA = "numinia-engine/asientos@1";
const RAD = Math.PI / 180;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const plano = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const num = (v: unknown): number | null => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;

/** `entorno/asientos.json` (numinia-engine/asientos@1): { activa?, sitios: [{ id?, x, y?, z, mira?, etiqueta?, dibujo? }] }. Each wrong site is left out with its reason. */
export function leerAsientos(crudo: unknown): { valor: Opciones; problemas: string[] } | null {
  if (crudo === undefined || crudo === null) return null;
  const o = (typeof crudo === "object" ? crudo : {}) as Record<string, unknown>, problemas: string[] = [];
  if (typeof crudo !== "object" || Array.isArray(crudo)) problemas.push("asientos.json debe ser un objeto { activa, sitios }");
  if (o.sitios !== undefined && !Array.isArray(o.sitios)) problemas.push("sitios: debe ser una lista de { id, x, y, z, mira, etiqueta }");
  const sitios: Sitio[] = [], vistos = new Set<string>();
  let sobran = 0;
  (Array.isArray(o.sitios) ? o.sitios : []).forEach((s, i) => {
    const t = (s ?? {}) as Record<string, unknown>, x = num(t.x), z = num(t.z);
    if (x === null || z === null) { problemas.push(`sitios[${i}]: x y z en metros`); return; }
    if (sitios.length >= SITIOS_MAX) { if (!sobran++) problemas.push(`sitios: como mucho ${SITIOS_MAX} (los demás no se usan)`); return; }
    const id = t.id === undefined ? `s${i + 1}` : String(t.id);
    if (!/^[A-Za-z0-9_-]{1,16}$/.test(id)) { problemas.push(`sitios[${i}]: id «${cortar(id, 20)}» no vale (1–16 letras, cifras, - o _)`); return; }
    if (vistos.has(id)) { problemas.push(`sitios[${i}]: el id «${id}» está repetido`); return; }
    vistos.add(id);
    const y = num(t.y), mira = num(t.mira);
    sitios.push({ id, x, z, y: y === null ? 0 : Math.max(-100, Math.min(500, y)), mira: mira === null ? 0 : ((mira % 360) + 540) % 360 - 180, etiqueta: cortar(typeof t.etiqueta === "string" && t.etiqueta.trim() ? t.etiqueta : `Asiento ${sitios.length + 1}`, 60), dibujo: t.dibujo === true });
  });
  return { valor: { activa: o.activa !== false, sitios }, problemas };
}

export const crearAsiento = (opts: Opciones | null = null, io?: EntornoMundo) => serverPart(asiento, (api: ServerApi) => {
  // a world without asientos.json has none (off, cost 0); with it, the seats are on unless it says `activa: false`. Without a folder to
  // write, what the switch changed lives in the server's store, so it survives a restart
  const guardado = io?.escribir ? undefined : api.store.get("estado") as Partial<Opciones> | undefined;
  let encendido = guardado?.activa ?? (opts !== null && opts.activa !== false);
  let sitios: Sitio[] = guardado?.sitios ?? opts?.sitios ?? [];
  const guardar = (cambios: Record<string, unknown>): string => {
    const r = guardarEnMundo(io, FICHERO, ESQUEMA, cambios, api.log);
    if (r === "sin carpeta") { api.store.set("estado", { activa: encendido, sitios, ...cambios }); return ""; }
    return r;
  };
  const ocupa = new Map<number, { k: string; desde: number }>(); // person (entity) -> seat key
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const sitioDe = (k: string) => sitios.find((s) => s.id === k);
  const ocupanteDe = (k: string) => Number(api.state.get(k)?.ocupante ?? LIBRE);
  const base = (s: Sitio, e: number = LIBRE): Msg => ({ nombre: s.etiqueta, x: s.x, y: s.y, z: s.z, mira: s.mira, radio: e === LIBRE ? COGER_M : 0, ocupante: e, quien: e === LIBRE ? "" : nombreDe(e), dibujo: s.dibujo });
  const poner = (s: Sitio, e: number = LIBRE) => { api.state.set(s.id, base(s, e), { at: { x: s.x, z: s.z } }); };
  const montar = () => { for (const s of sitios) if (!api.state.get(s.id)) poner(s); };
  const desmontar = () => { for (const k of api.state.keys()) api.state.delete(k); };

  /** The seat is free again. `levantar`: also put the avatar standing 0.8 m behind it (the simulation applies `poner` and the person is on their feet). */
  const liberar = (e: number, levantar: boolean, motivo: string) => {
    const o = ocupa.get(e);
    if (!o) return;
    ocupa.delete(e);
    const s = sitioDe(o.k);
    if (s && api.state.get(o.k)) poner(s);
    if (levantar && s && api.sentado(e)) {
      const d = ATRAS_M, a = s.mira * RAD;
      api.ordenar(e, { poner: { x: s.x - Math.sin(a) * d, y: s.y, z: s.z - Math.cos(a) * d } });
    }
    api.log(`[asiento] ${nombreDe(e)} ${motivo} (${o.k})`);
  };
  const sentar = (e: number, k: string) => {
    if (!encendido) return;
    const s = sitioDe(k), v = api.state.get(k);
    if (!s || !v) return rechazar(e, `No hay ningún asiento «${cortar(k, 16)}».`);
    if (ocupa.has(e)) return rechazar(e, "Ya estás sentado: «E» o /levantar para levantarte.");
    const o = Number(v.ocupante);
    if (o !== LIBRE) return rechazar(e, `${s.etiqueta} lo ocupa ${nombreDe(o)}.`);
    if (!api.within(e, k)) return rechazar(e, `Acércate a ${s.etiqueta} para sentarte.`);
    if (api.leyendoNormas(e)) return rechazar(e, "Primero acepta las normas del mundo.");
    if (!api.ordenar(e, { sentar: { x: s.x, y: s.y, z: s.z, rumbo: s.mira * RAD } })) return rechazar(e, "Ahora no puedes sentarte.");
    ocupa.set(e, { k, desde: api.tick() });
    poner(s, e);
    api.log(`[asiento] ${nombreDe(e)} se sienta (${k})`);
  };
  /** Stand someone up: yourself, or (name) another person if you direct, may remove people or rule the world. */
  const levantar = (e: number, nombre: string) => {
    if (!encendido) return;
    const k = plano(nombre);
    if (!k) { if (!ocupa.has(e)) return rechazar(e, "No estás sentado."); return liberar(e, true, "se levanta"); }
    if (!(api.puede(e, "dirigir") || api.puede(e, "echar") || api.puede(e, "mandar"))) return rechazar(e, "Levantar a otra persona es cosa de quien dirige, de quien puede echar o de quien manda en el mundo.");
    const sentados = [...ocupa.keys()].map((o) => ({ o, n: nombreDe(o) }));
    let pool = sentados.filter((c) => plano(c.n) === k);
    if (!pool.length) pool = sentados.filter((c) => plano(c.n).startsWith(k));
    if (!pool.length) pool = sentados.filter((c) => plano(c.n).includes(k));
    if (!pool.length) return rechazar(e, `No hay nadie sentado llamado «${cortar(nombre, 24)}».`);
    if (pool.length > 1) return rechazar(e, `Hay varias personas sentadas que encajan con «${cortar(nombre, 24)}»: escribe el nombre entero.`);
    liberar(pool[0].o, true, `lo levanta ${nombreDe(e)}`);
  };

  /** The switch (Entorno panel): who directs or rules turns the seats on or off for the whole world. */
  const encender = (e: number, activa: boolean) => {
    if (!puedeInterruptor(api, e)) return rechazar(e, NO_PUEDE);
    if (activa === encendido) return rechazar(e, activa ? "Los asientos ya están encendidos." : "Los asientos ya están apagados.");
    if (activa) {
      let nuevos = sitios;
      if (!nuevos.length) { // first time, no places defined: beside who turns it on (1.5 m to their east, looking at them), kept in asientos.json
        const p = api.position(e);
        if (!p) return;
        nuevos = [{ id: "s1", x: Math.round((p.x + 1.5) * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100, mira: -90, etiqueta: "Asiento 1", dibujo: true }];
      }
      const fallo = guardar({ activa: true, sitios: nuevos });
      if (fallo) return rechazar(e, fallo);
      sitios = nuevos; encendido = true; montar();
      api.log(`[asiento] ${nombreDe(e)} enciende los asientos: ${sitios.length} sitio(s)`);
    } else {
      const fallo = guardar({ activa: false });
      if (fallo) return rechazar(e, fallo);
      for (const p of [...ocupa.keys()]) liberar(p, true, "se levanta (se apagan los asientos)");
      encendido = false;
      desmontar();
      api.log(`[asiento] ${nombreDe(e)} apaga los asientos (los sitios se guardan)`);
    }
  };
  api.on("encender", (e, m) => encender(e, m.activa === true));
  vigilarPermiso(api);
  api.on("sentar", (e, m) => sentar(e, String(m.cosa ?? "")));
  api.on("levantar", (e, m) => levantar(e, String(m.a ?? "")));

  if (encendido) { montar(); api.log(`asiento: ${sitios.length} asiento(s)`); }

  // leaving frees the seat; every tick: whoever the simulation stood up (stick, jump, push, put somewhere) frees theirs
  api.onLeave((e) => { liberar(e, false, "se desconecta"); });
  api.onTick((t) => {
    if (!encendido || !ocupa.size) return;
    for (const [e, o] of ocupa) if (t >= o.desde + ESPERA_TICKS && !api.sentado(e)) liberar(e, false, "se levanta");
  });
  // the chat (any device with a keyboard, VR included): /levantar · /levantar <nombre>
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim(), e = Number(m.quien);
    const partes = texto.split(/\s+/), palabra = plano(partes[0] ?? "");
    if (palabra !== "levantar" && palabra !== "levantarse") return false;
    if (!encendido) { rechazar(e, "Los asientos están apagados en este mundo (quien dirige los enciende en Entorno)."); return true; }
    levantar(e, partes.slice(1).join(" "));
    return true;
  });
});

export default crearAsiento();
