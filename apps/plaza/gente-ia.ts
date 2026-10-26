// gente-ia (ia-visible S6/S7): the pure part of the AIs in «Gente» and in the card — the count «N personas · M IAs», the name
// without the server's « · IA» mark, and the card's model. No DOM: gente.ts and gente-tarjeta.ts only draw what this says.
// D-084: who answers for an AI is shown as the community and the person's name or, without one, their short wallet.
import type { IAPublica } from "../../features/ia/feature.ts";
import { ojosDe, type Tamano } from "../../features/ia/ojos.ts";
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

const NOMBRE_TAMANO: Readonly<Record<Tamano, "tamSinModelo" | "tamPequeno" | "tamMedio" | "tamGrande" | "tamDesconocido">> = { "sin-modelo": "tamSinModelo", pequeno: "tamPequeno", medio: "tamMedio", grande: "tamGrande", desconocido: "tamDesconocido" };
/** The glyph of each eye shape, for the card (colour alone would leave a colour-blind person guessing): the same four shapes as on the avatar. */
export const GLIFO_OJOS = { punto: "•", ranura: "▬", redondo: "●", estrella: "✦" } as const;

/** t_5096d6f4: what the card says about the eyes — the label, the size in words, the glyph + CSS colour, and the sentence that explains them. Never the model's name. */
export function ojosFicha(ia: Pick<IAPublica, "tamano">, idioma?: string): { etiqueta: string; tamano: Tamano; nombre: string; glifo: string; color: string; texto: string } {
  const t = textos(idioma), o = ojosDe(ia.tamano);
  return { etiqueta: t.ojos, tamano: o.tamano, nombre: t[NOMBRE_TAMANO[o.tamano]], glifo: GLIFO_OJOS[o.forma], color: `#${o.color.toString(16).padStart(6, "0")}`, texto: o.texto };
}

export type FichaIA = {
  nombre: string; marca: string;
  estado: IAPublica["estado"]; estadoTexto: string;
  respondeEtiqueta: string; respondeValor: string;
  construye: boolean; construyeTexto: string;
  ojos: ReturnType<typeof ojosFicha>;
};

/** The card of an AI as the panel and the world card show it. */
export function fichaIA(nombre: string, ia: IAPublica, idioma?: string): FichaIA {
  const t = textos(idioma);
  return {
    nombre: sinMarca(nombre), marca: t.marca,
    estado: ia.estado, estadoTexto: ia.estado === "dormida" ? t.dormida : t.activa,
    respondeEtiqueta: t.responde, respondeValor: respondeValor(ia, idioma),
    construye: ia.puede.construir, construyeTexto: ia.puede.construir ? t.construye : t.noConstruye,
    ojos: ojosFicha(ia, idioma),
  };
}

/** The line under an AI's name in a list: state and distance («Activa · a 5 m»). */
export const subIA = (ia: IAPublica, distancia: string, idioma?: string): string => [textos(idioma)[ia.estado === "dormida" ? "dormida" : "activa"], distancia].filter(Boolean).join(" · ");

/** S11/S16: the light on the card — «Escuchando ahora» when its brain used the listening tools less than 90 s ago (`atenta`), «No escucha ahora» otherwise. */
export function luzEscucha(ia: IAPublica, idioma?: string): { escucha: boolean; texto: string } {
  const t = textos(idioma);
  return ia.atenta ? { escucha: true, texto: t.escuchando } : { escucha: false, texto: t.noEscucha };
}

/** S11: the E prompt as the interaction layer shows it after «E: » — «hablar con Ada» (the name without the « · IA» mark). */
export const promptHablar = (nombre: string, idioma?: string): string => `${textos(idioma).promptHablar} ${sinMarca(nombre)}`;

export type FilaGenteVR = { quien: number; nombre: string; ia: boolean; detalle: string };
/** «Gente» in the VR menu, as the computer's «Aquí ahora» writes it: people first, then the AIs (name without the mark, «IA»,
 * state and distance), and the title's count «N personas · M IAs». `distancia(quien)` is the text («a 5 m») or "". */
export function listaGenteVR(gente: readonly { quien: number; nombre: string }[], todos: number, iaDe: (quien: number) => IAPublica | null, distancia: (quien: number) => string, idioma?: string): { cuenta: string; filas: FilaGenteVR[] } {
  const t = textos(idioma), ias: FilaGenteVR[] = [], personas: FilaGenteVR[] = [];
  for (const p of gente) {
    const ia = iaDe(p.quien);
    if (ia) ias.push({ quien: p.quien, nombre: sinMarca(p.nombre), ia: true, detalle: [t.marca, ojosFicha(ia, idioma).tamano === "desconocido" ? "" : ojosFicha(ia, idioma).nombre, subIA(ia, distancia(p.quien), idioma)].filter(Boolean).join(" · ") }); // t_5096d6f4: the size too, when the world knows it (a missing or odd value reads as unknown: nothing about size)
    else personas.push({ quien: p.quien, nombre: p.nombre, ia: false, detalle: distancia(p.quien) });
  }
  return { cuenta: cuentaGente(Math.max(todos, gente.length) - ias.length, ias.length, idioma), filas: [...personas, ...ias] };
}
