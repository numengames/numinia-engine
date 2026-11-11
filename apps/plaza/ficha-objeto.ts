// C3: the object card (ficha) — the pure part. When it shows, what it says, and the link to the place it stands in.
// The DOM lives in constructor.ts (it reuses the builder's own handlers). The server decides who may build; the
// client only hides: the card never appears unless the player may build here AND the builder (edit mode) is open.
import { enlaceSitio, type Sitio } from "./foto-nucleo.ts";
import { tx } from "../../packages/feature/src/idioma.ts";

type Obj = Record<string, unknown> & { id: string };

/** The card shows only for someone who may build, with the builder open and an object selected. */
export const fichaVisible = (puede: boolean, abierto: boolean, seleccion: string): boolean => puede && abierto && seleccion !== "";

/** Lets «Ir» (the map) open the card by itself: select the object only when the builder is on and open. */
export const seleccionarAlIr = (puede: boolean, abierto: boolean, existe: boolean): boolean => puede && abierto && existe;

const tipoNombre = (t: string): string => ({ modelo: tx("Model", "Modelo"), imagen: tx("Image", "Imagen"), video: tx("Video screen", "Pantalla de vídeo"), sonido: tx("Sound zone", "Zona de sonido") } as Record<string, string>)[t] ?? tx("Object", "Objeto");
const dec = (v: unknown) => { const s = String(Math.round(Number(v) * 10) / 10); return tx(s, s.replace(".", ",")); };
const num = (v: unknown) => Number.isFinite(Number(v));

/** What the card says about an object. Only fields the object model carries (the maker is not one of them): no inventing. */
export function datosFicha(o: Obj): { titulo: string; tipo: string; hechos: [string, string][] } {
  const hechos: [string, string][] = [];
  if (num(o.x) && num(o.z)) hechos.push([tx("Position", "Posición"), `x ${dec(o.x)} · z ${dec(o.z)}${num(o.y) && Number(o.y) !== 0 ? ` · y ${dec(o.y)}` : ""}`]);
  if (num(o.sx) && num(o.sy) && num(o.sz)) hechos.push([tx("Scale", "Escala"), o.sx === o.sy && o.sy === o.sz ? dec(o.sx) : `${dec(o.sx)} × ${dec(o.sy)} × ${dec(o.sz)}`]);
  hechos.push([tx("State", "Estado"), o.fijado === true ? tx("anchored", "anclado") : tx("loose", "suelto")]);
  return { titulo: String(o.nombre ?? "") || tx("(decor)", "(decorado)"), tipo: tipoNombre(String(o.tipo ?? "modelo")), hechos };
}

/** The link to the spot in front of an object, in the same `#foto=` form as the photo mode (opening it travels there). */
export function enlaceDeObjeto(loc: { origin: string; pathname: string; search: string }, o: Obj): string | null {
  if (!num(o.x) || !num(o.y) || !num(o.z)) return null;
  const alto = num(o.sy) ? Math.abs(Number(o.sy)) : 1;
  const s: Sitio = { x: Number(o.x), y: Number(o.y) + alto / 2, z: Number(o.z), yaw: 0, pitch: -0.3, dist: Math.min(30, Math.max(4, Math.max(alto, Math.abs(Number(o.sx) || 1)) * 3)) };
  return enlaceSitio(loc, s);
}

// C4: «Lógica» says what wires touch the object (read from the state the cable, the locks and the counters already keep:
// no new network path). Since ux2-dock it lives in the Inspector drawer, and the card's «Al tocarlo» reads its «Salen».
type Receptor = Record<string, unknown>;
export type PiezasMundo = {
  disparadores: { id: string; nombre: string; tipo: string; x: number; z: number; receptores: Receptor[] }[];
  cerraduras: { nombre: string; metodo: string; abierta: boolean; x: number; z: number }[];
  contadores: { nombre: string; tipo: string; valor: number; x: number; z: number }[];
};
const verboDe = (a: string): string | undefined => ({ muestra: tx("shows", "muestra"), oculta: tx("hides", "oculta"), teletransporta: tx("teleports", "teletransporta"), da_paso: tx("gives a quest step", "da un paso de misión"), abre_enlace: tx("opens a link", "abre un enlace"), suena: tx("plays a sound", "suena"), vuelve_a_seguro: tx("returns to a safe spot", "vuelve a un sitio seguro"), mueve: tx("moves", "mueve") } as Record<string, string>)[a];
const verbo = (r: Receptor) => `${verboDe(String(r.accion)) ?? String(r.accion)}${r.objeto ? ` «${String(r.objeto)}»` : ""}`;
const AQUI_M = 1.5; // a trigger, lock or counter «at» an object stands within this many metres of it (on the ground plan)
const cerca = (o: Obj, p: { x: number; z: number }) => num(o.x) && num(o.z) && Math.hypot(Number(o.x) - p.x, Number(o.z) - p.z) <= AQUI_M;

/** The wires of one object, as lines of text: «Entran» (a trigger whose «muestra»/«oculta» receivers name this object, by id or by name), «Salen»
 * (a trigger standing at the object, with what it does) and «Piezas» (locks and counters at the same spot). Pure. */
export function logicaDeObjeto(o: Obj, w: PiezasMundo): { entran: string[]; salen: string[]; piezas: string[] } {
  const nombre = String(o.nombre ?? "");
  const apunta = (r: Receptor) => (r.accion === "muestra" || r.accion === "oculta") && r.objeto !== undefined && r.objeto !== "" && (r.objeto === o.id || (nombre !== "" && r.objeto === nombre));
  const entran = w.disparadores.flatMap((d) => d.receptores.filter(apunta).map((r) => `«${d.nombre}» (${d.tipo}) ${verbo(r)}`));
  const salen = w.disparadores.filter((d) => cerca(o, d)).map((d) => `«${d.nombre}» (${d.tipo}) → ${d.receptores.length ? d.receptores.map(verbo).join(", ") : tx("no receivers", "sin receptores")}`); // i18n-ok: composed from translated parts
  const piezas = [
    ...w.cerraduras.filter((k) => cerca(o, k)).map((k) => tx(`Lock «${k.nombre}» (${k.metodo === "codigo" ? "with code" : "with key"}): ${k.abierta ? "open" : "closed"}`, `Cerradura «${k.nombre}» (${k.metodo === "codigo" ? "con código" : "con llave"}): ${k.abierta ? "abierta" : "cerrada"}`)),
    ...w.contadores.filter((k) => cerca(o, k)).map((k) => tx(`Counter «${k.nombre}» (${k.tipo.replace("_", " ")}): ${dec(k.valor)}`, `Contador «${k.nombre}» (${k.tipo.replace("_", " ")}): ${dec(k.valor)}`)),
  ];
  return { entran, salen, piezas };
}

// C5 (touch): no hover on a phone, so each icon-only button of the card carries a short visible label (CSS shows it only on
// coarse pointers; the aria-label stays the full title).
export const ETIQUETAS_FICHA = {
  get mover() { return tx("Move", "Mover"); }, get girar() { return tx("Rotate", "Girar"); }, get escalar() { return tx("Scale", "Escalar"); }, get duplicar() { return tx("Copy", "Copiar"); },
  get anclar() { return tx("Anchor", "Anclar"); }, get soltar() { return tx("Release", "Soltar"); }, get enlace() { return tx("Link", "Enlace"); }, get borrar() { return tx("Delete", "Borrar"); },
  get volver() { return tx("Back", "Volver"); }, get cerrar() { return tx("Close", "Cerrar"); },
}; // getters: read when the card renders, in the language of that moment

// C5: the same card in VR (packages/render/src/vr-ficha.ts draws it; the buttons run the builder's own verbs on what is selected).
// There is no gizmo in VR, so «Mover» only arms the ray's hold and the turn and the scale are steps (15°, ×1,25 / ×0,8).
export type AccionVR = "mover" | "girar" | "mas" | "menos" | "duplicar" | "anclar" | "borrar" | "cerrar";
type Res = { ok: true } | { ok: false; why: string };
export type VerbosFicha = { modo(m: string): Res; girar(g: number): Res; escalar(f: number): Res; duplicar(): Res; fijar(): Res; borrar(): Res; seleccionar(id: string): Res };
export const PASO_GIRO_VR = 15, FACTOR_MAS_VR = 1.25, FACTOR_MENOS_VR = 0.8;
export function aplicarAccionVR(c: VerbosFicha, a: AccionVR): { res: Res; dicho: string } {
  const hecho = (res: Res, dicho: string) => ({ res, dicho: res.ok ? dicho : `No: ${res.why}` });
  switch (a) {
    case "mover": return hecho(c.modo("mover"), tx("Move: point at the object and hold the trigger to carry it.", "Mover: apunta al objeto y mantén el gatillo para llevarlo."));
    case "girar": return hecho(c.girar(PASO_GIRO_VR), tx(`Rotated ${PASO_GIRO_VR}°.`, `Girado ${PASO_GIRO_VR}°.`));
    case "mas": return hecho(c.escalar(FACTOR_MAS_VR), tx("Bigger.", "Más grande."));
    case "menos": return hecho(c.escalar(FACTOR_MENOS_VR), tx("Smaller.", "Más pequeño."));
    case "duplicar": return hecho(c.duplicar(), tx("Duplicated.", "Duplicado."));
    case "anclar": return hecho(c.fijar(), tx("Anchored or loose.", "Anclado o suelto."));
    case "borrar": return hecho(c.borrar(), tx("Deleted.", "Borrado."));
    case "cerrar": return hecho(c.seleccionar(""), tx("Card closed.", "Ficha cerrada."));
  }
}
