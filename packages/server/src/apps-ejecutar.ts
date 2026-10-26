// apps-ejecutar (M20, slice 2): the `main.ts` of each app (M19 folders) runs in the SES sandbox of guion.ts.
//   - one worker per script, so a script past its CPU budget is cut and the cut is REPORTED (log, GET /apps, /metrics.prom);
//   - the script sees only `app` (on/off/log/emit): no `process`, no files, no network (guion-trabajador.ts);
//   - hot reload: an admin edits `main.ts` (the door in apps-http.ts, or the file on disk) and the script is swapped with no
//     world restart; code that does not even load never replaces the running one (it is tried in a throwaway sandbox first).
// The script is TypeScript (the app format says main.ts): types are stripped with node's own stripTypeScriptTypes, then the
// result is evaluated in the compartment. Syntax that needs a compiler (enum, namespace) is refused with the reason.
// Pure engine piece (R-1): a world with no apps/ folder, or apps without «main», starts no worker at all.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, watch, writeFileSync } from "node:fs";
import type { FSWatcher } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { APP_MAIN_MAX, leerApp } from "./apps.ts";
import type { AppCargada } from "./apps.ts";
import { Guion } from "./guion.ts";
import type { Motivo, Resultado } from "./guion.ts";

/** Live scripts per world: each is a worker thread (~27 MB of RSS measured, ~70 ms to start). More are listed and not run. */
export const GUIONES_MAX = 8;
export const GUION_CPU_MS = 50;       // one call of a handler
export const GUION_CARGA_MS = 500;    // the script's top level
export const GUION_MEMORIA_MB = 64;   // heap of one script
const INFORMES_MAX = 20;              // last cuts kept per app for GET /apps
const DEBOUNCE_MS = 250;

export type EstadoGuion = "viva" | "cortada" | "error" | "sin-sitio" | "cerrada";
export type Informe = { cuando: string; motivo: Motivo | "carga"; detalle: string };
export type EstadoApp = {
  id: string; estado: EstadoGuion; version: number; sha256: string; bytes: number;
  cortes: { cpu: number; memoria: number; error: number }; informes: Informe[]; porQue?: string;
};
export type ResultadoRecarga = { ok: true; version: number; sha256: string } | { ok: false; motivo: "app" | "carga" | "ausente" | "sin-main" | "grande" | "tipos"; detalle: string };

/** main.ts → JavaScript the compartment can evaluate. Throws a one-line reason when the types cannot just be erased. */
export function aJavaScript(ts: string): string {
  try { return stripTypeScriptTypes(ts); }
  catch (e) { throw new Error(`main.ts no se puede leer como TypeScript que solo borra tipos (${(e as Error).message.split("\n")[0]}): no uses enum, namespace ni parámetros con modificador`); }
}
const sha = (s: string | Uint8Array): string => createHash("sha256").update(s).digest("hex");

type Viva = { app: AppCargada; guion: Guion | null; estado: EstadoGuion; sha: string; bytes: number; informes: Informe[]; porQue?: string; reloj?: NodeJS.Timeout; vigia?: FSWatcher; ocupada: Promise<unknown> };

export type OpcionesEjecutor = {
  apps: AppCargada[]; log?: (l: string) => void;
  topeMs?: number; topeCargaMs?: number; memoriaMb?: number; max?: number;
  /** Watch each app folder: an edit of main.ts on disk reloads it. Default true. */
  vigilar?: boolean;
  /** Called with every cut, so the world can tell its admins. */
  alInforme?: (app: string, motivo: Motivo, detalle: string) => void;
  /** What a script `emit`s and `log`s. */
  alEmitir?: (app: string, nombre: string, datos: unknown) => void;
};

export function crearEjecutorApps(o: OpcionesEjecutor) {
  const log = o.log ?? (() => {});
  const vivas = new Map<string, Viva>();
  const opGuion = { topeMs: o.topeMs ?? GUION_CPU_MS, topeCargaMs: o.topeCargaMs ?? GUION_CARGA_MS, memoriaMb: o.memoriaMb ?? GUION_MEMORIA_MB };
  const max = o.max ?? GUIONES_MAX;
  let cerrado = false;

  const informar = (v: Viva, motivo: Motivo | "carga", detalle: string) => {
    v.informes.push({ cuando: new Date().toISOString(), motivo, detalle: detalle.slice(0, 300) });
    if (v.informes.length > INFORMES_MAX) v.informes.shift();
  };
  const nuevoGuion = (id: string, v: Viva) => new Guion({
    ...opGuion,
    alRegistrar: (t) => log(`[app ${id}] ${t}`),
    alEmitir: (n, d) => o.alEmitir?.(id, n, d),
    alInforme: (motivo, detalle) => {
      if (motivo === "cerrado") return;
      v.estado = motivo === "error" ? "error" : "cortada"; v.porQue = detalle;
      informar(v, motivo, detalle);
      log(`[app ${id}] script ${motivo === "cpu" ? "cortado por pasarse de CPU" : motivo === "memoria" ? "cortado por pasarse de memoria" : "falló"}: ${detalle}`);
      o.alInforme?.(id, motivo, detalle);
    },
  });
  const props = (a: AppCargada): Record<string, unknown> => Object.fromEntries(a.app.propiedades.filter((p) => p.porDefecto !== undefined).map((p) => [p.id, p.porDefecto]));
  const alCargar = (a: AppCargada, g: Guion) => g.lanzar("alCargar", { props: props(a) });

  /** Try `codigo` in a throwaway sandbox: it loads (top level inside the CPU budget, no throw) or it does not. */
  const probar = async (id: string, codigo: string): Promise<Resultado> => {
    const g = new Guion({ ...opGuion, alRegistrar: () => {}, alEmitir: () => {} });
    try { return await g.cargar(codigo); } finally { g.cerrar(); }
  };

  const cargar = async (v: Viva, texto: string): Promise<Resultado> => {
    const id = v.app.app.id;
    let js: string;
    try { js = aJavaScript(texto); } catch (e) { return { ok: false, motivo: "error", detalle: (e as Error).message }; }
    if (!v.guion) v.guion = nuevoGuion(id, v);
    const r = await v.guion.cargar(js);
    v.sha = sha(texto); v.bytes = Buffer.byteLength(texto);
    if (r.ok) { v.estado = "viva"; v.porQue = undefined; await alCargar(v.app, v.guion); }
    return r;
  };

  /** Serialise the work on one app: a reload never overlaps another. */
  const enCola = <T>(v: Viva, f: () => Promise<T>): Promise<T> => {
    const p = v.ocupada.then(f, f); v.ocupada = p.catch(() => {}); return p;
  };

  const vigilarApp = (v: Viva) => {
    if (o.vigilar === false) return;
    try {
      let t: NodeJS.Timeout | undefined;
      v.vigia = watch(v.app.carpeta, { persistent: false }, (_ev, nombre) => {
        if (nombre !== "main.ts" && nombre !== "app.json") return;
        clearTimeout(t);
        t = setTimeout(() => { if (!cerrado) void recargar(v.app.app.id, true); }, DEBOUNCE_MS);
        t.unref?.();
      });
      v.vigia.on("error", () => {});
    } catch { /* a folder that cannot be watched is reloaded by hand through the door */ }
  };

  async function arrancar(): Promise<void> {
    let vivos = 0;
    for (const a of o.apps) {
      const v: Viva = { app: a, guion: null, estado: "cerrada", sha: a.main?.sha256 ?? "", bytes: a.main?.bytes ?? 0, informes: [], ocupada: Promise.resolve() };
      if (!a.main) continue;                                  // no «main»: nothing to run, no worker
      vivas.set(a.app.id, v);
      if (vivos >= max) { v.estado = "sin-sitio"; v.porQue = `este mundo corre ${max} scripts a la vez (limits.json app_scripts_max); ${a.app.id} se guarda y se lista, no se ejecuta`; log(`[apps] ${v.porQue}`); continue; }
      vivos++;
      const texto = readFileSync(join(a.carpeta, "main.ts"), "utf8");
      const r = await cargar(v, texto);
      if (r.ok) log(`[apps] «${a.app.id}» corre en la caja SES (CPU ${opGuion.topeMs} ms por llamada, memoria ${opGuion.memoriaMb} MB)`);
      else { v.estado = r.motivo === "cpu" || r.motivo === "memoria" ? "cortada" : "error"; v.porQue = r.detalle; informar(v, "carga", r.detalle); log(`[apps] «${a.app.id}» no arranca: ${r.detalle}`); }
      vigilarApp(v);
    }
  }

  /** Re-read the app from disk and swap the running script for it. A main.ts that does not load leaves the old one running. */
  function recargar(id: string, deDisco = false): Promise<ResultadoRecarga> {
    const v = vivas.get(id);
    if (!v) return Promise.resolve({ ok: false, motivo: "ausente", detalle: `no hay una app «${id}» con main.ts corriendo en este mundo` });
    return enCola(v, async (): Promise<ResultadoRecarga> => {
      const lec = leerApp(v.app.carpeta, id);
      if (!lec.ok) { const d = lec.issues.map((i) => `${i.path}: ${i.message}`).join("; "); informar(v, "carga", d); log(`[apps] «${id}» cambió y no vale, sigue el script de antes: ${d}`); return { ok: false, motivo: "app", detalle: d }; }
      if (!lec.cargada.main) return { ok: false, motivo: "sin-main", detalle: "app.json ya no dice «main»: quítale el script con el editor de ficheros o vuelve a ponerlo" };
      const texto = readFileSync(join(lec.cargada.carpeta, "main.ts"), "utf8");
      if (deDisco && sha(texto) === v.sha) return { ok: true, version: v.guion?.version ?? 0, sha256: v.sha }; // our own write, already applied
      let js: string;
      try { js = aJavaScript(texto); } catch (e) { const d = (e as Error).message; informar(v, "carga", d); log(`[apps] «${id}» cambió y no vale, sigue el script de antes: ${d}`); return { ok: false, motivo: "tipos", detalle: d }; }
      const prueba = await probar(id, js);
      if (!prueba.ok) { informar(v, "carga", prueba.detalle); log(`[apps] «${id}» cambió y no carga (${prueba.motivo}), sigue el script de antes: ${prueba.detalle}`); return { ok: false, motivo: "carga", detalle: prueba.detalle }; }
      v.app = lec.cargada;
      const r = await cargar(v, texto);
      if (!r.ok) return { ok: false, motivo: "carga", detalle: r.detalle };
      log(`[apps] «${id}» recargado en caliente (versión ${v.guion!.version}, ${v.sha.slice(0, 8)})`);
      return { ok: true, version: v.guion!.version, sha256: v.sha };
    });
  }

  /** Admin edit: check the new text, write main.ts atomically, swap the running script. Nothing is written if it does not load. */
  function escribir(id: string, texto: string): Promise<ResultadoRecarga> {
    const v = vivas.get(id);
    if (!v) return Promise.resolve({ ok: false, motivo: "ausente", detalle: `no hay una app «${id}» con main.ts corriendo en este mundo` });
    if (Buffer.byteLength(texto) > APP_MAIN_MAX) return Promise.resolve({ ok: false, motivo: "grande", detalle: `${Buffer.byteLength(texto)} bytes: el tope de un main.ts es ${APP_MAIN_MAX} (limits.json app_main_max_kb)` });
    return enCola(v, async (): Promise<ResultadoRecarga> => {
      let js: string;
      try { js = aJavaScript(texto); } catch (e) { return { ok: false, motivo: "tipos", detalle: (e as Error).message }; }
      const prueba = await probar(id, js);
      if (!prueba.ok) { informar(v, "carga", prueba.detalle); log(`[apps] edición de «${id}» rechazada (${prueba.motivo}): ${prueba.detalle}`); return { ok: false, motivo: "carga", detalle: prueba.detalle }; }
      const ruta = join(v.app.carpeta, "main.ts"), tmp = `${ruta}.nuevo`;
      writeFileSync(tmp, texto); renameSync(tmp, ruta);
      const r = await cargar(v, texto);
      if (!r.ok) return { ok: false, motivo: "carga", detalle: r.detalle };
      log(`[apps] «${id}» editado y recargado en caliente (versión ${v.guion!.version}, ${v.sha.slice(0, 8)})`);
      return { ok: true, version: v.guion!.version, sha256: v.sha };
    });
  }

  const leerTexto = (id: string): string | null => {
    const v = vivas.get(id); const ruta = v && join(v.app.carpeta, "main.ts");
    return ruta && existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
  };

  const estado = (): EstadoApp[] => [...vivas.values()].map((v) => ({
    id: v.app.app.id, estado: v.estado, version: v.guion?.version ?? 0, sha256: v.sha, bytes: v.bytes,
    cortes: { ...(v.guion?.cortes ?? { cpu: 0, memoria: 0, error: 0 }) }, informes: [...v.informes], ...(v.porQue ? { porQue: v.porQue } : {}),
  }));
  const estadoDe = (id: string) => estado().find((e) => e.id === id) ?? null;
  /** Rows for numinia_guion_cortes_total{app,motivo}. */
  const cortes = (): [string, string, number][] => estado().flatMap((e) => (["cpu", "memoria", "error"] as const).map((m): [string, string, number] => [e.id, m, e.cortes[m]]));

  /** Run a handler of an app's script. Never throws. */
  async function lanzar(id: string, nombre: string, datos: unknown = null): Promise<Resultado> {
    const v = vivas.get(id);
    if (!v?.guion || v.estado === "sin-sitio") return { ok: false, motivo: "cerrado", detalle: `la app «${id}» no tiene un script corriendo` };
    const r = await v.guion.lanzar(nombre, datos);
    if (r.ok && v.estado !== "viva") { v.estado = "viva"; v.porQue = undefined; } // the next call after a cut started a fresh worker
    return r;
  }

  function parar(): void {
    cerrado = true;
    for (const v of vivas.values()) { v.vigia?.close(); v.guion?.cerrar(); v.estado = "cerrada"; }
  }

  return { arrancar, recargar, escribir, leerTexto, estado, estadoDe, cortes, lanzar, parar, tiene: (id: string) => vivas.has(id), vivos: () => [...vivas.values()].filter((v) => v.estado !== "sin-sitio").length };
}
export type EjecutorApps = ReturnType<typeof crearEjecutorApps>;
