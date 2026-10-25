// The PP1 page: one plaza, your capsule, everyone else's, and the determinism probe.
import { version as versionPaquete } from "../../package.json"; // only this field reaches the page (docs/VERSIONES.md)
import { hex } from "../../packages/core/src/index.ts";
import { referenceRecording, replayFingerprint, TICK_HZ, STICK_MAX, BTN_JUMP, BTN_RUN } from "../../packages/sim/src/index.ts";
import { botonesDeVuelo } from "./vuelo-teclas.ts";
import { CIERRE_LLENO, CIERRE_SILENCIO, LATIDO_MS, webSocketClient } from "../../packages/net/src/index.ts";
import { BARRIDO_MS, VigiaServidor } from "../../packages/client/src/vigia-servidor.ts"; // t_9cb3f636: the page notices the server went silent
import { montarAjustes, leerAjuste } from "./menu-ajustes.ts"; // N2: settings menu + capabilities
import { montarCiudad } from "./ciudad.ts"; // t_5cff4f06: the corner button back to the city (a world's own ciudadUrl)
import { montarMenuVR } from "./xr-menu.ts"; // rediseño v2: the VR wrist watch and menu (story E)
import mundoPlaza from "./mundo.ajustes.json";
import { montarPulsaciones } from "./pulsaciones.ts"; // U26: a press you can see (and feel) on every button
import { crearTienda, type CachesLike } from "./manifiesto.ts";
import { carga, estadoCarga, piezasPendientes, sueloPendiente, TOPE_CARGA_MS } from "./carga.ts"; // MVL3 step 1: fades out the 2D "Cargando" screen once the first frame is drawn
import { ClientSession, serverUrl, tomarPaseDeLaDireccion } from "../../packages/client/src/index.ts";
import { createView, leerAparato, leerBateria, medidorDeCuadros, haciaMundo } from "../../packages/render/src/index.ts";
import { mensajeFalloAR } from "../../packages/render/src/ar.ts"; // J8: a clear sentence when AR fails to start
import funciones from "../../features/cliente.ts";
import { constructor } from "../../features/objetos/client.ts";
import { chatDePagina } from "../../features/chat/client.ts";
import { montarConstructor } from "./constructor.ts";
import { montarConstructorVR } from "./constructor-xr.ts";
import { montarReaccionClic } from "./reaccion-clic.ts"; // lote 5: a click on a moñoni makes it hop
import { sonar as sonarLocalPlaza } from "./sonar.ts";
import { montarSoltar } from "./soltar.ts";
import { montarAvatar } from "./avatar.ts"; // H10: your avatar — house or uploaded .vrm, for every visitor
import { montarHuecos } from "./huecos.ts";
import { montarFlecha } from "./flecha.ts"; // T3: the arrow that points at the button of the current mission step
import { montarGemelos } from "./gemelos.ts"; // H6: the HTML twin of the pictures placed in the world (screen readers, agents)
import { enlaceAbrible, montarEnlaces } from "./enlaces.ts"; // J4: click on a thing with a link opens it (new tab, after confirming)
import { disparadores } from "../../features/disparadores/client.ts"; // D-041: the cable — controller
import { montarCable } from "./cable.ts"; // D-041, historias 5-6 + C: builder's live view + the cable as a sentence with blanks
import { contextoDelCable } from "../../features/disparadores/cable-contexto.ts"; // what those blanks may choose (pure)
import { movedores } from "../../features/movedores/client.ts"; // the movers a «mueve» receiver may name
import { montarVideoMandos } from "./video-mandos.ts";
import { avataresDelMundo, catalogoDeAvatares, idAvatarDe } from "./catalogo-avatares.ts"; // not "./a…": dev:lan proxies every path starting with /a to the server
import { montarChat } from "./chat.ts";
import { escribiendo } from "./escribiendo.ts";
import { misiones } from "../../features/misiones/client.ts";
import { montarInteraccion, construyendo } from "./interactuar.ts";
import { montarDialogo } from "./dialogo.ts";
import { montarVerNombres } from "./nombres-ver.ts";
import { montarLibro, ponerAvisosMundo, ponerCatalogoCasa } from "./misiones.ts";
import { anunciar, crearDialogo } from "./paneles.ts"; // S6: el texto accesible de cada sonido (XAUR)
import { montarMenuBarra } from "./menu-barra.ts"; // ux2-barra: the bar's «Cámara» (P) and «Menú» (O) drop-downs
import { estadoCamara, filasDeAyuda } from "./menu-logica.ts";
import { crearSonidos, ponerSonidos, RUTA_TABLA, sonidos } from "../../packages/render/src/audio/sonidos.ts"; // S6: the house catalogue (its table comes from /sonidos.json; the files are served by their sha256)
import { montarMapa } from "./mapa.ts";
import { crearIrAndando, frase } from "../../packages/client/src/ir-andando.ts";
import { montarFicha } from "./ficha.ts";
import { avatarQueLlevas, lineaDeTu } from "./tu-logica.ts"; // «Tú»: which house avatar you wear, for its portrait
import { montarObjetivo } from "./objetivo.ts";
import { montarCombate, fuentesDeLucha } from "./combate.ts";
import { montarInventario, resumenTexto } from "./inventario.ts"; // Y1: the Inventario panel (L)
import { inventarioCtl } from "../../features/inventario/client.ts";
import { ambiente } from "../../features/entorno/client.ts";
import { interruptor as interruptorBase } from "../../features/espaciobase/client.ts"; // H8: the «Espacio base» switch and «Restaurar el mundo»
import { interruptores as interruptoresFunciones } from "../../features/funciones/client.ts"; // f1: the world's feature switches (normas, dardos, pesca), read and flipped from `__numinia.funciones`
import { interruptor as interruptorNaturaleza } from "../../features/naturaleza/client.ts"; // the «Naturaleza» switch in the builder's Entorno section
import { elementos } from "../../features/elementos/client.ts";
import { ajusteDeEstado, enlaceVigente } from "../../features/dardos/enlace.ts"; // dardos enlazados (E1): the setting only (a few lines); the connection is its own chunk (./dardos-enlace.ts)
import { dardos } from "../../features/dardos/client.ts"; // dardos v1: the controller; its throwing view (apps/plaza/dardos.ts) loads with the first board
import { lucha } from "../../features/lucha/client.ts"; // L1: the controller (golpear); the creature is drawn by view.place like any thing
import { pesca } from "../../features/pesca/client.ts"; // pesca v1: the controller; its HUD (apps/plaza/pesca.ts) and 3D load with the first spot
import { bienes, comprobar } from "../../features/bienes/client.ts"; // N10: goods that are yours (signed receipt), in the sheet's «Inventario»
import { montarBienes } from "./bienes.ts";
import { montarEntorno } from "./entorno.ts";
import { montarFichaMundo } from "./ficha-mundo.ts"; // H7: the form of the world's settings (inside the «Entorno» drawer)
import { ajustes as ajustesMundo } from "../../features/ficha-mundo/client.ts"; // H7: the world's settings as the server says (title, picture, default avatar, people limit)
import { montarDirector } from "./director.ts";
import { dirigir } from "../../features/director/client.ts";
import { ambienteDeEscena } from "../../features/director/feature.ts";
import { montarGente } from "./gente.ts";
import { rumboHacia } from "./foto-nucleo.ts"; // ux2-gente: «Saludar» turns you towards them first
import { viajar } from "../../features/teletransporte/client.ts";
import { llamarPagina } from "../../features/llamar/client.ts"; // ia-llamar S11: how each AI is called and the intent behind «Hablar con ella» / E
import { montarLlamarIA } from "./llamar-ia.ts"; // ia-llamar S11: the notice and the box of «Hablar con ella», and the prompt «E: hablar con…»
import { burbujaPagina } from "../../features/burbuja/client.ts"; // ia-llamar S9: the shape of each AI's action bubble and the «entras» that flashes it
import { iaPagina } from "../../features/ia/client.ts"; // ia-visible S3: the public card of each AI (state, who answers, what it may do)
import { asiento, interruptor as interruptorAsiento } from "../../features/asiento/client.ts"; // asiento v1: sitting down for real
import { burbujas, interruptor as interruptorBurbujas } from "../../features/burbujas/client.ts"; // burbujas v1: voice bubbles
import { montarBurbuja } from "./burbuja.ts";
import { baculo, interruptor as interruptorBaculo } from "../../features/baculo/client.ts"; // baculo v1: the Director's staff
import { dados, interruptor as interruptorDados } from "../../features/dados/client.ts"; // dados v1: dice the server rolls
import { montarDados } from "./dados.ts";
import { contadores } from "../../features/contadores/client.ts"; // D-044: timers and counters everyone sees
import { montarContadores } from "./contadores.ts";
import { cerraduras } from "../../features/cerradura/client.ts"; // D-042: a lock that opens with a code (keypad) or a key
import { puertas } from "../../features/puertas/client.ts"; // S6s: doors only to hear them open and close
import { montarCerradura } from "./cerradura.ts";
import { pantallasWeb } from "../../features/web/client.ts"; // N17: web screens (the controller)
import { montarWeb } from "./web.ts";
import { ancestros } from "../../features/ancestros/client.ts"; // ancestros v1: the Salón de los Ancestros and the hologram of the tribute to Asimov (the controller)
import { montarAncestros } from "./ancestros.ts";
import { montarVoz } from "./voz.ts";
import { montarPantalla } from "./pantalla.ts";
import { montarCondicionesXR } from "./condiciones-xr.ts"; // condiciones/c4: the same bubble as a panel inside the headset
import { montarCondiciones } from "./condiciones.ts"; // condiciones/c3: the bubble of entry (only when the world's gate is on; the server decides)
import { montarGraboso } from "./graboso.ts"; // M18b: the relic that records what you see (K)
import { icono } from "./iconos.ts";
import { rotularBoton } from "./menu-secciones-ui.ts"; // v2 paridad: the bar reads the one list of sections
import { nombreDe, seccion, tituloDe } from "../../packages/render/src/menu-secciones.ts";
import { gestosDePagina } from "../../features/gestos/client.ts";
import { FAVORITOS_INICIALES } from "../../features/gestos/movimientos.ts";
import { montarRueda } from "./rueda.ts";
import { montarXR } from "./xr.ts";
import { aplicarTema } from "./tema-mundo.ts"; // a world's look (ficha@1 `tema`): an event's colours and title face
import { montarFoto } from "./foto.ts"; // N13: photo mode (P): hide the interface, frame, filter, PNG, share, a link to the place
import { esTactil, perfil, montarMarco } from "./perfil-aparato.ts"; // U25: the device profile (touch, small screen, VR), one answer for the whole page
import { montarNovedades } from "./novedades.ts"; // t_bdc2c2db: «qué hay de nuevo» card, once per version
import { crearListo, aspectoBoton, MOTIVO_PREPARANDO } from "./boton-listo.ts"; // MIS-200 (t_9687b5fc): the entry buttons wait for the world
import { esMovil, enZonaAndar, ZONA_ANDAR_MOVIL } from "../../packages/client/src/movil.ts"; // U24: the phone layout (apps/plaza/movil.ts) and its rules

const params = new URLSearchParams(location.search);
// U25: a phone profile forced on a desktop (?aparato=movil-vertical, development or ?debug): this page becomes a frame
// that loads the world again at phone size, and starts nothing itself (no view, no connection) — it stops here.
if (montarMarco()) await new Promise<never>(() => {});
const hud = document.getElementById("hud")!;
const url = serverUrl(location, import.meta.env.PROD); // the built page (Caddy or the engine itself) always talks to its own origin
// v9: the socket opens now, not after /status and the 3D view: its handshake (TLS + upgrade, several round trips on a headset's wifi) runs
// while the page builds the view, and the server's welcome waits in the transport until the session is there to read it.
const transport = webSocketClient(url);
transport.opened.catch(() => {}); // the message for the player is set below, where the HUD is; this one only keeps the early rejection from being «unhandled»
// H1: files of things in the world come from the instance's server by their sha256 (ws://h:p -> http://h:p/a/<sha256>.glb)
const activos = new URL(url.replace(/^ws/, "http")).origin;
// M16: the zone's manifest (every file with its sha256 and size) and the files the browser already holds by hash: a reload downloads nothing it has seen
const tienda = crearTienda({ origen: activos, caches: typeof caches !== "undefined" ? (caches as unknown as CachesLike) : null });
// S6: the house sound catalogue — one small JSON from the INSTANCE'S server (`${activos}/sonidos.json`, the same
// origin the files come from: that way `dev:lan`, Caddy or a world on another host need no extra proxy rule), and
// from then on the seven notices are FILES on the «interfaz» bus with no panner. Until the table lands, `sonarCasa`
// keeps its oscillator notes, and every notice keeps its text in the live region either way (XAUR, WCAG 2.2).
const catalogoSonidos = ponerSonidos(crearSonidos({ ruta: `${activos}${RUTA_TABLA}` }));
ponerCatalogoCasa(catalogoSonidos);
void catalogoSonidos.cargar().then((hay) => {
  // los ocho avisos, descodificados ya: el primer «Misión completada» no llega tarde (son 18 kB entre todos)
  if (hay) void catalogoSonidos.precargar(Object.values(catalogoSonidos.tabla()?.casa ?? {}));
});
// S6f: el sonido que decide el SERVIDOR. Arranca tocando solo por fichero (lo que había) y lo cambia por la puerta
// única en cuanto `./sonidos.ts` se carga: así las 47 recetas de `sintesis.ts` no entran en el paquete de arranque.
type PeticionSonido = { id: string; semilla?: number; donde?: { x: number; y: number; z: number } | null; texto?: string };
let sonarServidor: (s: PeticionSonido) => boolean = (s) => catalogoSonidos.suena(s);
// H7: the world's settings (its aventura/ficha.json, served by GET /status): its name on the entry screen and the tab,
// everyone's avatar when it names one, how many fit (`aforo`). Asked once, before the first draw, but never waited for
// long: a slow or absent /status leaves the house defaults (the tab name and the look are fixed again below when it answers).
// S6f: `audio` es lo que el mundo pide del sonido (R-1: una línea en su ficha.json lo enciende). `ambiente` = el id
// del catálogo que suena como cama única en bucle (hoy «ambiente-numinia», el colchón CC0); `ambiente_ganancia` = su
// volumen (×0,042 por defecto, el que quiso su autor); `ambiente_sintetizado` = las camas y capas SINTETIZADAS que
// este mundo enciende por nombre (de serie, ninguna).
type Estado = { dardosEnlace?: unknown; version?: string; nombre?: string; tema?: unknown; avatar?: string; avatares?: unknown; aforo?: number; conectados?: number;
  audio?: { ambiente?: string | null; ambiente_ganancia?: number; ambiente_sintetizado?: string[]; avisos?: Record<string, string> } };
const estadoP: Promise<Estado | null> = fetch(`${activos}/status`).then((r) => r.json() as Promise<Estado>).catch(() => null);
const estado = await Promise.race([estadoP, new Promise<null>((ok) => setTimeout(() => ok(null), 1500))]);
ponerAvisosMundo(estado?.audio?.avisos); // t_d7411a07: the sound of each quest notice the world picked (ficha.json → audio.avisos)
void estadoP.then((e) => ponerAvisosMundo(e?.audio?.avisos)); // a slow /status (past the 1.5 s) still sets them
// H4: a world with an espacio base shows the line mesh drawing itself on the loading screen (apps/plaza/carga.ts); any other keeps the moon
carga.etapa("codigo");
const pintarEstadoCarga = (st: { espacioBase?: boolean } | null) => { if (st?.espacioBase) carga.espacioBase(); carga.etapa("estado"); };
pintarEstadoCarga(estado);
void estadoP.then(pintarEstadoCarga); // a slow /status (past the 1.5 s) still turns the mesh on, late
if (estado?.nombre) { document.title = estado.nombre; hud.textContent = `Conectando a «${estado.nombre}»…`; }
const enMovil = esMovil(perfil().clase); // U24: the phone layout: the joystick owns the left third, a bigger stick, the rest of the screen looks
const catalogoAvatares = catalogoDeAvatares(activos, params, estado?.avatar);
// H10: montarAvatar() below needs `session` and `view`, both built after this; the hook itself is only read each
// frame (avatares.ts sync()), so a holder filled in later is enough — nothing calls it before montarAvatar runs.
let avatarUI: ReturnType<typeof montarAvatar> | null = null; // ux2-barra: also abrirSelector()/alternarSelector() for story B («Tú»)
const view = await createView(document.body, { forceWebGL: params.has("webgl2"), arMaxMs: Number(params.get("armax")) || undefined, battery: params.has("bateria"), maxFps: Number(params.get("fps")) || undefined, movil: perfil().forzado ? perfil().movil : undefined, assetUrl: (m) => `${activos}/a/${m}.glb`, lods: (sha) => tienda.lods(sha), leer: (u) => tienda.leer(u),
  avatares: { catalogo: catalogoAvatares, yo: () => session.entity, eleccion: (c) => avatarUI?.eleccion(c) } }); // J1: VRM avatars (session exists by the first draw); H7: the world's default avatar; H10: your own choice
carga.etapa("vista"); // H4
view.naturaleza.tablaFauna(() => import("../../features/naturaleza/fauna-casa.ts").then((m) => m.FAUNA_CASA)); // F4: the house fauna table, fetched only with the fauna
// game features (J7): their client parts, and how they may draw (a label, a hop) over any avatar
// I1: the guest token stays in this browser (no account, no personal data); private mode = a new guest each time
const GUARDA = "numinia.invitado";
const session = new ClientSession(transport, {
  features: funciones,
  pase: tomarPaseDeLaDireccion(location, history), // H3b: #pass=<token> from numinia.com, out of the address bar at once, sent once connected
  identity: { load: () => localStorage.getItem(GUARDA), save: (t) => localStorage.setItem(GUARDA, t) },
  view: {
    label: (e, text, ms) => view.label(e === session.entity ? "self" : e, text, ms),
    bounce: (e, ms) => view.bounce(e === session.entity ? "self" : e, ms),
    beacon: (x, z, text, ms) => view.beacon(x, z, text, ms),
    ajuste: (id) => leerAjuste(id), // N2: a feature reads its own settings (menu-ajustes.ts)
    // H1: things placed in the world, and where I am (a builder puts things in front of me)
    place: (key, o) => view.place(key, o),
    here: () => { if (session.entity < 0) return null; const p = session.selfPosition(0); return { x: p.x, y: 0, z: p.z }; },
    // J3: names over heads and speech bubbles (features/chat)
    nameTag: (e, text) => view.nameTag(e === session.entity ? "self" : e, text),
    bubble: (e, text, ms) => view.bubble(e === session.entity ? "self" : e, text, ms),
    // J5: a name that stays over a person of the world
    tag: (key, t) => view.tag(key, t),
    // H4/H8: the zone's environment and its elements (water, fire, smoke, dust)
    entorno: (v) => view.entorno.aplicar(v),

    naturaleza: (v) => void view.naturaleza.aplicar(v), // N4
    espacioBase: (v) => void view.espacioBase.aplicar(v), // H2

    elemento: (k, v) => view.elementos.poner(k, v),
    // N18: what each person wears (features/bienes): a good's model in a hand or on the head
    lleva: (e, v, ranura) => view.vestir(e === session.entity ? "self" : e, v, ranura),
    // D-045: a fade when the server puts me back on a safe spot (features/suelo); the live region reads the announcement
    fundido: (ms) => { const f = document.getElementById("fundido")!; f.style.transition = "none"; f.style.opacity = "1"; f.offsetHeight; f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = "0"; f.dataset.ultimo = String(Date.now()); },
    // J7b: the moves of the wheel, played on the avatar's VRM (false = a capsule: the feature shows a label)
    movimiento: (e, m) => view.movimiento(e === session.entity ? "self" : e, m),
    orientar: (e, r) => view.orientar(e === session.entity ? "self" : e, r), // asiento: whoever sits faces where the seat looks
    // S6: a sound the SERVER chose (features/sonido): its id and its seed, so every page plays the same variant at
    // the same instant. `donde: null` = in the head, with no panner (the notices and the interface). The accessible
    // text ALWAYS reaches the notices region, whether the file played or not (XAUR: no sound without its text).
    // S6f: por la PUERTA ÚNICA — si el id tiene fichero en el catálogo gana el fichero; si no, la receta de
    // `sintesis.ts` con la MISMA semilla del servidor (así todas las páginas eligen la misma variante). La puerta
    // llega con `./sonidos.ts`, que se carga aparte (las 47 recetas no entran en el paquete de arranque): hasta
    // entonces, los sonidos del servidor suenan por fichero, que es lo que había.
    sonido: (s) => {
      const son = sonarServidor(s);
      if (s.texto) anunciar(s.texto);
      return son;
    },
    // V1: every announced event reaches screen readers (polite; safety = assertive). V3 adds the engine's own voice.
    announce: (a) => {
      if (a.feature === "chat") return; // J3: the chat box's own list (role=log, polite) reads the chat
      if (a.feature === "director" && a.event === "narracion") return; // N6: the narrator's banner (a live region) reads it
      if (a.feature === "misiones" && a.event === "completada") return; // U14 (6): the «Misión completada» banner (a live region) reads it
      const box = document.getElementById(a.importance >= 3 ? "avisos-urgentes" : "avisos")!;
      const p = document.createElement("p"); p.textContent = a.text; box.appendChild(p);
      while (box.childElementCount > 3) box.firstElementChild!.remove();
    },
  },
});
transport.opened.catch(() => { hud.textContent = `No llego al servidor ${url}.\n¿Está arrancado (npm run server)?`; });
// H7: the door was closed because the world is full (ficha `aforo`): say so where everyone reads it (the HUD and the
// alert region for screen readers), with the way out; the page does not reconnect by itself
let conexionCerrada = false; // t_9cb3f636: the socket closed for good: the silence notice gives way to the final one
void transport.closed.then((c) => {
  conexionCerrada = true;
  if (c.code === CIERRE_SILENCIO) { // t_9cb3f636: the server stopped hearing this page (a stall, a lost network): it let go of the avatar
    hud.hidden = true;
    const aviso = document.getElementById("mundo-lleno")!;
    aviso.textContent = "Se cortó la conexión con el mundo. Vuelve a cargar la página para entrar de nuevo."; aviso.hidden = false;
    return;
  }
  if (c.code !== CIERRE_LLENO) return;
  const n = /(\d+)\/(\d+)/.exec(c.reason), nombre = estado?.nombre ? `«${estado.nombre}»` : "Este mundo";
  const texto = `${nombre} está lleno${n ? ` (${n[2]} persona${n[2] === "1" ? "" : "s"} como mucho)` : ""}. Espera un rato y vuelve a cargar la página.`;
  hud.hidden = true; // the statistics block would repaint over any text put there
  const aviso = document.getElementById("mundo-lleno")!;
  aviso.textContent = texto; aviso.hidden = false; // role=alert: screen readers read it at once
});

// condiciones/c5: whoever else is still reading the norms is drawn inside a bubble with «<name> · leyendo las normas…»; the server only says so when it changes (nothing with the gate off).
session.onLeyendo = (entidad, si) => view.leyendo(entidad, si);

// M18: videos (and sounds) follow the SERVER's clock, so every page is at the same second whatever its computer's hour says
view.fijarRelojMundo(() => session.relojServidorMs());

// ia-visible S4: an AI's plate is always on, green, with an «IA» chip (and a moon asleep); the server's public card says who is one and its state.
// Nothing is made in a world without AIs: this only fires when an entry appears, changes or goes.
iaPagina.alCambiar((quien, ficha) => view.ia(quien === session.entity ? "self" : quien, ficha ? ficha.estado : null));

// ia-llamar S9: the action bubble of each AI, drawn with the shape, radius and visibility the server publishes (nothing is made in a world without AIs);
// «entras» (YOU crossed its edge) makes it flash for a moment. Who is inside is the server's: the page only draws.
burbujaPagina.alCambiar((quien, b) => view.burbuja(quien === session.entity ? "self" : quien, b, iaPagina.de(quien)?.estado === "dormida"));
burbujaPagina.alEntrar((ia) => view.burbujaDestello(ia === session.entity ? "self" : ia));

// condiciones/c3: with the world's gate on, the server sends its conditions after you join and you stand in a bubble until you accept;
// with it off it sends nothing and this does nothing. The gate itself is the server's; here the walking input is also held still.
const condiciones = montarCondiciones({ session, mundo: () => nombreDelMundo, decir: (t) => anunciar(t), ciudadUrl: () => ciudad.url, cerrarConexion: () => transport.close(), movil: () => enMovil,
  vr: { soportado: () => vrDisponible, activo: () => view.vr.active, entrar: () => { if (view.vr.state === "off") void view.vr.enter().then((ok) => { if (!ok) session.report({ k: "xr", modo: "vr", accion: "falla", detalle: view.vr.lastError }); }); } } });
let vrDisponible = false; // set once the browser says it can present VR (below); the bubble then offers its own «Entrar en VR»

// ---- the features' actions: a key on desktop, a button on touch screens; the help line lists them ----
const acts = session.features.actions();
// a button shows only while its action is possible (`Action.disponible`): the `hidden` attribute, which the bar's own rules do not beat (tema.css `#acciones button[hidden]`); re-asked when the shared state changes
const botonesAccion: { a: (typeof acts)[number]; b: HTMLButtonElement }[] = [];
let versionAcciones = -1;
const refrescarAcciones = (): void => {
  const v = session.features.stateVersion;
  if (v === versionAcciones) return;
  versionAcciones = v;
  for (const { a, b } of botonesAccion) { const oculto = a.disponible ? !a.disponible() : false; if (b.hidden !== oculto) b.hidden = oculto; }
};
setInterval(refrescarAcciones, 250);
addEventListener("keydown", (e) => { if (!e.repeat && !escribiendo(e)) acts.find((a) => a.key === e.code)?.run(); }); // J3: typing in a box is not an action
if (esTactil()) {
  document.getElementById("help")!.textContent = "Dedo a la izquierda: andar · a la derecha: mirar · dos dedos: acercar"; // N1: the touch map only
  const bar = document.getElementById("acciones")!;
  for (const a of acts.filter((x) => x.feature !== "gestos")) { // J7b: on touch the gestures live in the wheel's button (rueda.ts)
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a.label; b.title = a.describe ?? "";
    b.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); a.run(); }); // not a joystick touch
    bar.appendChild(b); botonesAccion.push({ a, b });
  }
} else if (acts.length) {
  // U3: the action bar (bottom centre) also lists them on a desktop: a chip with the name and its key; the key still does the work
  const bar = document.getElementById("acciones")!;
  for (const a of acts) {
    const b = document.createElement("button");
    b.type = "button"; b.title = a.describe ?? ""; if (a.key) b.setAttribute("aria-keyshortcuts", a.key.replace(/^Key/, ""));
    const t = document.createElement("span"); t.textContent = a.label; b.append(t);
    if (a.key) { const k = document.createElement("kbd"); k.textContent = a.key.replace(/^Key/, ""); b.append(k); }
    b.addEventListener("click", () => { a.run(); b.blur(); });
    bar.appendChild(b); botonesAccion.push({ a, b });
  }
  versionAcciones = -1; refrescarAcciones();
  document.getElementById("help")!.textContent += " · " + acts.map((a) => `${(a.key ?? "").replace(/^Key/, "")} ${a.label.toLowerCase()}`).join(" · ") + " · G (mantén): movimientos";
}

// ---- H1 + M22: the builder, for whoever may build (the server says so on entering): panel, gizmo, grab ----
const constructorUI = montarConstructor(constructor, view, document.getElementById("construir") as HTMLButtonElement, document.getElementById("panel-construir")!,
  { volver: () => mapa.volver(), puedeVolver: () => mapa.puedeVolver(),
    mundo: () => ({ disparadores: disparadores.lista(), cerraduras: cerraduras.cerraduras(), contadores: contadores.lista() }), abrirCable: () => cable.mostrar(),
    alAbrir: (q) => { misiones.hace(q === "construir" ? "abre_construir" : q === "anadir" ? "abre_biblioteca" : "abre_cable"); }, // T1: only sent while a step asks for it
    subir: () => soltar.elegir(), // C3, C4, ux2-dock: the card, «Lógica», «Subir»; `mapa`, `cable` and `soltar` are built below, only read later
    // MIS-241: «Objetos del mundo» goes next to the object with the map's own jump (so the map's «Volver» takes you back), and says where you stand
    ir: (d) => { if (!mapa.puedeIr()) return false; mapa.ir({ ...d, id: `c:objetos:${d.id}` }); return true; },
    yo: () => (session.entity >= 0 ? session.selfPosition(1) : null) });
// ---- M22b-3: the same builder, picked and moved with a VR controller's ray instead of a mouse ----
const constructorVR = montarConstructorVR(constructor, view);
// ---- lote 5: a plain click on a moñoni of the plaza makes it hop (local; the builder's click is its own) ----
const panelConstruir = document.getElementById("panel-construir")!;
const reaccionClic = montarReaccionClic({ view, objetos: () => constructor.lista(), construyendo: () => !panelConstruir.hidden, sonar: (id) => { sonarLocalPlaza(id, { gain: 0.3 }, 150); } });
// ---- H9: drop your own .glb on the world (or «Añadir › Subir» in the builder's dock): uploaded by sha256, placed for everyone ----
const soltar = montarSoltar({ session, view, puede: () => constructor.estado.puede, origen: activos, billete: () => localStorage.getItem(GUARDA) });
// ---- H10: your avatar — one of the house's or your own .vrm (everyone, not only builders); saved with your identity ----
avatarUI = montarAvatar({ session, catalogo: catalogoAvatares, delMundo: avataresDelMundo(activos, estado?.avatares), origen: activos, billete: () => localStorage.getItem(GUARDA) });
// ---- U12: holes — click one (or E near it) and choose your picture: it goes up and the server fits it into the frame ----
let elegirObraVR: (id: string) => void = () => {}; // MIS-222: the VR menu's «Obra» view (below, once the menu exists)
const huecos = montarHuecos({ constructor, view, rellenar: soltar.rellenar, decir: (t) => soltar.decir(t), panel: constructorUI.ranuraFicha, vr: { activo: () => view.vr.active, elegir: (id) => elegirObraVR(id) } });
// ---- J4: a thing may carry a link (set in the inspector); a click on it opens it in a new tab, after confirming ----
const enlaces = montarEnlaces({ constructor, view, construyendo: () => construyendo(view) });
const gemelos = montarGemelos({ constructor, session, view, enlaces, abrible: enlaceAbrible }); // H6: «Imágenes del mundo», read by the screen reader; `__numinia.gemelos.lista()` for agents
const cable = montarCable({ constructor, disparadores, aqui: () => (session.entity >= 0 ? session.selfPosition(1) : null), decir: (t) => soltar.decir(t), panel: constructorUI.cajon("cable"),
  // what the blanks of the sentence may choose: the world's own things (the server still checks every choice on save)
  contexto: () => contextoDelCable({ objetos: constructor.lista(), movedores: movedores.lista(), misiones: misiones.libro(), sonidos: catalogoSonidos.tabla() }) });
// ---- D-042: a code lock opens its own keypad (HTML); a key lock keeps the plain J4 flow ----
const cerradurasPagina = montarCerradura({ cerradura: cerraduras });
// ---- U14: mandos del vídeo — pausar/reanudar (E, clic o el mando en VR) y mi propio volumen (deslizador, pantalla plana) ----
const videoMandos = montarVideoMandos({ lista: () => constructor.lista(), controlVideo: (id) => view.controlVideo(id), panel: document.getElementById("video-mandos")! });
montarEntorno(ambiente, elementos, view, interruptorNaturaleza, constructorUI.cajon("entorno"), interruptorBase, constructor, [
  { id: "baculo", etiqueta: "Báculo del Director", titulo: "Encender o apagar el báculo del Director de juego de este mundo (quien lo lleva dirige) para todos. Solo lo ve y lo cambia quien dirige aquí o manda. Se guarda en baculos.json. / Turn the Game Director's staff on or off for the whole world.", encendida: "Báculo del Director encendido.", apagada: "Báculo del Director apagado.", interruptor: interruptorBaculo },
  { id: "asientos", etiqueta: "Asientos", titulo: "Encender o apagar los asientos de este mundo («E» junto a un asiento y te sientas) para todos. Solo lo ve y lo cambia quien dirige aquí o manda. Se guarda en asientos.json. / Turn the seats on or off for the whole world.", encendida: "Asientos encendidos.", apagada: "Asientos apagados.", interruptor: interruptorAsiento },
  { id: "burbujas", etiqueta: "Burbujas de voz", titulo: "Encender o apagar las burbujas de voz de este mundo (dentro de una, solo se oyen entre sí los que están dentro; es privacidad de oído, no cifrado) para todos. Solo lo ve y lo cambia quien dirige aquí o manda. Se guarda en burbujas.json. / Turn the voice bubbles on or off for the whole world.", encendida: "Burbujas de voz encendidas.", apagada: "Burbujas de voz apagadas.", interruptor: interruptorBurbujas },
  { id: "dados", etiqueta: "Dados", titulo: "Encender o apagar los dados de este mundo (la torre de dados y /tirar) para todos. Solo lo ve y lo cambia quien dirige aquí o manda. Se guarda en dados.json. / Turn the dice on or off for the whole world.", encendida: "Dados encendidos.", apagada: "Dados apagados.", interruptor: interruptorDados },
], interruptoresFunciones); // H4/H8: environment and elements, inside the builder's «Entorno» drawer (ux2-dock)
// H7: the world's settings (title, picture, default avatar, people limit): the form below the switches (only who may), and the title in the tab follows the server
montarFichaMundo({ ajustes: ajustesMundo, padre: constructorUI.cajon("entorno"), avatares: catalogoAvatares?.modelos.map((m) => ({ id: m.id, nombre: m.nombre })) ?? [] });
montarBurbuja({ burbujas, cartel: document.getElementById("burbuja-cartel")! }); // burbujas v1: the small label while you are inside a bubble
montarDados({ dados, yo: () => (session.entity >= 0 ? session.selfPosition(1) : null) }); // dados v1: the dice card everyone near sees, the dice buttons beside a tower
const contadoresPagina = montarContadores({ contadores, yo: () => (session.entity >= 0 ? session.selfPosition(1) : null) }); // D-044: the counters' panel (the sign in the world is the feature's own label)
montarDirector({ dj: dirigir, ambiente, view }); // N6: the Game Director (who may direct: STD-052 manage-rituals): scenes, narrator, summons
// ---- N16: «Gente» (L): go next to someone connected now; the light of every trip near you (none on tier D) ----
// ux2-gente: friends kept in this browser, the sheet of whoever you pick, and the small card when you click someone in the
// world (gente-tarjeta.ts). Silenciar = voz.ts drops their voice here; Bloquear = /bloquear; Denunciar = /denunciar.
const distanciaA = (q: number): number | null => { if (session.entity < 0) return null; const r = session.remotePositions().find((x) => x.id === q); if (!r) return null; const y = session.selfPosition(1); return Math.hypot(r.x - y.x, r.z - y.z); };
const llamarIA = montarLlamarIA({ llamar: llamarPagina, ia: iaPagina, burbuja: burbujaPagina, distancia: distanciaA, nombre: (q) => chatDePagina.nombres.get(q) ?? null, idioma: () => document.documentElement.lang });
const gente = montarGente({ viajar, llamar: { puede: llamarIA.puede, hablar: llamarIA.hablar }, barra: document.getElementById("barra-arriba"), orden: (t) => chatDePagina.decir(t),
  mundo: () => estado?.nombre ?? "",
  ia: iaPagina, idioma: () => document.documentElement.lang,
  baliza: (q, texto) => { const r = session.remotePositions().find((x) => x.id === q); if (!r) return { ok: false, why: "No sé dónde está desde aquí." }; view.beacon(r.x, r.z, texto, 60_000); return { ok: true }; }, // ia-visible S7: where trips are off, «Ir hacia ella» marks where the AI is
  mirada: {
    avatar: (q) => avatarUI?.deQuien(q) ?? null,
    distancia: distanciaA,
    actividad: (q) => (pesca.flotadores().some((f) => f.quien === q) ? "Pescando" : gestosDePagina.deQuien(q) === "bailar" ? "Bailando" : null),
    nombre: (q) => chatDePagina.nombres.get(q) ?? null,
    baculo: (q) => baculo.lleva(q), // features/baculo: the staff badge next to the name of whoever directs
    burbuja: (q) => burbujas.de(q)?.etiqueta ?? null, // features/burbujas: the voice-bubble icon next to who is inside
  },
  voz: { silenciar: (q, si) => voz.silenciar(q, si), silenciado: (q) => voz.silenciado(q) },
  chat: (t) => cajaChat.abrir(t),
  saludar: (q) => { // turn towards them (the camera; the body follows it when you move) and wave: the house «saludar»
    const r = session.remotePositions().find((x) => x.id === q), y = session.entity >= 0 ? session.selfPosition(1) : null;
    if (r && y) view.cam.mirarHacia(rumboHacia(y.x, y.z, r.x, r.z));
    return gestosDePagina.hacer("saludar");
  },
  vista: view });
setTimeout(() => gente.pedir(), 3000); // once after joining: voices you silenced on an earlier visit stay silent
viajar.alDestello((d) => view.teletransporte.lanzar({ ...d, clave: d.quien === session.entity ? "self" : d.quien }));
const webPagina = montarWeb({ web: pantallasWeb, view }); // N17: web screens — iframe in the world (PC/phone), card + «Abrir fuera» in VR
const ancestrosPagina = montarAncestros({ ancestros, view }); // ancestros v1: the hall in 3D, the two panels, and the law + our rule on screen when the hologram answers you
// ---- pesca v1: nothing of it is in the start bundle; the HUD and the 3D arrive with the first fishing spot or float ----
let pescaHud: Promise<unknown> | null = null, pescaPagina: unknown = null; // N4: pescaPagina.manos (VR rod, gamepad) for the e2e
pesca.alCambiar(() => { if (!pesca.sitios().length) return; /* f2: fishing switched off: nothing to load */ pescaHud ??= import("./pesca.ts").then((m) => (pescaPagina = m.montarPesca({ pesca, view, session, hud: document.getElementById("pesca-hud")!, interaccion: () => interaccion }))).catch((e) => console.warn(`[pesca] no se pudo cargar la página de pesca: ${(e as Error)?.message ?? e}`)); });
// ---- dardos enlazados (E1): AR in ANY world shows the darts board of another one (the Alchemist Tower), through a second, light connection
// that exists only once something asks for it (./dardos-enlace.ts is its own chunk). What the link is = the engine's constant unless this world's
// dardos.json says otherwise (/status `dardosEnlace`); a world never links to itself nor when it has an AR board of its own. E2 puts the UI on it.
let ajusteEnlace = ajusteDeEstado(estado?.dardosEnlace);
let enlaceDardos: Promise<import("./dardos-enlace.ts").EnlaceDardosPagina> | null = null;
const dardosEnlace = {
  /** The link this page would use right now (`enlace` null + `motivo` when none): read-only, loads nothing. */
  vigente: () => enlaceVigente({ ajuste: ajusteEnlace, servidorActual: url, sitios: dardos.sitios() }),
  /** The link object (state, conectar, jugarEnPared, salir, cerrar, aceptar…), loading its chunk the first time; null when the link does not apply. */
  async enlace() {
    const v = dardosEnlace.vigente(); if (!v.enlace) return null;
    const e = v.enlace;
    return (enlaceDardos ??= import("./dardos-enlace.ts").then((m) => m.crearEnlaceDardos({ enlace: e, view, nombre: () => session.who?.nombre ?? "Invitado", mundo: () => nombreDelMundo || document.title })));
  },
};

// ---- dardos v1: the throwing view (mouse, flick, keys) and «En tu pared (AR)» arrive with the first dartboard ----
let dardosHud: Promise<unknown> | null = null;
dardos.alCambiar(() => { if (!dardos.sitios().length) return; /* f2: darts switched off: nothing to load */ dardosHud ??= import("./dardos.ts").then((m) => m.montarDardos({ dardos, view, session, hud: document.getElementById("dardos-hud")! })).catch((e) => console.warn(`[dardos] no se pudo cargar la página de dardos: ${(e as Error)?.message ?? e}`)); });

// ---- S6f: todo suena por UNA puerta — el fichero del catálogo si lo hay, y si no la receta sintetizada; los botones,
// mis pasos, mi salto y mi aterrizaje son locales, y lo compartido (puerta, dados, dardos, pez, teleport) lo manda el
// servidor. Perezoso, para que quede fuera del paquete de arranque. ----
void import("./sonidos.ts").then(async (m) => {
  const { crearPuerta, ponerPuerta } = await import("../../packages/render/src/audio/sonar.ts");
  const puerta = ponerPuerta(crearPuerta());
  sonarServidor = (s) => puerta.sonar(s.id, { semilla: s.semilla, donde: s.donde ?? null });
  m.montarSonidos({ session, cerraduras, pesca, suelo: () => view.entorno.estado().suelo?.tipo ?? null, misiones }, puerta);
  // El COLCHÓN de ambiente: solo si el mundo lo pide en su ficha (`audio.ambiente`), y con la ganancia que diga
  // (×0,042 por defecto, el volumen que quiso su autor). Encima manda el deslizador de «ambiente» del jugador: a cero,
  // ni arranca. Las camas y capas SINTETIZADAS siguen apagadas salvo las que el mundo nombre en `ambiente_sintetizado`.
  // The Director's scene can bring a bed of its own (escena@1 `ambiente`): it replaces the world's while the scene is on, and a
  // scene without one gives the world's back. Applied now (a scene may already be on) and at every scene change.
  const a = (await estadoP)?.audio;
  const ponerAmbiente = () => { if (a || dirigir.ambienteActual()) puerta.ambiente(ambienteDeEscena(dirigir.ambienteActual(), a)); };
  ponerAmbiente();
  dirigir.alCambiar((que) => { if (que === "actual") ponerAmbiente(); });
}).catch((e) => console.warn(`[sonidos] no se pudieron montar: ${(e as Error)?.message ?? e}`));

// ---- U10: the microphone (button or Q): your voice to who is near; theirs from where they stand ----
const voz = montarVoz({ session, view: { label: (t, text, ms) => view.label(t, text, ms), cam: view.cam, voz: (id, nivel) => view.voz(id, nivel) }, escribiendo, ajuste: leerAjuste, vr: { activo: () => view.vr.active, cerrada: () => condiciones.cerrada(), nota: (t) => view.vr.nota(t) }, decir: (t) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); const c = document.getElementById("chat-estado"); if (c) { c.textContent = t; setTimeout(() => { if (c.textContent === t) c.textContent = ""; }, 6000); } } });

// ---- M18b: the Graboso (button or K): out = recording what your camera sees + your microphone, 30–60 s hard cap, then a clip to download ----
const graboso = montarGraboso({ lienzo: view.renderer.domElement, view, xr: { presentando: () => view.renderer.xr.isPresenting, espejo: view.espejoGrabar }, barra: document.getElementById("barra-arriba"), permiso: { libre: () => inventarioCtl.grabosoLibre(), alCambiar: inventarioCtl.alCambiar }, decir: (t) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); const c = document.getElementById("chat-estado"); if (c) { c.textContent = t; setTimeout(() => { if (c.textContent === t) c.textContent = ""; }, 6000); } } });

// ---- J3: the chat box (Enter opens, Enter sends, Escape closes; a «Chat» button on touch screens) ----
const cajaChat = montarChat(chatDePagina, document.getElementById("chat")!);

// ---- M18 (trozo 2, local only): «Compartir pantalla» (button or P): your screen on the nearest video screen of the world,
// or in a floating window; only this page sees it — nothing is sent (apps/plaza/pantalla.ts) ----
const compartir = montarPantalla({
  view, escribiendo, construyendo: () => construyendo(view),
  yo: () => (session.entity >= 0 ? session.selfPosition(1) : null),
  nombreDe: (key) => String(constructor.objeto(key)?.nombre ?? ""),
  decir: (t) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); const c = document.getElementById("chat-estado"); if (c) { c.textContent = t; setTimeout(() => { if (c.textContent === t) c.textContent = ""; }, 6000); } },
});

// ---- J4/J5: what you can use from close by (E, a click, the prompt button), conversations, the quest book (J) ----
const interaccion = montarInteraccion({ session, view, boton: document.getElementById("interactuar") as HTMLButtonElement, ofrece: (f, k) => misiones.ofrece(f, k) && pesca.ofrece(f, k) && dardos.ofrece(f, k) && cerradurasPagina.ofrece(f, k) && lucha.ofrece(f, k), ocupado: () => !!misiones.dialogo(), locales: (x, z, y) => [...asiento.cerca(), ...huecos.cerca(x, z, y), ...cerradurasPagina.cerca(x, z), ...videoMandos.cerca(x, z), ...llamarIA.cerca()], pinchar: (key) => huecos.pinchar(key) || enlaces.pinchar(key),
  persona: (x, y) => { const q = view.pickPerson(x, y); return q !== null && gente.tarjeta(q); } }); // ux2-gente: a click on someone = their card
misiones.alCambiar(() => interaccion.mirar()); // a conversation opens or a step changes: the prompt follows at once
const xr = montarXR({ session, view, misiones, interaccion, enlaces, huecos }); // J4: + the ray points at things with a link and the trigger asks before opening // J10: hands in VR take, point and answer; what you took is in your hand
const condicionesXR = montarCondicionesXR({ condiciones, vr: view.vr as never, mundo: () => nombreDelMundo, soportado: () => vrDisponible }); // condiciones/c4
montarDialogo(misiones, document.getElementById("dialogo")!, view);
montarFlecha({ misiones }); // T3: idle costs nothing; with a step that points at a button it follows the button
const nombres = montarVerNombres(view); // U22: Alt / «Nombres» button / gamepad Back: every name; otherwise only who you look at and who speaks
misiones.alCambiar((que) => { if (que === "dialogo") view.hablando(misiones.dialogo() ? `pnj:${misiones.dialogo()!.pnj}` : null); }); // U22: the one you talk to shows its name
montarLibro(misiones, {
  boton: document.getElementById("misiones") as HTMLButtonElement, panel: document.getElementById("libro")!, linea: document.getElementById("mision-seguida")!,
  nota: document.getElementById("mision-nota")!, view, here: () => (session.entity >= 0 ? session.selfPosition(1) : null),
  oir: (fn) => session.features.tap(fn), ajuste: leerAjuste, // U14 (3): it opens by itself on accepting; a step done = a short sound
  banner: document.getElementById("mision-completada")!, // U14 (6): «Misión completada»
});

// ---- Y1: the Inventario panel (L, «Inventario»): what you carry and your Reserva; the sheet shows its summary ----
const inventario = montarInventario(inventarioCtl, document.getElementById("inventario-abrir") as HTMLButtonElement);

// ---- J5: minimap (corner), big map (M, «Mapa») and player sheet (I, «Ficha»); other branches' contracts are read
// from __numinia when present (misiones.objetivos/resumen, ajustes.abrir, chat.nombres) ----
const otros = () => (globalThis as unknown as { __numinia?: Record<string, unknown> }).__numinia ?? {};
// MIS-257 (t_fb535386): the map's «Ir» walks you there. ir-andando.ts only decides the direction each tick; readAxes below feeds it
// to the simulation as the stick, so walls and slopes work as for a person, and any hand on the controls stops it.
const andar = crearIrAndando({
  ahora: () => performance.now(),
  alTerminar: (f) => { if (f.motivo !== "cancelado" && f.motivo !== "llegada") anunciar(frase(f.motivo, f.destino.nombre)); mapa.andandoTermino(f); }, // the arrival is said by the map (quitarDestino)
});
let andarCorrer = false;
/** The id of a world object from a map marker's id (`c:objetos:<id>`); "" for anything else (a person, a mission, a spot). */
const idDeObjeto = (marca: string): string => (marca.startsWith("c:objetos:") ? marca.slice("c:objetos:".length) : "");
const mapa = montarMapa({ session, view, otros,
  andar: { ir: (d) => { const yo = session.entity >= 0 ? session.selfPosition(1) : null; return yo ? andar.empezar(d, yo) : { ok: false, motivo: "invalido" as const }; }, parar: () => andar.cancelar(), activo: () => andar.activo() },  alAgente: (q) => { mapa.cerrar(); if (view.personaEnPantalla(q) && gente.tarjeta(q)) return; gente.elegir(q); }, /* the big map is a modal dialog: close it so the card shows; an AI behind the camera gets her sheet in «Gente» instead */ alIr: (donde) => { constructorUI.alIr({ id: donde.id.replace(/^c:objetos:/, "") }); },
  /* MIS-240: a thing of the world picked on the map: «Editar» opens Construir on it (only when you may build and it is an object, not a person or a mission) */
  puedeEditar: (donde) => { const id = idDeObjeto(donde.id); return id !== "" && constructorUI.puedeEditar(id); }, alEditar: (donde) => constructorUI.editar(idDeObjeto(donde.id)), teletransporte: { activo: () => viajar.activo(), ir: (x, z, nombre) => viajar.irAPunto(x, z, nombre) } });
// ---- N13: photo mode (P or the camera button): the photo owns the screen and the keys; your avatar stands still ----
const foto = montarFoto({ view, yo: () => (session.entity >= 0 ? session.selfPosition(1) : null), mapa, boton: document.getElementById("foto-abrir") as HTMLButtonElement, volverA: () => document.getElementById("camara-abrir"), ocupado: () => dardos.tirando(),
  aparecer: { puede: () => (viajar.estado.recibido ? viajar.foto() : null), pedir: (s) => { viajar.aparecerEnFoto(s.x, s.y, s.z); } }, // N16: the world may put you at the photo's place
  decir: (t) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); } });
montarObjetivo({ lucha, interaccion });
montarCombate({ lucha }); // combate nivel 2: the three skill slots (keys 1–3) — hidden until the page hears of fighting
const fuentesLucha = fuentesDeLucha(lucha); // the character HUD's Estado and Carga come from the lucha client (hud-personaje.ts reads them from __numinia)
// ux2-barra: your sheet (I) opens from your card, top left (hud-personaje.ts); no «Ficha» under the minimap any more
// «Tú» (I): the avatar you wear (its portrait: tu-logica.ts) and the world's name, read when the sheet draws
const botonFicha = document.getElementById("hud-personaje-abrir") as HTMLButtonElement;
let nombreDelMundo = estado?.nombre ?? "";
ajustesMundo.alCambiar((a) => { if (a.nombre) { nombreDelMundo = a.nombre; document.title = a.nombre; } }); // H7: the owner renames the world → every tab
const miAvatar = () => avatarQueLlevas(catalogoAvatares?.modelos, avatarUI?.eleccion("yo"), session.entity);
const ficha = montarFicha({ session, view, desde: () => informe.bienvenidaMs, otros, avatar: miAvatar, mundo: () => nombreDelMundo,
  ...(catalogoAvatares?.modelos.length ? { cambiarAvatar: () => avatarUI?.abrir() } : {}) }, botonFicha);
montarBienes({ bienes, comprobar, ficha, boton: botonFicha, vitrina: (cv, model) => view.vitrina(cv, model) }); // N10: the sheet's «Inventario» = your goods, their receipts
// ---- U24: the phone layout (six controls while playing): only a phone profile loads it, desktop and VR never see it ----
if (enMovil) import("./movil.ts").then((m) => m.montarMovil({ interaccion, acciones: acts, saltar: pedirSalto, cajaChat, mapa, misiones, pesca, nombres, simulada: perfil().forzado && !matchMedia("(pointer: coarse)").matches })).catch((e) => console.warn(`[movil] no se pudo montar la disposición móvil: ${(e as Error)?.message ?? e}`));

// ---- determinism probe: replay the reference run here and compare with the server's number ----
const probe = { browser: -1, server: -1, ms: 0, done: false };
const runProbe = () => {
  const w = session.welcome!;
  const t0 = performance.now();
  probe.browser = replayFingerprint(referenceRecording(w.ref.seed, w.ref.ticks, w.ref.n));
  probe.ms = Math.round(performance.now() - t0);
  probe.server = w.ref.hash; probe.done = true;
};

// ---- input: keyboard and a touch joystick, both reduced to two int8 axes ----
const keys = new Set<string>();
addEventListener("keydown", (e) => { if (!escribiendo(e)) keys.add(e.code); }); // J3: typing never moves you
addEventListener("keyup", (e) => keys.delete(e.code)); // always: a key let go inside a box must not stay held
addEventListener("blur", () => keys.clear());
const joy = document.getElementById("joy")!, knob = document.getElementById("knob")!;
const JOY = enMovil ? { d: 130, k: 54, max: 52 } : { d: 110, k: 40, max: 45 };
if (enMovil) view.cam.ajustar({ zonaAndar: ZONA_ANDAR_MOVIL });
let touch: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || touch || view.cam.tieneDedo(e.pointerId)) return; // N1: right-half fingers turn the camera
  if (enMovil && !enZonaAndar(e.clientX, 0, innerWidth, ZONA_ANDAR_MOVIL)) return; // U24: outside the left third only the camera listens
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  joy.style.display = "block"; joy.style.left = `${e.clientX - JOY.d / 2}px`; joy.style.top = `${e.clientY - JOY.d / 2}px`;
});
addEventListener("pointermove", (e) => {
  if (!touch || e.pointerId !== touch.id) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y, len = Math.hypot(dx, dy), max = JOY.max, k = len > max ? max / len : 1;
  touch.dx = (dx * k) / max; touch.dy = (dy * k) / max;
  knob.style.left = `${(JOY.d - JOY.k) / 2 + touch.dx * max}px`; knob.style.top = `${(JOY.d - JOY.k) / 2 + touch.dy * max}px`;
});
const endTouch = (e: PointerEvent) => { if (touch && e.pointerId === touch.id) { touch = null; joy.style.display = "none"; } };
addEventListener("pointerup", endTouch); addEventListener("pointercancel", endTouch);
/** Let go of everything the flat page holds (keys, the touch stick): the headset took over or the tab went away. */
function soltarEntradaPlana(): void {
  if (keys.size) keys.clear();
  if (touch) { touch = null; joy.style.display = "none"; }
}
addEventListener("visibilitychange", () => { if (document.hidden) soltarEntradaPlana(); });

// ---- J7b: the movement wheel (hold G, «Movimientos» on touch, Y on a gamepad); while open nobody walks ----
const avisar = (t: string) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); };
const rueda = montarRueda({ gestos: gestosDePagina, favoritosIniciales: FAVORITOS_INICIALES, aviso: avisar,
  haciendo: () => view.avatares().lista.find((a) => a.id === "yo")?.movimiento ?? null });

/** MIS-257: is a hand on the controls (a key, the touch stick, the pad, the headset's stick, a jump)? Then the walk-by-itself gives way. */
function manoEnMandos(): boolean {
  const pad = view.cam.mando();
  return keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD") || keys.has("ArrowUp") || keys.has("ArrowDown") || keys.has("ArrowLeft") || keys.has("ArrowRight")
    || keys.has("Space") || saltoPendiente || touch !== null || !!(pad && (pad[0] || pad[1])) || (view.vr.active && Math.hypot(...view.vr.axes()) > 0.2);
}
function readAxes(): [number, number] {
  andarCorrer = false;
  if (andar.activo() && (condiciones.cerrada() || foto.activo())) andar.cancelar();
  if (andar.activo() && !rueda.abierta()) {
    const yo = session.entity >= 0 ? session.selfPosition(1) : null, e = yo ? andar.ejes(yo, manoEnMandos()) : null;
    if (e) { andarCorrer = e.correr; return [Math.round(e.x * STICK_MAX), Math.round(e.z * STICK_MAX)]; }
  }
  if (condiciones.cerrada()) { soltarEntradaPlana(); return [0, 0]; } // condiciones/c3: inside the bubble nobody walks (the server holds them too)
  if (rueda.abierta()) return [0, 0]; // J7b: choosing a move never walks (walking would end it)
  // motor-vr t_ab71cff0: while the headset presents, ITS input is the only source of movement. A flat-page input
  // left held when the headset took over (a touch whose pointerup never comes, a stale Gamepad-API pad, a key)
  // used to keep driving you whenever the VR stick sat at zero: measured on Pablo's Quest, 7.9 m/s in one fixed
  // direction with the controllers asleep and his hands tracked, until the world's edge. Drop them on the way in.
  if (foto.activo()) { soltarEntradaPlana(); return [0, 0]; } // N13: framing a photo, you stand still (the camera moves instead)
  if (view.vr.active) {
    soltarEntradaPlana();
    const [vx, vz] = view.vr.axes();
    return [Math.round(vx * STICK_MAX), Math.round(vz * STICK_MAX)];
  }
  let x = 0, z = 0;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
  if (touch) { x = touch.dx; z = touch.dy; }
  const pad = view.cam.mando(); // N1: a gamepad's left stick
  if (pad && (pad[0] || pad[1])) { x = pad[0]; z = pad[1]; }
  [x, z] = haciaMundo(x, z, view.cam.yaw()); // N1: W walks where the camera looks
  if (view.ar.state === "placed") { const [ax, az] = view.ar.axes(); if (ax || az) { x = ax; z = az; } } // J8b: walk on the table
  return [Math.round(x * STICK_MAX), Math.round(z * STICK_MAX)];
}

// ---- J2: Space jumps (again in the air: higher), Shift held runs; on touch screens a «Saltar» button and the stick
// pushed to its edge runs; in VR, A or X jumps and the stick at its edge runs. A tap waits for the next 20 Hz tick ----
let saltoPendiente = false;
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || escribiendo(e)) return;
  e.preventDefault(); // no scrolling, no clicking the focused button
  if (!e.repeat) saltoPendiente = true;
});
const pedirSalto = (): void => { saltoPendiente = true; }; // U24: the phone's big button (when nothing is near) and «…» jump through this
if (esTactil()) {
  const b = document.createElement("button");
  b.type = "button"; b.id = "saltar"; b.textContent = "Saltar"; b.title = "Saltar (otra vez en el aire: más alto)";
  let porToque = false;
  b.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); porToque = true; saltoPendiente = true; }); // not a joystick touch
  b.addEventListener("click", () => { if (!porToque) saltoPendiente = true; porToque = false; }); // screen readers click
  document.getElementById("acciones")!.prepend(b);
}
function readButtons(): number {
  let b = 0;
  if (condiciones.cerrada()) { saltoPendiente = false; return 0; } // condiciones/c3
  if (foto.activo()) { saltoPendiente = false; return 0; } // N13
  if (view.vr.takeJump() || view.ar.takeJump() || saltoPendiente) { saltoPendiente = false; if (!rueda.abierta()) b |= BTN_JUMP; }
  // RUN_EDGE close to 1: most of the stick's travel walks (human pace), only the very end runs
  // (was 0.9 — reached with barely half the throw, so there was no way to just walk).
  const RUN_EDGE = 0.97;
  if (andarCorrer) b |= BTN_RUN; // MIS-257: a long walk-by-itself runs (ir-andando.ts), the last stretch walks
  if (view.vr.active) { if (Math.hypot(...view.vr.axes()) >= RUN_EDGE) b |= BTN_RUN; return b; } // in VR only the headset's stick runs
  const alBorde = touch && Math.hypot(touch.dx, touch.dy) >= RUN_EDGE;
  if (keys.has("ShiftLeft") || keys.has("ShiftRight") || alBorde) b |= BTN_RUN;
  b |= botonesDeVuelo(keys, session.volando() && !rueda.abierta()); // H2: while flying a held Space climbs and a held Ctrl descends (on foot Space jumps once per press, above); the server decides who flies
  return b;
}

// ---- AR (J8): the button exists only where the device can do immersive-ar; no WebXR (iPhone) = no button ----
const arBtn = document.getElementById("ar") as HTMLButtonElement;
// MIS-200 (t_9687b5fc): both entry buttons wait while the world still loads (boton-listo.ts); once it is ready they stay ready
const listoEntrada = crearListo();
const entradaLista = (): boolean => listoEntrada.actualizar(view.cargando(), performance.now());
const arLabel = { off: "Entrar en AR", searching: "Mira una mesa o el suelo… (salir)", ready: "Toca para poner la plaza (salir)", placed: "La plaza en tu mesa · toca para moverla (salir)", mezclada: "Realidad mezclada (por VR)" };
const decirAviso = (t: string) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); };
view.arSupported().then((ok) => {
  if (!ok) return;
  arBtn.hidden = false; // the hidden ATTRIBUTE, not a style: the icon bar (tema.css) sets display on its buttons
  // the miniature (the plaza on your table): `enter()` must start the session in the click's own call stack (ar.ts), so nothing is awaited before it
  const entrarMiniatura = (): void => { void view.ar.enter().then((ok) => { if (!ok) { session.report({ k: "xr", modo: "ar", accion: "falla", detalle: view.ar.lastError }); decirAviso(mensajeFalloAR(view.ar.lastErrorName)); } }); };
  // dardos enlazados (E2): where the world has a link, the button opens a little chooser (the Tower's darts on your wall / the miniature). The
  // chooser is its own chunk, prefetched here so that opening it needs no wait; the darts' connection and norms are settled INSIDE it, before the
  // click that enters AR (ar-elegir.ts). No link (the Tower itself, `enlace: false`, an own AR board): the button is what it always was.
  let elegirAR: Promise<import("./ar-elegir.ts").ElegirAR> | null = null;
  const cargarElegir = (): Promise<import("./ar-elegir.ts").ElegirAR> => (elegirAR ??= import("./ar-elegir.ts").then((m) => m.crearElegirAR({
    enlace: dardosEnlace, view, condiciones: montarCondiciones, alMiniatura: entrarMiniatura, movil: () => enMovil, decir: decirAviso,
    falloAR: () => mensajeFalloAR(view.ar.lastErrorName), informarFallo: () => session.report({ k: "xr", modo: "ar", accion: "falla", detalle: view.ar.lastError }),
  })).catch((e) => { elegirAR = null; throw e; }));
  const sinElegir = (): void => { console.warn("[ar] no se pudo cargar la elección de AR: se entra con la maqueta"); };
  arBtn.onclick = () => {
    if (view.ar.state !== "off") { void view.ar.exit(); return; }
    if (!entradaLista()) { decirAviso(MOTIVO_PREPARANDO); return; }
    if (!dardosEnlace.vigente().enlace) { entrarMiniatura(); return; }
    // a link applies: the chooser. Its chunk is normally here already (prefetched below); if not, the chooser opens as soon as it has loaded (it enters AR on a later click anyway)
    void cargarElegir().then((c) => { if (view.ar.state === "off") void c.abrir(); }, sinElegir);
  };
  setTimeout(() => { if (dardosEnlace.vigente().enlace) void cargarElegir().catch(() => {}); }, 2500); // prefetch (the chunk only; nothing is connected)
});
setInterval(() => { // dardos v1: a minigame may hold the AR session
  const espera = !view.ar.jugando && view.ar.state === "off" && !entradaLista();
  const asp = aspectoBoton(!espera, view.ar.jugando ? "Dardos en tu pared (salir)" : arLabel[view.ar.state]);
  arBtn.textContent = asp.texto; arBtn.setAttribute("aria-disabled", String(asp.ariaDisabled));
  if (asp.titulo) arBtn.title = asp.titulo; else arBtn.removeAttribute("title");
}, 250);

// ---- VR (J6): same idea; the stick becomes the same two int8 intentions as keyboard and touch ----
const vrBtn = document.getElementById("vr") as HTMLButtonElement;
view.vrSupported().then((ok) => {
  if (!ok) return;
  vrDisponible = true;
  vrBtn.hidden = false;
  vrBtn.onclick = () => {
    if (view.vr.state !== "off") { void view.vr.exit(); return; }
    if (!entradaLista()) { decirAviso(MOTIVO_PREPARANDO); return; } // MIS-200 (t_9687b5fc): the world is still loading
    void view.vr.enter().then((ok) => { if (!ok) session.report({ k: "xr", modo: "vr", accion: "falla", detalle: view.vr.lastError }); });
  };
});
setInterval(() => { // the «…» menu's «Entrar en VR» clicks this button, so the gate above covers it too
  const espera = !view.vr.active && view.vr.state === "off" && !entradaLista();
  const asp = aspectoBoton(!espera, view.vr.active ? "Salir de VR" : "Entrar en VR");
  vrBtn.textContent = asp.texto; vrBtn.setAttribute("aria-disabled", String(asp.ariaDisabled));
  if (asp.titulo) vrBtn.title = asp.titulo; else vrBtn.removeAttribute("title");
}, 250);

// ---- the version, at the foot of the settings (Pablo, 16-10: «la versión, 0.1…, sin branding»): the semantic version
// of package.json (docs/VERSIONES.md, STD-019), nothing else on screen; the server's build (/status `version`, «<commit>
// <date>», what /health, the installer and the world zip carry) only as the tooltip, for whoever helps with a fault ----
const versionMotor = document.getElementById("version-motor");
if (versionMotor) versionMotor.textContent = `v${versionPaquete}`;
montarNovedades(versionPaquete); // t_bdc2c2db: «qué hay de nuevo», una vez por versión que esta pestaña no haya visto
void estadoP.then((st) => {
  if (!st) return;
  if (st.nombre) nombreDelMundo = st.nombre;
  ajusteEnlace = ajusteDeEstado(st.dardosEnlace); // dardos enlazados: the link this world's server says (late /status: same)
  if (st.nombre) document.title = st.nombre; // ADR-074: the world's name (its aventura/ficha.json), also when Caddy or vite serve the page
  if (st.tema) aplicarTema(st.tema, document.documentElement); // its look: CSS variables tema.css reads; none = the house's
  if (versionMotor && st.version) versionMotor.title = `build ${st.version}`;
}).catch(() => {});

// ---- N1: full screen — a real button where the browser can do it (not iPhone), hidden while XR presents ----
const pantalla = document.getElementById("pantalla") as HTMLButtonElement;
if (document.fullscreenEnabled) {
  const pintar = () => {
    const oculto = view.vr.active || view.ar.state !== "off", texto = document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa";
    if (pantalla.hidden !== oculto) pantalla.hidden = oculto;
    if (pantalla.title !== texto) { pantalla.title = texto; pantalla.innerHTML = `${icono(document.fullscreenElement ? "corners-in" : "corners-out")}<span class="solo-lector">${texto}</span>`; } // U11: an icon; ux2-barra: an entry of «Menú»
  };
  pantalla.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  pantalla.classList.add("solo-icono");
  pantalla.onclick = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void document.documentElement.requestFullscreen().catch(() => {}); };
  addEventListener("fullscreenchange", pintar);
  setInterval(pintar, 1000);
  pintar();
}

// ---- T1: tell the server how this player entered and how it is going (device, browser, XR, frames, ping,
// battery; no personal data). The server keeps it per session: GET /sesiones, npm run sesiones. ?pulso=ms ----
const PULSO_MS = Math.max(1000, Number(params.get("pulso")) || 10_000);
const medidor = medidorDeCuadros();
medidor.vigilar(); // B5: a hidden or frozen page is a pause, not a freeze; Long Animation Frames where the browser has them
const informe: { entrada: boolean; bienvenidaMs: number; primerCuadroMs: number; errores: number; oculta: boolean; pulsos: number; carga?: { ocultaMs: number; msDesdeWelcome: number; piezas: number; pendientes: number; tope: boolean } } = { entrada: false, bienvenidaMs: 0, primerCuadroMs: 0, errores: 0, oculta: false, pulsos: 0 }; // C: `carga` = how the loading screen left (when, with how many pieces not ready, by the cap or not)
let bateria: { nivel: number; cargando: boolean } | null = null;
const modo = () => (view.vr.active ? "vr" : view.ar.state !== "off" ? "ar" : "plano");
const enviarEntrada = async () => {
  informe.entrada = true;
  const [vr, ar] = await Promise.all([view.vrSupported(), view.arSupported()]);
  const aparato = await leerAparato({ backend: view.backend, gpu: await view.gpu(), xr: { vr, ar } });
  const r = { k: "entrada", ...aparato, tiempos: { bienvenidaMs: informe.bienvenidaMs, primerCuadroMs: informe.primerCuadroMs, huellaMs: probe.ms }, huellaIgual: probe.browser === probe.server, origen: location.protocol.replace(":", ""), motorPagina: "plaza" };
  if (!session.report(r)) session.report({ ...r, ua: String(r.ua).slice(0, 60), gpu: String(r.gpu).slice(0, 60) }); // too long: shorter texts
};
setInterval(async () => {
  if (!informe.entrada) return;
  bateria = (await leerBateria()) ?? bateria;
  const s = session.stats, mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  session.report({
    k: "pulso", modo: modo(), ...medidor.ventana(), objetivoFps: view.vr.active || view.ar.state !== "off" ? view.xrHz() || 72 : view.power.stats.targetFps,
    hzXR: view.xrHz(), escala: view.power.scale, modoBateria: view.power.battery, rttMs: s.rttMs, correcciones: s.corrections, visibles: s.visible,
    oculta: informe.oculta || document.hidden, bateria: bateria ?? undefined, errores: informe.errores, memoriaMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : undefined,
  });
  informe.oculta = document.hidden; informe.pulsos++;
}, PULSO_MS);
addEventListener("visibilitychange", () => { if (document.hidden) informe.oculta = true; });
let modoAntes = "plano";
setInterval(() => { const m = modo(); if (m !== modoAntes) { session.report({ k: "xr", modo: m === "plano" ? modoAntes : m, accion: m === "plano" ? "sale" : "entra", detalle: m === "plano" ? "" : `${view.xrHz() || "?"} Hz` }); modoAntes = m; } }, 250);
const informarError = (mensaje: unknown, donde: string) => { informe.errores++; if (informe.errores <= 5) session.report({ k: "error", mensaje: String(mensaje).slice(0, 160), donde: donde.slice(0, 160) }); };
addEventListener("error", (e) => informarError(e.message, `${(e.filename ?? "").split("/").pop()}:${e.lineno}`));
addEventListener("unhandledrejection", (e) => informarError((e.reason as Error)?.message ?? e.reason, "promesa"));
let lastDrawAt = 0;

// ---- loop: fixed 20 Hz client ticks inside the display loop, drawing blends between ticks ----
const TICK_MS = 1000 / TICK_HZ;
let lastActive = 0, lastSig = "", cost: { calls: number; triangles: number; cpuMs?: number } = { calls: 0, triangles: 0 };
const signature = () => { const s = session.entity >= 0 ? session.selfPosition(0) : null; let h = s ? s.x + s.z + s.y * 7 : 0; for (const r of session.remotePositions()) h += r.x * 3 + r.z + r.y * 5; return h.toFixed(2); };
let last = performance.now(), acc = 0, frames = 0, fps = 0, fpsT = last;
setInterval(() => session.ping(), 1000);
// t_9cb3f636: the heartbeat. A background tab says so (its timers run slowly there), and says «I am back» the moment it is shown.
setInterval(() => session.latido(document.hidden), LATIDO_MS);
addEventListener("visibilitychange", () => session.latido(document.hidden));
// t_9cb3f636: the SERVER went silent (nothing received for ~1.5 s while the page is running and shown): say so in the world's connection
// notice (#mundo-lleno, role=alert) and take it away when traffic returns. The server itself waits 15 s before it lets go of a page, so
// a short stall heals by itself. No automatic reconnect yet: when the socket does close, the final «recarga» notice above stands.
{
  const vigia = new VigiaServidor(performance.now());
  let visto = session.oidoEn, mostrado = false;
  setInterval(() => {
    if (conexionCerrada || session.entity < 0) return;
    const ahora = performance.now();
    if (session.oidoEn > visto) { visto = session.oidoEn; vigia.recibido(visto); }
    vigia.barrer(ahora, document.hidden);
    if (vigia.callado === mostrado) return;
    mostrado = vigia.callado;
    const aviso = document.getElementById("mundo-lleno")!;
    if (mostrado) { aviso.textContent = "Sin respuesta del mundo… esperando a que vuelva la conexión."; aviso.hidden = false; }
    else aviso.hidden = true;
  }, BARRIDO_MS);
}
let mallaLista = false; // H4
let cargaOculta = false;
// B5: does the shared state ask for a ground (naturaleza / espacio base) that the view has not finished building? (`activa` of the view is true only after `aplicar` produced it)
const suelosPedidos = () => {
  let pideNaturaleza = false, pideBase = false;
  for (const [k, v] of session.features.allState()) {
    if (k === "naturaleza:mundo") pideNaturaleza = (v as { activa?: boolean } | null)?.activa !== false;
    else if (k === "espacio-base:mundo") pideBase = (v as { activa?: boolean } | null)?.activa !== false;
  }
  return { pideNaturaleza, pideBase };
};
view.loop((now) => {
  const dt = Math.min(250, now - last); last = now;
  acc += dt;
  while (acc >= TICK_MS) { const [mx, mz] = readAxes(); session.tick(mx, mz, readButtons()); acc -= TICK_MS; }
  // v9: the determinism probe (a replay, ~60 ms on a PC, ~230 ms at 4x slower CPU) runs after the first frame, not before it
  if (session.welcome && !probe.done && (informe.primerCuadroMs || document.hidden)) runProbe();
  if (session.welcome && !informe.bienvenidaMs) { informe.bienvenidaMs = Math.round(performance.now()); carga.etapa("bienvenida"); }
  const pedidos = cargaOculta ? null : suelosPedidos();
  const pendiente = pedidos ? sueloPendiente({ ...pedidos, naturalezaLista: view.naturaleza.activa, baseLista: view.espacioBase.activa }) : false; // B5: before this frame is drawn
  if (informe.bienvenidaMs && !mallaLista && !cargaOculta && carga.conMalla() && !pendiente && (view.espacioBase.activa || view.naturaleza.activa)) { mallaLista = true; carga.etapa("mundo"); } // H4 + B5: the ground (base or nature) is built
  if (probe.done && informe.primerCuadroMs && !informe.entrada) void enviarEntrada();
  // power policy (P2): skip the draw when hidden or when nothing changes; the 20 Hz ticks above never skip
  condicionesXR.tick(); // condiciones/c4: the bubble inside the headset (nothing to do unless the bubble is up and VR is presenting)
  const enSecuencia = misiones.cuadro(); // U14 (5): a sequence only this player sees moves its people (no work when none plays)
  const sig = lastSig; lastSig = signature();
  if (sig !== lastSig || keys.size > 0 || touch || view.vr.active || view.ar.state !== "off" || view.busy() || enSecuencia) lastActive = now;
  const active = now - lastActive < 600;
  if (view.vr.active || view.ar.state !== "off" || view.power.shouldDraw(now, { hidden: document.hidden, active })) {
    view.sync(session.entity >= 0 ? session.selfPosition(acc / TICK_MS) : null, session.remotePositions(now));
    view.sueloTerreno(session.sueloTerreno()); // avatares/suelo-relieve: hills count as ground for the avatars' clips and feet
    view.solidos(session.solidos()); // N1b: the camera does not go through solid things; avatars stand on them
    const t0 = performance.now();
    view.draw(dt / 1000);
    cost = view.lastFrame(); cost.cpuMs = Math.round((performance.now() - t0) * 100) / 100;
    if (view.power.reportCost(cost.cpuMs, dt)) view.applyPixelRatio();
    frames++;
    // T1: interval between draws against the target of the moment. A gap of 1 s or more is a freeze, counted apart
    // (B5), unless the page was hidden or frozen meanwhile; draw calls, triangles, programs and pixel ratio ride along
    const xr = view.vr.active || view.ar.state !== "off";
    if (lastDrawAt) medidor.cuadro(now - lastDrawAt, cost.cpuMs, xr ? view.xrHz() || 72 : view.power.targetFps(active), { dc: cost.calls, tri: cost.triangles, programas: (cost as { programs?: number }).programs, ratio: view.power.pixelRatio(), xr });
    lastDrawAt = now;
    if (session.welcome && !informe.primerCuadroMs) informe.primerCuadroMs = Math.round(performance.now());
    // MVL3 step 1 + B5 + C: fade the "Cargando" screen away once a frame was drawn with the ground built AND every piece within view
    // is ready (model, textures, shaders — view.cargaMundo()), or after the cap. The count is also what the screen writes («n de N piezas»).
    if (!cargaOculta) {
      const mundo = view.cargaMundo();
      const tot = tienda.totales().arranque, est0 = tienda.estadisticas();
      carga.piezas({ listas: mundo.listas, total: mundo.total, ...(tot > 0 ? { bytes: { listos: est0.bytesDescargados + est0.bytesDeCache, total: tot } } : {}) }); // M16: its bytes, from the manifest
      const msDesdeWelcome = informe.bienvenidaMs ? Math.round(performance.now()) - informe.bienvenidaMs : 0;
      const est = estadoCarga({ welcome: !!session.welcome, mundoRecibido: session.stats.snapshots > 0, primerCuadro: true, sueloPendiente: pendiente, piezasPendientes: piezasPendientes(mundo), msDesdeWelcome });
      if (est !== "esperando") {
        cargaOculta = true; carga.ocultar();
        const pend = piezasPendientes(mundo);
        informe.carga = { ocultaMs: Math.round(performance.now()), msDesdeWelcome, piezas: mundo.total, pendientes: pend, tope: est === "tope" };
        if (est === "tope") console.warn(`[carga] the cap (${TOPE_CARGA_MS / 1000} s) fired: the loading screen left with ${pend} of ${mundo.total} pieces still not ready${pendiente ? " and the ground still pending" : ""}`);
        session.report({ k: "carga", ...informe.carga });
      }
    }
  }
  if (now - fpsT >= 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; drawHud(); }
});

function drawHud() {
  const s = session.stats;
  const det = !probe.done ? "calculando…"
    : probe.browser === probe.server ? `<b>${hex(probe.browser)} = ${hex(probe.server)} ✓</b> (${probe.ms} ms)`
    : `${hex(probe.browser)} ≠ ${hex(probe.server)} ✗`;
  // Auditoría UI móvil: cada línea es su propio bloque (antes un solo <pre> de 4 líneas se salía de
  // la pantalla en 390 px — "white-space: pre" nunca envuelve — quedando cortado tras el minimapa).
  // Cada .linea recorta con "…" en vez de desbordar; la huella navegador=servidor (depuración, no
  // esencial para jugar) se oculta en pantallas estrechas o táctiles vía CSS (.detalle).
  if (!hud.hidden) hud.innerHTML = // U23: statistics are off by default; a hidden block is not rewritten twice a second
    `<div class="linea">Render: <b>${view.backend}</b> · ${fps} fps${view.power.battery ? " · modo batería" : ""}${view.power.scale < 1 ? ` · resolución ${Math.round(view.power.scale * 100)} %` : ""}</div>` +
    `<div class="linea">Tú: ${session.who?.nombre ?? "…"} (avatar ${session.entity}) · conectados a la vista: ${s.visible + 1}</div>` +
    `<div class="linea">Ping: ${s.rttMs < 0 ? "—" : s.rttMs + " ms"} · correcciones de tu predicción: ${s.corrections}</div>` +
    `<div class="linea detalle">Huella navegador = servidor: ${det}</div>`;
  if (view.vr.active) view.vr.setPanel([...xr.lineasPanel(), `${fps} fps · ${s.visible + 1} conectados · ping ${s.rttMs < 0 ? "—" : s.rttMs + " ms"}`]); // J10: the quest first
}

// handle for automated checks (tools/e2e.mjs)
(globalThis as unknown as { __numinia: unknown }).__numinia = { gemelos, ajustesMundo, session, view, condiciones, probe, cost: () => cost, informe, constructor, constructorUI, constructorVR, chat: chatDePagina, cajaChat, misiones, interaccion, huecos, enlaces, videoMandos, mapa, andar, ficha, miAvatar, ambiente, elementos, voz, compartir, xr, baculo, burbujas, pesca, lucha, estado: fuentesLucha.estado, carga: fuentesLucha.carga, bienes, dardos, dardosEnlace, dados, contadores, contadoresPagina, pescaPagina: () => pescaPagina, dirigir, foto, viajar, ia: iaPagina, burbuja: burbujaPagina, llamar: { ...llamarPagina, ...llamarIA }, gente, web: pantallasWeb, webPagina, disparadores, cable, graboso, inventario: { ...inventarioCtl, abrir: inventario.abrir, cerrar: inventario.cerrar }, gestos: gestosDePagina, rueda, ancestros, ancestrosPagina, funciones: interruptoresFunciones };

// ---- t_5cff4f06: back to the city — hidden unless this world's mundo.ajustes.json sets ciudadUrl; ux2-barra: an entry
// of the bar's «Menú» (O), no longer a corner button ----
const ciudad = montarCiudad({ mundo: mundoPlaza, boton: document.getElementById("volver-ciudad") as HTMLButtonElement, icono });

// ---- rediseño v2 (story E): in VR, the wrist watch and the menu panel show what the computer's panels show ----
{
  const n = (globalThis as unknown as { __numinia: Record<string, unknown> }).__numinia;
  const menuVR = montarMenuVR({ vr: view.vr, n: () => n, ciudadUrl: ciudad.url, puedeConstruir: () => constructor.estado.puede, construirVR: constructorVR,
    nombre: () => session.who?.nombre ?? "Invitado",
    obra: { hueco: (id) => constructor.huecos().find((h) => h.id === id) ?? null, imagenes: () => constructor.imagenes(), poner: soltar.rellenarYa },
    // the same line «Tú» shows on the computer (avatar · world · how long), never the guest's raw id
    linea: () => lineaDeTu({ avatar: miAvatar()?.nombre, mundo: nombreDelMundo, ms: informe.bienvenidaMs > 0 ? performance.now() - informe.bienvenidaMs : 0 }),
    retrato: () => { const id = miAvatar()?.id ?? idAvatarDe(avatarUI?.eleccion("yo"), estado?.avatar); return id ? `/retratos/${id}-cuerpo.webp` : null; } });
  elegirObraVR = menuVR.elegirObra;
  Object.assign(n, { menuVR });
}

// ---- U11 + ux2-barra: the bar, top right — one thing, one place, one key. Left to right: Micrófono (Q) · Gente (L) ·
// Bolsa (R) · Cámara (P: foto, grabar, compartir pantalla) · Construir (C, builders only) | Avisos (N) · Menú (O: ajustes,
// pantalla completa, volver a la ciudad, teclas y ayuda). The order is CSS (`order`, tema.css ux2-barra): modules add
// their own buttons at different moments. The menus move the modules' own buttons in (menu-barra.ts): same ids, same
// handlers, same `hidden` rules ----
{
  const barra = document.getElementById("barra-arriba")!;
  const gear = document.getElementById("ajustes-abrir")!;
  // v2 paridad: icon, name and tooltip of every section come from the world's one list (menu-secciones.ts), the VR menu's too
  gear.classList.add("solo-icono"); rotularBoton(gear, "ajustes"); gear.title = nombreDe("ajustes"); // its key (O) is the «Menú»'s
  const mis = document.getElementById("misiones")!;
  rotularBoton(mis, "misiones", { visible: true, px: 18 });
  const invB = document.getElementById("inventario-abrir")!;
  invB.classList.add("solo-icono"); rotularBoton(invB, "bolsa");
  for (const id of ["construir", "microfono", "gente-abrir", "inventario-abrir", "vr", "ar"]) { const e = document.getElementById(id); if (e) barra.appendChild(e); }
  barra.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  const separador = document.createElement("span"); separador.className = "separador"; separador.setAttribute("aria-hidden", "true");
  barra.appendChild(separador);
  const botonBarra = (id: string, seccionId: string) => {
    const b = document.createElement("button"); b.type = "button"; b.id = id; b.className = "solo-icono";
    const tecla = seccion(seccionId).tecla; if (tecla) b.setAttribute("aria-keyshortcuts", tecla);
    rotularBoton(b, seccionId);
    barra.appendChild(b); return b;
  };
  const libre = () => !document.body.classList.contains("construyendo") && !document.querySelector("dialog[open]") && !foto.activo() && !dardos.tirando();

  // «Cámara» (P): photo, record (K still records on its own), share the screen (where the browser can)
  const camaraB = botonBarra("camara-abrir", "camara");
  const camara = montarMenuBarra({
    id: "camara-menu", barra, boton: camaraB, etiqueta: "Cámara", tecla: "KeyP", puedeTecla: libre,
    entradas: [document.getElementById("foto-abrir"), graboso.boton, document.getElementById("compartir-pantalla")].filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement),
  });
  // the camera button says what is running behind it: recording (red) or sharing (sea green)
  const pintarCamara = () => {
    const e = estadoCamara({ grabando: graboso.boton.getAttribute("aria-pressed") === "true", compartiendo: compartir.estado.compartiendo });
    if ((camaraB.dataset.estado ?? null) !== e) { if (e) camaraB.dataset.estado = e; else delete camaraB.dataset.estado; }
    const t = e === "grabando" ? `${tituloDe("camara")}: grabando` : e === "compartiendo" ? `${tituloDe("camara")}: compartiendo tu pantalla` : tituloDe("camara");
    if (camaraB.title !== t) camaraB.title = t;
  };
  new MutationObserver(pintarCamara).observe(graboso.boton, { attributes: true, attributeFilter: ["aria-pressed"] });
  setInterval(pintarCamara, 500); pintarCamara();

  // «Teclas y ayuda»: the keys of this page, from the help line (#help) every module already writes into
  const ayudaB = document.createElement("button"); ayudaB.type = "button"; ayudaB.id = "teclas-abrir";
  rotularBoton(ayudaB, "teclas");
  const teclas = crearDialogo({ id: "teclas", titulo: "Teclas y ayuda", tecla: "F1", boton: ayudaB, alAbrir: () => {
    const lista = document.createElement("dl"); lista.className = "teclas-lista";
    for (const p of filasDeAyuda(document.getElementById("help")?.textContent ?? "")) {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = p.tecla; dd.textContent = p.que; lista.append(dt, dd);
    }
    teclas.cuerpo.replaceChildren(lista);
  } });
  ayudaB.hidden = !!enMovil; // a phone names no key

  // «Menú» (O): settings, full screen, back to the city (only where the world names one), the keys
  const menuB = botonBarra("menu-abrir", "menu");
  montarMenuBarra({
    id: "menu-lista", barra, boton: menuB, etiqueta: "Menú", tecla: "KeyO", puedeTecla: () => !document.querySelector("dialog[open]"),
    entradas: [gear, document.getElementById("pantalla"), document.getElementById("volver-ciudad"), ayudaB].filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement),
  });
  Object.assign((globalThis as unknown as { __numinia: Record<string, unknown> }).__numinia, { barra: { camara, menu: { abrir: () => document.getElementById("menu-abrir")?.click() } }, avatar: avatarUI });
}

// ---- N2: settings and capabilities (menu-ajustes.ts): gear + O, window.__numinia.ajustes / .capacidades. Applied here,
// before the first frame: the display loop above only draws from the next animation frame on ----
montarAjustes({ view, session, params, funciones, numinia: (globalThis as unknown as { __numinia: Record<string, unknown> }).__numinia });
montarPulsaciones({ ajuste: leerAjuste });

// battery mode: press B (or open ?bateria)
addEventListener("keydown", (e) => { if (e.code === "KeyB" && !escribiendo(e)) { view.power.setBattery(!view.power.battery); view.applyPixelRatio(); } });
