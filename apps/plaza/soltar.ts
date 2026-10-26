// soltar (H9): drop your own .glb on the page and it appears where you dropped it, for everyone, and stays. Only for
// whoever may build (the server says so on entering: objetos.permiso); visitors never see the overlay nor the button.
// The same path without a mouse: «Subir» in the builder's «Añadir» drawer (ux2-dock) puts it 3 m in front of you.
// Steps: check the file here (kind, cap, a GLB that reads: packages/net/src/ficheros.ts, the same check as the server)
// → its sha256 → HEAD /a/<sha256>.glb (already there? no upload) → PUT with the guest token (I1) and visible progress
// → colocar (features/objetos) named after the file, so screen readers and agents hear it. Every step is said in a
// role=status line; a refusal says why in Spanish. main.ts mounts it with one line; it touches no shared file.
// U12: the same path fills a hole (huecos.ts): `rellenar(id, file)` takes only a picture, makes a big one
// HUECO_PX_PAGINA on its longest side and redraws a JPEG (standing as the camera saw it, without its EXIF: a phone
// photo's GPS stays home), uploads it, and asks objetos.rellenar: the server measures it and fits it into the frame.
import { comprobarFichero, motivo, sha256Hex, topeBytes, TOPES_MB, TIPOS } from "../../packages/net/src/ficheros.ts";
import { sePuedeReproducir } from "../../packages/render/src/medios.ts";
import { HUECO_PX_PAGINA } from "../../features/objetos/feature.ts";
import { fondoAceptable } from "./entorno-fino-logica.ts";
import type { CampoFondo } from "./entorno-fino-logica.ts";

/** U10: what each file becomes in the world (features/objetos `tipo`). */
const CLASE: Record<string, "modelo" | "imagen" | "video" | "sonido"> = { glb: "modelo", png: "imagen", jpg: "imagen", webp: "imagen", mp4: "video", webm: "video", mp3: "sonido", ogg: "sonido" };
const QUE: Record<string, string> = { modelo: "el modelo", imagen: "la imagen", video: "la pantalla de vídeo", sonido: "la zona de sonido" };
/** The file picker's filter: every kind it can place (the kind is read from the extension, as on a drop). */
const ACEPTA = ".glb,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mp3,.ogg";

type Res = { ok: true } | { ok: false; why: string };
type Msg = Record<string, unknown>;
/** What this needs from the page's session (packages/client ClientSession) and view (packages/render). */
export type OpcionesSoltar = {
  session: {
    entity: number;
    selfPosition(alpha: number): { x: number; z: number };
    features: { send(feature: string, intent: string, msg: Msg): Res; readonly log: readonly { feature: string; event: string; msg: Msg }[]; readonly stats: { events: number } };
  };
  view: { sueloBajo(clientX: number, clientY: number): { x: number; z: number } | null };
  puede(): boolean;          // may this player build? (features/objetos client: estado.puede)
  origen: string;            // the instance's server, where /a/ lives (http://host:port)
  billete(): string | null;  // the guest token the page keeps (localStorage numinia.invitado)
};

const CSS = `
#soltar { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 10; pointer-events: none;
  background: rgba(201, 182, 255, .28); border: 4px dashed #6b4fd8; color: #23303b; font-size: 22px; font-weight: 600; }
#soltar.activo { display: flex; }
#soltar span { padding: 10px 16px; border-radius: 10px; background: rgba(238, 242, 246, .9); }
#subida-estado { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); max-width: 90vw; margin: 0; border-radius: 8px;
  color: #eef2f6; pointer-events: none; z-index: 11; }
#subida-estado.con-texto { padding: 6px 10px; background: rgba(20, 24, 30, .85); }
`;

/** The name a thing gets from its file: no extension, underscores as spaces, at most 60 bytes (objetos' NOMBRE). */
export function nombreDeFichero(fichero: string): string {
  const base = fichero.replace(/\.[^.]*$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  let out = "";
  for (const ch of base) { if (enc.encode(out + ch).length > 60) break; out += ch; }
  return out.trim() || "Modelo subido";
}

/** Where a file goes once it is on the server: a point of the ground (null = 3 m in front of you) or a hole (U12). */
type Destino = { donde: { x: number; z: number } | null } | { hueco: string };
const extensionDe = (fichero: string) => { const e = fichero.split(".").pop()?.toLowerCase() ?? ""; return e === "jpeg" ? "jpg" : e; };

/** U12: a picture for a hole, ready to go up: at most HUECO_PX_PAGINA px on its longest side, and a JPEG always
 * redrawn — standing as it was taken (an <img> applies the EXIF orientation) and without its EXIF (no GPS of a phone
 * photo reaches a public world). A PNG or WebP that fits goes as it is. When the page cannot draw it, the file goes as
 * it came (the server measures it and refuses more than 4096 px with a reason). */
export async function prepararImagen(file: File, max = HUECO_PX_PAGINA): Promise<File> {
  const ext = extensionDe(file.name), url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, lado = Math.max(w, h);
    if (!w || !h || (ext !== "jpg" && lado <= max)) return file;
    const k = Math.min(1, max / lado), lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(w * k)); lienzo.height = Math.max(1, Math.round(h * k));
    const g = lienzo.getContext("2d");
    if (!g) return file;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const quiere = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, quiere, 0.92));
    if (!blob) return file;
    const sale = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"; // a browser that cannot write WebP gives PNG
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "")}.${sale}`, { type: blob.type });
  } catch { return file; } finally { URL.revokeObjectURL(url); }
}

const POR_ESTADO: Record<number, string> = {
  0: "no llego al servidor (¿se cortó la conexión?)",
  401: "el servidor no sabe quién eres: recarga la página",
  403: "no puedes construir aquí",
  413: "es demasiado grande",
  415: "ese tipo de fichero no se puede subir",
  422: "el fichero no vale",
  503: "hay otras subidas en marcha; prueba en unos segundos",
  507: "el servidor no tiene sitio para más subidas",
};

export function montarSoltar(o: OpcionesSoltar) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const capa = document.createElement("div"); capa.id = "soltar"; capa.setAttribute("aria-hidden", "true");
  capa.innerHTML = "<span>Suelta para subir tu modelo, imagen, vídeo o sonido</span>";
  const linea = document.createElement("p"); linea.id = "subida-estado"; linea.setAttribute("role", "status"); linea.setAttribute("aria-live", "polite");
  document.body.append(capa, linea);
  const cuenta = { subidas: 0, yaEstaban: 0, colocadas: 0, rechazadas: 0, huecos: 0 };
  let borrar: ReturnType<typeof setTimeout> | undefined;
  const decir = (texto: string, quedarse = false) => {
    linea.textContent = texto; linea.classList.toggle("con-texto", !!texto);
    clearTimeout(borrar);
    if (!quedarse && texto) borrar = setTimeout(() => decir(""), 8000);
  };
  const no = (fichero: string, por: string) => { cuenta.rechazadas++; decir(`No se pudo subir «${fichero}»: ${por}.`); };

  const huella = async (b: Uint8Array): Promise<string> => {
    const sutil = (globalThis.crypto as Crypto | undefined)?.subtle; // only in secure contexts (https, localhost)
    if (!sutil) return sha256Hex(b);
    const d = new Uint8Array(await sutil.digest("SHA-256", b));
    return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
  };
  const put = (url: string, b: Uint8Array, billete: string, fichero: string, tipo: string, avance: (f: number) => void) =>
    new Promise<{ status: number; error: string }>((ok) => {
      const x = new XMLHttpRequest(); // fetch() has no upload progress
      x.open("PUT", url);
      x.setRequestHeader("authorization", `Bearer ${billete}`);
      x.setRequestHeader("content-type", tipo);
      x.setRequestHeader("x-nombre-fichero", encodeURIComponent(fichero));
      x.upload.onprogress = (e) => { if (e.lengthComputable) avance(e.loaded / e.total); };
      x.onload = () => { let error = ""; try { error = String(JSON.parse(x.responseText).error ?? ""); } catch { /* not JSON */ } ok({ status: x.status, error }); };
      x.onerror = () => ok({ status: 0, error: "" });
      x.send(b);
    });
  /** Wait for the server's answer to colocar (or rellenar): objetos.hecho (with the id) or objetos.rechazado (with why). */
  const respuesta = (desde: number, accion = "colocar") => new Promise<{ ok: boolean; texto: string }>((ok) => {
    const t0 = performance.now();
    const mirar = () => {
      const f = o.session.features, nuevos = f.stats.events - desde;
      const e = nuevos > 0 ? f.log.slice(-Math.min(nuevos, f.log.length)).find((x) => x.feature === "objetos" && (x.event === "rechazado" || (x.event === "hecho" && x.msg.accion === accion))) : undefined;
      if (e) return ok({ ok: e.event === "hecho", texto: String(e.msg.motivo ?? e.msg.id ?? "") });
      if (performance.now() - t0 > 8000) return ok({ ok: false, texto: "el servidor no contestó" });
      setTimeout(mirar, 100);
    };
    mirar();
  });
  const delante = () => { const p = o.session.selfPosition(0); return { x: p.x, z: p.z - 3 }; }; // the camera looks along -z

  /** One file, from the drop or the buttons (or a hole, U12): check, hash, ask, upload, place (or fill the hole). */
  async function subir(original: File, destino: Destino): Promise<void> {
    const hueco = "hueco" in destino ? destino.hueco : null;
    const fichero = original.name, clase0 = CLASE[extensionDe(fichero)];
    if (!o.puede()) return no(fichero, "no puedes construir aquí");
    if (hueco && clase0 !== "imagen") return no(fichero, "en un hueco va una imagen .png, .jpg o .webp");
    if (hueco) decir(`Preparando «${fichero}» para el hueco…`, true);
    const file = hueco ? await prepararImagen(original) : original;
    const tipo = extensionDe(file.name), clase = CLASE[tipo];
    if (!clase) return no(fichero, "se colocan modelos .glb, imágenes .png .jpg .webp, vídeos .mp4 .webm y sonidos .mp3 .ogg");
    if ((clase === "video" || clase === "sonido") && !sePuedeReproducir(tipo)) return no(fichero, `este navegador no sabe reproducir .${tipo}; prueba con ${clase === "sonido" ? ".mp3" : ".mp4"}`);
    if (file.size > topeBytes(tipo)) return no(fichero, `pasa de ${TOPES_MB[tipo]} MB, el tope para .${tipo}`);
    const billete = o.billete();
    if (!billete) return no(fichero, "aún no sé quién eres; espera un segundo y vuelve a probar");
    decir(`Leyendo «${fichero}»…`, true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valido = comprobarFichero(tipo, bytes);
    if (!valido.ok) return no(fichero, motivo(valido.issues).replace(/\.$/, ""));
    const sha = await huella(bytes), url = `${o.origen}/a/${sha}.${tipo}`;
    decir(`Comprobando si «${fichero}» ya está en el servidor…`, true);
    const ya = await fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.status === 200, () => false);
    if (ya) cuenta.yaEstaban++;
    else {
      const r = await put(url, bytes, billete, fichero, TIPOS[tipo], (f) => decir(`Subiendo «${fichero}»… ${Math.round(f * 100)} %`, true));
      if (r.status !== 200 && r.status !== 201) return no(fichero, r.error.replace(/\.$/, "") || POR_ESTADO[r.status] || `el servidor dijo ${r.status}`);
      cuenta.subidas++;
    }
    const nombre = nombreDeFichero(fichero);
    const desde = o.session.features.stats.events;
    if (hueco) { // U12: the server measures the picture and fits it into the frame
      decir(`${ya ? "Ya estaba en el servidor. " : "Subida. "}Encajando «${nombre}» en el hueco…`, true);
      const s = o.session.features.send("objetos", "rellenar", { id: hueco, modelo: sha, ext: tipo, nombre });
      if (!s.ok) return no(fichero, s.why);
      const r = await respuesta(desde, "rellenar");
      if (!r.ok) return no(fichero, r.texto.replace(/\.$/, ""));
      cuenta.huecos++;
      return decir(`Colgada en el hueco: «${nombre}».`);
    }
    const sitio = ("donde" in destino ? destino.donde : null) ?? delante();
    const acota = (v: number) => Math.max(-2000, Math.min(2000, v));
    decir(`${ya ? "Ya estaba en el servidor: no hace falta subirlo. " : "Subido. "}Colocando ${QUE[clase]} «${nombre}»…`, true);
    const alto = clase === "imagen" || clase === "video" ? 1.2 : 0; // pictures and screens stand at eye height
    const s = o.session.features.send("objetos", "colocar", { modelo: sha, x: acota(sitio.x), y: alto, z: acota(sitio.z), ry: 0, nombre, decorado: false, tipo: clase, ext: tipo });
    if (!s.ok) return no(fichero, s.why);
    const r = await respuesta(desde);
    if (!r.ok) return no(fichero, r.texto.replace(/\.$/, ""));
    cuenta.colocadas++;
    decir(`${ya ? "Ya estaba en el servidor: no se volvió a subir. " : ""}Colocado: «${nombre}».`);
  }
  /** H4b: a sky picture or an HDR light for the environment panel. The same checks and the same /a/ door as a model (kind, cap,
   * the file reads, sha256, no second upload), but nothing is placed: resolves with «<sha256>.<ext>» for the panel to write
   * into the environment (the server still validates it). */
  async function subirFondo(file: File, campo: CampoFondo): Promise<{ ok: true; nombre: string } | { ok: false; why: string }> {
    const fichero = file.name, ac = fondoAceptable(campo, fichero);
    if (!ac.ok) return { ok: false, why: ac.why };
    const tipo = ac.ext;
    if (!o.puede()) return { ok: false, why: "no puedes construir aquí" };
    if (file.size > topeBytes(tipo)) return { ok: false, why: `pasa de ${TOPES_MB[tipo]} MB, el tope para .${tipo}` };
    const billete = o.billete();
    if (!billete) return { ok: false, why: "aún no sé quién eres; espera un segundo y vuelve a probar" };
    decir(`Leyendo «${fichero}»…`, true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valido = comprobarFichero(tipo, bytes);
    if (!valido.ok) { decir(""); return { ok: false, why: motivo(valido.issues).replace(/\.$/, "") }; }
    const sha = await huella(bytes), url = `${o.origen}/a/${sha}.${tipo}`;
    const ya = await fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.status === 200, () => false);
    if (!ya) {
      const r = await put(url, bytes, billete, fichero, TIPOS[tipo], (f) => decir(`Subiendo «${fichero}»… ${Math.round(f * 100)} %`, true));
      if (r.status !== 200 && r.status !== 201) { decir(""); return { ok: false, why: r.error.replace(/\.$/, "") || POR_ESTADO[r.status] || `el servidor dijo ${r.status}` }; }
      cuenta.subidas++;
    } else cuenta.yaEstaban++;
    decir(ya ? `«${fichero}» ya estaba en el servidor.` : `«${fichero}» subido.`);
    return { ok: true, nombre: `${sha}.${tipo}` };
  }
  let cola = Promise.resolve();
  const varios = (files: File[], donde: { x: number; z: number } | null) => {
    files.forEach((f, i) => { cola = cola.then(() => subir(f, { donde: donde && { x: donde.x + 1.5 * i, z: donde.z } })).catch((e) => no(f.name, String((e as Error)?.message ?? e))); });
    return cola;
  };
  /** U12: one picture into a hole (huecos.ts), after whatever is already going up. */
  const rellenar = (id: string, file: File) => {
    cola = cola.then(() => subir(file, { hueco: id })).catch((e) => no(file.name, String((e as Error)?.message ?? e)));
    return cola;
  };

  /** MIS-222: an image ALREADY on the server (its sha256 + extension) into a hole, with nothing to upload — the headset's way, where
   * there is no file picker (apps/plaza/obra-vr.ts). The server still checks the file is there, measures it and fits it. */
  const rellenarYa = (id: string, sha: string, ext: string, nombre: string): Promise<{ ok: boolean; texto: string }> => {
    const hecho = cola.then(async () => {
      if (!o.puede()) { decir("No puedes construir aquí."); return { ok: false, texto: "no puedes construir aquí" }; }
      decir(`Encajando «${nombre}» en el hueco…`, true);
      const desde = o.session.features.stats.events;
      const s = o.session.features.send("objetos", "rellenar", { id, modelo: sha, ext, nombre });
      if (!s.ok) { decir(`No se pudo: ${s.why}.`); return { ok: false, texto: s.why }; }
      const r = await respuesta(desde, "rellenar");
      if (!r.ok) { decir(`No se pudo poner «${nombre}»: ${r.texto.replace(/\.$/, "")}.`); return { ok: false, texto: r.texto }; }
      cuenta.huecos++; decir(`Colgada en el hueco: «${nombre}».`);
      return { ok: true, texto: "" };
    });
    cola = hecho.then(() => undefined, () => undefined);
    return hecho;
  };

  // ---- drag and drop over the whole page ----
  const conFicheros = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  let esconder: ReturnType<typeof setTimeout> | undefined;
  const capaVisible = (si: boolean) => capa.classList.toggle("activo", si);
  addEventListener("dragover", (e) => {
    if (!conFicheros(e)) return;
    e.preventDefault(); // a file dropped here must never open in place of the world
    if (!o.puede()) { e.dataTransfer!.dropEffect = "none"; return; }
    e.dataTransfer!.dropEffect = "copy";
    capaVisible(true);
    clearTimeout(esconder); esconder = setTimeout(() => capaVisible(false), 700); // dragover repeats (≤ 550 ms apart) while over the page
  });
  addEventListener("drop", (e) => {
    if (!conFicheros(e)) return;
    e.preventDefault();
    capaVisible(false);
    if (!o.puede()) return;
    void varios(Array.from(e.dataTransfer?.files ?? []), o.view.sueloBajo(e.clientX, e.clientY));
  });

  // ---- the same without a mouse: «Subir» in the builder's «Añadir» drawer (constructor.ts) opens this picker ----
  const entrada = document.createElement("input");
  entrada.type = "file"; entrada.accept = ACEPTA; entrada.multiple = true; entrada.hidden = true; entrada.id = "subir-fichero";
  entrada.addEventListener("change", () => { const fs = Array.from(entrada.files ?? []); entrada.value = ""; void varios(fs, null); });
  document.body.append(entrada);
  /** Open the file picker (call it inside a click or a key press: browsers refuse a picker otherwise). */
  const elegir = () => { if (o.puede()) entrada.click(); };
  return { cuenta, subir: varios, rellenar, rellenarYa, decir, elegir, subirFondo };
}
