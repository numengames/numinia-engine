// teletransporte — server part (N16). The server decides who may go, where and when; the page only asks and shows
// the light. A trip has two halves: the light takes you where you stand (`sale`), DESMATERIALIZAR_TICKS later the
// instance puts you on the first free spot next to them (api.teletransportar: inside the world, on their floor, no
// solid) and the light leaves you there (`llega`). If they left or there is no room, you come back where you were.
// Orders typed in the chat do the same as the panel: /ir [nombre], /teletransporte sí|no, /encontrable sí|no.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import {
  teletransporte, ESPERA_S, DESMATERIALIZAR_TICKS, FOTO_VENTANA_S, JUNTO_M, FOTO_M, FOTO_CAIDA_M, GENTE_MAX, VARIANTES, VER_M, NOMBRE_MAX, MUNDO,
} from "./feature.ts";

const TICKS_POR_SEGUNDO = 20; // the sim's TICK_HZ (features import only core, schema, feature)
const NO_PUEDES = "Encender o apagar el ir junto a otros es de los dueños, la administración y quien dirige.";
const APAGADO = "En este mundo ahora no se puede ir junto a otros: lo han apagado.";

/** Cut a text to `max` UTF-8 bytes without breaking a character; control characters out, spaces collapsed. */
export function limpiar(t: string, max: number): string {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
}
/** Names compared the way people type them: no accents, no case, spaces collapsed. */
export const normal = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** sí / no as people write them (sí, si, s, yes, on, 1 · no, n, off, 0); null = neither. */
export function siNo(t: string): boolean | null {
  const w = normal(t);
  if (["si", "s", "yes", "on", "1", "encender", "activar"].includes(w)) return true;
  if (["no", "n", "off", "0", "apagar", "desactivar"].includes(w)) return false;
  return null;
}
/** Heading 0-7 (45° steps from +z, 2 = +x) from (x0, z0) toward (x1, z1): you land on the side you came from. */
export function rumboHacia(x0: number, z0: number, x1: number, z1: number): number {
  const dx = x1 - x0, dz = z1 - z0;
  if (dx === 0 && dz === 0) return 0;
  return ((Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) % 8) + 8) % 8;
}

type Destino = { tipo: "persona"; quien: number } | { tipo: "punto"; x: number; y: number; z: number; nombre?: string };
type Viaje = { destino: Destino; cuando: number; variante: number; porChat: boolean; foto: boolean; };

/** `foto`: the world lets people appear at a photo's place (entorno.json `aparicionFoto`; features/mundo.ts reads it). */
export const crearTeletransporte = (o: { foto?: boolean } = {}) => serverPart(teletransporte, (api: ServerApi) => {
  const foto = o.foto === true;
  let activo = api.store.get("activo") !== false; // on unless an owner or a director switched it off (stored: it travels in the zip)
  const publicar = () => { api.state.set(MUNDO, { activo, foto }); };
  publicar();
  if (foto) api.log("este mundo deja aparecer donde se hizo una foto (entorno.json aparicionFoto)");

  const viajes = new Map<number, Viaje>();     // entity -> its trip under way
  const ultimo = new Map<number, number>();    // entity -> tick of its last arrival
  const llegada = new Map<number, number>();   // entity -> tick it joined (a photo's place only in the first seconds)
  const fotoUsada = new Set<number>();
  let siguiente = 0;

  const nombreDe = (e: number) => limpiar(api.who(e)?.nombre ?? `Persona ${e}`, NOMBRE_MAX) || `Persona ${e}`;
  const oculto = (e: number) => { const w = api.who(e); return !!w && api.store.get(`oculto:${w.id}`) === true; };
  const puedeCambiar = (e: number) => api.puede(e, "ajustar") || api.puede(e, "dirigir");
  const responder = (e: number, ok: boolean, texto: string, porChat: boolean) => {
    if (porChat) api.emit("aviso", { quien: e, texto: limpiar(texto, 300) }, "server");
    else api.emit("viaje", { ok, texto: limpiar(texto, 240) }, { to: e });
  };
  const decirPermiso = (e: number) => api.emit("permiso", { puede: puedeCambiar(e), encontrable: !oculto(e) }, { to: e });
  // a variant every watcher shares: decided here, never by each page (a cheap hash of the tick and a counter)
  const variante = () => (Math.imul((api.tick() + ++siguiente) >>> 0, 2654435761) >>> 0) % VARIANTES;

  api.onJoin((e) => { llegada.set(e, api.tick()); decirPermiso(e); });
  api.onIdentify((e) => decirPermiso(e));
  api.listen("roles", "cambio", (m) => { decirPermiso(Number(m.quien)); return true; });
  api.onLeave((e) => {
    viajes.delete(e); ultimo.delete(e); llegada.delete(e); fotoUsada.delete(e); // whoever was going to them comes back in onTick
  });

  /** Who is here now and may be found (people with an identity: AIs included, headless robots not), by name. */
  const gente = (para: number) => api.players().filter((e) => e !== para && api.who(e) && !oculto(e)).map((e) => ({ e, nombre: nombreDe(e) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.e - b.e);

  /** Start the light where `from` stands; the move happens in onTick. */
  const empezar = (from: number, destino: Destino, porChat: boolean, esFoto: boolean) => {
    const p = api.position(from);
    if (!p) return;
    const v = variante();
    viajes.set(from, { destino, cuando: api.tick() + DESMATERIALIZAR_TICKS, variante: v, porChat, foto: esFoto });
    api.emit("sale", { quien: from, nombre: nombreDe(from), x: p.x, y: p.y, z: p.z, variante: v }, { near: from, radius: VER_M });
  };

  const ir = (from: number, quien: number, porChat: boolean) => {
    if (!activo) return responder(from, false, APAGADO, porChat);
    if (quien === from) return responder(from, false, "Ya estás contigo.", porChat);
    if (viajes.has(from)) return responder(from, false, "Ya vas de camino.", porChat);
    const espera = (ultimo.get(from) ?? -Infinity) + ESPERA_S * TICKS_POR_SEGUNDO - api.tick();
    if (espera > 0) return responder(from, false, `Espera ${Math.ceil(espera / TICKS_POR_SEGUNDO)} s para volver a viajar.`, porChat);
    if (!api.players().includes(quien) || !api.who(quien)) return responder(from, false, "Esa persona ya no está conectada en este mundo.", porChat);
    if (oculto(quien)) return responder(from, false, `${nombreDe(quien)} no se deja encontrar ahora.`, porChat);
    empezar(from, { tipo: "persona", quien }, porChat, false);
    if (porChat) responder(from, true, `Vas con ${nombreDe(quien)}…`, true);
  };

  // U27 (MVL1): go to a marked site of the map (own x, z picked there; own height — the server snaps to the floor nearby).
  const punto = (from: number, x: number, z: number, nombre: string) => {
    if (!activo) return responder(from, false, APAGADO, false);
    if (viajes.has(from)) return responder(from, false, "Ya vas de camino.", false);
    const espera = (ultimo.get(from) ?? -Infinity) + ESPERA_S * TICKS_POR_SEGUNDO - api.tick();
    if (espera > 0) return responder(from, false, `Espera ${Math.ceil(espera / TICKS_POR_SEGUNDO)} s para volver a viajar.`, false);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return responder(from, false, "Ese sitio no es válido.", false);
    const p = api.position(from);
    if (!p) return;
    empezar(from, { tipo: "punto", x, y: p.y, z, nombre: limpiar(nombre, NOMBRE_MAX) || undefined }, false, false);
  };

  api.on("ir", (from, m) => ir(from, Number(m.quien), false));
  api.on("punto", (from, m) => punto(from, Number(m.x), Number(m.z), String(m.nombre ?? "")));
  api.on("gente", (from) => {
    const lista = gente(from), total = Math.min(lista.length, GENTE_MAX);
    if (!total) { api.emit("persona", { quien: 0, nombre: "", n: 0, total: 0, todos: 0 }, { to: from }); return; }
    lista.slice(0, total).forEach((p, n) => api.emit("persona", { quien: p.e, nombre: p.nombre, n, total, todos: lista.length }, { to: from }));
  });
  const encontrable = (from: number, si: boolean, porChat: boolean) => {
    const w = api.who(from);
    if (!w) return responder(from, false, "Aún no sé quién eres: espera un momento.", porChat);
    if (si) api.store.delete(`oculto:${w.id}`); else api.store.set(`oculto:${w.id}`, true);
    decirPermiso(from);
    responder(from, true, si ? "Te pueden encontrar: quien esté en el mundo puede ir junto a ti." : "Nadie puede ir junto a ti ni te ve en su lista de Gente.", porChat);
  };
  api.on("encontrable", (from, m) => encontrable(from, m.si === true, false));
  const permitir = (from: number, si: boolean, porChat: boolean) => {
    if (!puedeCambiar(from)) return responder(from, false, NO_PUEDES, porChat);
    activo = si;
    api.store.set("activo", si);
    publicar();
    api.log(`${nombreDe(from)} ${si ? "enciende" : "apaga"} el ir junto a otros`);
    responder(from, true, si ? "Ir junto a otros: encendido en este mundo." : "Ir junto a otros: apagado en este mundo (nadie puede viajar hasta que lo enciendas).", porChat);
  };
  api.on("permitir", (from, m) => permitir(from, m.si === true, false));
  api.on("foto", (from, m) => {
    if (!foto) return responder(from, false, "Este mundo no deja aparecer en el sitio de una foto: sigue la luz hasta allí.", false);
    if (fotoUsada.has(from) || api.tick() - (llegada.get(from) ?? -Infinity) > FOTO_VENTANA_S * TICKS_POR_SEGUNDO) return responder(from, false, "El sitio de una foto solo vale al entrar por su enlace.", false);
    if (viajes.has(from)) return;
    fotoUsada.add(from);
    empezar(from, { tipo: "punto", x: Number(m.x), y: Number(m.y), z: Number(m.z) }, false, true);
  });

  api.onTick((t) => {
    for (const [e, v] of viajes) {
      if (t < v.cuando) continue;
      viajes.delete(e);
      const p = api.position(e);
      if (!p) continue;
      let donde: { x: number; y: number; z: number } | null = null, motivo = "";
      if (v.destino.tipo === "persona") {
        const q = api.position(v.destino.quien), a = nombreDe(v.destino.quien);
        if (!activo) motivo = APAGADO;
        else if (!q || !api.players().includes(v.destino.quien)) motivo = "Esa persona se ha ido: vuelves donde estabas.";
        else {
          donde = api.teletransportar(e, q, { radios: JUNTO_M, rumbo: rumboHacia(q.x, q.z, p.x, p.z), caida: 1 });
          motivo = donde ? `Estás junto a ${a}.` : `No hay sitio libre junto a ${a}: vuelves donde estabas.`;
        }
      } else if (v.foto) {
        donde = api.teletransportar(e, v.destino, { radios: FOTO_M, caida: FOTO_CAIDA_M });
        motivo = donde ? "Estás donde se hizo la foto." : "No hay sitio libre donde se hizo la foto: sigue la luz hasta allí.";
      } else {
        const sitio = v.destino.nombre ? ` en ${v.destino.nombre}` : "";
        donde = api.teletransportar(e, v.destino, { radios: [0, 1, 2], caida: 1 });
        motivo = donde ? `Has llegado${sitio}.` : `No hay sitio libre${sitio}: sigue la luz hasta allí.`;
      }
      const fin = donde ?? p; // no trip: the light leaves you where you were
      api.emit("llega", { quien: e, nombre: nombreDe(e), x: fin.x, y: fin.y, z: fin.z, variante: v.variante }, { near: e, radius: VER_M });
      if (donde && !v.foto) ultimo.set(e, t);
      responder(e, !!donde, motivo, v.porChat);
    }
  });

  // the same from the chat (any device with a keyboard, VR included)
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim(), from = Number(m.quien);
    const i = texto.indexOf(" "), palabra = normal(i < 0 ? texto : texto.slice(0, i)), resto = i < 0 ? "" : texto.slice(i + 1).trim();
    if (palabra === "ir") {
      const lista = gente(from);
      if (!resto) {
        const nombres = lista.slice(0, 12).map((p) => p.nombre).join(" · ");
        responder(from, true, lista.length ? `Conectados ahora (${lista.length}): ${nombres}${lista.length > 12 ? " …" : ""}. Ve con /ir <nombre>.` : "No hay nadie más conectado ahora en este mundo.", true);
        return true;
      }
      const buscado = normal(resto);
      const exactos = lista.filter((p) => normal(p.nombre) === buscado), empiezan = lista.filter((p) => normal(p.nombre).startsWith(buscado));
      const elegidos = exactos.length ? exactos : empiezan;
      if (elegidos.length === 1) ir(from, elegidos[0].e, true);
      else if (!elegidos.length) responder(from, false, `No hay nadie conectado que se llame «${limpiar(resto, 40)}». Escribe /ir para ver quién está.`, true);
      else responder(from, false, `Hay ${elegidos.length} con ese nombre: ${elegidos.slice(0, 6).map((p) => p.nombre).join(" · ")}. Escribe el nombre entero o usa el panel Gente.`, true);
      return true;
    }
    if (palabra === "teletransporte") {
      const si = siNo(resto);
      if (si === null) { responder(from, true, `Ir junto a otros está ${activo ? "encendido" : "apagado"} en este mundo${foto ? "; se puede aparecer donde se hizo una foto" : ""}. Cámbialo con /teletransporte sí|no.`, true); return true; }
      permitir(from, si, true);
      return true;
    }
    if (palabra === "encontrable") {
      const si = siNo(resto);
      if (si === null) { responder(from, true, `Ahora ${oculto(from) ? "no te pueden" : "te pueden"} encontrar. Cámbialo con /encontrable sí|no.`, true); return true; }
      encontrable(from, si, true);
      return true;
    }
    return false;
  });
});

export default crearTeletransporte();
