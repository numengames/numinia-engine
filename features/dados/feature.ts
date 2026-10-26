// dados — declaration (v1). Dice that the SERVER rolls, so a roll is the same for everyone and nobody's page decides
// it: you ask (`tirar {sitio, dados}` with an expression such as «2d6+1» or «d20»), the server draws each die with a
// uniform draw from the operating system's random source (crypto.getRandomValues, rejection sampling: no die face is
// likelier than another), numbers the roll and tells everyone near the same values. A dice tower is a thing of the
// world (state entry WITH `at`, a card and `interact`: «E: tirar los dados» beside it, with the tower's own default
// dice) and shows its last roll to whoever arrives later; without a tower you roll where you stand (`/tirar 2d6` in
// the chat). A roll may be hidden (`oculta`: the Game Director behind the screen): the others see THAT you rolled,
// never the values. Same verbs for a page, a phone, VR (the chat) and an agent. Recipe: docs/EXTENDER.md «Dados».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Who gets a dice tower in the shared state, from afar (m). */
export const ALCANCE_M = 60;
/** Who sees a roll besides who rolled (m): a room for a table of six, with margin. */
export const CERCA_M = 30;
/** Dice in one roll, faces a die may have, and the modifier's range. */
export const DADOS_MAX = 10;
export const CARAS = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;
export const MOD_MAX = 99;
/** Longest expression («10d100+99» is 9). */
export const EXPRESION_MAX = 16;

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const EXPR = { kind: "text", maxBytes: EXPRESION_MAX } as const;
const TOTAL = { kind: "int", min: -MOD_MAX, max: DADOS_MAX * 100 + MOD_MAX } as const;

export const dados = defineFeature({
  id: "dados",
  version: 1,
  level: "base",
  describe: "Tirar dados que tira el servidor: pides una tirada («2d6+1», «d20», hasta 10 dados de 2, 3, 4, 6, 8, 10, 12, 20 o 100 caras, con un más o menos), el servidor saca cada dado con azar del sistema, numera la tirada y da los mismos valores a todos los que están cerca. Una torre de dados es una cosa del mundo («E: tirar los dados», con sus dados de siempre) y enseña su última tirada a quien llega después. Una tirada puede ser oculta (el Director tras su pantalla): los demás ven que tiró, nunca qué sacó.",
  state: {
    describe: "Una torre de dados por clave: nombre, dónde (x, z; y = altura del suelo, m), desde cuánto se tira (radio, m), los dados que tira si no dices otros (dados), la bandeja donde caen los dados en 3D (bandejaDx/Dz/Alto = dónde está respecto a la torre; bandejaAncho/Fondo = su tamaño, m) y su última tirada a la vista (ultima: «Ana · 2d6+1 → 4 3 +1 = 8»; vacía si aún no ha tirado nadie, y oculta si fue en secreto).",
    fields: {
      nombre: { kind: "text", maxBytes: 60 }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 1, max: 16, step: 0.1, default: 2.5 },
      dados: EXPR,
      // lote 8 (mesa, 3D dice): where the dice land — the tray's centre is (x + bandejaDx, y + bandejaAlto, z + bandejaDz), its size along the world's X and Z.
      // A tower that says nothing has a small patch on the ground at its own place; the picture is the page's, the roll is still the server's.
      bandejaDx: { kind: "fixed", min: -8, max: 8, step: 0.01, default: 0 }, bandejaDz: { kind: "fixed", min: -8, max: 8, step: 0.01, default: 0 },
      bandejaAlto: { kind: "fixed", min: 0, max: 10, step: 0.01, default: 0 },
      bandejaAncho: { kind: "fixed", min: 0.2, max: 4, step: 0.01, default: 0.8 }, bandejaFondo: { kind: "fixed", min: 0.2, max: 4, step: 0.01, default: 0.6 },
      ultima: { kind: "text", maxBytes: 120 },
    },
    card: { role: "lugar", name: "{nombre}", description: "Torre de dados: tira el servidor, todos ven lo mismo", at: ["x", "z"], actions: ["tirar"], interact: { intent: "tirar", prompt: "tirar los dados", radius: "radio", key: "sitio" } },
    radius: ALCANCE_M,
  },
  store: { describe: "Sin carpeta del mundo donde escribir dados.json: si los dados están encendidos y sus torres (`estado`), para que sobrevivan al reinicio. Con carpeta lo guarda dados.json. Nada de esto va a las páginas." },
  intents: {
    encender: {
      describe: "Encender o apagar los dados del mundo (activa = true/false): la torre de dados y /tirar solo existen con ellos encendidos. Solo quien dirige aquí (rol, /dueño o llevando el báculo) o quien manda. Encendido por primera vez sin torres: el servidor pone una junto a quien lo enciende y la guarda en dados.json. Apagado, las torres se guardan y no cambian.",
      spoken: "encender o apagar los dados",
      fields: { activa: { kind: "bool" } },
      rate: { perSecond: 1, burst: 6 },
    },
    tirar: {
      describe: "Tirar dados: sitio = la torre que tienes al lado (vacío = donde estás), dados = la expresión («2d6+1», «d20», «3d6-2»; vacía = los de la torre, o 1d20), oculta = solo tú ves los valores (los demás ven que tiraste). El servidor decide cada dado.",
      spoken: "tirar los dados",
      fields: { sitio: ID, dados: EXPR, oculta: { kind: "bool", default: false } },
      rate: { perSecond: 1, burst: 3 },
    },
  },
  events: {
    permiso: { describe: "A ti solo: si puedes encender y apagar piezas del mundo (los dados, el báculo…): quien dirige o manda. Con eso la página muestra o no su interruptor.", fields: { encender: { kind: "bool" } }, announce: "silent" },
    encendido: { describe: "A todos (al entrar y cuando cambia): si los dados están encendidos en este mundo; la página lo usa para el interruptor.", fields: { activa: { kind: "bool" } }, announce: "silent" },
    tirada: {
      describe: "Una tirada: quién, en qué torre (vacío = donde estaba), el número de tirada de este mundo (n, sube de uno en uno), la expresión, los valores de cada dado en orden («4 3»), el modificador, el total, si fue oculta y la frase. A quien tiró y a quien esté cerca (CERCA_M). Si es oculta, los demás la reciben sin valores (valores vacío, total 0).",
      fields: { quien: QUIEN, sitio: ID, n: { kind: "int", min: 1, max: 1_000_000_000 }, dados: EXPR, valores: { kind: "text", maxBytes: 40 }, mod: { kind: "int", min: -MOD_MAX, max: MOD_MAX }, total: TOTAL, oculta: { kind: "bool" }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "suave", importance: 1, who: "quien" },
    },
    rechazado: { describe: "La tirada que pediste no se hizo, y por qué (expresión mal escrita, lejos de la torre…).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
