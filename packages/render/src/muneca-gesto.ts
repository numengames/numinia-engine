// Rediseño v2 (story E, maqueta p6): when the wrist watch shows, as pure numbers (no three.js, tested in node). You
// turn the BACK of your menu hand towards your eyes, as when you look at a watch — the back of the wrist faces you,
// close, inside your view — and the watch fades in; lower the hand and it fades out. Thresholds open fast and close
// slow (Meta's hysteresis habit) so it does not flicker while you move; the system's own «palm pinch» is never part of
// it. The watch's buttons are pressed with the OTHER hand (fingertip or ray + trigger): muneca.ts, menu-vr.ts.
// First written in U6/J13b (11d2637) as a read-only watch; the numbers are the same.

/** To open, all must hold for `ms`: back-of-hand · (wrist → eye) ≥ dorso (cos 60°), wrist inside the view cone, wrist near.
 * v1 (the watch must be easy to find): the cone went 35° → 45° and the hold 300 → 200 ms. Why: looking at a watch you drop
 * your EYES to the wrist more than you tilt your head, and the cone is measured from the head's direction, so 35° missed
 * the natural glance; 300 ms felt like the gesture had failed. What stops it from opening by accident: the back must still
 * face the eyes within 60°, the wrist must be 0.2–0.65 m away, and a hand at the chest (wrist ≥ 53° below the gaze) or
 * hanging (≥ 0.65 m, ≥ 70° below) stays outside (test/vr-muneca.test.ts). The worst a false opening does is show the
 * 12 cm disc (the menu opens only when «Menú» is pressed) and it fades when the back turns away. Not measured on a Quest. *
 * v11 (QA on a Quest, 2026-10-22: «hay que levantarlo como 10 centímetros… tienes que poderlo ver así»): the watch only
 * showed with the wrist ~10 cm HIGHER than the pose in which you read a real watch. That pose, with the upper arm hanging
 * and the forearm raised: wrist 0.20–0.30 m ahead of the eyes, ~0.10 m to the side and 0.22–0.40 m under them (45–55°
 * below the gaze, head hardly tilted) — at or just outside a 45° cone. The cone went 45° → 55°: with the head level, a
 * wrist 0.20–0.30 m ahead now opens the watch 9.5–13.5 cm lower than before (test/vr-muneca.test.ts bisects both limits).
 * A wider cone alone would also let a stretched arm open it (pointing with the controller, back of the hand up), so the far
 * limit went 0.65 → 0.60 m: a watch is read at 0.3–0.55 m, a straight arm is 0.65–0.75 m. Still closed: hand at the chest
 * (0.5 under, 58° down, 0.64 m), arm hanging, arm stretched out, palm towards the eyes. The back-of-hand limit (60°) is
 * untouched. Not measured on a Quest. */
export const ABRIR = { dorso: 0.5, conoGrados: 55, cercaMinM: 0.2, cercaMaxM: 0.6, ms: 200 } as const;
/** To close: the back turns away (cos 75°) for `ms`, or the wrist leaves a wider cone for `fueraMs` (kept 15° wider than ABRIR: 55° → 70°). */
export const CERRAR = { dorso: 0.26, conoGrados: 70, ms: 400, fueraMs: 1000 } as const;
/** A tracked wrist that stops arriving keeps the watch where it was this long, then hides it. */
export const PERDIDA_MS = 1000;

/** What the view measures each frame for the menu hand (world units). */
export type Muestra = {
  /** Cosine between the BACK of the hand's outward normal and the unit vector wrist → eye (1 = the back faces you). */
  dorso: number;
  /** Angle (degrees) between where the head looks and the direction eye → wrist. */
  anguloGrados: number;
  /** Eye to wrist, metres. */
  distanciaM: number;
};

export type EstadoGesto = {
  abierto: boolean;
  /** When the current «wants to change» streak began (ms); null = no streak (0 is a valid clock reading). */
  desde: number | null;
  /** When the hand was last seen (ms), 0 = never. */
  visto: number;
};

export const inicio = (): EstadoGesto => ({ abierto: false, desde: null, visto: 0 });

/** True when this sample alone would show the watch. */
export function cumpleAbrir(m: Muestra): boolean {
  return m.dorso >= ABRIR.dorso && m.anguloGrados <= ABRIR.conoGrados && m.distanciaM >= ABRIR.cercaMinM && m.distanciaM <= ABRIR.cercaMaxM;
}

/** One step of the gesture: the previous state, this frame's sample (null = hand not tracked) and the clock (ms). */
export function paso(e: EstadoGesto, m: Muestra | null, ahora: number): EstadoGesto {
  if (!m) { // hand lost: a shown watch waits PERDIDA_MS before hiding; a hidden one stays hidden
    if (e.abierto && e.visto && ahora - e.visto >= PERDIDA_MS) return { abierto: false, desde: null, visto: e.visto };
    return { ...e, desde: e.abierto ? e.desde : null };
  }
  if (!e.abierto) {
    if (!cumpleAbrir(m)) return { abierto: false, desde: null, visto: ahora };
    const desde = e.desde ?? ahora, abre = ahora - desde >= ABRIR.ms;
    return { abierto: abre, desde: abre ? null : desde, visto: ahora };
  }
  const girada = m.dorso < CERRAR.dorso, fuera = m.anguloGrados > CERRAR.conoGrados;
  if (!girada && !fuera) return { abierto: true, desde: null, visto: ahora };
  const desde = e.desde ?? ahora, lleva = ahora - desde;
  if ((girada && lleva >= CERRAR.ms) || (fuera && lleva >= CERRAR.fueraMs)) return { abierto: false, desde: null, visto: ahora };
  return { abierto: true, desde, visto: ahora };
}

/** The back of the hand's outward normal in the input's own space. For a controller, the grip's X axis points out of
 * the back of the hand (WebXR grip space: +X is perpendicular to the palm, to the right of a RIGHT hand), so the palm
 * faces −X on the right hand and +X on the left and the BACK the opposite; for a tracked hand, the wrist joint's +Y
 * leaves through the back of the hand. CONFIRM THE SIGNS ON THE QUEST before trusting them (not yet measured). */
export function normalDorsoLocal(lado: "izq" | "der", esMano: boolean): [number, number, number] {
  if (esMano) return [0, 1, 0];
  return lado === "der" ? [1, 0, 0] : [-1, 0, 0];
}
