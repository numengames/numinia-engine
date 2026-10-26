// S5 · EL OYENTE: el único sitio del motor que mueve el `AudioListener` del núcleo (`./nucleo.ts`).
//
// Lo que arregla. Hasta hoy nada del audio seguía la cabeza: el oyente de los medios era la posición **de red**
// del jugador +1,5 m y **sin orientación** (`packages/render/src/index.ts`, `updateThings`), y la voz de la gente
// orientaba el oyente con `cam.yaw()` plano (`apps/plaza/voz.ts`). En gafas, girar la cabeza no cambiaba cómo
// sonaba el mundo. Y no lo arregla el estándar: la especificación de WebXR **no dice nada de audio** (solo nombra
// el audio al definir qué es contenido inmersivo), así que copiar la pose del visor al `AudioListener` es
// enteramente cosa nuestra (work/motor-ar/sonido/raw/02-web-audio-y-aparatos.md §e).
//
// Qué hace, en una línea: cada fotograma lee de dónde oyes —la cámara fuera de XR, la pose real del visor
// dentro— y la lleva a los nueve parámetros del oyente con rampas de 20 ms.
//
// Las tres reglas que no se pueden romper:
//  1. **UN solo oyente, centrado entre los dos ojos.** Se usa `XRFrame.getViewerPose(espacio).transform`, que ES
//     el punto del visor entre los ojos, nunca `pose.views[0]` (el ojo izquierdo). Es justo el fallo del issue
//     #20920 de three.js: su `AudioListener` acaba saltando entre un ojo y otro y el sonido tartamudea.
//  2. **Nada de reservas de memoria por fotograma.** Todo son números sueltos y dos matrices de 16 reutilizadas:
//     ni un `Vector3`, ni un `Quaternion`, ni un objeto literal dentro de `actualizar()`. El presupuesto del
//     motor exige dibujo sin basura y esto corre en el mismo bucle.
//  3. **El oyente es lo que oyes, no dónde está tu muñeco.** Fuera de XR manda la cámara de three.js (su
//     `matrixWorld`, igual que haría `decompose()` pero leyendo las columnas, que no reserva nada); dentro de XR
//     manda el visor, no la posición de red.
//
// Lo que NO es espacial: `interfaz` y `pasos-propios` suenan EN LA CABEZA y nunca pasan por un panner (regla de
// Meta: el sonido propio se emite en el punto anatómico correcto, no en el mundo). Eso se cumple aquí abajo en
// `conectar()`, que es la única puerta por la que algo debería engancharse a un bus.
//
// Lo copiado (ficha en work/motor-ar/sonido/DISENO-SONIDO.md §9): de three.js copiamos la IDEA del `AudioListener`
// pegado a la cámara, y la transformamos en lo contrario de lo que hace su código — un oyente por sesión, leído
// del `XRFrame` y no de una cámara de ojo, y escrito con `setTargetAtTime` en vez de `setValueAtTime`, que es lo
// que quita los clics al saltar de un fotograma al siguiente.
import { audio, type Bus, type Nucleo } from "./nucleo.ts";
import { hayGesto } from "../gesto.ts";

/** Rampa de los parámetros del oyente (s): corta para no arrastrar la cabeza, larga para que no haga clic. */
export const RAMPA_S = 0.02;

/** Los dos buses que NUNCA se espacializan: lo mío suena en mi cabeza. */
export const EN_LA_CABEZA: readonly Bus[] = ["interfaz", "pasos-propios"];
/** ¿Lo que entra por este bus pasa por un panner? */
export const seEspacializa = (bus: Bus): boolean => !EN_LA_CABEZA.includes(bus);

/** Lo mínimo que el oyente necesita de una cámara de three.js (una `THREE.Camera` lo cumple tal cual). */
export type Camara = {
  updateMatrixWorld(force?: boolean): void;
  matrixWorld: { elements: ArrayLike<number> };
  /** En XR, el «rig» del que cuelga la cámara: lleva del espacio de referencia al mundo. */
  parent?: { matrixWorld: { elements: ArrayLike<number> } } | null;
};

/** Una pose del visor tal y como la da el navegador (solo lo que miramos de ella). */
export type PoseVisor = {
  transform?: { matrix?: ArrayLike<number> } | null;
  views?: ReadonlyArray<{ transform?: { matrix?: ArrayLike<number> } | null }>;
};
/** El `XRFrame` y su espacio de referencia, pedidos al motor para no atar este fichero a three.js. */
export type FuenteXR = {
  presentando(): boolean;
  fotograma(): { getViewerPose(espacio: unknown): PoseVisor | null | undefined } | null | undefined;
  espacio(): unknown;
};

/** El `AudioListener` de verdad o el de 2013: aquí caben los dos. */
export type Escucha = {
  positionX?: AudioParam; positionY?: AudioParam; positionZ?: AudioParam;
  forwardX?: AudioParam; forwardY?: AudioParam; forwardZ?: AudioParam;
  upX?: AudioParam; upY?: AudioParam; upZ?: AudioParam;
  setPosition?(x: number, y: number, z: number): void;
  setOrientation?(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void;
};

export type Hechuras = {
  /** La cámara de la página (fuera de XR manda ella; en XR, su padre es el rig). */
  camara: () => Camara | null | undefined;
  /** La sesión inmersiva, si la hay. */
  xr?: FuenteXR;
  /** De dónde sale el `AudioListener`; por defecto, el del núcleo (y solo tras el primer gesto). */
  escucha?: () => Escucha | null | undefined;
  /** Reloj del contexto de audio, en segundos (es el que entiende `setTargetAtTime`). */
  reloj?: () => number;
  /** Reloj de pared en ms, para el limitador de ritmo. */
  ahora?: () => number;
  /** Cuántas veces por segundo como mucho; `0` (por defecto) = cada fotograma. */
  hz?: number;
};

/** Lo último que se le dijo al oyente. Es SIEMPRE el mismo objeto: leerlo no reserva nada. */
export type Pose = {
  x: number; y: number; z: number;
  fx: number; fy: number; fz: number;
  ux: number; uy: number; uz: number;
  /** De dónde salió: la cámara de pantalla plana o el visor. */
  fuente: "camara" | "visor" | "ninguna";
};

export type Oyente = {
  /** Llamar una vez por fotograma, desde el bucle de dibujo. `forzar` se salta el limitador de ritmo. */
  actualizar(forzar?: boolean): void;
  /** Entramos en una sesión inmersiva: desde ya manda el visor. */
  alEntrarXR(): void;
  /** Salimos: el oyente vuelve a la cámara, en el acto. */
  alSalirXR(): void;
  /** La última pose escrita (el MISMO objeto siempre). */
  pose(): Readonly<Pose>;
  /** Cuentas para pruebas y para el panel de medidas. Esto sí reserva: no llamarlo por fotograma. */
  coste(): { cuadros: number; escrituras: number; saltados: number };
};

// ---- matrices 4x4 en columnas (como three.js y como `XRRigidTransform.matrix`) ----------------------------

const mundo = new Float64Array(16);   // reutilizada: rig · pose
const pose4 = new Float64Array(16);   // reutilizada: la pose del visor (o la media de los dos ojos)

/** `r = a · b`, las tres en columnas. Sin reservas: `r` puede ser `a` o `b` solo si no se solapan (aquí nunca). */
function multiplicar(a: ArrayLike<number>, b: ArrayLike<number>, r: Float64Array): void {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
}

// la traslación también: al salir de XR la cámara plana puede tardar un cuadro en recolocarse y traer NaN en x,y,z
const esMatriz = (m: ArrayLike<number> | null | undefined): m is ArrayLike<number> => !!m && m.length >= 16 && Number.isFinite(m[0]) && Number.isFinite(m[15]) && Number.isFinite(m[12]) && Number.isFinite(m[13]) && Number.isFinite(m[14]);

export function crearOyente(h: Hechuras): Oyente {
  const xr = h.xr;
  const reloj = h.reloj ?? (() => 0);
  const ahora = h.ahora ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const cada = h.hz && h.hz > 0 ? 1000 / h.hz : 0;
  const escuchaDe = h.escucha ?? (() => {
    // sin gesto no hay audio y no queremos construir el grafo antes de tiempo (política de autoplay)
    if (!hayGesto()) return null;
    try { return (audio().ctx()?.listener ?? null) as Escucha | null; } catch { return null; }
  });

  let escucha: Escucha | null = null;
  let ultimoMs = -Infinity;
  let cuadros = 0, escrituras = 0, saltados = 0;
  let viejaAPI = false;           // este navegador solo tiene setPosition/setOrientation
  const p: Pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0, fuente: "ninguna" };
  // lo último que se le dijo de verdad al oyente: si no cambia, no se vuelve a escribir
  let ex = NaN, ey = NaN, ez = NaN, efx = NaN, efy = NaN, efz = NaN, eux = NaN, euy = NaN, euz = NaN;

  /** Saca posición, delantero y arriba de una matriz de mundo, normalizando (lo mismo que `decompose`, sin reservar). */
  function leerMatriz(m: ArrayLike<number>): boolean {
    if (!Number.isFinite(m[12] + m[13] + m[14] + m[4] + m[5] + m[6] + m[8] + m[9] + m[10])) return false; // pose rota: se queda la anterior
    p.x = m[12]; p.y = m[13]; p.z = m[14];
    // la cámara mira a −z y tiene +y arriba (convenio de three.js y de WebXR)
    let fx = -m[8], fy = -m[9], fz = -m[10];
    let n = Math.hypot(fx, fy, fz);
    if (n > 1e-8) { fx /= n; fy /= n; fz /= n; } else { fx = 0; fy = 0; fz = -1; }
    let ux = m[4], uy = m[5], uz = m[6];
    n = Math.hypot(ux, uy, uz);
    if (n > 1e-8) { ux /= n; uy /= n; uz /= n; } else { ux = 0; uy = 1; uz = 0; }
    p.fx = fx; p.fy = fy; p.fz = fz; p.ux = ux; p.uy = uy; p.uz = uz;
    return true;
  }

  /** La pose del visor, CENTRADA ENTRE LOS DOS OJOS, en `pose4`. `false` si el navegador no la dio todavía. */
  function poseDelVisor(): boolean {
    const f = xr?.fotograma();
    if (!f || typeof f.getViewerPose !== "function") return false;
    let vp: PoseVisor | null | undefined;
    try { vp = f.getViewerPose(xr!.espacio()); } catch { return false; }
    if (!vp) return false;                               // pasa de verdad: un fotograma sin seguimiento
    const m = vp.transform?.matrix;
    if (esMatriz(m)) { for (let i = 0; i < 16; i++) pose4[i] = m[i]; return true; }
    // sin `transform` (navegador raro o prueba): la media de los dos ojos, NUNCA uno solo — si cogiéramos
    // `views[0]` el oyente se iría al ojo izquierdo y saltaría al cambiar de ojo (three.js #20920)
    const vs = vp.views;
    if (!vs || vs.length === 0) return false;
    const a = vs[0]?.transform?.matrix, b = vs[vs.length - 1]?.transform?.matrix;
    if (!esMatriz(a)) return false;
    for (let i = 0; i < 16; i++) pose4[i] = a[i];
    if (esMatriz(b) && b !== a) { pose4[12] = (a[12] + b[12]) / 2; pose4[13] = (a[13] + b[13]) / 2; pose4[14] = (a[14] + b[14]) / 2; }
    return true;
  }

  function escribir(): void {
    if (!escucha) { escucha = escuchaDe() ?? null; if (!escucha) return; viejaAPI = !escucha.positionX; }
    const L = escucha;
    if (p.x === ex && p.y === ey && p.z === ez && p.fx === efx && p.fy === efy && p.fz === efz && p.ux === eux && p.uy === euy && p.uz === euz) { saltados++; return; }
    ex = p.x; ey = p.y; ez = p.z; efx = p.fx; efy = p.fy; efz = p.fz; eux = p.ux; euy = p.uy; euz = p.uz;
    escrituras++;
    const t = reloj();
    try {
      if (!viejaAPI && L.positionX) {
        llevar(L.positionX, p.x, t); llevar(L.positionY, p.y, t); llevar(L.positionZ, p.z, t);
        llevar(L.forwardX, p.fx, t); llevar(L.forwardY, p.fy, t); llevar(L.forwardZ, p.fz, t);
        llevar(L.upX, p.ux, t); llevar(L.upY, p.uy, t); llevar(L.upZ, p.uz, t);
        return;
      }
      // API vieja (Firefox la mantiene como única vía, bug 1283029): sin rampa, pero suena
      L.setPosition?.(p.x, p.y, p.z);
      L.setOrientation?.(p.fx, p.fy, p.fz, p.ux, p.uy, p.uz);
    } catch { viejaAPI = !viejaAPI; /* el siguiente fotograma prueba por el otro camino */ }
  }

  /** `setTargetAtTime` donde exista (a-rate, sin clics); si no, el valor a secas. */
  function llevar(param: AudioParam | undefined, v: number, t: number): void {
    if (!param) return;
    if (typeof param.setTargetAtTime === "function") param.setTargetAtTime(v, t, RAMPA_S);
    else param.value = v;
  }

  let enXR = false;

  const api: Oyente = {
    actualizar(forzar = false): void {
      const hoy = xr ? xr.presentando() === true : false;
      if (hoy !== enXR) { enXR = hoy; forzar = true; }           // entrar o salir se atiende en el acto
      if (!forzar && cada > 0) {
        const ms = ahora();
        if (ms - ultimoMs < cada) return;
        ultimoMs = ms;
      } else if (cada > 0) ultimoMs = ahora();
      cuadros++;
      const cam = h.camara();
      if (enXR) {
        // un fotograma sin seguimiento (el visor en la mesa, el pasillo de permisos) no da pose: no se toca el
        // oyente, se queda donde estaba. Caer a la cámara plana aquí sería un salto de sonido en mitad de la cara.
        if (!poseDelVisor()) return;
        // la pose viene en el espacio de referencia; el rig (el padre de la cámara) la lleva al mundo
        const base = cam?.parent?.matrixWorld?.elements;
        if (esMatriz(base)) { multiplicar(base, pose4, mundo); if (!leerMatriz(mundo)) return; }
        else if (!leerMatriz(pose4)) return;
        p.fuente = "visor";
      } else if (cam) {
        cam.updateMatrixWorld();                                  // la cámara puede no colgar de la escena
        const m = cam.matrixWorld?.elements;
        if (!esMatriz(m) || !leerMatriz(m)) return;
        p.fuente = "camara";
      } else return;
      escribir();
    },
    alEntrarXR(): void { enXR = true; api.actualizar(true); },
    alSalirXR(): void { enXR = false; api.actualizar(true); },
    pose(): Readonly<Pose> { return p; },
    coste() { return { cuadros, escrituras, saltados }; },
  };
  return api;
}

let avisado = false;
/**
 * La única puerta para colgar algo de un bus. Si el bus es de los que suenan EN LA CABEZA (`interfaz`,
 * `pasos-propios`) el panner se ignora a propósito: mis pasos y un aviso de la interfaz no se espacializan nunca
 * (regla de Meta; diseño §5). Devuelve el nodo del bus, o `null` si todavía no hay grafo de audio.
 */
export function conectar(nucleo: Nucleo, fuente: AudioNode, bus: Bus, panner?: PannerNode | null): AudioNode | null {
  const destino = nucleo.bus(bus);
  if (!destino) return null;
  if (panner && seEspacializa(bus)) { fuente.connect(panner); panner.connect(destino); return destino; }
  if (panner && !avisado) { avisado = true; console.warn(`[audio] «${bus}» suena en la cabeza: su panner se ignora (diseño §5)`); }
  fuente.connect(destino);
  return destino;
}
