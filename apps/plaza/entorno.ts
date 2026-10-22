// The environment and elements section of the builder (H4/H8): the «Espacio base» and «Naturaleza» switches, «Restaurar el mundo» (two steps), presets, a few sliders (sun, fog, wind, exposure),
// the ground, and «Elementos» (put water, fire, smoke or dust in front of you; resize, move, remove). Real HTML
// buttons and labelled inputs (screen readers, keyboard). Since ux2-dock it lives inside the builder's «Entorno» drawer
// (constructor.ts lends the drawer's body as `padre`; one drawer open at a time, so it no longer covers the world as a
// panel of its own), shown only to builders while building. It only asks: the server decides (features/entorno,
// features/elementos). main.ts passes the controllers (only composition roots import features/).
import { filasFunciones, textoCambio, tituloGrupo } from "../../features/funciones/panel.ts";
import type { FilaFuncion } from "../../features/funciones/panel.ts";
import type { Funcion } from "../../features/funciones/feature.ts";
type Res = { ok: true } | { ok: false; why: string };
type Valores = Record<string, unknown>;
type Ambiente = {
  estado: { puede: boolean; ultimoRechazo: string };
  presets: string[]; suelos: { id: string; nombre: string }[];
  valores(): Valores | undefined; preset(n: string): Res; ajustar(c: Valores): Res; restaurar(): Res;
};
type Elementos = {
  estado: { puede: boolean; seleccionado: string; ultimoRechazo: string };
  tipos: string[];
  seleccion(): (Valores & { id: string }) | null;
  aqui(): { x: number; z: number };
  vaciar?(): Res;
  poner(tipo: string, donde?: { x: number; y?: number; z: number }): Res; escalar(f: number): Res; desplazar(dx: number, dz: number): Res; quitar(): Res;
};
/** Interruptor «Naturaleza» (features/naturaleza/client.ts `interruptor`): the world's nature on or off; the server decides. */
type Naturaleza = { estado: { ultimoRechazo: string }; activa(): boolean; poner(activa: boolean): Res };
/** Interruptor «Espacio base» (features/espaciobase/client.ts `interruptor`) + `restaurar`: the empty night world on or off, or the file as a new world's. */
type Base = { estado: { ultimoRechazo: string }; activa(): boolean; poner(activa: boolean): Res; restaurar(): Res; semilla(): number; ponerSemilla(n: number): Res };
/** Interruptores «Funciones de este mundo» (features/funciones/client.ts `interruptores`): normas, dardos, pesca on or off; the server decides (funciones/f3). */
type Funciones = { estado: { ultimoRechazo: string }; actual(): Partial<Record<Funcion, boolean>>; fija(f: Funcion): boolean; ponerFuncion(f: Funcion, si: boolean): Res };
/** «Restaurar el mundo» also empties the objects (features/objetos/client.ts `constructor.reiniciar`): the server plants the logo and the moñoni again. */
type Objetos = { reiniciar(): Res };
/** An «Interruptor» of a piece (features/<pieza>/client.ts `interruptor`): on/off for the whole world, shown only to who the server says may (`estado.puede`: who directs or rules). */
export type Pieza = { id: string; etiqueta: string; titulo: string; encendida: string; apagada: string; interruptor: { estado: { puede: boolean; ultimoRechazo: string }; activa(): boolean; poner(activa: boolean): Res } };
type Vista = {
  cam?: { yaw?: () => number };
  sueloBajo?: (x: number, y: number) => { x: number; y?: number; z: number } | null;
};

const PRESET_NOMBRE: Record<string, string> = { día: "Día", amanecer: "Amanecer", atardecer: "Atardecer", noche: "Noche", niebla: "Niebla", tormenta: "Tormenta", nublado: "Nublado", jardín: "Jardín" };
const ELEMENTO_NOMBRE: Record<string, string> = { agua: "Agua", fuego: "Fuego", humo: "Humo", polvo: "Polvo" };
const CSS = `
#panel-entorno { font: 13px/1.45 "Geist", system-ui, sans-serif; }
#panel-entorno h3 { margin: 12px 0 4px; font-size: 14px; }
#panel-entorno .fila { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
#panel-entorno button, #panel-entorno select { padding: 6px 8px; border: 0; border-radius: 6px; background: #eef2f6; color: #23303b; font: inherit; }
#panel-entorno button[aria-pressed="true"] { background: #ffd27a; }
#panel-entorno button:focus-visible, #panel-entorno input:focus-visible, #panel-entorno select:focus-visible { outline: 3px solid #ffd27a; }
#panel-entorno label { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; margin: 6px 0 2px; }
#panel-entorno label input[type=range] { grid-column: 1 / 3; width: 100%; }
#panel-entorno .estado { color: #ffd27a; min-height: 1.4em; }
#panel-entorno .interruptor { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; }
#panel-entorno .interruptor[hidden] { display: none; }
#panel-entorno button[role=switch] { position: relative; width: 52px; height: 30px; padding: 0; border-radius: 15px; background: #55606b; flex: none; }
#panel-entorno button[role=switch]::after { content: ""; position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: var(--n-texto, #eef2f6); transition: left .15s; }
#panel-entorno button[role=switch][aria-checked="true"] { background: #4caf7a; }
#panel-entorno button[role=switch][aria-checked="true"]::after { left: 25px; }
#panel-entorno button[role=switch][aria-busy="true"] { opacity: .6; }
#panel-entorno button[role=switch][disabled] { opacity: .5; cursor: not-allowed; }
#panel-entorno .funciones { margin-bottom: 10px; }
#panel-entorno .funciones[hidden] { display: none; }
#panel-entorno .nota { margin: 2px 0 6px; color: #aab6c2; font-size: 12px; }
#panel-entorno .nota[hidden], #panel-entorno .fila[hidden] { display: none; }
#panel-entorno button.peligro { background: #f0b4aa; }`;

export function montarEntorno(amb: Ambiente, elem: Elementos, vista: Vista, natu?: Naturaleza, padre?: HTMLElement, base?: Base, objetos?: Objetos, piezas: Pieza[] = [], funcs?: Funciones): void {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const panel = document.createElement("section");
  panel.id = "panel-entorno"; panel.hidden = true; panel.setAttribute("aria-label", "Entorno y elementos");
  (padre ?? document.body).appendChild(panel);
  const estado = document.createElement("p"); estado.className = "estado"; estado.setAttribute("role", "status");
  const decir = (r: Res) => { estado.textContent = r.ok ? "Hecho." : `No: ${r.why}`; };
  const boton = (texto: string, titulo: string, fn: () => Res) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = texto; b.title = titulo;
    b.addEventListener("click", () => { decir(fn()); b.blur(); }); // blur: Space (jump) must not press it again
    return b;
  };
  const fila = (etiqueta: string, ...hijos: HTMLElement[]) => { const d = document.createElement("div"); d.className = "fila"; d.setAttribute("role", "group"); d.setAttribute("aria-label", etiqueta); d.append(...hijos); return d; };
  const titulo = (nivel: "h2" | "h3", t: string) => { const h = document.createElement(nivel); h.textContent = t; return h; };

  // presets
  const presets = amb.presets.map((p) => { const b = boton(PRESET_NOMBRE[p] ?? p, `Poner el entorno «${PRESET_NOMBRE[p] ?? p}» (el suelo se queda)`, () => amb.preset(p)); b.dataset.preset = p; return b; });
  // sliders: each one changes one field; sent at most every 150 ms while dragging, and once more on release
  type Deslizador = { campo: string; input: HTMLInputElement; salida: HTMLOutputElement; formato: (v: number) => string };
  const deslizadores: Deslizador[] = [];
  const deslizador = (texto: string, campo: string, min: number, max: number, paso: number, formato: (v: number) => string) => {
    const label = document.createElement("label");
    const span = document.createElement("span"); span.textContent = texto;
    const salida = document.createElement("output");
    const input = document.createElement("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(paso);
    input.setAttribute("aria-label", texto);
    let ultimo = 0, espera: ReturnType<typeof setTimeout> | null = null;
    const enviar = () => { espera = null; ultimo = performance.now(); decir(amb.ajustar({ [campo]: Number(input.value) })); };
    input.addEventListener("input", () => {
      salida.textContent = formato(Number(input.value));
      if (performance.now() - ultimo > 150) enviar(); else if (!espera) espera = setTimeout(enviar, 150);
    });
    input.addEventListener("change", () => { if (espera) clearTimeout(espera); enviar(); });
    label.append(span, salida, input);
    deslizadores.push({ campo, input, salida, formato });
    return label;
  };
  const suelo = document.createElement("select");
  suelo.setAttribute("aria-label", "Suelo");
  for (const s of amb.suelos) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.nombre; suelo.appendChild(o); }
  suelo.addEventListener("change", () => decir(amb.ajustar({ suelo: suelo.value })));
  const sueloLabel = document.createElement("label"); const sueloSpan = document.createElement("span"); sueloSpan.textContent = "Suelo"; sueloLabel.append(sueloSpan, suelo);

  // elements: in front of where the camera looks (or 3 m in front of you)
  const delante = (): { x: number; z: number } | undefined => {
    const p = vista.sueloBajo?.(innerWidth / 2, innerHeight / 2);
    const yaw = vista.cam?.yaw?.();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
    if (typeof yaw !== "number") return undefined; // the feature's default: 3 m towards -z
    const here = elem.aqui();
    return { x: here.x - Math.sin(yaw) * 3, z: here.z - Math.cos(yaw) * 3 };
  };
  // Interruptor «Naturaleza» (R-1): a phone-style switch, only for whoever may build (amb.estado.puede = the server's
  // «construir»). Clicking only asks; the switch follows the server's state (the file it wrote), never its own click.
  const filaNat = document.createElement("div"); filaNat.className = "interruptor"; filaNat.hidden = true;
  const natTexto = document.createElement("span"); natTexto.id = "naturaleza-etiqueta"; natTexto.textContent = "Naturaleza";
  const natBoton = document.createElement("button"); natBoton.type = "button"; natBoton.id = "naturaleza-interruptor";
  natBoton.setAttribute("role", "switch"); natBoton.setAttribute("aria-checked", "false"); natBoton.setAttribute("aria-labelledby", "naturaleza-etiqueta");
  natBoton.title = "Encender o apagar la naturaleza de este mundo (relieve, árboles, hierba, agua, fauna) para todos. Se pinta sobre el relieve del espacio base: pueden estar encendidas las dos a la vez. Se guarda en naturaleza.json. / Turn this world's nature (trees, grass, water, fauna) on or off for everyone. It is painted on the base space's relief: both can be on together.";
  let natEsperando: boolean | null = null;
  natBoton.addEventListener("click", () => {
    if (!natu) return;
    const quiero = !natu.activa();
    const r = natu.poner(quiero);
    natEsperando = r.ok ? quiero : null;
    natBoton.setAttribute("aria-busy", String(r.ok));
    estado.textContent = r.ok ? (quiero ? "Encendiendo la naturaleza…" : "Apagando la naturaleza…") : `No: ${r.why}`;
    natBoton.blur();
  });
  filaNat.append(natTexto, natBoton);
  // Interruptor «Espacio base» (H8, same pattern): the empty night world; only for builders; follows the server's state.
  const filaBase = document.createElement("div"); filaBase.className = "interruptor"; filaBase.hidden = true;
  const baseTexto = document.createElement("span"); baseTexto.id = "espacio-base-etiqueta"; baseTexto.textContent = "Espacio base";
  const baseBoton = document.createElement("button"); baseBoton.type = "button"; baseBoton.id = "espacio-base-interruptor";
  baseBoton.setAttribute("role", "switch"); baseBoton.setAttribute("aria-checked", "false"); baseBoton.setAttribute("aria-labelledby", "espacio-base-etiqueta");
  baseBoton.title = "Encender o apagar el espacio base de este mundo (el lienzo en blanco: de noche, suelo de líneas luminosas, sin árboles ni hierba) para todos. Es el suelo de todo: la naturaleza se pinta encima, y las dos pueden estar encendidas. Se guarda en espacio-base.json. / Turn the blank base space (night, glowing line ground) on or off for everyone. It is the floor of everything: nature is painted on top and both can be on together.";
  let baseEsperando: boolean | null = null;
  baseBoton.addEventListener("click", () => {
    if (!base) return;
    const quiero = !base.activa();
    const r = base.poner(quiero);
    baseEsperando = r.ok ? quiero : null;
    baseBoton.setAttribute("aria-busy", String(r.ok));
    estado.textContent = r.ok ? (quiero ? "Encendiendo el espacio base…" : "Apagando el espacio base…") : `No: ${r.why}`;
    baseBoton.blur();
  });
  filaBase.append(baseTexto, baseBoton);
  const nota = document.createElement("p"); nota.className = "nota"; nota.hidden = true;
  nota.textContent = "Espacio base: el lienzo en blanco, de noche. Naturaleza: árboles, hierba y agua que se pintan sobre el relieve del espacio base. Pueden estar encendidas las dos a la vez. / Base space: the blank canvas, at night. Nature: trees, grass and water painted on the base space's relief. Both can be on together.";
  // «Restaurar el mundo»: two steps (ask, then confirm); it empties what was built and puts the world back in the espacio base.
  const confirmar = document.createElement("div"); confirmar.className = "fila"; confirmar.hidden = true; confirmar.setAttribute("role", "group"); confirmar.setAttribute("aria-label", "Confirmar restaurar el mundo");
  const restaurarBoton = boton("Restaurar el mundo", "Borrar todo lo construido y volver al espacio base (la hoja en blanco). Pide confirmación. / Delete everything built and go back to the base space. Asks first.", () => ({ ok: true }));
  restaurarBoton.id = "mundo-restaurar";
  const sino = document.createElement("span"); sino.textContent = "Se borra todo lo construido y vuelves al espacio base. No se puede deshacer. / Everything built is deleted and you go back to the base space. It cannot be undone.";
  const si = document.createElement("button"); si.type = "button"; si.id = "mundo-restaurar-si"; si.className = "peligro"; si.textContent = "Sí, restaurar el mundo";
  const no = document.createElement("button"); no.type = "button"; no.id = "mundo-restaurar-no"; no.textContent = "No, dejarlo como está";
  confirmar.append(sino, si, no);
  let arrepentirse: ReturnType<typeof setTimeout> | null = null;
  const cerrarConfirmar = () => { if (arrepentirse) clearTimeout(arrepentirse); arrepentirse = null; confirmar.hidden = true; restaurarBoton.hidden = false; };
  restaurarBoton.addEventListener("click", () => { restaurarBoton.hidden = true; confirmar.hidden = false; si.focus(); arrepentirse = setTimeout(cerrarConfirmar, 10000); });
  no.addEventListener("click", () => { cerrarConfirmar(); estado.textContent = "Dejado como estaba."; restaurarBoton.focus(); });
  si.addEventListener("click", () => {
    cerrarConfirmar();
    const fallos: string[] = [];
    if (natu?.activa()) natu.poner(false); // «Restore» goes back to the blank canvas: the nature is turned off too (it is a choice, not an exclusion)
    for (const r of [base?.restaurar(), objetos?.reiniciar(), elem.vaciar?.()]) if (r && !r.ok) fallos.push(r.why);
    estado.textContent = fallos.length ? `No del todo: ${fallos[0]}` : "Mundo restaurado: vuelves al espacio base.";
  });
  const filaRestaurar = document.createElement("div"); filaRestaurar.hidden = true; filaRestaurar.append(fila("Restaurar el mundo", restaurarBoton), confirmar);
  // Seed of the espacio base (H8): a number and two buttons, no file to edit. Live for everyone; the logo and the moñoni stay where they are.
  const filaSemilla = document.createElement("div"); filaSemilla.className = "fila"; filaSemilla.hidden = true; filaSemilla.setAttribute("role", "group"); filaSemilla.setAttribute("aria-label", "Semilla del espacio base / Base space seed");
  const semEtiqueta = document.createElement("label"); semEtiqueta.style.display = "flex"; semEtiqueta.style.gap = "6px"; semEtiqueta.style.alignItems = "center";
  const semTexto = document.createElement("span"); semTexto.textContent = "Semilla / Seed";
  const semInput = document.createElement("input"); semInput.type = "number"; semInput.id = "espacio-base-semilla"; semInput.min = "0"; semInput.max = "2147483647"; semInput.step = "1"; semInput.style.width = "9em";
  semInput.title = "El relieve de alrededor de la meseta: el mismo número da el mismo relieve. / The relief around the plateau: the same number gives the same relief.";
  semEtiqueta.append(semTexto, semInput);
  const semIr = (n: number) => { const r = base?.ponerSemilla(n) ?? { ok: false as const, why: "no hay espacio base" }; estado.textContent = r.ok ? `Semilla ${n}…` : `No: ${r.why}`; };
  const semAplicar = boton("Aplicar", "Usar esta semilla / Use this seed", () => { const n = Number(semInput.value); if (!Number.isInteger(n) || n < 0 || n > 2147483647) return { ok: false, why: "un número entero entre 0 y 2147483647" }; semIr(n); return { ok: true }; });
  const semAzar = boton("Otra al azar", "Probar otra semilla al azar / Try a random seed", () => { const n = Math.floor(Math.random() * 1_000_000); semInput.value = String(n); semIr(n); return { ok: true }; });
  filaSemilla.append(semEtiqueta, semAplicar, semAzar);
  // Interruptores de piezas (Pablo, 2026-10-21: toda pieza es un interruptor): same pattern, but the row is shown to who may DIRIGIR
  // or rule (the server's `permiso`), not only to builders; the switch follows the server's state, never its own click.
  const filasPieza = piezas.map((pz) => {
    const fila = document.createElement("div"); fila.className = "interruptor"; fila.hidden = true;
    const texto = document.createElement("span"); texto.id = `${pz.id}-etiqueta`; texto.textContent = pz.etiqueta;
    const boton = document.createElement("button"); boton.type = "button"; boton.id = `${pz.id}-interruptor`;
    boton.setAttribute("role", "switch"); boton.setAttribute("aria-checked", "false"); boton.setAttribute("aria-labelledby", texto.id); boton.title = pz.titulo;
    let esperando: boolean | null = null;
    boton.addEventListener("click", () => {
      const quiero = !pz.interruptor.activa(), r = pz.interruptor.poner(quiero);
      esperando = r.ok ? quiero : null;
      boton.setAttribute("aria-busy", String(r.ok));
      estado.textContent = r.ok ? `${quiero ? "Encendiendo" : "Apagando"}: ${pz.etiqueta}…` : `No: ${r.why}`;
      boton.blur();
    });
    fila.append(texto, boton);
    return { pz, fila, boton, esperando: () => esperando, limpiar: () => { esperando = null; boton.setAttribute("aria-busy", "false"); } };
  });
  // «Funciones de este mundo» (funciones/f3): one switch per function the world has (normas, dardos, pesca), the same shape as «Espacio base».
  // Which rows, what they say and whether they can be pressed is features/funciones/panel.ts (pure); here they are only drawn and follow the server.
  const grupoFunciones = document.createElement("div"); grupoFunciones.className = "funciones"; grupoFunciones.id = "funciones-mundo"; grupoFunciones.hidden = true;
  grupoFunciones.setAttribute("role", "group"); grupoFunciones.setAttribute("aria-label", tituloGrupo("es") + " / " + tituloGrupo("en"));
  const grupoTitulo = titulo("h3", tituloGrupo("es")); grupoTitulo.title = tituloGrupo("en");
  grupoFunciones.append(grupoTitulo);
  const idioma = () => (typeof document !== "undefined" ? document.documentElement.lang : "");
  type FilaDom = { fila: HTMLElement; boton: HTMLButtonElement; notas: HTMLElement; clave: string };
  const filasDom = new Map<Funcion, FilaDom>();
  const funcEsperando = new Map<Funcion, boolean>();
  const pulsarFuncion = (f: Funcion) => {
    if (!funcs) return;
    if (funcs.fija(f)) { estado.textContent = textoCambio(f, "fija", idioma()); return; }
    const quiero = !(funcs.actual()[f] ?? false);
    const r = funcs.ponerFuncion(f, quiero);
    if (r.ok) funcEsperando.set(f, quiero); else funcEsperando.delete(f);
    const d = filasDom.get(f); if (d) { d.boton.setAttribute("aria-busy", String(r.ok)); d.boton.blur(); }
    estado.textContent = r.ok ? textoCambio(f, quiero ? "encendiendo" : "apagando", idioma()) : `No: ${r.why}`;
  };
  const dibujarFila = (r: FilaFuncion): FilaDom => {
    const fila = document.createElement("div"); fila.className = "interruptor";
    const texto = document.createElement("span"); texto.id = `funcion-${r.funcion}-etiqueta`;
    const boton = document.createElement("button"); boton.type = "button"; boton.id = `funcion-${r.funcion}-interruptor`; boton.dataset.funcion = r.funcion;
    boton.setAttribute("role", "switch"); boton.setAttribute("aria-labelledby", texto.id);
    boton.addEventListener("click", () => pulsarFuncion(r.funcion));
    fila.append(texto, boton);
    const notas = document.createElement("div"); notas.dataset.funcion = r.funcion;
    return { fila, boton, notas, clave: "" };
  };
  /** Redraw the rows from the server's state: add the new ones, drop those the world lost, keep the DOM of the rest (focus, busy). */
  const pintarFunciones = (): void => {
    const filas = funcs ? filasFunciones({ actual: funcs.actual(), fija: { normas: funcs.fija("normas"), dardos: funcs.fija("dardos"), pesca: funcs.fija("pesca") }, puede: amb.estado.puede }, idioma()) : [];
    grupoFunciones.hidden = filas.length === 0;
    const ids = new Set(filas.map((r) => r.funcion));
    for (const [f, d] of filasDom) if (!ids.has(f)) { d.fila.remove(); d.notas.remove(); filasDom.delete(f); funcEsperando.delete(f); }
    let anterior: HTMLElement = grupoTitulo;
    for (const r of filas) {
      let d = filasDom.get(r.funcion);
      if (!d) { d = dibujarFila(r); filasDom.set(r.funcion, d); }
      if (anterior.nextSibling !== d.fila) anterior.after(d.fila);
      if (d.fila.nextSibling !== d.notas) d.fila.after(d.notas);
      anterior = d.notas;
      const clave = JSON.stringify(r);
      if (d.clave !== clave) {
        d.clave = clave;
        (d.fila.firstChild as HTMLElement).textContent = r.etiqueta;
        d.boton.title = r.titulo;
        d.boton.disabled = !r.pulsable;
        d.boton.setAttribute("aria-checked", String(r.activa));
        d.boton.setAttribute("aria-description", r.notas.join(" "));
        d.notas.replaceChildren(...r.notas.map((n) => { const p = document.createElement("p"); p.className = "nota"; p.textContent = n; return p; }));
      }
      const espera = funcEsperando.get(r.funcion);
      if (espera !== undefined && (r.activa === espera || funcs?.estado.ultimoRechazo)) {
        if (r.activa === espera) estado.textContent = textoCambio(r.funcion, espera ? "encendida" : "apagada", idioma());
        funcEsperando.delete(r.funcion); d.boton.setAttribute("aria-busy", "false");
      }
    }
  };
  const sel = document.createElement("p");
  panel.append(
    ...filasPieza.map((f) => f.fila),
    filaBase,
    filaNat,
    nota,
    filaSemilla,
    filaRestaurar,
    grupoFunciones,
    fila("Entornos con nombre", ...presets),
    deslizador("Altura del sol", "solAltura", -30, 90, 1, (v) => `${v}°`),
    deslizador("Rumbo del sol", "solRumbo", -180, 180, 5, (v) => `${v}°`),
    deslizador("Niebla (lejos)", "nieblaLejos", 0, 600, 5, (v) => (v === 0 ? "sin niebla" : `${v} m`)),
    deslizador("Viento", "vientoFuerza", 0, 25, 0.5, (v) => `${v} m/s`),
    deslizador("Exposición", "exposicion", 0.2, 2.5, 0.05, (v) => v.toFixed(2)),
    sueloLabel,
    fila("Entorno del mundo", boton("Restaurar el del mundo", "Volver al entorno con el que viene el mundo", () => amb.restaurar())),
    titulo("h3", "Elementos"),
    fila("Poner delante de ti", ...elem.tipos.map((t) => boton(`Poner ${(ELEMENTO_NOMBRE[t] ?? t).toLowerCase()}`, `Poner ${ELEMENTO_NOMBRE[t] ?? t} delante de ti`, () => elem.poner(t, delante())))),
    sel,
    fila("Cambiar el elemento", boton("Más grande", "Agrandar un 25 %", () => elem.escalar(1.25)), boton("Más pequeño", "Reducir un 20 %", () => elem.escalar(0.8)),
      boton("←", "Mover 1 m a la izquierda", () => elem.desplazar(-1, 0)), boton("→", "Mover 1 m a la derecha", () => elem.desplazar(1, 0)),
      boton("↑", "Mover 1 m hacia el fondo", () => elem.desplazar(0, -1)), boton("↓", "Mover 1 m hacia ti", () => elem.desplazar(0, 1)),
      boton("Quitar", "Quitar el elemento del mundo", () => elem.quitar())),
    estado,
  );

  // shown only to builders while the build panel is open; values follow the server's (unless you are dragging)
  setInterval(() => {
    const construyendo = document.getElementById("panel-construir")?.hidden === false;
    const mostrar = construyendo && (amb.estado.puede || elem.estado.puede || filasPieza.some((f) => f.pz.interruptor.estado.puede));
    if (panel.hidden === mostrar) panel.hidden = !mostrar;
    if (!mostrar) return;
    const v = amb.valores();
    if (v) {
      for (const d of deslizadores) if (document.activeElement !== d.input) { d.input.value = String(v[d.campo]); d.salida.textContent = d.formato(Number(v[d.campo])); }
      if (document.activeElement !== suelo) suelo.value = String(v.suelo);
      for (const b of presets) b.setAttribute("aria-pressed", String(b.dataset.preset === v.preset));
    }
    const o = elem.seleccion();
    sel.textContent = o ? `Elemento: ${String(o.nombre) || ELEMENTO_NOMBRE[String(o.tipo)] || String(o.tipo)} · ${o.id}` : "Ningún elemento seleccionado ni a menos de 12 m.";
    if (natu) {
      filaNat.hidden = !amb.estado.puede;
      const on = natu.activa();
      natBoton.setAttribute("aria-checked", String(on));
      if (natEsperando !== null && (on === natEsperando || natu.estado.ultimoRechazo)) {
        if (on === natEsperando) estado.textContent = on ? "Naturaleza encendida." : "Naturaleza apagada.";
        natEsperando = null; natBoton.setAttribute("aria-busy", "false");
      }
    }
    if (base) {
      filaBase.hidden = !amb.estado.puede; nota.hidden = !amb.estado.puede || !natu; filaRestaurar.hidden = !amb.estado.puede;
      const on = base.activa();
      baseBoton.setAttribute("aria-checked", String(on));
      filaSemilla.hidden = !amb.estado.puede || !on;
      if (document.activeElement !== semInput) semInput.value = String(base.semilla());
      if (baseEsperando !== null && (on === baseEsperando || base.estado.ultimoRechazo)) {
        if (on === baseEsperando) estado.textContent = on ? "Espacio base encendido." : "Espacio base apagado.";
        baseEsperando = null; baseBoton.setAttribute("aria-busy", "false");
      }
    }
    for (const f of filasPieza) {
      const i = f.pz.interruptor, on = i.activa();
      f.fila.hidden = !i.estado.puede;
      f.boton.setAttribute("aria-checked", String(on));
      const q = f.esperando();
      if (q !== null && (on === q || i.estado.ultimoRechazo)) { if (on === q) estado.textContent = on ? f.pz.encendida : f.pz.apagada; f.limpiar(); }
      if (i.estado.ultimoRechazo && !(q !== null)) { estado.textContent = `No: ${i.estado.ultimoRechazo}`; }
      if (i.estado.ultimoRechazo) i.estado.ultimoRechazo = "";
    }
    pintarFunciones();
    const rechazo = amb.estado.ultimoRechazo || elem.estado.ultimoRechazo || (natu?.estado.ultimoRechazo ?? "") || (base?.estado.ultimoRechazo ?? "") || (funcs?.estado.ultimoRechazo ?? "");
    if (rechazo) { estado.textContent = `No: ${rechazo}`; amb.estado.ultimoRechazo = ""; elem.estado.ultimoRechazo = ""; if (natu) natu.estado.ultimoRechazo = ""; if (base) base.estado.ultimoRechazo = ""; if (funcs) funcs.estado.ultimoRechazo = ""; }
  }, 300);
}
