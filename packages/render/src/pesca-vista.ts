// pesca-vista: the always-present face of fishing (v2). The real code (pond, boardwalk, sign, rod, line, float, the
// landed fish: pesca.ts) is fetched with the first fishing spot or float that arrives, so a world without fishing
// never downloads it.
import type * as THREE from "three/webgpu";
import type { Sitio3D, Flotador3D, Captura3D, Estado3D, Ayudas, AyudasVR } from "./pesca.ts";

type Real = ReturnType<typeof import("./pesca.ts")["crearPesca"]>;
const NADA = { pescadores: 0, sitios: 0, peces: 0, enMano: [] as number[], manoReal: false, cargado: false, soportes: 0, sujeta: null as "izq" | "der" | null, canaMano: false, medidor: false, boya: false, boyaEscala: 0, medidorTexto: "", resaltado: "" };

export function vistaPesca(h: Ayudas & AyudasVR) {
  let real: Real | null = null, carga: Promise<void> | null = null, fallo = "";
  let instruccion = "", sitios: Sitio3D[] = [], flotadores: Flotador3D[] = [], capturas: Captura3D[] = [], yo = -1, estado: Estado3D | null = null;
  const cuadro = new Set<(dt: number) => void>(); // N4: the page's per-frame readers (VR rod gestures), after the hands moved
  const cargar = () => (carga ??= import("./pesca.ts").then((m) => {
    real = m.crearPesca(h);
    real.sitios(sitios); real.flotadores(flotadores, yo); real.capturas(capturas, yo); if (estado) real.estado(estado); real.instruccion(instruccion);
  }).catch((e) => { fallo = String((e as Error)?.message ?? e); console.warn(`[pesca] no se pudo cargar: ${fallo}`); }));
  return {
    sitios(lista: Sitio3D[]): void { sitios = lista; if (real) real.sitios(lista); else if (lista.length) cargar(); },
    /** Where to stand at a spot (its boardwalk) and which way the water is; null until the chunk is here. */
    sitio(id: string): ReturnType<Real["sitio"]> { return real?.sitio(id) ?? null; },
    flotadores(lista: Flotador3D[], self: number): void { flotadores = lista; yo = self; if (real) real.flotadores(lista, self); else if (lista.length) cargar(); },
    /** v2: the fish landed near you (yours included), each held in its angler's hand for a while. */
    capturas(lista: Captura3D[], self: number): void { capturas = lista; yo = self; if (real) real.capturas(lista, self); else if (lista.length) cargar(); },
    estado(e: Estado3D): void { estado = e; real?.estado(e); },
    actualizar(dt: number): void { real?.actualizar(dt); for (const f of cuadro) { try { f(dt); } catch (e) { console.warn("[pesca]", e); } } },
    /** N4: the VR helpers (the real hands' anchors, the drawing camera); the 3D reads them through the same object. */
    conManos(o: AyudasVR): void { Object.assign(h, o); },
    /** N4: call `fn` every drawn frame (in VR, after the hands moved); returns how to stop. */
    cadaCuadro(fn: (dt: number) => void): () => void { cuadro.add(fn); return () => cuadro.delete(fn); },
    /** N4: the handle of the rod on a spot's holder, null until the chunk is here. */
    soporte(id: string): ReturnType<Real["soporte"]> { return real?.soporte(id) ?? null; },
    /** N4 (VR): the rod is in this real hand (taken from `sitio`'s holder) or back on its holder (null). */
    sujetar(lado: "izq" | "der" | null, sitio = ""): void { real?.sujetar(lado, sitio); },
    resaltar(id: string): void { real?.resaltar(id); },
    /** N4 (VR): the line over my rod saying what to do now ("" = none). */
    instruccion(t: string): void { instruccion = t; real?.instruccion(t); },
    /** N4 (VR): the real hand within reach of a holder's rod (which hand, which spot), or null. */
    alAlcance(conTomada = false): ReturnType<Real["alAlcance"]> { return real?.alAlcance(conTomada) ?? null; },
    mirada(): ReturnType<Real["mirada"]> { return real?.mirada() ?? null; },
    /** N4: the tip of the rod held in a real hand, or null. */
    punta(): ReturnType<Real["punta"]> { return real?.punta() ?? null; },
    ocupado(): boolean { return real ? real.ocupado() : (sitios.length > 0 || flotadores.length > 0 || capturas.length > 0) && !fallo && !!carga; },
    contar(): typeof NADA { return real?.contar() ?? NADA; },
  };
}
