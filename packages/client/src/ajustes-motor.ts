// ajustes-motor (N2): the engine's own settings, as data. The page attaches what each one does (apps/plaza/menu-ajustes.ts);
// features add theirs with `ajustes` in defineFeature, worlds with their JSON (docs/EXTENDER.md «Añadir un ajuste»).
// Defaults by tier follow limits.json and H12 (phones and headsets start cool: no shadows, no HDR, few particles);
// defaults by capability carry the system's preferences (V7): reduced motion, more contrast, save-data.
import type { AjusteDecl } from "../../feature/src/ajustes.ts";

/** The engine's groups, in menu order. Features and worlds add one group each (their id). */
export const GRUPOS_MOTOR: readonly { id: string; nombre: string }[] = [
  { id: "graficos", nombre: "Gráficos" },
  { id: "sonido", nombre: "Sonido" },
  { id: "controles", nombre: "Controles" },
  { id: "accesibilidad", nombre: "Accesibilidad" },
  { id: "interfaz", nombre: "Interfaz" },
  { id: "privacidad", nombre: "Privacidad" },
];

const ENTORNO = { "graficos.sombras": null, "graficos.agua": null, "graficos.particulas": null, "graficos.hdr": null };
const H5 = "Llega con H5: todavía no suena nada en el mundo.";

export const AJUSTES_MOTOR: AjusteDecl[] = [
  // ---- Gráficos (H12 parity: resolution, shadows, post-processing; power.ts does the drawing side) ----
  {
    grupo: "graficos", id: "calidad", tipo: "eleccion", nombre: "Calidad",
    describe: "Nitidez y fluidez máximas. Automática: la elige el motor según tu aparato y la baja sola si se calienta.",
    opciones: [{ valor: "auto", nombre: "Automática" }, { valor: "baja", nombre: "Baja (fresca)" }, { valor: "media", nombre: "Media" }, { valor: "alta", nombre: "Alta" }],
    defecto: "auto",
    // choosing a quality also sets the environment's four settings; «Automática» gives them back to the device's defaults
    preajuste: {
      auto: ENTORNO,
      baja: { "graficos.sombras": "no", "graficos.agua": "simple", "graficos.particulas": "pocas", "graficos.hdr": false },
      media: { "graficos.sombras": "baja", "graficos.agua": "simple", "graficos.particulas": "normal", "graficos.hdr": false },
      alta: { "graficos.sombras": "alta", "graficos.agua": "reflejos", "graficos.particulas": "muchas", "graficos.hdr": true },
    },
  },
  {
    grupo: "graficos", id: "resolucion", tipo: "numero", min: 50, max: 100, paso: 5, unidad: "%", nombre: "Resolución",
    describe: "Qué parte de la nitidez de la calidad elegida se dibuja. Menos: más fresco y más rápido.", defecto: 100,
  },
  {
    grupo: "graficos", id: "fpsMax", tipo: "eleccion", nombre: "Cuadros por segundo, máximo",
    describe: "Tope mientras algo se mueve. Automático: lo pone la calidad (60 en escritorio, 30 en móvil).",
    opciones: [{ valor: "auto", nombre: "Automático" }, ...["24", "30", "45", "60", "72", "90", "120"].map((v) => ({ valor: v, nombre: v }))],
    defecto: "auto",
  },
  {
    grupo: "graficos", id: "bateria", tipo: "bool", nombre: "Modo batería",
    describe: "24 cuadros por segundo y resolución contenida: gasta y calienta menos. También con la tecla B.",
    defecto: { valor: false, si: [{ requiere: ["ahorroDatos"], valor: true }] },
  },
  {
    grupo: "graficos", id: "estadisticas", tipo: "bool", nombre: "Estadísticas en pantalla",
    describe: "Dibujo, cuadros por segundo, ping y huella, arriba a la izquierda. Apagadas salvo en escritorio con ?debug.",
    // U23: off for everyone (a phone never gets four lines over its icon bar); a desktop opened with ?debug starts with them on
    defecto: { valor: false, si: [{ requiere: ["debug", "!movil"], valor: true }] },
  },
  // the environment (H4, view.entorno.calidad): shown only where the environment exists and offers each one
  {
    grupo: "graficos", id: "sombras", tipo: "eleccion", nombre: "Sombras", requiere: ["entorno.sombras"],
    describe: "Sombras del sol. En móvil y en visor empiezan apagadas para que no se calienten.",
    opciones: [{ valor: "no", nombre: "Sin sombras" }, { valor: "baja", nombre: "Baja" }, { valor: "media", nombre: "Media" }, { valor: "alta", nombre: "Alta" }],
    defecto: { valor: "no", nivel: { A: "media" } },
  },
  {
    grupo: "graficos", id: "agua", tipo: "eleccion", nombre: "Agua", requiere: ["entorno.agua"],
    describe: "Agua sencilla o con destellos del sol (los dos son el agua de color plano del motor; nunca dibujan la escena otra vez).",
    opciones: [{ valor: "simple", nombre: "Sencilla" }, { valor: "reflejos", nombre: "Con destellos" }],
    defecto: { valor: "simple", nivel: { A: "reflejos" } },
  },
  {
    grupo: "graficos", id: "particulas", tipo: "eleccion", nombre: "Partículas", requiere: ["entorno.particulas"],
    describe: "Cuántas chispas, polvo y luces pequeñas se dibujan a la vez.",
    opciones: [{ valor: "pocas", nombre: "Pocas" }, { valor: "normal", nombre: "Normal" }, { valor: "muchas", nombre: "Muchas" }],
    defecto: { valor: "pocas", nivel: { A: "normal" } },
  },
  {
    grupo: "graficos", id: "hdr", tipo: "bool", nombre: "Cielo HDR", requiere: ["entorno.hdr"],
    describe: "Luz del cielo de alto rango: más realista y más pesada. Sin ella en móvil y en visor.",
    defecto: { valor: false, nivel: { A: true } },
  },
  // ---- Sonido: stored and readable now; the mixer that uses them is V6/H5 ----
  { grupo: "sonido", id: "general", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: "Volumen general", describe: "El volumen de todo lo que suena en el mundo.", defecto: 80, nota: H5 },
  { grupo: "sonido", id: "musica", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: "Música", describe: "El volumen de la música del mundo.", defecto: 60, nota: H5 },
  { grupo: "sonido", id: "efectos", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: "Efectos", describe: "El volumen de los efectos: pasos, puertas, avisos.", defecto: 80, nota: H5 },
  { grupo: "sonido", id: "voz", tipo: "numero", min: 0, max: 100, paso: 5, unidad: "%", nombre: "Voz de las personas", describe: "El volumen de la gente que habla cerca de ti.", defecto: 100, nota: "Llega con H5 y la voz por cercanía (M17)." },
  // ---- Controles: the camera applies them through view.cam.ajustar (N1); shown only where it can ----
  {
    grupo: "controles", id: "sensibilidad", tipo: "numero", min: 25, max: 300, paso: 5, unidad: "%", nombre: "Sensibilidad de la cámara",
    describe: "Lo rápido que gira la cámara con el ratón, el dedo o el mando.", defecto: 100, requiere: ["camara"],
  },
  {
    grupo: "controles", id: "invertirY", tipo: "bool", nombre: "Invertir el eje vertical",
    describe: "Mover el ratón o la palanca hacia arriba mira hacia abajo, como en un avión.", defecto: false, requiere: ["camara"],
  },
  {
    grupo: "controles", id: "zonaMuerta", tipo: "numero", min: 0, max: 50, paso: 5, unidad: "%", nombre: "Zona muerta del mando",
    describe: "Cuánto hay que mover una palanca antes de que cuente. Más: ignora el temblor de palancas gastadas; menos: respuesta más fina.", defecto: 15, requiere: ["camara", "mando"],
  },
  {
    grupo: "controles", id: "modoMovimientoVR", tipo: "eleccion", nombre: "Dirección al andar en VR",
    describe: "Hacia dónde tira la palanca izquierda del visor: tu mirada, tu mando, o tu cuerpo (mirar no cambia el rumbo).",
    opciones: [{ valor: "mirada", nombre: "Según la mirada" }, { valor: "mando", nombre: "Según el mando" }, { valor: "cuerpo", nombre: "De lado (según el cuerpo)" }],
    defecto: "mirada", requiere: ["xrVr"],
  },
  // Rediseño v2 (story E): the VR menu's «Ajustes» — the same rows on the computer and in the headset
  {
    grupo: "controles", id: "giroVR", tipo: "eleccion", nombre: "Giro en VR",
    describe: "Cuánto gira la vista con cada empujón de la palanca derecha del visor.",
    opciones: [{ valor: "15", nombre: "15°" }, { valor: "30", nombre: "30°" }, { valor: "45", nombre: "45°" }],
    defecto: "30", requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "velocidadVR", tipo: "numero", min: 40, max: 100, paso: 10, unidad: "%", nombre: "Velocidad al andar en VR",
    describe: "Lo deprisa que te lleva la palanca izquierda del visor. Menos: más cómodo si te mareas.", defecto: 100, requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "confortVR", tipo: "numero", min: 0, max: 100, paso: 10, unidad: "%", nombre: "Viñeta de confort en VR",
    describe: "Cuánto se oscurecen los bordes de la vista mientras te mueves o giras. 0: nada.", defecto: 80, requiere: ["xrVr"],
  },
  {
    grupo: "controles", id: "alturaVR", tipo: "numero", min: -30, max: 60, paso: 10, unidad: "cm", nombre: "Altura en VR",
    describe: "Sube o baja tu vista en el visor; súbela si juegas sentado.", defecto: 0, requiere: ["xrVr"],
  },
  { grupo: "controles", id: "teclaAjustes", tipo: "tecla", soloVer: true, nombre: "Abrir y cerrar los ajustes", describe: "La tecla que abre este menú. Escape también lo cierra.", defecto: "KeyO" },
  { grupo: "controles", id: "teclaDensidad", tipo: "tecla", soloVer: true, nombre: "Cambiar la densidad de interfaz", describe: "La tecla que pasa de Mínimo a Normal, a Completo y vuelta.", defecto: "KeyU" },
  { grupo: "controles", id: "teclaBateria", tipo: "tecla", soloVer: true, nombre: "Modo batería", describe: "La tecla que enciende y apaga el modo batería.", defecto: "KeyB" },
  // ---- Accesibilidad (V7, V11, V1): the system's preferences are the first defaults ----
  {
    grupo: "accesibilidad", id: "menosMovimiento", tipo: "bool", nombre: "Menos movimiento",
    describe: "Nada se mueve solo: sin saltitos ni animaciones de la interfaz. Empieza como lo tenga tu sistema.",
    defecto: { valor: false, si: [{ requiere: ["menosMovimiento"], valor: true }] },
  },
  { grupo: "accesibilidad", id: "textoGrande", tipo: "bool", nombre: "Texto grande", describe: "Letra más grande en paneles, botones y avisos (18 px en vez de 13).", defecto: false },
  {
    grupo: "accesibilidad", id: "altoContraste", tipo: "bool", nombre: "Alto contraste",
    describe: "Paneles negros con letra blanca y bordes marcados. Empieza como lo tenga tu sistema.",
    defecto: { valor: false, si: [{ requiere: ["masContraste"], valor: true }] },
  },
  {
    grupo: "accesibilidad", id: "anunciar", tipo: "bool", nombre: "Anunciar lo que pasa",
    describe: "Tu lector de pantalla lee lo que pasa cerca (gestos, avisos). Los avisos de seguridad se leen siempre.", defecto: true,
  },
  // ---- Interfaz ----
  {
    grupo: "interfaz", id: "tamano", tipo: "numero", min: 75, max: 200, paso: 25, unidad: "%", nombre: "Tamaño de la interfaz",
    describe: "Escala de botones, paneles y textos de la pantalla (no la del mundo).", defecto: 100,
  },
  {
    // U26: a short tick when a finger presses a button of the screen (apps/plaza/pulsaciones.ts); only where it can vibrate
    grupo: "interfaz", id: "vibrar", tipo: "bool", nombre: "Vibrar al tocar un botón", requiere: ["vibracion", "tactil"],
    describe: "Un toque corto del aparato al pulsar un botón de la pantalla con el dedo.", defecto: true,
  },
  {
    grupo: "interfaz", id: "densidad", tipo: "eleccion", nombre: "Densidad de interfaz",
    describe: "Cuánto se ve mientras juegas. Mínimo: la misión de ahora, el chat plegado y la acción de lo que miras. Cambia al vuelo con U.",
    opciones: [{ valor: "minimo", nombre: "Mínimo" }, { valor: "normal", nombre: "Normal" }, { valor: "completo", nombre: "Completo" }],
    defecto: "normal",
  },
  {
    grupo: "interfaz", id: "hora", tipo: "eleccion", nombre: "Hora del reloj",
    describe: "El reloj junto al minimapa: la hora de tu aparato o la hora universal (UTC), la misma para todos.",
    opciones: [{ valor: "local", nombre: "Local" }, { valor: "utc", nombre: "UTC" }], defecto: "local",
  },
  // ux2-barra: was the «N» button under the minimap; a setting now (the minimap keeps no buttons)
  { grupo: "interfaz", id: "minimapaGira", tipo: "bool", nombre: "El minimapa gira con la cámara", describe: "Apagado: el norte siempre arriba. Encendido: lo que tienes delante queda arriba.", defecto: false },
  { grupo: "interfaz", id: "ayuda", tipo: "bool", nombre: "Ayuda de teclas", describe: "La línea de abajo que dice qué tecla hace qué.", defecto: true },
  // U25: the device profile, forced (development or ?debug only: `desarrollo`). The page decides it once before the
  // first frame (packages/client/src/aparato.ts), so a change reloads the page. ?aparato=… does the same for one load.
  {
    grupo: "interfaz", id: "aparato", tipo: "eleccion", nombre: "Aparato (desarrollo)", requiere: ["desarrollo"],
    describe: "Para qué aparato se dispone la interfaz. Automático: el tuyo. Un móvil elegido en un escritorio se dibuja dentro de un marco de 390×844.",
    opciones: [{ valor: "auto", nombre: "Automático" }, { valor: "escritorio", nombre: "Escritorio" }, { valor: "movil-vertical", nombre: "Móvil vertical" }, { valor: "movil-horizontal", nombre: "Móvil horizontal" }, { valor: "vr", nombre: "Visor VR" }],
    defecto: "auto", nota: "Recarga la página al cambiarlo. Solo en desarrollo o con ?\u2060debug.",
  },
  // ---- Privacidad (T1: Pablo records sessions to learn from real devices; the person can say no) ----
  {
    grupo: "privacidad", id: "informe", tipo: "bool", nombre: "Enviar el informe de la sesión",
    describe: "Cuenta al servidor cómo entraste y cómo va (aparato, navegador, cuadros por segundo), sin IP ni datos personales.", defecto: true,
  },
];
