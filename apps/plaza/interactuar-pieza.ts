// P15: the page piece of the «E: …» prompt that is fetched with the first thing in reach (not with the first frame: the start bundle has a cap):
// the choice by gaze (interactuar-mirada.ts, pure), the ring in the world and the prompt's own content. interactuar.ts imports only this file.
import type { Object3D } from "three/webgpu";
import { elegirMirada, marcaDe } from "./interactuar-mirada.ts";
import { tx } from "../../packages/feature/src/idioma.ts";
import { medidaEnMundo } from "../../packages/render/src/centro-mundo.ts";
await import("./interactuar-estilo.ts").catch(() => null); // the prompt's look (CSS) is in before this module is; where there is no CSS (the tests under node) it does not matter

/** What the page piece needs once the first thing is in reach: the ring in the world for what it offers and the prompt's own content.
 *  Ring: asks the view for the thing's model (`cosa`) and measures where it is and how big (`medidaEnMundo`), places it (`marcaDe`) and tells the view only when it changes
 *  (`marcar(null)` once when nothing is offered any more); none in VR. Prompt: a drawn key (none on touch) and the words; text only goes in
 *  through textContent (a world's words are never HTML). */
export const crearPieza = (view: { cosa?(key: string): Object3D | undefined; marcar?(p: ReturnType<typeof marcaDe>): void; vr?: { active: boolean }; cam?: { yaw?(): number } }, boton: HTMLButtonElement, tactil: boolean) => {
  let marcado = false;
  const tecla = document.createElement("kbd"), palabras = document.createElement("span");
  tecla.setAttribute("aria-hidden", "true"); palabras.className = "palabras";
  boton.replaceChildren(tecla, palabras);
  return {
    /** The thing the player looks at (see interactuar-mirada.ts); in VR the head is not the desktop camera, so the nearest wins as before (the controllers aim with their own ray). */
    elegir<T extends Parameters<typeof elegirMirada>[0][number]>(lista: T[], p: { x: number; z: number }, actual: T | null): T | null {
      const yaw = view.vr?.active ? undefined : view.cam?.yaw?.();
      return yaw === undefined ? lista.sort((a, b) => a.distance - b.distance)[0] ?? null : (elegirMirada(lista, { x: p.x, z: p.z, yaw }, actual) as T | null);
    },
    marcar(c: { feature: string; key: string; at?: { x: number; z: number; y?: number }; role?: string } | null, pies: number): void {
      const g = c ? view.cosa?.(`${c.feature}:${c.key}`) : undefined, md = g && medidaEnMundo(g), m = c && !view.vr?.active ? marcaDe(c, pies, md?.r, md) : null; // a person's ring ignores the size (marcaDe)
      if (!m && !marcado) return;
      marcado = !!m;
      view.marcar?.(m);
    },
    pintar(prompt: string, tecleada: string | null | undefined): void {
      const mayuscula = prompt.charAt(0).toUpperCase() + prompt.slice(1);
      tecla.hidden = !tecleada; tecla.textContent = tecleada ?? "";
      palabras.textContent = tactil ? mayuscula : prompt;
      boton.title = mayuscula;
      boton.setAttribute("aria-label", tecleada ? tx(`${mayuscula} (key ${tecleada})`, `${mayuscula} (tecla ${tecleada})`) : mayuscula);
    },
  };
};
