// misiones — secuencia@1 at run time (U14 (5)). The server turns a sequence into events for one player's pages
// (eventosDe); the page puts them back together (montador) and plays them (crearReproductor): each person it moves
// follows a smooth curve through its keys — a monotone cubic, so it never swings past a key (a key on the floor keeps it
// above the floor) and it leaves the first key and reaches the last one at rest —; each extra model shows from `desde`
// to `hasta` (on a person: in that person's frame, so wings stay on its back while it flies); each line goes to the
// page's note and each house sound to whoever listens. One sequence at a time (the next ones wait in a short queue);
// when one ends, every person it moved stands again where the server says. Pure: no DOM, no clock of its own (the
// page passes performance.now), no work at all while nothing plays. The format and its checks: formato.ts.
import type { Msg, PlacedObject, Sound } from "../../packages/feature/src/index.ts";
import type { Clave, Pista, Pnj, Secuencia } from "./formato.ts"; // types only: the page loads this file on its own (a chunk) and formato.ts stays in the main one

// ---------- the wire: a header, one `pista` per track and, after each `mueve`, its keys ----------
/** The events that carry a sequence to a page, in order. What a key leaves out is filled with the person's own place
 * and yaw (its pnj@1 file), so the page needs nothing else to play it. */
export function eventosDe(s: Secuencia, pnjs: ReadonlyMap<string, Pnj>, suelo: (x: number, z: number) => number = () => 0): [string, Msg][] {
  const out: [string, Msg][] = [["secuencia", { id: s.id, duracion: s.duracion, pistas: s.pistas.length }]];
  s.pistas.forEach((p, n) => {
    const base = { secuencia: s.id, n, tipo: p.tipo };
    if (p.tipo === "mueve") {
      const q = pnjs.get(p.pnj);
      out.push(["pista", { ...base, pnj: p.pnj, claves: p.claves.length }]);
      for (const c of p.claves) { const x = c.x ?? q?.posicion.x ?? 0, z = c.z ?? q?.posicion.z ?? 0; out.push(["clave", { secuencia: s.id, pista: n, t: c.t, x, y: Math.round((suelo(x, z) + (c.y ?? q?.posicion.y ?? 0)) * 100) / 100, z, giro: c.giro ?? q?.giro ?? 0 }]); } // y over the ground it stands on (0 on a flat world)
    } else if (p.tipo === "muestra") out.push(["pista", { ...base, modelo: p.modelo, pnj: p.pnj, x: p.x, y: p.y, z: p.z, ox: p.offset.x, oy: p.offset.y, oz: p.offset.z, giro: p.giro, escala: p.escala, desde: p.desde, hasta: p.hasta }]);
    else if (p.tipo === "texto") out.push(["pista", { ...base, t: p.t, texto: p.texto }]);
    else out.push(["pista", { ...base, t: p.t, sonido: p.sonido }]);
  });
  return out;
}

const dePista = (m: Msg): Pista => {
  const n = (k: string) => Number(m[k]) || 0;
  if (m.tipo === "mueve") return { tipo: "mueve", pnj: String(m.pnj ?? ""), claves: [] };
  if (m.tipo === "muestra") return { tipo: "muestra", modelo: String(m.modelo ?? ""), pnj: String(m.pnj ?? ""), x: n("x"), y: n("y"), z: n("z"), offset: { x: n("ox"), y: n("oy"), z: n("oz") }, giro: n("giro"), escala: n("escala") || 1, desde: n("desde"), hasta: n("hasta") };
  if (m.tipo === "sonido") return { tipo: "sonido", t: n("t"), sonido: String(m.sonido ?? "suave") as Sound };
  return { tipo: "texto", t: n("t"), texto: String(m.texto ?? "") };
};

/** Puts a sequence back together from its events (they come in order and in one go). `recibir` answers the whole
 * sequence once its last piece is in, null until then; a new header forgets one half received. */
export function montador() {
  let s: { id: string; duracion: number; pistas: (Pista | undefined)[]; faltan: Map<number, number> } | null = null;
  return {
    recibir(evento: string, m: Msg): Secuencia | null {
      if (evento === "secuencia") s = { id: String(m.id), duracion: Number(m.duracion) || 0, pistas: new Array<Pista | undefined>(Math.max(0, Number(m.pistas) || 0)).fill(undefined), faltan: new Map() };
      else if (!s || String(m.secuencia) !== s.id) return null;
      else if (evento === "pista") {
        const n = Number(m.n);
        if (!(n >= 0 && n < s.pistas.length) || s.pistas[n]) return null;
        s.pistas[n] = dePista(m);
        if (m.tipo === "mueve") s.faltan.set(n, Number(m.claves) || 0);
      } else if (evento === "clave") {
        const n = Number(m.pista), p = s.pistas[n], falta = s.faltan.get(n) ?? 0;
        if (p?.tipo !== "mueve" || falta <= 0) return null;
        p.claves.push({ t: Number(m.t), x: Number(m.x), y: Number(m.y), z: Number(m.z), giro: Number(m.giro) });
        s.faltan.set(n, falta - 1);
      } else return null;
      if (!s.pistas.every(Boolean) || [...s.faltan.values()].some((k) => k > 0)) return null;
      const listo: Secuencia = { formato: "secuencia@1", id: s.id, duracion: s.duracion, pistas: s.pistas as Pista[] };
      s = null;
      return listo;
    },
  };
}

// ---------- the curves: monotone cubic (PCHIP) per axis, at rest at both ends ----------
export type Pose = { x: number; y: number; z: number; giro: number };
export type Curva = { ts: number[]; ejes: number[][]; m: number[][] };
/** Tangents that keep each piece between its two keys (Fritsch–Butland, as PCHIP), 0 at the first and last key. */
function tangentes(ts: number[], ps: number[]): number[] {
  const n = ps.length, m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const h0 = ts[k] - ts[k - 1], h1 = ts[k + 1] - ts[k], d0 = (ps[k] - ps[k - 1]) / h0, d1 = (ps[k + 1] - ps[k]) / h1;
    if (d0 * d1 <= 0) continue; // a peak or a flat: stop there
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    m[k] = (w0 + w1) / (w0 / d0 + w1 / d1);
  }
  return m;
}
/** A person's path through its keys (x, y, z and the yaw, turned the short way round between two keys). Keys that the
 * wire's 0.01 s rounding made equal to the one before are dropped (a piece needs some time). */
export function curva(todas: readonly Clave[]): Curva {
  const claves = todas.filter((c, i) => i === 0 || c.t > todas[i - 1].t);
  const ts = claves.map((c) => c.t), g: number[] = [];
  for (const c of claves) {
    let a = c.giro ?? 0;
    const antes = g[g.length - 1];
    if (antes !== undefined) { while (a - antes > 180) a -= 360; while (a - antes < -180) a += 360; }
    g.push(a);
  }
  const ejes = [claves.map((c) => c.x ?? 0), claves.map((c) => c.y ?? 0), claves.map((c) => c.z ?? 0), g];
  return { ts, ejes, m: ejes.map((e) => tangentes(ts, e)) };
}
/** Where the curve is at second `t`: null before its first key (the person stands where the server says), its last
 * key from then on. */
export function poseEn(c: Curva, t: number): Pose | null {
  const n = c.ts.length;
  if (!n || t < c.ts[0]) return null;
  let k = 0;
  if (t >= c.ts[n - 1]) k = n - 1; else while (t >= c.ts[k + 1]) k++;
  const eje = (i: number): number => {
    const e = c.ejes[i];
    if (k === n - 1) return e[k];
    const h = c.ts[k + 1] - c.ts[k], s = (t - c.ts[k]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * e[k] + (s3 - 2 * s2 + s) * h * c.m[i][k] + (-2 * s3 + 3 * s2) * e[k + 1] + (s3 - s2) * h * c.m[i][k + 1];
  };
  return { x: eje(0), y: eje(1), z: eje(2), giro: ((eje(3) % 360) + 540) % 360 - 180 };
}

/** Where a model of a `muestra` goes: on a person (its offset turned with the person's yaw and scaled with its size)
 * or at its own x, y, z. null = it cannot show (its person is not drawn on this page). */
export function colocacion(p: Extract<Pista, { tipo: "muestra" }>, quien: (Pose & { escala: number }) | null): PlacedObject | null {
  if (p.pnj && !quien) return null;
  const k = quien?.escala ?? 1, g = quien?.giro ?? 0, r = (g * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), e = p.escala * k;
  const ox = p.offset.x * k, oy = p.offset.y * k, oz = p.offset.z * k;
  const x = quien ? quien.x + ox * c + oz * s : p.x, y = quien ? quien.y + oy : p.y, z = quien ? quien.z - ox * s + oz * c : p.z;
  return { model: p.modelo, x, y, z, rx: 0, ry: g + p.giro, rz: 0, sx: e, sy: e, sz: e, animate: false };
}

// ---------- the player ----------
/** Something a sequence did, for whoever listens (the page: a line for screen readers, a sound). */
export type SucesoSecuencia = { tipo: "empieza" | "acaba"; id: string } | { tipo: "texto"; id: string; texto: string } | { tipo: "sonido"; id: string; sonido: Sound };
/** What the player needs from the page: a clock (ms), each person as the server has it (null = not drawn here), how to
 * draw a person at a pose (null = back where the server says), how to put or take a model, and an ear. */
export type Escenario = {
  reloj(): number;
  persona(pnj: string): (Pose & { escala: number }) | null;
  moverPersona(pnj: string, pose: Pose | null): void;
  colocar(key: string, o: PlacedObject | null): void;
  oir(s: SucesoSecuencia): void;
};
/** What is playing, for checks and agents (`__numinia.misiones.secuencia()`). */
export type SecuenciaVista = { id: string; t: number; duracion: number; personas: string[]; modelos: number; linea: string; cola: number };
/** Sequences that may wait behind the one playing (the oldest waiting goes first when more arrive). */
export const COLA_MAX = 3;
/** The key of a sequence's extra model on the page (`~`: the page's own, not a thing of the world). */
export const claveModelo = (i: number) => `~secuencia:${i}`;

export function crearReproductor(e: Escenario) {
  type Juega = { s: Secuencia; inicio: number; curvas: Map<number, Curva>; porPersona: Map<string, number[]>; poses: Map<string, Pose>; hechos: Set<number>; puestos: Set<number>; linea: string };
  let actual: Juega | null = null;
  const cola: Secuencia[] = [];
  const empezar = (s: Secuencia) => {
    const curvas = new Map<number, Curva>(), porPersona = new Map<string, number[]>();
    s.pistas.forEach((p, i) => {
      if (p.tipo !== "mueve" || !p.claves.length) return;
      curvas.set(i, curva(p.claves));
      porPersona.set(p.pnj, [...(porPersona.get(p.pnj) ?? []), i]);
    });
    for (const idx of porPersona.values()) idx.sort((a, b) => curvas.get(a)!.ts[0] - curvas.get(b)!.ts[0]); // by when they begin
    actual = { s, inicio: e.reloj(), curvas, porPersona, poses: new Map(), hechos: new Set(), puestos: new Set(), linea: "" };
    e.oir({ tipo: "empieza", id: s.id });
  };
  const acabar = () => {
    const a = actual!;
    actual = null; // first: whoever the page draws now is drawn where the server says
    for (const pnj of a.poses.keys()) e.moverPersona(pnj, null);
    for (const i of a.puestos) e.colocar(claveModelo(i), null);
    e.oir({ tipo: "acaba", id: a.s.id });
    const sig = cola.shift();
    if (sig) empezar(sig);
  };
  return {
    /** A sequence arrived: it plays now, or after the one playing (at most COLA_MAX wait). */
    poner(s: Secuencia): void {
      if (!actual) { empezar(s); return; }
      cola.push(s);
      if (cola.length > COLA_MAX) cola.shift();
    },
    /** Advance to now. True while one plays (the page keeps drawing); false at once, doing nothing, when none does. */
    cuadro(): boolean {
      const a = actual;
      if (!a) return false;
      const t = (e.reloj() - a.inicio) / 1000;
      if (t >= a.s.duracion) { acabar(); return actual !== null; }
      for (const [pnj, idx] of a.porPersona) { // a person: the last of its tracks that has begun (held at its last key)
        let p: Pose | null = null;
        for (const i of idx) p = poseEn(a.curvas.get(i)!, t) ?? p;
        if (p) { a.poses.set(pnj, p); e.moverPersona(pnj, p); }
      }
      a.s.pistas.forEach((p, i) => {
        if (p.tipo === "muestra") {
          let o: PlacedObject | null = null;
          if (t >= p.desde && t < p.hasta) {
            const base = p.pnj ? e.persona(p.pnj) : null, mov = p.pnj ? a.poses.get(p.pnj) : undefined;
            o = colocacion(p, base && mov ? { ...mov, escala: base.escala } : base);
          }
          if (o) { a.puestos.add(i); e.colocar(claveModelo(i), o); }
          else if (a.puestos.delete(i)) e.colocar(claveModelo(i), null);
        } else if ((p.tipo === "texto" || p.tipo === "sonido") && !a.hechos.has(i) && t >= p.t) {
          a.hechos.add(i);
          if (p.tipo === "texto") { a.linea = p.texto; e.oir({ tipo: "texto", id: a.s.id, texto: p.texto }); }
          else e.oir({ tipo: "sonido", id: a.s.id, sonido: p.sonido });
        }
      });
      return true;
    },
    /** What plays now (null = nothing): its id, second, length, the people it moves, the extra models shown, its last line. */
    ahora(): SecuenciaVista | null {
      const a = actual;
      return a ? { id: a.s.id, t: Math.round(((e.reloj() - a.inicio) / 1000) * 100) / 100, duracion: a.s.duracion, personas: [...a.poses.keys()], modelos: a.puestos.size, linea: a.linea, cola: cola.length } : null;
    },
    /** Where the playing sequence has this person now (null = it does not move it): the page draws it there even when
     * the server's state for it changes meanwhile (a mark, a name). */
    poseDe(pnj: string): Pose | null { return actual?.poses.get(pnj) ?? null; },
  };
}
