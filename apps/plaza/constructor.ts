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
import type { Donde, Editor, Eje } from "../../packages/render/src/index.ts";

type Res = { ok: true } | { ok: false; why: string };
type Obj = Record<string, unknown> & { id: string };
type Herr = "coger" | "mover" | "girar" | "escalar";
type Punto = { x: number; y: number; z: number };
type Builder = {
  estado: { puede: boolean; seleccionado: string; ultimoRechazo: string; modo: string };
  biblioteca: { id: string; nombre: string; modelo: string }[];
  seleccion(): Obj | null;
  objeto(id: string): Obj | null;
  colocar(id: string): Res; colocarEn(id: string, p: Punto, ry?: number): Res;
  girar(grados: number): Res; subir(metros: number): Res; desplazar(dx: number, dz: number): Res; escalar(factor: number): Res;
  duplicar(): Res; borrar(): Res; fijar(): Res; nombrar(nombre: string, decorado?: boolean): Res; deshacer(): Res; rehacer(): Res;
  seleccionar(id: string): Res; transformar(id: string, t: Partial<Donde>): Res; modo(m: string): Res;
  escuchar(fn: (que: string) => void): () => void;
};
type Cam = { modo?(m: "juego" | "construir"): void; frame?(centro: Punto, radio: number): void; bloquear?(on: boolean): void };
type Vista = {
  renderer: { domElement: HTMLCanvasElement };
  editor: Editor;
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
  "Mayús + D o Ctrl + D: duplicar y coger la copia · Supr o Retroceso: borrar · P: fijar o soltar.",
  "Ctrl + Z: deshacer · Ctrl + Mayús + Z o Ctrl + Y: rehacer · F: encuadrar · N: inspector.",
  "Biblioteca: el modelo sigue al puntero y un clic lo coloca; «Delante de ti» lo coloca sin ratón.",
  "Botones derecho y central del ratón, y la rueda: la cámara (cuando llegue la cámara nueva).",
];

const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;
const redondear = (v: number, paso: number) => Number((Math.round(v / paso) * paso).toFixed(2));
const esEntrada = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
const nombreDe = (o: Obj) => String(o.nombre ?? "") || "(decorado)";
const fmt = (v: unknown) => String(Math.round(Number(v) * 100) / 100);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...hijos);
  return e;
}

export function montarConstructor(c: Builder, view: Vista, boton: HTMLButtonElement, panel: HTMLElement): void {
  estilo();
  const ed = view.editor, lienzo = view.renderer.domElement;
  const cam = (): Cam | undefined => (view as Vista & { cam?: Cam }).cam;
  const abierto = () => !panel.hidden;

  // ---- the panel: real buttons, selects and inputs (screen readers and keyboards) ----
  const estado = el("p", { className: "estado" });
  estado.setAttribute("role", "status");
  const decir = (t: string) => { estado.textContent = t; };
  const responder = (r: Res, bien = "Hecho.") => decir(r.ok ? bien : `No: ${r.why}`);
  const boton2 = (texto: string, titulo: string, fn: () => Res | void) => {
    const b = el("button", { type: "button", textContent: texto, title: titulo });
    b.addEventListener("click", () => { const r = fn(); if (r) responder(r); });
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
  selPos.addEventListener("change", () => aplicarPaso());
  selGiro.addEventListener("change", () => aplicarPaso());
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
  const grupo = (leyenda: string, ...hijos: Node[]) => el("fieldset", {}, el("legend", { textContent: leyenda }), ...hijos);
  const datos = el("div", {},
    el("label", {}, "Nombre ", nombre), el("label", {}, decorado, " decorado (sin nombre a propósito)"),
    grupo("Posición (m)", campos.x.l, campos.y.l, campos.z.l),
    grupo("Giro (grados)", campos.rx.l, campos.ry.l, campos.rz.l),
    grupo("Escala", campos.sx.l, campos.sy.l, campos.sz.l, campos.u.l),
    el("label", {}, fijado, " fijado (nadie lo mueve ni lo borra)"));
  const inspector = el("section", { className: "inspector" }, el("h3", { textContent: "Inspector (N)" }), datos);
  inspector.setAttribute("aria-label", "Inspector del objeto seleccionado: Intro aplica");
  nombre.addEventListener("change", () => responder(c.nombrar(nombre.value.trim(), decorado.checked), "Nombre puesto."));
  decorado.addEventListener("change", () => responder(c.nombrar(decorado.checked ? "" : nombre.value.trim(), decorado.checked)));
  fijado.addEventListener("change", () => { const o = c.objeto(c.estado.seleccionado); if (o && !!o.fijado !== fijado.checked) responder(c.fijar(), fijado.checked ? "Fijado." : "Suelto."); });

  panel.append(
    el("h2", { textContent: "Construir" }),
    fila("Herramienta", ...botonesHerr),
    fila("Ejes", ...botonesEje, botonEspacio),
    fila("", el("label", {}, "Paso ", selPos), el("label", {}, "Giro ", selGiro)),
    el("p", { textContent: "Biblioteca (sigue al puntero; clic en el mundo para colocarlo):" }),
    fila("Biblioteca", ...c.biblioteca.map((m) => boton2(m.nombre, `${m.nombre}: llévalo con el ratón y haz clic donde lo quieras (Esc cancela)`, () => empezarFantasma(m)))),
    el("p", { textContent: "Delante de ti:" }),
    fila("Colocar delante de ti", ...c.biblioteca.map((m) => boton2(m.nombre, `Colocar ${m.nombre} a 3 m delante de ti`, () => c.colocar(m.id)))),
    sel,
    fila("Acciones",
      boton2("Duplicar", "Hacer una copia y cogerla (Mayús+D o Ctrl+D)", () => duplicar()),
      boton2("Fijar / soltar", "Fijado: nadie lo mueve ni lo borra (P)", () => c.fijar()),
      boton2("Borrar", "Quitarlo del mundo (Supr o Retroceso)", () => c.borrar()),
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
  const pasoPos = () => (ctrl ? 0 : Number(selPos.value));
  const pasoGiro = () => (ctrl ? 0 : Number(selGiro.value));

  // ---- sending: at most 8 moves a second while dragging, a heartbeat while held still, a final one on release ----
  let envio: { key: string; ultimo: number; pendiente: boolean; enviados: number; reloj: ReturnType<typeof setInterval> } | null = null;
  const enviarYa = (): Donde | null => {
    if (!envio) return null;
    const d = ed.dondeEsta(envio.key);
    if (d) { const r = c.transformar(envio.key, d); if (!r.ok) decir(`No: ${r.why}`); }
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
  ed.onArrastre((fase, key, d) => {
    if (fase === "empieza") { arrastrado = true; cam()?.bloquear?.(true); }
    else if (fase === "cambia") { programarEnvio(key); mostrarDonde(d); }
    else { terminarEnvio(); cam()?.bloquear?.(false); decir(`${nombreDe(c.objeto(key) ?? { id: key })}: x ${fmt(d.x)} y ${fmt(d.y)} z ${fmt(d.z)} · giro ${fmt(d.ry)}°.`); refrescar(); }
  });

  // ---- grab mode (coger): the thing follows the point under the pointer ----
  function empezarAgarre(key: string): void {
    const o = c.objeto(key), antes = ed.dondeEsta(key);
    if (!o || !antes) return;
    if (o.fijado) return decir("Está fijado: suéltalo (P) antes de cogerlo.");
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
  const quitarFantasma = () => { if (fantasma) { fantasma = null; view.place(FANTASMA, null); ed.despertar(); } };
  function empezarFantasma(m: { id: string; nombre: string; modelo: string }): void {
    if (agarre) soltarAgarre(false);
    quitarFantasma();
    fantasma = { id: m.id, nombre: m.nombre, modelo: m.modelo, p: null, ry: 0 };
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
    const h = abierto() && (m === "mover" || m === "girar" || m === "escalar") ? m : null;
    void ed.herramienta(h).then(() => refrescar());
    if (abierto()) decir(m === "coger" ? "Coger: haz clic en un objeto y llévalo; otro clic lo suelta." : h ? `${h[0].toUpperCase()}${h.slice(1)}: arrastra una asa (X roja, Y verde, Z azul).` : "Haz clic en un objeto para seleccionarlo.");
    refrescar();
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
    boton.style.display = c.estado.puede ? "block" : "none";
    if (!abierto()) return;
    for (const b of botonesHerr) b.setAttribute("aria-pressed", String(b.dataset.modo === c.estado.modo));
    for (const b of botonesEje) b.setAttribute("aria-pressed", String((b.dataset.eje || null) === eje));
    botonEspacio.textContent = local ? "Local" : "Mundo";
    botonEspacio.setAttribute("aria-pressed", String(local));
    const o = c.objeto(c.estado.seleccionado), cerca = o ? null : c.seleccion();
    sel.textContent = o ? `Seleccionado: ${nombreDe(o)} · ${o.id}${o.fijado ? " · fijado" : ""}`
      : cerca ? `Nada seleccionado; los botones usan lo más cercano: ${nombreDe(cerca)} · ${cerca.id}` : "Nada seleccionado: haz clic en un objeto.";
    inspector.hidden = !inspectorVisible;
    for (const f of datos.querySelectorAll("fieldset")) f.disabled = !o;
    nombre.disabled = decorado.disabled = fijado.disabled = !o;
    if (!o) return;
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
    programarRefresco();
  });

  // ---- opening and closing ----
  function abrir(si: boolean): void {
    panel.hidden = !si;
    boton.setAttribute("aria-expanded", String(si));
    boton.textContent = si ? "Cerrar construir" : "Construir";
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
      cam()?.modo?.("juego");
    }
    refrescar();
    ed.despertar();
  }
  boton.addEventListener("click", () => abrir(!abierto()));

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
      case "Delete": case "Backspace": return () => c.borrar();
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

  // who may build can change (H3 will give roles); the nearest thing changes as you walk
  setInterval(() => { if (!c.estado.puede && abierto()) abrir(false); refrescar(); }, 500);
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
`;
  document.head.appendChild(s);
}
