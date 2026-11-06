// espacios — declaration (v1, Y50+Y51: «a corner of the world that is yours: private by default, with a guest list, and
// things you place by simple rules»). A piece (pieza) any world turns on with a file: `entorno/espacios.json` lists its
// spaces. The SERVER decides everything (R-1): who owns a space, who may be inside, and whether a thing may be placed.
//   · The game master (who directs or rules the world) ASSIGNS a space to a person (`asignar`) and takes it back
//     (`liberar`). One space per person. A space nobody owns is open and holds nothing.
//   · The owner names it (`nombrar`), invites people (`invitar`) and removes them (`quitar`). An owned space is PRIVATE:
//     whoever is not the owner, a guest or the game master is put back outside its edge, once a second, with a reason.
//   · `entrar` takes the owner or a guest inside (no walking needed: a keyboard, a phone, VR or an agent do the same).
//   · `colocar` / `retirar` put things in the space by rules the server checks (see esquema.ts `puedeColocar`): a thing
//     rests on the floor or on a supporter that has room under it, only on what its type allows, never beyond the
//     space's cap of objects (`tope`, never above ESPACIO_OBJETOS_MAX = limits.json `space_objects_max`), and a thing
//     with something resting on it cannot be removed.
// The owner's chosen name and every guest name are UNTRUSTED text: pages paint it as text and an agent reads it only
// inside the fenced <material> block (numinia.org STD-050); the server cuts it to length and strips control characters.
import { defineFeature } from "../../packages/feature/src/index.ts";

/** Most objects ANY space may hold: the number published in limits.json (`space_objects_max`); a space's own `tope` is at most this. */
export const ESPACIO_OBJETOS_MAX = 40;
/** Most guests one space lists (limits.json `space_guests_max`). */
export const ESPACIO_INVITADOS_MAX = 12;
/** Most spaces one world lists. */
export const ESPACIOS_MAX = 64;
/** The server ticks at 20 Hz: who is inside is checked once a second. */
export const PASO_TICKS = 20;
/** Who gets a space in the shared state, from afar (m). */
export const ALCANCE_M = 60;
export const NOMBRE_MAX = 40;

const ID = { kind: "text", maxBytes: 16 } as const;
const QUIEN = { kind: "int", min: 0, max: 65535 } as const;
const X = { kind: "fixed", min: -2000, max: 2000, step: 0.01 } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: 0.01, default: 0 } as const;
const NOMBRE = { kind: "text", maxBytes: NOMBRE_MAX } as const;
const TEXTO = { kind: "text", maxBytes: 160 } as const;
const CUANTOS = { kind: "int", min: 0, max: ESPACIO_OBJETOS_MAX } as const;

export const espacios = defineFeature({
  id: "espacios",
  version: 1,
  level: "base",
  describe: "Espacios propios: un rincón que quien dirige asigna a una persona. Privado: solo entran su dueño, sus invitados y quien dirige; a los demás el servidor los saca del borde. El dueño le pone nombre, invita y coloca cosas con reglas que comprueba el servidor (suelo o sitio debajo, tipo permitido, tope; no se quita lo que tiene algo encima). Todo con órdenes o por chat (/espacio). Los nombres son texto no fiable.",
  store: { describe: "Por espacio: dueño, invitados, nombre y cosas. Sobrevive a reinicios; nunca llega a las páginas." },
  state: {
    describe: "Un espacio por clave (su id): nombre y duenoNombre (texto no fiable), dónde (x, z; y = suelo, m), radio (m), estado (libre o privado), cosas colocadas, tope e invitados.",
    fields: {
      nombre: NOMBRE, x: X, y: Y, z: X,
      radio: { kind: "fixed", min: 2, max: 60, step: 0.1, default: 8 },
      estado: { kind: "enum", values: ["libre", "privado"] },
      duenoNombre: { kind: "text", maxBytes: 48, default: "" },
      cosas: CUANTOS, tope: CUANTOS, invitados: { kind: "int", min: 0, max: ESPACIO_INVITADOS_MAX },
    },
    card: { role: "lugar", name: "{nombre}", description: "Espacio propio ({estado}): {cosas} de {tope} objetos, {invitados} invitados", at: ["x", "z"], actions: ["entrar", "mirar"], interact: { intent: "entrar", prompt: "entrar en {nombre}", radius: "radio", key: "id" } },
    radius: ALCANCE_M,
  },
  intents: {
    asignar: { describe: "Quien dirige da un espacio libre (id) a una persona (quien = su entidad); solo uno por persona.", spoken: "asignar el espacio", fields: { id: ID, quien: QUIEN }, rate: { perSecond: 2, burst: 8 } },
    liberar: { describe: "Quien dirige quita el dueño a un espacio (id): se vacía y vuelve a ser abierto.", spoken: "liberar el espacio", fields: { id: ID }, rate: { perSecond: 2, burst: 8 } },
    nombrar: { describe: "El dueño pone nombre a su espacio (id); texto no fiable, se limpia y se corta.", spoken: "poner nombre al espacio", fields: { id: ID, nombre: NOMBRE }, rate: { perSecond: 2, burst: 8 } },
    invitar: { describe: "El dueño invita a una persona conectada (quien = su entidad) a su espacio (id).", spoken: "invitar al espacio", fields: { id: ID, quien: QUIEN }, rate: { perSecond: 2, burst: 8 } },
    quitar: { describe: "El dueño quita a un invitado de su espacio (id) por su nombre.", spoken: "quitar a un invitado", fields: { id: ID, nombre: NOMBRE }, rate: { perSecond: 2, burst: 8 } },
    entrar: { describe: "Entrar en un espacio (id): te lleva dentro si eres dueño, invitado o quien dirige.", spoken: "entrar en el espacio", fields: { id: ID }, rate: { perSecond: 2, burst: 8 } },
    colocar: { describe: "El dueño, dentro, pone una cosa (tipo) en su espacio (id) en x, z (m). sobre = 0 suelo, o el número de la cosa que la sostiene. El servidor calcula la altura y comprueba sitio, tipo y tope.", spoken: "colocar una cosa", fields: { id: ID, tipo: ID, x: X, z: X, sobre: { kind: "int", min: 0, max: 1_000_000 } }, rate: { perSecond: 4, burst: 8 } },
    retirar: { describe: "El dueño quita la cosa n de su espacio (id); no si tiene algo encima.", spoken: "retirar una cosa", fields: { id: ID, n: { kind: "int", min: 1, max: 1_000_000 } }, rate: { perSecond: 4, burst: 8 } },
    mirar: { describe: "El dueño (o quien dirige) pide los invitados y las cosas de su espacio (id).", spoken: "mirar el espacio", fields: { id: ID }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    aviso: { describe: "A ti solo: lo que pasó con tu orden sobre un espacio.", fields: { id: ID, texto: TEXTO }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    concedido: { describe: "A ti solo: te dieron un espacio o te invitaron a uno.", fields: { id: ID, texto: TEXTO }, announce: { text: "{texto}", sound: "exito", importance: 2 } },
    rechazado: { describe: "Tu orden no se hizo, o el espacio es privado: el motivo.", fields: { motivo: { kind: "text", maxBytes: 200 } }, announce: { text: "{motivo}", sound: "error", importance: 2 } },
    cambio: { describe: "Solo servidor: algo cambió en un espacio (que = asignado, liberado, invitado, colocado, retirado). api.listen.", fields: { id: ID, que: { kind: "text", maxBytes: 16 }, dueno: { kind: "text", maxBytes: 64, default: "" } }, announce: "silent" },
  },
});
