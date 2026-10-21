// ia-llamar S9: the action bubble of every AI, DRAWN. Headless: the pure decisions (distance to the edge agrees with the server's `dentro`,
// visibility, fade, flash, cap per device, placement), the pool (what is made, reused, shared, dropped), the page's accessor, and that a
// world without AIs makes nothing. The look is checked in the browser leg (screenshots in work/ia-organizacion/capturas/s9/).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { ALTO_M, PECHO_M, CENTRO_ESFERA_M, SUELO_TOL_M, FORMAS, VISIBLES, dentro } from "../features/burbuja/feature.ts";
import type { Forma } from "../features/burbuja/feature.ts";
import { crearBurbujaPagina } from "../features/burbuja/client.ts";
import cliente from "../features/cliente.ts";
import * as P from "../packages/render/src/burbujas-politica.ts";
import { createBurbujas } from "../packages/render/src/burbujas.ts";
import { VERDE_IA } from "../packages/render/src/ia-marca.ts";

// ---------- pure parts ----------

test("the page's copies of the server's constants agree (render may not import features)", () => {
  assert.deepEqual([P.ALTO_M, P.PECHO_M, P.CENTRO_ESFERA_M, P.SUELO_TOL_M], [ALTO_M, PECHO_M, CENTRO_ESFERA_M, SUELO_TOL_M]);
  assert.equal(`#${P.BURBUJA_COLOR.toString(16)}`, VERDE_IA, "the house green of every AI sign");
});

test("distance to the edge is 0 exactly where the server says «inside» (every shape, a grid of 4 AI heights × people)", () => {
  const a = { x: 10, y: 3, z: -4 };
  let dentroN = 0, fueraN = 0;
  for (const forma of FORMAS) for (const radio of [2, 4, 7, 12]) {
    for (let dx = -14; dx <= 14; dx += 0.7) for (let dz = -14; dz <= 14; dz += 0.7) for (let dy = -9; dy <= 9; dy += 0.5) {
      const p = { x: a.x + dx, y: a.y + dy, z: a.z + dz };
      const d = P.distanciaAlBorde(forma, radio, a, p), si = dentro(forma, radio, a, p);
      assert.equal(d === 0, si, `${forma} r${radio} (${dx.toFixed(1)},${dy},${dz.toFixed(1)}) d=${d} dentro=${si}`);
      si ? dentroN++ : fueraN++;
    }
  }
  assert.ok(dentroN > 1000 && fueraN > 1000);
});

test("distance to the edge: the walk out of the shape, in metres", () => {
  const a = { x: 0, y: 0, z: 0 };
  assert.ok(Math.abs(P.distanciaAlBorde("esfera", 4, a, { x: 7, y: 0, z: 0 }) - 3) < 1e-9);
  assert.ok(Math.abs(P.distanciaAlBorde("cilindro", 4, a, { x: 7, y: 0, z: 0 }) - 3) < 1e-9);
  assert.ok(Math.abs(P.distanciaAlBorde("caja", 4, a, { x: 7, y: 0, z: 0 }) - 3) < 1e-9);
  assert.ok(Math.abs(P.distanciaAlBorde("caja", 4, a, { x: 7, y: 0, z: 8 }) - 5) < 1e-9, "a corner of the box: 3 sideways, 4 forward");
  assert.ok(Math.abs(P.distanciaAlBorde("cilindro", 4, a, { x: 0, y: ALTO_M + 2, z: 0 }) - 2) < 1e-9, "above a tower");
  assert.ok(Math.abs(P.distanciaAlBorde("cupula", 4, a, { x: 0, y: -2.5, z: 0 }) - 2) < 1e-9, "under the floor of a dome (0.5 m is forgiven)");
  assert.equal(P.distanciaAlBorde("nada" as Forma, 4, a, a), Infinity);
});

test("visibility: «nunca» never, «siempre» always, «al-acercarte» fades in over APARECE_M outside the edge; asleep is dimmer; the flash adds light", () => {
  assert.deepEqual(VISIBLES, ["siempre", "al-acercarte", "nunca"]);
  for (const d of [0, 1, 50]) assert.equal(P.intensidad("nunca", d, false, 1), 0, "not even the flash");
  assert.equal(P.intensidad("siempre", 0, false, 0), 1);
  assert.equal(P.intensidad("siempre", 500, false, 0), 1, "faint but always there, however far");
  assert.equal(P.intensidad("al-acercarte", 0, false, 0), 1, "at the edge and inside: plain");
  assert.equal(P.intensidad("al-acercarte", P.APARECE_M, false, 0), 0, "radius + 3 m: gone");
  assert.equal(P.intensidad("al-acercarte", P.APARECE_M + 5, false, 1), 0, "too far to flash");
  const mitad = P.intensidad("al-acercarte", P.APARECE_M / 2, false, 0);
  assert.ok(Math.abs(mitad - 0.5) < 1e-9);
  let prev = 1;
  for (let d = 0; d <= P.APARECE_M; d += 0.25) { const i = P.intensidad("al-acercarte", d, false, 0); assert.ok(i <= prev + 1e-12, "fades monotonically with distance"); prev = i; }
  assert.ok(Math.abs(P.intensidad("siempre", 0, true, 0) - P.DORMIDA_FACTOR) < 1e-9);
  assert.ok(P.intensidad("siempre", 0, false, 1) > 2, "the flash lights it well above plain");
});

test("flash: 1 at the start, 0 after DESTELLO_MS, never negative, nothing without an entry", () => {
  assert.equal(P.destello(null), 0);
  assert.equal(P.destello(0), 1);
  assert.equal(P.destello(-5), 0);
  assert.equal(P.destello(P.DESTELLO_MS), 0);
  assert.equal(P.destello(P.DESTELLO_MS + 1000), 0);
  let prev = 1; for (let t = 0; t < P.DESTELLO_MS; t += 25) { const f = P.destello(t); assert.ok(f <= prev && f >= 0); prev = f; }
});

test("levels and opacity: quantised, bounded, faint (the AI behind stays in plain sight), the flash brighter but under 1", () => {
  assert.equal(P.nivelDe(0), 0); assert.equal(P.nivelDe(-3), 0);
  assert.equal(P.nivelDe(1), P.PASOS);
  assert.equal(P.nivelDe(99), P.NIVEL_MAX);
  assert.ok(P.opacidadRelleno(P.PASOS) <= 0.2, "plain fill is faint");
  assert.ok(P.opacidadBorde(P.PASOS) < P.opacidadBorde(P.NIVEL_MAX));
  assert.ok(P.opacidadRelleno(P.NIVEL_MAX) <= 0.5 && P.opacidadBorde(P.NIVEL_MAX) <= 1);
  const niveles = new Set<number>(); for (let i = 0; i <= 1 + P.DESTELLO_EXTRA; i += 0.001) niveles.add(P.nivelDe(i));
  assert.ok(niveles.size <= P.NIVEL_MAX + 1, "a bounded number of materials");
});

test("cap per device: the nearest win, PC > phone > VR; a tie keeps the lower id", () => {
  assert.deepEqual([P.burbujasMax(false, false), P.burbujasMax(true, false), P.burbujasMax(false, true), P.burbujasMax(true, true)], [8, 3, 2, 2]);
  assert.deepEqual(P.elegir([{ id: 1, dist: 9 }, { id: 2, dist: 1 }, { id: 3, dist: 5 }, { id: 4, dist: 1 }], 3), [2, 4, 3]);
  assert.deepEqual(P.elegir([{ id: 1, dist: 9 }], 0), []);
  assert.deepEqual(P.elegir([{ id: 1, dist: 9 }], -4), []);
  assert.deepEqual(P.elegir([], 5), []);
});

test("placement: the sphere is centred 1 m up; dome on the floor; cylinder and box hold from 0.5 m under the feet to 6 m over them", () => {
  assert.deepEqual(P.colocacion("esfera", 5), { dy: 1, sx: 5, sy: 5, sz: 5 });
  assert.deepEqual(P.colocacion("cupula", 5), { dy: 0, sx: 5, sy: 5, sz: 5 });
  for (const f of ["cilindro", "caja"] as const) {
    const c = P.colocacion(f, 3);
    assert.equal(c.dy - c.sy / 2, -SUELO_TOL_M, "bottom");
    assert.equal(c.dy + c.sy / 2, ALTO_M, "top");
    assert.equal(c.sx, 3); assert.equal(c.sz, 3);
  }
});

// ---------- the pool ----------

/** A world with avatars (capsule centres 0.85 m over the feet) and a player. */
function mundo(max = 8) {
  const world = new THREE.Group();
  const avatares = new Map<number | "self", THREE.Object3D>();
  const ponerAvatar = (t: number, x: number, z: number, y = 0.85) => { let a = avatares.get(t); if (!a) { a = new THREE.Object3D(); avatares.set(t, a); } a.position.set(x, y, z); return a; };
  let yo: { x: number; y: number; z: number } | null = { x: 0, y: 0, z: 0 }, tope = max;
  const B = createBurbujas({ world, avatarOf: (t) => avatares.get(t), yo: () => yo, max: () => tope });
  return { world, avatares, ponerAvatar, B, yo: (p: { x: number; y: number; z: number } | null) => { yo = p; }, tope: (n: number) => { tope = n; } };
}
const grupos = (w: THREE.Object3D) => w.children as THREE.Group[];
const cfg = (forma: Forma, radio = 4, visible: "siempre" | "al-acercarte" | "nunca" = "siempre") => ({ forma, radio, visible });

test("a world without AIs makes nothing: no geometry, no material, no mesh, nothing to draw", () => {
  const m = mundo();
  m.ponerAvatar(1, 3, -4);
  m.B.update(0); m.B.update(100);
  assert.deepEqual(m.B.compartidos(), { geometrias: 0, materiales: 0, mallas: 0, libres: 0 });
  assert.equal(m.world.children.length, 0);
  assert.equal(m.B.busy(0), false);
  assert.deepEqual(m.B.lista(), []);
});

test("each shape is drawn where the server holds people: position and scale follow the AI's feet", () => {
  const m = mundo();
  m.ponerAvatar(2, 5, -3);           // feet at y 0
  m.B.poner(2, cfg("esfera", 6)); m.B.update(0);
  let g = grupos(m.world); assert.equal(g.length, 1);
  assert.deepEqual([g[0].position.x, g[0].position.y, g[0].position.z], [5, 1, -3], "centre 1 m up");
  assert.deepEqual([g[0].scale.x, g[0].scale.y, g[0].scale.z], [6, 6, 6]);
  m.ponerAvatar(2, 9, -1, 2.85);     // it walks and climbs two metres: the sphere goes with it
  m.B.update(0); assert.deepEqual([g[0].position.x, g[0].position.y, g[0].position.z], [9, 3, -1]);
  m.B.poner(2, cfg("caja", 3)); m.B.update(0);  // another shape: another mesh
  g = grupos(m.world); assert.equal(g.length, 1);
  assert.equal(g[0].scale.y, ALTO_M + SUELO_TOL_M);
  assert.equal(g[0].position.y, 2 + (ALTO_M - SUELO_TOL_M) / 2);
  assert.deepEqual(m.B.lista().map((l) => [l.target, l.forma, l.drawn]), [[2, "caja", true]]);
});

test("geometry is shared: one fill and one edge per shape however many bubbles; materials by level; the pool never exceeds the cap", () => {
  const m = mundo(3);
  for (let i = 1; i <= 6; i++) { m.ponerAvatar(i, i, -5 - i); m.B.poner(i, cfg(i % 2 ? "esfera" : "cupula", 3 + (i % 3))); }
  m.B.update(0);
  const c = m.B.compartidos();
  assert.equal(c.geometrias, 4, "two shapes × (fill + edge)");
  assert.equal(c.mallas, 3);
  assert.equal(c.materiales, 2, "all at one level: one fill, one edge");
  assert.equal(grupos(m.world).length, 3);
  const g = new Set<THREE.BufferGeometry>(); for (const gr of grupos(m.world)) for (const h of gr.children) g.add((h as THREE.Mesh).geometry);
  assert.ok(g.size <= 4);
  // the cap grows: nobody is made twice more than needed
  m.tope(6); m.B.update(0);
  assert.equal(m.B.compartidos().mallas, 6);
  // and shrinks: the dropped go back to the pool, not away
  m.tope(1); m.B.update(0);
  const c2 = m.B.compartidos(); assert.equal(c2.mallas, 1); assert.equal(c2.libres, 5); assert.equal(grupos(m.world).length, 1);
  m.tope(6); m.B.update(0);
  assert.equal(m.B.compartidos().libres, 0, "reused from the pool");
  assert.equal(m.B.compartidos().geometrias, 4);
});

test("the nearest bubbles are the ones drawn when the cap bites", () => {
  const m = mundo(2);
  m.yo({ x: 0, y: 0, z: 0 });
  for (const [i, x] of [[1, 30], [2, 10], [3, 20]] as const) { m.ponerAvatar(i, x, 0); m.B.poner(i, cfg("esfera", 4, "siempre")); }
  m.B.update(0);
  assert.deepEqual(m.B.lista().filter((l) => l.drawn).map((l) => l.target).sort(), [2, 3]);
});

test("«nunca» is never drawn (and nothing is made for it); «al-acercarte» appears when you come within radius + 3 m and fades with distance", () => {
  const m = mundo();
  m.ponerAvatar(1, 20, 0); m.ponerAvatar(2, 20, 5);
  m.B.poner(1, cfg("esfera", 4, "nunca")); m.B.poner(2, cfg("esfera", 4, "al-acercarte"));
  m.yo({ x: 0, y: 0, z: 0 }); m.B.update(0);
  assert.equal(m.world.children.length, 0, "20 m away: nothing");
  assert.deepEqual(m.B.compartidos().geometrias, 0);
  m.yo({ x: 13.5, y: 0, z: 5 }); m.B.update(0);   // 6.5 m from AI 2 = 2.5 m outside the edge of a 4 m sphere: barely there
  const lejos = m.B.lista().find((l) => l.target === 2)!;
  assert.equal(lejos.drawn, true); const nl = lejos.nivel;
  m.yo({ x: 17, y: 0, z: 5 }); m.B.update(0);   // 3 m away = inside the 4 m: plain
  const cerca = m.B.lista().find((l) => l.target === 2)!;
  assert.equal(cerca.nivel, P.PASOS); assert.ok(nl < cerca.nivel && nl > 0);
  m.yo({ x: 10, y: 0, z: 5 }); m.B.update(0);   // 10 m: out of range again → back to the pool
  assert.equal(m.B.lista().find((l) => l.target === 2)!.drawn, false);
  assert.equal(m.B.lista().find((l) => l.target === 1)!.drawn, false, "«nunca» stays out wherever you stand");
  m.yo({ x: 20, y: 0, z: 0 }); m.B.update(0);
  assert.equal(m.B.lista().find((l) => l.target === 1)!.drawn, false, "even inside it");
});

test("before the player has a position: «siempre» shows, «al-acercarte» waits", () => {
  const m = mundo(); m.yo(null);
  m.ponerAvatar(1, 3, 0); m.ponerAvatar(2, 4, 0);
  m.B.poner(1, cfg("cilindro", 4, "siempre")); m.B.poner(2, cfg("cilindro", 4, "al-acercarte"));
  m.B.update(0);
  assert.deepEqual(m.B.lista().map((l) => [l.target, l.drawn]), [[1, true], [2, false]]);
});

test("the flash: lights the bubble when YOU enter, fades out by itself, asks for frames only while it plays; none for «nunca»", () => {
  const m = mundo();
  m.ponerAvatar(1, 0, 3); m.ponerAvatar(2, 0, 3.5);
  m.B.poner(1, cfg("esfera", 4, "al-acercarte")); m.B.poner(2, cfg("esfera", 4, "nunca"));
  assert.equal(m.B.busy(1000), true, "a change is waiting to be drawn");
  m.B.update(0);
  const base = m.B.lista().find((l) => l.target === 1)!.nivel; assert.equal(base, P.PASOS);
  m.B.update(1000); assert.equal(m.B.busy(1000), false, "a bubble that stands still asks for nothing");
  m.B.destellar(1, 1000); m.B.destellar(2, 1000); m.B.destellar(99, 1000);
  assert.equal(m.B.busy(1100), true);
  m.B.update(1000); const luz = m.B.lista().find((l) => l.target === 1)!.nivel; assert.ok(luz > base + 5, `flash level ${luz} vs ${base}`);
  m.B.update(1000 + P.DESTELLO_MS / 2); const media = m.B.lista().find((l) => l.target === 1)!.nivel; assert.ok(media > base && media < luz);
  m.B.update(1000 + P.DESTELLO_MS + 1); assert.equal(m.B.lista().find((l) => l.target === 1)!.nivel, base);
  assert.equal(m.B.busy(1000 + P.DESTELLO_MS + 1), false);
  assert.equal(m.B.lista().find((l) => l.target === 2)!.drawn, false);
});

test("a sleeping AI's bubble is dim and dashed, and wakes bright; a bubble that goes (or an AI that leaves) returns to the pool", () => {
  const m = mundo();
  m.ponerAvatar(1, 0, 3);
  m.B.poner(1, cfg("cupula", 4), false); m.B.update(0);
  const borde = () => (grupos(m.world)[0].children[1] as THREE.LineSegments).material as THREE.Material;
  const despierta = m.B.lista()[0].nivel;
  assert.equal(borde().type, "LineBasicMaterial");
  m.B.dormida(1, true); m.B.update(0);
  assert.equal(borde().type, "LineDashedMaterial", "asleep: a dashed line");
  assert.ok(m.B.lista()[0].nivel < despierta);
  assert.ok(m.B.lista()[0].dormida);
  m.B.dormida(1, false); m.B.update(0); assert.equal(borde().type, "LineBasicMaterial");
  m.B.dormida(77, true);                      // an AI with no bubble: nothing
  m.avatares.delete(1); m.B.update(0);        // the avatar left (out of sight)
  assert.equal(m.world.children.length, 0); assert.equal(m.B.compartidos().libres, 1);
  m.ponerAvatar(1, 0, 3); m.B.update(0); assert.equal(m.world.children.length, 1);
  m.B.poner(1, null); assert.equal(m.world.children.length, 0); assert.deepEqual(m.B.lista(), []);
  m.B.poner(1, null);                          // twice: no harm
});

test("the translucent green: fill and edge use the house green, depth is not written, and the fill is front-faced only (no tint when the camera is inside)", () => {
  const m = mundo(); m.ponerAvatar(1, 0, 3);
  for (const f of FORMAS) { m.B.poner(1, cfg(f)); m.B.update(0); }
  const gr = grupos(m.world)[0], rel = gr.children[0] as THREE.Mesh, bor = gr.children[1] as THREE.LineSegments;
  const mr = rel.material as THREE.MeshBasicMaterial, mb = bor.material as THREE.LineBasicMaterial;
  assert.equal(mr.color.getHex(), P.BURBUJA_COLOR); assert.equal(mb.color.getHex(), P.BURBUJA_COLOR);
  assert.equal(mr.transparent, true); assert.equal(mr.depthWrite, false); assert.equal(mb.depthWrite, false);
  assert.equal(mr.side, THREE.FrontSide, "front faces only: from inside the far wall is a back face, so the view is not tinted green (the edge stays)");
  assert.ok(mr.opacity < 0.3 && mb.opacity > mr.opacity);
  for (const f of FORMAS) { // every shape's edge has segments (pairs) and a distance along them for the dashes
    const m2 = mundo(); m2.ponerAvatar(1, 0, 3); m2.B.poner(1, cfg(f)); m2.B.update(0);
    const g = (grupos(m2.world)[0].children[1] as THREE.LineSegments).geometry;
    assert.ok(g.getAttribute("position").count >= 24 && g.getAttribute("position").count % 2 === 0, f);
    assert.equal(g.getAttribute("lineDistance").count, g.getAttribute("position").count);
  }
});

// ---------- the page's accessor ----------

test("page accessor: reads the public state (odd values read as the house default), tells changes and the «entras» of the person", () => {
  const pagina = crearBurbujaPagina();
  const estado = new Map<string, Record<string, unknown>>();
  let cambio: (k: string, v: Record<string, unknown> | undefined) => void = () => {};
  const eventos = new Map<string, (m: Record<string, unknown>) => void>();
  assert.equal(pagina.de(3), null, "before the part is set up");
  assert.deepEqual(pagina.lista(), []);
  // a fake ClientApi: the real runtime path is checked in the browser leg
  pagina.part.setup({
    id: "burbuja", on: (e, f) => { eventos.set(e, f as never); }, send: () => ({ ok: true }), action: () => {}, self: () => 0, view: {} as never,
    state: { get: (k) => estado.get(k) as never, keys: () => [...estado.keys()], onChange: (f) => { cambio = f as never; } },
  });
  const vistos: [number, unknown][] = []; const entradas: [number, string][] = [];
  const off = pagina.alCambiar((q, b) => vistos.push([q, b])); pagina.alEntrar((ia, n) => entradas.push([ia, n]));
  estado.set("5", { forma: "cilindro", radio: 7, visible: "siempre" }); cambio("5", estado.get("5"));
  estado.set("6", { forma: "rara", radio: 99 }); cambio("6", estado.get("6"));
  cambio("clave-no-numerica", { forma: "caja" });
  assert.deepEqual(pagina.de(5), { forma: "cilindro", radio: 7, visible: "siempre" });
  assert.deepEqual(pagina.de(6), { forma: "esfera", radio: 4, visible: "al-acercarte" });
  assert.equal(pagina.de(9), null);
  assert.deepEqual(pagina.lista().map((l) => l.quien), [5, 6]);
  estado.delete("5"); cambio("5", undefined);
  assert.deepEqual(vistos.map(([q, b]) => [q, b === null ? null : (b as { forma: string }).forma]), [[5, "cilindro"], [6, "esfera"], [5, null]]);
  eventos.get("entras")!({ ia: 5, nombre: "Ada" }); eventos.get("entras")!({ ia: "x" }); eventos.get("entras")!({ ia: 6 });
  assert.deepEqual(entradas, [[5, "Ada"], [6, ""]]);
  off(); cambio("6", undefined); assert.equal(vistos.length, 3, "unsubscribed");
  pagina.alEntrar(() => { throw new Error("a page's listener must not stop the rest"); });
  eventos.get("entras")!({ ia: 7, nombre: "x" });
});

test("the page loads the part: burbuja is on the client's list (R-1, nothing to switch on)", () => {
  assert.ok(cliente.some((p) => p.feature.id === "burbuja"));
});
