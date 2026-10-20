// condiciones/c4 — the entry bubble in VR, on the page. The flat bubble (condiciones.ts) keeps the state — the step, the boxes, what is
// being sent — and this is a second VIEW of it: while the headset presents and the bubble is up, the same steps are drawn as one panel
// in front of you (packages/render/src/condiciones-vr.ts, fed by condiciones-vr-logica.ts from condiciones-logica.ts), and what you
// press there calls the same methods the flat buttons call (`ir`, `marcarNorma`, `marcarDato`, `enviar`, `salir`). Nothing is decided here.
//   · Going into VR half way keeps everything (step, boxes): the state lives in the flat bubble, which stays mounted under the headset.
//   · Going out of VR with the bubble up leaves you where you were, on the flat panel.
//   · The page numbers inside a step (the paging of the text) belong to this view; they start at the first page of each step.
//   · «Salir» asks twice in the headset (a stray press with a ray is easy), then leaves: the headset session ends so the farewell page
//     (flat) can be seen; with a city address the page goes there as on the flat panel.
//   · Accepting: the server answers `abierta: true`, the panel fades with the bubble's burst and the world is yours.
// Called every frame (`tick`): it does nothing — not even reading the state — unless the bubble is up and the headset is presenting.
import type { montarCondiciones } from "./condiciones.ts";
import { crearPaginador, modelo, type Medir } from "./condiciones-vr-logica.ts";
import { paginaTras, type ModeloVR, type Zona } from "../../packages/render/src/condiciones-vr-geom.ts";

type Condiciones = ReturnType<typeof montarCondiciones>;
type PanelVR = { abierto: boolean; estallando: boolean; medir: Medir };
type VistaVR = {
  active: boolean;
  condiciones(): PanelVR | null;
  condicionesCargar(): Promise<unknown>;
  condicionesModelo(m: ModeloVR | null, estallido?: boolean): void;
  onCondicion(fn: (z: Zona) => void): unknown;
  onCondicionPagina(fn: (dir: -1 | 1) => void): unknown;
  exit(): Promise<void>;
};
/** «Salir» in VR: the second press must come within this long (ms) of the first. */
export const SALIR_VR_PIDE_MS = 3000;

export function montarCondicionesXR(o: { condiciones: Condiciones; vr: VistaVR; mundo(): string; /** can this browser enter VR (so the panel is worth fetching early) */ soportado(): boolean; ahora?(): number }) {
  const { condiciones: cond, vr } = o;
  const ahora = o.ahora ?? (() => performance.now());
  const paginaDe = new Map<number, number>(); // step index → page of its text
  let ultimosPasos: unknown = null, ultimoPaso = -1, sucio = true, salirHasta = 0, temporizador: ReturnType<typeof setTimeout> | null = null, precargado = false, saliendo = false;
  let paginar: ReturnType<typeof crearPaginador> | null = null;
  const marcar = (): void => { sucio = true; };
  cond.alCambiar(marcar);

  const pagina = (): number => paginaDe.get(cond.estado.paso) ?? 0;
  function construir(): ModeloVR | null {
    const e = cond.estado, p = vr.condiciones() as (PanelVR | null);
    if (!p) return null;
    paginar ??= crearPaginador((t, est) => p.medir(t, est));
    if (e.pasos !== ultimosPasos) { ultimosPasos = e.pasos; paginaDe.clear(); salirHasta = 0; } // a new offer: start again
    if (e.paso !== ultimoPaso) { if (ultimoPaso >= 0 && e.paso > ultimoPaso) paginaDe.delete(e.paso); ultimoPaso = e.paso; } // forwards: the first page; back: where you left it
    return modelo({
      pasos: e.pasos, i: e.paso, marcas: e.marcas, capas: e.capas, mundo: o.mundo(), pagina: pagina(), paginar,
      enviando: e.enviando, saliendo: e.saliendo, aviso: e.aviso, salirPide: ahora() < salirHasta,
    });
  }
  const girar = (dir: number): void => {
    const m = construir(); if (!m) return;
    const nueva = paginaTras(m.pagina, dir, m.paginas);
    if (nueva !== m.pagina) { paginaDe.set(cond.estado.paso, nueva); sucio = true; }
  };

  function alPulsar(z: Zona): void {
    const e = cond.estado, p = e.pasos[e.paso];
    if (!p || e.enviando || e.saliendo) return;
    if (z.tipo === "pag-ant") girar(-1);
    else if (z.tipo === "pag-sig") girar(1);
    else if (z.tipo === "norma") { if (p.tipo === "capa") cond.marcarNorma(p.capa, !(e.marcas.normas[p.capa] === true)); }
    else if (z.tipo === "dato") {
      const m = construir(); if (!m || p.tipo !== "datos") return;
      const pg = paginar!(p)[m.pagina], k = pg?.datos[z.indice], x = k === undefined ? undefined : p.permisos[k];
      if (x) cond.marcarDato(x.punto.id, !e.marcas.datos.has(x.punto.id));
    } else if (z.tipo === "boton") {
      switch (z.boton) {
        case "atras": cond.ir(e.paso - 1); break;
        case "siguiente": cond.ir(e.paso + 1); break;
        case "sin-opcional": cond.enviar("marcadas"); break;
        case "todo": cond.enviar("todo"); break;
        case "aceptar": cond.enviar("ninguna"); break;
        case "salir":
          if (ahora() < salirHasta) { salirHasta = 0; cond.salir(); }
          else { salirHasta = ahora() + SALIR_VR_PIDE_MS; if (temporizador) clearTimeout(temporizador); temporizador = setTimeout(() => { temporizador = null; sucio = true; }, SALIR_VR_PIDE_MS + 50); }
          break;
      }
    }
    sucio = true;
  }
  vr.onCondicion(alPulsar);
  vr.onCondicionPagina((dir) => { if (cond.cerrada()) girar(dir); });

  return {
    /** Every frame. */
    tick(): void {
      const arriba = cond.cerrada();
      if (arriba && !precargado && o.soportado()) { precargado = true; void vr.condicionesCargar(); } // so entering VR does not wait for the panel's code
      if (!vr.active) { saliendo = false; return; }
      const panel = vr.condiciones() as (PanelVR | null);
      if (!arriba) { // let through (it bursts with the bubble) or the bubble is gone
        if (panel?.abierto && !panel.estallando) vr.condicionesModelo(null, cond.estado.estallando);
        return;
      }
      if (cond.estado.saliendo) { // left: the farewell page is flat — end the headset session so it can be read
        if (panel?.abierto) vr.condicionesModelo(null, false);
        if (!saliendo) { saliendo = true; void vr.exit(); }
        return;
      }
      if (!panel) { if (!precargado) precargado = true; void vr.condicionesCargar(); return; }
      if (sucio || !panel.abierto) { sucio = false; const m = construir(); if (m) vr.condicionesModelo(m); }
    },
    /** For checks: where the headset's page numbers are. */
    paginas(): { paso: number; pagina: number } { return { paso: cond.estado.paso, pagina: pagina() }; },
  };
}
