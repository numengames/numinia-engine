// sesiones (T1): how each player entered and how it went — device, browser, graphics backend, XR, frames, ping,
// battery — so we learn from real phones and headsets. The page sends REPORT messages (net); this file keeps
// only the keys it knows, writes one JSON line per report to <dir>/sesiones-YYYY-MM-DD.jsonl (UTC days) and
// deletes files older than KEEP_DAYS. No IP and no identity: the session id is made here and means nothing
// outside this server. A connection that never reports (bots, swarm) writes nothing.
import { appendFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

export const KEEP_DAYS = 14;
export const MAX_REPORTS_PER_SESSION = 600;    // a 10 s pulse for ~90 min, plus extras
export const MAX_ERRORS_WRITTEN = 10;          // per session
export const MAX_DAY_BYTES = 50 * 1024 * 1024; // one day's file stops growing past this
export const TEXT_MAX = 160;
export const CONTEO_MAX = 1_000_000;

type Kind = "texto" | "numero" | "bool" | "conteo"; // conteo: a whole number, 0..CONTEO_MAX
export type Shape = { [key: string]: Kind | Shape };
export type Rec = Record<string, unknown>;

const BATERIA: Shape = { nivel: "numero", cargando: "bool" };
const P: Shape = { p50: "numero", p99: "numero", peor: "numero" };
const P2: Shape = { p50: "numero", peor: "numero" };
/** What a page may report. Anything else is dropped. Spanish keys: people and agents read these files. */
export const SHAPES: Record<string, Shape> = {
  /** once, after the first frame: the device and how long it took to enter */
  entrada: {
    clase: "texto", aparato: "texto", sistema: "texto", navegador: "texto", ua: "texto",
    backend: "texto", gpu: "texto", nucleos: "numero", memoriaGB: "numero", pantalla: "texto", dpr: "numero",
    tactil: "bool", punteroGrueso: "bool", xr: { vr: "bool", ar: "bool" }, red: "texto", ahorroDatos: "bool",
    bateria: BATERIA, preferencias: { menosMovimiento: "bool", masContraste: "bool", oscuro: "bool" }, idioma: "texto",
    tiempos: { bienvenidaMs: "numero", primerCuadroMs: "numero", huellaMs: "numero" }, huellaIgual: "bool",
    origen: "texto", motorPagina: "texto",
  },
  /** every ~10 s: how it is going */
  pulso: {
    modo: "texto", cuadros: "numero", cuadroMs: P, perdidos: "numero", objetivoFps: "numero", hzXR: "numero",
    costeMs: P, escala: "numero", modoBateria: "bool", rttMs: "numero", correcciones: "numero", visibles: "numero",
    oculta: "bool", bateria: BATERIA, errores: "numero", memoriaMB: "numero",
    // B5 (all optional; an old page sends none of them): stalls the window above hides, and what the GPU was asked
    largos: "conteo", congelado: { n: "conteo", ms: "numero", peor: "numero" }, dc: P2, kTri: P2,
    programas: "conteo", programasNuevos: "conteo", cambiosRes: "conteo", ratio: "numero",
    loaf: { n: "conteo", bloqMs: "numero", peorMs: "numero" },
  },
  /** entering or leaving VR/AR, or failing to */
  xr: { modo: "texto", accion: "texto", detalle: "texto" },
  /** an uncaught error in the page */
  error: { mensaje: "texto", donde: "texto" },
};

const CONTROL = /[\u0000-\u001f\u007f]/g;
/** Keep only the keys of `shape` with the right type; texts cut to TEXT_MAX, numbers finite and rounded. */
export function limpiar(shape: Shape, raw: unknown): Rec {
  const out: Rec = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, kind] of Object.entries(shape)) {
    const v = (raw as Rec)[k];
    if (v === undefined || v === null) continue;
    if (typeof kind === "object") { const o = limpiar(kind, v); if (Object.keys(o).length) out[k] = o; }
    else if (kind === "texto" && typeof v === "string") { const t = v.replace(CONTROL, " ").trim().slice(0, TEXT_MAX); if (t) out[k] = t; }
    else if (kind === "numero" && typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(Math.max(-1e7, Math.min(1e7, v)) * 100) / 100;
    else if (kind === "bool" && typeof v === "boolean") out[k] = v;
    else if (kind === "conteo" && typeof v === "number" && Number.isInteger(v) && v >= 0) out[k] = Math.min(v, CONTEO_MAX);
  }
  return out;
}

/** B5: what the pulses of one session add up to (written in its `sale` line and summed by resumen()). */
export type Totales = { pulsos: number; congelaciones: number; congeladoMs: number; congeladoPeorMs: number; largos: number; cambiosRes: number; loaf: number; programasMax: number };
const totalesVacios = (): Totales => ({ pulsos: 0, congelaciones: 0, congeladoMs: 0, congeladoPeorMs: 0, largos: 0, cambiosRes: 0, loaf: 0, programasMax: 0 });
function sumar(t: Totales, p: Rec): void {
  const n = (x: unknown) => (typeof x === "number" ? x : 0);
  const c = (p.congelado ?? {}) as Rec;
  t.pulsos++; t.congelaciones += n(c.n); t.congeladoMs += n(c.ms); t.congeladoPeorMs = Math.max(t.congeladoPeorMs, n(c.peor));
  t.largos += n(p.largos); t.cambiosRes += n(p.cambiosRes); t.loaf += n((p.loaf as Rec | undefined)?.n); t.programasMax = Math.max(t.programasMax, n(p.programas));
}

type Viva = { id: string; inicio: number; informes: number; errores: number; entrada?: Rec; pulso?: Rec; xr: string[]; totales: Totales };
export type SesionesOpts = { dir: string | null; log?: (line: string) => void; now?: () => number };
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class Sesiones {
  readonly dir: string | null;
  readonly stats = { informes: 0, descartados: 0, lineas: 0, sesionesConInforme: 0, fallosDeEscritura: 0 };
  private readonly vivas = new Map<number, Viva>();
  private readonly log: (l: string) => void;
  private readonly now: () => number;
  private buffer: string[] = [];
  private bytesHoy = 0;
  private hoy = "";
  private writing: Promise<void> = Promise.resolve();
  private warned = false;

  constructor(o: SesionesOpts) {
    this.dir = o.dir; this.log = o.log ?? (() => {}); this.now = o.now ?? Date.now;
  }

  /** A connection opened (call right after the instance spawns its avatar). */
  abrir(entity: number): void {
    const t = this.now();
    this.vivas.set(entity, { id: `s${t.toString(36)}${entity.toString(36)}`, inicio: t, informes: 0, errores: 0, xr: [], totales: totalesVacios() });
  }

  /** A REPORT from that connection. Returns false when it is dropped (unknown kind, too many, second `entrada`). */
  informe(entity: number, raw: Rec): boolean {
    const v = this.vivas.get(entity);
    const k = typeof raw.k === "string" ? raw.k : "";
    const shape = SHAPES[k];
    if (!v || !shape || v.informes >= MAX_REPORTS_PER_SESSION || (k === "entrada" && v.entrada)) { this.stats.descartados++; return false; }
    const datos = limpiar(shape, raw);
    if (v.informes === 0) this.stats.sesionesConInforme++;
    v.informes++; this.stats.informes++;
    if (k === "entrada") v.entrada = datos;
    else if (k === "pulso") { v.pulso = datos; sumar(v.totales, datos); }
    else if (k === "xr") { if (v.xr.length < 20) v.xr.push(`${datos.modo ?? "?"}:${datos.accion ?? "?"}`); }
    else if (k === "error" && ++v.errores > MAX_ERRORS_WRITTEN) return true; // counted, not written
    this.escribir({ t: new Date(this.now()).toISOString(), sesion: v.id, k, ...datos });
    return true;
  }

  /** The connection closed. Writes a closing line only for sessions that reported something. */
  cerrar(entity: number, servidor: Rec = {}): void {
    const v = this.vivas.get(entity);
    if (!v) return;
    this.vivas.delete(entity);
    if (v.informes === 0) return;
    this.escribir({ t: new Date(this.now()).toISOString(), sesion: v.id, k: "sale", duracionS: Math.round((this.now() - v.inicio) / 1000), informes: v.informes, errores: v.errores, xr: v.xr, ...(v.totales.pulsos ? { cliente: { ...v.totales } } : {}), ...servidor });
  }

  /** Who is connected now and what they last said (GET /sesiones). */
  ahora(): Rec[] {
    const t = this.now(), out: Rec[] = [];
    for (const v of this.vivas.values()) if (v.informes > 0) out.push({ sesion: v.id, desdeS: Math.round((t - v.inicio) / 1000), entrada: v.entrada ?? null, pulso: v.pulso ?? null, xr: v.xr });
    return out;
  }

  /** Counts over the connected sessions that reported (by class, browser, backend, mode). */
  resumen(): Rec {
    const by = (f: (v: Viva) => unknown) => {
      const m: Record<string, number> = {};
      for (const v of this.vivas.values()) if (v.informes > 0) { const key = String(f(v) ?? "¿?"); m[key] = (m[key] ?? 0) + 1; }
      return m;
    };
    let sin = 0;
    const cliente = { ...totalesVacios(), sesionesConCongelacion: 0 };
    for (const v of this.vivas.values()) {
      if (v.informes === 0) { sin++; continue; }
      const t = v.totales;
      cliente.pulsos += t.pulsos; cliente.congelaciones += t.congelaciones; cliente.congeladoMs += t.congeladoMs; cliente.largos += t.largos;
      cliente.cambiosRes += t.cambiosRes; cliente.loaf += t.loaf;
      cliente.congeladoPeorMs = Math.max(cliente.congeladoPeorMs, t.congeladoPeorMs); cliente.programasMax = Math.max(cliente.programasMax, t.programasMax);
      if (t.congelaciones) cliente.sesionesConCongelacion++;
    }
    return {
      conInforme: this.vivas.size - sin, sinInforme: sin,
      porClase: by((v) => v.entrada?.clase), porNavegador: by((v) => String(v.entrada?.navegador ?? "¿?").split(" ")[0]),
      porBackend: by((v) => v.entrada?.backend), porModo: by((v) => v.pulso?.modo ?? "plano"),
      cliente, // B5: summed over the connected sessions since each one connected
      totales: { ...this.stats },
    };
  }

  private escribir(rec: Rec): void {
    if (!this.dir) return;
    this.buffer.push(JSON.stringify(rec));
    if (this.buffer.length >= 200) void this.vaciar();
  }

  /** Write what is waiting (the server calls it every second and on close). Never throws. */
  vaciar(): Promise<void> {
    if (!this.dir || this.buffer.length === 0) return this.writing;
    const lines = this.buffer; this.buffer = [];
    const dir = this.dir;
    this.writing = this.writing.then(async () => {
      try {
        const d = day(this.now());
        if (d !== this.hoy) { this.hoy = d; this.bytesHoy = 0; await mkdir(dir, { recursive: true }); await this.purgar(); }
        const text = lines.join("\n") + "\n";
        if (this.bytesHoy + text.length > MAX_DAY_BYTES) { if (!this.warned) { this.warned = true; this.log(`[sesiones] el fichero de hoy pasa de ${MAX_DAY_BYTES} bytes: dejo de escribir hasta mañana`); } return; }
        await appendFile(join(dir, `sesiones-${d}.jsonl`), text);
        this.bytesHoy += text.length; this.stats.lineas += lines.length;
      } catch (e) {
        this.stats.fallosDeEscritura++;
        if (!this.warned) { this.warned = true; this.log(`[sesiones] no puedo escribir en ${dir}: ${String((e as Error)?.message ?? e)} (sigo sin guardar)`); }
      }
    });
    return this.writing;
  }

  /** Delete day files older than KEEP_DAYS (by the date in their name). */
  async purgar(): Promise<number> {
    if (!this.dir) return 0;
    const limit = day(this.now() - KEEP_DAYS * 86_400_000);
    let n = 0;
    try {
      for (const f of await readdir(this.dir)) {
        const m = /^sesiones-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
        if (m && m[1] < limit) { await unlink(join(this.dir, f)); n++; }
      }
    } catch { /* no folder yet */ }
    return n;
  }
}
