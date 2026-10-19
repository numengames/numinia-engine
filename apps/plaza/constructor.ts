// The builder (H1 + M22): a «Construir» button (C or Tab) for whoever may build; a panel of real HTML controls that
// screen readers and keyboards can use (tools, library, inspector, snap, help, status); and the hands in the 3D view
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
import { datosFicha, enlaceDeObjeto, fichaVisible, logicaDeObjeto, PESTANAS, pestanaConTecla, seleccionarAlIr } from "./ficha-objeto.ts";
import type { Pestana, PiezasMundo } from "./ficha-objeto.ts";

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
  "Ctrl + Z: deshacer · Ctrl + Mayús + Z o Ctrl + Y: rehacer · F: encuadrar · N: inspector.",
  "Biblioteca: el modelo sigue al puntero y un clic lo coloca; «Delante de ti» lo coloca sin ratón.",
  "Doble clic en un objeto mientras juegas: abre construir con él seleccionado. Con un objeto seleccionado sale su ficha (abajo) con iconos: Mover, Girar, Escalar, Duplicar, Anclar o Soltar, Copiar enlace, Borrar, Volver y Cerrar. La ficha tiene pestañas (flechas izquierda y derecha): Ficha, Lógica (qué cables, cerraduras y contadores tocan el objeto) y Ajustes (nombre, se ve al jugar, anclado, sólido).",
  "Imagen, Pantalla de vídeo y Zona de sonido (abajo): suben tu fichero y lo ponen delante de ti. La zona de sonido es una esfera: Escalar cambia su radio.",
  "Con el dedo: toca un objeto para seleccionarlo y arrástralo para moverlo (sobre el suelo y sobre otros objetos). Un dedo en el vacío mueve la cámara; dos la acercan. Girar y escalar: los iconos de la ficha y «Pasos con botones».",
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
/** C4: and the world's wires, locks and counters to read (the «Lógica» tab), and a way to bring the cable panel into view. */
export type ExtraConstructor = { volver?(): boolean; puedeVolver?(): boolean; mundo?(): PiezasMundo; abrirCable?(): void };
export function montarConstructor(c: Builder, view: Vista, boton: HTMLButtonElement, panel: HTMLElement, extra?: ExtraConstructor): { alIr(donde: { id: string }): boolean } {
  estilo();
  const ed = view.editor, lienzo = view.renderer.domElement;
  const cam = (): Cam | undefined => (view as Vista & { cam?: Cam }).cam;
  const abierto = () => !panel.hidden;

  // ---- the panel: real buttons, selects and inputs (screen readers and keyboards) ----
  const estado = el("p", { className: "estado" });
  estado.setAttribute("role", "status");
  const decir = (t: string) => { estado.textContent = t; };
  // Backlog M22c: an empty library with no build role looked like an editor bug; say why instead.
  const avisoLib = el("p", { className: "aviso-biblioteca" });
  avisoLib.setAttribute("role", "status");
  avisoLib.hidden = true;
  const responder = (r: Res, bien = "Hecho.") => decir(r.ok ? bien : `No: ${r.why}`);
  const boton2 = (texto: string, titulo: string, fn: () => Res | void, iconoNombre?: string) => {
    const b = el("button", { type: "button", title: titulo });
    // iconoNombre is always a hardcoded literal from our own callers (never user input); same pattern as the
    // house-icon button above (U11). icono() only emits the fixed house-icon SVGs from iconos.ts.
    if (iconoNombre) { b.innerHTML = `${icono(iconoNombre)} `; b.append(texto); } else b.textContent = texto;
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
  const botonesEje = (["", "X", "Y", "Z"] as const).map((e) => { const b = boton2(e || "Ejes: todos", e ? `Solo el eje ${e} (tecla ${e}; otra vez: todos)` : "Todos los ejes", () => elegirEje(e || null)); b.dataset.eje = e; return b; });
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
  const sel = el("p");
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
  const datos = el("div", {},
    el("label", {}, "Nombre ", nombre), el("label", {}, decorado, " decorado (sin nombre a propósito)"),
    grupo("Posición (m)", campos.x.l, campos.y.l, campos.z.l),
    grupo("Giro (grados)", campos.rx.l, campos.ry.l, campos.rz.l),
    grupo("Escala", campos.sx.l, campos.sy.l, campos.sz.l, campos.u.l),
    el("label", {}, fijado, " anclado (nadie lo mueve, gira ni borra hasta que lo sueltes)"), lSolido, lVisible, lVolumen, lAlcance, lRadio, lEnlace);
  const inspector = el("section", { className: "inspector" }, el("h3", { textContent: "Inspector (N)" }), datos);
  inspector.setAttribute("aria-label", "Inspector del objeto seleccionado: Intro aplica");
  nombre.addEventListener("change", () => responder(c.nombrar(nombre.value.trim(), decorado.checked), "Nombre puesto."));
  decorado.addEventListener("change", () => responder(c.nombrar(decorado.checked ? "" : nombre.value.trim(), decorado.checked)));
  fijado.addEventListener("change", () => { const o = c.objeto(c.estado.seleccionado); if (o && !!o.fijado !== fijado.checked) responder(c.fijar(), fijado.checked ? "Anclado." : "Suelto."); });
  /** Solid on/off for the inspector's checkbox and the card's (C4): same verb, same box measure; the server decides. */
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

  panel.append(
    el("h2", { textContent: "Construir" }),
    fila("Herramienta", ...botonesHerr),
    fila("Ejes", ...botonesEje, botonEspacio),
    fila("", el("label", {}, "Paso ", selPos), el("label", {}, "Giro ", selGiro)),
    avisoLib,
    el("p", { textContent: "Biblioteca (sigue al puntero; clic en el mundo para colocarlo):" }),
    fila("Biblioteca", ...c.biblioteca.map((m) => boton2(m.nombre, `${m.nombre}: llévalo con el ratón y haz clic donde lo quieras (Esc cancela)`, () => empezarFantasma(m)))),
    el("p", { textContent: "Delante de ti:" }),
    fila("Colocar delante de ti", ...c.biblioteca.map((m) => boton2(m.nombre, `Colocar ${m.nombre} a 3 m delante de ti`, () => c.colocar(m.id)))),
    sel,
    fila("Acciones",
      boton2("Duplicar", "Hacer una copia y cogerla (Mayús+D o Ctrl+D)", () => duplicar()),
      boton2("Anclar / soltar", "Anclar: nadie lo mueve, gira ni borra hasta que lo sueltes (P)", () => c.fijar(), "push-pin"),
      boton2("Borrar", "Quitarlo del mundo; con varios seleccionados, los borra juntos (Supr o Retroceso)", () => borrarSeleccion()),
      boton2("Deshacer", "Deshacer tu último cambio (Ctrl+Z)", () => c.deshacer()),
      boton2("Rehacer", "Rehacer lo deshecho (Ctrl+Mayús+Z o Ctrl+Y)", () => c.rehacer()),
      boton2("Encuadrar", "Mirar lo seleccionado (F)", () => encuadrar())),
    inspector,
    el("details", {}, el("summary", { textContent: "Pasos con botones" }),
      fila("Girar", boton2("⟲ 15°", "Girar a la izquierda", () => c.girar(15)), boton2("⟳ 15°", "Girar a la derecha", () => c.girar(-15))),
      fila("Desplazar", boton2("← 1 m", "Mover a la izquierda", () => c.desplazar(-1, 0)), boton2("→ 1 m", "Mover a la derecha", () => c.desplazar(1, 0)),
        boton2("↑ 1 m", "Mover hacia el fondo", () => c.desplazar(0, -1)), boton2("↓ 1 m", "Mover hacia ti", () => c.desplazar(0, 1))),
      fila("Altura y tamaño", boton2("Subir", "Subir medio metro", () => c.subir(0.5)), boton2("Bajar", "Bajar medio metro", () => c.subir(-0.5)),
        boton2("Más grande", "Agrandar un 25 %", () => c.escalar(1.25)), boton2("Más pequeño", "Reducir un 20 %", () => c.escalar(0.8)))),
    el("details", {}, el("summary", { textContent: "Teclas y ratón" }), el("ul", {}, ...AYUDA.map((t) => el("li", { textContent: t })))),
    estado,
  );
  // what is typed in the panel stays in the panel (the page's other keys — walk, gestures, battery — never see it)
  panel.addEventListener("keydown", (e) => { if (esEntrada(e.target)) e.stopPropagation(); });

  // ---- the hands' state ----
  let agarre: { key: string; antes: Donde } | null = null;
  let fantasma: { id: string; nombre: string; modelo: string; p: Punto | null; ry: number } | null = null;
  let puntero: { x: number; y: number } | null = null;
  let ctrl = false, eje: Eje | null = null, local = false, inspectorVisible = true, trasDuplicar = false;
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
    decir(`${m.nombre}: llévalo con el ratón y haz clic donde lo quieras (rueda: girar · Esc: cancelar).`);
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
  function escape(): void {
    if (fantasma) { quitarFantasma(); return decir("Cancelado."); }
    if (agarre) return cancelarAgarre();
    c.seleccionar("");
    decir("Nada seleccionado.");
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
  function mostrarDonde(d: Donde): void {
    for (const k of ["x", "y", "z", "rx", "ry", "rz", "sx", "sy", "sz"] as const) if (document.activeElement !== campos[k].i) campos[k].i.value = fmt(d[k]);
    if (document.activeElement !== campos.u.i) campos.u.i.value = d.sx === d.sy && d.sy === d.sz ? fmt(d.sx) : "";
  }
  /** Toolbar, selection line and inspector follow the shared state. */
  function refrescar(): void {
    boton.style.display = c.estado.puede ? "" : "none";
    boton.toggleAttribute("data-oculto", !c.estado.puede);
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
    inspector.hidden = !inspectorVisible;
    for (const f of datos.querySelectorAll("fieldset")) f.disabled = !o;
    nombre.disabled = decorado.disabled = fijado.disabled = !o;
    const tipo = String(o?.tipo ?? "modelo");
    const suena = tipo === "sonido" || tipo === "video";
    lSolido.hidden = !o || tipo === "sonido"; lVisible.hidden = !o || tipo !== "sonido"; lVolumen.hidden = lAlcance.hidden = !o || !suena;
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
      decir("Construir: haz clic en un objeto para seleccionarlo, o elige uno de la biblioteca.");
    } else {
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
      case "KeyN": return () => { inspectorVisible = !inspectorVisible; refrescar(); decir(inspectorVisible ? "Inspector a la vista." : "Inspector oculto (N lo vuelve a mostrar)."); };
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

  // ---- C3: the object card (ficha): name, type, small facts and ONE row of icon buttons. It replaces U10's floating bar
  // and reuses its handlers. It shows only for someone who may build here AND with the builder open (fichaVisible); the
  // server still decides every action. Refreshed on events, never per frame. ----
  const ficha = el("aside", { id: "ficha-objeto" });
  ficha.setAttribute("aria-label", "Ficha del objeto seleccionado");
  const fTitulo = el("h3"), fTipo = el("p", { className: "sub" }), fHechos = el("dl");
  const barra = el("div"); barra.setAttribute("role", "toolbar"); barra.setAttribute("aria-label", "Acciones del objeto seleccionado");
  // icon-only button: title + aria-label + data-tip (the tip also shows on keyboard focus)
  const bIcono = (ic: string, titulo: string, fn: () => Res | void, clase = "") => {
    const b = boton2("", titulo, fn);
    b.innerHTML = icono(ic, 18); b.setAttribute("aria-label", titulo); b.dataset.tip = titulo; b.className = `ic ${clase}`.trim();
    return b;
  };
  const sep = () => { const d = el("span", { className: "sep" }); d.setAttribute("aria-hidden", "true"); return d; };
  const herrBarra = ([["mover", "arrows-out-cardinal", "Mover (2 o G)"], ["girar", "arrows-clockwise", "Girar (3 o R)"], ["escalar", "arrows-out-simple", "Escalar (4)"]] as const)
    .map(([m, ic, t]) => { const b = bIcono(ic, t, () => elegirModo(m)); b.dataset.modo = m; return b; });
  const bFijar = bIcono("push-pin", "Anclar (P)", () => c.fijar());
  const bCopiarEnlace = bIcono("link", "Copiar enlace a este sitio", () => copiarEnlace());
  const bVolver = bIcono("arrow-u-up-left", "Volver a donde estabas", () => (extra?.volver?.() ? { ok: true } : { ok: false, why: "no hay a dónde volver" }));
  const bCerrar = bIcono("x", "Cerrar la ficha (Esc)", () => { c.seleccionar(""); });
  barra.append(...herrBarra, sep(), bIcono("copy", "Duplicar (Mayús+D)", () => duplicar()), bFijar, bCopiarEnlace,
    bIcono("trash", "Borrar (Supr; Ctrl+Z lo devuelve)", () => borrarSeleccion(), "peligro"), sep(), bVolver, bCerrar);
  // C4: tabs (role=tablist/tab/tabpanel; ←/→ move, Home/End jump) — «Ficha» (the facts above), «Lógica», «Ajustes». The
  // panels only read the shared state and call the builder's own verbs (nombrar, ajustar, fijar): no new network path.
  let pestana: Pestana = "ficha", firmaFicha = "";
  const ICONO_PEST = { ficha: "package", logica: "scroll", ajustes: "gear" } as const;
  const TIP_PEST = { ficha: "Ficha: los datos del objeto", logica: "Lógica: qué cables y piezas tocan este objeto", ajustes: "Ajustes: nombre, visibilidad, anclaje y colisión" } as const;
  const tabs = el("div", { className: "pestanas" }); tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Pestañas de la ficha");
  const botonesPest = PESTANAS.map(([id, t]) => {
    const b = el("button", { type: "button", id: `ficha-tab-${id}`, title: TIP_PEST[id] });
    b.setAttribute("role", "tab"); b.setAttribute("aria-controls", `ficha-panel-${id}`); b.dataset.tip = TIP_PEST[id]; b.dataset.pestana = id;
    b.innerHTML = `${icono(ICONO_PEST[id], 16)} `; b.append(t);
    b.addEventListener("click", () => elegirPestana(id));
    return b;
  });
  tabs.append(...botonesPest);
  tabs.addEventListener("keydown", (e) => {
    if (e.key === "Tab") return;
    const otra = pestanaConTecla(pestana, e.key);
    if (otra) { e.preventDefault(); elegirPestana(otra, true); }
    if (e.key !== "Escape") e.stopPropagation(); // arrows and Space on a tab are not the page's (walking, jumping)
  });
  const panelDe = (id: Pestana, ...hijos: Node[]) => { const d = el("div", { id: `ficha-panel-${id}`, className: "pest-panel" }, ...hijos); d.setAttribute("role", "tabpanel"); d.setAttribute("aria-labelledby", `ficha-tab-${id}`); return d; };
  // Lógica: read-only lists + the two ways into the panels that already exist
  const lEntran = el("ul"), lSalen = el("ul"), lPiezas = el("ul");
  const textoBtn = (t: string, titulo: string, ic: string, fn: () => void) => { const b = boton2(t, titulo, fn, ic); b.classList.add("tx"); return b; };
  const bAbrirCable = textoBtn("Abrir el cable", "Llevar al panel del cable (disparadores y receptores del mundo)", "scroll", () => { extra?.abrirCable?.(); decir("Cable a la vista: ahí se editan los receptores."); });
  const panelLogica = panelDe("logica",
    el("h4", { textContent: "Entran (disparadores que lo muestran u ocultan)" }), lEntran,
    el("h4", { textContent: "Salen (disparadores que nacen aquí)" }), lSalen,
    el("h4", { textContent: "Piezas en este punto" }), lPiezas, bAbrirCable);
  // Ajustes: what the inspector edits for every object, through the same verbs
  const fNombre = el("input", { type: "text", maxLength: 60 }), fVisible = el("input", { type: "checkbox" }), fAnclado = el("input", { type: "checkbox" }), fSolido = el("input", { type: "checkbox" });
  const lSolidoF = el("label", {}, fSolido, " sólido (las personas chocan con él)");
  fNombre.addEventListener("change", () => { const o = c.objeto(c.estado.seleccionado); if (o) responder(c.nombrar(fNombre.value.trim(), o.decorado === true), "Nombre puesto."); });
  fVisible.addEventListener("change", () => responder(c.ajustar({ oculto: !fVisible.checked }), fVisible.checked ? "Se verá al jugar." : "Invisible al jugar (la ves mientras construyes)."));
  fAnclado.addEventListener("change", () => { const o = c.objeto(c.estado.seleccionado); if (o && !!o.fijado !== fAnclado.checked) responder(c.fijar(), fAnclado.checked ? "Anclado." : "Suelto."); });
  fSolido.addEventListener("change", () => cambiarSolido(fSolido));
  const bAbrirInspector = textoBtn("Abrir inspector (N)", "Ver el inspector con todos los campos: posición, giro, escala, volumen, enlace…", "eye", () => {
    inspectorVisible = true; refrescar(); inspector.scrollIntoView?.({ block: "nearest" }); nombre.focus(); decir("Inspector a la vista (N lo oculta).");
  });
  const panelAjustes = panelDe("ajustes", el("label", {}, "Nombre ", fNombre), el("label", {}, fVisible, " se ve al jugar (si no, solo al construir)"),
    el("label", {}, fAnclado, " anclado (nadie lo mueve, gira ni borra)"), lSolidoF, bAbrirInspector);
  const paneles = { ficha: panelDe("ficha", fHechos), logica: panelLogica, ajustes: panelAjustes };
  function elegirPestana(id: Pestana, foco = false): void {
    pestana = id;
    for (const b of botonesPest) { const si = b.dataset.pestana === id; b.setAttribute("aria-selected", String(si)); b.tabIndex = si ? 0 : -1; if (si && foco) b.focus(); }
    for (const [k, p] of Object.entries(paneles)) p.hidden = k !== id;
    firmaFicha = ""; pintarFicha();
  }
  ficha.append(fTitulo, fTipo, tabs, paneles.ficha, paneles.logica, paneles.ajustes, barra);
  ficha.addEventListener("keydown", (e) => { // typing in the card stays in the card; Esc leaves it like the builder's Esc
    if (!esEntrada(e.target)) return;
    e.stopPropagation();
    if (e.key === "Escape") { (e.target as HTMLElement).blur(); c.seleccionar(""); decir("Nada seleccionado."); }
  });
  ficha.hidden = true;
  document.body.append(ficha);
  elegirPestana("ficha");
  ficha.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch, not a click on the world
  function copiarEnlace(): Res {
    const o = c.objeto(c.estado.seleccionado), url = o ? enlaceDeObjeto(location, o) : null;
    if (!url) return { ok: false, why: "selecciona algo antes (clic)" };
    navigator.clipboard?.writeText(url).then(() => decir("Enlace copiado."), () => decir(`Copia el enlace: ${url}`));
    if (!navigator.clipboard) decir(`Copia el enlace: ${url}`);
    return { ok: true };
  }
  function pintarFicha(): void {
    const o = c.estado.seleccionado ? c.objeto(c.estado.seleccionado) : null;
    const ver = fichaVisible(c.estado.puede, abierto(), o ? o.id : "");
    if (!ver) { if (!ficha.hidden) ficha.hidden = true; firmaFicha = ""; return; }
    // «Ajustes» fields follow the server's state every time (a rejected change puts the box back), but never under your cursor
    if (pestana === "ajustes") {
      const t = document.activeElement;
      if (t !== fNombre) fNombre.value = String(o!.nombre ?? "");
      if (t !== fVisible) fVisible.checked = o!.oculto !== true;
      if (t !== fAnclado) fAnclado.checked = o!.fijado === true;
      if (t !== fSolido) fSolido.checked = o!.solido === true;
      lSolidoF.hidden = o!.tipo === "sonido";
    }
    const volver = !!extra?.puedeVolver?.();
    const lg = pestana === "logica" && extra?.mundo ? logicaDeObjeto(o!, extra.mundo()) : null;
    const firma = JSON.stringify([o!.id, c.estado.modo, o!.fijado, o!.nombre, o!.tipo, o!.x, o!.y, o!.z, o!.sx, o!.sy, o!.sz, volver, pestana, lg]);
    if (firma === firmaFicha && !ficha.hidden) return; // nothing changed: no DOM work
    firmaFicha = firma;
    if (lg) {
      const lista = (ul: HTMLUListElement, filas: string[], vacio: string) => ul.replaceChildren(...(filas.length ? filas : [vacio]).map((t) => el("li", { textContent: t, className: filas.length ? "" : "vacio" })));
      lista(lEntran, lg.entran, "Ningún disparador lo muestra ni lo oculta."); lista(lSalen, lg.salen, "Ningún disparador nace aquí."); lista(lPiezas, lg.piezas, "Sin cerraduras ni contadores aquí.");
    }
    const d = datosFicha(o!);
    fTitulo.textContent = d.titulo; fTipo.textContent = d.tipo;
    fHechos.replaceChildren(...d.hechos.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: v })]));
    for (const b of herrBarra) b.setAttribute("aria-pressed", String(b.dataset.modo === c.estado.modo));
    const fij = o!.fijado === true, t = fij ? "Soltar (P)" : "Anclar (P)";
    bFijar.innerHTML = icono(fij ? "push-pin-slash" : "push-pin", 18); bFijar.title = t; bFijar.dataset.tip = t; bFijar.setAttribute("aria-label", t);
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
  return { alIr: (donde) => { const sitio = seleccionarAlIr(c.estado.puede, abierto(), !!c.objeto(donde.id)); if (sitio) c.seleccionar(donde.id); return sitio; } };
}

function estilo(): void {
  if (document.getElementById("estilo-constructor")) return;
  const s = document.createElement("style");
  s.id = "estilo-constructor";
  s.textContent = `
#panel-construir { width: 320px; font-size: 12px; }
#panel-construir h3 { margin: 8px 0 2px; font-size: 13px; color: #ffd27a; }
#panel-construir .fila { margin: 4px 0; }
#panel-construir button[aria-pressed="true"] { background: #ffd27a; font-weight: 600; }
#panel-construir [data-eje="X"] { color: #b3261e; font-weight: 700; }
#panel-construir [data-eje="Y"] { color: #1e7b34; font-weight: 700; }
#panel-construir [data-eje="Z"] { color: #1d4fb8; font-weight: 700; }
#panel-construir fieldset { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; padding: 2px 6px 6px; border: 1px solid #55606b; border-radius: 6px; }
#panel-construir legend { padding: 0 4px; }
#panel-construir label { display: inline-flex; align-items: center; gap: 4px; margin: 2px 6px 2px 0; }
#panel-construir input[type=number] { width: 58px; }
#panel-construir input[type=text] { width: 190px; }
#panel-construir input:focus-visible, #panel-construir select:focus-visible, #panel-construir summary:focus-visible { outline: 3px solid #ffd27a; }
#panel-construir details { margin: 6px 0; }
#panel-construir summary { cursor: pointer; }
#panel-construir ul { margin: 4px 0; padding-left: 18px; }
#panel-construir label[hidden] { display: none; }
#panel-construir .aviso-biblioteca { color: #ffb4a8; font-weight: 600; }
#panel-construir .aviso-biblioteca[hidden] { display: none; }
#panel-construir input[type=range] { width: 140px; }
#ficha-objeto { position: fixed; z-index: 6; left: 50%; bottom: 96px; transform: translateX(-50%); width: min(392px, calc(100vw - 16px)); padding: 10px 12px; border-radius: 10px; background: rgba(20, 24, 30, .86); color: #eef2f6; font: 12px system-ui, sans-serif; }
#ficha-objeto[hidden] { display: none; }
#ficha-objeto h3 { margin: 0 0 2px; font-size: 15px; overflow-wrap: anywhere; }
#ficha-objeto .sub { margin: 0 0 6px; color: #9aa7b4; }
#ficha-objeto dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 6px 0; }
#ficha-objeto dt { color: #9aa7b4; } #ficha-objeto dd { margin: 0; }
#ficha-objeto [role=toolbar] { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, .14); }
#ficha-objeto .sep { width: 1px; background: rgba(255, 255, 255, .14); margin: 0 3px; }
#ficha-objeto button.ic { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 6px; background: #eef2f6; color: #23303b; }
#ficha-objeto button[hidden] { display: none; }
#ficha-objeto .pestanas { display: flex; gap: 2px; border-bottom: 1px solid rgba(255, 255, 255, .14); }
#ficha-objeto .pestanas button { position: relative; display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 0; border-bottom: 2px solid transparent; border-radius: 6px 6px 0 0; background: transparent; color: #9aa7b4; font: 600 12px system-ui, sans-serif; cursor: pointer; }
#ficha-objeto .pest-panel { margin-top: 6px; max-height: 34vh; overflow-y: auto; }
#ficha-objeto .pest-panel[hidden] { display: none; }
#ficha-objeto h4 { margin: 6px 0 2px; font-size: 12px; color: #ffd27a; }
#ficha-objeto ul { margin: 2px 0; padding-left: 16px; } #ficha-objeto li.vacio { color: #9aa7b4; list-style: none; margin-left: -16px; }
#ficha-objeto .pest-panel label { display: flex; align-items: center; gap: 6px; margin: 4px 0; } #ficha-objeto .pest-panel label[hidden] { display: none; }
#ficha-objeto input[type=text] { flex: 1; min-width: 0; }
#ficha-objeto button.tx { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 6px 10px; border: 0; border-radius: 6px; background: #eef2f6; color: #23303b; font: 600 12px system-ui, sans-serif; cursor: pointer; }
#ficha-objeto input:focus-visible { outline: 3px solid #ffd27a; }
#ficha-objeto .pestanas button[data-tip]:focus-visible::after { bottom: calc(100% + 4px); }
#ficha-objeto button[aria-pressed="true"] { background: #ffd27a; }
#ficha-objeto button.peligro { background: #ffb4a8; }
#ficha-objeto button:focus-visible { outline: 3px solid #ffd27a; }
#ficha-objeto button[data-tip]:focus-visible::after { content: attr(data-tip); position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 3px 7px; border-radius: 5px; background: #000; color: #fff; font-size: 11px; pointer-events: none; }
/* M22b-1: on a touch screen every builder button is a thumb target (Apple HIG: ≥ 44 pt for frequent controls) */
@media (pointer: coarse) {
  #ficha-objeto { bottom: 110px; }
  #ficha-objeto button.ic, #panel-construir button { min-width: 44px; min-height: 44px; padding: 10px 14px; font-size: 14px; }
  #ficha-objeto button.ic { padding: 0; }
  #panel-construir select, #panel-construir input[type=number], #panel-construir input[type=text] { min-height: 40px; font-size: 14px; }
  #panel-construir { font-size: 14px; }
}
`;
  document.head.appendChild(s);
}
