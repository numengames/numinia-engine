// disparadores — declaration (v1, D-041 «el cable»). A world wires «when this happens, do that» with DATA, no code:
// MUNDO_DIR/disparadores.json lists triggers (a `zona` you walk into, a `boton` you press: «E: pulsar», or h5's
// `senal` — fired by another piece's own event, like a lock that opens or a movedor that arrives, matched by name
// in its `senal` field, not by place) each with a cooldown, whether it fires once only, and a list of receivers
// (`muestra`, `oculta`, `teletransporta`, `da_paso`, `abre_enlace`, `suena` — S6: played by features/sonido —, `mueve`). The SERVER decides every
// firing: it watches who enters a zone (api.onTick), checks the reach of a press (api.within), hears a matching
// senal from another feature (api.listen), counts the cooldown in ticks, tells whoever is near (`disparado`) and
// emits one server-only `accion` per receiver, which the feature that owns that action hears
// (`api.listen("disparadores", "accion", …)`): features/objetos answers `muestra`/`oculta`, features/movedores
// answers `mueve`, the rest live in this feature's own server part. Recipe: docs/EXTENDER.md «El cable».
import { defineFeature } from "../../packages/feature/src/index.ts";

export const ALCANCE_M = 64;
export const CERCA_M = 30;
/** The world may wire at most this many triggers (every zone is one distance per player per tick). */
export const DISPARADORES_MAX = 64;
/** Receivers per trigger (one `accion` each when it fires). */
export const RECEPTORES_MAX = 8;
export const COOLDOWN_MAX_S = 3600;
export const TICK_HZ = 20;
export const ACCIONES = ["muestra", "oculta", "teletransporta", "da_paso", "abre_enlace", "suena", "vuelve_a_seguro", "mueve"] as const;
export type Accion = (typeof ACCIONES)[number];
/** D-041 historias 5-6 (edición viva del cable): los receptores viajan como JSON dentro de un campo de texto (el
 * esquema del motor no tiene un tipo «lista»; hasta RECEPTORES_MAX objetos pequeños caben de sobra en este tope,
 * y 512 es el máximo que admite un campo de texto del motor). */
export const RECEPTORES_JSON_MAX_BYTES = 512;
/** Historia D («Decirlo»): the longest sentence a builder may say (characters), how long a proposal waits for «Aplicar»
 * (seconds) and the world's default cap of asks to the AI per UTC day (the installer's CEREBRO_DIA_MAX does not count here:
 * this one is the cable's own, `CABLE_DIA_MAX`). */
export const DECIR_TEXTO_MAX = 300;
export const PROPUESTA_VIDA_S = 120;
export const DECIR_DIA_MAX = 100;
export const DECIR_MINUTO_PERSONA = 3;
export const TIPOS = ["zona", "boton", "senal"] as const;
export type Tipo = (typeof TIPOS)[number];

const ID = { kind: "text", maxBytes: 16 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;
/** D-041 h5: the name of the external signal a «senal» disparador listens for (a lock's own `evento`, a
 * movedor's `llegada.evento`); empty for zona/boton, which fire from a place and a press instead. */
const SENAL = { kind: "text", maxBytes: 32, default: "" } as const;

export const disparadores = defineFeature({
  id: "disparadores",
  version: 1,
  level: "base",
  describe: "El cable del mundo: disparadores que un constructor escribe en disparadores.json (una zona en la que se entra, un botón que se pulsa «E: pulsar», o una señal que oye de otra pieza: una cerradura que se abre, un movedor que llega), con tiempo de espera entre usos y, si quiere, de un solo uso. El servidor decide cada disparo, avisa a los cercanos y da una acción por receptor a la función que la hace (mostrar u ocultar un objeto, teletransportar, dar paso de misión, abrir enlace, sonar, mover otro movedor). D-041 historias 5-6: quien tiene permiso de construir también ve y edita en vivo los receptores de cada disparador, sin reiniciar: el servidor reescribe disparadores.json al vuelo. Historia A: también crea y borra disparadores enteros en vivo (crearDisparador, borrarDisparador).",
  state: {
    describe: "Un disparador por clave: nombre, tipo (zona, boton o senal), dónde (x, z; y = altura, m), radio de la zona (m), desde cuánto se pulsa un botón (alcance, m; 0 = no se ofrece), la frase del botón, la señal que oye (senal; solo tipo senal), cooldown (s), si es de un solo uso, cuántas veces ha disparado (usos), si está en espera ahora (enEspera), si ya se agotó (agotado) y sus receptores (JSON de la lista «qué hace cada disparo»; viaja a todos, como la vista del constructor de historia 5 — no es un secreto como el código de una cerradura).",
    fields: {
      nombre: NOMBRE, tipo: { kind: "enum", values: [...TIPOS] }, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 0.5, max: 64, step: 0.1, default: 3 },
      alcance: { kind: "fixed", min: 0, max: 16, step: 0.1, default: 0 },
      frase: NOMBRE,
      senal: SENAL,
      cooldown: { kind: "int", min: 0, max: COOLDOWN_MAX_S, default: 0 },
      unSoloUso: { kind: "bool", default: false },
      usos: { kind: "int", min: 0, max: 1_000_000_000, default: 0 },
      enEspera: { kind: "bool", default: false },
      agotado: { kind: "bool", default: false },
      receptores: { kind: "text", maxBytes: RECEPTORES_JSON_MAX_BYTES, default: "[]" },
    },
    card: { role: "boton", name: "{nombre}", description: "Disparador del cable: una zona, un botón o una señal de otra pieza; el servidor decide qué pasa", at: ["x", "z"], actions: ["pulsar"], interact: { intent: "pulsar", prompt: "{frase}", radius: "alcance", key: "disparador" } },
    radius: ALCANCE_M,
  },
  intents: {
    pulsar: { describe: "Pulsar un disparador de tipo botón. Hay que estar a su alcance; el servidor lo comprueba, y también el cooldown y el un solo uso.", spoken: "pulsar el botón", fields: { disparador: ID }, rate: { perSecond: 2, burst: 4 } },
    editarReceptores: {
      describe: "D-041 historias 5-6: reemplaza en vivo la lista de receptores de un disparador que ya existe (sin crear ni borrar disparadores). Solo quien tiene permiso de construir; el servidor valida cada receptor igual que al leer disparadores.json y, si acepta el cambio, reescribe ese fichero. Quien no puede construir se rechaza siempre.",
      spoken: "editar los receptores de un disparador",
      fields: { disparador: ID, receptores: { kind: "text", maxBytes: RECEPTORES_JSON_MAX_BYTES } },
      rate: { perSecond: 1, burst: 3 },
    },
    crearDisparador: {
      describe: "Historia A del cable sin JSON: crea en vivo un disparador nuevo (la misma forma que una línea de disparadores.json: id, nombre, tipo, dónde, radio, frase, señal, cooldown, un solo uso y sus receptores como JSON). Solo quien tiene permiso de construir. El servidor lo valida con el mismo lector que lee el fichero (hasta 64 por mundo, 8 receptores, id único) y, si lo acepta, lo pone al momento y reescribe disparadores.json sin reiniciar.",
      spoken: "crear un cable",
      fields: {
        disparador: ID, nombre: { kind: "text", maxBytes: 60, default: "" }, tipo: { kind: "enum", values: [...TIPOS] }, x: X, y: Y, z: X,
        radio: { kind: "fixed", min: 0.5, max: 64, step: 0.1, default: 3 }, frase: { kind: "text", maxBytes: 60, default: "" }, senal: SENAL,
        cooldown: { kind: "int", min: 0, max: COOLDOWN_MAX_S, default: 0 }, unSoloUso: { kind: "bool", default: false },
        receptores: { kind: "text", maxBytes: RECEPTORES_JSON_MAX_BYTES },
      },
      rate: { perSecond: 1, burst: 3 },
    },
    editarDisparador: {
      describe: "Historia C del cable sin JSON: cambia en vivo un disparador que ya existe de una vez (nombre, tipo, señal, espera, un solo uso y todos sus receptores como JSON); si `mover` es verdadero también lo pone en x, y, z. Solo quien tiene permiso de construir. El servidor revalida la línea entera con el mismo lector que lee disparadores.json (8 receptores, 512 bytes), lo cambia al momento para todos —conserva cuántas veces ha disparado— y reescribe disparadores.json. El id no cambia.",
      spoken: "editar un cable",
      fields: {
        disparador: ID, nombre: { kind: "text", maxBytes: 60, default: "" }, tipo: { kind: "enum", values: [...TIPOS] }, senal: SENAL,
        cooldown: { kind: "int", min: 0, max: COOLDOWN_MAX_S, default: 0 }, unSoloUso: { kind: "bool", default: false },
        receptores: { kind: "text", maxBytes: RECEPTORES_JSON_MAX_BYTES },
        mover: { kind: "bool", default: false }, x: X, y: Y, z: X,
      },
      rate: { perSecond: 1, burst: 3 },
    },
    decirCable: {
      describe: "Historia D del cable sin JSON («Decirlo»): quien construye escribe una frase («que al entrar en el círculo suene la campana») y el SERVIDOR (nunca la página) se la da a la IA conectada al mundo, que solo puede elegir de listas cerradas (los 3 tipos, las 8 acciones, los objetos, movedores, misiones y sonidos que de verdad hay). La respuesta se valida con el mismo lector que disparadores.json y NO se aplica: vuelve como una propuesta (`cablePropuesto`, con la frase ya escrita) que hay que confirmar con confirmarCable. Solo con permiso de construir, 3 por minuto por persona, un tope por día y mundo, hasta 300 caracteres. Sin IA conectada o sin cupo se rechaza diciendo por qué (y `puedeDecir` ya lo había dicho).",
      spoken: "decirle al mundo qué cable quieres",
      fields: { texto: { kind: "text", maxBytes: 512 }, idioma: { kind: "enum", values: ["es", "en"], default: "es" } },
      rate: { perSecond: 2, burst: 4 },
    },
    confirmarCable: {
      describe: "Historia D: aplica la propuesta que devolvió decirCable. Solo la misma persona que la pidió, durante 2 minutos, y con permiso de construir. El servidor vuelve a validarlo todo (mismo lector, objetos que existan, tope de 64) antes de crear el cable y reescribir disparadores.json; si algo ya no cuadra, no hace nada y lo dice.",
      spoken: "aplicar el cable propuesto",
      fields: { propuesta: ID },
      rate: { perSecond: 1, burst: 3 },
    },
    borrarDisparador: {
      describe: "Historia A del cable sin JSON: borra en vivo un disparador que existe (también de disparadores.json). Solo quien tiene permiso de construir; un id que no existe se rechaza diciendo cuál.",
      spoken: "borrar un cable",
      fields: { disparador: ID },
      rate: { perSecond: 1, burst: 3 },
    },
  },
  events: {
    disparado: {
      describe: "Un disparador ha saltado: quién (0 = nadie en concreto), cuál, su nombre, el disparo que hace (n) y la frase. A quien esté cerca (CERCA_M).",
      fields: { quien: QUIEN, disparador: ID, nombre: NOMBRE, n: { kind: "int", min: 1, max: 1_000_000_000 }, texto: { kind: "text", maxBytes: 120 } },
      announce: { text: "{texto}", sound: "campana", importance: 1, who: "quien" },
    },
    senal: {
      describe: "Solo para las funciones del servidor (alcance «server»): un disparador ha saltado (quién, cuál, nombre, tipo).",
      fields: { quien: QUIEN, disparador: ID, nombre: NOMBRE, tipo: { kind: "enum", values: [...TIPOS] } },
      announce: "silent",
    },
    accion: {
      describe: "Solo para las funciones del servidor (alcance «server»): una acción de un receptor del cable, una por receptor y disparo. `accion` dice cuál; los demás campos van según la acción (objeto para muestra/oculta/mueve — en mueve, el id del movedor; x, y, z para teletransporta; mision y paso para da_paso; enlace para abre_enlace; sonido para suena). La función que hace esa acción la oye con api.listen y devuelve true.",
      fields: { quien: QUIEN, disparador: ID, accion: { kind: "enum", values: ACCIONES }, objeto: NOMBRE, x: X, y: Y, z: X, mision: { kind: "text", maxBytes: 32 }, paso: { kind: "int", min: 0, max: 999, default: 0 }, enlace: { kind: "text", maxBytes: 200 }, sonido: { kind: "text", maxBytes: 32 } },
      announce: "silent",
    },
    rechazado: { describe: "No disparó, y por qué (lejos, todavía no, ya se usó, no hay tal disparador). También lo usan editarReceptores, editarDisparador, crearDisparador y borrarDisparador cuando el cambio no se hace (sin permiso de construir, id inexistente o repetido, receptor mal escrito, mundo lleno).", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    editado: {
      describe: "D-041 historias 5-6: editar_receptores se hizo (el disparador que cambió). Solo para quien lo editó; todos los demás ven el cambio en el estado del disparador.",
      fields: { disparador: ID },
      announce: "silent",
    },
    puedeDecir: { describe: "Historia D: ¿puede ESTA persona usar «Decirlo» ahora? (`puede`) y, si no, el motivo en español para enseñarlo donde estaría el cuadro («Este mundo no tiene una IA conectada…», cupo del día agotado, la IA no contesta). Solo para quien construye; no lleva ninguna clave ni dato del proveedor.", fields: { puede: { kind: "bool" }, motivo: { kind: "text", maxBytes: 200, default: "" } }, announce: "silent" },
    cablePropuesto: { describe: "Historia D: la IA entendió la frase y lo que propone ya pasó la validación del servidor; `frase` es el cable dicho en palabras (en el idioma que pidió la persona) y `propuesta` el número con el que se confirma. Nada se ha aplicado todavía. Solo para quien lo pidió.", fields: { propuesta: ID, frase: { kind: "text", maxBytes: 512 } }, announce: "silent" },
    decirRechazado: { describe: "Historia D: decirCable o confirmarCable no se hizo, y por qué (sin permiso, sin IA, sin cupo, frase vacía o demasiado larga, la IA no contestó o propuso algo que el mundo no acepta, propuesta caducada o de otra persona).", fields: { motivo: { kind: "text", maxBytes: 200 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    cableEditado: { describe: "Historia C: editarDisparador se hizo (el disparador que cambió). Solo para quien lo editó; los demás ven el cambio en el estado.", fields: { disparador: ID }, announce: "silent" },
    creado: { describe: "Historia A: crearDisparador se hizo (el disparador nuevo). Solo para quien lo creó; los demás ven el disparador nuevo en el estado.", fields: { disparador: ID }, announce: { text: "Cable «{disparador}» creado.", sound: "exito", importance: 1 } },
    borrado: { describe: "Historia A: borrarDisparador se hizo (el disparador que ya no está). Solo para quien lo borró; los demás lo ven desaparecer del estado.", fields: { disparador: ID }, announce: { text: "Cable «{disparador}» borrado.", sound: "suave", importance: 1 } },
    // D-041 historias 3-4: the cable's own actions (no other feature owns moving someone or sounding a note); `da_paso`
    // goes to features/misiones instead (api.listen), so it has no event here.
    teletransportado: {
      describe: "El receptor «teletransporta» te ha puesto en otro sitio del mundo. Solo para quien se movió.",
      fields: { quien: QUIEN, x: X, y: Y, z: X },
      announce: { text: "Has aparecido en otro sitio.", sound: "magia", importance: 1, who: "quien" },
    },
    enlace: {
      describe: "El receptor «abre_enlace» te pregunta si quieres abrir una dirección web en una pestaña nueva. Solo para quien lo disparó; la página pregunta antes de abrir nada.",
      fields: { quien: QUIEN, enlace: { kind: "text", maxBytes: 200 } },
      announce: { text: "¿Abrir este enlace? {enlace}", sound: "aviso", importance: 1, who: "quien" },
    },
  },
});
