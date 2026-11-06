// V13 (docs/V13-SUBTITULOS-VOZ.md, trozo 1): the column of voice subtitles. Real HTML (a screen reader reads it, it grows with
// «Texto grande», it follows the theme), never in the canvas. Golden rule (§1): it subtitles exactly what you hear — voz.ts
// tells it who is audible NOW (after the cap of 8, the stage and your own «Silenciar»), so a muted or out-of-cap person never
// gets a box, a line in the reader or a history entry. Turning «Voz de las personas» to 0 does not remove them.
// Trozo 1 has no transcription yet (§8.2 is Pablo's): every audible speaker shows «[habla · sin subtítulos]» with name and direction.
// The box model already carries text (`texto`) so trozos 2 and 3 only have to call `texto()`.
import { SECTORES, aLaVista, anguloRelativo, esLejos, frase, ordenar, permanenciaMs, quienSale, recortarNombre, sectorDe } from "./subtitulos-logica.ts";
import type { Caja } from "./subtitulos-logica.ts";

const SIN_TEXTO = "[habla · sin subtítulos]";
const TICK_MS = 250;           // direction and layout: 4 times a second at most, never per frame
const MAX_LECTOR = 20;
const CHOQUES = ["chat", "accion", "joy-fantasma", "dialogo", "interactuar", "hoja-msg"];

const CSS = `
:root { --sub-caja: rgba(20, 17, 15, .88); --sub-letra: 18px; --sub-ancho: 42ch; --sub-base: 96px; --sub-choque: 0px; }
html.texto-grande { --sub-letra: 24px; --sub-ancho: 32ch; }
@media (pointer: coarse) and (orientation: portrait) { :root { --sub-letra: 16px; --sub-ancho: 34ch; --sub-base: calc(var(--sb, 0px) + 246px); } html.texto-grande { --sub-letra: 20px; --sub-ancho: 28ch; } }
@media (pointer: coarse) and (orientation: landscape) { :root { --sub-letra: 16px; --sub-ancho: 34ch; --sub-base: calc(var(--sb, 0px) + 10px); } html.texto-grande { --sub-letra: 20px; } #subtitulos { width: min(calc(var(--sub-ancho) + 32px), 46vw); } }
html.alto-contraste { --sub-caja: #000; }
#subtitulos { position: fixed; left: 50%; transform: translateX(-50%); bottom: max(var(--sub-base), var(--sub-choque)); width: min(calc(var(--sub-ancho) + 32px), calc(100vw - 24px)); box-sizing: border-box;
  display: flex; flex-direction: column; gap: 6px; align-items: stretch; pointer-events: none; z-index: 5; font-size: var(--sub-letra); line-height: 1.35; }
#subtitulos[hidden] { display: none; }
.sub { background: var(--sub-caja); color: var(--n-texto, #F9EBDC); border-radius: 8px; padding: 6px 12px 8px; border-left: 4px solid var(--n-linea, #3A332D); }
.sub.lejos { border-left-style: dashed; }
.sub.escenario { border-left-color: var(--n-ambar, #EFA517); }
.sub-cab { display: flex; align-items: center; gap: 6px; font-size: max(.78em, 13px); line-height: 1.2; margin-bottom: 2px; }
.sub-quien { font-weight: 600; color: var(--n-verdemar, #A6DAD5); letter-spacing: .01em; }
.sub-donde { color: var(--n-texto2, #C4B5A6); margin-left: auto; white-space: nowrap; }
.sub-flecha { width: 1.1em; height: 1.1em; flex: none; color: var(--n-texto, #F9EBDC); }
.sub-texto { margin: 0; max-height: calc(2 * 1.35em); overflow: hidden; }
.sub-sin-texto { color: var(--n-texto2, #C4B5A6); }
html.alto-contraste .sub { border: 2px solid #fff; border-left-width: 4px; color: #fff; }
html.alto-contraste .sub-quien, html.alto-contraste .sub-donde, html.alto-contraste .sub-sin-texto, html.alto-contraste .sub-flecha { color: #fff; }
html.alto-contraste .sub.lejos { border-left-style: dashed; }
#subtitulos-cc { position: absolute; right: -4px; top: -8px; font: 600 11px/1 ui-monospace, monospace; padding: 3px 5px; border: 1.5px solid currentColor; border-radius: 6px; background: var(--sub-caja); color: var(--n-texto, #F9EBDC); }
#subtitulos-cc[hidden] { display: none; }
`;

const FLECHA = `<svg class="sub-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L20 13 H15 V21 H9 V13 H4 Z" fill="currentColor"/></svg>`;
const ALTAVOZ = `<svg class="sub-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z M15 8c2 2 2 6 0 8 M18 5c4 4 4 10 0 14" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;

type Estado = Caja & { el: HTMLElement; icono: HTMLElement; quien: HTMLElement; donde: HTMLElement; texto: HTMLElement; sector: number | null; lejos: boolean; larga: number };

export type OpcionesSubtitulos = {
  /** The «Subtítulos de voz» setting (accesibilidad.subtitulosVoz), read at every tick: no event to miss. */
  activo(): boolean;
  /** The name «Gente» shows for this entity, or null. */
  nombre(entidad: number): string | null;
  /** Where that person and you stand, and where the camera looks (yaw): the angle and distance are worked out here, so the page's first load does not carry the maths. null = unknown. */
  relativa(entidad: number): { yaw: number; yo: { x: number; z: number }; otro: { x: number; z: number } } | null;
  /** Horizontal field of view of the camera, in degrees. */
  campoH(): number;
};

export function montarSubtitulos(o: OpcionesSubtitulos) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const columna = document.createElement("section");
  columna.id = "subtitulos"; columna.hidden = true; columna.setAttribute("aria-hidden", "true"); // what is read is the log below: not twice
  document.body.appendChild(columna);
  const lector = document.createElement("div");
  lector.id = "subtitulos-lector"; lector.className = "solo-lector"; lector.setAttribute("role", "log");
  lector.setAttribute("aria-live", "polite"); lector.setAttribute("aria-relevant", "additions"); lector.setAttribute("aria-label", "Subtítulos de voz");
  document.body.appendChild(lector);
  const cc = document.createElement("span");
  cc.id = "subtitulos-cc"; cc.hidden = true;
  cc.innerHTML = `<span aria-hidden="true">CC</span><span class="solo-lector">Alguien cerca lee subtítulos de tu voz</span>`;

  const cajas = new Map<number, Estado>();
  const tope = () => (matchMedia("(pointer: coarse)").matches ? 2 : 3);
  const anunciar = (t: string) => {
    const p = document.createElement("p"); p.textContent = t; lector.appendChild(p);
    while (lector.childElementCount > MAX_LECTOR) lector.firstElementChild!.remove();
  };
  const quitar = (e: number) => { const c = cajas.get(e); if (c) { c.el.remove(); cajas.delete(e); } };
  const limpiar = () => { for (const e of [...cajas.keys()]) quitar(e); columna.hidden = true; };

  const crear = (entidad: number, escenario: boolean, ahora: number): Estado | null => {
    if (cajas.size >= tope()) { // no room: the one with the oldest last word leaves; if nobody may yet, this one waits (it retries on the next call)
      const sale = quienSale([...cajas.values()], ahora);
      if (sale === null) return null;
      quitar(sale);
    }
    const el = document.createElement("div"); el.className = "sub";
    const cab = document.createElement("div"); cab.className = "sub-cab";
    const icono = document.createElement("span"); icono.style.display = "contents";
    const quien = document.createElement("span"); quien.className = "sub-quien";
    const donde = document.createElement("span"); donde.className = "sub-donde";
    cab.append(icono, quien, donde);
    const texto = document.createElement("p"); texto.className = "sub-texto sub-sin-texto"; texto.textContent = SIN_TEXTO;
    el.append(cab, texto);
    const nombre = recortarNombre(o.nombre(entidad) ?? "Alguien");
    quien.textContent = nombre;
    const c: Estado = { entidad, escenario, llegada: ahora, ultima: ahora, el, icono, quien, donde, texto, sector: null, lejos: false, larga: SIN_TEXTO.length };
    cajas.set(entidad, c);
    refrescar(c);
    anunciar(frase({ nombre, escenario, sector: c.sector, lejos: c.lejos, texto: "habla." }));
    return c;
  };

  /** Direction, distance and the header of one box. */
  const refrescar = (c: Estado) => {
    c.el.classList.toggle("escenario", c.escenario);
    if (c.escenario) { // no direction: it sounds the same everywhere (the speaker icon and the word are the clues; amber is the extra)
      c.sector = null; c.lejos = false;
      c.icono.innerHTML = ALTAVOZ; c.donde.textContent = "escenario"; c.el.classList.remove("lejos");
      return;
    }
    const q = o.relativa(c.entidad);
    const r = q ? { angulo: anguloRelativo(q.yaw, q.yo, q.otro), dist: Math.hypot(q.otro.x - q.yo.x, q.otro.z - q.yo.z) } : null;
    if (!r) { c.sector = null; c.icono.innerHTML = ""; c.donde.textContent = ""; return; }
    c.lejos = esLejos(r.dist, c.lejos);
    if (aLaVista(r.angulo, o.campoH())) { // you can see them: just the name (their avatar already says «habla»)
      c.sector = null; c.icono.innerHTML = ""; c.donde.textContent = c.lejos ? "lejos" : "";
    } else {
      c.sector = sectorDe(r.angulo, c.sector ?? undefined);
      if (!c.icono.firstChild) c.icono.innerHTML = FLECHA;
      (c.icono.firstChild as SVGElement).style.transform = `rotate(${c.sector * 45}deg)`;
      c.donde.textContent = SECTORES[c.sector].palabra + (c.lejos ? " · lejos" : "");
    }
    c.el.classList.toggle("lejos", c.lejos);
  };

  /** The column never sits on top of the chat, the action button, the joystick, a dialogue… (§2): it rests above whichever rises higher. */
  const evitarChoques = () => {
    const r = columna.getBoundingClientRect();
    let alto = 0;
    for (const id of CHOQUES) {
      const el = document.getElementById(id);
      if (!el || el.hidden) continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || b.right <= r.left || b.left >= r.right) continue;
      alto = Math.max(alto, innerHeight - b.top + 8);
    }
    const v = `${Math.round(alto)}px`;
    if (columna.style.getPropertyValue("--sub-choque") !== v) columna.style.setProperty("--sub-choque", v);
  };

  const tick = () => {
    if (!o.activo() || document.hidden) { if (cajas.size) limpiar(); return; } // a hidden tab paints nothing; what was lost is not repeated
    if (cajas.size === 0) { columna.hidden = true; return; }
    const ahora = performance.now();
    for (const c of [...cajas.values()]) if (ahora - c.ultima > permanenciaMs(c.larga)) quitar(c.entidad);
    if (cajas.size === 0) { columna.hidden = true; return; }
    for (const c of cajas.values()) refrescar(c);
    for (const c of ordenar([...cajas.values()])) columna.appendChild(c.el); // re-appending keeps the order: stage first, newest at the bottom
    columna.hidden = false;
    evitarChoques();
  };
  setInterval(tick, TICK_MS);

  return {
    /** voz.ts: this person is audible and talking right now (their mouth is above the threshold). Call as often as you like. */
    hablando(entidad: number, escenario: boolean): void {
      if (!o.activo() || document.hidden) return;
      const ahora = performance.now();
      const c = cajas.get(entidad) ?? crear(entidad, escenario, ahora);
      if (c) { c.ultima = ahora; if (c.escenario !== escenario) { c.escenario = escenario; refrescar(c); } }
    },
    /** voz.ts: this person stopped being audible (muted, left, out of the cap): nothing of theirs stays on screen. */
    olvidar: quitar,
    /** Somebody who hears you reads subtitles (or stopped): the «CC» badge by the microphone button (§5). Fed by the server notice (pending). */
    lectores(n: number): void { if (!cc.parentElement) document.getElementById("microfono")?.appendChild(cc); cc.hidden = n <= 0; },
    /** For the e2e and for agents: what is on screen now. */
    cajas: () => ordenar([...cajas.values()]).map((c) => ({ entidad: c.entidad, nombre: c.quien.textContent ?? "", donde: c.donde.textContent ?? "", escenario: c.escenario, sector: c.sector, lejos: c.lejos })),
  };
}
