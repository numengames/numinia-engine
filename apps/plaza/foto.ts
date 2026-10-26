// foto (N13): the photo mode — a pretty picture of the world that you can share, with a link that takes whoever opens
// it to where it was made. «Foto» (the bar's «Cámara» menu, P) hides the whole interface and frees the camera on a short leash
// (drag: frame · wheel or pinch: closer · WASD / left stick: move · Q E: down, up); 1-4 pick a filter inside the house
// palette, F a frame with the WORLD's name (never the engine's brand); Enter / Space / the round button takes the
// picture, drawn again at up to 2× and saved as PNG: «Compartir» (Web Share with the file, on phones), «Guardar»,
// «Copiar imagen», «Copiar enlace» (`#foto=…`, foto-nucleo.ts). Opening such a link marks the place as your waypoint,
// turns the camera toward it, and once there looks the way the photo looked. Where you appear is the server's (no
// client says where it stands): the waypoint leads you there, or (N16) the world puts you there if its entorno.json
// says `aparicionFoto: true` (features/teletransporte: the server finds a free spot; the light takes you). Nothing of this runs until P is pressed, and
// nothing draws while you hold still (phones stay cool). In VR (MIS-222) there is no free camera and no filters yet: the wrist
// watch's camera button takes ONE picture of the headset's view (view.fotoVR: the head's pose re-drawn into a target; the page's
// canvas gets nothing inside XR), always with the frame and the world's name, saves it, and keeps it: on leaving VR the picture
// is on screen with «Compartir» / «Guardar» / «Copiar enlace». In AR there is no photo mode yet.
// MIS-265: who may change the world's settings (its owner, the administrator) also gets «Usar de portada»: the picture,
// redrawn as a JPEG of at most PORTADA_PX, is uploaded to the world and set as the ficha's `portada` — the picture the
// world shows while it loads, its og:image (server/pagina.ts) and so its card in numinia.com's worlds room.
import { FILTROS, filtro, valoresSvg, aplicarMatriz, marco, nombreArchivo, enlaceSitio, tomarSitioDeLaDireccion, rumboHacia, medidaPortada, PORTADA_CALIDAD, type Sitio, type Filtro } from "./foto-nucleo.ts";
import { escribiendo } from "./escribiendo.ts";
import { icono } from "./iconos.ts";
import "./foto.css";
import { esTactil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page

type Punto = { x: number; y: number; z: number };
type Vista = {
  renderer: { domElement: HTMLCanvasElement; getPixelRatio(): number; setPixelRatio(r: number): void; setSize(w: number, h: number): void };
  draw(dt: number): void; applyPixelRatio(): void;
  vr: { active: boolean }; ar: { state: string };
  /** MIS-222: one picture of what the headset sees (packages/render/src/foto-xr.ts); rejects outside XR or when no frame comes. */
  fotoVR?: { sacar(): Promise<HTMLCanvasElement> };
  /** MIS-265: runs the function with name plates and speech bubbles hidden (packages/render nombres.sinRotulos). */
  sinRotulos?<T>(f: () => T): T;
  cam: { modo(m?: "juego" | "construir" | "foto"): string; desplazar(d: number, a: number, h?: number): void; mirarHacia(yaw: number, pitch?: number): void; yaw(): number;
    estado(): { pivote: Punto; yaw: number; pitch: number; distancia: number } };
  waypoint?(x: number, z: number, text: string): number;
};
export type FotoOpts = {
  view: Vista;
  yo: () => Punto | null;                                   // where your avatar stands (null before the welcome)
  mapa?: { marcarDestino?(m: { id: string; nombre: string; x: number; z: number }): void; destino?(): { id: string } | null };
  decir: (texto: string) => void;                           // a short notice (screen readers too)
  boton: HTMLButtonElement;                                 // «Foto», an entry of the bar's «Cámara» menu (ux2-barra)
  volverA?: () => HTMLElement | null;                       // where the focus goes back on leaving (the «Cámara» button)
  ocupado?: () => boolean;                                  // something else holds the keys (a dartboard in hand)
  registrar?: (d: { detalle?: string }) => void;            // the session log: a picture was taken (`detalle`: «vr» when inside the headset)
  /** N16: whether this world puts you at a photo's place (null = not known yet) and the asking (the server decides). */
  aparecer?: { puede(): boolean | null; pedir(s: Sitio): void };
  /** MIS-265: make the picture the world's cover — offered only when `puede()` (the server lets you change the settings). */
  portada?: { puede(): boolean; usar(f: File): Promise<{ ok: true } | { ok: false; why: string }> };
};

const MAX_LADO = 3200;          // px: the saved picture's longest side at most (a 4K phone at 2× would be 7680)
const PASO_MS = 3, PASO_RAPIDO = 2.5; // the camera's pace with WASD (m/s), × with Shift
const LLEGADA_M = 3;            // a photo's place this close = you are there
const PASAN = new Set(["Comma", "Period", "PageUp", "PageDown", "Home", "NumpadAdd", "NumpadSubtract", "Tab"]); // the camera's own keys, and focus
const MUEVE: Record<string, [number, number, number]> = {
  KeyW: [0, 1, 0], ArrowUp: [0, 1, 0], KeyS: [0, -1, 0], ArrowDown: [0, -1, 0], KeyA: [-1, 0, 0], ArrowLeft: [-1, 0, 0], KeyD: [1, 0, 0], ArrowRight: [1, 0, 0], KeyQ: [0, 0, -1], KeyE: [0, 0, 1],
};
const tactil = esTactil; // U25: the page's one answer (perfil-aparato.ts)
const css = (v: string, si: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || si;

export function montarFoto(o: FotoOpts) {
  const { view } = o;
  const lienzo = view.renderer.domElement;
  let activo = false, filtroId = "natural", conMarco = false, hecha: { blob: Blob; url: string; nombre: string; ancho: number; alto: number; enlace: string } | null = null;
  let sinNombres: Blob | null = null; // MIS-265: the same picture drawn without name plates, kept only for who may set a cover
  let deVR = false, estabaEnVR = false; // the picture on hand was taken inside VR and has not been shown yet / VR was on a moment ago
  let mundo = () => document.title || "Mundo";

  // ---- the filters as SVG colour matrices (the live preview: the same numbers the PNG gets) ----
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "foto-filtros-svg"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
  svg.innerHTML = /* numbers from FILTROS (this code), nothing typed by anyone */ FILTROS.filter((f) => f.matriz).map((f) => `<filter id="foto-f-${f.id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${valoresSvg(f.matriz!)}"/></filter>`).join("");
  document.body.appendChild(svg);

  // ---- the photo interface (the only thing on screen in photo mode; never in the picture: it reads the canvas) ----
  const raiz = document.createElement("section");
  raiz.id = "foto"; raiz.hidden = true; raiz.setAttribute("aria-label", "Modo foto");
  raiz.innerHTML = /* static markup: only this file's constants (FILTROS, icons); the world's name goes in with textContent */ `
    <div id="foto-marco" hidden aria-hidden="true"><span class="nombre"></span><span class="fecha"></span></div>
    <div id="foto-destello" aria-hidden="true"></div>
    <p class="foto-ayuda" role="note"></p>
    <div class="foto-barra" role="toolbar" aria-label="Modo foto">
      <div class="foto-filtros" role="group" aria-label="Filtro">${FILTROS.map((f, i) => `<button type="button" data-filtro="${f.id}" aria-pressed="${f.id === "natural"}" title="${f.describe} (${i + 1})">${f.nombre}</button>`).join("")}</div>
      <button type="button" class="foto-con-marco" aria-pressed="false" title="Marco con el nombre del mundo (F)">Marco</button>
      <button type="button" class="foto-disparar" title="Hacer la foto (Intro)">${icono("camera", 28)}<span class="solo-lector">Hacer la foto</span></button>
      <button type="button" class="foto-salir" title="Salir del modo foto (Esc)">${icono("x", 18)}<span class="solo-lector">Salir del modo foto</span></button>
    </div>
    <div class="foto-hecha" role="dialog" aria-label="Tu foto" hidden>
      <img alt="" />
      <p class="estado" role="status" aria-live="polite"></p>
      <div class="fila">
        <button type="button" class="foto-compartir" hidden>${icono("share-network", 18)}<span>Compartir</span></button>
        <button type="button" class="foto-guardar">${icono("download-simple", 18)}<span>Guardar</span></button>
        <button type="button" class="foto-copiar-imagen" hidden>${icono("copy", 18)}<span>Copiar imagen</span></button>
        <button type="button" class="foto-copiar-enlace">${icono("copy", 18)}<span>Copiar enlace</span></button>
        <button type="button" class="foto-portada" hidden title="La imagen del mundo: la que se ve mientras carga y en su tarjeta de numinia.com">${icono("image-square", 18)}<span>Usar de portada</span></button>
        <button type="button" class="foto-otra">Otra foto</button>
      </div>
      <input class="foto-enlace" type="text" readonly hidden aria-label="Enlace a este sitio del mundo" />
    </div>`;
  document.body.appendChild(raiz);
  const $ = <T extends HTMLElement>(s: string) => raiz.querySelector(s) as T;
  const capaMarco = $<HTMLDivElement>("#foto-marco"), destello = $<HTMLDivElement>("#foto-destello"), ayuda = $<HTMLParagraphElement>(".foto-ayuda");
  const bDisparar = $<HTMLButtonElement>(".foto-disparar"), bMarco = $<HTMLButtonElement>(".foto-con-marco");
  const panel = $<HTMLDivElement>(".foto-hecha"), img = panel.querySelector("img")!, estado = $<HTMLParagraphElement>(".foto-hecha .estado");
  const bCompartir = $<HTMLButtonElement>(".foto-compartir"), bGuardar = $<HTMLButtonElement>(".foto-guardar"), bCopiarImg = $<HTMLButtonElement>(".foto-copiar-imagen");
  const bEnlace = $<HTMLButtonElement>(".foto-copiar-enlace"), campoEnlace = $<HTMLInputElement>(".foto-enlace");
  const bPortada = $<HTMLButtonElement>(".foto-portada");
  raiz.addEventListener("pointerdown", (e) => e.stopPropagation()); // a press on the photo bar is never the page's joystick
  raiz.addEventListener("wheel", (e) => e.stopPropagation());

  // ---- the button in the top bar (U11: an icon, the words for screen readers) ----
  o.boton.classList.add("solo-icono");
  o.boton.title = "Foto: la interfaz se esconde, encuadras y disparas";
  o.boton.innerHTML = `${icono("camera")}<span class="solo-lector">Foto</span>`;
  o.boton.addEventListener("click", () => (activo ? cerrar() : abrir()));
  setInterval(() => {
    const vr = view.vr.active, x = vr || view.ar.state !== "off"; if (o.boton.hidden !== x) o.boton.hidden = x; // no free-camera button in XR
    if (estabaEnVR && !vr && deVR && hecha && !activo && abrir()) mostrarHecha(); // back from VR: the picture taken there, on screen
    estabaEnVR = vr;
  }, 500);

  function pintarMarco(): void {
    capaMarco.hidden = !conMarco;
    const m = marco(innerWidth, innerHeight);
    raiz.style.setProperty("--sobre-marco", conMarco ? `${m.banda}px` : "0px"); // the bar sits above the frame's band, not on the name
    if (!conMarco) return;
    capaMarco.style.setProperty("--borde", `${m.borde}px`); capaMarco.style.setProperty("--banda", `${m.banda}px`);
    capaMarco.style.setProperty("--letra", `${m.letra}px`); capaMarco.style.setProperty("--margen", `${m.margen}px`);
    (capaMarco.querySelector(".nombre") as HTMLElement).textContent = mundo();
    (capaMarco.querySelector(".fecha") as HTMLElement).textContent = fecha(new Date());
  }
  function elegirFiltro(id: string): Filtro {
    const f = filtro(id); filtroId = f.id;
    for (const b of raiz.querySelectorAll<HTMLButtonElement>("[data-filtro]")) b.setAttribute("aria-pressed", String(b.dataset.filtro === f.id));
    lienzo.style.filter = activo && f.matriz ? `url(#foto-f-${f.id})` : "";
    return f;
  }
  function ponerMarco(on: boolean): void { conMarco = on; bMarco.setAttribute("aria-pressed", String(on)); pintarMarco(); }
  for (const b of raiz.querySelectorAll<HTMLButtonElement>("[data-filtro]")) b.addEventListener("click", () => { const f = elegirFiltro(b.dataset.filtro!); o.decir(`Filtro: ${f.nombre}.`); });
  bMarco.addEventListener("click", () => { ponerMarco(!conMarco); o.decir(conMarco ? "Marco con el nombre del mundo." : "Sin marco."); });
  bDisparar.addEventListener("click", () => { void disparar(); });
  $<HTMLButtonElement>(".foto-salir").addEventListener("click", () => cerrar());
  $<HTMLButtonElement>(".foto-otra").addEventListener("click", () => volverAEncuadrar());
  addEventListener("resize", () => { if (activo) pintarMarco(); });

  // ---- in and out ----
  function abrir(): boolean {
    if (activo) return true;
    if (view.vr.active || view.ar.state !== "off") { o.decir("En VR o AR no hay modo foto todavía."); return false; }
    if (view.cam.modo() === "construir") { o.decir("Sal de construir para hacer fotos."); return false; }
    (document.activeElement as HTMLElement | null)?.blur?.();
    activo = true;
    view.cam.modo("foto");
    document.body.classList.add("modo-foto");
    raiz.hidden = false; panel.hidden = true;
    ayuda.textContent = tactil()
      ? "Un dedo: encuadrar · dos dedos: acercar y mover · el botón redondo hace la foto"
      : "Arrastra: encuadrar · rueda: acercar · WASD: mover · Q E: bajar, subir · 1-4: filtro · F: marco · Intro: foto · Esc: salir";
    ayuda.classList.remove("se-va"); void ayuda.offsetWidth; ayuda.classList.add("se-va");
    elegirFiltro(filtroId); pintarMarco();
    bDisparar.focus({ preventScroll: true });
    o.decir("Modo foto: la interfaz se esconde; encuadra y haz la foto. Esc para salir.");
    return true;
  }
  function cerrar(): void {
    if (!activo) return;
    activo = false; sujetas.clear();
    view.cam.modo("juego");
    document.body.classList.remove("modo-foto");
    raiz.hidden = true; panel.hidden = true; raiz.classList.remove("con-foto"); lienzo.style.filter = "";
    soltarHecha();
    (o.volverA?.() ?? o.boton).focus({ preventScroll: true });
    o.decir("Fuera del modo foto.");
  }
  function volverAEncuadrar(): void { panel.hidden = true; raiz.classList.remove("con-foto"); pintarMarco(); soltarHecha(); bDisparar.focus({ preventScroll: true }); }
  function soltarHecha(): void { if (hecha) URL.revokeObjectURL(hecha.url); hecha = null; sinNombres = null; deVR = false; img.removeAttribute("src"); campoEnlace.hidden = true; }

  // ---- the picture: drawn again at up to 2× right now, read from the canvas in the same task (WebGL2 and WebGPU
  // both keep the frame until the task ends), then filtered and framed on a 2D canvas ----
  function capturar(): HTMLCanvasElement {
    const r = view.renderer, w = innerWidth, h = innerHeight;
    const pr = Math.max(0.5, Math.min(2, devicePixelRatio || 1, MAX_LADO / Math.max(w, h)));
    try {
      r.setPixelRatio(pr); r.setSize(w, h);
      view.draw(0);
      const c = document.createElement("canvas");
      c.width = lienzo.width; c.height = lienzo.height;
      c.getContext("2d")!.drawImage(lienzo, 0, 0);
      return c;
    } finally { view.applyPixelRatio(); }
  }
  function vacia(px: Uint8ClampedArray): boolean { // nothing came out (a browser that does not hand the frame over)
    for (let i = 0; i < px.length; i += 4 * 997) if (px[i + 3] !== 0 && (px[i] | px[i + 1] | px[i + 2]) !== 0) return false;
    return true;
  }
  async function componer(c: HTMLCanvasElement, f: Filtro, conElMarco = conMarco): Promise<void> {
    const ctx = c.getContext("2d")!, w = c.width, h = c.height;
    const datos = ctx.getImageData(0, 0, w, h);
    if (vacia(datos.data)) throw new Error("el navegador no dejó leer la imagen del mundo");
    if (f.matriz) { aplicarMatriz(datos.data, f.matriz); ctx.putImageData(datos, 0, 0); }
    if (!conElMarco) return;
    const m = marco(w, h), fondo = css("--n-fondo", "#14110F");
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, w, m.borde); ctx.fillRect(0, 0, m.borde, h); ctx.fillRect(w - m.borde, 0, m.borde, h);
    ctx.fillRect(0, h - m.banda, w, m.banda);
    const familia = css("--n-titulos", "Geist, system-ui, sans-serif"), peso = css("--n-titulos-peso", "600");
    const fuente = `${peso} ${m.letra}px ${familia}`;
    try { await document.fonts.load(fuente, mundo()); } catch { /* the system face, then */ }
    const yTexto = h - m.banda / 2;
    ctx.fillStyle = css("--n-ambar", "#EFA517");
    ctx.fillRect(m.margen, yTexto - m.letra * 0.45, Math.max(3, Math.round(m.letra * 0.14)), m.letra * 0.9); // a small accent bar
    ctx.fillStyle = css("--n-texto", "#F9EBDC"); ctx.textBaseline = "middle";
    ctx.font = fuente; ctx.textAlign = "left";
    const mayus = css("--n-titulos-mayus", "none") === "uppercase";
    const x0 = m.margen + Math.round(m.letra * 0.5), anchoFecha = Math.round(m.letra * 6);
    ctx.fillText(recortar(ctx, mayus ? mundo().toUpperCase() : mundo(), w - x0 - m.margen - anchoFecha), x0, yTexto);
    ctx.font = `400 ${Math.round(m.letra * 0.62)}px "Geist Mono", ui-monospace, monospace`;
    ctx.fillStyle = css("--n-texto2", "#C4B5A6"); ctx.textAlign = "right";
    ctx.fillText(fecha(new Date()), w - m.margen, yTexto);
  }
  type Resultado = { ok: boolean; ancho?: number; alto?: number; bytes?: number; nombre?: string; enlace?: string; error?: string; deVR?: boolean };
  /** Keeps a finished picture as «the last one» (blob, link, name) and offers the buttons the browser can use. */
  async function guardarHecha(c: HTMLCanvasElement, enlaceDe: string): Promise<{ blob: Blob; archivo: File }> {
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (!blob) throw new Error("no se pudo guardar como PNG");
    soltarHecha();
    hecha = { blob, url: URL.createObjectURL(blob), nombre: nombreArchivo(mundo(), new Date()), ancho: c.width, alto: c.height, enlace: enlaceDe };
    img.src = hecha.url; img.alt = `Tu foto de ${mundo()}`;
    const archivo = new File([blob], hecha.nombre, { type: "image/png" });
    bCompartir.hidden = !(typeof navigator.share === "function" && (navigator.canShare?.({ files: [archivo] }) ?? false));
    bCopiarImg.hidden = tactil() || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write;
    estado.textContent = `${c.width} × ${c.height} px · ${Math.round(blob.size / 1024)} kB`;
    return { blob, archivo };
  }
  function mostrarHecha(): void {
    panel.hidden = false; raiz.classList.add("con-foto");
    bPortada.hidden = !o.portada?.puede(); bPortada.disabled = false;
    (bCompartir.hidden ? bGuardar : bCompartir).focus({ preventScroll: true });
    deVR = false;
    o.decir("Foto hecha. Puedes compartirla, guardarla o copiar el enlace a este sitio.");
  }
  function resultado(c: HTMLCanvasElement, extra: Partial<Resultado> = {}): Resultado {
    return { ok: true, ancho: c.width, alto: c.height, bytes: hecha!.blob.size, nombre: hecha!.nombre, enlace: hecha!.enlace, ...extra };
  }
  /** MIS-222 — inside VR: one picture of the headset's view, with the frame and the world's name (no filters, no free camera
   * yet). The PNG is kept as «the last one» and offered for download at once (best effort: a headset browser may refuse a
   * download in a session); on leaving VR it is on screen with the share / save buttons. */
  async function dispararVR(): Promise<Resultado> {
    if (!view.fotoVR) return { ok: false, error: "este motor no saca fotos dentro de VR" };
    try {
      const c = await view.fotoVR.sacar();
      await componer(c, filtro("natural"), true);
      const yo = o.yo(), e = view.cam.estado(); // where you stand and the way you look: the link leads there
      await guardarHecha(c, enlaceSitio(location, { x: yo?.x ?? e.pivote.x, y: yo?.y ?? e.pivote.y, z: yo?.z ?? e.pivote.z, yaw: view.cam.yaw(), pitch: 0, dist: 0 }));
      deVR = true; o.registrar?.({ detalle: "vr" });
      try { const a = document.createElement("a"); a.href = hecha!.url; a.download = hecha!.nombre; document.body.appendChild(a); a.click(); a.remove(); } catch { /* the picture waits on the page */ }
      o.decir("Foto hecha en VR: al salir la tienes en la página para compartirla.");
      return resultado(c, { deVR: true });
    } catch (e) {
      const t = `No pude hacer la foto en VR: ${(e as Error)?.message ?? e}.`;
      o.decir(t); console.warn(`[foto] ${t}`);
      return { ok: false, error: String((e as Error)?.message ?? e), deVR: true };
    }
  }
  async function disparar(): Promise<Resultado> {
    if (view.vr.active) return dispararVR(); // the headset's view is not this page's canvas
    if (!activo && !abrir()) return { ok: false, error: "no hay modo foto aquí" };
    try {
      if (!document.documentElement.classList.contains("menos-movimiento")) { destello.classList.remove("ya"); void destello.offsetWidth; destello.classList.add("ya"); }
      const c = capturar();
      await componer(c, filtro(filtroId));
      // MIS-265: a cover is public, so whoever may set one gets a second drawing of the frame with no names over the people
      let cSin: HTMLCanvasElement | null = null;
      if (o.portada?.puede() && view.sinRotulos) { cSin = view.sinRotulos(capturar); await componer(cSin, filtro(filtroId)); }
      await guardarHecha(c, enlace());
      if (cSin) sinNombres = await new Promise<Blob | null>((ok) => cSin!.toBlob(ok, "image/png"));
      mostrarHecha(); o.registrar?.({});
      return resultado(c);
    } catch (e) {
      const t = `No pude hacer la foto: ${(e as Error)?.message ?? e}.`;
      o.decir(t); console.warn(`[foto] ${t}`);
      return { ok: false, error: String((e as Error)?.message ?? e) };
    }
  }

  // ---- what to do with it ----
  function enlace(): string {
    const e = view.cam.estado();
    return enlaceSitio(location, { x: e.pivote.x, y: e.pivote.y, z: e.pivote.z, yaw: e.yaw, pitch: e.pitch, dist: e.distancia });
  }
  bGuardar.addEventListener("click", () => {
    if (!hecha) return;
    const a = document.createElement("a");
    a.href = hecha.url; a.download = hecha.nombre; document.body.appendChild(a); a.click(); a.remove();
    estado.textContent = `Guardada: ${hecha.nombre}`;
  });
  bCompartir.addEventListener("click", async () => {
    if (!hecha) return;
    const archivo = new File([hecha.blob], hecha.nombre, { type: "image/png" });
    try {
      await navigator.share({ files: [archivo], title: mundo(), text: `${mundo()} · ven a este sitio: ${hecha.enlace}`, url: hecha.enlace });
      estado.textContent = "Compartida.";
    } catch (e) { if ((e as Error)?.name !== "AbortError") estado.textContent = "No se pudo compartir: guárdala o copia el enlace."; }
  });
  bCopiarImg.addEventListener("click", async () => {
    if (!hecha) return;
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": hecha.blob })]); estado.textContent = "Imagen copiada: pégala donde quieras."; }
    catch { estado.textContent = "No se pudo copiar la imagen: guárdala."; }
  });
  /** MIS-265: the picture on hand as the world's cover (a JPEG of at most PORTADA_PX); says how it went. */
  async function usarDePortada(): Promise<{ ok: true; bytes: number } | { ok: false; why: string }> {
    if (!hecha) return { ok: false, why: "aún no hay foto" };
    if (!o.portada?.puede()) return { ok: false, why: "solo quien cuida el mundo puede cambiar su portada" };
    const bmp = await createImageBitmap(sinNombres ?? hecha.blob); // no names when the world could draw it so
    const m = medidaPortada(bmp.width, bmp.height), c = document.createElement("canvas");
    c.width = m.ancho; c.height = m.alto;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(bmp, 0, 0, m.ancho, m.alto); bmp.close();
    const jpg = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", PORTADA_CALIDAD));
    if (!jpg) return { ok: false, why: "el navegador no pudo hacer el JPEG" };
    const r = await o.portada.usar(new File([jpg], hecha.nombre.replace(/\.png$/, "-portada.jpg"), { type: "image/jpeg" }));
    return r.ok ? { ok: true, bytes: jpg.size } : r;
  }
  bPortada.addEventListener("click", async () => {
    bPortada.disabled = true; estado.textContent = "Poniendo la portada…";
    let r: Awaited<ReturnType<typeof usarDePortada>>;
    try { r = await usarDePortada(); } catch (e) { r = { ok: false, why: String((e as Error)?.message ?? e) }; }
    bPortada.disabled = false;
    estado.textContent = r.ok ? "Es la portada del mundo: la verás al cargar y en su tarjeta de numinia.com." : `No se puso de portada: ${r.why}.`;
    o.decir(estado.textContent);
  });
  bEnlace.addEventListener("click", async () => {
    const t = hecha?.enlace ?? enlace();
    try { await navigator.clipboard.writeText(t); estado.textContent = "Enlace copiado: quien lo abra llega a este sitio."; }
    catch { campoEnlace.hidden = false; campoEnlace.value = t; campoEnlace.focus(); campoEnlace.select(); estado.textContent = "Copia el enlace de la caja."; }
  });

  // ---- keys: in photo mode the photo owns the keyboard (the world's keys would walk, jump, open the mic...) ----
  const sujetas = new Set<string>();
  let rapido = false, ultimoPaso = 0;
  addEventListener("keydown", (e) => {
    if (escribiendo(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!activo) return; // ux2-barra: P opens the bar's «Cámara» menu (menu-barra.ts); «Foto» is its first entry
    if (PASAN.has(e.code) || ["+", "-", "=", "_"].includes(e.key)) return; // the camera's own keys
    e.stopImmediatePropagation();
    const enBoton = (e.target as HTMLElement | null)?.closest?.("#foto button");
    if (!panel.hidden) { // the picture is on screen: its buttons; Esc goes back to framing
      if (e.code === "Escape") { e.preventDefault(); volverAEncuadrar(); }
      return;
    }
    if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); if (!e.repeat) cerrar(); return; }
    if ((e.code === "Enter" || e.code === "Space") && !enBoton) { e.preventDefault(); if (!e.repeat) void disparar(); return; }
    if (e.code === "KeyF" && !e.repeat) { ponerMarco(!conMarco); return; }
    const n = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (n && FILTROS[Number(n[2]) - 1]) { elegirFiltro(FILTROS[Number(n[2]) - 1].id); return; }
    if (MUEVE[e.code]) { e.preventDefault(); rapido = e.shiftKey; if (!sujetas.size) { ultimoPaso = 0; requestAnimationFrame(andar); } sujetas.add(e.code); }
  }, { capture: true });
  addEventListener("keyup", (e) => { sujetas.delete(e.code); rapido = e.shiftKey; });
  addEventListener("blur", () => sujetas.clear());
  function andar(t: number): void {
    if (!activo || !sujetas.size) return;
    const s = ultimoPaso ? Math.min(0.25, (t - ultimoPaso) / 1000) : 1 / 60; // real time (a slow phone still covers the ground) ultimoPaso = t;
    let d = 0, a = 0, h = 0;
    for (const k of sujetas) { const v = MUEVE[k]; d += v[0]; a += v[1]; h += v[2]; }
    const v = PASO_MS * (rapido ? PASO_RAPIDO : 1) * s;
    if (d || a || h) view.cam.desplazar(d * v, a * v, h * v);
    requestAnimationFrame(andar);
  }

  // ---- a photo's link opened: lead to the place, then look the way the photo looked ----
  const llegada = tomarSitioDeLaDireccion(location, history);
  let guia: Sitio | null = llegada, guiaEstado: "esperando" | "apareciendo" | "en-camino" | "llegado" | "ninguna" = llegada ? "esperando" : "ninguna";
  if (llegada) {
    let vueltas = 0, pedida = false;
    const t = setInterval(() => {
      const yo = o.yo();
      if (!yo || !guia) return;
      vueltas++;
      // N16: a world that allows it puts you at the photo's place (the light takes you there); else, or if it found no
      // room there, the waypoint leads you. The world's answer may come a moment after the welcome: wait up to ~2 s.
      if (guiaEstado === "esperando" && o.aparecer && !pedida) {
        const p = o.aparecer.puede();
        if (p === null && vueltas < 5) return;
        if (p) { guiaEstado = "apareciendo"; vueltas = 0; pedida = true; o.aparecer.pedir(guia); o.decir("Te han pasado una foto de este mundo: apareces donde se hizo."); return; }
      }
      if (guiaEstado === "apareciendo" && Math.hypot(yo.x - guia.x, yo.z - guia.z) > LLEGADA_M) {
        if (vueltas < 10) return; // ~4 s: the light takes 0.6 s; more = the server found no room
        guiaEstado = "esperando";
      }
      if (guiaEstado === "esperando") {
        guiaEstado = "en-camino";
        if (o.mapa?.marcarDestino) o.mapa.marcarDestino({ id: "foto", nombre: "el sitio de la foto", x: guia.x, z: guia.z }); else view.waypoint?.(guia.x, guia.z, "Aquí se hizo la foto");
        view.cam.mirarHacia(rumboHacia(yo.x, yo.z, guia.x, guia.z));
        o.decir("Te han pasado una foto de este mundo: sigue la luz hasta el sitio donde se hizo.");
      }
      if (Math.hypot(yo.x - guia.x, yo.z - guia.z) <= LLEGADA_M) {
        guiaEstado = "llegado"; clearInterval(t);
        view.cam.mirarHacia(guia.yaw, guia.pitch);
        o.decir("Estás donde se hizo la foto.");
      }
    }, 400);
  }

  return {
    /** True while the photo mode owns the screen (the page then holds your avatar still). */
    activo: () => activo,
    abrir, cerrar, disparar, elegirFiltro: (id: string) => elegirFiltro(id).id, marco: (on: boolean) => ponerMarco(on),
    filtros: () => FILTROS.map((f) => ({ id: f.id, nombre: f.nombre })),
    enlace,
    /** The last picture (for checks and agents): size, bytes, file name, link; null until one is made. */
    portadaSinNombres: () => sinNombres !== null,
    ultima: () => (hecha ? { ancho: hecha.ancho, alto: hecha.alto, bytes: hecha.blob.size, nombre: hecha.nombre, enlace: hecha.enlace } : null),
    /** The last picture's bytes as a data URL (checks read its pixels). */
    datos: async () => (hecha ? await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(hecha!.blob); }) : null),
    /** MIS-265: the last picture as the world's cover (checks and agents; the button does the same). */
    usarDePortada,
    /** A photo's link opened this page: where it leads and how far it got. */
    guia: () => (guia ? { ...guia, estado: guiaEstado } : null),
  };
}

function fecha(d: Date): string {
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}
function recortar(ctx: CanvasRenderingContext2D, t: string, max: number): string {
  if (ctx.measureText(t).width <= max) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}
