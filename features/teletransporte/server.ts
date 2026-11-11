// teletransporte — server part (N16). The server decides who may go, where and when; the page only asks and shows
// the light. A trip has two halves: the light takes you where you stand (`sale`), DESMATERIALIZAR_TICKS later the
// instance puts you on the first free spot next to them (api.teletransportar: inside the world, on their floor, no
// solid) and the light leaves you there (`llega`). If they left or there is no room, you come back where you were.
// Orders typed in the chat do the same as the panel: /ir [nombre], /teletransporte sí|no, /encontrable sí|no.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import {
  teletransporte, huellaDe, ESPERA_S, DESMATERIALIZAR_TICKS, FOTO_VENTANA_S, JUNTO_M, FOTO_M, FOTO_CAIDA_M, PUNTO_ALTO_M, PUNTO_BAJO_M, GENTE_MAX, VARIANTES, VER_M, NOMBRE_MAX, MUNDO,
} from "./feature.ts";

const TICKS_POR_SEGUNDO = 20; // the sim's TICK_HZ (features import only core, schema, feature)

// i18n (5/5): the words a player READS from the travel server, in English (the fallback) and Spanish. Same convention as
// misiones/formato.ts: a catalogue of our own (features may not import the client's t()); the language is the WORLD's
// (`idioma` of its ficha.json). An omitted language is Spanish (what every call said before); an unknown language, or a
// key missing in one language, reads the English text, never an empty one. `{x}` is filled from `vars`.
export const IDIOMA_TELETRANSPORTE = "es";
export const TEXTOS_TELETRANSPORTE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    no_puedes: "Switching going together on or off belongs to the owners, the administration and whoever directs.",
    apagado: "Going together is not possible in this world right now: it has been switched off.",
    persona_n: "Person {n}", ya_contigo: "You are already with yourself.", ya_camino: "You are already on your way.",
    espera: "Wait {s} s before travelling again.", no_conectada: "That person is no longer connected in this world.",
    no_encontrable: "{nombre} cannot be found right now.", vas_con: "You are going to {nombre}…", sitio_invalido: "That place is not valid.",
    no_se_quien: "I do not know who you are yet: wait a moment.",
    te_encuentran: "People can find you: anyone in the world can go to you.", nadie_va: "Nobody can go to you and you are not in their People list.",
    on: "on", off: "off", encendido: "Going together: switched on in this world.", apagado_mundo: "Going together: switched off in this world (nobody can travel until you switch it on).",
    foto_no: "This world does not let you appear where a photo was taken: follow the light there.",
    foto_solo_entrar: "A photo's place only works when you enter by its link.",
    se_fue: "That person has left: you go back to where you were.", junto_a: "You are next to {nombre}.", sin_sitio_junto: "There is no free spot next to {nombre}: you go back to where you were.",
    foto_estas: "You are where the photo was taken.", foto_sin_sitio: "There is no free spot where the photo was taken: follow the light there.",
    en_sitio: " at {nombre}", llegado: "You have arrived{sitio}.", sin_sitio: "No free spot{sitio}: follow the light there.",
    conectados: "Connected now ({n}): {nombres}. Go with /ir <name>.", nadie_mas: "Nobody else is connected in this world right now.",
    nadie_nombre: "Nobody connected is called «{nombre}». Type /ir to see who is here.",
    varios: "There are {n} with that name: {nombres}. Type the whole name or use the People panel.",
    estado_tele: "Going together is {estado} in this world{foto}. Change it with /teletransporte yes|no.", foto_extra: "; you can appear where a photo was taken",
    estado_encontrable_si: "People can find you right now. Change it with /encontrable yes|no.", estado_encontrable_no: "People cannot find you right now. Change it with /encontrable yes|no.",
  },
  es: {
    no_puedes: "Encender o apagar el ir junto a otros es de los dueños, la administración y quien dirige.",
    apagado: "En este mundo ahora no se puede ir junto a otros: lo han apagado.",
    persona_n: "Persona {n}", ya_contigo: "Ya estás contigo.", ya_camino: "Ya vas de camino.",
    espera: "Espera {s} s para volver a viajar.", no_conectada: "Esa persona ya no está conectada en este mundo.",
    no_encontrable: "{nombre} no se deja encontrar ahora.", vas_con: "Vas con {nombre}…", sitio_invalido: "Ese sitio no es válido.",
    no_se_quien: "Aún no sé quién eres: espera un momento.",
    te_encuentran: "Te pueden encontrar: quien esté en el mundo puede ir junto a ti.", nadie_va: "Nadie puede ir junto a ti ni te ve en su lista de Gente.",
    on: "encendido", off: "apagado", encendido: "Ir junto a otros: encendido en este mundo.", apagado_mundo: "Ir junto a otros: apagado en este mundo (nadie puede viajar hasta que lo enciendas).",
    foto_no: "Este mundo no deja aparecer en el sitio de una foto: sigue la luz hasta allí.",
    foto_solo_entrar: "El sitio de una foto solo vale al entrar por su enlace.",
    se_fue: "Esa persona se ha ido: vuelves donde estabas.", junto_a: "Estás junto a {nombre}.", sin_sitio_junto: "No hay sitio libre junto a {nombre}: vuelves donde estabas.",
    foto_estas: "Estás donde se hizo la foto.", foto_sin_sitio: "No hay sitio libre donde se hizo la foto: sigue la luz hasta allí.",
    en_sitio: " en {nombre}", llegado: "Has llegado{sitio}.", sin_sitio: "No hay sitio libre{sitio}: sigue la luz hasta allí.",
    conectados: "Conectados ahora ({n}): {nombres}. Ve con /ir <nombre>.", nadie_mas: "No hay nadie más conectado ahora en este mundo.",
    nadie_nombre: "No hay nadie conectado que se llame «{nombre}». Escribe /ir para ver quién está.",
    varios: "Hay {n} con ese nombre: {nombres}. Escribe el nombre entero o usa el panel Gente.",
    estado_tele: "Ir junto a otros está {estado} en este mundo{foto}. Cámbialo con /teletransporte sí|no.", foto_extra: "; se puede aparecer donde se hizo una foto",
    estado_encontrable_si: "Ahora te pueden encontrar. Cámbialo con /encontrable sí|no.", estado_encontrable_no: "Ahora no te pueden encontrar. Cámbialo con /encontrable sí|no.",
  },
};
/** The text for `clave` in `idioma` (fallback: English), with `{x}` filled from `vars`. Pure; never throws, never empty for a known key. */
export function textoTeletransporte(idioma: string, clave: string, vars: Readonly<Record<string, string | number>> = {}): string {
  const t = TEXTOS_TELETRANSPORTE[idioma]?.[clave] ?? TEXTOS_TELETRANSPORTE.en[clave] ?? clave;
  return t.replace(/\{(\w+)\}/g, (_, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : `{${k}}`));
}

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
export const crearTeletransporte = (o: { foto?: boolean; /** the WORLD's language (ficha.json `idioma`); omitted = Spanish */ idioma?: string } = {}) => serverPart(teletransporte, (api: ServerApi) => {
  const idioma = o.idioma ?? IDIOMA_TELETRANSPORTE;
  const tx = (clave: string, vars?: Record<string, string | number>) => textoTeletransporte(idioma, clave, vars);
  const NO_PUEDES = tx("no_puedes"), APAGADO = tx("apagado");
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

  const nombreDe = (e: number) => limpiar(api.who(e)?.nombre ?? tx("persona_n", { n: e }), NOMBRE_MAX) || tx("persona_n", { n: e });
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
    if (quien === from) return responder(from, false, tx("ya_contigo"), porChat);
    if (viajes.has(from)) return responder(from, false, tx("ya_camino"), porChat);
    const espera = (ultimo.get(from) ?? -Infinity) + ESPERA_S * TICKS_POR_SEGUNDO - api.tick();
    if (espera > 0) return responder(from, false, tx("espera", { s: Math.ceil(espera / TICKS_POR_SEGUNDO) }), porChat);
    if (!api.players().includes(quien) || !api.who(quien)) return responder(from, false, tx("no_conectada"), porChat);
    if (oculto(quien)) return responder(from, false, tx("no_encontrable", { nombre: nombreDe(quien) }), porChat);
    empezar(from, { tipo: "persona", quien }, porChat, false);
    if (porChat) responder(from, true, tx("vas_con", { nombre: nombreDe(quien) }), true);
  };

  // U27 (MVL1): go to a marked site of the map (own x, z picked there; own height — the server snaps to the floor nearby).
  const punto = (from: number, x: number, z: number, nombre: string) => {
    if (!activo) return responder(from, false, APAGADO, false);
    if (viajes.has(from)) return responder(from, false, tx("ya_camino"), false);
    const espera = (ultimo.get(from) ?? -Infinity) + ESPERA_S * TICKS_POR_SEGUNDO - api.tick();
    if (espera > 0) return responder(from, false, tx("espera", { s: Math.ceil(espera / TICKS_POR_SEGUNDO) }), false);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return responder(from, false, tx("sitio_invalido"), false);
    const p = api.position(from);
    if (!p) return;
    empezar(from, { tipo: "punto", x, y: p.y, z, nombre: limpiar(nombre, NOMBRE_MAX) || undefined }, false, false);
  };

  api.on("ir", (from, m) => ir(from, Number(m.quien), false));
  api.on("punto", (from, m) => punto(from, Number(m.x), Number(m.z), String(m.nombre ?? "")));
  api.on("gente", (from) => {
    const lista = gente(from), total = Math.min(lista.length, GENTE_MAX);
    if (!total) { api.emit("persona", { quien: 0, nombre: "", n: 0, total: 0, todos: 0, huella: "" }, { to: from }); return; }
    lista.slice(0, total).forEach((p, n) => api.emit("persona", { quien: p.e, nombre: p.nombre, n, total, todos: lista.length, huella: huellaDe(api.who(p.e)?.id ?? "") }, { to: from }));
  });
  const encontrable = (from: number, si: boolean, porChat: boolean) => {
    const w = api.who(from);
    if (!w) return responder(from, false, tx("no_se_quien"), porChat);
    if (si) api.store.delete(`oculto:${w.id}`); else api.store.set(`oculto:${w.id}`, true);
    decirPermiso(from);
    responder(from, true, tx(si ? "te_encuentran" : "nadie_va"), porChat);
  };
  api.on("encontrable", (from, m) => encontrable(from, m.si === true, false));
  const permitir = (from: number, si: boolean, porChat: boolean) => {
    if (!puedeCambiar(from)) return responder(from, false, NO_PUEDES, porChat);
    activo = si;
    api.store.set("activo", si);
    publicar();
    api.log(`${nombreDe(from)} ${si ? "enciende" : "apaga"} el ir junto a otros`);
    responder(from, true, tx(si ? "encendido" : "apagado_mundo"), porChat);
  };
  api.on("permitir", (from, m) => permitir(from, m.si === true, false));
  api.on("foto", (from, m) => {
    if (!foto) return responder(from, false, tx("foto_no"), false);
    if (fotoUsada.has(from) || api.tick() - (llegada.get(from) ?? -Infinity) > FOTO_VENTANA_S * TICKS_POR_SEGUNDO) return responder(from, false, tx("foto_solo_entrar"), false);
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
        else if (!q || !api.players().includes(v.destino.quien)) motivo = tx("se_fue");
        else {
          donde = api.teletransportar(e, q, { radios: JUNTO_M, rumbo: rumboHacia(q.x, q.z, p.x, p.z), caida: 1 });
          motivo = donde ? tx("junto_a", { nombre: a }) : tx("sin_sitio_junto", { nombre: a });
        }
      } else if (v.foto) {
        donde = api.teletransportar(e, v.destino, { radios: FOTO_M, caida: FOTO_CAIDA_M });
        motivo = donde ? tx("foto_estas") : tx("foto_sin_sitio");
      } else {
        const sitio = v.destino.nombre ? tx("en_sitio", { nombre: v.destino.nombre }) : "";
        donde = api.teletransportar(e, v.destino, { radios: [0, 1, 2], caida: 1 });
        // the map knows no height: on a relief the ground at the site may be a hill above or a cleft below the traveller → look from higher up
        if (!donde) { const alto = Math.min(v.destino.y + PUNTO_ALTO_M, 450); donde = api.teletransportar(e, { ...v.destino, y: alto }, { radios: [0, 1, 2], caida: alto - v.destino.y + PUNTO_BAJO_M }); }
        motivo = donde ? tx("llegado", { sitio }) : tx("sin_sitio", { sitio });
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
        responder(from, true, lista.length ? tx("conectados", { n: lista.length, nombres: nombres + (lista.length > 12 ? " …" : "") }) : tx("nadie_mas"), true);
        return true;
      }
      const buscado = normal(resto);
      const exactos = lista.filter((p) => normal(p.nombre) === buscado), empiezan = lista.filter((p) => normal(p.nombre).startsWith(buscado));
      const elegidos = exactos.length ? exactos : empiezan;
      if (elegidos.length === 1) ir(from, elegidos[0].e, true);
      else if (!elegidos.length) responder(from, false, tx("nadie_nombre", { nombre: limpiar(resto, 40) }), true);
      else responder(from, false, tx("varios", { n: elegidos.length, nombres: elegidos.slice(0, 6).map((p) => p.nombre).join(" · ") }), true);
      return true;
    }
    if (palabra === "teletransporte") {
      const si = siNo(resto);
      if (si === null) { responder(from, true, tx("estado_tele", { estado: tx(activo ? "on" : "off"), foto: foto ? tx("foto_extra") : "" }), true); return true; }
      permitir(from, si, true);
      return true;
    }
    if (palabra === "encontrable") {
      const si = siNo(resto);
      if (si === null) { responder(from, true, tx(oculto(from) ? "estado_encontrable_no" : "estado_encontrable_si"), true); return true; }
      encontrable(from, si, true);
      return true;
    }
    return false;
  });
});

export default crearTeletransporte();
