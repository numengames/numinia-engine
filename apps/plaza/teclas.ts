// Keymap v1: ONE table of the keys of the world, one key one function, the same in every world (Pablo, 2026-11-11).
// Every listener of the page asks this module («does this event mean `bolsa`?»), Settings → Controls draws it in two
// columns (Default, fixed · Yours, empty = the default) and F1 and the bar's key badges read the key in effect from it.
// Pure: no DOM except the optional localStorage the page hands it; tests build their own with a Map.
// Build mode and photo mode keep their own keyboard while open (approved exception): see OTROS_MODOS.

export type Grupo = "Move" | "Act" | "Panels" | "Social" | "Camera" | "Interface";
export type Accion = {
  id: string;
  /** What the person reads in Settings and F1 (English). */
  nombre: string;
  grupo: Grupo;
  /** The keys that do it out of the box (the event's `code`; `Ctrl+KeyH` = with Ctrl or ⌘). Empty = no key until you pick one. */
  defecto: readonly string[];
  /** Keys that always do it too and cannot be rebound (the arrows walk as well as WASD). */
  extra?: readonly string[];
  /** Cannot be rebound (Esc, F1, the camera keys, Alt): shown in the table, greyed in «Yours». */
  fija?: boolean;
};

export const ACCIONES: readonly Accion[] = [
  { id: "adelante", nombre: "Walk forward", grupo: "Move", defecto: ["KeyW"], extra: ["ArrowUp"] },
  { id: "izquierda", nombre: "Walk left", grupo: "Move", defecto: ["KeyA"], extra: ["ArrowLeft"] },
  { id: "atras", nombre: "Walk back", grupo: "Move", defecto: ["KeyS"], extra: ["ArrowDown"] },
  { id: "derecha", nombre: "Walk right", grupo: "Move", defecto: ["KeyD"], extra: ["ArrowRight"] },
  { id: "correr", nombre: "Run (hold)", grupo: "Move", defecto: ["ShiftLeft"], extra: ["ShiftRight"] },
  { id: "saltar", nombre: "Jump", grupo: "Move", defecto: ["Space"] },
  { id: "usar", nombre: "Main action: talk, take, sit, accept, reel in", grupo: "Act", defecto: ["KeyE"] },
  { id: "soltar", nombre: "Opposite action: drop, decline, let the line go", grupo: "Act", defecto: ["KeyQ"] },
  { id: "bailar", nombre: "Dance", grupo: "Act", defecto: ["KeyH"] },
  { id: "gestos", nombre: "Gestures wheel (hold)", grupo: "Act", defecto: ["KeyG"] },
  { id: "frases", nombre: "Phrases", grupo: "Act", defecto: ["Backquote"] },
  { id: "microfono", nombre: "Microphone (hold to talk)", grupo: "Social", defecto: ["KeyV"] },
  { id: "chat", nombre: "Chat", grupo: "Social", defecto: ["Enter"] },
  { id: "gente", nombre: "People", grupo: "Social", defecto: ["Tab"] },
  { id: "bolsa", nombre: "Bag", grupo: "Panels", defecto: ["KeyI"] },
  { id: "ficha", nombre: "Character sheet: Character, Reserve, Badges", grupo: "Panels", defecto: ["KeyC"] },
  { id: "construir", nombre: "Build", grupo: "Panels", defecto: ["KeyB"] },
  { id: "mapa", nombre: "Map", grupo: "Panels", defecto: ["KeyM"] },
  { id: "misiones", nombre: "Quests", grupo: "Panels", defecto: ["KeyJ"] },
  { id: "avisos", nombre: "Notices", grupo: "Panels", defecto: ["KeyN"] },
  { id: "menu", nombre: "Menu and settings", grupo: "Panels", defecto: ["KeyO"] },
  { id: "pantalla", nombre: "Watch a screen full screen", grupo: "Panels", defecto: ["KeyF"] },
  { id: "camara", nombre: "Camera menu: photo, record, share", grupo: "Camera", defecto: ["KeyP"] },
  { id: "director", nombre: "Director (narrator)", grupo: "Camera", defecto: ["KeyK"] },
  { id: "grabar", nombre: "Start or stop recording", grupo: "Camera", defecto: [] },
  { id: "girarIzq", nombre: "Turn camera left", grupo: "Camera", defecto: ["Comma"], fija: true },
  { id: "girarDer", nombre: "Turn camera right", grupo: "Camera", defecto: ["Period"], fija: true },
  { id: "inclinarArriba", nombre: "Tilt camera up", grupo: "Camera", defecto: ["PageUp"], fija: true },
  { id: "inclinarAbajo", nombre: "Tilt camera down", grupo: "Camera", defecto: ["PageDown"], fija: true },
  { id: "camaraInicio", nombre: "Camera back to place", grupo: "Camera", defecto: ["Home"], fija: true },
  { id: "acercar", nombre: "Zoom in (fully in = first person)", grupo: "Camera", defecto: ["Equal"], extra: ["NumpadAdd"], fija: true },
  { id: "alejar", nombre: "Zoom out", grupo: "Camera", defecto: ["Minus"], extra: ["NumpadSubtract"], fija: true },
  { id: "densidad", nombre: "Interface density", grupo: "Interface", defecto: ["KeyU"] },
  { id: "ocultarUI", nombre: "Hide or show the whole interface", grupo: "Interface", defecto: ["Ctrl+KeyH"] },
  { id: "nombres", nombre: "Show all names (hold)", grupo: "Interface", defecto: ["AltLeft"], fija: true },
  { id: "ayuda", nombre: "Keys and help", grupo: "Interface", defecto: ["F1"], fija: true },
  { id: "cerrar", nombre: "Back / close", grupo: "Interface", defecto: ["Escape"], fija: true },
];

/** Modes that keep their own keyboard while they are open (approved exception, so they may reuse world keys). */
export const OTROS_MODOS: ReadonlyArray<{ modo: string; teclas: string }> = [
  { modo: "Build mode", teclas: "1 grab · 2 or G move · 3 or R rotate · 4 scale · X Y Z axis · T space · P pin · F frame · Ctrl fine step · B or Esc leave" },
  { modo: "Photo mode", teclas: "Space or Enter shoot · F frame · P or Esc leave · Shift faster" },
  { modo: "Dart board", teclas: "WASD or arrows aim · hold Space or E and release to throw · Esc leave" },
];

/** Keys nobody may take (they would lock the person out). */
export const RESERVADAS: readonly string[] = ["Escape", "F1"];
const FORMA = /^(?:Ctrl\+)?[A-Za-z0-9]{1,24}$/;
export const CLAVE_GUARDADO = "numinia.teclas";
const VERSION = 1;

export type Guardado = { leer(clave: string): string | null; escribir(clave: string, texto: string): void };
export type Resultado = { ok: true } | { ok: false; why: string; conflicto?: string };

/** The key of an event as the table writes it: `KeyE`, `Ctrl+KeyH`. */
export const claveDeEvento = (e: { code: string; ctrlKey?: boolean; metaKey?: boolean }): string => `${e.ctrlKey || e.metaKey ? "Ctrl+" : ""}${e.code}`;

/** How a key reads on screen: `KeyE` → E, `Space` → Space, `Ctrl+KeyH` → Ctrl+H. */
const NOMBRES: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Escape: "Esc", Backquote: "`", Comma: ",", Period: ".", Slash: "/", Minus: "−", Equal: "+",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", ShiftLeft: "Shift", ShiftRight: "Shift", AltLeft: "Alt", AltRight: "Alt",
  ControlLeft: "Ctrl", ControlRight: "Ctrl", PageUp: "PgUp", PageDown: "PgDn", NumpadAdd: "Num +", NumpadSubtract: "Num −", Home: "Home", End: "End", Backspace: "Backspace", Delete: "Delete",
};
export function nombreTecla(clave: string): string {
  if (!clave) return "";
  const ctrl = clave.startsWith("Ctrl+"), code = ctrl ? clave.slice(5) : clave;
  const n = NOMBRES[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
  return ctrl ? `Ctrl+${n}` : n;
}

export function crearTeclas(almacen?: Guardado | null) {
  const porId = new Map(ACCIONES.map((a) => [a.id, a]));
  let suyas: Record<string, string> = {};
  const oyentes = new Set<() => void>();
  const efectivasDe = (a: Accion, s: Record<string, string>): string[] => [...(s[a.id] ? [s[a.id]] : a.defecto), ...(a.extra ?? [])];
  const duenoDe = (clave: string, s: Record<string, string>, salvo?: string): Accion | undefined => ACCIONES.find((a) => a.id !== salvo && efectivasDe(a, s).includes(clave));

  const guardar = (): void => {
    try { almacen?.escribir(CLAVE_GUARDADO, JSON.stringify({ v: VERSION, suyas })); } catch { /* storage full or blocked: the choice lasts until the page closes */ }
    for (const f of [...oyentes]) { try { f(); } catch { /* a listener never breaks the others */ } }
  };
  // load: unknown ids, odd shapes, fixed actions, reserved keys and anything that would put two actions on one key are dropped
  try {
    const t = almacen?.leer(CLAVE_GUARDADO);
    const d = t ? JSON.parse(t) as { v?: number; suyas?: Record<string, unknown> } : null;
    if (d && d.v === VERSION && d.suyas && typeof d.suyas === "object") {
      const lim: Record<string, string> = {};
      for (const [id, c] of Object.entries(d.suyas)) {
        const a = porId.get(id);
        if (!a || a.fija || typeof c !== "string" || !FORMA.test(c) || RESERVADAS.includes(c) || a.defecto[0] === c) continue;
        lim[id] = c;
      }
      // anything that would put two actions on one key is not trusted: back to the defaults
      const dup = ACCIONES.some((a) => efectivasDe(a, lim).some((c) => duenoDe(c, lim, a.id)));
      suyas = dup ? {} : lim;
    }
  } catch { suyas = {}; }

  const api = {
    acciones: ACCIONES,
    accion: (id: string): Accion | undefined => porId.get(id),
    /** The keys in effect for an action: Yours if set, else the Default, plus the fixed extras. */
    efectivas: (id: string): string[] => { const a = porId.get(id); return a ? efectivasDe(a, suyas) : []; },
    /** The one key to show (badges, help): Yours if set, else the Default. Empty = none. */
    principal: (id: string): string => { const a = porId.get(id); return a ? (suyas[id] ?? a.defecto[0] ?? "") : ""; },
    /** The same, as the person reads it. */
    etiqueta: (id: string): string => nombreTecla(api.principal(id)),
    suya: (id: string): string => suyas[id] ?? "",
    suyasTodas: (): Record<string, string> => ({ ...suyas }),
    /** Does this key event mean the action? Plain keys need no Ctrl/⌘/Alt; `Ctrl+…` entries need Ctrl or ⌘ and no Alt. */
    es(e: { code: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, id: string): boolean {
      const a = porId.get(id); if (!a) return false;
      if (e.altKey && !efectivasDe(a, suyas).some((c) => c.startsWith("Alt"))) return false;
      const cl = claveDeEvento(e);
      return efectivasDe(a, suyas).includes(cl);
    },
    /** Is any key of the action in this set of held codes (`keys.has("KeyW")` for walking)? */
    sujeta: (keys: { has(c: string): boolean }, id: string): boolean => api.efectivas(id).some((c) => !c.startsWith("Ctrl+") && keys.has(c)),
    /** Who has this key (other than `salvo`)? */
    dueno: (clave: string, salvo?: string): Accion | undefined => duenoDe(clave, suyas, salvo),
    /** Put a key on an action. A key somebody else has is a conflict: say who, change nothing (see `intercambiar`). */
    asignar(id: string, clave: string): Resultado {
      const a = porId.get(id);
      if (!a) return { ok: false, why: `no action called ${id}` };
      if (a.fija) return { ok: false, why: `${a.nombre} cannot be changed` };
      if (!FORMA.test(clave)) return { ok: false, why: "that key cannot be used" };
      if (RESERVADAS.includes(clave)) return { ok: false, why: `${nombreTecla(clave)} is reserved` };
      const otro = duenoDe(clave, suyas, id);
      if (otro) return { ok: false, why: `${nombreTecla(clave)} already does «${otro.nombre}»`, conflicto: otro.id };
      if (a.defecto[0] === clave) delete suyas[id]; else suyas[id] = clave;
      guardar();
      return { ok: true };
    },
    /** Give `clave` to `id` and hand `id`'s old key to whoever had it (never two actions on one key). */
    intercambiar(id: string, clave: string): Resultado {
      const a = porId.get(id), otro = duenoDe(clave, suyas, id);
      if (!a) return { ok: false, why: `no action called ${id}` };
      if (!otro) return api.asignar(id, clave);
      if (a.fija || otro.fija) return { ok: false, why: `${(a.fija ? a : otro).nombre} cannot be changed` };
      const mia = api.principal(id);
      if (!mia) return { ok: false, why: `${a.nombre} has no key to hand over`, conflicto: otro.id };
      if (RESERVADAS.includes(clave) || !FORMA.test(clave)) return { ok: false, why: "that key cannot be used" };
      const antes = { ...suyas };
      const pon = (x: Accion, c: string): void => { if (x.defecto[0] === c) delete suyas[x.id]; else suyas[x.id] = c; };
      pon(a, clave); pon(otro, mia);
      if (ACCIONES.some((x) => efectivasDe(x, suyas).some((c) => duenoDe(c, suyas, x.id)))) { suyas = antes; return { ok: false, why: `${nombreTecla(mia)} is taken too`, conflicto: otro.id }; }
      guardar();
      return { ok: true };
    },
    /** Back to the Default for one action. */
    limpiar(id: string): void { if (id in suyas) { delete suyas[id]; guardar(); } },
    /** «Reset all»: the Yours column is emptied; the Default never changes. */
    restablecer(): void { if (Object.keys(suyas).length) { suyas = {}; guardar(); } },
    alCambiar(f: () => void): () => void { oyentes.add(f); return () => oyentes.delete(f); },
    /** Two actions with the same key in effect (must be empty: a test pins it for the Default). */
    choques(): Array<[string, string, string]> {
      const out: Array<[string, string, string]> = [], visto = new Map<string, string>();
      for (const a of ACCIONES) for (const c of efectivasDe(a, suyas)) { const p = visto.get(c); if (p && p !== a.id) out.push([p, a.id, c]); else visto.set(c, a.id); }
      return out;
    },
  };
  return api;
}
export type Teclas = ReturnType<typeof crearTeclas>;

/** The one instance of the page, saved in this browser's localStorage next to the other settings. */
const navegador = (): Guardado | null => {
  try { const l = globalThis.localStorage; return l ? { leer: (k) => l.getItem(k), escribir: (k, t) => l.setItem(k, t) } : null; } catch { return null; }
};
export const teclas: Teclas = crearTeclas(navegador());

/** The help line at the foot of the screen, from the table (what a person can do on a keyboard, in the keys in effect). */
export function lineaDeAyuda(t: Teclas = teclas): string {
  const k = (id: string): string => t.etiqueta(id);
  return `${k("adelante")}${k("izquierda")}${k("atras")}${k("derecha")}: walk · ${k("correr")}: run · ${k("saltar")}: jump · drag: look · wheel: zoom · ${k("chat")}: chat · ${k("usar")}: talk or take · ${k("soltar")}: drop or decline · ${k("microfono")}: microphone · ${k("bolsa")}: bag · ${k("ficha")}: character · ${k("mapa")}: map · ${k("misiones")}: quests · ${k("gente")}: people · ${k("camara")}: camera · ${k("construir")}: build · F1: all keys`;
}

/** The rows of F1: group, action, key in effect. */
export function filasDeTeclas(t: Teclas = teclas): Array<{ grupo: Grupo; nombre: string; tecla: string }> {
  return ACCIONES.filter((a) => t.principal(a.id) !== "" || a.defecto.length > 0).map((a) => ({ grupo: a.grupo, nombre: a.nombre, tecla: [t.etiqueta(a.id), ...(a.extra ?? []).filter((x) => !/^Numpad|^Shift/.test(x)).map(nombreTecla)].filter(Boolean).join(" / ") }));
}

/** Tab is the browser's way round the page: as a world key (People) it only counts when nothing has the focus and no panel is open. */
export function teclaLibre(e: { code: string; target?: EventTarget | null }): boolean {
  if (e.code !== "Tab") return true;
  if (typeof document === "undefined" || document.querySelector("dialog[open]")) return false;
  const t = e.target;
  return !t || t === document.body || t === document.documentElement;
}
