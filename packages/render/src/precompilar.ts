// precompilar (B3): a world's models get their shaders ready BEFORE they are shown, so the frame that first draws them
// does not stop to compile. R6 (work/motor-rendimiento/CLIENTE-PERFIL.md) measured the events template linking 31-33
// programs inside its first draws — three r186 links synchronously on that path (WebGLBackend: the non-blocking poll
// is used only inside compileAsync) — and that froze the picture for 0.3-1.7 s at a time on this PC's software GPU.
//
// Each loaded copy waits in a queue; the queue goes to `renderer.compileAsync` in batches, one batch per task:
//   - with KHR_parallel_shader_compile (most real GPUs) the driver links in its own threads and three polls
//     COMPLETION_STATUS once per frame, so a whole batch (LOTE_PARALELO models) is prepared without blocking;
//   - without it, linking blocks the page whatever we do (the spec: there is no way to ask without waiting,
//     https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/), so ONE model per task: the stall is
//     cut into pieces with frames in between, and it happens before the model shows, never in the middle of a frame.
// A copy is shown when its batch is ready (or after ESPERA_MAX_MS, or if compiling fails: never lost).
// No three import: it works on anything with traverse/add/remove (tests run it without a GPU).

/** The little of an Object3D this needs. */
export type Nodo = { traverse(f: (o: Nodo) => void): void; frustumCulled?: boolean; isMesh?: boolean; parent?: unknown };
export type Grupo = Nodo & { add(...o: Nodo[]): unknown; remove(...o: Nodo[]): unknown };

/** With the parallel extension: models in one batch (one compileAsync; the driver links them together). */
export const LOTE_PARALELO = 8;
/** Without it: models per batch (each one blocks while it links; one per task keeps frames coming between them). */
export const LOTE_SIN_PARALELO = 1;
/** A model is shown after this long even if its shaders are still not ready (lost device, a driver that never says). */
export const ESPERA_MAX_MS = 5000;

export type OpcionesPrecompilar = {
  /** renderer.compileAsync(grupo, camera, scene): its synchronous part projects the group; the promise = all linked. */
  compilar: (g: Grupo) => Promise<unknown>;
  /** A fresh empty group (a THREE.Group; never added to the scene). */
  grupo: () => Grupo;
  /** Does this GPU link in parallel (KHR_parallel_shader_compile, or WebGPU)? */
  paralelo: () => boolean;
  /** Run `f` in a later task (default setTimeout 0): batches never run inside the task that queued them. */
  despues?: (f: () => void) => void;
  ahora?: () => number;
};

export function crearPrecompilador(o: OpcionesPrecompilar) {
  const despues = o.despues ?? ((f: () => void) => { setTimeout(f, 0); });
  const ahora = o.ahora ?? (() => performance.now());
  type Pedido = { objs: Nodo[]; listo: () => void };
  const cola: Pedido[] = [];
  let enCurso = false, pedido = false;
  let preparados = 0, lotes = 0, fallos = 0, sinEsperar = 0, msTotal = 0, msPeor = 0;

  function programar(): void {
    if (pedido || enCurso || !cola.length) return;
    pedido = true;
    despues(() => { pedido = false; lote(); });
  }
  function lote(): void {
    if (enCurso || !cola.length) return;
    const n = o.paralelo() ? LOTE_PARALELO : LOTE_SIN_PARALELO;
    const estos = cola.splice(0, n);
    const g = o.grupo();
    // what is behind the camera must be compiled too: three's projection skips what the frustum culls
    const culled: [Nodo, boolean][] = [];
    for (const p of estos) for (const obj of p.objs) {
      g.add(obj);
      obj.traverse((x) => { if (x.frustumCulled) { culled.push([x, true]); x.frustumCulled = false; } });
    }
    enCurso = true; lotes++;
    const t0 = ahora();
    let promesa: Promise<unknown>;
    try { promesa = Promise.resolve(o.compilar(g)); } catch (e) { promesa = Promise.reject(e); }
    for (const [x, v] of culled) x.frustumCulled = v; // projection happened inside the call: back as they were
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const tope = new Promise<"tope">((ok) => { reloj = setTimeout(() => ok("tope"), ESPERA_MAX_MS); });
    void Promise.race([promesa.then(() => "ok" as const), tope]).catch(() => "mal" as const).then((r) => {
      clearTimeout(reloj);
      const ms = ahora() - t0; msTotal += ms; if (ms > msPeor) msPeor = ms;
      if (r === "mal") fallos++; else if (r === "tope") sinEsperar++;
      for (const p of estos) for (const obj of p.objs) g.remove(obj);
      enCurso = false;
      for (const p of estos) { preparados++; try { p.listo(); } catch (e) { console.warn("[precompilar] al mostrar:", e); } }
      programar();
    });
  }

  return {
    /** Prepare these objects' shaders, then call `listo` (it attaches them where they go). They must not be in the
     * scene yet: for the wait they sit in a private group. */
    preparar(objs: Nodo[], listo: () => void): void { cola.push({ objs, listo }); programar(); },
    /** Models waiting or compiling (the page keeps drawing while there are). */
    pendientes(): number { return cola.length + (enCurso ? 1 : 0); },
    /** For checks and the profile: models prepared, batches, failures, shown without waiting, ms per batch. */
    estado() { return { preparados, lotes, fallos, sinEsperar, enCola: cola.length, msTotal: Math.round(msTotal), msPeor: Math.round(msPeor), paralelo: o.paralelo() }; },
  };
}
export type Precompilador = ReturnType<typeof crearPrecompilador>;

// MIS-200 (t_fb2f9e37): what only shows in VR (the rig with its panels, the comfort vignette, the note, the watch, the menu,
// the hands) is hidden on desktop, so the warm-up above never saw it and its programs linked inside the first VR frame
// (200-860 ms measured on IWER, 2-12 new programs). Here each such object is compiled while HIDDEN: for the synchronous part of
// `compileAsync` (the projection three does before its first await) every node of the subtree is forced visible and uncullable,
// then put back exactly as it was. Nothing is drawn: no render call happens, only the programs get linked.
export type NodoOculto = { traverse(f: (o: NodoOculto) => void): void; visible: boolean; frustumCulled?: boolean };

/** Compile `objs` (possibly invisible) with `compilar` (renderer.compileAsync bound to the camera and scene). Never throws; resolves when all are linked. */
export function calentarOcultos(objs: (NodoOculto | null | undefined)[], compilar: (o: NodoOculto) => Promise<unknown>): Promise<number> {
  const pendientes: Promise<unknown>[] = [];
  for (const obj of objs) {
    if (!obj) continue;
    const antes: [NodoOculto, boolean, boolean | undefined][] = [];
    obj.traverse((x) => { antes.push([x, x.visible, x.frustumCulled]); x.visible = true; if (x.frustumCulled) x.frustumCulled = false; });
    try { pendientes.push(Promise.resolve(compilar(obj)).catch(() => {})); } catch { /* a lost device: warming is best effort */ }
    for (const [x, v, c] of antes) { x.visible = v; if (c !== undefined) x.frustumCulled = c; } // projection already happened inside the call
  }
  return Promise.all(pendientes).then(() => pendientes.length);
}
