// misiones — declarations (J5 + the generic J4 interaction). Two features from one folder, one engine behind:
//   pnj       people of the world (PNJ): talk to them from close by; their dialogue depends on your quests
//   misiones  your quest book (only to you, saved by guest) and the quest things in the world (take or use)
// What exists (quests, people, things) comes from the adventure's text files (formato.ts; docs/EXTENDER.md).
import { defineFeature } from "../../packages/feature/src/index.ts";
import { LIM, MUNDO, TIPOS_PASO } from "./formato.ts";

const ID = { kind: "text", maxBytes: LIM.id } as const;
const X = { kind: "fixed", min: -MUNDO, max: MUNDO, step: 0.01 } as const;
const MODELO = { kind: "text", maxBytes: 64, default: "" } as const;
const ESCALA = { kind: "fixed", min: 0.05, max: 50, step: 0.01, default: 1 } as const;
const DESCRIPCION = { kind: "text", maxBytes: LIM.descripcionCosa, default: "" } as const;
const MOTIVO = { kind: "text", maxBytes: 160 } as const;

export const pnj = defineFeature({
  id: "pnj",
  version: 1,
  level: "base",
  describe: "Personas del mundo que no son jugadores (PNJ). Se les habla de cerca y contestan con un diálogo de opciones, igual para todos y decidido por el servidor, que cambia según tus misiones. Las escribe la aventura (pnj@1).",
  state: {
    describe: "Una entrada por persona (clave = su id): nombre, dónde está, hacia dónde mira (grados), a qué distancia se le habla (m) y su modelo (sha256 de un .glb; vacío = el robot de la casa).",
    fields: { nombre: { kind: "text", maxBytes: LIM.nombre }, descripcion: DESCRIPCION, x: X, z: X, giro: { kind: "fixed", min: -180, max: 180, step: 0.1, default: 0 }, radio: { kind: "fixed", min: 0.5, max: 16, step: 0.1, default: 3 }, modelo: MODELO, escala: ESCALA },
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
  version: 1,
  level: "base",
  describe: "Misiones: encargos por pasos (llegar a un sitio, hablar con alguien, usar o coger algo, entregarlo) que da una persona y que comprueba el servidor. Tu libro llega solo a ti y se guarda por invitado. Las escribe la aventura (mision@1, cosa@1).",
  store: { describe: "El progreso de cada invitado (`p:<id>`): misiones activas con su paso y lo que lleva cogido, las completadas y la que sigue. Solo le llega a su dueño, como eventos." },
  state: {
    describe: "Las cosas de las misiones que hay en el mundo (clave = su id): nombre, dónde, a qué distancia se usan (m), el aviso que sale al lado («coger la caja») y su modelo (vacío = el bloque de la casa).",
    fields: { nombre: { kind: "text", maxBytes: LIM.nombre }, descripcion: DESCRIPCION, x: X, z: X, radio: { kind: "fixed", min: 0.5, max: 16, step: 0.1, default: 2 }, aviso: { kind: "text", maxBytes: LIM.aviso }, modelo: MODELO, escala: ESCALA },
    card: { role: "objeto", name: "{nombre}", description: "{descripcion}", at: ["x", "z"], actions: ["usar"], interact: { intent: "usar", prompt: "{aviso}", radius: "radio", key: "cosa" } },
  },
  intents: {
    aceptar: { describe: "Aceptar una misión que ofrece alguien que tienes al lado.", spoken: "aceptar una misión", fields: { mision: ID } },
    abandonar: { describe: "Dejar una misión activa (se pierde lo avanzado en ella).", spoken: "abandonar una misión", fields: { mision: ID } },
    seguir: { describe: "Seguir una misión activa: su objetivo se marca en el mundo y en el mapa (vacío = no seguir ninguna).", spoken: "seguir una misión", fields: { mision: { kind: "text", maxBytes: LIM.id, default: "" } } },
    usar: { describe: "Coger o usar una cosa de una misión que tienes al lado.", spoken: "coger o usar algo", fields: { cosa: ID }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    libro: { describe: "Llega tu libro entero (al entrar y tras cada cambio): olvida el anterior; detrás vienen sus misiones y sus pasos.", fields: { activas: { kind: "int", min: 0, max: 64 }, hechas: { kind: "int", min: 0, max: 1000 } }, announce: "silent" },
    mision: {
      describe: "Una misión de tu libro: activa (paso = el que toca, desde 0) o hecha; seguida = la que marcas.",
      fields: { id: ID, titulo: { kind: "text", maxBytes: LIM.titulo }, descripcion: { kind: "text", maxBytes: LIM.descripcion }, estado: { kind: "enum", values: ["activa", "hecha"] }, paso: { kind: "int", min: 0, max: LIM.pasos }, pasos: { kind: "int", min: 1, max: LIM.pasos }, seguida: { kind: "bool" }, recompensa: { kind: "text", maxBytes: 120, default: "" } },
      announce: "silent",
    },
    paso: {
      describe: "Un paso de una misión de tu libro y dónde está su objetivo (x, z, donde = su nombre; que = el id de la persona o la cosa).",
      fields: { mision: ID, n: { kind: "int", min: 0, max: LIM.pasos - 1 }, texto: { kind: "text", maxBytes: LIM.textoPaso }, tipo: { kind: "enum", values: TIPOS_PASO }, hecho: { kind: "bool" }, x: X, z: X, donde: { kind: "text", maxBytes: LIM.lugar }, que: { kind: "text", maxBytes: LIM.id, default: "" } },
      announce: "silent",
    },
    aceptada: { describe: "Aceptaste una misión.", fields: { mision: ID, titulo: { kind: "text", maxBytes: LIM.titulo }, texto: { kind: "text", maxBytes: LIM.textoMision, default: "" } }, announce: { text: "Misión nueva: {titulo}. {texto}", sound: "magia", importance: 1 } },
    avance: { describe: "Hiciste un paso de una misión.", fields: { mision: ID, texto: { kind: "text", maxBytes: LIM.textoPaso } }, announce: { text: "Hecho: {texto}", sound: "exito", importance: 1 } },
    completada: {
      describe: "Completaste una misión (y lo que te llevas).",
      fields: { mision: ID, titulo: { kind: "text", maxBytes: LIM.titulo }, texto: { kind: "text", maxBytes: LIM.textoMision, default: "" }, recompensa: { kind: "text", maxBytes: 120, default: "" } },
      announce: { text: "Misión completada: {titulo}. {texto} {recompensa}", sound: "campana", importance: 2 },
    },
    aviso: { describe: "Algo de tus misiones que conviene saber (dejaste una, ya no sigues ninguna…).", fields: { texto: { kind: "text", maxBytes: 160 } }, announce: { text: "{texto}", sound: "suave", importance: 1 } },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué.", fields: { motivo: MOTIVO }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
