// frases (Y29) — the page part: a button in the top bar, a key (the action «Phrases») and a dialog with the closed list,
// grouped, as real buttons (≥ 44 px, text always visible, same order every time). Picking one asks features/frases:
// the server checks it and tells whoever is within 20 m, in their own language. Focus goes to the first phrase and
// comes back on close (crearDialogo). Lazy: the dialog is built when first needed. In VR the HTML is not drawn: the
// bubble over the speaker and the `frase` verb (chat order, agents) are.
import { crearDialogo, anunciar } from "./paneles.ts";
import { idiomaDe, LISTA } from "../../features/frases/frases.ts";
import type { Frase } from "../../features/frases/pagina.ts";
import { gancho } from "../../features/frases/client.ts";

await import("./frases-estilo.ts").catch(() => null); // the panel's look (CSS) is in before this module is; under node (the tests) there is no CSS and it does not matter

type Res = { ok: true } | { ok: false; why: string };
type Pagina = {
  lista(): Frase[]; decir(id: string): Res;
  repintar(): void;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...hijos: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props); e.append(...hijos); return e;
};

export function montarFrases(frases: Pagina, o: { barra?: HTMLElement | null; idioma?: () => string } = {}): { abrir(): void; cerrar(): void; abierto(): boolean } {
  const idioma = o.idioma ?? (() => document.documentElement.lang);
  const boton = el("button", { type: "button", id: "frases-abrir", textContent: "Phrases" });
  boton.title = "Say a fixed phrase: hello, thank you, help, follow me…";
  (o.barra ?? document.getElementById("barra-arriba") ?? document.body).appendChild(boton);
  const panel = crearDialogo({ id: "frases", titulo: "Phrases", tecla: "Backquote", accion: "frases", boton, alAbrir: () => { pintar(); primera()?.focus({ preventScroll: true }); } });
  const estado = el("p", { className: "estado" });
  estado.setAttribute("role", "status");
  const cuerpo = el("div", { className: "frases-lista" });
  panel.cuerpo.append(cuerpo, estado);

  const primera = () => cuerpo.querySelector<HTMLButtonElement>("button");
  function pintar(): void {
    const l = idiomaDe(idioma());
    const lista = frases.lista();
    cuerpo.replaceChildren(...LISTA.grupos.filter((g) => lista.some((f) => f.grupo === g.id)).map((g) => {
      const caja = el("div", { className: "frases-grupo" });
      caja.setAttribute("role", "group"); caja.setAttribute("aria-label", g[l]);
      caja.append(el("h3", { textContent: g[l] }), ...lista.filter((f) => f.grupo === g.id).map((f) => {
        const b = el("button", { type: "button", textContent: f[l] }); b.dataset.id = f.id;
        b.addEventListener("click", () => {
          const r = frases.decir(f.id);
          if (r.ok) panel.cerrar(); else { estado.textContent = r.why; anunciar(r.why); }
        });
        return b;
      }));
      return caja;
    }));
    estado.textContent = "";
  }
  gancho.abrir = () => panel.alternar();
  // the language changed (the page sets <html lang>): redraw the list and the bubbles still on screen, resend nothing
  new MutationObserver(() => { frases.repintar(); if (panel.abierto) pintar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return { abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), abierto: () => panel.abierto };
}
