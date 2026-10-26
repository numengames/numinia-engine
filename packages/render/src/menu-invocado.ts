// Rediseño v2 (story E, maqueta p7): the VR menu. ONE flat panel 1.0 × 0.611 m, 1.2 m in front of the eyes and a
// little below them (so it leans towards you), STILL: placed once when it opens («Menú» on the watch, or Y), closed by
// «Menú» again, B, its X, or walking 2 m away. Header «Menú» with «Salir de VR» and X; on the left the same sections
// as the computer — Tú · Gente · Bolsa · Misiones · Mapa · Construir · Ajustes — and Chat (v7); on the right the section, filled by
// the page with the SAME data the HTML panels read (apps/plaza/xr-menu.ts). In VR the HTML panels are not drawn, so
// this is a canvas on a plane. You point with the ray of either hand and press with the trigger or a pinch (manos.ts
// tests `paneles()`, calls `fila(uv)` / `encima(n)` and, because the panel has `pulsar`, presses come straight here).
// Numbers and hit-tests: menu-vr.ts. Painting: vr-pintura.ts. Material and order like the panels that work on the
// Quest (default depthTest, renderOrder 20, placed once — not a per-frame lookAt).
import * as THREE from "three/webgpu";
import type { Panel } from "./manos.ts";
import {
  MENU, LIENZO, SECCIONES, ETIQUETAS, ICONOS, CABECERA, CONTENIDO, LISTA, ID_CERRAR, ID_SALIR, cajaCerrar, cajaSalir, cajasLista,
  zonaDe, idBoton, seccionDeId, colocarMenu, demasiadoLejos, filasCaben, rectFila, botonesFila, cajasPaginas, paginar, anguloGrados,
  VISTAS_SUELTAS, type Seccion, type Vista, type Rect,
} from "./menu-vr.ts";
import { disposicionPaleta, TEXTO_PALETA, pxGrosor } from "./menu-paleta.ts";
import { PALETA_TRAZO } from "./trazo-tubo.ts";
import { TEXTO, disposicion, elegirLineas, textoDeMensaje, LINEAS_POR_MENSAJE, type MensajeVR } from "./menu-chat.ts";
import { COLOR, FUENTE, fondoPanel, icono, boton, chip, recortar, envolverPx, rectRedondo, type PathsIcono, type EstiloBoton } from "./vr-pintura.ts";

/** «Salir de VR»: the second press must come within this long of the first (ms) — the same as vr.ts's old button. */
export const SALIR_PIDE_MS = 3000;
const REDIBUJO_MS = 100; // ≤ 10 Hz

export type BotonFila = { texto?: string; icono?: string; accion: () => void; estilo?: EstiloBoton; ancho?: number };
export type FilaMenu = { texto: string; detalle?: string; icono?: string; color?: string; botones?: BotonFila[] };
export type Tono = "ok" | "aviso" | "mal";
export type ContenidoTu = {
  tipo: "tu"; nombre: string; linea: string; chip: { texto: string; tono: Tono }; reserva: string | null;
  carga: { valor: number; max: number } | null; insignias: { nombre: string; conseguida: boolean }[]; retrato: string | null;
};
export type ContenidoLista = { tipo: "lista"; titulo?: string; nota?: string; vacio: string; filas: FilaMenu[] };
export type ContenidoMapa = { tipo: "mapa"; titulo?: string; yo: { x: number; z: number; rumbo?: number } | null; puntos: { nombre: string; x: number; z: number; color: string }[]; filas: FilaMenu[]; vacio: string };
/** v7 «Chat»: the last lines of the chat and the quick phrases (`frases[i].texto` is FRASES[i]; `accion` says it). */
export type ContenidoChat = { tipo: "chat"; titulo?: string; mensajes: MensajeVR[]; vacio: string; nota?: string; frases: { texto: string; accion: () => void; estilo?: EstiloBoton }[] };
/** J18b story 5 «Pincel»: the brush's palette — 8 colours (`hex` is the stroke's colour, `nombre` what it is called), 3 thicknesses (`m` metres, drawn at true width) and 2 verbs. */
export type ContenidoPaleta = {
  tipo: "paleta"; titulo?: string; nota?: string;
  colores: { nombre: string; hex?: string; activo: boolean; accion: () => void }[];
  grosores: { texto: string; detalle?: string; m: number; activo: boolean; accion: () => void }[];
  acciones: { texto: string; icono?: string; estilo?: EstiloBoton; accion: () => void }[];
};
export type Contenido = ContenidoTu | ContenidoLista | ContenidoMapa | ContenidoChat | ContenidoPaleta;
/** What the page gives the menu: each view's content (read at each paint), the sections it cannot show here, and a
 * hook when a view opens (e.g. ask the server who is here). */
export type Proveedor = { contenido(v: Vista): Contenido; desactivadas(): ReadonlySet<Seccion>; alAbrir?(v: Vista): void;
  /** The time in the header beside «Menú» («21:40»); none = no clock. */ hora?(): string };

const TITULO_H = 64; // the title line over a list's rows
const NOTA_FUENTE = `400 26px ${FUENTE}`, NOTA_LINEA = 32, NOTA_LINEAS = 2; // the footer note: its font, line height and most lines

export function createMenuInvocado(h: { scene: THREE.Object3D; salir: () => void; iconos?: PathsIcono; ahora?: () => number; alCerrar?: () => void; alPulsar?: () => void }) {
  const ahora = h.ahora ?? (() => performance.now());
  const c = document.createElement("canvas"); c.width = LIENZO.w; c.height = LIENZO.h;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(MENU.anchoM, MENU.altoM), mat);
  malla.name = "menu-vr"; malla.renderOrder = 20; malla.visible = false;
  h.scene.add(malla);

  let proveedor: Proveedor = { contenido: () => ({ tipo: "lista", vacio: "", filas: [] }), desactivadas: () => new Set() };
  let abierto = false, vista: Vista = "tu", encima = 0, encimaEn = 0, salirPideHasta = 0, firma = "", pintadoEn = 0, pinturas = 0;
  const paginas = new Map<Vista, number>();
  let botones: { rect: Rect; accion: () => void }[] = [];
  const pos = new THREE.Vector3(), ojo = new THREE.Vector3();
  const imagenes = new Map<string, HTMLImageElement | "error">();
  let ultimoContenido: Contenido | null = null;

  function imagen(url: string | null): HTMLImageElement | null {
    if (!url || typeof Image === "undefined") return null;
    const ya = imagenes.get(url);
    if (ya === "error") return null;
    if (ya) return ya.complete && ya.naturalWidth ? ya : null;
    const im = new Image(); im.decoding = "async";
    im.onload = () => pintar(true); im.onerror = () => { imagenes.set(url, "error"); pintar(true); };
    im.src = url; imagenes.set(url, im);
    return null;
  }

  // ── painting ──
  function pintar(forzar = false): void {
    if (!abierto && !forzar) return;
    const t = ahora();
    if (!forzar && t - pintadoEn < REDIBUJO_MS) return; // ≤ 10 Hz: the page's data is not even read more often
    let ct: Contenido;
    try { ct = proveedor.contenido(vista); } catch (e) { ct = { tipo: "lista", vacio: `No se pudo leer: ${String((e as Error)?.message ?? e).slice(0, 80)}`, filas: [] }; }
    const desact = proveedor.desactivadas();
    let hora = ""; try { hora = proveedor.hora?.() ?? ""; } catch { /* the clock must not break the menu */ }
    const f = JSON.stringify([vista, encima, ct, [...desact], t < salirPideHasta, paginas.get(vista) ?? 0, hora], (_, v) => (typeof v === "function" ? 1 : v));
    pintadoEn = t;
    if (!forzar && f === firma) return;
    firma = f; pinturas++; ultimoContenido = ct;
    botones = [];
    fondoPanel(g, LIENZO.w, LIENZO.h);
    // header: «Menú», then «Salir de VR» and X on the right; a line under it
    g.fillStyle = COLOR.texto; g.font = `600 44px ${FUENTE}`; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText("Menú", 40, CABECERA.h / 2);
    if (hora) { const w = g.measureText("Menú").width; g.font = `500 34px ${FUENTE}`; g.fillStyle = COLOR.suave; g.fillText(hora, 40 + w + 28, CABECERA.h / 2 + 2); g.fillStyle = COLOR.texto; }
    const pide = t < salirPideHasta;
    boton(g, cajaSalir(), pide ? "¿Salir? Otra vez" : "Salir de VR", { estilo: "normal", encima: encima === ID_SALIR, icono: "desktop", paths: h.iconos, tam: 30 });
    boton(g, cajaCerrar(), "", { encima: encima === ID_CERRAR, icono: "x", paths: h.iconos });
    g.strokeStyle = COLOR.linea; g.lineWidth = 2; g.beginPath(); g.moveTo(0, CABECERA.h); g.lineTo(LIENZO.w, CABECERA.h); g.stroke();
    g.beginPath(); g.moveTo(LISTA.x + LISTA.w + 16, CABECERA.h); g.lineTo(LISTA.x + LISTA.w + 16, LIENZO.h); g.stroke();
    // the list
    for (const [i, cj] of cajasLista().entries()) {
      const s = SECCIONES[i], activa = s === vista, sobre = encima === cj.id, off = desact.has(s);
      rectRedondo(g, cj.x, cj.y, cj.w, cj.h, 12);
      if (activa || sobre) { g.fillStyle = sobre && !off ? COLOR.filaEncima : COLOR.fila; g.fill(); }
      if (activa) { g.lineWidth = 3; g.strokeStyle = COLOR.foco; g.stroke(); }
      const col = off ? COLOR.tenue : activa || sobre ? COLOR.texto : COLOR.suave;
      icono(g, h.iconos, ICONOS[s], cj.x + 44, cj.y + cj.h / 2, 40, col);
      g.font = `${activa ? 600 : 500} 34px ${FUENTE}`; g.fillStyle = col; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(ETIQUETAS[s], cj.x + 84, cj.y + cj.h / 2 + 1);
    }
    // the content
    g.save(); g.beginPath(); g.rect(CONTENIDO.x, CONTENIDO.y - 4, CONTENIDO.w, CONTENIDO.h + 8); g.clip();
    if (ct.tipo === "tu") pintarTu(ct);
    else if (ct.tipo === "mapa") pintarMapa(ct);
    else if (ct.tipo === "chat") pintarChat(ct);
    else if (ct.tipo === "paleta") pintarPaleta(ct);
    else pintarLista(ct, ct.titulo ?? (vista === "avisos" ? "Avisos" : ""), CONTENIDO.x, CONTENIDO.w);
    g.restore();
    tex.needsUpdate = true;
  }

  function titulo(t: string, x: number): void {
    g.font = `600 36px ${FUENTE}`; g.fillStyle = COLOR.texto; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(t, x, CONTENIDO.y + TITULO_H / 2 - 6);
  }
  function pintarLista(ct: { vacio: string; filas: FilaMenu[]; nota?: string }, tit: string, x0: number, ancho: number): void {
    const th = tit ? TITULO_H : 0;
    if (tit) titulo(tit, x0);
    if (!ct.filas.length) {
      g.font = `400 32px ${FUENTE}`; g.fillStyle = COLOR.suave; g.textAlign = "left"; g.textBaseline = "top";
      envolverPx(g, ct.vacio, ancho - 16).slice(0, 6).forEach((l, i) => g.fillText(l, x0, CONTENIDO.y + th + 8 + i * 44));
      return;
    }
    // the footer note: the whole sentence in up to two lines (never cut with «…»); its room is taken from the rows, and when
    // the rows need a pager instead the pager row takes its place at the bottom
    g.font = NOTA_FUENTE;
    const notaTodas = ct.nota ? envolverPx(g, ct.nota, ancho) : [];
    const notaLineas = notaTodas.length > NOTA_LINEAS ? [...notaTodas.slice(0, NOTA_LINEAS - 1), notaTodas.slice(NOTA_LINEAS - 1).join(" ")] : notaTodas;
    const notaAlto = notaLineas.length ? notaLineas.length * NOTA_LINEA + 8 : 0;
    const caben = filasCaben(th + notaAlto), conPag = ct.filas.length > caben;
    const pp = conPag ? filasCaben(th, true) : caben;
    const pg = paginar(ct.filas, pp, paginas.get(vista) ?? 0);
    paginas.set(vista, pg.pagina);
    for (const [i, fila] of pg.filas.entries()) {
      const r0 = rectFila(i, th), r = { ...r0, x: x0, w: ancho };
      rectRedondo(g, r.x, r.y, r.w, r.h, 12); g.fillStyle = COLOR.fila; g.fill();
      const bs = fila.botones ?? [];
      const rects = botonesFila(r, bs.map((b) => b.ancho ?? (b.texto ? 200 : 84)));
      let tx = r.x + 24;
      if (fila.icono) { icono(g, h.iconos, fila.icono, r.x + 44, r.y + r.h / 2, 40, fila.color ?? COLOR.suave); tx = r.x + 84; }
      const fin = (rects[0]?.x ?? r.x + r.w) - 16;
      g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = fila.color ?? COLOR.texto;
      g.font = `500 32px ${FUENTE}`;
      if (fila.detalle) {
        g.fillText(recortar(g, fila.texto, fin - tx), tx, r.y + 30);
        g.font = `400 24px ${FUENTE}`; g.fillStyle = COLOR.suave; g.fillText(recortar(g, fila.detalle, fin - tx), tx, r.y + 62);
      } else g.fillText(recortar(g, fila.texto, fin - tx), tx, r.y + r.h / 2 + 1);
      for (const [k, b] of bs.entries()) {
        const id = idBoton(botones.length);
        boton(g, rects[k], b.texto ?? "", { estilo: b.estilo ?? "normal", encima: encima === id, icono: b.icono, paths: h.iconos, tam: 30 });
        botones.push({ rect: rects[k], accion: b.estilo === "desactivado" ? () => {} : b.accion });
      }
    }
    if (conPag) {
      const [a, s] = cajasPaginas();
      const ra = { ...a, x: x0 + ancho - (CONTENIDO.x + CONTENIDO.w - a.x) }, rs = { ...s, x: x0 + ancho - (CONTENIDO.x + CONTENIDO.w - s.x) };
      g.font = `400 28px ${FUENTE}`; g.fillStyle = COLOR.suave; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(`${pg.pagina + 1} de ${pg.paginas}`, x0, ra.y + ra.h / 2);
      const idA = idBoton(botones.length);
      boton(g, ra, "Anterior", { estilo: pg.pagina > 0 ? "normal" : "desactivado", encima: encima === idA, tam: 30 });
      botones.push({ rect: ra, accion: () => paginas.set(vista, pg.pagina - 1) });
      const idS = idBoton(botones.length);
      boton(g, rs, "Siguiente", { estilo: pg.pagina < pg.paginas - 1 ? "normal" : "desactivado", encima: encima === idS, tam: 30 });
      botones.push({ rect: rs, accion: () => paginas.set(vista, pg.pagina + 1) });
    }
    if (notaLineas.length && !conPag) {
      g.font = NOTA_FUENTE; g.fillStyle = COLOR.suave; g.textAlign = "left"; g.textBaseline = "alphabetic";
      const fondo = CONTENIDO.y + CONTENIDO.h - 8, primera = fondo - (notaLineas.length - 1) * NOTA_LINEA;
      notaLineas.forEach((l, i) => g.fillText(i === NOTA_LINEAS - 1 ? recortar(g, l, ancho) : l, x0, primera + i * NOTA_LINEA));
    }
  }

  function pintarTu(ct: ContenidoTu): void {
    // the figure: your avatar's full-body portrait, or the house silhouette (the «user» icon)
    const fx = CONTENIDO.x, fy = CONTENIDO.y, fw = 380, fh = CONTENIDO.h;
    rectRedondo(g, fx, fy, fw, fh, 16); g.fillStyle = "rgba(249,235,220,0.04)"; g.fill();
    const im = imagen(ct.retrato);
    if (im) {
      const s = Math.min((fw - 24) / im.naturalWidth, (fh - 24) / im.naturalHeight), w = im.naturalWidth * s, hh = im.naturalHeight * s;
      g.drawImage(im, fx + (fw - w) / 2, fy + (fh - hh) / 2, w, hh);
    } else icono(g, h.iconos, "user", fx + fw / 2, fy + fh / 2 - 20, 260, COLOR.tenue);
    // who you are
    const x = fx + fw + 40, w = CONTENIDO.x + CONTENIDO.w - x;
    let y = fy + 36;
    g.font = `600 52px ${FUENTE}`; g.fillStyle = COLOR.texto; g.textAlign = "left"; g.textBaseline = "middle";
    const nombre = recortar(g, ct.nombre, w - 240);
    g.fillText(nombre, x, y);
    chip(g, x + g.measureText(nombre).width + 24, y - 24, ct.chip.texto, ct.chip.tono);
    y += 56;
    if (ct.linea) { g.font = `400 28px ${FUENTE}`; g.fillStyle = COLOR.suave; g.fillText(recortar(g, ct.linea, w), x, y); }
    y += 64;
    const etiqueta = (t: string) => { g.font = `600 24px ${FUENTE}`; g.fillStyle = COLOR.verdemar; g.textBaseline = "middle"; g.fillText(t.toUpperCase(), x, y); y += 40; };
    if (ct.reserva) {
      etiqueta("Reserva");
      g.font = `400 30px ${FUENTE}`; g.fillStyle = COLOR.texto;
      for (const l of envolverPx(g, ct.reserva, w).slice(0, 2)) { g.fillText(l, x, y); y += 40; }
      y += 16;
    }
    if (ct.carga && ct.carga.max > 0) {
      etiqueta("Carga");
      const v = Math.max(0, Math.min(ct.carga.max, ct.carga.valor)), bw = w - 140;
      rectRedondo(g, x, y - 10, bw, 20, 10); g.fillStyle = "rgba(249,235,220,0.1)"; g.fill();
      rectRedondo(g, x, y - 10, Math.max(20, (bw * v) / ct.carga.max), 20, 10); g.fillStyle = COLOR.verdemar; g.fill();
      g.font = `500 28px ${FUENTE}`; g.fillStyle = COLOR.texto; g.fillText(`${Math.round(v)} / ${Math.round(ct.carga.max)}`, x + bw + 20, y);
      y += 56;
    }
    const si = ct.insignias.filter((b) => b.conseguida).length;
    etiqueta(ct.insignias.length ? `Insignias · ${si} de ${ct.insignias.length}` : "Insignias");
    if (!ct.insignias.length) { g.font = `400 28px ${FUENTE}`; g.fillStyle = COLOR.suave; g.fillText("Aún ninguna: las dan las misiones.", x, y); return; }
    const lado = 84, hueco = 16, porFila = Math.max(1, Math.floor((w + hueco) / (lado + hueco)));
    for (const [i, b] of ct.insignias.slice(0, porFila * 2).entries()) {
      const bx = x + (i % porFila) * (lado + hueco), by = y - 14 + Math.floor(i / porFila) * (lado + hueco);
      rectRedondo(g, bx, by, lado, lado, 12); g.fillStyle = COLOR.fila; g.fill();
      g.lineWidth = 2; g.strokeStyle = b.conseguida ? COLOR.aviso : COLOR.linea; g.stroke();
      icono(g, h.iconos, b.conseguida ? "target" : "lock-key", bx + lado / 2, by + lado / 2, 44, b.conseguida ? COLOR.aviso : COLOR.tenue);
    }
  }

  function pintarChat(ct: ContenidoChat): void {
    const d = disposicion();
    titulo(ct.titulo ?? "Chat", d.titulo.x);
    // the box with the last lines, newest at the bottom; each message wraps to at most LINEAS_POR_MENSAJE lines
    const m = d.mensajes;
    rectRedondo(g, m.x, m.y, m.w, m.h, 12); g.fillStyle = COLOR.fila; g.fill();
    g.font = `500 ${TEXTO.mensaje}px ${FUENTE}`; g.textAlign = "left"; g.textBaseline = "middle";
    if (!ct.mensajes.length) {
      g.fillStyle = COLOR.suave;
      envolverPx(g, ct.vacio, m.w - 48).slice(0, 4).forEach((l, i) => g.fillText(l, m.x + 24, m.y + 16 + TEXTO.linea / 2 + i * TEXTO.linea));
    } else {
      const envueltos = ct.mensajes.map((x: MensajeVR) => {
        const ls = envolverPx(g, textoDeMensaje(x), m.w - 48);
        return ls.length > LINEAS_POR_MENSAJE ? [...ls.slice(0, LINEAS_POR_MENSAJE - 1), recortar(g, ls.slice(LINEAS_POR_MENSAJE - 1).join(" "), m.w - 48)] : ls;
      });
      const elegidos = elegirLineas(envueltos, d.lineasCaben);
      const primero = ct.mensajes.length - elegidos.length;
      let fila = 0;
      for (const [i, ls] of elegidos.entries()) {
        const msg = ct.mensajes[primero + i], pref = msg.quien ? `${msg.quien}:` : "";
        const color = msg.clase === "aviso" ? COLOR.aviso : COLOR.texto;
        for (const [k, l] of ls.entries()) {
          const y = m.y + 16 + TEXTO.linea / 2 + fila * TEXTO.linea, x = m.x + 24;
          if (k === 0 && pref && l.startsWith(pref)) {
            g.fillStyle = msg.clase === "yo" ? COLOR.verdemar : COLOR.aviso; g.fillText(pref, x, y);
            g.fillStyle = color; g.fillText(l.slice(pref.length), x + g.measureText(pref).width, y);
          } else { g.fillStyle = color; g.fillText(l, x, y); }
          fila++;
        }
      }
    }
    // the quick phrases: a 2 × 3 grid of buttons; each is a content button (idBoton(i)), pressed with ray + trigger
    for (const [i, f] of ct.frases.entries()) {
      const r = d.frases[i]; if (!r) break;
      const id = idBoton(botones.length);
      boton(g, r, f.texto, { estilo: f.estilo ?? "normal", encima: encima === id, tam: TEXTO.frase });
      botones.push({ rect: r, accion: f.estilo === "desactivado" ? () => {} : f.accion });
    }
    if (ct.nota) { g.font = `400 ${TEXTO.nota}px ${FUENTE}`; g.fillStyle = COLOR.suave; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(recortar(g, ct.nota, d.nota.w), d.nota.x, d.nota.y + d.nota.h / 2); }
  }

  function pintarPaleta(ct: ContenidoPaleta): void {
    const d = disposicionPaleta();
    titulo(ct.titulo ?? "Pincel", d.titulo.x);
    // the eight colours: flat swatches (the stroke's own colour), the chosen one ringed and ticked
    for (const [i, c] of ct.colores.entries()) {
      const r = d.colores[i]; if (!r) break;
      const id = idBoton(botones.length), sobre = encima === id;
      rectRedondo(g, r.x, r.y, r.w, r.h, 16); g.fillStyle = c.hex ?? PALETA_TRAZO[i] ?? COLOR.fila; g.fill();
      g.lineWidth = c.activo ? 8 : sobre ? 5 : 2; g.strokeStyle = c.activo ? COLOR.foco : sobre ? COLOR.texto : COLOR.linea; g.stroke();
      if (c.activo) icono(g, h.iconos, "check", r.x + r.w / 2, r.y + r.h / 2, 56, i === 7 ? COLOR.texto : "#2a2420");
      botones.push({ rect: r, accion: c.accion });
    }
    const activo = ct.colores.find((c) => c.activo);
    g.font = `500 ${TEXTO_PALETA.etiqueta}px ${FUENTE}`; g.fillStyle = COLOR.suave; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(activo ? `Color: ${activo.nombre} · grosor` : "Color · grosor", d.etiquetaGrosor.x, d.etiquetaGrosor.y + d.etiquetaGrosor.h / 2);
    // the three thicknesses: a line of the true width beside the words
    for (const [i, gr] of ct.grosores.entries()) {
      const r = d.grosores[i]; if (!r) break;
      const id = idBoton(botones.length), sobre = encima === id;
      boton(g, r, "", { estilo: gr.activo ? "accion" : "normal", encima: sobre });
      const px = pxGrosor(gr.m), cy = r.y + r.h / 2;
      // the sample line sits in the left 150 px (a short stroke centred at 90 px, its round caps included); the words in the rest, name over size
      const largo = Math.max(0, 60 - px);
      g.save(); g.lineCap = "round"; g.lineWidth = px; g.strokeStyle = activo?.hex ?? PALETA_TRAZO[ct.colores.findIndex((c) => c.activo)] ?? COLOR.texto;
      g.beginPath(); g.moveTo(r.x + 90 - largo / 2, cy); g.lineTo(r.x + 90 + largo / 2, cy); g.stroke(); g.restore();
      g.textAlign = "left"; g.textBaseline = "middle"; g.font = `600 ${TEXTO_PALETA.boton}px ${FUENTE}`; g.fillStyle = COLOR.texto;
      g.fillText(recortar(g, gr.texto, r.w - 176), r.x + 168, gr.detalle ? cy - 15 : cy + 1);
      if (gr.detalle) { g.font = `400 ${TEXTO_PALETA.nota}px ${FUENTE}`; g.fillStyle = COLOR.suave; g.fillText(recortar(g, gr.detalle, r.w - 176), r.x + 168, cy + 22); }
      botones.push({ rect: r, accion: gr.accion });
    }
    for (const [i, a] of ct.acciones.entries()) {
      const r = d.acciones[i]; if (!r) break;
      const id = idBoton(botones.length);
      boton(g, r, a.texto, { estilo: a.estilo ?? "normal", encima: encima === id, icono: a.icono, paths: h.iconos, tam: TEXTO_PALETA.boton });
      botones.push({ rect: r, accion: a.estilo === "desactivado" ? () => {} : a.accion });
    }
    if (ct.nota) { g.font = `400 ${TEXTO_PALETA.nota}px ${FUENTE}`; g.fillStyle = COLOR.suave; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(recortar(g, ct.nota, d.nota.w), d.nota.x, d.nota.y + d.nota.h / 2); }
  }

  function pintarMapa(ct: ContenidoMapa): void {
    const lado = 420, x0 = CONTENIDO.x, y0 = CONTENIDO.y;
    rectRedondo(g, x0, y0, lado, lado, 16); g.fillStyle = "rgba(249,235,220,0.04)"; g.fill(); g.lineWidth = 2; g.strokeStyle = COLOR.linea; g.stroke();
    // a view from above: north up, the places and you, scaled to fit what there is
    const todos = [...ct.puntos, ...(ct.yo ? [{ x: ct.yo.x, z: ct.yo.z }] : [])];
    if (todos.length) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of todos) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
      const span = Math.max(10, maxX - minX, maxZ - minZ) * 1.15, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, s = (lado - 40) / span;
      const aPx = (x: number, z: number): [number, number] => [x0 + lado / 2 + (x - cx) * s, y0 + lado / 2 + (z - cz) * s];
      for (const p of ct.puntos) { const [px, py] = aPx(p.x, p.z); g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fillStyle = p.color; g.fill(); }
      if (ct.yo) {
        const [px, py] = aPx(ct.yo.x, ct.yo.z), a = ((ct.yo.rumbo ?? 0) * Math.PI) / 180;
        g.save(); g.translate(px, py); g.rotate(a); g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(-11, 12); g.closePath();
        g.fillStyle = "#e07a3f"; g.fill(); g.restore();
      }
    }
    g.font = `600 26px ${FUENTE}`; g.fillStyle = COLOR.suave; g.textAlign = "center"; g.textBaseline = "top"; g.fillText("N", x0 + lado / 2, y0 + 8);
    const lx = x0 + lado + 24;
    pintarLista(ct, ct.titulo ?? "Sitios", lx, CONTENIDO.x + CONTENIDO.w - lx);
  }

  // ── pointing and pressing ──
  const panel: Panel = {
    malla,
    fila(uv) { return zonaDe(uv.x, uv.y, botones.map((b) => b.rect), proveedor.desactivadas()); },
    encima(n) { encimaEn = ahora(); if (n !== encima) { encima = n; pintar(true); } },
    pulsar(n) { pulsarZona(n); },
  };
  function pulsarZona(n: number): void {
    if (!abierto || !n) return;
    try { h.alPulsar?.(); } catch { /* a page's click sound must not break the menu */ }
    if (n === ID_CERRAR) { cerrar(); return; }
    if (n === ID_SALIR) {
      if (ahora() < salirPideHasta) { salirPideHasta = 0; cerrar(); h.salir(); return; }
      salirPideHasta = ahora() + SALIR_PIDE_MS; pintar(true); return;
    }
    const s = seccionDeId(n);
    if (s) { ir(s); return; }
    const b = botones[n - idBoton(0)];
    if (b) { try { b.accion(); } catch (e) { console.warn("[menu-vr]", e); } pintar(true); }
  }
  function ir(v: Vista): void {
    if (!VISTAS_SUELTAS.includes(v) && proveedor.desactivadas().has(v)) return;
    vista = v; salirPideHasta = 0;
    try { proveedor.alAbrir?.(v); } catch { /* the page's hook must not break the menu */ }
    if (abierto) pintar(true);
  }

  function abrir(ojoPos: THREE.Vector3, mira: THREE.Vector3, en?: Vista): boolean {
    const p = colocarMenu(ojoPos, mira);
    if (!p) return false;
    pos.set(p.x, p.y, p.z); ojo.copy(ojoPos);
    malla.position.copy(pos);
    if (malla.parent) malla.parent.worldToLocal(malla.position);
    malla.lookAt(ojo); // once: it stays where you let it, facing where you were (leaning back, as it is below the eyes)
    malla.updateMatrixWorld(true);
    abierto = true; malla.visible = true; encima = 0; salirPideHasta = 0;
    ir(en ?? vista);
    pintar(true);
    return true;
  }
  function cerrar(): boolean {
    const estaba = abierto; abierto = false; malla.visible = false; encima = 0; salirPideHasta = 0;
    if (estaba) h.alCerrar?.();
    return estaba;
  }

  return {
    malla, // MIS-200: so vr.calentar() can link its program while hidden
    /** The panel manos.ts may point at (only while open). */
    paneles(): Panel[] { return abierto ? [panel] : []; },
    /** The page's data for each view. */
    proveedor(p: Proveedor): void { proveedor = p; firma = ""; },
    abrir, cerrar, ir,
    /** «Menú» / Y: open in front of the eyes or close. Returns whether it is open now. */
    alternar(ojoPos: THREE.Vector3, mira: THREE.Vector3, en?: Vista): boolean { if (abierto) { cerrar(); return false; } return abrir(ojoPos, mira, en); },
    /** Each frame while presenting: the eyes' world position. Closes itself 2 m away; clears a stale highlight. */
    update(ojoPos: THREE.Vector3): void {
      if (!abierto) return;
      if (demasiadoLejos(ojoPos, pos)) { cerrar(); return; }
      if (encima && ahora() - encimaEn > 150) encima = 0;
      pintar();
    },
    get abierto() { return abierto; },
    get vista() { return vista; },
    malla, lienzo: c,
    /** Paint now even when closed (checks, pictures). */
    pintar: () => pintar(true),
    /** Press zone `n` as a ray would (checks). */
    pulsar: (n: number) => pulsarZona(n),
    /** For checks: the state, the content's buttons and what a real headset needs read when something «shows only a dot». */
    estado() {
      malla.updateMatrixWorld();
      const s = new THREE.Vector3(); malla.getWorldScale(s);
      const d = abierto && ojo.lengthSq() ? pos.distanceTo(ojo) : 0;
      return {
        abierto, vista, encima, secciones: SECCIONES.map((x) => ({ id: x, nombre: ETIQUETAS[x], activa: !proveedor.desactivadas().has(x) })),
        contenido: ultimoContenido?.tipo ?? null, filas: ultimoContenido && "filas" in ultimoContenido ? ultimoContenido.filas.map((f) => f.texto) : ultimoContenido?.tipo === "chat" ? ultimoContenido.mensajes.map(textoDeMensaje) : ultimoContenido?.tipo === "paleta" ? ultimoContenido.colores.map((c) => c.nombre) : [],
        botones: botones.length, pinturas,
        diagnostico: { visible: malla.visible, distanciaM: +d.toFixed(2), escalaMundo: +s.x.toFixed(3), anchoVisualGrados: +anguloGrados(MENU.anchoM * s.x, d || MENU.distM).toFixed(1), pos: [pos.x, pos.y, pos.z].map((v) => +v.toFixed(2)) },
      };
    },
    /** For checks: where zone `id` (header 1-2, list 10-16, content buttons 100+) sits in the world. */
    zonaMundo(id: number): { x: number; y: number; z: number } | null {
      if (!abierto) return null;
      const r: Rect | undefined = id === ID_CERRAR ? cajaCerrar() : id === ID_SALIR ? cajaSalir() : seccionDeId(id) ? cajasLista()[id - 10] : botones[id - idBoton(0)]?.rect;
      if (!r) return null;
      malla.updateMatrixWorld();
      const u = (r.x + r.w / 2) / LIENZO.w, v = (r.y + r.h / 2) / LIENZO.h;
      const q = new THREE.Vector3((u - 0.5) * MENU.anchoM, (0.5 - v) * MENU.altoM, 0.001).applyMatrix4(malla.matrixWorld);
      return { x: q.x, y: q.y, z: q.z };
    },
  };
}
export type MenuInvocado = ReturnType<typeof createMenuInvocado>;
