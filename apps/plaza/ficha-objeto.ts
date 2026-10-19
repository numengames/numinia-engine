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

// C4: «Lógica» says what wires touch the object (read from the state the cable, the locks and the counters already keep:
// no new network path). Since ux2-dock it lives in the Inspector drawer, and the card's «Al tocarlo» reads its «Salen».
type Receptor = Record<string, unknown>;
export type PiezasMundo = {
  disparadores: { id: string; nombre: string; tipo: string; x: number; z: number; receptores: Receptor[] }[];
  cerraduras: { nombre: string; metodo: string; abierta: boolean; x: number; z: number }[];
  contadores: { nombre: string; tipo: string; valor: number; x: number; z: number }[];
};
const VERBO: Record<string, string> = { muestra: "muestra", oculta: "oculta", teletransporta: "teletransporta", da_paso: "da un paso de misión", abre_enlace: "abre un enlace", suena: "suena", vuelve_a_seguro: "vuelve a un sitio seguro", mueve: "mueve" };
const verbo = (r: Receptor) => `${VERBO[String(r.accion)] ?? String(r.accion)}${r.objeto ? ` «${String(r.objeto)}»` : ""}`;
const AQUI_M = 1.5; // a trigger, lock or counter «at» an object stands within this many metres of it (on the ground plan)
const cerca = (o: Obj, p: { x: number; z: number }) => num(o.x) && num(o.z) && Math.hypot(Number(o.x) - p.x, Number(o.z) - p.z) <= AQUI_M;

/** The wires of one object, as lines of text: «Entran» (a trigger whose «muestra»/«oculta» receivers name this object, by id or by name), «Salen»
 * (a trigger standing at the object, with what it does) and «Piezas» (locks and counters at the same spot). Pure. */
export function logicaDeObjeto(o: Obj, w: PiezasMundo): { entran: string[]; salen: string[]; piezas: string[] } {
  const nombre = String(o.nombre ?? "");
  const apunta = (r: Receptor) => (r.accion === "muestra" || r.accion === "oculta") && r.objeto !== undefined && r.objeto !== "" && (r.objeto === o.id || (nombre !== "" && r.objeto === nombre));
  const entran = w.disparadores.flatMap((d) => d.receptores.filter(apunta).map((r) => `«${d.nombre}» (${d.tipo}) ${verbo(r)}`));
  const salen = w.disparadores.filter((d) => cerca(o, d)).map((d) => `«${d.nombre}» (${d.tipo}) → ${d.receptores.length ? d.receptores.map(verbo).join(", ") : "sin receptores"}`);
  const piezas = [
    ...w.cerraduras.filter((k) => cerca(o, k)).map((k) => `Cerradura «${k.nombre}» (${k.metodo === "codigo" ? "con código" : "con llave"}): ${k.abierta ? "abierta" : "cerrada"}`),
    ...w.contadores.filter((k) => cerca(o, k)).map((k) => `Contador «${k.nombre}» (${k.tipo.replace("_", " ")}): ${dec(k.valor)}`),
  ];
  return { entran, salen, piezas };
}

// C5 (touch): no hover on a phone, so each icon-only button of the card carries a short visible label (CSS shows it only on
// coarse pointers; the aria-label stays the full title).
export const ETIQUETAS_FICHA = { mover: "Mover", girar: "Girar", escalar: "Escalar", duplicar: "Copiar", anclar: "Anclar", soltar: "Soltar", enlace: "Enlace", borrar: "Borrar", volver: "Volver", cerrar: "Cerrar" } as const;

// C5: the same card in VR (packages/render/src/vr-ficha.ts draws it; the buttons run the builder's own verbs on what is selected).
// There is no gizmo in VR, so «Mover» only arms the ray's hold and the turn and the scale are steps (15°, ×1,25 / ×0,8).
export type AccionVR = "mover" | "girar" | "mas" | "menos" | "duplicar" | "anclar" | "borrar" | "cerrar";
type Res = { ok: true } | { ok: false; why: string };
export type VerbosFicha = { modo(m: string): Res; girar(g: number): Res; escalar(f: number): Res; duplicar(): Res; fijar(): Res; borrar(): Res; seleccionar(id: string): Res };
export const PASO_GIRO_VR = 15, FACTOR_MAS_VR = 1.25, FACTOR_MENOS_VR = 0.8;
export function aplicarAccionVR(c: VerbosFicha, a: AccionVR): { res: Res; dicho: string } {
  const hecho = (res: Res, dicho: string) => ({ res, dicho: res.ok ? dicho : `No: ${res.why}` });
  switch (a) {
    case "mover": return hecho(c.modo("mover"), "Mover: apunta al objeto y mantén el gatillo para llevarlo.");
    case "girar": return hecho(c.girar(PASO_GIRO_VR), `Girado ${PASO_GIRO_VR}°.`);
    case "mas": return hecho(c.escalar(FACTOR_MAS_VR), "Más grande.");
    case "menos": return hecho(c.escalar(FACTOR_MENOS_VR), "Más pequeño.");
    case "duplicar": return hecho(c.duplicar(), "Duplicado.");
    case "anclar": return hecho(c.fijar(), "Anclado o suelto.");
    case "borrar": return hecho(c.borrar(), "Borrado.");
    case "cerrar": return hecho(c.seleccionar(""), "Ficha cerrada.");
  }
}
