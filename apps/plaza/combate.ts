// combate on the page (level 2): what the character HUD and the three skill slots read from the lucha client.
//   · fuentesDeLucha — the `estado` / `carga` hooks hud-personaje.ts reads (and the sheet's Estado). They exist only once the page has
//     heard of fighting in this world; before that they say nothing and the HUD keeps its «Próximamente».
//   · montarCombate — the three slots of #habilidades (below the Objetivo frame): the abilities of the Eclipse Mnémico kit, keys 1–3
//     and click. They only ASK (lucha.habilidad → intent `habilidad`); the server decides reach, cooldown, cost and damage. No fighting
//     in the world = the same three «Próximamente» slots as before.
import { escribiendo } from "./escribiendo.ts";
import { icono } from "./iconos.ts";
import * as capas from "./capas.ts";
import { ECLIPSE, HABILIDADES, CARGA_MAX, vistaCarga } from "../../features/lucha/habilidades.ts";

type Res = { ok: true } | { ok: false; why: string };
export type Lucha = {
  activo(): boolean; carga(): number; estado(): string | undefined;
  habilidad(cual: string, objetivo?: string): Res; alCambiar(fn: () => void): () => void; alRechazar(fn: (motivo: string) => void): () => void;
};

/** The sources hud-personaje.ts plugs into `__numinia`. `actual` is absent (not undefined-returning) until there is fighting, because
 * the HUD reads «no `actual`» as «this page does not receive it» (Próximamente) and «`actual()` says nothing» as «Estable». */
export function fuentesDeLucha(lucha: Pick<Lucha, "activo" | "carga" | "estado">) {
  return {
    estado: { get actual() { return lucha.activo() ? () => lucha.estado() : undefined; } },
    carga: { get actual() { return lucha.activo() ? () => ({ valor: lucha.carga(), max: CARGA_MAX }) : undefined; } },
  };
}

export type Casilla = { clave: string; tecla: number; nombre: string; icono: string; coste: number; genera: number; lista: boolean; etiqueta: string };
const ICONOS: Record<string, string> = { "corte-breve": "sword", "incision-semantica": "target", "discontinuidad": "sparkle" };
/** The three slots for a given Carga (pure; tests read it). `lista` = affordable now; the server still has the last word. */
export function casillas(carga: number): Casilla[] {
  const v = vistaCarga(carga);
  return HABILIDADES.map((clave, i) => {
    const h = ECLIPSE[clave], lista = v.listas[clave];
    const efecto = h.coste ? `cuesta ${h.coste} de Carga` : `da ${h.genera} de Carga`;
    return {
      clave, tecla: i + 1, nombre: h.nombre, icono: ICONOS[clave] ?? "sword", coste: h.coste, genera: h.genera, lista,
      etiqueta: `Habilidad ${i + 1}, ${h.nombre}: ${h.dano} de daño, enfriamiento ${h.enfriamiento} s, ${efecto}${lista ? "" : ". Te falta Carga"}`,
    };
  });
}
/** The ability a key press asks for (1–3), or null: plain digits only, never while typing or with a modifier. */
export function habilidadDeTecla(e: { key: string; repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !/^[1-9]$/.test(e.key)) return null;
  return HABILIDADES[Number(e.key) - 1] ?? null;
}
/** Ask for the ability of slot `clave`; a refusal on the page's side (no creature near) is said in words, never silent. */
export function usar(lucha: Pick<Lucha, "habilidad">, clave: string, decir: (t: string) => void): void {
  const r = lucha.habilidad(clave);
  if (!r.ok) decir(r.why.charAt(0).toUpperCase() + r.why.slice(1) + ".");
}

const decirEnAvisos = (t: string): void => {
  const box = document.getElementById("avisos"); if (!box) return;
  const p = document.createElement("p"); p.textContent = t; box.appendChild(p);
  while (box.childElementCount > 3) box.firstElementChild!.remove();
};

export function montarCombate(o: { lucha: Lucha; decir?: (t: string) => void }): { pintar(): void } {
  const hab = document.getElementById("habilidades");
  const decir = o.decir ?? decirEnAvisos;
  let firma = "";
  const pintar = (): void => {
    if (!hab) return;
    const activo = o.lucha.activo(), c = activo ? Math.round(o.lucha.carga()) : -1;
    const f = String(c);
    if (f === firma) return;
    firma = f;
    if (!activo) {                                    // no fighting here: the three slots stay as they were
      hab.replaceChildren(...HABILIDADES.map((_, i) => {
        const d = document.createElement("div"); d.className = "hueco"; d.setAttribute("aria-disabled", "true"); d.setAttribute("aria-label", `Habilidad ${i + 1}: próximamente`);
        d.innerHTML = `<kbd>${i + 1}</kbd>${icono(["sword", "target", "sparkle"][i], 24)}<span class="prox">Próximamente</span>`;
        return d;
      }));
      return;
    }
    // innerHTML below: only the kit's constant names and the page's own icon SVGs, never a person's text
    hab.replaceChildren(...casillas(c).map((s) => {
      const b = document.createElement("button"); b.type = "button"; b.className = `hueco real${s.lista ? " lista" : ""}`; b.dataset.habilidad = s.clave;
      b.setAttribute("aria-label", s.etiqueta); b.setAttribute("aria-keyshortcuts", String(s.tecla)); b.title = s.etiqueta;
      const coste = s.coste ? `−${s.coste}` : `+${s.genera}`;
      b.innerHTML = `<kbd>${s.tecla}</kbd><span class="cos" aria-hidden="true">${coste}</span>${icono(s.icono, 24)}<span class="nom">${s.nombre}</span>`;
      b.addEventListener("click", () => usar(o.lucha, s.clave, decir));
      return b;
    }));
  };
  addEventListener("keydown", (e) => {
    if (!o.lucha.activo() || escribiendo(e) || capas.arriba()) return;   // typing, an open panel or a mode own the digits
    const k = habilidadDeTecla(e);
    if (k) usar(o.lucha, k, decir);
  });
  o.lucha.alRechazar((motivo) => decir(motivo));      // a refusal by the server (out of reach, cooldown, no Carga) is said every time
  o.lucha.alCambiar(pintar);
  pintar();
  return { pintar };
}
