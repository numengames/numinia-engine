// web (N17): web screens in the world. Each screen is a panel (one plane, one canvas texture: its title, its site, a
// short text and a button) that every device draws, plus — on a computer or a phone, near it, outside XR — the real
// page in an iframe laid over the panel with CSS 3D transforms (three.js' CSS3DRenderer, MIT, loaded with the first
// screen: the trick Hyperfy and every «web page in 3D» demo use). The DOM layer sits on top of the canvas, so the page
// is read, scrolled and clicked like any page; what stands between you and it is not drawn over it, so the iframe
// only shows within VER_IFRAME_M, in front of the camera, and when no solid box of the world (U10) stands in the way.
// Inside VR/AR there is no DOM in the headset's picture (WebXR draws only WebGL): the panel is the preview, and its
// button is a ray target («Abrir fuera de VR») that hands the screen to the page (`alAbrirFuera`): the page leaves VR
// and offers the link. A site that refuses to be framed is a card with an «Abrir» link on every device (no iframe).
// The iframe: sandbox without top navigation, no camera/microphone/geolocation/… (allow = 'none'), no referrer.
import * as THREE from "three/webgpu";
import type { Panel } from "./manos.ts";

import { VER_IFRAME_M, QUITAR_IFRAME_M, PX_ANCHO, SANDBOX, PERMISOS, PERMISOS_VIDEO, tapadoPorCajas, puntoEnCuadrilatero } from "./web-politica.ts";
export { VER_IFRAME_M, QUITAR_IFRAME_M, PX_ANCHO, SANDBOX, PERMISOS, PERMISOS_VIDEO, tapadoPorCajas };

export type PantallaVista = { id: string; url: string; titulo: string; texto: string; x: number; y: number; z: number; ry: number; ancho: number; alto: number; enmarcar: boolean;
  /** A video screen: the address of the player as it should start RIGHT NOW (already some seconds in). The page (composition root) builds it; render knows nothing of features/. */
  reproductor?: () => string };
export type EstadoPantalla = { id: string; dom: boolean; iframe: boolean; tarjeta: boolean; motivo: string; dist: number };

/** The bar over the page (title, site, «Abrir en pestaña»), CSS px. */
const BARRA_PX = 60;

type Css = { CSS3DRenderer: new () => { domElement: HTMLElement; setSize(w: number, h: number): void; render(s: THREE.Object3D, c: THREE.Camera): void }; CSS3DObject: new (e: HTMLElement) => THREE.Object3D & { element: HTMLElement } };
type Una = { p: PantallaVista; malla: THREE.Mesh; c: HTMLCanvasElement; tex: THREE.CanvasTexture; firma: string; modoXR: boolean; encima: boolean;
  el: HTMLDivElement | null; obj: (THREE.Object3D & { element: HTMLElement }) | null; iframe: HTMLIFrameElement | null; panel: Panel; estado: EstadoPantalla };

const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const envolver = (g: CanvasRenderingContext2D, t: string, max: number) => {
  const out: string[] = [];
  let l = "";
  for (const w of t.split(/\s+/).filter(Boolean)) { const n = l ? `${l} ${w}` : w; if (g.measureText(n).width > max && l) { out.push(l); l = w; } else l = n; }
  if (l) out.push(l);
  return out;
};

/** `agujero` (H8, hole-punch): when it answers true the page layer is drawn UNDER the canvas and each live screen's panel punches a hole
 * (transparent pixels, depth-tested) in the canvas, so an avatar or any solid thing in front of the screen is drawn over the page instead of
 * vanishing behind it. The render only says yes on a desktop (a canvas with alpha, a mouse to find the hole) and with no post-processing
 * pass (it would drop the canvas' alpha); otherwise the page stays over the canvas as before (the known limit). */
export function crearPantallasWeb(h: { world: THREE.Object3D; camera: THREE.PerspectiveCamera; enXR: () => boolean; cajas: () => ArrayLike<number>; padre?: HTMLElement; agujero?: () => boolean; lienzo?: HTMLElement }) {
  const pantallas = new Map<string, Una>();
  let css: Css | null = null, cargando: Promise<unknown> | null = null;
  let r3: InstanceType<Css["CSS3DRenderer"]> | null = null;
  const escenaCss = new THREE.Scene();
  const oyentes = new Set<(p: PantallaVista) => void>();
  let ultimoXR = false;
  // H8: the punched hole = a material that writes (0,0,0,0) where it passes the depth test
  const hueco = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: true, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.ZeroFactor });
  let conAgujero = false, fondoCuerpo: string | null = null;
  const PUNTEROS = { x: -1, y: -1 };
  /** The four corners of each punched screen on the client, to let the mouse reach the page through the canvas. */
  function cuadrilatero(u: Una, out: { x: number; y: number }[]): boolean {
    const w = u.p.ancho / 2, hh = u.p.alto / 2, v = new THREE.Vector3();
    u.malla.updateWorldMatrix(true, false);
    out.length = 0;
    for (const [x, y] of [[-w, hh], [w, hh], [w, -hh], [-w, -hh]]) {
      v.set(x, y, 0).applyMatrix4(u.malla.matrixWorld).project(h.camera);
      if (v.z > 1 || v.z < -1) return false;
      out.push({ x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight });
    }
    return true;
  }
  function alPuntero(e: PointerEvent): void {
    PUNTEROS.x = e.clientX; PUNTEROS.y = e.clientY;
    if (!conAgujero || !h.lienzo || e.buttons !== 0) return; // a drag that began on the world keeps the canvas
    let dentro = false;
    const q: { x: number; y: number }[] = [];
    for (const u of pantallas.values()) if (u.estado.dom && u.estado.iframe && cuadrilatero(u, q) && puntoEnCuadrilatero(q, e.clientX, e.clientY)) { dentro = true; break; }
    h.lienzo.style.pointerEvents = dentro ? "none" : "";
  }
  if (h.agujero && h.lienzo) addEventListener("pointermove", alPuntero, { capture: true, passive: true });

  const cargar = () => (cargando ??= import("three/addons/renderers/CSS3DRenderer.js").then((m) => {
    css = m as unknown as Css;
    r3 = new css.CSS3DRenderer();
    const capa = r3.domElement;
    capa.id = "web-capa";
    // positioned and FIRST in the body: over the canvas (which is not positioned), under every later positioned HUD
    Object.assign(capa.style, { position: "fixed", left: "0", top: "0", pointerEvents: "none", zIndex: conAgujero ? "-1" : "" });
    (h.padre ?? document.body).prepend(capa);
    r3.setSize(innerWidth, innerHeight);
    addEventListener("resize", () => r3?.setSize(innerWidth, innerHeight));
    for (const u of pantallas.values()) montarDom(u);
  }).catch((e) => { console.warn(`[web] no se pudo cargar CSS3D: ${(e as Error)?.message ?? e}`); }));

  function pintar(u: Una, xr: boolean): void {
    const firma = JSON.stringify([u.p.titulo, u.p.url, u.p.texto, u.p.enmarcar, xr, u.encima]);
    if (firma === u.firma) return;
    u.firma = firma; u.modoXR = xr;
    const c = u.c, g = c.getContext("2d")!, W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#141c26"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#ffd27a"; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = "#ffd27a"; g.font = "bold 58px sans-serif"; g.fillText(u.p.titulo.slice(0, 40), 40, 90, W - 80);
    g.fillStyle = "#9fd8d0"; g.font = "36px sans-serif"; g.fillText(host(u.p.url), 40, 142, W - 80);
    g.fillStyle = "#ffffff"; g.font = "34px sans-serif";
    const texto = u.p.texto || (xr ? "Dentro de VR no se puede mostrar una página web: ábrela fuera y vuelve cuando quieras." : u.p.enmarcar ? "Acércate para usar la página." : "Esta web no deja que otras páginas la muestren dentro: ábrela en una pestaña.");
    const BOTON_H = Math.round(H * 0.2);
    let y = 200;
    for (const l of envolver(g, texto, W - 80)) { if (y > H - BOTON_H - 30) break; g.fillText(l, 40, y); y += 44; }
    if (xr || !u.p.enmarcar) { // the button the VR ray presses (in VR), or the card's hint (PC/phone far away)
      const bx = W * 0.2, by = H - BOTON_H - 24, bw = W * 0.6, bh = BOTON_H;
      g.fillStyle = u.encima ? "#ffd27a" : "rgba(255,210,122,0.18)"; g.fillRect(bx, by, bw, bh);
      g.strokeStyle = "#ffd27a"; g.lineWidth = 4; g.strokeRect(bx, by, bw, bh);
      g.fillStyle = u.encima ? "#141c26" : "#ffffff"; g.font = `bold ${Math.round(Math.min(44, bh * 0.45))}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(xr ? "Abrir fuera de VR ↗" : `Abrir ${host(u.p.url)} ↗`, W / 2, by + bh / 2, bw - 20);
      g.textAlign = "start"; g.textBaseline = "alphabetic";
    }
    u.tex.needsUpdate = true;
  }

  function montarDom(u: Una): void {
    if (!css || u.el) return;
    const altoPx = Math.round((PX_ANCHO * u.p.alto) / u.p.ancho);
    const el = document.createElement("div");
    el.className = "web-pantalla"; el.dataset.id = u.p.id;
    Object.assign(el.style, { width: `${PX_ANCHO}px`, height: `${altoPx}px`, display: "flex", flexDirection: "column", background: "#141c26", color: "#eef2f6", border: "6px solid #ffd27a", borderRadius: "10px", boxSizing: "border-box", overflow: "hidden", pointerEvents: "auto", backfaceVisibility: "hidden", font: "28px system-ui, sans-serif" });
    const barra = document.createElement("div");
    Object.assign(barra.style, { display: "flex", alignItems: "center", gap: "18px", padding: "0 16px", height: `${BARRA_PX}px`, boxSizing: "border-box", background: "#1f2a36", flex: "0 0 auto" });
    const t = document.createElement("strong"); t.textContent = u.p.titulo; Object.assign(t.style, { color: "#ffd27a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    const hs = document.createElement("span"); hs.textContent = host(u.p.url); Object.assign(hs.style, { color: "#9fd8d0", flex: "1 1 auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
    const a = document.createElement("a");
    a.href = u.p.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.className = "web-abrir"; a.textContent = "Abrir en pestaña ↗";
    Object.assign(a.style, { color: "#141c26", background: "#ffd27a", padding: "6px 14px", borderRadius: "8px", textDecoration: "none", fontWeight: "bold", whiteSpace: "nowrap" });
    barra.append(t, hs, a);
    el.append(barra);
    if (!u.p.enmarcar) {
      const tarjeta = document.createElement("div");
      tarjeta.className = "web-tarjeta";
      Object.assign(tarjeta.style, { flex: "1 1 auto", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "28px", padding: "40px", textAlign: "center" });
      const pt = document.createElement("p"); pt.textContent = u.p.texto || "Esta web no deja que otras páginas la muestren dentro (lo decide su servidor)."; Object.assign(pt.style, { margin: "0", fontSize: "40px", lineHeight: "1.3", maxWidth: "1000px" });
      const ga = document.createElement("a");
      ga.href = u.p.url; ga.target = "_blank"; ga.rel = "noopener noreferrer"; ga.className = "web-abrir-grande"; ga.textContent = `Abrir ${host(u.p.url)} ↗`;
      Object.assign(ga.style, { color: "#141c26", background: "#ffd27a", padding: "18px 40px", borderRadius: "14px", textDecoration: "none", fontWeight: "bold", fontSize: "48px" });
      tarjeta.append(pt, ga);
      el.append(tarjeta);
    }
    const obj = new css.CSS3DObject(el);
    u.malla.updateWorldMatrix(true, false);
    u.malla.matrixWorld.decompose(obj.position, obj.quaternion, new THREE.Vector3());
    obj.scale.setScalar(u.p.ancho / PX_ANCHO);
    obj.visible = false;
    escenaCss.add(obj);
    u.el = el; u.obj = obj;
  }
  function ponerIframe(u: Una): void {
    if (!u.el || u.iframe || !u.p.enmarcar) return;
    try { if (new URL(u.p.url).origin === location.origin) return; } catch { return; } // never this page's own origin: the sandbox would not hold
    const f = document.createElement("iframe");
    const vid = u.p.reproductor;
    f.src = vid ? vid() : u.p.url; f.title = u.p.titulo; f.className = "web-iframe";
    f.setAttribute("sandbox", SANDBOX);
    f.setAttribute("allow", vid ? PERMISOS_VIDEO : PERMISOS);
    f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("loading", "eager");
    // an explicit height: an iframe in a flex column keeps its default 150 px in some engines
    Object.assign(f.style, { display: "block", width: "100%", height: `${Math.round((PX_ANCHO * u.p.alto) / u.p.ancho) - BARRA_PX - 12}px`, border: "0", background: "#ffffff", flex: "0 0 auto" });
    u.el.append(f);
    u.iframe = f;
  }
  function quitarIframe(u: Una): void { u.iframe?.remove(); u.iframe = null; }

  function quitar(id: string): void {
    const u = pantallas.get(id);
    if (!u) return;
    h.world.remove(u.malla); u.malla.geometry.dispose(); ((u.malla.userData as { mat?: THREE.Material }).mat ?? (u.malla.material as THREE.Material)).dispose(); u.tex.dispose();
    if (u.obj) { escenaCss.remove(u.obj); u.el?.remove(); }
    pantallas.delete(id);
  }

  const ojo = new THREE.Vector3(), centro = new THREE.Vector3(), normal = new THREE.Vector3(), frente = new THREE.Vector3();
  return {
    /** Put (or redo) the screen with this id. */
    poner(p: PantallaVista): void {
      const antes = pantallas.get(p.id);
      if (antes && JSON.stringify(antes.p) === JSON.stringify(p)) return;
      if (antes) quitar(p.id);
      const W = 1024, H = Math.max(256, Math.min(1024, Math.round((W * p.alto) / p.ancho)));
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const malla = new THREE.Mesh(new THREE.PlaneGeometry(p.ancho, p.alto), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      malla.position.set(p.x, p.y, p.z); malla.rotation.y = (p.ry * Math.PI) / 180;
      malla.name = `web:${p.id}`;
      h.world.add(malla);
      const u: Una = { p, malla, c, tex, firma: "", modoXR: false, encima: false, el: null, obj: null, iframe: null, panel: null as unknown as Panel, estado: { id: p.id, dom: false, iframe: false, tarjeta: !p.enmarcar, motivo: "", dist: Infinity } };
      const BOTON = 0.2 + 24 / H; // the button's band, from the bottom (uv.y)
      u.panel = {
        malla,
        fila: (uv) => (uv.y <= BOTON && uv.y >= 24 / H && uv.x >= 0.2 && uv.x <= 0.8 ? 1 : 0),
        encima: (n) => { const e = n === 1; if (e !== u.encima) { u.encima = e; pintar(u, ultimoXR); } },
        pulsar: (n) => { if (n === 1) for (const f of oyentes) f(u.p); },
      };
      pintar(u, h.enXR());
      pantallas.set(p.id, u);
      if (css) montarDom(u); else void cargar();
    },
    quitar,
    ids: () => [...pantallas.keys()],
    /** Every frame (cheap: a few comparisons per screen; CSS transforms only change when the camera moves). */
    actualizar(): void {
      const xr = h.enXR();
      if (xr !== ultimoXR) { ultimoXR = xr; for (const u of pantallas.values()) pintar(u, xr); }
      if (!pantallas.size) return;
      h.camera.getWorldPosition(ojo); h.camera.getWorldDirection(frente);
      const cajas = h.cajas();
      for (const u of pantallas.values()) {
        centro.set(u.p.x, u.p.y, u.p.z);
        const dist = ojo.distanceTo(centro);
        normal.set(Math.sin((u.p.ry * Math.PI) / 180), 0, Math.cos((u.p.ry * Math.PI) / 180));
        const delante = normal.dot(ojo.clone().sub(centro)) > 0.05;                 // you are on its face side
        const enVista = frente.dot(centro.clone().sub(ojo)) > 0;                    // and it is ahead of the camera
        let motivo = "";
        if (xr) motivo = "xr"; else if (dist > VER_IFRAME_M) motivo = "lejos"; else if (!delante) motivo = "detrás"; else if (!enVista) motivo = "fuera de vista"; else if (tapadoPorCajas(ojo, centro, cajas)) motivo = "tapada";
        const dom = !motivo && !!u.obj;
        if (u.obj) u.obj.visible = dom;
        if (dom) ponerIframe(u); else if (dist > QUITAR_IFRAME_M || xr) quitarIframe(u);
        u.estado = { id: u.p.id, dom, iframe: !!u.iframe, tarjeta: !u.p.enmarcar, motivo: motivo || (u.obj ? "" : "cargando"), dist: Math.round(dist * 10) / 10 };
      }
      // H8: under the canvas (z-index -1, the body's own background let through) while the render says the hole can be punched
      const quiero = !!h.agujero?.() && !xr;
      if (quiero !== conAgujero) {
        conAgujero = quiero;
        if (r3) r3.domElement.style.zIndex = quiero ? "-1" : "";
        if (quiero) {
          fondoCuerpo = document.body.style.background; document.body.style.background = "transparent";
          // the body is a block that would sit over the page layer and catch its clicks: it lets them through, and its children (the canvas, the HUD…) take them back at zero specificity so any rule of theirs still wins
          if (!document.getElementById("web-agujero-css")) { const st = document.createElement("style"); st.id = "web-agujero-css"; st.textContent = ":where(body.web-agujero){pointer-events:none}:where(body.web-agujero)>:where(*){pointer-events:auto}"; document.head.append(st); }
          document.body.classList.add("web-agujero");
        } else { document.body.style.background = fondoCuerpo ?? ""; document.body.classList.remove("web-agujero"); if (h.lienzo) h.lienzo.style.pointerEvents = ""; }
      }
      for (const u of pantallas.values()) {
        const m = u.malla.material;
        const quieroHueco = conAgujero && u.estado.dom && u.estado.iframe;
        if (quieroHueco && m !== hueco) { (u.malla as unknown as { userData: { mat?: THREE.Material } }).userData.mat = m as THREE.Material; u.malla.material = hueco; }
        else if (!quieroHueco && m === hueco) u.malla.material = (u.malla.userData as { mat: THREE.Material }).mat;
      }
      if (r3) { r3.domElement.style.display = xr ? "none" : ""; if (!xr) r3.render(escenaCss, h.camera); }
    },
    /** The VR panels the hands may point at (each screen's button). */
    paneles(): Panel[] { return h.enXR() ? [...pantallas.values()].map((u) => u.panel) : []; },
    /** The page hears «Abrir fuera de VR» on a screen. */
    alAbrirFuera(f: (p: PantallaVista) => void): () => void { oyentes.add(f); return () => oyentes.delete(f); },
    /** For checks: what each screen shows now and why. */
    estado(): EstadoPantalla[] { return [...pantallas.values()].map((u) => u.estado); },
    /** For checks (and agents): where on the screen (client px) a point of the live page lands — `px`, `py` in the
     * page's own CSS pixels (as its getBoundingClientRect says). null = that screen is not showing its page. */
    puntoEnPantalla(id: string, px: number, py: number): { x: number; y: number } | null {
      const u = pantallas.get(id);
      if (!u?.obj || !u.iframe || !u.el || !u.obj.visible) return null;
      const W = PX_ANCHO, H = Math.round((PX_ANCHO * u.p.alto) / u.p.ancho), ix = 6, iy = 6 + BARRA_PX; // the border (6 px) and the bar
      const v = new THREE.Vector3(ix + px - W / 2, H / 2 - iy - py, 0); // in the element's px: its matrix scales them to metres
      u.obj.updateMatrixWorld(true);
      v.applyMatrix4(u.obj.matrixWorld).project(h.camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    },
    /** For checks: is the hole punched now (the page under the canvas)? */
    get agujero(): boolean { return conAgujero; },
    /** For checks: where a screen's VR button sits in the world. */
    botonMundo(id: string): { x: number; y: number; z: number } | null {
      const u = pantallas.get(id);
      if (!u) return null;
      u.malla.updateWorldMatrix(true, false);
      const H = u.c.height, centroPx = H - 24 - Math.round(H * 0.2) / 2, by = u.p.alto / 2 - (centroPx / H) * u.p.alto; // the button's centre
      const v = new THREE.Vector3(0, by, 0.01).applyMatrix4(u.malla.matrixWorld);
      return { x: v.x, y: v.y, z: v.z };
    },
  };
}
