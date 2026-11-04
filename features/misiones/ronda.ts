// misiones — P16: a person's round (pnj@1 `posiciones[].ronda`). The round is a loop of stops; the person walks in a straight line
// from one stop to the next, stands still at each for its `pausa`, and goes on. EVERYONE who needs to know where she is at a given
// moment (the server for «E: hablar con…» and the reach of a conversation, the page to draw her) asks the same pure function,
// `rondaEn(plan, ms)`: nothing here reads a clock, a random number or the world. The server fixes the instant the round began for
// each player and sends the page how many ms of it have elapsed (event `ronda`); the page counts on from there.
// Everything is kept in centimetres (positions), tenths of a degree and tenths of a second, so the text the server sends rebuilds
// EXACTLY the plan it uses itself.

/** One stop of a round. `y` absent = the ground at that x, z (the server puts the number in before it sends anything); `giro` absent =
 * she faces the way she arrived; `pausa` = seconds she stands there (0 = she walks through). */
export type PuntoRonda = { x: number; z: number; y?: number; giro?: number; pausa: number };
export type ModoRonda = "vuelta" | "ida_y_vuelta";
/** A round as an author writes it (and as the file reader returns it, already rounded). */
export type Ronda = { puntos: PuntoRonda[]; velocidad: number; modo: ModoRonda };

export const RONDA = {
  puntosMin: 2, puntosMax: 8,
  pausaMax: 60,            // s
  velMin: 0.3, velMax: 1.4, // m/s: never faster than the page's calm walk (render/vida.ts CAMINA_MS)
  velDefecto: 1.1,         // m/s
  lejosM: 30,              // m: every stop within this of the person's own place (the page knows her only near it)
  cicloMaxS: 7200,         // s: the `rt` field of the event holds up to this; the limits above can never reach it (8 pauses of 60 s + 8 legs of 60 m at 0.3 m/s = 2080 s)
  texto: 300,              // bytes of the stops as the event carries them
} as const;
export const MODOS_RONDA: readonly ModoRonda[] = ["vuelta", "ida_y_vuelta"];

const r2 = (n: number) => Math.round(n * 100) / 100, r1 = (n: number) => Math.round(n * 10) / 10;
/** The numbers of a stop as the wire keeps them: x, z, y in cm, giro in 0.1°, pausa in 0.1 s. */
export const redondeaPunto = (p: PuntoRonda): PuntoRonda => ({ x: r2(p.x), z: r2(p.z), ...(p.y === undefined ? {} : { y: r2(p.y) }), ...(p.giro === undefined ? {} : { giro: r1(p.giro) }), pausa: r1(p.pausa) });

/** A round ready to be asked: the stops in the order they are visited (a back-and-forth visits the middle ones twice), when each
 * pause begins, and the way she faces on each leg. Build it once (`compilar`) and ask as often as you like. */
export type Plan = {
  readonly visitas: readonly PuntoRonda[];
  readonly ini: readonly number[];      // s: when the pause at visit k begins (ini[visitas.length] = the whole cycle)
  readonly tramo: readonly number[];    // s: how long the leg from visit k to k+1 takes
  readonly rumbo: readonly number[];    // degrees: the way that leg points (NaN for a leg of no length)
  readonly entrada: readonly number[];  // degrees: the way she faces arriving at visit k
  readonly velocidad: number;
  readonly ciclo: number;               // s
};

/** Heading in degrees (0 = +z, as `giro` everywhere), rounded to 0.1°. */
const rumboDe = (dx: number, dz: number) => r1((Math.atan2(dx, dz) * 180) / Math.PI);

/** The plan of a round. `giroBase` = the yaw she keeps when the round has no length at all and a stop gives none. Pure. */
export function compilar(r: Ronda, giroBase = 0): Plan {
  const p = r.puntos, n = p.length;
  const orden: number[] = [];
  for (let i = 0; i < n; i++) orden.push(i);
  if (r.modo === "ida_y_vuelta") for (let i = n - 2; i >= 1; i--) orden.push(i); // 0 1 2 … n-1 n-2 … 1, then 0 again
  const visitas = orden.map((i) => p[i]), m = visitas.length;
  const ini: number[] = [], tramo: number[] = [], rumbo: number[] = [];
  let t = 0;
  for (let k = 0; k < m; k++) {
    const a = visitas[k], b = visitas[(k + 1) % m], d = Math.hypot(b.x - a.x, b.z - a.z), dur = d / r.velocidad;
    ini.push(t); tramo.push(dur); rumbo.push(d > 1e-9 ? rumboDe(b.x - a.x, b.z - a.z) : Number.NaN);
    t += a.pausa + dur;
  }
  ini.push(t);
  // the way she faces arriving at stop k: the way of the last leg with some length that ends there (going back round the loop)
  const entrada: number[] = [];
  for (let k = 0; k < m; k++) {
    let h = giroBase;
    for (let j = 1; j <= m; j++) { const q = rumbo[(k - j + 2 * m) % m]; if (!Number.isNaN(q)) { h = q; break; } }
    entrada.push(h);
  }
  return { visitas, ini, tramo, rumbo, entrada, velocidad: r.velocidad, ciclo: t };
}

/** Where she is and what she is doing: position (m), height (m), the way she faces (degrees) and whether she is walking. */
export type PoseRonda = { x: number; z: number; y: number; giro: number; andando: boolean;
  /** seconds until this pause or this leg ends (Infinity for a round with no length at all): a page asks nothing again before then if she stands. */
  resto: number };
export const nuevaPose = (): PoseRonda => ({ x: 0, z: 0, y: 0, giro: 0, andando: false, resto: Infinity });

/** The pose `ms` milliseconds after the round began (the round repeats for ever). Negative counts as 0. Pure; written in place into
 * `out` (no allocation per frame) and returned. Positions come out in cm, the yaw in 0.1°, so two sides that rebuilt the plan from the
 * same text agree to the digit. */
export function rondaEn(plan: Plan, ms: number, out: PoseRonda = nuevaPose()): PoseRonda {
  const V = plan.visitas, m = V.length;
  let t = ms > 0 && Number.isFinite(ms) ? ms / 1000 : 0;
  if (plan.ciclo > 1e-9) t %= plan.ciclo; else { t = 0; out.resto = Infinity; }
  let k = 0;
  while (k < m - 1 && t >= plan.ini[k + 1]) k++;
  const a = V[k], dentro = t - plan.ini[k];
  if (dentro < a.pausa || plan.tramo[k] <= 1e-9) { // standing at stop k
    out.x = r2(a.x); out.z = r2(a.z); out.y = r2(a.y ?? 0); out.giro = a.giro ?? plan.entrada[k]; out.andando = false;
    if (plan.ciclo > 1e-9) out.resto = plan.tramo[k] <= 1e-9 ? plan.ini[k + 1] - t : plan.ini[k] + a.pausa - t;
    return out;
  }
  const b = V[(k + 1) % m], f = Math.min(1, (dentro - a.pausa) / plan.tramo[k]);
  out.x = r2(a.x + (b.x - a.x) * f); out.z = r2(a.z + (b.z - a.z) * f); out.y = r2((a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * f);
  out.giro = plan.rumbo[k]; out.andando = true; out.resto = plan.ini[k + 1] - t;
  return out;
}

/** The stops as one short text for the wire: `x,z,y,giro,pausa;…` (giro empty when the stop gives none). The caller puts a number in
 * every `y` first (the ground is the server's to know). */
export function aTexto(puntos: readonly PuntoRonda[]): string {
  return puntos.map((q) => { const p = redondeaPunto(q); return `${p.x},${p.z},${p.y ?? 0},${p.giro ?? ""},${p.pausa}`; }).join(";");
}
/** The inverse of `aTexto`; null when the text is not a round's stops. */
export function deTexto(s: string): PuntoRonda[] | null {
  if (!s) return null;
  const out: PuntoRonda[] = [];
  for (const parte of s.split(";")) {
    const c = parte.split(",");
    if (c.length !== 5) return null;
    const [x, z, y, pausa] = [c[0], c[1], c[2], c[4]].map(Number);
    const giro = c[3] === "" ? undefined : Number(c[3]);
    if (![x, z, y, pausa].every(Number.isFinite) || (giro !== undefined && !Number.isFinite(giro))) return null;
    out.push({ x, z, y, ...(giro === undefined ? {} : { giro }), pausa });
  }
  return out.length >= RONDA.puntosMin && out.length <= RONDA.puntosMax ? out : null;
}
