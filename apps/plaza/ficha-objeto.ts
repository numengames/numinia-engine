// C3: the object card (ficha) — the pure part. When it shows, what it says, and the link to the place it stands in.
// The DOM lives in constructor.ts (it reuses the builder's own handlers). The server decides who may build; the
// client only hides: the card never appears unless the player may build here AND the builder (edit mode) is open.
import { enlaceSitio, type Sitio } from "./foto-nucleo.ts";

type Obj = Record<string, unknown> & { id: string };

/** The card shows only for someone who may build, with the builder open and an object selected. */
export const fichaVisible = (puede: boolean, abierto: boolean, seleccion: string): boolean => puede && abierto && seleccion !== "";

/** Lets «Ir» (the map) open the card by itself: select the object only when the builder is on and open. */
export const seleccionarAlIr = (puede: boolean, abierto: boolean, existe: boolean): boolean => puede && abierto && existe;

const TIPOS: Record<string, string> = { modelo: "Modelo", imagen: "Imagen", video: "Pantalla de vídeo", sonido: "Zona de sonido" };
const dec = (v: unknown) => String(Math.round(Number(v) * 10) / 10).replace(".", ",");
const num = (v: unknown) => Number.isFinite(Number(v));

/** What the card says about an object. Only fields the object model carries (the maker is not one of them): no inventing. */
export function datosFicha(o: Obj): { titulo: string; tipo: string; hechos: [string, string][] } {
  const hechos: [string, string][] = [];
  if (num(o.x) && num(o.z)) hechos.push(["Posición", `x ${dec(o.x)} · z ${dec(o.z)}${num(o.y) && Number(o.y) !== 0 ? ` · y ${dec(o.y)}` : ""}`]);
  if (num(o.sx) && num(o.sy) && num(o.sz)) hechos.push(["Escala", o.sx === o.sy && o.sy === o.sz ? dec(o.sx) : `${dec(o.sx)} × ${dec(o.sy)} × ${dec(o.sz)}`]);
  hechos.push(["Estado", o.fijado === true ? "anclado" : "suelto"]);
  return { titulo: String(o.nombre ?? "") || "(decorado)", tipo: TIPOS[String(o.tipo ?? "modelo")] ?? "Objeto", hechos };
}

/** The link to the spot in front of an object, in the same `#foto=` form as the photo mode (opening it travels there). */
export function enlaceDeObjeto(loc: { origin: string; pathname: string; search: string }, o: Obj): string | null {
  if (!num(o.x) || !num(o.y) || !num(o.z)) return null;
  const alto = num(o.sy) ? Math.abs(Number(o.sy)) : 1;
  const s: Sitio = { x: Number(o.x), y: Number(o.y) + alto / 2, z: Number(o.z), yaw: 0, pitch: -0.3, dist: Math.min(30, Math.max(4, Math.max(alto, Math.abs(Number(o.sx) || 1)) * 3)) };
  return enlaceSitio(loc, s);
}
