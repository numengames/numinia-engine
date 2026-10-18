// Sonidos esquemáticos hechos en el momento: ningún fichero, ningún byte que descargar. Cada id del catálogo de sonido
// del motor tiene aquí una «receta» (unos pocos osciladores, ruido filtrado y envolventes) que escribe un `Float32Array`
// mono a 22,05 kHz. Es DSP puro: se prueba en Node, se vuelca a .wav para escucharlo (tools/sonidos-wav.mjs) y en el
// navegador se convierte en un `AudioBuffer` que cuelga del bus que toca del núcleo (nucleo.ts).
//
// Por qué: el motor tenía tres caminos de sonido sueltos y casi nada sonaba. Esto da a TODO su propio sonido desde ya,
// aunque sea basto; cuando exista el fichero CC0 de un id (work/motor-ar/sonido/biblioteca), gana el fichero y la
// receta queda de respaldo. Los ids son los del catálogo `numinia-engine/sonidos@1`.
//
// Lo copiado y transformado: síntesis sustractiva clásica (oscilador → filtro → envolvente), biquad RBJ del «Audio EQ
// Cookbook», y el empalme de bucles por fundido de potencia constante. Aleatorio con semilla (mulberry32) por id y
// variante: el mismo id y la misma variante suenan igual en todos los aparatos.
import type { Bus, Nucleo } from "./nucleo.ts";

export const SR = 22050;
type Onda = "sin" | "tri" | "cuad" | "sierra";

/** Generador con semilla (mulberry32): [0,1). */
export function rng(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// ───────────────────────── herramientas ─────────────────────────
const nuevo = (seg: number): Float32Array => new Float32Array(Math.ceil(seg * SR));
const TWO_PI = Math.PI * 2;

function forma(tipo: Onda, fase: number): number {
  const p = fase - Math.floor(fase);
  if (tipo === "sin") return Math.sin(TWO_PI * p);
  if (tipo === "tri") return 4 * Math.abs(p - 0.5) - 1;
  if (tipo === "cuad") return p < 0.5 ? 0.7 : -0.7;
  return 2 * p - 1;
}

/** Envolvente: subida lineal `ataque`, caída exponencial con constante `tau` (s), y 4 ms de salida para no hacer clic. */
function amp(t: number, dur: number, ataque: number, tau: number): number {
  if (t < 0 || t >= dur) return 0;
  const sube = ataque > 0 && t < ataque ? t / ataque : 1;
  const cae = Math.exp(-(t - Math.min(t, ataque)) / tau);
  const sale = Math.min(1, (dur - t) / 0.004);
  return sube * cae * sale;
}

type OpcTono = {
  f0: number; f1?: number; t0?: number; dur: number; vol?: number; onda?: Onda; ataque?: number; tau?: number;
  /** Vibrato [Hz, profundidad relativa]. */
  vib?: [number, number];
  /** Parciales extra [múltiplo de f0, volumen relativo]. */
  arm?: [number, number][];
};

/** Suma un tono (con glissando exponencial de f0 a f1) al buffer. */
function tono(b: Float32Array, o: OpcTono): void {
  const { f0, f1 = o.f0, t0 = 0, dur, vol = 0.5, onda = "sin", ataque = 0.004, vib } = o;
  const tau = o.tau ?? dur / 3;
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const partes: [number, number][] = [[1, 1], ...(o.arm ?? [])];
  const fases = partes.map(() => 0);
  for (let i = 0; i < n && i0 + i < b.length; i++) {
    const t = i / SR, u = n > 1 ? i / (n - 1) : 0;
    let f = f0 * Math.pow(f1 / f0, u);
    if (vib) f *= 1 + vib[1] * Math.sin(TWO_PI * vib[0] * t);
    let s = 0;
    for (let k = 0; k < partes.length; k++) { fases[k] += (f * partes[k][0]) / SR; s += partes[k][1] * forma(onda, fases[k]); }
    b[i0 + i] += s * vol * amp(t, dur, ataque, tau);
  }
}

type Filtro = "lp" | "hp" | "bp";
/** Biquad RBJ en forma directa I; devuelve los coeficientes normalizados. */
function coefs(tipo: Filtro, f: number, q: number): [number, number, number, number, number] {
  const w = TWO_PI * Math.min(Math.max(f, 20), SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  let b0: number, b1: number, b2: number;
  if (tipo === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (tipo === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - al) / a0];
}

type OpcRuido = {
  t0?: number; dur: number; vol?: number; filtro?: Filtro; f?: number; f1?: number; q?: number; ataque?: number; tau?: number;
  /** Modulación de amplitud [Hz, profundidad 0–1]. */
  lfo?: [number, number];
};

/** Suma ruido blanco filtrado (el filtro puede barrer de `f` a `f1`) al buffer. */
function ruido(b: Float32Array, r: () => number, o: OpcRuido): void {
  const { t0 = 0, dur, vol = 0.5, filtro, f = 1000, f1 = o.f ?? 1000, q = 0.8, ataque = 0.004, lfo } = o;
  const tau = o.tau ?? dur / 3;
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, k: ReturnType<typeof coefs> = filtro ? coefs(filtro, f, q) : [1, 0, 0, 0, 0];
  for (let i = 0; i < n && i0 + i < b.length; i++) {
    if (filtro && f1 !== f && i % 32 === 0) k = coefs(filtro, f * Math.pow(f1 / f, i / Math.max(1, n - 1)), q);
    const x = r() * 2 - 1;
    const y = filtro ? k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2 : x;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const t = i / SR;
    const m = lfo ? 1 - lfo[1] + lfo[1] * (0.5 + 0.5 * Math.sin(TWO_PI * lfo[0] * t)) : 1;
    b[i0 + i] += y * vol * amp(t, dur, ataque, tau) * m;
  }
}

/** Filtra el buffer entero (en el sitio). */
function filtrar(b: Float32Array, tipo: Filtro, f: number, q = 0.7): void {
  const k = coefs(tipo, f, q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < b.length; i++) {
    const x = b[i], y = k[0] * x + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y;
  }
}

/** Un eco sencillo: copia retrasada y atenuada, `veces` veces. */
function eco(b: Float32Array, retraso: number, ganancia: number, veces: number): void {
  const d = Math.floor(retraso * SR);
  for (let v = 1; v <= veces; v++) for (let i = b.length - 1; i >= d * v; i--) b[i] += b[i - d * v] * Math.pow(ganancia, v);
}

/** Escala para que el pico sea `pico`. */
function normalizar(b: Float32Array, pico: number): void {
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
  if (m < 1e-9) return;
  const g = pico / m;
  for (let i = 0; i < b.length; i++) b[i] *= g;
}

/** Recorta `seg` del final fundiéndolo con el principio (potencia constante): el resultado se repite sin costura. */
function empalmar(b: Float32Array, seg: number): Float32Array {
  const x = Math.floor(seg * SR), n = b.length - x, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = b[i];
  for (let i = 0; i < x; i++) {
    const w = i / x, a = Math.sin(w * Math.PI / 2), c = Math.cos(w * Math.PI / 2);
    out[i] = b[i] * a + b[n + i] * c;
  }
  return out;
}

// ───────────────────────── recetas ─────────────────────────
type Receta = { dur: number; pico?: number; bucle?: boolean; bus: Bus; hacer: (b: Float32Array, r: () => number) => void };
const XF = 1; // segundos de fundido en los bucles

const notas = (b: Float32Array, fs: number[], paso: number, dur: number, vol: number, onda: Onda = "tri"): void =>
  fs.forEach((f, i) => tono(b, { f0: f, t0: i * paso, dur, vol, onda, tau: dur / 3 }));

/** Gotas/burbujas/crujidos al azar repartidos por el buffer. */
function esparcir(b: Float32Array, r: () => number, cuantos: number, hacer: (t: number) => void): void {
  const total = b.length / SR;
  for (let i = 0; i < cuantos; i++) hacer(r() * (total - 0.2));
}

export const RECETAS: Readonly<Record<string, Receta>> = {
  // ── interfaz ──
  "ui-pulsar": { dur: 0.08, bus: "interfaz", hacer: (b, r) => { tono(b, { f0: 1400, f1: 900, dur: 0.06, vol: 0.6, tau: 0.015 }); ruido(b, r, { dur: 0.012, vol: 0.15, filtro: "hp", f: 4000 }); } },
  "ui-confirmar": { dur: 0.3, bus: "interfaz", hacer: (b) => { tono(b, { f0: 660, dur: 0.12, vol: 0.5, onda: "tri" }); tono(b, { f0: 990, t0: 0.08, dur: 0.22, vol: 0.5, onda: "tri" }); } },
  "ui-error": { dur: 0.45, bus: "interfaz", hacer: (b) => { tono(b, { f0: 196, dur: 0.16, vol: 0.5, onda: "cuad" }); tono(b, { f0: 147, t0: 0.14, dur: 0.3, vol: 0.5, onda: "cuad" }); filtrar(b, "lp", 1200); } },
  "ui-aviso": { dur: 0.35, bus: "interfaz", hacer: (b) => { notas(b, [880, 880], 0.17, 0.13, 0.5); } },
  "ui-chat": { dur: 0.16, bus: "interfaz", hacer: (b) => { tono(b, { f0: 520, f1: 780, dur: 0.08, vol: 0.45, tau: 0.03 }); tono(b, { f0: 1040, t0: 0.05, dur: 0.09, vol: 0.25, tau: 0.03 }); } },
  "ui-gente": { dur: 0.4, bus: "interfaz", hacer: (b) => { tono(b, { f0: 440, dur: 0.16, vol: 0.4 }); tono(b, { f0: 587, t0: 0.1, dur: 0.28, vol: 0.4 }); } },
  "ui-logro": { dur: 0.95, bus: "interfaz", hacer: (b) => { notas(b, [523.25, 659.25, 783.99], 0.09, 0.2, 0.45); tono(b, { f0: 1046.5, t0: 0.27, dur: 0.6, vol: 0.5, tau: 0.25 }); tono(b, { f0: 2093, t0: 0.3, dur: 0.6, vol: 0.12, tau: 0.2 }); } },
  "ui-cuenta-atras": { dur: 0.2, bus: "interfaz", hacer: (b) => { tono(b, { f0: 880, dur: 0.15, vol: 0.6, tau: 0.04, arm: [[2, 0.3]] }); } },
  "ui-abrir": { dur: 0.22, bus: "interfaz", hacer: (b, r) => { tono(b, { f0: 400, f1: 900, dur: 0.15, vol: 0.3, tau: 0.08 }); ruido(b, r, { dur: 0.15, vol: 0.12, filtro: "bp", f: 1500, f1: 4000, q: 1.2, ataque: 0.05 }); } },
  "ui-cerrar": { dur: 0.22, bus: "interfaz", hacer: (b, r) => { tono(b, { f0: 900, f1: 400, dur: 0.15, vol: 0.3, tau: 0.08 }); ruido(b, r, { dur: 0.15, vol: 0.12, filtro: "bp", f: 4000, f1: 1500, q: 1.2, ataque: 0.02 }); } },

  // ── pasos y cuerpo ──
  "pasos-piedra": { dur: 0.14, bus: "pasos-propios", hacer: (b, r) => { tono(b, { f0: 110, f1: 70, dur: 0.09, vol: 0.6, tau: 0.03 }); ruido(b, r, { dur: 0.08, vol: 0.5, filtro: "bp", f: 1800, q: 1.2, tau: 0.02 }); ruido(b, r, { dur: 0.02, vol: 0.2, filtro: "hp", f: 5000 }); } },
  "pasos-madera": { dur: 0.16, bus: "pasos-propios", hacer: (b, r) => { tono(b, { f0: 190, f1: 120, dur: 0.1, vol: 0.6, tau: 0.04 }); ruido(b, r, { dur: 0.09, vol: 0.4, filtro: "bp", f: 700, q: 2, tau: 0.03 }); tono(b, { f0: 320, t0: 0.05, dur: 0.05, vol: 0.2 }); } },
  "pasos-hierba": { dur: 0.2, bus: "pasos-propios", hacer: (b, r) => { ruido(b, r, { dur: 0.15, vol: 0.4, filtro: "bp", f: 4500, q: 0.7, ataque: 0.02, tau: 0.05 }); tono(b, { f0: 90, dur: 0.08, vol: 0.2, tau: 0.03 }); } },
  "pasos-metal": { dur: 0.3, bus: "pasos-propios", hacer: (b, r) => { [820, 1340, 2110, 3060].forEach((f, i) => tono(b, { f0: f, dur: 0.28, vol: 0.2 / (i + 1) ** 0.5, tau: 0.05 - i * 0.008 })); tono(b, { f0: 140, dur: 0.08, vol: 0.5, tau: 0.03 }); ruido(b, r, { dur: 0.02, vol: 0.3, filtro: "bp", f: 3000 }); } },
  "pasos-agua": { dur: 0.34, bus: "pasos-propios", hacer: (b, r) => { ruido(b, r, { dur: 0.24, vol: 0.45, filtro: "bp", f: 600, f1: 2500, q: 1.5, ataque: 0.02 }); tono(b, { f0: 500, f1: 1100, t0: 0.05, dur: 0.06, vol: 0.2 }); tono(b, { f0: 700, f1: 1500, t0: 0.12, dur: 0.06, vol: 0.2 }); } },
  "aterrizaje": { dur: 0.3, bus: "pasos-propios", hacer: (b, r) => { tono(b, { f0: 90, f1: 45, dur: 0.24, vol: 0.9, tau: 0.08 }); ruido(b, r, { dur: 0.2, vol: 0.5, filtro: "lp", f: 900, tau: 0.06 }); ruido(b, r, { dur: 0.03, vol: 0.2, filtro: "hp", f: 3000 }); } },
  "salto": { dur: 0.3, bus: "pasos-propios", hacer: (b, r) => { tono(b, { f0: 220, f1: 520, dur: 0.16, vol: 0.35, onda: "tri", tau: 0.07 }); ruido(b, r, { dur: 0.12, vol: 0.2, filtro: "bp", f: 1500, q: 1, ataque: 0.04 }); } },
  "dano": { dur: 0.4, bus: "efectos", hacer: (b, r) => { tono(b, { f0: 200, f1: 80, dur: 0.28, vol: 0.5, onda: "sierra", tau: 0.1 }); ruido(b, r, { dur: 0.16, vol: 0.4, filtro: "lp", f: 1200 }); filtrar(b, "lp", 1800); } },

  // ── objetos y funciones ──
  "coger-soltar": { dur: 0.22, bus: "efectos", hacer: (b, r) => { ruido(b, r, { dur: 0.1, vol: 0.3, filtro: "bp", f: 1500, f1: 3200, q: 1.5, ataque: 0.02 }); tono(b, { f0: 330, f1: 440, dur: 0.07, vol: 0.25 }); ruido(b, r, { t0: 0.1, dur: 0.012, vol: 0.3, filtro: "hp", f: 6000 }); } },
  "golpe-material": { dur: 0.25, bus: "efectos", hacer: (b, r) => { tono(b, { f0: 140, f1: 60, dur: 0.16, vol: 0.7, tau: 0.05 }); ruido(b, r, { dur: 0.1, vol: 0.5, filtro: "bp", f: 900, tau: 0.03 }); tono(b, { f0: 1900, dur: 0.05, vol: 0.1 }); } },
  "puerta": { dur: 0.85, bus: "efectos", hacer: (b, r) => { tono(b, { f0: 140, f1: 210, dur: 0.55, vol: 0.4, onda: "sierra", ataque: 0.12, tau: 0.5, vib: [14, 0.2] }); filtrar(b, "bp", 650, 2.5); tono(b, { f0: 100, t0: 0.58, dur: 0.12, vol: 0.7, tau: 0.04 }); ruido(b, r, { t0: 0.58, dur: 0.02, vol: 0.4, filtro: "hp", f: 2500 }); } },
  "cerradura": { dur: 0.6, bus: "efectos", hacer: (b, r) => { ruido(b, r, { dur: 0.016, vol: 0.6, filtro: "hp", f: 3000 }); tono(b, { f0: 2400, dur: 0.03, vol: 0.2 }); ruido(b, r, { t0: 0.12, dur: 0.016, vol: 0.6, filtro: "hp", f: 3000 }); tono(b, { f0: 3100, t0: 0.3, dur: 0.22, vol: 0.25, tau: 0.06 }); tono(b, { f0: 150, t0: 0.4, dur: 0.1, vol: 0.5, tau: 0.03 }); } },
  "pesca-lanzar": { dur: 0.7, bus: "efectos", hacer: (b, r) => { ruido(b, r, { dur: 0.38, vol: 0.5, filtro: "bp", f: 400, f1: 3500, q: 1.2, ataque: 0.1, tau: 0.15 }); tono(b, { f0: 1800, f1: 2600, dur: 0.3, vol: 0.08 }); tono(b, { f0: 700, f1: 200, t0: 0.42, dur: 0.12, vol: 0.5, tau: 0.04 }); } },
  "pesca-chapuzon": { dur: 0.5, bus: "efectos", hacer: (b, r) => { tono(b, { f0: 800, f1: 180, dur: 0.16, vol: 0.7, tau: 0.05 }); ruido(b, r, { dur: 0.28, vol: 0.35, filtro: "lp", f: 1500, ataque: 0.01, tau: 0.08 }); tono(b, { f0: 400, f1: 900, t0: 0.12, dur: 0.06, vol: 0.2 }); tono(b, { f0: 600, f1: 1200, t0: 0.2, dur: 0.05, vol: 0.2 }); } },
  "pesca-cobrar": { dur: 0.85, bus: "efectos", hacer: (b, r) => { let t = 0; for (let i = 0; i < 10; i++) { ruido(b, r, { t0: t, dur: 0.014, vol: 0.5, filtro: "bp", f: 3500, q: 2 }); tono(b, { f0: 180, t0: t, dur: 0.025, vol: 0.25 }); t += 0.075 - 0.004 * i; } ruido(b, r, { t0: 0.6, dur: 0.2, vol: 0.3, filtro: "lp", f: 1400, tau: 0.07 }); } },
  "pesca-picada": { dur: 0.4, bus: "efectos", hacer: (b, r) => { for (const t0 of [0, 0.14]) { tono(b, { f0: 1200, f1: 700, t0, dur: 0.07, vol: 0.4, tau: 0.03 }); ruido(b, r, { t0, dur: 0.05, vol: 0.2, filtro: "bp", f: 2200 }); } } },
  "dardo-lanzar": { dur: 0.25, bus: "efectos", hacer: (b, r) => { ruido(b, r, { dur: 0.2, vol: 0.45, filtro: "bp", f: 1000, f1: 5000, q: 1.2, ataque: 0.05, tau: 0.06 }); } },
  "dardo-impacto": { dur: 0.5, bus: "efectos", hacer: (b, r) => { tono(b, { f0: 220, f1: 110, dur: 0.1, vol: 0.7, tau: 0.03 }); ruido(b, r, { dur: 0.022, vol: 0.5, filtro: "bp", f: 2500 }); tono(b, { f0: 900, t0: 0.02, dur: 0.38, vol: 0.2, tau: 0.1, vib: [30, 0.04] }); } },
  "dados": { dur: 0.9, bus: "efectos", hacer: (b, r) => { let t = 0, v = 0.7; for (let i = 0; i < 8; i++) { tono(b, { f0: 1800 + r() * 800, t0: t, dur: 0.025, vol: v * 0.5, tau: 0.01 }); ruido(b, r, { t0: t, dur: 0.025, vol: v * 0.5, filtro: "bp", f: 2500, q: 1.5, tau: 0.01 }); t += 0.04 + i * 0.03 + r() * 0.03; v *= 0.82; } ruido(b, r, { dur: 0.6, vol: 0.12, filtro: "lp", f: 500, tau: 0.2 }); } },
  "teleport": { dur: 1.3, bus: "efectos", hacer: (b, r) => { for (const d of [1, 1.01, 0.99]) tono(b, { f0: 300 * d, f1: 1800 * d, dur: 0.95, vol: 0.2, ataque: 0.2, tau: 0.6 }); ruido(b, r, { dur: 0.95, vol: 0.25, filtro: "bp", f: 500, f1: 6000, q: 2, ataque: 0.2, tau: 0.5 }); tono(b, { f0: 3000, t0: 0.85, dur: 0.4, vol: 0.15, tau: 0.12, vib: [9, 0.01] }); } },
  "renacer": { dur: 1.8, bus: "efectos", hacer: (b) => { for (const f of [261.63, 329.63, 392]) tono(b, { f0: f, dur: 1.5, vol: 0.3, ataque: 0.3, tau: 0.8 }); tono(b, { f0: 1568, t0: 0.55, dur: 0.7, vol: 0.12, tau: 0.2 }); tono(b, { f0: 2093, t0: 0.75, dur: 0.7, vol: 0.12, tau: 0.2 }); } },
  "moneda": { dur: 0.5, bus: "efectos", hacer: (b) => { tono(b, { f0: 1568, dur: 0.1, vol: 0.4, tau: 0.04 }); tono(b, { f0: 2093, t0: 0.07, dur: 0.4, vol: 0.4, tau: 0.12 }); } },
  "maquina": { dur: 2, bucle: true, bus: "efectos", hacer: (b, r) => { for (let k = 0; k < 10; k++) { const t = k * 0.2; tono(b, { f0: 70, t0: t, dur: 0.09, vol: 0.5, onda: "cuad", tau: 0.03 }); ruido(b, r, { t0: t, dur: 0.05, vol: 0.3, filtro: "bp", f: 1200, tau: 0.02 }); ruido(b, r, { t0: t + 0.1, dur: 0.02, vol: 0.15, filtro: "hp", f: 3000 }); } } },

  // ── ambiente: camas y capas (bucles de 8 s empalmados) y sueltos ──
  "bed-torre-piedra": { dur: 8, bucle: true, pico: 0.4, bus: "ambiente", hacer: (b, r) => { tono(b, { f0: 55, dur: 9, vol: 0.3, ataque: 0, tau: 1e9 }); tono(b, { f0: 82.5, dur: 9, vol: 0.12, ataque: 0, tau: 1e9 }); ruido(b, r, { dur: 9, vol: 0.5, filtro: "lp", f: 260, ataque: 0, tau: 1e9, lfo: [0.125, 0.5] }); } },
  "bed-plaza-aire": { dur: 8, bucle: true, pico: 0.4, bus: "ambiente", hacer: (b, r) => { ruido(b, r, { dur: 9, vol: 0.3, filtro: "bp", f: 900, q: 0.5, ataque: 0, tau: 1e9, lfo: [0.25, 0.4] }); ruido(b, r, { dur: 9, vol: 0.06, filtro: "hp", f: 5000, ataque: 0, tau: 1e9 }); } },
  "bed-niebla": { dur: 8, bucle: true, pico: 0.35, bus: "ambiente", hacer: (b, r) => { ruido(b, r, { dur: 9, vol: 0.4, filtro: "lp", f: 500, ataque: 0, tau: 1e9, lfo: [0.125, 0.6] }); tono(b, { f0: 440, dur: 9, vol: 0.05, ataque: 0, tau: 1e9, vib: [0.25, 0.004] }); tono(b, { f0: 660, dur: 9, vol: 0.04, ataque: 0, tau: 1e9, vib: [0.375, 0.004] }); } },
  "capa-estanque": { dur: 8, bucle: true, pico: 0.4, bus: "ambiente", hacer: (b, r) => { ruido(b, r, { dur: 9, vol: 0.2, filtro: "lp", f: 700, ataque: 0, tau: 1e9, lfo: [0.5, 0.6] }); ruido(b, r, { dur: 9, vol: 0.08, filtro: "bp", f: 1200, q: 1, ataque: 0, tau: 1e9 }); esparcir(b, r, 16, (t) => { const f = 500 + r() * 500; tono(b, { f0: f, f1: f * 2, t0: t, dur: 0.06, vol: 0.2 }); }); } },
  "capa-ventanal-viento": { dur: 8, bucle: true, pico: 0.4, bus: "ambiente", hacer: (b, r) => { ruido(b, r, { dur: 9, vol: 0.5, filtro: "bp", f: 500, q: 2.5, ataque: 0, tau: 1e9, lfo: [0.125, 0.7] }); ruido(b, r, { dur: 9, vol: 0.2, filtro: "bp", f: 1100, q: 3, ataque: 0, tau: 1e9, lfo: [0.25, 0.5] }); tono(b, { f0: 880, dur: 9, vol: 0.03, ataque: 0, tau: 1e9, vib: [0.5, 0.03] }); } },
  "capa-fuego": { dur: 8, bucle: true, pico: 0.45, bus: "ambiente", hacer: (b, r) => { ruido(b, r, { dur: 9, vol: 0.15, filtro: "lp", f: 600, ataque: 0, tau: 1e9, lfo: [0.5, 0.4] }); esparcir(b, r, 45, (t) => ruido(b, r, { t0: t, dur: 0.005 + r() * 0.015, vol: 0.2 + r() * 0.5, filtro: "hp", f: 2000 + r() * 2000, tau: 0.006 })); } },
  "capa-alambique": { dur: 8, bucle: true, pico: 0.4, bus: "ambiente", hacer: (b, r) => { ruido(b, r, { dur: 9, vol: 0.15, filtro: "lp", f: 400, ataque: 0, tau: 1e9, lfo: [0.25, 0.4] }); ruido(b, r, { dur: 9, vol: 0.05, filtro: "hp", f: 4000, ataque: 0, tau: 1e9 }); esparcir(b, r, 34, (t) => { const f = 300 + r() * 600; tono(b, { f0: f, f1: f * 2.2, t0: t, dur: 0.06 + r() * 0.05, vol: 0.2 }); }); } },
  "capa-gentio": { dur: 8, bucle: true, pico: 0.35, bus: "ambiente", hacer: (b, r) => { [[500, 0.375], [900, 0.5], [1500, 0.625], [2400, 0.875], [700, 0.75]].forEach(([f, l]) => ruido(b, r, { dur: 9, vol: 0.15, filtro: "bp", f, q: 3, ataque: 0, tau: 1e9, lfo: [l * 4, 0.9] })); } },
  "amb-gota-piedra": { dur: 1.2, bus: "ambiente", hacer: (b, r) => { tono(b, { f0: 1600, f1: 1100, dur: 0.09, vol: 0.5, tau: 0.025 }); ruido(b, r, { dur: 0.01, vol: 0.2, filtro: "hp", f: 3000 }); filtrar(b, "lp", 4000); eco(b, 0.22, 0.4, 2); } },
  "amb-cuervo-lejano": { dur: 1.4, bus: "ambiente", hacer: (b) => { tono(b, { f0: 480, f1: 320, dur: 0.24, vol: 0.5, onda: "sierra", vib: [40, 0.04], ataque: 0.02, tau: 0.12 }); tono(b, { f0: 450, f1: 300, t0: 0.34, dur: 0.2, vol: 0.5, onda: "sierra", vib: [40, 0.04], ataque: 0.02, tau: 0.1 }); filtrar(b, "bp", 1100, 1.2); filtrar(b, "lp", 2200); eco(b, 0.28, 0.25, 2); } },
  "amb-crujido-madera": { dur: 0.7, bus: "ambiente", hacer: (b, r) => { tono(b, { f0: 90, f1: 130, dur: 0.5, vol: 0.4, onda: "sierra", vib: [22, 0.3], ataque: 0.08, tau: 0.25 }); filtrar(b, "bp", 400, 4); ruido(b, r, { t0: 0.1, dur: 0.01, vol: 0.2, filtro: "hp", f: 2500 }); ruido(b, r, { t0: 0.33, dur: 0.01, vol: 0.2, filtro: "hp", f: 2500 }); } },
  "amb-campana-lejana": { dur: 3.2, bus: "ambiente", hacer: (b, r) => { [[1, 1.2], [2, 0.8], [2.76, 0.5], [5.4, 0.3], [8.93, 0.2]].forEach(([m, tau], i) => tono(b, { f0: 330 * m, dur: 3.1, vol: 0.4 / (i + 1) ** 0.6, tau })); ruido(b, r, { dur: 0.02, vol: 0.2, filtro: "bp", f: 2000 }); filtrar(b, "lp", 3000); } },
  "amb-burbuja": { dur: 0.25, bus: "ambiente", hacer: (b) => { tono(b, { f0: 400, f1: 1000, dur: 0.1, vol: 0.4, tau: 0.04 }); } },
  "amb-chasquido-fuego": { dur: 0.25, bus: "ambiente", hacer: (b, r) => { for (let i = 0; i < 4; i++) ruido(b, r, { t0: i * 0.03 + r() * 0.02, dur: 0.01, vol: 0.3 + r() * 0.4, filtro: "hp", f: 2500, tau: 0.004 }); } },
};

/** Todos los ids con receta, en el orden en que están escritos arriba. */
export const IDS: readonly string[] = Object.keys(RECETAS);

/** Bus donde suena cada id. */
export const BUS_DE: Readonly<Record<string, Bus>> = Object.fromEntries(IDS.map((id) => [id, RECETAS[id].bus]));

export type Sonido = { id: string; datos: Float32Array; sr: number; bucle: boolean; bus: Bus };

/** Genera el sonido `id` (la variante `v` cambia la semilla: otro gotear, otra tirada de dados). `null` si no hay receta. */
export function generar(id: string, v = 0): Sonido | null {
  const rc = RECETAS[id];
  if (!rc) return null;
  const r = rng(hash(id) + Math.imul(v, 7919));
  let b = nuevo(rc.dur + (rc.bucle && rc.dur >= 4 ? XF : 0));
  rc.hacer(b, r);
  if (rc.bucle && rc.dur >= 4) b = empalmar(b, XF);
  else if (rc.bucle) { /* bucles cortos de pulsos (máquina): ya están hechos para encajar */ }
  normalizar(b, rc.pico ?? 0.8);
  return { id, datos: b, sr: SR, bucle: !!rc.bucle, bus: rc.bus };
}

/** Bytes de un .wav PCM 16 bits mono (para escuchar la receta fuera del navegador). */
export function aWav(s: Sonido): Uint8Array {
  const n = s.datos.length, out = new Uint8Array(44 + n * 2), dv = new DataView(out.buffer);
  const txt = (o: number, t: string) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); txt(8, "WAVE"); txt(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, s.sr, true); dv.setUint32(28, s.sr * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); txt(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s.datos[i])) * 32767), true);
  return out;
}

// ───────────────────────── en el navegador ─────────────────────────
export type OpcionesSonar = { vol?: number; /** Multiplicador de velocidad (1 = tal cual; 1,06 = un semitono más agudo). */ tono?: number; variante?: number; bus?: Bus; bucle?: boolean };
export type Voz = { parar(): void };
export type Sintetizador = {
  /** Suena `id` por su bus. `null` si no hay receta o el navegador no da audio. Un bucle devuelve el mando para pararlo. */
  sonar(id: string, o?: OpcionesSonar): Voz | null;
  /** Genera ya (sin sonar) lo que se va a necesitar enseguida. */
  precargar(ids?: readonly string[]): void;
  /** ¿Hay receta para este id? */
  tiene(id: string): boolean;
};

/** Variantes distintas que se guardan por id: bastan para que un goteo o un paso no se oigan «a máquina». */
const VARIANTES = 3;

export function crearSintetizador(nucleo: Nucleo): Sintetizador {
  const cache = new Map<string, Float32Array>();
  const buffers = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
  const buffer = (c: AudioContext, id: string, v: number): AudioBuffer | null => {
    let m = buffers.get(c);
    if (!m) { m = new Map(); buffers.set(c, m); }
    const k = `${id}#${v}`;
    let ab = m.get(k);
    if (ab) return ab;
    let datos = cache.get(k);
    if (!datos) { const s = generar(id, v); if (!s) return null; datos = s.datos; cache.set(k, datos); }
    ab = c.createBuffer(1, datos.length, SR);
    ab.copyToChannel(datos, 0);
    m.set(k, ab);
    return ab;
  };
  let vuelta = 0;
  return {
    tiene: (id) => id in RECETAS,
    precargar(ids = IDS) { for (const id of ids) if (RECETAS[id]) cache.set(`${id}#0`, cache.get(`${id}#0`) ?? generar(id, 0)!.datos); },
    sonar(id, o = {}) {
      const rc = RECETAS[id];
      if (!rc) return null;
      const c = nucleo.ctx();
      if (!c) return null;
      const bus = nucleo.bus(o.bus ?? rc.bus);
      if (!bus) return null;
      const bucle = o.bucle ?? !!rc.bucle;
      const ab = buffer(c, id, o.variante ?? (bucle ? 0 : vuelta++ % VARIANTES));
      if (!ab) return null;
      try {
        const fuente = c.createBufferSource(), g = c.createGain();
        fuente.buffer = ab; fuente.loop = bucle;
        if (o.tono && o.tono !== 1) fuente.playbackRate.value = o.tono;
        g.gain.value = o.vol ?? 1;
        fuente.connect(g); g.connect(bus);
        fuente.start();
        return { parar() { try { fuente.stop(); } catch { /* ya parada */ } } };
      } catch { return null; }
    },
  };
}
