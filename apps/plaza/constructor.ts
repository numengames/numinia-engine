// The builder (H1): a «Construir» button (key C) for whoever may build, and a panel of real HTML buttons that
// screen readers and keyboards can use. It only asks the server (features/objetos); the gizmos come with M22.
// main.ts passes the builder of features/objetos/client.ts (only composition roots import features/).
type Res = { ok: true } | { ok: false; why: string };
type Builder = {
  estado: { puede: boolean; seleccionado: string; ultimoRechazo: string };
  biblioteca: { id: string; nombre: string; modelo: string }[];
  seleccion(): (Record<string, unknown> & { id: string }) | null;
  colocar(id: string): Res; girar(grados: number): Res; subir(metros: number): Res; desplazar(dx: number, dz: number): Res;
  escalar(factor: number): Res; duplicar(): Res; borrar(): Res; fijar(): Res; deshacer(): Res;
};

export function montarConstructor(c: Builder, boton: HTMLButtonElement, panel: HTMLElement): void {
  const estado = document.createElement("p");
  estado.setAttribute("role", "status");
  estado.className = "estado";
  const sel = document.createElement("p");
  const boton2 = (texto: string, titulo: string, fn: () => Res) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = texto; b.title = titulo;
    b.addEventListener("click", () => { const r = fn(); estado.textContent = r.ok ? "Hecho." : `No: ${r.why}`; });
    return b;
  };
  const fila = (...bs: HTMLButtonElement[]) => { const d = document.createElement("div"); d.className = "fila"; d.append(...bs); return d; };
  const titulo = document.createElement("h2"); titulo.textContent = "Construir";
  const colocar = document.createElement("p"); colocar.textContent = "Colocar delante de ti:";
  panel.append(
    titulo, colocar,
    fila(...c.biblioteca.map((m) => boton2(m.nombre, `Colocar ${m.nombre} a 3 m delante de ti`, () => c.colocar(m.id)))),
    sel,
    fila(boton2("⟲ 15°", "Girar a la izquierda (R)", () => c.girar(15)), boton2("⟳ 15°", "Girar a la derecha", () => c.girar(-15))),
    fila(boton2("← 1 m", "Mover a la izquierda", () => c.desplazar(-1, 0)), boton2("→ 1 m", "Mover a la derecha", () => c.desplazar(1, 0)),
      boton2("↑ 1 m", "Mover hacia el fondo", () => c.desplazar(0, -1)), boton2("↓ 1 m", "Mover hacia ti", () => c.desplazar(0, 1))),
    fila(boton2("Subir", "Subir medio metro", () => c.subir(0.5)), boton2("Bajar", "Bajar medio metro", () => c.subir(-0.5)),
      boton2("Más grande", "Agrandar un 25 %", () => c.escalar(1.25)), boton2("Más pequeño", "Reducir un 20 %", () => c.escalar(0.8))),
    fila(boton2("Duplicar", "Hacer una copia al lado", () => c.duplicar()), boton2("Fijar / soltar", "Fijado, nadie lo mueve ni lo borra", () => c.fijar()),
      boton2("Borrar", "Quitarlo del mundo (Supr)", () => c.borrar()), boton2("Deshacer", "Deshacer tu último cambio (Z)", () => c.deshacer())),
    estado,
  );
  const abrir = (si: boolean) => { panel.hidden = !si; boton.setAttribute("aria-expanded", String(si)); boton.textContent = si ? "Cerrar construir" : "Construir"; };
  boton.addEventListener("click", () => abrir(panel.hidden));
  addEventListener("keydown", (e) => {
    if (e.repeat || !c.estado.puede) return;
    if (e.code === "KeyC") return abrir(panel.hidden);
    if (panel.hidden) return;
    const r = e.code === "KeyR" ? c.girar(15) : e.code === "KeyZ" ? c.deshacer() : e.code === "Delete" ? c.borrar() : null;
    if (r) estado.textContent = r.ok ? "Hecho." : `No: ${r.why}`;
  });
  // who may build can change (H3 will give roles); the selection follows what you touch or what is nearest
  setInterval(() => {
    boton.style.display = c.estado.puede ? "block" : "none";
    if (!c.estado.puede && !panel.hidden) abrir(false);
    if (panel.hidden) return;
    const o = c.seleccion();
    sel.textContent = o ? `Seleccionado: ${String(o.nombre) || "(decorado)"} · ${o.id}${o.fijado ? " · fijado" : ""}` : "Nada seleccionado ni a menos de 8 m.";
    if (c.estado.ultimoRechazo) { estado.textContent = `No: ${c.estado.ultimoRechazo}`; c.estado.ultimoRechazo = ""; }
  }, 300);
}
