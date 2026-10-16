// objetos — declaration (H1, parity with Hyperfy2's blueprints + entities). Things placed in the world that stay:
// a model (by its sha256), where it is, how it is turned and scaled, its name. Built live by whoever may build
// (api.puede: today MOTOR_CONSTRUIR=todos opens it to everyone, people and agents alike; H3 makes it roles).
// The zone's list reaches everyone who enters (no `at`: scenery is seen from afar); changes go to the whole zone.
import { defineFeature } from "../../packages/feature/src/index.ts";
import type { Fields } from "../../packages/feature/src/index.ts";

export const PASO = { pos: 0.01, grados: 0.1, escala: 0.01 } as const;
/** Most things one zone holds (the whole list reaches whoever enters: measured in test/objetos.test.ts). */
export const OBJETOS_MAX = 2000;
/** Changes each builder can undo. */
export const DESHACER_MAX = 50;

const X = { kind: "fixed", min: -2000, max: 2000, step: PASO.pos } as const;
const Y = { kind: "fixed", min: -100, max: 500, step: PASO.pos, default: 0 } as const;
const GIRO = { kind: "fixed", min: -180, max: 180, step: PASO.grados, default: 0 } as const;
const ESCALA = { kind: "fixed", min: 0.05, max: 50, step: PASO.escala, default: 1 } as const;
const ID = { kind: "text", maxBytes: 16 } as const;
const NOMBRE = { kind: "text", maxBytes: 60, default: "" } as const;
/** M22: what a transform may hold (the schema's own numbers), for builders that clamp before asking. */
export const LIMITES = { x: [X.min, X.max], y: [Y.min, Y.max], z: [X.min, X.max], giro: [GIRO.min, GIRO.max], escala: [ESCALA.min, ESCALA.max] } as const;

/** Where a thing is and how it is turned (degrees: yaw ry, then pitch rx, then roll rz) and scaled. */
const DONDE: Fields = { x: X, y: Y, z: X, rx: GIRO, ry: GIRO, rz: GIRO, sx: ESCALA, sy: ESCALA, sz: ESCALA };

/** U10: what a thing is. modelo = a .glb; imagen = a picture on a plane (png, jpg, webp); video = a screen that plays a
 * looped video (mp4, webm); sonido = a sphere of sound (mp3, ogg): inside it you hear the file, its radius is the scale. */
export const TIPOS = ["modelo", "imagen", "video", "sonido"] as const;
export type Tipo = (typeof TIPOS)[number];
/** Which file extensions each kind takes (the server checks /a/<sha256>.<ext> exists). */
export const EXTENSIONES: Record<Tipo, readonly string[]> = { modelo: ["glb"], imagen: ["png", "jpg", "webp"], video: ["mp4", "webm"], sonido: ["mp3", "ogg"] };
const TIPO = { kind: "enum", values: TIPOS, default: "modelo" } as const;
const EXT = { kind: "text", maxBytes: 4, default: "glb" } as const;
const VOLUMEN = { kind: "fixed", min: 0, max: 1, step: 0.01, default: 1 } as const;
/** U11: who hears a sound or a video: only inside its bubble, the whole zone, or everyone in the world. */
export const ALCANCES = ["burbuja", "zona", "todos"] as const;
const ALCANCE = { kind: "enum", values: ALCANCES, default: "burbuja" } as const;
/** U11: a video's bubble of sound, in metres (a sphere of sound uses its scale as its radius). */
const RADIO = { kind: "fixed", min: 0.5, max: 200, step: 0.1, default: 8 } as const;
/** U10: a box in metres (the solid's world box in the state; the model's own box, unscaled, in `ajustar`). */
const CAJA_V = { kind: "fixed", min: -2000, max: 2000, step: PASO.pos, default: 0 } as const;
const CAJA: Fields = { bx0: CAJA_V, by0: CAJA_V, bz0: CAJA_V, bx1: CAJA_V, by1: CAJA_V, bz1: CAJA_V };

export const objetos = defineFeature({
  id: "objetos",
  version: 4, // U10: + tipo/ext, oculto, volumen, solido + world box, intent ajustar; U11: + alcance, radio
  level: "base",
  describe: "Cosas colocadas en el mundo que se quedan (un modelo 3D con su sitio, giro, escala y nombre). Quien tiene permiso de construir las coloca, mueve, duplica, fija, borra y deshace en directo; todos lo ven al momento y sobrevive a los reinicios.",
  store: { describe: "Por objeto, quién lo colocó y cuándo (`a:<id>`); y el contador de ids (`siguiente`). Nunca va a las páginas." },
  state: {
    describe: "Una entrada por objeto (clave = su id). modelo = sha256 del .glb (el fichero está en /a/<sha256>.glb). Giros en grados. decorado = sin nombre a propósito (como alt=\"\"); fijado = no se mueve ni se borra hasta soltarlo. tipo = modelo, imagen, video o sonido (una esfera: dentro se oye el fichero; su radio es la escala); ext = la extensión del fichero (/a/<sha256>.<ext>); oculto = la esfera no se ve al jugar (sí al construir); volumen 0-1; alcance = quién oye un sonido o un vídeo (burbuja, zona, todos); radio = la burbuja de sonido de un vídeo (m); solido = choca con las personas (bx0…bz1: su caja en el mundo, la calcula el servidor).",
    fields: { modelo: { kind: "text", maxBytes: 64 }, ...DONDE, nombre: NOMBRE, decorado: { kind: "bool", default: true }, fijado: { kind: "bool", default: false }, animar: { kind: "bool", default: true },
      tipo: TIPO, ext: EXT, oculto: { kind: "bool", default: false }, volumen: VOLUMEN, solido: { kind: "bool", default: false }, ...CAJA, alcance: ALCANCE, radio: RADIO },
    card: { role: "objeto", name: "{nombre}", at: ["x", "z"], actions: ["mover", "girar", "duplicar", "borrar"] },
    persist: true,
  },
  intents: {
    colocar: {
      describe: "Poner en el mundo un modelo (por su sha256) de la biblioteca o subido a este servidor (H9: PUT /a/<sha256>.glb) en un sitio. Sin nombre, tiene que ir decorado: true.",
      spoken: "colocar un objeto",
      fields: { modelo: { kind: "text", maxBytes: 64 }, x: X, y: Y, z: X, ry: GIRO, nombre: NOMBRE, decorado: { kind: "bool", default: true }, tipo: TIPO, ext: EXT },
    },
    mover: { describe: "Poner un objeto en otro sitio, con otro giro y otra escala (todo a la vez, como lo deja el gizmo).", spoken: "mover un objeto", fields: { id: ID, ...DONDE }, rate: { perSecond: 10, burst: 20 } },
    girar: { describe: "Girar un objeto sobre sí mismo (grados; positivo = a la izquierda vista desde arriba).", spoken: "girar un objeto", fields: { id: ID, grados: GIRO } },
    duplicar: { describe: "Hacer una copia de un objeto un metro al lado.", spoken: "duplicar un objeto", fields: { id: ID } },
    borrar: { describe: "Quitar un objeto del mundo.", spoken: "borrar un objeto", fields: { id: ID } },
    fijar: { describe: "Fijar un objeto (nadie lo mueve ni lo borra) o soltarlo.", spoken: "fijar un objeto", fields: { id: ID, fijado: { kind: "bool" } } },
    nombrar: { describe: "Ponerle nombre a un objeto (lo que dice el lector de pantalla y leen los agentes), o marcarlo como decorado.", spoken: "poner nombre a un objeto", fields: { id: ID, nombre: NOMBRE, decorado: { kind: "bool", default: false } } },
    ajustar: {
      describe: "U10: lo que no es sitio ni nombre: oculto (una esfera de sonido que no se ve al jugar), volumen 0-1 (sonido y vídeo), alcance (burbuja: solo dentro; zona: toda la zona; todos: todo el mundo), radio de la burbuja de un vídeo en metros, y solido (choca con las personas; bx0…bz1 = la caja del modelo sin escalar, en sus propios ejes, la que mide la página al cargarlo).",
      spoken: "ajustar un objeto",
      fields: { id: ID, oculto: { kind: "bool", default: false }, volumen: VOLUMEN, solido: { kind: "bool", default: false }, ...CAJA, alcance: ALCANCE, radio: RADIO },
    },
    deshacer: { describe: "Deshacer el último cambio que hiciste en el mundo.", spoken: "deshacer", fields: {} },
    rehacer: { describe: "Volver a hacer lo último que deshiciste (hasta que hagas un cambio nuevo).", spoken: "rehacer", fields: {} },
  },
  events: {
    permiso: { describe: "Lo que puedes hacer aquí (llega al entrar y al identificarte).", fields: { construir: { kind: "bool" } }, announce: "silent" },
    hecho: { describe: "Tu cambio se hizo: el objeto que tocó (para seleccionarlo).", fields: { id: ID, accion: { kind: "enum", values: ["colocar", "mover", "girar", "duplicar", "borrar", "fijar", "nombrar", "deshacer", "rehacer", "ajustar"] } }, announce: "silent" },
    rechazado: { describe: "Tu cambio no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
