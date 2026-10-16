// objetos — declaration (H1, parity with Hyperfy2's blueprints + entities). Things placed in the world that stay:
// a model (by its sha256), where it is, how it is turned and scaled, its name. Built live by whoever may build
// (api.puede: the world's roles, H3; whether @todos builds is stored in the world — /construir todos|nadie).
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

/** U12: a hole (hueco) is a picture in a frame that waits for a work: its frame's inside, in metres (0 = not a hole). */
const HUECO_M = { kind: "fixed", min: 0, max: 50, step: PASO.pos, default: 0 } as const;
/** U12: the smallest side of a hole, in metres. */
export const HUECO_MIN_M = 0.1;
/** U12: the most pixels per side a picture may have to go in a hole (the server refuses more: limits.json
 * hole_image_px_max). The page makes a bigger one HUECO_PX_PAGINA on its longest side before uploading it. */
export const HUECO_PX_MAX = 4096;
export const HUECO_PX_PAGINA = 2048;
/** U12: the scale (the plane's height, metres; it is as wide as the picture's proportion) that puts a picture of
 * `px` × `py` pixels whole inside a hole of `ancho` × `alto` metres: centred, never distorted, never past the frame
 * (rounded down to the scale's step). Below the smallest scale (ESCALA.min) the picture is too long for that frame: the
 * server refuses it. The server decides with it; the page and agents may use it to preview. */
export function encajar(ancho: number, alto: number, px: number, py: number): number {
  const s = Math.min(alto, (ancho * py) / px);
  return Math.min(ESCALA.max, Number((Math.floor(s / PASO.escala + 1e-6) * PASO.escala).toFixed(2)));
}
/** U12: the smallest scale a thing may have (a picture fitted below it is too long for its frame). */
export const ESCALA_MIN = ESCALA.min;

export const objetos = defineFeature({
  id: "objetos",
  version: 5, // U10: + tipo/ext, oculto, volumen, solido + world box, intent ajustar; U11: + alcance, radio; U12: + holes
  level: "base",
  describe: "Cosas colocadas en el mundo que se quedan (un modelo 3D con su sitio, giro, escala y nombre). Quien tiene permiso de construir las coloca, mueve, duplica, fija, borra y deshace en directo; todos lo ven al momento y sobrevive a los reinicios. Un hueco es un cuadro que espera su obra: se pincha, se elige una imagen y el servidor la encaja.",
  store: { describe: "Por objeto, quién lo colocó y cuándo (`a:<id>`), su caja propia si es sólido (`c:<id>`) y, si es un hueco, el cartel al que vuelve al vaciarlo (`v:<id>`); y el contador de ids (`siguiente`). Nunca va a las páginas." },
  state: {
    describe: "Una entrada por objeto (clave = su id). modelo = sha256 del .glb (el fichero está en /a/<sha256>.glb). Giros en grados. decorado = sin nombre a propósito (como alt=\"\"); fijado = no se mueve ni se borra hasta soltarlo. tipo = modelo, imagen, video o sonido (una esfera: dentro se oye el fichero; su radio es la escala); ext = la extensión del fichero (/a/<sha256>.<ext>); oculto = la esfera no se ve al jugar (sí al construir); volumen 0-1; alcance = quién oye un sonido o un vídeo (burbuja, zona, todos); radio = la burbuja de sonido de un vídeo (m); solido = choca con las personas (bx0…bz1: su caja en el mundo, la calcula el servidor); huecoAncho × huecoAlto > 0 = es un hueco (U12): una imagen en un marco de ese tamaño (m) que espera su obra; huecoLleno = ya la tiene.",
    fields: { modelo: { kind: "text", maxBytes: 64 }, ...DONDE, nombre: NOMBRE, decorado: { kind: "bool", default: true }, fijado: { kind: "bool", default: false }, animar: { kind: "bool", default: true },
      tipo: TIPO, ext: EXT, oculto: { kind: "bool", default: false }, volumen: VOLUMEN, solido: { kind: "bool", default: false }, ...CAJA, alcance: ALCANCE, radio: RADIO,
      huecoAncho: HUECO_M, huecoAlto: HUECO_M, huecoLleno: { kind: "bool", default: false } },
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
    hueco: {
      describe: "U12: hacer de una imagen un hueco: el marco de ancho × alto metros (lo de dentro) donde quien construye pone su obra (rellenar). La imagen que tiene ahora es el cartel al que vuelve al vaciarlo. 0 × 0 = deja de ser hueco.",
      spoken: "hacer un hueco",
      fields: { id: ID, ancho: HUECO_M, alto: HUECO_M },
    },
    rellenar: {
      describe: "U12: poner en un hueco una imagen subida a este servidor (H9: PUT /a/<sha256>.<ext>; png, jpg o webp, hasta 4096 px por lado). El servidor mide sus píxeles y la encaja entera en el marco, centrada y sin deformarla. Vale aunque el hueco esté fijado: no se mueve, cambia su imagen. nombre = el título de la obra (vacío: se queda el nombre que tenía).",
      spoken: "poner una obra en un hueco",
      fields: { id: ID, modelo: { kind: "text", maxBytes: 64 }, ext: EXT, nombre: NOMBRE },
    },
    vaciar: { describe: "U12: quitar la obra de un hueco: vuelve su cartel, con su nombre.", spoken: "vaciar un hueco", fields: { id: ID } },
    deshacer: { describe: "Deshacer el último cambio que hiciste en el mundo.", spoken: "deshacer", fields: {} },
    rehacer: { describe: "Volver a hacer lo último que deshiciste (hasta que hagas un cambio nuevo).", spoken: "rehacer", fields: {} },
  },
  events: {
    permiso: { describe: "Lo que puedes hacer aquí (llega al entrar y al identificarte).", fields: { construir: { kind: "bool" } }, announce: "silent" },
    hecho: { describe: "Tu cambio se hizo: el objeto que tocó (para seleccionarlo).", fields: { id: ID, accion: { kind: "enum", values: ["colocar", "mover", "girar", "duplicar", "borrar", "fijar", "nombrar", "deshacer", "rehacer", "ajustar", "hueco", "rellenar", "vaciar"] } }, announce: "silent" },
    rechazado: { describe: "Tu cambio no se hizo, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
