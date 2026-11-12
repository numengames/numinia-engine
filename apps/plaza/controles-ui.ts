// Keymap v1: Settings → Controls, two columns. One row per action: Action | Default (fixed, from the table of teclas.ts) |
// Yours (empty = uses the Default; click it, press a key). A key somebody else has says who and asks swap or cancel;
// «Reset all» empties the Yours column. Saved by teclas.ts in this browser. Everything is drawn with textContent.
import { OTROS_MODOS, nombreTecla, claveDeEvento, type Teclas } from "./teclas.ts";

const SOLO_MODIFICADOR = /^(Control|Alt|Meta|OS)(Left|Right)$/;

export function tablaControles(t: Teclas, o: { alCambiar?: () => void } = {}): HTMLElement {
  const raiz = document.createElement("div"); raiz.className = "controles-tabla";
  const aviso = document.createElement("p"); aviso.className = "controles-aviso"; aviso.setAttribute("role", "status"); aviso.setAttribute("aria-live", "polite");
  const tabla = document.createElement("table");
  const cap = document.createElement("caption"); cap.textContent = "Keys of the world: every key does one thing, in every world";
  const cab = tabla.createTHead().insertRow();
  for (const [txt, cls] of [["Action", "accion"], ["Default", "defecto"], ["Yours", "suya"]] as const) { const th = document.createElement("th"); th.scope = "col"; th.className = cls; th.textContent = txt; cab.append(th); }
  tabla.prepend(cap);
  const cuerpo = tabla.createTBody();
  let capturando: { id: string; fin: () => void } | null = null;

  const decir = (m: string, acciones: Array<[string, () => void]> = []): void => {
    aviso.replaceChildren(document.createTextNode(m));
    for (const [txt, f] of acciones) { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.addEventListener("click", () => { f(); }); aviso.append(" ", b); }
  };
  const pintar = (): void => {
    cuerpo.replaceChildren();
    let grupo = "";
    for (const a of t.acciones) {
      if (a.grupo !== grupo) {
        grupo = a.grupo;
        const g = cuerpo.insertRow(); g.className = "grupo"; const th = document.createElement("th"); th.colSpan = 3; th.scope = "colgroup"; th.textContent = grupo; g.append(th);
      }
      const r = cuerpo.insertRow(); r.dataset.accion = a.id;
      const c1 = r.insertCell(); c1.className = "accion"; c1.textContent = a.nombre;
      const c2 = r.insertCell(); c2.className = "defecto";
      const defecto = [...a.defecto, ...(a.extra ?? []).filter((x) => !/^Numpad|^Shift/.test(x))];
      if (defecto.length) for (const k of defecto) { const kbd = document.createElement("kbd"); kbd.textContent = nombreTecla(k); c2.append(kbd, " "); } else c2.textContent = "none";
      const c3 = r.insertCell(); c3.className = "suya";
      if (a.fija) { c3.textContent = "fixed"; c3.classList.add("fija"); continue; }
      const b = document.createElement("button"); b.type = "button"; b.className = "suya-boton";
      const suya = t.suya(a.id);
      b.textContent = suya ? nombreTecla(suya) : "—";
      b.setAttribute("aria-label", `${a.nombre}: ${suya ? `yours is ${nombreTecla(suya)}` : "uses the default"}. Press to choose a key`);
      b.addEventListener("click", () => empezar(a.id, b));
      c3.append(b);
      if (suya) { const x = document.createElement("button"); x.type = "button"; x.className = "suya-borrar"; x.textContent = "×"; x.title = "Use the default again"; x.setAttribute("aria-label", `${a.nombre}: use the default again`); x.addEventListener("click", () => { t.limpiar(a.id); decir(`${a.nombre}: back to ${t.etiqueta(a.id) || "no key"}.`); }); c3.append(" ", x); }
    }
  };
  function empezar(id: string, b: HTMLButtonElement): void {
    capturando?.fin();
    const a = t.accion(id)!;
    b.textContent = "Press a key…"; b.classList.add("escuchando");
    decir(`${a.nombre}: press the key you want (Esc cancels).`);
    const alTeclear = (e: KeyboardEvent): void => {
      if (SOLO_MODIFICADOR.test(e.code)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === "Escape") { fin(); pintar(); decir("Cancelled."); return; }
      const clave = claveDeEvento(e);
      fin();
      const r = t.asignar(id, clave);
      if (r.ok) { decir(`${a.nombre}: ${nombreTecla(clave)}.`); return; }
      if (r.conflicto) {
        const otro = t.accion(r.conflicto)!;
        pintar();
        decir(`${nombreTecla(clave)} already does «${otro.nombre}».`, [
          ["Swap", () => { const s = t.intercambiar(id, clave); decir(s.ok ? `Swapped: ${a.nombre} is ${nombreTecla(clave)}, «${otro.nombre}» is ${t.etiqueta(otro.id)}.` : s.why); }],
          ["Cancel", () => decir("Cancelled.")],
        ]);
        return;
      }
      pintar(); decir(r.why);
    };
    const fin = (): void => { removeEventListener("keydown", alTeclear, true); capturando = null; };
    addEventListener("keydown", alTeclear, true);
    capturando = { id, fin: () => { fin(); pintar(); } };
  }

  const restablecer = document.createElement("button"); restablecer.type = "button"; restablecer.className = "controles-reset"; restablecer.textContent = "Reset all";
  restablecer.title = "Empties the Yours column; the Default never changes";
  restablecer.addEventListener("click", () => { capturando?.fin(); t.restablecer(); decir("All keys are back to the default."); });
  const otros = document.createElement("div"); otros.className = "controles-otros";
  const h = document.createElement("p"); h.textContent = "While these are open they keep their own keys:";
  const ul = document.createElement("ul");
  for (const m of OTROS_MODOS) { const li = document.createElement("li"), b = document.createElement("b"); b.textContent = `${m.modo}: `; li.append(b, m.teclas); ul.append(li); }
  otros.append(h, ul);
  t.alCambiar(() => { pintar(); o.alCambiar?.(); });
  pintar();
  raiz.append(restablecer, aviso, tabla, otros);
  return raiz;
}
