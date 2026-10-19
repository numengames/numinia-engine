// The environment and elements section of the builder (H4/H8): the «Naturaleza» switch, presets, a few sliders (sun, fog, wind, exposure),
// the ground, and «Elementos» (put water, fire, smoke or dust in front of you; resize, move, remove). Real HTML
// buttons and labelled inputs (screen readers, keyboard). A section of its own, shown only to builders while the
// build panel is open (the constructor agent owns that panel). It only asks: the server decides (features/entorno,
// features/elementos). main.ts passes the controllers (only composition roots import features/).
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
  poner(tipo: string, donde?: { x: number; y?: number; z: number }): Res; escalar(f: number): Res; desplazar(dx: number, dz: number): Res; quitar(): Res;
};
/** Interruptor «Naturaleza» (features/naturaleza/client.ts `interruptor`): the world's nature on or off; the server decides. */
type Naturaleza = { estado: { ultimoRechazo: string }; activa(): boolean; poner(activa: boolean): Res };
type Vista = {
  cam?: { yaw?: () => number };
  sueloBajo?: (x: number, y: number) => { x: number; y?: number; z: number } | null;
};

const PRESET_NOMBRE: Record<string, string> = { día: "Día", amanecer: "Amanecer", atardecer: "Atardecer", noche: "Noche", niebla: "Niebla", tormenta: "Tormenta", nublado: "Nublado" };
const ELEMENTO_NOMBRE: Record<string, string> = { agua: "Agua", fuego: "Fuego", humo: "Humo", polvo: "Polvo" };
const CSS = `
#panel-entorno { position: fixed; top: 110px; left: 10px; width: 270px; max-height: calc(100% - 170px); overflow: auto; padding: 8px 10px; border-radius: 8px; background: rgba(20, 24, 30, .82); color: #eef2f6; font: 13px/1.45 system-ui, sans-serif; }
#panel-entorno h2, #panel-entorno h3 { margin: 4px 0; font-size: 15px; color: #ffd27a; }
#panel-entorno h3 { font-size: 14px; margin-top: 10px; }
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
#panel-entorno button[role=switch][aria-busy="true"] { opacity: .6; }`;

export function montarEntorno(amb: Ambiente, elem: Elementos, vista: Vista, natu?: Naturaleza): void {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const panel = document.createElement("section");
  panel.id = "panel-entorno"; panel.hidden = true; panel.setAttribute("aria-label", "Entorno y elementos");
  document.body.appendChild(panel);
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
  natBoton.title = "Encender o apagar la naturaleza de este mundo (relieve, árboles, hierba, agua, fauna) para todos. Se guarda en naturaleza.json.";
  let natEsperando: boolean | null = null;
  natBoton.addEventListener("click", () => {
    if (!natu) return;
    const quiero = !natu.activa(), r = natu.poner(quiero);
    natEsperando = r.ok ? quiero : null;
    natBoton.setAttribute("aria-busy", String(r.ok));
    estado.textContent = r.ok ? (quiero ? "Encendiendo la naturaleza…" : "Apagando la naturaleza…") : `No: ${r.why}`;
    natBoton.blur();
  });
  filaNat.append(natTexto, natBoton);
  const sel = document.createElement("p");
  panel.append(
    titulo("h2", "Entorno"),
    filaNat,
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
    const mostrar = construyendo && (amb.estado.puede || elem.estado.puede);
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
    const rechazo = amb.estado.ultimoRechazo || elem.estado.ultimoRechazo || (natu?.estado.ultimoRechazo ?? "");
    if (rechazo) { estado.textContent = `No: ${rechazo}`; amb.estado.ultimoRechazo = ""; elem.estado.ultimoRechazo = ""; if (natu) natu.estado.ultimoRechazo = ""; }
  }, 300);
}
