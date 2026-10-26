// compilaciones: counts the shader pipelines three links INSIDE a drawn frame, i.e. the ones precompilar.ts did not have ready.
// Pablo's Quest 3S session of 2026-10-26 (work/motor-vr/sesiones/2026-10-26-conclusiones.md): 11 of 17 hitches >= 0.6 s coincided
// with new shader programs. The programs count of the meter cannot tell «prepared before showing» from «linked in the middle of a
// frame» (it only grows in both cases); this can: three calls `backend.createRenderPipeline(renderObject, promises)` from two
// places only — `Renderer.compileAsync` (promises is an array: the link is prepared off the frame) and the draw itself (promises is
// null: the link happens now, in the frame, and on a GPU without KHR_parallel_shader_compile it blocks the page).
//   previas  = pipelines made through compileAsync (before showing)
//   directas = pipelines made by a draw; split by when: before the first frame, between the first frame and the end of the loading
//              screen (hidden by it), and after it (`tardias`: what the player can feel — the number that must stay at 0)
// No three import and no GPU: a test feeds it a fake backend.

export type BackendCompilable = { createRenderPipeline(renderObject: unknown, promises: unknown): unknown };
type ObjetoDeRender = { object?: { name?: string; parent?: { name?: string; parent?: { name?: string } | null } | null }; material?: { type?: string; name?: string } };

export type CompileTardio = { tMs: number; ms: number; objeto: string; material: string; /** What the scene-wide state was (tier, tone mapping, fog, environment, shadows, lights...): a burst of late compiles with a NEW signature = that state changed. */ firma?: string };
export type EstadoCompiles = {
  /** The loading screen has come down (view.cargaOculta() was called): from now on `tardias` counts. */
  cargaLista: boolean;
  /** Linked through compileAsync (precompilar.ts, the VR warm-up, the avatars...). */
  previas: number;
  /** Linked by a draw before the first frame was done (nothing to hide yet). */
  antesDelPrimerCuadro: number;
  /** Linked by a draw after the first frame but while the loading screen was still up. */
  bajoLaCarga: number;
  /** Linked by a draw after the loading screen came down: the late compiles a player feels. */
  tardias: number;
  /** Time those late links took inside the call (ms; on a parallel GPU this is only the submit, the stall shows later). */
  tardiasMs: number;
  /** The last few late ones, newest last. */
  recientes: CompileTardio[];
};

export const RECIENTES_MAX = 24;

const nombreDe = (ro: ObjetoDeRender): string => {
  const o = ro.object; if (!o) return "?";
  const partes: string[] = [];
  for (let p: { name?: string; parent?: unknown } | null | undefined = o; p && partes.length < 3; p = p.parent as typeof p) if (p.name) partes.push(p.name);
  return partes.join(" < ") || "(sin nombre)";
};

export function contarCompiles(backend: BackendCompilable, ahora: () => number = () => performance.now(), firma?: () => string) {
  let primerCuadro = false, cargaLista = false;
  let previas = 0, antes = 0, bajo = 0, tardias = 0, tardiasMs = 0;
  const recientes: CompileTardio[] = [];
  const original = backend.createRenderPipeline;
  backend.createRenderPipeline = function (this: unknown, renderObject: unknown, promises: unknown): unknown {
    if (promises) { previas++; return original.call(backend, renderObject, promises); }
    const t0 = ahora();
    try { return original.call(backend, renderObject, promises); } finally {
      const ms = ahora() - t0;
      if (!primerCuadro) antes++;
      else if (!cargaLista) bajo++;
      else {
        tardias++; tardiasMs += ms;
        const ro = (renderObject ?? {}) as ObjetoDeRender;
        recientes.push({ tMs: Math.round(t0), ms: Math.round(ms * 10) / 10, objeto: nombreDe(ro), material: ro.material?.name || ro.material?.type || "?", ...(firma ? { firma: (() => { try { return firma(); } catch { return "?"; } })() } : {}) });
        if (recientes.length > RECIENTES_MAX) recientes.shift();
      }
    }
  };
  return {
    /** The first frame was drawn: later direct links no longer happen «before anything was shown». */
    primerCuadro(): void { primerCuadro = true; },
    /** The loading screen came down: from here every direct link is a late compile. */
    cargaLista(): void { primerCuadro = true; cargaLista = true; },
    estado(): EstadoCompiles { return { cargaLista, previas, antesDelPrimerCuadro: antes, bajoLaCarga: bajo, tardias, tardiasMs: Math.round(tardiasMs * 10) / 10, recientes: recientes.slice() }; },
    /** Zero the late counters (a test starts a walk; the meter's «reset»). The totals of what was prepared stay. */
    reiniciarTardias(): void { tardias = 0; tardiasMs = 0; recientes.length = 0; },
    /** Put the original back (tests). */
    soltar(): void { backend.createRenderPipeline = original; },
  };
}
export type ContadorCompiles = ReturnType<typeof contarCompiles>;
