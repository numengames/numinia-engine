// U3: the notices' stack (#avisos-pila, top centre). What `anunciar` says to screen readers also shows here for 6 s, up to 3 at a time
// (Mínimo and Normal show only the newest by CSS; Completo the stack). It is the sighted twin of #avisos; urgent notices
// (#avisos-urgentes) stay where they are. «Menos movimiento»: no fade, they still leave after 6 s (a stale notice must not stay).
import { SEGUNDOS_AL_CAMBIAR, apilarAviso } from "../../packages/client/src/densidad.ts";
import type { Aviso } from "../../packages/client/src/densidad.ts";
import { alAnunciar } from "./paneles.ts";

export function montarAvisos(): void {
  const caja = document.getElementById("avisos-pila");
  if (!caja) return;
  let pila: Aviso[] = [];
  const nodos = new Map<Aviso, HTMLElement>();
  alAnunciar((texto) => {
    const ahora = Date.now(), antes = pila;
    pila = apilarAviso(pila, texto, ahora);
    for (const v of antes) if (!pila.includes(v)) { // left the stack: expired, pushed out, or renewed
      nodos.get(v)?.remove(); nodos.delete(v);
    }
    const nuevo = pila[pila.length - 1];
    if (!nodos.has(nuevo)) {
      const p = document.createElement("p"); p.textContent = nuevo.texto; nodos.set(nuevo, p); caja.appendChild(p);
      setTimeout(() => { p.classList.add("saliendo"); setTimeout(() => { p.remove(); if (nodos.get(nuevo) === p) nodos.delete(nuevo); pila = pila.filter((x) => x !== nuevo); }, 420); }, SEGUNDOS_AL_CAMBIAR * 1000);
    }
  });
}
