// mando (N5): what a gamepad's buttons DO, as data, and the pure state machine that turns one pad reading into orders.
// No DOM, no clock of its own: the page (apps/plaza/mando.ts) polls navigator.getGamepads(), feeds `leer` and carries out
// the orders; Node tests feed fake readings. Layout = the W3C «standard mapping» (Xbox, PlayStation, Switch, 8BitDo, Steam
// Input… all report it): buttons are known by POSITION, so the bottom face button is index 0 on every pad and only its
// printed name changes (A, ✕, B). Each button is bound to an ACTION and each action to the key the page already listens to,
// so the pad never skips a layer: a panel that swallows «E» swallows the pad's X too, and N4 (rebindable keys) moves both.
// The sticks (walk, look) and the bumpers (zoom) stay in render/camara.ts; this file does the rest.
// Phase 2 (BACKLOG N5): rebinding every button in the settings, rumble, «press the button for…» for non-standard pads.

export type Familia = "xbox" | "playstation" | "nintendo" | "generico";
export type Modo = "mundo" | "menu" | "texto";

/** Index of each button in the standard mapping (https://w3c.github.io/gamepad/#remapping). */
export const BOTON = {
  abajo: 0, derecha: 1, izquierda: 2, arriba: 3, // the right-hand diamond: bottom, right, left, top
  LB: 4, RB: 5, LT: 6, RT: 7, ver: 8, menu: 9, L3: 10, R3: 11,
  cruzArriba: 12, cruzAbajo: 13, cruzIzquierda: 14, cruzDerecha: 15, guia: 16,
} as const;

/** The actions a pad can trigger in the world, each with the key the page already understands and the words for help. */
export const ACCIONES = {
  saltar: { tecla: "Space", key: " ", nombre: "saltar" },
  usar: { tecla: "KeyE", key: "e", nombre: "hablar o coger" },
  ficha: { tecla: "KeyI", key: "i", nombre: "ficha" },
  mapa: { tecla: "KeyM", key: "m", nombre: "dónde estoy" },
  ajustes: { tecla: "KeyO", key: "o", nombre: "ajustes" },
  vista: { tecla: "KeyV", key: "v", nombre: "1.ª o 3.ª persona" },
  misiones: { tecla: "KeyJ", key: "j", nombre: "misiones" },
  chat: { tecla: "Enter", key: "Enter", nombre: "chat" },
  atras: { tecla: "Escape", key: "Escape", nombre: "atrás o cerrar" },
} as const;
export type Accion = keyof typeof ACCIONES;

/** The default layout: button index → action. (L3, the sprint latch, and the sticks and bumpers are handled apart.) */
export const DISTRIBUCION: Readonly<Record<number, Accion>> = {
  [BOTON.abajo]: "saltar", [BOTON.izquierda]: "usar", [BOTON.arriba]: "ficha", [BOTON.derecha]: "atras",
  [BOTON.ver]: "mapa", [BOTON.menu]: "ajustes", [BOTON.R3]: "vista",
  [BOTON.cruzArriba]: "misiones", [BOTON.cruzAbajo]: "chat",
};

/** What each position is called on the pad in the person's hands (index → printed name). */
const NOMBRES: Record<Familia, readonly string[]> = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Ver", "Menú", "L3", "R3", "↑", "↓", "←", "→", "Xbox"],
  playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "↑", "↓", "←", "→", "PS"],
  nintendo: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "L3", "R3", "↑", "↓", "←", "→", "Home"],
  generico: ["Botón de abajo", "Botón derecho", "Botón izquierdo", "Botón de arriba", "L1", "R1", "L2", "R2", "Atrás", "Inicio", "L3", "R3", "↑", "↓", "←", "→", "Guía"],
};

/** Which brand a pad is, from the `id` string the browser gives it (it differs per browser; unknown = generic names). */
export function familia(id: string | undefined): Familia {
  const t = (id ?? "").toLowerCase();
  if (/xbox|xinput|microsoft|045e/.test(t)) return "xbox";
  if (/playstation|dualshock|dualsense|054c|sony|ps[345]/.test(t)) return "playstation";
  if (/nintendo|switch|joy-?con|pro controller|057e/.test(t)) return "nintendo";
  return "generico";
}
export const nombreBoton = (f: Familia, indice: number): string => NOMBRES[f][indice] ?? `Botón ${indice}`;

/** The button that triggers an action in this layout, or null. */
export function botonDe(accion: Accion, dist: Readonly<Record<number, Accion>> = DISTRIBUCION): number | null {
  for (const [i, a] of Object.entries(dist)) if (a === accion) return Number(i);
  return null;
}
/** «A» or «✕»… for an action, to write on prompts: «X: Hablar con Alma». */
export function etiquetaAccion(f: Familia, accion: Accion, dist: Readonly<Record<number, Accion>> = DISTRIBUCION): string {
  const b = botonDe(accion, dist);
  return b === null ? "" : nombreBoton(f, b);
}
/** The rows of the controls list and of the help line, in teaching order. */
export function filasMando(f: Familia, dist: Readonly<Record<number, Accion>> = DISTRIBUCION): { boton: string; que: string }[] {
  const filas = [
    { boton: "Palanca izquierda", que: "andar" },
    { boton: "Palanca derecha", que: "mirar" },
    { boton: `${nombreBoton(f, BOTON.LB)} / ${nombreBoton(f, BOTON.RB)}`, que: "acercar y alejar la cámara" },
    { boton: nombreBoton(f, BOTON.L3), que: "correr (pulsa; se suelta al parar)" },
  ];
  for (const a of ["saltar", "usar", "ficha", "mapa", "ajustes", "vista", "misiones", "chat", "atras"] as Accion[]) {
    const b = botonDe(a, dist);
    if (b !== null) filas.push({ boton: nombreBoton(f, b), que: ACCIONES[a].nombre });
  }
  return filas;
}
export const ayudaMando = (f: Familia, dist: Readonly<Record<number, Accion>> = DISTRIBUCION): string =>
  `Mando: ${filasMando(f, dist).filter((x) => !/Palanca|\//.test(x.boton) || /correr/.test(x.que)).map((x) => `${x.boton} ${x.que.replace(/ \(.*/, "")}`).join(" · ")}`;

// ---------- the state machine ----------
/** One reading of one pad: pressed buttons (by index) and axes. */
export type Lectura = { botones: readonly boolean[]; ejes: readonly number[] };
export type Orden =
  | { tipo: "tecla"; tecla: string; key: string; abajo: boolean } // world: press or release the key the page listens to
  | { tipo: "vertical"; paso: 1 | -1 }                              // menu: focus the next / previous control
  | { tipo: "lateral"; paso: 1 | -1 }                               // menu: change a slider or a choice, or move focus if it is neither
  | { tipo: "pulsar" }                                              // menu: press the focused control
  | { tipo: "cerrar" };                                             // menu: close the panel on top

const UMBRAL_MENU = 0.6;                    // a stick pushed this far moves the menu focus
const REPETIR_PRIMERA = 400, REPETIR = 130; // ms before the stick repeats, then between repeats
const SOLTAR_CARRERA = 150;                 // ms of a still stick that end the sprint latch

export function crearMando(dist: Readonly<Record<number, Accion>> = DISTRIBUCION) {
  let previo: boolean[] | null = null;       // buttons of the last reading (null = nothing read yet: no phantom presses)
  let modoAntes: Modo = "mundo";
  let corre = false, paradoDesde = 0;
  let dir: { x: -1 | 0 | 1; y: -1 | 0 | 1; desde: number; ultima: number } = { x: 0, y: 0, desde: 0, ultima: 0 };
  const tecla = (a: Accion, abajo: boolean): Orden => ({ tipo: "tecla", tecla: ACCIONES[a].tecla, key: ACCIONES[a].key, abajo });
  const toque = (a: Accion): Orden[] => [tecla(a, true), tecla(a, false)];
  const soltarCarrera = (out: Orden[]) => { if (corre) { corre = false; out.push({ tipo: "tecla", tecla: "ShiftLeft", key: "Shift", abajo: false }); } };

  return {
    /** Whether the person is running through the latch (for tests and the help). */
    get corre(): boolean { return corre; },
    /** Forget everything (a pad unplugged, the page hidden): releases the sprint, no phantom press on return. */
    olvidar(): Orden[] { const out: Orden[] = []; soltarCarrera(out); previo = null; dir = { x: 0, y: 0, desde: 0, ultima: 0 }; return out; },
    /** True when this reading shows the person touching the pad (a press, or a stick well off centre). */
    tocado(l: Lectura): boolean {
      return l.botones.some(Boolean) || [0, 1, 2, 3].some((i) => Math.abs(l.ejes[i] ?? 0) > 0.5);
    },
    /** One poll: the orders it causes. `ahora` in ms. The first reading after `olvidar` only records what is held. */
    leer(l: Lectura, modo: Modo, ahora: number): Orden[] {
      const out: Orden[] = [];
      const b = Array.from({ length: 17 }, (_, i) => !!l.botones[i]);
      const antes = previo ?? b;
      previo = b;
      const sube = (i: number) => b[i] && !antes[i];
      if (modo !== modoAntes) { if (modo !== "mundo") soltarCarrera(out); modoAntes = modo; dir = { x: 0, y: 0, desde: ahora, ultima: ahora }; }

      if (modo === "texto") { // typing in a box: the pad only gets out of it
        if (dist[BOTON.derecha] === "atras" && sube(BOTON.derecha)) out.push(...toque("atras"));
        return out;
      }
      if (modo === "menu") {
        if (sube(BOTON.abajo)) out.push({ tipo: "pulsar" });
        if (sube(BOTON.derecha) || sube(BOTON.menu)) out.push({ tipo: "cerrar" });
        if (sube(BOTON.cruzArriba)) out.push({ tipo: "vertical", paso: -1 });
        if (sube(BOTON.cruzAbajo)) out.push({ tipo: "vertical", paso: 1 });
        if (sube(BOTON.cruzIzquierda)) out.push({ tipo: "lateral", paso: -1 });
        if (sube(BOTON.cruzDerecha)) out.push({ tipo: "lateral", paso: 1 });
        // the left stick walks the menu too, repeating while held
        const x = Math.abs(l.ejes[0] ?? 0) > UMBRAL_MENU ? (Math.sign(l.ejes[0]!) as -1 | 1) : 0;
        const y = Math.abs(l.ejes[1] ?? 0) > UMBRAL_MENU ? (Math.sign(l.ejes[1]!) as -1 | 1) : 0;
        const mismo = x === dir.x && y === dir.y;
        if ((x || y) && (!mismo || ahora - dir.desde >= REPETIR_PRIMERA && ahora - dir.ultima >= REPETIR)) {
          if (!mismo) dir = { x, y, desde: ahora, ultima: ahora }; else dir.ultima = ahora;
          if (y) out.push({ tipo: "vertical", paso: y });
          else if (x) out.push({ tipo: "lateral", paso: x });
        } else if (!x && !y) dir = { x: 0, y: 0, desde: ahora, ultima: ahora };
        return out;
      }

      // the world
      for (const [i, a] of Object.entries(dist)) if (sube(Number(i))) out.push(...toque(a));
      if (sube(BOTON.L3)) { // sprint latch: press to run, press again or let go of the stick to stop
        if (corre) soltarCarrera(out);
        else { corre = true; paradoDesde = 0; out.push({ tipo: "tecla", tecla: "ShiftLeft", key: "Shift", abajo: true }); }
      }
      if (corre) {
        const quieto = Math.hypot(l.ejes[0] ?? 0, l.ejes[1] ?? 0) < 0.1;
        if (!quieto) paradoDesde = 0;
        else if (!paradoDesde) paradoDesde = ahora;
        else if (ahora - paradoDesde >= SOLTAR_CARRERA) soltarCarrera(out);
      }
      return out;
    },
  };
}
