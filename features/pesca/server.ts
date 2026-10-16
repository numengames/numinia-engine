// pesca — server part (v1). The server owns the whole cycle: cast → wait (3-12 s) → maybe one nibble → bite with a hook
// window → fight (tension vs progress at 20 Hz, telegraphed surges, a tired fish) → catch or escape. The page only sends
// lanzar / recoger { activo } / soltar and animates what it is told. One angler per spot (as Lakeside's `reserved`);
// others near see the float (lanzado / fin). What you caught is kept per guest in the store (I1 + S4), never per entity.
// Randomness: the engine's seeded PRNG (core rngNext, mulberry32) with the feature's own state — never Math.random.
// Numbers and the tension/progress integration follow bridge-mind/tideline (MIT, src/gameplay/reelMinigame.js,
// src/fish/spawning.js), re-expressed for a 20 Hz server tick and a single fish table (features/pesca/peces.json).
import { rngNext } from "../../packages/core/src/index.ts";
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { pesca, CERCA_M, ESPERA_S, MORDISQUEO_EN, MORDISQUEO_P, MOTIVOS, PELEA, RAREZAS, VENTANA_POR_RAREZA, VENTANA_S } from "./feature.ts";
import tabla from "./peces.json" with { type: "json" };

export type Rareza = (typeof RAREZAS)[number];
export type Pez = { id: string; nombre: string; rareza: Rareza; peso: number; cm: [number, number]; fuerza: number; heft: number; aguante: number; arrancadas: [number, number] };
export type Sitio = { id: string; nombre: string; x: number; z: number; y?: number; radio?: number };
/** The server's tick rate (Hz) and its length (s): the fight integrates with it. */
export const HZ = 20, DT = 1 / HZ;
/** The default spot of a world without its own pesca.json: by the plaza, where a pond fits (-z is north). */
export const SITIOS_DEFECTO: Sitio[] = [{ id: "estanque", nombre: "Estanque de la plaza", x: 24, z: -16, y: 0, radio: 3 }];
const TEXTO: Record<(typeof MOTIVOS)[number], string> = {
  tarde: "Se ha ido: tardaste en recoger.",
  rota: "¡El sedal se ha roto! Demasiada tensión.",
  escapa: "El pez se ha soltado del anzuelo.",
  agotado: "El pez te ha cansado y se ha ido.",
  lejos: "Te alejaste del agua y el pez se fue.",
  desconectado: "Te fuiste.",
};

type Pelea = { pez: Pez & { cm: number; fuerza: number }; tension: number; progreso: number; recogiendo: boolean; t: number; arrancada: "no" | "aviso" | "si"; proxima: number; dura: number };
type Partida = { sitio: string; fase: "espera" | "picada" | "pelea"; t0: number; espera: number; mordisqueo: number; picadaEn: number; ventana: number; pez: Pez & { cm: number; fuerza: number }; pelea: Pelea | null };

/** Pure helpers (tests use them): a uniform in [0,1) from the engine's PRNG, a weighted pick, the size roll. */
export const azar = (rng: Uint32Array): number => rngNext(rng) / 4294967296;
export const entre = (rng: Uint32Array, a: number, b: number): number => a + azar(rng) * (b - a);
export function elegirPez(rng: Uint32Array, peces: readonly Pez[]): Pez {
  const total = peces.reduce((s, p) => s + p.peso, 0);
  let r = azar(rng) * total;
  for (const p of peces) { r -= p.peso; if (r < 0) return p; }
  return peces[peces.length - 1];
}
/** Roll one fish: species by weight, size skewed to small (tideline: random^1.8), strength grows with size (0.85-1.2 ×). */
export function tirarPez(rng: Uint32Array, peces: readonly Pez[]): Pez & { cm: number; fuerza: number } {
  const sp = elegirPez(rng, peces);
  const roll = Math.pow(azar(rng), 1.8), [a, b] = sp.cm;
  const cm = Math.round((a + (b - a) * roll) * 10) / 10, norm = (cm - a) / (b - a);
  return { ...sp, cm, fuerza: Math.round(sp.fuerza * (0.85 + 0.35 * norm) * 100) / 100 };
}
/** One 20 Hz step of the fight (tideline's reelMinigame numbers). Returns how it ended, or null while it goes on. */
export function pasoPelea(p: Pelea, dt: number): "captura" | "rota" | "escapa" | "agotado" | null {
  const R = PELEA;
  p.t += dt;
  const fuerza = p.pez.fuerza * (p.t > p.pez.aguante ? R.cansadoFactor : 1);
  const surge = p.arrancada === "si";
  if (p.recogiendo) {
    p.tension += dt * R.tensionSube * fuerza * (surge ? R.arrancadaRecoger : 1);
    p.progreso += dt * (R.progresoSube / p.pez.heft) * (surge ? 0.55 : 1);
  } else {
    p.tension -= dt * R.tensionBaja * (surge ? 0.45 : 1);
    if (surge) p.tension += dt * R.arrancadaDescanso * fuerza;
    p.progreso -= dt * R.progresoBaja * fuerza * (surge ? 1.5 : 0.9);
  }
  if (p.tension >= 100) return "rota";
  if (p.progreso <= 0 && p.t > R.gracia) return "escapa";
  if (p.t > R.maximo) return "agotado";
  p.tension = Math.max(0, Math.min(100, p.tension));
  if (p.progreso >= 100) return "captura";
  return null;
}

export const crearPesca = (opts: { sitios?: Sitio[]; peces?: Pez[]; semilla?: number } = {}) => serverPart(pesca, (api: ServerApi) => {
  const peces: Pez[] = (opts.peces ?? (tabla as { peces: Pez[] }).peces).filter((p) => RAREZAS.includes(p.rareza) && p.peso > 0 && p.cm[0] < p.cm[1]);
  if (!peces.length) { api.log("pesca: la tabla de peces está vacía; la función no hace nada"); return; }
  const rng = new Uint32Array([(opts.semilla ?? 0x5e5ca) >>> 0]);
  const partidas = new Map<number, Partida>();
  const sitios = new Map<string, Sitio>();

  // the spots: a world's pesca.json or the house default; one state entry each (a thing of the world, with a card)
  const lista = (opts.sitios ?? SITIOS_DEFECTO).filter((s) => /^[a-z0-9-]{1,16}$/.test(String(s.id)) && Number.isFinite(s.x) && Number.isFinite(s.z));
  for (const s of lista) {
    const v: Msg = { nombre: String(s.nombre || "Sitio de pesca").slice(0, 60), x: s.x, y: s.y ?? 0, z: s.z, radio: s.radio ?? 3, ocupado: false };
    if (api.state.set(s.id, v, { at: { x: s.x, z: s.z } })) sitios.set(s.id, s); else api.log(`pesca: el sitio «${s.id}» no cabe en el esquema y no se pone`);
  }
  api.log(`pesca: ${sitios.size} sitio(s), ${peces.length} pez/peces en la tabla`);

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: e }); };
  const ocupar = (id: string, si: boolean) => { const v = api.state.get(id); const s = sitios.get(id); if (v && s) api.state.set(id, { ...v, ocupado: si }, { at: { x: s.x, z: s.z } }); };
  const cesta = (e: number) => {
    const w = api.who(e); if (!w) return;
    const c = (api.store.get(`c:${w.id}`) as { peces?: Record<string, { n: number; mejor: number; nombre: string }> } | undefined)?.peces ?? {};
    let peces = 0, mejor = "", mejorCm = 0;
    for (const r of Object.values(c)) { peces += r.n; if (r.mejor > mejorCm) { mejorCm = r.mejor; mejor = r.nombre; } }
    api.emit("cesta", { peces, clases: Object.keys(c).length, mejor, mejorCm }, { to: e });
  };
  const anotar = (e: number, pez: Pez & { cm: number }): number => {
    const w = api.who(e); if (!w) return 1;
    const k = `c:${w.id}`, c = (api.store.get(k) as { peces?: Record<string, { n: number; mejor: number; nombre: string }> } | undefined) ?? { peces: {} };
    const r = c.peces![pez.id] ?? { n: 0, mejor: 0, nombre: pez.nombre };
    r.n++; r.mejor = Math.max(r.mejor, pez.cm); c.peces![pez.id] = r;
    api.store.set(k, c);
    return Object.values(c.peces!).reduce((s, x) => s + x.n, 0);
  };
  const terminar = (e: number, resultado: "captura" | "escape" | "suelto", motivo?: (typeof MOTIVOS)[number]) => {
    const p = partidas.get(e); if (!p) return;
    partidas.delete(e);
    ocupar(p.sitio, false);
    if (motivo) api.emit("escape", { motivo, texto: TEXTO[motivo] }, { to: e });
    const s = sitios.get(p.sitio)!;
    api.emit("fin", { quien: e, sitio: p.sitio, resultado }, { near: { x: s.x, z: s.z }, radius: CERCA_M });
  };

  api.onIdentify((e) => cesta(e));
  api.onLeave((e) => terminar(e, "escape"));

  api.on("lanzar", (e, m) => {
    const id = String(m.sitio), s = sitios.get(id);
    if (!s) return rechazar(e, `No hay ningún sitio de pesca «${id}».`);
    if (partidas.has(e)) return rechazar(e, "Ya estás pescando: recoge o suelta la caña antes.");
    if (!api.within(e, id)) return rechazar(e, `Acércate al agua para pescar en ${s.nombre}.`);
    if (api.state.get(id)?.ocupado) return rechazar(e, "Ahí ya pesca alguien: espera a que termine.");
    rng[0] = (rng[0] ^ Math.imul(api.tick() + 1, 0x9e3779b1)) >>> 0; // mix the tick in: another cast, another wait (still replayable)
    const espera = Math.round(entre(rng, ESPERA_S[0], ESPERA_S[1]) * HZ);
    const pez = tirarPez(rng, peces);
    partidas.set(e, { sitio: id, fase: "espera", t0: api.tick(), espera, mordisqueo: azar(rng) < MORDISQUEO_P ? Math.round(espera * MORDISQUEO_EN) : -1, picadaEn: -1, ventana: Math.round(VENTANA_S * VENTANA_POR_RAREZA[pez.rareza] * HZ), pez, pelea: null });
    ocupar(id, true);
    api.emit("lanzado", { quien: e, sitio: id, x: s.x, y: s.y ?? 0, z: s.z }, { near: { x: s.x, z: s.z }, radius: CERCA_M });
  });

  api.on("recoger", (e, m) => {
    const p = partidas.get(e);
    if (!p) return rechazar(e, "No estás pescando: lanza la caña en un sitio de pesca.");
    const activo = !!m.activo;
    if (p.fase === "picada" && activo) {
      p.fase = "pelea";
      const [a, b] = p.pez.arrancadas;
      p.pelea = { pez: p.pez, tension: PELEA.tensionInicial, progreso: PELEA.progresoInicial, recogiendo: true, t: 0, arrancada: "no", proxima: entre(rng, a, b) * 0.7, dura: 0 };
      api.emit("pelea", { pez: p.pez.nombre, fuerza: p.pez.fuerza }, { to: e });
      return;
    }
    if (p.fase === "pelea" && p.pelea) p.pelea.recogiendo = activo;
    // while waiting, pressing does nothing: the fish decides (tideline asks for a long hold to retrieve; `soltar` does that here)
  });

  api.on("soltar", (e) => {
    const p = partidas.get(e);
    if (!p) return rechazar(e, "No estás pescando.");
    if (p.fase === "pelea") return terminar(e, "escape", "escapa");
    api.emit("recogida", {}, { to: e });
    terminar(e, "suelto");
  });

  api.onTick((t) => {
    for (const [e, p] of partidas) {
      if (t % 10 === 0 && !api.within(e, p.sitio)) { terminar(e, "escape", "lejos"); continue; }
      const dt = t - p.t0;
      if (p.fase === "espera") {
        if (dt === p.mordisqueo) api.emit("mordisqueo", { sitio: p.sitio }, { to: e });
        if (dt >= p.espera) { p.fase = "picada"; p.picadaEn = t; api.emit("picada", { sitio: p.sitio, ventana: p.ventana / HZ }, { to: e }); }
      } else if (p.fase === "picada") {
        if (t - p.picadaEn > p.ventana) terminar(e, "escape", "tarde");
      } else if (p.pelea) {
        const f = p.pelea;
        // surges: calm → telegraphed (aviso) → active (si) → calm, spaced by the fish's `arrancadas`; a tired fish spaces them more
        f.proxima -= DT;
        if (f.arrancada === "no" && f.proxima <= 0) { f.arrancada = "aviso"; f.dura = PELEA.aviso; }
        else if (f.arrancada === "aviso" && (f.dura -= DT) <= 0) { f.arrancada = "si"; f.dura = entre(rng, PELEA.arrancadaDura[0], PELEA.arrancadaDura[1]); }
        else if (f.arrancada === "si" && (f.dura -= DT) <= 0) { f.arrancada = "no"; const [a, b] = f.pez.arrancadas; f.proxima = entre(rng, a, b) * (f.t > f.pez.aguante ? 1.6 : 1); }
        const fin = pasoPelea(f, DT);
        if (fin === "captura") {
          const total = anotar(e, f.pez);
          api.emit("captura", { pez: f.pez.nombre, cm: f.pez.cm, rareza: f.pez.rareza, total }, { to: e });
          cesta(e);
          terminar(e, "captura");
        } else if (fin) terminar(e, "escape", fin);
        else if (t % 2 === 0) api.emit("tension", { tension: Math.round(f.tension), progreso: Math.round(Math.max(0, f.progreso)), arrancada: f.arrancada }, { to: e });
      }
    }
  });
});

export default crearPesca();
