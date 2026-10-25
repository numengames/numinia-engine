// La rueda de movimientos (J7b): hold G (or the «Movimientos» button on touch screens, or Y on a gamepad) and a ring
// of eight moves opens around the middle of the screen; point (mouse, finger, left stick) and let go to make the
// move. Let go without pointing and it stays open: arrows, Enter, 1–8, a click or a tap. A short tap of G waves.
// Rings: your eight favourites first (F, or the pin in the middle, puts a move in or takes it out; saved in this
// browser), then one per group. Escape closes. While it is open the world keys (WASD, Space…) do nothing: walking
// would end the move you are choosing. The arithmetic (slices, dead zone, favourites) is packages/client/src/rueda.ts.
// main.ts passes the gestures of features/gestos/client.ts (only composition roots import features/).
import "./rueda.css";
import { PORCIONES, ZONA_MUERTA_PALANCA, alternarFavorito, anillos, centroDe, esToque, leerFavoritos, porcionDe, siguiente, trazoDe } from "../../packages/client/src/rueda.ts";
import { escribiendo } from "./escribiendo.ts";
import { icono } from "./iconos.ts";
import { esTactil } from "./perfil-aparato.ts"; // U25: the page's one answer to «touch controls or not»

type Mov = { id: string; nombre: string; grupo: string; describe: string; modo: string };
type Res = { ok: true } | { ok: false; why: string };
export type Gestos = {
  lista: readonly Mov[]; grupos: readonly { id: string; nombre: string }[];
  hacer(id: string): Res; parar(): Res; abrirRueda: null | (() => void);
};
type Anillo = { id: string; nombre: string; ranuras: (Mov | null)[] };

const GUARDA = "numinia.rueda.favoritos";
const C = 200, R0 = 92, R1 = 196, RT = 145; // the drawing: 400 × 400, ring from R0 to R1, names on RT
const BOTON_Y = 3, BOTON_A = 0, BOTON_B = 1, BOTON_LB = 4, BOTON_RB = 5, CRUZ_IZQ = 14, CRUZ_DER = 15;

export function montarRueda(o: { gestos: Gestos; favoritosIniciales: readonly string[]; haciendo: () => string | null; aviso: (t: string) => void }) {
  const g = o.gestos;
  const porId = new Map(g.lista.map((m) => [m.id, m]));
  const conocidos = g.lista.map((m) => m.id);
  let favs = leerFavoritos(guardado(), conocidos, o.favoritosIniciales);
  const grupos: Anillo[] = g.grupos.flatMap((gr) => anillos(g.lista.filter((m) => m.grupo === gr.id)).map((ranuras, k, todos) => ({ id: `${gr.id}${k ? `-${k + 1}` : ""}`, nombre: gr.nombre + (todos.length > 1 ? ` ${k + 1}` : ""), ranuras })));
  const anillo = (k: number): Anillo => (k === 0 ? { id: "favoritos", nombre: "Favoritos", ranuras: favs.map((id) => (id ? porId.get(id) ?? null : null)) } : grupos[k - 1]);
  const nAnillos = grupos.length + 1;

  // ---- the DOM: a non-modal dialog (role=dialog) with a tab list, eight buttons on an SVG ring, and the middle ----
  const raiz = document.createElement("div");
  raiz.id = "rueda"; raiz.hidden = true;
  raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-label", "Movimientos"); raiz.setAttribute("aria-describedby", "rueda-ayuda");
  raiz.innerHTML = `
    <div class="pestanas" role="tablist" aria-label="Grupos de movimientos"></div>
    <div class="disco">
      <svg viewBox="0 0 400 400" aria-hidden="true" focusable="false"><circle class="fondo" cx="200" cy="200" r="198"/><g class="porciones"></g></svg>
      <div class="ranuras" role="group" aria-label="Movimientos de este grupo"></div>
      <div class="centro">
        <p class="nombre" id="rueda-nombre"></p>
        <p class="describe"></p>
        <div class="botones-centro">
          <button type="button" class="fijar" aria-pressed="false"></button>
          <button type="button" class="parar" hidden>Parar</button>
        </div>
      </div>
    </div>
    <p class="ayuda" id="rueda-ayuda"></p>
    <p class="estado" role="status" aria-live="polite"></p>`;
  document.body.appendChild(raiz);
  const $ = <T extends Element>(s: string) => raiz.querySelector(s) as T;
  const pestanas = $<HTMLDivElement>(".pestanas"), porciones = $<SVGGElement>(".porciones"), ranuras = $<HTMLDivElement>(".ranuras");
  const nombre = $<HTMLParagraphElement>(".nombre"), describe = $<HTMLParagraphElement>(".describe"), fijar = $<HTMLButtonElement>(".fijar"), parar = $<HTMLButtonElement>(".parar");
  const ayuda = $<HTMLParagraphElement>(".ayuda"), estado = $<HTMLParagraphElement>(".estado"), disco = $<HTMLDivElement>(".disco");
  const tactil = esTactil();
  ayuda.innerHTML = tactil
    ? "Toca un movimiento · desliza desde el botón y suelta"
    : "<kbd>←</kbd><kbd>→</kbd> elegir · <kbd>↑</kbd><kbd>↓</kbd> grupo · <kbd>1</kbd>–<kbd>8</kbd> o <kbd>Intro</kbd> hacer · <kbd>F</kbd> favorito · <kbd>0</kbd> parar · <kbd>Esc</kbd> cerrar";

  const trazos: SVGPathElement[] = [], botones: HTMLButtonElement[] = [];
  for (let i = 0; i < PORCIONES; i++) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", trazoDe(i, C, R0, R1, 0.008));
    porciones.appendChild(p); trazos.push(p);
    const b = document.createElement("button");
    b.type = "button"; b.className = "ranura"; b.tabIndex = -1;
    const c = centroDe(i, RT);
    b.style.left = `${((C + c.x) / 400) * 100}%`; b.style.top = `${((C + c.y) / 400) * 100}%`;
    b.addEventListener("click", (e) => { e.stopPropagation(); hacer(i); });
    b.addEventListener("focus", () => { if (marcada !== i) marcar(i, false); });
    ranuras.appendChild(b); botones.push(b);
  }
  const tabs: HTMLButtonElement[] = [];
  for (let k = 0; k < nAnillos; k++) {
    const t = document.createElement("button");
    t.type = "button"; t.setAttribute("role", "tab"); t.tabIndex = -1;
    t.addEventListener("click", () => irA(k));
    pestanas.appendChild(t); tabs.push(t);
  }

  // ---- state ----
  let abierta = false, actual = 0, marcada = -1;
  let sujeta: null | { por: "tecla" | "dedo" | "mando"; x0: number; y0: number; desde: number; movido: boolean; id?: number } = null;
  let antesFoco: Element | null = null;

  function guardado(): string | null { try { return localStorage.getItem(GUARDA); } catch { return null; } }
  function guardar(): void { try { localStorage.setItem(GUARDA, JSON.stringify(favs)); } catch { /* private mode: they last this visit */ } }
  const decir = (t: string) => { estado.textContent = t; o.aviso(t); };

  function pintar(): void {
    const a = anillo(actual), ahora = o.haciendo();
    tabs.forEach((t, k) => {
      t.textContent = anillo(k).nombre;
      t.setAttribute("aria-selected", String(k === actual)); t.tabIndex = k === actual ? 0 : -1;
    });
    a.ranuras.forEach((m, i) => {
      const b = botones[i], p = trazos[i];
      const fav = !!m && actual !== 0 && favs.includes(m.id);
      b.innerHTML = m ? `<span class="num" aria-hidden="true">${i + 1}</span><span class="txt">${m.nombre}</span>${fav ? `<span class="pin" aria-hidden="true">${icono("push-pin", 12)}</span>` : ""}` : `<span class="txt vacia">${actual === 0 ? "Libre" : ""}</span>`;
      b.setAttribute("aria-label", m ? `${m.nombre}. ${m.describe}${fav ? ". En favoritos" : ""}${ahora === m.id ? ". Lo estás haciendo" : ""}` : actual === 0 ? `Hueco libre ${i + 1}: fija aquí un movimiento con F desde otro grupo` : "Vacío");
      b.disabled = !m; b.classList.toggle("haciendo", !!m && ahora === m.id);
      p.classList.toggle("vacia", !m); p.classList.toggle("marcada", i === marcada && !!m); p.classList.toggle("haciendo", !!m && ahora === m.id);
      b.classList.toggle("marcada", i === marcada && !!m);
    });
    const m = marcada >= 0 ? a.ranuras[marcada] : null;
    parar.hidden = !ahora;
    if (m) {
      nombre.textContent = m.nombre; describe.textContent = m.describe;
      const es = favs.includes(m.id);
      fijar.hidden = false; fijar.setAttribute("aria-pressed", String(es)); // a toggle: the state is said by aria-pressed
      fijar.title = es ? "Quitar de favoritos (F)" : "Fijar en favoritos (F)";
      fijar.innerHTML = `${icono("push-pin", 14)}<span>Favorito</span>`;
    } else {
      nombre.textContent = ahora ? porId.get(ahora)?.nombre ?? "" : a.nombre;
      describe.textContent = ahora ? "Lo estás haciendo. Andar también lo para." : actual === 0 && favs.every((x) => !x) ? "Sin favoritos: fija alguno con F." : "Elige un movimiento";
      fijar.hidden = true;
    }
  }
  function marcar(i: number, foco = true): void {
    marcada = i;
    pintar();
    if (foco && i >= 0 && !sujeta) botones[i].focus({ preventScroll: true });
    botones.forEach((b, k) => { b.tabIndex = k === (i >= 0 ? i : primera()) ? 0 : -1; });
  }
  const ocupada = (i: number) => !!anillo(actual).ranuras[i];
  const primera = () => siguiente(-1, 1, ocupada);
  function irA(k: number): void {
    actual = ((k % nAnillos) + nAnillos) % nAnillos;
    marcada = sujeta ? -1 : primera();
    pintar(); marcar(marcada, !sujeta);
    if (!sujeta) tabs[actual].focus({ preventScroll: true });
  }

  function abrir(por: "tecla" | "dedo" | "mando" | "clic", x = innerWidth / 2, y = innerHeight / 2, id?: number): void {
    if (abierta) return;
    abierta = true; antesFoco = document.activeElement; actual = 0; // always the favourites first: muscle memory
    sujeta = por === "clic" ? null : { por, x0: x, y0: y, desde: performance.now(), movido: false, id };
    raiz.hidden = false; raiz.classList.toggle("sujeta", !!sujeta); document.body.classList.add("rueda-abierta");
    estado.textContent = "";
    marcada = sujeta ? -1 : primera();
    pintar(); marcar(marcada, !sujeta);
  }
  function cerrar(): void {
    if (!abierta) return;
    abierta = false; sujeta = null; marcada = -1;
    raiz.hidden = true; document.body.classList.remove("rueda-abierta");
    if (antesFoco instanceof HTMLElement && raiz.contains(document.activeElement)) antesFoco.focus({ preventScroll: true });
    else if (raiz.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }
  function hacer(i: number): void {
    const m = anillo(actual).ranuras[i];
    if (!m) return;
    const r = g.hacer(m.id);
    if (!r.ok) { decir(r.why); marcar(i); return; } // stays open: the person sees why
    cerrar();
    o.aviso(`Haces: ${m.nombre}`);
  }
  function alternar(): void {
    const m = marcada >= 0 ? anillo(actual).ranuras[marcada] : null;
    if (!m) return;
    const r = alternarFavorito(favs, m.id);
    if (r.lleno) { decir("Favoritos llenos: quita uno antes (ve a Favoritos y pulsa F sobre él)."); return; }
    favs = r.favs; guardar();
    decir(r.puesto ? `${m.nombre}: en favoritos` : `${m.nombre}: fuera de favoritos`);
    if (actual === 0 && !r.puesto) marcada = siguiente(marcada, 1, ocupada);
    pintar();
  }
  fijar.addEventListener("click", alternar);
  parar.addEventListener("click", () => { const r = g.parar(); if (!r.ok) decir(r.why); else { cerrar(); o.aviso("Paras"); } });
  g.abrirRueda = () => abrir("clic");

  // ---- picking by direction: from where the hold started (mouse, finger) or the disc's centre (a click) ----
  function apuntar(dx: number, dy: number, zona?: number): void {
    const i = porcionDe(dx, dy, zona);
    if (sujeta && i >= 0) sujeta.movido = true;
    const j = i >= 0 && ocupada(i) ? i : -1;
    if (j !== marcada) marcar(j, false);
  }
  addEventListener("pointermove", (e) => {
    if (!abierta) return;
    if (sujeta && sujeta.por !== "mando" && (sujeta.id === undefined || sujeta.id === e.pointerId)) return apuntar(e.clientX - sujeta.x0, e.clientY - sujeta.y0);
    if (!sujeta && e.pointerType === "mouse") { // free: the slice under the mouse, nothing in the middle
      const r = disco.getBoundingClientRect(), k = 400 / r.width;
      const dx = (e.clientX - r.left) * k - C, dy = (e.clientY - r.top) * k - C, d = Math.hypot(dx, dy);
      if (d >= R0 && d <= R1 + 8) apuntar(dx, dy, 1); else if (marcada >= 0 && document.activeElement && !botones.includes(document.activeElement as HTMLButtonElement)) marcar(-1, false);
    }
  });
  // a click on the ring away from the words still counts (the buttons are the keyboard's and the screen reader's way)
  disco.addEventListener("click", (e) => {
    if (e.target !== disco && !(e.target instanceof SVGElement)) return;
    const r = disco.getBoundingClientRect(), k = 400 / r.width;
    const dx = (e.clientX - r.left) * k - C, dy = (e.clientY - r.top) * k - C, d = Math.hypot(dx, dy);
    if (d >= R0 && d <= R1) hacer(porcionDe(dx, dy, 1));
  });
  const soltar = (): void => {
    if (!sujeta) return;
    const elegida = sujeta.movido && marcada >= 0;
    sujeta = null; raiz.classList.remove("sujeta");
    if (elegida) hacer(marcada);
    else { marcada = primera(); marcar(marcada); } // let go without pointing: it stays open for keys, clicks and taps
  };
  addEventListener("pointerup", (e) => { if (sujeta && sujeta.por === "dedo" && sujeta.id === e.pointerId) soltar(); });
  addEventListener("pointercancel", (e) => { if (sujeta && sujeta.por === "dedo" && sujeta.id === e.pointerId) { sujeta = null; cerrar(); } });
  addEventListener("blur", () => { if (sujeta) { sujeta = null; raiz.classList.remove("sujeta"); } });
  // outside the wheel, a click closes it (the world under it is still there)
  addEventListener("pointerdown", (e) => { if (abierta && !sujeta && !raiz.contains(e.target as Node) && (e.target as Element)?.id !== "rueda-boton") cerrar(); }, true);

  // ---- keys: G held opens, G tapped waves; while open the wheel owns the keyboard (capture: before the world) ----
  let gAbajo = -1, gTemporizador: ReturnType<typeof setTimeout> | undefined;
  addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (!abierta) {
      if (e.code !== "KeyG" || escribiendo(e) || document.body.classList.contains("construyendo")) return; // building: G moves things
      if (e.repeat) return;
      gAbajo = performance.now();
      clearTimeout(gTemporizador);
      gTemporizador = setTimeout(() => { if (gAbajo >= 0) abrir("tecla", ultimoX, ultimoY); }, 220);
      return;
    }
    if (escribiendo(e)) return;
    const k = e.code;
    let usada = true;
    if (k === "Escape") cerrar();
    else if (k === "ArrowRight") marcar(siguiente(marcada, 1, ocupada));
    else if (k === "ArrowLeft") marcar(siguiente(marcada, -1, ocupada));
    else if (k === "ArrowDown" || k === "PageDown") irA(actual + 1);
    else if (k === "ArrowUp" || k === "PageUp") irA(actual - 1);
    else if (/^(Digit|Numpad)[1-8]$/.test(k)) hacer(Number(k.slice(-1)) - 1);
    else if (k === "Digit0" || k === "Numpad0") parar.click();
    else if ((k === "Enter" || k === "Space" || k === "NumpadEnter") && !e.repeat) {
      const t = document.activeElement;
      if (t instanceof HTMLButtonElement && raiz.contains(t) && !botones.includes(t)) t.click(); // a tab, the pin, «Parar»
      else if (marcada >= 0) hacer(marcada);
    } else if (k === "KeyF" && !e.repeat) alternar();
    else if (k === "Tab") { atrapar(e); usada = false; }
    else if (k === "KeyG") { /* the held key itself */ }
    else usada = false;
    if (usada) e.preventDefault();
    e.stopImmediatePropagation(); // no world key while choosing (walking would end the move)
  }, true);
  addEventListener("keyup", (e) => {
    if (e.code !== "KeyG" || gAbajo < 0) return;
    const abajo = gAbajo; gAbajo = -1; clearTimeout(gTemporizador);
    if (abierta && sujeta?.por === "tecla") { e.stopImmediatePropagation(); soltar(); return; }
    if (!abierta && esToque(abajo, performance.now()) && !escribiendo(e)) { const r = g.hacer("saludar"); if (!r.ok) o.aviso(r.why); }
  }, true);
  let ultimoX = innerWidth / 2, ultimoY = innerHeight / 2;
  addEventListener("pointermove", (e) => { if (!abierta) { ultimoX = e.clientX; ultimoY = e.clientY; } }, { passive: true });
  function atrapar(e: KeyboardEvent): void { // Tab stays inside the wheel while it is open
    const f = [...raiz.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.hidden && !b.disabled && b.offsetParent !== null && (b.tabIndex >= 0));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLButtonElement);
    const j = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
    e.preventDefault(); f[j].focus();
  }

  // ---- touch: a «Movimientos» button; a tap opens it, a finger dragged from it picks and lets go to make the move ----
  if (tactil) {
    const b = document.createElement("button");
    b.type = "button"; b.id = "rueda-boton"; b.textContent = "Movimientos"; b.title = "Movimientos: toca, o desliza y suelta";
    b.setAttribute("aria-haspopup", "dialog");
    b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); if (abierta) return cerrar(); abrir("dedo", e.clientX, e.clientY, e.pointerId); }); // not a joystick touch
    b.addEventListener("click", (e) => { if (e.detail === 0) abrir("clic"); }); // screen readers click
    document.getElementById("acciones")?.prepend(b);
  }
  raiz.addEventListener("pointerdown", (e) => e.stopPropagation()); // a finger on the wheel is not the joystick nor the camera

  // ---- gamepad: hold Y, push the left stick, let go; A makes the marked one, B closes, LB/RB change ring ----
  let mandos = 0, antes: boolean[] = [];
  addEventListener("gamepadconnected", () => { mandos++; });
  addEventListener("gamepaddisconnected", () => { mandos = Math.max(0, mandos - 1); });
  const leer = () => { for (const p of navigator.getGamepads?.() ?? []) if (p?.connected) return p; return null; };
  setInterval(() => {
    if (!mandos) return;
    const p = leer();
    if (!p) return;
    const ya = p.buttons.map((b) => b.pressed), pulsado = (i: number) => ya[i] && !antes[i], suelto = (i: number) => !ya[i] && antes[i];
    if (!abierta && pulsado(BOTON_Y)) abrir("mando");
    else if (abierta) {
      if (sujeta?.por === "mando") apuntar(p.axes[0] ?? 0, p.axes[1] ?? 0, ZONA_MUERTA_PALANCA);
      if (suelto(BOTON_Y) && sujeta?.por === "mando") soltar();
      else if (pulsado(BOTON_A) && marcada >= 0) hacer(marcada);
      else if (pulsado(BOTON_B)) cerrar();
      else if (pulsado(BOTON_RB)) irA(actual + 1);
      else if (pulsado(BOTON_LB)) irA(actual - 1);
      else if (pulsado(CRUZ_DER)) marcar(siguiente(marcada, 1, ocupada));
      else if (pulsado(CRUZ_IZQ)) marcar(siguiente(marcada, -1, ocupada));
    }
    antes = ya;
  }, 50);

  return {
    /** While open the page reads no movement (keys, stick) and no jump: choosing must not walk. */
    abierta: () => abierta,
    abrir: () => abrir("clic"),
    cerrar,
    /** For checks and agents: rings, the marked slice, the favourites. */
    estado: () => ({ abierta, anillo: anillo(actual).id, marcada, favoritos: [...favs], anillos: Array.from({ length: nAnillos }, (_, k) => ({ id: anillo(k).id, nombre: anillo(k).nombre, ranuras: anillo(k).ranuras.map((m) => m?.id ?? null) })) }),
    irA, marcar: (i: number) => marcar(i), alternarFavorito: alternar,
  };
}
