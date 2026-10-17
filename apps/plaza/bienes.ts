// N10 on the page: the player sheet's «Inventario» (key I) shows the goods that are YOURS — each with where it came from,
// when, the licence of its art and «Recibo firmado ✓» once this page has checked the signature itself (WebCrypto,
// features/bienes/comprobar.ts) — a «Descargar recibo» button per good (a small JSON file: the proof travels with you)
// and «Comprobar un recibo» (a file from this world or another: real or not, and whether it is yours here). When a good
// arrives the «Ficha» button wears a small gold dot until you open the sheet. Plain accessible HTML; the server decides.
import { anunciar } from "./paneles.ts";

type Bien = { id: string; nombre: string; descripcion: string; licencia: string; mundo: string; mision: string; instante: string; recibo: string };
type Presentado = { ok: boolean; motivo: string };
type Bienes = {
  lista(): Bien[]; emisor(): string; nuevo(): string; visto(): void; presentado(): Presentado | null;
  comprobar(texto: string): Promise<Presentado>; ficheroRecibo(b: Bien): { nombre: string; texto: string }; alCambiar(fn: () => void): unknown;
};
type Comprobar = (token: string) => Promise<{ ok: true } | { ok: false; motivo: string }>;
type Ficha = { seccion(id: string, s: { titulo: string; orden: number; vivo?: boolean; pintar(caja: HTMLElement): void }): void; abierto(): boolean };

/** «18 oct 2026, 01:12» in the reader's language and time zone; the raw text when it is not a date. */
export function cuando(instante: string, idioma = "es"): string {
  const d = new Date(instante);
  return Number.isNaN(d.getTime()) ? instante : d.toLocaleString(idioma, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function montarBienes(o: { bienes: Bienes; comprobar: Comprobar; ficha: Ficha; boton: HTMLElement }) {
  const firmas = new Map<string, "comprobando" | "ok" | "mal" | "sin">();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, texto = "", clase = ""): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (texto) e.textContent = texto; if (clase) e.className = clase; return e; };
  const revisar = () => {
    for (const b of o.bienes.lista()) {
      if (firmas.has(b.recibo)) continue;
      firmas.set(b.recibo, "comprobando");
      o.comprobar(b.recibo).then((r) => { firmas.set(b.recibo, r.ok ? "ok" : /no sabe comprobar/.test(r.motivo) ? "sin" : "mal"); repintar(); }, () => { firmas.set(b.recibo, "mal"); repintar(); });
    }
  };
  let caja: HTMLElement | null = null;
  const repintar = () => { if (caja && o.ficha.abierto()) pintar(caja); };
  const descargar = (b: Bien) => {
    const f = o.bienes.ficheroRecibo(b), url = URL.createObjectURL(new Blob([f.texto], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = f.nombre; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    anunciar(`Recibo de «${b.nombre}» descargado: ${f.nombre}`);
  };

  function pintar(c: HTMLElement): void {
    caja = c;
    const recien = !!o.bienes.nuevo();
    o.bienes.visto(); o.boton.removeAttribute("data-novedad");
    if (recien) requestAnimationFrame(() => c.closest("section")?.scrollIntoView({ block: "start" })); // a new good: open the sheet on it
    revisar();
    const l = o.bienes.lista(), p = o.bienes.presentado();
    const firma = JSON.stringify([l.map((b) => [b.id, firmas.get(b.recibo)]), p?.motivo ?? ""]);
    if (c.dataset.firma === firma) return;
    c.dataset.firma = firma;
    const partes: HTMLElement[] = [];
    if (!l.length) partes.push(el("p", o.bienes.emisor() ? "Aún no tienes objetos. Algunos cofres, al final de una aventura, guardan uno que será tuyo." : "Este mundo no firma recibos de propiedad (no tiene MOTOR_SECRET), así que aquí sus cofres no dan objetos tuyos."));
    else {
      const ul = el("ul", "", "bienes");
      for (const b of l) {
        const li = el("li", "", "bien"); li.dataset.bien = b.id;
        const f = firmas.get(b.recibo);
        li.append(el("strong", b.nombre, "nombre"));
        if (b.descripcion) li.append(el("span", b.descripcion, "descripcion"));
        li.append(el("span", `De ${b.mundo} · misión «${b.mision}» · ${cuando(b.instante)}`, "origen"));
        li.append(el("span", `Licencia de su arte: ${b.licencia || "sin indicar"} (tener el objeto no da los derechos de su obra)`, "licencia"));
        li.append(el("span", f === "ok" ? "Recibo firmado ✓ (comprobado en esta página)" : f === "mal" ? "⚠ El recibo no cuadra: avisa a quien cuida el mundo" : f === "sin" ? "Recibo firmado (este navegador no sabe comprobar la firma; descárgalo y compruébalo fuera)" : "Comprobando el recibo…", `firma ${f ?? "comprobando"}`));
        const bt = el("button", "Descargar recibo"); bt.type = "button"; bt.setAttribute("aria-label", `Descargar el recibo de ${b.nombre}`);
        bt.addEventListener("click", () => descargar(b));
        li.append(bt); ul.append(li);
      }
      partes.push(ul);
    }
    const traer = el("div", "", "traer");
    const lab = el("label", "Comprobar un recibo (de este mundo o de otro): ");
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json,text/plain";
    input.addEventListener("change", async () => {
      const f = input.files?.[0]; if (!f) return;
      const r = await o.bienes.comprobar(await f.text());
      anunciar(r.motivo); input.value = "";
    });
    lab.append(input); traer.append(lab);
    if (p) traer.append(el("p", p.motivo, p.ok ? "veredicto ok" : "veredicto mal"));
    partes.push(traer);
    c.replaceChildren(...partes);
  }

  o.ficha.seccion("inventario", { titulo: "Inventario", orden: 70, vivo: true, pintar });
  o.bienes.alCambiar(() => { if (o.bienes.nuevo() && !o.ficha.abierto()) o.boton.setAttribute("data-novedad", "1"); repintar(); });
  return { pintar };
}
