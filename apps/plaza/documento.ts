// documento — the in-world document viewer (mundo-hermes M6). A flat overlay of plain HTML over the 3D canvas (the canvas keeps drawing behind it) with a black
// frame, a white «Cerrar» button and, below, an <iframe> on a page of the allowlist. Loaded by the card the first time «Abrir» is pressed (nothing of it is in the start bundle).
//   · the address is checked HERE as well as on the server (`direccionPermitida`: http/https only, no credentials, canonical form, origin in `documentos.origenes`,
//     never the world's own origin) — the page never trusts what the server stored
//   · sandbox="allow-scripts allow-same-origin": the docs viewer is a web app, so it needs scripts; and it needs «same-origin» to read its OWN files (fetch of its index,
//     localStorage for its theme). Without it the page gets an opaque origin and every request to its own server becomes a cross-origin one that fails. This is safe only
//     because the frame's origin is never ours (checked above): then the frame can run but cannot touch this page, its storage or its session. No forms, popups, top
//     navigation, downloads or modals are granted.   referrerpolicy="no-referrer", allow="" (no camera, microphone, geolocation, fullscreen…)
//   · if the page does not answer in 6 s (or the check that it is alive fails) the frame is not left blank: a Spanish message says how to start the viewer
//   · Esc closes (while focus is in the overlay), Tab cycles inside the overlay; keys never reach the world while it is open. A cross-origin frame keeps the keys
//     typed inside it: there the white «Cerrar» button is the way out (a page cannot listen to keys inside a foreign frame).
import { direccionPermitida } from "../../features/espejo/origenes.ts";
import { tx, ligar } from "../../packages/feature/src/idioma.ts";
import { pintarCerrar } from "./cerrar.ts";

export const ESPERA_MS = 6000;
export const COMANDO = "hermes palace docs";
const CSS = `
#visor-doc { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: #000; color: #fff; font: 14px/1.4 "DejaVu Sans Mono", "Courier New", monospace; }
#visor-doc[hidden] { display: none; }
#visor-doc header { flex: none; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 2px solid #fff; }
#visor-doc h2 { margin: 0; flex: 1 1 auto; min-width: 0; font-size: 15px; letter-spacing: .04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#visor-doc button { flex: none; min-height: 44px; padding: 2px 14px; background: #fff; color: #000; border: 2px solid #fff; border-radius: 0; font: bold 14px/1.2 "DejaVu Sans Mono", "Courier New", monospace; cursor: pointer; }
#visor-doc button:hover, #visor-doc button:focus-visible { background: #000; color: #fff; outline: 3px solid #fff; outline-offset: 2px; }
#visor-doc .cuerpo { position: relative; flex: 1 1 auto; min-height: 0; margin: 10px; border: 2px solid #fff; }
#visor-doc iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }
#visor-doc iframe[hidden] { display: none; }
#visor-doc .aviso { position: absolute; inset: 0; display: grid; place-content: center; gap: 12px; padding: 16px; text-align: center; }
#visor-doc .aviso[hidden] { display: none; }
#visor-doc .aviso p { margin: 0; overflow-wrap: anywhere; }
#visor-doc .aviso code { display: inline-block; padding: 6px 12px; border: 2px solid #fff; font-weight: bold; }
`;

export type Abierto = { cerrar(): void; estaAbierto(): boolean; marco: HTMLIFrameElement | null; aviso: HTMLElement; raiz: HTMLElement };
type Opciones = { url: string; titulo: string; origenes: readonly string[]; doc?: Document; espera?: number; /** the page's own origin; default: this window's */ propio?: string; alCerrar?: () => void };

/** Open the viewer on `url`. Returns null (and nothing is shown) when the address is not allowed — the card then says why. */
export function abrirVisor(o: Opciones): Abierto | { error: string } {
  const d = o.doc ?? document, w = d.defaultView!;
  const v = direccionPermitida(o.url, o.origenes, o.propio ?? w.location.origin);
  if (!v.ok) return { error: v.why };
  if (!d.getElementById("visor-doc-css")) { const s = d.createElement("style"); s.id = "visor-doc-css"; s.textContent = CSS; d.head.appendChild(s); }
  d.getElementById("visor-doc")?.remove();
  const raiz = d.createElement("div"); raiz.id = "visor-doc"; raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-modal", "true"); ligar(raiz, "aria-label", "Documentation", "Documentación");
  const cab = d.createElement("header"), tit = d.createElement("h2"), cerrarB = d.createElement("button");
  if (o.titulo) tit.textContent = o.titulo; else ligar(tit, "textContent", "Document", "Documento"); cerrarB.type = "button"; pintarCerrar(cerrarB); cerrarB.dataset.verbo = "cerrar-visor";
  cab.append(tit, cerrarB);
  const cuerpo = d.createElement("div"); cuerpo.className = "cuerpo";
  const aviso = d.createElement("div"); aviso.className = "aviso"; aviso.setAttribute("role", "status"); aviso.hidden = false;
  const msg = d.createElement("p"); ligar(msg, "textContent", "Opening the documentation…", "Abriendo la documentación…"); aviso.appendChild(msg);
  cuerpo.appendChild(aviso); raiz.append(cab, cuerpo);
  const antes = d.activeElement as HTMLElement | null;
  d.body.appendChild(raiz);
  let abierto = true, marco: HTMLIFrameElement | null = null, plazo = 0;

  const fallo = (): void => {
    if (!abierto) return;
    w.clearTimeout(plazo); marco?.remove(); marco = null; result.marco = null;
    aviso.hidden = false; aviso.dataset.estado = "fallo"; aviso.replaceChildren();
    const a = d.createElement("p"), b = d.createElement("p"), c = d.createElement("code"), e = d.createElement("p");
    a.textContent = tx("I could not open the documentation.", "No he podido abrir la documentación."); b.textContent = tx("Start the viewer with this command and press «Open» again:", "Arranque el visor con este comando y vuelva a pulsar «Abrir»:"); c.textContent = COMANDO; e.textContent = tx(`Address: ${v.url}`, `Dirección: ${v.url}`);
    aviso.append(a, b, c, e);
  };
  const cerrar = (): void => {
    if (!abierto) return;
    abierto = false; w.clearTimeout(plazo); d.removeEventListener("keydown", tecla, true); marco?.remove(); raiz.remove();
    try { antes?.focus?.(); } catch { /* the element is gone */ }
    o.alCerrar?.();
  };
  // keys: Esc closes, Tab cycles between «Cerrar» and the frame, everything else is kept from the world (WASD must not walk the avatar behind the overlay)
  const tecla = (ev: KeyboardEvent): void => {
    if (!abierto || !raiz.contains(ev.target as Node) && ev.target !== d.body && ev.target !== d.documentElement) return;
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); cerrar(); return; }
    if (ev.key === "Tab") {
      const foco = [cerrarB, ...(marco && !marco.hidden ? [marco] : [])], i = foco.indexOf(d.activeElement as never);
      ev.preventDefault(); ev.stopPropagation(); foco[(i + (ev.shiftKey ? foco.length - 1 : 1)) % foco.length]!.focus(); return;
    }
    ev.stopPropagation();
  };
  d.addEventListener("keydown", tecla, true);
  cerrarB.addEventListener("click", cerrar);
  const result: Abierto = { cerrar, estaAbierto: () => abierto, marco: null, aviso, raiz };
  cerrarB.focus();

  // 1) is anything answering there? A connection refused fails at once; 2) only then the frame, and it must load within the same time
  const espera = o.espera ?? ESPERA_MS;
  plazo = w.setTimeout(fallo, espera);
  const ctl = new AbortController(), parar = w.setTimeout(() => ctl.abort(), espera);
  fetch(v.url, { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal }).then(() => {
    w.clearTimeout(parar);
    if (!abierto) return;
    marco = d.createElement("iframe"); marco.title = o.titulo || tx("Documentation", "Documentación");
    marco.setAttribute("sandbox", "allow-scripts allow-same-origin"); marco.setAttribute("referrerpolicy", "no-referrer"); marco.setAttribute("allow", ""); marco.setAttribute("loading", "eager");
    marco.addEventListener("load", () => { if (!abierto) return; w.clearTimeout(plazo); aviso.hidden = true; aviso.dataset.estado = "listo"; });
    marco.src = v.url; result.marco = marco; cuerpo.appendChild(marco);
  }, () => { w.clearTimeout(parar); fallo(); });
  return result;
}
