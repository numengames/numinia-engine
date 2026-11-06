// MIS-265: the photo as the world's cover. Moved out of main.ts (P10, first-load weight): only the photo card's «Usar de portada»
// button needs it, so it is fetched when that button is pressed and nothing of it travels before the first frame.
import type { ajustes } from "../../features/ficha-mundo/client.ts";

/** Upload a picture and make it the world's cover, keeping every other setting as the server has it; resolves when
 * the server has saved it (or said no). A world without a name has no ficha to write: the owner names it first. */
export async function ponerPortada(ajustesMundo: typeof ajustes, subirImagen: (f: File) => Promise<{ ok: true; nombre: string } | { ok: false; why: string }>, f: File): Promise<{ ok: true } | { ok: false; why: string }> {
  const a = ajustesMundo.actual();
  if (!a) return { ok: false, why: "este servidor no tiene ajustes del mundo" };
  if (!a.nombre.trim()) return { ok: false, why: "ponle antes un nombre al mundo (Construir › Entorno › Ajustes del mundo)" };
  const subida = await subirImagen(f);
  if (!subida.ok) return subida;
  const antes = ajustesMundo.estado.cambios;
  ajustesMundo.estado.ultimoRechazo = "";
  const pedido = ajustesMundo.guardar({ nombre: a.nombre, portada: subida.nombre, avatar: a.avatar, aforo: a.aforo });
  if (!pedido.ok) return pedido;
  for (let t = 0; t < 50; t++) { // the same wait as the settings form (ficha-mundo.ts): the server answers by state or by refusal
    await new Promise((ok) => setTimeout(ok, 100));
    if (ajustesMundo.estado.cambios > antes && ajustesMundo.actual()?.portada === subida.nombre) return { ok: true };
    if (ajustesMundo.estado.ultimoRechazo) { const why = ajustesMundo.estado.ultimoRechazo; ajustesMundo.estado.ultimoRechazo = ""; return { ok: false, why: why.replace(/\.$/, "") }; }
  }
  return { ok: false, why: "el servidor no contestó a tiempo; mira la imagen en Ajustes del mundo" };
}
