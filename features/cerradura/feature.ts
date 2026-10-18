// cerradura — declaration (D-042, historias 1-2): a lock that opens with a code typed on a numeric keypad (also a
// real HTML keypad: apps/plaza/cerradura.ts, so it works without a 3D hand and reads well on any device) or with a
// key a guest is given. The server always decides: the code never leaves it (kept in `store`, never in `state`) and
// a key is checked against what that guest was given (`api.store`, by guest id, I1 — never by entity). A lock is a
// thing of the world (state.card, J4 `interact`): the nearest one offers «E: abrir <nombre>»; for a code lock the
// page opens its keypad first (apps/plaza/cerradura.ts, same `local()` trick as huecos, U12) instead of sending the
// intent at once. Builders (`api.puede(e, "construir")`) place, change and remove locks with `poner`/`quitar`, and
// `dar` grants a key to a guest (from another feature, or a chat order — a later story; no coupling needed today).
import { defineFeature } from "../../packages/feature/src/index.ts";

export const METODOS = ["codigo", "llave"] as const;
export type Metodo = (typeof METODOS)[number];
/** A code is 3 to 8 digits (0-9): short enough to remember, long enough that 3 tries do not find it by luck. */
export const CODIGO_MIN = 3, CODIGO_MAX = 8;
export const NOMBRE_MAX = 60;
/** How many wrong tries in a row before a short wait (per lock, per guest) — the server slows guessing, not the page. */
export const INTENTOS_MAX = 5;
export const ESPERA_MS = 10_000;

const ID = { kind: "text", maxBytes: 16 } as const;
const POS = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const NOMBRE = { kind: "text", maxBytes: NOMBRE_MAX, default: "Cerradura" } as const;
const METODO = { kind: "enum", values: METODOS } as const;
const CODIGO = { kind: "text", maxBytes: CODIGO_MAX, default: "" } as const;
const LLAVE = { kind: "text", maxBytes: 16, default: "" } as const;

export const cerradura = defineFeature({
  id: "cerradura",
  version: 1,
  level: "base",
  describe: "Una cerradura que se abre con un código (teclado numérico, también en HTML, de 3 a 8 cifras) o con una llave que te hayan dado. El servidor decide siempre: el código no sale nunca de él y la llave se comprueba contra lo que esa persona tiene.",
  store: { describe: "Por cerradura, el código que la abre (`c:<id>`, nunca va a las páginas) y cuántas veces seguidas falló cada invitado (`f:<id>:<quienId>`); por invitado, qué llaves tiene (`k:<quienId>`). Nada de esto va a las páginas." },
  state: {
    describe: "Una entrada por cerradura (clave = su id). metodo = codigo o llave; llave = el id de la llave que la abre (solo si metodo=llave; el código de una cerradura de código nunca está aquí). abierta = si está abierta ahora. nombre, x, y, z = dónde está.",
    fields: { metodo: METODO, llave: LLAVE, abierta: { kind: "bool", default: false }, nombre: NOMBRE, x: POS, y: Y, z: POS },
    card: {
      role: "puerta",
      name: "{nombre}",
      description: "Cerradura de {metodo}",
      at: ["x", "z"],
      actions: ["abrir"],
      interact: { intent: "abrir", prompt: "abrir {nombre}", radius: 2.5, key: "id" },
    },
    persist: true,
  },
  intents: {
    abrir: {
      describe: "Intentar abrir una cerradura: con un código (3 a 8 cifras, de un teclado) si es de código, o sin nada si es de llave y te la han dado. El servidor comprueba y nunca dice el código ni qué llave faltaba; tras varios fallos seguidos, pide esperar un poco.",
      spoken: "abrir la cerradura",
      fields: { id: ID, codigo: CODIGO },
      rate: { perSecond: 2, burst: 5 },
    },
    poner: {
      describe: "Poner una cerradura (o cambiar la que tiene ese id): su método (código o llave), el código (si es de código) o el id de la llave que la abre (si es de llave), dónde está y su nombre. Solo quien puede construir.",
      spoken: "poner una cerradura",
      fields: { id: ID, metodo: METODO, codigo: CODIGO, llave: LLAVE, nombre: NOMBRE, x: POS, y: Y, z: POS },
      rate: { perSecond: 2, burst: 4 },
    },
    quitar: { describe: "Quitar una cerradura del mundo. Solo quien puede construir.", spoken: "quitar una cerradura", fields: { id: ID }, rate: { perSecond: 2, burst: 4 } },
    dar: {
      describe: "Dar una llave a quien la pide, por su id de llave: queda guardada para esa persona (no para esta conexión), y a partir de ahora abre cualquier cerradura con esa misma llave. Solo quien puede construir (una pieza futura la dará desde un objeto del mundo).",
      spoken: "dar una llave",
      fields: { llave: LLAVE },
      rate: { perSecond: 2, burst: 4 },
    },
  },
  events: {
    permiso: { describe: "Si puedes poner y quitar cerraduras aquí (llega al entrar, al identificarte y si cambian tus roles).", fields: { construir: { kind: "bool" } }, announce: "silent" },
    abierta: { describe: "Una cerradura que abriste se abrió.", fields: { id: ID }, announce: { text: "Se abre.", sound: "exito", importance: 1 } },
    tuLlave: { describe: "Te han dado una llave (solo para ti).", fields: { llave: LLAVE }, announce: "silent" },
    hecho: { describe: "Tu cambio de constructor se hizo.", fields: { id: ID, accion: { kind: "enum", values: ["poner", "quitar"] } }, announce: "silent" },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué (nunca el código ni la llave que faltaba).", fields: { motivo: { kind: "text", maxBytes: 200 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
