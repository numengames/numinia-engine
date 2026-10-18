// N10 on the page: the player sheet's «Inventario» (key I) shows the goods that are YOURS — each with where it came from,
// when, the licence of its art and «Recibo firmado ✓» once this page has checked the signature itself (WebCrypto,
// features/bienes/comprobar.ts) — a «Descargar recibo» button per good (a small JSON file: the proof travels with you)
// and «Comprobar un recibo» (a file from this world or another: real or not, and whether it is yours here). When a good
// arrives the «Ficha» button wears a small gold dot until you open the sheet. Plain accessible HTML; the server decides.
// N18: «Ver en 3D» opens the good's model turning in the sheet (drag or arrow keys to turn it; render's vitrina), «En la
// mano» / «Sobre la cabeza» wear it (everyone near sees it), «Quitártelo» takes it off; «Traer un recibo de otro mundo»
// checks the file here and asks the server: when this world trusts its signer it becomes yours (marked «De otro mundo»),
// else it is listed under «De otro mundo · no es tuyo aquí» (kept in this browser, «Olvidar» drops it).
import { anunciar } from "./paneles.ts";

type Bien = { id: string; nombre: string; descripcion: string; licencia: string; mundo: string; mision: string; instante: string; recibo: string; modelo: string; ajeno: boolean; verse: boolean };
type Donde = "mano" | "cabeza";
type Presentado = { ok: boolean; motivo: string; dado?: boolean };
type Otro = { recibo: string; nombre: string; descripcion: string; licencia: string; mundo: string; instante: string };
type Bienes = {
  lista(): Bien[]; emisor(): string; nuevo(): string; visto(): void; presentado(): Presentado | null;
  comprobar(texto: string): Promise<Presentado>; ficheroRecibo(b: Bien): { nombre: string; texto: string }; alCambiar(fn: () => void): unknown;
  llevar(id: string, donde: Donde): { ok: boolean }; quitar(): { ok: boolean }; puesto(): { modelo: string; donde: Donde; nombre: string } | null;
  traer(texto: string): Promise<Presentado>; otros(): Otro[]; olvidar(recibo: string): void;
};
type Vista3D = (canvas: HTMLCanvasElement, model: string) => { cerrar(): void };
type Comprobar = (token: string) => Promise<{ ok: true } | { ok: false; motivo: string }>;
type Ficha = { seccion(id: string, s: { titulo: string; orden: number; vivo?: boolean; pintar(caja: HTMLElement): void }): void; abierto(): boolean };

/** «18 oct 2026, 01:12» in the reader's language and time zone; the raw text when it is not a date. */
export function cuando(instante: string, idioma = "es"): string {
  const d = new Date(instante);
  return Number.isNaN(d.getTime()) ? instante : d.toLocaleString(idioma, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function montarBienes(o: { bienes: Bienes; comprobar: Comprobar; ficha: Ficha; boton: HTMLElement; vitrina?: Vista3D }) {
  let viendo = "", vitrina: { cerrar(): void } | null = null; // N18: the good whose model turns in the sheet
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
    const l = o.bienes.lista(), p = o.bienes.presentado(), puesto = o.bienes.puesto(), otros = o.bienes.otros();
    const firma = JSON.stringify([l.map((b) => [b.id, firmas.get(b.recibo), b.verse]), p?.motivo ?? "", puesto, otros.map((x) => x.recibo.slice(-12)), viendo]);
    if (c.dataset.firma === firma) return;
    c.dataset.firma = firma;
    vitrina?.cerrar(); vitrina = null;
    const boton = (texto: string, etiqueta: string, fn: () => void, clase = "") => { const bt = el("button", texto, clase); bt.type = "button"; bt.setAttribute("aria-label", etiqueta); bt.addEventListener("click", fn); return bt; };
    const partes: HTMLElement[] = [];
    if (!l.length) partes.push(el("p", o.bienes.emisor() ? "Aún no tienes objetos. Algunos cofres, al final de una aventura, guardan uno que será tuyo." : "Este mundo no firma recibos de propiedad (no tiene MOTOR_SECRET), así que aquí sus cofres no dan objetos tuyos."));
    else {
      const ul = el("ul", "", "bienes");
      for (const b of l) {
        const li = el("li", "", b.ajeno ? "bien ajeno" : "bien"); li.dataset.bien = b.id;
        const f = firmas.get(b.recibo);
        li.append(el("strong", b.nombre, "nombre"));
        if (b.ajeno) li.append(el("span", "De otro mundo", "sello"));
        if (b.descripcion) li.append(el("span", b.descripcion, "descripcion"));
        li.append(el("span", `De ${b.mundo} · misión «${b.mision}» · ${cuando(b.instante)}`, "origen"));
        li.append(el("span", `Licencia de su arte: ${b.licencia || "sin indicar"} (tener el objeto no da los derechos de su obra)`, "licencia"));
        li.append(el("span", f === "ok" ? (b.ajeno ? "Recibo firmado por su mundo ✓ (comprobado en esta página)" : "Recibo firmado ✓ (comprobado en esta página)") : f === "mal" ? "⚠ El recibo no cuadra: avisa a quien cuida el mundo" : f === "sin" ? "Recibo firmado (este navegador no sabe comprobar la firma; descárgalo y compruébalo fuera)" : "Comprobando el recibo…", `firma ${f ?? "comprobando"}`));
        const acciones = el("div", "", "acciones");
        if (b.verse) {
          const lleva = puesto && puesto.modelo === b.modelo ? puesto.donde : "";
          if (lleva) li.append(el("span", lleva === "mano" ? "Lo llevas en la mano" : "Lo llevas sobre la cabeza", "puesto"));
          if (o.vitrina) acciones.append(boton(viendo === b.id ? "Cerrar 3D" : "Ver en 3D", `${viendo === b.id ? "Cerrar" : "Ver"} ${b.nombre} en 3D`, () => { viendo = viendo === b.id ? "" : b.id; repintar(); }));
          if (lleva !== "mano") acciones.append(boton("En la mano", `Llevar ${b.nombre} en la mano`, () => { o.bienes.llevar(b.id, "mano"); anunciar(`Llevas «${b.nombre}» en la mano.`); }));
          if (lleva !== "cabeza") acciones.append(boton("Sobre la cabeza", `Llevar ${b.nombre} sobre la cabeza`, () => { o.bienes.llevar(b.id, "cabeza"); anunciar(`Llevas «${b.nombre}» sobre la cabeza.`); }));
          if (lleva) acciones.append(boton("Quitártelo", `Quitarte ${b.nombre}`, () => { o.bienes.quitar(); anunciar(`Te quitas «${b.nombre}».`); }));
        } else if (b.modelo) li.append(el("span", "Su modelo 3D no está en este mundo: aquí no se puede ver ni llevar puesto.", "sin-modelo"));
        acciones.append(boton("Descargar recibo", `Descargar el recibo de ${b.nombre}`, () => descargar(b)));
        li.append(acciones);
        if (viendo === b.id && o.vitrina && b.verse) {
          const cv = el("canvas", "", "vitrina"); cv.tabIndex = 0; cv.width = 480; cv.height = 300;
          cv.setAttribute("role", "img"); cv.setAttribute("aria-label", `${b.nombre} en 3D. Arrastra o usa las flechas para girarlo.`);
          li.append(cv);
          requestAnimationFrame(() => { if (cv.isConnected && viendo === b.id) vitrina = o.vitrina!(cv, b.modelo); });
        }
        ul.append(li);
      }
      partes.push(ul);
    }
    if (otros.length) {
      partes.push(el("h4", "De otro mundo · no es tuyo aquí", "otros-titulo"));
      partes.push(el("p", "Recibos auténticos que trajiste de otros mundos. Este mundo no confía en quien los firmó, así que aquí solo se ven: siguen siendo tuyos allí.", "nota"));
      const ul = el("ul", "", "bienes otros");
      for (const x of otros) {
        const li = el("li", "", "bien ajeno visto");
        li.append(el("strong", x.nombre, "nombre"), el("span", "De otro mundo", "sello"));
        if (x.descripcion) li.append(el("span", x.descripcion, "descripcion"));
        li.append(el("span", `Firmado por ${x.mundo} · ${cuando(x.instante)}`, "origen"));
        li.append(boton("Olvidar", `Olvidar el recibo de ${x.nombre} en este navegador`, () => o.bienes.olvidar(x.recibo)));
        ul.append(li);
      }
      partes.push(ul);
    }
    const traer = el("div", "", "traer");
    const lab = el("label", "Traer un recibo de otro mundo (o comprobar uno de este): ");
    const input = el("input"); input.type = "file"; input.accept = ".json,application/json,text/plain"; input.name = "traer-recibo";
    input.addEventListener("change", async () => {
      const f = input.files?.[0]; if (!f) return;
      const r = await o.bienes.traer(await f.text());
      anunciar(r.motivo); input.value = ""; repintar();
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
