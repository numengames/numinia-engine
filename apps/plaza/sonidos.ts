// Que todo suene (S6s): la página engancha los sonidos esquemáticos (packages/render/src/audio/sintesis.ts) a lo que pasa
// en el mundo. Aquí solo hay pegamento: cada función del motor sigue en su sitio y solo se le escucha.
//  - pasos, salto y aterrizaje: de `session.selfPosition` cada 50 ms (máquina pura `crearPasos`, probada en Node)
//  - interfaz: un clic en cualquier botón = `ui-pulsar`
//  - puertas, cerraduras, dados, dardos, teletransporte, pesca: de los `alCambiar`/`alDestello` de su función
// Todo va por los buses del núcleo, así que los deslizadores de «Sonido» y el ducking de la voz ya lo gobiernan.
// Cuando exista el fichero CC0 de un id, la página lo preferirá y esto queda de respaldo (historia S6).
import { audio } from "../../packages/render/src/audio/nucleo.ts";
import { crearSintetizador, type Sintetizador } from "../../packages/render/src/audio/sintesis.ts";

export type Cuerpo = { y: number; speed: number; grounded: boolean };
export type Paso = "paso" | "salto" | "aterrizaje";

/** Zancada (m) al caminar y al correr: un paso suena cada vez que se recorre esa distancia. */
export const ZANCADA = { camina: 1.4, corre: 1.9 } as const;
/** Por encima de esta velocidad (m/s) se considera que corre (caminar ≈ 4, correr ≈ 8). */
export const UMBRAL_CORRE = 6;
/** Hay que haber estado así de tiempo en el aire (s) para que el aterrizaje suene: bajar un escalón no es un golpe. */
export const AIRE_MIN_S = 0.25;

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
  puertas: { lista(): { id: string; abierta?: boolean }[]; alCambiar(fn: (id: string) => void): unknown };
  cerraduras: { alCambiar(fn: (q: string) => void): unknown };
  dados: { alCambiar(fn: (q: string) => void): unknown };
  dardos: { clavados(): unknown[]; alCambiar(fn: (q: string) => void): unknown };
  pesca: { estado(): { fase: string }; alCambiar(fn: (q: string) => void): unknown };
  viajar: { alDestello(fn: (d: unknown) => void): unknown };
};

/** Engancha todo. Devuelve el sintetizador y una función para desmontar (pruebas). */
export function montarSonidos(p: Pagina, sintetizador: Sintetizador = crearSintetizador(audio())) {
  const ultimo = new Map<string, number>();
  /** Un mismo id no suena dos veces en menos de `ms` (clics a ráfagas, cambios que llegan duplicados). */
  const sonar = (id: string, o: Parameters<Sintetizador["sonar"]>[1] = {}, ms = 60): void => {
    const t = performance.now();
    if (t - (ultimo.get(id) ?? -1e9) < ms) return;
    ultimo.set(id, t);
    sintetizador.sonar(id, o);
  };
  const quitar: (() => void)[] = [];

  // interfaz: cualquier botón
  const clic = (e: Event): void => {
    const b = (e.target as Element | null)?.closest?.("button,[role=button],summary,[role=tab]");
    if (b && !(b as HTMLButtonElement).disabled && b.getAttribute("aria-disabled") !== "true") sonar("ui-pulsar", { vol: 0.5 });
  };
  document.addEventListener("pointerdown", clic, true);
  quitar.push(() => document.removeEventListener("pointerdown", clic, true));

  // pasos, salto y aterrizaje
  const pasos = crearPasos();
  let tocar = 0;
  const reloj = setInterval(() => {
    if (p.session.entity < 0) return;
    for (const q of pasos(p.session.selfPosition(1), 0.05)) {
      if (q === "salto") sonar("salto", { vol: 0.5 }, 150);
      else if (q === "aterrizaje") sonar("aterrizaje", { vol: 0.7 }, 150);
      else { tocar++; sonar("pasos-piedra", { vol: 0.35, tono: 0.92 + (tocar % 3) * 0.06 }, 120); }
    }
  }, 50);
  quitar.push(() => clearInterval(reloj));

  // puertas: abrirse o cerrarse
  const abiertas = new Map<string, boolean>();
  for (const d of p.puertas.lista()) abiertas.set(d.id, d.abierta === true);
  p.puertas.alCambiar((id) => {
    const d = p.puertas.lista().find((x) => x.id === id);
    if (!d) { abiertas.delete(id); return; }
    const ya = abiertas.get(id);
    abiertas.set(id, d.abierta === true);
    if (ya !== undefined && ya !== (d.abierta === true)) sonar("puerta", { vol: 0.8, tono: d.abierta ? 1 : 0.9 }, 200);
  });
  p.cerraduras.alCambiar((q) => { if (q === "abierta") sonar("cerradura", { vol: 0.8 }, 300); });
  p.dados.alCambiar((q) => { if (q === "tirada") sonar("dados", { vol: 0.8 }, 300); });
  let dardosAntes = p.dardos.clavados().length;
  p.dardos.alCambiar((q) => {
    if (q !== "clavados") return;
    const n = p.dardos.clavados().length;
    if (n > dardosAntes) { sonar("dardo-lanzar", { vol: 0.6 }, 100); setTimeout(() => sonar("dardo-impacto", { vol: 0.8 }, 100), 180); }
    dardosAntes = n;
  });
  p.viajar.alDestello(() => sonar("teleport", { vol: 0.7 }, 500));
  let faseAntes = p.pesca.estado().fase;
  p.pesca.alCambiar((q) => {
    if (q !== "estado") return;
    const f = p.pesca.estado().fase;
    if (f !== faseAntes) {
      if (f === "espera" && faseAntes === "nada") { sonar("pesca-lanzar", { vol: 0.7 }, 300); setTimeout(() => sonar("pesca-chapuzon", { vol: 0.6 }, 300), 450); }
      else if (f === "nada" && faseAntes !== "nada") sonar("pesca-cobrar", { vol: 0.6 }, 300);
    }
    faseAntes = f;
  });

  return { sintetizador, desmontar: () => quitar.forEach((f) => f()) };
}
