// t_45ef2f70 (fourth step, Pablo's decision of 26-10: the conditions gate loads right after the first frame): the gate's
// façade. condiciones.ts (the bubble of entry: ~41 kB of source, its CSS and the layers' pages) is not needed to draw the
// first frame, so main.ts mounts THIS: the same object `montarCondiciones` always returned, whose calls wait for the real
// bubble and run in order when its chunk lands (`crearPuerta`, asked for after the first frame).
//
// What must NOT change: nobody plays before accepting. The server holds the person anyway (c2: the gate is the server's);
// the page's part is that the world is also closed here. So, from the moment the server's offer says «puerta: true,
// abierta: false» until the real bubble is up (and from then on the bubble's own rule), `cerrada()` is true, and this
// façade holds the page itself, not just hides it:
//   · a full-screen layer takes every pointer press (the bubble's overlay does the same once it is up);
//   · keys, wheel and touches are stopped in the capture phase before the world hears them;
//   · the chunk is brought AT ONCE when the offer arrives (not after the first frame), and if it cannot be fetched the layer
//     stays, says so and offers «Reintentar»: it fails closed, never open.
// With the gate off the server sends nothing, no layer is made, no listener does anything.
import type { CondicionesMensaje } from "../../packages/net/src/index.ts";
import type { OpcionesCondiciones } from "./condiciones.ts";
import { crearPuerta } from "./puerta.ts";

type Real = ReturnType<typeof import("./condiciones.ts").montarCondiciones>;
export type CondicionesPuerta = Real;

/** The same test as `pideBurbuja` in condiciones-logica.ts (kept here so that file stays out of the entry; test/condiciones-puerta.test.ts holds them equal). */
export const pideBurbujaPuerta = (m: CondicionesMensaje | null | undefined): boolean => !!m && m.puerta === true && m.abierta === false;

const EVENTOS = ["keydown", "keyup", "keypress", "wheel", "touchstart", "touchmove"] as const;
const ESTADO_VACIO = { paso: 0, pasos: [], marcas: { normas: {}, datos: new Set<string>() }, enviando: false, saliendo: false, estallando: false, aviso: "", capas: [] } as const;

export function montarCondicionesPuerta(o: OpcionesCondiciones, traer: () => Promise<{ montarCondiciones(o: OpcionesCondiciones): Real }> = () => import("./condiciones.ts")): CondicionesPuerta {
  const s = o.session;
  let real: Real | null = null, fallo = false;
  let capa: HTMLElement | null = null, texto: HTMLElement | null = null, reintento: HTMLButtonElement | null = null;
  const cambios: Array<() => void> = [];
  const pendiente = (): boolean => !real && pideBurbujaPuerta(s.condiciones);

  const guardia = (e: Event): void => { if (!pendiente()) return; e.preventDefault(); e.stopImmediatePropagation(); };
  for (const ev of EVENTOS) addEventListener(ev, guardia, { capture: true, passive: false });

  const puerta = crearPuerta<Real>(async () => {
    const m = await traer();
    const r = m.montarCondiciones(o); // takes over `session.onCondiciones` and draws the offer that already arrived
    real = r; fallo = false; pintar(); // only now is the page no longer held by this façade: the real bubble is up (or the gate is off)
    for (const f of cambios.splice(0)) { r.alCambiar(f); try { f(); } catch { /* an observer never breaks the panel */ } }
    return r;
  }, "condiciones");

  const cargar = (): void => { fallo = false; pintar(); puerta.cargarYa().catch(() => { fallo = true; pintar(); }); };

  /** The holding layer: up while the offer asks for the bubble and the real one is not here yet. */
  function pintar(): void {
    if (!pendiente()) { capa?.remove(); capa = texto = reintento = null; return; }
    if (!capa) {
      capa = document.createElement("div");
      capa.id = "condiciones-espera"; capa.setAttribute("role", "alert");
      capa.style.cssText = "position:fixed;inset:0;z-index:45;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(10,8,6,.82);color:#F9EBDC;font:15px/1.5 Geist,system-ui,sans-serif;touch-action:none;";
      texto = document.createElement("p"); reintento = document.createElement("button");
      reintento.type = "button"; reintento.textContent = "Reintentar"; reintento.hidden = true;
      reintento.style.cssText = "font:inherit;padding:8px 18px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;";
      reintento.addEventListener("click", cargar);
      capa.append(texto, reintento); document.body.appendChild(capa);
    }
    if (texto) texto.textContent = fallo ? "No se han podido cargar las normas del mundo. Comprueba la conexión." : "Cargando las normas del mundo…";
    if (reintento) reintento.hidden = !fallo;
  }

  // The offer (or its change) arrives before the real bubble exists: hold the page and bring the bubble now.
  s.onCondiciones = (m) => { if (real) return; if (pideBurbujaPuerta(m)) { pintar(); if (!fallo) cargar(); } else pintar(); };
  if (pideBurbujaPuerta(s.condiciones)) { pintar(); cargar(); }

  const despues = (f: (r: Real) => void): void => puerta.despues(f);
  const estado = new Proxy({} as Real["estado"], {
    get: (_, k: string) => (k === "activa" ? (real ? real.estado.activa : pendiente()) : real ? (real.estado as unknown as Record<string, unknown>)[k] : (ESTADO_VACIO as unknown as Record<string, unknown>)[k]),
  });

  return {
    estado,
    cerrada: (): boolean => (real ? real.cerrada() : pendiente()),
    alCambiar: (f: () => void): void => { if (real) real.alCambiar(f); else cambios.push(f); },
    ir: (...a: Parameters<Real["ir"]>) => despues((r) => { r.ir(...a); }),
    enviar: (...a: Parameters<Real["enviar"]>) => despues((r) => { void r.enviar(...a); }),
    salir: (sinCiudad = false): void => despues((r) => r.salir(sinCiudad)),
    marcarNorma: (capa: string, v: boolean): void => despues((r) => r.marcarNorma(capa, v)),
    marcarDato: (id: string, v: boolean): void => despues((r) => r.marcarDato(id, v)),
    repetir: (): boolean => (real ? real.repetir() : s.pedirCondiciones()),
    soltar: (): void => { real?.soltar(); },
  } as unknown as CondicionesPuerta;
}
