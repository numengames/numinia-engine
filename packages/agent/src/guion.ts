// guion (P4, escalón E0): what an inhabitant does with NO language model. All policy is here, in code (SABER §3.5,
// STD-050 AGW-006/012/013): it walks its route; greets whoever comes near (once per person per `saludo.cada`);
// answers only when called by its name; short orders («sígueme», «quieta», «pasea», «saluda», «baila») are decided
// here; it never answers another AI (loops between agents were the first failures of others: note 08 §3.9) and never
// speaks more than once every 2 s. A brain (P5) will only phrase what this skeleton allows.
import { Cuerpo, esIA } from "./index.ts";
import type { Oido } from "./index.ts";
import type { Habitante } from "./formato.ts";
import { MARCA_IA } from "../../instance/src/identidad.ts";

export const HZ = 20;
export const HABLAR_CADA_TICKS = 2 * HZ;       // its own messages: at most one every 2 s
export const SALUDAR_CADA_TICKS = 3 * HZ;      // greetings: at most one every 3 s (a crowd arriving is not a flood)
export const MIRAR_CADA_TICKS = HZ / 2;        // who is near is reviewed twice a second
export const SEGUIR_MAX_TICKS = 3 * 60 * HZ;   // it follows someone 3 min at most, then goes back to its walk
export const PERDIDO_TICKS = 5 * HZ;           // the one it follows out of sight for 5 s: back to its walk
export const ORDEN_MAX_PALABRAS = 6;           // a short order (AGW-013); longer is conversation

export type Modo = "pasear" | "seguir" | "quieta";

/** Lower case, no accents, only letters and digits separated by single spaces. */
export const normal = (t: string): string => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim();
const tiene = (frase: string, palabra: string) => ` ${frase} `.includes(` ${palabra} `);

const ORDENES: { modo: Modo | "saludar" | "bailar"; palabras: string[] }[] = [
  { modo: "seguir", palabras: ["sigueme", "ven", "acompaname", "ven conmigo"] },
  { modo: "quieta", palabras: ["quieta", "quieto", "espera", "alto", "detente", "quedate"] }, // never «para»: it is a preposition (SABER §3.5)
  { modo: "pasear", palabras: ["pasea", "sigue paseando", "vuelve", "continua", "puedes irte"] },
  { modo: "saludar", palabras: ["saluda"] },
  { modo: "bailar", palabras: ["baila"] },
];

export class Guion {
  readonly c: Cuerpo;
  readonly h: Habitante;
  modo: Modo = "pasear";
  private punto = 0;
  private esperaHasta = 0;
  private habloEn = -1e9;
  private saludoEn = -1e9;
  private frase = 0;
  private siguiendo = { entidad: -1, desde: 0, vistoEn: 0 };
  private readonly saludados = new Map<string, number>(); // name -> tick greeted (names are what stays the same)
  private readonly llamada: string;
  readonly diario: string[] = [];                          // what it did and why (tests, and the service's log)

  constructor(c: Cuerpo, h: Habitante) {
    this.c = c; this.h = h;
    this.llamada = normal(h.nombre).split(" ")[0] ?? normal(h.id);
    c.alOir((o) => this.oir(o));
  }

  /** One tick: the body's step plus the script's decisions (cheap: no allocation on most ticks). */
  paso(): void {
    const t = this.c.tick;
    if (this.c.dentro()) {
      if (this.modo === "pasear") this.pasear(t);
      else if (this.modo === "seguir") this.vigilarSeguir(t);
      if (t % MIRAR_CADA_TICKS === 0) this.saludar(t);
    }
    this.c.paso();
  }

  private pasear(t: number): void {
    if (!this.c.llegado() || t < this.esperaHasta) return;
    const r = this.h.ruta, p = r[this.punto % r.length], me = this.c.posicion();
    if (Math.hypot(p.x - me.x, p.z - me.z) <= 0.8) { // here: wait, then the next point
      if (r.length === 1) return;
      this.punto = (this.punto + 1) % r.length;
      this.esperaHasta = t + Math.round(this.h.pausa * HZ);
      return;
    }
    this.c.irA(p.x, p.z);
  }

  private vigilarSeguir(t: number): void {
    const s = this.siguiendo, visto = this.c.cercanos(30).some((g) => g.entidad === s.entidad);
    if (visto) s.vistoEn = t;
    if (t - s.desde > SEGUIR_MAX_TICKS || t - s.vistoEn > PERDIDO_TICKS) { this.cambiar("pasear", t - s.desde > SEGUIR_MAX_TICKS ? "tres minutos siguiendo" : "le perdí de vista"); }
  }

  private saludar(t: number): void {
    if (t - this.saludoEn < SALUDAR_CADA_TICKS || t - this.habloEn < HABLAR_CADA_TICKS) return;
    const s = this.h.saludo;
    for (const g of this.c.cercanos(s.radio)) {
      if (!g.nombre || g.ia || /^Robot \d+$/.test(g.nombre)) continue; // people only: never another AI, never the load robots
      const antes = this.saludados.get(g.nombre);
      if (antes !== undefined && t - antes < s.cada * HZ) continue;
      this.saludados.set(g.nombre, t);
      this.saludoEn = t;
      this.hablar(s.frases[this.frase++ % s.frases.length], g.nombre, t, `saluda a ${g.entidad}`);
      if (s.gesto) this.c.gesto(s.gesto);
      return;
    }
  }

  private oir(o: Oido): void {
    if (esIA(o.nombre)) return; // never answers an AI: no loops between agents
    const texto = normal(o.texto);
    if (!tiene(texto, this.llamada)) return; // only when called by its name
    const t = this.c.tick, resto = texto.split(" ").filter((w) => w !== this.llamada);
    if (resto.length <= ORDEN_MAX_PALABRAS) {
      const frase = resto.join(" ");
      const orden = ORDENES.find((x) => x.palabras.some((p) => tiene(frase, p)));
      if (orden) { this.ordenar(orden.modo, o, t); return; }
    }
    const r = this.h.respuestas.find((x) => x.si.some((w) => tiene(texto, normal(w))));
    this.hablar(r ? r.dice : this.h.siNoEntiende, o.nombre, t, r ? `contesta «${r.si[0]}»` : "no entiende");
  }

  private ordenar(modo: Modo | "saludar" | "bailar", o: Oido, t: number): void {
    if (modo === "saludar" || modo === "bailar") { this.c.gesto(modo); this.diario.push(`${t} gesto ${modo} (orden de ${o.quien})`); return; }
    if (modo === "seguir") {
      this.siguiendo = { entidad: o.quien, desde: t, vistoEn: t };
      this.c.seguir(o.quien, 2);
      this.cambiar("seguir", `orden de ${o.quien}`);
      this.hablar("Voy contigo, {nombre}. Dime «quieta» o «pasea» cuando quieras.", o.nombre, t, "acepta seguir");
      return;
    }
    if (modo === "quieta") { this.c.parar(); this.cambiar("quieta", `orden de ${o.quien}`); this.hablar("Me quedo aquí.", o.nombre, t, "se queda"); return; }
    this.c.parar(); this.cambiar("pasear", `orden de ${o.quien}`); this.hablar("Vuelvo a mi paseo.", o.nombre, t, "vuelve a pasear");
  }

  private cambiar(modo: Modo, porque: string): void {
    if (modo !== "seguir" && this.modo === "seguir") this.c.parar();
    this.modo = modo; this.diario.push(`${this.c.tick} modo ${modo} (${porque})`);
  }

  private hablar(plantilla: string, nombre: string, t: number, porque: string): void {
    if (t - this.habloEn < HABLAR_CADA_TICKS) { this.diario.push(`${t} calla (habló hace menos de 2 s): ${porque}`); return; }
    const quien = nombre.endsWith(MARCA_IA) ? nombre.slice(0, -MARCA_IA.length) : nombre;
    const texto = plantilla.replaceAll("{nombre}", quien.slice(0, 32));
    const r = this.c.decir(texto);
    this.habloEn = t;
    this.diario.push(`${t} dice «${texto}» (${porque})${r.ok ? "" : ` NO: ${r.why}`}`);
  }
}
