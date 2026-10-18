// The PP1 page: one plaza, your capsule, everyone else's, and the determinism probe.
import { version as versionPaquete } from "../../package.json"; // only this field reaches the page (docs/VERSIONES.md)
import { hex } from "../../packages/core/src/index.ts";
import { referenceRecording, replayFingerprint, TICK_HZ, STICK_MAX, BTN_JUMP, BTN_RUN } from "../../packages/sim/src/index.ts";
import { CIERRE_LLENO, webSocketClient } from "../../packages/net/src/index.ts";
import { montarAjustes, leerAjuste } from "./menu-ajustes.ts"; // N2: settings menu + capabilities
import { montarPulsaciones } from "./pulsaciones.ts"; // U26: a press you can see (and feel) on every button
import { ClientSession, serverUrl, tomarPaseDeLaDireccion } from "../../packages/client/src/index.ts";
import { createView, leerAparato, leerBateria, medidorDeCuadros, haciaMundo } from "../../packages/render/src/index.ts";
import funciones from "../../features/cliente.ts";
import { constructor } from "../../features/objetos/client.ts";
import { chatDePagina } from "../../features/chat/client.ts";
import { montarConstructor } from "./constructor.ts";
import { montarSoltar } from "./soltar.ts";
import { montarHuecos } from "./huecos.ts";
import { disparadores } from "../../features/disparadores/client.ts"; // D-041: the cable — controller
import { montarCable } from "./cable.ts"; // D-041, historia 5: builder's read view of the wiring
import { catalogoDeAvatares } from "./catalogo-avatares.ts"; // not "./a…": dev:lan proxies every path starting with /a to the server
import { montarChat } from "./chat.ts";
import { escribiendo } from "./escribiendo.ts";
import { misiones } from "../../features/misiones/client.ts";
import { montarInteraccion } from "./interactuar.ts";
import { montarDialogo } from "./dialogo.ts";
import { montarVerNombres } from "./nombres-ver.ts";
import { montarLibro } from "./misiones.ts";
import { montarMapa } from "./mapa.ts";
import { montarFicha } from "./ficha.ts";
import { ambiente } from "../../features/entorno/client.ts";
import { elementos } from "../../features/elementos/client.ts";
import { dardos } from "../../features/dardos/client.ts"; // dardos v1: the controller; its throwing view (apps/plaza/dardos.ts) loads with the first board
import { pesca } from "../../features/pesca/client.ts"; // pesca v1: the controller; its HUD (apps/plaza/pesca.ts) and 3D load with the first spot
import { bienes, comprobar } from "../../features/bienes/client.ts"; // N10: goods that are yours (signed receipt), in the sheet's «Inventario»
import { montarBienes } from "./bienes.ts";
import { montarEntorno } from "./entorno.ts";
import { montarDirector } from "./director.ts";
import { dirigir } from "../../features/director/client.ts";
import { montarGente } from "./gente.ts";
import { viajar } from "../../features/teletransporte/client.ts";
import { dados } from "../../features/dados/client.ts"; // dados v1: dice the server rolls
import { montarDados } from "./dados.ts";
import { contadores } from "../../features/contadores/client.ts"; // D-044: timers and counters everyone sees
import { montarContadores } from "./contadores.ts";
import { pantallasWeb } from "../../features/web/client.ts"; // N17: web screens (the controller)
import { montarWeb } from "./web.ts";
import { montarVoz } from "./voz.ts";
import { icono } from "./iconos.ts";
import { montarXR } from "./xr.ts";
import { aplicarTema } from "./tema-mundo.ts"; // a world's look (ficha@1 `tema`): an event's colours and title face
import { montarFoto } from "./foto.ts"; // N13: photo mode (P): hide the interface, frame, filter, PNG, share, a link to the place
import { esTactil, perfil, montarMarco } from "./perfil-aparato.ts"; // U25: the device profile (touch, small screen, VR), one answer for the whole page
import { esMovil, enZonaAndar, ZONA_ANDAR_MOVIL } from "../../packages/client/src/movil.ts"; // U24: the phone layout (apps/plaza/movil.ts) and its rules

const params = new URLSearchParams(location.search);
// U25: a phone profile forced on a desktop (?aparato=movil-vertical, development or ?debug): this page becomes a frame
// that loads the world again at phone size, and starts nothing itself (no view, no connection) — it stops here.
if (montarMarco()) await new Promise<never>(() => {});
const hud = document.getElementById("hud")!;
const url = serverUrl(location, import.meta.env.PROD); // the built page (Caddy or the engine itself) always talks to its own origin
// H1: files of things in the world come from the instance's server by their sha256 (ws://h:p -> http://h:p/a/<sha256>.glb)
const activos = new URL(url.replace(/^ws/, "http")).origin;
// H7: the world's settings (its aventura/ficha.json, served by GET /status): its name on the entry screen and the tab,
// everyone's avatar when it names one, how many fit (`aforo`). Asked once, before the first draw, but never waited for
// long: a slow or absent /status leaves the house defaults (the tab name and the look are fixed again below when it answers).
type Estado = { version?: string; nombre?: string; tema?: unknown; avatar?: string; aforo?: number; conectados?: number };
const estadoP: Promise<Estado | null> = fetch(`${activos}/status`).then((r) => r.json() as Promise<Estado>).catch(() => null);
const estado = await Promise.race([estadoP, new Promise<null>((ok) => setTimeout(() => ok(null), 1500))]);
if (estado?.nombre) { document.title = estado.nombre; hud.textContent = `Conectando a «${estado.nombre}»…`; }
const enMovil = esMovil(perfil().clase); // U24: the phone layout: the joystick owns the left third, a bigger stick, the rest of the screen looks
const view = await createView(document.body, { forceWebGL: params.has("webgl2"), arMaxMs: Number(params.get("armax")) || undefined, battery: params.has("bateria"), maxFps: Number(params.get("fps")) || undefined, movil: perfil().forzado ? perfil().movil : undefined, assetUrl: (m) => `${activos}/a/${m}.glb`,
  avatares: { catalogo: catalogoDeAvatares(activos, params, estado?.avatar), yo: () => session.entity } }); // J1: VRM avatars (session exists by the first draw); H7: the world's default avatar
const transport = webSocketClient(url);
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
    elemento: (k, v) => view.elementos.poner(k, v),
    // N18: what each person wears (features/bienes): a good's model in a hand or on the head
    lleva: (e, v) => view.vestir(e === session.entity ? "self" : e, v),
    // D-045: a fade when the server puts me back on a safe spot (features/suelo); the live region reads the announcement
    fundido: (ms) => { const f = document.getElementById("fundido")!; f.style.transition = "none"; f.style.opacity = "1"; f.offsetHeight; f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = "0"; f.dataset.ultimo = String(Date.now()); },
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
void transport.closed.then((c) => {
  if (c.code !== CIERRE_LLENO) return;
  const n = /(\d+)\/(\d+)/.exec(c.reason), nombre = estado?.nombre ? `«${estado.nombre}»` : "Este mundo";
  const texto = `${nombre} está lleno${n ? ` (${n[2]} persona${n[2] === "1" ? "" : "s"} como mucho)` : ""}. Espera un rato y vuelve a cargar la página.`;
  hud.hidden = true; // the statistics block would repaint over any text put there
  const aviso = document.getElementById("mundo-lleno")!;
  aviso.textContent = texto; aviso.hidden = false; // role=alert: screen readers read it at once
});

// ---- the features' actions: a key on desktop, a button on touch screens; the help line lists them ----
const acts = session.features.actions();
addEventListener("keydown", (e) => { if (!e.repeat && !escribiendo(e)) acts.find((a) => a.key === e.code)?.run(); }); // J3: typing in a box is not an action
if (esTactil()) {
  document.getElementById("help")!.textContent = "Dedo a la izquierda: andar · a la derecha: mirar · dos dedos: acercar"; // N1: the touch map only
  const bar = document.getElementById("acciones")!;
  for (const a of acts) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = a.label; b.title = a.describe ?? "";
    b.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); a.run(); }); // not a joystick touch
    bar.appendChild(b);
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
    bar.appendChild(b);
  }
  document.getElementById("help")!.textContent += " · " + acts.map((a) => `${(a.key ?? "").replace(/^Key/, "")} ${a.label.toLowerCase()}`).join(" · ");
}

// ---- H1 + M22: the builder, for whoever may build (the server says so on entering): panel, gizmo, grab ----
montarConstructor(constructor, view, document.getElementById("construir") as HTMLButtonElement, document.getElementById("panel-construir")!);
// ---- H9: drop your own .glb on the world (or «Subir modelo…» in the panel): uploaded by sha256, placed for everyone ----
const soltar = montarSoltar({ session, view, puede: () => constructor.estado.puede, origen: activos, billete: () => localStorage.getItem(GUARDA), panel: document.getElementById("panel-construir") });
// ---- U12: holes — click one (or E near it) and choose your picture: it goes up and the server fits it into the frame ----
const huecos = montarHuecos({ constructor, view, rellenar: soltar.rellenar, decir: (t) => soltar.decir(t), panel: document.getElementById("panel-construir") });
const cable = montarCable({ constructor, disparadores, decir: (t) => soltar.decir(t), panel: document.getElementById("panel-construir") });
montarEntorno(ambiente, elementos, view); // H4/H8: environment and elements, a section of its own while building
montarDados({ dados, yo: () => (session.entity >= 0 ? session.selfPosition(1) : null) }); // dados v1: the dice card everyone near sees, the dice buttons beside a tower
const contadoresPagina = montarContadores({ contadores, yo: () => (session.entity >= 0 ? session.selfPosition(1) : null) }); // D-044: the counters' panel (the sign in the world is the feature's own label)
montarDirector({ dj: dirigir, ambiente, view }); // N6: the Game Director (who may direct: STD-052 manage-rituals): scenes, narrator, summons
// ---- N16: «Gente» (L): go next to someone connected now; the light of every trip near you (none on tier D) ----
const gente = montarGente({ viajar, barra: document.getElementById("barra-arriba"), orden: (t) => chatDePagina.decir(t) }); // F1: «Silenciar»/«Oír» per person = /bloquear and /desbloquear
viajar.alDestello((d) => view.teletransporte.lanzar({ ...d, clave: d.quien === session.entity ? "self" : d.quien }));
const webPagina = montarWeb({ web: pantallasWeb, view }); // N17: web screens — iframe in the world (PC/phone), card + «Abrir fuera» in VR
// ---- pesca v1: nothing of it is in the start bundle; the HUD and the 3D arrive with the first fishing spot or float ----
let pescaHud: Promise<unknown> | null = null, pescaPagina: unknown = null; // N4: pescaPagina.manos (VR rod, gamepad) for the e2e
pesca.alCambiar(() => { pescaHud ??= import("./pesca.ts").then((m) => (pescaPagina = m.montarPesca({ pesca, view, session, hud: document.getElementById("pesca-hud")!, ajuste: leerAjuste, interaccion: () => interaccion }))).catch((e) => console.warn(`[pesca] no se pudo cargar la página de pesca: ${(e as Error)?.message ?? e}`)); });
// ---- dardos v1: the throwing view (mouse, flick, keys) and «En tu pared (AR)» arrive with the first dartboard ----
let dardosHud: Promise<unknown> | null = null;
dardos.alCambiar(() => { dardosHud ??= import("./dardos.ts").then((m) => m.montarDardos({ dardos, view, session, hud: document.getElementById("dardos-hud")! })).catch((e) => console.warn(`[dardos] no se pudo cargar la página de dardos: ${(e as Error)?.message ?? e}`)); });

// ---- U10: the microphone (button or Q): your voice to who is near; theirs from where they stand ----
const voz = montarVoz({ session, view: { label: (t, text, ms) => view.label(t, text, ms), cam: view.cam, voz: (id, nivel) => view.voz(id, nivel) }, escribiendo, decir: (t) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); const c = document.getElementById("chat-estado"); if (c) { c.textContent = t; setTimeout(() => { if (c.textContent === t) c.textContent = ""; }, 6000); } } });

// ---- J3: the chat box (Enter opens, Enter sends, Escape closes; a «Chat» button on touch screens) ----
const cajaChat = montarChat(chatDePagina, document.getElementById("chat")!);

// ---- J4/J5: what you can use from close by (E, a click, the prompt button), conversations, the quest book (J) ----
const interaccion = montarInteraccion({ session, view, boton: document.getElementById("interactuar") as HTMLButtonElement, ofrece: (f, k) => misiones.ofrece(f, k) && pesca.ofrece(f, k) && dardos.ofrece(f, k), ocupado: () => !!misiones.dialogo(), locales: huecos.cerca, pinchar: huecos.pinchar });
misiones.alCambiar(() => interaccion.mirar()); // a conversation opens or a step changes: the prompt follows at once
const xr = montarXR({ session, view, misiones, interaccion }); // J10: hands in VR take, point and answer; what you took is in your hand
montarDialogo(misiones, document.getElementById("dialogo")!, view);
const nombres = montarVerNombres(view); // U22: Alt / «Nombres» button / gamepad Back: every name; otherwise only who you look at and who speaks
misiones.alCambiar((que) => { if (que === "dialogo") view.hablando(misiones.dialogo() ? `pnj:${misiones.dialogo()!.pnj}` : null); }); // U22: the one you talk to shows its name
montarLibro(misiones, {
  boton: document.getElementById("misiones") as HTMLButtonElement, panel: document.getElementById("libro")!, linea: document.getElementById("mision-seguida")!,
  nota: document.getElementById("mision-nota")!, view, here: () => (session.entity >= 0 ? session.selfPosition(1) : null),
  oir: (fn) => session.features.tap(fn), ajuste: leerAjuste, // U14 (3): it opens by itself on accepting; a step done = a short sound
  banner: document.getElementById("mision-completada")!, // U14 (6): «Misión completada»
});

// ---- J5: minimap (corner), big map (M, «Mapa») and player sheet (I, «Ficha»); other branches' contracts are read
// from __numinia when present (misiones.objetivos/resumen, ajustes.abrir, chat.nombres) ----
const otros = () => (globalThis as unknown as { __numinia?: Record<string, unknown> }).__numinia ?? {};
const mapa = montarMapa({ session, view, otros });
// ---- N13: photo mode (P or the camera button): the photo owns the screen and the keys; your avatar stands still ----
const foto = montarFoto({ view, yo: () => (session.entity >= 0 ? session.selfPosition(1) : null), mapa, boton: document.getElementById("foto-abrir") as HTMLButtonElement, ocupado: () => dardos.tirando(),
  aparecer: { puede: () => (viajar.estado.recibido ? viajar.foto() : null), pedir: (s) => { viajar.aparecerEnFoto(s.x, s.y, s.z); } }, // N16: the world may put you at the photo's place
  decir: (t) => { const box = document.getElementById("avisos")!; const p = document.createElement("p"); p.textContent = t; box.appendChild(p); while (box.childElementCount > 3) box.firstElementChild!.remove(); } });
const ficha = montarFicha({ session, view, desde: () => informe.bienvenidaMs, otros }, mapa.botonFicha);
montarBienes({ bienes, comprobar, ficha, boton: mapa.botonFicha, vitrina: (cv, model) => view.vitrina(cv, model) }); // N10: the sheet's «Inventario» = your goods, their receipts
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

function readAxes(): [number, number] {
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
  if (foto.activo()) { saltoPendiente = false; return 0; } // N13
  if (view.vr.takeJump() || view.ar.takeJump() || saltoPendiente) { saltoPendiente = false; b |= BTN_JUMP; }
  // RUN_EDGE close to 1: most of the stick's travel walks (human pace), only the very end runs
  // (was 0.9 — reached with barely half the throw, so there was no way to just walk).
  const RUN_EDGE = 0.97;
  if (view.vr.active) { if (Math.hypot(...view.vr.axes()) >= RUN_EDGE) b |= BTN_RUN; return b; } // in VR only the headset's stick runs
  const alBorde = touch && Math.hypot(touch.dx, touch.dy) >= RUN_EDGE;
  if (keys.has("ShiftLeft") || keys.has("ShiftRight") || alBorde) b |= BTN_RUN;
  return b;
}

// ---- AR (J8): the button exists only where the device can do immersive-ar; no WebXR (iPhone) = no button ----
const arBtn = document.getElementById("ar") as HTMLButtonElement;
const arLabel = { off: "Entrar en AR", searching: "Mira una mesa o el suelo… (salir)", ready: "Toca para poner la plaza (salir)", placed: "La plaza en tu mesa · toca para moverla (salir)", mezclada: "Realidad mezclada (por VR)" };
view.arSupported().then((ok) => {
  if (!ok) return;
  arBtn.hidden = false; // the hidden ATTRIBUTE, not a style: the icon bar (tema.css) sets display on its buttons
  arBtn.onclick = () => { if (view.ar.state === "off") void view.ar.enter().then((ok) => { if (!ok) session.report({ k: "xr", modo: "ar", accion: "falla", detalle: view.ar.lastError }); }); else void view.ar.exit(); };
});
setInterval(() => { arBtn.textContent = view.ar.jugando ? "Dardos en tu pared (salir)" : arLabel[view.ar.state]; }, 250); // dardos v1: a minigame may hold the AR session

// ---- VR (J6): same idea; the stick becomes the same two int8 intentions as keyboard and touch ----
const vrBtn = document.getElementById("vr") as HTMLButtonElement;
view.vrSupported().then((ok) => {
  if (!ok) return;
  vrBtn.hidden = false;
  vrBtn.onclick = () => { if (view.vr.state === "off") void view.vr.enter().then((ok) => { if (!ok) session.report({ k: "xr", modo: "vr", accion: "falla", detalle: view.vr.lastError }); }); else void view.vr.exit(); };
});
setInterval(() => { vrBtn.textContent = view.vr.active ? "Salir de VR" : "Entrar en VR"; }, 250);

// ---- the version, at the foot of the settings (Pablo, 16-10: «la versión, 0.1…, sin branding»): the semantic version
// of package.json (docs/VERSIONES.md, STD-019), nothing else on screen; the server's build (/status `version`, «<commit>
// <date>», what /health, the installer and the world zip carry) only as the tooltip, for whoever helps with a fault ----
const versionMotor = document.getElementById("version-motor");
if (versionMotor) versionMotor.textContent = `v${versionPaquete}`;
void estadoP.then((st) => {
  if (!st) return;
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
    if (pantalla.title !== texto) { pantalla.title = texto; pantalla.innerHTML = `${icono("desktop")}<span class="solo-lector">${texto}</span>`; } // U11: an icon
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
const informe = { entrada: false, bienvenidaMs: 0, primerCuadroMs: 0, errores: 0, oculta: false, pulsos: 0 };
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
view.loop((now) => {
  const dt = Math.min(250, now - last); last = now;
  acc += dt;
  while (acc >= TICK_MS) { const [mx, mz] = readAxes(); session.tick(mx, mz, readButtons()); acc -= TICK_MS; }
  if (session.welcome && !probe.done) runProbe();
  if (session.welcome && !informe.bienvenidaMs) informe.bienvenidaMs = Math.round(performance.now());
  if (probe.done && informe.primerCuadroMs && !informe.entrada) void enviarEntrada();
  // power policy (P2): skip the draw when hidden or when nothing changes; the 20 Hz ticks above never skip
  const enSecuencia = misiones.cuadro(); // U14 (5): a sequence only this player sees moves its people (no work when none plays)
  const sig = lastSig; lastSig = signature();
  if (sig !== lastSig || keys.size > 0 || touch || view.vr.active || view.ar.state !== "off" || view.busy() || enSecuencia) lastActive = now;
  const active = now - lastActive < 600;
  if (view.vr.active || view.ar.state !== "off" || view.power.shouldDraw(now, { hidden: document.hidden, active })) {
    view.sync(session.entity >= 0 ? session.selfPosition(acc / TICK_MS) : null, session.remotePositions(now));
    view.solidos(session.solidos()); // N1b: the camera does not go through solid things; avatars stand on them
    const t0 = performance.now();
    view.draw(dt / 1000);
    cost = view.lastFrame(); cost.cpuMs = Math.round((performance.now() - t0) * 100) / 100;
    if (view.power.reportCost(cost.cpuMs, dt)) view.applyPixelRatio();
    frames++;
    // T1: interval between draws against the target of the moment (a pause over 1 s is not a lost frame)
    const xr = view.vr.active || view.ar.state !== "off";
    if (lastDrawAt && now - lastDrawAt < 1000) medidor.cuadro(now - lastDrawAt, cost.cpuMs, xr ? view.xrHz() || 72 : view.power.targetFps(active));
    lastDrawAt = now;
    if (session.welcome && !informe.primerCuadroMs) informe.primerCuadroMs = Math.round(performance.now());
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
(globalThis as unknown as { __numinia: unknown }).__numinia = { session, view, probe, cost: () => cost, informe, constructor, chat: chatDePagina, cajaChat, misiones, interaccion, huecos, mapa, ficha, ambiente, elementos, voz, xr, pesca, bienes, dardos, dados, contadores, contadoresPagina, pescaPagina: () => pescaPagina, dirigir, foto, viajar, gente, web: pantallasWeb, webPagina, disparadores, cable };

// ---- U11: the bar of icon buttons, top right (rightmost first): settings, build, microphone, full screen, VR, AR ----
{
  const barra = document.getElementById("barra-arriba")!;
  const gear = document.getElementById("ajustes-abrir")!;
  gear.classList.add("solo-icono"); gear.innerHTML = `${icono("gear")}<span class="solo-lector">Ajustes</span>`;
  const mis = document.getElementById("misiones")!;
  mis.innerHTML = `${icono("scroll", 18)}<span>Misiones</span>`; mis.title = "Misiones (J)";
  for (const id of ["ajustes-abrir", "construir", "microfono", "gente-abrir", "foto-abrir", "pantalla", "vr", "ar"]) { const e = document.getElementById(id); if (e) barra.appendChild(e); }
  barra.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
}

// ---- N2: settings and capabilities (menu-ajustes.ts): gear + O, window.__numinia.ajustes / .capacidades. Applied here,
// before the first frame: the display loop above only draws from the next animation frame on ----
montarAjustes({ view, session, params, funciones, numinia: (globalThis as unknown as { __numinia: Record<string, unknown> }).__numinia });
montarPulsaciones({ ajuste: leerAjuste });

// battery mode: press B (or open ?bateria)
addEventListener("keydown", (e) => { if (e.code === "KeyB" && !escribiendo(e)) { view.power.setBattery(!view.power.battery); view.applyPixelRatio(); } });
