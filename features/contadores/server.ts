// contadores — server part (v1, D-044). The server owns every clock: a running countdown loses one second every
// PUBLICA_CADA_TICKS ticks (20 at 20 Hz), a clock gains one, and ONLY then is the shared state written — so the value
// travels once a second, not twenty times, and only to who is inside the counter's zone (state set WITH `at`: J9 area
// of interest). A page never counts by itself: between two values it shows the last one it got. Reaching zero (a
// countdown) or the cap (a counter) stops it and emits `llegada` with the file's `evento` name: the cable (D-041)
// listens to ("contadores", "llegada") on the server (`api.listen`) and matches `m.evento`. Orders come as intents
// (page, phone, VR, agent) and as the chat order «/contador <id> arranca|para|suma [n]|reinicia».
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { contadores, formato, HITOS_S, PUBLICA_CADA_TICKS, SEGUNDOS_MAX, VALOR_MAX } from "./feature.ts";
import type { ContadorFichero } from "./feature.ts";

type Vivo = { f: ContadorFichero; valor: number; marcha: boolean; ticks: number };

const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const NO_PUEDES = "Ese contador lo maneja quien dirige (permiso «Gestionar rituales» de la organización).";

/** What a countdown says at a milestone, or "" (none at this second). */
export function hitoDe(segundos: number): string {
  if (!(HITOS_S as readonly number[]).includes(segundos)) return "";
  return segundos >= 60 ? `quedan ${segundos / 60} minuto${segundos === 60 ? "" : "s"}` : `quedan ${segundos} segundos`;
}

export const crearContadores = (opts: { contadores?: ContadorFichero[] } = {}) => serverPart(contadores, (api: ServerApi) => {
  const vivos = new Map<string, Vivo>();
  const publicar = (v: Vivo) => {
    const { f } = v;
    const m: Msg = { nombre: f.nombre, tipo: f.tipo, x: f.x, y: f.y ?? 0, z: f.z, radio: f.radio ?? 4, valor: v.valor, inicio: f.inicio, tope: f.tope, marcha: v.marcha, donde: f.donde, evento: f.evento, manda: f.manda };
    if (!api.state.set(f.id, m, { at: { x: f.x, z: f.z } })) api.log(`contadores: «${f.id}» no cabe en el esquema (valor ${v.valor})`);
  };
  for (const f of opts.contadores ?? []) { const v: Vivo = { f, valor: f.inicio, marcha: false, ticks: 0 }; vivos.set(f.id, v); publicar(v); }
  if (vivos.size) api.log(`contadores: ${vivos.size} contador(es) del mundo`);

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const hito = (v: Vivo, texto: string) => { api.emit("hito", { id: v.f.id, nombre: v.f.nombre, texto: cortar(`${v.f.nombre}: ${texto}`, 120) }, { near: { x: v.f.x, z: v.f.z }, radius: Number(contadores.state?.radius ?? 64) }); };
  /** The counter reached its end: stop, publish, say it (to the zone and to the server's other features). */
  const llegada = (v: Vivo) => {
    v.marcha = false; v.ticks = 0; publicar(v);
    const texto = v.f.tipo === "contador" ? `${v.f.nombre}: ${formato("contador", v.valor, v.f.tope)}, tope alcanzado` : `${v.f.nombre}: tiempo`;
    api.emit("llegada", { id: v.f.id, nombre: v.f.nombre, tipo: v.f.tipo, valor: v.valor, evento: v.f.evento, texto: cortar(texto, 120) }, { near: { x: v.f.x, z: v.f.z }, radius: Number(contadores.state?.radius ?? 64) });
    api.log(`[contadores] ${v.f.id} llegó (${v.valor})${v.f.evento ? ` → evento «${v.f.evento}»` : ""}`);
  };
  const enTope = (v: Vivo) => v.f.tipo === "contador" && v.f.tope !== 0 && (v.f.tope > v.f.inicio ? v.valor >= v.f.tope : v.valor <= v.f.tope);

  /** May `e` order this counter? `todos` = anyone within reach; `dirige` = who directs, from anywhere. */
  const puede = (e: number, v: Vivo): string => {
    if (v.f.manda === "dirige") return api.puede(e, "dirigir") ? "" : NO_PUEDES;
    return api.within(e, v.f.id) ? "" : `Acércate a ${v.f.nombre} para manejarlo.`;
  };
  const busca = (e: number, id: string): Vivo | null => {
    const v = vivos.get(id);
    if (!v) { rechazar(e, `No hay ningún contador «${cortar(id, 16)}».`); return null; }
    const motivo = puede(e, v);
    if (motivo) { rechazar(e, motivo); return null; }
    return v;
  };

  const arranca = (v: Vivo) => {
    if (v.marcha) return;
    if (v.f.tipo === "cuenta_atras" && v.valor <= 0) v.valor = v.f.inicio; // a finished countdown starts over
    if (enTope(v)) return;
    v.marcha = true; v.ticks = 0; publicar(v); hito(v, v.f.tipo === "contador" ? "en marcha" : "arranca");
  };
  const para = (v: Vivo) => { if (!v.marcha) return; v.marcha = false; v.ticks = 0; publicar(v); hito(v, `parado en ${formato(v.f.tipo, v.valor, v.f.tope)}`); };
  const suma = (v: Vivo, cuanto: number) => {
    if (!Number.isInteger(cuanto) || cuanto === 0) return;
    if (v.f.tipo === "contador") {
      let nuevo = Math.max(-VALOR_MAX, Math.min(VALOR_MAX, v.valor + cuanto));
      if (v.f.tope !== 0) nuevo = v.f.tope > v.f.inicio ? Math.min(nuevo, v.f.tope) : Math.max(nuevo, v.f.tope);
      if (nuevo === v.valor) return;
      v.valor = nuevo;
      if (enTope(v)) { llegada(v); return; }
      publicar(v); hito(v, formato("contador", v.valor, v.f.tope));
    } else {
      const nuevo = Math.max(0, Math.min(SEGUNDOS_MAX, v.valor + cuanto));
      if (nuevo === v.valor) return;
      v.valor = nuevo;
      if (v.f.tipo === "cuenta_atras" && v.valor === 0) { llegada(v); return; }
      publicar(v); hito(v, `${cuanto > 0 ? "+" : ""}${cuanto} s, ${formato(v.f.tipo, v.valor)}`);
    }
  };
  const reinicia = (v: Vivo) => { v.marcha = false; v.ticks = 0; v.valor = v.f.inicio; publicar(v); hito(v, `reiniciado a ${formato(v.f.tipo, v.valor, v.f.tope)}`); };

  api.on("arranca", (e, m) => { const v = busca(e, String(m.id ?? "")); if (v) arranca(v); });
  api.on("para", (e, m) => { const v = busca(e, String(m.id ?? "")); if (v) para(v); });
  api.on("suma", (e, m) => { const v = busca(e, String(m.id ?? "")); if (v) suma(v, Number(m.cuanto ?? 1)); });
  api.on("reinicia", (e, m) => { const v = busca(e, String(m.id ?? "")); if (v) reinicia(v); });
  api.on("pulsar", (e, m) => {
    const v = busca(e, String(m.id ?? "")); if (!v) return;
    if (v.f.tipo === "contador") suma(v, 1); else if (v.marcha) para(v); else arranca(v);
  });

  // the clock: every tick counts; the value (and the state everyone in the zone gets) changes once a second
  api.onTick(() => {
    for (const v of vivos.values()) {
      if (!v.marcha) continue;
      if (++v.ticks < PUBLICA_CADA_TICKS) continue;
      v.ticks = 0;
      if (v.f.tipo === "cuenta_atras") {
        v.valor -= 1;
        if (v.valor <= 0) { v.valor = 0; llegada(v); continue; }
        publicar(v);
        const h = hitoDe(v.valor); if (h) hito(v, h);
      } else if (v.f.tipo === "reloj") {
        v.valor += 1;
        if (v.valor >= SEGUNDOS_MAX) { v.valor = SEGUNDOS_MAX; v.marcha = false; }
        publicar(v);
      }
    }
  });

  // the chat (any device with a keyboard, VR included): /contador sala arranca · /contador marcador suma 3 · /contadores
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim(), from = Number(m.quien);
    const partes = texto.split(/\s+/), palabra = (partes[0] ?? "").toLowerCase();
    if (palabra !== "contador" && palabra !== "contadores") return false;
    if (palabra === "contadores" || partes.length < 3) {
      const lista = [...vivos.values()].map((v) => `${v.f.id} (${v.f.nombre}): ${formato(v.f.tipo, v.valor, v.f.tope)}${v.marcha ? " ▶" : ""}`).join(" · ");
      rechazar(from, lista ? `Contadores: ${lista}. Orden: /contador <id> arranca|para|suma [n]|reinicia` : "Este mundo no tiene contadores (se ponen en entorno/contadores.json).");
      return true;
    }
    const v = busca(from, partes[1]); if (!v) return true;
    const orden = partes[2].toLowerCase();
    if (orden === "arranca") arranca(v); else if (orden === "para") para(v); else if (orden === "reinicia") reinicia(v);
    else if (orden === "suma" || orden === "resta") { const n = partes[3] === undefined ? 1 : Number(partes[3]); if (!Number.isInteger(n)) rechazar(from, "Cuánto: un número entero (/contador marcador suma 3)."); else suma(v, orden === "resta" ? -n : n); }
    else rechazar(from, `No entiendo «${cortar(orden, 16)}»: arranca, para, suma [n], reinicia.`);
    return true;
  });
});

export default crearContadores();
