// buzon-llamadas (ia-llamar S12/S13) — what the bridge keeps of the world's «llamar» and «burbuja» events for the brain.
// The server (features/llamar, features/burbuja) decides who calls an AI and who stands in its bubble, and tells the AI's own page:
//   llamar.llamada {ia, quien, nombre, texto, modo, t}          → a mailbox: the last 20 calls of the last 10 minutes
//   burbuja.entraEnBurbuja / saleDeBurbuja {ia, quien, nombre…} → who is inside now (`dentro`) and who came in since the brain last looked
// The brain reads the mailbox with `llamadas` (pending calls, each read once) and waits for news with `esperar_llamada` (up to 25 s,
// back at once when a call or a bubble entry arrives). Pure: no I/O, no Node import (it bundles into the Worker), a clock and the global
// setTimeout. Names and texts are other people's words (STD-050): they stay raw here and the tools put them inside one <material> fence.
import type { Msg } from "../../feature/src/index.ts";

export const BUZON_MAX = 20;                     // calls kept (the same cap as the server's mailbox)
export const BUZON_TTL_MS = 10 * 60_000;         // …for ten minutes
export const ESPERA_LLAMADA_MAX_S = 25;          // `esperar_llamada` never waits longer: a brain's tool call must come back
export const MODOS_LLAMADA = ["nombre", "barra", "boton", "frase"] as const;
export type ModoLlamada = (typeof MODOS_LLAMADA)[number];

export type LlamadaRecibida = { n: number; quien: number; nombre: string; texto: string; modo: ModoLlamada; tick: number; ms: number; leida: boolean };
export type EntradaBurbuja = { n: number; quien: number; nombre: string; esIA: boolean; distanciaDm: number; ms: number; leida: boolean };
export type Novedades = { llamadas: LlamadaRecibida[]; entradas: EntradaBurbuja[] };
/** How `esperar` ended: something arrived, the time ran out, or the bridge stopped. */
export type FinEspera = "novedad" | "tiempo" | "parada";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const modoDe = (v: unknown): ModoLlamada => ((MODOS_LLAMADA as readonly string[]).includes(String(v)) ? (v as ModoLlamada) : "nombre");

export class BuzonLlamadas {
  /** Calls and bubble entries still in the box (read ones stay until they are old or pushed out, so a late `llamadas` can still count them). */
  readonly llamadas: LlamadaRecibida[] = [];
  readonly entradas: EntradaBurbuja[] = [];
  /** Who is inside this AI's bubble now (entity → what the server told when they came in). */
  readonly dentro = new Map<number, { nombre: string; esIA: boolean; distanciaDm: number }>();
  private n = 0;
  private parado = false;
  private readonly ahora: () => number;
  private readonly despertadores = new Set<() => void>();

  constructor(ahora: () => number = Date.now) { this.ahora = ahora; }

  /** The event `llamar.llamada`, as the server sent it to this AI. */
  llamada(m: Msg): void {
    this.caducar();
    this.llamadas.push({ n: ++this.n, quien: num(m.quien), nombre: String(m.nombre ?? ""), texto: String(m.texto ?? ""), modo: modoDe(m.modo), tick: num(m.t), ms: this.ahora(), leida: false });
    if (this.llamadas.length > BUZON_MAX) this.llamadas.shift();
    this.despertar();
  }
  /** The event `burbuja.entraEnBurbuja`. */
  entra(m: Msg): void {
    this.caducar();
    const quien = num(m.quien), nombre = String(m.nombre ?? ""), esIA = m.esIA === true, distanciaDm = num(m.distanciaDm);
    this.dentro.set(quien, { nombre, esIA, distanciaDm });
    const i = this.entradas.findIndex((e) => e.quien === quien && !e.leida);
    if (i >= 0) this.entradas.splice(i, 1); // an edge that blinks is one news item, not three
    this.entradas.push({ n: ++this.n, quien, nombre, esIA, distanciaDm, ms: this.ahora(), leida: false });
    if (this.entradas.length > BUZON_MAX) this.entradas.shift();
    this.despertar();
  }
  /** The event `burbuja.saleDeBurbuja`: no longer inside (it is not news that wakes anyone). */
  sale(m: Msg): void { this.dentro.delete(num(m.quien)); }

  /** A new connection: nobody is known to be inside yet (the server says again who is). Calls already received stay. */
  reiniciarBurbuja(): void { this.dentro.clear(); }

  /** Calls and entries not read yet, oldest first (still within ten minutes). */
  pendientes(): Novedades {
    this.caducar();
    return { llamadas: this.llamadas.filter((x) => !x.leida), entradas: this.entradas.filter((x) => !x.leida) };
  }
  hay(): boolean { const p = this.pendientes(); return p.llamadas.length > 0 || p.entradas.length > 0; }
  /** The pending ones, marked as read: the next `leer` brings only what came after. `conEntradas` false = only the calls (the tool
   * `llamadas`); the bubble entries stay unread for `esperar_llamada`, which is the one that reports them. */
  leer(conEntradas = true): Novedades {
    const p = this.pendientes();
    for (const x of p.llamadas) x.leida = true;
    if (!conEntradas) return { llamadas: p.llamadas, entradas: [] };
    for (const x of p.entradas) x.leida = true;
    return p;
  }

  /** Waits up to `segundos` (1..25) for something unread; at once if there already is. Never rejects and holds nothing else back. */
  esperar(segundos: number): Promise<FinEspera> {
    if (this.parado) return Promise.resolve("parada");
    if (this.hay()) return Promise.resolve("novedad");
    const s = Number.isFinite(segundos) ? Math.min(ESPERA_LLAMADA_MAX_S, Math.max(1, Math.round(segundos))) : ESPERA_LLAMADA_MAX_S;
    return new Promise((ok) => {
      let reloj: ReturnType<typeof setTimeout> | null = null;
      const fin = (como: FinEspera) => { if (reloj) clearTimeout(reloj); this.despertadores.delete(despertador); ok(como); };
      const despertador = () => fin(this.parado ? "parada" : "novedad");
      this.despertadores.add(despertador);
      reloj = setTimeout(() => fin("tiempo"), s * 1000);
      reloj.unref?.();
    });
  }
  /** The bridge stops: every wait ends now. */
  parar(): void { this.parado = true; this.despertar(); }

  private despertar(): void { for (const d of [...this.despertadores]) d(); }
  private caducar(): void {
    const t = this.ahora();
    while (this.llamadas.length && t - this.llamadas[0].ms > BUZON_TTL_MS) this.llamadas.shift();
    while (this.entradas.length && t - this.entradas[0].ms > BUZON_TTL_MS) this.entradas.shift();
  }
}
