// nombres (J3): names over heads and speech bubbles. Canvas text on planes that always face the camera (world
// rotation, so it also works in VR, where the camera hangs from the rig). Readable from afar: past 8 m a plate
// grows with the distance (up to ×3) so it keeps its size on screen. Text from people is only painted with
// fillText, never parsed as HTML. Where everything sits is ONE function, `setTop`: today the capsule's top; the
// VRM avatars (J1) pass the head bone's height instead.
// U22: a name shows only over whoever you look at or who speaks (all of them while `todos` is held: Alt, a button), and no
// plate takes more than 8° (name) / 30° (bubble) of your view, near or far, on screen or in VR (carteles.ts).
// ia-visible S4: the plate of an AI is the exception: always drawn (even beyond 24 m if the avatar exists, and first when plates are capped), a green
// border, an «IA» chip after the name and a crescent when it sleeps (ia-marca.ts). `ia(t, estado)` is called from the page with the public card.
import * as THREE from "three/webgpu";
import { escalaAcotada, nombreVisible, NOMBRE_GRADOS_MAX, DIALOGO_GRADOS_MAX, type Mirable } from "./carteles.ts";
import { estiloCartel, nombreSinMarca, type EstadoIA, type EstiloCartel } from "./ia-marca.ts"; // ia-visible S4: an AI's plate is always on, green, with an «IA» chip and a moon when asleep

export type Target = number | "self";
export const NOMBRE_VISIBLE_M = 24;     // names are drawn for avatars this close to you (the server sends them up to 24 m)
export const NOMBRES_DIBUJADOS = 32;    // at most this many name plates at once: the nearest (draw calls on phones)
export const BOCADILLO_VISIBLE_M = 30;  // bubbles are drawn this far (near chat only arrives within 20 m anyway)
export const BOCADILLO_LINEAS = 6;      // longer texts end in «…» (the list of the chat box has all of it)
const CRECE_DESDE_M = 8, CRECE_MAX = 3; // plates keep their size on screen beyond 8 m, up to three times bigger
export const LEYENDO_ETIQUETA = "leyendo las normas…"; // condiciones/c5: what the plate over someone inside a bubble says after their name
const LEYENDO_SOBRE_M = 0.22;                                // …and how much higher it sits, to clear the bubble's top (pompas.ts)
const NOMBRE_ALTO_M = 0.26, BOCADILLO_ANCHO_M = 2.6, HUECO_M = 0.06; // letters ~0.17 m tall in both: ~1° at 10 m

type Top = (t: Target, avatar: THREE.Object3D) => number;
type Plate = { mesh: THREE.Mesh; text: string; h: number; w: number };

/** A plate of text: dark rounded background, light letters (names) or a white bubble with dark letters. */
function plate(canvas: HTMLCanvasElement, widthM: number): THREE.Mesh {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, (widthM * canvas.height) / canvas.width), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = 11;
  return mesh;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** Lines of at most `max` pixels, cutting long words; at most `lines`, the last one ending in «…» if cut. */
export function wrap(measure: (s: string) => number, text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  const push = () => { out.push(line); line = ""; };
  for (const word of text.split(" ")) {
    let w = word;
    while (measure(w) > max) { // a word longer than a line: cut it
      let n = w.length;
      while (n > 1 && measure(w.slice(0, n)) > max) n--;
      if (line) push();
      out.push(w.slice(0, n)); w = w.slice(n);
    }
    const next = line ? `${line} ${w}` : w;
    if (measure(next) > max && line) { push(); line = w; } else line = next;
  }
  if (line) push();
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.?$/, "…"); }
  return out;
}

export function createNombres(o: { world: THREE.Object3D; camera: THREE.Camera; avatarOf: (t: Target) => THREE.Object3D | undefined }) {
  const texts = new Map<Target, string>();             // names as the server sent them (kept while the avatar is out of sight)
  const tags = new Map<Target, Plate>();               // plates drawn now (made when first shown)
  const bubbles = new Map<Target, Plate & { until: number }>();
  const lectores = new Map<Target, string>();           // condiciones/c5: who is reading the norms -> the words after their name; their plate is always on
  const ias = new Map<Target, EstadoIA>();             // ia-visible S4: who is an AI now and its state (empty in a world without AIs: nothing else is made)
  const textoDe = (t: Target): string => { const base = texts.get(t) ?? "", et = lectores.get(t); return et ? (base ? `${base} · ${et}` : et) : base; };
  let top: Top = (_t, m) => m.position.y + 0.85;       // the capsule: its centre + half its height (index.ts draws it at y 0.85)
  const cam = new THREE.Vector3(), camQ = new THREE.Quaternion();
  const distTo = (x: number, y: number, z: number) => Math.hypot(x - cam.x, y - cam.y, z - cam.z);
  const scaleAt = (x: number, y: number, z: number) => Math.min(CRECE_MAX, Math.max(1, distTo(x, y, z) / CRECE_DESDE_M));

  function drop(map: Map<Target, Plate>, t: Target): void {
    const p = map.get(t);
    if (!p) return;
    o.world.remove(p.mesh);
    const m = p.mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose(); m.dispose(); p.mesh.geometry.dispose();
    map.delete(t);
  }
  function nameplate(text: string, est: EstiloCartel | null = null): Plate {
    const c = document.createElement("canvas"), g = c.getContext("2d")!;
    const font = "600 40px system-ui, sans-serif", chipFont = "700 30px system-ui, sans-serif";
    const nombre = est ? nombreSinMarca(text) : text;
    g.font = font;
    const wTexto = Math.ceil(g.measureText(nombre).width);
    let wChip = 0, wLuna = 0;
    if (est) { g.font = chipFont; wChip = Math.ceil(g.measureText(est.chip).width) + 26; wLuna = est.luna ? 34 : 0; }
    const extra = est ? 14 + wChip + (wLuna ? 10 + wLuna : 0) : 0;
    c.width = Math.min(1024, wTexto + extra + 36); c.height = 60;
    g.fillStyle = "rgba(20,26,34,0.78)"; roundRect(g, 0, 0, c.width, c.height, 18); g.fill();
    if (est) { g.strokeStyle = est.borde; g.lineWidth = 5; roundRect(g, 2.5, 2.5, c.width - 5, c.height - 5, 16); g.stroke(); }
    g.font = font; g.fillStyle = est?.tinta ?? "#f4f7fb"; g.textBaseline = "middle";
    const x0 = (c.width - (wTexto + extra)) / 2; // the whole group (name, chip, moon) is centred on the plate
    g.textAlign = est ? "left" : "center";
    g.fillText(nombre, est ? x0 : c.width / 2, c.height / 2 + 2);
    if (est) {
      let x = x0 + wTexto + 14;
      g.fillStyle = est.chipFondo; roundRect(g, x, 11, wChip, 38, 12); g.fill();
      g.font = chipFont; g.fillStyle = est.chipTinta; g.textAlign = "center"; g.fillText(est.chip, x + wChip / 2, c.height / 2 + 2);
      if (est.luna) { // a crescent: a disc minus a shifted disc (no font glyph: it reads the same everywhere)
        x += wChip + 10; const cx = x + 15, cy = c.height / 2;
        g.save(); g.fillStyle = "#e8f1ef"; g.beginPath(); g.arc(cx, cy, 13, 0, Math.PI * 2); g.fill();
        g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(cx + 7, cy - 4, 11, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    const mesh = plate(c, (NOMBRE_ALTO_M * c.width) / c.height);
    o.world.add(mesh);
    return { mesh, text, h: NOMBRE_ALTO_M, w: (NOMBRE_ALTO_M * c.width) / c.height };
  }
  function bubbleplate(text: string): Plate {
    const c = document.createElement("canvas"), g = c.getContext("2d")!;
    const font = "500 36px system-ui, sans-serif", W = 560, lh = 44, pad = 22, tail = 18;
    g.font = font;
    const lines = wrap((s) => g.measureText(s).width, text, W - 2 * pad, BOCADILLO_LINEAS);
    const wide = Math.min(W, Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width))) + 2 * pad);
    c.width = Math.max(120, wide); c.height = lines.length * lh + 2 * pad - 8 + tail;
    g.font = font; g.fillStyle = "rgba(255,255,255,0.94)";
    roundRect(g, 0, 0, c.width, c.height - tail, 22); g.fill();
    g.beginPath(); g.moveTo(c.width / 2 - 14, c.height - tail); g.lineTo(c.width / 2, c.height); g.lineTo(c.width / 2 + 14, c.height - tail); g.closePath(); g.fill();
    g.fillStyle = "#17202a"; g.textAlign = "center"; g.textBaseline = "top";
    lines.forEach((l, i) => g.fillText(l, c.width / 2, pad - 2 + i * lh));
    const w = (BOCADILLO_ANCHO_M * c.width) / W;
    const mesh = plate(c, w);
    o.world.add(mesh);
    return { mesh, text, h: (w * c.height) / c.width, w };
  }

  /** Height of the name plate shown over this avatar (0 = none), at its current scale. */
  const nameHeight = (t: Target) => { const p = tags.get(t); return p?.mesh.visible ? p.h * p.mesh.scale.y : 0; };

  return {
    /** The name over an avatar; null takes it away. */
    nameTag(t: Target, text: string | null): void {
      if (text === null || text === "") { texts.delete(t); drop(tags, t); return; }
      texts.set(t, text);
      if (tags.get(t)?.text !== text) drop(tags, t); // made again (with the new text) when next shown
    },
    /** condiciones/c5: this avatar is reading the world's norms (`true`): its plate says «<name> · leyendo las normas…» and stays on, a little higher
     * (the bubble of pompas.ts is under it); `false` puts the plain name back. `etiqueta` = the words after the name (the page's own text). */
    leyendo(t: Target, si: boolean, etiqueta = LEYENDO_ETIQUETA): void {
      if (si) lectores.set(t, etiqueta); else lectores.delete(t);
      drop(tags, t); // remade with the new words when next shown
    },
    /** ia-visible S4: this avatar is an AI in this state (`activa`|`dormida`), or a person again / gone (`null`). Its plate is always on and carries the mark. */
    ia(t: Target, estado: EstadoIA | null): void {
      if (estado === null) ias.delete(t); else ias.set(t, estado);
      drop(tags, t); // remade with the mark (or without it) when next shown
    },
    /** A bubble over an avatar for `ms`; the latest replaces the one before. */
    bubble(t: Target, text: string, ms: number): void {
      drop(bubbles, t);
      const p = bubbleplate(text);
      p.mesh.visible = false; // placed on the next update
      bubbles.set(t, { ...p, until: performance.now() + ms });
    },
    /** Where name plates and bubbles sit: world y of the top of the drawn avatar (default: the capsule's top). */
    setTop(fn: Top): void { top = fn; },
    /** World y just above whatever this module draws over an avatar (gesture labels go there). */
    above(t: Target, avatar: THREE.Object3D): number {
      const b = bubbles.get(t);
      return top(t, avatar) + HUECO_M + nameHeight(t) + (b?.mesh.visible ? b.h * b.mesh.scale.y + HUECO_M : 0) + 0.22;
    },
    /** Who may be looked at: the avatars that have a name (never yourself), as vertical segments feet-to-head. */
    candidatos(): Mirable<Target>[] {
      const out: Mirable<Target>[] = [];
      for (const t of texts.keys()) {
        const a = t === "self" ? undefined : o.avatarOf(t);
        if (a) { const h = top(t, a); out.push({ clave: t, x: a.position.x, z: a.position.z, pies: h - 1.8, cabeza: h }); }
      }
      return out;
    },
    /** `todos`: everybody's name (Alt held). `mirado`: the avatar looked at (from carteles.elegirMirado). Whoever has a bubble speaks. */
    update(now: number, ver: { todos: boolean; mirado: Target | null } = { todos: true, mirado: null }): void {
      o.camera.getWorldPosition(cam); o.camera.getWorldQuaternion(camQ);
      const me = o.avatarOf("self");
      const far = (a: THREE.Object3D, m: number) => !!me && (a.position.x - me.position.x) ** 2 + (a.position.z - me.position.z) ** 2 > m * m;
      // names: the nearest NOMBRES_DIBUJADOS avatars with a name within NOMBRE_VISIBLE_M of you
      const shown: { t: Target; a: THREE.Object3D; d: number }[] = [];
      for (const t of lectores.size ? new Set([...texts.keys(), ...lectores.keys()]) : texts.keys()) {
        const text = textoDe(t), a = t === "self" || !text ? undefined : o.avatarOf(t); // your own name is never drawn over you
        let p = tags.get(t);
        const esIA = ias.has(t);
        if (!a || (!esIA && far(a, NOMBRE_VISIBLE_M)) || !nombreVisible({ todos: ver.todos, mirado: ver.mirado === t, habla: bubbles.has(t) || lectores.has(t), ia: esIA })) { if (p) p.mesh.visible = false; continue; }
        shown.push({ t, a, d: me ? (a.position.x - me.position.x) ** 2 + (a.position.z - me.position.z) ** 2 : 0 });
        if (p && p.text !== text) { drop(tags, t); p = undefined; } // the words changed (they started or stopped reading)
        if (!p) tags.set(t, nameplate(text, estiloCartel(ias.get(t))));
      }
      shown.sort((x, y) => (+ias.has(y.t) - +ias.has(x.t)) || x.d - y.d); // an AI's plate first when the cap bites, then the nearest
      shown.forEach(({ t, a }, i) => {
        const p = tags.get(t)!;
        p.mesh.visible = i < NOMBRES_DIBUJADOS;
        if (!p.mesh.visible) return;
        const y0 = top(t, a) + HUECO_M + (lectores.has(t) ? LEYENDO_SOBRE_M : 0), s = escalaAcotada(scaleAt(a.position.x, y0, a.position.z), p.h, distTo(a.position.x, y0, a.position.z), NOMBRE_GRADOS_MAX);
        p.mesh.scale.setScalar(s);
        p.mesh.position.set(a.position.x, y0 + (p.h * s) / 2, a.position.z);
        p.mesh.quaternion.copy(camQ);
      });
      for (const [t, b] of bubbles) {
        const a = o.avatarOf(t);
        if (now > b.until) { drop(bubbles, t); continue; }
        if (!a || (t !== "self" && far(a, BOCADILLO_VISIBLE_M))) { b.mesh.visible = false; continue; }
        const y0 = top(t, a) + HUECO_M + nameHeight(t) + HUECO_M, s = escalaAcotada(Math.min(2.5, scaleAt(a.position.x, y0, a.position.z)), b.w, distTo(a.position.x, y0, a.position.z), DIALOGO_GRADOS_MAX);
        b.mesh.visible = true;
        b.mesh.scale.setScalar(s);
        b.mesh.position.set(a.position.x, y0 + (b.h * s) / 2, a.position.z);
        b.mesh.quaternion.copy(camQ);
      }
    },
    /** For checks: every name the page holds and whether its plate is drawn now (`ia` = the AI's state when it is one). */
    nameTags(): { target: Target; text: string; drawn: boolean; ia?: EstadoIA }[] {
      const claves = lectores.size ? new Set([...texts.keys(), ...lectores.keys()]) : texts.keys();
      return [...claves].map((target) => ({ target, text: textoDe(target), drawn: !!tags.get(target)?.mesh.visible, ...(ias.has(target) ? { ia: ias.get(target) } : {}) }));
    },
    /** For checks: bubbles alive now. */
    bubbles(): { target: Target; text: string; drawn: boolean }[] {
      return [...bubbles].map(([target, b]) => ({ target, text: b.text, drawn: b.mesh.visible }));
    },
    /** A bubble is alive: the power policy must keep drawing until it goes. */
    busy(): boolean { return bubbles.size > 0; },
  };
}
