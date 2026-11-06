// espejo/guia — the pure part of the guide (mundo-hermes M6): who she is, what she says, where she stands. No DOM, no engine, no clock.
// The guide is a white silhouette that walks with the visitor at 3 m (smooth, no physics) and says ONE short Spanish «usted» line when the
// visitor enters a zone or touches a thing. She never acts: nothing here calls a verb. The lines live in espejo.json (`guia.frases`); these are the defaults.
//   keys of `frases`: a zone id («z7»), `tocar:<tipo>` (touching a thing of that type), `saludo` (when she appears)
export const DISTANCIA_M = 3;
export const MAX_FRASE = 120;

export const FRASES_DEFECTO: Readonly<Record<string, string>> = {
  saludo: "Buenos días. Soy su guía: le acompaño y le cuento qué hay en cada lugar. Yo no toco nada.",
  z0: "Aquí está el panel de interruptores. Con él enciende o apaga cada función de este mundo.",
  z1: "Esta es la biblioteca. Toque un estante y pulse «Abrir» para leer la documentación.",
  z2: "Esta es la sala de máquinas. Cada medidor muestra cuánto gasta un agente.",
  z3: "Aquí están las sesiones, las conversaciones de Hermes. Cada cubo es una.",
  z4: "Este es el taller. Cada tablilla es una habilidad; su lámpara dice si está activa.",
  z6: "Esta es la torre de control. Cada figura es un agente: blanca si trabaja, vacía si descansa.",
  z7: "Este es el reloj. Cada esfera es una tarea programada de Hermes.",
  z8: "Esta es la plaza, donde estará el chat. Todavía no está disponible.",
  z9: "Este es el tablero de trabajo: por hacer, en curso y hecho. Aquí solo se mira.",
  "tocar:documento": "Eso es un documento. Pulse «Abrir» y lo leerá aquí mismo, sin salir del mundo.",
  "tocar:habilidad": "Eso es una habilidad: algo que Hermes sabe hacer. Aquí se lee, no se cambia.",
  "tocar:tablero": "Ese es el tablero de trabajo. Le cuenta cuántas tareas hay en cada columna.",
  "tocar:cron": "Esa es una tarea programada. Puede pausarla o ejecutarla ahora, con su confirmación.",
  "tocar:sesion": "Esa es una sesión, una conversación de Hermes.",
  "tocar:perfil": "Ese es un agente. Si está blanco, está trabajando.",
  "tocar:uso": "Ese medidor muestra el gasto estimado de un agente, no lo facturado.",
  "tocar:salud": "Ese es el panel de interruptores. Cada lámpara es una función del mundo.",
};

export type ZonaRect = { id: string; x: number; z: number; ancho: number; fondo: number };

/** The id of the zone whose floor holds the point (the first one in the list when two overlap), or null. */
export function zonaDe(x: number, z: number, zonas: readonly ZonaRect[]): string | null {
  for (const q of zonas) if (Math.abs(x - q.x) <= q.ancho / 2 && Math.abs(z - q.z) <= q.fondo / 2) return q.id;
  return null;
}

/** The line she says for `clave`, or «» when the table has none. */
export function fraseDe(frases: Readonly<Record<string, string>>, clave: string): string { return frases[clave] ?? FRASES_DEFECTO[clave] ?? ""; }

/** The next stop of the tour after `actual` (a zone id or null = not started / not on the tour). Wraps around; null when the tour is empty. */
export function siguienteZona(recorrido: readonly string[], actual: string | null): string | null {
  if (!recorrido.length) return null;
  const i = actual === null ? -1 : recorrido.indexOf(actual);
  return recorrido[(i + 1) % recorrido.length] ?? null;
}

export type Punto = { x: number; z: number };
export type Pose = Punto & { rumbo: number };
const VELOCIDAD_MAX = 7; // m/s, a brisk walk: she never outruns the visitor's run
const SUAVIDAD = 3.5; // 1/s, how quickly she closes the gap (exponential, no physics)
/** Where she starts: 3 m from the visitor, a little behind to the right of the screen. */
export function aparecerCerca(visita: Punto): Pose { const a = Math.SQRT1_2 * DISTANCIA_M; return { x: visita.x + a, z: visita.z + a, rumbo: Math.atan2(-a, -a) }; }
/** One step of walking with the visitor: she holds still while the gap is between 2 and 3.5 m, otherwise eases towards the point 3 m from the visitor on the line to her.
 *  Further than 25 m (the visitor teleported) she is simply there. Pure and smooth: the result depends only on the inputs. */
export function seguir(ella: Punto, visita: Punto, dt: number): Pose {
  const dx = ella.x - visita.x, dz = ella.z - visita.z, d = Math.hypot(dx, dz);
  const rumbo = Math.atan2(visita.x - ella.x, visita.z - ella.z);
  if (d > 25 || d === 0) return { ...aparecerCerca(visita) };
  if (d >= 2 && d <= DISTANCIA_M + 0.5) return { x: ella.x, z: ella.z, rumbo };
  const meta = { x: visita.x + (dx / d) * DISTANCIA_M, z: visita.z + (dz / d) * DISTANCIA_M };
  const k = 1 - Math.exp(-SUAVIDAD * Math.max(0, dt)), paso = VELOCIDAD_MAX * Math.max(0, dt);
  const mx = (meta.x - ella.x) * k, mz = (meta.z - ella.z) * k, m = Math.hypot(mx, mz), f = m > paso && m > 0 ? paso / m : 1;
  return { x: ella.x + mx * f, z: ella.z + mz * f, rumbo };
}
