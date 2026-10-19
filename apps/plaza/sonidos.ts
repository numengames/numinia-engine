// Que todo suene (S6s, fundido con S6 en S6f): la página engancha a lo que pasa en el mundo. Aquí solo hay pegamento:
// cada función del motor sigue en su sitio y solo se le escucha.
//
// Todo pasa por la PUERTA ÚNICA (`packages/render/src/audio/sonar.ts`): el fichero del catálogo si lo hay, y si no la
// receta de `sintesis.ts`. Esta página ya no llama al sintetizador: así hay un solo tope de voces, un solo cooldown y
// un solo sitio donde mirar cuando algo no suena.
//
// REPARTO DE AUTORIDAD (D-048: el servidor manda en lo compartido):
//  - LOCAL (cada quien oye lo suyo, aquí): los botones de interfaz, MIS pasos, MI salto, MI aterrizaje, y lo que solo
//    ocurre en mi caña de pescar (lanzar y el chapuzón). No se mandan por la red: son de cada quien y van en la cabeza
//    o a mis pies.
//  - COMPARTIDO (lo manda el SERVIDOR, con su semilla, desde `features/sonido/server.ts`): la puerta, los dados, el
//    dardo (lanzado e impacto), el pez cobrado y el teletransporte — tanto el mío como el de otra persona. Esta página
//    NO los dispara: si lo hiciera, cada uno oiría su propia variante, y quien estuviera al lado oiría otra cosa.
//    `COMPARTIDOS` es esa lista, y `sonarLocal` se niega a tocar cualquiera de ellos (si un día alguien lo intenta,
//    sale en el registro una vez y no suena).
//  - Pendientes de evento del servidor (quedan LOCALES, apuntados en docs/BACKLOG.md): la CERRADURA (su evento
//    `cerradura.abierta` no dice dónde está) y la MÁQUINA (`movedores.llegada` tampoco).
import { audio, type Nucleo } from "../../packages/render/src/audio/nucleo.ts";
import { crearPuerta, materialDeSuelo, MATERIAL_DEF, type Material, type Opciones, type Puerta } from "../../packages/render/src/audio/sonar.ts";
import { puente } from "./sonar.ts";

export type Cuerpo = { y: number; speed: number; grounded: boolean };
export type Paso = "paso" | "salto" | "aterrizaje";

/** Zancada (m) al caminar y al correr: un paso suena cada vez que se recorre esa distancia. */
export const ZANCADA = { camina: 1.4, corre: 1.9 } as const;
/** Por encima de esta velocidad (m/s) se considera que corre (caminar ≈ 4, correr ≈ 8). */
export const UMBRAL_CORRE = 6;
/** Hay que haber estado así de tiempo en el aire (s) para que el aterrizaje suene: bajar un escalón no es un golpe. */
export const AIRE_MIN_S = 0.25;

/** Los sonidos que SOLO manda el servidor: esta página se niega a tocarlos por su cuenta (D-048). */
export const COMPARTIDOS: readonly string[] = ["puerta", "dados", "dardo-lanzar", "dardo-impacto", "pesca-cobrar", "teleport"];

/** Máquina de pasos: se le da el cuerpo y el tiempo que pasó, y devuelve los sonidos que tocan. Sin DOM, sin audio. */
export function crearPasos() {
  let yAntes: number | null = null, enAire = false, aire = 0, dist = 0;
  return function paso(c: Cuerpo, dt: number): Paso[] {
    const fuera: Paso[] = [];
    const sube = yAntes !== null && c.y - yAntes > 0.04;
    yAntes = c.y;
    if (!c.grounded) {
      if (!enAire) { enAire = true; aire = 0; dist = 0; if (sube) fuera.push("salto"); }
      aire += dt;
      return fuera;
    }
    if (enAire) { enAire = false; if (aire >= AIRE_MIN_S) fuera.push("aterrizaje"); aire = 0; }
    if (c.speed < 0.5) { dist = 0; return fuera; }
    dist += c.speed * dt;
    const z = c.speed > UMBRAL_CORRE ? ZANCADA.corre : ZANCADA.camina;
    if (dist >= z) { dist -= z; fuera.push("paso"); }
    return fuera;
  };
}

export type Pagina = {
  session: { entity: number; selfPosition(alpha: number): Cuerpo };
  cerraduras: { alCambiar(fn: (q: string) => void): unknown };
  pesca: { estado(): { fase: string }; alCambiar(fn: (q: string) => void): unknown };
  /** El tipo de suelo de la zona donde estoy (`entorno@1`), si el mundo lo dice. Sin esto, los pasos suenan a piedra. */
  suelo?: () => string | null;
};

export type Montado = {
  puerta: Puerta;
  /** Hacer sonar algo LOCAL. Devuelve false si el id es de los compartidos (eso lo manda el servidor) o si no sonó. */
  sonarLocal(id: string, o?: Opciones, ms?: number): boolean;
  /** Un paso con el material que toque (del suelo de la zona si el mundo lo dice; piedra si no). */
  paso(material?: Material): boolean;
  desmontar(): void;
};

/** Engancha todo. Devuelve la puerta, el disparador local y una función para desmontar (pruebas). */
export function montarSonidos(p: Pagina, puerta: Puerta = crearPuerta({ nucleo: audio() as Nucleo })): Montado {
  const ultimo = new Map<string, number>();
  const dichos = new Set<string>();
  /** Un mismo id no suena dos veces en menos de `ms` (clics a ráfagas, cambios que llegan duplicados). Es un freno de
   *  página, encima del cooldown del catálogo: aquí se cortan los rebotes de la interfaz, no las voces. */
  const sonarLocal = (id: string, o: Opciones = {}, ms = 60): boolean => {
    if (COMPARTIDOS.includes(id)) {
      // no es un fallo de nadie: es el reparto. Se dice una vez para que no pase desapercibido en un cambio futuro.
      if (!dichos.has(id)) { dichos.add(id); console.warn(`[sonidos] «${id}» lo manda el servidor (D-048): la página no lo toca`); }
      return false;
    }
    const t = performance.now();
    if (t - (ultimo.get(id) ?? -1e9) < ms) return false;
    ultimo.set(id, t);
    return puerta.sonar(id, o);
  };
  const quitar: (() => void)[] = [];
  // las piezas de VR (dardos-vr, pesca-sonido) suenan por `sonar.ts` sin cargar este módulo: aquí se les da la puerta
  puente.sonar = sonarLocal;
  quitar.push(() => { if (puente.sonar === sonarLocal) puente.sonar = null; });

  // interfaz: cualquier botón. Local: es mi dedo, y suena en mi cabeza.
  const clic = (e: Event): void => {
    const b = (e.target as Element | null)?.closest?.("button,[role=button],summary,[role=tab]");
    if (b && !(b as HTMLButtonElement).disabled && b.getAttribute("aria-disabled") !== "true") sonarLocal("ui-pulsar", { gain: 0.5 });
  };
  // sin DOM (las pruebas, o un servidor que carga este módulo) no hay botones que escuchar: el resto sigue igual
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", clic, true);
    quitar.push(() => document.removeEventListener("pointerdown", clic, true));
  }

  // El material bajo los pies. Hoy el motor solo sabe el tipo de suelo de la ZONA (`entorno@1`: hierba, tierra, arena,
  // roca, nieve, liso), no una etiqueta por superficie: un tablado de madera sobre una zona de roca sigue sonando a
  // piedra (eso es la historia S8 del diseño). Con `p.suelo` enchufado, al menos la hierba y la roca suenan a lo suyo;
  // sin él, piedra, que es lo que había.
  const materialAhora = (): Material => {
    try { return p.suelo ? materialDeSuelo(p.suelo()) : MATERIAL_DEF; } catch { return MATERIAL_DEF; }
  };
  const paso = (material: Material = materialAhora()): boolean => {
    // el cooldown y la variación (±4 % de tono, ±2 dB) los pone la puerta con la semilla: ya no hay que detunar a mano
    const id = `pasos-${material}`;
    return sonarLocal(id, { gain: 0.35 }, 120);
  };

  // pasos, salto y aterrizaje: míos, locales, a mis pies (bus «pasos-propios»)
  const pasos = crearPasos();
  const reloj = setInterval(() => {
    if (p.session.entity < 0) return;
    for (const q of pasos(p.session.selfPosition(1), 0.05)) {
      if (q === "salto") sonarLocal("salto", { gain: 0.5 }, 150);
      else if (q === "aterrizaje") sonarLocal("aterrizaje", { gain: 0.7 }, 150);
      else paso();
    }
  }, 50);
  // en Node (las pruebas) un intervalo mantiene vivo el proceso para siempre: `unref` lo deja sin voto
  (reloj as unknown as { unref?: () => void })?.unref?.();
  quitar.push(() => clearInterval(reloj));

  // la cerradura: LOCAL por ahora. Su evento de servidor (`cerradura.abierta`) no dice dónde está la cerradura, así
  // que no se puede mandar a «quien esté cerca» sin inventarse un sitio. Apuntado en docs/BACKLOG.md.
  p.cerraduras.alCambiar((q) => { if (q === "abierta") sonarLocal("cerradura", { gain: 0.8 }, 300); });

  // la pesca: lanzar y el chapuzón son MÍOS (mi caña, mi mano). El pez cobrado lo manda el servidor, porque lo oyen
  // los de alrededor: aquí ya no se toca.
  let faseAntes = p.pesca.estado().fase;
  p.pesca.alCambiar((q) => {
    if (q !== "estado") return;
    const f = p.pesca.estado().fase;
    if (f !== faseAntes && f === "espera" && faseAntes === "nada") {
      sonarLocal("pesca-lanzar", { gain: 0.7 }, 300);
      setTimeout(() => sonarLocal("pesca-chapuzon", { gain: 0.6 }, 300), 450);
    }
    faseAntes = f;
  });

  return { puerta, sonarLocal, paso, desmontar: () => quitar.forEach((f) => f()) };
}
