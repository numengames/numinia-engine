// construir-vr-logica (v2 paridad): what the VR menu's «Construir» says and does, as pure text and numbers (tested in node:
// test/construir-vr.test.ts). On the computer «Construir» opens the builder; in a headset the builder is the controller's
// ray (constructor-xr.ts), switched on by this section — so it has the same three states as the computer's button: it is
// refused (with the reason), it can start, it is on and can stop.
import { nombreDe } from "../../packages/instance/src/identidad.ts";

export const TEXTO_INVITADO = "Entra con tu nombre para construir";
export const TEXTO_SIN_PERMISO = "No tienes permiso para construir en este mundo: pídelo a quien lo administra.";
export const TEXTO_FUERA_DE_VR = "El modo construir con el rayo solo funciona dentro de VR.";
export const AYUDA_RAYO = "Apunta a una cosa y aprieta el gatillo: la eliges. Mantén el gatillo: la mueves. Agarre: la duplicas.";

/** A guest is who still wears the name the server gives by default («Invitado 4F2A», from the id). */
export const esInvitado = (who: { id: string; nombre: string } | null | undefined): boolean => !!who && who.nombre === nombreDe(who.id);

export type VistaConstruir =
  | { tipo: "negado"; texto: string }
  | { tipo: "listo" | "activo"; titulo: string; detalle: string; boton: string };

/** The three states of «Construir» in VR. */
export function vistaConstruirVR(e: { puede: boolean; invitado: boolean; activo: boolean }): VistaConstruir {
  if (!e.puede) return { tipo: "negado", texto: e.invitado ? TEXTO_INVITADO : TEXTO_SIN_PERMISO };
  return e.activo
    ? { tipo: "activo", titulo: "Estás construyendo", detalle: "Apunta con el rayo a lo que quieras cambiar", boton: "Dejar de construir" }
    : { tipo: "listo", titulo: "Construir con el rayo", detalle: "Cierra el menú y apunta a lo que quieras cambiar", boton: "Empezar" };
}
