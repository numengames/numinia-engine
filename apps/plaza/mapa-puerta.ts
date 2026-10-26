// t_45ef2f70: the map's façade. mapa.ts (the minimap, the big map, the markers' registry: ~7 kB gz plus its CSS) is not
// needed to draw the first frame, so main.ts mounts THIS: the same object (`mapa.abrir()`, `.marcarDestino()`,
// `.fuente()`, `.minimapa.girar()`…) whose calls wait for the real map and run in order when it lands after the first
// frame. Answers that need the real map say «nothing yet» (no markers, no way back, closed) until then; a press that
// needs it (M, «Ir», «Marcar destino») loads it right away.
import type { HostMapa } from "./mapa.ts";
import { crearPuerta } from "./puerta.ts";
import { escribiendo } from "./escribiendo.ts";

type Real = ReturnType<typeof import("./mapa.ts").montarMapa>;
type Sitio = { id: string; nombre: string; x: number; z: number };
/** The real map's object without its registry (nobody outside reads it; the kinds are added with `registrar` / `rol`). */
export type MapaPuerta = Omit<Real, "registro">;

export function montarMapaPuerta(h: HostMapa): MapaPuerta {
  const alTeclado = (e: KeyboardEvent): void => {
    if (e.code !== "KeyM" || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e)) return;
    e.preventDefault(); e.stopPropagation(); ya((r) => r.abrir());
  };
  const puerta = crearPuerta<Real>(async () => {
    const m = await import("./mapa.ts");
    removeEventListener("keydown", alTeclado, { capture: true }); // the real map listens for M from now on
    return m.montarMapa(h);
  }, "mapa");
  addEventListener("keydown", alTeclado, { capture: true });
  /** Queue for when the map lands (a setting, a marker source: nobody waits for it). */
  const luego = (f: (r: Real) => void): void => puerta.despues(f);
  /** Queue and bring the map now (the person pressed something that needs it). */
  const ya = (f: (r: Real) => void): void => { puerta.despues(f); void puerta.cargarYa().catch(() => {}); };

  return {
    registrar: (id, t) => luego((r) => r.registrar(id, t)),
    rol: (role, tipo) => luego((r) => r.rol(role, tipo)),
    fuente: (id, f) => luego((r) => r.fuente(id, f)),
    quitarFuente: (id) => luego((r) => r.quitarFuente(id)),
    marcadores: () => puerta.real()?.marcadores() ?? [],
    contar: () => puerta.real()?.contar() ?? ({} as ReturnType<Real["contar"]>),
    fallos: () => puerta.real()?.fallos() ?? [],
    dibujado: () => puerta.real()?.dibujado() ?? { mini: {}, grande: {} },
    stats: () => puerta.real()?.stats() ?? ({ mini: {}, grande: {}, imagenes: 0, vueltas: 0, ocultas: 0, corte: 0 } as unknown as ReturnType<Real["stats"]>),
    volver: () => puerta.real()?.volver() ?? false, // there is no «where you were» before the map exists
    puedeVolver: () => puerta.real()?.puedeVolver() ?? false,
    irAndando: (m: Sitio) => { const r = puerta.real(); if (r) return r.irAndando(m); ya((x) => { x.irAndando(m); }); return !!h.andar; },
    andandoTermino: (f) => luego((r) => r.andandoTermino(f)),
    ir: (m: Sitio) => ya((r) => r.ir(m)),
    puedeIr: () => !!h.teletransporte?.activo(),
    abrir: () => ya((r) => r.abrir()),
    cerrar: () => { const r = puerta.real(); if (r) r.cerrar(); },
    abierto: () => puerta.real()?.abierto() ?? false,
    imagen: () => puerta.real()?.imagen() ?? null,
    muestra: (x, z) => puerta.real()?.muestra(x, z) ?? null,
    destino: () => puerta.real()?.destino() ?? null,
    marcarDestino: (id) => { const r = puerta.real(); if (r) return r.marcarDestino(id); ya((x) => { x.marcarDestino(id); }); return typeof id !== "string"; },
    quitarDestino: () => luego((r) => r.quitarDestino()),
    minimapa: {
      girar: (si) => luego((r) => r.minimapa.girar(si)),
      zoom: (i) => luego((r) => r.minimapa.zoom(i)),
      recentrar: () => luego((r) => r.minimapa.recentrar()),
      estado: () => puerta.real()?.minimapa.estado() ?? ({ zoom: 0, gira: false, radio: 0, recentrados: 0 } as ReturnType<Real["minimapa"]["estado"]>),
    },
  };
}
