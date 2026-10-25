// V6 · la baliza sonora de la página: cuando algo pone una baliza de luz (`view.beacon`: «Ir» de una convocatoria, «Ir
// junto a» alguien) y la persona tiene encendido «Baliza sonora» (Ajustes → Sonido, apagado de serie), además de la luz
// suena un pitido en el destino, a su lado y repetido (`packages/render/src/audio/baliza.ts`). Se apaga al llegar.
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
