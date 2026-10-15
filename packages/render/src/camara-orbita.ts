// camara-orbita (N1): the camera's arithmetic. Pure (no DOM, no three.js): testable in Node like power.ts.
// Angles in radians. yaw 0 = looking along -z (the camera behind the avatar, at +z); + turns left (three's rotation.y,
// Euler "YXZ"). pitch + = the camera above its pivot looking down. dist 0 = first person: the camera IS the pivot.
// Play mode: the pivot is your avatar's eye. Build mode: the pivot moves freely (an offset from your avatar's eye, so
// walking carries the view along). Two poses: `meta` (where input wants the camera) and `ahora` (what is drawn, which
// chases `meta` smoothly and stops exactly on it, so a still camera costs nothing: the power policy can rest).

export type Punto = { x: number; y: number; z: number };
export type ModoCamara = "juego" | "construir";
/** Where the camera is (`x y z`), where it looks (unit `fx fy fz`), and whether it sits inside your own body. */
export type Pose = { x: number; y: number; z: number; fx: number; fy: number; fz: number; dentro: boolean };

const G = Math.PI / 180;
export const CAMARA = {
  ojo: 1.6,                                                     // eye height over the feet (m): the play pivot
  juego: { cerca: 1.5, lejos: 20, inclinacion: [-80 * G, 80 * G] },   // third person; closer = first person (0)
  construir: { cerca: 0.5, lejos: 80, inclinacion: [-60 * G, 89 * G] },
  inicio: { yaw: 0, pitch: 30 * G, dist: 10.4 },                // ≈ the old fixed camera: 5.2 m over the eye, 9 m back
  distConstruir: 8,                                             // entering build mode closer than this → this
  suelo: 0.25,                                                  // the camera never goes under this height
  rapidez: { giro: 22, mover: 11 },                             // smoothing (1/s): angles; distance and pivot
  rueda: 0.0015,                                                // zoom per wheel pixel: one notch (100 px) ≈ ×1.16
  cursorLejos: 200,                                             // zoom to cursor: farther ground points are not used
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** N1: a movement intention in the camera's frame (x right, z back: W = z -1) turned into the world frame for a
 * camera at `yaw`. Longer than 1 (two keys) is shortened first, so the int8 axes never clip the direction. */
export function haciaMundo(x: number, z: number, yaw: number): [number, number] {
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  if (!yaw) return [x, z];
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x * c + z * s, z * c - x * s];
}

/** Unit direction of the ray through a screen point (`nx ny` in -1..1, +y up) of a camera at `yaw pitch`. */
export function rayo(nx: number, ny: number, fovDeg: number, aspect: number, yaw: number, pitch: number): Punto {
  const t = Math.tan((fovDeg * G) / 2), a = nx * t * aspect, b = ny * t;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // forward (-sy cp, -sp, -cy cp) + right (cy, 0, -sy) * a + up (-sy sp, cp, -cy sp) * b
  const x = -sy * cp + cy * a - sy * sp * b, y = -sp + cp * b, z = -cy * cp - sy * a - cy * sp * b;
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

export function crearOrbita() {
  const meta = { yaw: CAMARA.inicio.yaw, pitch: CAMARA.inicio.pitch, dist: CAMARA.inicio.dist, ox: 0, oy: 0, oz: 0 };
  const ahora = { ...meta };
  let modo: ModoCamara = "juego";
  let distJuego = meta.dist;          // the play distance to come back to after building
  let terceraAntes = meta.dist;       // the third-person distance to come back to from first person (key V)
  const rango = () => CAMARA[modo];
  const ojoDe = (pies: Punto) => pies.y + CAMARA.ojo;

  /** The drawn pivot (world) for the avatar's feet at `pies`; never under the ground. */
  function pivote(pies: Punto, p: typeof meta = ahora): Punto {
    return { x: pies.x + p.ox, y: Math.max(CAMARA.suelo, ojoDe(pies) + p.oy), z: pies.z + p.oz };
  }
  const limitarPivote = (pies: Punto) => { meta.oy = Math.max(meta.oy, CAMARA.suelo - ojoDe(pies)); };

  const o = {
    get modo(): ModoCamara { return modo; },
    /** The poses, for checks and for the DOM side (read only). */
    meta: meta as Readonly<typeof meta>,
    ahora: ahora as Readonly<typeof ahora>,

    orbitar(dYaw: number, dPitch: number): void {
      const [a, b] = rango().inclinacion;
      meta.yaw += dYaw;
      meta.pitch = clamp(meta.pitch + dPitch, a, b);
    },

    /** Multiply the distance by `f` (< 1 closer). Play: at the near limit one more step in = first person (0), and
     * one step out of first person = the near limit. Build: never first person. Returns the ratio really applied. */
    acercar(f: number): number {
      const r = rango(), d0 = meta.dist;
      let d: number;
      if (modo === "juego" && f < 1 && d0 <= r.cerca + 1e-6) d = 0;
      else if (modo === "juego" && d0 === 0) d = f > 1 ? r.cerca : 0;
      else d = clamp(d0 * f, r.cerca, r.lejos);
      meta.dist = d;
      if (d > 0) terceraAntes = d;
      return d0 > 0 ? d / d0 : 1;
    },

    /** Build mode: zoom keeping the world point `P` (under the cursor) still on screen — the whole camera scales
     * about `P`. Without `P` it zooms toward the pivot. At the near limit it keeps going: the pivot walks forward. */
    acercarHacia(f: number, P: Punto | null, pies: Punto): void {
      const d0 = meta.dist, s = o.acercar(f);
      if (modo !== "construir") return;
      if (P && s !== 1) {
        const p = pivote(pies, meta);
        meta.ox = P.x + (p.x - P.x) * s - pies.x;
        meta.oy = P.y + (p.y - P.y) * s - ojoDe(pies);
        meta.oz = P.z + (p.z - P.z) * s - pies.z;
      } else if (f < 1 && s === 1) {
        const r = rayo(0, 0, 60, 1, meta.yaw, meta.pitch), paso = d0 * (1 - f);
        meta.ox += r.x * paso; meta.oy += r.y * paso; meta.oz += r.z * paso;
      }
      limitarPivote(pies);
    },

    /** Build mode: move the pivot along the screen (metres to the right and up of the camera). */
    panear(derecha: number, arriba: number, pies: Punto): void {
      if (modo !== "construir") return;
      const cy = Math.cos(meta.yaw), sy = Math.sin(meta.yaw), cp = Math.cos(meta.pitch), sp = Math.sin(meta.pitch);
      meta.ox += cy * derecha - sy * sp * arriba;
      meta.oy += cp * arriba;
      meta.oz += -sy * derecha - cy * sp * arriba;
      limitarPivote(pies);
    },

    /** Build mode: look at a sphere (centre, radius) from the current direction. false in play mode. */
    encuadrar(c: Punto, radio: number, pies: Punto, fovDeg: number): boolean {
      if (modo !== "construir") return false;
      const r = rango();
      meta.ox = c.x - pies.x; meta.oy = c.y - ojoDe(pies); meta.oz = c.z - pies.z;
      meta.dist = clamp((Math.max(0.2, radio) / Math.sin((fovDeg * G) / 2)) * 1.2, r.cerca, r.lejos);
      limitarPivote(pies);
      return true;
    },

    cambiarModo(m: ModoCamara): void {
      if (m === modo) return;
      if (m === "construir") {
        distJuego = meta.dist;
        modo = m;
        meta.dist = clamp(Math.max(meta.dist, CAMARA.distConstruir), CAMARA.construir.cerca, CAMARA.construir.lejos);
      } else {
        modo = m;
        meta.dist = distJuego;
        meta.ox = meta.oy = meta.oz = 0; // back to following the avatar, smoothly
      }
      const [a, b] = rango().inclinacion;
      meta.pitch = clamp(meta.pitch, a, b);
    },

    /** Behind the avatar (yaw 0 until avatars face somewhere), at the starting height and distance. */
    reiniciar(yaw = 0): void {
      meta.yaw = ahora.yaw + Math.atan2(Math.sin(yaw - ahora.yaw), Math.cos(yaw - ahora.yaw)); // the short way round
      meta.pitch = CAMARA.inicio.pitch;
      if (modo === "juego") meta.dist = CAMARA.inicio.dist;
      else { meta.dist = Math.max(CAMARA.inicio.dist, CAMARA.distConstruir); meta.ox = meta.oy = meta.oz = 0; }
    },

    /** Play mode: first person ↔ the last third-person distance. */
    alternarVista(): void {
      if (modo !== "juego") return;
      if (meta.dist > 0) { terceraAntes = meta.dist; meta.dist = 0; } else meta.dist = Math.max(terceraAntes, CAMARA.juego.cerca);
    },

    /** True when the drawn pose has reached the wanted one (nothing to animate). */
    quieta(): boolean {
      return ahora.yaw === meta.yaw && ahora.pitch === meta.pitch && ahora.dist === meta.dist && ahora.ox === meta.ox && ahora.oy === meta.oy && ahora.oz === meta.oz;
    },

    /** Move the drawn pose toward the wanted one; snaps when close. Returns true while it still moves. */
    paso(dt: number): boolean {
      const kg = 1 - Math.exp(-dt * CAMARA.rapidez.giro), km = 1 - Math.exp(-dt * CAMARA.rapidez.mover);
      const ir = (k: "yaw" | "pitch" | "dist" | "ox" | "oy" | "oz", f: number, eps: number) => {
        const d = meta[k] - ahora[k];
        ahora[k] = Math.abs(d) < eps ? meta[k] : ahora[k] + d * f;
      };
      ir("yaw", kg, 1e-4); ir("pitch", kg, 1e-4);
      ir("dist", km, 1e-3); ir("ox", km, 1e-3); ir("oy", km, 1e-3); ir("oz", km, 1e-3);
      if (Math.abs(ahora.yaw) > Math.PI) { // keep the numbers small; both move together, so nothing jumps
        const k = Math.round(ahora.yaw / (2 * Math.PI)) * 2 * Math.PI;
        ahora.yaw -= k; meta.yaw -= k;
      }
      return !o.quieta();
    },

    /** The drawn camera for the avatar's feet at `pies`. Looking up from low, the camera comes closer instead of
     * going under the ground (the only collision until physics, M6). */
    pose(pies: Punto, out: Pose): Pose {
      const p = pivote(pies);
      const cy = Math.cos(ahora.yaw), sy = Math.sin(ahora.yaw), cp = Math.cos(ahora.pitch), sp = Math.sin(ahora.pitch);
      let d = ahora.dist;
      if (sp < 0 && d > 0) d = Math.min(d, Math.max(0, (p.y - CAMARA.suelo) / -sp));
      out.x = p.x + sy * cp * d; out.y = p.y + sp * d; out.z = p.z + cy * cp * d;
      out.fx = -sy * cp; out.fy = -sp; out.fz = -cy * cp;
      // inside or right next to your own body (first person, or looking up from the feet): render hides it
      out.dentro = Math.hypot(out.x - pies.x, out.z - pies.z) < 0.5 && out.y - pies.y < 1.95;
      return out;
    },

    /** The world point under a screen point (`nx ny` in -1..1) on the ground (y 0), seen from the drawn camera; null
     * when the ray misses it or it is too far to be useful. Farther than `max` m is brought nearer along the ray. */
    puntoBajo(nx: number, ny: number, fovDeg: number, aspect: number, pies: Punto, max: number): Punto | null {
      const c = o.pose(pies, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, dentro: false });
      const r = rayo(nx, ny, fovDeg, aspect, ahora.yaw, ahora.pitch);
      if (r.y > -1e-3) return null;
      let t = -c.y / r.y;
      if (t > CAMARA.cursorLejos) return null;
      t = Math.min(t, max);
      return { x: c.x + r.x * t, y: c.y + r.y * t, z: c.z + r.z * t };
    },

    pivote,
  };
  return o;
}

export type Orbita = ReturnType<typeof crearOrbita>;
