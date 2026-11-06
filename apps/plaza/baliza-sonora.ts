// V6 · the page's sound beacon: when something sets a light beacon (`view.beacon`: «Ir» of a call-out, «Ir
// junto a» someone) and the person has «Baliza sonora» on (Ajustes → Sonido, off by default), besides the light
// a beep plays at the destination, beside them and repeated (`packages/render/src/audio/baliza.ts`). It stops on arrival.
import { crearBaliza, SONIDO_BALIZA, type Baliza } from "../../packages/render/src/audio/baliza.ts";
import { sonar } from "./sonar.ts";

export const AJUSTE_BALIZA = "sonido.baliza";

export function montarBalizaSonora(view: { beacon?(x: number, z: number, text: string, ms: number): void; oyente?: () => { pose(): { x: number; y: number; z: number } } | null }, leer: (id: string) => unknown, h: { sonar?: (id: string, donde: { x: number; y: number; z: number }) => boolean; ahora?: () => number } = {}): Baliza {
  const ahora = h.ahora ?? (() => Date.now());
  const baliza = crearBaliza({
    sonar: h.sonar ?? ((id, donde) => sonar(id, { donde, gain: 1 })),
    oido: () => view.oyente?.()?.pose() ?? null,
    ahora,
  });
  let reloj: ReturnType<typeof setInterval> | null = null;
  const parar = () => { if (reloj !== null) { clearInterval(reloj); reloj = null; } };
  const latir = () => { baliza.pulso(); if (!baliza.activa()) parar(); };
  const luz = view.beacon?.bind(view);
  if (luz) {
    view.beacon = (x: number, z: number, text: string, ms: number) => {
      luz(x, z, text, ms);
      if (leer(AJUSTE_BALIZA) !== true) return;
      baliza.poner(x, z, ms);
      if (reloj === null && typeof setInterval === "function") reloj = setInterval(latir, 250);
      latir();
    };
  }
  return baliza;
}
export { SONIDO_BALIZA };
