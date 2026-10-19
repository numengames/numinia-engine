// The builder (H1 + M22): a «Construir» button (C or Tab) for whoever may build; real HTML controls that screen readers
// and keyboards can use — since ux2-dock a row of icons (the dock: Añadir, Cable, Entorno, Precisión, Inspector, Ayuda |
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
import { datosFicha, enlaceDeObjeto, ETIQUETAS_FICHA, fichaVisible, logicaDeObjeto, seleccionarAlIr } from "./ficha-objeto.ts";
import type { PiezasMundo } from "./ficha-objeto.ts";
import { ACCIONES_DOCK, alTocarlo, alternarCajon, CAJONES, esArrastre, filtrarBiblioteca, iconoDePieza, queCierraEscape, tamanoUniforme } from "./cajones.ts";
import type { Cajon } from "./cajones.ts";

type Res = { ok: true } | { ok: false; why: string };
type Obj = Record<string, unknown> & { id: string };
type Herr = "coger" | "mover" | "girar" | "escalar";
type Punto = { x: number; y: number; z: number };
type Builder = {
  estado: { puede: boolean; seleccionado: string; seleccionados: string[]; ultimoRechazo: string; modo: string };
  biblioteca: { id: string; nombre: string; modelo: string }[];
  seleccion(): Obj | null;
  objeto(id: string): Obj | null;
  colocar(id: string): Res; colocarEn(id: string, p: Punto, ry?: number): Res;
  girar(grados: number): Res; subir(metros: number): Res; desplazar(dx: number, dz: number): Res; escalar(factor: number): Res;
  duplicar(): Res; borrar(): Res; fijar(): Res; nombrar(nombre: string, decorado?: boolean): Res; deshacer(): Res; rehacer(): Res;
  ajustar(c: { oculto?: boolean; volumen?: number; solido?: boolean; caja?: [number, number, number, number, number, number] | null; alcance?: "burbuja" | "zona" | "todos"; radio?: number; enlace?: string }): Res;
  seleccionar(id: string): Res; transformar(id: string, t: Partial<Donde>, lote?: string): Res; modo(m: string): Res;
  /** M22c: seleccionar varios (reemplaza), sumar/quitar uno (shift+clic), borrar por id con un lote (deshacer agrupado). */
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

const FANTASMA = "~fantasma";   // the library model following the pointer before it is placed (only on this page)
const ENVIO_MS = 125;           // a drag sends `mover` at most 8 times a second,
const VIVO_MS = 500;            // and again every half second while held still (the server keeps one undo step per drag)
const CLIC_PX = 6;              // a press that moves less than this is a click
const TAB_RATON_MS = 30_000;    // Tab opens build mode only if the mouse moved lately: keyboard users keep Tab
const PASOS_POS = [0, 0.1, 0.5, 1], PASOS_GIRO = [0, 5, 15, 45];
const HERRAMIENTAS: [Herr, string, string][] = [["coger", "Coger", "1"], ["mover", "Mover", "2 o G"], ["girar", "Girar", "3 o R"], ["escalar", "Escalar", "4"]];
/** Keys and mouse in build mode (also in docs/JUGADOR.md). */
export const AYUDA = [
  "C o Tab: abrir y cerrar construir (Tab solo si usas el ratón; con teclado, Tab sigue moviendo el foco).",
  "Clic izquierdo: seleccionar · clic en el suelo o Esc: nada seleccionado.",
  "1 coger: sigue al puntero sobre el suelo y otros objetos; rueda gira, Mayús + rueda escala; clic lo suelta; Esc lo devuelve.",
  "2 o G mover · 3 o R girar · 4 escalar: arrastra las asas X roja, Y verde, Z azul.",
  "X, Y o Z: solo ese eje (otra vez: todos) · T: ejes del objeto o del mundo.",
  "Con paso: 0,5 m, 15°, escala 0,1 (cámbialo abajo); Ctrl mantenido: libre.",
  "Mayús + D o Ctrl + D: duplicar y coger la copia · Supr o Retroceso: borrar · P: anclar o soltar (un objeto anclado no se puede mover, girar ni borrar hasta soltarlo).",
  "Mayús + clic: suma o quita del grupo seleccionado (varios a la vez); el gizmo los mueve juntos, Supr los borra juntos, Ctrl+Z los deshace juntos.",
  "Al mover un solo objeto con un eje elegido (X/Y/Z): si su cara queda a menos de 25 cm de otro objeto, encaja cara con cara.",
  "Ctrl + Z: deshacer · Ctrl + Mayús + Z o Ctrl + Y: rehacer · F: encuadrar.",
  "Arriba, una fila de iconos: Añadir, Cable, Entorno, Precisión, Inspector y Ayuda abren su cajón (uno a la vez; otra vez o Esc lo cierra); Deshacer, Rehacer y Salir.",
  "Añadir: pulsa una pieza para ponerla delante de ti, o arrástrala al mundo y suéltala donde la quieras (la rueda la gira). «Subir»: tu modelo .glb, imagen, vídeo o sonido, delante de ti; también puedes soltar el fichero sobre el mundo. La zona de sonido es una esfera: Escalar cambia su radio.",
  "Doble clic en un objeto mientras juegas: abre construir con él seleccionado. Con un objeto seleccionado sale su tarjeta (a la derecha): nombre, Mover, Girar y Escalar, posición, giro, tamaño, qué hace al tocarlo, Duplicar, Borrar, Anclar, Copiar enlace y Volver. Todos los campos y la lógica (qué cables, cerraduras y contadores lo tocan): el cajón Inspector.",
  "Con el dedo: toca un objeto para seleccionarlo y arrástralo para moverlo (sobre el suelo y sobre otros objetos). Un dedo en el vacío mueve la cámara; dos la acercan. Girar y escalar: el cajón Precisión.",
  "Botones derecho y central del ratón, y la rueda: la cámara (cuando llegue la cámara nueva).",
];

const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;
const redondear = (v: number, paso: number) => Number((Math.round(v / paso) * paso).toFixed(2));
const esEntrada = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
const nombreDe = (o: Obj) => String(o.nombre ?? "") || "(decorado)";
const fmt = (v: unknown) => String(Math.round(Number(v) * 100) / 100);
/** Backlog (PROGRESO-M22c.md): an empty library used to look like an editor bug. If it is empty AND the player has no
 * build role, say why (instead of a silent blank list); otherwise "" (an empty library for any other reason is not this). */
export const SIN_ROL_CONSTRUIR = "No tienes permiso para construir en este mundo (pide el rol a quien lo administra).";
export const avisoBiblioteca = (biblioteca: readonly unknown[], puede: boolean): string => (biblioteca.length === 0 && !puede ? SIN_ROL_CONSTRUIR : "");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

/** C3: what the page lends the card: the map's «Volver», and a way to ask for the object chosen with «Ir». */
/** C4: and the world's wires, locks and counters to read («Lógica»), and a way to bring the cable's list into view. */
/** ux2-dock: and «Subir» (soltar.ts' file picker) for the «Añadir» drawer. */
export type ExtraConstructor = { volver?(): boolean; puedeVolver?(): boolean; mundo?(): PiezasMundo; abrirCable?(): void; subir?(): void };
export type ConstructorUI = {
  alIr(donde: { id: string }): boolean;
  cajon(id: Cajon): HTMLElement; ranuraFicha: HTMLElement;
  abrirCajon(id: Cajon | ""): void; cajonAbierto(): Cajon | "";
};
export function montarConstructor(c: Builder, view: Vista, boton: HTMLButtonElement, panel: HTMLElement, extra?: ExtraConstructor): ConstructorUI {
  const ed = view.editor, lienzo = view.renderer.domElement;
  const cam = (): Cam | undefined => (view as Vista & { cam?: Cam }).cam;
  const abierto = () => !panel.hidden;

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
  const responder = (r: Res, bien = "Hecho.") => decir(r.ok ? bien : `No: ${r.why}`);
  const boton2 = (texto: string, titulo: string, fn: () => Res | void, iconoNombre?: string) => {
    const b = el("button", { type: "button", title: titulo });
    // iconoNombre is always a hardcoded literal from our own callers (never user input); same pattern as the
    // house-icon button above (U11). icono() only emits the fixed house-icon SVGs from iconos.ts.
    if (iconoNombre) { b.innerHTML = `${icono(iconoNombre, 18)} `; b.append(texto); } else b.textContent = texto;
    // after a mouse click the focus goes back to the page: Space (jump) must not press «Borrar» again
    b.addEventListener("click", (e) => { const r = fn(); if (r) responder(r); if (e.detail > 0) b.blur(); });
    return b;
  };
  const fila = (etiqueta: string, ...hijos: Node[]) => {
    const d = el("div", { className: "fila" }, ...hijos);
    if (etiqueta) { d.setAttribute("role", "toolbar"); d.setAttribute("aria-label", etiqueta); }
    return d;
  };
  const botonesHerr = HERRAMIENTAS.map(([m, t, k]) => { const b = boton2(t, `${t} (tecla ${k})`, () => elegirModo(m)); b.dataset.modo = m; return b; });
  const botonesEje = (["", "X", "Y", "Z"] as const).map((e) => { const b = boton2(e || "Todos", e ? `Solo el eje ${e} (tecla ${e}; otra vez: todos)` : "Todos los ejes", () => elegirEje(e || null)); b.dataset.eje = e; return b; });
  const botonEspacio = boton2("Mundo", "Ejes del mundo o del objeto (T)", () => cambiarEspacio());
  const opciones = (s: HTMLSelectElement, vals: number[], txt: (v: number) => string, def: number) => { for (const v of vals) s.append(el("option", { value: String(v), textContent: v ? txt(v) : "libre" })); s.value = String(def); return s; };
  const selPos = opciones(el("select"), PASOS_POS, (v) => `${String(v).replace(".", ",")} m`, 0.5);
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
    sx: campo("sx", "x", "0.1"), sy: campo("sy", "y", "0.1"), sz: campo("sz", "z", "0.1"), u: campo("u", "todas", "0.1"),
  };
  const nombre = el("input", { type: "text", maxLength: 60 });
  const decorado = el("input", { type: "checkbox" });
  const fijado = el("input", { type: "checkbox" });
  // U10: solid (people bump into it), visible while playing (spheres of sound) and volume (sound and video)
  const solido = el("input", { type: "checkbox" });
  const visible = el("input", { type: "checkbox" });
  const volumen = el("input", { type: "range", min: "0", max: "1", step: "0.05" });
  const lSolido = el("label", {}, solido, " sólido (las personas chocan con él)");
  const lVisible = el("label", {}, visible, " se ve al jugar (si no, solo al construir)");
  const lVolumen = el("label", {}, "Volumen ", volumen);
  // U11: who hears it, and the bubble's radius in metres (a sphere's scale; a video's own bubble)
  const alcance = el("select");
  for (const [v, t] of [["burbuja", "solo dentro de la burbuja"], ["zona", "toda la zona"], ["todos", "todo el mundo"]]) alcance.append(el("option", { value: v, textContent: t }));
  const radio = el("input", { type: "number", min: "0.5", max: "200", step: "0.5" });
  const lAlcance = el("label", {}, "Se oye en ", alcance);
  const lRadio = el("label", {}, "Radio de la burbuja (m) ", radio);
  // J4: the address a click opens, in a new tab, after confirming; "" = nothing to open
  const enlace = el("input", { type: "url", maxLength: 300, placeholder: "https://…" });
  const lEnlace = el("label", {}, "Enlace al hacer clic ", enlace);
  const grupo = (leyenda: string, ...hijos: Node[]) => el("fieldset", {}, el("legend", { textContent: leyenda }), ...hijos);
  const datos = el("div", { className: "inspector" },
    el("label", {}, "Nombre ", nombre), el("label", {}, decorado, " decorado (sin nombre a propósito)"),
    grupo("Posición (m)", campos.x.l, campos.y.l, campos.z.l),
    grupo("Giro (grados)", campos.rx.l, campos.ry.l, campos.rz.l),
    grupo("Escala", campos.sx.l, campos.sy.l, campos.sz.l, campos.u.l),
    el("label", {}, fijado, " anclado (nadie lo mueve, gira ni borra hasta que lo sueltes)"), lSolido, lVisible, lVolumen, lAlcance, lRadio, lEnlace);
  datos.setAttribute("aria-label", "Inspector del objeto seleccionado: Intro aplica");
  nombre.addEventListener("change", () => responder(c.nombrar(nombre.value.trim(), decorado.checked), "Nombre puesto."));
  decorado.addEventListener("change", () => responder(c.nombrar(decorado.checked ? "" : nombre.value.trim(), decorado.checked)));
  fijado.addEventListener("change", () => { const o = c.objeto(c.estado.seleccionado); if (o && !!o.fijado !== fijado.checked) responder(c.fijar(), fijado.checked ? "Anclado." : "Suelto."); });
  /** Solid on/off for the inspector's checkbox: the box is measured on this page; the server decides. */
  function cambiarSolido(cb: HTMLInputElement): void {
    const id = c.estado.seleccionado, caja = cb.checked && id ? ed.cajaPropia?.(id) ?? null : null;
    if (cb.checked && !caja) { cb.checked = false; return decir("Espera a que se vea el modelo y vuelve a marcarlo."); }
    responder(c.ajustar({ solido: cb.checked, caja }), cb.checked ? "Sólido: ya no se puede atravesar." : "Ya se puede atravesar.");
  }
  solido.addEventListener("change", () => cambiarSolido(solido));
  visible.addEventListener("change", () => responder(c.ajustar({ oculto: !visible.checked }), visible.checked ? "Se verá al jugar." : "Invisible al jugar (la ves mientras construyes)."));
  volumen.addEventListener("change", () => responder(c.ajustar({ volumen: volumen.valueAsNumber }), `Volumen ${Math.round(volumen.valueAsNumber * 100)} %.`));
  alcance.addEventListener("change", () => {
    const a = alcance.value as "burbuja" | "zona" | "todos";
    responder(c.ajustar({ alcance: a }), a === "burbuja" ? "Se oye solo dentro de la burbuja." : a === "zona" ? "Lo oye toda la zona, al mismo volumen." : "Lo oye todo el mundo, al mismo volumen.");
  });
  radio.addEventListener("change", () => {
    const id = c.estado.seleccionado, o = c.objeto(id), r = radio.valueAsNumber;
    if (!o || !Number.isFinite(r)) return decir("Eso no es un número.");
    const m = Math.max(0.5, Math.min(o.tipo === "sonido" ? 50 : 200, r));
    responder(o.tipo === "sonido" ? c.transformar(id, { sx: m, sy: m, sz: m }) : c.ajustar({ radio: m }), `Radio de la burbuja: ${m} m.`);
  });
  enlace.addEventListener("change", () => responder(c.ajustar({ enlace: enlace.value.trim() }), enlace.value.trim() ? "Enlace puesto: un clic en el objeto lo abrirá." : "Enlace quitado."));
  // C4 «Lógica» (was a tab of the card): what wires touch the object, read from the state the cable, the locks and the
  // counters already keep — no new network path — and the way into the cable's drawer
  const lEntran = el("ul"), lSalen = el("ul"), lPiezas = el("ul");
  const bAbrirCable = boton2("Abrir el cable", "Abrir el cajón del cable (disparadores y receptores del mundo)", () => { abrirCajon("cable"); extra?.abrirCable?.(); decir("Cable a la vista: ahí se editan los receptores."); }, "lightning");
  const logica = el("section", { className: "logica" }, el("h3", { textContent: "Lógica" }),
    el("h4", { textContent: "Entran (disparadores que lo muestran u ocultan)" }), lEntran,
    el("h4", { textContent: "Salen (disparadores que nacen aquí)" }), lSalen,
    el("h4", { textContent: "Piezas en este punto" }), lPiezas, bAbrirCable);
  logica.setAttribute("aria-label", "Lógica del objeto seleccionado");
  logica.hidden = !extra?.mundo;
  let firmaLogica = "";

  // ---- the dock: one icon per drawer, then undo / redo, then leave. Each icon: tooltip + aria-label (+ its key) ----
  const dock = el("div", { id: "dock-construir" });
  dock.setAttribute("role", "toolbar"); dock.setAttribute("aria-label", "Construir");
  const botonDock = (ic: string, titulo: string, fn: () => Res | void) => {
    const b = el("button", { type: "button", title: titulo, className: "ic" });
    b.innerHTML = icono(ic, 20); b.setAttribute("aria-label", titulo); b.dataset.tip = titulo;
    b.addEventListener("click", (e) => { const r = fn(); if (r) responder(r); if (e.detail > 0) b.blur(); });
    return b;
  };
  const PISTA: Record<Cajon, string> = { anadir: "arrastra al mundo o pulsa para ponerlo delante", cable: "lo que hace cada botón o zona", entorno: "para todos los que están aquí", precision: "para lo que tengas elegido", inspector: "todos los campos del objeto elegido", ayuda: "teclas y ratón" };
  const secciones = {} as Record<Cajon, HTMLElement>, cuerpos = {} as Record<Cajon, HTMLElement>, botonesCajon = {} as Record<Cajon, HTMLButtonElement>;
  for (const [id, ic, titulo, tip] of CAJONES) {
    const b = botonDock(ic, tip, () => abrirCajon(alternarCajon(cajon, id)));
    b.id = `dock-${id}`; b.dataset.cajon = id; b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", `cajon-${id}`);
    botonesCajon[id] = b;
    const h = el("h2", { id: `cajon-${id}-titulo`, textContent: titulo });
    const cerrar = botonDock("x", "Cerrar (Esc)", () => abrirCajon("")); cerrar.classList.add("cerrar");
    const cuerpo = el("div", { className: "cuerpo" });
    const s = el("section", { id: `cajon-${id}`, className: "cajon" }, el("div", { className: "cab" }, h, el("span", { className: "pista", textContent: PISTA[id] }), cerrar), cuerpo);
    s.setAttribute("aria-labelledby", h.id); s.hidden = true;
    secciones[id] = s; cuerpos[id] = cuerpo;
  }
  const sepDock = () => { const d = el("span", { className: "sep" }); d.setAttribute("aria-hidden", "true"); return d; };
  const dDeshacer = botonDock(ACCIONES_DOCK.deshacer[0], ACCIONES_DOCK.deshacer[1], () => c.deshacer()); dDeshacer.id = "dock-deshacer";
  const dRehacer = botonDock(ACCIONES_DOCK.rehacer[0], ACCIONES_DOCK.rehacer[1], () => c.rehacer()); dRehacer.id = "dock-rehacer";
  const dSalir = botonDock(ACCIONES_DOCK.salir[0], ACCIONES_DOCK.salir[1], () => abrir(false)); dSalir.id = "dock-salir";
  dock.append(...CAJONES.map(([id]) => botonesCajon[id]), sepDock(), dDeshacer, dRehacer, sepDock(), dSalir);

  // «Añadir»: ONE library (search + grid) and «Subir» (soltar.ts' picker). A press on a piece puts it 3 m in front of you;
  // dragging it out of the drawer makes it follow the pointer over the world, and letting go there places it.
  const buscar = el("input", { type: "search", id: "buscar-biblioteca", placeholder: "Buscar en la biblioteca", autocomplete: "off" });
  buscar.setAttribute("aria-label", "Buscar en la biblioteca");
  const cajaBuscar = el("label", { className: "buscar" }); cajaBuscar.innerHTML = icono("magnifying-glass", 18); cajaBuscar.append(buscar);
  const bSubir = el("button", { type: "button", id: "subir", className: "subir", title: "Subir un fichero tuyo: modelo .glb, imagen .png .jpg .webp, vídeo .mp4 .webm o sonido .mp3 .ogg. Se pone delante de ti; también puedes soltarlo sobre el mundo." });
  bSubir.innerHTML = `${icono("upload-simple", 18)}<span>Subir</span>`;
  bSubir.addEventListener("click", (e) => { extra?.subir?.(); if (e.detail > 0) bSubir.blur(); });
  bSubir.hidden = !extra?.subir;
  const rejilla = el("div", { className: "rejilla" }); rejilla.setAttribute("role", "group"); rejilla.setAttribute("aria-label", "Biblioteca");
  let arrastre: { m: { id: string; nombre: string; modelo: string }; x0: number; y0: number; pid: number; activo: boolean } | null = null, sinClic = false;
  const piezas = c.biblioteca.map((m) => {
    const b = el("button", { type: "button", className: "pieza", title: `${m.nombre}: pulsa para ponerlo delante de ti, o arrástralo al mundo` });
    b.innerHTML = icono(iconoDePieza(m.id), 28); b.append(el("span", { textContent: m.nombre })); b.dataset.pieza = m.id;
    b.addEventListener("pointerdown", (e) => { if (e.button === 0) arrastre = { m, x0: e.clientX, y0: e.clientY, pid: e.pointerId, activo: false }; });
    b.addEventListener("click", (e) => {
      if (sinClic) { sinClic = false; return; } // the end of a drag, not a press
      responder(c.colocar(m.id), `${m.nombre}: delante de ti.`);
      if (e.detail > 0) b.blur();
    });
    return b;
  });
  rejilla.append(...piezas);
  const sinResultado = el("p", { className: "vacio", textContent: "Ninguna pieza se llama así." }); sinResultado.hidden = true;
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
    else { quitarFantasma(); decir("Suéltalo sobre el mundo para colocarlo."); }
  };
  addEventListener("pointerup", finArrastre, { capture: true });
  addEventListener("pointercancel", finArrastre, { capture: true });
  cuerpos.anadir.append(avisoLib, el("div", { className: "fila buscar-fila" }, cajaBuscar, bSubir), rejilla, sinResultado);

  // «Precisión»: the tools, the axes, the snap steps and the step buttons (touch screens turn and scale here)
  cuerpos.precision.append(
    el("h3", { textContent: "Herramienta" }), fila("Herramienta", ...botonesHerr),
    el("h3", { textContent: "Ejes" }), fila("Ejes", ...botonesEje, botonEspacio),
    el("h3", { textContent: "Pasos al arrastrar" }), fila("", el("label", {}, "Paso ", selPos), el("label", {}, "Giro ", selGiro)),
    el("h3", { textContent: "Con botones" }),
    fila("Girar", boton2("⟲ 15°", "Girar a la izquierda", () => c.girar(15)), boton2("⟳ 15°", "Girar a la derecha", () => c.girar(-15)),
      boton2("Encuadrar", "Mirar lo seleccionado (F)", () => encuadrar(), "crosshair")),
    fila("Desplazar", boton2("← 1 m", "Mover a la izquierda", () => c.desplazar(-1, 0)), boton2("→ 1 m", "Mover a la derecha", () => c.desplazar(1, 0)),
      boton2("↑ 1 m", "Mover hacia el fondo", () => c.desplazar(0, -1)), boton2("↓ 1 m", "Mover hacia ti", () => c.desplazar(0, 1))),
    fila("Altura y tamaño", boton2("Subir", "Subir medio metro", () => c.subir(0.5)), boton2("Bajar", "Bajar medio metro", () => c.subir(-0.5)),
      boton2("Más grande", "Agrandar un 25 %", () => c.escalar(1.25)), boton2("Más pequeño", "Reducir un 20 %", () => c.escalar(0.8))));
  cuerpos.inspector.append(sel, datos, logica);
  cuerpos.ayuda.append(el("ul", {}, ...AYUDA.map((t) => el("li", { textContent: t }))));
  panel.append(dock, ...CAJONES.map(([id]) => secciones[id]), estado);
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
    for (const [k] of CAJONES) { secciones[k].hidden = k !== id; botonesCajon[k].setAttribute("aria-expanded", String(k === id)); }
    document.documentElement.classList.toggle("cajon-abierto", !!id);
    firmaLogica = "";
    refrescar();
  }

  // ---- the hands' state ----
  let agarre: { key: string; antes: Donde } | null = null;
  let fantasma: { id: string; nombre: string; modelo: string; p: Punto | null; ry: number } | null = null;
  let puntero: { x: number; y: number } | null = null;
  let ctrl = false, eje: Eje | null = null, local = false, trasDuplicar = false;
  let abajo: { x: number; y: number; gizmo: boolean } | null = null, arrastrado = false, ultimoRaton = -Infinity;
  // M22b-1: coarse pointer (a phone) → «mover» has no handles, the thing is the handle. Starts from the media query and
  // turns on at the first touch (a laptop with a touch screen reports a fine pointer)
  let tactil = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const pasoPos = () => (ctrl ? 0 : Number(selPos.value));
  const pasoGiro = () => (ctrl ? 0 : Number(selGiro.value));

  // ---- sending: at most 8 moves a second while dragging, a heartbeat while held still, a final one on release ----
  let envio: { key: string; ultimo: number; pendiente: boolean; enviados: number; reloj: ReturnType<typeof setInterval> } | null = null;
  let loteGrupo = ""; // M22c: non-"" while dragging a multi-selection, so every send of this drag shares one undo step
  const enviarYa = (): Donde | null => {
    if (!envio) return null;
    const d = ed.dondeEsta(envio.key);
    if (d) { const r = c.transformar(envio.key, d, loteGrupo); if (!r.ok) decir(`No: ${r.why}`); }
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
        const o0 = grupoInicio.get(key)!, dx = d.x - o0.x, dy = d.y - o0.y, dz = d.z - o0.z;
        for (const [id, oi] of grupoInicio) if (id !== key) ed.poner(id, { x: oi.x + dx, y: oi.y + dy, z: oi.z + dz });
      }
    } else {
      terminarEnvio(); cam()?.bloquear?.(false);
      if (grupoInicio) {
        for (const [id] of grupoInicio) if (id !== key) { const d2 = ed.dondeEsta(id); if (d2) c.transformar(id, { x: d2.x, y: d2.y, z: d2.z }, loteGrupo); }
        decir(`${grupoInicio.size} objetos movidos juntos (Ctrl+Z los devuelve a la vez).`);
      } else decir(`${nombreDe(c.objeto(key) ?? { id: key })}: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)} · giro ${fmt(d.ry)}°.`);
      grupoInicio = null; loteGrupo = "";
      refrescar();
    }
  });

  // ---- grab mode (coger): the thing follows the point under the pointer ----
  function empezarAgarre(key: string): void {
    const o = c.objeto(key), antes = ed.dondeEsta(key);
    if (!o || !antes) return;
    if (o.fijado) return decir("Está anclado: suéltalo (P) antes de cogerlo.");
    if (agarre) soltarAgarre(false);
    agarre = { key, antes };
    ed.sostener(key);
    cam()?.bloquear?.(true);
    decir(`Cogido ${nombreDe(o)}: muévelo con el ratón · rueda: girar · Mayús + rueda: escalar · clic: soltar · Esc: devolver.`);
    if (puntero) seguir(puntero.x, puntero.y);
  }
  function soltarAgarre(deseleccionar: boolean): void {
    if (!agarre) return;
    agarre = null;
    const final = terminarEnvio();
    ed.sostener(null, final ?? undefined);
    cam()?.bloquear?.(false);
    if (deseleccionar) c.seleccionar("");
    decir("Soltado.");
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
    decir("Devuelto a donde estaba.");
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
    if (fantasma) return decir("Se coloca a escala 1: escálalo después (4, o Mayús + rueda al cogerlo).");
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
    decir(`${m.nombre}: suéltalo donde lo quieras (rueda: girar · Esc: cancelar).`);
    if (puntero) seguir(puntero.x, puntero.y);
  }
  function soltarFantasma(x: number, y: number): void {
    if (!fantasma) return;
    seguir(x, y);
    const f = fantasma;
    quitarFantasma();
    if (!f.p) return decir("Apunta al suelo o a otro objeto para colocarlo.");
    responder(c.colocarEn(f.id, f.p, f.ry), `Colocado: ${f.nombre}.`);
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
    if (abierto()) decir(m === "coger" ? "Coger: haz clic en un objeto y llévalo; otro clic lo suelta." : h ? (tactil && h === "mover" ? "Mover: arrastra el objeto con el dedo." : `${h[0].toUpperCase()}${h.slice(1)}: arrastra una asa (X roja, Y verde, Z azul).`) : tactil ? "Toca un objeto para seleccionarlo." : "Haz clic en un objeto para seleccionarlo.");
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
    decir(e ? `Solo el eje ${e} (pulsa ${e} otra vez para todos).` : "Todos los ejes.");
    refrescar();
  }
  function cambiarEspacio(): void {
    local = !local; ed.espacio(local);
    decir(local ? "Ejes del objeto (local)." : "Ejes del mundo.");
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
    if (!d) return { ok: false, why: "selecciona algo antes (clic)" };
    const camara = cam();
    if (!camara?.frame) return { ok: false, why: "encuadrar llega con la cámara nueva" };
    camara.frame({ x: d.x, y: d.y + d.sy / 2, z: d.z }, Math.max(1, d.sx, d.sy, d.sz) * 1.5);
    return { ok: true };
  }
  /** Escape undoes the most transient thing first: the piece following the pointer, grab mode, the open drawer, the selection. */
  function escape(): void {
    switch (queCierraEscape({ fantasma: !!fantasma, agarre: !!agarre, cajon, seleccion: c.estado.seleccionado })) {
      case "fantasma": quitarFantasma(); return decir("Cancelado.");
      case "agarre": return cancelarAgarre();
      case "cajon": return abrirCajon("");
      default: c.seleccionar(""); decir("Nada seleccionado.");
    }
  }
  /** M22c: borrar lo seleccionado; si hay varios, un `lote` compartido los junta en un solo paso de deshacer. */
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
    if (!id) return decir("Selecciona algo antes (clic).");
    if (!Number.isFinite(v)) return decir("Eso no es un número.");
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
    for (const b of botonesHerr) b.setAttribute("aria-pressed", String(b.dataset.modo === c.estado.modo));
    for (const b of botonesEje) b.setAttribute("aria-pressed", String((b.dataset.eje || null) === eje));
    botonEspacio.textContent = local ? "Local" : "Mundo";
    botonEspacio.setAttribute("aria-pressed", String(local));
    const o = c.objeto(c.estado.seleccionado), cerca = o ? null : c.seleccion();
    const grupo = c.estado.seleccionados.length > 1 ? ` · ${c.estado.seleccionados.length} seleccionados (Supr los borra juntos, el gizmo los mueve juntos)` : "";
    sel.textContent = o ? `Seleccionado: ${nombreDe(o)} · ${o.id}${o.fijado ? " · anclado" : ""}${grupo}`
      : cerca ? `Nada seleccionado; los botones usan lo más cercano: ${nombreDe(cerca)} · ${cerca.id}` : "Nada seleccionado: haz clic en un objeto.";
    pintarLogica(o);
    for (const f of datos.querySelectorAll("fieldset")) f.disabled = !o;
    nombre.disabled = decorado.disabled = fijado.disabled = !o;
    const tipo = String(o?.tipo ?? "modelo");
    const suena = tipo === "sonido" || tipo === "video";
    lSolido.hidden = !o || tipo === "sonido"; lVisible.hidden = !o; // «se ve al jugar» for every object (it was the card's Ajustes tab) lVolumen.hidden = lAlcance.hidden = !o || !suena;
    lRadio.hidden = !o || !suena || (o.alcance ?? "burbuja") !== "burbuja";
    lEnlace.hidden = !o;
    if (!o) return;
    solido.checked = o.solido === true; visible.checked = o.oculto !== true;
    if (document.activeElement !== volumen) volumen.value = String(o.volumen ?? 1);
    if (document.activeElement !== alcance) alcance.value = String(o.alcance ?? "burbuja");
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
    lista(lEntran, lg.entran, o ? "Ningún disparador lo muestra ni lo oculta." : "Elige un objeto.");
    lista(lSalen, lg.salen, o ? "Ningún disparador nace aquí." : "—");
    lista(lPiezas, lg.piezas, o ? "Sin cerraduras ni contadores aquí." : "—");
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
      if (c.estado.ultimoRechazo && c.estado.ultimoRechazo !== rechazosVistos) decir(`No: ${c.estado.ultimoRechazo}`);
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
      void ed.cargar();
      if (!c.estado.modo) c.modo("mover");
      cam()?.modo?.("construir");
      ed.seleccionar(c.estado.seleccionado || null);
      aplicarPaso();
      aplicarModo();
      decir(tactil ? "Construir: toca un objeto para elegirlo, o «Añadir» (+) para poner uno." : "Construir: haz clic en un objeto para elegirlo, o «Añadir» (+) para poner uno.");
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
    const t = si ? "Cerrar construir (C)" : "Construir (C)";
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
  const tabAbre = (e: KeyboardEvent) => !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && performance.now() - ultimoRaton < TAB_RATON_MS
    && (e.target === document.body || e.target === document.documentElement || e.target === lienzo);
  addEventListener("keydown", (e) => {
    if (e.code === "ControlLeft" || e.code === "ControlRight") { if (!ctrl) { ctrl = true; aplicarPaso(); } return; }
    if (esEntrada(e.target) || !c.estado.puede) return;
    if ((e.code === "KeyC" && !e.ctrlKey && !e.metaKey && !e.altKey) || (e.code === "Tab" && tabAbre(e))) {
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
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") ultimoRaton = performance.now(); }, { passive: true });
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
    if (e.shiftKey && k) { // M22c: Mayús+clic suma/quita del grupo seleccionado, sin tocar el modo coger
      c.alternarSeleccion(k);
      decir(`${c.estado.seleccionados.length} seleccionados.`);
      return;
    }
    c.seleccionar(k ?? "");
    if (k && c.estado.modo === "coger") empezarAgarre(k);
    else if (k) { const o = c.objeto(k); decir(`Seleccionado: ${o ? nombreDe(o) : k}.`); }
    else decir("Nada seleccionado.");
  });
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
    if (dedo) { if (e.pointerId !== dedo.id) e.stopPropagation(); return; }
    if (!tactil) { tactil = true; aplicarGizmo(); }
    if (!e.isPrimary || agarre || fantasma) return; // grab mode and the library preview keep today's path (tap = drop)
    const key = ed.pick(e.clientX, e.clientY), antes = key ? ed.dondeEsta(key) : null;
    if (!key || !antes) return;
    e.stopPropagation();
    dedo = { id: e.pointerId, key, x0: e.clientX, y0: e.clientY, antes, desfase: null, movido: false };
    try { lienzo.setPointerCapture(e.pointerId); } catch { /* not capturable: window events still arrive */ }
    cam()?.bloquear?.(true);
    c.seleccionar(key);
    ed.despertar();
  }, { capture: true });
  addEventListener("pointermove", (e) => {
    if (!dedo || e.pointerId !== dedo.id) return;
    e.stopPropagation();
    if (!dedo.movido) {
      if (Math.hypot(e.clientX - dedo.x0, e.clientY - dedo.y0) <= CLIC_PX) return;
      const o = c.objeto(dedo.key);
      if (!o) return;
      if (o.fijado) return decir("Está anclado: suéltalo («Anclar / soltar») antes de moverlo.");
      const p0 = ed.puntoBajo(dedo.x0, dedo.y0, dedo.key); // the ground (or thing) behind the first touch: the drag is measured there
      if (!p0) return;
      dedo.desfase = { x: dedo.antes.x - p0.x, z: dedo.antes.z - p0.z };
      dedo.movido = true;
      ed.sostener(dedo.key);
      decir(`Cogido ${nombreDe(o)}: arrástralo y suelta para posarlo.`);
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
      decir(d ? `${nombreDe(o ?? { id: fue.key })} posado: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)}.` : "Posado.");
      refrescar();
    } else decir(`Seleccionado: ${o ? nombreDe(o) : fue.key}. Arrástralo para moverlo; los iconos de la ficha giran, duplican y borran.`);
  };
  addEventListener("pointerup", finDedo, { capture: true });
  addEventListener("pointercancel", finDedo, { capture: true });

  // ---- the object card (C3; ux2-dock: the maqueta's card on the right): the basics of what is selected — its name, the
  // three handles with their real keys, position, turn, size, what touching it does, Duplicar and Borrar (+ anchor, link,
  // back). Every other field is the Inspector drawer's. It shows only for someone who may build here AND with the builder
  // open (fichaVisible); the server still decides every action. Refreshed on events, never per frame. ----
  const ficha = el("aside", { id: "ficha-objeto" });
  ficha.setAttribute("aria-label", "Tarjeta del objeto seleccionado");
  // icon-only button: title + aria-label + data-tip (the tip also shows on keyboard focus); a short label for touch screens
  const bIcono = (ic: string, titulo: string, corta: string, fn: () => Res | void, clase = "") => {
    const b = boton2("", titulo, fn);
    b.innerHTML = `${icono(ic, 18)}<span class="et" aria-hidden="true">${corta}</span>`; b.setAttribute("aria-label", titulo); b.dataset.tip = titulo; b.className = `ic ${clase}`.trim();
    return b;
  };
  const fIcono = el("span", { className: "ico" }); fIcono.innerHTML = icono("package", 20);
  const fTitulo = el("h3");
  const bCerrar = bIcono("x", "Cerrar la tarjeta (Esc)", ETIQUETAS_FICHA.cerrar, () => { c.seleccionar(""); }, "cerrar");
  const fSel = el("span", { textContent: "Seleccionado" });
  const herrTarjeta = ([["mover", "G", "mover", "Mover (2 o G)"], ["girar", "R", "girar", "Girar (3 o R)"], ["escalar", "4", "escala", "Escalar (4)"]] as const).map(([m, k, t, tit]) => {
    const b = boton2("", tit, () => elegirModo(m));
    b.className = "chip"; b.dataset.modo = m; b.setAttribute("aria-label", tit); b.dataset.tip = tit;
    b.innerHTML = `<kbd>${k}</kbd> ${t}`; // fixed literals (never user input)
    return b;
  });
  const sub = el("p", { className: "sub" }, fSel, ...herrTarjeta.flatMap((b) => [" · ", b]));
  const campoT = (k: string, paso: string, etiqueta: string) => { const i = el("input", { type: "number", step: paso }); i.dataset.k = k; i.setAttribute("aria-label", etiqueta); i.addEventListener("change", () => aplicarCampo(i)); return i; };
  const tc = { x: campoT("x", "0.1", "Posición x"), y: campoT("y", "0.1", "Posición y"), z: campoT("z", "0.1", "Posición z"), ry: campoT("ry", "1", "Giro en grados"), u: campoT("u", "0.1", "Tamaño") };
  tc.u.placeholder = "varía"; tc.u.min = "0.05";
  const fAlTocar = el("span", { className: "campo texto" });
  const rAlTocar = [el("dt", { textContent: "Al tocarlo" }), el("dd", {}, fAlTocar)];
  const kv = el("dl", { className: "kv" },
    el("dt", { textContent: "Posición" }), el("dd", { className: "tres" }, tc.x, tc.y, tc.z),
    el("dt", { textContent: "Giro" }), el("dd", { className: "unidad" }, tc.ry, el("span", { textContent: "°" })),
    el("dt", { textContent: "Tamaño" }), el("dd", {}, tc.u), ...rAlTocar);
  const ranura = el("div", { className: "ranura" }); // huecos.ts puts «Hacer hueco / Poner obra / Vaciar» here for a picture
  const bDuplicar = boton2("Duplicar", "Hacer una copia y cogerla (Mayús+D o Ctrl+D)", () => duplicar(), "copy");
  const bBorrar = boton2("Borrar", "Quitarlo del mundo; con varios elegidos, los borra juntos (Supr; Ctrl+Z lo devuelve)", () => borrarSeleccion(), "trash");
  bBorrar.classList.add("peligro");
  const bFijar = bIcono("push-pin", "Anclar (P)", ETIQUETAS_FICHA.anclar, () => c.fijar());
  const bCopiarEnlace = bIcono("link", "Copiar enlace a este sitio", ETIQUETAS_FICHA.enlace, () => copiarEnlace());
  const bVolver = bIcono("arrow-u-up-left", "Volver a donde estabas", ETIQUETAS_FICHA.volver, () => (extra?.volver?.() ? { ok: true } : { ok: false, why: "no hay a dónde volver" }));
  const acciones = el("div", { className: "acciones" }, bDuplicar, bBorrar, el("span", { className: "hueco-flex" }), bFijar, bCopiarEnlace, bVolver);
  acciones.setAttribute("role", "toolbar"); acciones.setAttribute("aria-label", "Acciones del objeto seleccionado");
  ficha.append(el("div", { className: "cab" }, fIcono, fTitulo, bCerrar), sub, kv, ranura, acciones);
  ficha.addEventListener("keydown", (e) => { // typing in the card stays in the card; Esc leaves it like the builder's Esc
    if (!esEntrada(e.target)) return;
    e.stopPropagation();
    if (e.key === "Escape") { (e.target as HTMLElement).blur(); c.seleccionar(""); decir("Nada seleccionado."); }
  });
  ficha.hidden = true;
  document.body.append(ficha);
  ficha.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch, not a click on the world
  function copiarEnlace(): Res {
    const o = c.objeto(c.estado.seleccionado), url = o ? enlaceDeObjeto(location, o) : null;
    if (!url) return { ok: false, why: "selecciona algo antes (clic)" };
    navigator.clipboard?.writeText(url).then(() => decir("Enlace copiado."), () => decir(`Copia el enlace: ${url}`));
    if (!navigator.clipboard) decir(`Copia el enlace: ${url}`);
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
    const firma = JSON.stringify([o!.id, c.estado.modo, o!.fijado, o!.nombre, o!.tipo, volver, toca, n]);
    if (firma === firmaFicha && !ficha.hidden) return; // nothing changed: no DOM work (the numbers follow mostrarDonde)
    firmaFicha = firma;
    const d = datosFicha(o!);
    fTitulo.textContent = d.titulo; fIcono.title = d.tipo;
    fSel.textContent = n > 1 ? `${n} seleccionados` : "Seleccionado";
    for (const b of herrTarjeta) b.setAttribute("aria-pressed", String(b.dataset.modo === c.estado.modo));
    fAlTocar.textContent = toca; for (const e of rAlTocar) e.hidden = !toca;
    const fij = o!.fijado === true, t = fij ? "Soltar (P)" : "Anclar (P)";
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
    const o = c.objeto(k); decir(`Seleccionado: ${o ? nombreDe(o) : k}. Arrastra las asas de colores para moverlo; «Borrar» lo quita.`);
  });

  // who may build can change (H3 will give roles); the nearest thing changes as you walk
  setInterval(() => { if (!c.estado.puede && abierto()) abrir(false); refrescar(); }, 500);
  refrescar(); // set the button's visibility and the library's warning right away (not after the first tick)

  // C3: «Ir» in the map, when you may build and the builder is open, selects that object so its card opens by itself
  return {
    alIr: (donde) => { const sitio = seleccionarAlIr(c.estado.puede, abierto(), !!c.objeto(donde.id)); if (sitio) c.seleccionar(donde.id); return sitio; },
    /** ux2-dock: where the other parts of the page put their controls — a drawer's body, the card's slot */
    cajon: (id) => cuerpos[id], ranuraFicha: ranura,
    abrirCajon: (id) => abrirCajon(id), cajonAbierto: () => cajon,
  };
}
