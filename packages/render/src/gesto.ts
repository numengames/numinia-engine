// El primer gesto de la persona (S1): los navegadores no dejan sonar nada hasta que se ha pulsado, tecleado o tocado
// la página (política de autoplay). Esto estaba dentro de medios.ts; vive aquí porque ahora lo esperan dos sitios: los
// medios del mundo (medios.ts) y el núcleo de audio (audio/nucleo.ts), que no puede importar otro paquete.
// El comportamiento de `trasGesto` es el mismo de siempre: si el gesto ya pasó, la función corre ya; si no, espera.

/** Browsers start sound only after the person clicked or pressed a key: wait for that once, then retry everything. */
let gesto = false;
const enEspera = new Set<() => void>();
/** Cosas que quieren saberlo en CADA gesto, no solo en el primero (reanudar un contexto que se suspendió). */
const siempre = new Set<() => void>();
export function trasGesto(fn: () => void): void { if (gesto) fn(); else enEspera.add(fn); }
/** ¿Ya hubo un gesto en esta página? (el núcleo de audio nace suspendido mientras esto sea `false`). */
export const hayGesto = (): boolean => gesto;
/** Llamar a `fn` en cada gesto (también en el primero, después de la cola de `trasGesto`). */
export function enCadaGesto(fn: () => void): void { siempre.add(fn); }
if (typeof addEventListener === "function") {
  const listo = () => {
    gesto = true;
    for (const fn of [...enEspera]) { enEspera.delete(fn); fn(); }
    for (const fn of [...siempre]) fn();
  };
  for (const t of ["pointerdown", "keydown", "touchend"]) addEventListener(t, listo, { capture: true, passive: true });
}
