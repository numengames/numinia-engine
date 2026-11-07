// sucesos — server part (v1, Y48). The server runs every event, once a second (PASO_TICKS ticks): it counts the
// announcement down, advances a running event by whole numbers (`ritmo`), remembers who stood in the zone, and at the
// end gives EVERY participant the whole reward and draws the chained event from its own integer RNG (core's mulberry32,
// seeded: same seed and same visits → the same chain). A feature never touches the simulation, so this RNG is a stream of
// its own, kept apart from the sim's. Nothing here reads a clock or `Math.random`.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { NO_PUEDE, puedeInterruptor } from "../interruptor.ts";
import { sucesos, ALCANCE_M, PASO_TICKS } from "./feature.ts";
import { PROGRESO_ESCALA } from "./feature.ts";
import { elegirSiguiente, ritmo } from "./esquema.ts";
import type { Fase } from "./feature.ts";
import type { SucesoFichero } from "./esquema.ts";

type Vivo = { f: SucesoFichero; fase: Fase; quedan: number; progreso: number; ayudan: number; hitos: number; participantes: number[]; desde: number };

const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const personas = (n: number) => (n === 1 ? "1 persona" : `${n} personas`);
/** The sentence a card and `mirar` give for an event in its phase. */
export function fraseDe(nombre: string, fase: Fase, quedan: number, progreso: number, ayudan: number): string {
  if (fase === "anunciado") return `${nombre}: empieza en ${quedan} s.`;
  if (fase === "curso") return `${nombre}: va por el ${Math.floor(progreso / 10)} %, ${ayudan ? `${personas(ayudan)} ayudando` : "avanza solo, sin nadie"}.`;
  return `${nombre}: ahora no pasa nada.`;
}

export const crearSucesos = (opts: { sucesos?: SucesoFichero[]; semilla?: number } = {}) => serverPart(sucesos, (api: ServerApi) => {
  const vivos: Vivo[] = [];
  const rng = new Uint32Array([(opts.semilla ?? 1) >>> 0]);
  const por = (id: string) => vivos.find((v) => v.f.id === id);
  const publicar = (v: Vivo, texto?: string) => {
    const { f } = v;
    const m: Msg = { nombre: f.nombre, x: f.x, y: f.y ?? 0, z: f.z, radio: f.radio, fase: v.fase, quedan: v.quedan, progreso: Math.floor(v.progreso / (PROGRESO_ESCALA / 1000)), ayudan: v.ayudan, texto: cortar(texto ?? fraseDe(f.nombre, v.fase, v.quedan, Math.floor(v.progreso / (PROGRESO_ESCALA / 1000)), v.ayudan), 120) };
    if (!api.state.set(f.id, m, { at: { x: f.x, z: f.z } })) api.log(`sucesos: «${f.id}» no cabe en el esquema`);
  };
  const anunciar = (v: Vivo) => {
    v.fase = "anunciado"; v.quedan = v.f.aviso; v.progreso = 0; v.ayudan = 0; v.hitos = 0; v.participantes = []; v.desde = api.tick(); // it counts from the NEXT step, never in the one that woke it
    publicar(v);
    api.emit("anuncio", { id: v.f.id, nombre: cortar(v.f.nombre, 60), texto: cortar(v.f.anuncio, 120), quedan: v.quedan }, { near: { x: v.f.x, z: v.f.z }, radius: ALCANCE_M });
    api.log(`[sucesos] ${v.f.id} anunciado (empieza en ${v.quedan} s)`);
  };
  for (const f of opts.sucesos ?? []) {
    const v: Vivo = { f, fase: "dormido", quedan: 0, progreso: 0, ayudan: 0, hitos: 0, participantes: [], desde: -1 };
    vivos.push(v);
    publicar(v);
  }
  // the ones the file says start with the server get their announcement on the first step (nobody is here yet to hear it, the card tells whoever arrives)
  const alArrancar = vivos.filter((v) => v.f.empieza);
  for (const v of alArrancar) { v.fase = "anunciado"; v.quedan = v.f.aviso; publicar(v); }

  const donde = (v: Vivo) => ({ near: { x: v.f.x, z: v.f.z }, radius: ALCANCE_M });
  const termina = (v: Vivo) => {
    const { f } = v;
    const presentes = api.players();
    const premiados = v.participantes.filter((e) => presentes.includes(e)).sort((a, b) => a - b);
    for (const e of premiados) { // the WHOLE reward to each one: the same for everybody, never divided
      api.emit("recompensa", { id: f.id, nombre: cortar(f.nombre, 60), texto: cortar(f.recompensa.texto, 120), cosa: f.recompensa.cosa, cuanto: f.recompensa.cuanto }, { to: e });
      if (f.recompensa.cosa && f.recompensa.cuanto > 0) api.emit("otorga", { id: f.id, quien: e, cosa: f.recompensa.cosa, cuanto: f.recompensa.cuanto }, "server");
    }
    const sig = elegirSiguiente(f.siguiente, rng);
    const texto = f.final || `${f.nombre} ha terminado${premiados.length ? `: ${personas(premiados.length)} tomaron parte` : ""}.`;
    api.emit("termina", { id: f.id, nombre: cortar(f.nombre, 60), texto: cortar(texto, 120), participantes: premiados.length, siguiente: sig }, donde(v));
    api.emit("cadena", { id: f.id, siguiente: sig, participantes: premiados.length }, "server");
    api.log(`[sucesos] ${f.id} termina: ${premiados.length} participante(s), siguiente «${sig}»`);
    v.fase = "dormido"; v.quedan = 0; v.progreso = 0; v.ayudan = 0; v.participantes = [];
    publicar(v);
    const otro = sig ? por(sig) : undefined;
    if (otro && otro.fase === "dormido") anunciar(otro);
    else if (otro) api.log(`[sucesos] ${sig} ya estaba en marcha: no se anuncia otra vez`);
  };
  const paso = (v: Vivo) => {
    const { f } = v;
    if (v.desde === api.tick()) return;
    if (v.fase === "anunciado") {
      v.quedan = Math.max(0, v.quedan - 1);
      if (v.quedan > 0) return publicar(v);
      v.fase = "curso"; v.progreso = 0; v.hitos = 0;
      api.emit("hito", { id: f.id, nombre: cortar(f.nombre, 60), texto: cortar(`${f.nombre} ha empezado. Quien esté en su zona lo acelera.`, 120), progreso: 0, ayudan: 0 }, donde(v));
      return publicar(v);
    }
    if (v.fase !== "curso") return;
    const dentro = api.overlapSphere(f.x, f.y ?? 0, f.z, f.radio);
    for (const e of dentro) if (!v.participantes.includes(e)) v.participantes.push(e);
    v.ayudan = dentro.length;
    v.progreso = Math.min(PROGRESO_ESCALA, v.progreso + ritmo(f, dentro.length));
    const cuarto = Math.floor(v.progreso / (PROGRESO_ESCALA / 4));
    if (v.progreso < PROGRESO_ESCALA && cuarto > v.hitos) {
      v.hitos = cuarto;
      api.emit("hito", { id: f.id, nombre: cortar(f.nombre, 60), texto: cortar(`${f.nombre}: ${cuarto * 25} %, ${v.ayudan ? personas(v.ayudan) + " ayudando" : "avanza solo"}.`, 120), progreso: cuarto * 250, ayudan: v.ayudan }, donde(v));
    }
    if (v.progreso >= PROGRESO_ESCALA) return termina(v);
    publicar(v);
  };
  api.onTick((t) => { if (t % PASO_TICKS === 0) for (const v of vivos) paso(v); });

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };
  const mirar = (e: number, id: string) => {
    const v = por(id);
    if (!v) return rechazar(e, `No hay ningún evento «${cortar(id, 16)}».`);
    api.emit("estado", { id, texto: cortar(fraseDe(v.f.nombre, v.fase, v.quedan, Math.floor(v.progreso / (PROGRESO_ESCALA / 1000)), v.ayudan), 120) }, { to: e });
  };
  const lanzar = (e: number, id: string) => {
    if (!puedeInterruptor(api, e)) return rechazar(e, NO_PUEDE);
    const v = por(id);
    if (!v) return rechazar(e, `No hay ningún evento «${cortar(id, 16)}».`);
    if (v.fase !== "dormido") return rechazar(e, `${v.f.nombre} ya está en marcha.`);
    anunciar(v);
  };
  api.on("mirar", (e, m) => mirar(e, String(m.id ?? "")));
  api.on("lanzar", (e, m) => lanzar(e, String(m.id ?? "")));

  // the chat (a keyboard, VR included): /evento <id> (what is going on) · /evento <id> lanzar (who directs)
  api.listen("chat", "orden", (m) => {
    const partes = String(m.texto ?? "").trim().split(/\s+/), from = Number(m.quien);
    if ((partes[0] ?? "").toLowerCase() !== "evento") return false;
    const id = (partes[1] ?? "").toLowerCase();
    if (!id) { rechazar(from, `Escribe /evento y el nombre: ${vivos.map((v) => v.f.id).join(", ") || "este mundo no tiene sucesos"}.`); return true; }
    if ((partes[2] ?? "").toLowerCase() === "lanzar") lanzar(from, id); else mirar(from, id);
    return true;
  });
});

export default crearSucesos();
