// ciudad (t_5cff4f06): the button that leaves the world for the city — ux2-barra: an entry of the bar's «Menú» (O),
// no longer a corner button. The engine carries no brand: the label just says "Volver a la ciudad"; which
// city, and whether there is one at all, comes only from the world's own mundo.ajustes.json (`ciudadUrl`, read by
// ciudad-logica.ts). No world file, no URL, or a bad one: the button stays hidden, exactly as it starts in index.html.
import { urlCiudad } from "./ciudad-logica.ts";
import { alCambiarIdioma, tx } from "../../packages/feature/src/idioma.ts";

export function montarCiudad(o: { mundo: unknown; boton: HTMLButtonElement; icono(nombre: string, px?: number): string }): { url: string | null } {
  const url = urlCiudad(o.mundo);
  o.boton.hidden = !url;
  if (!url) return { url };
  const rotular = (): void => { const texto = tx("Back to the city", "Volver a la ciudad"); o.boton.innerHTML = `${o.icono("map-pin")}<span class="solo-lector">${texto}</span>`; o.boton.title = texto; };
  alCambiarIdioma(rotular); // runs it now and on every language change
  o.boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  o.boton.addEventListener("click", () => { location.href = url; });
  return { url };
}
