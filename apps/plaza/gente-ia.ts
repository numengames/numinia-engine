// gente-ia (ia-visible S6/S7): the pure part of the AIs in «Gente» and in the card — the count «N personas · M IAs», the name
// without the server's « · IA» mark, and the card's model. No DOM: gente.ts and gente-tarjeta.ts only draw what this says.
// D-084: who answers for an AI is shown as the community and the person's name or, without one, their short wallet.
import type { IAPublica } from "../../features/ia/feature.ts";
import { es, type TextosIA } from "./gente-ia-es.ts";

/** Every language written so far; the rest (ja, ko, pt-br) are pending and fall back to Spanish. */
export const IDIOMAS: Readonly<Record<string, TextosIA>> = { es };
export const textos = (idioma?: string): TextosIA => {
  const base = (idioma ?? "es").toLowerCase().split("-")[0]!;
  return Object.hasOwn(IDIOMAS, base) ? IDIOMAS[base]! : es;
};

/** The mark the server puts after an AI's name (identidad.ts MARCA_IA). */
export const MARCA = " · IA";
/** The name as the card shows it: the chip says «IA», so the suffix would say it twice. */
export const sinMarca = (nombre: string): string => (nombre.endsWith(MARCA) ? nombre.slice(0, -MARCA.length) : nombre) || nombre;

/** «3 personas · 2 IAs»; the AIs part is left out when there are none; one is singular. Negative or odd counts read as 0. */
export function cuentaGente(personas: number, ias: number, idioma?: string): string {
  const t = textos(idioma), n = (x: number) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const p = n(personas), i = n(ias);
  const parte = (x: number, una: string, varias: string) => `${x} ${x === 1 ? una : varias}`;
  return i ? `${parte(p, t.personaUna, t.personaVarias)} · ${parte(i, t.iaUna, t.iaVarias)}` : parte(p, t.personaUna, t.personaVarias);
}

/** Who answers for it, as written after «Responde por ella:» — «La Torre · Ana» or «La Torre · 0x12…ab»; «no consta» when the pass says nothing. */
export function respondeValor(ia: IAPublica, idioma?: string): string {
  const r = ia.responde;
  if (!r) return textos(idioma).sinResponsable;
  return [r.comunidad, r.nombre || r.cartera || ""].filter(Boolean).join(" · ");
}

export type FichaIA = {
  nombre: string; marca: string;
  estado: IAPublica["estado"]; estadoTexto: string;
  respondeEtiqueta: string; respondeValor: string;
  construye: boolean; construyeTexto: string;
};

/** The card of an AI as the panel and the world card show it. */
export function fichaIA(nombre: string, ia: IAPublica, idioma?: string): FichaIA {
  const t = textos(idioma);
  return {
    nombre: sinMarca(nombre), marca: t.marca,
    estado: ia.estado, estadoTexto: ia.estado === "dormida" ? t.dormida : t.activa,
    respondeEtiqueta: t.responde, respondeValor: respondeValor(ia, idioma),
    construye: ia.puede.construir, construyeTexto: ia.puede.construir ? t.construye : t.noConstruye,
  };
}

/** The line under an AI's name in a list: state and distance («Activa · a 5 m»). */
export const subIA = (ia: IAPublica, distancia: string, idioma?: string): string => [textos(idioma)[ia.estado === "dormida" ? "dormida" : "activa"], distancia].filter(Boolean).join(" · ");
