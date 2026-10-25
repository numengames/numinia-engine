// condiciones/c4: the entry bubble in VR (maqueta 3). ONE flat panel (one canvas → one texture, redrawn only when what it shows or its
// highlight changes) 1.2 m in front of you at eye height, with big letters and few lines per page; and the bubble around you: ONE
// sphere seen from inside, a faint tint that fades in (never dark), bursts when you are let in. Like the menu's panel (menu-invocado.ts)
// it is a `Panel` the hands point at: the ray of either controller + the trigger, a pinch of a tracked hand's ray, or a fingertip that
// touches it press; the stick turns pages (vr.ts hands the push over). render only draws and reports the press: the page decides
// everything (apps/plaza/condiciones-xr.ts, from apps/plaza/condiciones-logica.ts) and hands a `ModeloVR` here.
// c8: the top bar is a handle. Hold the trigger (or a pinch) on it and the panel follows where that hand points; let go and it stays,
// facing the head, between 0,6 and 2 m (the same hold-and-move gesture as the builder's objects, constructor-xr.ts; numbers in the geom file).
// Loaded on demand by vr.ts the first time the page asks (a world without the gate, or a flat screen, never fetches it).
import * as THREE from "three/webgpu";
import type { Panel } from "./manos.ts";
import { COLOR, FUENTE, recortar, envolverPx, rectRedondo } from "./vr-pintura.ts";
import {
  ALTO_M, AYUDA, BARRA, BARRA_ETIQUETA_W, BOTONES_Y, BURBUJA, CABECERA_H, CUERPO, ESTILOS, FILA_NORMAS, LIENZO, LINEA_H, PANEL, PAGINADOR_H, PAGINADOR_Y, PIE_TEXTO_Y, TARJETA, DOTS_MAX,
  arrastreInicio, arrastrePaso, colocarPanel, debeSeguir, desvioGrados, disposicion, estallidoBurbuja, flechaAnt, flechaSig, haciaOjoGrados, ID_BARRA, ID_NORMA, ID_PAG_ANT, ID_PAG_SIG, idBoton, idDato, metrosAPx, miradaPaso,
  opacidadBurbuja, opacidadPanelEstallando, puntos, rectDato, toqueInicio, toquePaso, zonaDe, zonaPorId,
  type EntradaMano, type EstadoArrastre, type EstadoMirada, type EstadoToque, type EstiloLinea, type ModeloVR, type Zona,
} from "./condiciones-vr-geom.ts";

const MONO = "'Geist Mono', ui-monospace, monospace";
const AMBAR = "#EFA517";
const REDIBUJO_MS = 100; // the highlight fades at most every 100 ms: no repaint storms

export type OpcionesCondicionesVR = {
  scene: THREE.Object3D;
  /** a zone was pressed (ray + trigger, pinch, fingertip); the page does what it means and hands a new model */
  alPulsar: (z: Zona) => void;
  /** every press, for a soft click */
  alSonar?: () => void;
  ahora?: () => number;
};

export function createCondicionesVR(h: OpcionesCondicionesVR) {
  const ahora = h.ahora ?? (() => performance.now());
  const c = document.createElement("canvas"); c.width = LIENZO.w; c.height = LIENZO.h;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.anchoM, ALTO_M), mat);
  malla.name = "condiciones-vr"; malla.renderOrder = 20; malla.visible = false; malla.frustumCulled = false;
  h.scene.add(malla);
  // the bubble: a unit sphere scaled to its radius, inside-out (we are in it), flat tint, no depth write
  const bmat = new THREE.MeshBasicMaterial({ color: 0xb8f0f8, transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide });
  const burbuja = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bmat);
  burbuja.name = "condiciones-burbuja-vr"; burbuja.renderOrder = 5; burbuja.visible = false; burbuja.frustumCulled = false; burbuja.scale.setScalar(BURBUJA.radioM);
  h.scene.add(burbuja);

  let vm: ModeloVR | null = null, zonas: Zona[] = [], firmaModelo = "", firma = "";
  let abierto = false, estallaEn = -1, estallaDesde = 0, abiertoEn = 0, encima = 0, encimaEn = 0, pintadoEn = 0, pinturas = 0, recolocadas = 0;
  let toque: EstadoToque = toqueInicio(), mirada: EstadoMirada = { desdeMs: null }, arrastre: EstadoArrastre = arrastreInicio(), movidas = 0;
  const pos = new THREE.Vector3(), ojo = new THREE.Vector3(), nuevaPos = new THREE.Vector3(), frente = new THREE.Vector3(), centro = new THREE.Vector3(), local = new THREE.Vector3();

  const fuente = (e: EstiloLinea): string => `${ESTILOS[e].peso} ${ESTILOS[e].px}px ${FUENTE}`;
  /** The real width of a piece of text in the style the panel will draw it in (the page's paging measures with this). */
  const medir = (texto: string, e: EstiloLinea): number => { g.font = fuente(e); return g.measureText(texto).width; };

  // ── painting ──
  const texto = (t: string, x: number, y: number, px: number, peso: number, color: string, o: { align?: CanvasTextAlign; mono?: boolean; base?: CanvasTextBaseline } = {}): void => {
    g.font = `${peso} ${px}px ${o.mono ? MONO : FUENTE}`; g.fillStyle = color; g.textAlign = o.align ?? "left"; g.textBaseline = o.base ?? "middle"; g.fillText(t, x, y);
  };
  function casilla(r: { x: number; y: number; w: number; h: number }, marcada: boolean, sobre: boolean, o: { fondo: string; borde: string; titulo: string; detalle?: string; etiqueta?: string; oblig?: boolean; px: number }): void {
    rectRedondo(g, r.x, r.y, r.w, r.h, 16); g.fillStyle = sobre ? "rgba(249,235,220,0.14)" : o.fondo; g.fill();
    g.lineWidth = sobre ? 4 : 2; g.strokeStyle = sobre ? COLOR.texto : o.borde; g.stroke();
    const bx = r.x + 28, by = r.y + (o.detalle ? 28 : (r.h - 56) / 2), s = 56;
    rectRedondo(g, bx, by, s, s, 12); g.fillStyle = marcada ? COLOR.accion : "rgba(249,235,220,0.06)"; g.fill();
    g.lineWidth = 4; g.strokeStyle = marcada ? COLOR.accionEncima : COLOR.suave; g.stroke();
    if (marcada) { g.beginPath(); g.moveTo(bx + 13, by + 29); g.lineTo(bx + 24, by + 40); g.lineTo(bx + 44, by + 17); g.lineWidth = 7; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#fff"; g.stroke(); g.lineCap = "butt"; }
    const tx = bx + s + 28, fin = r.x + r.w - 24 - (o.oblig ? 220 : 0);
    g.font = `600 ${o.px}px ${FUENTE}`; g.textBaseline = "middle"; g.textAlign = "left";
    if (o.detalle) {
      let ancho = fin - tx; let t = o.titulo;
      if (o.etiqueta) { g.font = `600 22px ${MONO}`; ancho -= g.measureText(o.etiqueta).width + 44; g.font = `600 ${o.px}px ${FUENTE}`; }
      t = recortar(g, t, ancho); g.fillStyle = COLOR.texto; g.fillText(t, tx, r.y + 46);
      if (o.etiqueta) { const w = g.measureText(t).width; g.font = `600 22px ${MONO}`; const ew = g.measureText(o.etiqueta).width + 24; rectRedondo(g, tx + w + 20, r.y + 28, ew, 36, 8); g.fillStyle = AMBAR; g.fill(); texto(o.etiqueta, tx + w + 32, r.y + 47, 22, 600, "#14110F", { mono: true }); }
      g.font = `400 28px ${FUENTE}`; g.fillStyle = COLOR.suave;
      envolverPx(g, o.detalle.replace(/\s+/g, " "), fin - tx).slice(0, 2).forEach((l, k) => g.fillText(l, tx, r.y + 96 + k * 36));
    } else { g.fillStyle = COLOR.texto; g.fillText(recortar(g, o.titulo, fin - tx), tx, r.y + r.h / 2 + 1); }
    if (o.oblig) texto("OBLIGATORIO", r.x + r.w - 24, r.y + r.h / 2 + 1, 22, 600, AMBAR, { align: "right", mono: true });
  }
  function flecha(r: { x: number; y: number; w: number; h: number }, glifo: string, activa: boolean, sobre: boolean): void {
    rectRedondo(g, r.x, r.y, r.w, r.h, r.h / 2); g.fillStyle = sobre && activa ? "rgba(249,235,220,0.16)" : "rgba(249,235,220,0.05)"; g.fill();
    g.lineWidth = sobre && activa ? 4 : 2; g.strokeStyle = sobre && activa ? COLOR.texto : COLOR.linea; g.stroke();
    texto(glifo, r.x + r.w / 2, r.y + r.h / 2 - 3, 56, 500, activa ? COLOR.texto : COLOR.tenue, { align: "center" });
  }
  function boton(r: { x: number; y: number; w: number; h: number }, t: string, prim: boolean, off: boolean, sobre: boolean): void {
    rectRedondo(g, r.x, r.y, r.w, r.h, 16);
    g.globalAlpha = off ? 0.4 : 1;
    g.fillStyle = prim ? "#F3E6D6" : "rgba(249,235,220,0.04)"; g.fill();
    g.lineWidth = sobre && !off ? 8 : 2; g.strokeStyle = sobre && !off ? "#7FD3DE" : prim ? "#F3E6D6" : COLOR.linea; g.stroke();
    g.font = `600 38px ${FUENTE}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = prim ? "#14110F" : COLOR.texto;
    g.fillText(recortar(g, t, r.w - 28), r.x + r.w / 2, r.y + r.h / 2 + 2);
    g.globalAlpha = 1; g.textAlign = "left";
  }

  function pintar(forzar = false): void {
    if (!vm || (!abierto && !forzar)) return;
    const t = ahora();
    const f = `${firmaModelo}|${encima}|${arrastre.lado ?? ""}`;
    if (!forzar && (f === firma || t - pintadoEn < REDIBUJO_MS)) return;
    pintadoEn = t; firma = f; pinturas++;
    zonas = disposicion(vm);
    const sobre = (id: number): boolean => encima === id;
    g.clearRect(0, 0, LIENZO.w, LIENZO.h);
    rectRedondo(g, TARJETA.x + 1, TARJETA.y + 1, TARJETA.w - 2, TARJETA.h - 2, 28); g.fillStyle = "rgba(20,17,15,0.95)"; g.fill(); g.lineWidth = 2; g.strokeStyle = COLOR.linea; g.stroke();
    // c8: the grab bar: a little handle at the top middle and «Mover» at the right; lit when the ray is on it, solid while held
    const agarrado = arrastre.lado !== null, barraSobre = agarrado || sobre(ID_BARRA);
    if (barraSobre) { rectRedondo(g, BARRA.x - 28, 6, BARRA.w + 56, BARRA.h - 14, 20); g.fillStyle = agarrado ? "rgba(127,211,222,0.22)" : "rgba(249,235,220,0.10)"; g.fill(); g.lineWidth = agarrado ? 4 : 2; g.strokeStyle = agarrado ? "#7FD3DE" : COLOR.linea; g.stroke(); }
    rectRedondo(g, LIENZO.w / 2 - 80, 16, 160, 14, 7); g.fillStyle = agarrado ? "#7FD3DE" : barraSobre ? COLOR.texto : COLOR.tenue; g.fill();
    const colEt = agarrado ? "#7FD3DE" : barraSobre ? COLOR.texto : COLOR.suave, xEt = BARRA.x + BARRA.w - 24, etiqueta = agarrado ? "Suelta donde quieras" : "Agarra y mueve";
    texto(etiqueta, xEt, 46, 26, 500, colEt, { align: "right" });
    const anchoEt = g.measureText(etiqueta).width; g.fillStyle = colEt;
    for (let c = 0; c < 2; c++) for (let r = 0; r < 3; r++) { g.beginPath(); g.arc(xEt - anchoEt - 28 + c * 14, 32 + r * 14, 4, 0, Math.PI * 2); g.fill(); }
    // header: the small line, the title, one explaining line (two at most)
    try { (g as unknown as { letterSpacing: string }).letterSpacing = "4px"; } catch { /* older canvases: no tracking */ }
    g.font = `600 27px ${MONO}`; g.fillStyle = COLOR.verdemar; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(recortar(g, vm.eyebrow.toUpperCase(), LIENZO.w - 96 - BARRA_ETIQUETA_W - 120), 48, 46);
    try { (g as unknown as { letterSpacing: string }).letterSpacing = "0px"; } catch { /* idem */ }
    texto(recortar(g, vm.titulo, LIENZO.w - 96), 48, 104, 62, 700, COLOR.texto);
    g.font = `400 30px ${FUENTE}`; g.fillStyle = COLOR.suave;
    envolverPx(g, vm.subtitulo, LIENZO.w - 96).slice(0, 2).forEach((l, k) => g.fillText(l, 48, 166 + k * 38));
    g.strokeStyle = COLOR.linea; g.lineWidth = 2; g.beginPath(); g.moveTo(0, CABECERA_H); g.lineTo(LIENZO.w, CABECERA_H); g.stroke();
    // the page's lines
    vm.lineas.forEach((l, k) => {
      const y = CUERPO.y + k * LINEA_H + LINEA_H / 2, e = ESTILOS[l.estilo], x = CUERPO.x + e.sangria;
      if (l.estilo === "hueco") return;
      if (l.chip) {
        if (l.estilo === "punto") { rectRedondo(g, CUERPO.x, y - 24, 52, 48, 12); g.fillStyle = "#292420"; g.fill(); g.lineWidth = 2; g.strokeStyle = COLOR.linea; g.stroke(); texto(l.chip, CUERPO.x + 26, y + 1, 28, 600, COLOR.verdemar, { align: "center", mono: true }); }
        else { g.font = `700 24px ${MONO}`; const w = g.measureText(l.chip).width + 28; rectRedondo(g, CUERPO.x, y - 20, w, 40, 8); g.fillStyle = AMBAR; g.fill(); texto(l.chip, CUERPO.x + 14, y + 1, 24, 700, "#14110F", { mono: true }); }
      }
      const color = l.estilo === "antes" || l.estilo === "quitado" ? COLOR.tenue : l.estilo === "nota" || l.estilo === "cuerpo" ? COLOR.suave : l.estilo === "cambiado" ? COLOR.aviso : COLOR.texto;
      g.font = fuente(l.estilo); g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(l.texto, x, y + 1);
      if (l.estilo === "antes") { const w = g.measureText(l.texto).width; g.strokeStyle = COLOR.tenue; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + w, y + 2); g.stroke(); }
    });
    // «Tus datos»: the page's boxes, every one empty until the person fills it
    vm.casillasDatos.forEach((cd, k) => casilla(rectDato(k), cd.marcada, sobre(idDato(k)), { fondo: "rgba(30,26,23,0.7)", borde: COLOR.linea, titulo: cd.texto, detalle: cd.detalle ?? "", etiqueta: cd.etiqueta, px: 36 }));
    // the pager: ‹ ● ○ ○ ○ › and what it moves through
    flecha(flechaAnt, "‹", vm.pagina > 0, sobre(ID_PAG_ANT)); flecha(flechaSig, "›", vm.pagina < vm.paginas - 1, sobre(ID_PAG_SIG));
    if (vm.paginas > 1) {
      if (vm.paginas <= DOTS_MAX) { const sep = Math.min(40, puntos.w / vm.paginas), x0 = puntos.x + (puntos.w - sep * (vm.paginas - 1)) / 2; for (let k = 0; k < vm.paginas; k++) { g.beginPath(); g.arc(x0 + k * sep, puntos.y + PAGINADOR_H / 2, k === vm.pagina ? 11 : 8, 0, Math.PI * 2); g.fillStyle = k === vm.pagina ? COLOR.verdemar : "#3A332D"; g.fill(); } }
      else texto(`${vm.pagina + 1} / ${vm.paginas}`, puntos.x + puntos.w / 2, puntos.y + PAGINADOR_H / 2 + 1, 34, 600, COLOR.verdemar, { align: "center", mono: true });
    }
    if (vm.aviso) { g.font = `500 28px ${FUENTE}`; g.fillStyle = "#ff8a8a"; envolverPx(g, vm.aviso, 780).slice(0, 2).forEach((l, k) => g.fillText(l, 612, PAGINADOR_Y + 26 + k * 34)); }
    else if (vm.enviando) texto("Enviando tu respuesta…", 612, PAGINADOR_Y + PAGINADOR_H / 2 + 1, 32, 500, COLOR.texto);
    else if (vm.notaPaginas) texto(vm.notaPaginas, 612, PAGINADOR_Y + PAGINADOR_H / 2 + 1, 32, 400, COLOR.suave);
    // the box that accepts the norms: always here, whatever page of the text you are on
    if (vm.casillaNormas) casilla(FILA_NORMAS, vm.casillaNormas.marcada, sobre(ID_NORMA), { fondo: "rgba(239,165,23,0.10)", borde: "rgba(239,165,23,0.45)", titulo: vm.casillaNormas.texto, oblig: !!vm.casillaNormas.obligatoria, px: 36 });
    texto(recortar(g, vm.pie, LIENZO.w - 96), 48, PIE_TEXTO_Y, 26, 400, COLOR.tenue, { mono: true });
    // the buttons
    for (const z of zonas) if (z.tipo === "boton") { const b = vm.botones[z.indice]; boton(z, b.texto, b.prim, !z.activa, sobre(z.id)); }
    // the hint under the card (maqueta 3)
    rectRedondo(g, AYUDA.x, AYUDA.y, AYUDA.w, AYUDA.h, AYUDA.h / 2); g.fillStyle = "rgba(20,17,15,0.92)"; g.fill(); g.lineWidth = 2; g.strokeStyle = COLOR.linea; g.stroke();
    const partes: [string, string][] = [["Gatillo", " pulsar"], ["Palanca", " ← → pasar página"], ["Pellizco", " con la mano"], ["Barra de arriba", " mueve el panel"]];
    let ancho = 0; for (const [a, b] of partes) { g.font = `700 26px ${FUENTE}`; ancho += g.measureText(a).width; g.font = `400 26px ${FUENTE}`; ancho += g.measureText(b).width; } ancho += 44 * (partes.length - 1);
    let x = AYUDA.x + (AYUDA.w - ancho) / 2;
    for (const [a, b] of partes) { g.textAlign = "left"; g.font = `700 26px ${FUENTE}`; g.fillStyle = COLOR.texto; g.fillText(a, x, AYUDA.y + AYUDA.h / 2 + 1); x += g.measureText(a).width; g.font = `400 26px ${FUENTE}`; g.fillStyle = COLOR.suave; g.fillText(b, x, AYUDA.y + AYUDA.h / 2 + 1); x += g.measureText(b).width + 44; }
    void BOTONES_Y;
    tex.needsUpdate = true;
  }

  // ── pointing and pressing ──
  const panel: Panel = {
    malla,
    fila(uv) { return abierto && estallaEn < 0 ? zonaDe(uv.x, uv.y, zonas) : 0; },
    encima(n) { encimaEn = ahora(); if (n !== encima) { encima = n; pintar(); } },
    pulsar(n) { pulsarZona(n); },
  };
  function pulsarZona(n: number): void {
    if (!abierto || estallaEn >= 0 || !n) return;
    const z = zonaPorId(zonas, n);
    if (!z || !z.activa || z.tipo === "barra") return; // the bar is held, not pressed: update() moves the panel
    try { h.alSonar?.(); } catch { /* a page's click sound must not break the panel */ }
    h.alPulsar(z);
  }

  // ── placing ──
  function poner(o: THREE.Vector3, mira: THREE.Vector3): void {
    const p = colocarPanel(o, mira);
    pos.set(p.x, p.y, p.z); ojo.copy(o);
    malla.position.copy(pos);
    if (malla.parent) malla.parent.worldToLocal(malla.position);
    malla.lookAt(o.x, pos.y, o.z); // upright, once: it stays where you let it
    malla.updateMatrixWorld(true);
    toque = toqueInicio(); mirada = { desdeMs: null };
  }

  /** c8: the panel goes to world point `p` (already inside the limits), upright and facing the head `o`. */
  function colocarEn(p: { x: number; y: number; z: number }, o: THREE.Vector3): void {
    nuevaPos.set(p.x, p.y, p.z); pos.copy(nuevaPos); ojo.copy(o);
    malla.position.copy(pos);
    if (malla.parent) malla.parent.worldToLocal(malla.position);
    malla.lookAt(o.x, pos.y, o.z);
    malla.updateMatrixWorld(true);
  }

  function mostrar(m: ModeloVR, o: THREE.Vector3, mira: THREE.Vector3): void {
    const nuevo = !abierto || estallaEn >= 0;
    vm = m; firmaModelo = JSON.stringify(m);
    if (nuevo) {
      abierto = true; estallaEn = -1; abiertoEn = ahora(); encima = 0; mat.opacity = 1;
      poner(o, mira); malla.visible = true;
      centro.set(o.x, o.y - 0.2, o.z); burbuja.position.copy(centro); burbuja.scale.setScalar(BURBUJA.radioM); bmat.opacity = 0; burbuja.visible = true;
    }
    pintar(true);
  }
  /** Same panel, a new model (the step, the boxes or the page changed): redrawn only if something differs. */
  function actualizar(m: ModeloVR): void {
    if (!abierto) return;
    const f = JSON.stringify(m); if (f === firmaModelo) return;
    vm = m; firmaModelo = f; pintar(true);
  }
  /** Close: with `estallido`, the bubble swells and goes (~⅓ s) and the panel fades with it; without, at once. */
  function ocultar(estallido = false): void {
    if (!abierto) return;
    if (estallido && estallaEn < 0) { estallaEn = ahora(); estallaDesde = bmat.opacity; return; }
    abierto = false; estallaEn = -1; malla.visible = false; burbuja.visible = false; bmat.opacity = 0; encima = 0; arrastre = arrastreInicio();
  }

  return {
    malla, // MIS-200: so vr.calentar() can link its program while hidden
    /** The panel the hands may point at (only while it is up and not bursting). */
    paneles(): Panel[] { return abierto && estallaEn < 0 ? [panel] : []; },
    mostrar, actualizar, ocultar, medir,
    /** Put it back in front of you now. */
    recolocar(o: THREE.Vector3, mira: THREE.Vector3): void { poner(o, mira); recolocadas++; pintar(true); },
    /** Each frame while presenting: the eyes (position, gaze) and the fingertip of the pointing hand (world, or null). */
    update(o: THREE.Vector3, mira: THREE.Vector3, punta: THREE.Vector3 | null, manos: readonly EntradaMano[] = []): void {
      if (!abierto) return;
      const t = ahora();
      if (estallaEn >= 0) { // bursting: the bubble grows and goes, the panel fades with it
        const b = estallidoBurbuja(t - estallaEn, estallaDesde);
        burbuja.scale.setScalar(BURBUJA.radioM * b.escala); bmat.opacity = b.opacidad; mat.opacity = opacidadPanelEstallando(t - estallaEn);
        if (b.fin) ocultar(false);
        return;
      }
      bmat.opacity = opacidadBurbuja(t - abiertoEn);
      if (debeSeguir(centro, o)) { centro.set(o.x, o.y - 0.2, o.z); burbuja.position.copy(centro); }
      if (encima && t - encimaEn > 150) { encima = 0; }
      // c8: a hand holding the bar moves the panel; it keeps facing the head and stays where it is let go
      const a = arrastrePaso(arrastre, manos, pos, o); const eraAgarrado = arrastre.lado !== null;
      arrastre = a.estado;
      if (a.evento === "coge" || a.evento === "suelta") { encima = a.evento === "coge" ? ID_BARRA : encima; pintar(true); }
      if (a.pos) { colocarEn(a.pos, o); movidas++; } else if (a.evento === "suelta") colocarEn({ x: pos.x, y: pos.y, z: pos.z }, o); // let go: it ends facing the head
      // turned right round: it comes back in front of you after a moment (never while you look at it, nor while you hold it)
      if (arrastre.lado || eraAgarrado) { mirada = { desdeMs: null }; toque = toqueInicio(); pintar(); return; }
      const m = miradaPaso(mirada, desvioGrados(o, mira, pos), t); mirada = m.estado;
      if (m.recolocar) { poner(o, mira); recolocadas++; pintar(true); }
      // a fingertip touching a button presses it (hand tracking)
      if (punta) { malla.worldToLocal(local.copy(punta)); const r = toquePaso(toque, { x: local.x, y: local.y, z: local.z }, zonas, t); toque = r.estado; if (r.id) pulsarZona(r.id); }
      else toque = toquePaso(toque, null, zonas, t).estado;
      pintar();
    },
    get abierto() { return abierto; },
    get estallando() { return estallaEn >= 0; },
    malla, burbuja, lienzo: c,
    /** Press zone `n` as a ray would (checks). */
    pulsar: (n: number) => pulsarZona(n),
    /** For checks: where zone `id` (arrows 1-2, the norms' box 3, data boxes 20+, buttons 100+) is in the world; and by the button's own id. */
    zonaMundo(id: number | string): { x: number; y: number; z: number } | null {
      if (!abierto) return null;
      const z = typeof id === "number" ? zonaPorId(zonas, id) : zonas.find((x) => x.boton === id);
      if (!z) return null;
      malla.updateMatrixWorld();
      const u = (z.x + z.w / 2) / LIENZO.w - 0.5, v = 0.5 - (z.y + z.h / 2) / LIENZO.h;
      const q = new THREE.Vector3(u * PANEL.anchoM, v * ALTO_M, 0.001).applyMatrix4(malla.matrixWorld);
      return { x: q.x, y: q.y, z: q.z };
    },
    /** For checks: what is up, how far, what it says, the bubble's tint, how often it has been painted (cheap on a Quest). */
    estado() {
      malla.updateMatrixWorld();
      const d = abierto && ojo.lengthSq() ? pos.distanceTo(ojo) : 0;
      return {
        abierto, estallando: estallaEn >= 0, encima, pinturas, recolocadas, movidas, agarrado: arrastre.lado,
        titulo: vm?.titulo ?? "", eyebrow: vm?.eyebrow ?? "", pagina: vm?.pagina ?? 0, paginas: vm?.paginas ?? 0, lineas: vm?.lineas.map((l) => l.texto) ?? [],
        casillaNormas: vm?.casillaNormas ? { texto: vm.casillaNormas.texto, marcada: vm.casillaNormas.marcada } : null, casillasDatos: vm?.casillasDatos.map((x) => ({ texto: x.texto, marcada: x.marcada })) ?? [],
        botones: vm?.botones.map((b) => ({ id: b.id, texto: b.texto, desactivado: b.desactivado })) ?? [], aviso: vm?.aviso ?? "",
        diagnostico: { visible: malla.visible, distanciaM: +d.toFixed(2), alturaM: +pos.y.toFixed(2), pos: [pos.x, pos.y, pos.z].map((v) => +v.toFixed(2)), horizontalM: +Math.hypot(pos.x - ojo.x, pos.z - ojo.z).toFixed(2), haciaOjoGrados: +haciaOjoGrados(frente.set(0, 0, 1).applyQuaternion(malla.quaternion), pos, ojo).toFixed(1) },
        burbuja: { visible: burbuja.visible, opacidad: +bmat.opacity.toFixed(3), radio: +burbuja.scale.x.toFixed(2) },
      };
    },
    /** Where the fingertip would land in canvas px (checks). */
    metrosAPx,
  };
}
export type CondicionesVR = ReturnType<typeof createCondicionesVR>;
