// entorno — server part (H4). The server decides: who may change the environment (api.puede "construir"), what a
// preset means (presets.json), the sun from the time of day, and the day cycle when the world asks for one. The
// environment is one state entry ("zona", no `at`), saved (S4); a world brings its own default (crearEntorno(json)).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { entorno, ZONA } from "./feature.ts";
import { validarEntorno, porDefecto, solDeHora } from "./esquema.ts";
import type { Plano } from "./esquema.ts";
import casa from "./por-defecto.json" with { type: "json" };
import presets from "./presets.json" with { type: "json" };

const TICK_HZ = 20;
/** Every how many ticks the day cycle moves the clock (5 s): small steps, one state message to everyone each time. */
export const CICLO_TICKS = 5 * TICK_HZ;

/** The house default, then the world's file over it. A file with mistakes is not used: the log says why and where. */
export function baseDelMundo(mundo: unknown, log: (l: string) => void = () => {}): Plano {
  const c = validarEntorno(casa);
  const base = c.ok ? c.value : porDefecto();
  if (mundo === undefined || mundo === null) return base;
  const m = validarEntorno(mundo, base);
  if (m.ok) return m.value;
  log(`entorno.json del mundo no se usa: ${m.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  return base;
}

/** The sun follows the clock when the environment says so. */
export function conSol(v: Plano): Plano {
  if (v.solHora !== true) return v;
  const s = solDeHora(Number(v.hora));
  return { ...v, solAltura: s.altura, solRumbo: s.rumbo };
}

/** `mundo`: the world's entorno@1 (MUNDO_DIR/entorno.json); none = the house default (por-defecto.json). */
export const crearEntorno = (mundo?: unknown) => serverPart(entorno, (api) => {
  const base = conSol(baseDelMundo(mundo, api.log));
  const rechazar = (from: number, motivo: string) => { api.emit("rechazado", { motivo }, { to: from }); return false; };
  const puede = (from: number) => api.puede(from, "construir") || rechazar(from, "No puedes cambiar el entorno: el mundo está cerrado a construir (lo abre quien lo administra).");
  const actual = (): Plano => (api.state.get(ZONA) as Plano | undefined) ?? base;
  const poner = (v: Msg, avisar = true) => {
    const ok = api.state.set(ZONA, conSol(v));
    if (ok && avisar) api.emit("cambiado", { preset: String(v.preset) }, "all");
    return ok;
  };
  if (!api.state.get(ZONA)) poner(base, false); // nothing saved yet: the world's own

  const avisar = (e: number) => { api.emit("permiso", { construir: api.puede(e, "construir") }, { to: e }); };
  api.onJoin(avisar);
  api.onIdentify((e) => avisar(e));
  api.listen("roles", "cambio", (m) => { avisar(Number(m.quien)); return true; }); // H3: a role given or taken, /construir

  api.on("preset", (from, m) => {
    if (!puede(from)) return;
    const nombre = String(m.nombre), p = (presets.presets as Record<string, unknown>)[nombre];
    if (!p) return void rechazar(from, `No hay ningún entorno «${nombre}».`);
    const r = validarEntorno(p, actual());
    if (!r.ok) return void rechazar(from, `El preset «${nombre}» tiene un error: ${r.issues[0].path}: ${r.issues[0].message}`);
    poner({ ...r.value, preset: nombre });
  });
  api.on("ajustar", (from, m) => { if (puede(from)) poner(m); });
  api.on("restaurar", (from) => { if (puede(from)) poner(base); });

  // the day cycle (hora.cicloMinutos > 0): a whole day in that many minutes, the clock moved every 5 s. The exact clock
  // lives here (the wire carries 0.05 h steps); a builder who sets the time by hand moves it.
  let reloj = Number(actual().hora);
  api.onTick((t) => {
    if (t % CICLO_TICKS !== 0) return;
    const v = api.state.get(ZONA);
    const ciclo = Number(v?.ciclo ?? 0);
    if (!v || !(ciclo > 0)) return;
    if (Math.abs(Number(v.hora) - Math.round(reloj * 20) / 20) > 0.051) reloj = Number(v.hora);
    reloj = (reloj + (24 * CICLO_TICKS) / TICK_HZ / (ciclo * 60)) % 24;
    const hora = Math.round(reloj * 20) / 20 % 24;
    if (Math.abs(hora - Number(v.hora)) >= 0.05) poner({ ...v, hora }, false);
  });
});

export default crearEntorno();
