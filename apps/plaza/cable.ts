// cable (D-041), builder view (historias 5-6): dentro del panel del constructor, una lista con cada disparador que
// el mundo cablea en disparadores.json — su nombre, tipo, estado (listo / en espera / agotado) y cuántas veces ha
// disparado — con un botón «Probar» para los de tipo botón (dispararlo sin acercarse: cómodo para comprobar un
// cooldown o un «un solo uso» antes de que nadie más esté cerca) y, ahora, un editor en vivo de sus receptores
// («qué hace cada disparo»): un área de texto con el JSON de la lista y un botón «Guardar» que lo manda al servidor
// (intención editar_receptores). El servidor valida cada receptor igual que al leer el fichero y, si lo acepta,
// todo el mundo ve el cambio al momento y, si el mundo lo permite, reescribe disparadores.json — ya no hace falta
// reiniciar para cablear de otra manera. Solo quien tiene permiso de construir. Visitors never see this panel.
type Res = { ok: true } | { ok: false; why: string };
export type Disparador = { id: string; nombre: string; tipo: "zona" | "boton"; cooldown: number; unSoloUso: boolean; usos: number; enEspera: boolean; agotado: boolean; receptores: Record<string, unknown>[] };
export type OpcionesCable = {
  constructor: { estado: { puede: boolean }; escuchar(fn: (que: string) => void): () => void };
  disparadores: { lista(): Disparador[]; pulsar(id: string): Res; editarReceptores(id: string, receptores: Record<string, unknown>[]): Res; alCambiar(fn: (id: string) => void): () => void };
  decir(texto: string): void; // soltar.ts' status line (role=status)
  panel: HTMLElement | null;  // the build panel: the «Cable» list goes at its end
};

const estadoTexto = (d: Disparador): string => d.agotado ? "agotado" : d.enEspera ? "en espera" : "listo";

export function montarCable(o: OpcionesCable) {
  const caja = document.createElement("div");
  caja.id = "cable-panel"; caja.setAttribute("role", "group"); caja.setAttribute("aria-label", "Cable: disparadores del mundo");
  const titulo = document.createElement("p"); titulo.textContent = "Cable (disparadores del mundo):";
  const lista = document.createElement("ul"); lista.id = "cable-lista";
  caja.append(titulo, lista);
  o.panel?.append(caja);

  const fila = (d: Disparador): HTMLLIElement => {
    const li = document.createElement("li");
    const texto = document.createElement("span");
    texto.textContent = `${d.nombre} (${d.tipo}${d.unSoloUso ? ", un solo uso" : ""}) · ${estadoTexto(d)} · ${d.usos} uso(s)`;
    li.append(texto);
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
    li.append(document.createElement("br"), area, " ", guardar);
    return li;
  };

  const refrescar = () => {
    caja.style.display = o.constructor.estado.puede ? "" : "none";
    if (!o.constructor.estado.puede) return;
    const ds = o.disparadores.lista();
    if (!ds.length) { lista.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Sin disparadores: añádelos en disparadores.json." })); return; }
    lista.replaceChildren(...ds.map(fila));
  };
  o.constructor.escuchar((que) => { if (que === "permiso") refrescar(); });
  o.disparadores.alCambiar(() => refrescar());
  refrescar();
  return { refrescar };
}
