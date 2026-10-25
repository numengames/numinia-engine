// misiones — declarations (J5 + the generic J4 interaction). Two features from one folder, one engine behind:
//   pnj       people of the world (PNJ): talk to them from close by; their dialogue depends on your quests
//   misiones  your quest book (only to you, saved by guest) and the quest things in the world (take or use)
// What exists (quests, people, things) comes from the adventure's text files (formato.ts; docs/EXTENDER.md).
import { defineFeature, SOUNDS } from "../../packages/feature/src/index.ts";
import { ACCIONES_PAGINA, ALTURA_MAX, ESPERA_MAX, LIM, LIM_SECUENCIA, MUNDO, TIPOS_PASO, TIPOS_PISTA } from "./formato.ts";

const ID = { kind: "text", maxBytes: LIM.id } as const;
const X = { kind: "fixed", min: -MUNDO, max: MUNDO, step: 0.01 } as const;
const MODELO = { kind: "text", maxBytes: 64, default: "" } as const;
const ESCALA = { kind: "fixed", min: 0.05, max: 50, step: 0.01, default: 1 } as const;
const DESCRIPCION = { kind: "text", maxBytes: LIM.descripcionCosa, default: "" } as const;
const MOTIVO = { kind: "text", maxBytes: 160 } as const;
// U14 (5): a sequence's numbers on the wire — a moment (s), a height, an offset over a person (m), a yaw (degrees)
const X0 = { ...X, default: 0 } as const;
const MOMENTO = { kind: "fixed", min: 0, max: LIM_SECUENCIA.duracion, step: 0.01, default: 0 } as const;
const ALTO_SEC = { kind: "fixed", min: 0, max: LIM_SECUENCIA.alto, step: 0.01, default: 0 } as const;
const DESPLAZA = { kind: "fixed", min: -LIM_SECUENCIA.desplazamiento, max: LIM_SECUENCIA.desplazamiento, step: 0.01, default: 0 } as const;
const GIRO = { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 } as const;

export const pnj = defineFeature({
  id: "pnj",
  version: 4, // v4: the state gains `voz` (how a person sounds when you start and stop talking; "" = from its id); v3: the state gains `oficio` (a person's trade, a smaller line under the name); v2: `y` (the height a person stands at)
  level: "base",
  describe: "Personas del mundo que no son jugadores (PNJ). Se les habla de cerca y contestan con un diálogo de opciones, igual para todos y decidido por el servidor, que cambia según tus misiones. Las escribe la aventura (pnj@1).",
  state: {
    describe: "Una entrada por persona (clave = su id): nombre, su oficio (vacío = ninguno; va bajo el nombre), su voz (una de VOCES_PNJ; vacío = la que salga de su id), dónde está (y = altura sobre el suelo, m: su planta), hacia dónde mira (grados), a qué distancia se le habla (m, y a menos de 2,5 m de altura) y su modelo (sha256 de un .glb; vacío = el robot de la casa).",
    fields: { nombre: { kind: "text", maxBytes: LIM.nombre }, descripcion: DESCRIPCION, x: X, z: X, giro: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 }, radio: { kind: "fixed", min: 0.5, max: 16, step: 0.1, default: 3 }, modelo: MODELO, escala: ESCALA, y: { kind: "fixed", min: 0, max: ALTURA_MAX, step: 0.01, default: 0 }, oficio: { kind: "text", maxBytes: LIM.oficio, default: "" }, voz: { kind: "text", maxBytes: 16, default: "" } },
    card: { role: "persona", name: "{nombre}", description: "{descripcion}", at: ["x", "z"], actions: ["hablar"], interact: { intent: "hablar", prompt: "hablar con {nombre}", radius: "radio", key: "pnj" } },
  },
  intents: {
    hablar: { describe: "Empezar a hablar con una persona del mundo; hay que estar a su lado (su radio).", spoken: "hablar con alguien", fields: { pnj: ID }, rate: { perSecond: 2, burst: 4 } },
    elegir: { describe: "Elegir una respuesta (1-4, en el orden en que llegaron) del diálogo abierto con esa persona.", spoken: "elegir una respuesta", fields: { pnj: ID, opcion: { kind: "int", min: 1, max: 4 } }, rate: { perSecond: 4, burst: 6 } },
    adios: { describe: "Terminar la conversación.", spoken: "despedirse", fields: { pnj: ID } },
  },
  events: {
    dialogo: {
      describe: "Lo que dice la persona y las respuestas que puedes elegir (o1…o4; vacía = no hay). Solo a quien habla.",
      fields: { pnj: ID, nombre: { kind: "text", maxBytes: LIM.nombre }, texto: { kind: "text", maxBytes: LIM.linea }, o1: { kind: "text", maxBytes: LIM.opcion, default: "" }, o2: { kind: "text", maxBytes: LIM.opcion, default: "" }, o3: { kind: "text", maxBytes: LIM.opcion, default: "" }, o4: { kind: "text", maxBytes: LIM.opcion, default: "" } },
      announce: { text: "{nombre}: {texto}", sound: "suave", importance: 1 },
    },
    fin: { describe: "La conversación terminó (te despediste o te alejaste).", fields: { pnj: ID, nombre: { kind: "text", maxBytes: LIM.nombre } }, announce: { text: "Fin de la conversación con {nombre}.", sound: "suave", importance: 0 } },
    rechazado: { describe: "No se pudo hablar o elegir, y por qué.", fields: { motivo: MOTIVO }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});

export const misiones = defineFeature({
  id: "misiones",
  version: 8, // v8 (Y3): the server-only event `otorga` may carry `objeto` (the id of an adventure's objeto@1); v7 (T1): step type `hace` (the builder does something), the step event carries `accion` and `senala`, and the intent `hace` (the page says it opened a panel); v6: a reward may be an «objeto» (a digital good, N10): event `concedido` goes to the server only (features/bienes signs and keeps it); v5: a step may wait (`paso.espera`: seconds left) and a done step may play a moment only you see (events secuencia, pista, clave); and a quest thing's used look (state `modeloUsada`, `escalaUsada`: cosa@1 apariencia.usada, U14 (6)); v4: marks for you over people and things (event `marcas`: «!» something for you now, «✓» done); v3: steps in any order (`paso.grupo`), a person gives you a thing (step type «recibe»); v2: a thing's `y` reaches ALTURA_MAX
  level: "base",
  describe: "Misiones: encargos por pasos (llegar a un sitio, hablar con alguien, recibir algo de alguien, usar o coger algo, entregarlo; los de un mismo grupo, en cualquier orden) que da una persona y que comprueba el servidor. Un paso puede esperar unos segundos antes de poder hacerse y, al hacerse, poner una secuencia que solo ves tú. Tu libro llega solo a ti y se guarda por invitado. Las escribe la aventura (mision@1, cosa@1, secuencia@1).",
  store: { describe: "El progreso de cada invitado (`p:<id>`): misiones activas con su paso, lo que lleva (cogido o recibido) y lo hecho del grupo en curso, las completadas y la que sigue. Solo le llega a su dueño, como eventos. Y cada recompensa concedida, una sola vez (`c:<misión>:<id>`: jugador, nombre, misión, recompensas, instante, estado), que lista `npm run concesiones`." },
  state: {
    describe: "Las cosas de las misiones que hay en el mundo (clave = su id): nombre, dónde (y = altura sobre el suelo, m: una mesa o una planta alta), a qué distancia se usan (m, y a menos de 2,5 m de altura), el aviso que sale al lado («coger la caja»), su modelo (vacío = el bloque de la casa), su color («#rrggbb»; vacío = el del modelo) y cómo se ve para quien ya la usó (modeloUsada y escalaUsada; vacío = igual que antes).",
    fields: { nombre: { kind: "text", maxBytes: LIM.nombre }, descripcion: DESCRIPCION, x: X, z: X, radio: { kind: "fixed", min: 0.5, max: 16, step: 0.1, default: 2 }, aviso: { kind: "text", maxBytes: LIM.aviso }, modelo: MODELO, escala: ESCALA, y: { kind: "fixed", min: 0, max: ALTURA_MAX, step: 0.01, default: 0 }, color: { kind: "text", maxBytes: 7, default: "" }, modeloUsada: MODELO, escalaUsada: ESCALA },
    card: { role: "objeto", name: "{nombre}", description: "{descripcion}", at: ["x", "z"], actions: ["usar"], interact: { intent: "usar", prompt: "{aviso}", radius: "radio", key: "cosa" } },
  },
  intents: {
    aceptar: { describe: "Aceptar una misión que ofrece alguien que tienes al lado.", spoken: "aceptar una misión", fields: { mision: ID } },
    abandonar: { describe: "Dejar una misión activa (se pierde lo avanzado en ella).", spoken: "abandonar una misión", fields: { mision: ID } },
    seguir: { describe: "Seguir una misión activa: su objetivo se marca en el mundo y en el mapa (vacío = no seguir ninguna).", spoken: "seguir una misión", fields: { mision: { kind: "text", maxBytes: LIM.id, default: "" } } },
    hace: { describe: `T1: avisar de algo que solo la página ve (${ACCIONES_PAGINA.join(", ")}: abrir el panel de construir, la biblioteca o el cable) para un paso «hace» de tu misión. Solo vale con permiso de construir y esas tres acciones; el resto de lo que hace quien construye lo ve el servidor solo.`, spoken: "avisar de que has abierto un panel", fields: { accion: { kind: "text", maxBytes: 16 } }, rate: { perSecond: 2, burst: 4 } },
    usar: { describe: "Coger o usar una cosa de una misión que tienes al lado.", spoken: "coger o usar algo", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    libro: { describe: "Llega tu libro entero (al entrar y tras cada cambio): olvida el anterior; detrás vienen sus misiones y sus pasos.", fields: { activas: { kind: "int", min: 0, max: 64 }, hechas: { kind: "int", min: 0, max: 1000 } }, announce: "silent" },
    mision: {
      describe: "Una misión de tu libro: activa (paso = el primero que toca, desde 0) o hecha; seguida = la que marcas.",
      fields: { id: ID, titulo: { kind: "text", maxBytes: LIM.titulo }, descripcion: { kind: "text", maxBytes: LIM.descripcion }, estado: { kind: "enum", values: ["activa", "hecha"] }, paso: { kind: "int", min: 0, max: LIM.pasos }, pasos: { kind: "int", min: 1, max: LIM.pasos }, seguida: { kind: "bool" }, recompensa: { kind: "text", maxBytes: 120, default: "" } },
      announce: "silent",
    },
    paso: {
      describe: "Un paso de una misión de tu libro y dónde está su objetivo (x, z, donde = su nombre; que = el id de la persona o la cosa). Los pasos seguidos con el mismo grupo se hacen en cualquier orden (grupo = el nombre de su contador; vacío = ninguno). accion = lo que hay que hacer en un paso «hace» (vacío en los demás); senala = el id del botón de la página que la flecha señalará (vacío = ninguno). espera = cuántos segundos faltan para poder hacerlo (0 = ya se puede; la página descuenta sola y el servidor manda el libro otra vez cuando se abre).",
      fields: { mision: ID, n: { kind: "int", min: 0, max: LIM.pasos - 1 }, texto: { kind: "text", maxBytes: LIM.textoPaso }, tipo: { kind: "enum", values: TIPOS_PASO }, hecho: { kind: "bool" }, x: X, z: X, donde: { kind: "text", maxBytes: LIM.lugar }, que: { kind: "text", maxBytes: LIM.id, default: "" }, grupo: { kind: "text", maxBytes: LIM.grupo, default: "" }, espera: { kind: "int", min: 0, max: ESPERA_MAX, default: 0 }, accion: { kind: "text", maxBytes: 16, default: "" }, senala: { kind: "text", maxBytes: 32, default: "" } },
      announce: "silent",
    },
    aceptada: { describe: "Aceptaste una misión.", fields: { mision: ID, titulo: { kind: "text", maxBytes: LIM.titulo }, texto: { kind: "text", maxBytes: LIM.textoMision, default: "" } }, announce: { text: "Misión nueva: {titulo}. {texto}", sound: "magia", importance: 1 } },
    avance: { describe: "Hiciste un paso de una misión (si alguien te dio algo: «Has recibido: …»).", fields: { mision: ID, texto: { kind: "text", maxBytes: LIM.textoPaso } }, announce: { text: "Hecho: {texto}", sound: "exito", importance: 1 } },
    concedido: {
      describe: "N10: un objeto de recompensa concedido a un invitado (una vez por misión e invitado, cuando se apunta su concesión). Solo para el servidor: la función bienes firma su recibo de propiedad y lo guarda en el inventario de su dueño.",
      fields: { jugador: { kind: "text", maxBytes: 64 }, mision: ID, objeto: ID, nombre: { kind: "text", maxBytes: LIM.nombre }, descripcion: DESCRIPCION, modelo: MODELO, licencia: { kind: "text", maxBytes: 40, default: "" }, instante: { kind: "text", maxBytes: 32 } },
      announce: "silent",
    },
    completada: {
      describe: "Completaste una misión (y lo que te llevas).",
      fields: { mision: ID, titulo: { kind: "text", maxBytes: LIM.titulo }, texto: { kind: "text", maxBytes: LIM.textoMision, default: "" }, recompensa: { kind: "text", maxBytes: 120, default: "" } },
      announce: { text: "Misión completada: {titulo}. {texto} {recompensa}", sound: "campana", importance: 2 },
    },
    aviso: { describe: "Algo de tus misiones que conviene saber (dejaste una, ya no sigues ninguna…).", fields: { texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    otorga: {
      describe: "Solo en el servidor (Y1): una misión completada da un objeto a quien la hizo (quien = su entidad). Lo oye la función inventario y lo guarda; ninguna página lo recibe. Con `objeto` (el id de un objeto@1 de la aventura) se entrega lo que la aventura definió.",
      fields: { quien: { kind: "int", min: 0, max: 65535 }, tipo: { kind: "enum", values: ["arma", "reliquia", "token"] }, clase: { kind: "text", maxBytes: 32 }, nombre: { kind: "text", maxBytes: 40 }, color: { kind: "enum", values: ["", "verde", "azul", "plateada", "dorada", "roja"] }, n: { kind: "int", min: 1, max: 999, default: 1 }, objeto: { kind: "text", maxBytes: 32, default: "" } },
      announce: "silent",
    },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: MOTIVO }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
    marcas: {
      describe: "Qué personas y cosas tienen marca para ti (tras cada libro; solo a ti). Ids separados por comas: tiene = personas con «!» (te dan una misión que puedes coger o un paso tuyo de ahora es con ellas), hecho = personas con «✓» (ya hiciste lo suyo y no te queda nada con ellas), cosas = cosas con «!» (un paso tuyo de ahora es cogerlas o usarlas).",
      fields: { tiene: { kind: "text", maxBytes: LIM.marcas, default: "" }, hecho: { kind: "text", maxBytes: LIM.marcas, default: "" }, cosas: { kind: "text", maxBytes: LIM.marcas, default: "" } },
      announce: "silent",
    },
    // U14 (5): a scripted moment (secuencia@1) for you alone, when you do a step that names one: a header, one `pista`
    // per track and, after each `mueve`, its keys. The page plays it (secuencia.ts) and shows its lines as notes.
    secuencia: {
      describe: "Empieza una secuencia que solo ves tú (la puso un paso que acabas de hacer): cuánto dura (s) y cuántas pistas llegan detrás. Al acabar, cada persona vuelve a donde dice el servidor.",
      fields: { id: ID, duracion: { kind: "fixed", min: 1, max: LIM_SECUENCIA.duracion, step: 0.01 }, pistas: { kind: "int", min: 1, max: LIM_SECUENCIA.pistas } },
      announce: "silent",
    },
    pista: {
      describe: "Una pista de la secuencia (n desde 0), según su tipo: mueve = la persona pnj sigue sus claves (llegan detrás: claves = cuántas); muestra = el modelo de desde a hasta (s), sobre la persona pnj (ox, oy, oz en su marco, su giro + giro, su tamaño × escala) o en x, y, z; texto = la línea texto en t (s), como aviso; sonido = el sonido de la casa sonido en t.",
      fields: { secuencia: ID, n: { kind: "int", min: 0, max: LIM_SECUENCIA.pistas - 1 }, tipo: { kind: "enum", values: TIPOS_PISTA }, pnj: { kind: "text", maxBytes: LIM.id, default: "" }, claves: { kind: "int", min: 0, max: LIM_SECUENCIA.claves, default: 0 }, modelo: MODELO, x: X0, y: ALTO_SEC, z: X0, ox: DESPLAZA, oy: DESPLAZA, oz: DESPLAZA, giro: GIRO, escala: ESCALA, desde: MOMENTO, hasta: MOMENTO, t: MOMENTO, texto: { kind: "text", maxBytes: LIM_SECUENCIA.texto, default: "" }, sonido: { kind: "enum", values: SOUNDS, default: "suave" } },
      announce: "silent",
    },
    clave: {
      describe: "Una clave de una pista mueve: dónde está esa persona en el segundo t (metros del mundo, giro en grados). Entre claves, una curva suave que no se pasa de ninguna; antes de la primera, en su sitio; tras la última, quieta ahí.",
      fields: { secuencia: ID, pista: { kind: "int", min: 0, max: LIM_SECUENCIA.pistas - 1 }, t: MOMENTO, x: X, y: ALTO_SEC, z: X, giro: GIRO },
      announce: "silent",
    },
  },
});
