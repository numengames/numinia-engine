// director — server part (N6, corte 1). The server decides who directs (api.puede "dirigir" = the world's roles:
// STD-052 `manage-rituals`), which scenes exist (the adventure's escena@1 files + the house presets), and keeps the
// count of who answers a summons. It never moves anyone: a summons is an invitation, each page answers it.
// Orders typed in the chat do the same as the panel: /escenas, /escena <nombre|número>, /narrar <texto>, /convocar [texto].
import { serverPart } from "../../packages/feature/src/index.ts";
import { director, ACTUAL, CONVOCATORIA_MAX, NARRACION_MAX, NOMBRE_MAX } from "./feature.ts";
import { cargarEscenas, buscarEscena, ESCENAS_CASA } from "./escena.ts";
import type { Escena } from "./escena.ts";

/** Cut a text to `max` UTF-8 bytes without breaking a character; control characters out, spaces collapsed. */
export function limpiar(t: string, max: number): string {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = "";
  for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
}

/** How many summonses a server remembers (the oldest is forgotten): answers to an older one are ignored. */
export const CONVOCATORIAS_MAX = 16;

/** `escenas`: for tests, the scenes as files; none = the adventure's folder `escenas/` (api.aventura). */
export const crearDirector = (o: { escenas?: { fichero: string; texto: string }[] } = {}) => serverPart(director, (api) => {
  const propias = cargarEscenas(o.escenas ?? api.aventura("escenas"), api.log);
  const escenas: Escena[] = [...propias, ...ESCENAS_CASA];
  if (propias.length) api.log(`[director] ${propias.length} escena(s) de la aventura: ${propias.map((e) => e.id).join(", ")}`);

  const nombreDe = (e: number) => limpiar(api.who(e)?.nombre ?? `Persona ${e}`, NOMBRE_MAX) || `Persona ${e}`;
  const puede = (e: number) => api.puede(e, "dirigir");
  const rechazar = (e: number, motivo: string, porChat: boolean) => {
    if (porChat) api.emit("aviso", { quien: e, texto: motivo }, "server");
    else api.emit("rechazado", { motivo: limpiar(motivo, 160) }, { to: e });
  };
  const NO_PUEDES = "Para dirigir hace falta el permiso «Gestionar rituales» de la organización (lo tienen Moderación y Administración).";

  // who may direct: on entering, on showing who you are, and when your roles change; directors get the scene list
  const decirPermiso = (e: number) => {
    const si = puede(e);
    api.emit("permiso", { dirigir: si }, { to: e });
    if (si) escenas.forEach((s, n) => api.emit("escenaDisponible", { id: s.id, nombre: limpiar(s.nombre, NOMBRE_MAX), n, total: escenas.length, casa: s.casa }, { to: e }));
  };
  api.onJoin(decirPermiso);
  api.onIdentify((e) => decirPermiso(e));
  api.listen("roles", "cambio", (m) => { decirPermiso(Number(m.quien)); return true; });

  const poner = (from: number, texto: string, porChat: boolean) => {
    if (!puede(from)) return rechazar(from, NO_PUEDES, porChat);
    const s = buscarEscena(escenas, texto);
    if (!s) return rechazar(from, `No hay ninguna escena «${limpiar(texto, 32)}». Escribe /escenas para verlas.`, porChat);
    api.emit("aplicar", { preset: s.preset, entorno: s.entorno }, "server"); // features/entorno puts the look
    const quien = nombreDe(from);
    api.state.set(ACTUAL, { id: s.id, nombre: limpiar(s.nombre, NOMBRE_MAX), quien, ambiente: s.ambiente, ganancia: s.ganancia });
    api.emit("puesta", { nombre: limpiar(s.nombre, NOMBRE_MAX), quien, ambiente: s.ambiente, ganancia: s.ganancia }, "all");
    if (s.narracion) api.emit("narracion", { texto: limpiar(s.narracion, NARRACION_MAX), quien }, "all");
    api.log(`[director] ${quien} pone la escena «${s.id}»`);
    if (porChat) api.emit("aviso", { quien: from, texto: `Escena puesta: ${s.nombre}.` }, "server");
  };

  const narrar = (from: number, texto: string, porChat: boolean) => {
    if (!puede(from)) return rechazar(from, NO_PUEDES, porChat);
    const t = limpiar(texto, NARRACION_MAX);
    if (!t) return rechazar(from, "¿Qué narras? Escribe la línea: /narrar Cae la noche sobre el puerto.", porChat);
    api.emit("narracion", { texto: t, quien: nombreDe(from) }, "all");
  };

  // summonses: id → who called and who answered (each person counts once, the last answer wins)
  let siguiente = 1;
  const convocatorias = new Map<number, { de: number; vienen: Set<number>; no: Set<number> }>();
  const convocar = (from: number, texto: string, porChat: boolean) => {
    if (!puede(from)) return rechazar(from, NO_PUEDES, porChat);
    const p = api.position(from);
    if (!p) return;
    const id = siguiente++;
    convocatorias.set(id, { de: from, vienen: new Set(), no: new Set() });
    while (convocatorias.size > CONVOCATORIAS_MAX) convocatorias.delete(convocatorias.keys().next().value!);
    const t = limpiar(texto, CONVOCATORIA_MAX) || "ven aquí";
    const n = api.emit("convocatoria", { id, de: nombreDe(from), quien: from, texto: t, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 }, "all");
    api.emit("respuestas", { id, vienen: 0, no: 0 }, { to: from });
    if (porChat) api.emit("aviso", { quien: from, texto: `Convocatoria enviada a ${Math.max(0, n - 1)} persona(s). Verás cuántas vienen.` }, "server");
  };
  api.on("escena", (from, m) => poner(from, String(m.id), false));
  api.on("narrar", (from, m) => narrar(from, String(m.texto), false));
  api.on("convocar", (from, m) => convocar(from, String(m.texto), false));
  api.on("acudir", (from, m) => {
    const c = convocatorias.get(Number(m.id));
    if (!c || c.de === from) return;
    if (m.si === true) { c.vienen.add(from); c.no.delete(from); } else { c.no.add(from); c.vienen.delete(from); }
    api.emit("respuestas", { id: Number(m.id), vienen: c.vienen.size, no: c.no.size }, { to: c.de });
  });
  api.onLeave((e) => { for (const [id, c] of convocatorias) if (c.de === e) convocatorias.delete(id); });

  // the same from the chat (any device with a keyboard, VR included): /escenas, /escena, /narrar, /convocar
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim(), from = Number(m.quien);
    const i = texto.indexOf(" "), palabra = (i < 0 ? texto : texto.slice(0, i)).toLowerCase(), resto = i < 0 ? "" : texto.slice(i + 1).trim();
    if (palabra === "escenas") {
      if (!puede(from)) { rechazar(from, NO_PUEDES, true); return true; }
      const lista = escenas.map((s, n) => `${n + 1}. ${s.nombre}`).join(" · ");
      api.emit("aviso", { quien: from, texto: limpiar(`Escenas: ${lista}. Pon una con /escena <número o nombre>.`, 300) }, "server");
      return true;
    }
    if (palabra === "escena") { poner(from, resto, true); return true; }
    if (palabra === "narrar") { narrar(from, resto, true); return true; }
    if (palabra === "convocar") { convocar(from, resto, true); return true; }
    return false;
  });
});

export default crearDirector();
