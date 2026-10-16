// pesca — client part (v1). Keeps THIS player's fishing state as the server tells it (phase, tension, progress, last
// catch, basket) and who is fishing where near you (for their float), and offers one small controller the page
// (apps/plaza/pesca.ts: big «Recoger» button, tension bar, 3D rod/line/float) and agents use. It only asks: the server
// decides the bite, the fish and the catch. Nothing 3D here: the page's lazy chunk (packages/render/src/pesca.ts) draws.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { pesca as decl } from "./feature.ts";

export type Fase = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";
export type Estado = {
  fase: Fase; sitio: string; desde: number;                 // desde = performance.now() when the phase began (animations)
  ventana: number;                                           // s to hook after the bite
  pez: string; fuerza: number;                               // the fish fighting (name as the server says it)
  tension: number; progreso: number; arrancada: "no" | "aviso" | "si";
  recogiendo: boolean;                                       // what we last asked for
  ultimo: { pez: string; cm: number; rareza: string; total: number } | null;
  aviso: string;                                             // the last line worth showing (escape, rejection, catch)
  cesta: { peces: number; clases: number; mejor: string; mejorCm: number };
};
export type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; ocupado: boolean };
export type Flotador = { quien: number; sitio: string; x: number; y: number; z: number };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función pesca no está en este servidor" };
const ahora = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** One per page (tests make one per client). `pesca` is what the page and an agent call; `espia` sees every event (tests). */
export function crearCliente(espia?: (event: string, msg: Msg) => void) {
  let A: ClientApi | null = null;
  const e: Estado = { fase: "nada", sitio: "", desde: 0, ventana: 0, pez: "", fuerza: 0, tension: 0, progreso: 0, arrancada: "no", recogiendo: false, ultimo: null, aviso: "", cesta: { peces: 0, clases: 0, mejor: "", mejorCm: 0 } };
  const flotadores = new Map<number, Flotador>();
  const oyentes = new Set<(que: "estado" | "flotadores" | "sitios") => void>();
  const avisar = (que: "estado" | "flotadores" | "sitios") => { for (const fn of oyentes) fn(que); };
  const fase = (f: Fase) => { e.fase = f; e.desde = ahora(); };
  const reposo = () => { fase("nada"); e.sitio = ""; e.tension = 0; e.progreso = 0; e.arrancada = "no"; e.recogiendo = false; e.pez = ""; };
  let soltando: ReturnType<typeof setTimeout> | null = null;

  const pesca = {
    estado: (): Readonly<Estado> => e,
    /** The fishing spots this page knows (state entries within reach of the area of interest). */
    sitios: (): Sitio[] => (A ? A.state.keys().map((k) => ({ id: k, ...(A!.state.get(k) as Msg) }) as Sitio) : []),
    /** Who is fishing where, near you (yourself included while you fish). */
    flotadores: (): Flotador[] => [...flotadores.values()],
    /** J4: offer the «E: pescar» prompt only while this page is not fishing already. */
    ofrece: (feature: string, _key: string): boolean => feature !== "pesca" || e.fase === "nada",
    lanzar: (sitio?: string): Res => {
      if (!A) return SIN;
      const id = sitio ?? pesca.sitios().find((s) => !s.ocupado)?.id;
      if (!id) return { ok: false, why: "no hay ningún sitio de pesca cerca" };
      return A.send("lanzar", { sitio: id });
    },
    /** Hold (true) / let go (false). While waiting it does nothing on the server; at the bite it hooks; in the fight it reels. */
    recoger: (activo: boolean): Res => {
      if (!A) return SIN;
      if (e.fase === "nada") return { ok: false, why: "no estás pescando" };
      if (soltando) { clearTimeout(soltando); soltando = null; }
      e.recogiendo = activo;
      avisar("estado");
      return A.send("recoger", { activo });
    },
    /** A short press (the touch bar button, an agent): reel for 200 ms. Enough to hook; in the fight, mash it. */
    pulsar: (): Res => {
      const r = pesca.recoger(true);
      if (r.ok) soltando = setTimeout(() => { soltando = null; pesca.recoger(false); }, 200);
      return r;
    },
    soltar: (): Res => (A ? (e.fase === "nada" ? { ok: false, why: "no estás pescando" } : A.send("soltar", {})) : SIN),
    alCambiar: (fn: (que: "estado" | "flotadores" | "sitios") => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (raw) => {
    const api: ClientApi = espia ? { ...raw, on: (ev, fn) => raw.on(ev, (m) => { espia(ev, m); fn(m); }) } : raw;
    A = api;
    api.state.onChange(() => avisar("sitios"));
    api.on("lanzado", (m) => {
      const quien = Number(m.quien), f = { quien, sitio: String(m.sitio), x: Number(m.x), y: Number(m.y), z: Number(m.z) };
      flotadores.set(quien, f);
      if (quien === api.self()) { reposo(); fase("espera"); e.sitio = f.sitio; e.aviso = ""; avisar("estado"); }
      avisar("flotadores");
    });
    api.on("mordisqueo", () => { fase("mordisqueo"); avisar("estado"); });
    api.on("picada", (m) => { fase("picada"); e.ventana = Math.round(Number(m.ventana) * 100) / 100; avisar("estado"); });
    api.on("pelea", (m) => { fase("pelea"); e.pez = String(m.pez); e.fuerza = Number(m.fuerza); e.tension = 18; e.progreso = 8; e.arrancada = "no"; avisar("estado"); });
    api.on("tension", (m) => { e.tension = Number(m.tension); e.progreso = Number(m.progreso); e.arrancada = m.arrancada as Estado["arrancada"]; avisar("estado"); });
    api.on("captura", (m) => {
      e.ultimo = { pez: String(m.pez), cm: Number(m.cm), rareza: String(m.rareza), total: Number(m.total) };
      e.aviso = `Has pescado: ${e.ultimo.pez} de ${e.ultimo.cm} cm`;
      api.view.label(api.self(), `🐟 ${e.ultimo.pez}, ${e.ultimo.cm} cm`, 3500);
      api.view.bounce(api.self(), 1200);
    });
    api.on("escape", (m) => { e.aviso = String(m.texto); });
    api.on("recogida", () => { e.aviso = "Has recogido la caña."; });
    api.on("fin", (m) => {
      const quien = Number(m.quien);
      flotadores.delete(quien);
      if (quien === api.self()) { reposo(); avisar("estado"); }
      avisar("flotadores");
    });
    api.on("cesta", (m) => { e.cesta = { peces: Number(m.peces), clases: Number(m.clases), mejor: String(m.mejor ?? ""), mejorCm: Number(m.mejorCm ?? 0) }; avisar("estado"); });
    api.on("rechazado", (m) => { e.aviso = String(m.motivo); avisar("estado"); });
    // the touch bar's button, the F key and the agents' list: a press reels for a moment (hooks at the bite); nothing while
    // not fishing. The page's HUD (apps/plaza/pesca.ts) turns a held F or a held button into recoger(true)…recoger(false).
    api.action({ id: "recoger", label: "Recoger", key: "KeyF", describe: "Recoger el sedal mientras pescas (engancha el pez en la picada; en la pelea sube la tensión).", run: () => { if (e.fase !== "nada") pesca.pulsar(); } });
  });

  return { parts: [parte], pesca };
}

const pagina = crearCliente();
export const pesca = pagina.pesca;
export default pagina.parts[0];
