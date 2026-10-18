// cerradura (D-042): a code lock's own keypad — real HTML buttons (0-9, borrar, abrir), not a 3D panel, so it works
// without hand tracking, reads with a screen reader and is tapped like any button on a phone. «E: abrir» (or a click)
// on a code lock opens it instead of sending the intent at once (huecos' `local()` trick, U12); a key lock needs
// nothing typed, so it keeps the plain J4 flow (interactuar.ts sends `abrir` straight away). The server still checks
// everything: this file only shows the digits typed and the server's answer.
type Res = { ok: true } | { ok: false; why: string };
/** What interactuar.ts offers: a thing in reach whose use runs here, on the page (`local`), instead of an intent. */
export type Oferta = { feature: string; key: string; intent: string; prompt: string; name: string; distance: number; local: () => Res };
type Cerradura = { id: string; metodo: "codigo" | "llave"; abierta: boolean; nombre: string; x: number; y: number; z: number };
export type OpcionesCerradura = {
  cerradura: {
    cerraduras(): Cerradura[];
    abrir(id: string, codigo?: string): Res;
    estado: { ultimoRechazo: string };
    alCambiar: (f: (que: string) => void) => () => void;
  };
};

/** How close a lock is offered (metres on the ground), same as a door's default radius. */
export const CERRADURA_ALCANCE_M = 2.5;

export function montarCerradura(o: OpcionesCerradura) {
  const c = o.cerradura;
  let abierto: string | null = null, digitos = "";

  const capa = document.createElement("div");
  capa.id = "cerradura-teclado";
  capa.hidden = true;
  capa.setAttribute("role", "dialog");
  capa.setAttribute("aria-modal", "true");
  capa.setAttribute("aria-label", "Teclado de la cerradura");
  Object.assign(capa.style, { position: "fixed", inset: "0", display: "none", placeItems: "center", background: "rgba(10,14,20,.55)", zIndex: "30" });
  const caja = document.createElement("div");
  Object.assign(caja.style, { width: "min(260px, 88vw)", padding: "18px", borderRadius: "12px", background: "#1b222c", color: "#eef2f6", font: "16px/1.4 system-ui, sans-serif", textAlign: "center" });
  const titulo = document.createElement("div");
  titulo.style.fontWeight = "700"; titulo.style.marginBottom = "8px";
  const pantalla = document.createElement("div");
  pantalla.setAttribute("aria-live", "polite");
  Object.assign(pantalla.style, { fontSize: "28px", letterSpacing: "4px", minHeight: "1.4em", margin: "10px 0", fontFamily: "monospace" });
  const aviso = document.createElement("div");
  aviso.setAttribute("role", "status");
  Object.assign(aviso.style, { minHeight: "1.3em", color: "#ffb4a8", fontSize: "13px", marginBottom: "6px" });
  const rejilla = document.createElement("div");
  Object.assign(rejilla.style, { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" });
  const refrescarPantalla = () => { pantalla.textContent = digitos ? "•".repeat(digitos.length) : "– – – –"; };
  const tecla = (t: string, fn: () => void, titulo2: string) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = t; b.title = titulo2; b.setAttribute("aria-label", titulo2);
    Object.assign(b.style, { padding: "14px 0", fontSize: "20px", borderRadius: "8px", border: "1px solid #2e3947", background: "#232c38", color: "#eef2f6", cursor: "pointer" });
    b.addEventListener("click", fn);
    return b;
  };
  for (const d of "123456789") rejilla.append(tecla(d, () => { if (digitos.length < 8) { digitos += d; refrescarPantalla(); } }, `Cifra ${d}`));
  rejilla.append(tecla("⌫", () => { digitos = digitos.slice(0, -1); refrescarPantalla(); }, "Borrar la última cifra"));
  rejilla.append(tecla("0", () => { if (digitos.length < 8) { digitos += "0"; refrescarPantalla(); } }, "Cifra 0"));
  const abrirBtn = tecla("Abrir", () => { if (abierto) { c.abrir(abierto, digitos); } }, "Abrir con este código");
  abrirBtn.type = "submit";
  rejilla.append(abrirBtn);
  const cerrar = document.createElement("button");
  cerrar.type = "button"; cerrar.textContent = "Cerrar"; cerrar.title = "Cerrar el teclado sin abrir";
  cerrar.style.marginTop = "10px";
  caja.append(titulo, pantalla, aviso, rejilla, cerrar);
  capa.append(caja);
  document.body.append(capa);

  const cerrarTeclado = () => { capa.hidden = true; capa.style.display = "none"; abierto = null; digitos = ""; aviso.textContent = ""; };
  cerrar.addEventListener("click", cerrarTeclado);
  capa.addEventListener("click", (e) => { if (e.target === capa) cerrarTeclado(); });
  addEventListener("keydown", (e) => { if (!capa.hidden && e.code === "Escape") cerrarTeclado(); });

  /** Open the keypad for this lock. Call it inside the click or the key press, like the J4 convention. */
  const abrirTeclado = (id: string): Res => {
    const l = c.cerraduras().find((x) => x.id === id);
    if (!l) return { ok: false, why: `«${id}» no es una cerradura` };
    abierto = id; digitos = ""; aviso.textContent = ""; refrescarPantalla();
    titulo.textContent = l.nombre;
    capa.hidden = false; capa.style.display = "grid"; // an inline display beats the [hidden] attribute, so show/hide drives display too
    return { ok: true };
  };
  c.alCambiar((que) => {
    if (que === "rechazado" && abierto) aviso.textContent = c.estado.ultimoRechazo;
    if (que === "abierta") cerrarTeclado();
    if (que === "cerraduras" && abierto && !c.cerraduras().some((x) => x.id === abierto)) cerrarTeclado(); // removed from under us
  });

  /** The code locks a person whose feet are at (x, y, z) may open now, nearest first (offers for interactuar.ts). */
  const cerca = (x: number, z: number): Oferta[] => c.cerraduras()
    .filter((l) => l.metodo === "codigo" && !l.abierta)
    .map((l) => ({ l, d: Math.hypot(l.x - x, l.z - z) }))
    .filter(({ d }) => d <= CERRADURA_ALCANCE_M)
    .sort((a, b) => a.d - b.d)
    .map(({ l, d }) => ({ feature: "cerradura", key: l.id, intent: "", prompt: `abrir ${l.nombre}`, name: l.nombre, distance: d, local: () => abrirTeclado(l.id) }));
  /** A code lock never goes through the plain J4 flow (it has nothing to type there): main.ts's `ofrece` excludes it. */
  const ofrece = (feature: string, key: string): boolean => feature !== "cerradura" || c.cerraduras().find((l) => l.id === key)?.metodo !== "codigo";

  return { cerca, ofrece, abrirTeclado, cerrarTeclado };
}
