// sonido (F5): how the electronic creatures sound. Birds chirp (2–5 short notes, a pattern and a pitch per breed), fireflies ping on each
// pulse of their light (pitch from the colour of the light, rarer = stranger), butterflies whir very faintly when one is within 4 m.
// EVERYTHING IS SYNTHESISED (no audio file) and almost free:
//  - ONE small pool of voices (oscillator + FM modulator + gain + stereo pan) built once and retriggered, never a node per sound:
//    cap per tier A 6 · B 4 · C 3 · D 0 (D builds no node at all). One extra whir chain (looped noise, shared buffer) on A and B.
//  - It does not create the audio engine: it uses the core's `ambiente` bus (audio/nucleo.ts, so the person's «Sonido → efectos» volume,
//    the ducking while someone talks, the limiter and the tab-hidden pause all apply), and builds nothing until the shared first gesture
//    has happened and the core runs.
//  - WHO sounds is F1's pure `habitantes` read again around the camera (cells cached per 120 s window: ~0.03 ms each, only when the camera
//    crosses a 32 m cell or the window changes); WHEN is closed form (the same trick as the shader's trajectory): a creature's calls/pulses are
//    a pure function of its id hash (birds) or of its light pattern + phase (fireflies) and of the world clock, so two people at the same
//    spot hear the same chirps at the same moment with no network. A tick (≤ 10 Hz) schedules the next 0.25 s on the audio clock.
//  - Birds by day and dusk, fireflies and (almost) nothing else at night, butterflies by day. Out of range or on the wrong hour: no work
//    beyond one distance test per creature in the cells around.
// COPIED (ideas): a voice pool with stealing by distance (any game audio middleware), «lookahead scheduling» of the Web Audio clock
// (Chris Wilson, «A tale of two clocks»), 2-operator FM for metal / bell timbres (Chowning). CHANGED: events come from a formula, not a
// timer; the pool never grows. No third-party code.
import type { Nivel } from "../calidad.ts";
import type { Bus } from "../audio/nucleo.ts";
import { habitantes, ventanaDe, fundido, faseDelDia, CELDA_M, VENTANA_S, trayectoria } from "../../../relieve/src/fauna.ts";
import type { TablaFauna, Habitante, Especie, Grupo } from "../../../relieve/src/fauna.ts";
import type { Zona } from "./terreno.ts";

/** Voices of the pool per tier (0 = silent: no node is created). */
export const VOCES_POR_NIVEL: Record<Nivel, number> = { A: 6, B: 4, C: 3, D: 0 };
/** Hearing range (m) per group. */
export const ALCANCE_M: Record<Grupo, number> = { pajaro: 40, luciernaga: 12, mariposa: 4 };
/** Tick period (s) and how far ahead (s) one tick schedules on the audio clock. */
export const TICK_S = 0.1, ADELANTE_S = 0.25;
/** Bus of the core the fauna plays on: the ambient one (volume «efectos», ducked a little while people talk). */
export const BUS_FAUNA: Bus = "ambiente";

// ------------------------------------------------------------------------------------------------------------------ pure scheduling
/** FNV-1a of a string → uint32. */
export function hashTexto(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** Two uint32 → [0, 1) (a small integer mixer; deterministic on every machine). */
export function mezcla(a: number, k: number): number {
  let x = (a ^ Math.imul(k + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0; x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

export type PerfilAve = { base: number; notas: number[]; durNota: number; paso: number; onda: OscillatorType; fm: number; ratio: number; pico: number; periodo: number };
/** What one breed sounds like, from its place among the birds of the table (`orden`), its size and its rarity: a pitch (small = high), 2–5 notes,
 *  one of four contours (rising, falling, trill, arch), a timbre and a call period. Pure. */
export function perfilAve(e: Pick<Especie, "tamano" | "rareza">, orden: number): PerfilAve {
  const rar = RAR[e.rareza] ?? 0;
  const fino = 1 + 0.06 * (((orden * 5) % 7) - 3) / 3;
  const base = Math.min(4800, Math.max(700, (5200 / (1 + 2.2 * e.tamano)) * fino));
  const n = 2 + ((orden * 5 + Math.round(rar * 3)) % 4);
  const paso = 2 + (orden % 3), forma = orden % 4, notas: number[] = [];
  for (let i = 0; i < n; i++) notas.push(forma === 0 ? i * paso : forma === 1 ? -i * paso : forma === 2 ? (i % 2) * paso * 1.5 : (i < n / 2 ? i : n - 1 - i) * paso);
  return {
    base, notas, durNota: 0.04 + 0.05 * Math.min(1, e.tamano), paso,
    onda: (["triangle", "square", "triangle", "sawtooth"] as const)[orden % 4], fm: 0.1 + 0.5 * rar, ratio: 2.01 + 0.5 * (orden % 3),
    pico: orden % 4 === 1 ? 0.22 : 0.32, periodo: 4 + 0.6 * ((orden * 7) % 10) + 3 * (1 - rar),
  };
}
const RAR: Record<string, number> = { comun: 0, rara: 1 / 3, epica: 2 / 3, legendaria: 1 };
/** Frequency (Hz) of note `i` of a bird's call. */
export const frecuenciaNota = (p: PerfilAve, i: number): number => p.base * 2 ** (p.notas[i] / 12);

/** Next start (window-clock seconds, ≥ `desde`) of a bird's call. Period P and offset come from the id hash; each call is jittered by up to 35 % of P. */
export function proximaLlamada(hid: number, periodo: number, desde: number): number {
  const off = mezcla(hid, 1) * periodo, k0 = Math.floor((desde - off) / periodo) - 1;
  for (let k = k0; k <= k0 + 3; k++) { const s = off + k * periodo + mezcla(hid, 100 + (k & 0xffff)) * 0.35 * periodo; if (s >= desde) return s; }
  return desde + periodo;
}

/** Light pulses per pattern: period (s, at tempo 1) and where in the period the light peaks (0…1), as in `pulsoOps` (mariposas.ts). */
export const PICOS_LUZ: Record<string, { P: number; pk: number[] }> = {
  fijo: { P: 7, pk: [0] }, latido: { P: 1.5, pk: [0.08, 0.3] }, parpadeo: { P: 2.2, pk: [0.06] }, onda: { P: 2.8, pk: [0.25] }, respiro: { P: 5, pk: [0.5] },
  estrobo: { P: 2.6, pk: [0, 0.08, 0.16] }, morse: { P: 4.2, pk: [0.5 / 14, 3.5 / 14, 6.5 / 14, 8.5 / 14] }, prisma: { P: 5, pk: [0] },
};
/** Next light peak (window-clock seconds, ≥ `desde`) of a firefly with pattern `luz`, phase `f` (0…1) and tempo `rit` (1 − 0.4·rarity). */
export function proximoPulso(luz: string, f: number, rit: number, desde: number): number {
  const L = PICOS_LUZ[luz] ?? PICOS_LUZ.parpadeo, k0 = Math.floor((desde * rit) / L.P + f) - 1;
  let mejor = Infinity;
  for (let k = k0; k <= k0 + 2; k++) for (let j = 0; j < L.pk.length; j++) { const t = (L.P * (k + L.pk[j] - f)) / rit; if (t >= desde && t < mejor) mejor = t; }
  return mejor;
}
/** Hue 0…1 of a colour (hex). */
export function tonoDe(hex: number): number {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h / 6;
}
export type PerfilLuciernaga = { freq: number; durMs: number; indice: number; ratio: number; deslizar: number; pico: number; luz: string; rit: number };
/** A firefly's ping: a sine at 700–3700 Hz by the hue of its light (red low, magenta high); rarer ones add an FM partial (index and an inharmonic
 *  ratio grow with rarity) and the legendary ones slide down. Pure. */
export function perfilLuciernaga(e: Pick<Especie, "colores" | "rareza" | "luz">): PerfilLuciernaga {
  const rar = RAR[e.rareza] ?? 0, tono = (tonoDe(e.colores.luz) + 0.1) % 1; // +0.1: reds sit at both ends of the hue circle, they all go low
  return { freq: 700 * 2 ** (2.4 * tono), durMs: 30 + 20 * (1 - rar), indice: rar * 3, ratio: 1.5 + 2 * rar, deslizar: rar >= 1 ? 0.6 : rar > 0.5 ? 0.85 : 1, pico: 0.2 + 0.06 * rar, luz: e.luz, rit: 1 - 0.4 * rar };
}
/** How dark the world is for the fireflies (same curve as mariposas.ts `oscuridad`, without importing three). */
export function oscuro(hora: number): number {
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const h = ((hora % 24) + 24) % 24;
  if (h >= 5.5 && h < 8) return 1 - ss(5.5, 8, h);
  if (h >= 17.5 && h < 20.5) return ss(17.5, 20.5, h);
  return h >= 8 && h < 17.5 ? 0 : 1;
}
/** Fall-off to 0 at the range (k^1.5: close things are clear, far ones a whisper). */
export const atenuacion = (d: number, alcance: number): number => { const k = Math.max(0, 1 - d / alcance); return k * Math.sqrt(k); };

// ------------------------------------------------------------------------------------------------------------------ the engine side
export type HSonido = {
  /** The audio core (audio/nucleo.ts `audio()`); only `listo`, `ctx`, `bus` and `estado` are used. */
  nucleo: { listo(): boolean; ctx(): AudioContext | null; bus(n: Bus): GainNode | null; estado(): { gesto: boolean } };
  nivel: Nivel;
  camara: { matrixWorld: { elements: ArrayLike<number> }; updateWorldMatrix?: (a: boolean, b: boolean) => void };
  tabla: TablaFauna;
  fauna: { semilla: number; densidad: number; especies?: readonly string[]; alturaEn: (x: number, z: number) => number; zonaEn: (x: number, z: number) => Zona; hora: () => number };
  /** Test hook: is the page hidden? Default `document.hidden`. */
  oculta?: () => boolean;
};
export type EstadisticasSonido = { nodos: number; voces: number; vocesActivas: number; eventos: number; ticks: number; msUltimo: number; msMedio: number; conectado: boolean };

type Cand = { x: number; y: number; z: number; fase: number; hid: number; grupo: Grupo; esp: Especie; ave?: PerfilAve; luci?: PerfilLuciernaga; vuelo: Especie["vuelo"]; hab: Habitante };
const MAX_EV = 24, REPOSO_S = 2.5;

export function crearSonidoFauna(h: HSonido) {
  const cap = VOCES_POR_NIVEL[h.nivel] ?? 0;
  const lista = h.tabla.especies.filter((e) => !h.fauna.especies?.length || h.fauna.especies.includes(e.id));
  const orden: Record<string, number> = { pajaro: 0, luciernaga: 0, mariposa: 0 }, perfiles = new Map<string, { ave?: PerfilAve; luci?: PerfilLuciernaga }>();
  for (const e of h.tabla.especies) { const o = orden[e.grupo]++; perfiles.set(e.id, e.grupo === "pajaro" ? { ave: perfilAve(e, o) } : e.grupo === "luciernaga" ? { luci: perfilLuciernaga(e) } : {}); }
  void lista;
  const porId = new Map(h.tabla.especies.map((e) => [e.id, e] as const));

  // pool (built once, lazily at the first running tick)
  type Voz = { car: OscillatorNode; mod: OscillatorNode; modG: GainNode; env: GainNode; pan: StereoPannerNode | null };
  let ctx: AudioContext | null = null, trim: GainNode | null = null, voces: Voz[] = [], nodos = 0, destino: GainNode | null = null, conectado = false, muerto = false;
  let whir: { src: AudioBufferSourceNode; bp: BiquadFilterNode; amp: GainNode; am: GainNode; lfo: OscillatorNode; lfoG: GainNode; pan: StereoPannerNode | null } | null = null;
  const ocupada = new Float64Array(cap), distVoz = new Float64Array(cap), todos: AudioNode[] = [];
  const nodo = <T extends AudioNode>(n: T): T => { nodos++; todos.push(n); return n; };

  function construir(): boolean {
    if (ctx || muerto || cap === 0) return !!ctx;
    const c = h.nucleo.ctx(), bus = h.nucleo.bus(BUS_FAUNA);
    if (!c || !bus) return false;
    ctx = c; destino = bus;
    trim = nodo(c.createGain()); trim.gain.value = 0.9;
    const par = (): StereoPannerNode | null => (typeof c.createStereoPanner === "function" ? nodo(c.createStereoPanner()) : null);
    for (let i = 0; i < cap; i++) {
      const car = nodo(c.createOscillator()), mod = nodo(c.createOscillator()), modG = nodo(c.createGain()), env = nodo(c.createGain()), pan = par();
      env.gain.value = 0; modG.gain.value = 0; car.frequency.value = 440; mod.frequency.value = 440;
      mod.connect(modG); modG.connect(car.frequency); car.connect(env);
      if (pan) { env.connect(pan); pan.connect(trim); } else env.connect(trim);
      car.start(); mod.start();
      voces.push({ car, mod, modG, env, pan });
    }
    if (h.nivel === "A" || h.nivel === "B") {
      // one second of white noise shared by the whir (made once, a tiny 44 kB buffer at 11 kHz would also do: this is 1 s at the context's rate)
      const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate)), c.sampleRate), d = buf.getChannelData(0);
      let s = 0x1234567; for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
      const src = nodo(c.createBufferSource()), bp = nodo(c.createBiquadFilter()), amp = nodo(c.createGain()), am = nodo(c.createGain()), lfo = nodo(c.createOscillator()), lfoG = nodo(c.createGain()), pan = par();
      src.buffer = buf; src.loop = true; bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 1.2; amp.gain.value = 0; am.gain.value = 0.5; lfoG.gain.value = 0.5; lfo.frequency.value = 7;
      src.connect(bp); bp.connect(amp); amp.connect(am); lfo.connect(lfoG); lfoG.connect(am.gain);
      if (pan) { am.connect(pan); pan.connect(trim); } else am.connect(trim);
      src.start(); lfo.start();
      whir = { src, bp, amp, am, lfo, lfoG, pan };
    }
    return true;
  }
  function conectar(si: boolean): void {
    if (!trim || !destino || si === conectado) return;
    try { if (si) trim.connect(destino); else trim.disconnect(); conectado = si; } catch { /* already in that state */ }
  }

  // who is around: cells of F1, kept per window, rebuilt only when the camera crosses a cell or the window changes
  let ventana = NaN, cxA = NaN, czA = NaN, cands: Cand[] = [], horaV = 12;
  const R = Math.ceil(ALCANCE_M.pajaro / CELDA_M);
  function leer(cx0: number, cz0: number, v: number): void {
    cands = [];
    const ids = lista.map((e) => e.id);
    for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const vivos = habitantes(h.fauna.semilla, { cx: cx0 + dx, cz: cz0 + dz }, v, h.tabla, { zonaEn: h.fauna.zonaEn, alturaEn: h.fauna.alturaEn, hora: horaV, densidad: h.fauna.densidad, nivel: h.nivel, especies: ids });
      for (const a of vivos) {
        const e = porId.get(a.especie); if (!e) continue;
        const p = perfiles.get(e.id) ?? {};
        cands.push({ x: a.x, y: a.y, z: a.z, fase: a.fase, hid: hashTexto(a.id), grupo: e.grupo, esp: e, ave: p.ave, luci: p.luci, vuelo: e.vuelo, hab: a });
      }
    }
  }

  // tick state
  const evK = new Int8Array(MAX_EV), evT = new Float64Array(MAX_EV), evD = new Float64Array(MAX_EV), evP = new Float64Array(MAX_EV), evA = new Float64Array(MAX_EV), evC: (Cand | null)[] = new Array(MAX_EV).fill(null);
  const pos = { x: 0, y: 0, z: 0 };
  let ultimoTick = -1e9, horizonte = -1e9, ultimoEvento = -1e9, ticks = 0, eventos = 0, msUltimo = 0, msSuma = 0, vocesActivas = 0, whirObj = 0;

  function dispararAve(v: number, c: Cand, t: number, g: number, pan: number): void {
    const p = c.ave!, vz = voces[v], dur = p.durNota, paso = dur * 1.55, n = p.notas.length, pico = p.pico * g * (1 + 0.05 * Math.min(3, c.hab.n - 1));
    vz.car.type = p.onda;
    ocupada[v] = t + n * paso + 0.12;
    if (vz.pan) vz.pan.pan.setValueAtTime(pan, t);
    vz.env.gain.cancelScheduledValues(t); vz.env.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const f = frecuenciaNota(p, i), s = t + i * paso, det = (((c.hid >> i) & 3) - 1.5) * 14; // quantised detune: a digital, bit-crushed wobble
      vz.car.frequency.setValueAtTime(f, s); vz.car.detune.setValueAtTime(det, s);
      vz.mod.frequency.setValueAtTime(f * p.ratio, s); vz.modG.gain.setValueAtTime(f * p.fm, s);
      vz.env.gain.linearRampToValueAtTime(pico * (1 - 0.06 * i), s + 0.004);
      vz.env.gain.linearRampToValueAtTime(0.0001, s + dur);
    }
    vz.env.gain.setValueAtTime(0, ocupada[v]);
  }
  function dispararLuci(v: number, c: Cand, t: number, g: number, pan: number): void {
    const p = c.luci!, vz = voces[v], dur = p.durMs / 1000, pico = p.pico * g;
    vz.car.type = "sine"; ocupada[v] = t + dur + 0.08;
    if (vz.pan) vz.pan.pan.setValueAtTime(pan, t);
    vz.car.detune.setValueAtTime(0, t);
    vz.car.frequency.setValueAtTime(p.freq, t); if (p.deslizar < 1) vz.car.frequency.exponentialRampToValueAtTime(p.freq * p.deslizar, t + dur);
    vz.mod.frequency.setValueAtTime(p.freq * p.ratio, t); vz.modG.gain.setValueAtTime(p.freq * p.indice * 0.5, t);
    vz.env.gain.cancelScheduledValues(t); vz.env.gain.setValueAtTime(0, t);
    vz.env.gain.linearRampToValueAtTime(pico, t + 0.004); vz.env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    vz.env.gain.setValueAtTime(0, ocupada[v]);
  }

  /** Once per frame with the camera and the world clock (seconds): does nothing except every ~0.1 s. */
  function actualizar(camara: HSonido["camara"] | undefined, tReloj: number): void {
    if (cap === 0 || muerto) return;
    if (tReloj - ultimoTick < TICK_S && tReloj >= ultimoTick) return;
    ultimoTick = tReloj;
    if (!h.nucleo.listo()) { horizonte = -1e9; if (h.nucleo.estado().gesto && !ctx) { /* the shared gesture happened: the core builds itself on first use */ h.nucleo.ctx(); } if (!h.nucleo.listo()) return; }
    if ((h.oculta ?? (() => typeof document !== "undefined" && document.hidden === true))()) { horizonte = -1e9; return; }
    if (!construir() || !ctx) return;
    const t0 = performance.now(), cam = camara ?? h.camara;
    cam.updateWorldMatrix?.(true, false);
    const me = cam.matrixWorld.elements, cxm = me[12], czm = me[14], rx = me[0], rz = me[2];
    const hora = h.fauna.hora(), fase = faseDelDia(hora), osc = oscuro(hora), v = ventanaDe(tReloj), cx0 = Math.floor(cxm / CELDA_M), cz0 = Math.floor(czm / CELDA_M);
    if (v !== ventana || cx0 !== cxA || cz0 !== czA) { if (v !== ventana) horaV = hora; ventana = v; cxA = cx0; czA = cz0; leer(cx0, cz0, v); }
    const tl = tReloj - v * VENTANA_S, desde = Math.max(horizonte, tl - 0.05), hasta = tl + ADELANTE_S;
    horizonte = hasta;
    const fun = fundido(tl);
    let ne = 0, mejorMar = 1e9, mejorMarPan = 0, mejorMarC: Cand | null = null;
    const pajaros = fase !== "noche", luci = osc >= 0.5, mari = osc < 0.5;
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i], g = c.grupo, alc = ALCANCE_M[g];
      if (g === "pajaro" ? !pajaros : g === "luciernaga" ? !luci : !mari) continue;
      const rad = c.vuelo.radio * 0.7 + alc, dx0 = c.x - cxm, dz0 = c.z - czm;
      if (dx0 * dx0 + dz0 * dz0 > rad * rad) continue;
      let t = Infinity;
      if (g === "pajaro") t = proximaLlamada(c.hid, c.ave!.periodo, desde);
      else if (g === "luciernaga") t = proximoPulso(c.luci!.luz, c.fase, c.luci!.rit, desde);
      if (g !== "mariposa" && t >= hasta) continue;
      trayectoria(c.hab, c.esp, tl, pos);
      const dx = pos.x - cxm, dz = pos.z - czm, dy = pos.y - me[13], d = Math.hypot(dx, dz, dy);
      if (d >= alc) continue;
      const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / Math.hypot(dx, dz) || 0)) * Math.min(1, Math.hypot(dx, dz) / 2) : 0;
      if (g === "mariposa") { if (d < mejorMar) { mejorMar = d; mejorMarPan = pan; mejorMarC = c; } continue; }
      if (ne >= MAX_EV) continue;
      evK[ne] = g === "pajaro" ? 0 : 1; evT[ne] = t; evD[ne] = d; evP[ne] = pan; evA[ne] = atenuacion(d, alc) * fun; evC[ne] = c; ne++;
    }
    const ahoraCtx = ctx.currentTime, activo = ne > 0 || mejorMarC !== null;
    if (activo) { ultimoEvento = tReloj; conectar(true); }
    else if (tReloj - ultimoEvento > REPOSO_S) conectar(false);
    // the nearest events first; each takes a free voice, or steals the farthest busy one if it is nearer
    for (let k = 0; k < ne; k++) {
      let b = k; for (let q = k + 1; q < ne; q++) if (evD[q] < evD[b]) b = q;
      if (b !== k) { const a = evK[k], bT = evT[k], bD = evD[k], bP = evP[k], bA = evA[k], bC = evC[k]; evK[k] = evK[b]; evT[k] = evT[b]; evD[k] = evD[b]; evP[k] = evP[b]; evA[k] = evA[b]; evC[k] = evC[b]; evK[b] = a; evT[b] = bT; evD[b] = bD; evP[b] = bP; evA[b] = bA; evC[b] = bC; }
      const tc = ahoraCtx + Math.max(0, evT[k] - tl);
      let libre = -1, peor = -1, peorD = -1;
      for (let q = 0; q < cap; q++) { if (ocupada[q] <= tc) { libre = q; break; } if (distVoz[q] > peorD) { peorD = distVoz[q]; peor = q; } }
      if (libre < 0) { if (peorD > evD[k] && peor >= 0) libre = peor; else continue; }
      distVoz[libre] = evD[k]; eventos++;
      if (evK[k] === 0) dispararAve(libre, evC[k]!, tc, evA[k], evP[k]); else dispararLuci(libre, evC[k]!, tc, evA[k], evP[k]);
    }
    vocesActivas = 0; for (let q = 0; q < cap; q++) if (ocupada[q] > ahoraCtx) vocesActivas++;
    if (whir) {
      const tgt = mejorMarC ? 0.035 * atenuacion(mejorMar, ALCANCE_M.mariposa) * fun : 0;
      if (mejorMarC) {
        const beat = 3 + 3 * Math.min(1, Math.max(0, (0.3 - mejorMarC.esp.tamano) / 0.16)); // wing beat Hz (big = slow)
        whir.lfo.frequency.setTargetAtTime(beat * 2, ahoraCtx, 0.05); whir.bp.frequency.setTargetAtTime(1800 + 1400 * Math.min(1, 0.1 / mejorMarC.esp.tamano), ahoraCtx, 0.05);
        if (whir.pan) whir.pan.pan.setTargetAtTime(mejorMarPan, ahoraCtx, 0.05);
      }
      whir.amp.gain.setTargetAtTime(tgt, ahoraCtx, 0.08); whirObj = tgt;
    }
    ticks++; msUltimo = performance.now() - t0; msSuma += msUltimo;
  }

  function dispose(): void {
    if (muerto) return;
    muerto = true;
    for (const v of voces) { try { v.car.stop(); v.mod.stop(); } catch { /* not started */ } }
    if (whir) { try { whir.src.stop(); whir.lfo.stop(); } catch { /* not started */ } }
    for (const n of todos) { try { n.disconnect(); } catch { /* already apart */ } }
    todos.length = 0; voces = []; whir = null; conectado = false; trim = null; destino = null; cands = []; ctx = null;
  }

  return {
    actualizar, dispose,
    /** Pool numbers: nodes built (never grows), voices, voices sounding now, events scheduled, ticks and their CPU. */
    estadisticas(): EstadisticasSonido { return { nodos, voces: voces.length, vocesActivas, eventos, ticks, msUltimo, msMedio: ticks ? msSuma / ticks : 0, conectado }; },
    get tope(): number { return cap; },
    get ganaciaMariposa(): number { return whirObj; },
  };
}
export type SonidoFauna = ReturnType<typeof crearSonidoFauna>;
