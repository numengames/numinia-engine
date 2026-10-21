// gente-tarjeta (ux2-gente): the small card beside someone you click in the world — their bust, name, «En tus amigos ·
// pescando» (or what they do, or how far), «Saludar» (the one main action), «Mensaje», «Ver ficha» (opens Gente on
// them) and a «⋮» with Silenciar · Bloquear · Denunciar · Añadir amigo. It follows them on the screen while open (one
// projection per frame, only while open). Escape or a click elsewhere closes it; a click on someone else moves it.
// main.ts gets the click from apps/plaza/interactuar.ts (the same plain click that uses things: never while building)
// and the person under it from the view (packages/render/src/gente-politica.ts). The actions are gente.ts's.
// An AI (ia-visible S7) gets its own card from the same click: its name and the «IA» chip, who answers for it (D-084), Activa /
// Dormida, whether it can build, and «Ir hacia ella» as the main button (gente.ts: the trip, or a beacon where trips are off).
// Names go in with textContent; innerHTML only ever receives the house icons (constants).
import { icono } from "./iconos.ts";
import { el, botonCon, retrato, type Acciones, type Elegido, type Mirada } from "./gente-comun.ts";
import { fichaIA, subIA, textos } from "./gente-ia.ts";

export function montarTarjeta(o: {
  acciones: Acciones;
  porQuien(quien: number): Elegido | null;
  vista?: { personaEnPantalla(id: number): { x: number; y: number; m: number } | null };
  base: string;
  mirada?: Mirada;
  idioma?: () => string;
  pedir(): unknown;
}) {
  const caja = el("div", { id: "gente-tarjeta", className: "gente-tarjeta" });
  caja.setAttribute("role", "dialog"); caja.setAttribute("aria-label", "Tarjeta de la persona");
  caja.hidden = true;
  document.body.appendChild(caja);
  caja.addEventListener("pointerdown", (e) => e.stopPropagation()); // a tap here is not a joystick touch nor a click outside
  let quien: number | null = null, menu = false, raf = 0;

  const cerrar = () => {
    if (quien === null) return;
    quien = null; menu = false; caja.hidden = true; caja.replaceChildren(); cancelAnimationFrame(raf);
  };
  function colocar(): void {
    if (quien === null) return;
    const s = o.vista?.personaEnPantalla(quien);
    if (!s) { cerrar(); return; }
    const w = caja.offsetWidth || 330, h = caja.offsetHeight || 120;
    // above their head and to its left (their body stays in sight); to the right / below when it would leave the screen
    let x = s.x - w + 24, y = s.y - h - 18;
    if (x < 8) x = s.x - 24;
    if (y < 8) y = s.y + 24;
    x = Math.max(8, Math.min(innerWidth - w - 8, x)); y = Math.max(8, Math.min(innerHeight - h - 8, y));
    caja.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    raf = requestAnimationFrame(colocar);
  }
  function pintar(): void {
    if (quien === null) return;
    const p = o.porQuien(quien);
    if (!p) { cerrar(); return; }
    const a = o.acciones, amigo = !!a.esAmigo(p);
    const que = o.mirada?.actividad(quien), d = o.mirada?.distancia(quien);
    const dist = d === null || d === undefined ? "" : d < 2 ? "a tu lado" : `a ${Math.round(d)} m`;
    const tx = textos(o.idioma?.()), ia = p.ia ? fichaIA(p.nombre, p.ia, o.idioma?.()) : null;
    const sub = ia && p.ia ? subIA(p.ia, que ?? dist, o.idioma?.()) : [amigo ? "En tus amigos" : "", que ?? "", amigo || que ? "" : dist].filter(Boolean).join(" · ");
    const mas = el("button", { type: "button", className: "solo-icono gente-mas", title: "Más" });
    mas.innerHTML = icono("dots-three-vertical", 20); // constants only
    mas.setAttribute("aria-label", `Más opciones con ${ia?.nombre ?? p.nombre}`); mas.setAttribute("aria-haspopup", "menu"); mas.setAttribute("aria-expanded", String(menu));
    mas.addEventListener("click", () => { menu = !menu; pintar(); if (menu) (caja.querySelector(".gente-menu button") as HTMLButtonElement | null)?.focus(); });
    const nombreL = ia ? el("span", { className: "nombre-ia" }, el("b", { textContent: ia.nombre }), el("span", { className: "marca-ia", textContent: ia.marca })) : el("b", { textContent: p.nombre });
    const cab = el("div", { className: "cab" }, retrato(o.base, p.avatar, "busto", 64, ia?.estado === "dormida"), el("div", { className: "textos" }, nombreL, el("span", { className: "sub", textContent: sub })), mas);
    const sal = botonCon("hand-waving", "Saludar", "principal"); sal.id = "gente-tarjeta-saludar";
    sal.addEventListener("click", () => { a.saludar(p); });
    const msg = botonCon("chat-text", "Mensaje"); msg.id = "gente-tarjeta-mensaje";
    msg.addEventListener("click", () => { a.mensaje(p); });
    const fic = el("button", { type: "button", className: "solo-icono", id: "gente-tarjeta-ficha", title: "Ver ficha" });
    fic.innerHTML = icono("user", 20); // constants only
    fic.setAttribute("aria-label", `Ver la ficha de ${p.nombre}`);
    fic.addEventListener("click", () => a.verFicha(p));
    const fila = el("div", { className: "acciones" }, sal, msg, fic);
    caja.setAttribute("aria-label", `${tx.tarjeta} ${ia?.nombre ?? p.nombre}`);
    if (ia) {
      // who answers for it and what it may do; the trip is the main button (no «Mensaje»: nothing reads a private note yet)
      const dato = (k: string, v: string) => el("p", { className: "ia-dato" }, el("span", { className: "k", textContent: k }), el("b", { textContent: v }));
      const datos = el("div", { className: "ia-datos" }, dato(ia.respondeEtiqueta, ia.respondeValor), el("p", { className: `ia-dato${ia.construye ? "" : " no"}`, textContent: ia.construyeTexto }));
      const ir = botonCon("navigation-arrow", tx.ir, "principal"); ir.id = "gente-tarjeta-ir";
      ir.title = tx.irTitulo; ir.setAttribute("aria-label", `${tx.irAria} ${ia.nombre}`);
      ir.addEventListener("click", () => { a.ir(p); });
      const hola = el("button", { type: "button", className: "solo-icono", id: "gente-tarjeta-saludar", title: "Saludar" }); // icon only: the trip needs the room
      hola.innerHTML = icono("hand-waving", 20); // constants only
      hola.setAttribute("aria-label", `Saludar a ${ia.nombre}`);
      hola.addEventListener("click", () => { a.saludar(p); });
      caja.replaceChildren(cab, datos, el("div", { className: "acciones" }, ir, hola, fic));
    } else caja.replaceChildren(cab, fila);
    if (menu) {
      const m = el("div", { className: "gente-menu" }); m.setAttribute("role", "menu");
      const item = (ic: string, t: string, fn: () => unknown, clase = "") => { const b = botonCon(ic, t, clase); b.setAttribute("role", "menuitem"); b.addEventListener("click", () => { menu = false; fn(); pintar(); }); return b; };
      m.append(
        item("speaker-simple-slash", a.silenciado(p) ? "Oír su voz" : "Silenciar", () => a.silenciar(p)),
        item("prohibit", a.bloqueado(p) ? "Desbloquear" : "Bloquear", () => a.bloquear(p)),
        item("flag", "Denunciar", () => a.denunciar(p), "peligro-texto"),
        ...(ia ? [] : [amigo ? item("x", "Quitar de amigos", () => a.quitar(p)) : item("user-plus", "Añadir amigo", () => a.anadir(p))]),
      );
      caja.append(m);
    }
  }
  // Escape closes (the menu first); a press anywhere else closes
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || quien === null) return;
    if (menu) { menu = false; pintar(); } else cerrar();
    e.stopPropagation();
  }, true);
  addEventListener("pointerdown", (e) => { if (quien !== null && !caja.contains(e.target as Node)) cerrar(); }, true);

  return {
    abrir(q: number): boolean {
      if (!o.porQuien(q)) return false;
      const antes = quien;
      quien = q; menu = false; caja.hidden = false;
      o.pedir(); // their tag (friends) arrives with the list; the card repaints when it does
      pintar();
      if (antes === null) { cancelAnimationFrame(raf); colocar(); }
      (caja.querySelector("#gente-tarjeta-ir, #gente-tarjeta-saludar") as HTMLButtonElement | null)?.focus({ preventScroll: true });
      return true;
    },
    cerrar,
    repintar: () => { if (quien !== null) pintar(); },
    abierta: (): number | null => quien,
  };
}
