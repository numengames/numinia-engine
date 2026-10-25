// entorno — client part (H4): hand the zone's environment to the view (view.entorno) with the ground's files resolved
// (suelos.json), and a small controller the builder panel (apps/plaza/entorno.ts) and agents use. It only asks:
// the server decides and every page applies the result.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";
import { entorno, PRESETS, SUELOS, ZONA } from "./feature.ts";
import catalogo from "./suelos.json" with { type: "json" };

type Suelo = { nombre: string; color: string; normal: string; metros: number; rugosidad: number };
const suelos = catalogo.suelos as Record<string, Suelo>;
/** E3: a house sky's old sha256 (a world saved before it got lighter) → the file the server has now. */
export const HDR_NUEVO: Record<string, string> = Object.fromEntries(Object.values(catalogo.cielos as Record<string, { hdr: string; antes?: string[] }>).flatMap((c) => (c.antes ?? []).map((a) => [a, c.hdr])));

/** What the view draws: the state's fields plus the ground's files and size (render reads them by name). */
export function aVista(v: Msg): Msg {
  const s = suelos[String(v.suelo)] ?? suelos.liso;
  const hdr = HDR_NUEVO[String(v.hdr ?? "")];
  return { ...v, ...(hdr ? { hdr } : {}), sueloMapa: s.color, sueloNormal: s.normal, sueloMetros: Math.max(0.1, s.metros * Number(v.sueloEscala ?? 1)), sueloRugosidad: s.rugosidad };
}

/** H4b: the house skies a builder may pick from the panel as the world's HDR light or sky picture (`id` → the file's «<sha256>.hdr» in /a/). */
export const CIELOS_CASA: { id: string; nombre: string; hdr: string }[] = Object.entries(catalogo.cielos as Record<string, { hdr: string }>).map(([id, c]) => ({ id, nombre: id.charAt(0).toUpperCase() + id.slice(1), hdr: c.hdr }));

/** One per page (tests make one per client). */
export function crearCliente() {
  let api: ClientApi | null = null;
  const estado = { puede: false, ultimoRechazo: "", cambios: 0 };
  const enviar = (intent: string, msg: Msg) => api?.send(intent, msg) ?? { ok: false as const, why: "la página aún no ha arrancado" };
  const valores = (): Msg | undefined => api?.state.get(ZONA);
  /** H4b: the message of `ajustar` carries the WHOLE environment, built from the last state the server echoed. Two quick edits (a colour,
   * then a slider, inside the round trip) would each start from the same old state and the second would undo the first. What this page
   * just sent therefore stays laid over the echoed state for a moment (one entry per field). A preset forgets them. */
  const recientes = new Map<string, { valor: unknown; hasta: number }>();
  const RECIENTE_MS = 800;
  const conRecientes = (v: Msg): Msg => {
    const ahora = Date.now(), fuera: Msg = {};
    for (const [k, r] of recientes) { if (r.hasta < ahora) recientes.delete(k); else fuera[k] = r.valor; }
    return { ...v, ...fuera };
  };
  const ambiente = {
    estado,
    presets: PRESETS.slice(),
    cielos: CIELOS_CASA,
    suelos: SUELOS.map((id) => ({ id, nombre: suelos[id]?.nombre ?? id })),
    /** The zone's environment as the server last said (flat fields; see feature.ts). */
    valores,
    /** A named environment: día, amanecer, atardecer, noche, niebla, tormenta, nublado, jardín («dia», «jardin» work too). */
    preset: (nombre: string) => {
      const n = nombre === "dia" ? "día" : nombre === "jardin" ? "jardín" : nombre;
      recientes.clear();
      return (PRESETS as readonly string[]).includes(n) ? enviar("preset", { nombre: n }) : { ok: false as const, why: `no hay ningún entorno «${nombre}» (hay: ${PRESETS.join(", ")})` };
    },
    /** Change some values and keep the rest (the message carries the whole environment). Marked «propio» unless `preset` comes in. */
    ajustar: (cambios: Msg) => {
      const v = valores();
      if (!v) return { ok: false as const, why: "todavía no ha llegado el entorno de la zona" };
      const todo = { ...conRecientes(v), preset: "propio", ...cambios };
      const r = enviar("ajustar", todo);
      if (r.ok) { const hasta = Date.now() + RECIENTE_MS; for (const k of Object.keys(cambios)) recientes.set(k, { valor: cambios[k], hasta }); recientes.set("preset", { valor: "propio", hasta }); }
      return r;
    },
    /** Put back exactly these values (e.g. what there was before a test). */
    poner: (todo: Msg) => { recientes.clear(); return enviar("ajustar", todo); },
    restaurar: () => { recientes.clear(); return enviar("restaurar", {}); },
  };
  const part = clientPart(entorno, (a) => {
    api = a;
    a.state.onChange((key, v) => { if (key === ZONA && v) { estado.cambios++; a.view.entorno?.(aVista(v)); } });
    a.on("permiso", (m) => { estado.puede = m.construir === true; });
    a.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); });
  });
  return { part, ambiente };
}

const pagina = crearCliente();
export const ambiente = pagina.ambiente;
export default pagina.part;
