// cable (D-041), builder view (historias 5-6): dentro del cajón «Cable» del constructor (ux2-dock), una lista con cada disparador que
// el mundo cablea en disparadores.json — su nombre, tipo, estado (listo / en espera / agotado) y cuántas veces ha
// disparado — con un botón «Probar» para los de tipo botón (dispararlo sin acercarse: cómodo para comprobar un
// cooldown o un «un solo uso» antes de que nadie más esté cerca). Historia A (cable sin JSON): «+ Nuevo cable» y «Borrar»
// con confirmación en la propia fila. Historia B: cada cable se lee como una frase y el JSON queda en «Ver datos».
// Historia C: la frase ES el editor. «Cuando [alguien pulse el botón] [nombre], [muestra] [Farola]. Espera [5 s]»: cada
// hueco es un desplegable (o un texto / número solo donde no hay otra forma: el nombre, un enlace https, una coordenada)
// y solo se puede elegir lo válido. La frase y sus opciones las hace features/disparadores/cable-huecos.ts (pura, textos
// por idioma); la página SOLO pinta un control por hueco y manda UNA petición (editarDisparador o crearDisparador): el
// servidor valida todo con el lector del fichero y su error, en español, sale junto al control. «+ Nuevo cable» abre
// los mismos huecos con valores de partida; no existe hasta pulsar «Crear cable». Solo quien tiene permiso de construir.
import { ESTILO_DECIR, montarDecir } from "./cable-decir.ts";
import type { OpcionesDecir } from "./cable-decir.ts";
import { idiomaDe, FRASES } from "../../features/disparadores/cable-frase.ts";
import type { ClaveFrase } from "../../features/disparadores/cable-frase.ts";
import { CONTEXTO_VACIO, huecosDeCable, receptorNuevo } from "../../features/disparadores/cable-huecos.ts";
import type { BorradorCable, ContextoCable, Parte } from "../../features/disparadores/cable-huecos.ts";
type Res = { ok: true } | { ok: false; why: string };
type Tipo = "zona" | "boton" | "senal";
export type Disparador = { id: string; nombre: string; tipo: Tipo; senal?: string; cooldown: number; unSoloUso: boolean; usos: number; enEspera: boolean; agotado: boolean; receptores: Record<string, unknown>[] };
/** What «Crear cable» sends: one line of disparadores.json (the server fills nothing in and checks everything). */
export type NuevoCable = { id: string; tipo: Tipo; nombre: string; x: number; y: number; z: number; radio: number; frase: string; senal: string; cooldown: number; unSoloUso: boolean; receptores: Record<string, unknown>[] };
export type CambioCable = { id: string; nombre: string; tipo: Tipo; senal: string; cooldown: number; unSoloUso: boolean; receptores: Record<string, unknown>[]; mover?: { x: number; y: number; z: number } };
type DecirDelCable = OpcionesDecir["decir"];
export type OpcionesCable = {
  constructor: { estado: { puede: boolean }; escuchar(fn: (que: string) => void): () => void };
  disparadores: {
    lista(): Disparador[]; pulsar(id: string): Res; editarReceptores(id: string, receptores: Record<string, unknown>[]): Res; crearDisparador(d: NuevoCable): Res; borrarDisparador(id: string): Res;
    editarDisparador(c: CambioCable): Res; decir?: DecirDelCable; alResponder(fn: (r: { que: "ok" | "no"; motivo: string; id: string }) => void): () => void; alCambiar(fn: (id: string) => void): () => void;
  };
  aqui?(): { x: number; y: number; z: number } | null; // where the builder stands: a new cable goes there
  contexto?(): ContextoCable; // what the world offers to choose (objects, movers, quests, sounds); empty if not given
  decir(texto: string): void; // soltar.ts' status line (role=status)
  idioma?: string;            // language of the sentences (default: the page's <html lang>, then Spanish)
  panel: HTMLElement | null;  // the builder's «Cable» drawer: the list goes inside it (its heading says «Cable»)
};

const estadoTexto = (d: Disparador): string => d.agotado ? "agotado" : d.enEspera ? "en espera" : "listo";
// Touch targets of 44 px, wrapping lines (360 px wide), a visible focus ring; nothing hover-only.
const ESTILO = `
#cable-panel .cable-frase{margin:6px 0;line-height:1.4}
#cable-panel .cable-linea{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
/* the sentence flows as inline text (punctuation stays glued to the control before it and the line wraps at any width) */
#cable-panel .cable-frase .cable-linea{display:block;margin:0 0 6px}
#cable-panel .cable-frase .cable-linea>*{vertical-align:middle;margin:2px 0}
/* the page zooms its whole interface by --ui (Tamaño de la interfaz): ask for 44 px AFTER that zoom; the builder's phone
   theme (tema.css) asks 40 px of every select/input under #panel-construir, so these rules name that id too */
#panel-construir #cable-panel select,#panel-construir #cable-panel input:not([type=checkbox]),#cable-panel button,#cable-panel summary{min-height:calc(44px / var(--ui,1));font:inherit;box-sizing:border-box}
#cable-panel select,#cable-panel input:not([type=checkbox]){max-width:100%;padding:0 8px}
#cable-panel input[type=number]{width:6em}
#cable-panel button{min-width:calc(44px / var(--ui,1));padding:0 12px}
#cable-panel label.cable-casilla{display:inline-flex;align-items:center;gap:8px;min-height:calc(44px / var(--ui,1))}
#cable-panel input[type=checkbox]{width:24px;height:24px}
#cable-panel summary{display:flex;align-items:center;cursor:pointer}
#cable-panel :focus-visible{outline:3px solid #ffd54a;outline-offset:2px}
#cable-panel [aria-invalid=true]{outline:2px solid #ff6b6b}
#cable-panel .cable-error{color:#ff9a9a;margin:4px 0}
#cable-panel .cable-nota{margin:4px 0}
#cable-panel ul{padding:0;margin:8px 0 0}
#cable-panel li{list-style:none;margin:0 0 14px;padding:0 0 10px;border-bottom:1px solid rgba(255,255,255,.18)}
`;

type Borrador = { nombre: string; tipo: Tipo; senal: string; cooldown: number; unSoloUso: boolean; receptores: Record<string, unknown>[] };
const copiar = (d: BorradorCable): Borrador => ({
  nombre: String(d.nombre ?? ""), tipo: d.tipo === "zona" || d.tipo === "senal" ? d.tipo : "boton", senal: String(d.senal ?? ""), cooldown: Number(d.cooldown) || 0, unSoloUso: d.unSoloUso === true,
  receptores: (Array.isArray(d.receptores) ? d.receptores : []).map((r) => ({ ...(r as Record<string, unknown>) })),
});
const firmaDe = (d: Disparador): string => JSON.stringify([d.nombre, d.tipo, d.senal ?? "", d.cooldown, d.unSoloUso, d.receptores]);
/** «receptor 2: …» in a server reason → the index (1) of that action, so the control can be marked. */
const marcaDeError = (motivo: string): number | null => { const m = /receptor (\d+)/i.exec(motivo); return m ? Number(m[1]) - 1 : null; };

export function montarCable(o: OpcionesCable) {
  const idioma = (): string => idiomaDe(o.idioma ?? (typeof document !== "undefined" ? document.documentElement.lang : ""));
  const T = (k: ClaveFrase, v: Record<string, string> = {}): string => FRASES[idiomaDe(idioma())][k].replace(/\{(\w+)\}/g, (m, n: string) => v[n] ?? m);
  const ctx = (): ContextoCable => o.contexto?.() ?? CONTEXTO_VACIO;
  if (!document.getElementById("cable-estilo")) { const st = document.createElement("style"); st.id = "cable-estilo"; st.textContent = ESTILO + ESTILO_DECIR; document.head.append(st); }
  const caja = document.createElement("div");
  caja.id = "cable-panel"; caja.setAttribute("role", "group"); caja.setAttribute("aria-label", "Cable: disparadores del mundo");
  const nuevo = document.createElement("button");
  nuevo.type = "button"; nuevo.id = "cable-nuevo"; nuevo.textContent = "+ Nuevo cable";
  nuevo.setAttribute("aria-label", "Nuevo cable: preparar un botón en tu posición");
  nuevo.title = "Prepara un cable nuevo: un botón en el sitio donde estás. Elige qué hace y pulsa «Crear cable».";
  const lista = document.createElement("ul"); lista.id = "cable-lista";
  // Historia D: «Decírselo al mundo» sits first; the server says whether this world has an AI (else the box hides and the reason shows)
  const decirUI = o.disparadores.decir ? montarDecir({ decir: o.disparadores.decir, idioma, avisar: o.decir }) : null;
  if (decirUI) caja.append(decirUI.raiz);
  caja.append(nuevo, lista);
  const confirmando = new Set<string>(); // cables whose «Borrar» is waiting for «Sí, borrar»
  o.panel?.append(caja);

  /** The sentence as controls: one per hueco of the pure parts function. `alCambiar` runs after every edit. */
  function editor(b: Borrador, grupo: HTMLElement, alCambiar: () => void, error: () => { receptor: number | null; id: string } | null) {
    const frase = () => grupo.setAttribute("aria-label", huecosDeCable(b, idioma(), ctx()).frase);
    const pintar = (foco?: string) => {
      const activo = foco ?? (grupo.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.k : undefined);
      const c = huecosDeCable(b, idioma(), ctx());
      grupo.setAttribute("aria-label", c.frase);
      const e = error();
      const nodo = (p: Parte): Node => {
        if ("texto" in p) return document.createTextNode(p.texto);
        const k = `${p.hueco}:${p.receptor ?? -1}`;
        const marca = <E extends HTMLElement>(el: E): E => {
          el.dataset.k = k; el.setAttribute("aria-label", p.etiqueta); el.classList.add("cable-hueco");
          if (e && e.receptor !== null && e.receptor === (p.receptor ?? null)) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", e.id); }
          return el;
        };
        const receptor = (): Record<string, unknown> => b.receptores[p.receptor ?? 0]!;
        switch (p.control) {
          case "select": {
            const s = marca(document.createElement("select"));
            for (const op of p.opciones ?? []) { const x = document.createElement("option"); x.value = op.valor; x.textContent = op.texto; s.append(x); }
            s.value = p.valor;
            s.addEventListener("change", () => {
              if (p.hueco === "tipo") { b.tipo = s.value as Tipo; alCambiar(); pintar(k); }
              else if (p.hueco === "accion") { b.receptores[p.receptor ?? 0] = receptorNuevo(s.value, ctx(), o.aqui?.() ?? null); alCambiar(); pintar(k); }
              else { if (p.hueco === "espera") b.cooldown = Number(s.value); else receptor()[p.hueco] = s.value; alCambiar(); frase(); }
            });
            return s;
          }
          case "texto": {
            const i = marca(document.createElement("input"));
            i.type = p.hueco === "enlace" ? "url" : "text"; i.value = p.valor; if (p.largoMax) i.maxLength = p.largoMax;
            i.autocapitalize = "off"; i.autocomplete = "off"; i.spellcheck = false;
            i.addEventListener("input", () => { if (p.hueco === "nombre") b.nombre = i.value; else if (p.hueco === "senal") b.senal = i.value; else receptor()[p.hueco] = i.value; alCambiar(); frase(); });
            return i;
          }
          case "numero": {
            const i = marca(document.createElement("input"));
            i.type = "number"; i.inputMode = "decimal"; i.value = p.valor;
            if (p.min !== undefined) i.min = String(p.min);
            if (p.max !== undefined) i.max = String(p.max);
            if (p.paso !== undefined) i.step = String(p.paso);
            i.addEventListener("input", () => { receptor()[p.hueco] = i.value === "" ? "" : Number(i.value); alCambiar(); frase(); });
            return i;
          }
          case "boton": {
            const x = marca(document.createElement("button"));
            x.type = "button"; x.textContent = p.visible ?? "";
            x.addEventListener("click", () => {
              const q = o.aqui?.();
              if (!q) { o.decir("No sé dónde estás todavía."); return; }
              const r = receptor(); r.x = Math.round(q.x * 10) / 10; r.y = Math.round(q.y * 10) / 10; r.z = Math.round(q.z * 10) / 10;
              alCambiar(); pintar(k);
            });
            return x;
          }
          case "casilla": {
            const l = document.createElement("label"); l.className = "cable-casilla";
            const c2 = marca(document.createElement("input"));
            c2.type = "checkbox"; c2.checked = p.valor === "1";
            c2.addEventListener("change", () => { b.unSoloUso = c2.checked; alCambiar(); frase(); });
            c2.removeAttribute("aria-label"); // the visible text names it
            l.append(c2, document.createTextNode(p.visible ?? ""));
            return l;
          }
        }
      };
      const linea = (partes: Parte[], extra: Node[] = []): HTMLElement => { const d = document.createElement("div"); d.className = "cable-linea"; d.append(...partes.map(nodo), ...extra); return d; };
      const filas: HTMLElement[] = c.acciones.map((a, i) => {
        const l = i === 0 ? linea([...c.cuando, ...a]) : linea(a);
        const quitar = document.createElement("button");
        quitar.type = "button"; quitar.className = "cable-quitar"; quitar.textContent = "✕"; quitar.dataset.k = `quitar:${i}`;
        quitar.setAttribute("aria-label", T("boton.quitar", { n: String(i + 1) })); quitar.title = T("boton.quitar", { n: String(i + 1) });
        quitar.disabled = c.acciones.length <= 1;
        quitar.addEventListener("click", () => { b.receptores.splice(i, 1); alCambiar(); pintar("otra"); });
        l.append(quitar);
        if (i === c.acciones.length - 1) l.append(document.createTextNode(c.fin));
        return l;
      });
      if (!c.acciones.length) filas.push(linea(c.cuando));
      const otra = document.createElement("button");
      otra.type = "button"; otra.className = "cable-otra"; otra.dataset.k = "otra"; otra.textContent = T("boton.otra");
      otra.disabled = b.receptores.length >= c.maxAcciones;
      otra.title = otra.disabled ? T("nota.maximo", { max: String(c.maxAcciones) }) : T("boton.otra");
      otra.addEventListener("click", () => { b.receptores.push(receptorNuevo("suena", ctx(), o.aqui?.() ?? null)); alCambiar(); pintar(`accion:${b.receptores.length - 1}`); });
      filas.push(linea(c.espera, [otra]));
      grupo.replaceChildren(...filas);
      if (activo) Array.from(grupo.querySelectorAll<HTMLElement>("[data-k]")).find((x) => x.dataset.k === activo && !(x as HTMLButtonElement).disabled)?.focus();
    };
    pintar();
    return { pintar };
  }

  type FilaViva = { li: HTMLLIElement; actualizar(d: Disparador): void; ok(): void; no(motivo: string): void };
  const filas = new Map<string, FilaViva>();
  let pendiente: string | null = null; // the row waiting for the server's answer to a save (or "nuevo")
  let ordenPintado = "";

  const fila = (d0: Disparador): FilaViva => {
    const id = d0.id;
    let d = d0, firma = firmaDe(d0), sucio = false, motivo = "", receptorErr: number | null = null;
    const b = copiar(d0); // the editor and «Guardar» share THIS object: re-fill it in place, never rebind it
    const li = document.createElement("li");
    const texto = document.createElement("span");
    const arriba = document.createElement("div"); arriba.className = "cable-linea";
    if (d.tipo === "boton") {
      const p = document.createElement("button");
      p.type = "button"; p.textContent = "Probar"; p.className = "cable-probar"; p.id = `cable-probar-${id}`; // the guide arrow (a mission step's `senala`) can point at one cable's «Probar»
      p.title = `Disparar «${d.nombre}» como si lo pulsaras, para comprobar su cableado`;
      p.addEventListener("click", () => { const r = o.disparadores.pulsar(id); if (!r.ok) o.decir(`No: ${r.why}.`); });
      arriba.append(p);
    }
    const grupo = document.createElement("div");
    grupo.className = "cable-frase"; grupo.setAttribute("role", "group");
    const errId = `cable-error-${id}`;
    const err = document.createElement("p"); err.id = errId; err.className = "cable-error"; err.setAttribute("role", "alert");
    const nota = document.createElement("p"); nota.className = "cable-nota"; nota.setAttribute("role", "status");
    const guardar = document.createElement("button");
    guardar.type = "button"; guardar.className = "cable-guardar-frase"; guardar.textContent = T("boton.guardar");
    guardar.title = `Guardar los cambios de «${d.nombre}»`;
    const ed = editor(b, grupo, () => { sucio = true; nota.textContent = ""; }, () => (motivo ? { receptor: receptorErr, id: errId } : null));
    guardar.addEventListener("click", () => {
      motivo = ""; receptorErr = null; err.textContent = ""; nota.textContent = "";
      const q = o.aqui?.();
      const cambio: CambioCable = { id, nombre: b.nombre, tipo: b.tipo, senal: b.senal, cooldown: b.cooldown, unSoloUso: b.unSoloUso, receptores: b.receptores };
      // a cable that listened to a signal had no place; turning it into a button or zone puts it where the builder stands
      if (d.tipo === "senal" && b.tipo !== "senal" && q) cambio.mover = { x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100, z: Math.round(q.z * 100) / 100 };
      pendiente = id;
      const r = o.disparadores.editarDisparador(cambio);
      if (!r.ok) { pendiente = null; motivo = `${r.why}.`; err.textContent = motivo; o.decir(`No: ${r.why}.`); }
    });
    // Historia B: the JSON stays, folded away in a native <details> (keyboard: Tab to the summary, Enter/Space opens it).
    const area = document.createElement("textarea");
    area.className = "cable-receptores"; area.rows = 3; area.setAttribute("aria-label", `Receptores de ${d.nombre} (JSON)`);
    const guardarJson = document.createElement("button");
    guardarJson.type = "button"; guardarJson.textContent = "Guardar";
    guardarJson.title = `Reemplazar en vivo los receptores de «${d.nombre}»`;
    guardarJson.addEventListener("click", () => {
      let receptores: unknown;
      try { receptores = JSON.parse(area.value); }
      catch { o.decir("No: receptores no es JSON válido."); return; }
      if (!Array.isArray(receptores)) { o.decir("No: receptores debe ser una lista."); return; }
      const r = o.disparadores.editarReceptores(id, receptores as Record<string, unknown>[]);
      if (!r.ok) o.decir(`No: ${r.why}.`);
    });
    const datos = document.createElement("details");
    datos.className = "cable-datos";
    const resumen = document.createElement("summary"); resumen.textContent = "Ver datos";
    datos.append(resumen, area, " ", guardarJson);
    const abajo = document.createElement("div"); abajo.className = "cable-linea";
    li.append(texto, arriba, grupo, guardar, err, nota, datos, abajo);

    /** Historia A: «Borrar» pide confirmación en la propia fila (sin ventanas del navegador, que no se leen igual). */
    const pintarBorrar = () => {
      abajo.replaceChildren();
      if (!confirmando.has(id)) {
        const borrar = document.createElement("button");
        borrar.type = "button"; borrar.className = "cable-borrar"; borrar.dataset.cableBf = id; borrar.textContent = "Borrar";
        borrar.setAttribute("aria-label", `Borrar el cable ${d.nombre}`);
        borrar.addEventListener("click", () => { confirmando.add(id); pintarBorrar(); li.querySelector<HTMLButtonElement>(".cable-borrar-si")?.focus(); });
        abajo.append(borrar);
      } else {
        const aviso = document.createElement("span"); aviso.setAttribute("role", "alert"); aviso.textContent = `¿Borrar «${d.nombre}»? `;
        const si = document.createElement("button");
        si.type = "button"; si.className = "cable-borrar-si"; si.textContent = "Sí, borrar";
        si.setAttribute("aria-label", `Sí, borrar el cable ${d.nombre}`);
        si.addEventListener("click", () => { confirmando.delete(id); const r = o.disparadores.borrarDisparador(id); if (!r.ok) o.decir(`No: ${r.why}.`); pintarBorrar(); nuevo.focus(); });
        const no = document.createElement("button");
        no.type = "button"; no.className = "cable-borrar-no"; no.textContent = "Cancelar";
        no.setAttribute("aria-label", `No borrar el cable ${d.nombre}`);
        no.addEventListener("click", () => { confirmando.delete(id); pintarBorrar(); li.querySelector<HTMLButtonElement>(".cable-borrar")?.focus(); });
        abajo.append(aviso, si, no);
      }
    };
    let borrando = confirmando.has(id);
    pintarBorrar();

    const actualizar = (nuevoD: Disparador) => {
      d = nuevoD;
      texto.textContent = `${d.nombre} (${d.tipo}${d.unSoloUso ? ", un solo uso" : ""}) · ${estadoTexto(d)} · ${d.usos} uso(s)`;
      const f = firmaDe(d);
      // the server changed the cable: show it, unless someone is in the middle of editing it (their draft wins until they save)
      if (f !== firma && !sucio) { firma = f; Object.assign(b, copiar(d)); ed.pintar(); }
      area.value = JSON.stringify(d.receptores, null, 1);
      if (borrando !== confirmando.has(id)) { borrando = confirmando.has(id); pintarBorrar(); }
    };
    actualizar(d0);
    return {
      li, actualizar,
      ok: () => { motivo = ""; receptorErr = null; err.textContent = ""; sucio = false; firma = ""; Object.assign(b, copiar(d)); ed.pintar(); nota.textContent = T("nota.guardado"); o.decir(T("nota.guardado")); },
      no: (m) => { motivo = m; receptorErr = marcaDeError(m); err.textContent = m; ed.pintar(); o.decir(`No: ${m}`); },
    };
  };

  // ---- «+ Nuevo cable»: the same blanks with starting values; the cable exists only after «Crear cable» ----
  let borradorNuevo: { li: HTMLLIElement; ok(): void; no(m: string): void } | null = null;
  /** The first free «cable-N» id (the server still has the last word: unique, 16 chars). */
  const idLibre = (): string => { const usados = new Set(o.disparadores.lista().map((x) => x.id)); for (let n = 1; ; n++) if (!usados.has(`cable-${n}`)) return `cable-${n}`; };
  const abrirNuevo = () => {
    if (borradorNuevo) { borradorNuevo.li.querySelector<HTMLElement>("[data-k]")?.focus(); return; }
    const b: Borrador = { nombre: `Cable ${idLibre().slice(6)}`, tipo: "boton", senal: "", cooldown: 0, unSoloUso: false, receptores: [receptorNuevo("suena", ctx(), o.aqui?.() ?? null)] };
    const li = document.createElement("li"); li.className = "cable-borrador";
    const titulo = document.createElement("span"); titulo.textContent = "Cable nuevo (todavía no existe)";
    const grupo = document.createElement("div"); grupo.className = "cable-frase"; grupo.setAttribute("role", "group");
    const err = document.createElement("p"); err.id = "cable-error-nuevo"; err.className = "cable-error"; err.setAttribute("role", "alert");
    let motivo = "", receptorErr: number | null = null;
    const ed = editor(b, grupo, () => {}, () => (motivo ? { receptor: receptorErr, id: err.id } : null));
    const crear = document.createElement("button"); crear.type = "button"; crear.className = "cable-crear"; crear.textContent = T("boton.crear");
    const cancelar = document.createElement("button"); cancelar.type = "button"; cancelar.className = "cable-cancelar"; cancelar.textContent = T("boton.cancelar");
    crear.addEventListener("click", () => {
      motivo = ""; receptorErr = null; err.textContent = "";
      const p = o.aqui?.() ?? { x: 0, y: 0, z: 0 };
      pendiente = "nuevo";
      const r = o.disparadores.crearDisparador({ id: idLibre(), tipo: b.tipo, nombre: b.nombre, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100, radio: b.tipo === "zona" ? 3 : 2, frase: "E: pulsar", senal: b.senal, cooldown: b.cooldown, unSoloUso: b.unSoloUso, receptores: b.receptores });
      if (!r.ok) { pendiente = null; motivo = `${r.why}.`; err.textContent = motivo; o.decir(`No: ${r.why}.`); }
    });
    cancelar.addEventListener("click", () => { li.remove(); borradorNuevo = null; ordenPintado = ""; refrescar(); nuevo.focus(); });
    li.append(titulo, grupo, crear, " ", cancelar, err);
    borradorNuevo = {
      li,
      ok: () => { li.remove(); borradorNuevo = null; ordenPintado = ""; o.decir(T("nota.creado")); refrescar(); nuevo.focus(); },
      no: (m) => { motivo = m; receptorErr = marcaDeError(m); err.textContent = m; ed.pintar(); o.decir(`No: ${m}`); },
    };
    ordenPintado = "";
    refrescar();
    li.querySelector<HTMLElement>("[data-k]")?.focus();
  };
  nuevo.addEventListener("click", abrirNuevo);

  // The server's answer to a save (ok = it changed; no = its Spanish reason): shown by the control, never decided here.
  o.disparadores.alResponder((r) => {
    if (!pendiente) return;
    const quien = pendiente; pendiente = null;
    if (quien === "nuevo") { if (r.que === "ok") borradorNuevo?.ok(); else borradorNuevo?.no(r.motivo); return; }
    const f = filas.get(quien);
    if (r.que === "ok") f?.ok(); else f?.no(r.motivo);
  });

  function refrescar() {
    const puede = o.constructor.estado.puede;
    caja.style.display = puede ? "" : "none";
    if (!puede) { confirmando.clear(); return; }
    decirUI?.refrescar();
    const ds = o.disparadores.lista();
    for (const id of [...confirmando]) if (!ds.some((d) => d.id === id)) confirmando.delete(id);
    for (const id of [...filas.keys()]) if (!ds.some((d) => d.id === id)) filas.delete(id);
    for (const d of ds) { const f = filas.get(d.id); if (f) f.actualizar(d); else filas.set(d.id, fila(d)); }
    // Only touch the list when the set of rows changed: rebuilding it on every tick would drop the focus of a select someone is using.
    const orden = ds.map((d) => d.id).join("|") + (borradorNuevo ? "+" : "");
    if (orden === ordenPintado) return;
    ordenPintado = orden;
    const hijos: Node[] = ds.map((d) => filas.get(d.id)!.li);
    if (borradorNuevo) hijos.unshift(borradorNuevo.li);
    if (!hijos.length) hijos.push(Object.assign(document.createElement("li"), { textContent: "Sin cables todavía: pulsa «+ Nuevo cable»." }));
    lista.replaceChildren(...hijos);
  }
  o.constructor.escuchar((que) => { if (que === "permiso") refrescar(); });
  o.disparadores.alCambiar(() => refrescar());
  refrescar();
  // C4: the Inspector's «Abrir el cable» (it opens this drawer first): bring this list into view and focus it
  const mostrar = () => { caja.tabIndex = -1; caja.scrollIntoView?.({ block: "nearest" }); caja.focus(); };
  return { refrescar, mostrar };
}
