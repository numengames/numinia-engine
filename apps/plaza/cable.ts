// cable (D-041), builder view (historias 5-6): dentro del cajón «Cable» del constructor (ux2-dock), una lista con cada disparador que
// el mundo cablea en disparadores.json — su nombre, tipo, estado (listo / en espera / agotado) y cuántas veces ha
// disparado — con un botón «Probar» para los de tipo botón (dispararlo sin acercarse: cómodo para comprobar un
// cooldown o un «un solo uso» antes de que nadie más esté cerca) y, ahora, un editor en vivo de sus receptores
// («qué hace cada disparo»): un área de texto con el JSON de la lista y un botón «Guardar» que lo manda al servidor
// (intención editar_receptores). El servidor valida cada receptor igual que al leer el fichero y, si lo acepta,
// todo el mundo ve el cambio al momento y, si el mundo lo permite, reescribe disparadores.json — ya no hace falta
// reiniciar para cablear de otra manera. Historia A (cable sin JSON): «+ Nuevo cable» crea un botón en tu sitio con un
// receptor de partida (suena «campana») y cada cable tiene su «Borrar» con confirmación en la propia fila. La página
// SOLO manda la petición (crearDisparador / borrarDisparador) y pinta lo que el servidor deja en el estado: él valida,
// pone el tope de 64 y escribe el fichero. Solo quien tiene permiso de construir. Visitors never see this panel.
import { fraseDeCable, idiomaDe } from "../../features/disparadores/cable-frase.ts";
type Res = { ok: true } | { ok: false; why: string };
export type Disparador = { id: string; nombre: string; tipo: "zona" | "boton" | "senal"; senal?: string; cooldown: number; unSoloUso: boolean; usos: number; enEspera: boolean; agotado: boolean; receptores: Record<string, unknown>[] };
/** What «+ Nuevo cable» sends: one line of disparadores.json (the server fills nothing in and checks everything). */
export type NuevoCable = { id: string; tipo: "boton"; nombre: string; x: number; y: number; z: number; radio: number; frase: string; cooldown: number; receptores: Record<string, unknown>[] };
export type OpcionesCable = {
  constructor: { estado: { puede: boolean }; escuchar(fn: (que: string) => void): () => void };
  disparadores: { lista(): Disparador[]; pulsar(id: string): Res; editarReceptores(id: string, receptores: Record<string, unknown>[]): Res; crearDisparador(d: NuevoCable): Res; borrarDisparador(id: string): Res; alCambiar(fn: (id: string) => void): () => void };
  aqui?(): { x: number; y: number; z: number } | null; // where the builder stands: a new cable goes there
  decir(texto: string): void; // soltar.ts' status line (role=status)
  idioma?: string;            // language of the sentences (default: the page's <html lang>, then Spanish)
  panel: HTMLElement | null;  // the builder's «Cable» drawer: the list goes inside it (its heading says «Cable»)
};

const estadoTexto = (d: Disparador): string => d.agotado ? "agotado" : d.enEspera ? "en espera" : "listo";

export function montarCable(o: OpcionesCable) {
  const idioma = (): string => idiomaDe(o.idioma ?? (typeof document !== "undefined" ? document.documentElement.lang : ""));
  const caja = document.createElement("div");
  caja.id = "cable-panel"; caja.setAttribute("role", "group"); caja.setAttribute("aria-label", "Cable: disparadores del mundo");
  const nuevo = document.createElement("button");
  nuevo.type = "button"; nuevo.id = "cable-nuevo"; nuevo.textContent = "+ Nuevo cable";
  nuevo.setAttribute("aria-label", "Nuevo cable: crear un botón en tu posición");
  nuevo.title = "Crea un cable nuevo: un botón en el sitio donde estás. Luego cambia qué hace.";
  const lista = document.createElement("ul"); lista.id = "cable-lista";
  caja.append(nuevo, lista);
  const confirmando = new Set<string>(); // cables whose «Borrar» is waiting for «Sí, borrar»
  o.panel?.append(caja);

  const fila = (d: Disparador): HTMLLIElement => {
    const li = document.createElement("li");
    const texto = document.createElement("span");
    texto.textContent = `${d.nombre} (${d.tipo}${d.unSoloUso ? ", un solo uso" : ""}) · ${estadoTexto(d)} · ${d.usos} uso(s)`;
    li.append(texto);
    // Historia B: the cable said as a sentence (the same pure function the server will use to ask for confirmation).
    const frase = document.createElement("p");
    frase.className = "cable-frase"; frase.style.margin = "2px 0"; frase.textContent = fraseDeCable(d, idioma());
    li.append(frase);
    if (d.tipo === "boton") {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = "Probar";
      b.title = `Disparar «${d.nombre}» como si lo pulsaras, para comprobar su cableado`;
      b.addEventListener("click", () => { const r = o.disparadores.pulsar(d.id); if (!r.ok) o.decir(`No: ${r.why}.`); });
      li.append(" ", b);
    }
    // D-041 historia 6: el editor en vivo de los receptores («qué hace cada disparo») de este disparador.
    const area = document.createElement("textarea");
    area.className = "cable-receptores"; area.rows = 3; area.setAttribute("aria-label", `Receptores de ${d.nombre} (JSON)`);
    area.value = JSON.stringify(d.receptores, null, 1);
    const guardar = document.createElement("button");
    guardar.type = "button"; guardar.textContent = "Guardar";
    guardar.title = `Reemplazar en vivo los receptores de «${d.nombre}»`;
    guardar.addEventListener("click", () => {
      let receptores: unknown;
      try { receptores = JSON.parse(area.value); }
      catch { o.decir("No: receptores no es JSON válido."); return; }
      if (!Array.isArray(receptores)) { o.decir("No: receptores debe ser una lista."); return; }
      const r = o.disparadores.editarReceptores(d.id, receptores as Record<string, unknown>[]);
      if (!r.ok) o.decir(`No: ${r.why}.`);
    });
    // Historia B: the JSON stays, folded away in a native <details> (keyboard: Tab to the summary, Enter/Space opens it).
    const datos = document.createElement("details");
    datos.className = "cable-datos";
    const resumen = document.createElement("summary"); resumen.textContent = "Ver datos";
    datos.append(resumen, area, " ", guardar);
    li.append(datos);
    // Historia A: «Borrar» pide confirmación en la propia fila (sin ventanas del navegador, que no se leen igual).
    li.append(document.createElement("br"));
    if (!confirmando.has(d.id)) {
      const borrar = document.createElement("button");
      borrar.type = "button"; borrar.className = "cable-borrar"; borrar.dataset.cableBf = d.id; borrar.textContent = "Borrar";
      borrar.setAttribute("aria-label", `Borrar el cable ${d.nombre}`);
      borrar.addEventListener("click", () => { confirmando.add(d.id); refrescar(); li.ownerDocument.querySelector<HTMLButtonElement>(`[data-cable-sf="${d.id}"]`)?.focus(); });
      li.append(borrar);
    } else {
      const aviso = document.createElement("span"); aviso.setAttribute("role", "alert"); aviso.textContent = `¿Borrar «${d.nombre}»? `;
      const si = document.createElement("button");
      si.type = "button"; si.className = "cable-borrar-si"; si.textContent = "Sí, borrar"; si.dataset.cableSf = d.id;
      si.setAttribute("aria-label", `Sí, borrar el cable ${d.nombre}`);
      si.addEventListener("click", () => { confirmando.delete(d.id); const r = o.disparadores.borrarDisparador(d.id); if (!r.ok) o.decir(`No: ${r.why}.`); refrescar(); nuevo.focus(); });
      const no = document.createElement("button");
      no.type = "button"; no.className = "cable-borrar-no"; no.textContent = "Cancelar";
      no.setAttribute("aria-label", `No borrar el cable ${d.nombre}`);
      no.addEventListener("click", () => { confirmando.delete(d.id); refrescar(); li.ownerDocument.querySelector<HTMLButtonElement>(`[data-cable-bf="${d.id}"]`)?.focus(); });
      li.append(aviso, si, " ", no);
    }
    return li;
  };

  /** The first free «cable-N» id (the server still has the last word: unique, 16 chars). */
  const idLibre = (): string => { const usados = new Set(o.disparadores.lista().map((d) => d.id)); for (let n = 1; ; n++) if (!usados.has(`cable-${n}`)) return `cable-${n}`; };
  nuevo.addEventListener("click", () => {
    const id = idLibre(), p = o.aqui?.() ?? { x: 0, y: 0, z: 0 };
    const r = o.disparadores.crearDisparador({ id, tipo: "boton", nombre: `Cable ${id.slice(6)}`, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100, radio: 2, frase: "E: pulsar", cooldown: 0, receptores: [{ accion: "suena", sonido: "campana" }] });
    if (!r.ok) o.decir(`No: ${r.why}.`);
  });

  function refrescar() {
    const puede = o.constructor.estado.puede;
    caja.style.display = puede ? "" : "none";
    if (!puede) { confirmando.clear(); return; }
    const ds = o.disparadores.lista();
    for (const id of [...confirmando]) if (!ds.some((d) => d.id === id)) confirmando.delete(id);
    if (!ds.length) { lista.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Sin cables todavía: pulsa «+ Nuevo cable»." })); return; }
    lista.replaceChildren(...ds.map(fila));
  }
  o.constructor.escuchar((que) => { if (que === "permiso") refrescar(); });
  o.disparadores.alCambiar(() => refrescar());
  refrescar();
  // C4: the Inspector's «Abrir el cable» (it opens this drawer first): bring this list into view and focus it
  const mostrar = () => { caja.tabIndex = -1; caja.scrollIntoView?.({ block: "nearest" }); caja.focus(); };
  return { refrescar, mostrar };
}
