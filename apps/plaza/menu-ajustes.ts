// N2: the settings menu of the plaza — real HTML (a <dialog> with labelled inputs that keyboards, touch screens and
// screen readers use; RD 193/2023) — and what each engine setting does on this page: the power policy, the camera (N1
// contract `view.cam.ajustar`), the environment (H4 contract `view.entorno.calidad`), the HUD, the help line, the CSS
// classes of accessibility, the announcements and the session report (T1). The registry, the capabilities and the
// engine's settings are packages/client (pure, tested in Node). main.ts mounts this before the first frame (the display
// loop only starts drawing on the next animation frame), so stored choices and the system's preferences are on screen
// from the start (V7). Not named «ajustes.ts»: dev:lan proxies every path that starts with /a to the server.
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
  };
};

let activo: Ajustes | null = null;
/** A feature reads one of its own settings (the view hook `ajuste`, wired in main.ts). undefined before mounting. */
export const leerAjuste = (id: string): Valor | undefined => activo?.get(id);

/** Typing in a box belongs to the box, not to the world: J3's one rule for every key listener of the page. */
import { escribiendo } from "./escribiendo.ts";
import { montarMarcos } from "./marcos.ts"; // U20 + U3: the density dial, the frames, the clock, the notices
export { escribiendo };
/** Inside the menu, O closes it unless the key is text being typed. */
const escribeTexto = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit", "reset", "color"].includes((el as HTMLInputElement).type);
};

const TECLAS: Record<string, string> = { Escape: "Escape", Space: "Espacio", Enter: "Intro", Tab: "Tabulador", Delete: "Supr", Backspace: "Retroceso", ShiftLeft: "Mayús", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
const nombreTecla = (code: string): string => TECLAS[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Teclado numérico ");
function textoValor(s: Vista): string {
  if (s.tipo === "bool") return s.valor ? "sí" : "no";
  if (s.tipo === "numero") return `${s.valor}${s.unidad ? ` ${s.unidad}` : ""}`;
  if (s.tipo === "eleccion") return s.opciones?.find((o) => o.valor === s.valor)?.nombre ?? String(s.valor);
  return nombreTecla(String(s.valor));
}

export function montarAjustes(o: { view: View; session: ClientSession; params: URLSearchParams; funciones: readonly ClientPart[]; numinia: Record<string, unknown> }) {
  const { view, session, params } = o;
  const extra = view as unknown as Contratos;

  // ---- 1. capabilities: the browser, then what the view knows; XR answers later; the OS may change its mind ----
  const entornoCaps = (): Record<string, boolean> => {
    const e = extra.entorno, hay = typeof e?.calidad === "function";
    let c: Record<string, unknown> = {};
    try { c = (hay && e?.capacidades?.()) || {}; } catch { c = {}; }
    const out: Record<string, boolean> = { entorno: hay };
    for (const k of ["sombras", "agua", "particulas", "hdr"]) out[`entorno.${k}`] = hay && c[k] !== false;
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
  const camara = (_: Valor, l: Lectura) => extra.cam?.ajustar?.({ sensibilidad: Number(l.get("controles.sensibilidad")) / 100, invertirY: l.get("controles.invertirY") === true });
  a.alAplicar("controles.sensibilidad", camara);
  a.alAplicar("controles.invertirY", camara);
  const zona = (_: Valor, l: Lectura) => extra.cam?.ajustar?.({ zonaMuerta: Number(l.get("controles.zonaMuerta")) / 100 });
  a.alAplicar("controles.zonaMuerta", zona);
  // t_bf8947cf (MVL1): the VR rig always exists (unlike cam/entorno, built in parallel branches), so this
  // writes straight to view.vr instead of going through Contratos.
  a.alAplicar("controles.modoMovimientoVR", (v) => { view.vr.modoMovimiento = v as "mirada" | "mando" | "cuerpo"; });
  a.alAplicar("accesibilidad.menosMovimiento", (v) => { html.classList.toggle("menos-movimiento", v === true); });
  a.alAplicar("accesibilidad.textoGrande", (v) => { html.classList.toggle("texto-grande", v === true); });
  a.alAplicar("accesibilidad.altoContraste", (v) => { html.classList.toggle("alto-contraste", v === true); });
  a.alAplicar("accesibilidad.anunciar", (v) => { $("avisos")?.setAttribute("aria-live", v === true ? "polite" : "off"); }); // safety notices (assertive) always
  a.alAplicar("interfaz.tamano", (v) => { html.style.setProperty("--ui", String(Number(v) / 100)); });
  a.alAplicar("interfaz.ayuda", (v) => { const h = $("help"); if (h) h.hidden = v !== true; });
  montarMarcos(a); // U20 + U3: which panels show at Mínimo / Normal / Completo (key U) and where each sits (the table of densidad.ts)
  // V7 «menos movimiento»: the features' hops are skipped (their label and announcement still say what happened)
  const rebote = view.bounce;
  view.bounce = (...args: Parameters<View["bounce"]>) => { if (a.get("accesibilidad.menosMovimiento") !== true) rebote(...args); };
  // T1: the session report goes only while «Enviar el informe de la sesión» is on (Pablo's default: on)
  const informar = session.report.bind(session);
  session.report = (r) => (a.get("privacidad.informe") === false ? false : informar(r));
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

  // ---- 4. the menu ----
  const dlg = $("ajustes") as HTMLDialogElement | null, boton = $("ajustes-abrir") as HTMLButtonElement | null;
  const lista = $("ajustes-grupos"), estado = $("ajustes-estado"), titulo = $("ajustes-titulo");
  const api = {
    lista: () => a.lista(), grupos: () => a.grupos(), get: (id: string) => a.get(id), set: (id: string, v: unknown) => a.set(id, v),
    restablecer: (id?: string) => a.restablecer(id), capacidades: () => caps.describir(),
    abrir: (): boolean => abrir(), cerrar: (): void => cerrar(),
    get abierto(): boolean { return !!dlg?.open; },
  };
  Object.assign(o.numinia, { ajustes: api, capacidades: caps.valores });
  const help = $("help");
  if (help && !caps.valores.punteroGrueso) help.textContent += " · O ajustes · U densidad";
  if (!dlg || !boton || !lista || !estado) { console.warn("[ajustes] faltan #ajustes, #ajustes-abrir, #ajustes-grupos o #ajustes-estado en la página"); return api; }

  let espera: ReturnType<typeof setTimeout> | undefined;
  const anunciar = (texto: string, ms = 0) => { clearTimeout(espera); espera = setTimeout(() => { estado.textContent = texto; }, ms); };
  const cid = (id: string) => `ajuste-${id}`;
  function elegir(id: string, v: Valor, ms = 0): void {
    const r = a.set(id, v);
    if (!r.ok) { anunciar(`No: ${r.issues[0].message}`); return; }
    const s = a.lista().find((x) => x.id === id);
    if (s) anunciar(`${s.nombre}: ${textoValor(s)}`, ms);
  }
  function fila(s: Vista): HTMLElement {
    const div = document.createElement("div"), id = cid(s.id);
    div.className = `ajuste ${s.tipo}`; div.dataset.id = s.id; div.hidden = !s.visible;
    const label = document.createElement("label"); label.htmlFor = id; label.textContent = s.nombre;
    const desc = document.createElement("p"); desc.id = `${id}-d`; desc.className = "describe"; desc.textContent = s.describe;
    let control: HTMLElement;
    if (s.tipo === "bool") {
      const i = document.createElement("input"); i.type = "checkbox"; i.checked = s.valor === true;
      i.addEventListener("change", () => elegir(s.id, i.checked));
      control = i; div.append(i, label);
    } else if (s.tipo === "numero") {
      const i = document.createElement("input"), out = document.createElement("output");
      i.type = "range"; i.min = String(s.min); i.max = String(s.max); i.step = String(s.paso); i.value = String(s.valor);
      i.setAttribute("aria-valuetext", textoValor(s));
      out.id = `${id}-v`; out.htmlFor.add(id); out.textContent = textoValor(s);
      i.addEventListener("input", () => elegir(s.id, Number(i.value), 400)); // a slider says its value itself; the status waits
      control = i; div.append(label, out, i);
    } else if (s.tipo === "eleccion") {
      const sel = document.createElement("select");
      for (const op of s.opciones ?? []) sel.add(new Option(op.nombre, op.valor));
      sel.value = String(s.valor);
      sel.addEventListener("change", () => elegir(s.id, sel.value));
      control = sel; div.append(label, sel);
    } else { // tecla: shown only (remapping comes later): «Abrir y cerrar los ajustes  O»
      const k = document.createElement("kbd"); k.textContent = nombreTecla(String(s.valor));
      const t = document.createElement("span"); t.className = "nombre"; t.textContent = s.nombre;
      control = k; div.append(t, k);
    }
    control.id = id;
    let describedBy = desc.id;
    div.append(desc);
    if (s.nota) { const n = document.createElement("p"); n.id = `${id}-n`; n.className = "nota"; n.textContent = s.nota; div.append(n); describedBy += ` ${n.id}`; }
    control.setAttribute("aria-describedby", describedBy);
    return div;
  }
  function grupoDom(g: Grupo): HTMLFieldSetElement {
    const fs = document.createElement("fieldset"), lg = document.createElement("legend");
    fs.dataset.grupo = g.id; lg.textContent = g.nombre; fs.append(lg);
    if (g.describe) { const p = document.createElement("p"); p.className = "describe"; p.textContent = g.describe; fs.append(p); }
    for (const s of g.ajustes) fs.append(fila(s));
    if (g.id === "controles") { // the features' keys, read-only (they come from the features' actions)
      const acts = session.features.actions().filter((x) => x.key);
      if (acts.length) {
        const ul = document.createElement("ul"); ul.className = "teclas"; ul.setAttribute("aria-label", "Teclas de las funciones");
        for (const x of acts) { const li = document.createElement("li"), k = document.createElement("kbd"); k.textContent = nombreTecla(x.key!); li.append(k, ` ${x.label}`); ul.append(li); }
        fs.append(ul);
      }
    }
    fs.hidden = !g.ajustes.some((s) => s.visible);
    return fs;
  }
  const construir = () => lista.replaceChildren(...a.grupos().map(grupoDom));
  construir();
  // any change (the menu, an agent, the B key, a preset, a capability that arrived) updates the controls in place
  a.alCambiar((id) => {
    const s = a.lista().find((x) => x.id === id), fil = lista.querySelector<HTMLElement>(`.ajuste[data-id="${id}"]`);
    if (!s) return;
    if (!fil) { construir(); return; } // a setting declared later
    fil.hidden = !s.visible;
    const c = $(cid(id));
    if (c instanceof HTMLInputElement && c.type === "checkbox") c.checked = s.valor === true;
    else if (c instanceof HTMLInputElement || c instanceof HTMLSelectElement) { if (c.value !== String(s.valor)) c.value = String(s.valor); }
    if (c instanceof HTMLInputElement && c.type === "range") { c.setAttribute("aria-valuetext", textoValor(s)); const out = $(`${cid(id)}-v`); if (out) out.textContent = textoValor(s); }
    const fs = fil.closest("fieldset");
    if (fs) fs.hidden = ![...fs.querySelectorAll<HTMLElement>(".ajuste")].some((x) => !x.hidden);
  });

  const enXR = () => view.vr.active || view.ar.state !== "off";
  let volverA: HTMLElement | null = null;
  function abrir(): boolean {
    if (!dlg || dlg.open || enXR()) return !!dlg?.open;
    volverA = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); }
    boton!.setAttribute("aria-expanded", "true");
    titulo?.focus(); // a quiet start: the dialog's name is read, nothing changes by accident; Tab walks the settings
    return true;
  }
  function cerrar(): void { if (dlg?.open) dlg.close(); }
  dlg.addEventListener("close", () => {
    boton.setAttribute("aria-expanded", "false");
    const a2 = volverA && document.contains(volverA) && volverA !== document.body ? volverA : null;
    a2?.focus();
  });
  // keys typed in the menu never reach the world (W, B, Space…), like escribiendo() for the chat; O closes, Escape too (native)
  dlg.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "KeyO" && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !escribeTexto(e.target)) { e.preventDefault(); cerrar(); }
  });
  dlg.addEventListener("pointerdown", (e) => e.stopPropagation()); // touching the menu never starts the joystick
  dlg.addEventListener("click", (e) => { // a click on the dimmed page around the panel closes it
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cerrar();
  });
  $("ajustes-cerrar")?.addEventListener("click", cerrar);
  $("ajustes-restablecer")?.addEventListener("click", () => { a.restablecer(); anunciar("Ajustes restablecidos: cada uno vuelve a lo que da tu aparato."); });
  boton.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  boton.addEventListener("click", () => { if (dlg.open) cerrar(); else abrir(); });
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyO" || e.repeat || e.ctrlKey || e.altKey || e.metaKey || escribiendo(e)) return;
    if (dlg.open) cerrar(); else abrir();
  });
  // hidden in XR (a 3D settings panel inside VR comes later)
  setInterval(() => { const x = enXR(); if (x) cerrar(); if (boton.hidden !== x) boton.hidden = x; }, 250);
  return api;
}
