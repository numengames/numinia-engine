// N2: the settings menu of the plaza — real HTML (a <dialog> with labelled inputs that keyboards, touch screens and
// screen readers use; RD 193/2023) — and what each engine setting does on this page: the power policy, the camera (N1
// contract `view.cam.ajustar`), the environment (H4 contract `view.entorno.calidad`), the HUD, the help line, the CSS
// classes of accessibility, the announcements and the session report (T1). The registry, the capabilities and the
// engine's settings are packages/client (pure, tested in Node). main.ts mounts this before the first frame (the display
// loop only starts drawing on the next animation frame), so stored choices and the system's preferences are on screen
// from the start (V7). Not named «ajustes.ts»: dev:lan proxies every path that starts with /a to the server.
import { acciones } from "./acciones-informe.ts"; // session log: VR body and speed changes
import { crearAjustes, crearCapacidades, leerNavegador, AJUSTES_MOTOR, CONSULTAS, NIVELES, hayMando } from "../../packages/client/src/ajustes.ts";
import type { Ajustes, Grupo, Lectura, Nivel, Valor, Vista } from "../../packages/client/src/ajustes.ts";
import type { ClientSession } from "../../packages/client/src/index.ts";
import type { ClientPart } from "../../packages/feature/src/index.ts";
import { limitesGraficos } from "../../packages/render/src/index.ts";
import { audio } from "../../packages/render/src/audio/nucleo.ts"; // S1: «Sonido» moves the audio graph's VCAs
import type { createView } from "../../packages/render/src/index.ts";
import type { Calidad } from "../../packages/render/src/power.ts";
import mundoPlaza from "./mundo.ajustes.json";
import { AJUSTE_APARATO, capacidadesDelPerfil, nivelDelPerfil } from "../../packages/client/src/aparato.ts";
import { perfil, desarrollo, origenPerfil, cambiarAparato } from "./perfil-aparato.ts"; // U25

type View = Awaited<ReturnType<typeof createView>>;
/** Contracts of branches built in parallel (N1 camera, H4 environment): optional until they are merged. */
type Contratos = {
  cam?: { ajustar?(o: { sensibilidad?: number; invertirY?: boolean; zonaMuerta?: number }): void };
  entorno?: {
    calidad?(o: { sombras?: string; agua?: string; particulas?: string; hdr?: boolean }): void;
    capacidades?(): Record<string, unknown> | null | undefined;
    efectos?(o: { bloom?: boolean; ao?: boolean; sombraSuave?: boolean }): unknown; // H12b: level A only (the render clamps the wish)
  };
  posproceso?: { alApagar?(f: () => void): void };
};

let activo: Ajustes | null = null;
/** A feature reads one of its own settings (the view hook `ajuste`, wired in main.ts). undefined before mounting. */
export const leerAjuste = (id: string): Valor | undefined => activo?.get(id);

/** Typing in a box belongs to the box, not to the world: J3's one rule for every key listener of the page. */
import { escribiendo } from "./escribiendo.ts";
import { montarBalizaSonora } from "./baliza-sonora.ts"; // V6: the beacon also sounds
import { montarEdicion } from "./edicion.ts"; // M6: move and hide the frames
import { montarMarcos } from "./marcos.ts"; // U20 + U3: the density dial, the frames, the clock, the notices
import { crearPuerta } from "./puerta.ts"; // t_45ef2f70: the window itself (menu-ajustes-ui.ts) waits for the first frame
export { escribiendo };

export function montarAjustes(o: { view: View; session: ClientSession; params: URLSearchParams; funciones: readonly ClientPart[]; numinia: Record<string, unknown> }) {
  const { view, session, params } = o;
  const extra = view as unknown as Contratos;

  // ---- 1. capabilities: the browser, then what the view knows; XR answers later; the OS may change its mind ----
  const entornoCaps = (): Record<string, boolean> => {
    const e = extra.entorno, hay = typeof e?.calidad === "function";
    let c: Record<string, unknown> = {};
    try { c = (hay && e?.capacidades?.()) || {}; } catch { c = {}; }
    const out: Record<string, boolean> = { entorno: hay };
    for (const k of ["sombras", "agua", "particulas", "hdr", "efectos"]) out[`entorno.${k}`] = hay && c[k] !== false;
    return out;
  };
  const nivelUrl = (params.get("nivel") ?? "").toUpperCase() as Nivel;
  // U25: the device profile (perfil-aparato.ts) adds its class and, when forced, the pointers and power class it declares
  const caps = crearCapacidades(
    { ...leerNavegador(), backend: view.backend, movil: view.power.mobile, ...limitesGraficos(view.renderer), camara: typeof extra.cam?.ajustar === "function", ...entornoCaps(), ...capacidadesDelPerfil(perfil()), desarrollo },
    { nivel: NIVELES.includes(nivelUrl) ? nivelUrl : nivelDelPerfil(perfil()) },
  );
  view.vrSupported().then((v) => caps.poner({ xrVr: v }), () => {});
  view.arSupported().then((v) => caps.poner({ xrAr: v }), () => {});
  for (const [id, q] of Object.entries(CONSULTAS)) {
    if (id === "punteroGrueso") continue; // the device class (movil) stays power.ts's, decided once
    if (id === "raton" && perfil().forzado) continue; // U25: a forced profile declares its pointers
    try { matchMedia(q).addEventListener("change", (ev) => caps.poner({ [id]: ev.matches })); } catch { /* old browser: read once */ }
  }
  addEventListener("gamepadconnected", () => caps.poner({ mando: true }));
  addEventListener("gamepaddisconnected", () => caps.poner({ mando: hayMando(navigator as never) }));

  // ---- 2. the registry: the engine's settings, each feature's, then the world's file; what was kept comes back ----
  const guardado = {
    leer: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
    escribir: (k: string, t: string) => { localStorage.setItem(k, t); },
  };
  const a = crearAjustes({ capacidades: caps, guardado, mundo: mundoPlaza.mundo, registro: (l) => console.warn(l) });
  a.declarar(AJUSTES_MOTOR);
  for (const p of o.funciones) {
    if (p.feature.ajustes?.length && !p.feature.issues.length) a.declarar(p.feature.ajustes, { de: "funcion", id: p.feature.id, describe: p.feature.describe });
  }
  a.aplicarMundo(mundoPlaza);
  if (params.has("bateria")) a.forzar("graficos.bateria", true); // this load only, as before (?bateria)
  if (origenPerfil() === "url") a.forzar(AJUSTE_APARATO, perfil().eleccion); // U25: the menu shows the profile the URL forced
  const fpsUrl = Number(params.get("fps")) || 0;                  // ?fps=N is what «Automático» means while it is there
  activo = a;

  // ---- 3. what each setting does here (every function never throws out: the registry catches and logs once) ----
  const html = document.documentElement, $ = (id: string) => document.getElementById(id);
  const pr = () => view.applyPixelRatio();
  a.alAplicar("graficos.calidad", (v) => { view.power.setCalidad(v as Calidad); pr(); });
  a.alAplicar("graficos.resolucion", (v) => { view.power.setResolucion(Number(v) / 100); pr(); });
  a.alAplicar("graficos.fpsMax", (v) => view.power.setMaxFps(v === "auto" ? fpsUrl : Number(v)));
  a.alAplicar("graficos.bateria", (v) => { view.power.setBattery(v === true); pr(); });
  a.alAplicar("graficos.estadisticas", (v) => { const h = $("hud"); if (h) h.hidden = v !== true; });
  // «No llego al servidor» is written in the HUD: it shows even with the statistics off
  (session.t as { opened?: Promise<void> }).opened?.catch(() => { const h = $("hud"); if (h) h.hidden = false; });
  // Only what the person chose (or the URL forced) is asked of the environment; the rest stays undefined so it keeps its
  // own tier's default, which follows the headset when XR starts (B) — this registry's tier is the page's, not the
  // headset's. Choosing «Calidad» sets the four as chosen; «Automática» and «Restablecer» send undefined again.
  const propio = (id: string) => a.lista().some((v) => v.id === id && (v.elegido || v.forzado));
  const pide = (id: string, l: Lectura) => (propio(id) ? l.get(id) : undefined);
  const texto = (v: Valor | undefined) => (v === undefined ? undefined : String(v));
  const entorno = (_: Valor, l: Lectura) => {
    const hdr = pide("graficos.hdr", l);
    extra.entorno?.calidad?.({ sombras: texto(pide("graficos.sombras", l)), agua: texto(pide("graficos.agua", l)), particulas: texto(pide("graficos.particulas", l)), hdr: hdr === undefined ? undefined : hdr === true });
  };
  for (const id of ["graficos.sombras", "graficos.agua", "graficos.particulas", "graficos.hdr"]) a.alAplicar(id, entorno);
  // H12b: bloom, AO, soft shadows — the render turns them off on any tier but A; if its cost gate drops the passes, the menu shows them off
  const efectos = (_: Valor, l: Lectura) => extra.entorno?.efectos?.({ bloom: l.get("graficos.bloom") === true, ao: l.get("graficos.ao") === true, sombraSuave: l.get("graficos.sombraSuave") === true });
  for (const id of ["graficos.bloom", "graficos.ao", "graficos.sombraSuave"]) a.alAplicar(id, efectos);
  extra.posproceso?.alApagar?.(() => { a.set("graficos.bloom", false); a.set("graficos.ao", false); });
  const camara = (_: Valor, l: Lectura) => extra.cam?.ajustar?.({ sensibilidad: Number(l.get("controles.sensibilidad")) / 100, invertirY: l.get("controles.invertirY") === true });
  a.alAplicar("controles.sensibilidad", camara);
  a.alAplicar("controles.invertirY", camara);
  const zona = (_: Valor, l: Lectura) => extra.cam?.ajustar?.({ zonaMuerta: Number(l.get("controles.zonaMuerta")) / 100 });
  a.alAplicar("controles.zonaMuerta", zona);
  // t_bf8947cf (MVL1): the VR rig always exists (unlike cam/entorno, built in parallel branches), so this
  // writes straight to view.vr instead of going through Contratos.
  a.alAplicar("controles.modoMovimientoVR", (v) => { view.vr.modoMovimiento = v as "mirada" | "mando" | "cuerpo"; });
  a.alAplicar("controles.gestoAndarVR", (v) => { view.vr.gestoAndar = v === "remar" ? "remar" : "apuntar"; }); // MIS-229: rowing with the hands
  a.alAplicar("controles.cuerpoVR", (v) => { view.cuerpoVR = v !== false; }); // t_8217ffea (N2): your own body in VR
  a.alAplicar("controles.pielManosVR", (v) => { view.pielManosVR = v !== false; }); // t_8217ffea (N1): the avatar's skin on your hands
  a.alAplicar("controles.vrManoMenu", (v) => { view.vr.manoMenu = v === "der" ? "der" : "izq"; }); // t_d5f5523a: the watch's hand
  // rediseño v2: the VR menu's «Ajustes» rows (also here on the computer)
  a.alAplicar("controles.giroVR", (v) => { view.vr.giroGrados = Number(v); });
  a.alAplicar("controles.velocidadVR", (v) => { view.vr.velocidad = Number(v) / 100; });
  a.alAplicar("controles.confortVR", (v) => { view.vr.comfort = Number(v) / 100; });
  a.alAplicar("controles.alturaVR", (v) => { view.vr.alturaM = Number(v) / 100; });
  // MIS-200: «Rendimiento en gafas» (foveation live; scale and multiview on the next entry)
  a.alAplicar("graficos.foveacionVR", (v) => { view.vr.rendimiento = { foveacion: Number(v) / 100 }; });
  a.alAplicar("graficos.escalaVR", (v) => { view.vr.rendimiento = { escala: Number(v) / 100 }; });
  a.alAplicar("graficos.multiviewVR", (v) => { view.vr.rendimiento = { multiview: v === true }; });
  a.alAplicar("accesibilidad.menosMovimiento", (v) => { html.classList.toggle("menos-movimiento", v === true); view.orbeQuieto(v === true); view.rayoQuieto(v === true); }); // t_466efdb8: the «thinking» orbs stand still too
  a.alAplicar("accesibilidad.textoGrande", (v) => { html.classList.toggle("texto-grande", v === true); });
  a.alAplicar("accesibilidad.altoContraste", (v) => { html.classList.toggle("alto-contraste", v === true); });
  a.alAplicar("accesibilidad.anunciar", (v) => { $("avisos")?.setAttribute("aria-live", v === true ? "polite" : "off"); }); // safety notices (assertive) always
  a.alAplicar("interfaz.tamano", (v) => { html.style.setProperty("--ui", String(Number(v) / 100)); });
  a.alAplicar("interfaz.ayuda", (v) => { const h = $("help"); if (h) h.hidden = v !== true; });
  // ux2-barra: the minimap turning with the camera (was its «N» button)
  a.alAplicar("interfaz.minimapaGira", (v) => { (o.numinia.mapa as { minimapa?: { girar(si: boolean): void } } | undefined)?.minimapa?.girar(v === true); });
  const edicion = montarEdicion(); Object.assign(o.numinia, { edicion });
  montarMarcos(a); // U20 + U3: which panels show at Mínimo / Normal / Completo (key U) and where each sits (the table of densidad.ts)
  // V7 «menos movimiento»: the features' hops are skipped (their label and announcement still say what happened)
  const rebote = view.bounce;
  view.bounce = (...args: Parameters<View["bounce"]>) => { if (a.get("accesibilidad.menosMovimiento") !== true) rebote(...args); };
  // V6: «Baliza sonora» — a beacon of light also pings at its destination (apps/plaza/baliza-sonora.ts), off by default
  montarBalizaSonora(view as never, (id) => a.get(id));
  // T1: the session report goes only while «Enviar el informe de la sesión» is on (Pablo's default: on)
  const informar = session.report.bind(session);
  session.report = (r) => (a.get("privacidad.informe") === false ? false : informar(r));
  // the VR body on/off and the VR walking speed leave a line when the PERSON changes them (set), not when a world's defaults apply
  const poner = a.set.bind(a);
  a.set = (id, v) => {
    const antes = a.get(id), r = poner(id, v);
    if (r.ok && r.value !== antes) {
      if (id === "controles.cuerpoVR") acciones.registrar("cuerpo-vr", { activo: r.value !== false });
      else if (id === "controles.velocidadVR") acciones.ajuste("velocidad-vr", { valor: Number(r.value) });
    }
    return r;
  };
  // B (main.ts) toggles battery mode on the power policy directly: afterwards, keep that choice like any other
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyB" || escribiendo(e)) return;
    setTimeout(() => { if (view.power.battery !== a.get("graficos.bateria")) a.set("graficos.bateria", view.power.battery); }, 0);
  });
  // S1: the four «Sonido» sliders ARE the VCAs of the audio graph (packages/render/src/audio/nucleo.ts). This does
  // not build the graph by itself: it only remembers the volumes, which the core applies when something first sounds.
  const sonido = () => audio().aplicarAjustes((id) => a.get(id));
  a.alCambiar((id) => { if (id.startsWith("sonido.")) sonido(); });
  sonido();
  a.aplicarTodo(); // before the first frame
  // U25: the profile is decided once, before the first frame: choosing another one reloads the page with it
  a.alCambiar((id, v) => { if (id === AJUSTE_APARATO && typeof v === "string" && v !== perfil().eleccion && a.lista().some((x) => x.id === id && x.elegido)) cambiarAparato(v as never); });

  // ---- 4. the menu: its window (menu-ajustes-ui.ts) arrives after the first frame; the gear or `__numinia.ajustes.abrir()` bring it at once ----
  const boton = $("ajustes-abrir") as HTMLButtonElement | null;
  const alBoton = (): void => { api.abrir(); };
  const ventana = crearPuerta(async () => {
    const m = await import("./menu-ajustes-ui.ts");
    boton?.removeEventListener("click", alBoton); // the window listens to its gear from here on
    return m.montarMenuAjustes({ view, session, a, edicion, numinia: o.numinia });
  }, "ajustes");
  const api = {
    lista: () => a.lista(), grupos: () => a.grupos(), get: (id: string) => a.get(id), set: (id: string, v: unknown) => a.set(id, v),
    restablecer: (id?: string) => a.restablecer(id), capacidades: () => caps.describir(),
    /** D-076: the page hears a setting change (id, value). */
    alCambiar: (f: (id: string, v: unknown) => void) => a.alCambiar(f),
    /** Before the window exists: it is asked for now and opens when it lands (the answer is «it will»). */
    abrir: (): boolean => { const w = ventana.real(); if (w) return w.abrir(); ventana.despues((x) => { x.abrir(); }); void ventana.cargarYa().catch(() => {}); return true; },
    cerrar: (): void => { ventana.real()?.cerrar(); },
    get abierto(): boolean { return ventana.real()?.abierto() ?? false; },
  };
  boton?.addEventListener("click", alBoton);
  Object.assign(o.numinia, { ajustes: api, capacidades: caps.valores });
  const help = $("help");
  if (help && !caps.valores.punteroGrueso) help.textContent += " · O menú (ajustes, pantalla completa) · U densidad";
  return api;
}
