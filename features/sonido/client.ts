// sonido — client part (S6). Apenas hace nada, y es a propósito: oye el evento del servidor y se lo pasa a la vista
// (`view.sonido`), que es la única que puede tocar (Web Audio vive en `packages/render`, y una función del motor no
// importa `packages/render`: tools/layers.json). Si la vista no sabe sonar (una prueba, un agente, un navegador sin
// audio), se guarda el último sonido para que se pueda comprobar y el texto del evento llega igual a la región en
// vivo de la página: quien no oye, lee.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart } from "../../packages/feature/src/index.ts";
import { sonido } from "./feature.ts";

export type SonidoOido = { id: string; semilla: number; donde: { x: number; y: number; z: number } | null; texto: string; quien: number; tocado: boolean };

export function crearCliente() {
  const estado = { ultimo: null as SonidoOido | null, oidos: 0, tocados: 0 };
  const part: ClientPart = clientPart(sonido, (api: ClientApi) => {
    api.on("suena", (m) => {
      const espacial = m.espacial !== false;
      const s: SonidoOido = {
        id: String(m.sonido ?? ""),
        semilla: Number(m.semilla) >>> 0,
        donde: espacial ? { x: Number(m.x) || 0, y: Number(m.y) || 0, z: Number(m.z) || 0 } : null,
        texto: String(m.texto ?? ""),
        quien: Number(m.quien) || 0,
        tocado: false,
      };
      estado.oidos++;
      // la vista devuelve false cuando no ha podido tocarlo (sin audio, sin catálogo todavía, o un id que no conoce)
      s.tocado = api.view.sonido?.({ id: s.id, semilla: s.semilla, donde: s.donde, texto: s.texto }) === true;
      if (s.tocado) estado.tocados++;
      estado.ultimo = s;
    });
  });
  return { part, estado };
}

const cliente = crearCliente();
/** Lo que oyó esta página (para comprobar y para los agentes): el último sonido, cuántos llegaron y cuántos sonaron. */
export const sonidos = cliente.estado;
export default cliente.part;
