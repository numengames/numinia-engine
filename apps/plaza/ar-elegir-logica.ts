// dardos enlazados (E2) — the words and the decisions of the little chooser the AR button opens in a world that has a link
// (apps/plaza/ar-elegir.ts draws them). Pure: no DOM, no network, tested in Node (test/ar-elegir.test.ts).
//   «Entrar en AR» → two big buttons: «Dardos de la Torre en tu pared» (first, the default) and «El mundo en tu mesa» (the miniature).
//   The darts button is only ever one of: waiting (the link is still connecting), «accept the norms first», «go» (the link is ready: the
//   click that enters AR), or broken (plain Spanish + «Reintentar»). The miniature is always there: it is the way out of any of them.
import { ENLACE_DARDOS, anfitrionDe } from "../../features/dardos/enlace.ts";
import type { EnlaceDardos } from "../../features/dardos/enlace.ts";
import type { EstadoEnlaceDardos } from "./dardos-enlace.ts";

export const TITULO_ELEGIR = "Entrar en AR";
export const ROTULO_MESA = "El mundo en tu mesa";
export const AYUDA_MESA = "La plaza en miniatura sobre una mesa o el suelo.";
export const ROTULO_REINTENTAR = "Reintentar";
export const ROTULO_CANCELAR = "Cancelar";

/** How the linked world is called: the house's own link says «la Torre» (and «la Torre de los Alquimistas» in the norms' title); any other server is its address. */
export function nombreDelEnlace(e: Pick<EnlaceDardos, "servidor">): { corto: string; largo: string } {
  if (e.servidor === ENLACE_DARDOS.servidor) return { corto: "la Torre", largo: "la Torre de los Alquimistas" };
  const host = anfitrionDe(e.servidor) || "otro mundo";
  return { corto: host, largo: host };
}

export const rotuloDardos = (corto: string): string => `Dardos de ${corto} en tu pared`;

/** The link's own `motivo` (written for logs) → one plain sentence for the person. «Reintentar» goes with it. */
export function motivoParaPersonas(motivo: string, corto: string): string {
  const m = motivo.toLowerCase();
  if (/lleno/.test(m)) return `${mayuscula(corto)} está llena ahora mismo. Prueba en un rato o entra con la maqueta.`;
  if (/no te deja entrar/.test(m)) return `${mayuscula(corto)} no te deja entrar ahora.`;
  if (/no responde/.test(m)) return `${mayuscula(corto)} no responde. Puede que esté parada.`;
  if (/no se pudo (llegar|abrir)/.test(m)) return `No se puede llegar a ${corto}. Mira tu conexión.`;
  if (/conexi[oó]n cerrada/.test(m)) return `Se ha cortado la conexión con ${corto}.`;
  return `Ahora no se puede jugar en ${corto}.`;
}
const mayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** What the darts button does when pressed. `esperar`/`nada` do nothing (the button is on, but not for this). */
export type AccionDardos = "esperar" | "normas" | "entrar" | "reintentar" | "nada";

export type VistaElegir = {
  /** the big button: its words, what it is for, and what pressing it does */
  dardos: { texto: string; ayuda: string; accion: AccionDardos; /** looks off and says «aria-disabled»; it keeps the focus */ apagado: boolean };
  /** a failure to say in a line (the red one); '' = none */
  fallo: string;
  /** «Reintentar» is offered */
  reintentar: boolean;
};

/**
 * The chooser's face from the link's state.
 * `aceptadas`: the person has just accepted the norms in this chooser (so «listo» can say so).
 * `falloAR`: the link is fine but the AR session itself did not start (permission, device); said instead of the usual help.
 */
export function vistaElegir(estado: EstadoEnlaceDardos, motivo: string, enlace: Pick<EnlaceDardos, "servidor">, o: { aceptadas?: boolean; falloAR?: string } = {}): VistaElegir {
  const { corto } = nombreDelEnlace(enlace);
  const texto = rotuloDardos(corto);
  if (o.falloAR && (estado === "listo" || estado === "jugando")) return { dardos: { texto, ayuda: "Toca otra vez para colgar la diana.", accion: "entrar", apagado: false }, fallo: o.falloAR, reintentar: false };
  switch (estado) {
    case "cerrado":
    case "conectando":
      return { dardos: { texto, ayuda: `Conectando con ${corto}…`, accion: "esperar", apagado: true }, fallo: "", reintentar: false };
    case "puerta":
      return { dardos: { texto, ayuda: `Antes tienes que aceptar las normas de ${corto}.`, accion: "normas", apagado: false }, fallo: "", reintentar: false };
    case "listo":
      return { dardos: { texto, ayuda: o.aceptadas ? "Normas aceptadas. Toca para colgar la diana." : "Lista: toca para colgar la diana en tu pared.", accion: "entrar", apagado: false }, fallo: "", reintentar: false };
    case "jugando":
      return { dardos: { texto, ayuda: "Ya estás jugando.", accion: "nada", apagado: true }, fallo: "", reintentar: false };
    case "error":
      return { dardos: { texto, ayuda: "No disponible ahora.", accion: "reintentar", apagado: true }, fallo: motivoParaPersonas(motivo, corto), reintentar: true };
  }
}
