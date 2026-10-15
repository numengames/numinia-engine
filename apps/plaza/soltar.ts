// soltar (H9): drop your own .glb on the page and it appears where you dropped it, for everyone, and stays. Only for
// whoever may build (the server says so on entering: objetos.permiso); visitors never see the overlay nor the button.
// The same path without a mouse: «Subir modelo…», a real button in the builder panel, puts it 3 m in front of you.
// Steps: check the file here (kind, cap, a GLB that reads: packages/net/src/ficheros.ts, the same check as the server)
// → its sha256 → HEAD /a/<sha256>.glb (already there? no upload) → PUT with the guest token (I1) and visible progress
// → colocar (features/objetos) named after the file, so screen readers and agents hear it. Every step is said in a
// role=status line; a refusal says why in Spanish. main.ts mounts it with one line; it touches no shared file.
import { comprobarFichero, motivo, sha256Hex, topeBytes, TOPES_MB } from "../../packages/net/src/ficheros.ts";

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
  panel: HTMLElement | null; // the builder panel: the «Subir modelo…» button goes at its end
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
  capa.innerHTML = "<span>Suelta para subir tu modelo</span>";
  const linea = document.createElement("p"); linea.id = "subida-estado"; linea.setAttribute("role", "status"); linea.setAttribute("aria-live", "polite");
  document.body.append(capa, linea);
  const cuenta = { subidas: 0, yaEstaban: 0, colocadas: 0, rechazadas: 0 };
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
  const put = (url: string, b: Uint8Array, billete: string, fichero: string, avance: (f: number) => void) =>
    new Promise<{ status: number; error: string }>((ok) => {
      const x = new XMLHttpRequest(); // fetch() has no upload progress
      x.open("PUT", url);
      x.setRequestHeader("authorization", `Bearer ${billete}`);
      x.setRequestHeader("content-type", "model/gltf-binary");
      x.setRequestHeader("x-nombre-fichero", encodeURIComponent(fichero));
      x.upload.onprogress = (e) => { if (e.lengthComputable) avance(e.loaded / e.total); };
      x.onload = () => { let error = ""; try { error = String(JSON.parse(x.responseText).error ?? ""); } catch { /* not JSON */ } ok({ status: x.status, error }); };
      x.onerror = () => ok({ status: 0, error: "" });
      x.send(b);
    });
  /** Wait for the server's answer to colocar: objetos.hecho (with the new id) or objetos.rechazado (with why). */
  const respuesta = (desde: number) => new Promise<{ ok: boolean; texto: string }>((ok) => {
    const t0 = performance.now();
    const mirar = () => {
      const f = o.session.features, nuevos = f.stats.events - desde;
      const e = nuevos > 0 ? f.log.slice(-Math.min(nuevos, f.log.length)).find((x) => x.feature === "objetos" && (x.event === "rechazado" || (x.event === "hecho" && x.msg.accion === "colocar"))) : undefined;
      if (e) return ok({ ok: e.event === "hecho", texto: String(e.msg.motivo ?? e.msg.id ?? "") });
      if (performance.now() - t0 > 8000) return ok({ ok: false, texto: "el servidor no contestó" });
      setTimeout(mirar, 100);
    };
    mirar();
  });
  const delante = () => { const p = o.session.selfPosition(0); return { x: p.x, z: p.z - 3 }; }; // the camera looks along -z

  /** One file, from the drop or the button: check, hash, ask, upload, place. */
  async function subir(file: File, donde: { x: number; z: number } | null): Promise<void> {
    const fichero = file.name, tipo = fichero.split(".").pop()?.toLowerCase() ?? "";
    if (!o.puede()) return no(fichero, "no puedes construir aquí");
    if (tipo !== "glb") return no(fichero, "por ahora solo se colocan modelos .glb");
    if (file.size > topeBytes("glb")) return no(fichero, `pasa de ${TOPES_MB.glb} MB, el tope para .glb`);
    const billete = o.billete();
    if (!billete) return no(fichero, "aún no sé quién eres; espera un segundo y vuelve a probar");
    decir(`Leyendo «${fichero}»…`, true);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valido = comprobarFichero("glb", bytes);
    if (!valido.ok) return no(fichero, motivo(valido.issues).replace(/\.$/, ""));
    const sha = await huella(bytes), url = `${o.origen}/a/${sha}.glb`;
    decir(`Comprobando si «${fichero}» ya está en el servidor…`, true);
    const ya = await fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.status === 200, () => false);
    if (ya) cuenta.yaEstaban++;
    else {
      const r = await put(url, bytes, billete, fichero, (f) => decir(`Subiendo «${fichero}»… ${Math.round(f * 100)} %`, true));
      if (r.status !== 200 && r.status !== 201) return no(fichero, r.error.replace(/\.$/, "") || POR_ESTADO[r.status] || `el servidor dijo ${r.status}`);
      cuenta.subidas++;
    }
    const sitio = donde ?? delante(), nombre = nombreDeFichero(fichero);
    const acota = (v: number) => Math.max(-2000, Math.min(2000, v));
    decir(`${ya ? "Ya estaba en el servidor: no hace falta subirlo. " : "Subido. "}Colocando «${nombre}»…`, true);
    const desde = o.session.features.stats.events;
    const s = o.session.features.send("objetos", "colocar", { modelo: sha, x: acota(sitio.x), y: 0, z: acota(sitio.z), ry: 0, nombre, decorado: false });
    if (!s.ok) return no(fichero, s.why);
    const r = await respuesta(desde);
    if (!r.ok) return no(fichero, r.texto.replace(/\.$/, ""));
    cuenta.colocadas++;
    decir(`${ya ? "Ya estaba en el servidor: no se volvió a subir. " : ""}Colocado: «${nombre}».`);
  }
  let cola = Promise.resolve();
  const varios = (files: File[], donde: { x: number; z: number } | null) => {
    files.forEach((f, i) => { cola = cola.then(() => subir(f, donde && { x: donde.x + 1.5 * i, z: donde.z })).catch((e) => no(f.name, String((e as Error)?.message ?? e))); });
    return cola;
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

  // ---- the same without a mouse: a real button in the builder panel ----
  const fila = document.createElement("div"); fila.className = "fila";
  const entrada = document.createElement("input");
  entrada.type = "file"; entrada.accept = ".glb,model/gltf-binary"; entrada.multiple = true; entrada.hidden = true; entrada.id = "subir-fichero";
  const boton = document.createElement("button");
  boton.type = "button"; boton.id = "subir-modelo"; boton.textContent = "Subir modelo…";
  boton.title = `Un .glb tuyo (hasta ${TOPES_MB.glb} MB): se coloca a 3 m delante de ti. También puedes soltarlo sobre el mundo.`;
  boton.addEventListener("click", () => entrada.click());
  entrada.addEventListener("change", () => { const fs = Array.from(entrada.files ?? []); entrada.value = ""; void varios(fs, null); });
  fila.append(boton, entrada);
  o.panel?.append(fila);
  const mirarPermiso = () => { fila.style.display = o.puede() ? "" : "none"; }; // not `hidden`: the panel's .fila is display:flex
  mirarPermiso(); setInterval(mirarPermiso, 500);
  return { cuenta, subir: varios };
}
