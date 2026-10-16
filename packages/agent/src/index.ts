// agent (P4): an AI inhabitant's BODY. It is a player like any other: it enters through the same protocol
// (ClientSession over any Transport), walks with inputs the server checks, speaks through the chat feature and
// gestures through the gestures feature — all as intents of the catalog, so the server's rate caps and permissions
// apply to it exactly as to a person. No LLM here and no decision: the script (guion.ts) or, later, a brain (P5)
// drives it. Its senses are what a player's page has: who is near (the snapshot), their names (chat), what they
// say (chat) and the cards of the things around (V1). Everything people write is UNTRUSTED (STD-050).
import { ClientSession } from "../../client/src/index.ts";
import { encodePase } from "../../net/src/index.ts";
import type { Transport } from "../../net/src/index.ts";
import type { Msg, CardView } from "../../feature/src/index.ts";
import { MARCA_IA } from "../../instance/src/identidad.ts";
import { BTN_RUN, STICK_MAX } from "../../sim/src/index.ts";

export const LLEGADO_M = 0.6;   // a walk ends this close to its point
export const CORRER_M = 12;     // farther than this it runs (8 m/s instead of 4)
export const OIR_MAX = 16;      // what it heard, kept for its senses (the newest last)

export type Meta = { tipo: "ir"; x: number; z: number } | { tipo: "seguir"; entidad: number; distancia: number } | null;
export type Oido = { quien: number; nombre: string; texto: string; tick: number; canal: "cerca" | "zona" };
export type Cercano = { entidad: number; nombre: string | null; ia: boolean; x: number; z: number; distancia: number };

/** Is this a name the server gave to an AI? (MARCA_IA is put by the server; a person cannot choose it.) */
export const esIA = (nombre: string | null | undefined): boolean => !!nombre && nombre.endsWith(MARCA_IA);

export class Cuerpo {
  readonly s: ClientSession;
  meta: Meta = null;
  readonly nombres = new Map<number, string>(); // who its page would name (chat «nombre»: within 24 m)
  readonly oido: Oido[] = [];
  private readonly oyentes: ((o: Oido) => void)[] = [];
  private ticks = 0;

  /** `ticket`: its agent ticket (identidad.ts emitirAgente), shown on joining like a guest shows its token. */
  constructor(t: Transport, ticket: string, pase?: string) {
    this.s = new ClientSession(t, { identity: { load: () => ticket, save: () => {} }, pase: pase ?? null });
    this.s.features.tap((feature, event, msg) => this.evento(feature, event, msg));
  }

  get entidad(): number { return this.s.entity; }
  /** ia-organizacion: a fresh numinia.com pass in mid-session (PASE, type 12): the world renews how long it lives and its permissions. */
  renovarPase(pase: string): boolean {
    const b = encodePase(pase);
    if (!b) return false;
    this.s.t.send(b, true);
    return true;
  }
  /** The name the server gave it (with « · IA»), once it answered. */
  get nombre(): string | null { return this.s.who?.nombre ?? null; }
  /** Ticks of this body's own clock (20 Hz, one per paso()). */
  get tick(): number { return this.ticks; }
  dentro(): boolean { return this.s.entity >= 0 && !!this.s.features.catalog; }

  // ---------- verbs (each one is what a person can do; none skips a check) ----------
  irA(x: number, z: number): void { this.meta = { tipo: "ir", x, z }; }
  seguir(entidad: number, distancia = 2): void { this.meta = { tipo: "seguir", entidad, distancia }; }
  parar(): void { this.meta = null; }
  decir(texto: string, canal: "cerca" | "zona" = "cerca") { return this.s.features.send("chat", canal === "cerca" ? "decir" : "decirZona", { texto }); }
  gesto(gesto: string) { return this.s.features.send("gestos", "hacer", { gesto }); }
  /** Any verb of the catalog (what `npm run describe -- --catalogo` lists); the server validates and rate-limits it. */
  hacer(funcion: string, verbo: string, msg: Msg) { return this.s.features.send(funcion, verbo, msg); }

  // ---------- senses ----------
  posicion(): { x: number; z: number } { const p = this.s.selfPosition(1); return { x: p.x, z: p.z }; }
  /** Who is around (from its own snapshots, like a page), nearest first. */
  cercanos(radio = 20): Cercano[] {
    const me = this.posicion(), out: Cercano[] = [];
    for (const r of this.s.remotePositions()) {
      const d = Math.hypot(r.x - me.x, r.z - me.z);
      if (d > radio) continue;
      const nombre = this.nombres.get(r.id) ?? null;
      out.push({ entidad: r.id, nombre, ia: esIA(nombre), x: r.x, z: r.z, distancia: d });
    }
    return out.sort((a, b) => a.distancia - b.distancia || a.entidad - b.entidad);
  }
  /** Things of the world with a card (V1), as a screen reader lists them. */
  cosas(radio = 20): (CardView & { distancia: number })[] {
    const me = this.posicion();
    return this.s.features.cards().filter((c) => c.at).map((c) => ({ ...c, distancia: Math.hypot(c.at!.x - me.x, c.at!.z - me.z) }))
      .filter((c) => c.distancia <= radio).sort((a, b) => a.distancia - b.distancia);
  }
  /** Something said near it or to the zone (not by itself). */
  alOir(fn: (o: Oido) => void): void { this.oyentes.push(fn); }

  /** What it perceives, as text for a reader or a brain. People's names and words go ONLY inside <material>, never
   * in the lines above it (STD-050 AGW-002): the brain of P5 puts this block before the last message. */
  sentidos(radio = 20): string {
    const me = this.posicion(), f = (v: number) => v.toFixed(1);
    const gente = this.cercanos(radio), cosas = this.cosas(radio);
    const lineas = [
      `Eres ${this.nombre ?? "(sin nombre aún)"}, en x ${f(me.x)} z ${f(me.z)}. ${this.meta ? (this.meta.tipo === "ir" ? `Vas a x ${f(this.meta.x)} z ${f(this.meta.z)}.` : `Sigues a la entidad ${this.meta.entidad}.`) : "No vas a ningún sitio."}`,
      `Cerca (≤ ${radio} m): ${gente.length} ${gente.length === 1 ? "figura" : "figuras"}; cosas con ficha: ${cosas.length}.`,
      "<material>",
      ...gente.map((g) => `- entidad ${g.entidad}${g.nombre ? ` «${limpia(g.nombre)}»` : ""}${g.ia ? " (IA)" : ""} a ${f(g.distancia)} m`),
      ...cosas.map((c) => `- cosa «${limpia(c.name)}» (${c.role}) a ${f(c.distancia)} m`),
      ...this.oido.slice(-6).map((o) => `- ${limpia(o.nombre)} dijo${o.canal === "zona" ? " a la zona" : ""}: «${limpia(o.texto)}»`),
      "</material>",
    ];
    return lineas.join("\n");
  }

  // ---------- the body's clock ----------
  /** One tick (20 Hz): steer towards its goal and send the input, like a page does with the stick. */
  paso(): void {
    this.t();
    this.ticks++;
    if (this.s.entity < 0) return;
    let mx = 0, mz = 0, run = false;
    const me = this.posicion();
    let to: { x: number; z: number; stop: number } | null = null;
    if (this.meta?.tipo === "ir") to = { x: this.meta.x, z: this.meta.z, stop: LLEGADO_M };
    else if (this.meta?.tipo === "seguir") {
      const id = this.meta.entidad, o = this.s.remotePositions().find((r) => r.id === id);
      if (o) to = { x: o.x, z: o.z, stop: this.meta.distancia };
    }
    if (to) {
      const dx = to.x - me.x, dz = to.z - me.z, d = Math.hypot(dx, dz);
      if (d > to.stop) {
        mx = Math.round((dx / d) * STICK_MAX); mz = Math.round((dz / d) * STICK_MAX);
        run = d > CORRER_M;
      } else if (this.meta?.tipo === "ir") this.meta = null; // arrived
    }
    this.s.tick(mx, mz, run ? BTN_RUN : 0);
  }
  /** Has it reached where it was walking to? */
  llegado(): boolean { return this.meta === null; }

  private t(): void { (this.s.t as Transport & { flush?: () => void }).flush?.(); }

  private evento(feature: string, event: string, msg: Msg): void {
    if (feature !== "chat") return;
    const quien = Number(msg.quien);
    if (event === "nombre") { if (msg.nombre) this.nombres.set(quien, String(msg.nombre)); else this.nombres.delete(quien); return; }
    if (event !== "dicho" && event !== "zona") return;
    if (msg.nombre) this.nombres.set(quien, String(msg.nombre));
    if (quien === this.s.entity) return; // its own words come back too
    const o: Oido = { quien, nombre: String(msg.nombre ?? ""), texto: String(msg.texto ?? ""), tick: this.ticks, canal: event === "zona" ? "zona" : "cerca" };
    this.oido.push(o); if (this.oido.length > OIR_MAX) this.oido.shift();
    for (const fn of this.oyentes) fn(o);
  }
}

/** Untrusted text inside <material>: one line, and nothing that could close or open the fence (AGW-004). */
export const limpia = (t: string): string => String(t).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/<\/?\s*material\s*>/gi, "[material]").replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›")).slice(0, 200);
