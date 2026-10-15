// U2: the game menu. Escape (or Start on a gamepad, or «atrás» on a phone, or the ⚙ button) opens a native <dialog> with six
// entries that nothing can remove, in this order: Continuar · Ajustes · Controles y ayuda · Zona de usuario · Gente · Salir.
// After them come the entries that features and addons declare as data (`menu.agregar`). The menu also opens by itself when
// the pointer is released or full screen ends (the browser kept the first Escape for itself, design §4); «Continuar» is a
// click and never captures the pointer again. The layer rules live in capas.ts.
import { RANGO, vigilar, alVaciarse, bloquearMientras } from "./capas.ts";
import type { ClientSession } from "../../packages/client/src/index.ts";
import type { createView } from "../../packages/render/src/index.ts";

type View = Awaited<ReturnType<typeof createView>>;

export type EntradaMenu = { id: string; etiqueta: string; describe?: string; accion(): void };
export type ResultadoMenu = { ok: true } | { ok: false; error: string };
const FIJAS = ["continuar", "ajustes", "controles", "zona", "gente", "salir"] as const;

/** What the keys and touches do, in the order a newcomer needs them. Feature actions (E, G…) are added from the session. */
const CONTROLES: readonly [string, string, string][] = [
  ["Andar", "WASD o flechas", "Dedo a la izquierda"],
  ["Correr", "Mayús", "Empujar el palo hasta el borde"],
  ["Saltar", "Espacio (otra vez en el aire: más alto)", "Botón «Saltar»"],
  ["Mirar", "Arrastrar con el ratón", "Dedo a la derecha"],
  ["Acercar y alejar", "Rueda", "Dos dedos"],
  ["Chat", "Intro, o «/»", "Botón «Chat»"],
  ["Hablar, coger o usar", "E", "El botón que aparece cerca"],
  ["Misiones", "J", "Botón «Misiones»"],
  ["Mapa", "M", "Botón del minimapa"],
  ["Ficha", "I", "Botón «Ficha»"],
  ["Construir (si puedes)", "C", "Botón «Construir»"],
  ["Ajustes", "O", "Menú › Ajustes"],
  ["Modo batería", "B", "Menú › Ajustes"],
  ["Este menú", "Esc, o Start en el mando", "El botón ⚙, o «atrás» en el móvil"],
];

type Dialogo = { dialog: HTMLDialogElement; cuerpo: HTMLElement; abrir(): void; cerrar(): void };

/** A modal dialog with a title and a close button; one layer of the router (Escape closes it, then the one below). */
function dialogo(id: string, titulo: string, rango: number): Dialogo {
  const dialog = document.createElement("dialog");
  dialog.id = id; dialog.className = "panel-j5 panel-u2"; dialog.setAttribute("aria-labelledby", `${id}-titulo`);
  const cabeza = document.createElement("header");
  const h2 = document.createElement("h2"); h2.id = `${id}-titulo`; h2.textContent = titulo; h2.tabIndex = -1;
  const cerrar = document.createElement("button"); cerrar.type = "button"; cerrar.className = "cerrar"; cerrar.textContent = "Cerrar";
  cabeza.append(h2, cerrar);
  const cuerpo = document.createElement("div"); cuerpo.className = "cuerpo";
  dialog.append(cabeza, cuerpo);
  document.body.appendChild(dialog);
  vigilar(dialog, rango);
  let volver: HTMLElement | null = null;
  const d: Dialogo = {
    dialog, cuerpo,
    abrir() {
      if (dialog.open) return;
      volver = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    },
    cerrar() { if (dialog.open) dialog.close(); },
  };
  dialog.addEventListener("close", () => { if (volver?.isConnected) volver.focus({ preventScroll: true }); volver = null; });
  cerrar.addEventListener("click", () => d.cerrar());
  // what is typed or touched inside a panel belongs to it: never the walking, the camera or the joystick
  dialog.addEventListener("keydown", (e) => { if (e.code !== "Escape") e.stopPropagation(); });
  for (const t of ["pointerdown", "wheel"]) dialog.addEventListener(t, (e) => e.stopPropagation());
  dialog.addEventListener("click", (e) => { // a click on the dimmed page around the panel closes it
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.cerrar();
  });
  return d;
}

export type OpcionesMenu = {
  session: ClientSession; view: View; boton: HTMLButtonElement;
  /** The settings dialog (menu-ajustes.ts) and the player sheet (ficha.ts, the base of the user zone, U4). */
  abrirAjustes(): void; abrirZona(): void;
  /** Names of the people around, by entity (the chat feature keeps them). */
  nombres(): ReadonlyMap<number, string>;
  /** Leave the world: the page closes the connection and says so (conexion.ts). */
  salir(): void;
  /** True while the loading screen or a «you left» screen owns the page: nothing opens the menu then. */
  ocupada(): boolean;
};

export function montarMenu(o: OpcionesMenu) {
  const { session, view, boton } = o;
  const menu = dialogo("menu", "Menú", RANGO.menu);
  const lista = document.createElement("div"); lista.className = "entradas"; lista.setAttribute("role", "group"); lista.setAttribute("aria-label", "Menú del juego");
  menu.cuerpo.appendChild(lista);
  const extras: EntradaMenu[] = [];
  const enXR = () => view.vr.active || view.ar.state !== "off";

  // ---- «Controles y ayuda» ----
  const controles = dialogo("controles", "Controles y ayuda", RANGO.panel);
  const pintarControles = () => {
    const c = controles.cuerpo; c.textContent = "";
    const t = document.createElement("table");
    const cap = document.createElement("caption"); cap.textContent = "Qué hace cada tecla, cada toque y cada mando"; t.appendChild(cap);
    const cab = t.createTHead().insertRow();
    for (const x of ["Qué", "Con teclado y ratón", "En pantalla táctil"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = x; cab.appendChild(th); }
    const cuerpo = t.createTBody();
    const filas: [string, string, string][] = [...CONTROLES];
    for (const a of session.features.actions()) filas.push([a.describe || a.label, (a.key ?? "").replace(/^Key/, "") || "—", `Botón «${a.label}»`]);
    for (const f of filas) { const r = cuerpo.insertRow(); f.forEach((x, i) => { const cel = i === 0 ? document.createElement("th") : document.createElement("td"); if (i === 0) cel.scope = "row"; cel.textContent = x; r.appendChild(cel); }); }
    const p = document.createElement("p"); p.textContent = "Si algo no se ve o no se oye bien, Ajustes tiene tamaño de letra, alto contraste, menos movimiento y avisos hablados.";
    c.append(t, p);
  };

  // ---- «Gente» ----
  const gente = dialogo("gente", "Gente", RANGO.panel);
  let temporizador = 0;
  const pintarGente = () => {
    const c = gente.cuerpo; c.textContent = "";
    const yo = session.entity >= 0 ? session.selfPosition(1) : null, nombres = o.nombres();
    const cerca = session.remotePositions().map((r) => ({ nombre: nombres.get(r.id) || `Persona ${r.id}`, d: yo ? Math.round(Math.hypot(r.x - yo.x, r.z - yo.z)) : -1 })).sort((a, b) => a.d - b.d);
    const h = document.createElement("p"); h.textContent = cerca.length ? `A la vista: ${cerca.length} ${cerca.length === 1 ? "persona" : "personas"}.` : "No hay nadie más a la vista."; c.appendChild(h);
    if (cerca.length) {
      const ul = document.createElement("ul");
      for (const p of cerca.slice(0, 50)) { const li = document.createElement("li"); li.textContent = p.d >= 0 ? `${p.nombre} · a ${p.d} m` : p.nombre; ul.appendChild(li); }
      c.appendChild(ul);
    }
    const n = document.createElement("p"); n.className = "nota";
    n.textContent = "Informar de alguien y bloquearlo llegan con la zona de usuario (fila U4 de la cola): hoy no hay ninguna de las dos cosas.";
    c.appendChild(n);
  };
  gente.dialog.addEventListener("close", () => { clearInterval(temporizador); temporizador = 0; });

  // ---- the entries ----
  const fijas: EntradaMenu[] = [
    { id: "continuar", etiqueta: "Continuar", describe: "Vuelve al mundo.", accion: () => cerrar() },
    { id: "ajustes", etiqueta: "Ajustes", describe: "Gráficos, sonido, interfaz, accesibilidad, privacidad.", accion: () => o.abrirAjustes() },
    { id: "controles", etiqueta: "Controles y ayuda", describe: "Qué hace cada tecla, toque y mando.", accion: () => { pintarControles(); controles.abrir(); } },
    { id: "zona", etiqueta: "Zona de usuario", describe: "Tu ficha: quién eres, misiones, insignias.", accion: () => { cerrar(); o.abrirZona(); } },
    { id: "gente", etiqueta: "Gente", describe: "Quién está cerca de ti.", accion: () => { pintarGente(); gente.abrir(); temporizador = setInterval(pintarGente, 2000) as unknown as number; } },
    { id: "salir", etiqueta: "Salir", describe: "Cierra la conexión con el mundo.", accion: () => { cerrar(); if (view.vr.active) void view.vr.exit(); o.salir(); } },
  ];
  const pintarEntradas = () => {
    lista.textContent = "";
    for (const e of [...fijas, ...extras]) {
      const b = document.createElement("button"); b.type = "button"; b.id = `menu-${e.id}`; b.dataset.entrada = e.id; b.textContent = e.etiqueta;
      if (e.describe) b.title = e.describe;
      b.addEventListener("click", () => e.accion());
      lista.appendChild(b);
    }
  };
  pintarEntradas();

  // ---- open and close ----
  const abierto = () => menu.dialog.open;
  function abrir(): boolean {
    if (menu.dialog.open) return true;
    if (o.ocupada() || enXR()) return false;
    menu.abrir();
    boton.setAttribute("aria-expanded", "true");
    (lista.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true }); // «Continuar»: a quiet start, Enter goes back to the world
    return true;
  }
  function cerrar(): void { menu.cerrar(); }
  menu.dialog.addEventListener("close", () => boton.setAttribute("aria-expanded", "false"));
  const alternar = () => { if (abierto()) cerrar(); else abrir(); };

  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  boton.addEventListener("click", alternar);
  setInterval(() => { const x = enXR(); if (x && abierto()) cerrar(); if (boton.hidden !== x) boton.hidden = x; }, 250); // XR has its own way in (U6)

  // the router: Escape, back, B and Start with no layer open come here
  bloquearMientras(() => o.ocupada() || enXR());
  alVaciarse(() => { abrir(); });

  // the browser kept the first Escape: the page only learns that the pointer or full screen went away
  let tuvoRaton = false, tuvoPantalla = false, salidaPropia = -Infinity;
  document.addEventListener("pointerlockchange", () => { const hay = !!document.pointerLockElement; if (tuvoRaton && !hay) abrir(); tuvoRaton = hay; });
  document.addEventListener("fullscreenchange", () => {
    const hay = !!document.fullscreenElement;
    if (tuvoPantalla && !hay && performance.now() - salidaPropia > 1000) abrir();
    tuvoPantalla = hay;
  });

  return {
    abrir, cerrar, alternar, get abierto() { return abierto(); },
    /** Call when the page's own button leaves full screen: that exit must not open the menu. */
    salidaPropia(): void { salidaPropia = performance.now(); },
    /** Entries, in order: the six fixed ones, then the declared ones. */
    entradas: (): { id: string; etiqueta: string; fija: boolean }[] => [...fijas.map((e) => ({ id: e.id, etiqueta: e.etiqueta, fija: true })), ...extras.map((e) => ({ id: e.id, etiqueta: e.etiqueta, fija: false }))],
    /** A feature or an addon adds an entry (data: a label and an action). It can never replace or hide a fixed one. */
    agregar(e: EntradaMenu): ResultadoMenu {
      if (!e || typeof e.id !== "string" || !/^[a-z0-9][a-z0-9:._-]{0,47}$/.test(e.id)) return { ok: false, error: "id: letras minúsculas, cifras y . _ : - (hasta 48)" };
      if ((FIJAS as readonly string[]).includes(e.id) || extras.some((x) => x.id === e.id)) return { ok: false, error: `id «${e.id}»: ya existe (las seis entradas fijas no se tocan)` };
      if (typeof e.etiqueta !== "string" || !e.etiqueta.trim() || e.etiqueta.length > 40) return { ok: false, error: "etiqueta: texto de 1 a 40 letras" };
      if (typeof e.accion !== "function") return { ok: false, error: "accion: tiene que ser una función" };
      extras.push({ id: e.id, etiqueta: e.etiqueta.trim(), ...(e.describe ? { describe: String(e.describe).slice(0, 120) } : {}), accion: e.accion });
      pintarEntradas();
      return { ok: true };
    },
    quitar(id: string): boolean { const i = extras.findIndex((x) => x.id === id); if (i < 0) return false; extras.splice(i, 1); pintarEntradas(); return true; },
  };
}
