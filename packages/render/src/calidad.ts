// calidad (H12 + H8 caps): what each device tier draws by default and the most it may draw. Pure (no three.js, no
// DOM): tested in test/particulas.test.ts, which also checks these caps against limits.json (one source of truth for
// people, enforced for code). Decided by capability, never by browser name (AGENTS.md principle 2).

export type Nivel = "A" | "B" | "C" | "D"; // limits.json "devices": A desktop · B Quest/Pico in XR · C mid phone · D old phone/Chromebook
export type Sombras = "no" | "baja" | "media" | "alta";
export type Agua = "simple" | "reflejos";
export type Particulas = "pocas" | "normal" | "muchas";
/** The four knobs the settings menu shows (view.entorno.calidad). */
export type Calidad = { sombras: Sombras; agua: Agua; particulas: Particulas; hdr: boolean };

export const SOMBRAS: readonly Sombras[] = ["no", "baja", "media", "alta"];
export const AGUAS: readonly Agua[] = ["simple", "reflejos"];
export const PARTICULAS: readonly Particulas[] = ["pocas", "normal", "muchas"];

/** Defaults per tier: phones cold (no shadows, no reflections, few particles, no HDR light), Quest without extra passes. */
export const CALIDAD_POR_NIVEL: Record<Nivel, Calidad> = {
  A: { sombras: "media", agua: "reflejos", particulas: "normal", hdr: true },
  B: { sombras: "no", agua: "simple", particulas: "pocas", hdr: false },
  C: { sombras: "no", agua: "simple", particulas: "pocas", hdr: false },
  D: { sombras: "no", agua: "simple", particulas: "pocas", hdr: false },
};
/** The most a tier may ask for (what capacidades() offers; asking for more is clamped). */
export const TECHO_POR_NIVEL: Record<Nivel, Calidad> = {
  A: { sombras: "alta", agua: "reflejos", particulas: "muchas", hdr: true },
  B: { sombras: "baja", agua: "simple", particulas: "normal", hdr: true },
  C: { sombras: "baja", agua: "simple", particulas: "normal", hdr: true },
  D: { sombras: "no", agua: "simple", particulas: "pocas", hdr: false },
};
/** Particles per emitter and in total, per tier (limits.json: particles_per_emitter, particles_total). */
export const TOPE_PARTICULAS: Record<Nivel, { emisor: number; total: number }> = {
  A: { emisor: 2000, total: 12000 },
  B: { emisor: 300, total: 1500 },
  C: { emisor: 300, total: 1500 },
  D: { emisor: 120, total: 500 },
};
/** Fire lights at once per tier (limits.json dynamic_lights: D «1 sol» → no fire light). */
export const LUCES_FUEGO: Record<Nivel, number> = { A: 4, B: 2, C: 1, D: 0 };
export const FACTOR_PARTICULAS: Record<Particulas, number> = { pocas: 0.3, normal: 1, muchas: 2 };
export const SOMBRA_PX: Record<Sombras, number> = { no: 0, baja: 512, media: 1024, alta: 2048 };
/** HDR environment size (PMREM cube face): 256 everywhere (H4: «256 px en móvil»). */
export const HDR_PX = 256;
/** The sky baked into environment light: without its sun disc it is smooth, so a small cube is enough (and cheap to redo). */
export const CIELO_LUZ_PX = 64;
/** What the stylised water (agua-estilo.ts) draws, per tier and water choice. Every tier gets the flat colour bands, the
 * shore foam and the stepped fresnel toward the sky (a few ALU, no texture, no extra pass); more costly touches climb with
 * the tier: `olas` = most grid cells per side for vertex waves on big water (0 = flat), `espumaViva` = the foam breathes
 * and a broken second line runs to the shore, `lineas` = Wind Waker-like light streaks drifting on the surface,
 * `causticas` = fake caustic cells in the shallows, `destellos` = stepped sun glints (the «reflejos» choice). */
export type DetalleAgua = { olas: number; espumaViva: boolean; lineas: boolean; causticas: boolean; destellos: boolean };
export const DETALLE_AGUA: Record<Nivel, Record<Agua, DetalleAgua>> = {
  A: { simple: { olas: 48, espumaViva: true, lineas: true, causticas: true, destellos: false }, reflejos: { olas: 96, espumaViva: true, lineas: true, causticas: true, destellos: true } },
  // Quest in XR: stereo at 72-90 Hz is fill-bound, so per-pixel extras stay off; vertex waves are cheap (vertices, not pixels)
  B: { simple: { olas: 32, espumaViva: true, lineas: true, causticas: false, destellos: false }, reflejos: { olas: 32, espumaViva: true, lineas: true, causticas: false, destellos: false } },
  C: { simple: { olas: 24, espumaViva: true, lineas: true, causticas: false, destellos: false }, reflejos: { olas: 24, espumaViva: true, lineas: true, causticas: false, destellos: false } },
  D: { simple: { olas: 0, espumaViva: false, lineas: false, causticas: false, destellos: false }, reflejos: { olas: 0, espumaViva: false, lineas: false, causticas: false, destellos: false } },
};
/** The water detail for this tier and choice (a choice above the tier's ceiling gets the ceiling's). */
export function detalleAgua(n: Nivel, a: Agua): DetalleAgua {
  const t = TECHO_POR_NIVEL[n].agua;
  return { ...DETALLE_AGUA[n][AGUAS.indexOf(a) > AGUAS.indexOf(t) ? t : a] };
}
/** Water smaller than this (m, shorter side) stays flat: waves on a fountain or a pond look wrong and cost vertices. */
export const OLAS_DESDE_M = 12;

/** Animated elements (fire, water, dust) move only this near and on screen; farther they stand still (cold phones). */
export const ANIMAR_M = 40;
/** Farther than this an element is not drawn at all. */
export const DIBUJAR_M = 150;

export type Aparato = { mobile: boolean; deviceMemoryGB?: number; saveData?: boolean; xr?: boolean };
/** The tier of this device right now (inside an XR session it is B: stereo at 72 Hz). */
export function nivelDe(a: Aparato): Nivel {
  if (a.xr) return "B";
  if (a.saveData || (a.deviceMemoryGB ?? 8) <= 2) return "D";
  if (a.mobile) return "C";
  return "A";
}

const rango = <T>(lista: readonly T[], techo: T) => lista.slice(0, lista.indexOf(techo) + 1);
/** What this tier may choose (for the settings menu). */
export function capacidades(n: Nivel) {
  const t = TECHO_POR_NIVEL[n];
  return { nivel: n, sombras: rango(SOMBRAS, t.sombras), agua: rango(AGUAS, t.agua), particulas: rango(PARTICULAS, t.particulas), hdr: t.hdr, porDefecto: { ...CALIDAD_POR_NIVEL[n] }, topeParticulas: { ...TOPE_PARTICULAS[n] }, lucesFuego: LUCES_FUEGO[n] };
}

/** A wish (any subset) clamped to what the tier allows. */
export function acotarCalidad(n: Nivel, actual: Calidad, pedido: Partial<Calidad>): Calidad {
  const t = TECHO_POR_NIVEL[n];
  const tope = <T>(lista: readonly T[], v: T | undefined, techo: T, ahora: T): T => (v === undefined || !lista.includes(v) ? ahora : lista.indexOf(v) > lista.indexOf(techo) ? techo : v);
  return {
    sombras: tope(SOMBRAS, pedido.sombras, t.sombras, actual.sombras),
    agua: tope(AGUAS, pedido.agua, t.agua, actual.agua),
    particulas: tope(PARTICULAS, pedido.particulas, t.particulas, actual.particulas),
    hdr: pedido.hdr === undefined ? actual.hdr : pedido.hdr && t.hdr,
  };
}

/** How many particles an emitter gets: what it asks × the quality, capped per emitter and by what is left of the total. */
export function particulasPara(n: Nivel, c: Particulas, pide: number, enUso: number): number {
  const t = TOPE_PARTICULAS[n];
  return Math.max(0, Math.min(Math.round(pide * FACTOR_PARTICULAS[c]), t.emisor, t.total - enUso));
}
