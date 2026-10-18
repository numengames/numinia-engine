// nombres (J3): names over heads and speech bubbles. Canvas text on planes that always face the camera (world
// rotation, so it also works in VR, where the camera hangs from the rig). Readable from afar: past 8 m a plate
// grows with the distance (up to ×3) so it keeps its size on screen. Text from people is only painted with
// fillText, never parsed as HTML. Where everything sits is ONE function, `setTop`: today the capsule's top; the
// VRM avatars (J1) pass the head bone's height instead.
// U22: a name shows only over whoever you look at or who speaks (all of them while `todos` is held: Alt, a button), and no
// plate takes more than 8° (name) / 30° (bubble) of your view, near or far, on screen or in VR (carteles.ts).
import * as THREE from "three/webgpu";
import { escalaAcotada, nombreVisible, NOMBRE_GRADOS_MAX, DIALOGO_GRADOS_MAX, type Mirable } from "./carteles.ts";

export type Target = number | "self";
export const NOMBRE_VISIBLE_M = 24;     // names are drawn for avatars this close to you (the server sends them up to 24 m)
export const NOMBRES_DIBUJADOS = 32;    // at most this many name plates at once: the nearest (draw calls on phones)
export const BOCADILLO_VISIBLE_M = 30;  // bubbles are drawn this far (near chat only arrives within 20 m anyway)
export const BOCADILLO_LINEAS = 6;      // longer texts end in «…» (the list of the chat box has all of it)
const CRECE_DESDE_M = 8, CRECE_MAX = 3; // plates keep their size on screen beyond 8 m, up to three times bigger
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
  function nameplate(text: string): Plate {
    const c = document.createElement("canvas"), g = c.getContext("2d")!;
    const font = "600 40px system-ui, sans-serif";
    g.font = font;
    c.width = Math.min(1024, Math.ceil(g.measureText(text).width) + 36); c.height = 60;
    g.font = font; g.fillStyle = "rgba(20,26,34,0.78)"; roundRect(g, 0, 0, c.width, c.height, 18); g.fill();
    g.fillStyle = "#f4f7fb"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, c.width / 2, c.height / 2 + 2);
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
      for (const [t, text] of texts) {
        const a = t === "self" ? undefined : o.avatarOf(t); // your own name is never drawn over you
        const p = tags.get(t);
        if (!a || far(a, NOMBRE_VISIBLE_M) || !nombreVisible({ todos: ver.todos, mirado: ver.mirado === t, habla: bubbles.has(t) })) { if (p) p.mesh.visible = false; continue; }
        shown.push({ t, a, d: me ? (a.position.x - me.position.x) ** 2 + (a.position.z - me.position.z) ** 2 : 0 });
        if (!p) tags.set(t, nameplate(text));
      }
      shown.sort((x, y) => x.d - y.d);
      shown.forEach(({ t, a }, i) => {
        const p = tags.get(t)!;
        p.mesh.visible = i < NOMBRES_DIBUJADOS;
        if (!p.mesh.visible) return;
        const y0 = top(t, a) + HUECO_M, s = escalaAcotada(scaleAt(a.position.x, y0, a.position.z), p.h, distTo(a.position.x, y0, a.position.z), NOMBRE_GRADOS_MAX);
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
    /** For checks: every name the page holds and whether its plate is drawn now. */
    nameTags(): { target: Target; text: string; drawn: boolean }[] {
      return [...texts].map(([target, text]) => ({ target, text, drawn: !!tags.get(target)?.mesh.visible }));
    },
    /** For checks: bubbles alive now. */
    bubbles(): { target: Target; text: string; drawn: boolean }[] {
      return [...bubbles].map(([target, b]) => ({ target, text: b.text, drawn: b.mesh.visible }));
    },
    /** A bubble is alive: the power policy must keep drawing until it goes. */
    busy(): boolean { return bubbles.size > 0; },
  };
}
