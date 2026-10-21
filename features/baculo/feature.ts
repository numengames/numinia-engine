// baculo — declaration (v1). The Game Director's staff: whoever holds it directs (scenes, /narrar, /convocar, light and fog
// live, the «Dirigir» button); pass it and the other one directs. A staff is a thing of the world (state entry WITH `at`, a
// card and `interact`: «E: coger el báculo» beside it), free on its pedestal or in one person's hand. The SERVER decides
// everything (who may take it, to whom it goes, when it comes back) and tells the world's roles to LEND the permission
// `dirigir` for as long as the staff is in a hand (event `concesion`, heard only by the server): it is no new role (roles
// are numinia.com's, STD-052), only a loan like a pass, and what a role already let you direct stays. Who rules the world
// (`administrator` / owner) says how many staffs there are (1 by default, 1–5) and may call them all back. AIs never take
// it. A world turns the piece on with `entorno/baculos.json`; without the file nothing changes. Recipe: docs/EXTENDER.md «Báculo».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who sees a staff change hands (m), and who gets the staffs in the shared state from afar (m). */
export const CERCA_M = 30;
export const ALCANCE_M = 64;
/** Staffs a world may have (the owner picks 1–5; 1 by default). */
export const CANTIDAD_MIN = 1;
export const CANTIDAD_MAX = 5;
export const CANTIDAD_DEFECTO = 1;
/** Reach to take a staff from its pedestal (m) and to hand it to someone (m). */
export const COGER_M = 2;
export const PASAR_M = 6;
/** A holder who drops off keeps the staff this long (s) before it goes back to its place. */
export const GRACIA_S = 60;
/** Nobody holds it / reserved for someone who dropped off and may come back (GRACIA_S). */
export const LIBRE = -1;
export const RESERVADO = -2;
/** The house model (features/objetos/biblioteca.json «baculo», CC0, tools/hacer-baculo.mjs). */
export const MODELO_BACULO = "f74174c8690cda9f17072002d620889c285d597a80f1b7d632d1654f4f12f2eb";

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;

export const baculo = defineFeature({
  id: "baculo",
  version: 1,
  level: "base",
  describe: "El báculo del Director de juego: quien lo tiene dirige (escenas, /narrar, /convocar, luz y niebla en vivo, el botón «Dirigir»); si se lo pasa a otra persona, dirige la otra. Un báculo flota sobre su pedestal («E: coger el báculo»); en mano se ve en la persona y en «Gente». Soltar (/baculo soltar), pasar (/baculo pasar <nombre>, a quien esté a 6 m), y al desconectarse (60 s de gracia) o ser echado vuelve a su sitio. Quien manda en el mundo decide cuántos hay (/baculos 1–5) y puede recuperarlos (/baculo recuperar). Una IA no lo coge. Es una pieza con interruptor (Entorno): apagada, no hay báculos. Es un préstamo del permiso de dirigir mientras se tiene, no un rol nuevo.",
  store: { describe: "Sin carpeta del mundo donde escribir baculos.json: cuántos báculos hay, si están encendidos y sus sitios (`estado`), para que sobrevivan al reinicio. Con carpeta lo guarda baculos.json. Nada de esto va a las páginas." },
  state: {
    describe: "Un báculo por clave (b1…b5): nombre, dónde está ahora (x, z; y = altura, m: su sitio mientras está libre, donde está quien lo lleva), su sitio (hx, hy, hz: el pedestal), su modelo (sha256 de un .glb del servidor; vacío = una vara sencilla), desde cuánto se coge (radio, m; 0 mientras alguien lo lleva) y quién lo lleva (portador: la entidad; -1 = nadie; -2 = reservado unos segundos a quien se desconectó).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X, hx: X, hy: Y, hz: X,
      modelo: { kind: "text", maxBytes: 64 },
      radio: { kind: "fixed", min: 0, max: 16, step: 0.1, default: COGER_M },
      portador: { kind: "int", min: RESERVADO, max: 65535, default: LIBRE },
    },
    card: { role: "objeto", name: "{nombre}", description: "El báculo del Director de juego: quien lo tiene dirige; el servidor decide quién lo lleva", at: ["x", "z"], actions: ["coger", "soltar", "pasar"], interact: { intent: "coger", prompt: "coger {nombre}", radius: "radio", key: "cosa" } },
    radius: ALCANCE_M,
  },
  intents: {
    coger: { describe: "Coger el báculo (cosa = cuál). Hay que estar a 2 m, que esté libre y que no lleves otro; el servidor lo comprueba. Una IA no lo coge.", spoken: "coger el báculo", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
    soltar: { describe: "Soltar el báculo que llevas: vuelve a su sitio.", spoken: "soltar el báculo", fields: {}, rate: { perSecond: 1, burst: 3 } },
    pasar: { describe: "Pasar el báculo que llevas a otra persona a 6 m (a = su nombre; vacío = quien tengas más cerca). Pasa a ser quien dirige.", spoken: "pasar el báculo", fields: { a: { kind: "text", maxBytes: 40 } }, rate: { perSecond: 1, burst: 3 } },
    recuperar: { describe: "Solo quien manda en el mundo: todos los báculos vuelven a su sitio y quien los tenía los suelta.", spoken: "recuperar los báculos", fields: {}, rate: { perSecond: 1, burst: 6 } },
    encender: { describe: "Encender o apagar los báculos del mundo (activa = true/false). Solo quien dirige aquí (rol, /dueño o llevando el báculo) o quien manda. Encendido por primera vez sin sitios: el servidor pone el báculo con su pedestal junto a quien lo enciende y guarda el sitio en baculos.json. Apagarlo devuelve el que alguien lleve y quita los báculos (los sitios se guardan).", spoken: "encender o apagar el báculo", fields: { activa: { kind: "bool" } }, rate: { perSecond: 1, burst: 6 } },
    cantidad: { describe: "Solo quien manda en el mundo: cuántos báculos hay (1–5). Bajar la cantidad devuelve los sobrantes. Se guarda en el mundo.", spoken: "cambiar cuántos báculos hay", fields: { n: { kind: "int", min: CANTIDAD_MIN, max: CANTIDAD_MAX } }, rate: { perSecond: 1, burst: 6 } },
  },
  events: {
    cambio: {
      describe: "Un báculo cambia de manos: quién lo movió (quien), a quién pasa (a; -1 si a nadie), cuál, su nombre, qué pasó y la frase. A quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, a: { kind: "int", min: -1, max: 65535, default: -1 }, cosa: ID, nombre: { kind: "text", maxBytes: 60 }, que: { kind: "enum", values: ["cogido", "soltado", "pasado", "recuperado", "devuelto"] }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "suave", importance: 1, who: "quien" },
    },
    rechazado: { describe: "No se hizo, y por qué (lejos, lo lleva otra persona, no mandas aquí, una IA…).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    permiso: { describe: "A ti solo: si puedes encender y apagar piezas del mundo (el báculo, los dados…): quien dirige o manda. Con eso la página muestra o no su interruptor.", fields: { encender: { kind: "bool" } }, announce: "silent" },
    concesion: { describe: "Solo para el servidor: esta persona (su id de invitado) tiene un báculo ahora (si) o ya no. Los roles del mundo le prestan el permiso de dirigir mientras dure.", fields: { persona: { kind: "text", maxBytes: 80 }, si: { kind: "bool" } }, announce: "silent" },
  },
});
