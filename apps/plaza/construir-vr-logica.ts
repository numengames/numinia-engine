// construir-vr-logica (v2 paridad): what the VR menu's «Construir» says and does, as pure text and numbers (tested in node:
// test/construir-vr.test.ts). On the computer «Construir» opens the builder; in a headset the builder is the controller's
// ray (constructor-xr.ts), switched on by this section — so it has the same three states as the computer's button: it is
// refused (with the reason), it can start, it is on and can stop.
import { nombreDe } from "../../packages/instance/src/identidad.ts";
import { tx } from "../../packages/feature/src/idioma.ts";

/** The texts, read in the language of the moment. */
export const textoInvitado = (): string => tx("Sign in with your name to build", "Entra con tu nombre para construir");
export const textoSinPermiso = (): string => tx("You don't have permission to build in this world: ask whoever runs it.", "No tienes permiso para construir en este mundo: pídelo a quien lo administra.");
export const textoFueraDeVR = (): string => tx("Ray build mode only works inside VR.", "El modo construir con el rayo solo funciona dentro de VR.");
export const ayudaRayo = (): string => tx("Point at a thing and squeeze the trigger: you pick it. Hold the trigger: you move it. Grip: you duplicate it.", "Apunta a una cosa y aprieta el gatillo: la eliges. Mantén el gatillo: la mueves. Agarre: la duplicas.");
export const ayudaPintar = (): string => tx("Right trigger held: you paint from the controller tip. Let go: the stroke is saved and everyone sees it. B: you throw the stroke away.", "Gatillo derecho apretado: pintas desde la punta del mando. Suéltalo: el trazo se guarda y lo ven todos. B: tiras el trazo.");
// Kept for importers that read a constant (xr-menu.ts): fixed when the module loads, so prefer the functions above, which follow the language.
export const TEXTO_INVITADO = textoInvitado();
export const TEXTO_SIN_PERMISO = textoSinPermiso();
export const TEXTO_FUERA_DE_VR = textoFueraDeVR();
export const AYUDA_RAYO = ayudaRayo();
export const AYUDA_PINTAR = ayudaPintar();

/** A guest is who still wears the name the server gives by default («Invitado 4F2A», from the id). */
export const esInvitado = (who: { id: string; nombre: string } | null | undefined): boolean => !!who && who.nombre === nombreDe(who.id);

export type VistaConstruir =
  | { tipo: "negado"; texto: string }
  | { tipo: "listo" | "activo"; titulo: string; detalle: string; boton: string };

/** The three states of «Construir» in VR. */
export function vistaConstruirVR(e: { puede: boolean; invitado: boolean; activo: boolean }): VistaConstruir {
  if (!e.puede) return { tipo: "negado", texto: e.invitado ? textoInvitado() : textoSinPermiso() };
  return e.activo
    ? { tipo: "activo", titulo: tx("You are building", "Estás construyendo"), detalle: tx("Point the ray at what you want to change", "Apunta con el rayo a lo que quieras cambiar"), boton: tx("Stop building", "Dejar de construir") }
    : { tipo: "listo", titulo: tx("Build with the ray", "Construir con el rayo"), detalle: tx("Close the menu and point at what you want to change", "Cierra el menú y apunta a lo que quieras cambiar"), boton: tx("Start", "Empezar") };
}

export type VistaPintar = { titulo: string; detalle: string; boton: string; activo: boolean };
/** The second row of «Construir» in VR: paint with the controller. Two states (the section's permission check has already happened). */
export function vistaPintarVR(activo: boolean): VistaPintar {
  return activo
    ? { titulo: tx("You are painting", "Estás pintando"), detalle: tx("Right trigger: you paint. B: you throw the stroke away", "Gatillo derecho: pintas. B: tiras el trazo"), boton: tx("Stop painting", "Dejar de pintar"), activo }
    : { titulo: tx("Paint with the controller", "Pintar con el mando"), detalle: tx("Close the menu and squeeze the right trigger", "Cierra el menú y aprieta el gatillo derecho"), boton: tx("Start", "Empezar"), activo };
}
