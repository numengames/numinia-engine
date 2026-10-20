// dardos duel on the page (AR-D3): the glue between the controller (`dardos.duelo()`), the wall board in AR (the 3D panel,
// the rival's darts, turn gating: packages/render/src/dardos-duelo-ar.ts) and one text line in the page's HUD for the
// players on a flat screen. All new code lives here so apps/plaza/dardos.ts changes only by a few lines.
import { envolverDuelo } from "../../packages/render/src/dardos-duelo-ar.ts";
import { panelDe, puedeLanzar, TEXTO_BOTON } from "../../packages/render/src/dardos-duelo.ts";
import type { DueloV } from "../../packages/render/src/dardos-duelo.ts";
import type { DianaAR } from "../../packages/render/src/index.ts";
import { crearLetreroPlaza } from "../../packages/render/src/dardos-duelo-plaza-3d.ts"; // AR-D4: the sign over the plaza board
import type { PlazaDianas } from "../../packages/render/src/dardos-duelo-plaza-3d.ts";
import { letreroDe } from "../../packages/render/src/dardos-duelo-plaza.ts";
import { estadoEntrada } from "./dardos-unirse.ts"; // R4: is the board free to sit at

type Res = { ok: true } | { ok: false; why: string };
type SitioV = { id: string; nombre?: string; ocupado?: boolean; duelo?: boolean; remoto?: boolean; rondas?: number; espera?: boolean; jugadores?: number; equipos?: number };
/** The part of the controller (features/dardos/client.ts) this glue uses. */
export type Ctl = {
  sitios(): SitioV[]; duelo(): DueloV | null; jugar(sitio?: string, desde?: "sitio" | "pared"): Res;
  lanzar(x: number, y: number, fuerza: number, sitio?: string, via?: "ar"): Res; salir(): Res; clavados(sitio?: string): unknown[];
  /** v3 (teams): the buttons «Cambiar turno» and «Empezar». */
  cambiar?(): Res; empezar?(): Res;
  alCambiar?(fn: (que: string) => void): () => void;
};

/** The board an AR wall joins: the one the player picked (the lobby's) if it still takes remote players in a duel; else the first
 *  one that does, one with somebody waiting first. */
export function elegirSitioAR(sitios: SitioV[], preferido?: string | null): SitioV | null {
  const v = sitios.filter((s) => s.duelo && s.remoto);
  return (preferido ? v.find((s) => s.id === preferido) : undefined) ?? v.find((s) => s.espera) ?? v.find((s) => !s.ocupado) ?? v[0] ?? null;
}

/** The HUD line for a flat-screen player: «Ana 12 – Luis 9 · Ronda 2/3 · Tu turno». Empty without a match. */
export function lineaDuelo(d: DueloV | null, rondas: number): string {
  const p = panelDe(d, rondas);
  if (p.fase === "nada") return "";
  const marc = p.filas.map((f) => `${f.nombre}${f.yo ? " (tú)" : ""} ${f.puntos}`).join(" – ");
  return [p.fase === "espera" ? "" : marc, p.ronda, p.pie].filter(Boolean).join(" · ");
}

export function montarDuelo(o: { dardos: Ctl; plaza?: Partial<PlazaDianas>; entity: () => number; hud: HTMLElement; fijarSitio: (id: string) => void; avisar: (texto: string) => void; alTerminar: () => void }) {
  const { dardos } = o;
  const linea = document.createElement("p"); linea.className = "duelo"; linea.hidden = true;
  linea.setAttribute("style", "margin:0;font-size:14px;font-weight:700;color:#ffd27a;text-align:center");
  o.hud.querySelector(".resultado")?.after(linea);
  // v3: the two buttons of the match (HUD of a flat screen; AR has its own on the 3D panel). Shown only when they can be pressed.
  const botones = document.createElement("div"); botones.className = "duelo-botones"; botones.hidden = true;
  botones.setAttribute("style", "display:flex;gap:8px;justify-content:center;margin:4px 0");
  const crear = (clase: string, texto: string, accion: () => Res | undefined): HTMLButtonElement => {
    const b = document.createElement("button"); b.type = "button"; b.className = clase; b.textContent = texto; b.hidden = true;
    b.setAttribute("style", "font:800 15px system-ui,sans-serif;padding:8px 16px;border-radius:12px;border:0;background:#ffd27a;color:#1b1f24;cursor:pointer");
    b.onclick = () => { const r = accion(); if (r && !r.ok) o.avisar(r.why); };
    botones.append(b); return b;
  };
  const bEmpezar = crear("empezar", TEXTO_BOTON.empezar, () => dardos.empezar?.());
  const bCambiar = crear("cambiar", TEXTO_BOTON.cambiar, () => dardos.cambiar?.());
  linea.after(botones);
  let activo = false, sitio = "", elegido: string | null = null, ar: ReturnType<typeof envolverDuelo> | null = null, rondas = 3;
  // AR-D4: in the plaza, the 3D board of the duel gets a scoreboard sign (any bystander sees it) and its remote darts fly in
  const letrero = o.plaza?.grupo && o.plaza.malla && o.plaza.alFotograma ? crearLetreroPlaza(o.plaza as PlazaDianas) : null;
  const sign = (): void => {
    const d = dardos.duelo();
    letrero?.duelo(d, (d && dardos.sitios().find((s) => s.id === d.sitio)?.rondas) || 3);
  };
  if (letrero) {
    dardos.alCambiar?.((que) => {
      if (que === "clavados") letrero.llegan(dardos.clavados() as never, dardos.duelo());
      else if (que === "sitios") sign(); // a board appeared or went: the sign follows it
    });
    sign();
  }
  const hayPartida = (): boolean => { const d = dardos.duelo(); return !!d && d.yo && !d.fin; };

  /** Placing the board on the wall = joining the duel board (if there is one); else this AR session is plain v1. */
  const entrar = (): void => {
    if (hayPartida()) return;
    const s = elegirSitioAR(dardos.sitios(), elegido);
    if (!s) { activo = false; return; }
    sitio = s.id; rondas = s.rondas ?? 3; o.fijarSitio(s.id);
    const r = dardos.jugar(s.id, "pared");
    if (r.ok) activo = true; else { activo = false; o.avisar(r.why); }
    ar?.refrescar();
  };
  return {
    /** Options for `view.dardosAR`: the page's own throw callback is replaced by one that only sends on my live turn. */
    opcionesAR(base: { alLanzar: (x: number, y: number, f: number) => void; alColocar?: (pared: boolean) => void }) {
      return {
        alLanzar: (x: number, y: number, f: number) => {
          if (!activo) { base.alLanzar(x, y, f); return; }
          if (!puedeLanzar(dardos.duelo(), true)) return; // out of turn: not even sent
          const r = dardos.lanzar(x, y, f, sitio, "ar"); if (!r.ok) o.avisar(r.why);
        },
        alColocar: (pared: boolean) => { base.alColocar?.(pared); entrar(); },
        envolver: (j: DianaAR): DianaAR => (ar = envolverDuelo(j, {
          duelo: () => dardos.duelo(), yo: o.entity, activo: () => activo, rondas: () => rondas,
          salir: () => { dardos.salir(); activo = false; },
          boton: (que) => { if (que === "unirse") { entrar(); return; } const r = que === "cambiar" ? dardos.cambiar?.() : dardos.empezar?.(); if (r && !r.ok) o.avisar(r.why); },
          unirse: () => { if (hayPartida()) return null; const s = elegirSitioAR(dardos.sitios(), elegido); return s && estadoEntrada({ ...s, ocupado: !!s.ocupado }).libre ? s.nombre || "la diana" : null; },
        })),
      };
    },
    /** The controller said `duelo` changed: repaint the 3D panel and the text line. */
    cambio(): void {
      const d = dardos.duelo(), t = lineaDuelo(d, (d && dardos.sitios().find((s) => s.id === d.sitio)?.rondas) || rondas); // the board's own rounds, also for a player who never hung it on a wall
      linea.textContent = t; linea.hidden = !t;
      const boton = d?.yo ? panelDe(d, rondas).boton : null;
      bEmpezar.hidden = boton !== "empezar"; bCambiar.hidden = boton !== "cambiar"; botones.hidden = !boton;
      ar?.refrescar(); sign();
      if (!d) o.alTerminar();
    },
    /** The shared state of the boards changed (somebody sat, a match began): the wall board's join button follows it. */
    sitiosCambiaron(): void { ar?.refrescar(); },
    /** True while a live match of mine is going (the HUD stays open for it). */
    enPartida: hayPartida,
    activo: () => activo,
    /** R4: the board the player opened from the lobby: the next wall hung joins that one. */
    preferir: (id: string | null): void => { elegido = id; },
    /** Press a HUD button (e2e / agents): true when it was visible. */
    pulsar: (que: "empezar" | "cambiar"): boolean => { const b = que === "cambiar" ? bCambiar : bEmpezar; if (b.hidden) return false; b.click(); return true; },
    sitio: () => sitio,
    /** Read-only, for the e2e (`__numinia.dardosHud.duelo()`): what the sign over the 3D board, the AR panel and the HUD line say. */
    vista: () => {
      const d = dardos.duelo(), l = letreroDe(d, (d && dardos.sitios().find((s) => s.id === d.sitio)?.rondas) || rondas);
      return { linea: linea.hidden ? "" : linea.textContent ?? "", letrero: { visible: letrero?.estado().visible ?? false, etiqueta: l.etiqueta, fase: l.panel.fase, pie: l.pie.join(" "), filas: l.panel.filas }, panelAR: ar?.duelo() ?? null, botones: { empezar: !bEmpezar.hidden, cambiar: !bCambiar.hidden } };
    },
  };
}
