// dibujo-politica (N12): the decisions that keep a full world inside Quest's draw-call budget, pure (no three.js, no
// DOM) so tests can run them. Two of them: what the fog hides completely is not drawn, and copies of the same model
// are drawn together (one draw call per material for all of them). index.ts and lotes.ts apply them, only while the
// frame is drawn: outside that moment every object stays as it was (picking, maps, hands, footprints read it).

/** Fog this thick or more is the fog's colour in an 8-bit pixel (1/255 ≈ 0.996): nothing of the object shows. */
export const NIEBLA_TOTAL = 0.999;
/** Extra metres before cutting: each eye in XR is a few cm off the head, and the last frame's camera is used. */
export const MARGEN_NIEBLA_M = 1;
/** Copies of the same model (and colour) that stand still: from this many on, they are drawn as one instanced mesh. */
export const INSTANCIAR_DESDE = 4;
/** In a headset (draw calls are what Quest/Pico run out of, ×2 eyes) two identical copies are already drawn as one: it
 * costs nothing more per frame than the two meshes did (matrix compare, no upload while they stand still), and saves
 * one call per material per eye. Off the headset the threshold stays INSTANCIAR_DESDE: nothing there is bound by calls. */
export const INSTANCIAR_DESDE_VR = 2;
/** The threshold in force: `xr` = a headset session is presenting. */
export const instanciarDesde = (xr: boolean): number => (xr ? INSTANCIAR_DESDE_VR : INSTANCIAR_DESDE);

/** What the scene's fog looks like to these rules (three's Fog / FogExp2 have these fields). */
export type NieblaLeida = { isFog?: boolean; isFogExp2?: boolean; near?: number; far?: number; density?: number } | null | undefined;

/**
 * From which distance (m, from the eye) the fog covers everything: `far` for a linear fog (three r186 TSL:
 * `smoothstep(near, far, viewZ)` = 1 from `far` on), and where `1 − e^−(density·z)²` reaches NIEBLA_TOTAL for an
 * exponential one. No fog (or a fog pushed away) = Infinity: nothing is cut. three measures the fog along the view
 * axis (viewZ), never more than the straight distance, so cutting by the straight distance is always safe.
 */
export function lejosDeNiebla(f: NieblaLeida): number {
  if (!f) return Infinity;
  if (f.isFogExp2 || (f.density !== undefined && f.far === undefined)) {
    const d = f.density ?? 0;
    return d > 0 ? Math.sqrt(-Math.log(1 - NIEBLA_TOTAL)) / d : Infinity;
  }
  const far = f.far ?? Infinity;
  return Number.isFinite(far) && far > 0 ? far : Infinity;
}

/** A sphere (centre `dx, dy, dz` from the eye, `radio` m) lies wholly where the fog covers everything. */
export function tapadoPorNiebla(dx: number, dy: number, dz: number, radio: number, lejos: number): boolean {
  if (!(lejos < Infinity)) return false;
  const d = lejos + Math.max(0, radio) + MARGEN_NIEBLA_M;
  return dx * dx + dy * dy + dz * dz > d * d;
}

/** Which groups of copies are drawn instanced: those with at least `desde` members (fewer: each copy draws itself,
 * as before — a world with two benches looks and costs the same as yesterday). */
export function lotesQueSeInstancian(cuentas: ReadonlyMap<string, number>, desde = INSTANCIAR_DESDE): Set<string> {
  const out = new Set<string>();
  for (const [k, n] of cuentas) if (n >= desde) out.add(k);
  return out;
}

/** The draw calls a set of copies costs: `partes` = meshes (materials) of the baked model, `n` copies. */
export function llamadasDe(partes: number, n: number, desde = INSTANCIAR_DESDE): number {
  return n <= 0 ? 0 : n >= desde ? partes : partes * n;
}
