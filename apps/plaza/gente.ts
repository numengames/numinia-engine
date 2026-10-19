// gente (N16 → rediseño v2, ux2-gente): «Gente» (L) — your friends and who is here now, and the sheet of the person
// you pick: their portrait, where they are and what they do, «Ir a su lado» (features/teletransporte: the server checks
// the world allows it, finds a free spot and moves you; the light is packages/render/src/teletransporte.ts),
// «Mensaje», «Saludar», and apart from those, «Silenciar», «Bloquear», «Denunciar», «Quitar de amigos».
// Pablo, 17-10, camino A: presence of now, no account — so the friends list lives IN THIS BROWSER (apps/plaza/amigos.ts,
// localStorage numinia.amigos, keyed by the tag of each person's identity the server sends with the list) and the panel
// says so in small print. The chat has no private messages: «Mensaje» opens the chat with «@Nombre » written. Silencing
// is this page's (apps/plaza/voz.ts drops their frames); blocking is the server's /bloquear (by identity: you stop
// reading and hearing them; it survives a reload); a report is /denunciar (packages/server/src/roles-mundo.ts: whoever
// moderates hears it, and it is kept for them). There are no invitations in the engine, so there is no such tab.
// Also: «Dejarme encontrar» and, for owners and whoever directs, «Permitir en este mundo». A click on someone in the
// world opens their small card (gente-tarjeta.ts), whose «Ver ficha» opens this panel on them. In VR the HTML panel is
// not drawn: the chat's /ir <nombre> does the same from a headset.
// Every name and text a person typed goes in with textContent; innerHTML only ever receives the house icons (constants).
import type { Cambio, Persona } from "../../features/teletransporte/client.ts";
import { crearDialogo, anunciar } from "./paneles.ts";
import { icono } from "./iconos.ts";
import {
  CLAVE_AMIGOS, CLAVE_SILENCIADOS, CLAVE_BLOQUEADOS, leerAmigos, escribirAmigos, leerMarcas, escribirMarcas, anadir, quitar,
  buscar, claveDe, normal, fusionar, filtrar, haceTexto, fechaTexto, distanciaTexto, type Amigo, type Conectado,
} from "./amigos.ts";
import { montarTarjeta } from "./gente-tarjeta.ts";
import { el, botonCon, retrato, type Res, type Mirada, type Elegido, type Acciones } from "./gente-comun.ts";
export type { Res, Mirada, Elegido, Acciones };

type Orden = (texto: string) => Res;
type Viajar = {
  estado: { gente: Persona[]; todos: number; puede: boolean; encontrable: boolean; viaje: { ok: boolean; texto: string } | null };
  activo(): boolean; foto(): boolean;
  pedirGente(): Res;
  ir(quien: number): Res;
  encontrable(si: boolean): Res;
  permitir(si: boolean): Res;
  alCambiar(f: (q: Cambio) => void): () => void;
};
export type OpcionesGente = {
  viajar: Viajar; barra: HTMLElement | null; orden?: Orden;
  /** The world's name, for «En <mundo>». */
  mundo?: () => string;
  mirada?: Mirada;
  voz?: { silenciar(quien: number, si: boolean): void; silenciado(quien: number): boolean };
  /** Opens the chat box with this text written. */
  chat?: (texto: string) => void;
  /** Wave at them (turning towards them first). */
  saludar?: (quien: number) => Res;
  /** Where a person is on the screen (for the card beside them). */
  vista?: { personaEnPantalla(id: number): { x: number; y: number; m: number } | null };
  /** Where the portraits live (default "/retratos/": apps/plaza/public/retratos/<id>-busto.webp, -cuerpo.webp). */
  retratos?: string;
  ahora?: () => number;
};

/** While open, the list is asked again this often (people come and go). */
export const REFRESCO_MS = 5000;
/** The longest report reason the page sends (the chat line, with «/denunciar Nombre », stays under 200 bytes). */
export const MOTIVO_MAX = 120;

export function montarGente(o: OpcionesGente) {
  const { viajar } = o;
  const ahora = o.ahora ?? (() => Date.now());
  const base = o.retratos ?? "/retratos/";
  const mundo = () => o.mundo?.() || "este mundo";
  // ---- what this browser keeps: friends, and whom you silenced or blocked (by the same key as a friend) ----
  const leer = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
  const escribir = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: only for this visit */ } };
  let amigos: Amigo[] = leerAmigos(leer(CLAVE_AMIGOS));
  const silenciados = leerMarcas(leer(CLAVE_SILENCIADOS)), bloqueados = leerMarcas(leer(CLAVE_BLOQUEADOS));
  const guardarAmigos = () => escribir(CLAVE_AMIGOS, escribirAmigos(amigos));
  const guardarMarcas = () => { escribir(CLAVE_SILENCIADOS, escribirMarcas(silenciados)); escribir(CLAVE_BLOQUEADOS, escribirMarcas(bloqueados)); };

  const boton = el("button", { type: "button", id: "gente-abrir", className: "solo-icono", title: "Gente (L)" });
  boton.innerHTML = `${icono("users")}<span class="solo-lector">Gente</span>`; // constants only
  const foto = document.getElementById("foto-abrir");
  if (o.barra && foto?.parentElement === o.barra) foto.before(boton); else (o.barra ?? document.body).appendChild(boton);

  let reloj = 0;
  const panel = crearDialogo({ id: "gente", titulo: "Gente", tecla: "KeyL", boton,
    alAbrir: () => { pintar(); pedir(); reloj = window.setInterval(pedir, REFRESCO_MS); },
    alCerrar: () => { clearInterval(reloj); } });
  // header: «Añadir amigo» next to the title, before «Cerrar»
  const cabeza = panel.dialog.querySelector("header")!;
  const anadirB = botonCon("user-plus", "Añadir amigo", "gente-anadir");
  anadirB.id = "gente-anadir";
  cabeza.querySelector(".cerrar")!.before(anadirB);

  // tabs
  type Pestana = "amigos" | "aqui";
  let pestana: Pestana = amigos.length ? "amigos" : "aqui";
  const tabs = el("div", { className: "gente-pestanas" });
  tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Listas de gente");
  const tab = (id: Pestana) => { const b = el("button", { type: "button", id: `gente-tab-${id}` }); b.setAttribute("role", "tab"); b.addEventListener("click", () => { pestana = id; pintar(); }); return b; };
  const tabAmigos = tab("amigos"), tabAqui = tab("aqui");
  tabs.append(tabAmigos, tabAqui);

  // left: search, list, options, small print
  const buscarI = el("input", { type: "search", id: "gente-buscar", placeholder: "Buscar", autocomplete: "off" });
  buscarI.setAttribute("aria-label", "Buscar por nombre");
  buscarI.maxLength = 40;
  const buscarC = el("label", { className: "gente-buscar" }); buscarC.innerHTML = icono("magnifying-glass", 18); buscarC.append(buscarI); // constants only
  const lista = el("div", { className: "gente-lista" });
  lista.setAttribute("role", "list");
  const encontrable = el("input", { type: "checkbox", id: "gente-encontrable" });
  const permitir = el("input", { type: "checkbox", id: "gente-permitir" });
  const filaPermitir = el("label", { className: "opcion" }, permitir, " Permitir ir junto a otros en este mundo");
  filaPermitir.htmlFor = "gente-permitir";
  const filaEncontrable = el("label", { className: "opcion" }, encontrable, " Dejarme encontrar");
  filaEncontrable.htmlFor = "gente-encontrable";
  filaEncontrable.title = "Salir en la lista «Aquí ahora» de los demás";
  const letra = el("p", { className: "gente-letra", textContent: "Tus amigos se guardan en este navegador." });
  letra.title = "En otro navegador, o en una ventana privada, la lista empieza vacía.";
  const izq = el("div", { className: "gente-izq" }, buscarC, lista, filaEncontrable, filaPermitir, letra);

  // right: the person you picked
  const der = el("div", { className: "gente-der" });
  const estadoP = el("p", { className: "estado" });
  estadoP.setAttribute("role", "status"); estadoP.setAttribute("aria-live", "polite");
  const cuerpoG = el("div", { className: "gente-cuerpo" }, izq, der);
  panel.cuerpo.append(tabs, cuerpoG, estadoP);
  panel.dialog.classList.add("gente-panel");

  const decir = (t: string) => { estadoP.textContent = t; if (!panel.abierto) anunciar(t); };
  const pedir = () => { const r = viajar.pedirGente(); if (!r.ok && r.why) estadoP.textContent = r.why; };

  // ---- people ----
  const conectados = (): Conectado[] => viajar.estado.gente.map((p) => ({ quien: p.quien, nombre: p.nombre, huella: p.huella || undefined, avatar: o.mirada?.avatar(p.quien)?.id ?? null }));
  const deConectado = (p: Conectado): Elegido => ({ quien: p.quien, nombre: p.nombre, huella: p.huella, avatar: o.mirada?.avatar(p.quien) ?? (p.avatar ? { id: p.avatar, nombre: "" } : null) });
  /** Someone by entity: from the «Gente» list (with their tag) or, if they are not listed, by the name over their head. */
  const porQuien = (quien: number): Elegido | null => {
    const p = viajar.estado.gente.find((g) => g.quien === quien);
    if (p) return deConectado({ quien, nombre: p.nombre, huella: p.huella || undefined });
    const n = o.mirada?.nombre(quien);
    return n ? { quien, nombre: n, avatar: o.mirada?.avatar(quien) ?? null } : null;
  };
  let elegido: { quien: number | null; clave: string } | null = null;
  /** The one picked, as it is now (a friend who just came in has an entity; one who left has none). */
  function actual(): Elegido | null {
    if (!elegido) return null;
    const e = elegido;
    const f = fusionar(amigos, conectados(), ahora());
    const amigo = f.conectados.find((x) => x.amigo.clave === e.clave);
    if (amigo) return deConectado(amigo.persona);
    if (e.quien !== null) { const p = porQuien(e.quien); if (p) return p; }
    const off = amigos.find((a) => a.clave === e.clave);
    return off ? { quien: null, nombre: off.nombre, avatar: off.avatar ? { id: off.avatar, nombre: "" } : null } : null;
  }
  const claveDeElegido = (p: Elegido): string => { const a = buscar(amigos, p); return a ? a.clave : claveDe(p); };
  const noEsta = (p: Elegido): Res => ({ ok: false, why: `${p.nombre} no está conectado ahora.` });

  // ---- the actions (the panel's buttons and the card's) ----
  const acciones: Acciones = {
    esAmigo: (p) => buscar(amigos, p),
    silenciado: (p) => silenciados.has(claveDeElegido(p)) || (p.quien !== null && !!o.voz?.silenciado(p.quien)),
    bloqueado: (p) => bloqueados.has(claveDeElegido(p)),
    ir(p) {
      if (p.quien === null) return noEsta(p);
      const r = viajar.ir(p.quien);
      if (!r.ok) { decir(r.why ?? "No se pudo."); return r; }
      decir(`Vas con ${p.nombre}…`); panel.cerrar(); tarjeta.cerrar();
      return r;
    },
    mensaje(p) {
      if (!o.chat) return { ok: false, why: "No hay chat en esta página." };
      panel.cerrar(); tarjeta.cerrar();
      o.chat(`@${p.nombre} `);
      return { ok: true };
    },
    saludar(p) {
      if (p.quien === null || !o.saludar) return noEsta(p);
      const r = o.saludar(p.quien);
      decir(r.ok ? `Saludas a ${p.nombre}.` : (r.why ?? "No se pudo."));
      return r;
    },
    anadir(p) {
      if (buscar(amigos, p)) return { ok: true };
      if (p.quien === null) return { ok: false, why: "Solo puedes añadir a alguien conectado." };
      amigos = anadir(amigos, { quien: p.quien, nombre: p.nombre, huella: p.huella, avatar: p.avatar?.id ?? null }, ahora());
      guardarAmigos();
      decir(`${p.nombre} está en tus amigos (en este navegador).`);
      if (elegido && elegido.quien === p.quien) elegido.clave = claveDe(p);
      pintar(); tarjeta.repintar();
      return { ok: true };
    },
    quitar(p) {
      const a = buscar(amigos, p); if (!a) return { ok: true };
      amigos = quitar(amigos, a.clave); guardarAmigos();
      decir(`${p.nombre} ya no está en tus amigos.`);
      if (p.quien === null) elegido = null; else if (elegido) elegido.clave = claveDe(p);
      pintar(); tarjeta.repintar();
      return { ok: true };
    },
    silenciar(p) {
      if (p.quien === null) return noEsta(p);
      const k = claveDeElegido(p), esta = acciones.silenciado(p);
      o.voz?.silenciar(p.quien, !esta);
      if (esta) silenciados.delete(k); else silenciados.set(k, p.nombre);
      guardarMarcas();
      decir(esta ? `Vuelves a oír la voz de ${p.nombre}.` : `Ya no oyes la voz de ${p.nombre} (solo tú; no se le avisa).`);
      pintar(); tarjeta.repintar();
      return { ok: true };
    },
    bloquear(p) {
      if (p.quien === null || !o.orden) return noEsta(p);
      const k = claveDeElegido(p), esta = bloqueados.has(k);
      const r = o.orden(`/${esta ? "desbloquear" : "bloquear"} ${p.nombre}`);
      if (!r.ok) { decir(r.why ?? "No se pudo."); return r; }
      if (esta) bloqueados.delete(k); else bloqueados.set(k, p.nombre);
      guardarMarcas();
      decir(esta ? `Vuelves a leer y oír a ${p.nombre}.` : `Ya no lees ni oyes a ${p.nombre}; los demás sí. No se le avisa.`);
      pintar(); tarjeta.repintar();
      return { ok: true };
    },
    denunciar(p) { if (p.quien !== null && o.orden) abrirDenuncia(p); },
    verFicha(p) {
      tarjeta.cerrar();
      const a = buscar(amigos, p);
      elegido = { quien: p.quien, clave: a ? a.clave : claveDe(p) };
      pestana = a ? "amigos" : "aqui";
      vista = "ficha";
      if (panel.abierto) pintar(); else panel.abrir();
    },
  };

  // ---- the report form: a small dialog over everything ----
  const den = el("dialog", { id: "gente-denuncia", className: "panel-j5" });
  den.setAttribute("aria-labelledby", "gente-denuncia-titulo");
  const denT = el("h2", { id: "gente-denuncia-titulo" });
  const denTexto = el("textarea", { id: "gente-denuncia-motivo", rows: 3, maxLength: MOTIVO_MAX, placeholder: "Qué ha pasado" });
  denTexto.setAttribute("aria-label", "Qué ha pasado");
  const denEnviar = botonCon("flag", "Enviar aviso", "peligro"); denEnviar.id = "gente-denuncia-enviar";
  const denCancelar = el("button", { type: "button", textContent: "Cancelar" });
  const denNota = el("p", { className: "gente-letra", textContent: "Lo lee quien modera este mundo: ahora si está conectado y, si no, al entrar. A la otra persona no se le avisa." });
  const denEstado = el("p", { className: "estado" }); denEstado.setAttribute("role", "status");
  den.append(el("header", {}, denT), el("div", { className: "cuerpo" }, denTexto, denNota, el("div", { className: "gente-botones" }, denEnviar, denCancelar), denEstado));
  document.body.appendChild(den);
  let denuncia: Elegido | null = null;
  function abrirDenuncia(p: Elegido): void {
    denuncia = p; denT.textContent = `Denunciar a ${p.nombre}`; denTexto.value = ""; denEstado.textContent = "";
    tarjeta.cerrar();
    den.showModal(); denTexto.focus();
  }
  denCancelar.addEventListener("click", () => den.close());
  denEnviar.addEventListener("click", () => {
    const motivo = denTexto.value.replace(/\s+/g, " ").trim();
    if (!denuncia || !o.orden) return;
    if (!motivo) { denEstado.textContent = "Escribe qué ha pasado."; denTexto.focus(); return; }
    const r = o.orden(`/denunciar ${denuncia.nombre} ${motivo}`);
    if (!r.ok) { denEstado.textContent = r.why ?? "No se pudo enviar."; return; }
    den.close(); decir(`Aviso enviado sobre ${denuncia.nombre}. Gracias.`);
  });
  den.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch

  // ---- drawing ----
  let vista: "lista" | "ficha" = "lista"; // a narrow screen shows one of the two; a wide one shows both
  function fila(p: Elegido, sub: string, conectado: boolean, clave: string): HTMLElement {
    const b = el("button", { type: "button", className: `gente-fila${conectado ? "" : " fuera"}` });
    const sel = !!elegido && (elegido.clave === clave || (p.quien !== null && elegido.quien === p.quien));
    b.setAttribute("aria-current", sel ? "true" : "false");
    b.setAttribute("aria-label", `${p.nombre}, ${conectado ? "conectado" : "desconectado"}, ${sub}`);
    const textos = el("span", { className: "textos" }, el("b", { textContent: p.nombre }), el("span", { className: "sub", textContent: sub }));
    b.append(retrato(base, p.avatar, "busto", 44, !conectado), textos);
    if (conectado) b.append(el("span", { className: "punto" }));
    b.addEventListener("click", () => { elegido = { quien: p.quien, clave }; vista = "ficha"; pintar(); });
    const li = el("div", { className: "gente-item" }, b);
    li.setAttribute("role", "listitem");
    if (p.quien !== null) li.dataset.quien = String(p.quien);
    li.dataset.clave = clave;
    return li;
  }
  const seccion = (t: string) => el("div", { className: "gente-seccion", textContent: t });
  const donde = (quien: number): string => { const d = o.mirada?.distancia(quien); return `${mundo()}${d === null || d === undefined ? "" : ` · ${distanciaTexto(d)}`}`; };

  function pintarLista(): void {
    const q = buscarI.value, t = ahora();
    const f = fusionar(amigos, conectados(), t);
    if (f.cambio) { amigos = f.lista; guardarAmigos(); }
    const g = viajar.estado.gente;
    tabAmigos.textContent = `Amigos · ${amigos.length}`;
    tabAqui.textContent = `Aquí ahora · ${Math.max(viajar.estado.todos, g.length)}`;
    for (const [b, id] of [[tabAmigos, "amigos"], [tabAqui, "aqui"]] as const) { b.setAttribute("aria-selected", String(pestana === id)); b.tabIndex = pestana === id ? 0 : -1; }
    const filas: HTMLElement[] = [];
    if (pestana === "amigos") {
      const on = filtrar(f.conectados.map((x) => ({ ...x, nombre: x.persona.nombre })), q), off = filtrar(f.desconectados, q);
      if (!amigos.length) filas.push(el("p", { className: "vacio", textContent: "Aún no tienes amigos guardados. Elige a alguien en «Aquí ahora» y pulsa «Añadir amigo»." }));
      if (on.length) { filas.push(seccion("Conectados")); for (const x of on) filas.push(fila(deConectado(x.persona), donde(x.persona.quien), true, x.amigo.clave)); }
      if (off.length) { filas.push(seccion("Desconectados")); for (const a of off) filas.push(fila({ quien: null, nombre: a.nombre, avatar: a.avatar ? { id: a.avatar, nombre: "" } : null }, haceTexto(a.visto, t), false, a.clave)); }
      if (amigos.length && !on.length && !off.length) filas.push(el("p", { className: "vacio", textContent: "Nadie se llama así." }));
    } else {
      const lst = filtrar(conectados(), q);
      if (!g.length) filas.push(el("p", { className: "vacio", textContent: "No hay nadie más conectado ahora en este mundo." }));
      else if (!lst.length) filas.push(el("p", { className: "vacio", textContent: "Nadie se llama así." }));
      for (const p of lst) {
        const a = buscar(amigos, p);
        filas.push(fila(deConectado(p), a ? `En tus amigos · ${donde(p.quien)}` : donde(p.quien), true, a ? a.clave : claveDe(p)));
      }
      if (viajar.estado.todos > g.length) filas.push(el("p", { className: "vacio", textContent: `Y ${viajar.estado.todos - g.length} más.` }));
    }
    lista.replaceChildren(...filas);
  }

  function pintarFicha(): void {
    const p = actual();
    if (!p) {
      der.replaceChildren(el("div", { className: "gente-nadie" }, el("p", { textContent: pestana === "amigos" && !amigos.length ? "Tus amigos aparecerán aquí." : "Elige a alguien de la lista para ver su ficha." })));
      return;
    }
    const amigo = buscar(amigos, p), con = p.quien !== null;
    const volver = el("button", { type: "button", className: "gente-volver", textContent: "‹ Volver a la lista" });
    volver.addEventListener("click", () => { vista = "lista"; pintar(); });
    const chip = el("span", { className: `chip${con ? " ok" : ""}` });
    if (con) chip.append(el("span", { className: "punto" }), `En ${mundo()}`); else chip.append("Desconectado");
    const linea = [amigo ? `En tus amigos desde el ${fechaTexto(amigo.desde, ahora())}` : "", p.avatar?.nombre ?? ""].filter(Boolean).join(" · ");
    const datos = el("div", { className: "gente-datos" }, el("div", { className: "gente-titulo" }, el("h3", { className: "gente-nombre", textContent: p.nombre }), chip), el("p", { className: "sub", textContent: linea }));
    // «Ahora»: what they do (when the page knows) and how far
    const ahoraS = el("section", { className: "gente-ahora" }, el("h4", { textContent: "Ahora" }));
    if (con) {
      const que = o.mirada?.actividad(p.quien!), d = o.mirada?.distancia(p.quien!);
      const dist = d === null || d === undefined ? "" : d < 2 ? "a tu lado" : `a ${Math.round(d)} m de ti`;
      ahoraS.append(el("p", { textContent: [que, dist].filter(Boolean).join(" · ") || `En ${mundo()}` }));
    } else ahoraS.append(el("p", { textContent: amigo ? `Desconectado · visto ${haceTexto(amigo.visto, ahora())}` : "Desconectado" }));
    // the main actions
    const ir = botonCon("navigation-arrow", "Ir a su lado", "principal"); ir.id = "gente-ir";
    ir.disabled = !con || !viajar.activo();
    ir.title = !con ? "No está conectado ahora" : viajar.activo() ? `Ir junto a ${p.nombre}` : "En este mundo no se puede ir junto a otros: lo han apagado";
    ir.setAttribute("aria-label", `Ir junto a ${p.nombre}`);
    ir.addEventListener("click", () => acciones.ir(p));
    const msg = botonCon("chat-text", "Mensaje"); msg.id = "gente-mensaje"; msg.disabled = !o.chat || !con;
    msg.title = "Abre el chat con su nombre escrito (el chat lo leen quienes están cerca)";
    msg.addEventListener("click", () => acciones.mensaje(p));
    const sal = botonCon("hand-waving", "Saludar"); sal.id = "gente-saludar"; sal.disabled = !o.saludar || !con;
    sal.title = "Te giras hacia esa persona y saludas con la mano";
    sal.addEventListener("click", () => acciones.saludar(p));
    const principales = el("div", { className: "gente-botones" }, ir, msg, sal);
    // apart: the delicate ones
    const s = acciones.silenciado(p), b = acciones.bloqueado(p);
    const sil = botonCon("speaker-simple-slash", s ? "Oír su voz" : "Silenciar", "fantasma"); sil.id = "gente-silenciar";
    sil.setAttribute("aria-pressed", String(s)); sil.disabled = !con || !o.voz;
    sil.title = "Su voz deja de oírse solo para ti (no se le avisa)";
    sil.addEventListener("click", () => acciones.silenciar(p));
    const blo = botonCon("prohibit", b ? "Desbloquear" : "Bloquear", "fantasma"); blo.id = "gente-bloquear";
    blo.setAttribute("aria-pressed", String(b)); blo.disabled = !con || !o.orden;
    blo.title = "Dejas de leer su chat y de oír su voz (solo tú; no se le avisa)";
    blo.addEventListener("click", () => acciones.bloquear(p));
    const deN = botonCon("flag", "Denunciar", "peligro-texto"); deN.id = "gente-denunciar"; deN.disabled = !con || !o.orden;
    deN.title = "Avisa a quien modera este mundo";
    deN.addEventListener("click", () => acciones.denunciar(p));
    const delicados = el("div", { className: "gente-delicados" }, sil, blo, deN);
    if (amigo) {
      const q = botonCon("x", "Quitar de amigos", "fantasma empuja"); q.id = "gente-quitar";
      q.addEventListener("click", () => acciones.quitar(p));
      delicados.append(q);
    }
    const info = el("div", { className: "gente-info" }, volver, datos, ahoraS, principales, delicados);
    der.replaceChildren(el("div", { className: "gente-figura" }, retrato(base, p.avatar, "cuerpo", 300, !con)), info);
  }

  function pintar(): void {
    pintarLista();
    pintarFicha();
    cuerpoG.dataset.vista = elegido ? vista : "lista";
    const p = actual();
    anadirB.title = p && p.quien !== null && !buscar(amigos, p) ? `Añadir a ${p.nombre} a tus amigos` : "Elige a alguien de «Aquí ahora» para añadirle";
    encontrable.checked = viajar.estado.encontrable;
    filaPermitir.hidden = !viajar.estado.puede;
    permitir.checked = viajar.activo();
  }
  anadirB.addEventListener("click", () => {
    const p = actual();
    if (p && p.quien !== null && !buscar(amigos, p)) { acciones.anadir(p); return; }
    pestana = "aqui"; elegido = null; vista = "lista"; pintar(); buscarI.focus();
    decir("Elige a alguien de la lista y pulsa «Añadir amigo».");
  });
  buscarI.addEventListener("input", () => pintarLista());
  tabs.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { pestana = pestana === "amigos" ? "aqui" : "amigos"; pintar(); (pestana === "amigos" ? tabAmigos : tabAqui).focus(); } });
  encontrable.addEventListener("change", () => { viajar.encontrable(encontrable.checked); });
  permitir.addEventListener("change", () => { viajar.permitir(permitir.checked); });

  // the small card when you click someone in the world
  const tarjeta = montarTarjeta({ acciones, porQuien, vista: o.vista, base, mirada: o.mirada, pedir: () => viajar.pedirGente() });

  // silenced voices come back silenced: whenever the list says who is who, the marks find their entity again
  const reaplicar = () => { if (!o.voz || !silenciados.size) return; for (const p of conectados()) if (silenciados.has(claveDe(p)) || silenciados.has(`n:${normal(p.nombre)}`)) o.voz.silenciar(p.quien, true); };
  viajar.alCambiar((q) => {
    if (q === "viaje" && viajar.estado.viaje) { estadoP.textContent = viajar.estado.viaje.texto; if (!panel.abierto && !viajar.estado.viaje.ok) anunciar(viajar.estado.viaje.texto); }
    if (q === "gente") reaplicar();
    if (panel.abierto) pintar();
    tarjeta.repintar();
  });

  return {
    abrir: () => panel.abrir(), cerrar: () => panel.cerrar(), get abierto() { return panel.abierto; },
    /** Open the panel on this person (the card's «Ver ficha»). */
    elegir: (quien: number) => { const p = porQuien(quien); if (p) acciones.verFicha(p); },
    /** A click landed on this person in the world: their small card (gente-tarjeta.ts). */
    tarjeta: (quien: number) => tarjeta.abrir(quien),
    tarjetaAbierta: () => tarjeta.abierta(),
    cerrarTarjeta: () => tarjeta.cerrar(),
    /** For checks: the friends kept in this browser. */
    amigos: () => amigos.map((a) => ({ ...a })),
    /** Ask the server once who is here (so silenced voices are known before the panel ever opens). */
    pedir,
  };
}
