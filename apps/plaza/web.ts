// N17: the page's half of the web screens. It hands the server's screens to the view (packages/render/src/web.ts),
// deciding per screen whether this page may frame the site (features/web dejaEnmarcar, with this page's own origin),
// and gives VR its way out: «Abrir fuera de VR» on a screen leaves VR and shows a card with the link (a real tap on a
// real link: no popup blocker, no new window from inside the headset's session — nothing to trust there).
import type { Pantalla } from "../../features/web/client.ts";
import { dejaEnmarcar } from "../../features/web/feature.ts";
import type { PantallaVista } from "../../packages/render/src/web.ts";

type Ctl = { pantallas(): Pantalla[]; alCambiar(f: (q: string) => void): unknown };
type Vista = { web: { poner(p: PantallaVista): void; quitar(id: string): void; ids(): string[]; alAbrirFuera(f: (p: PantallaVista) => void): unknown }; vr: { active?: boolean; exit(): Promise<void> } };

export function montarWeb(o: { web: Ctl; view: Vista; padre?: HTMLElement }) {
  const sincronizar = () => {
    const ahora = o.web.pantallas(), ids = new Set(ahora.map((p) => p.id));
    for (const id of o.view.web.ids()) if (!ids.has(id)) o.view.web.quitar(id);
    for (const p of ahora) o.view.web.poner({ id: p.id, url: p.url, titulo: p.titulo, texto: p.texto, x: p.x, y: p.y, z: p.z, ry: p.ry, ancho: p.ancho, alto: p.alto, enmarcar: dejaEnmarcar(p.marco, location.origin) });
  };
  o.web.alCambiar((q) => { if (q === "pantallas") sincronizar(); });
  sincronizar();

  // the card shown after leaving VR: the screen's title, its site and one link (opens in a tab of its own)
  const tarjeta = document.createElement("div");
  tarjeta.id = "web-fuera"; tarjeta.hidden = true;
  tarjeta.setAttribute("role", "dialog"); tarjeta.setAttribute("aria-label", "Abrir la página fuera del mundo");
  Object.assign(tarjeta.style, { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: "30", maxWidth: "min(92vw, 520px)", padding: "18px 20px", borderRadius: "12px", background: "rgba(20,28,38,.96)", color: "#eef2f6", border: "2px solid #ffd27a", font: "16px system-ui, sans-serif", textAlign: "center" });
  const titulo = document.createElement("h2"); Object.assign(titulo.style, { margin: "0 0 4px", color: "#ffd27a", fontSize: "20px" });
  const sitio = document.createElement("p"); Object.assign(sitio.style, { margin: "0 0 14px", color: "#9fd8d0" });
  const enlace = document.createElement("a"); enlace.id = "web-fuera-abrir"; enlace.target = "_blank"; enlace.rel = "noopener noreferrer";
  Object.assign(enlace.style, { display: "inline-block", padding: "12px 22px", borderRadius: "10px", background: "#ffd27a", color: "#141c26", fontWeight: "bold", textDecoration: "none", fontSize: "18px" });
  const cerrar = document.createElement("button"); cerrar.type = "button"; cerrar.textContent = "Volver al mundo";
  Object.assign(cerrar.style, { display: "block", margin: "14px auto 0", padding: "8px 14px", borderRadius: "8px", border: "1px solid #9fd8d0", background: "transparent", color: "#eef2f6", font: "inherit", cursor: "pointer" });
  cerrar.addEventListener("click", () => { tarjeta.hidden = true; });
  enlace.addEventListener("click", () => { setTimeout(() => { tarjeta.hidden = true; }, 0); });
  tarjeta.append(titulo, sitio, enlace, cerrar);
  (o.padre ?? document.body).append(tarjeta);
  const mostrar = (p: PantallaVista) => {
    let host = p.url;
    try { host = new URL(p.url).host; } catch { /* keep the text */ }
    titulo.textContent = p.titulo; sitio.textContent = host;
    enlace.href = p.url; enlace.textContent = `Abrir ${host} ↗`;
    tarjeta.hidden = false;
    enlace.focus();
  };
  o.view.web.alAbrirFuera((p) => { void o.view.vr.exit().catch(() => {}).finally(() => mostrar(p)); });
  return { mostrar, abierta: () => !tarjeta.hidden, sincronizar };
}
