// The builder (H1 + M22): a «Construir» button (B) for whoever may build; real HTML controls that screen readers
// and keyboards can use — since ux2-dock a row of icons (the dock: Añadir, Objetos del mundo, Cable, Entorno, Precisión, Inspector, Ayuda |
// Deshacer, Rehacer | Salir) with ONE drawer open at a time under it (cajones.ts), and the selected object's card on the
// right — so building no longer covers the world; and the hands in the 3D view
// (packages/render/src/gizmo.ts): a click selects, the gizmo's handles (X red, Y green, Z blue) move, turn and scale,
// grab mode («coger») follows the pointer. It only asks the server (features/objetos): every change reaches everyone.
// main.ts passes the builder of features/objetos/client.ts (only composition roots import features/) and the view.
// The camera (view.cam, built in another branch) is optional: modo("construir" | "juego"), frame(centre, radius),
// bloquear(on) while a handle is dragged or grab mode owns the wheel. In build mode the LEFT button is the builder's;
// the right and middle buttons and the wheel (except while grabbing) are the camera's.
// Behaviour learnt from Hyperfy2's ClientBuilder (GPL: behaviour only, no code: modes on 1-4, Tab, T, Ctrl = free,
// P), Blender (G / R, X / Y / Z, Shift+D, N, F) and OnCyber's studio (MIT: one undo step per drag; a click is a
// press that did not move).
// M22b-1, touch: a finger that lands on a placed thing is the builder's — a tap selects it, dragging moves it over the
// ground and other things (the finger-thing offset is kept, so the finger never hides it); the camera and the page's
// joystick never see that finger (the claim happens on `document` in the capture phase). A finger in the empty world
// is still the camera's (one orbits, two pinch) or the joystick's. On coarse pointers «mover» shows no handles: the
// thing itself is the handle. Design: ../mmo-browser-study/MODO-CONSTRUCTOR-MOVIL-VR.md.
import type { Donde, Editor, Eje } from "../../packages/render/src/index.ts";
import { icono } from "./iconos.ts";
import { tx, ligar, alCambiarIdioma, idiomaActivo } from "../../packages/feature/src/idioma.ts";
import { datosFicha, enlaceDeObjeto, ETIQUETAS_FICHA, fichaVisible, logicaDeObjeto, seleccionarAlIr } from "./ficha-objeto.ts";
import type { PiezasMundo } from "./ficha-objeto.ts";
import { ACCIONES_DOCK, alTocarlo, alternarCajon, CAJONES, esArrastre, filtrarBiblioteca, iconoDePieza, queCierraEscape, tamanoUniforme } from "./cajones.ts";
import type { Cajon } from "./cajones.ts";
import { encuadreDe, filasDeObjetos, filtrarObjetos, firmaDeLista, frase, recortarLista, resumenLista, sitioJunto, yaJunto } from "./objetos-mundo.ts"; // MIS-241: «Objetos del mundo»
import { transformarGrupo } from "../../packages/render/src/grupo.ts";
import { rectDesde, esCaja, idsEnRect, unirSeleccion, gestoDosDedos, aplicarGesto } from "./seleccion-caja.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: the page's one answer to «touch controls or not»
import { teclas } from "./teclas.ts"; // keymap v1: B builds (Yours or Default)

type Res = { ok: true } | { ok: false; why: string };
type Par = readonly [string, string]; // [English, Español]
/** A text node-like span that flips with the language (for a label built once). */
const T = (en: string, es: string): Par => [en, es]; // a bilingual pair [English, Español]
const rot = ([en, es]: Par): HTMLSpanElement => ligar(document.createElement("span"), "textContent", en, es);
type Obj = Record<string, unknown> & { id: string };
type Herr = "coger" | "mover" | "girar" | "escalar";
type Punto = { x: number; y: number; z: number };
type Builder = {
  estado: { puede: boolean; seleccionado: string; seleccionados: string[]; ultimoRechazo: string; modo: string };
  biblioteca: { id: string; nombre: string; modelo: string }[];
  seleccion(): Obj | null;
  objeto(id: string): Obj | null;
  /** Every object of the zone (MIS-241: the «Objetos del mundo» drawer lists them). */
  lista(): Obj[];
  colocar(id: string): Res; colocarEn(id: string, p: Punto, ry?: number): Res;
  girar(grados: number): Res; subir(metros: number): Res; desplazar(dx: number, dz: number): Res; escalar(factor: number): Res;
  duplicar(): Res; borrar(): Res; fijar(): Res; nombrar(nombre: string, decorado?: boolean): Res; deshacer(): Res; rehacer(): Res;
  ajustar(c: { oculto?: boolean; volumen?: number; solido?: boolean; caja?: [number, number, number, number, number, number] | null; alcance?: "burbuja" | "zona" | "todos"; radio?: number; enlace?: string; grupo?: "auto" | "musica" | "efectos" | "ambiente" }): Res;
  seleccionar(id: string): Res; transformar(id: string, t: Partial<Donde>, lote?: string): Res; modo(m: string): Res;
  /** M22c: select several (replaces), add/remove one (shift+click), delete by id with a batch (grouped undo). */
  seleccionarVarios(ids: string[]): Res; alternarSeleccion(id: string): Res;
  borrarId(id: string, lote?: string): Res; nuevoLote(): string;
  escuchar(fn: (que: string) => void): () => void;
};
type Cam = { modo?(m: "juego" | "construir"): void; frame?(centro: Punto, radio: number): void; bloquear?(on: boolean): void };
type Vista = {
  renderer: { domElement: HTMLCanvasElement };
  editor: Editor & { cajaPropia?(key: string): [number, number, number, number, number, number] | null };
  verOcultos?(si: boolean): void;
  place(key: string, t: (Donde & { model: string; animate: boolean }) | null): void;
};

const LLEGADA_M = 3, LLEGADA_ESPERA_MS = 6000; // MIS-241: after «go to an object», the camera looks at it once you are within 3 m of the spot (or after 6 s)
const FANTASMA = "~fantasma";   // the library model following the pointer before it is placed (only on this page)
const ENVIO_MS = 125;           // a drag sends `mover` at most 8 times a second,
const VIVO_MS = 500;            // and again every half second while held still (the server keeps one undo step per drag)
const CLIC_PX = 6;              // a press that moves less than this is a click
const PASOS_POS = [0, 0.1, 0.5, 1], PASOS_GIRO = [0, 5, 15, 45];
const HERRAMIENTAS: [Herr, Par, Par][] = [["coger", ["Grab", "Coger"], ["1", "1"]], ["mover", ["Move", "Mover"], ["2 or G", "2 o G"]], ["girar", ["Rotate", "Girar"], ["3 or R", "3 o R"]], ["escalar", ["Scale", "Escalar"], ["4", "4"]]]; // i18n-ok: [English, Spanish] pairs
/** Keys and mouse in build mode (also in docs/JUGADOR.md). */
export const ayudaConstruir = (): string[] => [
  tx("B: open and close build mode.", "B: abrir y cerrar construir."),
  tx("Left click: select · click on the ground or Esc: nothing selected.", "Clic izquierdo: seleccionar · clic en el suelo o Esc: nada seleccionado."),
  tx("1 grab: it follows the pointer over the ground and other objects; wheel turns, Shift + wheel scales; click drops it; Esc puts it back.", "1 coger: sigue al puntero sobre el suelo y otros objetos; rueda gira, Mayús + rueda escala; clic lo suelta; Esc lo devuelve."),
  tx("2 or G move · 3 or R rotate · 4 scale: drag the handles X red, Y green, Z blue.", "2 o G mover · 3 o R girar · 4 escalar: arrastra las asas X roja, Y verde, Z azul."),
  tx("X, Y or Z: only that axis (again: all) · T: object or world axes.", "X, Y o Z: solo ese eje (otra vez: todos) · T: ejes del objeto o del mundo."),
  tx("With a step: 0.5 m, 15°, scale 0.1 (change it below); hold Ctrl: free.", "Con paso: 0,5 m, 15°, escala 0,1 (cámbialo abajo); Ctrl mantenido: libre."),
  tx("Shift + D or Ctrl + D: duplicate and grab the copy · Del or Backspace: delete · P: pin or release (a pinned object cannot be moved, turned or deleted until released).", "Mayús + D o Ctrl + D: duplicar y coger la copia · Supr o Retroceso: borrar · P: anclar o soltar (un objeto anclado no se puede mover, girar ni borrar hasta soltarlo)."),
  tx("Shift + click: adds or removes from the selected group (several at once); Shift + drag on empty space draws a rectangle and adds what falls inside. The gizmo moves, turns and scales them together (the group turns or grows around its centre), Del deletes them together, Ctrl+Z undoes them together.", "Mayús + clic: suma o quita del grupo seleccionado (varios a la vez); Mayús + arrastrar en el vacío dibuja un rectángulo y suma lo que quede dentro. El gizmo los mueve, gira y escala juntos (el grupo gira o crece alrededor de su centro), Supr los borra juntos, Ctrl+Z los deshace juntos."),
  tx("When moving a single object with an axis chosen (X/Y/Z): if its face ends up within 25 cm of another object, it snaps face to face; from 60 cm a ghost guide (white; green when snapped) shows where it will land.", "Al mover un solo objeto con un eje elegido (X/Y/Z): si su cara queda a menos de 25 cm de otro objeto, encaja cara con cara; desde 60 cm una guía fantasma (blanca; verde al encajar) muestra dónde caerá."),
  tx("Ctrl + Z: undo · Ctrl + Shift + Z or Ctrl + Y: redo · F: frame.", "Ctrl + Z: deshacer · Ctrl + Mayús + Z o Ctrl + Y: rehacer · F: encuadrar."),
  tx("At the top, a row of icons: Add, World objects, Wiring, Environment, Precision, Inspector and Help open their drawer (one at a time; again or Esc closes it); Undo, Redo and Leave.", "Arriba, una fila de iconos: Añadir, Objetos del mundo, Cable, Entorno, Precisión, Inspector y Ayuda abren su cajón (uno a la vez; otra vez o Esc lo cierra); Deshacer, Rehacer y Salir."),
  tx("Add: press a piece to put it in front of you, or drag it into the world and drop it where you want it (the wheel turns it). «Upload»: your own .glb model, image, video or sound, in front of you; you can also drop the file onto the world. The sound zone is a sphere: Scale changes its radius.", "Añadir: pulsa una pieza para ponerla delante de ti, o arrástrala al mundo y suéltala donde la quieras (la rueda la gira). «Subir»: tu modelo .glb, imagen, vídeo o sonido, delante de ti; también puedes soltar el fichero sobre el mundo. La zona de sonido es una esfera: Escalar cambia su radio."),
  tx("World objects: the list of everything placed (name, kind and whether it has a part: wire, lock, counter or link); type to search. Press one: it takes you next to it and leaves it selected, with its card to move or edit it. On the big map, a chosen object has «Edit this object» (opens Build with it).", "Objetos del mundo: la lista de todo lo que hay puesto (nombre, tipo y si lleva pieza: cable, cerradura, contador o enlace); escribe para buscar. Pulsa uno: te lleva junto a él y lo deja seleccionado, con su tarjeta para moverlo o editarlo. En el mapa grande, un objeto elegido tiene «Editar este objeto» (abre Construir con él)."),
  tx("Double click on an object while playing: opens build mode with it selected. With an object selected its card appears (on the right): name, Move, Rotate and Scale, position, rotation, size, what it does when touched, Duplicate, Delete, Pin, Copy link and Back. All fields and the logic (which wires, locks and counters touch it): the Inspector drawer.", "Doble clic en un objeto mientras juegas: abre construir con él seleccionado. Con un objeto seleccionado sale su tarjeta (a la derecha): nombre, Mover, Girar y Escalar, posición, giro, tamaño, qué hace al tocarlo, Duplicar, Borrar, Anclar, Copiar enlace y Volver. Todos los campos y la lógica (qué cables, cerraduras y contadores lo tocan): el cajón Inspector."),
  tx("With a finger: tap an object to select it and drag it to move it (over the ground and over other objects). One finger on empty space moves the camera; two zoom it. With one finger on the object, put a second finger anywhere: turning the fingers turns it, spreading or pinching them scales it. Rotate and scale: the Precision drawer.", "Con el dedo: toca un objeto para seleccionarlo y arrástralo para moverlo (sobre el suelo y sobre otros objetos). Un dedo en el vacío mueve la cámara; dos la acercan. Con un dedo sobre el objeto, pon un segundo dedo en cualquier sitio: girar los dedos lo gira, separarlos o juntarlos lo escala. Girar y escalar: el cajón Precisión."),
  tx("Right and middle mouse buttons, and the wheel: the camera (when the new camera arrives).", "Botones derecho y central del ratón, y la rueda: la cámara (cuando llegue la cámara nueva)."),
];

const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;
const redondear = (v: number, paso: number) => Number((Math.round(v / paso) * paso).toFixed(2));
const esEntrada = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
const nombreDe = (o: Obj) => String(o.nombre ?? "") || tx("(decor)", "(decorado)");
const fmt = (v: unknown) => String(Math.round(Number(v) * 100) / 100);
/** Backlog (PROGRESO-M22c.md): an empty library used to look like an editor bug. If it is empty AND the player has no
 * build role, say why (instead of a silent blank list); otherwise "" (an empty library for any other reason is not this). */
export const sinRolConstruir = (): string => tx("You do not have permission to build in this world (ask whoever runs it for the role).", "No tienes permiso para construir en este mundo (pide el rol a quien lo administra).");
export const avisoBiblioteca = (biblioteca: readonly unknown[], puede: boolean): string => (biblioteca.length === 0 && !puede ? sinRolConstruir() : "");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

/** C3: what the page lends the card: the map's «Volver», and a way to ask for the object chosen with «Ir». */
/** C4: and the world's wires, locks and counters to read («Lógica»), and a way to bring the cable's list into view. */
/** ux2-dock: and «Subir» (soltar.ts' file picker) for the «Añadir» drawer. */
export type ExtraConstructor = { volver?(): boolean; puedeVolver?(): boolean; mundo?(): PiezasMundo; abrirCable?(): void; subir?(): void; alAbrir?(que: "construir" | "anadir" | "cable"): void;
  /** MIS-241: go next to a spot of the world in one jump, as the map's «Ir de golpe» (same trip, same “Volver”); false = trips are off here. */
  ir?(donde: { id: string; nombre: string; x: number; z: number }): boolean;
  /** MIS-241: where you stand (x, z), to put the jump on your side of the object and to know when you are already there. */
  yo?(): { x: number; z: number } | null;
  /** First-load façade (constructor-puerta.ts): the drawers' bodies and the card's slot already exist (other pieces filled them before this file arrived); use them instead of making new ones. */
  cuerpos?: Record<Cajon, HTMLElement>; ranura?: HTMLElement };
export type ConstructorUI = {
  alIr(donde: { id: string }): boolean;
  /** MIS-240: the map's «Editar»: whether this object exists and you may build, and open Construir on it (selected, in view). */
  puedeEditar(id: string): boolean; editar(id: string): boolean;
  /** MIS-241: the «Objetos del mundo» drawer's row press: go next to the object and leave it selected. */
  irAObjeto(id: string): Res;
  cajon(id: Cajon): HTMLElement; ranuraFicha: HTMLElement;
  abrirCajon(id: Cajon | ""): void; cajonAbierto(): Cajon | "";
};
export function montarConstructor(c: Builder, view: Vista, boton: HTMLButtonElement, panel: HTMLElement, extra?: ExtraConstructor): ConstructorUI {
  const ed = view.editor, lienzo = view.renderer.domElement;
  const cam = (): Cam | undefined => (view as Vista & { cam?: Cam }).cam;
  const abierto = () => !panel.hidden;
  // text that cannot flip by itself (a button's title also read by the dock) is set by functions kept here and re-run when the language changes
  const alIdioma: (() => void)[] = [];
  const viva = (f: () => void): void => { alIdioma.push(f); f(); };
  const no = (why: string): string => tx(`Not done: ${why}`, `No: ${why}`);

  // ---- ux2-dock: the panel is a row of icons (the dock) and at most ONE drawer under it — real buttons, selects and
  // inputs (screen readers and keyboards). `panel` (#panel-construir) is still the element whose `hidden` says «building». ----
  const estado = el("p", { className: "estado" });
  estado.setAttribute("role", "status");
  let borraEstado = 0;
  const decir = (t: string) => { estado.textContent = t; clearTimeout(borraEstado); if (t) borraEstado = window.setTimeout(() => { estado.textContent = ""; }, 8000); };
  // Backlog M22c: an empty library with no build role looked like an editor bug; say why instead.
  const avisoLib = el("p", { className: "aviso-biblioteca" });
  avisoLib.setAttribute("role", "status");
  avisoLib.hidden = true;
  const responder = (r: Res, bien = tx("Done.", "Hecho.")) => decir(r.ok ? bien : no(r.why));
  const boton2 = (texto: Par, titulo: Par, fn: () => Res | void, iconoNombre?: string) => {
    const b = ligar(el("button", { type: "button" }), "title", titulo[0], titulo[1]);
    // iconoNombre is always a hardcoded literal from our own callers (never user input); same pattern as the
    // house-icon button above (U11). icono() only emits the fixed house-icon SVGs from iconos.ts.
    if (iconoNombre) { b.innerHTML = `${icono(iconoNombre, 18)} `; b.append(rot(texto)); } else if (texto[0]) ligar(b, "textContent", texto[0], texto[1]);
    // after a mouse click the focus goes back to the page: Space (jump) must not press «Borrar» again
    b.addEventListener("click", (e) => { const r = fn(); if (r) responder(r); if (e.detail > 0) b.blur(); });
    return b;
  };
  const fila = (etiqueta: Par | null, ...hijos: Node[]) => {
    const d = el("div", { className: "fila" }, ...hijos);
    if (etiqueta) { d.setAttribute("role", "toolbar"); ligar(d, "aria-label", etiqueta[0], etiqueta[1]); }
    return d;
  };
  const botonesHerr = HERRAMIENTAS.map(([m, t, k]) => { const b = boton2(t, [`${t[0]} (key ${k[0]})`, `${t[1]} (tecla ${k[1]})`], () => elegirModo(m)); b.dataset.modo = m; return b; });
  const botonesEje = (["", "X", "Y", "Z"] as const).map((e) => { const b = boton2(e ? [e, e] : T("All", "Todos"), e ? T(`Only the ${e} axis (key ${e}; again: all)`, `Solo el eje ${e} (tecla ${e}; otra vez: todos)`) : T("All axes", "Todos los ejes"), () => elegirEje(e || null)); b.dataset.eje = e; return b; });
  const botonEspacio = boton2(T("World", "Mundo"), T("World or object axes (T)", "Ejes del mundo o del objeto (T)"), () => cambiarEspacio());
  const opciones = (s: HTMLSelectElement, vals: number[], txt: (v: number) => string, def: number) => { for (const v of vals) { const op = el("option", { value: String(v) }); alCambiarIdioma(() => { op.textContent = v ? txt(v) : tx("free", "libre"); }); s.append(op); } s.value = String(def); return s; };
  const selPos = opciones(el("select"), PASOS_POS, (v) => tx(`${v} m`, `${String(v).replace(".", ",")} m`), 0.5);
  const selGiro = opciones(el("select"), PASOS_GIRO, (v) => `${v}°`, 15);
  for (const s of [selPos, selGiro]) {
    let conRaton = false; // chosen with the mouse: give the keys back to the page (1–4 must not pick an option)
    s.addEventListener("pointerdown", () => { conRaton = true; });
    s.addEventListener("keydown", () => { conRaton = false; });
    s.addEventListener("change", () => { aplicarPaso(); if (conRaton) s.blur(); });
  }
  const sel = el("p", { className: "sel" });
  const campo = (k: string, texto: string, paso: string) => { const i = el("input", { type: "number", step: paso }); i.dataset.k = k; i.addEventListener("change", () => aplicarCampo(i)); return { i, l: el("label", {}, `${texto} `, i) }; };
  const campos: Record<string, { i: HTMLInputElement; l: HTMLLabelElement }> = {
    x: campo("x", "x", "0.1"), y: campo("y", "y", "0.1"), z: campo("z", "z", "0.1"),
    rx: campo("rx", "x", "1"), ry: campo("ry", "y", "1"), rz: campo("rz", "z", "1"),
    sx: campo("sx", "x", "0.1"), sy: campo("sy", "y", "0.1"), sz: campo("sz", "z", "0.1"), u: campo("u", "all", "0.1"),
  };
  alCambiarIdioma(() => { if (campos.u.l.firstChild) campos.u.l.firstChild.textContent = tx("all ", "todas "); });
  const nombre = el("input", { type: "text", maxLength: 60 });
  const decorado = el("input", { type: "checkbox" });
  const fijado = el("input", { type: "checkbox" });
  // U10: solid (people bump into it), visible while playing (spheres of sound) and volume (sound and video)
  const solido = el("input", { type: "checkbox" });
  const visible = el("input", { type: "checkbox" });
  const volumen = el("input", { type: "range", min: "0", max: "1", step: "0.05" });
  const lSolido = el("label", {}, solido, rot(T(" solid (people bump into it)", " sólido (las personas chocan con él)")));
  const lVisible = el("label", {}, visible, rot(T(" visible while playing (if not, only while building)", " se ve al jugar (si no, solo al construir)")));
  const lVolumen = el("label", {}, rot(T("Volume ", "Volumen ")), volumen);
  // U11: who hears it, and the bubble's radius in metres (a sphere's scale; a video's own bubble)
  const alcance = el("select");
  for (const [v, [en, es]] of ([["burbuja", T("only inside the bubble", "solo dentro de la burbuja")], ["zona", T("the whole zone", "toda la zona")], ["todos", T("everyone in the world", "todo el mundo")]] as [string, Par][])) alcance.append(ligar(el("option", { value: v }), "textContent", en, es));
  const radio = el("input", { type: "number", min: "0.5", max: "200", step: "0.5" });
  const lAlcance = el("label", {}, rot(T("Heard by ", "Se oye en ")), alcance);
  // H5: the mixer group (Ajustes → Sonido): the music slider lowers it, or the effects one, or the ambient one
  const grupoSonido = el("select");
  for (const [v, [en, es]] of ([["auto", T("the usual one (video: music; sound: effect or ambience)", "el normal (vídeo: música; sonido: efecto o ambiente)")], ["musica", T("music", "música")], ["efectos", T("effects", "efectos")], ["ambiente", T("ambient", "ambiente")]] as [string, Par][])) grupoSonido.append(ligar(el("option", { value: v }), "textContent", en, es));
  const lGrupo = el("label", {}, rot(T("Sound group ", "Grupo de sonido ")), grupoSonido);
  const lRadio = el("label", {}, rot(T("Bubble radius (m) ", "Radio de la burbuja (m) ")), radio);
  // J4: the address a click opens, in a new tab, after confirming; "" = nothing to open
  const enlace = el("input", { type: "url", maxLength: 300, placeholder: "https://…" });
  const lEnlace = el("label", {}, rot(T("Link on click ", "Enlace al hacer clic ")), enlace);
  const grupo = (leyenda: Par, ...hijos: Node[]) => el("fieldset", {}, ligar(el("legend"), "textContent", leyenda[0], leyenda[1]), ...hijos);
  const datos = el("div", { className: "inspector" },
    el("label", {}, rot(T("Name ", "Nombre ")), nombre), el("label", {}, decorado, rot(T(" decor (no name on purpose)", " decorado (sin nombre a propósito)"))),
    grupo(T("Position (m)", "Posición (m)"), campos.x.l, campos.y.l, campos.z.l),
    grupo(["Rotation (degrees)", "Giro (grados)"], campos.rx.l, campos.ry.l, campos.rz.l),
    grupo(["Scale", "Escala"], campos.sx.l, campos.sy.l, campos.sz.l, campos.u.l),
    el("label", {}, fijado, rot(T(" pinned (nobody moves, turns or deletes it until you release it)", " anclado (nadie lo mueve, gira ni borra hasta que lo sueltes)"))), lSolido, lVisible, lVolumen, lAlcance, lGrupo, lRadio, lEnlace);
  ligar(datos, "aria-label", "Inspector of the selected object: Enter applies", "Inspector del objeto seleccionado: Intro aplica");
  nombre.addEventListener("change", () => responder(c.nombrar(nombre.value.trim(), decorado.checked), tx("Name set.", "Nombre puesto.")));
  decorado.addEventListener("change", () => responder(c.nombrar(decorado.checked ? "" : nombre.value.trim(), decorado.checked)));
  fijado.addEventListener("change", () => { const o = c.objeto(c.estado.seleccionado); if (o && !!o.fijado !== fijado.checked) responder(c.fijar(), fijado.checked ? tx("Pinned.", "Anclado.") : tx("Released.", "Suelto.")); });
  /** Solid on/off for the inspector's checkbox: the box is measured on this page; the server decides. */
  function cambiarSolido(cb: HTMLInputElement): void {
    const id = c.estado.seleccionado, caja = cb.checked && id ? ed.cajaPropia?.(id) ?? null : null;
    if (cb.checked && !caja) { cb.checked = false; return decir(tx("Wait until the model is visible and tick it again.", "Espera a que se vea el modelo y vuelve a marcarlo.")); }
    responder(c.ajustar({ solido: cb.checked, caja }), cb.checked ? tx("Solid: it can no longer be walked through.", "Sólido: ya no se puede atravesar.") : tx("It can be walked through now.", "Ya se puede atravesar."));
  }
  solido.addEventListener("change", () => cambiarSolido(solido));
  visible.addEventListener("change", () => responder(c.ajustar({ oculto: !visible.checked }), visible.checked ? tx("It will show while playing.", "Se verá al jugar.") : tx("Invisible while playing (you see it while building).", "Invisible al jugar (la ves mientras construyes).")));
  volumen.addEventListener("change", () => responder(c.ajustar({ volumen: volumen.valueAsNumber }), tx(`Volume ${Math.round(volumen.valueAsNumber * 100)} %.`, `Volumen ${Math.round(volumen.valueAsNumber * 100)} %.`)));
  alcance.addEventListener("change", () => {
    const a = alcance.value as "burbuja" | "zona" | "todos";
    responder(c.ajustar({ alcance: a }), a === "burbuja" ? tx("Heard only inside the bubble.", "Se oye solo dentro de la burbuja.") : a === "zona" ? tx("Heard by the whole zone, at the same volume.", "Lo oye toda la zona, al mismo volumen.") : tx("Heard by everyone in the world, at the same volume.", "Lo oye todo el mundo, al mismo volumen."));
  });
  grupoSonido.addEventListener("change", () => {
    const g = grupoSonido.value as "auto" | "musica" | "efectos" | "ambiente";
    responder(c.ajustar({ grupo: g }), g === "auto" ? tx("Sound group: the usual one.", "Grupo de sonido: el normal.") : tx(`It plays in the «${g === "musica" ? "music" : g === "efectos" ? "effects" : "ambient"}» group: its Sound slider lowers it.`, `Suena en el grupo «${g === "musica" ? "música" : g}»: lo baja su deslizador de Sonido.`));
  });
  radio.addEventListener("change", () => {
    const id = c.estado.seleccionado, o = c.objeto(id), r = radio.valueAsNumber;
    if (!o || !Number.isFinite(r)) return decir(tx("That is not a number.", "Eso no es un número."));
    const m = Math.max(0.5, Math.min(o.tipo === "sonido" ? 50 : 200, r));
    responder(o.tipo === "sonido" ? c.transformar(id, { sx: m, sy: m, sz: m }) : c.ajustar({ radio: m }), tx(`Bubble radius: ${m} m.`, `Radio de la burbuja: ${m} m.`));
  });
  enlace.addEventListener("change", () => responder(c.ajustar({ enlace: enlace.value.trim() }), enlace.value.trim() ? tx("Link set: a click on the object will open it.", "Enlace puesto: un clic en el objeto lo abrirá.") : tx("Link removed.", "Enlace quitado.")));
  // C4 «Lógica» (was a tab of the card): what wires touch the object, read from the state the cable, the locks and the
  // counters already keep — no new network path — and the way into the cable's drawer
  const lEntran = el("ul"), lSalen = el("ul"), lPiezas = el("ul");
  const bAbrirCable = boton2(T("Open wiring", "Abrir el cable"), T("Open the wiring drawer (the world's triggers and receivers)", "Abrir el cajón del cable (disparadores y receptores del mundo)"), () => { abrirCajon("cable"); extra?.abrirCable?.(); decir(tx("Wiring in view: receivers are edited there.", "Cable a la vista: ahí se editan los receptores.")); }, "lightning");
  const logica = el("section", { className: "logica" }, ligar(el("h3"), "textContent", "Logic", "Lógica"),
    ligar(el("h4"), "textContent", "In (triggers that show or hide it)", "Entran (disparadores que lo muestran u ocultan)"), lEntran,
    ligar(el("h4"), "textContent", "Out (triggers that start here)", "Salen (disparadores que nacen aquí)"), lSalen,
    ligar(el("h4"), "textContent", "Parts at this spot", "Piezas en este punto"), lPiezas, bAbrirCable);
  ligar(logica, "aria-label", "Logic of the selected object", "Lógica del objeto seleccionado");
  logica.hidden = !extra?.mundo;
  let firmaLogica = "";

  // ---- the dock: one icon per drawer, then undo / redo, then leave. Each icon: tooltip + aria-label (+ its key) ----
  const dock = el("div", { id: "dock-construir" });
  dock.setAttribute("role", "toolbar"); ligar(dock, "aria-label", "Build", "Construir");
  const botonDock = (ic: string, titulo: () => string, fn: () => Res | void) => {
    const b = el("button", { type: "button", className: "ic" });
    b.innerHTML = icono(ic, 20); viva(() => { const t = titulo(); b.title = t; b.setAttribute("aria-label", t); b.dataset.tip = t; });
    b.addEventListener("click", (e) => { const r = fn(); if (r) responder(r); if (e.detail > 0) b.blur(); });
    return b;
  };
  const PISTA: Record<Cajon, Par> = { anadir: T("drag into the world or press to put it in front of you", "arrastra al mundo o pulsa para ponerlo delante"), objetos: T("press one: it takes you next to it", "pulsa uno: te lleva junto a él"), cable: T("what each button or zone does", "lo que hace cada botón o zona"), entorno: T("for everyone who is here", "para todos los que están aquí"), precision: T("for whatever you have chosen", "para lo que tengas elegido"), inspector: T("every field of the chosen object", "todos los campos del objeto elegido"), ayuda: T("keys and mouse", "teclas y ratón") };
  const secciones = {} as Record<Cajon, HTMLElement>, cuerpos = {} as Record<Cajon, HTMLElement>, botonesCajon = {} as Record<Cajon, HTMLButtonElement>;
  for (const fila of CAJONES) {
    const id = fila[0], ic = fila[1]; // the title and the tooltip are read at the moment of use (they follow the language)
    const b = botonDock(ic, () => fila[3], () => abrirCajon(alternarCajon(cajon, id)));
    b.id = `dock-${id}`; b.dataset.cajon = id; b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", `cajon-${id}`);
    botonesCajon[id] = b;
    const h = el("h2", { id: `cajon-${id}-titulo` }); viva(() => { h.textContent = fila[2]; });
    const cerrar = botonDock("x", () => tx("Close (Esc)", "Cerrar (Esc)"), () => abrirCajon("")); cerrar.classList.add("cerrar");
    const cuerpo = extra?.cuerpos?.[id] ?? el("div", { className: "cuerpo" });
    const s = el("section", { id: `cajon-${id}`, className: "cajon" }, el("div", { className: "cab" }, h, ligar(el("span", { className: "pista" }), "textContent", PISTA[id][0], PISTA[id][1]), cerrar), cuerpo);
    s.setAttribute("aria-labelledby", h.id); s.hidden = true;
    secciones[id] = s; cuerpos[id] = cuerpo;
  }
  const sepDock = () => { const d = el("span", { className: "sep" }); d.setAttribute("aria-hidden", "true"); return d; };
  const dDeshacer = botonDock(ACCIONES_DOCK.deshacer[0], () => ACCIONES_DOCK.deshacer[1], () => c.deshacer()); dDeshacer.id = "dock-deshacer";
  const dRehacer = botonDock(ACCIONES_DOCK.rehacer[0], () => ACCIONES_DOCK.rehacer[1], () => c.rehacer()); dRehacer.id = "dock-rehacer";
  const rotuloSalir = (): string => { const base = ACCIONES_DOCK.salir[1].replace(/ \(.+\)$/, ""), k = teclas.etiqueta("construir"); return k ? `${base} (${k})` : base; };
  const dSalir = botonDock(ACCIONES_DOCK.salir[0], rotuloSalir, () => abrir(false)); dSalir.id = "dock-salir";
  const rotularSalir = (): void => { const t = rotuloSalir(); dSalir.title = t; dSalir.dataset.tip = t; dSalir.setAttribute("aria-label", t); dSalir.setAttribute("aria-keyshortcuts", teclas.etiqueta("construir")); };
  rotularSalir(); teclas.alCambiar(rotularSalir); // keymap v1: the key in effect (B by default), never a fixed letter
  dock.append(...CAJONES.map((f) => botonesCajon[f[0]]), sepDock(), dDeshacer, dRehacer, sepDock(), dSalir);

  // «Añadir»: ONE library (search + grid) and «Subir» (soltar.ts' picker). A press on a piece puts it 3 m in front of you;
  // dragging it out of the drawer makes it follow the pointer over the world, and letting go there places it.
  const buscar = el("input", { type: "search", id: "buscar-biblioteca", autocomplete: "off" });
  ligar(buscar, "placeholder", "Search the library", "Buscar en la biblioteca"); ligar(buscar, "aria-label", "Search the library", "Buscar en la biblioteca");
  const cajaBuscar = el("label", { className: "buscar" }); cajaBuscar.innerHTML = icono("magnifying-glass", 18); cajaBuscar.append(buscar);
  const bSubir = el("button", { type: "button", id: "subir", className: "subir" });
  ligar(bSubir, "title", "Upload a file of your own: .glb model, .png .jpg .webp image, .mp4 .webm video or .mp3 .ogg sound. It is placed in front of you; you can also drop it onto the world.", "Subir un fichero tuyo: modelo .glb, imagen .png .jpg .webp, vídeo .mp4 .webm o sonido .mp3 .ogg. Se pone delante de ti; también puedes soltarlo sobre el mundo.");
  bSubir.innerHTML = `${icono("upload-simple", 18)}`; bSubir.append(rot(T("Upload", "Subir")));
  bSubir.addEventListener("click", (e) => { extra?.subir?.(); if (e.detail > 0) bSubir.blur(); });
  bSubir.hidden = !extra?.subir;
  const rejilla = el("div", { className: "rejilla" }); rejilla.setAttribute("role", "group"); ligar(rejilla, "aria-label", "Library", "Biblioteca");
  let arrastre: { m: { id: string; nombre: string; modelo: string }; x0: number; y0: number; pid: number; activo: boolean } | null = null, sinClic = false;
  const piezas = c.biblioteca.map((m) => {
    const b = ligar(el("button", { type: "button", className: "pieza" }), "title", `${m.nombre}: press to put it in front of you, or drag it into the world`, `${m.nombre}: pulsa para ponerlo delante de ti, o arrástralo al mundo`);
    b.innerHTML = icono(iconoDePieza(m.id), 28); b.append(el("span", { textContent: m.nombre })); b.dataset.pieza = m.id;
    b.addEventListener("pointerdown", (e) => { if (e.button === 0) arrastre = { m, x0: e.clientX, y0: e.clientY, pid: e.pointerId, activo: false }; });
    b.addEventListener("click", (e) => {
      if (sinClic) { sinClic = false; return; } // the end of a drag, not a press
      responder(c.colocar(m.id), tx(`${m.nombre}: in front of you.`, `${m.nombre}: delante de ti.`));
      if (e.detail > 0) b.blur();
    });
    return b;
  });
  rejilla.append(...piezas);
  const sinResultado = ligar(el("p", { className: "vacio" }), "textContent", "No piece has that name.", "Ninguna pieza se llama así."); sinResultado.hidden = true;
  buscar.addEventListener("input", () => {
    const ids = new Set(filtrarBiblioteca(c.biblioteca, buscar.value).map((m) => m.id));
    for (const b of piezas) b.hidden = !ids.has(b.dataset.pieza ?? "");
    sinResultado.hidden = ids.size > 0;
  });
  addEventListener("pointermove", (e) => {
    if (!arrastre || e.pointerId !== arrastre.pid) return;
    if (!arrastre.activo) {
      if (!esArrastre(e.clientX - arrastre.x0, e.clientY - arrastre.y0)) return;
      arrastre.activo = true; empezarFantasma(arrastre.m);
    }
    puntero = { x: e.clientX, y: e.clientY };
    if (document.elementFromPoint(e.clientX, e.clientY) === lienzo) seguir(e.clientX, e.clientY);
  }, { capture: true });
  const finArrastre = (e: PointerEvent) => {
    if (!arrastre || e.pointerId !== arrastre.pid) return;
    const a = arrastre; arrastre = null;
    if (!a.activo) return;
    sinClic = true; setTimeout(() => { sinClic = false; }, 0);
    if (e.type === "pointerup" && document.elementFromPoint(e.clientX, e.clientY) === lienzo) soltarFantasma(e.clientX, e.clientY);
    else { quitarFantasma(); decir(tx("Drop it on the world to place it.", "Suéltalo sobre el mundo para colocarlo.")); }
  };
  addEventListener("pointerup", finArrastre, { capture: true });
  addEventListener("pointercancel", finArrastre, { capture: true });
  cuerpos.anadir.append(avisoLib, el("div", { className: "fila buscar-fila" }, cajaBuscar, bSubir), rejilla, sinResultado);

  // «Objetos del mundo» (MIS-241): every object placed in the world, with its name, kind and pieces; a press goes next to it
  // (the map's same jump when trips are on, the camera always) and leaves it selected, so its card opens to move it, edit it or wire it.
  const buscarObjetos = el("input", { type: "search", id: "buscar-objetos", autocomplete: "off" });
  ligar(buscarObjetos, "placeholder", "Search by name or type", "Buscar por nombre o tipo"); ligar(buscarObjetos, "aria-label", "Search the world's objects", "Buscar entre los objetos del mundo");
  const cajaBuscarObj = el("label", { className: "buscar" }); cajaBuscarObj.innerHTML = icono("magnifying-glass", 18); cajaBuscarObj.append(buscarObjetos);
  const soloPieza = el("input", { type: "checkbox", id: "objetos-solo-pieza" });
  const resumenObj = el("p", { className: "resumen-objetos" }); resumenObj.setAttribute("role", "status");
  const listaObj = el("ul", { className: "lista-objetos", id: "lista-objetos" }); ligar(listaObj, "aria-label", "World objects", "Objetos del mundo");
  let firmaObj = "";
  /** Redraw the list only when what it shows changed (a drag sends many events; the rows need none of them). */
  function pintarLista(): void {
    const filas = filasDeObjetos(c.lista(), extra?.mundo?.());
    const coinciden = filtrarObjetos(filas, buscarObjetos.value, soloPieza.checked);
    const firma = firmaDeLista(coinciden, buscarObjetos.value, soloPieza.checked) + `|${filas.length}|${c.estado.seleccionado}`;
    if (firma === firmaObj) return;
    firmaObj = firma;
    const { visibles, resto } = recortarLista(coinciden);
    resumenObj.textContent = resumenLista(filas.length, coinciden.length, buscarObjetos.value.trim() !== "" || soloPieza.checked) + (resto ? tx(` Showing the first ${visibles.length}: type to narrow down.`, ` Se ven los ${visibles.length} primeros: escribe para acotar.`) : "");
    listaObj.replaceChildren(...visibles.map((f) => {
      const b = el("button", { type: "button", className: "objeto-fila", title: tx(`Go to ${f.nombre} and edit it`, `Ir a ${f.nombre} y editarlo`) });
      b.dataset.id = f.id; b.setAttribute("aria-pressed", String(f.id === c.estado.seleccionado));
      const piezas = f.piezas.length ? el("span", { className: "con-pieza", textContent: f.piezas.join(" · ") }) : null;
      b.append(el("span", { className: "n", textContent: f.nombre }), el("span", { className: "t", textContent: f.tipo + (f.fijado ? tx(" · pinned", " · anclado") : "") + (f.oculto ? tx(" · hidden", " · oculto") : "") }), ...(piezas ? [piezas] : []));
      b.addEventListener("click", (e) => { responder(irAObjeto(f.id)); if (e.detail > 0) b.blur(); });
      return el("li", {}, b);
    }));
  }
  buscarObjetos.addEventListener("input", () => pintarLista());
  soloPieza.addEventListener("change", () => pintarLista());
  /** Point the camera at an object (the new camera only; in build mode it keeps the pivot within reach of your feet). */
  const mirarObjeto = (id: string): void => { const o = c.objeto(id); if (!o) return; const e = encuadreDe(o); cam()?.frame?.(e.centro, e.radio); };
  let esperaLlegada = 0;
  /** The camera's frame is kept relative to your feet, so after a jump it is set once you have ARRIVED and stand still (not
   * before: it would point at where the object was from the old spot, or from a step of the way). Gives up after a few
   * seconds (the server may have refused the trip) and frames from where you are. */
  function mirarAlLlegar(id: string, sitio: { x: number; z: number }): void {
    clearInterval(esperaLlegada);
    const hasta = performance.now() + LLEGADA_ESPERA_MS;
    let antes: { x: number; z: number } | null = null, quietos = 0;
    esperaLlegada = window.setInterval(() => {
      const yo = extra?.yo?.() ?? null;
      const cerca = !yo || Math.hypot(yo.x - sitio.x, yo.z - sitio.z) < LLEGADA_M;
      quietos = cerca && yo && antes && Math.hypot(yo.x - antes.x, yo.z - antes.z) < 0.05 ? quietos + 1 : 0;
      antes = yo;
      if (quietos < 2 && yo && performance.now() < hasta && c.estado.seleccionado === id) return;
      clearInterval(esperaLlegada);
      if (c.estado.seleccionado === id && abierto()) mirarObjeto(id);
    }, 150);
  }
  /** Go next to an object and leave it selected, its card open: unless you are already beside it the page's jump takes you
   * there, and the camera is pointed at it (once you are there). */
  function irAObjeto(id: string): Res {
    const o = c.objeto(id);
    if (!o) return { ok: false, why: tx("that object is no longer in the world", "ese objeto ya no está en el mundo") };
    const r = c.seleccionar(id);
    if (!r.ok) return r;
    const yo = extra?.yo?.() ?? null, nombre = nombreDe(o);
    let camino: "viaja" | "cerca" | "apagado" | "sin-viaje" = "sin-viaje";
    if (extra?.ir) {
      if (yaJunto(o, yo)) camino = "cerca";
      else { const s = sitioJunto(o, yo); camino = extra.ir({ id, nombre, x: s.x, z: s.z }) ? "viaja" : "apagado"; if (camino === "viaja") mirarAlLlegar(id, s); }
    }
    if (camino !== "viaja") mirarObjeto(id);
    decir(frase(nombre, camino));
    abrirCajon(""); // the card of what you chose shows only with every drawer shut (it would sit under the list)
    return { ok: true };
  }
  cuerpos.objetos.append(el("div", { className: "fila buscar-fila" }, cajaBuscarObj, el("label", { className: "solo-pieza" }, soloPieza, rot(T(" with a part", " con pieza")))), resumenObj, listaObj);

  // «Precisión»: the tools, the axes, the snap steps and the step buttons (touch screens turn and scale here)
  cuerpos.precision.append(
    ligar(el("h3"), "textContent", "Tool", "Herramienta"), fila(["Tool", "Herramienta"], ...botonesHerr),
    ligar(el("h3"), "textContent", "Axes", "Ejes"), fila(["Axes", "Ejes"], ...botonesEje, botonEspacio),
    ligar(el("h3"), "textContent", "Steps when dragging", "Pasos al arrastrar"), fila(null, el("label", {}, rot(T("Step ", "Paso ")), selPos), el("label", {}, rot(T("Turn ", "Giro ")), selGiro)),
    ligar(el("h3"), "textContent", "With buttons", "Con botones"),
    fila(T("Rotate", "Girar"), boton2(T("⟲ 15°", "⟲ 15°"), T("Rotate left", "Girar a la izquierda"), () => c.girar(15)), boton2(T("⟳ 15°", "⟳ 15°"), T("Rotate right", "Girar a la derecha"), () => c.girar(-15)),
      boton2(["Frame", "Encuadrar"], ["Look at the selection (F)", "Mirar lo seleccionado (F)"], () => encuadrar(), "crosshair")),
    fila(T("Nudge", "Desplazar"), boton2(T("← 1 m", "← 1 m"), T("Move left", "Mover a la izquierda"), () => c.desplazar(-1, 0)), boton2(T("→ 1 m", "→ 1 m"), T("Move right", "Mover a la derecha"), () => c.desplazar(1, 0)),
      boton2(T("↑ 1 m", "↑ 1 m"), T("Move away", "Mover hacia el fondo"), () => c.desplazar(0, -1)), boton2(T("↓ 1 m", "↓ 1 m"), T("Move toward you", "Mover hacia ti"), () => c.desplazar(0, 1))),
    fila(T("Height and size", "Altura y tamaño"), boton2(T("Up", "Subir"), T("Raise half a metre", "Subir medio metro"), () => c.subir(0.5)), boton2(T("Down", "Bajar"), T("Lower half a metre", "Bajar medio metro"), () => c.subir(-0.5)),
      boton2(T("Bigger", "Más grande"), T("Enlarge by 25 %", "Agrandar un 25 %"), () => c.escalar(1.25)), boton2(T("Smaller", "Más pequeño"), T("Shrink by 20 %", "Reducir un 20 %"), () => c.escalar(0.8))));
  cuerpos.inspector.append(sel, datos, logica);
  const ulAyuda = el("ul"); alCambiarIdioma(() => ulAyuda.replaceChildren(...ayudaConstruir().map((t) => el("li", { textContent: t }))));
  cuerpos.ayuda.append(ulAyuda);
  panel.append(dock, ...CAJONES.map((f) => secciones[f[0]]), estado);
  // what is typed in the panel stays in the panel (the page's other keys — walk, gestures, battery — never see it);
  // Escape in a field leaves it and closes the drawer
  panel.addEventListener("keydown", (e) => {
    if (!esEntrada(e.target)) return;
    e.stopPropagation();
    if (e.key === "Escape") { (e.target as HTMLElement).blur(); abrirCajon(""); }
  });

  /** Open one drawer ("" = none): the others close, its dock icon shows pressed (aria-expanded). */
  let cajon: Cajon | "" = "";
  function abrirCajon(id: Cajon | ""): void {
    cajon = id;
    if (id === "anadir" || id === "cable") extra?.alAbrir?.(id); // T1: a mission step may ask «open the library / the cable»
    for (const [k] of CAJONES) { secciones[k].hidden = k !== id; botonesCajon[k].setAttribute("aria-expanded", String(k === id)); }
    document.documentElement.classList.toggle("cajon-abierto", !!id);
    firmaLogica = ""; firmaObj = "";
    refrescar();
  }

  // ---- the hands' state ----
  let agarre: { key: string; antes: Donde } | null = null;
  let fantasma: { id: string; nombre: string; modelo: string; p: Punto | null; ry: number } | null = null;
  let puntero: { x: number; y: number } | null = null;
  let ctrl = false, eje: Eje | null = null, local = false, trasDuplicar = false;
  let abajo: { x: number; y: number; gizmo: boolean } | null = null, arrastrado = false;
  // M22b-1: coarse pointer (a phone) → «mover» has no handles, the thing is the handle. Starts from the device profile (perfil-aparato.ts: a headset's coarse pointer is not a finger) and
  // turns on at the first touch (a laptop with a touch screen reports a fine pointer)
  let tactil = esTactil();
  const pasoPos = () => (ctrl ? 0 : Number(selPos.value));
  const pasoGiro = () => (ctrl ? 0 : Number(selGiro.value));

  // ---- sending: at most 8 moves a second while dragging, a heartbeat while held still, a final one on release ----
  let envio: { key: string; ultimo: number; pendiente: boolean; enviados: number; reloj: ReturnType<typeof setInterval> } | null = null;
  let loteGrupo = ""; // M22c: non-"" while dragging a multi-selection, so every send of this drag shares one undo step
  const enviarYa = (): Donde | null => {
    if (!envio) return null;
    const d = ed.dondeEsta(envio.key);
    if (d) { const r = c.transformar(envio.key, d, loteGrupo); if (!r.ok) decir(no(r.why)); }
    envio.ultimo = performance.now(); envio.pendiente = false; envio.enviados++;
    return d;
  };
  const programarEnvio = (key: string) => {
    if (envio && envio.key !== key) terminarEnvio();
    envio ??= { key, ultimo: -Infinity, pendiente: false, enviados: 0, reloj: setInterval(() => { if (envio && (envio.pendiente || performance.now() - envio.ultimo >= VIVO_MS)) enviarYa(); }, ENVIO_MS) };
    envio.pendiente = true;
    if (performance.now() - envio.ultimo >= ENVIO_MS) enviarYa();
  };
  /** The final move (if anything moved), and stop. Returns what was sent last. */
  const terminarEnvio = (): Donde | null => {
    if (!envio) return null;
    const d = enviarYa();
    clearInterval(envio.reloj); envio = null;
    return d;
  };

  // ---- the gizmo's drags (render reports them; the thing already moves on screen) ----
  // M22c: dragging the primary with 2+ selected mirrors the same translation to the rest, live, and commits them
  // all with one shared `lote` on release — one undo step brings every one of them back.
  let grupoInicio: Map<string, Donde> | null = null;
  ed.onArrastre((fase, key, d) => {
    if (fase === "empieza") {
      arrastrado = true; cam()?.bloquear?.(true);
      if (c.estado.seleccionados.length > 1 && c.estado.seleccionados.includes(key)) {
        grupoInicio = new Map();
        for (const id of c.estado.seleccionados) { const d0 = ed.dondeEsta(id); if (d0) grupoInicio.set(id, d0); }
        loteGrupo = c.nuevoLote();
      } else { grupoInicio = null; loteGrupo = ""; }
    } else if (fase === "cambia") {
      programarEnvio(key); mostrarDonde(d);
      if (grupoInicio?.has(key)) {
        // lote4: the tool decides how the rest follow — move: the same shift; turn / scale: the whole group turns or
        // grows around its centre as one body (the primary only gives up its x/z: the gizmo owns its turn and size)
        const modo = ed.estado().herramienta ?? "mover";
        for (const [id, dd] of transformarGrupo(grupoInicio, key, d, modo)) {
          if (id !== key) ed.poner(id, dd);
          else if (modo !== "mover") ed.poner(id, { x: dd.x, z: dd.z });
        }
      }
    } else {
      terminarEnvio(); cam()?.bloquear?.(false);
      if (grupoInicio) {
        const modo = ed.estado().herramienta ?? "mover";
        for (const [id] of grupoInicio) if (id !== key) { const d2 = ed.dondeEsta(id); if (d2) c.transformar(id, modo === "mover" ? { x: d2.x, y: d2.y, z: d2.z } : d2, loteGrupo); }
        decir(tx(`${grupoInicio.size} objects ${modo === "girar" ? "rotated" : modo === "escalar" ? "scaled" : "moved"} together (Ctrl+Z puts them all back at once).`, `${grupoInicio.size} objetos ${modo === "girar" ? "girados" : modo === "escalar" ? "escalados" : "movidos"} juntos (Ctrl+Z los devuelve a la vez).`));
      } else decir(tx(`${nombreDe(c.objeto(key) ?? { id: key })}: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)} · rotation ${fmt(d.ry)}°.`, `${nombreDe(c.objeto(key) ?? { id: key })}: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)} · giro ${fmt(d.ry)}°.`));
      grupoInicio = null; loteGrupo = "";
      refrescar();
    }
  });

  // ---- grab mode (coger): the thing follows the point under the pointer ----
  function empezarAgarre(key: string): void {
    const o = c.objeto(key), antes = ed.dondeEsta(key);
    if (!o || !antes) return;
    if (o.fijado) return decir(tx("It is pinned: release it (P) before grabbing it.", "Está anclado: suéltalo (P) antes de cogerlo."));
    if (agarre) soltarAgarre(false);
    agarre = { key, antes };
    ed.sostener(key);
    cam()?.bloquear?.(true);
    decir(tx(`Grabbed ${nombreDe(o)}: move it with the mouse · wheel: rotate · Shift + wheel: scale · click: drop · Esc: put back.`, `Cogido ${nombreDe(o)}: muévelo con el ratón · rueda: girar · Mayús + rueda: escalar · clic: soltar · Esc: devolver.`));
    if (puntero) seguir(puntero.x, puntero.y);
  }
  function soltarAgarre(deseleccionar: boolean): void {
    if (!agarre) return;
    agarre = null;
    const final = terminarEnvio();
    ed.sostener(null, final ?? undefined);
    cam()?.bloquear?.(false);
    if (deseleccionar) c.seleccionar("");
    decir(tx("Dropped.", "Soltado."));
  }
  function cancelarAgarre(): void {
    if (!agarre) return;
    const { key, antes } = agarre;
    agarre = null;
    const huboEnvios = !!envio && envio.enviados > 0;
    if (envio) { clearInterval(envio.reloj); envio = null; }
    ed.poner(key, antes);
    if (huboEnvios) { c.transformar(key, antes); ed.sostener(null, antes); } else ed.sostener(null);
    cam()?.bloquear?.(false);
    decir(tx("Put back where it was.", "Devuelto a donde estaba."));
  }
  /** Grab mode and the library preview: follow the point under the pointer (snapped on the ground grid). */
  function seguir(x: number, y: number): void {
    const key = agarre?.key ?? (fantasma ? FANTASMA : null);
    const p = key ? ed.puntoBajo(x, y, key) : null;
    if (!p) return;
    const s = pasoPos();
    const q = { x: s ? redondear(p.x, s) : redondear(p.x, 0.01), y: redondear(p.y, 0.01), z: s ? redondear(p.z, s) : redondear(p.z, 0.01) };
    if (agarre) { ed.poner(agarre.key, q); programarEnvio(agarre.key); const d = ed.dondeEsta(agarre.key); if (d) mostrarDonde(d); }
    else if (fantasma) { fantasma.p = q; dibujarFantasma(); }
  }
  function girarCogido(grados: number): void {
    const s = pasoGiro();
    const giro = (ry: number) => envolver(s ? Math.round((ry + grados) / s) * s : ry + grados);
    if (fantasma) { fantasma.ry = giro(fantasma.ry); dibujarFantasma(); return; }
    if (!agarre) return;
    const d = ed.dondeEsta(agarre.key);
    if (d) { ed.poner(agarre.key, { ry: giro(d.ry) }); programarEnvio(agarre.key); }
  }
  function escalarCogido(factor: number): void {
    if (fantasma) return decir(tx("It is placed at scale 1: scale it afterwards (4, or Shift + wheel while holding it).", "Se coloca a escala 1: escálalo después (4, o Mayús + rueda al cogerlo)."));
    const d = agarre && ed.dondeEsta(agarre.key);
    if (!agarre || !d) return;
    const s = (v: number) => Math.min(50, Math.max(0.05, ctrl ? v * factor : Math.max(0.1, redondear(v * factor, 0.1))));
    ed.poner(agarre.key, { sx: s(d.sx), sy: s(d.sy), sz: s(d.sz) });
    programarEnvio(agarre.key);
  }

  // ---- the library preview: «colocar donde apuntas» ----
  const dibujarFantasma = () => {
    if (!fantasma?.p) return;
    view.place(FANTASMA, { model: fantasma.modelo, ...fantasma.p, rx: 0, ry: fantasma.ry, rz: 0, sx: 1, sy: 1, sz: 1, animate: false });
    ed.despertar();
  };
  const quitarFantasma = () => { if (fantasma) { fantasma = null; view.place(FANTASMA, null); cam()?.bloquear?.(false); ed.despertar(); } };
  function empezarFantasma(m: { id: string; nombre: string; modelo: string }): void {
    if (agarre) soltarAgarre(false);
    quitarFantasma();
    fantasma = { id: m.id, nombre: m.nombre, modelo: m.modelo, p: null, ry: 0 };
    cam()?.bloquear?.(true); // like grab mode, the preview owns the wheel
    decir(tx(`${m.nombre}: drop it where you want it (wheel: rotate · Esc: cancel).`, `${m.nombre}: suéltalo donde lo quieras (rueda: girar · Esc: cancelar).`));
    if (puntero) seguir(puntero.x, puntero.y);
  }
  function soltarFantasma(x: number, y: number): void {
    if (!fantasma) return;
    seguir(x, y);
    const f = fantasma;
    quitarFantasma();
    if (!f.p) return decir(tx("Aim at the ground or another object to place it.", "Apunta al suelo o a otro objeto para colocarlo."));
    responder(c.colocarEn(f.id, f.p, f.ry), tx(`Placed: ${f.nombre}.`, `Colocado: ${f.nombre}.`));
  }

  // ---- tools, axes, snap ----
  function elegirModo(m: Herr): Res | void {
    const r = c.modo(m); // the client tells everyone listening (escuchar → aplicarModo)
    if (r.ok && m === "coger" && !agarre && c.estado.seleccionado) empezarAgarre(c.estado.seleccionado);
    return r.ok ? undefined : r;
  }
  function aplicarModo(): void {
    const m = c.estado.modo;
    if (m !== "coger" && agarre) soltarAgarre(false);
    aplicarGizmo();
    const h = m === "mover" || m === "girar" || m === "escalar" ? m : null;
    const nomH = HERRAMIENTAS.find((x) => x[0] === h)?.[1] ?? ["", ""];
    if (abierto()) decir(m === "coger" ? tx("Grab: click an object and carry it; another click drops it.", "Coger: haz clic en un objeto y llévalo; otro clic lo suelta.") : h ? (tactil && h === "mover" ? tx("Move: drag the object with your finger.", "Mover: arrastra el objeto con el dedo.") : tx(`${nomH[0]}: drag a handle (X red, Y green, Z blue).`, `${nomH[1]}: arrastra una asa (X roja, Y verde, Z azul).`)) : tactil ? tx("Tap an object to select it.", "Toca un objeto para seleccionarlo.") : tx("Click an object to select it.", "Haz clic en un objeto para seleccionarlo."));
    refrescar();
  }
  /** The gizmo shows for the tool on the selection — not for a pinned thing (the server would refuse every move), and
   * not for «mover» on a touch screen (M22b-1: the finger drags the thing itself; handles are small and the finger hides them). */
  function aplicarGizmo(): void {
    const m = c.estado.modo, o = c.objeto(c.estado.seleccionado);
    const h = abierto() && !o?.fijado && (m === "mover" || m === "girar" || m === "escalar") && !(tactil && m === "mover") ? m : null;
    if (ed.estado().herramienta !== h || (h && !ed.estado().cargado)) void ed.herramienta(h).then(() => programarRefresco());
  }
  function elegirEje(e: Eje | null): void {
    eje = e; ed.eje(e);
    decir(e ? tx(`Only the ${e} axis (press ${e} again for all).`, `Solo el eje ${e} (pulsa ${e} otra vez para todos).`) : tx("All axes.", "Todos los ejes."));
    refrescar();
  }
  function cambiarEspacio(): void {
    local = !local; ed.espacio(local);
    decir(local ? tx("Object axes (local).", "Ejes del objeto (local).") : tx("World axes.", "Ejes del mundo."));
    refrescar();
  }
  function aplicarPaso(): void {
    const p = pasoPos(), g = pasoGiro();
    ed.paso({ pos: p || null, grados: g || null, escala: p ? 0.1 : null });
  }
  function duplicar(): Res {
    if (agarre) soltarAgarre(false);
    trasDuplicar = true;
    const r = c.duplicar();
    if (!r.ok) trasDuplicar = false;
    return r.ok ? { ok: true } : r;
  }
  function encuadrar(): Res {
    const d = c.estado.seleccionado ? ed.dondeEsta(c.estado.seleccionado) : null;
    if (!d) return { ok: false, why: tx("select something first (click)", "selecciona algo antes (clic)") };
    const camara = cam();
    if (!camara?.frame) return { ok: false, why: tx("framing arrives with the new camera", "encuadrar llega con la cámara nueva") };
    camara.frame({ x: d.x, y: d.y + d.sy / 2, z: d.z }, Math.max(1, d.sx, d.sy, d.sz) * 1.5);
    return { ok: true };
  }
  /** Escape undoes the most transient thing first: the piece following the pointer, grab mode, the open drawer, the selection. */
  function escape(): void {
    switch (queCierraEscape({ fantasma: !!fantasma, agarre: !!agarre, cajon, seleccion: c.estado.seleccionado })) {
      case "fantasma": quitarFantasma(); return decir(tx("Cancelled.", "Cancelado."));
      case "agarre": return cancelarAgarre();
      case "cajon": return abrirCajon("");
      default: c.seleccionar(""); decir(tx("Nothing selected.", "Nada seleccionado."));
    }
  }
  /** M22c: delete the selection; with several, a shared `lote` joins them in a single undo step. */
  function borrarSeleccion(): Res {
    const ids = c.estado.seleccionados;
    if (ids.length <= 1) return c.borrar();
    const lote = c.nuevoLote();
    let ultimo: Res = { ok: true };
    for (const id of ids) { const r = c.borrarId(id, lote); if (!r.ok) ultimo = r; }
    return ultimo.ok ? { ok: true } : ultimo;
  }

  // ---- the inspector: real labelled inputs; Enter or leaving the field applies ----
  function aplicarCampo(i: HTMLInputElement): void {
    const id = c.estado.seleccionado, k = i.dataset.k ?? "", v = i.valueAsNumber;
    if (!id) return decir(tx("Select something first (click).", "Selecciona algo antes (clic)."));
    if (!Number.isFinite(v)) return decir(tx("That is not a number.", "Eso no es un número."));
    responder(k === "u" ? c.transformar(id, { sx: v, sy: v, sz: v }) : c.transformar(id, { [k]: v }));
  }
  /** The inspector's fields and the card's follow what is drawn (never under your cursor). */
  function mostrarDonde(d: Donde): void {
    for (const k of ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"] as const) if (document.activeElement !== campos[k].i) campos[k].i.value = fmt(d[k]);
    for (const k of ["x", "y", "z", "ry"] as const) if (document.activeElement !== tc[k]) tc[k].value = fmt(d[k]);
    const u = tamanoUniforme(d.sx, d.sy, d.sz);
    if (document.activeElement !== campos.u.i) campos.u.i.value = u;
    if (document.activeElement !== tc.u) tc.u.value = u;
  }
  /** The dock's drawers, the selection line, the inspector and the card follow the shared state. */
  function refrescar(): void {
    if (boton.hidden === c.estado.puede) boton.hidden = !c.estado.puede; // ux2-barra: the bar hides with the `hidden` attribute only
    const aviso = avisoBiblioteca(c.biblioteca, c.estado.puede);
    avisoLib.textContent = aviso; avisoLib.hidden = !aviso;
    pintarFicha();
    if (!abierto()) return;
    if (cajon === "objetos") pintarLista();
    for (const b of botonesHerr) b.setAttribute("aria-pressed", String(b.dataset.modo === c.estado.modo));
    for (const b of botonesEje) b.setAttribute("aria-pressed", String((b.dataset.eje || null) === eje));
    botonEspacio.textContent = local ? tx("Local", "Local") : tx("World", "Mundo");
    botonEspacio.setAttribute("aria-pressed", String(local));
    const o = c.objeto(c.estado.seleccionado), cerca = o ? null : c.seleccion();
    const grupo = c.estado.seleccionados.length > 1 ? tx(` · ${c.estado.seleccionados.length} selected (Del deletes them together, the gizmo moves them together)`, ` · ${c.estado.seleccionados.length} seleccionados (Supr los borra juntos, el gizmo los mueve juntos)`) : "";
    sel.textContent = o ? tx(`Selected: ${nombreDe(o)} · ${o.id}${o.fijado ? " · pinned" : ""}${grupo}`, `Seleccionado: ${nombreDe(o)} · ${o.id}${o.fijado ? " · anclado" : ""}${grupo}`)
      : cerca ? tx(`Nothing selected; the buttons use the nearest one: ${nombreDe(cerca)} · ${cerca.id}`, `Nada seleccionado; los botones usan lo más cercano: ${nombreDe(cerca)} · ${cerca.id}`) : tx("Nothing selected: click an object.", "Nada seleccionado: haz clic en un objeto.");
    pintarLogica(o);
    for (const f of datos.querySelectorAll("fieldset")) f.disabled = !o;
    nombre.disabled = decorado.disabled = fijado.disabled = !o;
    const tipo = String(o?.tipo ?? "modelo");
    const suena = tipo === "sonido" || tipo === "video";
    lSolido.hidden = !o || tipo === "sonido"; lVisible.hidden = !o; // «se ve al jugar» for every object (it was the card's Ajustes tab) lVolumen.hidden = lAlcance.hidden = !o || !suena;
    lGrupo.hidden = !o || !suena;
    lRadio.hidden = !o || !suena || (o.alcance ?? "burbuja") !== "burbuja";
    lEnlace.hidden = !o;
    if (!o) return;
    solido.checked = o.solido === true; visible.checked = o.oculto !== true;
    if (document.activeElement !== volumen) volumen.value = String(o.volumen ?? 1);
    if (document.activeElement !== alcance) alcance.value = String(o.alcance ?? "burbuja");
    if (document.activeElement !== grupoSonido) grupoSonido.value = String(o.grupo ?? "auto");
    if (document.activeElement !== radio) radio.value = String(tipo === "sonido" ? o.sx : (o.radio ?? 8));
    if (document.activeElement !== enlace) enlace.value = String(o.enlace ?? "");
    const drawn = agarre?.key === o.id || ed.estado().arrastrando ? ed.dondeEsta(o.id) : null;
    mostrarDonde(drawn ?? (Object.fromEntries(["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"].map((k) => [k, Number(o[k])])) as Donde));
    if (document.activeElement !== nombre) nombre.value = String(o.nombre ?? "");
    decorado.checked = o.decorado === true;
    fijado.checked = o.fijado === true;
  }
  /** «Lógica» in the Inspector drawer: redrawn only when open and when something changed. */
  function pintarLogica(o: Obj | null): void {
    if (cajon !== "inspector" || !extra?.mundo) return;
    const lg = o ? logicaDeObjeto(o, extra.mundo()) : { entran: [], salen: [], piezas: [] };
    const firma = JSON.stringify(lg);
    if (firma === firmaLogica) return;
    firmaLogica = firma;
    const lista = (ul: HTMLUListElement, filas: string[], vacio: string) => ul.replaceChildren(...(filas.length ? filas : [vacio]).map((t) => el("li", { textContent: t, className: filas.length ? "" : "vacio" })));
    lista(lEntran, lg.entran, o ? tx("No trigger shows or hides it.", "Ningún disparador lo muestra ni lo oculta.") : tx("Choose an object.", "Elige un objeto."));
    lista(lSalen, lg.salen, o ? tx("No trigger starts here.", "Ningún disparador nace aquí.") : "—");
    lista(lPiezas, lg.piezas, o ? tx("No locks or counters here.", "Sin cerraduras ni contadores aquí.") : "—");
  }
  let refrescoPendiente = false;
  const programarRefresco = () => { if (!refrescoPendiente) { refrescoPendiente = true; requestAnimationFrame(() => { refrescoPendiente = false; refrescar(); }); } };

  // ---- the shared state (features/objetos/client.ts): the same for this panel, the gizmo and agents ----
  let rechazosVistos = "";
  c.escuchar((que) => {
    if (que === "seleccion") {
      const k = c.estado.seleccionado || null;
      if (agarre && agarre.key !== k) soltarAgarre(false);
      ed.seleccionar(abierto() ? k : null);
      ed.outlineVarios?.(abierto() ? c.estado.seleccionados.filter((id) => id !== k) : []);
      if (trasDuplicar && k) {
        trasDuplicar = false; // Blender: Shift+D, then the copy follows the pointer
        if (abierto()) { if (c.estado.modo !== "coger") c.modo("coger"); empezarAgarre(k); }
      }
    } else if (que === "modo") aplicarModo();
    else if (que === "rechazado") {
      trasDuplicar = false;
      if (c.estado.ultimoRechazo && c.estado.ultimoRechazo !== rechazosVistos) decir(no(c.estado.ultimoRechazo));
      rechazosVistos = c.estado.ultimoRechazo;
      if (agarre) cancelarAgarre();
    }
    if (que === "seleccion" || que === "estado") aplicarGizmo();
    programarRefresco();
  });

  // ---- opening and closing ----
  function abrir(si: boolean): void {
    panel.hidden = !si;
    document.body.classList.toggle("construyendo", si); // U10: the minimap steps aside while building
    view.verOcultos?.(si);                                // U10: hidden spheres of sound show while building
    boton.setAttribute("aria-expanded", String(si));
    pintarBoton(si);
    if (si) {
      extra?.alAbrir?.("construir"); // T1: a mission step may ask «open Construir»
      void ed.cargar();
      if (!c.estado.modo) c.modo("mover");
      cam()?.modo?.("construir");
      ed.seleccionar(c.estado.seleccionado || null);
      aplicarPaso();
      aplicarModo();
      decir(tactil ? tx("Build: tap an object to choose it, or «Add» (+) to place one.", "Construir: toca un objeto para elegirlo, o «Añadir» (+) para poner uno.") : tx("Build: click an object to choose it, or «Add» (+) to place one.", "Construir: haz clic en un objeto para elegirlo, o «Añadir» (+) para poner uno."));
    } else {
      abrirCajon(""); // the next visit starts with the world clear: only the dock
      quitarFantasma();
      if (agarre) soltarAgarre(false);
      void ed.herramienta(null);
      ed.seleccionar(null);
      ed.outlineVarios?.([]);
      cam()?.modo?.("juego");
    }
    refrescar();
    ed.despertar();
  }
  boton.addEventListener("click", (e) => { abrir(!abierto()); if (e.detail > 0) boton.blur(); });
  // U11: an icon (the house glyph for production, crane-tower), the words for screen readers and the tooltip
  function pintarBoton(si: boolean): void {
    const t = si ? tx("Close build mode (B)", "Cerrar construir (B)") : tx("Build (B)", "Construir (B)");
    boton.classList.add("solo-icono"); boton.title = t;
    boton.innerHTML = `${icono(si ? "x" : "crane-tower")}<span class="solo-lector">${t}</span>`;
  }
  pintarBoton(false);

  // ---- keys: the builder's go first (capture) and stop there; text fields keep theirs ----
  function tecla(e: KeyboardEvent): (() => Res | void) | null {
    const k = e.code, mod = e.ctrlKey || e.metaKey;
    if (mod && k === "KeyZ") return () => (e.shiftKey ? c.rehacer() : c.deshacer());
    if (mod && k === "KeyY") return () => c.rehacer();
    if (k === "KeyD" && (mod || e.shiftKey)) return () => duplicar();
    if (mod || e.altKey) return null;
    const conGizmo = c.estado.modo === "mover" || c.estado.modo === "girar" || c.estado.modo === "escalar";
    switch (k) {
      case "Escape": return () => escape();
      case "Digit1": case "Numpad1": return () => elegirModo("coger");
      case "Digit2": case "Numpad2": case "KeyG": return () => elegirModo("mover");
      case "Digit3": case "Numpad3": case "KeyR": return () => elegirModo("girar");
      case "Digit4": case "Numpad4": return () => elegirModo("escalar");
      case "KeyX": case "KeyY": case "KeyZ": { const a = k.slice(3) as Eje; return conGizmo ? () => elegirEje(eje === a ? null : a) : null; }
      case "KeyT": return () => cambiarEspacio();
      case "Delete": case "Backspace": return () => borrarSeleccion();
      case "KeyP": return () => c.fijar();
      case "KeyF": return () => encuadrar();
    }
    return null;
  }
  addEventListener("keydown", (e) => {
    if (e.code === "ControlLeft" || e.code === "ControlRight") { if (!ctrl) { ctrl = true; aplicarPaso(); } return; }
    if (esEntrada(e.target) || !c.estado.puede) return;
    if (teclas.es(e, "construir")) { // keymap v1: B builds (Yours or Default); Tab is People now
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) abrir(!abierto());
      return;
    }
    if (!abierto()) return;
    const accion = tecla(e);
    if (!accion) return;
    e.preventDefault(); e.stopPropagation(); // G does not wave, D does not walk, Backspace does not go back
    if (e.repeat) return;
    const r = accion();
    if (r) responder(r);
  }, { capture: true });
  addEventListener("keyup", (e) => { if ((e.code === "ControlLeft" || e.code === "ControlRight") && ctrl) { ctrl = false; aplicarPaso(); } }, { capture: true });
  addEventListener("blur", () => { if (ctrl) { ctrl = false; aplicarPaso(); } });

  // ---- mouse on the 3D view: the left button is the builder's ----
  lienzo.addEventListener("pointerdown", (e) => {
    if (!abierto() || e.button !== 0) return;
    abajo = { x: e.clientX, y: e.clientY, gizmo: !!ed.estado().ejeBajo }; // a handle under the pointer: the gizmo takes it
    arrastrado = false;
  });
  lienzo.addEventListener("pointermove", (e) => {
    if (!abierto()) return;
    puntero = { x: e.clientX, y: e.clientY };
    if (agarre || fantasma) seguir(e.clientX, e.clientY);
    else ed.despertar(); // the handle under the pointer lights up: draw it
  });
  lienzo.addEventListener("pointerup", (e) => {
    if (!abierto() || e.button !== 0 || !abajo) return;
    const fue = abajo;
    abajo = null;
    if (fue.gizmo || arrastrado || Math.hypot(e.clientX - fue.x, e.clientY - fue.y) > CLIC_PX) return;
    if (fantasma) return soltarFantasma(e.clientX, e.clientY);
    if (agarre) return soltarAgarre(true);
    const k = ed.pick(e.clientX, e.clientY);
    if (e.shiftKey && k) { // M22c: Shift+click adds/removes from the selected group, without touching grab mode
      c.alternarSeleccion(k);
      decir(tx(`${c.estado.seleccionados.length} selected.`, `${c.estado.seleccionados.length} seleccionados.`));
      return;
    }
    c.seleccionar(k ?? "");
    if (k && c.estado.modo === "coger") empezarAgarre(k);
    else if (k) { const o = c.objeto(k); decir(tx(`Selected: ${o ? nombreDe(o) : k}.`, `Seleccionado: ${o ? nombreDe(o) : k}.`)); }
    else decir(tx("Nothing selected.", "Nada seleccionado."));
  });
  // ---- lote4: the rubber band — Shift + drag on the empty world draws a rectangle; on release every thing whose centre
  // is inside joins the selection (it adds to what Shift-clicks already picked). Claimed on `document` in the capture
  // phase so the camera's orbit and the gizmo never see this press. Mouse only: a finger on the empty world is the camera.
  let banda: { id: number; x0: number; y0: number; x: number; y: number; caja: HTMLDivElement } | null = null;
  document.addEventListener("pointerdown", (e) => {
    if (!abierto() || e.pointerType !== "mouse" || e.button !== 0 || !e.shiftKey || e.target !== lienzo || banda || agarre || fantasma) return;
    if (ed.estado().ejeBajo || ed.pick(e.clientX, e.clientY)) return; // a handle or a thing: Shift+click keeps toggling that thing
    e.stopPropagation(); e.preventDefault();
    const caja = document.createElement("div");
    caja.className = "banda-seleccion"; caja.setAttribute("aria-hidden", "true");
    caja.style.cssText = "position:fixed;z-index:50;pointer-events:none;border:1.5px solid #7ac3ff;background:rgba(122,195,255,.14);display:none";
    document.body.appendChild(caja);
    banda = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, caja };
    abajo = null; // this press is not a click
    cam()?.bloquear?.(true);
    try { lienzo.setPointerCapture(e.pointerId); } catch { /* window events still arrive */ }
  }, { capture: true });
  addEventListener("pointermove", (e) => {
    if (!banda || e.pointerId !== banda.id) return;
    banda.x = e.clientX; banda.y = e.clientY;
    const r = rectDesde({ x: banda.x0, y: banda.y0 }, banda);
    if (esCaja({ x: banda.x0, y: banda.y0 }, banda)) Object.assign(banda.caja.style, { display: "block", left: `${r.x0}px`, top: `${r.y0}px`, width: `${r.x1 - r.x0}px`, height: `${r.y1 - r.y0}px` });
  }, { capture: true });
  const finBanda = (e: PointerEvent) => {
    if (!banda || e.pointerId !== banda.id) return;
    const b = banda; banda = null;
    b.caja.remove(); cam()?.bloquear?.(false);
    try { lienzo.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (e.type === "pointercancel" || !esCaja({ x: b.x0, y: b.y0 }, { x: e.clientX, y: e.clientY })) return;
    const r = rectDesde({ x: b.x0, y: b.y0 }, { x: e.clientX, y: e.clientY });
    const dentro = idsEnRect(ed.centros().map(([k, p]) => [k, ed.pantalla(p.x, p.y, p.z)] as const), r);
    if (!dentro.length) return decir(tx("No object inside the rectangle.", "Ningún objeto dentro del rectángulo."));
    const ids = unirSeleccion(c.estado.seleccionados, dentro);
    c.seleccionarVarios(ids);
    decir(tx(`${ids.length} selected with the rectangle (Shift + drag on empty space). Moving, rotating and scaling take them all together.`, `${ids.length} seleccionados con el rectángulo (Mayús + arrastrar en el vacío). Mover, girar y escalar los lleva a todos juntos.`));
  };
  addEventListener("pointerup", finBanda, { capture: true });
  addEventListener("pointercancel", finBanda, { capture: true });

  // the wheel is the camera's, except while something follows the pointer: then it turns (Shift: scales) it
  lienzo.addEventListener("wheel", (e) => {
    if (!abierto() || (!agarre && !fantasma)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const d = e.deltaY || e.deltaX; // Shift + wheel comes as a sideways wheel in some browsers
    if (!d) return;
    if (e.shiftKey) escalarCogido(d < 0 ? 1.1 : 1 / 1.1);
    else girarCogido((d < 0 ? 1 : -1) * (e.ctrlKey ? 1 : pasoGiro() || 15));
  }, { passive: false });
  // touch: a finger on a handle, or carrying something, is the builder's — the page's walking joystick never sees it
  document.addEventListener("pointerdown", (e) => {
    if (abierto() && e.pointerType !== "mouse" && (ed.estado().arrastrando || agarre || fantasma)) e.stopPropagation();
  });

  // ---- M22b-1: a finger on a thing — tap = select, drag = move it (the thing is the handle) ----
  // Claimed on `document` in the capture phase, before the camera (canvas, bubble), TransformControls (canvas) and the
  // joystick (window) see it. A second finger while carrying is swallowed too (the gestures of M22b-2 will use it).
  let dedo: { id: number; key: string; x0: number; y0: number; antes: Donde; desfase: { x: number; z: number } | null; movido: boolean } | null = null;
  document.addEventListener("pointerdown", (e) => {
    if (!abierto() || e.pointerType === "mouse" || e.target !== lienzo) return;
    if (dedo) {
      if (e.pointerId !== dedo.id) {
        e.stopPropagation();
        if (!gesto && !dedo.movido && e.pointerType === "touch") empezarGesto(e); // lote4: a second finger while the first rests on the thing
      }
      return;
    }
    if (!tactil) { tactil = true; aplicarGizmo(); }
    if (!e.isPrimary || agarre || fantasma) return; // grab mode and the library preview keep today's path (tap = drop)
    const key = ed.pick(e.clientX, e.clientY), antes = key ? ed.dondeEsta(key) : null;
    if (!key || !antes) return;
    e.stopPropagation();
    dedo = { id: e.pointerId, key, x0: e.clientX, y0: e.clientY, antes, desfase: null, movido: false };
    posDedo.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { lienzo.setPointerCapture(e.pointerId); } catch { /* not capturable: window events still arrive */ }
    cam()?.bloquear?.(true);
    c.seleccionar(key);
    ed.despertar();
  }, { capture: true });
  // ---- lote4 (M22b-2): two fingers — the first stays on the thing, the second joins anywhere; turning them turns the thing
  // around its vertical axis, spreading them scales it (all three axes alike). One shared `lote`: a single Ctrl+Z.
  let gesto: { ids: [number, number]; pos: Map<number, { x: number; y: number }>; inicio: { a: { x: number; y: number }; b: { x: number; y: number } }; key: string; antes: Donde; lote: string } | null = null;
  const sobrantes = new Set<number>(); // fingers of a finished gesture: swallowed until they lift, so they never move the thing
  const posDedo = new Map<number, { x: number; y: number }>();
  function empezarGesto(e: PointerEvent): void {
    if (!dedo) return;
    const o = c.objeto(dedo.key);
    if (!o || o.fijado) return decir(o?.fijado ? tx("It is pinned: release it («Pin / release») before rotating or scaling it.", "Está anclado: suéltalo («Anclar / soltar») antes de girarlo o escalarlo.") : "");
    const a = posDedo.get(dedo.id) ?? { x: dedo.x0, y: dedo.y0 }, b = { x: e.clientX, y: e.clientY };
    const inicio = { a: { ...a }, b };
    if (!gestoDosDedos(inicio, inicio)) return; // fingers too close to tell an angle: ignore the second one
    const antes = ed.dondeEsta(dedo.key);
    if (!antes) return;
    gesto = { ids: [dedo.id, e.pointerId], pos: new Map([[dedo.id, a], [e.pointerId, b]]), inicio, key: dedo.key, antes, lote: c.nuevoLote() };
    loteGrupo = gesto.lote; arrastrado = true;
    ed.sostener(gesto.key);
    decir(tx("Two fingers: turn them to rotate the object, spread or pinch them to scale it.", "Dos dedos: gíralos para girar el objeto, sepáralos o júntalos para escalarlo."));
  }
  function moverGesto(): void {
    if (!gesto) return;
    const g = gestoDosDedos(gesto.inicio, { a: gesto.pos.get(gesto.ids[0])!, b: gesto.pos.get(gesto.ids[1])! });
    if (!g) return;
    const n = aplicarGesto(gesto.antes, g);
    ed.poner(gesto.key, n);
    programarEnvio(gesto.key);
    const d = ed.dondeEsta(gesto.key);
    if (d) mostrarDonde(d);
  }
  function terminarGesto(): void {
    if (!gesto) return;
    const fue = gesto; gesto = null;
    for (const id of fue.ids) sobrantes.add(id);
    if (dedo && fue.ids.includes(dedo.id)) { try { lienzo.releasePointerCapture(dedo.id); } catch { /* gone */ } dedo = null; }
    cam()?.bloquear?.(false);
    const final = terminarEnvio();
    ed.sostener(null, final ?? undefined);
    loteGrupo = "";
    const d = final ?? ed.dondeEsta(fue.key);
    decir(d ? tx(`${nombreDe(c.objeto(fue.key) ?? { id: fue.key })}: rotation ${fmt(d.ry)}° · size ${fmt(d.sx)} (Ctrl+Z undoes it).`, `${nombreDe(c.objeto(fue.key) ?? { id: fue.key })}: giro ${fmt(d.ry)}° · tamaño ${fmt(d.sx)} (Ctrl+Z lo deshace).`) : tx("Done.", "Hecho."));
    refrescar();
  }
  addEventListener("pointermove", (e) => {
    if (sobrantes.has(e.pointerId)) { e.stopPropagation(); return; }
    if (e.pointerType === "touch" && dedo) posDedo.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesto || !gesto.ids.includes(e.pointerId)) return;
    e.stopPropagation();
    gesto.pos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moverGesto();
  }, { capture: true });
  const levantar = (e: PointerEvent) => {
    posDedo.delete(e.pointerId);
    if (sobrantes.delete(e.pointerId)) { e.stopPropagation(); return; }
    if (gesto?.ids.includes(e.pointerId)) { e.stopPropagation(); terminarGesto(); }
  };
  addEventListener("pointerup", levantar, { capture: true });
  addEventListener("pointercancel", levantar, { capture: true });
  addEventListener("pointermove", (e) => {
    if (!dedo || e.pointerId !== dedo.id || gesto) return;
    e.stopPropagation();
    if (!dedo.movido) {
      if (Math.hypot(e.clientX - dedo.x0, e.clientY - dedo.y0) <= CLIC_PX) return;
      const o = c.objeto(dedo.key);
      if (!o) return;
      if (o.fijado) return decir(tx("It is pinned: release it («Pin / release») before moving it.", "Está anclado: suéltalo («Anclar / soltar») antes de moverlo."));
      const p0 = ed.puntoBajo(dedo.x0, dedo.y0, dedo.key); // the ground (or thing) behind the first touch: the drag is measured there
      if (!p0) return;
      dedo.desfase = { x: dedo.antes.x - p0.x, z: dedo.antes.z - p0.z };
      dedo.movido = true;
      ed.sostener(dedo.key);
      decir(tx(`Grabbed ${nombreDe(o)}: drag it and let go to set it down.`, `Cogido ${nombreDe(o)}: arrástralo y suelta para posarlo.`));
    }
    const p = ed.puntoBajo(e.clientX, e.clientY, dedo.key);
    if (!p || !dedo.desfase) return;
    const s = pasoPos() || 0.01;
    ed.poner(dedo.key, { x: redondear(p.x + dedo.desfase.x, s), y: redondear(p.y, 0.01), z: redondear(p.z + dedo.desfase.z, s) });
    programarEnvio(dedo.key);
    const d = ed.dondeEsta(dedo.key);
    if (d) mostrarDonde(d);
  }, { capture: true });
  const finDedo = (e: PointerEvent) => {
    if (!dedo || e.pointerId !== dedo.id) return;
    e.stopPropagation();
    const fue = dedo;
    dedo = null;
    try { lienzo.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    cam()?.bloquear?.(false);
    const o = c.objeto(fue.key);
    if (fue.movido) {
      const final = terminarEnvio();
      ed.sostener(null, final ?? undefined);
      const d = final ?? ed.dondeEsta(fue.key);
      decir(d ? tx(`${nombreDe(o ?? { id: fue.key })} set down: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)}.`, `${nombreDe(o ?? { id: fue.key })} posado: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)}.`) : tx("Set down.", "Posado."));
      refrescar();
    } else decir(tx(`Selected: ${o ? nombreDe(o) : fue.key}. Drag it to move it; the card's icons rotate, duplicate and delete.`, `Seleccionado: ${o ? nombreDe(o) : fue.key}. Arrástralo para moverlo; los iconos de la ficha giran, duplican y borran.`));
  };
  addEventListener("pointerup", finDedo, { capture: true });
  addEventListener("pointercancel", finDedo, { capture: true });

  // ---- the object card (C3; ux2-dock: the maqueta's card on the right): the basics of what is selected — its name, the
  // three handles with their real keys, position, turn, size, what touching it does, Duplicar and Borrar (+ anchor, link,
  // back). Every other field is the Inspector drawer's. It shows only for someone who may build here AND with the builder
  // open (fichaVisible); the server still decides every action. Refreshed on events, never per frame. ----
  const ficha = el("aside", { id: "ficha-objeto" });
  ligar(ficha, "aria-label", "Selected object card", "Tarjeta del objeto seleccionado");
  // icon-only button: title + aria-label + data-tip (the tip also shows on keyboard focus); a short label for touch screens
  const bIcono = (ic: string, titulo: Par, corta: () => string, fn: () => Res | void, clase = "") => {
    const b = boton2(["", ""], titulo, fn);
    b.innerHTML = `${icono(ic, 18)}<span class="et" aria-hidden="true">${corta()}</span>`; b.className = `ic ${clase}`.trim();
    viva(() => { const t = tx(titulo[0], titulo[1]); b.setAttribute("aria-label", t); b.dataset.tip = t; const et = b.querySelector(".et"); if (et) et.textContent = corta(); });
    return b;
  };
  const fIcono = el("span", { className: "ico" }); fIcono.innerHTML = icono("package", 20);
  const fTitulo = el("h3");
  const bCerrar = bIcono("x", T("Close the card (Esc)", "Cerrar la tarjeta (Esc)"), () => ETIQUETAS_FICHA.cerrar, () => { c.seleccionar(""); }, "cerrar");
  const fSel = el("span", { textContent: tx("Selected", "Seleccionado") });
  const herrTarjeta = ([["mover", "G", ["move", "mover"], ["Move (2 or G)", "Mover (2 o G)"]], ["girar", "R", ["rotate", "girar"], ["Rotate (3 or R)", "Girar (3 o R)"]], ["escalar", "4", ["scale", "escala"], ["Scale (4)", "Escalar (4)"]]] as const).map(([m, k, t, tit]) => {
    const b = boton2(["", ""], tit, () => elegirModo(m));
    b.className = "chip"; b.dataset.modo = m;
    viva(() => { const tt = tx(tit[0], tit[1]); b.setAttribute("aria-label", tt); b.dataset.tip = tt; b.innerHTML = `<kbd>${k}</kbd> ${tx(t[0], t[1])}`; }); // fixed literals (never user input)
    return b;
  });
  const sub = el("p", { className: "sub" }, fSel, ...herrTarjeta.flatMap((b) => [" · ", b]));
  const campoT = (k: string, paso: string, etiqueta: Par) => { const i = el("input", { type: "number", step: paso }); i.dataset.k = k; ligar(i, "aria-label", etiqueta[0], etiqueta[1]); i.addEventListener("change", () => aplicarCampo(i)); return i; };
  const tc = { x: campoT("x", "0.1", T("Position x", "Posición x")), y: campoT("y", "0.1", T("Position y", "Posición y")), z: campoT("z", "0.1", T("Position z", "Posición z")), ry: campoT("ry", "1", T("Rotation in degrees", "Giro en grados")), u: campoT("u", "0.1", T("Size", "Tamaño")) };
  ligar(tc.u, "placeholder", "varies", "varía"); tc.u.min = "0.05";
  const fAlTocar = el("span", { className: "campo texto" });
  const rAlTocar = [ligar(el("dt"), "textContent", "On touch", "Al tocarlo"), el("dd", {}, fAlTocar)];
  const kv = el("dl", { className: "kv" },
    ligar(el("dt"), "textContent", "Position", "Posición"), el("dd", { className: "tres" }, tc.x, tc.y, tc.z),
    ligar(el("dt"), "textContent", "Rotation", "Giro"), el("dd", { className: "unidad" }, tc.ry, el("span", { textContent: "°" })),
    ligar(el("dt"), "textContent", "Size", "Tamaño"), el("dd", {}, tc.u), ...rAlTocar);
  const ranura = extra?.ranura ?? el("div", { className: "ranura" }); // huecos.ts puts «Hacer hueco / Poner obra / Vaciar» here for a picture
  const bDuplicar = boton2(T("Duplicate", "Duplicar"), T("Make a copy and grab it (Shift+D or Ctrl+D)", "Hacer una copia y cogerla (Mayús+D o Ctrl+D)"), () => duplicar(), "copy");
  const bBorrar = boton2(T("Delete", "Borrar"), T("Remove it from the world; with several chosen, deletes them together (Del; Ctrl+Z brings it back)", "Quitarlo del mundo; con varios elegidos, los borra juntos (Supr; Ctrl+Z lo devuelve)"), () => borrarSeleccion(), "trash");
  bBorrar.classList.add("peligro");
  const bFijar = bIcono("push-pin", ["Pin (P)", "Anclar (P)"], () => ETIQUETAS_FICHA.anclar, () => c.fijar());
  const bCopiarEnlace = bIcono("link", T("Copy link to this place", "Copiar enlace a este sitio"), () => ETIQUETAS_FICHA.enlace, () => copiarEnlace());
  const bVolver = bIcono("arrow-u-up-left", ["Back to where you were", "Volver a donde estabas"], () => ETIQUETAS_FICHA.volver, () => (extra?.volver?.() ? { ok: true } : { ok: false, why: tx("there is nowhere to go back to", "no hay a dónde volver") })); // i18n-ok: [English, Spanish] pair
  const acciones = el("div", { className: "acciones" }, bDuplicar, bBorrar, el("span", { className: "hueco-flex" }), bFijar, bCopiarEnlace, bVolver);
  acciones.setAttribute("role", "toolbar"); ligar(acciones, "aria-label", "Actions of the selected object", "Acciones del objeto seleccionado");
  ficha.append(el("div", { className: "cab" }, fIcono, fTitulo, bCerrar), sub, kv, ranura, acciones);
  ficha.addEventListener("keydown", (e) => { // typing in the card stays in the card; Esc leaves it like the builder's Esc
    if (!esEntrada(e.target)) return;
    e.stopPropagation();
    if (e.key === "Escape") { (e.target as HTMLElement).blur(); c.seleccionar(""); decir(tx("Nothing selected.", "Nada seleccionado.")); }
  });
  ficha.hidden = true;
  document.body.append(ficha);
  ficha.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch, not a click on the world
  function copiarEnlace(): Res {
    const o = c.objeto(c.estado.seleccionado), url = o ? enlaceDeObjeto(location, o) : null;
    if (!url) return { ok: false, why: tx("select something first (click)", "selecciona algo antes (clic)") };
    navigator.clipboard?.writeText(url).then(() => decir(tx("Link copied.", "Enlace copiado.")), () => decir(tx(`Copy the link: ${url}`, `Copia el enlace: ${url}`)));
    if (!navigator.clipboard) decir(tx(`Copy the link: ${url}`, `Copia el enlace: ${url}`));
    return { ok: true };
  }
  let firmaFicha = "";
  function pintarFicha(): void {
    const o = c.estado.seleccionado ? c.objeto(c.estado.seleccionado) : null;
    const ver = fichaVisible(c.estado.puede, abierto(), o ? o.id : "");
    if (!ver) { if (!ficha.hidden) ficha.hidden = true; document.documentElement.classList.remove("ficha-hoja"); firmaFicha = ""; return; }
    document.documentElement.classList.add("ficha-hoja"); // touch CSS: the card is a sheet over the dock
    const volver = !!extra?.puedeVolver?.();
    const toca = alTocarlo(o!, extra?.mundo ? logicaDeObjeto(o!, extra.mundo()).salen : []);
    const n = c.estado.seleccionados.length;
    const firma = JSON.stringify([o!.id, c.estado.modo, o!.fijado, o!.nombre, o!.tipo, volver, toca, n, idiomaActivo()]);
    if (firma === firmaFicha && !ficha.hidden) return; // nothing changed: no DOM work (the numbers follow mostrarDonde)
    firmaFicha = firma;
    const d = datosFicha(o!);
    fTitulo.textContent = d.titulo; fIcono.title = d.tipo;
    fSel.textContent = n > 1 ? tx(`${n} selected`, `${n} seleccionados`) : tx("Selected", "Seleccionado");
    for (const b of herrTarjeta) b.setAttribute("aria-pressed", String(b.dataset.modo === c.estado.modo));
    fAlTocar.textContent = toca; for (const e of rAlTocar) e.hidden = !toca;
    const fij = o!.fijado === true, t = fij ? tx("Release (P)", "Soltar (P)") : tx("Pin (P)", "Anclar (P)");
    bFijar.innerHTML = `${icono(fij ? "push-pin-slash" : "push-pin", 18)}<span class="et" aria-hidden="true">${fij ? ETIQUETAS_FICHA.soltar : ETIQUETAS_FICHA.anclar}</span>`;
    bFijar.title = t; bFijar.dataset.tip = t; bFijar.setAttribute("aria-label", t); bFijar.setAttribute("aria-pressed", String(fij));
    bVolver.hidden = !volver;
    ficha.hidden = false;
  }

  // ---- U10: a double click on a thing while playing opens Construir with it selected (the quick way in) ----
  lienzo.addEventListener("dblclick", (e) => {
    if (abierto() || !c.estado.puede) return;
    const k = ed.pick(e.clientX, e.clientY);
    if (!k) return;
    abrir(true); c.seleccionar(k);
    const o = c.objeto(k); decir(tx(`Selected: ${o ? nombreDe(o) : k}. Drag the coloured handles to move it; «Delete» removes it.`, `Seleccionado: ${o ? nombreDe(o) : k}. Arrastra las asas de colores para moverlo; «Borrar» lo quita.`));
  });

  // who may build can change (H3 will give roles); the nearest thing changes as you walk
  setInterval(() => { if (!c.estado.puede && abierto()) abrir(false); refrescar(); }, 500);
  refrescar(); // set the button's visibility and the library's warning right away (not after the first tick)
  // the language changed: re-set what is read once, drop the signatures that skip a redraw, and draw again
  alCambiarIdioma(() => {
    for (const f of alIdioma) f();
    botonEspacio.textContent = local ? tx("Local", "Local") : tx("World", "Mundo");
    firmaLogica = ""; firmaObj = ""; firmaFicha = ""; pintarBoton(abierto()); refrescar();
  });

  // C3: «Ir» in the map, when you may build and the builder is open, selects that object so its card opens by itself
  return {
    alIr: (donde) => { const sitio = seleccionarAlIr(c.estado.puede, abierto(), !!c.objeto(donde.id)); if (sitio) c.seleccionar(donde.id); return sitio; },
    // MIS-240: from the map's selection, «Editar»: open Construir on that object (selected, camera on it, its card showing)
    puedeEditar: (id) => c.estado.puede && !!c.objeto(id),
    editar: (id) => {
      const o = id ? c.objeto(id) : null;
      if (!c.estado.puede || !o) return false;
      if (!abierto()) abrir(true);
      abrirCajon(""); c.seleccionar(id);
      mirarObjeto(id);
      decir(tx(`Editing ${nombreDe(o)}: its card is on the right; move, rotate or scale.`, `Editando ${nombreDe(o)}: su tarjeta está a la derecha; mueve, gira o escala.`));
      return true;
    },
    irAObjeto: (id) => (c.estado.puede ? irAObjeto(id) : { ok: false, why: tx("you do not have permission to build here", "no tienes permiso para construir aquí") }),
    /** ux2-dock: where the other parts of the page put their controls — a drawer's body, the card's slot */
    cajon: (id) => cuerpos[id], ranuraFicha: ranura,
    abrirCajon: (id) => abrirCajon(id), cajonAbierto: () => cajon,
  };
}
