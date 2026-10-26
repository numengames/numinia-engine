// World scripts (M20): the `main.ts` of an app runs here, in an SES compartment inside a worker thread.
//  - sees only the public `app` object (on/off/log/emit): no `process`, no files, no network, no `require`;
//  - every call has a CPU budget (`topeMs`); past it the worker is killed and the overrun is reported;
//  - the heap is capped (`memoriaMb`); running out kills only the script, never the world;
//  - `recargar` swaps the code with no world restart (hot reload; the caller decides who may ask for it).
// Copies: Hyperfy 2 `Apps.js` (public API object) and SES/Endo (Compartment); changes: a worker thread per script
// so a runaway loop can be cut, which Hyperfy's in-thread eval cannot do.
import { Worker } from "node:worker_threads";

export type Motivo = "cpu" | "memoria" | "error" | "cerrado";
export type Resultado = { ok: true; valor: unknown; atendido: boolean } | { ok: false; motivo: Motivo; detalle: string };
export interface OpcionesGuion {
  topeMs?: number; topeCargaMs?: number; memoriaMb?: number;
  alRegistrar?: (texto: string) => void;
  alEmitir?: (nombre: string, datos: unknown) => void;
  /** Called on every cut or crash, so the world can tell its admins. */
  alInforme?: (motivo: Motivo, detalle: string) => void;
}

type Pendiente = { resolver: (r: Resultado) => void; reloj: NodeJS.Timeout };

export class Guion {
  readonly topeMs: number; readonly topeCargaMs: number; readonly memoriaMb: number;
  /** +1 on every load or reload, so callers can tell which code answered. */
  version = 0;
  /** Times the script was cut for using too much CPU (OpenMetrics: numinia_guion_cortes_total{motivo="cpu"}). */
  cortes: Record<"cpu" | "memoria" | "error", number> = { cpu: 0, memoria: 0, error: 0 };
  private codigo = "";
  private trabajador: Worker | null = null;
  private listo: Promise<Resultado> | null = null;
  private pendientes = new Map<number, Pendiente>();
  private siguienteId = 1;
  private cerrado = false;

  private readonly op: OpcionesGuion;
  constructor(op: OpcionesGuion = {}) {
    this.op = op;
    this.topeMs = op.topeMs ?? 50; this.topeCargaMs = op.topeCargaMs ?? 500; this.memoriaMb = op.memoriaMb ?? 64;
  }

  /** Load (or replace) the script. Resolves once its top level has run. */
  async cargar(codigo: string): Promise<Resultado> {
    this.codigo = codigo; this.version++;
    this.matar("cerrado", "recargado");
    return this.arrancar();
  }
  recargar(codigo: string): Promise<Resultado> { return this.cargar(codigo); }

  /** Run the script's handler for `nombre`. Never throws: a bad script answers `{ ok: false }`. */
  async lanzar(nombre: string, datos: unknown = null): Promise<Resultado> {
    if (this.cerrado) return { ok: false, motivo: "cerrado", detalle: "closed" };
    if (!this.trabajador) { const r = await this.arrancar(); if (!r.ok) return r; }
    else if (this.listo) { const r = await this.listo; if (!r.ok) return r; }
    const w = this.trabajador;
    if (!w) return { ok: false, motivo: "error", detalle: "no worker" };
    const id = this.siguienteId++;
    return new Promise<Resultado>((resolver) => {
      const reloj = setTimeout(() => this.cortar("cpu", `over ${this.topeMs} ms in «${nombre}»`), this.topeMs);
      this.pendientes.set(id, { resolver, reloj });
      try { w.postMessage({ t: "evento", id, nombre, datos }); }
      catch (e) { this.terminarPendiente(id, { ok: false, motivo: "error", detalle: "payload not cloneable: " + (e as Error).message }); }
    });
  }

  cerrar(): void { this.cerrado = true; this.matar("cerrado", "closed"); }

  private arrancar(): Promise<Resultado> {
    const w = new Worker(new URL("./guion-trabajador.ts", import.meta.url), {
      resourceLimits: { maxOldGenerationSizeMb: this.memoriaMb, maxYoungGenerationSizeMb: 8 }, env: {}, stdout: false, stderr: false,
    });
    this.trabajador = w;
    w.on("message", (m: { t: string; id?: number; valor?: unknown; atendido?: boolean; detalle?: string; texto?: string; nombre?: string; datos?: unknown }) => {
      if (w !== this.trabajador) return;
      if (m.t === "log") this.op.alRegistrar?.(m.texto ?? "");
      else if (m.t === "emitir") this.op.alEmitir?.(m.nombre ?? "", m.datos);
      else if (m.t === "fin") this.terminarPendiente(m.id!, { ok: true, valor: m.valor, atendido: !!m.atendido });
      else if (m.t === "fallo" && m.id) { this.cortes.error++; this.op.alInforme?.("error", m.detalle ?? ""); this.terminarPendiente(m.id, { ok: false, motivo: "error", detalle: m.detalle ?? "" }); }
    });
    w.on("error", (e: Error & { code?: string }) => {
      if (w !== this.trabajador) return;
      this.cortar(e.code === "ERR_WORKER_OUT_OF_MEMORY" ? "memoria" : "error", e.message);
    });
    this.listo = new Promise<Resultado>((resolver) => {
      const reloj = setTimeout(() => this.cortar("cpu", `top level over ${this.topeCargaMs} ms`), this.topeCargaMs);
      const id = 0;
      this.pendientes.set(id, { resolver: (r) => { this.listo = null; resolver(r); }, reloj });
      w.on("message", (m: { t: string; detalle?: string }) => {
        if (w !== this.trabajador) return;
        if (m.t === "listo") this.terminarPendiente(id, { ok: true, valor: null, atendido: true });
        else if (m.t === "fallo" && !this.listo) return;
        else if (m.t === "fallo") { this.cortes.error++; this.op.alInforme?.("error", m.detalle ?? ""); this.terminarPendiente(id, { ok: false, motivo: "error", detalle: m.detalle ?? "" }); this.matar("cerrado", "load failed"); }
      });
      w.postMessage({ t: "cargar", codigo: this.codigo });
    });
    return this.listo;
  }

  private terminarPendiente(id: number, r: Resultado): void {
    const p = this.pendientes.get(id); if (!p) return;
    clearTimeout(p.reloj); this.pendientes.delete(id); p.resolver(r);
  }
  /** Kill the worker, report why, and answer everything waiting. The next `lanzar` starts a fresh one. */
  private cortar(motivo: "cpu" | "memoria" | "error", detalle: string): void {
    this.cortes[motivo]++; this.op.alInforme?.(motivo, detalle);
    this.matar(motivo, detalle);
  }
  private matar(motivo: Motivo, detalle: string): void {
    const w = this.trabajador; this.trabajador = null; this.listo = null;
    for (const id of [...this.pendientes.keys()]) this.terminarPendiente(id, { ok: false, motivo, detalle });
    if (w) void w.terminate();
  }
}
