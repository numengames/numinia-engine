// huecos (U12): «pinchas el hueco, eliges tu imagen y se encaja sola». A hole is a picture in a frame that waits for a
// work (features/objetos: huecoAncho × huecoAlto metres). Whoever may build gets «E: poner tu obra en este hueco» close
// to one (the J4 prompt, apps/plaza/interactuar.ts: E, the prompt button or a click on the hole) and the file picker
// opens at once — a browser opens it only inside the click or the key press, so nothing waits before it. The picture
// goes up like any other (soltar.ts `rellenar`: checked, at most HUECO_PX_PAGINA px, a JPEG without its EXIF) and the
// server measures it and fits it whole into the frame (objetos.rellenar). On the selected object's card (ux2-dock), with a
// picture selected: «Hacer hueco» (its frame = the picture's size now), «Poner obra…» and «Vaciar hueco». Visitors see none of it.
type Res = { ok: true } | { ok: false; why: string };
type Hueco = { id: string; nombre: string; x: number; y: number; z: number; ancho: number; alto: number; lleno: boolean; fijado: boolean };
/** What interactuar.ts offers: a thing in reach whose use runs here, on the page (`local`), instead of an intent. */
export type Oferta = { feature: string; key: string; intent: string; prompt: string; name: string; distance: number; local: () => Res };
type Caja = [number, number, number, number, number, number];
export type OpcionesHuecos = {
  constructor: {
    estado: { puede: boolean; seleccionado: string };
    huecos(): Hueco[];
    objeto(id: string): (Record<string, unknown> & { id: string }) | null;
    hueco(id: string, ancho: number, alto: number): Res;
    vaciar(id: string): Res;
    escuchar(fn: (que: string) => void): () => void;
  };
  view: { editor?: { cajaPropia?(key: string): Caja | null } };
  rellenar(id: string, file: File): Promise<void>; // soltar.ts: prepare, upload, objetos.rellenar
  decir(texto: string): void;                      // soltar.ts' status line (role=status)
  panel: HTMLElement | null;                       // the object card's slot (constructor.ts ranuraFicha): the «Hueco» row
};

/** How close a hole is offered (metres on the ground) and how far above or below your eyes it may hang. */
export const HUECO_ALCANCE_M = 3, HUECO_ALTURA_M = 3.5;
const OJOS_M = 1.6;
const ACEPTA = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
const metros = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

export function montarHuecos(o: OpcionesHuecos) {
  const c = o.constructor;
  const entrada = document.createElement("input");
  entrada.type = "file"; entrada.accept = ACEPTA; entrada.hidden = true; entrada.id = "hueco-fichero";
  document.body.append(entrada);
  let destino = "";
  entrada.addEventListener("change", () => {
    const f = entrada.files?.[0], id = destino;
    entrada.value = ""; destino = "";
    if (f && id) void o.rellenar(id, f);
  });
  const deId = (id: string) => c.huecos().find((h) => h.id === id) ?? null;

  /** Open the file picker for this hole. Call it inside the click or the key press: browsers refuse a picker otherwise. */
  const abrir = (id: string): Res => {
    if (!c.estado.puede) return { ok: false, why: "no puedes construir aquí" };
    if (!deId(id)) return { ok: false, why: `«${id}» no es un hueco` };
    destino = id;
    entrada.click();
    return { ok: true };
  };
  /** The holes a person whose feet are at (x, y, z) may fill now, nearest first (offers for interactuar.ts). */
  const cerca = (x: number, z: number, y = 0): Oferta[] => !c.estado.puede ? [] : c.huecos()
    .map((h) => ({ h, d: Math.hypot(h.x - x, h.z - z) }))
    .filter(({ h, d }) => d <= HUECO_ALCANCE_M && Math.abs(h.y - (y + OJOS_M)) <= HUECO_ALTURA_M)
    .sort((a, b) => a.d - b.d)
    .map(({ h, d }) => ({ feature: "objetos", key: h.id, intent: "", prompt: h.lleno ? "cambiar la obra de este hueco" : "poner tu obra en este hueco", name: h.nombre, distance: d, local: () => abrir(h.id) }));
  /** A click on a thing while playing: a hole you may fill opens the picker. True = it was a hole. */
  const pinchar = (key: string): boolean => c.estado.puede && !!deId(key) && abrir(key).ok;

  // ---- the object's card: what a selected picture can do ----
  const fila = document.createElement("div");
  fila.className = "fila"; fila.setAttribute("role", "toolbar"); fila.setAttribute("aria-label", "Hueco");
  const texto = document.createElement("span");
  const boton = (id: string, t: string, titulo: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button"; b.id = id; b.textContent = t; b.title = titulo;
    b.addEventListener("click", fn);
    return b;
  };
  const sel = () => { const x = c.objeto(c.estado.seleccionado); return x && x.tipo === "imagen" ? x : null; };
  const responder = (r: Res, bien: string) => o.decir(r.ok ? bien : `No: ${r.why}.`);
  const hacer = boton("hueco-hacer", "Hacer hueco", "Esta imagen pasa a ser un hueco del tamaño que tiene ahora: quien construye la pincha y pone su obra; vaciarlo la trae de vuelta", () => {
    const x = sel();
    if (!x) return o.decir("Selecciona primero una imagen.");
    const caja = o.view.editor?.cajaPropia?.(x.id), alto = Number(x.sy);
    if (!caja || !(caja[4] - caja[1] > 0)) return o.decir("Espera a que se vea la imagen y vuelve a probar.");
    const ancho = (alto * (caja[3] - caja[0])) / (caja[4] - caja[1]);
    responder(c.hueco(x.id, Math.round(ancho * 100) / 100, alto), `Hueco hecho: ${metros(ancho)} × ${metros(alto)} m. Pínchalo jugando, o «Poner obra…».`);
  });
  const poner = boton("hueco-poner", "Poner obra…", "Elige una imagen de tu ordenador (.png, .jpg o .webp): se sube y se encaja entera en el marco", () => {
    const x = sel();
    const r = x ? abrir(x.id) : { ok: false as const, why: "selecciona primero un hueco" };
    if (!r.ok) o.decir(`No: ${r.why}.`);
  });
  const vaciar = boton("hueco-vaciar", "Vaciar hueco", "Quitar la obra: vuelve el cartel que tenía", () => {
    const x = sel();
    if (x) responder(c.vaciar(x.id), "Hueco vacío: vuelve su cartel.");
  });
  fila.append(texto, hacer, poner, vaciar);
  o.panel?.append(fila);
  const refrescar = () => {
    const x = c.estado.puede ? sel() : null, h = x ? deId(x.id) : null;
    fila.style.display = x ? "" : "none"; // not `hidden`: the panel's .fila is display:flex
    if (!x) return;
    texto.textContent = h ? `Hueco de ${metros(h.ancho)} × ${metros(h.alto)} m · ${h.lleno ? "con obra" : "libre"}` : "Imagen: ";
    hacer.hidden = !!h; poner.hidden = !h; vaciar.hidden = !h || !h.lleno;
  };
  c.escuchar((que) => { if (que === "seleccion" || que === "estado" || que === "permiso") refrescar(); });
  refrescar();
  return { cerca, pinchar, abrir, huecos: () => c.huecos() };
}
