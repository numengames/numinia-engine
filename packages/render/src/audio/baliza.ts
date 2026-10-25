// V6 · la baliza simple: UN sonido fijo en el destino que se repite, más seguido cuanto más cerca. Es la ayuda de quien
// no ve la luz de la baliza visual (`view.beacon`): oye de dónde viene —a la izquierda, a la derecha— porque suena por
// el mismo panner que el resto del mundo y sigue la cabeza (`oyente.ts`). El guiado paso a paso es V9; esto no guía.
//
// Es un temporizador puro: no toca Web Audio. Quien la monta le da `sonar` (la puerta única del sonido), de dónde oyes
// (`oido`) y un reloj, y la llama con un `setInterval` corto mientras haya baliza. Sin baliza no cuesta nada.
import { intervaloBaliza } from "./mezcla.ts";

type Punto = { x: number; y: number; z: number };
/** Qué suena: un pitido corto de la casa (catálogo `moneda`, bus efectos), sin texto que repetir cada vez. */
export const SONIDO_BALIZA = "moneda";
/** Altura a la que suena el destino (m): la de un pecho, para que no suene a ras de suelo. */
export const ALTURA_BALIZA_M = 1.5;
/** Cerca de la baliza deja de repetir (ya has llegado) y se apaga sola. */
export const LLEGADA_M = 2;

export type HechurasBaliza = {
  /** Hace sonar un pitido en `donde`. Devuelve si sonó. */
  sonar(id: string, donde: Punto): boolean;
  /** De dónde oyes ahora (la cabeza), o null si todavía no se sabe. */
  oido(): Punto | null;
  /** Reloj en ms. */
  ahora(): number;
};
export type Baliza = {
  poner(x: number, z: number, hastaMs: number): void;
  quitar(): void;
  activa(): boolean;
  /** Llamar a menudo (cada ~250 ms): suena si toca. Devuelve si sonó en esta llamada. */
  pulso(): boolean;
  estado(): { activa: boolean; sonadas: number; destino: Punto | null };
};

export function crearBaliza(h: HechurasBaliza): Baliza {
  let destino: Punto | null = null, hasta = 0, ultimo = -Infinity, sonadas = 0;
  const quitar = () => { destino = null; };
  return {
    poner(x, z, hastaMs) {
      destino = { x, y: ALTURA_BALIZA_M, z }; hasta = h.ahora() + Math.max(0, hastaMs); ultimo = -Infinity; sonadas = 0;
    },
    quitar,
    activa: () => destino !== null,
    pulso() {
      if (!destino) return false;
      const t = h.ahora();
      if (t > hasta) { quitar(); return false; }
      const o = h.oido();
      const d = o ? Math.hypot(destino.x - o.x, destino.z - o.z) : Infinity;
      if (d < LLEGADA_M) { quitar(); return false; }           // has llegado
      if (t - ultimo < intervaloBaliza(d) * 1000) return false;
      ultimo = t;
      const ok = h.sonar(SONIDO_BALIZA, destino);
      if (ok) sonadas++;
      return ok;
    },
    estado: () => ({ activa: destino !== null, sonadas, destino: destino ? { ...destino } : null }),
  };
}
