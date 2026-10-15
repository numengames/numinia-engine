// camara (N1): the player's camera, mouse, keys, touch and gamepad. The arithmetic lives in camara-orbita.ts (pure,
// tested in Node); this file listens to the page and moves the three.js camera. Recipe and key map: docs/JUGADOR.md.
// Play ("juego"): orbit around your avatar — right drag, or left drag on the world (a click without moving stays a
// click); wheel = zoom down to first person. Build ("construir", switched by the builder): a free editor camera —
// right drag (or Alt+left) orbits a pivot, middle or Shift+right drag pans it, the wheel zooms toward the cursor, plain
// left belongs to the builder. Touch: a finger that starts on the right half orbits, two fingers pinch (and pan when
// building); the left half stays the page's joystick (it asks `tieneDedo`). Phones stay cool: `ocupada()` is true only
// while a drag, a held key, a stick or the smoothing moves something; then the page may stop drawing.
import type * as THREE from "three/webgpu";
import { crearOrbita, CAMARA, type ModoCamara, type Pose, type Punto } from "./camara-orbita.ts";
export { haciaMundo, CAMARA } from "./camara-orbita.ts";
export type { ModoCamara, Punto } from "./camara-orbita.ts";

const RATON = 0.0055;           // radians per pixel of mouse drag (≈ 0.3°)
const UMBRAL_PX = 5;            // a left press that moves less than this is a click, not a drag
const GIRO_TECLA = 1.75;        // rad/s while a turn key is held (≈ 100°/s)
const INCLINA_TECLA = 1.05;     // rad/s while a tilt key is held (≈ 60°/s)
const PALANCA = { giro: 2.6, inclina: 1.6, zoom: 2.2, muerta: 0.15 }; // gamepad: rad/s, rad/s, ×/s, dead zone
// Keys (free ones: see the reserved list in docs/JUGADOR.md). Turn and tilt act while held; zoom per press/repeat.
export const TECLAS_CAMARA = {
  izquierda: "Comma", derecha: "Period", arriba: "PageUp", abajo: "PageDown", reiniciar: "Home", vista: "KeyV",
  acercar: ["+", "=", "NumpadAdd"], alejar: ["-", "_", "NumpadSubtract"],
} as const;

export type CamaraOpts = { enXR?: () => boolean };
type Arrastre = { id: number; boton: number; accion: "orbita" | "pan" | "quizas"; x: number; y: number; x0: number; y0: number };
const esTexto = (t: EventTarget | null) => {
  const e = t as HTMLElement | null;
  return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable);
};
const muerta = (v: number) => (Math.abs(v) < PALANCA.muerta ? 0 : (v - Math.sign(v) * PALANCA.muerta) / (1 - PALANCA.muerta));

export function createCamara(camera: THREE.PerspectiveCamera, dom: HTMLElement, opts: CamaraOpts = {}) {
  const orbita = crearOrbita();
  const enXR = opts.enXR ?? (() => false);
  const pies: Punto = { x: 0, y: 0, z: 0 };   // the avatar's feet (last known)
  const pose: Pose = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, dentro: false };
  let bloqueada = false, arrastre: Arrastre | null = null, tragarHasta = 0, ultimo = 0;
  const dedos = new Map<number, { x: number; y: number }>();
  let pinza: { d: number; x: number; y: number } | null = null;
  const sujetas = new Set<string>();          // turn/tilt keys held (by code)
  let mandos = 0;                             // gamepads connected: polled only while there is one
  const palanca = { x: 0, z: 0, gx: 0, gy: 0, zoom: 0 };
  let sens = 1, invY = 1;                     // N2 settings: look speed (mouse, finger, stick) and inverted vertical axis

  // ---- mouse ----
  const soltar = () => {
    if (!arrastre) return;
    if (arrastre.boton === 0 && arrastre.accion !== "quizas") tragarHasta = performance.now() + 300; // the drag was not a click
    try { dom.releasePointerCapture(arrastre.id); } catch { /* already released */ }
    arrastre = null;
  };
  function raton(e: PointerEvent): void {
    tragarHasta = 0;
    if (arrastre) return;
    const construir = orbita.modo === "construir";
    let accion: Arrastre["accion"] | null = null;
    if (e.button === 2) accion = construir && e.shiftKey ? "pan" : "orbita";
    else if (e.button === 1) accion = construir ? "pan" : null;
    else if (e.button === 0) accion = construir ? (e.altKey ? (e.shiftKey ? "pan" : "orbita") : null) : e.ctrlKey || e.metaKey ? null : "quizas";
    if (!accion) return;
    arrastre = { id: e.pointerId, boton: e.button, accion, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
    try { dom.setPointerCapture(e.pointerId); } catch { /* not capturable: window events still arrive */ }
  }
  function moverRaton(e: PointerEvent, a: Arrastre): void {
    if (!(e.buttons & [1, 4, 2][a.boton])) return soltar(); // the button went up outside the page
    if (a.accion === "quizas") {
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < UMBRAL_PX) return;
      a.accion = "orbita";
    }
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    a.x = e.clientX; a.y = e.clientY;
    if (a.accion === "orbita") orbita.orbitar(-dx * RATON * sens, dy * RATON * sens * invY);
    else panear(dx, dy);
  }
  function panear(dxPx: number, dyPx: number): void {
    const m = (2 * Math.max(orbita.ahora.dist, 1) * Math.tan((camera.fov * Math.PI) / 360)) / (dom.clientHeight || innerHeight || 1);
    orbita.panear(-dxPx * m, dyPx * m, pies); // grab the world: it follows the pointer
  }

  // ---- touch: right half orbits, two fingers pinch ----
  function tactil(e: PointerEvent): void {
    const r = dom.getBoundingClientRect();
    if (dedos.size === 0 && e.clientX < r.left + r.width / 2) return; // the left half is the joystick
    if (dedos.size >= 2) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinza = dedos.size === 2 ? medir() : null;
  }
  function medir(): { d: number; x: number; y: number } {
    const [a, b] = [...dedos.values()];
    return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function moverDedo(e: PointerEvent): void {
    const f = dedos.get(e.pointerId)!;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    if (dedos.size === 1) { const k = (sens * Math.PI) / Math.max(320, dom.clientWidth || innerWidth); orbita.orbitar(-dx * k, dy * k * invY); return; }
    if (!pinza) return;
    const m = medir();
    if (orbita.modo === "construir") { orbita.acercarHacia(pinza.d / m.d, null, pies); panear(m.x - pinza.x, m.y - pinza.y); }
    else orbita.acercar(pinza.d / m.d);
    pinza = m;
  }
  const finDedo = (e: PointerEvent) => { if (dedos.delete(e.pointerId)) pinza = dedos.size === 2 ? medir() : null; };

  dom.addEventListener("pointerdown", (e) => {
    if (enXR() || bloqueada) return;
    if (e.pointerType === "mouse") raton(e); else tactil(e);
  });
  dom.addEventListener("pointermove", (e) => {
    if (bloqueada) return;
    if (arrastre && e.pointerId === arrastre.id) moverRaton(e, arrastre);
    else if (dedos.has(e.pointerId)) moverDedo(e);
  });
  const fin = (e: PointerEvent) => { if (arrastre && e.pointerId === arrastre.id) soltar(); else finDedo(e); };
  dom.addEventListener("pointerup", fin);
  dom.addEventListener("pointercancel", fin);
  dom.addEventListener("lostpointercapture", (e) => { if (arrastre && e.pointerId === arrastre.id) soltar(); });
  dom.addEventListener("contextmenu", (e) => e.preventDefault()); // the right button orbits
  dom.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); }); // no autoscroll on middle drag
  // the click that a browser sends right after a left drag is swallowed (only that one: a short window, then never)
  addEventListener("click", (e) => { if (tragarHasta && performance.now() < tragarHasta) { tragarHasta = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  dom.addEventListener("wheel", (e) => {
    e.preventDefault(); // the page never scrolls or zooms from the 3D view
    if (bloqueada || enXR()) return;
    const px = Math.max(-300, Math.min(300, e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 300 : 1))); // lines: 3 ≈ one 100 px notch
    const f = Math.exp(px * CAMARA.rueda);
    if (orbita.modo !== "construir") { orbita.acercar(f); return; }
    const r = dom.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((e.clientY - r.top) / r.height) * 2;
    orbita.acercarHacia(f, orbita.puntoBajo(nx, ny, camera.fov, camera.aspect, pies, Math.max(20, orbita.ahora.dist * 3)), pies);
  }, { passive: false });

  // ---- keys (ignored while typing in a text box, and with Ctrl/Alt/Meta: those belong to the browser and the builder) ----
  addEventListener("keydown", (e) => {
    if (esTexto(e.target) || e.ctrlKey || e.metaKey || e.altKey || enXR()) return;
    const T = TECLAS_CAMARA;
    if (e.code === T.izquierda || e.code === T.derecha || e.code === T.arriba || e.code === T.abajo) { sujetas.add(e.code); return; }
    if ((T.acercar as readonly string[]).includes(e.key) || e.code === "NumpadAdd") { o.acercar(1); return; }
    if ((T.alejar as readonly string[]).includes(e.key) || e.code === "NumpadSubtract") { o.acercar(-1); return; }
    if (e.repeat) return;
    if (e.code === T.reiniciar) orbita.reiniciar();
    else if (e.code === T.vista) orbita.alternarVista();
  });
  addEventListener("keyup", (e) => { sujetas.delete(e.code); });
  addEventListener("blur", () => { sujetas.clear(); soltar(); dedos.clear(); pinza = null; });

  // ---- gamepad: right stick orbits, LB/RB zoom; the left stick is read by the page through `mando()` ----
  addEventListener("gamepadconnected", () => { mandos++; });
  addEventListener("gamepaddisconnected", () => { mandos = Math.max(0, mandos - 1); });
  function leerMando(): void {
    palanca.x = palanca.z = palanca.gx = palanca.gy = palanca.zoom = 0;
    if (!mandos || typeof navigator.getGamepads !== "function") return;
    for (const g of navigator.getGamepads()) {
      if (!g || !g.connected || g.axes.length < 2) continue;
      palanca.x = muerta(g.axes[0]); palanca.z = muerta(g.axes[1]);
      if (g.axes.length >= 4) { palanca.gx = muerta(g.axes[2]); palanca.gy = muerta(g.axes[3]); }
      palanca.zoom = (g.buttons[5]?.pressed ? 1 : 0) - (g.buttons[4]?.pressed ? 1 : 0);
      return; // the first pad that is there
    }
  }

  const o = {
    /** Move the camera for this frame (view.draw calls it; never while XR presents). `target` = your avatar's feet. */
    update(dt: number, target: Punto | null): void {
      const now = performance.now();
      const s = ultimo ? Math.min(0.1, (now - ultimo) / 1000) : Math.min(0.1, dt); // the real time since the last draw
      ultimo = now;
      if (target) { pies.x = target.x; pies.y = target.y; pies.z = target.z; }
      if (sujetas.size) {
        const T = TECLAS_CAMARA, h = (c: string) => (sujetas.has(c) ? 1 : 0);
        orbita.orbitar((h(T.izquierda) - h(T.derecha)) * GIRO_TECLA * s, (h(T.abajo) - h(T.arriba)) * INCLINA_TECLA * s);
      }
      leerMando();
      if (palanca.gx || palanca.gy) orbita.orbitar(-palanca.gx * PALANCA.giro * sens * s, palanca.gy * PALANCA.inclina * sens * invY * s);
      if (palanca.zoom) orbita.acercar(Math.exp(-palanca.zoom * Math.log(PALANCA.zoom) * s));
      orbita.paso(s);
      orbita.pose(pies, pose);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.set(-orbita.ahora.pitch, orbita.ahora.yaw, 0, "YXZ");
    },
    /** Where the camera looks, radians: 0 = along -z, + = turned left. Movement keys turn with it. */
    yaw(): number { const y = orbita.ahora.yaw; return Math.atan2(Math.sin(y), Math.cos(y)); },
    /** "juego" (follows your avatar) or "construir" (a free editor camera). Returns the mode now. */
    modo(m?: ModoCamara): ModoCamara { if (m === "juego" || m === "construir") orbita.cambiarModo(m); return orbita.modo; },
    /** Build mode: smoothly point the camera at a thing (centre, radius in metres). false (and nothing) in play mode. */
    frame(center: Punto, radius: number): boolean { return orbita.encuadrar(center, radius, pies, camera.fov); },
    /** While true, drags and the wheel do not move the camera (the builder's gizmo or grab mode owns them). */
    bloquear(on: boolean): void { bloqueada = !!on; if (bloqueada) { soltar(); tragarHasta = 0; dedos.clear(); pinza = null; } },
    /** True while dragging, a key or stick is held, or the camera is still settling: keep drawing. */
    ocupada(): boolean {
      if (mandos) leerMando();
      return !!arrastre || dedos.size > 0 || sujetas.size > 0 || !!(palanca.gx || palanca.gy || palanca.zoom) || !orbita.quieta();
    },
    /** True when the camera is inside or right next to your own body (first person): render hides your avatar. */
    primeraPersona(): boolean { return pose.dentro; },
    /** Zoom by steps (+ closer, - farther), like wheel notches. Keys, agents and tests use it. */
    acercar(pasos: number): void { orbita.acercar(Math.exp(-pasos * 100 * CAMARA.rueda)); },
    /** Turn (radians, + = left) and tilt (+ = look further down). */
    girar(dYaw: number, dPitch = 0): void { orbita.orbitar(dYaw, dPitch); },
    /** Behind your avatar again at the starting height and distance (build mode: back over your avatar). */
    reiniciar(): void { orbita.reiniciar(); },
    /** Play mode: first person ↔ third person. */
    alternarVista(): void { orbita.alternarVista(); },
    /** N2 (settings menu): look speed for mouse, finger and stick (1 = as shipped, 0.25–3) and the inverted vertical axis. */
    ajustar(p: { sensibilidad?: number; invertirY?: boolean }): void {
      if (typeof p.sensibilidad === "number" && Number.isFinite(p.sensibilidad)) sens = Math.min(3, Math.max(0.25, p.sensibilidad));
      if (typeof p.invertirY === "boolean") invY = p.invertirY ? -1 : 1;
    },
    /** True when this touch pointer is the camera's (the page's joystick leaves it alone). */
    tieneDedo(pointerId: number): boolean { return dedos.has(pointerId); },
    /** The gamepad's left stick (x right, z back: up = -1), dead zone applied; null without a gamepad. */
    mando(): [number, number] | null { if (!mandos) return null; leerMando(); return [palanca.x, palanca.z]; },
    /** For checks: what is drawn and what is wanted. */
    estado() {
      const a = orbita.ahora, m = orbita.meta, p = orbita.pivote(pies);
      return {
        modo: orbita.modo, yaw: o.yaw(), pitch: a.pitch, distancia: a.dist, metaDistancia: m.dist, pivote: p,
        camara: { x: pose.x, y: pose.y, z: pose.z }, primeraPersona: pose.dentro, bloqueada, arrastrando: !!arrastre, quieta: orbita.quieta(),
        sensibilidad: sens, invertirY: invY < 0,
      };
    },
  };
  return o;
}

export type Camara = ReturnType<typeof createCamara>;
